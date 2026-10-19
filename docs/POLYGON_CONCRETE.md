> v0.62 adds an explicitly selected [one-run planar changing-section method](TAPERED_CONCRETE.md). The earlier method and arithmetic documented below remain available unchanged.

# Straight polygon concrete · v0.60

v0.61 adds an optional [inclined-translation method](INCLINED_CONCRETE.md); the version1 and legacy scope below remains unchanged.

This is geometric takeoff and placement checking. It does not design reinforcement or approve a drawing for construction. The BS8666:2000+Amd1/2 minimum v7 remains unchanged, with ACI and unresolved shape/fabrication checks still pending.

## Use in the app

1. Open the assigned project → **General Spec** → **วิธีรูปทรงคอนกรีต** → choose **รุ่น 1 · เพิ่มหน้าตัดหลายเหลี่ยมลากตามแกนตรง** and save the Draft Spec. Existing members keep their physical geometry. Spec jobs reset working members to Draft; Frozen history retains its captured Spec.
2. Open Foundation, Beam, Column, Slab, Wall or Custom → **หน้าตัดหลายเหลี่ยม**. Choose extrusion X/Y/Z, start and length in mm. The profile coordinates are the other two axes in ascending order: X→Y/Z, Y→X/Z, Z→X/Y.
3. Enter one point per line, either `u v` or `u,v`, around the boundary. Do not repeat the first point. The minimum outer-profile coordinate in each axis must be0. Record the drawing reference and local coordinate datum; the initial rectangle comes from entered member bounds, not from automatic drawing extraction.
4. Add fully through polygon holes as required. Choose formed outer/hole edges and formed start/end faces. Preview the shape and gross quantities, then use it in the workspace and save the member.
5. Check the actual2D sections,3D and BBS paths. All BBS inputs must lie in material and meet the member cover against the real diagonal/inner surfaces. Geometry changes clear placement/outside-dimension confirmations and invalidate a reused no-rebar declaration. Applying a prism replaces boxes, beam-span authoring, pedestal and box openings; it clears old bar target-solid references but keeps raw bar inputs, occurrences, source links and manual deductions for review.

Selecting another extrusion axis reinterprets the entered profile axes; it does not rotate existing reinforcement. Existing automatic bar templates use the member envelope and are rejected if their resulting paths leave polygon concrete. No bars are designed or added automatically to fit a new section. All dimensions displayed for polygon views measure the visible silhouette/cut envelope: the QA triangle has a4000mm plan width and2000mm section width atY=1500. Empty cuts have no positive material span. Legacy drawing dimensions stay unchanged.

## Calculation and limits

- Area: absolute shoelace outer area minus absolute shoelace area of each hole.
- Concrete: net profile area × extrusion length ÷10⁹, then existing manual volume deductions. Occurrence quantities multiply this once.
- Formwork: formed boundary-edge lengths × extrusion length plus net profile area × number of formed end faces, ÷10⁶, then existing manual formwork deductions. Unformed faces still exist for cover checks and rendering.
- Ends are triangulated with hole-aware Three.js `ShapeUtils.triangulateShape`. The triangulated area is reconciled with analytic area; mesh and cover use those exact cap triangles and side quads. Segment/material checks test intervals through concave boundaries and holes. Clearance uses segment-to-triangle distances rather than bounding-box distances. [Primary API reference](https://threejs.org/docs/pages/ShapeUtils.html).
- 3–64 vertices per loop; up to12 holes; maximum256 vertices in total; coordinates/start/end within200000mm. Zero edges, collinear intermediate points, repeated closing vertices, crossed/touching edges, overlapping/nested/touching/outside holes, invalid area and duplicate hole IDs are rejected.
- One constant profile extruded straight along a global axis. Arbitrary rotated/inclined/curved extrusion, changing sections, blind openings, prism unions, mixed boxes/pedestal and placement-context unions are not implemented. The schema rejects these combinations; it never fills an approximate bounding box as physical concrete. Rectangular continuous-beam and legacy box workflows remain available separately.
- A general manual deduction is not a geometric hole. It changes quantities but cannot authorize bars through missing concrete. Review existing deductions when switching shapes to avoid subtracting a hole twice.
- Foundation excavation/lean/backfill keep their existing entered measurement policy; polygon geometry does not infer excavation dimensions or a burial level.

## Persistence and files

Optional member `prismGeometry.version=1` is strict, persisted and included in member copy, capture, engineering preparation inputs, Frozen and backup/restore. Copies remap hole IDs and reset release evidence. The Spec opt-in `concreteGeometryPolicy=concrete-prism-1.0` appends an immutable engine suffix. Existing projects are not auto-converted. Removing the policy is rejected while any prism member remains; unsupported Frozen engine IDs cannot be regenerated by this client.

Excel adds **Prism Edges** (captured points, signed area contributions, lengths and formed flags) and **Prism Check** (area/perimeter/length reconciliation and links to captured BOQ). Formulas are editable references; changing these cells does not update the captured BOQ/BBS. Actual outputs were checked from original workbook XML and native Excel with read-only recalculation and in-memory sensitivity, without saving originals. The workbook reader may omit cached0 from its returned formula object; original XML retains0 and native recalculation confirms it. Read-only renderer crops of BBS A:M may hide the merged title extending throughAG; the original workbook retains it.

Actual A3/A1 files use captured polygon silhouettes/cuts and Mark leaders, with Frozen/NOT FOR CONSTRUCTION labels and pending BS/material checks. These are synthetic QA drawings, not reconstructed GULF reinforcement or owner's approved BBS. Working edits do not change Frozen bytes. Backup/restore of all six categories, hole geometry, policy and Frozen history was tested on the isolated local Firebase services.

No Rules, Firebase/Auth initialization, `.env`, source BS or GULF bytes were modified, and no deployment or production write was performed. Rules and deployment remain the database owner's responsibility. Client validation does not provide server enforcement against old clients or direct database writes; do not authorize old box-only clients to edit new prism data. Production access/version enforcement and engineering/owner acceptance remain outstanding.

[Scoped evidence](../output/prism-verification/DEVELOPMENT_REPORT.html) · [Full requirements status](CURRENT_REQUIREMENTS_STATUS.md)
