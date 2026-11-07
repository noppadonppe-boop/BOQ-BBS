# Wall Run (ผนังต่อเนื่องบนแปลน) — round W1 (+ W1.1 sheet, W2a labels round openings / haunch bar ends)

One Wall member = a **Wall Run**: the wall axis on plan (straight / L / U / box / T / drawn) over levels and pour lifts.
The system builds the concrete, formwork, every bar (corners, junctions, free ends, laps per lift, dowels, top ends,
openings, type parts) and a wall sheet with BBS per lift. Approved UX: artboards 13 (types), 14 (editor), 15 (sheet).

## Data (`src/domain/wallRunSchema.ts`, stored in `member.elementInput`)

`wallSchema.layout: 'single' | 'run'` is **optional** (absent = the old straight wall; old data parses unchanged, its
results are untouched) and `run`:

| field | meaning |
|---|---|
| `wallType` | `tank` · `lift` · `general` · `retaining` (defaults + shape + parts; everything editable) |
| `origin` | start of the first segment (plan mm) and its direction (deg from +X) |
| `path` | `closed`, `segments[] {id, length (along the axis), thickness, turn (deg, + = left)}` ≤ 24 |
| `branches` | T junctions `{id, fromSegment, at, side L/R, length (from the main axis), thickness}` ≤ 8 |
| `levels` | `{id, name, bottom, top (m), lifts 1–6, thickness? (whole level; the axis stays, both faces step)}` ≤ 12 |
| `base` | `dowel-footing` / `dowel-slab` / `continue` / `none`, `embed` `'ldh'` or mm, `kicker` mm |
| `top` | `bend-into-slab` (+ `slab` mm) / `u-cap` / `straight` / `continue` |
| `waterstop` | `{joints, material}` → BOQ item |
| `rebar` | `outer` / `inner` `{vertical, horizontal}` (Ø@s each, different faces allowed), `layers 1|2`, `corner ubar|lap-l|hook90`, `tee l-anchor|ubar`, `freeEnd ucap-edge|boundary|plain`, `edgeBar`, `boundary {length, ties, bars}`, `stagger` |
| `openings` | `{id, label, segment, face through|out|in (+depth), x (along the segment), z (from the level's wall bottom), w, h, level, repeat.levels[], trim {count, Ø, ext ld|lap|mm, diagonal}}` ≤ 30 |
| `tank` | `bottom {thickness, projection, rebar}`, `cover {thickness, rebar, manholes[]} \| null`, `haunch {size, barEnd? centre \| ld}` (W2a; absent = ld), `sleeves[] {segment, x, z, dia}` |
| `liftPit` | `{depth, bottomThickness, rebar}` |
| `retaining` | `toe, heel, baseThickness, key {width, depth}, soilSide out|in, curtail[] {at}, weepHoles, rebar {top, bottom, dist}, formSoilFace` |
| `converted` | set by “แปลงเป็น Wall Run”: vertical cut lengths follow the old wall (lap added under the base) |

Additions to the brief's model (needed by its tests): `levels[].thickness`, `openings[].level / depth`, `freeEnd 'plain'`,
`rebar.stagger`, `retaining.rebar / formSoilFace`, `top.slab`, `converted`.

Outer face: closed path = outside of the loop; open path = **right** of the travel direction. The RC wall list
(`spec.wallTemplates`) gained optional `inner {vertical, horizontal}` (absent = same as outer); `applyWallTemplateToRun()`.

## Geometry and quantities (`src/domain/wallRun.ts`)

- `runAxis` (segments, branches, outer side), `runLevels` (lifts and pour bands; tank: bottom slab `[b, b + t]`, walls
  to `top − cover`; retaining: base `[b, b + t]`, key below; lift pit: walls down to `b − depth`, pit slab under).
- `wallRunShapeModel`: one **mitred polygon per segment per level** (union → corners counted once), branches from the
  main axis, openings as void polygons (through / recess) per level, tank bottom (+ projection) / cover (+ manholes),
  haunch as an equal-area band `size × size/2`, pit slab, retaining base (toe / heel quads) + key. `applyWallRun()`
  normalises it (bars and regions shifted with it).
