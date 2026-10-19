# Changing-section concrete — v0.62

General Spec offers an explicit `concrete-prism-3.0` policy. Existing members keep their geometry version. This policy supports v1 straight profiles, v2 inclined translation and new v3 planar-sided changing sections; it never converts an old member automatically. BS8666:2000+Amd1/2 minimum v7 and its numerical rules remain unchanged.

## Input

Close/reload older app tabs before adopting method3; older releases do not interpret v3 input. Local compatibility guards are not a replacement for the user's server policy.

1. Select and save geometry method **รุ่น 3** in General Spec.
2. Open a member → **หน้าตัดหลายเหลี่ยม** → **หน้าตัดเปลี่ยนขนาด**.
3. Enter the start profile, axis advance and two end-profile envelope dimensions in mm. End dimensions determine two positive ratios relative to the entered start profile. The end section lies in a plane parallel to the start section and perpendicular to the chosen X/Y/Z run axis.
4. Enter the two lateral end offsets, or use **จัดกึ่งกลางหน้าตัดต้น–ปลาย**. Offsets apply to the end profile's minimum corner before adding the shared nonnegative datum anchor. For a beam whose upper level stays fixed, the end vertical offset is the start depth minus the end depth; this is a user input, not an assumed structural detail.
5. Enter the source drawing/datum, through holes and selected formed edges/end faces. Inspect the preview, quantities, section/3D and actual bar positions before saving.

Coordinates use `profile(t) = anchor + startVertex × [1 + t × (endScale − 1)] + t × endOffset`, with `0 ≤ t ≤ 1`; the run coordinate is `start + t × axisAdvance`. Negative offsets use the same global anchor convention as v2. Bounds include both actual ends, rather than treating the enclosing box as concrete. All holes use the same scales and offsets as the outer profile.

Rectangular and other profiles whose edges are parallel to the profile axes may use different ratios. Profiles with diagonal edges require equal ratios so every lateral face remains planar. Positive scaling preserves simple-loop/hole topology throughout the run. Warped side faces, zero/negative scales, excessive bounds and unsupported version fields are rejected rather than silently triangulated.

## Quantities and geometric checks

Cross-section area is quadratic in the linear scales. Gross volume is exactly `axisAdvance / 6 × (netStartArea + 4 × netMidArea + netEndArea)`, with holes subtracted at all three stations. This is not the average of the two end areas or the enclosing-box volume. Units convert mm³ to m³.

Formwork uses the areas of selected actual planar trapezoids and end caps with holes removed. The two triangle areas of each planar side agree with the independent parallel-edge area calculation in the Excel diagnostic. Units convert mm² to m². Unformed faces remain physical surfaces for placement and perpendicular cover checks. Existing manual deductions, foundation excavation/lean/backfill modes and BBS-derived steel remain separate inputs.

Containment inverts the positive scale at the actual run station. Straight bar paths are split at physical mesh intersections and tested in each intervening interval; checking endpoints alone does not accept a path that crosses a changing hole or concavity. Perpendicular cover uses actual triangles. Bar coordinates, orientation, counts and BS cuts are not moved or redesigned automatically.

Orthogonal sections intersect physical planar faces and retain changing holes/notches. At a plane passing through a cap/hole edge, opposite boundary directions cancel the zero-area tangent edge. Projections union physical surface silhouettes; a through hole is visible only where a viewing ray misses concrete for the complete run. Width labels explicitly refer to the projected/cut envelope.

## Save, revisions and output

Applying changed geometry replaces existing box geometry/beam spans/pedestal, returns the member to Draft and clears bar placement/BS dimension confirmations. Existing raw bar data and occurrences remain. Saving direct geometry changes also clears confirmations. Lowering General Spec to a method that cannot interpret an existing v3 member is rejected. Copying requires a compatible target Spec and remaps hole IDs. Backup/Restore retain geometry and Frozen history.

The new engine suffix is `+concrete-prism-3.0`. Old v1/v2 member data, numerical policies and Frozen snapshots remain reproducible under their captured policies.

App Excel exports add **Taper Inputs**, **Taper Edges** and **Taper Check** for v3 members. Inputs hold each member's scales/offsets/advance/formed end flags once; edge/check formulas reference those shared drivers. Check calculations are terminal diagnostics. Captured BOQ/BBS do not depend on the diagnostics and do not change when diagnostic cells are edited. Excel editing does not revalidate planar side topology. Mixed v1/v2 members retain their established Prism sheets and original BOQ row references.

Actual A3/A1 detailed BBS exports render the changed shape and show the axis, advance, scales, offsets and shared-hole behavior. New taper metadata has separate spacing from the BS source footer. These remain schematic/NTS diagnostic drawings until project engineering, bar/material rules and owner requirements are accepted.

## Verified scope and limitations

[Local evidence](../output/tapered-prism-verification/DEVELOPMENT_REPORT.html) covers all six categories, a rectangular sloping beam soffit, changing holes, perpendicular cover, critical cut-plane regression, legacy numerical preservation, actual Spec/save/Frozen/Copy/Backup/Restore/Viewer paths, two app XLSX and two app A3/A1 PDFs. Native Excel recalculates both workbooks read-only, changes a scale in memory, verifies diagnostic propagation without changing captured BOQ and prints six sheets. One native page is visually checked with PDF.js because Poppler omitted cells from its PNG although the PDF's text and PDF.js rendering are intact. Original workbook hashes remain unchanged.

The geometry supports **one linear planar-sided run**, not multiple stations, prism unions, combined placement-context regions, arbitrary end shapes/rotation, warped/curved sides, an apex, blind openings or holes sized independently from the outer taper. No actual GULF bar reconstruction or engineering approval is implied. SD40/Code99 remain unmapped/unapproved in the synthetic QA, and five geometric-QA members still lack BBS. Owner/Issued, real stock consumption/offcuts/server enforcement and production acceptance remain pending. Rules/config/Auth/initialization/.env and reference documents are untouched; the user owns Rules and deployment.
