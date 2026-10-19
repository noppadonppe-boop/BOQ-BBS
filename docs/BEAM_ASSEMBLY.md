# Continuous beam authoring — v0.34

Open a Beam member and select **คานต่อเนื่องหลายช่วง**. Enter each physical concrete segment in its order along X or Y: label/Grid reference, concrete length, width, depth and soffit Z. All segments share a common horizontal centreline and one Z datum. Labels do not infer support widths, clear spans, levels, reinforcement or deductions from drawings. Up to12 butt-joined rectangular segments are supported by the existing12-solid budget; bends in the beam alignment, inclined/curved surfaces, haunches and other arbitrary assemblies remain additional work.

The first segment starts at0; subsequent stations are the sum of entered lengths. Widths are centred on the largest width, giving nonnegative local coordinates. Adjacent segments must share a positive section at the joining plane; a disconnected/touching-only vertical section is rejected. Total length, width and highest Z remain bounded by200,000mm. Segment IDs are stable across parameter edits and order changes, so targeted Marks still refer to the same segment. Deleting a targeted segment leaves an explicit missing-target error until the user repairs that Mark.

The saved `beamAssembly` version1 is authoring data. It must match the actual generated solids, their IDs/labels/coordinates/sizes/faces and member bounds. Save validators reject mismatches rather than calculating from stale authoring data. Concrete/formwork continue through the existing union-solids engine; this increment does not change historical numerical policies or the supplied minimum BS2000 v7. Direct manual editing through **ชิ้นส่วน / ช่องเปิด** detaches authoring data and retains the edited geometry. No old members or Frozen records are converted automatically.

The builder retains Zone/Floor/Grid occurrences, Marks/raw coordinates, openings and manual deductions. Using a changed assembly returns the member to Draft and clears both bar placement and outside-dimension confirmations. Existing target-relative/parameterized bar geometry is recomputed using its actual current segment, while explicit coordinates remain explicit. The user must inspect every affected Mark, particularly after reordering, changing axis, deleting a target or changing a section/soffit. Parent validation exposes bars outside concrete, insufficient cover and stale target IDs; invalid bars must be repaired before saving. The builder does not design continuous reinforcement, stirrup zones, anchorage, laps or joints.

## Concrete and formwork

Gross concrete is the sum of segment `L×W×D`, because the entered concrete segments are butt-joined without volumetric overlap. The regular union engine then subtracts geometric voids and manual volume deductions. Review project measurement conventions for beam/column/slab interfaces; the builder does not assume these interfaces from Grid labels.

Longitudinal formwork per segment is `L×[2D + W×(bottom+top)]`. Optional first/last end forms contribute their section areas. Internal common joined faces have no formwork. At a width/depth/soffit step, the exposed faces contribute the symmetric difference of adjacent sections: `area1+area2−2×min(width1,width2)×verticalOverlap`. Opening forms and manual formwork deductions then follow the existing union policy. Net formwork may exceed gross formwork when added opening faces exceed manual deductions.

Quantities are per member instance, multiplied once by the selected occurrences. Targeted BBS, explicit continuous paths, BOQ and cutting demand retain the same selected cut/diameter/grade policy. Taking a continuous member through the builder does not authorize production cutting or Issued.

## Output and saved history

Actual A3/A1 BBS drawings and A4 schedules use the same union geometry and Mark positions as before. The existing plan/section convention remains PLAN X/Y and section at entered Y; for a Y-aligned beam this section is transverse. The builder additionally shows its longitudinal Y/Z preview. New PDFs do not claim an approved span/support-detail drawing or automatically dimension every beam segment; complete owner-template/actual-project acceptance remains pending.

XLSX adds **Beam Spans** and **Beam Check** only when the selected snapshot includes this authoring data. Span station formulas are sequentially linked. Gross volume and longitudinal/step/end formwork are formula references. Net volume/formwork and occurrence quantities link to captured BOQ rows; selected BBS cuts remain the captured values. Editing span references changes their comparisons, not Frozen BOQ/BBS. Editing BOQ net reference values propagates through the reconciliation totals. Saved A3 landscape print areas and repeated titles are provided; native Excel pagination/printer acceptance remains unverified.

Frozen inputs retain the full authoring/solids snapshot. Later Working changes do not change the captured geometry/cuts/artifact bytes. Backup/Restore retains this authoring and actual geometry, resets operative review/confirmation state through the existing policy and retains old revision/export references as imported history. The tested ZIP was captured before later wizard/cutting/final-export actions; it is not a latest-state whole-project backup claim. A separate local emulator checkpoint preserves exported services/Storage bytes; no production recovery or full reimport acceptance is inferred from it.

The member editor also avoids replacing a just-saved version with an older subscription result. Current same/newer versions and different members still synchronize when the form has no unsaved edits.

## Scope still open

The supplied BS8666:2000 + Amendments1/2 remains the authorized minimum startup reference. Code33, physical code51 closure, complete BS/ACI/approved reference fixtures, cumulative tolerance, real GULF/owner pilot, arbitrary geometry, native Excel printing and production commissioning remain required. Issued/production consume stay closed. Firebase Auth/Firestore/Storage use the configured direct Web SDK; Cloud Functions are not restored. The user owns Rules/deployment; this increment does not edit/deploy Rules, change `.env` or deploy Hosting/Cloud.

Evidence: `output/beam-assembly-verification/DEVELOPMENT_REPORT.html`.
