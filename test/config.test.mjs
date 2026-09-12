import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findConfig, loadConfig, validate, zipPath } from "../src/config.mjs";
import { lintListing, sectionText } from "../src/listing.mjs";
import { renderTable } from "../src/readme.mjs";
import { daysUntil, parseArgs } from "../src/common.mjs";

const sample = {
  name: "demo",
  zipPrefix: "demo",
  zipDir: "packages/extension",
  versionFrom: "packages/extension/manifest.json",
  listing: "store/listing.md",
  stores: {
    chrome: { id: "abc", url: "https://c", dashboard: "https://cd", apiDocs: "https://ca", env: ["CWS_PUBLISHER_ID", "CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN"] },
    edge: { id: "guid", url: "https://e", dashboard: "https://ed", apiDocs: "https://ea", env: ["EDGE_API_KEY", "EDGE_CLIENT_ID"], expires: "2026-11-21" },
    firefox: { id: "x@y", slug: "x", url: "https://f", dashboard: "https://fd", apiDocs: "https://fa", env: ["AMO_JWT_ISSUER", "AMO_JWT_SECRET"] },
  },
};

test("validate accepts the documented shape and fills defaults", () => {
  const cfg = validate(structuredClone(sample));
  assert.equal(cfg.readme, "README.md");
  assert.equal(cfg.stores.edge.expires, "2026-11-21");
  assert.deepEqual(cfg.lint.forbidden, []);
});

test("validate rejects env lists that do not match the CLI", () => {
  const bad = structuredClone(sample);
  bad.stores.chrome.env.push("CWS_ITEM_ID");
  assert.throws(() => validate(bad), /stores\.chrome\.env must be exactly/);
});

test("validate requires every store and the firefox slug", () => {
  const noEdge = structuredClone(sample);
  delete noEdge.stores.edge;
  assert.throws(() => validate(noEdge), /stores\.edge is missing/);
  const noSlug = structuredClone(sample);
  delete noSlug.stores.firefox.slug;
  assert.throws(() => validate(noSlug), /stores\.firefox\.slug/);
});

test("loadConfig reads the version and builds zip paths; findConfig walks upwards", () => {
  const root = mkdtempSync(join(tmpdir(), "store-publish-"));
  mkdirSync(join(root, "packages/extension/deep"), { recursive: true });
  writeFileSync(join(root, "store.config.json"), JSON.stringify(sample));
  writeFileSync(join(root, "packages/extension/manifest.json"), JSON.stringify({ version: "1.2.3" }));
  const path = findConfig(undefined, join(root, "packages/extension/deep"));
  const cfg = loadConfig(path);
  assert.equal(cfg.version, "1.2.3");
  assert.equal(zipPath(cfg, "chrome"), join(root, "packages/extension/demo-chrome-1.2.3.zip"));
  assert.equal(zipPath(cfg, "source"), join(root, "packages/extension/demo-source-1.2.3.zip"));
  assert.equal(zipPath(cfg, "edge", "out/custom.zip"), join(root, "out/custom.zip"));
});

const listing = `# Store listing

Editorial text may say bypass here, it is not published.

## AMO description

Note for editors: the wording below was reviewed.
Applied with store-publish amo-listing apply.

Saves verified direct video files and plain HLS streams.

Refused: DRM, encrypted HLS, and live streams.

## AMO summary

Save verified direct video files.
`;

test("sectionText returns the prose after the editorial note", () => {
  assert.equal(sectionText(listing, "AMO description"), "Saves verified direct video files and plain HLS streams.\n\nRefused: DRM, encrypted HLS, and live streams.");
  assert.equal(sectionText(listing, "AMO summary"), "Save verified direct video files.");
  assert.throws(() => sectionText(listing, "Nope"), /no '## Nope' section/);
});

test("lintListing passes clean text and ignores editorial sections", () => {
  assert.deepEqual(lintListing(listing), []);
});

test("lintListing flags forbidden words even in a negation, and comma chains", () => {
  const bad = listing
    .replace("Refused: DRM, encrypted HLS, and live streams.", "It does not bypass DRM. Exports TXT, SRT, VTT, JSON, CSV, and Markdown.")
    .replace("Save verified direct video files.", "Unlocks nothing.");
  const problems = lintListing(bad);
  assert.deepEqual(problems.map((p) => p.message), [
    'forbidden word "bypass"',
    'comma chain of 6 short items reads as keyword spam: "Exports TXT, SRT, VTT, JSON, CSV, Markdown"',
    'forbidden word "Unlocks"',
  ]);
});

test("lintListing honours extra forbidden words from the config", () => {
  const problems = lintListing(listing.replace("plain HLS", "plain Acme HLS"), ["acme"]);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /"Acme"/);
});

test("renderTable lists every store with its env names and the expiry countdown", () => {
  const cfg = validate(structuredClone(sample));
  const table = renderTable(cfg, new Date("2026-09-12T10:00:00Z"));
  assert.match(table, /\| Chrome Web Store \| \[abc\]\(https:\/\/c\) \| \[dashboard\]\(https:\/\/cd\) \| \[docs\]\(https:\/\/ca\) \| `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` \|  \|/);
  assert.match(table, /API key expires 2026-11-21 \(70 days from 2026-09-12\)/);
  assert.match(table, /Firefox Add-ons \(AMO\) \| \[x@y\]/);
});

test("daysUntil and parseArgs", () => {
  assert.equal(daysUntil("2026-11-21", new Date("2026-11-21T23:00:00Z")), 0);
  assert.equal(daysUntil("2026-11-20", new Date("2026-11-21T01:00:00Z")), -1);
  assert.deepEqual(parseArgs(["edge", "release", "--zip", "a.zip", "--source", "--notes", "hi"]), {
    positional: ["edge", "release"],
    flags: { zip: "a.zip", source: true, notes: "hi" },
  });
});
