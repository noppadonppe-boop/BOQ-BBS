# Slab floor (พื้นทั้งชั้น · Slab layout `floor`) — rounds S1 + S2 + S2.1 + S3

One Slab member holds a whole floor on a grid: grids → reference beams → panels cut at the beam faces → slab marks
(เบอร์พื้น) from the slab list → openings / drops / lowered areas placed by grid + distance → bars and quantities.
Plan of the rounds: **S1** (this) → S2 slab BBS sheets → S3 beams as real members → S4 drawing from PDF / DXF + AI.

## Data (`src/domain/slabFloorSchema.ts`, stored in `member.elementInput`)

`slabSchema.layout: 'single' | 'floor'` (default `single`: old slabs parse unchanged) and `floor`:

| field | meaning |
|---|---|
| `level` | top of slab reference level (m) |
| `gridsX` / `gridsY` | `{label, at}` mm, ≤ 30 each; X and Y labels must differ |
| `beams` | `{id, mark, along X\|Y, line, from, to, width, depth, offset?}` — reference only in S1 (≤ 120) |
| `marks` | slab marks `{name, thickness, support, rebar: SlabRebarSpec, template?}` (≤ 20) |
| `panels` | `{id, mark, tag (unique, e.g. S1-01), outline (polygon mm, cut at beam faces), thickness (0 = mark), top (mm from level, − = lowered), rebar? (partial override)}` (≤ 100) |
| `openings` | `{id, label, panel?, shape rect\|circle, x, y (lower-left), w, h, trim}` (≤ 40) |
| `drops` | `{id, label, kind drop\|sunken, outline, depth, rebar crank\|separate}` (≤ 30) |

`SlabRebarSpec`: `shortBottom` / `longBottom` / `shortTop` / `longTop` (Ø + spacing, 0 = none), `topExtra`
`{Ø, spacing, length: {mode fixed, value, from face|centre} | {mode ratio, n 3|4}}`, `edge bend|ubar`,
`bottomAtBeam continuous|stop`. The slab list (`spec.slabTemplates`) gained optional `topExtra` / `edge` / `bottomAtBeam`
(column “บนเสริม” in General Spec; old lists read as “none”); `floorMarkFromTemplate()` turns a list row into a mark.

Opening `trim`: `method cut|deviate|none`, `bars 'area' | {count, Ø}`, `ext 'ld' | 'lap' | mm`, `diagonal`, `layers both|bottom|top`.

Grid references: `gridRef(grids, v)` → `B +1,200`, `parseGridRef(grids, 'B +1,200')` → mm (plain numbers = absolute).

## Geometry and quantities (`slabFloor.ts` → `floorShapeModel`, `applySlabFloor`)

The floor becomes `member.shapeModel` on apply (floor coordinates, then normalised; bars and regions shift with it):

- panel = polygon solid (`tag` = panel tag, `formBottom` when elevated), z from `top − thickness` to `top`;
- opening = void through every level; drop = solid under the host panel; sunken = void on top + solid below;
- beam = `reference` part with **`castWith: true`** (new): no quantity, and solid faces against it get **no formwork**
  (`shapeGeometry` tests a point 2 mm outside each region edge); `shapeModel.soffit` (new) forms the lowest level too.
- Slab concrete is counted **between beam faces** (decision 3: beams count full depth in their own members, S3).
- Placement regions `genfb<k>` = beam boxes (bars run through / anchor in them); `REGION_LIMIT` is now 64, collinear beams
  merge when a floor has more. Shape models may hold 160 parts (the shape editor still adds ≤ 40).
- Slab-on-ground panels: lean / sand / sheet / compaction over the ground panels' area (equal-area square, no projections).

`slabFloorProblems()` (blockers, apply refused): grid labels / positions repeated, missing grids, panel overlaps,
panel over a beam, opening outside its panel or over a beam, drop outside one panel, thickness vs covers, marks missing,
> 160 shape parts.

## Bars (`floorBars` → raw bars, `groupFloorBars` → Marks)

Layers per panel: B1 = short-span bottom (outer), B2 long; T1 = short-span top (outer), T2 long. Short span = shorter
side of the panel's bounding box.

- **Bottom**: bar lines per panel at ≤ spacing over its extent, intervals of the polygon at each line (L panels work).
  `continuous`: pieces of the same line, layer and Ø join across a beam (level difference ≤ 75 → crank 1:6 centred on the
  beam, Shape 26); a run longer than the stock length is split with laps centred on the beams crossed (else mid-span).
  Ends in a beam: `min(w − cover − d/2, max(150, w/2))` past the face. `stop`: no joining.
- **Top mesh** (when the mark has one): joins over interior beams; at an edge beam it runs to the far face − cover and
  turns down (90°, leg ≤ 12d + r, limited by the beam depth); `edge: ubar` → straight + U bars (Shape 21) at the edge
  (also at free edges).
