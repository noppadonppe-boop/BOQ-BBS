# v0.39 — source BBS table comparison (local development)

Member now supports an optional manually transcribed source table, linked to the real attachment SHA256/page and explicitly mapped stable bar IDs. It compares Mark, diameter, grade, declared quantity basis and calculated cut length; missing/renamed/unmapped rows remain visible. Optional weights and printed totals stay separate, with no invented acceptance tolerance. Editing resets Draft and both confirmations. When a table is present, core mismatches block Checked alongside the existing source/geometry/placement checks. Reference rows never add BOQ/cutting demand or reconstruct bar paths. See [guide](SOURCE_BBS_COMPARISON.md) and [report](../output/source-schedule-verification/DEVELOPMENT_REPORT.html).

548 unit tests and24 scoped local workflow checks pass, with7 genuine app XLSX files,9 PDF files/59 rendered pages, a genuine Backup/Restore, dev/compiled viewer and save/reload tests. Excel numerical comparison formulas recalculate; captured status is explicitly separate. The new portable exports use true blank cells and expand long-note rows. The original GULF PDF has3 manually transcribed reference rows and zero reconstructed app bars; it remains Unmapped, not an accepted real BBS. Frozen references and previous export bytes are retained. A final isolated local checkpoint returns HTTP200/OK with Storage byte verification, without a cold reimport or full Firestore/production recovery claim.

Full original acceptance remains incomplete: approved BS/ACI engineering cases and physical closure33/51, real source reinforcement/owner BBS, unsupported assemblies, native Excel printing and production still require verification. Numerical policy geometry-2.2+bs8666-2000-v7 and the supplied BS2000 startup minimum are unchanged. User-owned Rules/.env/Auth configuration is preserved; no Rules/Hosting deployment or Cloud Functions. Production compatibility with the user's independently maintained Rules is not certified. Earlier entries below are retained development history.

# v0.38 — inspect Backup before restoring (local development)

Selecting a ZIP now verifies supported member/spec structure, identities, source chains, complete history and actual file bytes before any upload. A read-only preview shows source/target, members, occurrences, Mark, measured samples, drawings and history; Restore starts only from an explicit button for an admin and an empty, writable target. Target state and document budgets are rechecked before transfer and at the direct command. Target general metadata and ACL are retained; spec/frame return for review, Working members reset to Draft, confirmations/reviews clear, stock reservations reset and unconsumed cut plans cancel. Frozen data/files remain imported reference history. See [guide](BACKUP_INSPECTION.md) and [current report](../output/restore-preflight-verification/DEVELOPMENT_REPORT.html).

532 unit tests and34 scoped local workflow checks pass, including dev/compiled UI,6 members/35 measured samples, all7 previous actual Excel/PDF byte hashes and an original GULF reference-only PDF. A final isolated local Emulator export returns HTTP200/OK and its Storage bytes are verified; cold reimport, whole-Firestore parity and production recovery are not certified. ZIP parsing uses browser memory and transfer failures may leave staged Storage objects. Schema1 compatibility is unit-tested, not acceptance of every historical archive.

Full original acceptance remains incomplete: approved engineering/physical closure33/51, actual GULF reinforcement and owner BBS, unsupported assemblies, native Excel printing and production remain required. Numerical policy geometry-2.2+bs8666-2000-v7 is unchanged. User-owned Rules/.env/Auth configuration is preserved, with no Cloud Functions, Rules or Hosting deployment. Earlier entries below are retained development history.

# v0.37 — per-piece fabrication measurements (local development)

Users can save up to20 identified measured pieces per Mark, with date, observer, source, actual cut/dimensions/radius and notes. Missing values stay missing; mapped BS2000 Table4 ranges are compared inclusively. Nominal changes retain original evidence as stale; editing clears both confirmations. One piece never changes quantity, BOQ, cut geometry or batch acceptance. Old schemas/Frozen histories remain readable. See [guide](FABRICATION_INSPECTIONS.md) and [current report](../output/fabrication-inspection-verification/DEVELOPMENT_REPORT.html).

