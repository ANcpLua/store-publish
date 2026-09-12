import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findConfig, loadConfig, validate, zipPath } from "../src/config.mjs";
import { lintImages, lintListing, lintManifests, pngSize, sectionText, textProblems } from "../src/listing.mjs";
import { renderTable } from "../src/readme.mjs";
import { daysUntil, parseArgs } from "../src/common.mjs";
import { checkVersions } from "../src/version.mjs";
import { isDefaultIcon } from "../src/firefox.mjs";
import { chromeLiveFromHtml, edgeLiveFromJson, firefoxLiveFromJson, hasEnv, renderStatus } from "../src/status.mjs";

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

test("checkVersions passes when every file agrees and fails naming the odd one out", () => {
  const root = mkdtempSync(join(tmpdir(), "store-publish-v-"));
  mkdirSync(join(root, "packages/extension"), { recursive: true });
  const cfgRaw = { ...structuredClone(sample), versionFiles: ["packages/extension/manifest.json", "package.json", "package-lock.json"] };
  writeFileSync(join(root, "store.config.json"), JSON.stringify(cfgRaw));
  writeFileSync(join(root, "packages/extension/manifest.json"), JSON.stringify({ version: "2.0.0" }));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "2.0.0" }));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "2.0.0", packages: { "": { version: "2.0.0" } } }));
  const cfg = loadConfig(join(root, "store.config.json"));
  assert.equal(checkVersions(cfg), "2.0.0");
  assert.equal(checkVersions(cfg, "v2.0.0"), "2.0.0");
  assert.throws(() => checkVersions(cfg, "v2.0.1"), /tag v2.0.1 does not match version 2.0.0/);
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "2.0.0", packages: { "": { version: "1.9.0" } } }));
  assert.throws(() => checkVersions(cfg), /version fields disagree:[\s\S]*1.9.0\s+package-lock.json \(packages.""\)/);
});

test("versionFiles defaults to versionFrom and always includes it", () => {
  assert.deepEqual(validate(structuredClone(sample)).versionFiles, ["packages/extension/manifest.json"]);
  const cfg = validate({ ...structuredClone(sample), versionFiles: ["package.json"] });
  assert.deepEqual(cfg.versionFiles, ["packages/extension/manifest.json", "package.json"]);
});

test("status parsers read the public listings", () => {
  const html = '<li><div class="a">Version</div><div class="b">0.0.7</div></li><li><div class="a">Updated</div><div>August 2, 2026</div></li>';
  assert.deepEqual(chromeLiveFromHtml(html), { version: "0.0.7", updated: "August 2, 2026" });
  assert.deepEqual(chromeLiveFromHtml("<html></html>"), { version: null, updated: null });
  assert.deepEqual(edgeLiveFromJson({ version: "0.0.7", lastUpdateDate: 1788983347.44 }), { version: "0.0.7", updated: "2026-09-09" });
  assert.deepEqual(firefoxLiveFromJson({ current_version: { version: "3.1.0" }, last_updated: "2026-09-12T08:41:41Z", status: "public" }), { version: "3.1.0", updated: "2026-09-12", status: "public" });
  assert.equal(hasEnv("edge", { EDGE_API_KEY: "k", EDGE_CLIENT_ID: "c" }), true);
  assert.equal(hasEnv("edge", { EDGE_API_KEY: "k" }), false);
});

test("renderStatus stamps the table with time, command and config", () => {
  const cfg = { ...validate(structuredClone(sample)), path: "/x/store.config.json" };
  const rows = [{ store: "Chrome Web Store", url: "https://c", live: "1.0.0", updated: "2026-09-01", review: "published 1.0.0 (PUBLISHED)", credentials: "accepted" }];
  const md = renderStatus(cfg, rows, { now: new Date("2026-09-12T15:00:00Z") });
  assert.match(md, /^<!-- generated 2026-09-12T15:00:00.000Z by `store-publish status --markdown` from .*store\.config\.json \(demo\); regenerate, do not edit -->/);
  assert.match(md, /\| \[Chrome Web Store\]\(https:\/\/c\) \| 1\.0\.0 \| 2026-09-01 \| published 1\.0\.0 \(PUBLISHED\) \| accepted \|/);
});

test("textProblems rejects dashes and emoji but not ordinary punctuation", () => {
  assert.deepEqual(textProblems("Saves video; refuses DRM: nothing else. (c) 2026 \u00a9"), []);
  assert.deepEqual(textProblems("Fast \u2014 local"), ["em dash (U+2014); use a comma, a colon or a new sentence"]);
  assert.deepEqual(textProblems("2024\u20132026"), ['en dash (U+2013); use a hyphen or the word "to"']);
  assert.deepEqual(textProblems("Save video \u{1F3AC} fast"), ['emoji "\u{1F3AC}"']);
  assert.equal(textProblems("Save it \u2705").length, 1);
});