- **Extra top bars** over each beam, perpendicular to it, along the length where panels touch the face: `fixed` from the
  face / centre, `ratio` L/n of the **longer** clear short span of the two panels; across interior beams one bar (crank
  when the panel tops differ ≤ 75). Edge beams: bend down into the beam (Shape 11 — the brief said “Shape 21”: a bar
  with one bend is BS 8666 code 11) or a U bar (`ubar`, Shape 21). Levels > 75 apart: two bars, each bent into the
  beam (“แยกต่างระดับ งอฉากยึดในคาน”).
- **Openings** `cut`: bars stop at edge + cover; trimmers parallel to the cut bars on both sides, per side
  `⌈cut / 2⌉` of the layer Ø (`area`) or the given count / Ø, `gap = max(2d, d + 25)`, length = opening + 2 × ext
  (`ld` = Class-B lap / 1.3 ≥ 300, rounded up 25; `lap`; mm), kept inside the panel; diagonals at the 4 corners per
  layer (bottom: on B2, top: under T2 when a top mesh exists), 2 × ext long, shortened to stay in concrete.
  `deviate` (≤ 300 mm, else falls back to `cut` with a warning): bar lines through the opening move beside it.
  Warning when more than half of a panel's bars are cut. Live statistics: `floorBars().openings` (cut X / Y, trimmers,
  diagonals, kg) in the editor.
- **Drops**: `separate` (or depth > 75) = own bottom mesh in the drop; `crank` ≤ 75 = panel bottom bars dip 1:6 inside it
  (only lines ≥ cover + d/2 inside). **Sunken**: `crank` ≤ 75 = top and bottom bars dip; else top bars (and bottom bars
  that no longer fit) are cut around the area, the area gets its own bottom mesh and a lowered top mesh running Ld into
  the slab when it stays above the slab's bottom bars (else a warning to check the anchor bars).
- **Spacing**: every layer uses the same rule as a single slab (`spreadAt` in `slabFloor.ts` = `spread` in `elementInput.ts`):
  bars from cover to cover, count = ⌈span / spacing⌉ + 1, spread evenly — so the drawn spacing is the design spacing or a
  little less (e.g. @194 for @200). Raw bars carry the design spacing (`Raw.s`, not stored); `groupFloorBars(…, spacing)`
  reports it per Mark → `floorDesignSpacing(m)` for the sheet labels.
- **Diagonals** of opposite corners are drawn the same way (left → right), so the two of one direction share a Mark
  (`S1-OD1` × 2) — S2.1, count and weight unchanged.
- **Marks**: equal bars (shape, Ø, layer) of one slab mark share a Mark — placed by spacing when evenly spaced along one
  axis, else by offsets (≤ 2000 per set). Names `S1-B01` bottom, `S1-T01` top / extra / U, `S1-OP1` trimmers,
  `S1-OD1` diagonals; the note starts with the layer (B1 / B2 / T1 / T2 / T1/B1 for U bars) and lists the panels.
- **Owner**: bar id `gen-<owner>-<kind><nn>`; owner = shape-model bar group `g<mark>` (tag = mark) when the mark has ≥ 2
  panels, else the panel. `barOwner()` accepts `gen-<id>-` ids.

## Sheets (round S2, `src/domain/slabFloorSheet.ts`)

Floor members get their own sheet; single slabs and every other category draw exactly as before (snapshot test).

- **Paper / paging** (`sheetFormat`): A2 unless the member chooses a size; a set whose plan does not fit A2 at
  1:100 goes on **A1** (S2.1: per-mark sets too) (`floorPaperSize`; A1 = 841 × 594 added to `sheetSizes`). The layout is always split with the **drawing
  sheet(s) first**, then the BBS table pages (`layout()` → `firstView` / `firstTable` / `viewPages`), + one steel summary page
  for whole-floor sets.
- **System layout “พื้น (Slab Floor)”** (`floorSystemLayout`, used by `resolveSheetLayout` → `from:'system'` when the member
  has no layout and the project no default template): see “Readable sheet (S2.1)” below for the current
  arrangement. Editable in the Composer like any layout (writes `member.sheetLayout`).
