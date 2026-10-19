# Release-review context — v0.99

The release-review panel now has a separate lifetime for each project ID, project version, signed-in UID, revision ID, revision digest and engine version. Changing any of these clears the displayed report, search, note, errors and busy state. Completion of an older inspection or historical-file read cannot populate the new panel. Concurrent actions within one panel are held until the current action finishes.

A report is current only when its project ID/version and revision ID/digest/engine all match the selected records. Historical reports remain labelled historical and cannot authorize Issued. The server-facing issue command and owner-managed Rules remain unchanged: a UI current result is not permission or engineering approval.

Actual local QA uses a synthetic Custom member, original B101 PDF bytes as an unreviewed reference, and two Frozen revisions. The test holds a real old snapshot GET, switches the revision, completes a fresh inspection, and then releases the old request. An observer of the real command completion confirms that the old command finished; no old report appears in the newly selected scope. This observer changes neither command arguments/results nor engineering data. Busy save is disabled; both Frozen records stay byte-for-byte equivalent as records, and the project spec remains unapproved.

A blocked preflight was actually saved through prepareIssue and read back with checksum validation. The compiled app reopens that historical report, downloads current preflight JSON matching the selected project/revision and all expected checks, and resets the displayed report/search when selecting another revision. Desktop/mobile checks pass. No Issued, Consumed, construction acceptance, real GULF geometry/Mark positions or engineer approval is claimed.

1664 unit cases in 120 files, TypeScript and an explicitly isolated local build pass. During QA setup, an initial build lacked emulator overrides; the browser network guard blocked its external login attempt. It was replaced by the explicit demo build without changing .env. Final passing dev/compiled runs have no external requests. Vite-query/name transformation and a scoped Playwright history selector were corrected in the test observer; source calculations and Rules were unchanged.

Protected nine files, original seven GULF PDFs and supplied BS reference remain unchanged. No Rules/.env/Auth/Firebase config edits or deployment, Cloud Functions or production traffic. All original twelve requirements and outstanding engineering/owner/Production acceptance remain active.

[Evidence](../output/release-scope-verification/DEVELOPMENT_REPORT.html)