Actual SDK/dev/compiled UI, assigned viewer/project isolation, immutable Frozen, genuine XLSX/A4 and ZIP restore are verified locally. Excel dates are typed and measured-range formulas recalculate; app status/free balance remain captured. The A4 appendix prints whole record headers without repeating long piece IDs. Algebraic free-dimension comparisons for mapped11/12/13/21/31/41/44 do not establish residual tolerances, full Clause9/BS/ACI conformity or permission to fabricate. The numerical policy remains unchanged; no automatic length/geometry compensation is introduced.

Full original acceptance remains incomplete: approved engineering/physical closure33/51, real GULF reinforcement and owner BBS, unsupported assemblies, native Excel printing and production recovery remain required. Rules/.env/Auth/API configuration are preserved; the user owns Rules/deployment and no Cloud Functions or Cloud deployment is introduced. Final local checkpoint commands logged export completion then failed at shutdown; exported Storage bytes are verified, but final checkpoint integrity/reimport/production recovery is not certified. Earlier actual ZIP restore is separate evidence and precedes final UI/export replays.

# v0.36 — context openings and regional cover (local development)

The final replay environment is an isolated checkpoint copy with selected Working/Frozen readback, preserving the earlier local services. It does not certify whole-database parity or production recovery. Continue the original engineering/GULF/owner/production acceptance work without changing or deploying the user-owned Rules; do not infer approval from scoped software checks.

All six member categories retain owned BOQ/cuts while Version2 reference regions add up to four openings and optional regional cover. Surface checks use the greatest responsible cover; context openings conflicting with occupied owned concrete are rejected. Both confirmations clear on changes. Version1 and old Frozen records remain readable without automatic migration. Actual local SDK, UI, scoped cut proposals, genuine exports and restore are verified; A3 maximum text is explicitly paginated with owner frames. See [guide](PLACEMENT_CONTEXT.md) and [current report](../output/context-openings-verification/DEVELOPMENT_REPORT.html).

This is geometric placement metadata, not a BS/ACI numerical-policy release, approved anchorage/lap design or reconstructed GULF reinforcement. Full original acceptance remains incomplete: approved engineering fixtures, code33/51 physical closure, actual GULF Mark locations/BBS, arbitrary assemblies, owner release and production recovery remain pending. User-owned Rules, .env and Auth/API configuration are preserved; no Cloud Functions or Cloud deployment is introduced.

## v0.35 progress and next acceptance work

Placement-only context addresses explicitly entered protrusions into adjoining/next concrete without increasing owned concrete/formwork or extending parameterized bars. Review PLACEMENT_CONTEXT.md and the current report. The real GULF 2C1-100 pilot proves original file intake/view/hash and clearly read concrete dimensions only; actual reinforcement paths, source Mark callouts and approved bend/anchorage/cover interpretation remain to be developed and reviewed. Continue code33/physical51/full BS/ACI fixtures, actual owner-template BBS pilot, broader geometry/assemblies and context openings, cumulative tolerance, native printing and user-managed production. Preserve old Frozen bytes/numerical policies and user-owned Rules.

## v0.34 progress and next acceptance work

Continuous beam authoring now supports centred X/Y spans, changed sections/soffits, actual step/end/opening formwork and same-snapshot BBS/Excel/PDF/Restore/cutting. Inspect current evidence in output/beam-assembly-verification and BEAM_ASSEMBLY.md. Next continue the full original scope: code33/physical51 closure and approved full BS/ACI cases; real project drawing/owner-template pilot; arbitrary assemblies, cumulative tolerance, native printing and user-managed production. Do not infer construction or production readiness from scoped software evidence. Preserve all Frozen inputs/numerical policies and the user-owned Rules/deployment boundary.

## v0.33 progress and next acceptance work

Code51 scheduling input, outside dimensions, prescribed/reference formulas, virtual closing-corner coordinates and genuine exports are now available in minimum v7. Closing arcs overlap in the planar projection and are explicitly pending; resolve physical closure from approved details, not invented geometry. Next software engineering work includes code33 and complete project BS/ACI rule support, with engineer-approved cases, real GULF/owner pilot, arbitrary assemblies, cumulative tolerance and production verification still required. Preserve all old Frozen numerical policies and user-owned Rules/deployment. See BS_RECT_LINK.md.

