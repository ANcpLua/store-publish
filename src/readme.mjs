/**
 * Render the store table from store.config.json and keep the README's copy in
 * sync, so the README never states an id or a URL the scripts do not use.
 * The table sits between two marker comments in the README.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { daysUntil } from "./common.mjs";

export const START = "<!-- store-config:start -->";
export const END = "<!-- store-config:end -->";

const LABEL = { chrome: "Chrome Web Store", edge: "Microsoft Edge Add-ons", firefox: "Firefox Add-ons (AMO)" };

export function renderTable(cfg, now = new Date()) {
  const rows = [
    "| Store | Listing | Dashboard | API docs | Credentials (GitHub Actions secrets) | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const [store, s] of Object.entries(cfg.stores)) {
    const notes = [];
    if (s.expires) notes.push(`API key expires ${s.expires} (${daysUntil(s.expires, now)} days from ${now.toISOString().slice(0, 10)})`);
    if (s.notes) notes.push(s.notes);
    rows.push(`| ${LABEL[store]} | [${s.id}](${s.url}) | [dashboard](${s.dashboard}) | [docs](${s.apiDocs}) | ${s.env.map((e) => `\`${e}\``).join(", ")} | ${notes.join(". ")} |`);
  }
  return rows.join("\n");
}

export function runReadme(cfg, flags) {
  const path = resolve(cfg.root, cfg.readme);
  const current = readFileSync(path, "utf8");
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`${cfg.readme} needs the markers ${START} and ${END} around the store table`);
  }
  const next = `${current.slice(0, start + START.length)}\n${renderTable(cfg)}\n${current.slice(end)}`;
  if (flags.check) {
    if (next !== current) throw new Error(`${cfg.readme} store table is out of date; run: store-publish readme --write`);
    console.log(`✓ ${cfg.readme} store table matches ${cfg.path}`);
    return;
  }
  if (flags.write) {
    if (next === current) {
      console.log(`✓ ${cfg.readme} already up to date`);
    } else {
      writeFileSync(path, next);
      console.log(`✓ ${cfg.readme} store table updated`);
    }
    return;
  }
  console.log(renderTable(cfg));
}
