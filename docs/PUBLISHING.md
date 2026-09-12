# Publishing

Everything needed to publish the two extensions to the three stores, in one
place. Values come from each repository's `store.config.json` and README;
secrets are named, never shown. State as of 2026-09-12.

## 1. Targets

| Extension | Store | Public listing | Dashboard (item) | Item / product id | Secrets (GitHub Actions) | Readable value lives in | Expires | Status command | Release command |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| savemedia | Chrome Web Store | https://chromewebstore.google.com/detail/savemedia/negbodmpgjhkacmdkbfdpocjanaklifn | https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233/negbodmpgjhkacmdkbfdpocjanaklifn/edit/listing | negbodmpgjhkacmdkbfdpocjanaklifn | CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_PUBLISHER_ID | keys.json entries "Chrome Web Store OAuth client" (~/.config/vitals/cws-client.json) and "Chrome Web Store refresh token" (~/.config/vitals/cws-refresh-token.txt); publisher id is in the dashboard URL | refresh token: none (consent screen in production) | `gh workflow run store-status.yml -R ANcpLua/save-media --ref main -f store=chrome` | `gh workflow run release.yml -R ANcpLua/save-media --ref main -f stores=chrome` (tag push `vX.Y.Z` = all stores) |
| savemedia | Microsoft Edge Add-ons | https://microsoftedge.microsoft.com/addons/detail/savemedia/mmkdllnjmommekajhadhokanofjlglhk | https://partner.microsoft.com/en-us/dashboard/microsoftedge/214e0682-5cde-4319-9608-ed25de6643b7/packages/dashboard | product 214e0682-5cde-4319-9608-ed25de6643b7, CRX mmkdllnjmommekajhadhokanofjlglhk, store id 0RDCKCQ8JLR8 | EDGE_API_KEY, EDGE_CLIENT_ID | keys.json entry "Browser store credentials" (~/.config/vitals/store-secrets.env, pushed by set-store-secrets.sh) | API key 2026-11-21 | `... -f store=edge` (credential probe, days left) | `... -f stores=edge` |
| savemedia | Firefox Add-ons (AMO) | https://addons.mozilla.org/firefox/addon/save-media/ | https://addons.mozilla.org/developers/addon/save-media/edit | savemedia@ancplua.dev, slug save-media | AMO_JWT_ISSUER, AMO_JWT_SECRET | keys.json entry "AMO API": macOS Keychain item `AMO API (addons.mozilla.org)`, issuer in the account field | none | `... -f store=firefox`; listing: `amo-listing-diff`, `amo-icon-diff`, `amo-previews-list` | `... -f stores=firefox`; listing: `amo-listing-apply`, `amo-icon-apply`, `amo-previews-apply` |
| Video Transcript | Chrome Web Store | https://chromewebstore.google.com/detail/ahddbfbjafmbceehebpeanpnlbaimepk | https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233/ahddbfbjafmbceehebpeanpnlbaimepk/edit/listing | ahddbfbjafmbceehebpeanpnlbaimepk | same four CWS_* secrets (same Google account and OAuth client) | same as above | none | `gh workflow run store-status.yml -R ANcpLua/yt-transcript --ref main -f store=chrome` | `gh workflow run release.yml -R ANcpLua/yt-transcript --ref main -f stores=chrome -f chrome=release` (`chrome=update` uploads without publishing) |
| Video Transcript | Microsoft Edge Add-ons | https://microsoftedge.microsoft.com/addons/detail/video-transcript/jkcfajddmmeapfabpoekfiemnbdaofeo | https://partner.microsoft.com/en-us/dashboard/microsoftedge/069ca91d-a7cd-4bac-8224-1ee38a2d2a06/packages/dashboard | product 069ca91d-a7cd-4bac-8224-1ee38a2d2a06, CRX jkcfajddmmeapfabpoekfiemnbdaofeo | EDGE_API_KEY, EDGE_CLIENT_ID (same Partner Center account) | same as above | API key 2026-11-21 | `... -f store=edge` | `... -f stores=edge` (ships the manifest.edge.json build) |
| Video Transcript | Firefox Add-ons (AMO) | https://addons.mozilla.org/firefox/addon/video-transcript/ | https://addons.mozilla.org/developers/addon/video-transcript/edit | video-transcript@qyl.at, slug video-transcript | AMO_JWT_ISSUER, AMO_JWT_SECRET (one pair per Mozilla account, shared) | same Keychain item | none | `... -f store=firefox`; listing options as for savemedia | `... -f stores=firefox`; listing options as for savemedia |

Both repositories pin this CLI (`@ancplua/store-publish`, a git tag) and keep
their ids in `store.config.json`; the README store table is generated from it
(`store-publish readme --write`, checked in CI). The ten GitHub secrets are
identical in both repositories except that `CWS_ITEM_ID` and `EDGE_PRODUCT_ID`
are gone from save-media (ids live in the config).

