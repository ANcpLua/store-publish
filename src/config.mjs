import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CONFIG_FILE = "store.config.json";
export const STORES = ["chrome", "edge", "firefox"];

/** Brand names that must not appear in public text (nominative use is legal but triggers automated enforcement). Override with lint.brands. */
export const DEFAULT_BRANDS = ["Chrome", "Firefox", "Edge", "YouTube", "Vimeo", "Google", "Microsoft", "Mozilla"];

/** Env vars each store's API client needs. The config's `env` lists must match. */
export const ENV = {
  chrome: ["CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN", "CWS_PUBLISHER_ID"],
  edge: ["EDGE_API_KEY", "EDGE_CLIENT_ID"],
  firefox: ["AMO_JWT_ISSUER", "AMO_JWT_SECRET"],
};

/** Walk up from `start` until a store.config.json is found. */
export function findConfig(explicit, start = process.cwd()) {
  if (explicit) {
    const p = resolve(start, explicit);
    if (!existsSync(p)) throw new Error(`config not found: ${p}`);
    return p;
  }
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no ${CONFIG_FILE} found in ${start} or any parent directory`);
    dir = parent;
  }
}

export function loadConfig(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const root = dirname(path);
  const cfg = validate(raw, path);
  const version = readVersion(resolve(root, cfg.versionFrom));
  return { ...cfg, root, path, version };
}

export function validate(raw, path = CONFIG_FILE) {
  const bad = (msg) => new Error(`${path}: ${msg}`);
  const str = (obj, key, where) => {
    if (typeof obj[key] !== "string" || obj[key].length === 0) throw bad(`${where}.${key} must be a non-empty string`);
    return obj[key];
  };
  if (raw === null || typeof raw !== "object") throw bad("must be a JSON object");
  const cfg = {
    name: str(raw, "name", "config"),
    zipPrefix: str(raw, "zipPrefix", "config"),
    zipDir: raw.zipDir === undefined ? "." : str(raw, "zipDir", "config"),
    versionFrom: str(raw, "versionFrom", "config"),
    versionFiles: [],
    listing: str(raw, "listing", "config"),
    readme: raw.readme === undefined ? "README.md" : str(raw, "readme", "config"),
    lint: { forbidden: [], brands: [...DEFAULT_BRANDS], textFiles: [] },
    manifests: [],
    images: [],
    stores: {},
  };
  if (raw.manifests !== undefined) {
    if (!Array.isArray(raw.manifests) || !raw.manifests.every((f) => typeof f === "string" && f.length > 0)) throw bad("manifests must be an array of file paths");
    cfg.manifests = [...raw.manifests];
  }
  if (raw.images !== undefined) {
    if (!Array.isArray(raw.images)) throw bad("images must be an array");
    cfg.images = raw.images.map((entry, i) => {
      if (typeof entry === "string" && entry.length > 0) return { path: entry, size: null };
      if (entry && typeof entry.path === "string" && entry.path.length > 0) {
        if (entry.size !== undefined && !/^\d+x\d+$/.test(String(entry.size))) throw bad(`images[${i}].size must look like 1280x800`);
        return { path: entry.path, size: entry.size ?? null };
      }
      throw bad(`images[${i}] must be a path or { path, size }`);
    });
  }
  if (raw.versionFiles !== undefined) {
    if (!Array.isArray(raw.versionFiles) || raw.versionFiles.length === 0 || !raw.versionFiles.every((f) => typeof f === "string" && f.length > 0)) {
      throw bad("versionFiles must be a non-empty array of file paths");
    }
    cfg.versionFiles = [...raw.versionFiles];
  }
  if (!cfg.versionFiles.includes(cfg.versionFrom)) cfg.versionFiles.unshift(cfg.versionFrom);
  if (raw.lint !== undefined) {
    if (raw.lint === null || typeof raw.lint !== "object") throw bad("lint must be an object");
    if (raw.lint.forbidden !== undefined) {
      if (!Array.isArray(raw.lint.forbidden) || !raw.lint.forbidden.every((w) => typeof w === "string")) {
        throw bad("lint.forbidden must be an array of strings");
      }
      cfg.lint.forbidden = raw.lint.forbidden;
    }
    if (raw.lint.textFiles !== undefined) {
      if (!Array.isArray(raw.lint.textFiles) || !raw.lint.textFiles.every((f) => typeof f === "string" && f.length > 0)) {
        throw bad("lint.textFiles must be an array of file paths");
      }
      cfg.lint.textFiles = [...raw.lint.textFiles];
    }
    if (raw.lint.brands !== undefined) {
      if (!Array.isArray(raw.lint.brands) || !raw.lint.brands.every((w) => typeof w === "string")) {
        throw bad("lint.brands must be an array of strings (empty to disable the brand check)");
      }
      cfg.lint.brands = [...raw.lint.brands];
    }
  }
  if (raw.stores === null || typeof raw.stores !== "object") throw bad("stores must be an object");
  for (const store of STORES) {
    const s = raw.stores[store];
    if (s === undefined) throw bad(`stores.${store} is missing`);
    const where = `stores.${store}`;
    const entry = {
      id: str(s, "id", where),
      url: str(s, "url", where),
      dashboard: str(s, "dashboard", where),
      apiDocs: str(s, "apiDocs", where),
      env: s.env,
    };
    if (!Array.isArray(s.env) || !s.env.every((e) => typeof e === "string")) throw bad(`${where}.env must be an array of strings`);
    const expected = [...ENV[store]].sort().join(",");
    const actual = [...s.env].sort().join(",");
    if (expected !== actual) throw bad(`${where}.env must be exactly [${ENV[store].join(", ")}], got [${s.env.join(", ")}]`);
    if (store === "firefox") {
      entry.slug = str(s, "slug", where);
      if (s.icon !== undefined) entry.icon = str(s, "icon", where);
      if (s.previews !== undefined) {
        if (!Array.isArray(s.previews) || !s.previews.every((f) => typeof f === "string" && f.length > 0)) throw bad(`${where}.previews must be an array of image paths`);
        entry.previews = [...s.previews];
      }
    }
    if (store === "edge" && s.crxId !== undefined) entry.crxId = str(s, "crxId", where);
    if (s.expires !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.expires))) throw bad(`${where}.expires must be YYYY-MM-DD`);
      entry.expires = s.expires;
    }
    if (s.notes !== undefined) entry.notes = str(s, "notes", where);
    cfg.stores[store] = entry;
  }
  return cfg;
}

function readVersion(file) {
  if (!existsSync(file)) throw new Error(`versionFrom file not found: ${file}`);
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (typeof json.version !== "string") throw new Error(`${file} has no "version" string`);
  return json.version;
}

export function zipName(cfg, kind) {
  return `${cfg.zipPrefix}-${kind}-${cfg.version}.zip`;
}

export function zipPath(cfg, kind, override) {
  return resolve(cfg.root, override ?? join(cfg.zipDir, zipName(cfg, kind)));
}
