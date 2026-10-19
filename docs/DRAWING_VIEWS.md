# Saved primary views and sections — v0.55

Open a saved member and select **ภาพหลัก / รูปตัด**. Choose a primary XY plan, XZ elevation or YZ elevation. Save one to six named sections, each with its normal axis and position in mm, and enter the drawing/reference basis. The column preset starts an XZ elevation and a Z section at the member midpoint; it is a starting input that must be checked against the drawing.

| Normal axis | Section plane | Position means |
| --- | --- | --- |
| X | Y/Z | Distance along the member X datum |
| Y | X/Z | Distance along the member Y datum |
| Z | X/Y | Height along the member Z datum |

Positions use the same member coordinates as bar paths. Convert a drawing's absolute elevation into local Z using its confirmed member datum; the app does not infer that datum or convert an elevation automatically. Sections are orthogonal to X/Y/Z. Oblique or arbitrary cut planes are not supported. A cut line appears on the primary view only when the plane can be represented as a line in that view.

IDs, names and planes must be unique. Positions must be finite, nonnegative and inside the member bounds. Names support letters/numbers and an optional hyphen, up to12 characters. A required reference/basis supports up to500 characters; update that text when the basis or cut position changes. These inputs describe views and do not reconstruct reinforcement from an attached drawing.

Changing saved views returns the member to Draft and clears bar placement confirmations. Existing BS dimensional confirmations remain when only the views change. Confirm each Mark against the applicable drawings before review. Selecting a section in the viewer changes only the local display: it does not save data, change quantities or clear confirmations. Assigned viewers and Frozen previews may browse sections but cannot edit them.

The viewer uses the actual cut plane for concrete/openings/context and bar traces. Marks that do not intersect it remain listed without a false leader. Existing Mark search/group selection works on the selected section. 3D geometry and numeric BBS/BOQ are unchanged.

Excel adds **Drawing Views** with typed member-plane/section/axis/position and the saved basis. BBS rows and totals remain a single quantity set. PDF summary sheets repeat for each section and each existing Mark group; repeated summaries are drawing views of the same schedule, not additional demand. Individual detail references retain their original Mark indices. PDFs add a saved-view input appendix. Owner-frame output gets continuous final numbering across the appendix; legacy generic frames retain their existing summary numbering and a separately numbered appendix. Print at the requested A3/A1 size and review the real exported file. Schematic/NTS views are not a scale measurement source.

Older members without these inputs retain their XY plan and original Y section. Existing Frozen revisions preserve their own views and basis. Backup/Restore retains both current inputs and original Frozen/file bytes; restored current members remain Draft with confirmations cleared. Copying a member remaps section IDs and retains its entered view basis for review under the target project.

Close or reload older application versions before using this feature. Old clients are not certified to retain the new fields. The numerical engine remains `geometry-2.2+bs8666-2000-v7`; presentation fields do not introduce a new numerical policy or enforce a minimum client version. The supplied BS8666:2000+Amd1/2 startup minimum stays unchanged. Code33, code51 physical closure, full edition-specific BS/ACI and owner/engineering acceptance remain pending.

The local fixture uses GULF2C1-100 printed concrete dimensions700×700×6600mm, but its five straight bars are explicitly synthetic and do not represent GULF Marks4/309/5. The concrete3.234m³/formwork18.48m² and synthetic steel40.563239033502256kg stay unchanged after adding three sections. See the [actual local report](../output/section-views-verification/DEVELOPMENT_REPORT.html). It covers compiled UI, saved views, both Frozen histories, unchanged local Rules/security, actual XLSX/basic/detail PDF exports and Backup/Restore. Other drawing layouts were updated through the shared helper but were not visually accepted in this iteration. Native Excel printing, real GULF reinforcement, Issued and production remain unaccepted. User-owned Rules/config/Auth were not changed or deployed.
