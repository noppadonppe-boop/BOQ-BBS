# Slab floor (พื้นทั้งชั้น · Slab layout `floor`) — round S1

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
- **Marks**: equal bars (shape, Ø, layer) of one slab mark share a Mark — placed by spacing when evenly spaced along one
  axis, else by offsets (≤ 2000 per set). Names `S1-B01` bottom, `S1-T01` top / extra / U, `S1-OP1` trimmers,
  `S1-OD1` diagonals; the note starts with the layer (B1 / B2 / T1 / T2 / T1/B1 for U bars) and lists the panels.
- **Owner**: bar id `gen-<owner>-<kind><nn>`; owner = shape-model bar group `g<mark>` (tag = mark) when the mark has ≥ 2
  panels, else the panel. `barOwner()` accepts `gen-<id>-` ids.

## Sheets

`tagSheetSets()` groups owners by slab mark for a floor (`sheetOwners`: one owner per mark with the ids of its panels +
its group): with “แยกตาม Tag” each mark gets its own set (its panels' concrete, every bar of the mark), then the summary.
The sheet itself is the existing A3 layout (S2 adds the dedicated slab sheet).

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

## For S2 (slab BBS sheet)

- Bars carry layer in `note` (`B1 · …`), kind in the id (`-b`, `-t`, `-op`, `-od`) and Mark; panels per Mark in the note,
  owner per mark (`g<mark>` / panel) via `barOwner`; `floorBars(input, det).raw` gives every bar with `panels`, `layer`, `kind`.
- Geometry: `floorShapeModel()` / `member.shapeModel` (panels tagged, voids, beams `reference` + `castWith`), grids in
  `elementInput.floor` (`gridRef` for labels), beam rectangles `floorBeamRects()`, shift = `normaliseShape(...).shift`.
- Per-mark sets come from `tagSheetSets` (`sheetOwners` floor branch); plan views for top / bottom bars need a layer filter
  (face `top` / `bottom` + note prefix).

## For S3 (real beams)

- `floor.beams[]` has `mark`, `along`, `line`, `from`, `to`, `width`, `depth`, `offset` → beam group spans along each line
  (`gridAt` positions, crossing beams give supports); `beamRect()` = plan box (ends to the crossing beams' far faces).
- Slab concrete already stops at the beam faces; when beams become members, drop `castWith` references or keep them as
  context. Slab bars already anchor / lap inside the beam boxes (`genfb` regions) — the beam member must accept them as
  context or the regions stay.
- Beam depth is “including the slab” (top = floor level); lowered panels do not lower the beam.

## Tests

`tests/slabFloor.test.ts`: schema / grid refs / blockers, 4 × 3 grid (6 panels, concrete = Σ panels, soffit only), L panel,
opening 800 × 600 (cuts, trimmers, Ld, diagonals, deviate), extra top bars (face / centre / L/4 / L/3 / bend / U), continuous
bottom bars (laps at beams ≤ stock), lowered panels (−50 crank, −150 separate + anchors), drops / sunken, Marks across
panels, sheet sets per mark + DXF (`output/dxf-verification/slabFloor-*.dxf`), member round trip, single slab unchanged.
