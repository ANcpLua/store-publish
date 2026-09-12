/**
 * Every file that carries the extension version must agree, and on a tag
 * push the tag must agree with them. Version fields drifting apart between
 * manifest.json, package.json and a lockfile has already produced a broken
 * release once, so this is checked before anything is uploaded.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readVersions(cfg) {
  const out = [];
  for (const file of cfg.versionFiles) {
    const path = resolve(cfg.root, file);
    if (!existsSync(path)) throw new Error(`version file not found: ${file}`);
    const json = JSON.parse(readFileSync(path, "utf8"));
    if (typeof json.version !== "string") throw new Error(`${file} has no "version" string`);
    out.push({ file, version: json.version });
    // package-lock.json repeats the version in its root package entry.
    const rootEntry = json.packages?.[""];
    if (rootEntry && typeof rootEntry.version === "string") {
      out.push({ file: `${file} (packages."")`, version: rootEntry.version });
    }
  }
  return out;
}

/** Returns the agreed version, or throws naming every disagreeing file. */
export function checkVersions(cfg, tag) {
  const entries = readVersions(cfg);
  const versions = new Set(entries.map((e) => e.version));
  if (versions.size !== 1) {
    const list = entries.map((e) => `  ${e.version.padEnd(12)} ${e.file}`).join("\n");
    throw new Error(`version fields disagree:\n${list}`);
  }
  const [version] = versions;
  if (tag !== undefined) {
    const expected = tag.startsWith("v") ? tag.slice(1) : tag;
    if (expected !== version) throw new Error(`tag ${tag} does not match version ${version} in ${cfg.versionFiles.join(", ")}`);
  }
  return version;
}

export function runVersion(cfg, flags) {
  const tag = typeof flags.tag === "string" ? flags.tag : undefined;
  const version = checkVersions(cfg, tag);
  for (const e of readVersions(cfg)) console.error(`  ${e.version.padEnd(12)} ${e.file}`);
  console.error(tag ? `✓ ${cfg.versionFiles.length} file(s) and tag ${tag} agree` : `✓ ${cfg.versionFiles.length} file(s) agree`);
  console.log(version);
}
