# Orchestration

Who owns what, what the tools cannot do, what is open, and what the stores
serve. A new session reads this file instead of a chat history. The store
tables are generated, never typed; regenerate them with the command in their
comment line.

## Ownership

| Repository | Writes | Everyone else |
| --- | --- | --- |
| ANcpLua/store-publish (this CLI) | AgentA only | Opens issues here; consumers pin a tag and lift the pin after a bump is announced |
| ANcpLua/save-media | AgentA | Issues |
| ANcpLua/yt-transcript | AgentB | Issues |
| Coordinator session | writes nowhere | Decides irreversible steps: store submissions, deletions, key rotations, breaking changes |

Report format, used in the open-items lists below and in every hand-over:

```
[DONE]    <what>   Evidence: <run id, API state or command>
[PENDING] <what>   waits on: <who or what>
[AMBIG]   <what>   Options: A | B   Decision: <taken> or escalation
[BLOCKED] <what>   Reason: <verbatim error text>
```

A [DONE] without evidence is not done. Reversible work (commits, refactors,
wording) is decided by the owner of the repository and noted as Decision.
Store submissions, key rotations, deletions and anything user-visible go to
the coordinator. Free reversibility is always taken: a branch instead of a
force push, diff before apply, trash instead of rm.

## Tool limits

- Chrome Web Store dashboard: only through the Playwright MCP browser, and
  only while the owner is signed in there. The session expires after hours
  and needs the owner to sign in again. The Chrome extension automation
  cannot read chrome.google.com/webstore at all ("The extensions gallery
  cannot be scripted").
- Microsoft Partner Center renders only in a foreground tab. Listing text
  has no API; the Update API cannot report review state.
- AMO listing text is written by `store-publish amo-listing apply` under the
  add-on's own default locale (`de` for both extensions although the text is
  English; never hardcode a locale).
- Credentials: never regenerate a key to fix a 401. AMO has one key pair per
  account shared by both repositories; a new one invalidates the old one
  everywhere. Store secrets can only be exercised in a workflow run.

## Open items

### save-media

```
[DONE]    Chrome listing text, single purpose, privacy/homepage/support URLs corrected and submitted 2026-09-12
          Evidence: store-status run 34699295187 (14:26 UTC) and run 34700110756: submittedItemRevisionStatus PENDING_REVIEW crxVersion 0.0.7, published 0.0.7 unchanged (metadata-only submission)
[PENDING] Chrome review of that submission   waits on: Google
[PENDING] Read the Chrome dashboard wording back against listing.md   waits on: the owner signing in to the Playwright browser once; not a blocker
[DONE]    Edge listing text, single purpose, storage justification, privacy URL corrected and submitted 2026-09-12
          Evidence: Partner Center "UPDATE 0.0.7 In review" (screenshot in session; not readable through the API)
[PENDING] Edge certification of that submission   waits on: Microsoft, 7 business days from 2026-09-12
[PENDING] Manual check of the local downloader permission prompt in Edge and Firefox   waits on: the owner, checklist docs/manual-check-local-downloader.md
[PENDING] Store screenshots for 1.0.0   waits on: the version bump; `bun run --filter @savemedia/extension screenshots` renders them from the real popup (icon and version come from the build; regenerated 2026-09-12 at 0.0.7, commit 0666123)
[PENDING] Upload of new screenshots to Chrome   waits on: the 0.0.7 review closing; goes into the 1.0.0 submission together with the package
[PENDING] Release 1.0.0 with the local downloader   waits on: both listing reviews closed, manual check reported, then version bump and tag
[DONE]    Native host: 38 unit/installer tests and the Playwright smoke   Evidence: ci run 34699789676 Unit job log "Ran 38 tests"; smoke output "native smoke: OK" 2026-09-12
[DONE]    Toolchain bun + Vitest + Playwright   Evidence: ci run 34699295231 green on all five jobs
[DONE]    Store icon derivation   Evidence: `magick compare -metric AE` of store-icon-128-chrome.png against icon-128.png flattened on #0e1b26 = 0 pixels; the store file is the same render without alpha (store-assets.mjs)
```

### yt-transcript

```
[DONE]    v3.2.0 released to all three stores   Evidence: release run 34699894419 green (tag pushed 14:38:46 UTC after coordinator go-ahead; later confirmed "Tag jetzt")
[PENDING] 3.2.0 reviews (Chrome PENDING_REVIEW, Edge in certification, Firefox unreviewed)   waits on: the stores; store-status chrome/firefox
[PENDING] Edge listing text is still the 1.x copy ("captured automatically"); repo text in store/listing.md   waits on: Edge certification of 3.2.0 and a session with a Microsoft login
[PENDING] Vitest port of the 14 node:test tests   waits on: AgentB (branch, PR, green CI, no tag)
[PENDING] manifest.json and manifest.firefox.json description carry an em dash   waits on: AgentB; `store-publish lint` v1.3.0 with "manifests" in store.config.json reports both (verified 2026-09-12 against main through a scratch config)
[DONE]    store-publish v1.1.0 adopted, versionFiles check   Evidence: AgentB commit 18ad3bc, edge status dispatch green (reported by AgentB)
```

### store-publish

```
[DONE]    v1.3.0: lint covers dashes, emoji, manifest name/description, store images (presence, PNG size, duplicates)   Evidence: node --test 17 pass; save-media lint green with manifests and 6 images; yt-transcript manifests red as expected
[PENDING] Both consumers lift their pin to v1.3.0   waits on: AgentA (save-media, same day), AgentB (yt-transcript)
```

## Store state (generated)

Regenerate with `store-publish status --markdown` in each repository. Without
credentials in the environment the review column is public data only; in a
workflow run with the secrets (save-media: `store-status.yml` with
`store=status`) it also carries the review state and a credential check.

### save-media

<!-- generated 2026-09-12T14:48:34.104Z by `store-publish status --markdown` from store.config.json (savemedia); regenerate, do not edit -->
| Store | Live version | Live since | Review / submission | API credentials |
| --- | --- | --- | --- | --- |
| [Chrome Web Store](https://chromewebstore.google.com/detail/savemedia/negbodmpgjhkacmdkbfdpocjanaklifn) | 0.0.7 | August 6, 2026 | needs CWS_* env | not in env |
| [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/savemedia/mmkdllnjmommekajhadhokanofjlglhk) | 0.0.7 | 2026-09-09 | not exposed by the API, read Partner Center | not in env |
| [Firefox Add-ons (AMO)](https://addons.mozilla.org/firefox/addon/save-media/) | 0.0.7 | 2026-07-10 | listing public | not in env |

### yt-transcript

<!-- generated 2026-09-12T14:48:35.100Z by `store-publish status --markdown` from store.config.json (Video Transcript); regenerate, do not edit -->
| Store | Live version | Live since | Review / submission | API credentials |
| --- | --- | --- | --- | --- |
| [Chrome Web Store](https://chromewebstore.google.com/detail/ahddbfbjafmbceehebpeanpnlbaimepk) | 3.1.0 | September 12, 2026 | needs CWS_* env | not in env |
| [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/video-transcript/jkcfajddmmeapfabpoekfiemnbdaofeo) | 3.1.0 | 2026-09-12 | not exposed by the API, read Partner Center | not in env |
| [Firefox Add-ons (AMO)](https://addons.mozilla.org/firefox/addon/video-transcript/) | 3.2.0 | 2026-09-12 | listing public | not in env |