- Formwork from the engine (outer + inner faces, opening reveals and soffits, slab edges, cover soffit); retaining soil face
  off when `formSoilFace` is false (auto deduction with `zRange`).
- Reference regions (not quantified): `genwr-base` (footing / slab under dowels), `genwr-below` (wall below), `genwr-top`.
- BOQ items `gen-wall-waterstop` (m = joints × axis length; joints = lift joints + wall–base + wall–cover),
  `gen-wall-kicker` (m), `gen-wall-sleeve-<Ø>` (sets), `gen-wall-weep` (pcs); rebuilt on every apply.
- `wallRunLiftQuantities(member, rows)`: concrete / formwork / kg per pour band (BASE, each lift, COVER).
- `wallRunProblems()` (blockers): open closed path, turn sum, level gaps, lift > 4.5 m, thickness vs cover + bars,
  openings outside the segment / over a corner / above the level, recess depth, tank not closed, manholes outside the cover.

## Bars (`wallRunRaw` → `groupWallRaw`)

- Planes: outer vertical at cover, horizontal inside it (as the old wall); 1 layer = centre.
- Verticals per lift, **lapped at every lift joint** (`lapLength`), stagger 50 % (set B one lap higher), cranked 1:6 when
  the next level is ≤ 75 mm thinner (Shape 26), else stopped under the joint + new dowels (`S`); thicker above ≤ 75 =
  non-contact lap, > 75 = warning. Base: dowels (footing: L foot, slab: straight, embed Ldh / mm, kicker + lap), tank /
  pit L starters (outer → bottom mesh, inner → top mesh, feet inward = lap), retaining stem anchors (L toward heel / toe).
  Dowels under an opening stop below it. Top: bend into the slab / cover (L), U cap, straight, continue (+ lap).
- Horizontals per face chain: `lap-l` (and 1 layer) run round the corners, split ≤ stock length with laps placed
  inside segments away from corners and openings (closed loops: 2 laps minimum); `ubar` stop before the corner + U-bars
  (both directions, the second one bar higher); `hook90` run to the far face with a 90° leg into the other wall.
- T: `l-anchor` branch bars into the main wall inside its mesh + 90° legs (warning when the main wall < Ldh); `ubar`.
- Free ends: U caps + EDGE bars, or boundary bars + closed ties (Shape 51), or plain.
- Openings: bars cut (cover), trims / diagonals as the old wall (`ext` Ld / lap / mm), repeated levels share Marks;
  U-bar legs stop before openings. Retaining: soil-face main bars, curtailment groups at `at · H + Ld`, base transverse
  bars hooked (21), distribution bars, key U bars. Tank: bottom / cover meshes (cut at manholes + trimmers), haunch
  diagonals, sleeve trims.
- **Haunch bar ends (W2a)** `tank.haunch.barEnd`: one diagonal per inner vertical, parallel to the 45° fillet.
  `centre` (default of new tanks, `defaultWallRun('tank')` / the editor when a haunch is added) = the wall end stops at
  the wall centre plane (o = 0) and the slab end at the bottom slab mid-depth, but each end ≥ 150 mm past the face it
  crosses (wall face / slab top) and never past the opposite cover → length √2 (t/2 + size/2 − cc + h/2), cc = √2 (cover
  + d/2) + 1. `ld` (= absent: members saved before W2a keep their steel) = Ld past both faces, cut at the opposite face
  cover / the bottom cover; when cut, the bar note says “(ระยะฝังไม่ครบ Ld)” and apply warns. The section A–A label
  gives the length (`W1-B03 DB12 L=425`). UI: radio “ปลายเหล็กทแยง: ถึงกึ่งกลางผนัง / ระยะฝัง Ld” under Haunch.
