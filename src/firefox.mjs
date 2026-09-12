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
  previews: "list | set: bring the listing screenshots to stores.firefox.previews (or PATHs), uploading only missing positions; --replace deletes and re-uploads everything",
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
  const before = await api(`/addons/addon/${slug}/${bust()}`);
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

/** AMO answers with cache-control max-age=360; a read-back without a cache buster can be six minutes stale. */
export function bust() {
  return `?_=${Date.now()}`;
}

export function isDefaultIcon(url) {
  return typeof url !== "string" || /\/addon-icons\/default-\d+\.png/.test(url);
}

/**
 * Listing screenshots ("previews"). AMO throttles preview writes hard (429
 * "Expected available in N seconds", from 20 s up to 25 min, apparently a
 * daily budget plus a burst limit), so `set` is idempotent and never deletes
 * before it has uploaded: a position is kept when AMO already holds an image
 * of the same pixel size there, uploaded when it is missing or the size
 * differs, and surplus positions are removed only after every upload
 * succeeded. A run that was cut off can simply be repeated. `--replace`
 * re-uploads every position (for a changed image of the same size).
 */
async function previews(cfg, flags) {
  const slug = cfg.stores.firefox.slug;
  const [sub, ...paths] = flags._positional ?? [];
  const current = sortedPreviews((await api(`/addons/addon/${slug}/${bust()}`)).previews ?? []);
  if (!sub || sub === "list") {
    if (current.length === 0) console.log("no previews");
    for (const p of current) console.log(`  #${p.id} position=${p.position} ${p.image_size?.join("x") ?? "?"} ${p.image_url}`);
    return;
  }
  if (sub !== "set") throw new Error(`firefox previews: unknown subcommand ${sub} (list | set)`);
  const files = paths.length ? paths : (cfg.stores.firefox.previews ?? []);
  if (files.length === 0) throw new Error("no previews given: set stores.firefox.previews in store.config.json or pass PATHs");
  const wanted = files.map((file) => {
    const path = resolve(cfg.root, file);
    if (!existsSync(path)) throw new Error(`preview not found: ${file}`);
    const bytes = readFileSync(path);
    return { file, path, bytes, size: pngSize(bytes) };
  });
  const plan = previewPlan(current, wanted.map((w) => w.size), Boolean(flags.replace));
  for (const position of plan.upload) {
    const w = wanted[position];
    const stale = plan.stale.find((p) => p.position === position);
    if (stale) {
      await api(`/addons/addon/${slug}/previews/${stale.id}/`, { method: "DELETE" });
      console.log(`  removed #${stale.id} at position ${position} (${stale.image_size?.join("x") ?? "?"} on AMO, ${w.size ?? "?"} in the repo)`);
    }
    const form = new FormData();
    form.append("image", new Blob([w.bytes], { type: "image/png" }), basename(w.path));
    form.append("position", String(position));
    const created = await api(`/addons/addon/${slug}/previews/`, { method: "POST", body: form });
    console.log(`  uploaded ${w.file} as #${created.id} (position ${position})`);
  }
  for (const p of plan.remove) {
    await api(`/addons/addon/${slug}/previews/${p.id}/`, { method: "DELETE" });
    console.log(`  removed surplus #${p.id} (position ${p.position})`);
  }
  if (plan.upload.length === 0 && plan.remove.length === 0) console.log(`  nothing to do, ${files.length} preview(s) already in place`);
  const after = (await api(`/addons/addon/${slug}/${bust()}`)).previews ?? [];
  if (after.length !== files.length) throw new Error(`expected ${files.length} previews after upload, AMO reports ${after.length}`);
  console.log(`✓ ${files.length} preview(s) set`);
}

function sortedPreviews(list) {
  return [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** Width and height from the PNG IHDR chunk, "WxH", or null when not a PNG. */
export function pngSize(bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("latin1") !== "\x89PNG\r\n\x1a\n") return null;
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

/**
 * Compare what AMO holds (sorted by position) with the wanted sizes per
 * position. Returns positions to upload, the stale previews those uploads
 * replace, and surplus previews to remove afterwards.
 */
export function previewPlan(current, wantedSizes, replace) {
  const sorted = sortedPreviews(current);
  const upload = [];
  const stale = [];
  for (let position = 0; position < wantedSizes.length; position++) {
    const have = sorted[position];
    if (!have) {
      upload.push(position);
      continue;
    }
    const haveSize = Array.isArray(have.image_size) ? have.image_size.join("x") : null;
    if (replace || haveSize !== wantedSizes[position]) {
      upload.push(position);
      stale.push(have);
    }
  }
  return { upload, stale, remove: sorted.slice(wantedSizes.length) };
}

/** Seconds AMO asks us to wait: the 429 detail ("Expected available in N seconds") or the Retry-After header. */
export function throttleSeconds(text, retryAfter = null) {
  const m = /Expected available in (\d+) seconds/.exec(text ?? "");
  if (m) return Number(m[1]);
  if (retryAfter !== null && /^\d+$/.test(String(retryAfter))) return Number(retryAfter);
  return null;
}

const MAX_THROTTLE_WAIT_S = 30 * 60;
const MAX_THROTTLE_RETRIES = 6;

export async function api(path, init = {}, attempt = 0) {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `JWT ${amoJwt(required("AMO_JWT_ISSUER"), required("AMO_JWT_SECRET"))}`, ...(init.headers ?? {}) },
  });
  if (res.status === 429) {
    const text = await res.text();
    const wait = throttleSeconds(text, res.headers.get("retry-after"));
    if (wait === null || wait > MAX_THROTTLE_WAIT_S || attempt >= MAX_THROTTLE_RETRIES) {
      throw new Error(`${init.method ?? "GET"} ${path} throttled (429)${wait ? `, AMO asks for ${wait} s` : ""}: ${text}`);
    }
    console.log(`  AMO throttled ${init.method ?? "GET"} ${path}; waiting ${wait + 2} s (attempt ${attempt + 1}/${MAX_THROTTLE_RETRIES})`);
    await sleep((wait + 2) * 1000);
    return api(path, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (${res.status}): ${await res.text()}`);
  if (res.status === 204) return {};
  return res.json();
}
