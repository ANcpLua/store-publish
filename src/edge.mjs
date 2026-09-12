/**
 * Microsoft Edge Add-ons, Update REST API v1.1.
 * The API only updates an existing product; the first submission and every
 * listing-text change happen in Partner Center.
 * Docs: https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api
 */
import { existsSync, readFileSync } from "node:fs";
import { daysUntil, required, sleep } from "./common.mjs";
import { zipPath } from "./config.mjs";

const API_ROOT = "https://api.addons.microsoftedge.microsoft.com";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const EXPIRY_WARN_DAYS = 30;

export const COMMANDS = {
  update: "upload a new package to the draft submission (--zip PATH)",
  publish: "publish the draft submission (--notes \"text\")",
  release: "update, then publish",
  status: "probe whether the API credentials are accepted and report the key expiry (read-only)",
};

export async function run(cfg, command, flags) {
  const store = cfg.stores.edge;
  const productId = flags.product ?? store.id;
  const apiKey = required("EDGE_API_KEY");
  const clientId = required("EDGE_CLIENT_ID");
  const headers = { Authorization: `ApiKey ${apiKey}`, "X-ClientID": clientId };
  const base = `${API_ROOT}/v1/products/${productId}`;
  const zip = zipPath(cfg, "edge", flags.zip);
  const notes = flags.notes ?? "Automated release via Edge Add-ons API.";

  switch (command) {
    case "update":
      await uploadPackage(base, headers, zip);
      break;
    case "publish":
      await publishSubmission(base, headers, notes);
      break;
    case "release":
      await uploadPackage(base, headers, zip);
      await publishSubmission(base, headers, notes);
      break;
    case "status":
      await probe(base, headers, { apiKey, clientId, productId, expires: store.expires });
      break;
    default:
      throw new Error(`edge: unknown command ${command}`);
  }
}

async function uploadPackage(base, headers, zip) {
  if (!existsSync(zip)) throw new Error(`zip not found: ${zip}`);
  const res = await fetch(`${base}/submissions/draft/package`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/zip" },
    body: readFileSync(zip),
  });
  if (res.status !== 202) throw new Error(`package upload failed (${res.status}): ${await res.text()}`);
  const operationId = res.headers.get("Location");
  console.log(`→ package upload accepted (operation ${operationId})`);
  await poll(`${base}/submissions/draft/package/operations/${operationId}`, headers, "upload");
  console.log("✓ package uploaded and validated");
}

async function publishSubmission(base, headers, notes) {
  const res = await fetch(`${base}/submissions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (res.status !== 202) throw new Error(`publish failed (${res.status}): ${await res.text()}`);
  const operationId = res.headers.get("Location");
  console.log(`→ publish accepted (operation ${operationId})`);
  await poll(`${base}/submissions/operations/${operationId}`, headers, "publish");
  console.log("✓ submission sent for certification");
}

/**
 * The Update API has no read-only endpoint, so this asks for an operation that
 * cannot exist. 401 means the credentials are rejected; any other status means
 * they were accepted and Edge simply has no such operation. Nothing is
 * uploaded or published. Lengths are printed because a mangled secret (a
 * clipboard paste gone wrong) shows up as a wrong length before anything else.
 */
async function probe(base, headers, { apiKey, clientId, productId, expires }) {
  const { status } = await probeCredentials(base, headers);
  console.log(`key length: ${apiKey.length}  client id length: ${clientId.length}  product id length: ${productId.length}`);
  console.log(`probe returned HTTP ${status}`);
  if (status === 401) {
    throw new Error("Edge rejected the credentials (401). EDGE_API_KEY or EDGE_CLIENT_ID is wrong or expired.");
  }
  console.log("✓ credentials accepted");
  if (expires) {
    const days = daysUntil(expires);
    if (days < 0) throw new Error(`EDGE_API_KEY expired on ${expires} (${-days} days ago). Renew it in Partner Center and update store.config.json.`);
    const note = days <= EXPIRY_WARN_DAYS ? "  ← renew soon" : "";
    console.log(`API key expires ${expires} (${days} days left)${note}`);
  }
}

async function probeCredentials(base, headers) {
  const res = await fetch(`${base}/submissions/operations/00000000-0000-0000-0000-000000000000`, { headers });
  return { status: res.status };
}

/** For `status`: whether the API accepts the credentials in env, plus the configured expiry. */
export async function credentialStatus(cfg) {
  const store = cfg.stores.edge;
  const headers = { Authorization: `ApiKey ${required("EDGE_API_KEY")}`, "X-ClientID": required("EDGE_CLIENT_ID") };
  const { status } = await probeCredentials(`${API_ROOT}/v1/products/${store.id}`, headers);
  return { accepted: status !== 401, httpStatus: status, expires: store.expires ?? null, daysLeft: store.expires ? daysUntil(store.expires) : null };
}

async function poll(url, headers, label) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await fetch(url, { headers });
    const json = await res.json().catch(() => ({}));
    const status = json.status ?? "Unknown";
    if (status === "Succeeded") return json;
    if (status === "Failed") {
      const errs = (json.errors ?? []).map((e) => e.message ?? JSON.stringify(e)).join("; ");
      throw new Error(`${label} failed: ${errs || json.message || "unknown error"}`);
    }
    if (Date.now() > deadline) throw new Error(`${label} timed out while ${status}`);
    process.stdout.write(`  ${label}: ${status}…\r`);
    await sleep(POLL_INTERVAL_MS);
  }
}