- Marks `<code>-V01 / H / C / T / S / OP1 / B / K`. **W1.1:** equal bars share one Mark across lifts, faces and wall
  directions: shape relative to its last point turned about Z to a canonical heading (either polyline direction) →
  offsets + `offsetTurns` (engine turns the template about its last point), else distribution / offsets as before. The
  note drops segment / corner names when they differ (`commonWhat`) and says “ทุกช่วงเท” when the set has bars in every
  lift (`WallSet.every`). `wallRunSets(member)` keeps **lifts and faces per set**, so BBS per lift / per face are unchanged
  (weights equal to v0.119.0: `tests/fixtures/wallRun-v0119.json`); Marks drop e.g. lift 34 → 17, tank + door 58 → 29.

## UI

`components/WallRunEditor.tsx` (in ElementInputPanel; layout switch “ผนังตรง (แบบเดิม) / Wall Run”, “แปลงเป็น Wall Run”,
type cards `WallTypePicker` — opens by itself for a new wall): left = shape buttons + draw mode, segments, T, levels /
lifts, base / top, kicker, waterstop, type parts; centre = plan (corner circles → corner method + Marks) / unfolded
elevation (lifts, levels, openings draggable, repeated ghosts) / 3D; right = bars per face, RC wall list, corner / T /
free end, type note, summary + per-lift table. Wall Run members hide the shape / rebar-sketch tabs (derived model).
Element templates: keys `Wall:tank|lift|general|retaining`; generated `gen-wall-*` items stay out of the payload.

## Sheet (`src/domain/wallRunSheet.ts`, `components/WallRunSheetPreview.tsx`) — W1.1

The wall sheet runs through the normal sheet engine: `bbsSheet.ts` branches for Wall Run members (`sheetFormat`,
`sheetViews`, `sheetPageCount`, `layoutPage`, `sheetArea`, `drawSheetInfo` → `wallPagesOf`), so the Sheet Composer, the
A3 preview, PDF and DXF (B = one viewport per view box) draw the same pages. Layout resolution (`resolveSheetLayout`):
member's own (Composer) → project default template (category Wall) → **system layout “ผนัง (Wall Run)”** (`wallPlanOf`).

- **ViewKeys**: `sec:wall-out-<g>` / `sec:wall-in-<g>` (elevation per storey group g), `sec:wall-det-<k>` (corner / T /
  free end, 1:20), `sec:wall-sec` (section A–A), `sec:wall-op` (opening detail 1:20: window = opening + Ld, other bars
  faded, only OP labelled), paper `stddet`, `keyplan`, `schedule` (steel per lift / face × size). Template roles
  `wall-…` (`roleKeySchema`) ↔ `sec:wall-…`. Composer boxes get their size from `sizeAt(n)` (`sheetViews`).
- **Planner** (`planWall`): elevation 1:50, else 1:75; paper A3 (≤ 2 lifts, ≤ 6 m), A2, else A1; both faces side by side
  when they fit, else stacked; storey groups (`storeyGroups`, pit with the first storey, a storey never splits) so each
  elevation fits its box — break lines at the cuts, levels continue (absolute). Details / section / opening detail /
  paper views are packed (MaxRects) into the free space, else on a further sheet; boxes never overlap; title block
  (150 × 40, bottom right) and header band are keep-outs (`wallSheetArea`).
- **Labels inside the views** (`placeLabels`, rules of the slab S2.1 placer): next to the representative bar, leaders ≤ 70
  mm, never crossing, never on a drawn line / text / other label; full label once per Mark per face (+ `TYP.` when the
  Mark repeats on other segments, “· ทุกช่วงเท”), short code (`V01`) elsewhere; toolbar option **ป้ายทุกจุด**
  (`drawingSetup.wallLabels 'all'`). Labels that find no spot are counted (`WallSheetPage.miss`, 0 on the samples).