## v0.32 progress and next acceptance work

Code77 now uses one true uniform helix primitive under immutable minimum v6. C means turns; Table1 approximate and exact 3D branches remain distinct. Actual views/exports retain full parameters and selected-cut quantity once per occurrence, with old Frozen numerical results preserved. Continue the full original scope: shapes33/51, full BS/ACI, engineer-approved cases, real owner/GULF workflow, arbitrary assemblies, cumulative tolerance and production verification using the user's Rules. Software checks do not authorize fabrication or Issued. See BS_HELIX.md and output/helix-verification/DEVELOPMENT_REPORT.html.

## v0.31 progress and next acceptance work

Code67 is now an analytic primitive under immutable minimum v5, with true curve views/exports, explicit A/R meaning and clause10/Table5 supply. It shares the BBS cut with BOQ and cutting demand without summing display chords. Continue the full original scope: shapes33/51/77, complete BS/ACI, engineering reference cases, real GULF/owner workflow, arbitrary assemblies and production verification with the user's Rules. Do not infer engineering approval from software checks or overwrite pinned historical results. See BS_ARC.md and output/arc-verification/DEVELOPMENT_REPORT.html.

## v0.30 progress and next acceptance work

Code13 now joins the supplied BS2000 minimum policy with geometry-gated formula and genuine shared views/exports. Remaining engineering work includes shapes33/51/67/77, complete ACI/approved cases and owner project pilot before enabling Issued. Production access/operations require the user-managed Rules and environment. Do not overwrite pinned old numerical policies or infer engineer approval from software checks.

# Current handoff — v0.29 / 2026-10-12

Cutting now fills a previous heuristic counterexample and offers independently oracle-checked small-set optimization plus multistrategy larger sets. The runtime uses a cancellable browser Worker; per-area/member scope permits bounded proposal documents. Actual reservation/stock-epoch guards, direct UI/built actions, offcut reuse diagnostics, genuine Excel and Backup/Restore are verified in output/cut-optimizer-verification.

Continue toward the full original app: complete BS/ACI and engineer-approved cases, real GULF/owner workflow and drawing template acceptance, arbitrary assemblies, worker/export/large-project operations and production compatibility with the user's own Rules. The heuristic cannot claim a global optimum for large sets. Proposal/diagnostic testing does not open Issued or production consume. Rules/deployment belong to the user; do not change or deploy them. No Cloud Functions or separate API runtime may be restored.

# Previous handoff — v0.28 / 2026-10-12

Completed individual Table4 reference ranges in UI/Excel/new A4 schedules from the supplied BS2000 PDF. These are no-compensation/no-inspection references; commissioning of clause9 tolerance stack/free dimension adjustment remains open. All original requirements remain in scope, including complete BS/ACI, actual-project/owner pilot, arbitrary assemblies, cutting operations and production verification. See output/tolerance-verification/DEVELOPMENT_REPORT.html. User-owned Rules must not be deployed or overwritten by the agent.

# Previous handoff — v0.27 / 2026-10-12

Current increment adds printable Excel views; see output/excel-print-verification/DEVELOPMENT_REPORT.html. The user defines and deploys production Firestore/Storage Rules and explicitly declined agent deployment on 2026-10-12. Do not deploy or overwrite those Rules. The older v0.26 transport evidence below remains scoped historical evidence.

The user's latest instruction cancels Cloud Functions and uses the Firebase API configuration in `.env` through direct Web SDK access. The Functions source/deployment configuration has been removed. Do not add a Node API or restore callable endpoints. Historical counts below belong to earlier transports and are not current acceptance.

