# Orchestration

Who owns what, what the tools cannot do, what is open, and what the stores
serve. A new session reads this file instead of a chat history. The store
tables are generated, never typed; regenerate them with the command in their
comment line.

## Ownership

| Repository | Writes | Everyone else |
| --- | --- | --- |
| ANcpLua/store-publish (this CLI) | AgentB since v1.6.0 (owner's decision, 2026-09-12); AgentA keeps ORCHESTRATION.md and docs/PUBLISHING.md current | Consumers pin a tag and lift the pin after a bump is announced |
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

- One Playwright browser instance is shared by every session on this machine.
  One session drives it at a time (the coordinator while one exists, otherwise
  AgentA); other agents deliver file paths and the slot
  assignment (which file goes into which dashboard field) and never click.
  File uploads through Playwright work only from its allowed roots
  (~/Developer/store-publish and its .playwright-mcp).
- Chrome Web Store dashboard: the bare URL chrome.google.com/webstore/devconsole/
  redirects to a passive Google sign-in even while signed in; the publisher URL
  .../devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233 loads directly.
- Chrome Web Store: a running review can be cancelled in the dashboard
  (item menu: Preview, Cancel review, Defer publish, Unpublish, Transfer,
  Roll back version; owner screenshot, item ahddbfbjafmbceehebpeanpnlbaimepk,
  2026-09-12). Only a package upload during a review is refused by the API.
  The dashboard is reachable only through the Playwright MCP browser, and
  only while the owner is signed in there (the session expires after hours). The session expires after hours
  and needs the owner to sign in again. The Chrome extension automation
  cannot read chrome.google.com/webstore at all ("The extensions gallery
  cannot be scripted").
- Microsoft Partner Center renders only in a foreground tab. Listing text
  has no API; the Update API cannot report review state.
- AMO listing text is written by `store-publish amo-listing apply` under the
  add-on's own default locale (`de` for both extensions although the text is
  English; never hardcode a locale).
- Files for an upload dialog: put a copy exactly where the dialog opens (or
  where the owner says), name the absolute path once, no Finder windows, no
  extra browser tabs (owner rule, CLAUDE.md Assets 2026-09-12).
- Store icons are listing fields, not package contents, on every store.
  Chrome: "Store icon" under Store listing, Graphic assets; the package must
  also carry a 128x128 icon ("You must provide a 128x128-pixel extension icon
  image in the ZIP file", https://developer.chrome.com/docs/webstore/images),
  but a new package does not replace the dashboard field (Video Transcript
  3.2.0 shipped the new icon and the store kept the old one). Edge: "Extension
  logo" on the Details for <language> page, 300x300, "All the other items
  (such as logo or tiles) are uploaded separately"
  (https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).
  AMO: the `icon` field of the add-on, set through the developer hub or
  `PATCH /api/v5/addons/addon/<slug>/` with form field `icon`; "revert to the
  default add-on icon, send null"
  (https://mozilla.github.io/addons-server/topics/api/addons.html). savemedia
  on AMO serves the default icon today (icon_url ends in
  addon-icons/default-64.png), so the icon was never uploaded there.
- AMO's API answers with cache-control max-age=360. A read without a cache
  buster (`?_=<timestamp>`) can be six minutes stale and shows an icon or
  previews change as not applied. store-publish appends one on every
  read-back and in `status` since v1.4.2.
- AMO throttles image writes twice: a burst limit of seconds to minutes
  ("Expected available in 20/689/979/1489 seconds") and a per-account daily
  cap on image uploads that counts the icon and previews together (after
  three uploads on 2026-09-12: "Expected available in 59126 seconds", free
  again about 2026-09-13 08:39 UTC). store-publish v1.4.3 waits for the
  burst limit and stops cleanly at the daily cap (30 min ceiling per wait);
  `firefox previews set` is idempotent, so the next day's run continues at
  the first missing position. The cap is per account, and both extensions
  share one AMO account, so their uploads count together (about nine image
  writes across both hit it on 2026-09-12). Rule: bundle image uploads, at
  most one apply run per extension per day, and count the writes in the log.
- Credentials: never regenerate a key to fix a 401. AMO has one key pair per
  account shared by both repositories; a new one invalidates the old one
  everywhere. Store secrets can only be exercised in a workflow run.

## Open items

### save-media

```
[DONE]    Chrome listing text, single purpose, privacy/homepage/support URLs corrected and submitted 2026-09-12
          Evidence: store-status run 34699295187 (14:26 UTC) and run 34700110756: submittedItemRevisionStatus PENDING_REVIEW crxVersion 0.0.7, published 0.0.7 unchanged (metadata-only submission)
[DONE]    Chrome dashboard wording read back: description, homepage and support URL in the draft equal listing.md   Evidence: Playwright snapshot 2026-09-12 14:54 UTC, normalised text comparison true
[DONE]    That metadata submission was cancelled (by the owner, dashboard menu)   Evidence: store-status run 34700662694: submittedItemRevisionStatus CANCELLED crxVersion 0.0.7; public listing still carries the old text ("bypass", DRM brand names) as of 14:55 UTC
[DONE]    Chrome resubmitted 2026-09-12 15:02 UTC with the corrected text, store icon store-icon-128-chrome.png, screenshots 01/02/03 (commit 0666123), small promo tile promo-440x280.png, auto-publish on   Evidence: dashboard "Item saved." 15:02 UTC and submit dialog 15:02:47 UTC (coordinator); store-status run 34701046316 at 15:03 UTC: published 0.0.7 PUBLISHED, submitted 0.0.7 PENDING_REVIEW. Marquee slot empty (no 1400x560 file exists)
[DONE]    Chrome resubmitted again with the plain-language description from listing.md ba79fc8 (922 chars; images kept in the draft), auto-publish on   Evidence: dashboard "Item saved." 18:26 UTC; status run 34711220198 submitted 0.0.7 PENDING_REVIEW
[PENDING] Chrome review of that resubmission   waits on: Google. If it is still open when 1.0.0 is ready, cancel it and resubmit with the package
[DONE]    Edge resubmitted with the same description   Evidence: Partner Center "UPDATE 0.0.7 In review" 2026-09-12 ~18:40 UTC, Store Listings table shows the new first line
[PENDING] Edge certification of that resubmission   waits on: Microsoft
[BLOCKED] AMO description update   Reason: run 34710837315: "PATCH /addons/addon/save-media/ throttled (429), AMO asks for 51538 s: {"detail":"Request was throttled. Expected available in 51538 seconds."}"; rerun 2026-09-13 after 09:00 UTC together with B's previews
[PENDING] Edge logo, screenshots and tile   waits on: the owner in Partner Center with the native file picker (scripted uploads answer "Something went wrong"); copies lie where the dialog opens, /Users/ancplua/Developer/save-media/
[DONE]    AMO icon set from packages/extension/store-assets/logo/logo-300.png   Evidence: store-status run 34701212566 (amo-icon-apply): before "default-64.png (AMO default, none uploaded)", after user-media/addon_icons/3017/3017523-64.png; public API GET /addons/addon/save-media/ read back with the new icon_url
[DONE]    AMO listing screenshots set (there were none): 01/02/03 at 1280x800, positions 0-2   Evidence: store-status run 34701288123 (amo-previews-apply), public API previews ids 408167, 408168, 408169
[DONE]    Edge listing text, single purpose, storage justification, privacy URL corrected and submitted 2026-09-12
          Evidence: Partner Center "UPDATE 0.0.7 In review" (screenshot in session; not readable through the API)
[PENDING] Edge certification of that submission   waits on: Microsoft, 7 business days from 2026-09-12
[PENDING] Manual check of the local downloader permission prompt in Edge and Firefox   waits on: the owner, checklist docs/manual-check-local-downloader.md
[PENDING] Marquee promo tile 1400x560 for Chrome, no priority   waits on: nobody; a design in the style of the promo tile without repeating the arrow motif
[PENDING] Store screenshots for 1.0.0   waits on: the version bump; `bun run --filter @savemedia/extension screenshots` renders them from the real popup (icon and version come from the build; regenerated 2026-09-12 at 0.0.7, commit 0666123)
[PENDING] Upload of new screenshots to Chrome   waits on: the 0.0.7 review closing; goes into the 1.0.0 submission together with the package
[PENDING] Release 1.0.0 with the local downloader   waits on: both listing reviews closed, manual check reported, then version bump and tag
[DONE]    PR #19 squash-merged (a484005) and Dependabot #20 merged (a300874); main ci green on both   Evidence: runs 34712209822 and 34712336289, five jobs each
[DONE]    1.0.0 candidate on main (version 1.0.0 in manifest and package.json, commit d290cb4), zips and checklist placed for the owner: /Users/ancplua/Developer/save-media/savemedia-{chrome,edge,firefox}-1.0.0.zip and PRUEFLISTE-1.0.0.md   Evidence: tests core 138 / extension 254 / native host 38, zips 1175053 / 1175053 / 1169074 bytes, ci run 34712261874 green
[DONE]    Screenshot captions cleaned: 03 said "never bypassed" (commit 33370e7), 02 had an em dash (next commit); images regenerated at v1.0.0 with the Local downloader row, so they belong to the 1.0.0 submission only   Evidence: lint.textFiles on the harness (store-publish v1.5.0) is red on the old text and green now
[PENDING] Chrome and AMO still serve the 0.0.7 images with the old captions (Chrome: screenshot 3 removed by the coordinator, 1 and 2 kept; AMO: #408167-408169)   waits on: AMO delete of position 2 on 2026-09-13 after 09:00 UTC, then the 1.0.0 submission with amo-previews-replace
[DONE]    Owner overruled the em-dash deviation (coordinator session ended): Chrome review cancelled and resubmitted with three regenerated screenshots (0.0.7 footer, captions "refused" and comma instead of em dash), store icon and tile unchanged, description 926 chars, auto-publish on   Evidence: dashboard reload showed Screenshot 1-3 after Save draft; store-status run 34712923084 at 19:02 UTC: published 0.0.7 PUBLISHED, submitted 0.0.7 PENDING_REVIEW. Coordinator session is gone; AgentA drives Playwright again
[PENDING] AMO: the same three regenerated 0.0.7 images should replace #408167-408169 (amo-previews-replace, three writes) once the daily cap is free   waits on: 2026-09-13 after 09:00 UTC; the 1.0.0 images come with the 1.0.0 submission
[DONE]    Dependency upgrade PR #19 (Vite 8.3.0, Vitest 5.0.0, zod 4.6.2, TypeScript 7.0.2, Playwright 1.63.0, @types/chrome 0.2.9, @vitejs/plugin-react 6.1.1; branch claude/deps-2026-09)   waits on: the coordinator's merge decision. Evidence: ci run 34711862023 green on all five jobs; local e2e chromium 31 and firefox-fixtures 11 passed; typecheck 1.80 s -> 0.36 s; content scripts 5614/7189 bytes (oxc minifier, no zod inside); zips chrome/edge 1211746 -> 1174315, firefox 1204951 -> 1168406
[DONE]    Filenames: no more "_.mp4" (Unicode letters kept, fallback chain title -> URL segment -> host -> video) and "+" read as space in space-less titles   Evidence: commits 8647220 and 615a08f, ci runs 34711678332 and 34711867949 green; ships with 1.0.0
[DONE]    Dependabot weekly (bun + github-actions, groups minor-and-patch auto-merged after a green ci run, major manual), Renovate switched off   Evidence: save-media 21cc858, store-publish a35bd3f (auto-merge enabled on the repo); yt-transcript handed to AgentB with the file text
[DONE]    Native host: 38 unit/installer tests and the Playwright smoke   Evidence: ci run 34699789676 Unit job log "Ran 38 tests"; smoke output "native smoke: OK" 2026-09-12
[DONE]    Toolchain bun + Vitest + Playwright   Evidence: ci run 34699295231 green on all five jobs
[DONE]    Store icon derivation   Evidence: `magick compare -metric AE` of store-icon-128-chrome.png against icon-128.png flattened on #0e1b26 = 0 pixels; the store file is the same render without alpha (store-assets.mjs)
```

### yt-transcript

```
[DONE]    Chrome 3.2.1 switched from auto-publish to "Defer publish", review continues   Evidence: dialog "Defer publishing?" confirmed 18:28 UTC. Reason: the owner found two bugs in 3.2.1 in Edge 152 (toolbar click opens no panel on some watch pages; wrong language track on one talk), see ~/Desktop/yt-transcript-notfall-prompt.md. After the review: bugs only in Edge, publish 3.2.1 in Chrome by hand; bugs also in Chrome, upload 3.2.2 and discard the staged 3.2.1
[DONE]    Chrome 3.2.1 submitted: description without browser names, store icon, 5 UI screenshots, 440x280 tile, 1400x560 marquee, auto-publish   Evidence: status run 34701679765 (15:15 UTC) published 3.1.0, submitted 3.2.1 PENDING_REVIEW; release run 34701390181 (chrome update)
[DONE]    Firefox 3.2.1 submitted   Evidence: release run 34701391394
[DONE]    Edge package from 3.2.1 without tabCapture/offscreen (manifest.edge.json, own dist without offscreen/)   Evidence: yt-transcript f735749, ci run 34707926465; Microsoft policy 1.6 forbids unused permissions, the form warns "Requesting an unnecessary permission will result in this version being rejected"
[PENDING] Edge 3.2.1 publish: the owner replaces the hand-uploaded package in Partner Center with /Users/ancplua/Developer/yt-transcript/video-transcript-edge-3.2.1.zip, fills Properties (4 permissions), the Edge description and 7 images, clicks Publish   waits on: the owner
          Note, not an error: the Edge 3.2.1 zip additionally carries the track tie-break from 3ea0c76 that Chrome/Firefox 3.2.1 do not have; same version, one bugfix apart, identical again from 3.2.2
[DONE]    AMO previews positions 0-2 for Video Transcript with v1.4.3   Evidence: run 34704549670 kept #408195 (pos 0), uploaded #408196 (pos 1), #408197 (pos 2), all 1280x800; stopped cleanly at the daily cap ("Expected available in 59126 seconds")
[PENDING] AMO previews positions 3 and 4 for Video Transcript   waits on: 2026-09-13 09:00 UTC, one dispatch by AgentB
[PENDING] Playwright flake: rankTrack tie-break   waits on: AgentB, commit on main
[DONE]    v3.2.0 released to all three stores   Evidence: release run 34699894419 green (tag pushed 14:38:46 UTC after coordinator go-ahead; later confirmed "Tag jetzt")
[AMBIG]   3.2.0 Chrome review vs 3.2.1 with new images   Options: wait for 3.2.0 | cancel the review and submit 3.2.1   Decision (coordinator, 2026-09-12): cancel the Chrome review of 3.2.0; 3.2.1 goes to Chrome and Firefox today with the new images in one submission, Edge after its 3.2.0 certification
[PENDING] 3.2.0 Edge certification and Firefox review   waits on: the stores; store-status firefox, Partner Center for Edge
[PENDING] Edge listing text is still the 1.x copy ("captured automatically"); repo text in store/listing.md   waits on: Edge certification of 3.2.0 and a session with a Microsoft login
[DONE]    Vitest port of the node:test suite   Evidence: PR #62 merged, ci run 34700226558 green on main (reported by AgentB)
[PENDING] 3.2.1 public text cleanup (em dashes, "Free.", browser names out of manifest descriptions and UI strings; on main)   waits on: Chrome, Edge and Firefox 3.2.0 reviews before it is released
[PENDING] Store images redo (five real 1280x800 panel screenshots, 440x280 tile, 1400x560 marquee, no arrow, no browser name)   waits on: branch and PR by AgentB; upload after the 3.2.0 reviews
[DONE]    Chrome store icon replaced in the dashboard draft (store/images/icon-128x128.png, "Item saved." 14:58 UTC, not submitted)   Evidence: coordinator session, dashboard message
[PENDING] listing.md brand names ("Chrome's built-in on-device AI", "Firefox's sidebar")   waits on: AgentB; `store-publish lint` v1.4.0 reports them with the default lint.brands list
[PENDING] manifest.json and manifest.firefox.json description carry an em dash   waits on: AgentB; `store-publish lint` v1.3.0 with "manifests" in store.config.json reports both (verified 2026-09-12 against main through a scratch config)
[DONE]    store-publish v1.1.0 adopted, versionFiles check   Evidence: AgentB commit 18ad3bc, edge status dispatch green (reported by AgentB)
```

### store-publish

```
[DONE]    docs/PUBLISHING.md: six targets, API access per store, 22 verified links   Evidence: commit 8894731
[DONE]    v1.3.0: lint covers dashes, emoji, manifest name/description, store images (presence, PNG size, duplicates)   Evidence: node --test 17 pass; save-media lint green with manifests and 6 images; yt-transcript manifests red as expected
[DONE]    v1.6.0 (AgentB): status rows carry the dashboard item URL and the AMO preview ids; lint checks browser_specific_settings.gecko.id against stores.firefox.id and, with lint.packageScript, that the package script produces <zipPrefix>-<kind>-<version>.zip names   Evidence: commit 1982751, tag v1.6.0, ci run 34713192052 27/27; save-media pinned with packageScript, yt-transcript pinned (5e73fd5)
[DONE]    v1.5.0: lint.textFiles (prose literals of source files, e.g. screenshot harness captions), `firefox previews delete <position|#id>`   Evidence: commit 5f84140, node --test 24 pass; save-media pinned (23ea54b), yt-transcript's screenshot sources green through a scratch config
[DONE]    v1.4.3: every AMO call retries on 429 after the wait AMO names (Retry-After fallback, N+2 s, 30 min ceiling, 6 retries); `firefox previews set` idempotent by position and pixel size, upload before delete, `--replace`   Evidence: node --test 23 pass; yt-transcript run 34704549670 (issue #2 closed)
[DONE]    v1.4.0/v1.4.1: lint.brands (default Chrome, Firefox, Edge, YouTube, Vimeo, Google, Microsoft, Mozilla), `firefox icon [PATH] [--diff]`, `firefox previews list|set`, config stores.firefox.icon/previews, .playwright-mcp untracked   Evidence: node --test 20 pass; save-media lint green after moving an editorial note out of a public section; yt-transcript listing.md reports "Chrome" and "Firefox" (lines 46, 48) through a scratch config
[DONE]    yt-transcript pinned at v1.4.1, interim scripts dropped, store-status.yml runs firefox icon/previews, lint.brands green   Evidence: reported by AgentB 2026-09-12; v1.4.2 (cache buster only) still to pin
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