- **Plans** `plan-bottom` / `plan-top` (`ViewSpec.floor {layer}` → `buildViewOne` floor branch, `floorPlanData`): rows filtered
  by `floorRowLayer()` (kind from the id: B → bottom, T → top, OP / OD by the layer token of the note); focused panels =
  concrete, other marks faded (`floorFocus()` = panels still solid in the set's shape model); grids + bubbles; reference beams
  dashed; openings crossed; drops dashed. Representative mode: per Mark one entry **per panel it crosses** (the bar drawn once,
  a distribution line inside each panel, label `S1-B01 DB12@200 (B1)`, Drawing Edit key `mark:<bar id>@<panel tag>`).
  Colours by layer (`floorRoleColors`: B1 / B2 / T / OP / OD). Extra top bars get a semantic dimension chain across the beam
  (`fdim:<id>@<panel>`, projection text `<> (L/4)` in ratio mode); opening trimmers across the opening (details). Plan
  dimensions = overall + grid to grid.
- **Sections** `def-x` / `def-y` (`defaultSections` floor branch, `floorSectionCuts`): through the representative panel of the
  set — a panel with a drop first, then a lowered panel, else the largest — cropped (`extent`, S2.1: panel + beams + 1,200); the titles say
  what they pass through.
- **Opening details**: one automatic Detail view per opening of the focused panels (`floorDetails()`, id `op-<opening id>`,
  label D1, D2 …, parent `plan-top`, square window = opening + extension + two spacings, S2.1) drawing every bar of both layers near the
  opening, labels of the OP / OD Marks only, the trimmer dimensions and a note (`openingDetailNote`: cut bars X / Y, trimmers,
  extension, diagonals, kg). Not stored; user details (`drawingEdits.details`) are drawn too; D bubbles on the top plan.
- **Paper views** (ViewKeys `schedule` / `legend` / `keyplan` / `stddet`, `drawFloorPaper`): slab schedule of the set's marks
  (thickness with lowered levels, bottom / top short / long, extra top bars), legend + warnings (marks without top bars,
  openings cutting more than half of a panel, views off their scale), key plan (whole floor, set marks highlighted — by mark
  colour in whole-floor sets), standard details drawn from the project values (edge bend / U, lap at the beam, drop, lowered
  slab). Placed / moved in the Composer; drawn on paper (no viewport) in DXF.
- **Presentations** (sheet toolbar, `setup.parts`): “เฉพาะเบอร์พื้น” (`tag`) = one set per slab mark (`tagSheetSets`, set
  `floor {mode:'mark'}`, title “แบบเหล็กเสริมพื้น S1 · ชั้น 2”) + the summary set; “รวมทั้งชั้น / หลายเบอร์” (`model`) = one
  set of the picked marks (`drawingSetup.partTags`, none = all) with the BBS **grouped by slab mark** (`floorTableItems`: a
  header row per mark) and a summary page kg per mark × size + totals (`floorSteelSummary`). `drawingSetup.floorMerge`: equal
  bars across marks (shape code, Ø, grade, cut length, legs) share one Mark `SF-nn` (`mergeFloorMarks`: ids kept, `slab` /
  `uses` on the rows, table note “ใช้ใน S1 × 24 · S2 × 12”).
- **Excel**: sheets “Slab BBS” (bars by slab mark: layer, Mark, size, shape, cut length, counts, kg) and “Slab Summary”
  (mark × size) appended after every existing sheet (`src/data/slabFloorExcel.ts`).
- **CAD layers**: roles `barBottom` / `barTop` (defaults S-REBR-BOTM / S-REBR-TOPP) for floor bars in plans and sections;
  stored standards without them fall back to the barMain layer (`cadStandardOf`).
- **Chairs / spacers** (`spec.slabAccessories`, General Spec “พื้นทั้งชั้น · Chair และลูกปูน”, spec import key
  `slabAccessories`; default off): copied into the slab detailing by `detailingFromSpec` (key only when enabled), then
  `applySlabFloor` adds site items `gen-slab-chair` (pcs per m² of panels with top bars), `gen-slab-chair-kg` and
  `gen-slab-spacer` (pcs per m² of every panel). Bars and concrete are unchanged.

## Readable sheet (round S2.1)

- **Plan labels in the panels** (`placeFloorLabels` in `elementViews.ts`, run after every other annotation of the view): each
  label is searched around its bar point inside its own panel (Detail: the window), then anywhere in the view; it never
  touches another label, a text / dimension / grid line / bubble / opening, leaders never cross, fewest bar lines under the
  text, then the shortest leader; a label left without a spot is moved to the front and the view placed again (≤ 6 rounds).
  Anchors: the k-th Mark of N in a panel takes the bar at (k+1)/(N+1) of its set and a staggered point along the panel,
  away from openings (`floorPlanData` slots). Default `drawingSetup.floorLabels` 'typ': the full label once per Mark (first
  panel, top-left first), “TYP.” on the first of panels with exactly the same Marks, short code (`B01`) elsewhere; toolbar
  “ป้ายทุกแผง” = 'all'. The Mark label check (`labelReport`) finds nothing on the plans of the test floor.
- **Panel tags follow the slab mark** (S3 task 0): `retagPanels()` gives automatic tags `<mark>-nn` (editor + every apply =
  migration of saved floors); typed tags keep (`panel.tagCustom`). 'typ' plans leave trimmers / diagonals to the opening
  detail (D bubble on both plans).
- **Label text** = design spacing (`S1-B01 DB12@200 (B1)`); trimmers / diagonals by count (`S1-OP1 4-DB12 (B1)`,
  `S1-OD1 2-DB12 (B)`, no distribution line). Where the bars are spread closer, the BBS description / Excel note adds
  “ระยะจริง @194 (แบบ @200)” (`floorSpacingNote`).
- **Paper**: plans side by side at the largest standard scale that fits (`floorPlanScale`); smaller than 1:100 on A2 → A1
  (`floorPaperSize`, whole floor and per-mark sets), notice in the sheet toolbar.
- **System layout** (`floorSystemLayout`, artboard 10 revised): right column 22 % = schedule sized to its rows, compact legend,
  key plan ≈ ¼ of the column, standard details in the rest (cells close to 2 : 1); under the plans the opening details at
  1:20 (stacked at the right, never scaled down — the next sheets when they do not fit) and the sections X–X / Y–Y stacked
  in the rest. Layouts saved from the Composer are untouched.
- **Sections**: cropped to the cut panel + the beams + 1,200 of the neighbours (`floorSectionExtent`), break lines where the
  slab runs on, level marks on the surface (`T.O.S. ±0.000`, lowered `−0.050`; datum = floor level) instead of the height
  chain; the layout asks 1:25 when the crop fits (with room for the level marks), else the largest standard scale.
- **Opening details**: window = opening + Ld + two spacings; bars outside opening + Ld + one spacing faded
  (`openingDetailFocus` → `ViewData.floorFocus`).

## UI

`components/SlabFloorEditor.tsx` inside the Slab input panel (“พื้นแผ่นเดียว / พื้นทั้งชั้น (กริด)”): toolbar (select,
grid, beam, panel, opening, Drop / ลดระดับ, undo / redo, 3D, “สร้างเหล็ก + ใช้กับสมาชิก” = the existing apply), left =
grid tables, “ดึงจากกลุ่มคาน” (labels + cumulative span lengths of a beam group, one direction at a time — beam groups
have no plan position yet), beam size + “คานทุกแนวกริด”, “สร้างแผงจากช่องกริด”, beam list, mark summary; plan SVG
(bubbles, dashed beams, panels coloured by mark, openings / drops draggable with snaps to grids / beam faces / panel
edges, corner grip resizes, beam tool toggles a grid segment); right = selection properties (panel: mark, tag,
thickness, top, vertices as grid refs, overrides; opening: grid refs, size, shape, trim + live result; beam; drop;
none = slab marks + “เพิ่มจากตารางพื้น”). Floor members hide the shape / rebar tabs (their shape model is derived).

## Limits (S1)

Orthogonal grids only; beams are references (no beam concrete / bars, no beam-to-beam framing detail); one level per
member; ground layers without projections; drops / sunken areas must lie inside one panel; slab templates are copied
into marks (not re-synced by the spec-change job yet).

## S2 inputs (done)

- Bars carry layer in `note` (`B1 · …`), kind in the id (`-b`, `-t`, `-op`, `-od`) and Mark; panels per Mark in the note,
  owner per mark (`g<mark>` / panel) via `barOwner`; `floorBars(input, det).raw` gives every bar with `panels`, `layer`, `kind`.
- Geometry: `floorShapeModel()` / `member.shapeModel` (panels tagged, voids, beams `reference` + `castWith`), grids in
  `elementInput.floor` (`gridRef` for labels), beam rectangles `floorBeamRects()`, shift = `normaliseShape(...).shift`.
- Per-mark sets come from `tagSheetSets` (`sheetOwners` floor branch); plan views for top / bottom bars need a layer filter
  (face `top` / `bottom` + note prefix).

## Beams from the floor (round S3)

“สร้าง / อัปเดตคานจากแปลนพื้น” turns every beam line of the saved floor into a real beam-group member (`src/domain/floorBeams.ts`,
command `syncFloorBeams` in `src/data/direct/floorBeams.ts`, UI `components/FloorBeamsDialog.tsx`).

- **Lines**: segments on one grid line with one offset; touching segments form a run → one member `<floor>-B-<line>`
  (`-<run>` when a line has separate runs, `-<part>` when a run has > 12 spans: equal parts sharing the split station).
- **Stations** (span ends) on the grids of the run where the beam is supported — a column (`floor.columns`, reference
  only, size X × Y or a Column Template; `support` = size along the beam, `supportY` = across), or a crossing beam that is
  primary over this one (`support` = its width) — where the mark / size changes, and at both ends. Primary at a crossing:
  `rank` when set (editor “คานหลัก / คานรอง”, per line), else the deeper beam, else the one along X (`primaryOver`).
  A primary beam ending on a crossing beam without a column runs on over its half width (`placement.ends`, read by
  `beamGroupLayout`: the first / last span starts / ends past the grid). A free end of a run of ≥ 2 spans = cantilever.
- **Spans**: length grid to grid, width / depth / mark from the segment, top = floor level (beam depth includes the slab).
  Concrete per span between the support faces (column / primary beam) — beams counted full depth, slab between the beam
  faces (S1), so beam + slab = hand total without overlap; the column–beam joints are left to the columns (no members yet).
- **Bars**: Beam Template of the mark (`spec.beamTemplates`: bars + template id; the size stays the plan's, a different
  template size gives a warning), else the group defaults (`plainBeamRebar`) + “คาน B2 ยังไม่มี Template”.
- **Data on the beam input** (optional, old groups unchanged): `placement {floorMember, along, line, from, to, offset, level,
  ends?}` and `floorSource {kind 'slabFloor', floorMember, floorCode, floorVersion, beamIds, part, generatedHash}` — named
  `floorSource` because every element input already has `source` (the drawing it was read from).
- **Ownership**: the floor owns the geometry (lines, spans, sizes, supports, level, marks); the beam member owns the bars.
  `planFloorBeams()` statuses: new · update (bars kept by span mark: rebar + template, cover / detailing, extra top bars by
  grid label) · same (geometry hash = `generatedHash`, occurrences and beam ids equal: nothing written, so a repeat is
  idempotent) · edited (the member's own geometry hash differs from `generatedHash`: written only when “เขียนทับ” is ticked) ·
  removed (a linked member whose line left the plan: marked “ไม่อยู่ในแปลนแล้ว”, deleted only by the user after a confirm) ·
  conflict (code used by another member). Occurrences = the floor's (zone / floor / WBS link / quantity).
- **Command** `syncFloorBeams` (admin / qs): ≤ 25 members and ≤ 4 MiB per call (the dialog sends batches), request id
  idempotent (`projectTransaction`), the floor must still be at the planned version, an existing member may be overwritten
  only when it is linked to this floor, members saved as saveMember does (Draft, version + 1, review “จากแปลนพื้น …”).
- **UI**: floor editor tool “เสา” (click a crossing; “เสาทุกจุดตัดกริด”), beam properties “คานหลัก / คานรอง”, beam list with
  the linked member chips (ล่าสุด / ต้องอัปเดต / แก้เองแล้ว / ไม่อยู่ในแปลนแล้ว, click = open), the dialog (preview table,
  warnings, overwrite ticks, delete of removed lines, approx. concrete). Beam group page: banner “สร้างจากแปลนพื้น FL2 ·
  แนว A” + open the floor + “ยกเลิกการเชื่อมกับแปลนพื้น” (drops `floorSource`, keeps the geometry); geometry fields locked
  while linked, bars editable. Floor 3D: beams of linked lines solid, the rest faint. `openMember()` (window event) opens a
  member on its category page.
- **Floor side**: beams stay `reference` parts + `castWith` in the floor (no double count); the `genfb` placement regions stay
  (slab bars anchor in them).
- **Copy / backup**: restore keeps member ids, so `floorSource.floorMember` stays valid; a member copy drops `floorSource`.

For S4 (drawing from PDF / DXF + AI): the floor is the single source of the beam geometry — read grids, beam lines (mark,
width, depth, offset), columns (size) and panels into `elementInput.floor`, then run the same generator; beam bars come from
the Beam Templates (read the beam schedule into `spec.beamTemplates` by mark). Beams off the grid lines need grids (the
generator works on grid labels). Columns are references only — column members are still to come.

## Tracing / Import (round S4a)

A real plan becomes the floor in two ways, without AI: draw over a background drawing, or read a DXF.

**Underlay** (`floor.underlay = {attachmentId, page?, transform {scale, rotation, tx, ty}, opacity, locked, hidden, align?}`,
`src/domain/underlay.ts`): one PDF / DXF / PNG / JPEG attachment of the member or the project (`memberId ''`) under the plan.
Source coordinates = DXF drawing units or PDF page points (y up, `page.view`); floor mm = scale · R(rotation) · source + t.
The first placement uses the file's units (DXF `$INSUNITS`), the page calibration (`attachment.calibrations[page].mmPerPoint`)
or 1:100 (`PDF_1_100`), lower-left corner at the first grids. **Two-point alignment** (`alignTwoPoints`): click two grid
crossings in the drawing (snap = intersections of the longest lines near the click, `snap(…, {long:true})`), pick the plan
crossing (X / Y) for each → similarity (scale + rotation + shift; within 0.01° of a right angle it is squared); the error at
every other plan crossing that has a drawn crossing within 300 mm is shown before “ใช้การจัดแนว” (`alignResiduals`).
Display only: no quantities, never in the sheets / PDF / DXF, left out of the drawing-status hash (`drawingModelHash`), not
copied with the member (`copyMemberInputs`), restore points it at the restored file (`remapUnderlay`). Viewers see it and can
hide it for themselves.

Readers (`src/domain/cadEntities.ts`, pure; browser loading + raster in `src/data/underlaySource.ts`): `dxfDoc()` = dxf-parser
model space with INSERT blocks expanded (layer 0 in a block takes the INSERT's layer, bulges as arcs), `pdfDoc()` = pdf.js
`getOperatorList()` painting `constructPath` operators with the current transform (cm, q / Q, form XObjects) → polylines in
page points; a page with fewer than 20 pieces is a scan (picture only, no snap). **Snap** (`SnapIndex`, toolbar “Snap กับแบบ”):
hash grid over the pieces → intersection / end / centre / middle / nearest within 12 px; over `SNAP_LIMIT` (200,000) pieces
only the visible window is indexed (rebuilt on zoom / pan). Plan tools that use it: alignment picks, the grid tool (click a
drawing line → a grid X / Y at it), opening placement / move / resize corners. Zoom = Ctrl + wheel, pan = drag the background
(select tool) or the middle button.

**Import from DXF** (`components/FloorDxfImport.tsx`, 3 steps): 1 layer roles (`grid`, `gridLabel`, `beam`, `column`,
`opening`, `slabMark`, `text`) guessed from the project's earlier imports (`floor.importMap` of this and the other floors) and
then from the layer names (`roleFromName`: GRID / AXIS, BUBBLE / TEXT, BEAM / BM, COL, OPEN / HOLE / VOID, SLAB, TEXT / ANNO);
2 units (`$INSUNITS`, else asked) and a window dragged on the drawing (one plan of a sheet); 3 the proposal over the drawing,
one row per item with add / edit / remove / same against the current floor, tick and “ใช้กับแปลนพื้น” = one commit (one undo).
The import stores the layer map on the floor and, when the floor has no other underlay, sets the DXF as the underlay at the
imported origin.

Rules (`src/domain/slabPlanImport.ts`, `readFloorPlan(ents in mm, roles, {source, floor, slabMarks, beamSizes})`):
- grids: axis-parallel lines on grid layers (or CENTER / DASHDOT linetype when no grid layer) ≥ 25 % of the longest, grouped
  within 2 mm; label = text inside a bubble circle at a line end, else a grid-label text beyond the end, else A, B … / 1, 2 …
  (warned); oblique grid lines are counted and warned (not read). Origin: grids with the labels of the current floor keep
  their place (median shift), else the first grid of each direction = 0.
- beams: pairs of parallel lines 150–1,000 apart overlapping ≥ 50 % with nothing parallel between them, or closed rectangles
  2.5 × longer than wide → pieces; pieces on one line with the same width joined across gaps ≤ 1,200 (columns, crossing
  beams) unless their marks differ; line = nearest grid within width / 2 + 600 (offset = centre − grid), ends = nearest grids
  within 1,500. Mark / size text `B1`, `B1 (300x600)`, `2B3 250x500` (letters with B + number, count ignored) beside the
  piece (≤ 1,200 from its face, matching direction preferred); width from the lines (a different text width is warned), depth
  from the text, the same mark elsewhere, the Beam Template, else 600 (warned, low confidence).
- columns: closed outlines / circles on column layers 100–3,000 at a grid crossing (± half the size) → size X × Y, mark `C1`
  nearby; off-crossing columns skipped, offsets not kept (warned), round = square (warned).
- openings: closed outlines on opening layers, circles there (round), or any closed rectangle crossed corner to corner;
  label `OP-1` / `H1` nearby, else OP-n.
- slab marks: texts `S1`, `S-1`, `FS1`, `S1 (t=150)` on slab / text layers → label point; the panel holding it takes the mark
  (existing names matched ignoring case and “-”; a new mark comes from `spec.slabTemplates`, else the default bars and the
  label thickness); marks missing from the project's slab list are warned.
- apply (`applyProposal`): ticked rows only; grid / beam rows rebuild the panels (`autoPanels`) and every label is re-applied;
  beams keep their id / rank when the same line is edited; nothing ticked = the same floor object.

**`FloorProposal` (contract for S4b / AI)** — every coordinate in floor mm (origin applied), grids by label:
```ts
type Evidence={handles:string[];at?:[number,number];text?:string};      // DXF entity handles / position / text read
type Item={id:string;confidence:number;evidence:Evidence};               // confidence 0..1
type FloorProposal={
 grids:(Item&{axis:'X'|'Y';label:string;at:number})[];
 beams:(Item&{mark:string;along:'X'|'Y';line:string;from:string;to:string;width:number;depth:number;offset:number})[];
 columns:(Item&{x:string;y:string;sx:number;sy:number;mark?:string})[];
 openings:(Item&{shape:'rect'|'circle';x:number;y:number;w:number;h:number;label:string})[];   // lower-left corner
 panelMarks:(Item&{at:[number,number];mark:string;thickness?:number})[];
 warnings:string[];source:{kind:'dxf'|'pdf'|'ai';attachmentId:string;page?:number};origin:[number,number]};
```
Ids: `g:X:A`, `b:X:1:A-D`, `c:A/1`, `o:1`, `m:1`. S4b fills the same object (evidence = page + position / quoted text
instead of handles) and reuses `proposalDiff` / `applyProposal` and the review step unchanged.

Accuracy (fixtures, `tests/slabTrace.test.ts`): DXF import exact (grids ±0 mm, sizes / offsets exact); two-point alignment of
the m drawing turned 90°: scale 1,000.000, −90°, < 1 mm at the 10 other crossings; vector PDF A3 1:100: snap at all 12
crossings ≤ 50 mm (0.5 mm × 100), measured < 1 mm. Real J-074 PDFs (`Referrence/J-074 Standard`): vector, 116–221,491 pieces
per page, operator list ≤ 0.5 s, reading + index < 0.1 s (ad-hoc `tmp/s4real.test.ts`); no DXF / ground truth there.

Limits: no AI (S4b), no schedule / table reading, DWG = Save As DXF, oblique grids not read, columns only at crossings
(no offset), one underlay per floor, PDF text not used for snap, HATCH not read (dxf-parser), images (PNG / JPEG) without snap.

## Import from PDF + AI help (round S4b)

**PDF without AI.** The import window is now “นำเข้าจากแบบ (DXF / PDF)” (`components/FloorImport.tsx`). A PDF page is read like
a DXF: `pdfDoc(opList, OPS, view, {texts, ocName})` (`cadEntities.ts`) keeps every painted path with its **pseudo-layer** —
the optional-content layer (OCG) name when the path is marked with one, else `#RRGGBB · width mm · dash|dashdot` (stroke
colour, width on paper, dash kind); closed paths of 4+ curves round one centre become circles; `page.getTextContent()` items
become texts on `TEXT` (page points, size = font height, `w` = measured width, so text centres are exact; page `/Rotate`
does not move them — everything stays in page space). Step 1 lists the pseudo-layers with a colour swatch and a red preview
of the chosen one; roles come from the saved maps / names (OCG) then `guessPdfRoles()`: dashed long runs (or the layer with
the most long axis-parallel runs) = grid, equal circles = bubbles, small closed rectangles = columns, rectangles crossed corner
to corner = openings, lines with a close parallel partner = beam faces. Collinear pieces are joined first (`axisRuns`, a
plotted centre line is often thousands of dashes). Step 2 = page scale: the underlay alignment (same file / page), the page
calibration, or 1 : N; positions rounded to 1 / 5 / 10 / 25 mm (default 5); the window. Source → floor = `docToFloor(doc, T)`
then the same `readFloorPlan` / review / `applyProposal` as DXF; the import can set the PDF page as the underlay.

**AI help (only on request).** Project switch “อนุญาตส่งแบบให้ AI” (`project.aiConsent {enabled, by, at}`, default off, admin
only, command `setAiConsent`, UI `AiConsentSettings.tsx` in the project settings) and the send log `project.aiSendLog` (last
200: who, when, task, file, page, window, views, provider, model; command `logAiSend`, no project version bump). Every send
is confirmed in a box naming provider / model / file / page / window and what is sent. Sent: the overview + 3 × 2 tiles of the
window cut from the page image (`windowViews`, JPEG ≤ 1,800 px), the page texts inside it with view-0 pixel positions and ids
(`textsForAi`), the pseudo-layers with their roles, the rule result as text (`ruleSummary`) and earlier answers — never the
file. Gateway task `slabPlan` (see docs/AI_DRAWING_ANALYSIS.md); the answer is checked with `aiFloorProposalSchema`
(`src/domain/aiSlabPlan.ts`, wrong shape → error naming the fields), converted with `aiToProposal()` (view pixels → page →
floor through the same T, origin of the rule result) and merged by `mergeProposals()`:
- found by both and equal → origin `both`, the higher confidence; different → the **rule value is kept and the AI reading is
  shown as the second value** (`alt`), the user switches per row (`withAlternatives`); where the rule only guessed (mark
  `B?`, low confidence) the AI value fills it and the guess becomes the second value;
- AI only → added (origin `ai`, confidence × 0.85, ticked only when ≥ 0.8); rule only → kept;
- a scan / picture (no vectors) → AI only, confidence × 0.7, **nothing ticked in advance**;
- AI layer roles can be taken into step 1 (“ใช้บทบาท layer จาก AI”) and the rules re-run; AI questions are answered in the
  review and sent again (new confirmation).
Without consent, gateway URL or provider / key the AI buttons are off with the reason; part 1 works fully.

**Schedules → templates.** Mode “ตาราง (Template)”: drag a window round a slab or beam schedule. A ruled table (row / column
lines + texts in the cells) is read by `readRuledTable()` (`src/domain/scheduleImport.ts`); otherwise “ให้ AI อ่านตาราง”
(same task, part `schedule`, `aiScheduleSchema`: header + rows as written). Header words pick the columns —
slab: MARK, THICK / t, SHORT / LONG × BOT / TOP (B1 B2 T1 T2), EXTRA TOP (“DB12@200 L/4” | “… L/3” | “… 1000” from the face),
TYPE (SOG / on ground); beam: MARK, SIZE “300x600” or B / D, TOP, BOTTOM, STIRRUP, SIDE (one ALL SPAN section, bars by
`beamRebarFromSections`). Rows are compared with the project spec by name (add / edit / same, `templateDiff`); the ticked
ones go to the spec **only through the spec-change job** (`importTemplatesViaSpecJob` → `changeSpec`: old / new spec in the
manifest, members re-checked / regenerated; admin / QS). AI-read rows are never pre-ticked.

Real drawings (J-074 `Referrence/J-074 Standard`, ad-hoc `tmp/s4bReal.test.ts`, report + SVG overlays in
`output/slab-pdf-ai-verification/`): every plan page is vector (50,000–212,000 pieces) but has **no PDF text** (CAD text
plotted as strokes) and no OCG layers; pens differ by width / colour. The rules (1:100 assumed, whole page) find the grid
lines (e.g. ISB DWG-013 p9: 10 × 13, p10 / p12: 8 × 13; GIS DWG-043 p3 / p5: 9 × 10 / 9 × 14) and some beam pairs, no
labels / marks / sizes (no text) — the grid labels come out A, B … / 1, 2 … (warned) and a window is needed to leave out the
title block. Reading the bubbles / marks / sizes there is the AI's job.

Limits: no PDF text on real CAD plots (labels / marks only with AI), page scale must be known (alignment / calibration / 1 : N),
views are cut from the 4,096 px page image (a small window gives a coarse view), one page per import, schedule rules need
ruled tables, the AI task is not deployed (owner), AI never applies anything itself.

## Tests

`tests/slabPdfImport.test.ts` (S4b part 1): colour-plot PDF (jsPDF fixture, styles per layer) → pseudo-layers and guessed
roles, proposal = the DXF proposal, floor = the hand floor; hand-written PDF with OCG layers (names = roles); the same PDF
without layers (styles only); page `/Rotate 90` keeps texts at their page positions. `tests/slabPdfAi.test.ts` (part 2):
schema accept / reject (envelope fields allowed), view pixels → floor mm (grids exact), merge (both / alternative / AI-only,
switch to the AI value, ticks, scan = none ticked, rule guess filled by the AI), consent off = no log and no gateway call /
on = log then send / bad answer rejected, `setAiConsent` admin only and `logAiSend` (refused when off, last 200, no version
bump) against an in-memory Firestore, ruled slab / beam schedules (PDF) → rows → Slab / Beam Templates (valid by schema) →
diff → the spec handed to the spec-change job. UI check on the separate emulators with a **mock** gateway
(`tmp/s4emu/mockGateway.mjs` on 5199, `node tmp/s4emu/dev.mjs` on 5182, seed `tmp/s4seed.test.ts`): consent switch, PDF
pseudo-layers + preview, rule import, AI confirmation / both readings / question, send log, consent off = AI off, schedule →
real spec-change job (Complete).

`tests/slabTrace.test.ts` (S4a): layer-name roles / beam + slab texts, DXF fixture (mm) → grids, 7 beam lines with mark /
size / offset, 12 columns, opening, S1 × 4 / S2 × 2 = the hand floor (`tests/fixtures/slabPlan.ts` `handFloor()`) with equal
S1 bars / quantities and S3 beam groups, m file = mm file, no $INSUNITS → ask, two plans + window, saved layer map guessed for
a file with other layer names, nothing ticked = same floor / ticked rows only, two-point alignment turned 90° in m (< 1 mm),
vector PDF A3 1:100 (jsPDF) segments + snap ≤ 0.5 mm × scale, snap kinds + window index, underlay without effect on bars /
quantities / sheets / DXF / drawing hash, backup restore remaps the underlay file, copy drops it. Fixture files:
`tests/fixtures/slab-plan/` (written by the ad-hoc seed `tmp/s4seed.test.ts`). UI check on the separate emulators
(`tmp/s3emu/`, project `s4proj`): images in `output/slab-trace-verification/`.


`tests/floorBeams.test.ts` (S3): 7 groups from the 4 × 3 floor with columns, beam + slab = hand total without overlap,
secondary stops at the primary face and ranks swap, deeper = primary, 14 spans → 2 groups, Beam Templates / defaults +
warning, update (lengths follow, bars kept), same = no write, hand edit detected (overwrite only when ticked), removed lines
kept, hand-made groups unchanged, task 0 tags, backup round trip / copy drops the link, command (Draft v1, request id replay
without writes, viewer refused, floor version, foreign member, > 25). UI check on separate emulators: images in
`output/slab-beams-verification/` (ad-hoc `tmp/s3seed.test.ts`, `tmp/s3emu/`, `tmp/beamSheetPng.test.ts`).

`tests/slabFloorSheet.test.ts` (S2): system layout / paging / boxes, layer-filtered plans with one entry per Mark per panel,
L/4 dimensions, sections through the lowered panel / drop, opening detail + note, schedule / legend warnings, detail
overflow, per-mark and whole-floor sets (grouping, summary page, picked marks, SF- merge), A1 / A2 / A3 paper, DXF A / B / C
(`output/dxf-verification/slabFloorSheet-*.dxf`), CAD standard fallback, chairs / spacers, Excel sheets.

S2.1 (same file): no label-check issue on the plans (whole floor + every per-mark set), labels at the design spacing /
by count, BBS spacing note, TYP. / short codes / “ป้ายทุกแผง”, cropped sections with level marks (1:25 on a small floor),
opening detail 1:20 with faded bars and the large-opening detail on the next sheet at 1:20, member totals as in v0.108.0
(672 bars, 2,281.616 kg). Before / after PNGs: `output/slab-sheet-verification/` (ad-hoc renderer `tmp/floorSheet.test.ts`).

`tests/slabFloor.test.ts`: schema / grid refs / blockers, 4 × 3 grid (6 panels, concrete = Σ panels, soffit only), L panel,
opening 800 × 600 (cuts, trimmers, Ld, diagonals, deviate), extra top bars (face / centre / L/4 / L/3 / bend / U), continuous
bottom bars (laps at beams ≤ stock), lowered panels (−50 crank, −150 separate + anchors), drops / sunken, Marks across
panels, sheet sets per mark + DXF (`output/dxf-verification/slabFloor-*.dxf`), member round trip, single slab unchanged.
