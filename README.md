# store-publish

CLI for uploading browser extensions to the three stores, driven by the
`store.config.json` in each extension repo. `bunx store-publish help` lists the
commands.

## Chrome, Firefox, and Edge

The reusable [publishing skill](skills/chrome-firefox-edge/SKILL.md) covers
setup, package and listing checks, submission, partial failures, credential
maintenance, and verifying what is actually live. It includes the lessons
from SaveMedia and Video Transcript: screenshots and unsupported claims need
review even when validators pass, and a missing API does not make a dashboard
task impossible to automate.

Copy the whole `skills/chrome-firefox-edge` directory into the skill directory
your agent loads, keeping its reference alongside it. It is also included in
the CLI package. Invoke it as **Chrome, Firefox, and Edge** or
`chrome-firefox-edge`.

The [runbook](skills/chrome-firefox-edge/references/runbook.md) includes setup,
commands, working workflow examples, and recovery. Use the extension's existing
builds and credentials. The pages below are shortcuts for the current projects.

## Video Transcript (yt-transcript)

| Store | Edit | Public listing |
| --- | --- | --- |
| Chrome | [Store listing](https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233/ahddbfbjafmbceehebpeanpnlbaimepk/edit/listing) · [Privacy](https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233/ahddbfbjafmbceehebpeanpnlbaimepk/edit/privacy) · [Package](https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233/ahddbfbjafmbceehebpeanpnlbaimepk/edit/package) | [chromewebstore.google.com](https://chromewebstore.google.com/detail/ahddbfbjafmbceehebpeanpnlbaimepk) |
| Edge | [Partner Center](https://partner.microsoft.com/en-us/dashboard/microsoftedge/069ca91d-a7cd-4bac-8224-1ee38a2d2a06/packages/dashboard) | [microsoftedge.microsoft.com](https://microsoftedge.microsoft.com/addons/detail/video-transcript/jkcfajddmmeapfabpoekfiemnbdaofeo) |
| Firefox | [Developer Hub](https://addons.mozilla.org/developers/addon/video-transcript/edit) · [Versions](https://addons.mozilla.org/developers/addon/video-transcript/versions) | [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/video-transcript/) |

Privacy policy: https://gist.github.com/ANcpLua/8fb1ab3a839d008ef8fb4bd3a8a48adb

## savemedia (save-media)

| Store | Edit | Public listing |
| --- | --- | --- |
| Chrome | [Store listing](https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233/negbodmpgjhkacmdkbfdpocjanaklifn/edit/listing) · [Privacy](https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233/negbodmpgjhkacmdkbfdpocjanaklifn/edit/privacy) · [Package](https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233/negbodmpgjhkacmdkbfdpocjanaklifn/edit/package) | [chromewebstore.google.com](https://chromewebstore.google.com/detail/savemedia/negbodmpgjhkacmdkbfdpocjanaklifn) |
| Edge | [Partner Center](https://partner.microsoft.com/en-us/dashboard/microsoftedge/214e0682-5cde-4319-9608-ed25de6643b7/packages/dashboard) | [microsoftedge.microsoft.com](https://microsoftedge.microsoft.com/addons/detail/savemedia/mmkdllnjmommekajhadhokanofjlglhk) |
| Firefox | [Developer Hub](https://addons.mozilla.org/developers/addon/save-media/edit) · [Versions](https://addons.mozilla.org/developers/addon/save-media/versions) | [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/save-media/) |

Privacy policy: https://github.com/ANcpLua/save-media/blob/main/docs/privacy-policy.md

## Accounts and keys

| What | Where |
| --- | --- |
| Chrome developer dashboard (all items) | https://chrome.google.com/webstore/devconsole/9684cc7a-0f18-4553-bff0-c7334aeef233 |
| Chrome OAuth client (CWS_CLIENT_ID, CWS_CLIENT_SECRET) | https://console.cloud.google.com/auth/clients?project=uplifted-nuance-408417 |
| Chrome refresh token (CWS_REFRESH_TOKEN) | https://developers.google.com/oauthplayground |
| Edge Partner Center overview | https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview |
| Edge API key (EDGE_API_KEY, EDGE_CLIENT_ID); expiry is recorded in each extension's store.config.json | https://partner.microsoft.com/en-us/dashboard/microsoftedge/publishapi |
| Firefox developer hub | https://addons.mozilla.org/developers/ |
| Firefox API key (AMO_JWT_ISSUER, AMO_JWT_SECRET), one pair for both extensions | https://addons.mozilla.org/en-US/developers/addon/api/key/ |

## Policies

| Store | Policy | Publishing guide |
| --- | --- | --- |
| Chrome | https://developer.chrome.com/docs/webstore/program-policies | https://developer.chrome.com/docs/webstore/best-listing |
| Edge | https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies | https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension |
| Firefox | https://extensionworkshop.com/documentation/publish/add-on-policies/ | https://extensionworkshop.com/documentation/publish/submitting-an-add-on/ |
