/**
 * Firefox Add-ons (AMO), addons.mozilla.org API v5.
 * The add-on must already exist. `release` uploads the zip, waits for
 * validation, creates the version on the listed channel and optionally
 * attaches the source zip AMO requires for bundled builds. Review happens
 * server-side; the previous version stays live until the new one is approved.
 * Docs: https://mozilla.github.io/addons-server/topics/api/addons.html
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { amoJwt, required, sleep } from "./common.mjs";
import { zipPath } from "./config.mjs";

const API_ROOT = "https://addons.mozilla.org/api/v5";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export const COMMANDS = {
  upload: "upload and validate a zip without creating a version (--zip PATH, --channel listed|unlisted)",
  release: "upload, validate, create the version (--zip PATH, --notes \"text\", --source PATH)",
  status: "list the add-on's versions and their review status (read-only)",
  icon: "set the listing icon from stores.firefox.icon or PATH (AMO resizes to 32/64/128); --diff only reports",
  previews: "list | set: replace the listing screenshots with stores.firefox.previews or PATHs, in order",
};

export async function run(cfg, command, flags) {
  const addonId = cfg.stores.firefox.id;
  const channel = flags.channel ?? "listed";
  const zip = zipPath(cfg, "firefox", flags.zip);

  switch (command) {
    case "upload": {
      const upload = await uploadZip(zip, channel);
      console.log(`✓ upload validated (uuid ${upload.uuid})`);
      break;
    }
    case "release": {
      const upload = await uploadZip(zip, channel);
      await createVersion(cfg, addonId, upload.uuid, flags);
      break;
    }
    case "status": {
      const versions = await api(`/addons/addon/${addonId}/versions/?filter=all_with_unlisted`);
      for (const v of versions.results ?? []) {
        console.log(`  ${v.version}  channel=${v.channel}  status=${v.file?.status ?? "?"}`);
      }
      break;
    }
    case "icon":
      await setIcon(cfg, flags);
      break;
    case "previews":
      await previews(cfg, flags);
      break;
    default:
      throw new Error(`firefox: unknown command ${command}`);
  }
}

async function uploadZip(zip, channel) {
  if (!existsSync(zip)) throw new Error(`zip not found: ${zip}`);
  const form = new FormData();
  form.append("upload", new Blob([readFileSync(zip)], { type: "application/zip" }), basename(zip));
  form.append("channel", channel);
  const created = await api("/addons/upload/", { method: "POST", body: form });
  console.log(`→ upload accepted (uuid ${created.uuid}), waiting for validation…`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const upload = await api(`/addons/upload/${created.uuid}/`);
    if (upload.processed) {
      if (!upload.valid) {
        const msgs = (upload.validation?.messages ?? [])
          .filter((m) => m.type === "error")
          .map((m) => m.message)
          .join("; ");
        throw new Error(`validation failed: ${msgs || "see validation report"}`);
      }
      return upload;
    }
    if (Date.now() > deadline) throw new Error("validation timed out");
    process.stdout.write("  validating…\r");
    await sleep(POLL_INTERVAL_MS);
  }
}

async function createVersion(cfg, addonId, uploadUuid, flags) {
  const payload = { upload: uploadUuid };
  if (flags.notes) payload.release_notes = { "en-US": flags.notes };
  const version = await api(`/addons/addon/${addonId}/versions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log(`✓ version ${version.version} submitted for review (channel ${version.channel})`);
  if (flags.source) {
    const src = zipPath(cfg, "source", flags.source === true ? undefined : flags.source);
    if (!existsSync(src)) throw new Error(`source zip not found: ${src}`);
    const form = new FormData();
    form.append("source", new Blob([readFileSync(src)], { type: "application/zip" }), basename(src));
    await api(`/addons/addon/${addonId}/versions/${version.id}/`, { method: "PATCH", body: form });
    console.log(`✓ source code attached (${basename(src)})`);
  }
  return version;
}

/**
 * The listing icon is an add-on field, not the manifest icon: an add-on
 * without an uploaded icon shows AMO's default one. AMO resizes the upload
 * to 32, 64 and 128 px.
 */
async function setIcon(cfg, flags) {
  const slug = cfg.stores.firefox.slug;
  const file = flags._positional?.[0] ?? cfg.stores.firefox.icon;
  const before = await api(`/addons/addon/${slug}/`);
  console.log(`current icon: ${before.icon_url}${isDefaultIcon(before.icon_url) ? "  (AMO default, none uploaded)" : ""}`);
  if (flags.diff) return;
  if (!file) throw new Error("no icon given: set stores.firefox.icon in store.config.json or pass a PATH");
  const path = resolve(cfg.root, file);
  if (!existsSync(path)) throw new Error(`icon not found: ${path}`);
  const form = new FormData();
  form.append("icon", new Blob([readFileSync(path)], { type: "image/png" }), basename(path));
  const after = await api(`/addons/addon/${slug}/`, { method: "PATCH", body: form });
  if (isDefaultIcon(after.icon_url)) throw new Error("PATCH returned OK but AMO still serves the default icon");
  console.log(`✓ icon set from ${file}: ${after.icon_url}`);
}

export function isDefaultIcon(url) {
  return typeof url !== "string" || /\/addon-icons\/default-\d+\.png/.test(url);
}

/** Listing screenshots ("previews"). `set` deletes what is there and uploads the given files in order. */
async function previews(cfg, flags) {
  const slug = cfg.stores.firefox.slug;
  const [sub, ...paths] = flags._positional ?? [];
  const current = (await api(`/addons/addon/${slug}/`)).previews ?? [];
  if (!sub || sub === "list") {
    if (current.length === 0) console.log("no previews");
    for (const p of current) console.log(`  #${p.id} position=${p.position} ${p.image_size?.join("x") ?? "?"} ${p.image_url}`);
    return;
  }
  if (sub !== "set") throw new Error(`firefox previews: unknown subcommand ${sub} (list | set)`);
  const files = paths.length ? paths : (cfg.stores.firefox.previews ?? []);
  if (files.length === 0) throw new Error("no previews given: set stores.firefox.previews in store.config.json or pass PATHs");
  for (const file of files) {
    if (!existsSync(resolve(cfg.root, file))) throw new Error(`preview not found: ${file}`);
  }
  for (const p of current) {
    await api(`/addons/addon/${slug}/previews/${p.id}/`, { method: "DELETE" });
    console.log(`  removed #${p.id}`);
  }
  let position = 0;
  for (const file of files) {
    const path = resolve(cfg.root, file);
    const form = new FormData();
    form.append("image", new Blob([readFileSync(path)], { type: "image/png" }), basename(path));
    form.append("position", String(position++));
    const created = await api(`/addons/addon/${slug}/previews/`, { method: "POST", body: form });
    console.log(`  uploaded ${file} as #${created.id}`);
  }
  const after = (await api(`/addons/addon/${slug}/`)).previews ?? [];
  if (after.length !== files.length) throw new Error(`expected ${files.length} previews after upload, AMO reports ${after.length}`);
  console.log(`✓ ${files.length} preview(s) set`);
}

export async function api(path, init = {}) {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `JWT ${amoJwt(required("AMO_JWT_ISSUER"), required("AMO_JWT_SECRET"))}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (${res.status}): ${await res.text()}`);
  if (res.status === 204) return {};
  return res.json();
}
