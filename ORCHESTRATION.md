# Orchestration

Who owns what, what is open, and what the stores serve. A new session reads
this file instead of a chat history. The store tables are generated, never
typed; regenerate them with the command in their comment line.

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
the coordinator.

## Open items

### save-media

```
[PENDING] Chrome listing review 0.0.7 (description, single purpose, privacy URL, homepage and support URL corrected 2026-09-12)
          waits on: Google review. Evidence of submission: fetchStatus submittedItemRevisionStatus PENDING_REVIEW crxVersion 0.0.7 (store-status run 34699295187)
[PENDING] Edge listing review 0.0.7 (description, single purpose, storage justification, privacy URL corrected 2026-09-12)
          waits on: Microsoft certification, Partner Center "UPDATE 0.0.7 In review". Not readable through the API; check Partner Center
[PENDING] Manual check of the local downloader with the nativeMessaging permission prompt in Edge and Firefox
          waits on: the owner, checklist in save-media docs/manual-check-local-downloader.md
[PENDING] Release 1.0.0 with the local downloader
          waits on: both listing reviews closed, manual check reported, then version bump and tag
[DONE]    Native host smoke and 38 unit/installer tests   Evidence: ci run 34699789676, Unit job log "Ran 38 tests"
[DONE]    Toolchain: bun + Vitest + Playwright   Evidence: ci run 34699295231 green on all five jobs
```

### yt-transcript

```
[PENDING] Vitest port of the node:test suite   waits on: AgentB, after the Chrome 3.1.0 review closed (it did: 3.1.0 live, see table)
[DONE]    store-publish v1.1.0 adopted, versionFiles check   Evidence: AgentB commit 18ad3bc, edge status dispatch green (reported by AgentB)
```

## Store state (generated)

Regenerate with `store-publish status --markdown` in each repository. Without
credentials in the environment the review column is public data only; in a
workflow run with the secrets it also carries the review state and a
credential check.

### save-media

<!-- generated 2026-09-12T14:42:46.421Z by `store-publish status --markdown` from store.config.json (savemedia); regenerate, do not edit -->
| Store | Live version | Live since | Review / submission | API credentials |
| --- | --- | --- | --- | --- |
| [Chrome Web Store](https://chromewebstore.google.com/detail/savemedia/negbodmpgjhkacmdkbfdpocjanaklifn) | 0.0.7 | August 6, 2026 | needs CWS_* env | not in env |
| [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/savemedia/mmkdllnjmommekajhadhokanofjlglhk) | 0.0.7 | 2026-09-09 | not exposed by the API, read Partner Center | not in env |
| [Firefox Add-ons (AMO)](https://addons.mozilla.org/firefox/addon/save-media/) | 0.0.7 | 2026-07-10 | listing public | not in env |

### yt-transcript

<!-- generated 2026-09-12T14:42:47.328Z by `store-publish status --markdown` from store.config.json (Video Transcript); regenerate, do not edit -->
| Store | Live version | Live since | Review / submission | API credentials |
| --- | --- | --- | --- | --- |
| [Chrome Web Store](https://chromewebstore.google.com/detail/ahddbfbjafmbceehebpeanpnlbaimepk) | 3.1.0 | September 12, 2026 | needs CWS_* env | not in env |
| [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/video-transcript/jkcfajddmmeapfabpoekfiemnbdaofeo) | 3.1.0 | 2026-09-12 | not exposed by the API, read Partner Center | not in env |
| [Firefox Add-ons (AMO)](https://addons.mozilla.org/firefox/addon/video-transcript/) | 3.2.0 | 2026-09-12 | listing public | not in env |
