# store-publish

One command-line tool that uploads, publishes and inspects a browser extension
on the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO). Every
extension-specific value comes from a `store.config.json` in the extension
repository, so the same tool serves every extension and a new extension only
copies the config file and changes the ids.

Used by [save-media](https://github.com/ANcpLua/save-media) and
[yt-transcript](https://github.com/ANcpLua/yt-transcript).

## Install

Add it as a git dependency and pin a tag:

```sh
# bun
bun add -d "github:ANcpLua/store-publish#v1.4.1"
# pnpm
pnpm add -D "github:ANcpLua/store-publish#v1.4.1"
# npm
npm install -D "github:ANcpLua/store-publish#v1.4.1"
```

The package has no dependencies and needs Node 22.11 or newer. The binary is
`store-publish`; run it with `bunx`, `pnpm exec`, `npx`, or through a package
script.

## Configure

Copy [`store.config.example.json`](store.config.example.json) to the repository
root as `store.config.json` and fill in the ids. The tool finds the file by
walking up from the working directory, or takes `--config PATH`.

| Field | Meaning |
| --- | --- |
| `name` | Extension name, informational |
| `zipPrefix` | Store zips are `<zipPrefix>-<chrome\|edge\|firefox\|source>-<version>.zip` |
| `zipDir` | Directory the zips are built into, relative to the config (default `.`) |
| `versionFrom` | JSON file whose `version` field names the release (usually the manifest) |
| `versionFiles` | Every JSON file that carries the version (manifests, package.json, package-lock.json). `version` fails when they disagree. `versionFrom` is always included |
| `listing` | Markdown file with the store text, see below |
| `readme` | File that carries the store table (default `README.md`) |
| `lint.forbidden` | Extra words `lint` rejects, in addition to the built-in ones |
| `lint.brands` | Brand names `lint` rejects in public text. Default: Chrome, Firefox, Edge, YouTube, Vimeo, Google, Microsoft, Mozilla. Set `[]` to disable |
| `stores.firefox.icon` | Listing icon for AMO (`firefox icon`), AMO shows its default icon until one is uploaded; the manifest icon is not used |
| `stores.firefox.previews` | Listing screenshots for AMO in order (`firefox previews set`) |
| `manifests` | Extension manifests whose `name` and `description` (the store summary line) `lint` checks with the text rules |
| `images` | Store images `lint` requires: `"path"` or `{ "path", "size": "1280x800" }`; missing files, wrong PNG sizes and byte-identical pairs fail |
| `stores.<store>.id` | Chrome item id, Edge product GUID, Firefox add-on id |
| `stores.<store>.url` | Public listing |
| `stores.<store>.dashboard` | Where a human edits the listing |
| `stores.<store>.apiDocs` | The API the tool talks to |
| `stores.<store>.env` | Names of the secrets the API needs. Must match the table below, the tool refuses anything else |
| `stores.edge.crxId` | The id in the public Edge URL, differs from the product GUID |
| `stores.edge.expires` | Expiry date of the Edge API key, `YYYY-MM-DD`. `edge status` fails once it has passed |
| `stores.firefox.slug` | The slug in the AMO URL, used by `amo-listing` |
| `stores.<store>.notes` | Free text for the README table |

Credentials are never in the config. They come from the environment:

| Store | Environment variables |
| --- | --- |
| Chrome | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID` |
| Edge | `EDGE_API_KEY`, `EDGE_CLIENT_ID` |
| Firefox | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` |

## Commands

```
store-publish chrome  update|publish|release|status   [--zip PATH] [--item ID]
store-publish edge    update|publish|release|status   [--zip PATH] [--notes TEXT]
store-publish firefox upload|release|status           [--zip PATH] [--channel listed|unlisted] [--notes TEXT] [--source [PATH]]
store-publish firefox icon [PATH] [--diff]
store-publish firefox previews list | set [PATH...]
store-publish amo-listing show|diff|apply
store-publish lint
store-publish readme [--write|--check]
store-publish version [--tag TAG]
store-publish status [--markdown|--json]
store-publish config
```

`status` asks every store at once. The live version and date come from the
public listings and need no credentials (Chrome Web Store page, Edge
`getproductdetailsbycrxid`, AMO public API). The review column and the
credential check use the env vars when they are set and say "not in env"
otherwise. `--markdown` prints a table with a timestamp and the generating
command in a comment; paste that into documents instead of typing a version
by hand.

`version` reads every file in `versionFiles`, fails when they do not carry
the same version (or when `--tag vX.Y.Z` names a different one), and prints
the version on stdout so a workflow can capture it:

```yaml
- id: v
  run: echo "version=$(bunx store-publish version --tag "$GITHUB_REF_NAME")" >> "$GITHUB_OUTPUT"
```

`release` is upload followed by publish. `status` is read-only everywhere:
Chrome returns the item's review state, Firefox lists versions with their
review status, Edge has no read endpoint so `status` probes the credentials
with an operation id that cannot exist (401 means rejected, anything else means
accepted), prints the lengths of the three values so a mangled secret is
visible, and prints how many days the API key has left.

Every store only updates an existing listing. The first submission, the
listing text on Chrome and Edge, screenshots and privacy answers are done in the
dashboards.

### Listing file

`listing` is a markdown file. Sections whose heading contains "description" or
"summary" are public text; everything else is editorial. `amo-listing` writes
the `## AMO description` section to AMO, under the locale the add-on was
created with (never a hardcoded one, that would add a second translation and
leave the served one untouched). An editorial note at the top of the section
ends with a line that starts with `Applied with`.

`lint` rejects, in the public sections and in every manifest `name` and
`description` listed under `manifests`:

- the words "bypass", "unlock", "circumvent" and their inflections, even inside
  a negation, plus anything in `lint.forbidden`
- brand names from `lint.brands` ("Chrome's built-in AI" is nominative use and
  still the kind of text that gets a trademark complaint)
- em dashes and en dashes (U+2014, U+2013) and emoji
- a run of five or more comma-separated items of up to three words each, the
  pattern the Chrome Web Store rejects as keyword spam

and for the files under `images`: a missing file, a PNG whose size differs
from the declared one, and two files that are byte-identical (a tile that
shows the wrong extension's logo has happened).

### README table

`store-publish readme --write` renders one table from the config and puts it
between `<!-- store-config:start -->` and `<!-- store-config:end -->` in the
README. `--check` fails when the README is stale, for CI.

## Workflow sketch

```yaml
- run: bun install --frozen-lockfile
- run: bunx store-publish lint
- run: bunx store-publish readme --check
- run: bunx store-publish chrome release
  env:
    CWS_CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
    CWS_CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
    CWS_REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
    CWS_PUBLISHER_ID: ${{ secrets.CWS_PUBLISHER_ID }}
```

## Releasing this tool

Bump `version` in `package.json`, commit, tag `vX.Y.Z`, push the tag. Consumers
pin the tag in their `package.json`.

## License

Apache-2.0