Implemented and locally tested: paired first-user registration with race handling, pending approval, UID/email binding, persistent Auth, protected timestamps, optimistic/idempotent profile saves, multi-role/project assignments and live UI reduction; private-profile separation and project-administrator team actions; transactional member/version/confirmation handling; immutable Storage snapshots and export leases; source intake/revisions/explicit legacy adoption with bounded publication/rollback; stock reservation/offcut diagnostics; actual ZIP Restore/re-backup and reference-only permission history; verified Draft submission packets and Superseded gates. The direct verification report gives current test evidence and remaining limits.

Next: verify the app against the user's deployed Rules and actual Google/domain/Auth setup; separately commission full BS/ACI and independent engineer-approved cases, native Excel print/owner pilot and production operations. Rules deployment belongs to the user. Browser-side validators and Role/Rules checks are not a trusted engineering certification service. Issued and production consumption stay closed. Full original BOQ/BBS objective remains incomplete.

The supplied minimum and numerical policies are unchanged. Old source and Frozen bytes are preserved. Evidence: output/direct-sdk-verification/DEVELOPMENT_REPORT.html. No new cloud data writes, rule deployment, Hosting deployment, commit or push in this increment.

# Implementation plan

## v0.25 team-management handoff

Completed admin-only team/account resolution, new guarded/reasoned ACL writes, immutable UID-based history, legacy authorization repair, active/deleted account handling, mobile/list bounds and genuine Backup/Restore that does not apply source grants. Fresh320 local software scenarios; representative checkpoint/recovery evidence belongs to output/project-access-verification. The original supplied BS2000 minimum remains unchanged. New UI/Functions are undeployed; only the previously authorized Firestore restoration is live.

Next priorities: deliberate project lifecycle/operational boundaries and separate staging deployment; real-project owner/source pilot and approved edition-specific engineering fixtures; remaining BS shapes/full fabrication validators and ACI requirements; further geometry/assemblies; cloud export/backup workers, production load and operations. Preserve per-project ACL and original reference/archived bytes. Do not treat permission administration, restored history or supplied startup rules as construction approval; full original objective remains incomplete.

## v0.24 handoff

Project-specific paths/ACL and email authoring restored after explicit user direction. Firestore-only ACL restoration on my-boq-app completed with explicit permission; cloud Functions/Storage/full deployment remain unaccepted. Supplied historical BS2000 V3 adds oblique15/25/26/46 with actual geometry recognition, outside templates, Note1 comparison/exact-over45 selection, drawing dimensions, final PDFs/Excel and archived Restore. Old V1/V2 policies remain unchanged until explicit adoption. Fresh305 software scenarios; all22 final PDF pages inspected. Current evidence in output/oblique-shape-verification.

Next: remaining BS Table1 shapes and complete edition-specific engineering/fabrication validators with independent approved cases; actual-project/source/owner pilot; further geometry/assemblies; properly separated Firebase staging/production, Functions/Storage/backup workers, cloud load and operations. Preserve multiproject per-user ACL, source bytes and supplied minimum startup policy. Issued and production cutting remain gated. Full objective remains active and incomplete.

## v0.23 handoff

Controlled existing legacy source adoption implemented and locally verified, including retained points/scales and first-recorded hash provenance, bounded atomic Member/General reset, resume/rollback, required Draft review, original Frozen exports and archived Restore. Fresh286 software checks +7 representative reimport checks; actual A3/A1/Excel/ZIP evidence in output/legacy-source-verification.

Next priorities: approved actual-project drawing intake and owner-template pilot; complete edition-specific engineering/fabrication validators and independent engineering fixtures; additional geometry/assemblies; cloud export/backup workers, production load/operations and configured deployment. Any additional legacy files require explicit selection and review. Preserve supplied BS8666:2000 minimum startup subset and Issued/production gates. Full objective remains incomplete.


## v0.22 handoff

Owner drawing identity/configurable landscape text frames and exact registers implemented and locally verified. Primary A3/A1 actual source PDFs inspected, Thai profile, duplicate numbers, Frozen immutability, structured registry guard/retry, legacy/checker and Backup/Restore verified.265software scenarios plus7reimport representatives; engineering acceptance remains incomplete.

