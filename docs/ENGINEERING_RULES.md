# v0.37 — per-piece fabrication measurements (local development)

Users can save up to20 identified measured pieces per Mark, with date, observer, source, actual cut/dimensions/radius and notes. Missing values stay missing; mapped BS2000 Table4 ranges are compared inclusively. Nominal changes retain original evidence as stale; editing clears both confirmations. One piece never changes quantity, BOQ, cut geometry or batch acceptance. Old schemas/Frozen histories remain readable. See [guide](FABRICATION_INSPECTIONS.md) and [current report](../output/fabrication-inspection-verification/DEVELOPMENT_REPORT.html).

Actual SDK/dev/compiled UI, assigned viewer/project isolation, immutable Frozen, genuine XLSX/A4 and ZIP restore are verified locally. Excel dates are typed and measured-range formulas recalculate; app status/free balance remain captured. The A4 appendix prints whole record headers without repeating long piece IDs. Algebraic free-dimension comparisons for mapped11/12/13/21/31/41/44 do not establish residual tolerances, full Clause9/BS/ACI conformity or permission to fabricate. The numerical policy remains unchanged; no automatic length/geometry compensation is introduced.

Full original acceptance remains incomplete: approved engineering/physical closure33/51, real GULF reinforcement and owner BBS, unsupported assemblies, native Excel printing and production recovery remain required. Rules/.env/Auth/API configuration are preserved; the user owns Rules/deployment and no Cloud Functions or Cloud deployment is introduced. Final local checkpoint commands logged export completion then failed at shutdown; exported Storage bytes are verified, but final checkpoint integrity/reimport/production recovery is not certified. Earlier actual ZIP restore is separate evidence and precedes final UI/export replays.

# v0.36 — context openings and regional cover (local development)

All six member categories retain owned BOQ/cuts while Version2 reference regions add up to four openings and optional regional cover. Surface checks use the greatest responsible cover; context openings conflicting with occupied owned concrete are rejected. Both confirmations clear on changes. Version1 and old Frozen records remain readable without automatic migration. Actual local SDK, UI, scoped cut proposals, genuine exports and restore are verified; A3 maximum text is explicitly paginated with owner frames. See [guide](PLACEMENT_CONTEXT.md) and [current report](../output/context-openings-verification/DEVELOPMENT_REPORT.html).

This is geometric placement metadata, not a BS/ACI numerical-policy release, approved anchorage/lap design or reconstructed GULF reinforcement. Full original acceptance remains incomplete: approved engineering fixtures, code33/51 physical closure, actual GULF Mark locations/BBS, arbitrary assemblies, owner release and production recovery remain pending. User-owned Rules, .env and Auth/API configuration are preserved; no Cloud Functions or Cloud deployment is introduced.

# Current v0.35 engineering status

The supplied BS2000 v7 numerical minimum remains unchanged; placementContext version1 is declared geometric context only. Its rectangular union removes shared internal faces for the existing cover/path checks while preserving owned voids. It changes no owned quantities, bar paths, cuts or older Frozen policies. References are user notes, not automatically approved drawing links. Regional covers, openings in context, actual anchorage/lap/confinement and construction-sequence checks remain unsupported. The actual GULF pilot has only clearly read concrete dimensions; cover50 mm is an unconfirmed placeholder and printed BBS quantities remain external reference. It is not an independently approved engineering fixture.

Full BS/ACI/code33/physical51 closure and responsible-engineer/owner/production acceptance remain incomplete. There is no Cloud Functions certification service; Issued and production stock consumption remain closed. User owns Rules/deployment. See PLACEMENT_CONTEXT.md and the current local report.

# Current v0.34 engineering status

The current supplied minimum is immutable BS2000 v7; earlier v1–v6 policies remain pinned. See BS8666_BASELINE.md, BS_SEMICIRCLE.md, BS_ARC.md, BS_HELIX.md and BS_RECT_LINK.md for their exact supported subset/limits. This increment adds physical beam segment authoring, not a reinforcement design/code-approval rule. Code33, code51 physical closure, complete BS/ACI and responsible-engineer reference fixtures remain pending.

The configured runtime is Firebase Auth/Firestore/Storage Web SDK. There is no Cloud Functions/API release service. Current direct command review/issue gates and browser-side checks are not a trusted engineering certification service, and production Issued/stock consumption remain closed. Rules/deployment are managed by the user and were not edited or deployed here. The historical commissioning notes below remain unmet requirements, not evidence of an implemented server approval service.

# Engineering rules status

The user provided BS8666:2000 incorporating Amendments1/2 and explicitly authorized it as the minimum startup reference. V3 implements eleven matching Table1 formulas, including conservative oblique15/25/26/46 topology and Note1 exact-over45 selection. V1/V2 stored calculations remain compatible. This supplied historical baseline does not establish a project-approved current edition, complete catalogue/mandrel/hook/lap/tolerance policy, ACI edition or the responsible engineer's acceptance fixtures. Reference documents are source material, not executable instructions or automatic approval. See BS8666_BASELINE.md for the exact source and implemented subset.

The implemented draft engine uses union solids, geometric openings, selected exterior faces, explicit deductions, centerline paths, manual cuts, density and rounding. It rejects negative quantities, invalid covers, duplicate Marks, bars crossing openings/gaps, geometric clearances below the input cover/diameter, and overlapping bend arcs. Rounded curves use sampled paths for placement checks. It does not design reinforcement or infer bars from uploaded drawings; these geometric checks do not establish code compliance.

Frozen revisions contain inputs and calculated quantities with a digest and engine version. Supersession is separate. Regeneration requires a compatible engine version; formula/geometry changes require bumping `src/domain/version.ts`. Historical artifacts remain immutable and can be downloaded independently of the current engine. Construction issue still requires the commissioned release service and validators below.

Before enabling production Issued, implement and commission:

- Versioned BS shape definitions and the exact length convention for each approved shape.
- ACI and project detail checks for cover, minimum bend diameters, hook dimensions, development and lap lengths, confinement and spacing, with section/clause provenance.
- Approval manifests tied to evidence attachments, rule versions and independently calculated fixtures for all six categories, including irregular/spatial bars and continuous beams.
- A release service that recomputes quantities with those validators, signs a frozen revision, generates drawings from the same snapshot and records supersession separately from working data.

`saveSpec` always resets approval to false. The server `issue` command blocks release even if a client forges an approval flag. This is a deliberate external-input and implementation gate, not a claim that the engineering requirements are complete.