- **W2a, labels round openings**: every elevation label has a face = the column of the segment where its anchor is drawn
  (`LabelReq.zone`); the placer looks inside that face first (above / below the concrete counts), outside it only when
  the face has no room — then never on another face's concrete and with a leader that crosses no other face. Leaders
  never cross an opening outline / cross or an opening diagonal bar (`block`; those prims carry `qa: 'opening'`).
  Opening bars are labelled on their side of the opening (`dir`: top / bottom bars above / below, side bars left /
  right, diagonals at the outer end of the bar past the corner). Opening bars of the detailed opening (openings[0], all
  its repeated levels) take the short code inside the face before a full label outside it; such an opening gets
  “ดูรูปขยายช่องเปิด” at its bottom and the full labels stay in the 1:20 detail (`sec:wall-op`). Label gap 1.6 mm. Up to
  5 passes (labels left out / outside their face go first in the next pass; best pass wins). `WallSheetPage.faces`
  lists each label with its face and whether it lies inside (`anchorIn` = anchor inside the face; corner U / L bars drawn
  in the gap between faces have none).
- Mark label check (W2a): new kind `opening` (“เส้นชี้ตัดช่องเปิด / เหล็กทแยง”, low) for leaders across prims with
  `qa: 'opening'`; a view may ask a larger gap (`SheetViewInfo.minGap`, wall views 1.5 mm = `WALL_LABEL_GAP`).
- BBS presentation `drawingSetup.wallBbs` (or the toolbar), title block on every page, page numbers over the whole set.
- Mark label check: 0 issues of any level (incl. leaders > 75 mm) on the 4 samples (lift 5 storeys, tank + door, general,
  retaining). Images before / after: `output/wall-run-verification/after-w1-1/`; W2a `output/wall-run-verification/after-w2a/`
  (`before-*` = v0.121.0, `after-*`; `liftAll` = doors on every storey).

### W1 sheet (kept for reference)

Drawing page (A3, A2 for > 2 lifts / > 6 m / > 14 m): unfolded elevations outer + inner (one representative bar and one
distribution line per Mark per face and segment, labels in a column with elbow leaders in anchor order — no crossings,
`TYP.` when a Mark repeats on several segments), plan details 1:20 (corner / T / free end), section A–A (dowels, C.J. +
waterstop, laps, top end, own slabs / base / key), opening detail, standard details (NTS), key plan, title block.
BBS pages: `wallBbsItems(m, rows, 'wall' | 'lift' | 'face', qty)` + `wallBbsSummary` (group × size); all three add up to
the member's steel. Outputs: PDF, DXF B (one viewport per view) / C / A, Excel “Wall BBS by lift” (`data/wallRunExcel.ts`,
also appended to the project Excel export). “แผ่นมาตรฐาน (Sheet Composer)” switches to the normal composed sheet.

## Tests

`tests/wallRun.test.ts` (old wall unchanged + conversion equal, box corners, L / T methods, lift 5 × 2 + door × 4 + pit,
tank by hand + waterstop + L bars, retaining by hand + curtailment, thickness steps, RB9 / DB10 / DB12 cover policy,
templates / backup, sheets: elevations, label check, 3 presentations, DXF → `output/dxf-verification/wallRun-*.dxf` for
`python tools/qa/dxf_audit.py`). `tests/wallRunW2a.test.ts`: haunch ends (old / ld = v0.119 weights, centre = only the B
haunch bars shorter, ends by the formula, thin walls), label rules on lift 5 storeys with a door every storey, tank +
door, general with 3 openings, retaining (0 label issues, leaders vs openings, gap ≥ 1.5, labels inside their face
except named no-room cases, opening bars on their side, short code ↔ full label in the detail). UI check: `tmp/wremu/`
(demo-boq-wall, ports 9396 / 8381 / 9596, Vite 5184).

## Limits / next rounds

Projection lock between wall views is not offered (unfolded elevations have no shared plan axis). Haunch = equal
area band in the quantities (bars follow the drawn 45° fillet); only the first opening gets a 1:20 detail (short codes
of other openings' bars fall back to full labels outside the face when crowded); sleeves do not deduct concrete or cut wall bars. Next: counterfort / basement / curved / septic / box culvert
types, walls placed from a slab floor plan or read from drawings (AI), thicker-above detailing.