## 2. Getting API access, per store

### Chrome Web Store (API v2)

| Step | Where | Notes |
| --- | --- | --- |
| 1. Developer account, item created and listed once by hand | https://chrome.google.com/webstore/devconsole | The API cannot create the listing text, privacy answers or images; first publish is manual |
| 2. Google Cloud project, enable "Chrome Web Store API" | https://console.cloud.google.com/apis/library | Project used here: `server` (uplifted-nuance-408417) |
| 3. OAuth consent screen set to "In production" | https://console.cloud.google.com/auth/audience?project=uplifted-nuance-408417 | In "Testing" the refresh token dies after 7 days |
| 4. OAuth client, type Desktop | https://console.cloud.google.com/auth/clients?project=uplifted-nuance-408417 | Client here: "Desktop client 2" = CWS_CLIENT_ID + CWS_CLIENT_SECRET |
| 5. Refresh token with scope `https://www.googleapis.com/auth/chromewebstore` | https://developers.google.com/oauthplayground (use your own client in the settings gear) | Store as CWS_REFRESH_TOKEN; `invalid_grant` later means mint a new one with the same client |
| 6. Publisher id | dashboard, Publisher, Settings, or the dashboard URL after `/devconsole/` | CWS_PUBLISHER_ID |
| 7. Set the four secrets in every extension repo | `gh secret set NAME -R ANcpLua/<repo>` fed from a file, never from the clipboard | Verify with `store-status.yml store=chrome`: `fetchStatus` returns the published and submitted revision |

Traps: the item cannot be uploaded to while a review is pending ("You may not edit or publish an item that is in review"), but a review can be cancelled in the dashboard menu. A listing-only submission (text, images) goes through review like a package. Comma runs of format names are rejected as keyword spam ("Yellow Argon"). Store icon and screenshots are dashboard fields; a new package does not replace them. API v1.1 is switched off on 2026-10-15; the CLI uses v2.

### Microsoft Edge Add-ons (Update REST API v1.1)

| Step | Where | Notes |
| --- | --- | --- |
| 1. Partner Center account, extension created and published once by hand | https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview | The API only updates an existing product |
| 2. Enable the Publish API, create credentials | https://partner.microsoft.com/en-us/dashboard/microsoftedge/publishapi | Client id = EDGE_CLIENT_ID (36 chars), API key = EDGE_API_KEY (40 chars); the key has an expiry date, write it into `stores.edge.expires` |
| 3. Product id | Extension overview page, "Product ID" | 36-char GUID, not the CRX id in the store URL; both go into `store.config.json` |
| 4. Set the two secrets in every repo | `~/.config/vitals/set-store-secrets.sh` writes both repos from `store-secrets.env` | Verify with `store-status.yml store=edge`: 404 on a fake operation id means accepted, 401 means rejected; the output prints value lengths and days until expiry |

Traps: the API has no read endpoint, so the review state is only visible in Partner Center, which renders only in a foreground tab. Listing text, logo (300x300), tile (440x280) and screenshots are dashboard-only; the file field rejects scripted uploads ("Something went wrong"), a person has to use the native file picker. Partner Center refuses edits while a submission is "In review"; cancel the submission first. Policy 1.6 rejects unused permissions declared in the manifest (Video Transcript ships a separate `manifest.edge.json`). A pasted key of the wrong length (112 instead of 40 characters) cost an hour once: check `${#EDGE_API_KEY}` before writing.

### Firefox Add-ons, AMO (API v5)

| Step | Where | Notes |
| --- | --- | --- |
| 1. Mozilla account, add-on submitted once (web-ext sign or the developer hub) | https://addons.mozilla.org/developers/ | The add-on id is `browser_specific_settings.gecko.id` in the manifest |
| 2. API key pair | https://addons.mozilla.org/en-US/developers/addon/api/key/ | JWT issuer = AMO_JWT_ISSUER (`user:NNN:NNN`), JWT secret = AMO_JWT_SECRET. ONE pair per account: generating a new one invalidates the old one for every repository at once. Never regenerate to fix a 401; the stored value is what is broken |
| 3. Set the two secrets in both repos in the same minute | `set-store-secrets.sh` | Verify with `store-status.yml store=firefox`: lists versions with review status |
| 4. Listing text, icon and screenshots | `store-publish amo-listing apply`, `firefox icon`, `firefox previews set` from the repo | The text is written under the add-on's own default locale (`de` for both, although the text is English); a hardcoded locale creates a second translation and leaves the served one untouched |

