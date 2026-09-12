import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findConfig, loadConfig, validate, zipPath } from "../src/config.mjs";
import { lintImages, lintListing, lintManifests, lintPackageScript, lintTextFiles, pngSize, sectionText, stringLiterals, textProblems } from "../src/listing.mjs";
import { renderTable } from "../src/readme.mjs";
import { daysUntil, parseArgs } from "../src/common.mjs";
import { checkVersions } from "../src/version.mjs";
import { api as amoApi, bust, isDefaultIcon, previewPlan, throttleSeconds } from "../src/firefox.mjs";
import { chromeDashboardUrl, chromeLiveFromHtml, edgeLiveFromJson, firefoxLiveFromJson, hasEnv, previewSummary, renderStatus } from "../src/status.mjs";

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
  assert.deepEqual(firefoxLiveFromJson({ current_version: { version: "3.1.0" }, last_updated: "2026-09-12T08:41:41Z", status: "public" }), { version: "3.1.0", updated: "2026-09-12", status: "public", previews: [] });
  const withPreviews = firefoxLiveFromJson({ current_version: { version: "3.2.1" }, previews: [{ id: 13, position: 1, image_size: [1280, 800] }, { id: 12, position: 0, image_size: [1280, 800] }, { id: 14 }] });
  assert.deepEqual(withPreviews.previews, [{ id: 12, position: 0, size: "1280x800" }, { id: 14, position: null, size: null }, { id: 13, position: 1, size: "1280x800" }]);
  assert.equal(previewSummary(withPreviews.previews), "previews #12 (0), #14, #13 (1)");
  assert.equal(previewSummary([]), "");
  assert.equal(hasEnv("edge", { EDGE_API_KEY: "k", EDGE_CLIENT_ID: "c" }), true);
  assert.equal(hasEnv("edge", { EDGE_API_KEY: "k" }), false);
});

test("renderStatus stamps the table with time, command and config", () => {
  const cfg = { ...validate(structuredClone(sample)), path: "/x/store.config.json" };
  const rows = [
    { store: "Chrome Web Store", url: "https://c", dashboard: "https://chrome.google.com/webstore/devconsole/pub/abc/edit/listing", live: "1.0.0", updated: "2026-09-01", review: "published 1.0.0 (PUBLISHED)", credentials: "accepted" },
    { store: "Firefox Add-ons (AMO)", url: "https://f", live: "1.0.0", updated: "2026-09-01", review: "listing public; previews #12 (0), #13 (1)", credentials: "not in env" },
  ];
  const md = renderStatus(cfg, rows, { now: new Date("2026-09-12T15:00:00Z") });
  assert.match(md, /^<!-- generated 2026-09-12T15:00:00.000Z by `store-publish status --markdown` from .*store\.config\.json \(demo\); regenerate, do not edit -->/);
  assert.match(md, /\| Store \| Live version \| Live since \| Review \/ submission \| API credentials \| Dashboard \|/);
  assert.match(md, /\| \[Chrome Web Store\]\(https:\/\/c\) \| 1\.0\.0 \| 2026-09-01 \| published 1\.0\.0 \(PUBLISHED\) \| accepted \| \[open\]\(https:\/\/chrome\.google\.com\/webstore\/devconsole\/pub\/abc\/edit\/listing\) \|/);
  assert.match(md, /\| \[Firefox Add-ons \(AMO\)\]\(https:\/\/f\) \| 1\.0\.0 \| 2026-09-01 \| listing public; previews #12 \(0\), #13 \(1\) \| not in env \|  \|/);
});

test("chromeDashboardUrl builds the item page from CWS_PUBLISHER_ID and falls back to the config", () => {
  const cfg = validate(structuredClone(sample));
  assert.equal(chromeDashboardUrl(cfg, { CWS_PUBLISHER_ID: "pub-1" }), "https://chrome.google.com/webstore/devconsole/pub-1/abc/edit/listing");
  assert.equal(chromeDashboardUrl(cfg, {}), "https://cd");
});

test("lintManifests requires the gecko add-on id to equal stores.firefox.id", () => {
  const root = mkdtempSync(join(tmpdir(), "store-publish-g-"));
  writeFileSync(join(root, "manifest.firefox.json"), JSON.stringify({ name: "Demo", description: "Saves verified video.", browser_specific_settings: { gecko: { id: "x@y" } } }));
  writeFileSync(join(root, "manifest.wrong.json"), JSON.stringify({ name: "Demo", description: "Saves verified video.", browser_specific_settings: { gecko: { id: "other@y" } } }));
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ name: "Demo", description: "Saves verified video." }));
  const cfg = { ...validate({ ...structuredClone(sample), manifests: ["manifest.firefox.json", "manifest.wrong.json", "manifest.json"] }), root };
  assert.deepEqual(lintManifests(cfg), [
    'manifest.wrong.json: browser_specific_settings.gecko.id is "other@y", stores.firefox.id is "x@y"',
  ]);
});

