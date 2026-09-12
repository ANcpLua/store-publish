/**
 * The store listing text lives in the repo (config `listing`, a markdown file)
 * so the published copy has a reviewed source. `amo-listing` reads the
 * "## AMO description" section and writes it to addons.mozilla.org; `lint`
 * checks every description section for wording that store reviewers and
 * trademark enforcement have rejected before.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { api } from "./firefox.mjs";

export const AMO_COMMANDS = {
  show: "print the description AMO serves now",
  diff: "compare the repo listing with the live description (read-only)",
  apply: "write the repo listing to AMO and verify it landed",
};

/** Words the boundary rules forbid in public text, even inside a negation. */
export const DEFAULT_FORBIDDEN = ["bypass", "unlock", "circumvent"];
/** A run of this many short comma-separated items reads as keyword bait to the Chrome Web Store. */
const CHAIN_MIN_ITEMS = 5;
const CHAIN_MAX_WORDS = 3;

export async function runAmoListing(cfg, command) {
  const slug = cfg.stores.firefox.slug;
  if (command === "show") {
    console.log(await liveDescription(slug));
    return;
  }
  const local = sectionText(readListing(cfg), "AMO description");
  if (command === "diff") {
    const live = await liveDescription(slug);
    const same = normalize(live) === normalize(local);
    console.log(same ? `✓ AMO already matches ${cfg.listing}` : "✗ differs");
    if (!same) console.log(`\n--- live ---\n${live}\n\n--- local ---\n${local}`);
    return;
  }
  if (command === "apply") {
    // The add-on stores its text under whatever locale it was first created
    // with. Writing to a hardcoded locale would add a second translation and
    // leave the one users see untouched, so the locale comes from the add-on.
    const locale = await addonLocale(slug);
    console.log(`writing description for locale ${locale}`);
    await api(`/addons/addon/${slug}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: { [locale]: local } }),
    });
    const live = await liveDescription(slug);
    if (normalize(live) !== normalize(local)) throw new Error("PATCH returned OK but the live description did not change");
    console.log("✓ AMO description updated and verified");
    return;
  }
  throw new Error(`amo-listing: unknown command ${command}`);
}

export function runLint(cfg) {
  const problems = [];
  for (const p of lintListing(readListing(cfg), cfg.lint.forbidden, cfg.lint.brands)) problems.push(`${cfg.listing}:${p.line}: ${p.message}`);
  for (const p of lintManifests(cfg)) problems.push(p);
  for (const p of lintImages(cfg)) problems.push(p);
  const scope = [cfg.listing, ...cfg.manifests, cfg.images.length ? `${cfg.images.length} image(s)` : null].filter(Boolean).join(", ");
  if (problems.length === 0) {
    console.log(`✓ ${scope}: no forbidden words, brand names, dashes, emoji or comma chains; images present and distinct`);
    return;
  }
  for (const p of problems) console.log(`✗ ${p}`);
  throw new Error(`${problems.length} listing problem(s)`);
}

/** The rules every piece of public text must pass, applied to one line or field. */
export function textProblems(text, extraForbidden = [], brands = []) {
  const forbidden = [...DEFAULT_FORBIDDEN, ...extraForbidden];
  const problems = [];
  for (const word of forbidden) {
    const m = new RegExp(`\\b${escapeRegExp(word)}\\w*`, "i").exec(text);
    if (m) problems.push(`forbidden word "${m[0]}"`);
  }
  for (const brand of brands) {
    const m = new RegExp(`\\b${escapeRegExp(brand)}\\b`, "i").exec(text);
    if (m) problems.push(`brand name "${m[0]}"; say what it is (a browser, a video site), not whose it is`);
  }
  if (text.includes("\u2014")) problems.push("em dash (U+2014); use a comma, a colon or a new sentence");
  if (text.includes("\u2013")) problems.push("en dash (U+2013); use a hyphen or the word \"to\"");
  const emoji = /(?![\u00A9\u00AE])\p{Extended_Pictographic}/u.exec(text);
  if (emoji) problems.push(`emoji "${emoji[0]}"`);
  const chain = commaChain(text);
  if (chain) problems.push(`comma chain of ${chain.length} short items reads as keyword spam: "${chain.join(", ")}"`);
  return problems;
}

/** `manifests` in the config: name and description are store text too (the description is the store summary line). */
export function lintManifests(cfg) {
  const problems = [];
  for (const file of cfg.manifests) {
    const path = resolve(cfg.root, file);
    if (!existsSync(path)) {
      problems.push(`${file}: manifest not found`);
      continue;
    }
    let json;
    try {
      json = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      problems.push(`${file}: not valid JSON (${err.message})`);
      continue;
    }
    for (const field of ["name", "description"]) {
      if (typeof json[field] !== "string") continue;
      for (const p of textProblems(json[field], cfg.lint.forbidden, cfg.lint.brands)) problems.push(`${file}: ${field}: ${p}`);
    }
  }
  return problems;
}

/** `images` in the config: every file present, the declared size honoured, no two files byte-identical. */
export function lintImages(cfg) {
  const problems = [];
  const seen = new Map();
  for (const { path: file, size } of cfg.images) {
    const path = resolve(cfg.root, file);
    if (!existsSync(path)) {
      problems.push(`${file}: image not found`);
      continue;
    }
    const bytes = readFileSync(path);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (seen.has(hash)) problems.push(`${file}: byte-identical to ${seen.get(hash)}`);
    else seen.set(hash, file);
    if (size) {
      const actual = pngSize(bytes);
      if (!actual) problems.push(`${file}: not a PNG, cannot check the size`);
      else if (actual !== size) problems.push(`${file}: is ${actual}, expected ${size}`);
    }
  }
  return problems;
}

/** Width and height from the PNG IHDR chunk, "WxH", or null when the file is not a PNG. */
export function pngSize(bytes) {
  const signature = "\x89PNG\r\n\x1a\n";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("latin1") !== signature) return null;
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

export function readListing(cfg) {
  return readFileSync(resolve(cfg.root, cfg.listing), "utf8");
}

/** Text of "## <heading>" up to the next "## ", minus an optional editorial note ending in a line that starts with "Applied with". */
export function sectionText(md, heading) {
  const after = md.split(new RegExp(`^## ${escapeRegExp(heading)}$`, "m"))[1];
  if (after === undefined) throw new Error(`listing has no '## ${heading}' section`);
  const section = after.split(/^## /m)[0];
  const lines = section.split("\n");
  const noteEnd = lines.findIndex((l) => l.startsWith("Applied with"));
  const body = lines.slice(noteEnd + 1).join("\n").trim();
  if (!body) throw new Error(`'## ${heading}' section is empty`);
  return body;
}

/** Every "## ... description" or "## ... summary" section is public text; the rest of the file is editorial. */
export function lintListing(md, extraForbidden = [], brands = []) {
  const problems = [];
  const lines = md.split("\n");
  let publicSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      publicSection = /\b(description|summary)\b/i.test(line);
      continue;
    }
    if (!publicSection || line.trim() === "" || line.startsWith("Applied with")) continue;
    for (const message of textProblems(line, extraForbidden, brands)) problems.push({ line: i + 1, message });
  }
  return problems;
}

function commaChain(line) {
  for (const clause of line.split(/[.;:]/)) {
    const items = clause.split(",").map((s) => s.replace(/^\s*(and|or)\s+/i, "").trim()).filter(Boolean);
    if (items.length >= CHAIN_MIN_ITEMS && items.every((it) => it.split(/\s+/).length <= CHAIN_MAX_WORDS)) return items;
  }
  return null;
}

async function addonLocale(slug) {
  const json = await api(`/addons/addon/${slug}/`);
  return json.default_locale ?? "en-US";
}

async function liveDescription(slug) {
  const locale = await addonLocale(slug);
  const json = await api(`/addons/addon/${slug}/`);
  const field = json.description;
  const raw = typeof field === "string" ? field : field?.[locale];
  if (typeof raw !== "string") {
    throw new Error(`no description for locale ${locale}; found ${JSON.stringify(Object.keys(field ?? {}))}`);
  }
  return raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
