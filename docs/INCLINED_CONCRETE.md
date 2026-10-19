> v0.62 adds an explicitly selected [one-run planar changing-section method](TAPERED_CONCRETE.md). The earlier method and arithmetic documented below remain available unchanged.

# Inclined translation of polygon profiles · v0.61

Choose **General Spec →วิธีรูปทรงคอนกรีต →รุ่น2** and save the Draft Spec. Then open a member's **หน้าตัดหลายเหลี่ยม**, check **แนวลากเอียง**, enter the advance along its principal X/Y/Z axis and the two lateral end offsets. The diagram shows the actual member coordinates and true run length. The method keeps equal, parallel end profiles in planes perpendicular to the selected principal axis; it translates the end profile. It does **not** rigidly rotate a perpendicular cross-section around an arbitrary3D axis, change/taper the profile, or curve the run. Enter the dimensions of the declared end planes, not an assumed perpendicular beam section.

The offset components use the other two global axes: X→Y/Z, Y→X/Z, Z→X/Y. Negative offsets are supported. The start profile is translated by `max(0,−offset)` in each lateral axis so the member coordinate envelope remains nonnegative. The UI states that start shift. Record the drawing/datum basis and enter bar coordinates in the resulting member coordinates; existing bar points do not rotate or translate automatically when the concrete changes.

For a1000×1000mm profile with axis advance1000mm and lateral offset750mm, true run is1250mm, concrete1m³, selected full formwork6.5m². A bounding box would incorrectly give1.75m³; area multiplied by inclined run would incorrectly give1.25m³.

## Physical calculations and display

- Net profile area is the existing validated outer polygon minus fully through holes.
- Volume = net profile area × principal-axis advance. Translation/shear preserves this volume; true run length is not substituted.
- Each selected side area is the magnitude of the3D cross product of its profile edge and the run vector. Selected end area is the net profile area. Existing manual deductions and occurrence multiplication remain separate.
- Hole walls follow the same translation. Path/material checks inverse-transform each straight segment, including concave boundaries and holes. Cover measures distance to actual side quads and cap triangles; a20mm perpendicular clearance fails the entered40mm cover +8mm bar radius requirement.
- 3D uses physical surfaces. Sections along the run axis translate the profile; other sections clip material in profile space and map it into the actual cutting plane. Projected silhouettes union all physical surface projections so holes remain visible only where the viewing ray misses concrete throughout the run. A through hole can therefore be physically present but occluded in a plan projection.
- The displayed width is the silhouette/cut envelope along that view axis, labeled **กรอบภาพ / view span**. It is not an individual profile-edge or outside-bar dimension. The BOQ method explicitly uses **axis advance (not inclined run)**. Legacy view labels and v1 numerical behavior remain unchanged.

Boolean clipping for displayed views uses pinned `polygon-clipping0.15.7`; it does not calculate takeoff/cover or certify geometry. [Primary API](https://github.com/mfogel/polygon-clipping). Package/runtime license notices ship in `public/third-party`.

## Saved inputs, compatibility and files

The geometry input uses strict `prismGeometry.version=2` with required finite `endOffset:[u,v]`. Existing profile/holes budgets and200000mm maximum final envelope remain enforced. Unknown versions, invalid loops, overlapping/touching holes and mixed prism/box/pedestal/beam/context definitions are rejected. There is no blind opening, changing section, curved run or union with placement context.

Spec policy `concrete-prism-2.0` is explicit and has a distinct immutable engine suffix. Policy2 can retain v1 geometry without converting it; a v2 member blocks downgrade to policy1 or legacy. Geometry editing resets Draft and bar confirmations and invalidates stale no-rebar statements. Schema/copy/portable-input preservation, actual Frozen capture, original v1/v2 Frozen bytes and actual Backup/Restore of all six categories/negative hole geometry are verified. No stored engineering case/run persistence or Issued is enabled.

Excel adds end-offset U/V, axis advance and formed3D side area to **Prism Edges** for exports containing v2. Each member's first edge M:O is the single vector/advance reference; subsequent rows link to it. **Prism Check** links its advance to that source and derives volume/formed area. Changing these references in a read-only in-memory QA copy updates diagnostic geometry while captured BOQ/BBS remain unchanged. Source/datum notes, confirmations and drawings remain captured records rather than editable-engine output. Original workbook files are not saved by QA.

Actual A3/A1 outputs carry Frozen/NOT FOR CONSTRUCTION, unmapped material/Code99 and partial BS checks. The synthetic bar centreline is1130mm; captured cutting length is1150mm with configured25mm upward rounding,2 bars/element and3 elements =6 pieces. This verifies software arithmetic and positioning, not engineering/fabrication acceptance or reconstructed GULF bars.

## Scope of evidence

1013 unit cases/63 files and17 actual local SDK/compiled-UI paths pass. Two XLSX cover all six categories and ZoneA. Full project concrete7.84m³/formwork53.48m² are geometric QA values; five members still lack BBS and complete steel remains unavailable. Two actual A3/A1 files contain8 reviewed pages, with8 read-only worksheet views and2 native Excel recalculation/sensitivity runs/4 printed sheets. Native driver change1000→1500 gives1.5m³/8.354101966m² diagnostic values while captured BOQ stays1m³. Actual cross-project copying rejects an incompatible target policy, preserves the negative vector/profile, remaps hole IDs and uses newly entered occurrences while leaving its source unchanged.

User-owned Rules/config/.env/Auth/Firebase initialization and supplied BS/GULF bytes remain unchanged. Tests use only the isolated local Firebase services; no production write, service restart, Cloud Functions or deployment. Local/client tests do not provide server protection against direct writes or older clients. Actual GULF reconstruction, approved BS/ACI/material/closure reference cases, owner/Issued, stock consumption and production acceptance remain pending.

[Scoped evidence](../output/inclined-prism-verification/DEVELOPMENT_REPORT.html) · [Axis-only v1 guide](POLYGON_CONCRETE.md) · [All12 original requirements](CURRENT_REQUIREMENTS_STATUS.md)
