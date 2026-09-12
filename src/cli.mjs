import { parseArgs } from "./common.mjs";
import { findConfig, loadConfig } from "./config.mjs";
import * as chrome from "./chrome.mjs";
import * as edge from "./edge.mjs";
import * as firefox from "./firefox.mjs";
import { AMO_COMMANDS, runAmoListing, runLint } from "./listing.mjs";
import { runReadme } from "./readme.mjs";
import { runVersion } from "./version.mjs";
import { runStatus } from "./status.mjs";

const STORES = { chrome, edge, firefox };

export async function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [target, command, ...rest] = positional;
  flags._positional = rest;
  if (!target || target === "help" || flags.help) return usage();

  const cfg = loadConfig(findConfig(flags.config));

  switch (target) {
    case "chrome":
    case "edge":
    case "firefox":
      if (!command) return usage(`${target}: missing command`);
      return STORES[target].run(cfg, command, flags);
    case "amo-listing":
      if (!command) return usage("amo-listing: missing command");
      return runAmoListing(cfg, command);
    case "lint":
      return runLint(cfg);
    case "readme":
      return runReadme(cfg, flags);
    case "status":
      return runStatus(cfg, flags);
    case "version":
      return runVersion(cfg, flags);
    case "config":
      console.log(JSON.stringify(cfg, null, 2));
      return;
    default:
      return usage(`unknown target: ${target}`);
  }
}

function usage(msg) {
  if (msg) console.error(`✘ ${msg}\n`);
  const list = (cmds) => Object.entries(cmds).map(([k, v]) => `      ${k.padEnd(8)} ${v}`).join("\n");
  console.log(`store-publish: browser extension store publishing driven by store.config.json

  store-publish chrome  <update|publish|release|status> [--zip PATH] [--item ID]
${list(chrome.COMMANDS)}
  store-publish edge    <update|publish|release|status> [--zip PATH] [--notes TEXT]
${list(edge.COMMANDS)}
  store-publish firefox <upload|release|status> [--zip PATH] [--channel listed|unlisted] [--notes TEXT] [--source [PATH]]
${list(firefox.COMMANDS)}
  store-publish amo-listing <show|diff|apply>
${list(AMO_COMMANDS)}
  store-publish lint                 listing sections, manifest name/description and store images: forbidden words, dashes, emoji, comma chains, missing or duplicate images
  store-publish readme [--write|--check]   render the store table, write it into the README, or verify it
  store-publish status [--markdown|--json]   live version of every store from the public listings, plus review state and credential check where env allows
  store-publish version [--tag TAG]  fail unless every versionFiles entry (and the tag) carries the same version; prints it
  store-publish config               print the resolved configuration

Options: --config PATH (default: nearest store.config.json upwards from the working directory)
Credentials come from the environment; the names per store are in store.config.json.`);
  if (msg) process.exit(1);
}
