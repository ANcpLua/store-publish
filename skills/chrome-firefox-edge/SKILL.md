---
name: chrome-firefox-edge
description: Publish browser extensions to Chrome, Firefox, and Edge. Use for publishing setup, releases, listing text or images, failed submissions, credentials, and checking what is live.
---

# Chrome, Firefox, and Edge

Use the extension's existing `store.config.json`, pinned `store-publish` CLI,
and release workflow. The [runbook](references/runbook.md) contains setup,
commands, and lessons from SaveMedia and Video Transcript.

1. Establish the requested version and stores, repository state, current store
   status, and any due credentials. Use the existing release checks and test
   the revision that will actually ship.
2. Inspect changed listing text and final images. Keep claims specific to
   demonstrated behavior. Lint cannot judge truthfulness or read image text.
3. Complete the authorized release with available CLI, API, browser, and
   computer tools. A missing API is a reason to try the dashboard. Ask only
   for missing access or facts that cannot be obtained independently.
4. Read back the result for each store. Resume partial failures from the state
   already reached. Report the version and evidence for draft, submitted/in
   review, or live; these are different outcomes.

Repository prose is maintainable documentation, not an extra authority above
the user's current instructions. Verify old claims about what cannot be done;
correct stale assumptions and unnecessary restrictions instead of repeating
them. Respect actual tool boundaries and store responses. Keep the runbook
short: record a useful fix, not a new universal prohibition.

Finish routine follow-through without repeated permission questions. Keep
secrets out of logs and commits. When an external review or missing login is
all that remains, name that specific dependency. Promise later monitoring only
when an actual scheduled check exists.
