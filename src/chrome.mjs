/**
 * Chrome Web Store, Web Store API v2.
 * The item must already exist (first submission, listing and privacy tabs are
 * manual in the developer dashboard). Items publish with their existing
 * visibility settings.
 * Docs: https://developer.chrome.com/docs/webstore/using-api
 */
import { existsSync, readFileSync } from "node:fs";
import { required } from "./common.mjs";
import { zipPath } from "./config.mjs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_ROOT = "https://chromewebstore.googleapis.com";

export const COMMANDS = {
  update: "upload a new package (--zip PATH)",
  publish: "submit the uploaded package for review",
  release: "update, then publish",
  status: "print the item's review and publish status (read-only)",
};

export async function run(cfg, command, flags) {
  const itemId = flags.item ?? cfg.stores.chrome.id;
  const publisherId = required("CWS_PUBLISHER_ID");
  const itemBase = `publishers/${publisherId}/items/${itemId}`;
  const token = await accessToken();
  const zip = zipPath(cfg, "chrome", flags.zip);

  switch (command) {
    case "update":
      await uploadPackage(token, itemBase, zip);
      break;
    case "publish":
      await publishItem(token, itemBase);
      break;
    case "release":
      await uploadPackage(token, itemBase, zip);
      await publishItem(token, itemBase);
      break;
    case "status": {
      const status = await api(token, `/v2/${itemBase}:fetchStatus`, { method: "GET" });
      console.log(JSON.stringify(status, null, 2));
      break;
    }
    default:
      throw new Error(`chrome: unknown command ${command}`);
  }
}

async function accessToken() {
  const body = new URLSearchParams({
    client_id: required("CWS_CLIENT_ID"),
    client_secret: required("CWS_CLIENT_SECRET"),
    refresh_token: required("CWS_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`token refresh failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function uploadPackage(token, itemBase, zip) {
  if (!existsSync(zip)) throw new Error(`zip not found: ${zip}`);
  const json = await api(token, `/upload/v2/${itemBase}:upload`, { method: "POST", body: readFileSync(zip) });
  console.log(`✓ uploaded ${zip.split("/").pop()}${json.name ? ` (${json.name})` : ""}`);
  return json;
}

async function publishItem(token, itemBase) {
  const json = await api(token, `/v2/${itemBase}:publish`, { method: "POST" });
  console.log("✓ publish requested (submitted for review with existing visibility)");
  return json;
}

async function api(token, path, init) {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message ?? JSON.stringify(json);
    throw new Error(`${init.method} ${path} failed (${res.status}): ${msg}`);
  }
  return json;
}
