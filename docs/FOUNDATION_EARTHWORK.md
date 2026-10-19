# Foundation earthwork input v0.51

General Spec can opt into `earthwork-1.0`. This is a measurement input policy, not a BS/ACI design rule. New and existing projects retain the previous policy until the user saves this setting. Existing foundations remain Legacy until their mode is explicitly changed. Changing Spec uses the existing staged transaction/reset workflow; a downgrade rejects while a foundation still uses a version1 input.

In **Foundation → แก้มิติ / ตำแหน่ง → คอนกรีตใต้ระดับถม**, choose:

- Legacy: positive `buriedConcrete` is used; zero means net member concrete automatically. Historical arithmetic is unchanged.
- Automatic: use net member concrete, including pedestal/geometry and explicit concrete deductions. The old numeric field is ignored and displayed volume is read-only.
- Manual: use the entered nonnegative volume, including a real zero. An explicit source/basis is required (up to500 characters). Identify the drawing/datum, actual occupied excavation volume and any joint ownership; do not subtract Lean twice.

The input is per foundation. Backfill = excavation − Lean − buried concrete. Occurrence quantities multiply this result once. Negative backfill, malformed modes, missing manual bases and use outside Foundation reject. The rectangular excavation integration and all concrete/formwork/BBS formulas are unchanged. The system does not infer fill levels or approve the source basis.

The optional input is stored at `excavation.buriedInput`, with `version:1`, automatic/manual mode and manual basis. The numeric input remains at the original `excavation.buriedConcrete` field. No global migration changes old zero values. The new policy adds `+earthwork-1.0` to the immutable calculation engine ID. Earlier BS profiles, engine IDs and Frozen revisions remain reproducible from their captured Spec/inputs/quantities.

Foundation BOQ now displays the selected mode, basis and per-piece/total subtraction. Actual XLSX exports append **Foundation Earthwork**, with typed zero, quantity, volumes, locations, source and captured engine. BOQ PDF adds the same foundation basis appendix. These use the selected snapshot and occurrences; the old Frozen appendix explicitly labels the Legacy zero rule. Backup/Restore preserves the new policy/input and original history/artifact bytes while resetting release/placement as before.

Copy retains physical input and the entered source text as provenance. The target must support this policy, and copied members remain Draft. The basis still needs checking against the copied position. Old clients do not support the new policy; use the current app for projects that opt in. Client-side validation is not a trusted server enforcement boundary.

Local verification: [report](../output/earthwork-verification/DEVELOPMENT_REPORT.html). The synthetic 1m³ concrete / 8m³ excavation case shows Legacy0→7m³, Manual0→8m³ and later Manual0.25→7.75m³. It is not an independently approved project case. BS8666:2000+Amd1/2 remains the supplied startup minimum; full ACI/engineering/owner/Issued/native-print/production acceptance remains pending. User-owned Rules, environment, Auth initialization and deployment are unchanged.