test("lintManifests checks name and description of every listed manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "store-publish-m-"));
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ name: "Demo", description: "Transcripts \u2014 free. Exports TXT, SRT, VTT, JSON, CSV, and Markdown." }));
  writeFileSync(join(root, "clean.json"), JSON.stringify({ name: "Demo", description: "Saves verified video." }));
  const cfg = { ...validate({ ...structuredClone(sample), manifests: ["manifest.json", "clean.json", "missing.json"] }), root };
  const problems = lintManifests(cfg);
  assert.deepEqual(problems, [
    "manifest.json: description: em dash (U+2014); use a comma, a colon or a new sentence",
    'manifest.json: description: comma chain of 6 short items reads as keyword spam: "Exports TXT, SRT, VTT, JSON, CSV, Markdown"',
    "missing.json: manifest not found",
  ]);
});

test("lintImages finds missing files, wrong sizes and byte-identical pairs", () => {
  const root = mkdtempSync(join(tmpdir(), "store-publish-i-"));
  const png = (w, h) => {
    const b = Buffer.alloc(33);
    Buffer.from("\x89PNG\r\n\x1a\n", "latin1").copy(b, 0);
    b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return b;
  };
  writeFileSync(join(root, "a.png"), png(1280, 800));
  writeFileSync(join(root, "b.png"), png(1280, 800));
  writeFileSync(join(root, "c.png"), png(640, 400));
  writeFileSync(join(root, "d.txt"), "not a png");
  assert.equal(pngSize(png(1280, 800)), "1280x800");
  assert.equal(pngSize(Buffer.from("nope")), null);
  const cfg = { ...validate({ ...structuredClone(sample), images: [{ path: "a.png", size: "1280x800" }, { path: "b.png", size: "1280x800" }, { path: "c.png", size: "1280x800" }, "d.txt", "e.png", { path: "d.txt", size: "1x1" }] }), root };
  assert.deepEqual(lintImages(cfg), [
    "b.png: byte-identical to a.png",
    "c.png: is 640x400, expected 1280x800",
    "e.png: image not found",
    "d.txt: byte-identical to d.txt",
    "d.txt: not a PNG, cannot check the size",
  ]);
  assert.throws(() => validate({ ...structuredClone(sample), images: [{ path: "x", size: "big" }] }), /images\[0\]\.size/);
});

test("brand names are rejected by default, configurable, and off with an empty list", () => {
  const cfg = validate(structuredClone(sample));
  assert.deepEqual(cfg.lint.brands, ["Chrome", "Firefox", "Edge", "YouTube", "Vimeo", "Google", "Microsoft", "Mozilla"]);
  assert.deepEqual(textProblems("Uses Chrome's built-in on-device AI", [], cfg.lint.brands), ['brand name "Chrome"; say what it is (a browser, a video site), not whose it is']);
  assert.deepEqual(textProblems("Opens in the browser sidebar", [], cfg.lint.brands), []);
  assert.deepEqual(textProblems("Edgewise cut", [], cfg.lint.brands), [], "word boundary");
  const off = validate({ ...structuredClone(sample), lint: { brands: [] } });
  assert.deepEqual(off.lint.brands, []);
  const md = "## AMO description\n\nWorks in Firefox's sidebar.\n";
  assert.equal(lintListing(md, [], cfg.lint.brands).length, 1);
  assert.equal(lintListing(md, [], []).length, 0);
});

test("firefox icon and previews config fields", () => {
  const cfg = validate({ ...structuredClone(sample), stores: { ...sample.stores, firefox: { ...sample.stores.firefox, icon: "store/icon.png", previews: ["a.png", "b.png"] } } });
  assert.equal(cfg.stores.firefox.icon, "store/icon.png");
  assert.deepEqual(cfg.stores.firefox.previews, ["a.png", "b.png"]);
  assert.throws(() => validate({ ...structuredClone(sample), stores: { ...sample.stores, firefox: { ...sample.stores.firefox, previews: "a.png" } } }), /previews must be an array/);
  assert.equal(isDefaultIcon("https://addons.mozilla.org/static-server/img/addon-icons/default-64.png"), true);
  assert.equal(isDefaultIcon("https://addons.mozilla.org/user-media/addon_icons/1/123-64.png?modified=1"), false);
  assert.equal(isDefaultIcon(null), true);
});
