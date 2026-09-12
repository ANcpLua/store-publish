/**
 * The store listing text lives in the repo (config `listing`, a markdown file)
 * so the published copy has a reviewed source. `amo-listing` reads the
 * "## AMO description" section and writes it to addons.mozilla.org; `lint`
 * checks every description section for wording that store reviewers and
 * trademark enforcement have rejected before.
 */
import { readFileSync } from "node:fs";
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
  const problems = lintListing(readListing(cfg), cfg.lint.forbidden);
  if (problems.length === 0) {
    console.log(`✓ ${cfg.listing}: no forbidden words, no comma chains`);
    return;
  }
  for (const p of problems) console.log(`✗ ${cfg.listing}:${p.line}: ${p.message}`);
  throw new Error(`${problems.length} listing problem(s)`);
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
export function lintListing(md, extraForbidden = []) {
  const forbidden = [...DEFAULT_FORBIDDEN, ...extraForbidden];
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
    for (const word of forbidden) {
      const re = new RegExp(`\\b${escapeRegExp(word)}\\w*`, "i");
      const m = re.exec(line);
      if (m) problems.push({ line: i + 1, message: `forbidden word "${m[0]}"` });
    }
    const chain = commaChain(line);
    if (chain) problems.push({ line: i + 1, message: `comma chain of ${chain.length} short items reads as keyword spam: "${chain.join(", ")}"` });
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
