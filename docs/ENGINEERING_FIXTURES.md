# Numerical engineering verification cases — v0.58

v0.58 adds [read-only numerical comparison of portable preparation files](ENGINEERING_PREVIEW.md), with actual permitted source-byte verification and missing/unentered/stale states. This does not enable stored cases/runs or approve engineering.938 unit cases/60 files and17 actual local SDK/compiled/development-UI paths pass; the database contract below remains unchanged.

v0.57 adds [portable preparation JSON files](ENGINEERING_DRAFT_FILES.md): retain incomplete manually entered expectations, open a read-only preview and explicitly continue only against matching current project/member/Spec/source metadata. Viewer reading, stale-file refusal, live role removal and account-switch clearing are verified in19 actual local paths, alongside916 unit cases/58 files. This does not enable persistence, run comparisons, approve engineering or change Rules. The stored-case contract below is unchanged; its original v0.40 scope remains separately documented.

This prepares independently entered BOQ/BBS reference cases for engineer review. It does **not** approve a BS/ACI policy, approve a project specification, unlock Issued, or authorize construction. No calculation-engine policy or standard equation changes in this release.

The project sidebar has **กรณีตรวจคำนวณ**. An admin/QS can prepare a case from a saved member. Enter the document/page, reference author/scope, total BOQ values, each Mark's cut length, total piece count and total mass. Expected values start blank and are never filled from the calculation being tested. Comparison bounds start at zero and are user-defined numerical bounds, not BS fabrication tolerances. Piece counts always compare exactly; floating-point arithmetic allows only machine-level noise.

A case pins the member version, complete member input, complete numerical specification, engine ID, source SHA256/page and independently entered expectations. A remote member edit leaves the open form intact and requires an explicit reload; a changed Spec/source is rejected at save. Stored cases and runs are append-only in the client transaction protocol. Create a new case to revise an expectation. Positive cases require complete expectations and every actual BBS bar; negative cases must explicitly cover all diagnostics, including any additional error detected by the engine.

A run reads and hashes the actual referenced bytes and checks the actual document page count. It compares the **captured** member, so a later member edit does not rewrite an old case. The current numerical Spec and engine must still match; missing/changed/unreadable references make the result pending. Nonfinite or missing numbers remain unavailable, never substituted with zero. Up to20 unique cases,120MiB of distinct reference files and700KB per stored case/run are bounded software limits. Split larger sets.

The read-only case view shows saved expectations and allows full captured-input JSON download. Saved runs provide JSON and an Excel report with cases, expected/actual/live delta values and the captured input/source snapshot. Case decisions in Excel are explicitly captured; editing a cell updates numerical delta formulas but cannot reapprove the recorded result. Long JSON snapshots are split into numbered1000-character parts. These are diagnostic reports, not owner-controlled BBS issue drawings. Diagnostic PDF is not added in this release.

## Availability and the user's Rules ownership

`VITE_ENABLE_ENGINEERING_FIXTURES` defaults to false. The form can be opened for preparation and incomplete work retained in a portable file, but new collection queries, creation and execution are closed. Existing BOQ/BBS, Backup and Restore keep their current paths. The actual `.env`, Firestore Rules, Storage Rules and Firebase deployment configuration are untouched. **The user configures and deploys Rules themselves.** This document is a data/access contract, not a replacement Rules file or a request for deployment permission.

After the database owner has configured and verified access, they can explicitly set the flag to true in their chosen environment and rebuild. A flag is not a security boundary. A Firebase API key and client checks do not establish authorization or prove engineering acceptance. There is no Cloud Function or new backend service in this feature.

Required paths and transaction behavior for the database owner:

| Path | Reads | Creation and immutability |
|---|---|---|
| `projects/{pid}/engineeringFixtures/{id}` | Approved users assigned to that project, including viewer | Admin/QS only; matching document ID and creator UID; immutable thereafter. Captured member/spec/source and `contentDigest`; strictly typed expectations and bounded arrays. |
| `projects/{pid}/engineeringFixtureRuns/{id}` | Same project scope | Admin/QS/checker/approver only; matching document ID/creator; immutable thereafter; up to20 results; `engineeringApproved` must remain false. `pass` is only a captured numerical comparison. |
| `projects/{pid}` | Existing project scope | Both commands update `historyEpoch` and the persistent `engineeringFixtureEpoch` marker without changing quantity/version/spec/ACL. Permit only the relevant roles/fields in the same normal, unlocked project. |
| `projects/{pid}/operations/{requestId}` | Existing project scope | Existing immutable operation/replay protocol: caller UID/action/input hash/result. Role, assignment and profile approval must apply independently of the UI. |
| Referenced Storage objects | Existing project-file access | Read/hash only during run; no new storage paths are needed for diagnostic Excel/JSON downloads. |

Keep foreign project reads/writes, anonymous/pending/rejected accounts, viewer writes, updates/deletes of cases/runs and forged approval fields denied. Test these against the owner's actual Rules before enabling. Hashes bind content identity, **not** the engineering validity or identity of an independent approving engineer. Firestore Rules cannot recompute the calculation or establish independent expected values; no approval claim relies on client-stored `pass`.

When enabled, Backup includes the two immutable collections in its checked history index. Restore retains them as **reference-only imported history**, with JSON download; it does not import active cases, runs, grants or engineering approval. Enabled restore checks the target's two new collections as well as its existing working collections. If availability is disabled again on a project with `engineeringFixtureEpoch`, Backup/Restore is refused rather than silently omitting its fixture history.

## Verified scope

The tests distinguish three boundaries: pure numerical tests; real command/export code against an explicitly mocked SDK document/transaction contract; and actual authenticated SDK/UI plus genuine existing Backup/Restore against the unchanged local Firebase Rules. Existing Rules currently deny the new collection reads. Successful new Firebase case/run persistence, production permission enforcement, engineer approval, native Excel printing and Issued are **not** claimed. See the [v0.40 evidence report](../output/engineering-fixture-verification/DEVELOPMENT_REPORT.html).
