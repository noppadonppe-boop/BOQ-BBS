# Independent cold import — app v0.95.0 / 2026-10-14

The latest private local demo capture from storage-runtime recovery was imported into a separate Auth11321/Firestore8851/Storage9532 environment. Original Auth10121/Firestore8751/Storage9531 remains available. Both use unchanged owner-managed Rules and the pinned QA-only Storage line-framing adapter. Imported blobs use a separate workspace directory; no shared temporary blob cleanup occurs. No Production access or deployment.

Compare a complete paginated Firestore inventory from both environments, traversing subcollections beneath missing parent documents.238stored document fields and the1missing-parent path match exactly by canonical digest. Create/update metadata are excluded; field values containing timestamps are retained. [Firebase collection inventory API](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/listCollectionIds).

The1captured QA Auth account retains its UID/email/password hash/salt/providers/custom claims. Import normalizes an absent disabled flag tofalse, which is the same security state. Last-login timestamps change when testing login and are excluded. Login with the existing privately stored QA password succeeds; profile and project ACL fields match in the full Firestore comparison. Raw account/hash/token values remain private under tmp.

All34registered objects are read under the signed account with exact SHA256, plus16simultaneous source/Frozen reads. SDK metadata digests from both live environments match for all34objects, including timeCreated/updated/generations/custom metadata. This proves the latest post-recovery capture preserves these metadata; it does not recreate metadata or unknown accounts lost in the earlier incident.

The actual imported app opens the stored exact-Mark point on source page2 and fits mobile. Frozen bytes/data and member bar/quantity/occurrence/geometry/source-schedule fields match their original fixtures. A rejected attempt to overwrite immutable source bytes does not change the source hash. QA points remain synthetic, not GULF reinforcement positions or engineering acceptance.

Tooling: `tools/qa/cold-restore-preload.cjs` enables only the local line-framed runtime and isolated Storage folder. Private launcher/config/capture pointer are under `tmp/cold-restore-qa`. `tools/qa/firestore-inventory.mjs` reads only ports8751/8851 in the known demo project with pagination/absent-parent traversal and a20000-path guard. Browser tests are `tests/cold-restore-app.mjs`, `tests/cold-restore-auth.mjs`, `tests/cold-restore-storage-metadata.mjs`. Current application behavior/version is unchanged; the existing1618unit cases/116files and TypeScript evidence retain their prior scope.

Cold QA services remain available for follow-up; process inventory is restricted, so no unrelated process was stopped to clean them up. Original live services/data, nine protected config/Auth files and seven GULF reference PDFs remain unchanged. This is a local restored-state proof, not Production disaster recovery, all-user acceptance or construction release. All12original requirements and outstanding real GULF/material/BSACI/owner/native-print/Issued/Consumed/Production acceptance remain active.

[Evidence report](../output/cold-restore-verification/DEVELOPMENT_REPORT.html) · [Original12requirements](REQUIREMENTS_MATRIX.md)