test("lint.packageScript must build <zipPrefix>-<kind>-<version>.zip names", () => {
  const root = mkdtempSync(join(tmpdir(), "store-publish-z-"));
  writeFileSync(join(root, "from-config.mjs"), 'const name = (kind) => `${config.zipPrefix}-${kind}-${version}.zip`;\n');
  writeFileSync(join(root, "literal.mjs"), 'const out = resolve(root, `demo-${t.name}-${version}.zip`);\n');
  writeFileSync(join(root, "wrong.mjs"), 'const out = resolve(root, `savemedia-${t.name}-${version}.zip`);\n');
  writeFileSync(join(root, "none.mjs"), 'spawnSync("zip", ["-r", out, "."]);\n');
  const lint = (packageScript) => lintPackageScript({ ...validate({ ...structuredClone(sample), lint: { packageScript } }), root });
  assert.deepEqual(lint("from-config.mjs"), []);
  assert.deepEqual(lint("literal.mjs"), []);
  assert.deepEqual(lint("wrong.mjs"), ['wrong.mjs: builds "savemedia-<kind>-<version>.zip", expected "demo-<kind>-<version>.zip" (zipPrefix in store.config.json)']);
  assert.deepEqual(lint("none.mjs"), ['none.mjs: neither reads zipPrefix from store.config.json nor spells out the prefix, expected "demo-<kind>-<version>.zip" (zipPrefix in store.config.json)']);
  assert.deepEqual(lint("missing.mjs"), ["missing.mjs: package script not found"]);
  assert.equal(validate(structuredClone(sample)).lint.packageScript, null);
  assert.deepEqual(lintPackageScript({ ...validate(structuredClone(sample)), root }), []);
  assert.throws(() => validate({ ...structuredClone(sample), lint: { packageScript: 7 } }), /lint\.packageScript/);
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

test("firefox module resolves asset paths against the config root (regression: resolve was not imported)", async () => {
  const mod = await import("../src/firefox.mjs");
  assert.equal(typeof mod.run, "function");
  const root = mkdtempSync(join(tmpdir(), "store-publish-ff-"));
  writeFileSync(join(root, "store.config.json"), JSON.stringify({ ...sample, stores: { ...sample.stores, firefox: { ...sample.stores.firefox, icon: "missing.png" } } }));
  mkdirSync(join(root, "packages/extension"), { recursive: true });
  writeFileSync(join(root, "packages/extension/manifest.json"), JSON.stringify({ version: "1.0.0" }));
  const cfg = loadConfig(join(root, "store.config.json"));
  process.env.AMO_JWT_ISSUER = "user:1:1"; process.env.AMO_JWT_SECRET = "s";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ icon_url: "https://addons.mozilla.org/static-server/img/addon-icons/default-64.png" }), { status: 200 });
  try {
    await assert.rejects(mod.run(cfg, "icon", { _positional: [] }), /icon not found: .*missing\.png/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.AMO_JWT_ISSUER; delete process.env.AMO_JWT_SECRET;
  }
});

test("AMO reads carry a cache buster", () => {
  assert.match(bust(), /^\?_=\d{13,}$/);
});

