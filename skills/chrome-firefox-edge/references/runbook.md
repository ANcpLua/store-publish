# Publishing runbook

Commands describe the current CLI. Read its `help` and the extension's own
scripts when adapting them. Earlier failures below are troubleshooting clues,
not permanent limits on what another agent or tool can do.

## Setup once

Install a public, pinned release as a development dependency, using the
project's package manager and committing its lockfile. For npm:

```sh
npm install --save-dev github:ANcpLua/store-publish#v1.6.2
./node_modules/.bin/store-publish help
```

Copy the package's `store.config.example.json` into the extension root and
replace the placeholders. Use the actual version files, listing and screenshot
paths, and IDs. Chrome's item and publisher IDs differ; Edge's product GUID and
public CRX ID differ; Firefox's add-on ID must match its manifest's gecko ID.
The CLI updates existing items, so create an initial listing if needed.

Put credentials in the existing secret manager and CI secrets, using the names
in config. Keep expiry dates in config. GitHub exposes secret names, not their
values; exercise credentials through read-only status. The CLI needs Node
22.11.0 or later, including when Bun installs it.

Add the two `store-config:start` / `store-config:end` HTML comment markers
around the README store table, then run `store-publish readme --write`.
Install this whole skill folder wherever the chosen agent loads skills; link
it from the extension's existing AGENTS.md or CLAUDE.md for discovery.

## Release sequence

Use the repository's configured checks, `store-publish version`, `lint`, and
`readme --check`. Inspect archives and target manifests. Package names follow
`<zipPrefix>-<chrome|edge|firefox|source>-<version>.zip` under `zipDir`.
Build Firefox's source archive and verify its documented rebuild first.

Commit and push the tested changes, verify CI for that commit, then follow the
repository's tagging and submission workflow. Refresh store state before
uploading. SaveMedia's working examples separate GitHub release creation from
store submission and let later stores run after an earlier store fails:

- [Release workflow](https://github.com/ANcpLua/save-media/blob/0c1146fc8170489110d3fb8b9241f50c82322e15/.github/workflows/release.yml)
- [Status and listing workflow](https://github.com/ANcpLua/save-media/blob/0c1146fc8170489110d3fb8b9241f50c82322e15/.github/workflows/store-status.yml)

Adapt the project build commands and preserve successful preparation as a gate
for every store write. Some options in the listing workflow modify live assets;
choose a read-only option when only checking status.

## Operations

Run the repository's installed CLI from its root, with that store's credentials.

| Command after `store-publish` | Result |
| --- | --- |
| `status --markdown` | Public versions, plus private state where authenticated |
| `chrome status` / `firefox status` | Store-specific version and review information |
| `edge status` | Credential and expiry probe; inspect Partner Center for certification |
| `chrome release` / `edge release` | Upload and submit |
| `chrome update` / `edge update` | Upload a draft without submitting |
| `chrome publish` / `edge publish` | Submit the existing draft without another upload |
| `firefox release --source` | Upload, create a version, then attach its source archive |
| `firefox upload` | Upload and validate only |
| `amo-listing diff` / `apply` | Compare / update description in the add-on's default locale |
| `firefox icon --diff`, `firefox previews list` | Inspect AMO listing assets |
| `firefox icon`, `firefox previews set` | Update configured AMO assets |

For other listing fields, use the available signed-in browser or computer tool.
Save, reload, and inspect the resulting text and image slots.

## Lessons that save another round

| What went wrong | Useful next step |
| --- | --- |
| Validators passed while text or images still had problems | Inspect the final pixels and wording; resolve user feedback against the actual result. Automated checks do not prove quality or authorship. |
| Agents added restrictions, then treated their own prose as immovable | Revisit the reason and current evidence; remove obsolete guidance. The user's correction is not defeated by an earlier agent-written rule. |
| Unsupported features and promotional prose reached a listing | Say only what the target build demonstrably does. Prefer a short factual description to speculative capabilities or keyword lists. |
| A caption defect was deferred and another submission was needed | Fix the final source and regenerate the affected image before uploading; review the regenerated file. |
| New package, old store icon/screenshots | Upload listing assets separately and verify their slots. A package does not replace them. |
| Changed AMO preview had the same dimensions | Use `firefox previews set --replace` intentionally; normal matching uses position and size, not pixel equality. |
| Image writes were throttled or cached | Respect the server's wait, coordinate shared-account uploads, and read fresh state before repeating writes. |
| One automation route failed | Try the supported dashboard, foreground tab, or native file picker. Verify the specific limitation before handing work back. |
| Private dependency broke CI/reviewer builds | Use publicly obtainable dependencies and verify a clean source rebuild. |
| Versions, filenames, or browser permissions differed | Read config and inspect each target archive; refresh the lockfile with its package manager. |
| Upload succeeded but submission failed | Finish required fields and publish the existing draft. Firefox may already have a version even if source attachment failed. |
| One store failed | Inspect every store's outcome and retry only the unfinished operation. After a timeout, check acceptance before repeating a write. |
| A review was pending | Retain it unless intentionally replacing it; record review state separately from public availability. |
| A key was corrupted or shared across projects | Check its trusted source and account pairing before rotation. Renew due keys and update affected consumers together. Keep values private. |

Check recorded expiry against today's date; a key due within 30 days deserves
attention. Diagnose unexpected server responses rather than treating a green
summary as authentication proof. Follow through on actionable issues within
the user's request. Record external waits with the next action; use an actual
scheduler when later checks are requested.

The examples come from the projects' release records, including the
[earlier publishing incident log](https://github.com/ANcpLua/store-publish/blob/7c55df74fedf2ba2b6c693271b02c2039be52ffd/ORCHESTRATION.md).
Use the actual store notice when investigating a rejection.