Traps: AMO caches API reads for six minutes (the CLI adds a cache buster). Image and metadata writes are throttled per account, both extensions share the account: bursts of seconds to minutes, then a daily cap ("Expected available in 51538 seconds"); plan one apply run per extension per day. The listing icon is an add-on field, the manifest icon is never used; an add-on shows AMO's default icon until one is uploaded. A source zip must accompany bundled builds (`--source`).

### Shared

| What | Where |
| --- | --- |
| Register of every secret location | `~/.config/vitals/keys.json` (kind: keychain, file, environment, reference) |
| Script that writes Edge and AMO values into both repos | `~/.config/vitals/set-store-secrets.sh`, input `~/.config/vitals/store-secrets.env` |
| Presence check without values | `gh api repos/ANcpLua/<repo>/actions/secrets --jq '.secrets[].name'`; `security find-generic-password -s "AMO API (addons.mozilla.org)"` without `-w` |
| Text rules enforced by `store-publish lint` | no "bypass", "unlock", "circumvent"; no brand names; no em or en dashes; no emoji; no comma chains of five short items; store images present, right size, no byte-identical pairs |

## 3. Current guides and policies

Verified links with HTTP status and the date the page shows. See the table
below; regenerate it when a link dies (`curl -sIL <url>` must end in 200).

<!-- links:start -->
| Topic | Title | URL | HTTP | Date shown on the page |
| --- | --- | --- | --- | --- |
| Chrome Web Store program policies | Chrome Web Store, Program Policies | https://developer.chrome.com/docs/webstore/program-policies | 200 | no date on the page |
| Chrome Web Store review process | Chrome Web Store review process | https://developer.chrome.com/docs/webstore/review-process | 200 | Last updated 2021-12-10 |
| Chrome listing requirements | Creating a great listing page | https://developer.chrome.com/docs/webstore/best-listing | 200 | Last updated 2024-08-02 |
| Chrome listing images | Supplying Images | https://developer.chrome.com/docs/webstore/images | 200 | Last updated 2018-06-11 |
| Chrome keyword spam | Spam and Abuse (Program Policies) | https://developer.chrome.com/docs/webstore/program-policies/spam-and-abuse | 200 | Last updated 2022-11-01 |
| Manifest V3 migration | Migrate to Manifest V3 | https://developer.chrome.com/docs/extensions/develop/migrate | 200 | Last updated 2024-02-14 |
| Chrome permissions best practice | Declare permissions | https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions | 200 | Last updated 2024-02-05 |
| Chrome Web Store API, usage | Use the Chrome Web Store API | https://developer.chrome.com/docs/webstore/using-api | 200 | Last updated 2026-09-04 |
| Chrome Web Store API, reference | API Reference | https://developer.chrome.com/docs/webstore/api | 200 | Last updated 2025-10-13 |
| Edge Add-ons policies (1.6 Permissions is in this page) | Developer policies for the Microsoft Edge Add-ons website | https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies | 200 | ms.date 2026-07-24 |
| Edge publish guide | Publish a Microsoft Edge extension | https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension | 200 | ms.date 2026-05-05 |
| Edge Update REST API | Use the REST API to update an extension | https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api | 200 | ms.date 2024-09-19 |
| AMO add-on policies (review process is part of this page) | Add-on Policies | https://extensionworkshop.com/documentation/publish/add-on-policies/ | 200 | Apr 30, 2026 |
| AMO policies FAQ | Add-on Policies FAQ | https://extensionworkshop.com/documentation/publish/add-on-policies-faq/ | 200 | Aug 04, 2025 |
| AMO submission guide | Submitting an add-on | https://extensionworkshop.com/documentation/publish/submitting-an-add-on/ | 200 | May 10, 2026 |
| AMO API | Add-ons, addons-server documentation | https://mozilla.github.io/addons-server/topics/api/addons.html | 200 | no date on the page |
| AMO listing images | Create an appealing listing | https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/ | 200 | Mar 18, 2019 |
| MDN browser extensions | Browser extensions | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions | 200 | Jul 17, 2025 |
| MDN API support matrix | Browser support for JavaScript APIs | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_support_for_JavaScript_APIs | 200 | Jul 17, 2025 |
| MDN cross-browser guide | Build a cross-browser extension | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Build_a_cross_browser_extension | 200 | Aug 25, 2026 |
| WebExtensions Community Group, repository | w3c/webextensions | https://github.com/w3c/webextensions | 200 | no date on the page |
| WebExtensions Community Group, W3C page | WebExtensions Community Group | https://www.w3.org/community/webextensions/ | 200 | no date on the page |

Checked 2026-09-12 with `curl -sIL`, every URL answered 200 without a redirect.
There is no standalone AMO review-process page (the obvious URLs are 404);
review rules live inside the Add-on Policies page. Several live pages are old:
Chrome review process (2021), Chrome images (2018), AMO listing images (2019),
Edge REST API (2024). Treat their content as current only where the dashboards
still match.
<!-- links:end -->
