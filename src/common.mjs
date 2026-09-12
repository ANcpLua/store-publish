import { createHmac, randomUUID } from "node:crypto";

/** `cmd sub --flag value --bool` → { positional: [cmd, sub], flags: { flag: "value", bool: true } } */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal HS256 JWT for addons.mozilla.org. AMO requires exp <= 5 minutes after iat. */
export function amoJwt(issuer, secret) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    iss: issuer,
    jti: randomUUID(),
    iat: now - 5,
    exp: now + 240,
  })}`;
  const sig = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${sig}`;
}

/** Days from today until an ISO date (YYYY-MM-DD). Negative when it is in the past. */
export function daysUntil(isoDate, now = new Date()) {
  const target = new Date(`${isoDate}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((target - today) / 86_400_000);
}
