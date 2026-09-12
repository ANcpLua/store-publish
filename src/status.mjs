/**
 * One table for every configured store: the version the public listing
 * serves right now, and the review state where an API exposes it. Public
 * endpoints need no credentials; the review columns use the env vars when
 * they are present and say so when they are not. Written for documents
 * that are generated, never typed: a hand-maintained "0.0.7 on all three"
 * line goes stale silently, this table carries its timestamp and command.
 */
import { relative } from "node:path";
import { itemStatus } from "./chrome.mjs";
import { credentialStatus } from "./edge.mjs";
import { api as amoApi } from "./firefox.mjs";
import { ENV } from "./config.mjs";

const AMO_PUBLIC = "https://addons.mozilla.org/api/v5/addons/addon";
const EDGE_PUBLIC = "https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid";
const USER_AGENT = "Mozilla/5.0 (store-publish status; +https://github.com/ANcpLua/store-publish)";

export function hasEnv(store, env = process.env) {
  return ENV[store].every((name) => Boolean(env[name]));
}

/** Version and "updated" text from the public Chrome Web Store page. */
export function chromeLiveFromHtml(html) {
  const version = /Version<\/div><div[^>]*>([0-9][0-9A-Za-z.\-]*)<\/div>/.exec(html)?.[1] ?? null;
  const updated = /Updated<\/div><div[^>]*>([^<]+)<\/div>/.exec(html)?.[1]?.trim() ?? null;
  return { version, updated };
}

export function edgeLiveFromJson(json) {
  const stamp = typeof json.lastUpdateDate === "number" ? new Date(json.lastUpdateDate * 1000).toISOString().slice(0, 10) : null;
  return { version: json.version ?? null, updated: stamp };
}

export function firefoxLiveFromJson(json) {
  return {
    version: json.current_version?.version ?? null,
    updated: typeof json.last_updated === "string" ? json.last_updated.slice(0, 10) : null,
    status: json.status ?? null,
  };
}

async function chromeRow(cfg, env) {
  const s = cfg.stores.chrome;
  const row = { store: "Chrome Web Store", id: s.id, url: s.url, live: "?", updated: "", review: "", credentials: "" };
  try {
    const res = await fetch(s.url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
    const live = chromeLiveFromHtml(await res.text());
    row.live = live.version ?? `not found (HTTP ${res.status})`;
    row.updated = live.updated ?? "";
  } catch (err) {
    row.live = `error: ${err.message}`;
  }
  if (!hasEnv("chrome", env)) {
    row.review = "needs CWS_* env";
    row.credentials = "not in env";
    return row;
  }
  try {
    const st = await itemStatus(cfg);
    const pub = st.publishedItemRevisionStatus;
    const sub = st.submittedItemRevisionStatus;
    const parts = [];
    if (pub) parts.push(`published ${pub.distributionChannels?.[0]?.crxVersion ?? "?"} (${pub.state})`);
    if (sub) parts.push(`submitted ${sub.distributionChannels?.[0]?.crxVersion ?? "?"} (${sub.state})`);
    row.review = parts.join("; ") || "no revision reported";
    row.credentials = "accepted";
  } catch (err) {
    row.review = "error";
    row.credentials = `rejected: ${err.message}`;
  }
  return row;
}

async function edgeRow(cfg, env) {
  const s = cfg.stores.edge;
  const row = { store: "Microsoft Edge Add-ons", id: s.id, url: s.url, live: "?", updated: "", review: "not exposed by the API, read Partner Center", credentials: "" };
  try {
    if (!s.crxId) throw new Error("stores.edge.crxId missing in store.config.json");
    const res = await fetch(`${EDGE_PUBLIC}/${s.crxId}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const live = edgeLiveFromJson(await res.json());
    row.live = live.version ?? "not found";
    row.updated = live.updated ?? "";
  } catch (err) {
    row.live = `error: ${err.message}`;
  }
  if (!hasEnv("edge", env)) {
    row.credentials = "not in env";
    return row;
  }
  try {
    const c = await credentialStatus(cfg);
    const expiry = c.expires ? `, key expires ${c.expires} (${c.daysLeft} days)` : "";
    row.credentials = (c.accepted ? "accepted" : `rejected (HTTP ${c.httpStatus})`) + expiry;
  } catch (err) {
    row.credentials = `error: ${err.message}`;
  }
  return row;
}

async function firefoxRow(cfg, env) {
  const s = cfg.stores.firefox;
  const row = { store: "Firefox Add-ons (AMO)", id: s.id, url: s.url, live: "?", updated: "", review: "", credentials: "" };
  try {
    // AMO caches for six minutes; the buster makes the table reflect the moment it was generated.
    const res = await fetch(`${AMO_PUBLIC}/${s.slug}/?_=${Date.now()}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const live = firefoxLiveFromJson(await res.json());
    row.live = live.version ?? "not found";
    row.updated = live.updated ?? "";
    row.review = live.status ? `listing ${live.status}` : "";
  } catch (err) {
    row.live = `error: ${err.message}`;
  }
  if (!hasEnv("firefox", env)) {
    row.credentials = "not in env";
    return row;
  }
  try {
    const versions = await amoApi(`/addons/addon/${s.id}/versions/?filter=all_with_unlisted`);
    const latest = versions.results?.[0];
    if (latest) row.review += `${row.review ? "; " : ""}latest upload ${latest.version} (${latest.file?.status ?? "?"})`;
    row.credentials = "accepted";
  } catch (err) {
    row.credentials = `rejected: ${err.message}`;
  }
  return row;
}

export async function collectStatus(cfg, env = process.env) {
  return Promise.all([chromeRow(cfg, env), edgeRow(cfg, env), firefoxRow(cfg, env)]);
}

export function renderStatus(cfg, rows, { now = new Date(), command = "store-publish status --markdown" } = {}) {
  const from = relative(process.cwd(), cfg.path) || cfg.path;
  const lines = [
    `<!-- generated ${now.toISOString()} by \`${command}\` from ${from} (${cfg.name}); regenerate, do not edit -->`,
    "| Store | Live version | Live since | Review / submission | API credentials |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(`| [${r.store}](${r.url}) | ${r.live} | ${r.updated} | ${r.review} | ${r.credentials} |`);
  }
  return lines.join("\n");
}

export async function runStatus(cfg, flags) {
  const rows = await collectStatus(cfg);
  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (flags.markdown) {
    console.log(renderStatus(cfg, rows));
    return;
  }
  for (const r of rows) {
    console.log(`${r.store}`);
    console.log(`  live:        ${r.live}${r.updated ? ` (since ${r.updated})` : ""}`);
    if (r.review) console.log(`  review:      ${r.review}`);
    console.log(`  credentials: ${r.credentials}`);
  }
}