Next: controlled legacy reference adoption and actual-project owner pilot/template acceptance; portrait/logo/free-form frames as owner convention requires; complete code/fabrication rules and independent approved fixtures; arbitrary assemblies; cloud workers/operations/production commissioning. Preserve original BS minimum starter and Issued/production gates.

## v0.21 handoff

Implemented immutable Draft Frozen document packages, actual-file preparation, unique transmittal references, A4 cover/Excel registry/ZIP, creator lease/retry, byte-exact history and archived Backup/Restore. Fresh local evidence covers mixed actual A1/A3/A4/Excel files, later Working edits, Zone A scope,30 long-title source fixtures, all8 final cover pages and verified default reimport. Full original application objective remains active and incomplete.

Next priorities: owner titleblock/drawing/register conventions and actual-project pilot acceptance; controlled adoption of existing legacy references; complete fabrication/code rules and independent approved engineering fixtures; arbitrary geometry/assemblies; cloud export/backup workers, larger project load and configured production operations. Package references do not substitute for approved drawing numbers or engineering approval. Preserve supplied BS startup profile and existing Issued/production cutting gates.

1. Establish domain, specifications and Firebase configuration. Preserve the previous UX and acceptance evidence.
2. Implement persistent project/member CRUD for all six types, real drawing uploads and parameterized BBS geometry.
3. Implement atomic export snapshots, actual XLSX and vector A3/A1 PDFs; inspect real downloaded outputs.
4. Verify access controls, optimistic concurrency, idempotency, stock reservation/consumption and backup/restore against running Firebase emulators.
5. Extend geometry to approved real assemblies/continuous beams, scale data beyond current bounded transactions, implement immutable issue/supersession and robust export jobs with retry/status.
6. Commission approved edition-specific engineering rules and independent fixtures; perform full project acceptance and production deployment with configured environment.

The Draft workflow now includes composite solids/openings, frozen revisions, supersession, export retries and immutable file snapshots. The v0.3 local fixture verifies 120 members and 1,440 Marks. Step 5 still needs arbitrary assemblies, full pagination/batched restore, production export workers and Issued commissioning; step 6 remains necessary before construction use. No skill or reference PDF is allowed to override the user's requirements.

The v0.4 local fixture verifies 520 members / 6,240 Marks, resumable locked Restore batches, cancellation, and member/BOQ/history pagination. Working-member data still loads completely through bounded requests for global totals. Next step 5 priorities: standard fabrication shape dimensions/drawings, larger-project Spec changes, server export/backup workers and arbitrary assemblies; step 6 engineering and production acceptance remain necessary.

## v0.15 source drawing handoff

Completed bounded Draft source-v9 export: actual source PDFs/images, Mark index, normalized saved endpoints, original hashes/download, immutable Storage guard, Working/Frozen/Retry and actual Backup/Restore. Fresh baseline six-category regression and built first-use export pass; recovery checkpoint/default-data reimport verified on representative records. Full scope still needs approved engineering cases, commissioned Issued/production cutting, complete fabrication dimensions, arbitrary assemblies and cloud export workers/operations. Coherent Zone/Floor selection and grouped submission were subsequently implemented in v0.16 below. Source revision/Mark reconciliation and real-project end-to-end review remain necessary alongside commissioning.

## v0.16 grouped scope handoff

Completed shared Working/Frozen Member/Category/Zone/Floor scope, five BOQ groupings, grouped Excel/PDF, selected multi-member BBS/source packages and A4 scope covers. Immutable scoped Retry/history, complete Backup/archived Restore and representative default-data reimport verified. Fresh234software scenarios and selected35PDF leaves are progress evidence; engineering/fabrication and full-system acceptance remain incomplete.

Next product priorities at v0.16 were source revision replacement and Mark reconciliation; the bounded member-source workflow was subsequently implemented in v0.17 below. Real-project submission organization, approved independent engineering cases, complete fabrication dimensions, arbitrary geometry/assemblies and cloud workers/commissioning remain outstanding. Issued/production cutting requires commissioned validators and an actual configured environment.

## v0.17 source revision handoff