test("previewPlan keeps same-size positions, uploads missing or different ones, removes surplus last", () => {
  const cur = [{ id: 3, position: 1, image_size: [1280, 800] }, { id: 2, position: 0, image_size: [1280, 800] }, { id: 7, position: 2, image_size: [640, 400] }, { id: 9, position: 3, image_size: [1280, 800] }];
  assert.deepEqual(previewPlan([], ["1280x800", "1280x800"], false), { upload: [0, 1], stale: [], remove: [] });
  const plan = previewPlan(cur, ["1280x800", "1280x800", "1280x800"], false);
  assert.deepEqual(plan.upload, [2], "position 2 has the wrong size on AMO");
  assert.deepEqual(plan.stale.map((p) => p.id), [7]);
  assert.deepEqual(plan.remove.map((p) => p.id), [9], "surplus position 3");
  const partial = previewPlan(cur.slice(0, 2), ["1280x800", "1280x800", "1280x800", "1280x800", "1280x800"], false);
  assert.deepEqual(partial, { upload: [2, 3, 4], stale: [], remove: [] });
  const all = previewPlan(cur, ["1280x800", "1280x800", "1280x800"], true);
  assert.deepEqual(all.upload, [0, 1, 2]);
  assert.deepEqual(all.stale.map((p) => p.id), [2, 3, 7]);
  assert.deepEqual(all.remove.map((p) => p.id), [9]);
});

test("throttleSeconds parses AMO's 429 detail or Retry-After, and api waits then retries", async () => {
  assert.equal(throttleSeconds('{"detail":"Request was throttled. Expected available in 689 seconds."}'), 689);
  assert.equal(throttleSeconds("nope", "45"), 45);
  assert.equal(throttleSeconds("nope"), null);
  process.env.AMO_JWT_ISSUER = "user:1:1"; process.env.AMO_JWT_SECRET = "s";
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response('{"detail":"Request was throttled. Expected available in 0 seconds."}', { status: 429 });
    return new Response('{"id":1}', { status: 201 });
  };
  try {
    const started = Date.now();
    const out = await amoApi("/addons/addon/x/previews/", { method: "POST" });
    assert.deepEqual(out, { id: 1 });
    assert.equal(calls, 2);
    assert.ok(Date.now() - started >= 2000, "waited N+2 seconds");
    globalThis.fetch = async () => new Response('{"detail":"Request was throttled. Expected available in 999999 seconds."}', { status: 429 });
    await assert.rejects(amoApi("/addons/addon/x/", {}), /throttled \(429\), AMO asks for 999999 s: \{"detail":"Request was throttled\. Expected available in 999999 seconds\."\}/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.AMO_JWT_ISSUER; delete process.env.AMO_JWT_SECRET;
  }
});

test("lint.textFiles checks prose string literals in source files", () => {
  assert.deepEqual(stringLiterals('  sub: "DRM, DASH, encrypted, and live streams are detected and never bypassed.",'), ["DRM, DASH, encrypted, and live streams are detected and never bypassed."]);
  assert.deepEqual(stringLiterals('import x from "../../util/filename"; const u = "https://example.com/a b"; const id = "media-source";'), []);
  assert.deepEqual(stringLiterals("const t = `Save a verified direct video`;"), ["Save a verified direct video"]);
  const root = mkdtempSync(join(tmpdir(), "store-publish-t-"));
  writeFileSync(join(root, "harness.tsx"), 'export const SCENES = [\n  { title: "Protected media is refused", sub: "DRM, DASH, encrypted, and live streams are detected and never bypassed." },\n  { title: "Save a verified direct video", sub: "Only complete, browser-visible media is offered for download." },\n];\n');
  const cfg = { ...validate({ ...structuredClone(sample), lint: { textFiles: ["harness.tsx", "missing.tsx"] } }), root };
  assert.deepEqual(lintTextFiles(cfg), [
    'harness.tsx:2: forbidden word "bypassed"',
    "missing.tsx: text file not found",
  ]);
  assert.throws(() => validate({ ...structuredClone(sample), lint: { textFiles: "harness.tsx" } }), /lint\.textFiles/);
});