Completed bounded member-file replacement, stable bar-ID reconciliation, combined current Plan/Section coverage, explicit Draft/confirmation reset, checker/approver reference review, Current-only source-v9, appended Source Register, reciprocal lineage Backup/Restore and five representative default-data reimport checks. Software286 and selected24PDFleaves are progress evidence, not full acceptance. Emulator backchannel timeouts were recovered using a verified checkpoint and isolated reruns; root cause/load performance remain unconfirmed.

Next product priorities: General Spec reference-file revision with controlled impact on members and existing bounded Spec workflow; bulk intake/reconciliation across affected members; practical real-project submission organization; approved engineering fixtures and complete fabrication dimensions; arbitrary assemblies and server export/backup workers. Cloud environment/Node22/operations and construction release remain pending. Keep all Draft labels and commissioned-validator gates until actual acceptance.

## v0.18 General Spec reference handoff

Implemented controlled replacement of project reference documents through existing bounded Spec-change jobs. All current members reset Draft/confirmations; original numerical Spec and cuts remain, sources publish atomically on completion, cancellation restores exact original states, and document review remains distinct from member placement/engineering acceptance. Fresh62-member/six-category, original Frozen/current Excel, actual ZIP Restore, source-regression, full mobile acknowledgement and five representative reimport checks documented in output/general-source-verification. No new production/engineering/PDF-layout certification.

Next priorities: controlled first-file/initial-reference intake (existing attachments still legacy, with no inferred approval or automatic impact reset); bulk source intake and Mark reconciliation; practical owner package organization and project template acceptance; independent engineer-approved cases/full fabrication dimensions; arbitrary assemblies/cloud workers/operations. Keep full original app scope and construction-release gates; source document review is progress toward reliable data management, not completion of engineering commissioning.


## v0.19 initial/mixed reference handoff

Completed controlled project-reference intake for initial/additional files and multiple revisions in a single bounded job. Existing numeric and single-source jobs remain compatible. First-intake provenance, per-document Draft review, exact rollback/resume, actual PNG/JPEG/PDF validation, current/Frozen Excel, ZIP Restore and final default reimport were verified on synthetic local fixtures. Legacy inline Restore now rejects modern source history. No new engineering, cloud or PDF layout certification.

Next product priorities: adopt existing legacy references without requiring a misleading new revision; bulk member Plan/Section intake with stable Mark reconciliation; practical owner drawing/package templates and a real-project pilot; complete fabrication dimensions and independent approved engineering cases; arbitrary assemblies, server export/backup workers, large-project load and cloud operations. Preserve supplied BS startup profile and all construction-release gates until actual acceptance. The full original application objective remains incomplete.


## v0.20 member source handoff

Completed controlled first/additional/mixed member drawing intake with selected-owner reset, exact rollback/resume and atomic publication. Existing numeric/General Spec and single member-revision jobs stay compatible. Initial Mark reference review, ordinary attachment audit gate, source-package omission guard, current/Frozen Excel and actual ZIP/Restore were verified with synthetic local fixtures. The register supports source-to-member navigation; legacy references retain their prior interpretation. No new engineering, cloud or PDF-layout certification.

Next priorities: controlled adoption of existing legacy project/member references without pretending to receive a new revision; practical owner drawing register/transmittal/package templates and an actual project pilot; complete fabrication dimensions and independent approved engineering cases; arbitrary assemblies, cloud export/backup workers and project load/operations. Supplied BS startup profile remains the minimum default; do not infer approved project rules from documents or disable construction-release gates. Full application objective remains incomplete.
# v0.27 Excel increment and production authority

The user manages and deploys production Firestore/Storage Rules; agent deployment was explicitly declined on 2026-10-12. Do not deploy or overwrite those Rules. Continue application work against the local contract and verify compatibility with the user's deployed Rules separately.

Printable Excel views now extend the established export schema. Native Excel pagination/font/printer checks, full BS/ACI engineering fixtures, actual owner drawing template/pilot, additional assemblies and production operations remain open. Local export checks do not close those gates.

