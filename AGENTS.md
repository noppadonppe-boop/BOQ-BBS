# AGENTS.md

## Commands
- Dev server: `npm run dev` (Vite, http://127.0.0.1:5173)
- Local Firebase: `npm run emulators`
- Verify (typecheck + build): `npm run build`
- Committed tests: `npx vitest run tests` (sheet snapshot + DXF writer); `vitest` also runs ad-hoc tests (`npx vitest run <file>`).
- DXF audit (needs `pip install ezdxf matplotlib`): `python tools/qa/dxf_audit.py` after `npx vitest run tests/dxfExport.test.ts`.

## Structure notes
- Element input (manual / from drawing) → `src/domain/elementInput.ts`; UI `src/components/ElementInputPanel.tsx`.
  It converts the per-category input into the existing member fields and generated bars (ids prefixed `gen-`).
  Single beam top / bottom bars: optional `ends {start, end}` = `ext` (+ past the beam end at the cover / − short of it) +
  `type` shape | straight | standard | leg (per-end override of the Shape code via `shapedEnds(…, over)`); bars past an end
  sit in reference regions `genbend-start|end`. Stirrup / tie hooks by size: `tieHook()` (Ø < 10 → 135°, else 90°). Test: `tmp/beamBarEnds.test.ts`.
- Footing pour stages: input `pour {count, heights}` (last stage = rest, `footingPour()`), UI `FootingPourEditor.tsx`;
  apply writes `member.pourStages.levels`; `pourStageQuantities()` (`solids.ts`) gives concrete / formwork / joint area per
  stage from the box cells; deductions carry `zRange` so they split by height. Test: `tmp/pourStages.test.ts`.
  Joint bars `pour.joints[k]` (`jointRebar()`): mesh at the top of the lower / bottom of the upper stage, vertical bars
  through the joint (roles `joint<k>-x|y|dowel`). Footing levels: `levels.ref` top|bottom, read via `footingLevels()`;
  sections draw joints, stage names and T.O.F. / B.O.F. / C.J. / T.O.P. / NGL marks (`buildView` → `levels`).
  A3 sheet adds a pedestal / starter plan section Z–Z (`ViewSpec.columns`, level `columnSectionCut()`; column outlines +
  `column-main|tie` bars only), under the notes when they leave ≥ 48 mm, else beside section Y–Y. Test: `tmp/starterSheet.test.tsx`.
  Column / starter top end `column.splice` lap | coupler (+ `stagger`: every 2nd bar higher, own Mark `column-main…-cpl2`):
  BOQ items `gen-coupler-<d>` (siteWork, rebuilt on apply); sections draw a box at the bar end + "COUPLER", and
  cover marks `C=…` (`buildView` → `covers`). Single columns: `rebar.top|bottom.mode = 'coupler'` (bar ends `lap` mm above
  the joint; top couplers counted as `gen-coupler-<d>`). Coupled bar ends for every graphic come from `barCouplerEnds()`
  (sections, BBS sketch, `Shape` thumbnail, 3D via `coupler3d.ts`). Test: `tmp/columnCoupler.test.tsx`.
- Bar layer shapes (footing/slab mesh, beam top/bottom, wall vertical/horizontal): `shape` = BS 8666:2020 code from
  `layerShapes` (00/11/12/13/21/22/99), `leg` (0 = standard), `radius` (R for 12); geometry by `shapedEnds()`;
  old `bend` / `endHook` inputs are migrated in `migrateShapes()`. Shape 41 (U legs full depth + inward Ldh, footing only); leg 0 = `hookDevLength()` (spec S.H.A. column via
  `lapTable[].ldh`, else ACI 318 0.24·fy/√f'c·db) — also the top return of `rebar.sideBars` (bottom return 15d).
  Footing `slab` (cast with floor slab: reference slab regions `genslab-*`, top bars extend into slab) and
  `rebar.side` (horizontal perimeter loops, outermost at the side cover; lapped pieces by `loopPieces()`: `laps.pattern`
  1 / 2 / 3 / custom, x = lap table | hook90·d | value, no piece over 10 m → more laps, roles `side-loop…-p<k>`; UI limits via
  `footingLoopInfo()`; test `tmp/loopLaps.test.ts`), `rebar.sideBars` (vertical face bars inside the loops; one Mark via offsets +
  offsetTurns; `faces` auto | both | x | y via `footingFaceBars()`: auto closes the faces where Shape 41 U legs stand, absent = both;
  test `tmp/faceBars.test.ts`; live guide beside the footing bar inputs `FootingRebarGuide.tsx`) — `footingSlabOn()`, `migrateFootingSlab()`. Ad-hoc test: `npx vitest run tmp/shapes.test.ts`.
- Custom element shape model (Phase 1): `member.shapeModel` (`src/domain/shapeModelSchema.ts`) = vertical parts
  (box / polygon / circle-ring / shaft, solid or void, stage, z0+height) + piles + site. Geometry engine
  `src/domain/shapeGeometry.ts` (level slabs, polygon-clipping union/difference, equal-area circles, surfaces, contains,
  sections) hooked in `solids.ts`; apply/checks in `shapeApply.ts`; views in `elementViews.ts` / `projection.ts`;
  UI `ShapeModelEditor.tsx` (tab “รูปทรง” for Custom: plan + elevation X / Y editors `ElevationEditor` — drag moves
  X/Y/Z, grips height / width, magnet `fit()` to other parts' edges, view frame frozen while dragging; 3D `ModelView`
  `part` / `onPart` highlights and picks the selected part, `keepView`; toolbar undo / redo (Ctrl+Z / Y), “วางบนชิ้นด้านล่าง”
  / “กึ่งกลางชิ้นด้านล่าง” (`supports()`), arrows / PageUp / PageDown nudge; new parts centred on the selected part's top).
  Part “หน้าที่ (เหล็ก Preset)” select; apply = `moveOwnedSketchBars` + `applyPartPresets`. Dev harness: `tmp/preview/shape.html`. AI shape reading: gateway task `shape` in `functions/index.js`
  (owner must deploy) + `src/data/aiShapeAnalysis.ts` + `src/domain/shapeProposal.ts`; the browser sends zoomed views of
  the sheet (`src/data/drawingViews.ts`, overview + 3×2 tiles) as `context.views`. Proposal notes carry part / face / dir
  (`shapeModel.rebarNotes[].partId|face|dir`, questions in `rebarQuestions`) used as hints by `suggestFromNotes`.
  Tests: `tmp/shapeModel.test.ts`, `tmp/f02.test.ts`.
  CAD / BIM sources (`src/domain/fileTypes.ts`): DWG / DXF / IFC upload as reference attachments (no Mark review);
  DXF (`dxf-parser`) and IFC (`web-ifc`, lazy WASM) are read in the browser by `src/data/cadDrawings.ts` into views
  + an exact text summary (`context.cadText`); the gateway never sends the raw CAD file. DWG: user saves as DXF.
- IFC import without AI (project menu “นำเข้าโมเดล BIM (IFC)”, `components/IfcImportPage.tsx`): `src/data/ifcModel.ts` reads
  several .ifc files in the browser (web-ifc raw lines, one file at a time) into `IfcModelData` (`src/domain/ifcTypes.ts`):
  concrete elements (footing = IfcFooting or Revit pile-cap IfcSlab; pile / column / beam / wall / slab) with a vertical
  frame + extents (+ plan outline, mesh volume when clipped) and every IfcReinforcingBar as centreline polylines (corners =
  intersections of straight legs; Tekla mapped items; size from Pset Size / NominalDiameter / name; Tekla Rebar Mark / Grade).
  `src/domain/ifcImport.ts` `planIfcImport()`: bars → host by Tekla cast unit (assembly) else by position; short columns in /
  on a footing = pedestals and piles below = shape-model piles; cast-unit parts merge; equal bars (moved / turned about Z)
  → one Mark (offsets + offsetTurns, always offsets: a polyline without them moves along its distribution axis); bar parts
  outside the concrete → placement-context regions `ifcref*` (cover 0); cover measured from the model. Footings = shape
  model (+ site: dig to top, 300 working space), columns / beams = box or geometry solids; equal instances → one member,
  occurrences per storey (storey → WBS map in localStorage). `member.ifcSource` (guids, files, model weight, `converted`):
  re-import matches GlobalIds (add / update / same + `missing`). `checkIfcCandidate()` = validateMember with cover fallback
  (≈ 0.4 s on big mats, run one by one by the page). Revit BarLength of varying sets can be in feet: model length is used
  only when within 20 % of the centreline. Step 3 `src/domain/ifcConvert.ts` (`IfcSourceBanner` in the member editor):
  rectangular footing (+1 pedestal, piles) → footing input rows (meshes, loops, face bars, pedestal bars / ties); converted
  copies leave their Marks, the rest stay IFC bars. Tests (real files on Z:): `tmp/ifcRead.test.ts`, `tmp/ifcImport.test.ts`,
  `tmp/ifcConvert.test.ts`, `tmp/ifcSheet.test.tsx`; dev harness `tmp/preview/ifc.html`.
- Rebar sketch (Phase 2): `src/domain/rebarSketch.ts` (view regions, cover snap lines, snapping, shape-code detection,
  layout rules, `sketchBar`, `meshBars`, `loopBars`; sketched bars have ids `sk-`, polyline + distributionAxis so the
  view is recovered from the bar). UI = rebar workspace `RebarWorkspace.tsx` (exports `RebarSketch`; tab “ใส่เหล็ก” for
  shape-model members): part strip (focus), plan / section X–X / section Y–Y canvases (`SketchCanvas`, shared cuts, draggable
  cut lines, point grips, distribution-range grips ◆) + 3D (`ModelView` part / bar pick); sub-tools stay in `RebarSketch.tsx`.
  Tests: `tmp/rebarSketch.test.ts`. Forced cover drawing: `coverRings` / `snapToCover` / `traceCover`; end hooks `addHooks`.
  Free drawing snaps past the concrete face at Lap / Ldh / 12d (`lapSnap`).
- Part rebar (`src/domain/partRebar.ts`): `part.rebar` (`partRebarSchema` in `shapeModelSchema.ts`: purpose column | beam |
  slab | wall | footing | other + preset values) → `partPresetBars()` / `applyPartPresets()` (bars `pp-<part>-<key>`, rebuilt on
  every shape apply and preset save, marks kept per id); bars drawn while a part is in focus are `sk-<part>-…` and move with it
  (`moveOwnedSketchBars`); owner = `barPart()`. Part cover can only be ≥ member cover (checks use the member cover).
  Bar parts past the concrete get reference regions `genext-<k>` (`withOutsideRegions`, padded by cover; run on every final
  bar commit). Completeness per purpose `partCoverage()`; purpose guess `guessPurpose()`. Corner bars sit in the link bend
  (`cornerInset`). Tests: `tmp/partRebar.test.ts`; full assembly (2 footings + wall + column + beam + slab, presets, checks,
  interference: only the column through the footing / slab meshes clashes across parts) `tmp/assembly.test.ts`, model in
  `tmp/preview/assemblyModel.ts` (harness `shape.html#asm`). Anchorage host = support, else a solid holding the part's base
  (`hostOf`: starters cast inside a mat); parts cast on lower concrete need no bottom mesh (`defaultPartRebar(…, sm)`,
  `partCoverage`) and are guessed footing on a footing (`guessPurpose(p, sm)`). J-078 F-02 rebuilt from parts with our own
  bars (sheet pour volumes 315.85 / 210.39 m³ match): `tmp/f02Custom.test.ts`, model `tmp/preview/f02Model.ts` (`shape.html#f02`,
  `#f02pit` adds the assumed deep pit). Part role `reference` (column / wall above, cast later): no concrete, placement region
  `genref-<id>`; presets on it = starters / dowels only (`top = z0 + ext`). Void parts with purpose wall = pit walls
  (`voidFaceBars`: loops + verticals round the opening). Footing `loopsJoined` = one loop set round touching footing parts
  at the same base (`joinedGroup`, built by the first, banded by top level). `coordinateBars()` (run by `applyPartPresets`):
  wall junction dowels belong to the first wall, dowels move inside a loop ring along them, wall feet along Y lie one bar
  higher, mesh bars step aside from vertical bars, ties / horizontal rings step off mesh levels. Wall dowels over an opening
  (no cover-clear embedment) are cut. Speed: `shapeGeometry` caches per model object, `placementMember` per member object.
  `INTERFERENCE_LIMITS.comparisons` 20 M (a 1,000-piece mat needs ~1.3 M).
  Dev harness: `tmp/preview/shape.html` (tabs shape / rebar / sheet, `#asm-tag` = tagged assembly; `tmp/` is outside Vite's watcher — restart the dev server after editing it).
- Part Tag no. (`src/domain/partTags.ts`): `part.tag` / `shapeModel.groups[] {id g…, tag, label, parts ≥ 2}` (bar groups: several
  parts reinforced as one, drawn bars `sk-<group id>-…`); owner of a bar = `barOwner()` (parts + groups; `barPart()` = parts only).
  Auto tags `withAutoTags()` (F / C / B / S / W / X by purpose, R reference, P pit walls, V voids; G-nn groups); Marks `<tag>/nn`
  via `markFor()`, `tagMarks()` renumbers on tag change (keeps the number after the slash), run by `applyPartPresets`.
  New members (no bars) are tagged on shape apply; untagged members show a one-click banner in the rebar tab (renames Marks).
  Group bars move with their parts when every part of the group moved alike (`moveOwnedSketchBars`).
  Bar edit window `BarEditModal.tsx` (right-click / double-click a set in the list or a bar in a view): Mark, size, segment
  lengths (`withSegment`: direction kept, later points follow), layout, ends; live shape (`BarShapeSvg`) + cut length / weight;
  duplicate / delete. Preset sets are read only until “แยกจาก Preset” (`detachPreset`: becomes `sk-<part>-…`, key added to
  `part.rebar.off` so the preset skips it). Each of the 4 views has an expand button (overlay `.view-zoom`, Esc closes).
  Rebar tab = part table (Tag, purpose, sets, kg; tick ≥ 2 → group) → full-screen rebar window (`.rebar-window`: views framed on
  the part / group, tools create bars owned by it via `commitNew`; mesh / loop tools stay inside its plan: `within` → `regionWithin()`). Drawn bar ends `bar.ends {start,end: ext | null, hook
  none|std90|std135|std180|custom, leg, n}` re-applied by `withEnds()` (`rebarSketch.ts`: strips the n hook points, end = first face from
  its neighbour + ext; part faces = `boxFaces`, else the concrete; hooks past the concrete are not clipped; hooks follow the stirrup / tie hook detail: the outer face of the bend lies on the stop line (end point = centreline, cover line);
  90° leg from the outer face 6d ≤ DB16 / 12d above, 135° corner moved past the tip by r·tan 67.5° − r (`end.shift`, undone on re-apply) with a
  10d tail, 180° tail 4d ≥ 65; D from spec STIRRUP AND TIE HOOKS (else END HOOKS) → `hookRadius()` (also the drawn bar radius);
  `leg` > 0 = own length, `flip` = other side, side = the perpendicular with more room; ext = stop line (with a hook: outer face of the bend); UI `EndsEditor` (+ “A ต้น / ท้าย” markers in views and `BarShapeSvg`).
  Cover per face `part.covers {x0,x1,y0,y1,bottom,top,side}` (≤ 1,000, never below the member cover — checks use it): `faceCovers()`
  for presets (meshes / loops take `sides`, columns / beams / walls per face), `edgeFaces()` / `edgeCover()` map a view edge (at the cut)
  to part faces; sketch cover lines offset per edge (`coverRings` / `offsetSegments` take an `EdgeOffset` function; collinear
  faces with different covers step). Tool “Cover รายด้าน” (`CoverTool`): click an edge in plan / sections or a surface in 3D
  (`ModelView` `onFace`). Drawing snaps (free mode): cover, concrete faces, beside other bars in the plane (offset d₁/2 + d₂/2;
  a cover snap on top of a bar gives way to it); finishing a bar warns about overlaps in the plane; “+ ชั้นถัดไป” shifts a layer.
  Layout rule per bar `bar.layoutRule {rule spacing|count|single, spacing}` (set by `sketchBar`, mesh / loop tools); read with
  `barLayout()` (bars without it: spacing = actual rounded up, same count) in the panel, range drags and `BarEditModal`;
  `LayoutFields` keeps the count when switching group rules and restores `range` when a single bar becomes a group; ≤ 2,000 bars.
  Loop tool laps 1 / 2 / 3 points (`loopBars(…, split)` + exported `loopPieces`). BBS per Tag: sheet style `partSheets`
  model | tag + `drawingSetup.partTags` → `tagSheetSets()` (`tagSheets.ts`): one set per tag (own bars, own concrete, other
  solids as context boxes, piles under it), groups rebar only, untagged bars `GEN`, then a summary set (`scope.kind 'summary'`:
  table per tag); used by `SheetA3Preview` and `bbsSheetPdf`. Test: `tmp/partTags.test.ts`.
- Rebar notes (Phase 3): `src/domain/rebarNotes.ts` (rule parser `parseRebarNote`, `suggestFromNotes`,
  `barsFromSuggestions`; loops / vertical face bars stop where the plan changes via `stackTop`); notes kept in
  `shapeModel.rebarNotes` (also filled from the AI shape proposal); UI tool “จาก Note ในแบบ” in `RebarSketch.tsx`.
- Column ties: set 1 = perimeter hoop (roles `tie` / `tie-<zone>`), set 2 = supplementary ties per zone
  (`rebar.tie.inner`, roles `tie2-<zone>-<n>`, patterns `tiePatterns` / `columnTieLayout()` in `elementInput.ts`).
  UI: `src/components/ColumnTieEditor.tsx` (zone table, elevation strip, pattern gallery).
- Column pour (single column): `pour {stages 1|2, bottom (m), mode beam|level, beam, joint}` → `columnPour()`; two stages
  write `member.pourStages.levels = [z]` (stage quantities via `pourStageQuantities()`), sections draw the joint, stage
  names and B.O.C. / C.J. / T.O.C. (`buildView`). UI `ColumnPourFields` in `ElementInputPanel.tsx`. Test: `tmp/columnPour.test.tsx`.
- Column main bars (rect): `rebar.main.corner` (bundle 1–3) + `sideX` / `sideY` per face, positions via
  `columnInputBars()` (symmetric spacing); special sections = `columnPresets` / `applyColumnPreset()`.
- Project Column Template (column schedule per spec): `spec.columnTemplates` (types × level rows: section, main bars,
  ties nYd@S1(d@S2)) + `spec.columnZoneRules` (tie zones as divisors of H = storey − beam; default first H/3 · H/2 · H/6,
  others H/6 · 2H/3 · H/6) in `src/domain/columnTemplates.ts` (`applyTemplateRow` single, `applyTemplateStack` → stack with
  `stack.zones`, `syncColumnTemplate`). Column input `template {id,row,beam,linked}`; linked columns are re-applied in the
  spec-change job (`data/direct/specJobs.ts`). UI: General Spec button → `ColumnTemplateEditor.tsx` (Excel via
  `data/columnTemplateExcel.ts`; edits change the draft only, its “บันทึก Spec และอัปเดตโครงการ” button saves the profile via `onSave`), column panel `ColumnTemplateBar` → `ColumnTemplatePicker.tsx` (default view = schedule grid
  `ScheduleGrid`: types × level ranges via `scheduleLevels()`, cell = single storey, type header = stack). Footing section 5
  uses the same grid (`FootingTemplatePicker`, pedestal | starter) → `applyTemplateFooting()` on the selected footing column
  (ties at S2 + set-2 pattern `column.tie.pattern` = `rowPattern()`, drawn as roles `column-tie-in<k>` above each hoop via
  `columnTieLayout()`; test `tmp/footingTemplate.test.ts`). Test: `tmp/columnTemplate.test.ts`;
  J-078 schedule data + Excel generator: `tmp/j078.test.ts` → `tmp/J-078-column-templates.xlsx`.
  Sections as drawn: `main.layout` (`sectionLayoutSchema` in `elementInput.ts`: bars u/v as fractions of the bar-centre
  box + bundles n/dir, ties = closed rects u0..u1 × v0..v1) on template rows / column main / storey main / footing column
  main; overrides corner / side counts (`layoutBarPositions()`, kind `inner` for interior bars, too-close drawn bars pushed
  to touching) and tie pattern `custom` (`rowPattern()`). Excel column 16 = layout JSON. J-078 layouts were read from the
  PDF vectors (`tmp/j078-layouts.json`: filled-triangle clusters = bars, stroked rects = ties). Test: `tmp/sectionLayout.test.ts`.
- A3 BBS sheet (views + BBS table + BOQ table + title block), layout id `sheet-a3-v10`:
  layout in `src/domain/bbsSheet.ts` → renderer-agnostic primitives (`src/domain/drawingPrims.ts`),
  drawn as SVG by `src/components/PrimsSvg.tsx` (preview in the "แบบ & BBS" tab) and as PDF by `src/data/primsPdf.ts`.
  Plan/section geometry: `src/domain/elementViews.ts` (also used by `ElementGraphic`).
  Page layout `sheetLayout` one | split (+ `viewsPerPage` 0 = auto plans / sections, 1–3) in the sheet style (project title block
  default, member override): split = tables sheet(s) (BBS over the left area, notes + BOQ + title block right) then view sheets
  (`sheetViews()` / `placeViews()`, title strip); beam groups / column stacks keep 'one'. Test: `tmp/splitSheet.test.tsx`.
  Beam groups (plan / elevation): `buildView` → `beamCols` (dashed column faces, grid centre lines + bubbles) and
  `exDims` (EX bar extents split at column faces, rows by `exDimRows()`, top above / bottom below); grid c/c chain on top.
  Test: `tmp/beamGrid.test.tsx`. Column size per grid: `support` (X, along the beam) × `supportY` (across, 0 = X);
  3D views draw the columns (display only, stub below / above) from `beamColumnBoxes()` via `contextBoxes()`.
- Semantic drawing prims (`src/domain/drawingPrims.ts`): `dim` (linear, feature points a / b, dimension-line point, `value` real mm,
  text with `<>`), `leader` (points from the bar, text, Mark data) and `mtext`, each with `draw` = the exact plain prims drawn
  before; `layer` (CAD role) / `view` (sheet view id) on any prim. Renderers (`PrimsSvg`, `primsPdf.ts`, R12 `primsDxf.ts`, MCP tools)
  call `expandPrims()` first, so SVG / PDF never change — test `tests/sheetSnapshot.test.ts` (snapshot `tests/__snapshots__/sheets.json.gz`,
  fixtures `tests/fixtures/sheets.ts`; re-create only for an intended drawing change: `SNAP=1`). `renderView()` emits dimension chains /
  covers / EX dims / Mark leaders semantically and reports its map (`frame`); `drawSheetInfo()` returns `views` (box, n, s, origin sheet ↔ model).
- Sheet Composer (docs `docs/SHEET_COMPOSER.md`): sections = `member.drawingViews` v2 (`look` / `depth` / `extent` / `source`, ≤ 12,
  v1 still read, `migrateDrawingViews`), else `defaultSections()` (`def-x` / `def-y` / `def-z` = `defaultCuts` / `columnSectionCut`, not stored);
  layout `member.sheetLayout` (`sheetLayoutSchema.ts`: sheets of boxes per ViewKey plan | plan-bottom | plan-top | sec:<id> | notes, n, lock,
  fixed, show) → `resolveSheetLayout()` (member → project default template → automatic) in `sheetLayout.ts`; `bbsSheet.ts` `sheetViews()` /
  `layout()` / `drawSheetInfo()` draw it (projection lock shifts the box, `lockNote`; notes only where placed; keep-outs `sheetArea()`).
  Templates `project.sheetTemplates` (command `saveSheetTemplates`, restore `restoredSheetTemplates`) + `spec.sheetLayoutTemplates`
  (import key). `buildView` ViewSpec `look` / `depth` / `extent`; `renderView` `hide`, `sectionLines` (cut bubbles letter / sheet).
  UI `SheetComposer.tsx` (button “จัดหน้าแบบ” in `SheetA3Preview`). Test `tests/sheetComposer.test.ts`; harness `tmp/preview/composer.html`.
  Mark label check `src/domain/labelQa.ts` (`labelReport()`: overlap / on text / crossing / outside = high, tight / on line / long = low;
  rules `spec.cadStandard.labelQa` via `labelRulesOf()`), UI `components/LabelQa.tsx` in the preview, Composer and DXF dialog; warnings
  only, the drawing never changes. Test `tests/labelQa.test.ts`.
  Drawing Edit (Tekla-style, phase 1; Composer mode “แก้ไขแบบ”, `components/DrawingEditLayer.tsx` `useDrawingEdit`): `member.drawingEdits`
  (`src/domain/drawingEdits.ts`, per ViewKey: `over` = overrides of automatic annotations by stable key `mark:<bar id>` / `dim:<dir><side><n>` /
  `cover:<n>` / `ex:<id>` / `level:<n>` {hidden, dx/dy, off, text '<>'}, `objs` = user text / leaders at view model (u, v) + paper offset).
  `renderView(…, {edits})` applies them and tags every annotation prim with `key` (Meta, passed to the drawing by `expandPrims`; the
  snapshot test ignores it), `drawSheetInfo` passes `member.drawingEdits.views[key]`; `cleanDrawingEdits()` before saving. Mockup of the
  later phases (detail / status): `docs/mockups/drawing-edit-mode.html`. Test `tests/drawingEdits.test.ts`.
  Phase 2: user `dim` (anchors `{u,v,eu,ev,bar}`: eu / ev follow the concrete box edge `concreteBox`/`anchorPoint`, bar = Mark row id),
  `level` (value = `ViewData.datum` + v), leaders `bar` + `fromMark` (text / DXF Mark data from the row); snaps `viewSnapPoints()` from
  `SheetViewInfo.data`; lost bar anchors `lostAnchors()` drawn red; “แยกเป็นของผู้ใช้” turns an automatic dim into a user dim.
  Phase 3: Detail views `drawingEdits.details` → ViewKey `det:<id>` (`ViewSpec.window`, clipped by `primClip.ts`, marks on the parent),
  ISO `iso` (`isoView`), stepped sections `section.steps` (pieces merged in `buildView`); extras only in composed layouts
  (`sheetViews(s, extras)`). Drawing-only save `saveMemberDrawing` (direct/members.ts: sheetLayout + drawingEdits, status kept) for
  roles admin / qs / detailer (new project role `detailer`); sections still go through saveMember (→ Draft).
  Phase 4: status `drawingStatus()` (`drawingStatus.ts`: auto / ok / check from `drawingEdits.check.hash` vs `drawingModelHash()`,
  lost anchors, stale overrides; Composer save writes check), revisions `drawingEdits.revisions` + table box ViewKey `revs`, user
  `cloud` objects (tool C), templates carry `edits` per role (`templateFrom(…, edits)`, `templateEdits()`).
  Edit mode left column = object list (`useDrawingEdit().list`, filters), right-click menu (`context`), anchors on the first / last bar
  of a Mark (`anchor.pos` + `t`, leaders too; `barExtremes()`, `anchorPoint(a, cb, bars)`), re-anchor tool for lost anchors.
  Grouped icon toolbar (section / detail via `EditExtras`), screen tint user orange / auto grey (“สีพิมพ์” off), list filter hidden,
  per-view `ViewEdits.hide {dims, marks, levels}` (`setHide`, panel “แสดงในรูป”, merged into renderView `hide`).
  Snap kind toggles (`snapBar`); copy the edit layer to members of the same category: `copyEditsTo()` + `EditCopyDialog`
  (`siblings` / `onCopyEdits` props, one `saveMemberDrawing` per target, target status → check).
  Status hash = `memberDrawingHash()` (schema-normalized member, same before / after saveMember). Command-layer test with an in-memory
  Firestore stand-in: `tests/drawingSave.test.ts` (roles, versions, status kept / Draft). Harness `tmp/preview/composer.html#footing-detailer`.
- DXF 2018 export (`src/data/dxf/`, docs `docs/DXF_EXPORT.md`): `writer.ts` (handles / owners / tables / blocks / objects as ezdxf R2018),
  `entities.ts` (DIMENSION + *D block, LEADER + INSERT `BBS-MARK` with ATTRIBs, MTEXT, solid HATCH, VIEWPORT; all ByLayer), modes
  `layoutB` (model 1:1 + one Layout per sheet, locked viewports), `layoutC` (model only, frame block ×N, view blocks ×N/n),
  `layoutA` (sheet coordinates, DIMLFAC = n); `buildBbsDxf()` → text + summary. UI `DxfExportDialog.tsx` (sheet tab), steel sheet = mode A.
  CAD standard `spec.cadStandard` (`src/domain/cadStandard.ts`, default S-* layers, spec import key `cadStandard`, UI `CadStandardEditor.tsx`
  in General Spec). Tests `tests/dxfExport.test.ts` (writes `output/dxf-verification/`), audit `python tools/qa/dxf_audit.py` (ezdxf, test only).
  Dev harness `tmp/preview/dxf.html#footing|custom|beam`.
- General Spec is workspace-level (not a project menu): profiles in Firestore `${APP_NAME}/root/specProfiles`
  (`src/domain/specProfiles.ts`, `src/data/specProfiles.ts`, page `src/components/GeneralSpecPage.tsx`,
  editor `SpecEditor.tsx` + `DesignCodeLibrary.tsx`). Projects choose a profile + f'c/grade in `ProjectForm`;
  `project.spec` is the resolved copy with `spec.profileRef` / `spec.projectDesign` (live link: saving a profile
  re-runs `changeSpec` for linked projects). Spec changes regenerate gen-* bars from element input
  (`specJobs.ts`), detailing derived by `detailingFromSpec()` (`src/domain/specDetailing.ts`, keep it free of
  runtime imports from model/elementInput to avoid cycles). Table overrides: `spec.codeData[code]`, read via `codeValues()`.
  Design codes (`src/domain/designCodes.ts`): ACI / EIT / BS / Custom + extra `Custom-<id>` codes named in `spec.customCodes`
  (Custom = copy of ACI tables, editable); use `codeList()` / `codeInfo()` for labels, `tableCode()` for table-driven codes.
  Steel grade per bar size: `barGrades` default, override `spec.codeData[code].grades` (UI `GradeSection`, saves the
  profile directly via `onSave` → `GeneralSpecPage.save(spec)`).
  Extra provisions per code: `spec.codeData[code].provisions` (UI `Provisions` in `DesignCodeLibrary.tsx`).
  Project-side spec info / approval / files: `ProjectSpecPanel.tsx` in the project Settings page.
- Project Foundation Template (footing types of the foundation drawings): `spec.foundationTemplates` in
  `src/domain/foundationTemplates.ts` (`fields` = footing input subset: size, depth, piles, bars, pours, levels; `columns` =
  positions + reference section; J-078: 2 pours = FOOTING HEIGHT + 400 slab, joint mesh at the Stage 1 top, ADD top bars into the slab, U legs (Shape 41) and face bars rise into Stage 2 with an inward Ldh = S.H.A. of the lap table; `sideBars.toJoint` stops face bars under the joint); `applyFoundationTemplate()` keeps detailing, column bars and pile length (when 0).
  2-stage types can be used as Stage 1 only (`template.stage1`, `templateFields()`: thickness = stage 1, joint mesh → top mesh,
  no slab, top level lowered; picker radio + footing panel select). Test: `tmp/stage1Template.test.ts`.
  UI: footing section 1 button → `FoundationTemplatePicker.tsx`; General Spec list `FoundationTemplateList.tsx`; spec import
  key `foundationTemplates`. Footing stirrups `rebar.stirrups {width, dir, replacesBottom}` (closed links over a band, role `stirrup`; replacesBottom = HOOP that is the bottom layer across the band).
  Footing extra boxes (rect): `blocks` (raised parts / later-pour blocks over part of the plan) and `cuts` (lowered top areas,
  z1 = thickness) as footing-local boxes → member geometry solids / voids (`boxCells` volume, formwork, pour stages); bars:
  own top mesh per cut / block group (`mesh(..., area {only|minus})`; at a step, cut top bars run on into the higher concrete
  by the lap length and straight footing top bars turn down at the step face to 12d below the lower bars), loops around plan − cuts above the cut top and around
  each block group, face bars one Mark per top height (`topAt`). Full-depth cuts (z0 = 0, z1 = thickness) are plan openings (`footingOpenings()`; `footingOutline()` = rect − openings, so L-shaped
  mats keep every bar layer / area on the remaining plan). Boxes may carry own top bars `bars {diameter, spacing}`; blocks of equal height
  form one group only when they touch; `footingTopAt()` = concrete top at a plan point (bars, starter / column regions). Piles `pile.layout 'custom'` + `positions` (≤ 300; blocks ≤ 80, member geometry solids ≤ 80).
  Ribs: block `rib {top {count, diameter}, links {diameter, spacing, foot}}` = n top bars along the rib, inverted U links down onto
  the bottom mesh (feet outward), straight face bars (r.side) instead of loops; equal ribs share one Mark (roles `rib<k>-top|face|link`).
  Footing `items` (e.g. anchor bolts) → site-work items `gen-item-<k>`.
  Block groups enclosed by concrete at least as high get no loops; block-top bars shorter than max(300, 20d) are left out. `walls` = RC walls on the footing as reference boxes → placement context
  regions `genwall*` (no concrete; wall `dowels {diameter, spacing, lap}` = wall bars cast into the footing, both faces from the
  bottom mesh to `footingTopAt()` + lap (0 = lap table), role `wall<k>-dowel`; views kind 'wall', outline redrawn over the bars; 3D boxes in `Element3DModal`). Sections lower the
  footing top over cuts (`buildView`). UI `FootingBoxes` / `PilePositions` in `ElementInputPanel.tsx`.
  J-078 Phase 1 (F10 / F12) and Phase 2 (F-01 … F-17: stepped mats, tank mats F-10/11, ribbed water-tank bases F-12…17) from MPK01B-IFC-S-PLIE FD Review: `tmp/j078Foundations.test.ts` →
  `tmp/Spec-Project-J-078.json`. Group “Shop Drawing Zone C” (GEDC01-B-HS-RSD-STR-0004.0, `shop` list in the same file) replaces
  F10-01 / F10-02 / F12-02 / F12-03 / F12-04 / F12-05 / F12-08 and adds F12-06: one pour of the cap depth (slab separate; level ▽ = top, △ = underside:
  cap = top ▽ to bottom ▽, the outer dim runs to the lean bottom △ → 2325 / 2525 / 1925 / 1350 + lean 75 / 150, cover 50, pile embed 0), bottom
  U legs 650, top legs 275, STIRRUPS over the whole length for F10-02 / F12-02; F-01 / F-02 mats 75 thinner (`shopFix`), F-10 / F-11 checked. Sheets: `tmp/shopSheet.test.tsx`.
- Project Beam Template (beam schedule of the beam details): `spec.beamTemplates` in `src/domain/beamTemplates.ts` (per mark:
  size, `sections` = labels as drawn per END / MID / CON / CANT / ALL SPAN, `rebar` = beam-group span bars derived by
  `beamRebarFromSections()`: main = bars every section has, EX = the rest, ALL SPAN = no EX, "10Y25" side = 5 per face).
  Spans pick a mark in the BeamGroupEditor “เบอร์คาน” column (`applyBeamTemplate`, `span.template` link, stale notice,
  `syncBeamTemplates` in the spec-change job). General Spec list `BeamTemplateList.tsx` (JSON import: templates, spec file or
  raw schedule entries); spec import key `beamTemplates`. Beam group main bars (`beamGroupBars` → `mainBars`) run
  continuously along spans of equal size / level (extra bars of heavier spans as own runs `…-x<base>`), laps by `emit`
  (lap centres chosen for the whole run on a 25 mm grid, whole lap inside a zone, never in a joint): top in the middle third
  (fallback middle half), bottom from the face to L/4 (`det.beam.frame = 'special'`: from 2h, ACI 18.6.3.3; fallback L/3),
  side bars like bottom; Class B = FTL table, top bars FTL TOP (`lapLength(det, d, top)`, `lapTable[].top`); runs with
  laps split in sets A / B (roles `…-a|-b`, alternate bars) ≥ 1 lap apart. Pieces of equal length and end legs (any set) share one
  Mark: one bar `…-m<k>` placed by `offsets` (count = copies); report pieces carry their bar `role`. Checks: `beamSpliceReport()` (stock, zone,
  joint, lap, stagger, sum, SMF stirrups) shown in `BeamGroupEditor` → `SpliceChecks`; frame option in General Spec
  “การเสริมเหล็กคาน”. Test: `tmp/beamSplice.test.ts`. A3 sheet: spliced groups get a last page (`beamGroupSheet.ts` →
  `spliceSheet`): splice diagram (rows per run / set, no-lap zones shaded, pieces Mark · cut length) + bar-run table.
  Test: `tmp/beamSpliceSheet.test.tsx` (PNG check via `tmp/_prims2png.ts`, env `PNG=`). J-078 (BPL&BD, Beam Configuration L1/3 · La/3 · L/8 · L/10):
  `tmp/j078Beams.test.ts` → `tmp/Spec-Project-J-078.json`. Test: `tmp/beamTemplates.test.ts`.
- J-074 (GULF MTP LNG Terminal) General Spec import: `tmp/j074Spec.test.ts` → `tmp/Spec-Project-J-074.json` (copy beside the source
  drawing `Referrence/J-074 Standard/`) from GMTP-1200-CV-DWG-101 T0: lap rows = ACI 318-19 tables case *2 + Class B, DB10 / DB32
  by the same formulas, Idc recomputed, beam 0.25 / 0.3 / 0.125, grades SR24 / SD40 (DB10–28) / SD50 (DB32+), mixes 28 / 35 / 8 MPa.
  Buildings ISB / GIS / LNG (GMTP Building ISB-J074) in `buildings`; per-building templates use the code as `group`.
- Spec buildings: `spec.buildings` [{code, name, note}] (`src/domain/specBuildings.ts`, UI `SpecBuildingList.tsx` in General Spec,
  spec import key `buildings` merged by code). Template groups equal to a code are headed / ordered by `groupLabel()` /
  `orderGroups()`; WBS page button “เพิ่มอาคารจาก General Spec” adds missing roots (same code). Template names stay unique
  across buildings (prefix e.g. `ISB-F1`). Test: `tmp/specBuildings.test.tsx`.
- Slab floor (Slab layout `floor`, docs `docs/SLAB_FLOOR.md`): `slabSchema.layout` single | floor (default single) + `floor`
  (`src/domain/slabFloorSchema.ts`: grids X / Y, reference beams, slab marks with `SlabRebarSpec` incl. `topExtra` fixed face|centre /
  L/3 · L/4, edge bend | ubar, bottomAtBeam continuous | stop; panels = polygons cut at the beam faces, tag unique; openings with
  trim cut | deviate | none; drops / sunken). `src/domain/slabFloor.ts`: `gridRef` / `parseGridRef` (B +1,200), `autoBeams`,
  `autoPanels` (cell − beams), `mergePanels`, `toggleBeamSegment`, `slabFloorProblems` (blockers), `floorShapeModel` (panels solid,
  beams `reference` + `castWith` = no quantity / no formwork against them, `shapeModel.soffit`), `floorBars` (B1/B2/T1/T2 runs,
  laps at beams ≤ stock, cranks 1:6 ≤ 75, extra top bars, U bars, opening trimmers / diagonals, drops), `groupFloorBars` (Marks
  `S1-B01` / `S1-T01` / `S1-OP1` / `S1-OD1`, owner = group `g<mark>` or the panel, ids `gen-<owner>-…`; `barOwner` accepts `gen-`),
  `applySlabFloor` (called by `applyElementInput`; placement regions `genfb<k>` per beam; `REGION_LIMIT` 64, shape parts ≤ 160).
  Sheets (S2, `src/domain/slabFloorSheet.ts`): A2 (whole floor A1 when large), drawing sheet first then BBS (`layout()` `firstView`),
  system layout `floorSystemLayout` (via `resolveSheetLayout` `from:'system'`): `plan-bottom` / `plan-top` (`ViewSpec.floor`, rows by
  `floorRowLayer`, one entry per Mark per panel, grids / beams / faded marks, `fdim:` L/n dims), sections via `floorSectionCuts`, auto
  opening details `det:op-<id>` (`floorDetails`), paper ViewKeys `schedule|legend|keyplan|stddet` (`drawFloorPaper`); sets per mark
  (`floor {mode:'mark'}`) or whole floor / picked marks (`partTags`, grouped BBS `floorTableItems` + summary page, `floorMerge` → SF-
  Marks `mergeFloorMarks`); Excel “Slab BBS” / “Slab Summary” (`data/slabFloorExcel.ts`); CAD roles `barBottom` / `barTop` (fallback
  barMain); `spec.slabAccessories` → detailing → site items `gen-slab-chair|chair-kg|spacer`. Test: `tests/slabFloorSheet.test.ts`.
  S2.1: plan labels inside the panels (`placeFloorLabels`, `drawingSetup.floorLabels` typ | all, TYP. + short codes), text =
  design spacing (`floorDesignSpacing` from `Raw.s`) / counts for OP / OD, BBS note `floorSpacingNote`; < 1:100 on A2 → A1
  (`floorPlanScale`); sections cropped (`floorSectionExtent`) + break lines + `T.O.S.` levels (`on`); details 1:20 + faded
  bars (`openingDetailFocus`). Ad-hoc PNGs: `tmp/floorSheet.test.ts` (env FMODE tag | floor, MERGE, OUT, PX).
  S3 beams from the floor (`src/domain/floorBeams.ts`: `floorBeamGroups` / `planFloorBeams` / `beamGeometryHash`, command
  `syncFloorBeams` ≤ 25 members / 4 MiB, UI `FloorBeamsDialog.tsx`): one beam group per line `<floor>-B-<line>`, supports =
  `floor.columns` (reference) or the primary beam (`beam.rank`, else deeper, else X); beam input `placement` + `floorSource`
  (not `source`), geometry locked in `BeamGroupEditor` while linked; `openMember()` (`components/memberNav.ts`) opens a member.
  Panel tags follow the mark (`retagPanels`, `panel.tagCustom`). Test: `tests/floorBeams.test.ts`. UI check on separate
  emulators: `tmp/s3emu/` (ports 9399 / 8380 / 9599, demo-boq-s3, `node tmp/s3emu/dev.mjs` on 5181), seed `tmp/s3seed.test.ts`.
  S4a tracing / import (no AI): `floor.underlay` (PDF / DXF / image attachment under the plan, similarity transform, two-point
  alignment `alignTwoPoints` + `alignResiduals`, `SnapIndex` in `src/domain/underlay.ts`; readers `dxfDoc` / `pdfDoc` in
  `src/domain/cadEntities.ts`, browser loader `src/data/underlaySource.ts`; display only: not in sheets / quantities / drawing
  hash, dropped on copy, `remapUnderlay` on restore) and “นำเข้าจาก DXF” (`components/FloorDxfImport.tsx`: layer roles saved in
  `floor.importMap` → `readFloorPlan` / `proposalDiff` / `applyProposal` in `src/domain/slabPlanImport.ts`, `FloorProposal` =
  contract for S4b AI). Zoom Ctrl + wheel, pan by dragging the background. Test: `tests/slabTrace.test.ts` (fixtures
  `tests/fixtures/slabPlan.ts`, files `tests/fixtures/slab-plan/`); UI seed `tmp/s4seed.test.ts` (project s4proj on `tmp/s3emu/`).
  S4b PDF import / AI help: PDF pseudo-layers (OCG, else colour · width · dash) + texts in `pdfDoc(…, {texts, ocName})`,
  `guessPdfRoles()` / `axisRuns()` / `docToFloor()`, import window `components/FloorImport.tsx` (DXF / PDF, plan | schedule);
  AI: project `aiConsent` / `aiSendLog` (commands `setAiConsent` admin, `logAiSend`; UI `AiConsentSettings.tsx`), gateway task
  `slabPlan` in `functions/index.js` (never deploy it yourself), client `src/data/aiSlabPlan.ts` (views of the window only),
  schema / conversion / merge `src/domain/aiSlabPlan.ts` (rule value kept, AI reading as `alt`), schedules
  `src/domain/scheduleImport.ts` → `importTemplatesViaSpecJob` (spec-change job). Tests `tests/slabPdfImport.test.ts`,
  `tests/slabPdfAi.test.ts`; mock UI gateway `tmp/s4emu/mockGateway.mjs` + `tmp/s4emu/dev.mjs` (5182).
  UI `components/SlabFloorEditor.tsx` in the Slab input panel;
  floor members hide the shape / rebar tabs (`isSlabFloorMember`). Slab List column “บนเสริม” (`topExtra`, `TopExtraCell`).
  Test: `tests/slabFloor.test.ts` (+ DXF `output/dxf-verification/slabFloor-*.dxf`).
- Slab / wall templates (Slab List / RC Wall List marks): `spec.slabTemplates` (thickness, support, bars 1 / 2 = short span
  top / bottom, 3 / 4 = long span top / bottom) and `spec.wallTemplates` (thickness, layers, V / H) in
  `src/domain/slabWallTemplates.ts` (`applySlabTemplate` puts short-span bars along the shorter side, `applyWallTemplate`);
  General Spec list `SlabWallTemplateList.tsx`, picker `MarkTemplateField` in `ElementInputPanel.tsx`. Spec import keys
  `slabTemplates` / `wallTemplates` / `columnTemplates` (merged by name, `mergeByName`).
  J-074 ISB data (GMTP-1200-AR-DWG-011 T2 foundation, -013 T1 structure): `tmp/j074Isb.ts` (pile caps PF2…PF9, CF1 L-shape,
  EF1; columns C1…C11; 64 beam marks; 14 slab marks; BW1 / W1 / W2), check `tmp/j074Isb.test.ts`, A3 PNGs `tmp/isbSheet.test.tsx`.
  J-074 GIS data (GMTP-1200-AR-DWG-041 T1 foundation, -043 T0 structure; □350 piles embed 150, bottom cover 175): `tmp/j074Gis.ts`
  (PF1 / PF2 / PF2A / PF3 / CF1, C1 + C1-E, 27 beam marks, 4 slab marks, W1 / BW1), check `tmp/j074Gis.test.ts`, PNGs `tmp/gisSheet.test.tsx`.
  `gisExtraFoundations`: EF1-GE / EF1-EC transformer mats (20 piles, plinth blocks, oil pit = interior full-depth cut:
  `footingOutline()` keeps only the outer ring, so mesh bars stop at interior `footingOpenings()` inside `mesh()` and
  `buildView` draws them as plan holes / section gaps), MF1-1…6 cable pits (spread
  base 300 + footing walls with dowels; wall template GIS-PW1), SF1 stair base (bars assumed, detail in DWG-001-016).
  J-074 LNG data (GMTP-1200-AR-DWG-031 T0, one storey FL ±0 → +5.600; □400 piles embed 75, bottom cover 100): `tmp/j074Lng.ts`
  (PF2 / PF3-C2 / PF3-C3 / PF4 / MF1, C1–C3, 11 beam marks, 1S1 / RS1, W1), check `tmp/j074Lng.test.ts`, PNGs `tmp/lngSheet.test.tsx`.
  MF1 dowels = footing `edgeDowels` (X+ face DB12@200 L 400); W1 = template edge / corner 4-DB12 + opening 2x2-DB16 + diagonals.
- Footing `edgeDowels` [{side x0|x1|y0|y1, Ø, @, length, embed (0 = half), z (0 = mid)}] (rect only): straight bars across a side
  face (role `dowel<k>`, `edgeDowelSpan()`), outer part in reference regions `gendowel<k>`; UI `FootingEdgeDowels`.
  Wall input: `rebar.ends {start, end: none|edge|corner, edge, corner {count, Ø}}` (extra verticals at the ends, roles
  `edge|corner-start|end-<face>`; regular verticals start one spacing past them), `openings[] {x, z, width, height}` (geometry
  void, `wallOpenings()`; vertical / horizontal bars cut at the cover, equal pieces share one Mark via offsets) and
  `rebar.opening {count per face per side, Ø, ext (0 = lap), diagonal}` (trim bars `open<k>-top|bot|l|r-<face>` inside the
  horizontal layer, diagonals `open<k>-diag<n>` one Mark per direction). Wall templates carry `edge` / `corner` / `opening`
  (`applyWallTemplate`). UI `WallExtras` in `ElementInputPanel.tsx`. Test: `tmp/wallExtras.test.ts`.
- Concrete mixes (General Notes strength schedule): `spec.concrete {mixes (f'c 28 / 14 / 7 d in ksc, W/C, shrinkage), uses
  (member type → mix, categories)}` in `src/domain/concreteMixes.ts`, UI `ConcreteMixEditor.tsx` (General Spec), spec import
  key `concrete` (J-078: `tmp/Spec-Project-J-078.json`). Member mix = element input `concreteMix` or the first use row of
  its category; `detailingFromSpec(spec, base, {category, mix})` writes `detailing.concrete` and picks the lap table by the
  mix f'c (`lapConcreteFor`: 350 ksc → 35 MPa). Shown on the A3 notes / BOQ line (`memberConcrete`, `concreteNote`),
  `quantityReport().concreteByMix`, price labels and the Excel BOQ. Test: `tmp/concreteMix.test.ts`.
- Location / WBS (step 1–2 of the plan): `project.locations` = flat tree (`src/domain/locations.ts`: roots building | external,
  children level | zone | segment; levels sorted by `elevation`, zones may list `levels`; `wbsCode()` = A-L2-Z1). Saved by
  command `saveLocations` (admin / QS). Occurrences carry optional `loc {building, level, zone, segment}` ids; `zone` / `floor`
  text stays as label cache (frozen revisions and all reports still use it). Before migration, `atLocation()` matches old
  labels only when the project has one root. Page: project menu “โครงสร้าง WBS / ตำแหน่ง” → `LocationsPage.tsx`
  (generate levels, copy building, tree from old labels). Member migration (step 3): `src/domain/wbsMigration.ts` maps each
  distinct (zone, floor) label pair (`wbsCombos`, `guessCombo`, `comboIssues`) → `wbsMigrationPlan` writes `loc` + `building`
  label (status kept); `relabel` also rewrites zone / floor to WBS codes (those members → Draft). Command `beginWbsMigration`
  (`data/direct/wbsMigrations.ts`) runs as a spec-change job with `wbsChange` (resume / rollback; history scope 'Wbs').
  UI `WbsMigrationPanel.tsx`. Occurrence input (step 4): `components/LocationPicker.tsx` (`OccurrenceTable` in element
  input / quick edit / general detail, `LocationCells` in the register editor and batch); picking WBS goes through
  `withLoc()` so zone / floor / building labels = WBS codes; free-text zone / floor edits on linked rows unlink them
  (`unlinkLoc`: batch text patch, area rename). Batch patch `loc` (needs `p.locations`); `saveMember` checks new / changed
  links (`occurrenceLocProblems`). WBS node codes in use by linked rows are locked in the WBS page (no rename job yet).
  Reports (step 5): groups `Building` / `Level` / `WBS` keyed by occurrence ids (`occurrenceGroup()`, used by every report /
  coverage map), labels + WBS order from `wbsGroupDisplay()`; scope filter `building` / `level` (level or segment) /
  `wbsZone` / `wbsUnassigned` + stored `wbsLabel` (so `scopeLabel()` needs no tree); `ScopeControls` gets `locations`.
  Excel Placements sheet has Building / WBS columns. Backup carries `project.locations`; restore preflight checks the tree
  and every member link into it, `restoredLocations()` puts it in the restore patch (version bumped on apply). Code rename
  of linked nodes: `src/domain/wbsRename.ts` (`wbsRenamePlan`: building label always, zone / floor only where the label is
  still the old code → those members Draft) + command `beginWbsRename` (`data/direct/wbsRenames.ts`); the manifest's
  `locations` is written by `advanceDirectSpec` when the job completes (rollback keeps the old tree). UI `RenameTool` in
  `LocationsPage.tsx`. Import: `src/domain/wbsImport.ts` (`mergeWbsImport` into the draft: match IFC GlobalId, then code
  under the same parent; ids kept, nothing removed; roots in file order; `ifcRows`, `rowsFromLocations`), Excel sheet
  “WBS” `src/data/wbsExcel.ts` (export = template), IFC `src/data/wbsIfc.ts` (IfcBuilding / IfcBuildingStorey via
  IfcRelAggregates, IfcSIUnit length prefix → mm); UI `ImportTool` in `LocationsPage.tsx`. Member copy: rows pick the
  target project's WBS (`MemberCopyDialog.tsx`, links dropped when the target changes; “ใช้ตำแหน่งตามต้นแบบ” maps by codes via
  `mapLocByCode()`), `copyMember` checks links against the target tree. Tests: `tmp/wbsCopy.test.ts`, `tmp/locations.test.ts`, `tmp/locationsPage.test.tsx`, `tmp/wbsMigration.test.tsx`,
  `tmp/wbsPicker.test.tsx`, `tmp/wbsReport.test.tsx`, `tmp/wbsRename.test.ts`, `tmp/wbsImport.test.ts`, `tmp/wbsIfc.test.ts`
  (real web-ifc in Node: mock `web-ifc/web-ifc.wasm?url` to `web-ifc-node.wasm`).
- Disciplines (หมวดงาน, phase 1): `src/domain/disciplines.ts` (RC / Steel / Civil / Arch; a member's discipline follows its
  category via `disciplineOf()`, so no data migration; Steel / Civil / Arch have no categories yet, `planned` lists them).
  Project switch `project.disciplines` (default RC; saved by `saveProject`; disciplines with members always shown,
  `projectDisciplines()`). Sidebar group “ข้อมูลองค์อาคาร” = `DisciplineNav` (header opens the discipline page
  `disc-<id>` and folds its categories), page `DisciplinePage`, Settings `DisciplineSettings` (`components/Disciplines.tsx`).
  RC categories now include `Stair` / `Lift` (free-form like `Custom`: `freeFormCategory()` → shape tab, prisms, rebar sketch;
  concrete mix of slabs / walls). Report group `Discipline`. Test: `tmp/disciplines.test.tsx`.
- Civil Work (phase 2a): categories `UDitch VDitch Trench Manhole Pit UGTank AGTank ConcretePaving AsphaltPaving`
  (`civilCategories` in `src/domain/civilInputSchema.ts`, discipline Civil). Member `civilInput` (channel / vchannel / box /
  paving / asphalt) → `applyCivilInput()` (`src/domain/civilInput.ts`): channel / box / paving = shape model (base + walls /
  `shaft` + cover with void opening; buried → shape `site` earthwork, on ground → lean only), V-ditch = prism (needs the
  spec concrete-geometry method; the form shows validateMember blockers), asphalt = quantity only (layers as site items
  `asph-*`, `takeoff` zero concrete). Civil RC types are free-form (rebar via sketch / notes; auto rebar is phase 2b).
  UI tab “รูปทรงสำเร็จรูป” `components/CivilForm.tsx`. BOQ components `count` / `length` / `area` (`civilMeasures()`; never
  reported unmatched). Test: `tmp/civil.test.tsx`.
  Pipe laying `RCPipe` / `PEPipe` (kind `pipe`, quantity only like asphalt: `quantityOnlyCategories`): `pipeQuantities()`;
  the trench is the member excavation (prismoid, side slope), bedding = site sand, pipe volume = `excavation.buriedConcrete`
  (backfill = excavation − sand − pipe); `takeoff` counts earthwork for pipes. BOQ `pieces` (ท่อน); pipe size / class match a
  rule's diameters (column H, ≤ 3000) / mix (column G). Test: `tmp/pipe.test.tsx`.
  Automatic rebar (phase 2b): `civilInput.rebar {cover, layers single|double, main, dist, slab?}` (channel / vchannel / box /
  paving; defaults `defaultCivilRebar()`) → `withCivilRebar()` in `src/domain/civilRebar.ts`, called by
  `applyCivilInput(m, input, spec)` (detailing via `detailingFromSpec`): bars `civ-<role>` rebuilt on every apply, other bars
  kept. U-ditch / trench = U bars (21) + longitudinal bars (offsets, lapped to the stock length); V-ditch = profile bar at the
  lining middle (cut at the cover over the flat bottom) + longitudinal; box = base mesh, wall verticals with feet (11 / 21 into
  the cover slab, one Mark via offsets + turns), horizontal loops (99), cover slab mesh around the opening (`meshBars`);
  paving = top (single) or both meshes. V-ditch prism lining is `t` square to the slopes (`vDitchInner`); A3 views draw
  prism members (`buildView`: profile / `prismSection`). Test: `tmp/civilRebar.test.tsx`.
- Architecture Work (phase 3a): categories `Room` / `Opening` (`archCategories` in `src/domain/archInputSchema.ts`, quantity
  only like pipes). Finish library `spec.finishes` (kind floor | skirting | wall | ceiling, code, BOQ items × factor per m² /
  m; UI `FinishLibrary.tsx` in General Spec, Excel sheet “Finishes”, spec import key `finishes`, `sampleFinishes()`).
  Member `archInput` room {size w × l or area / perimeter, ceiling height, finish codes, dado, openings} | opening {type,
  w × h, description, items per set / area / frame length} → `applyArchInput()` (`src/domain/archInput.ts`) writes the
  quantities as site items `arch-*` (other items kept; re-applied in the spec-change job). WBS kind `room` under a level
  (`occurrence.loc.room`, label cache in `grid`, `roomLoc`, rooms copied / removed with their level). Schedules on the
  Architecture page (`ArchSchedules.tsx`): room finish schedule, totals per finish, door / window schedule, Excel “Rooms” +
  “Openings” (`src/data/archExcel.ts`; `planRoomImport` adds WBS rooms, member code = A-L2-201; `planOpeningImport`
  places by WBS paths `A-L2-201×2`), and `syncRoomOpenings()` = wall / skirting deductions from the doors / windows placed
  in each room. Owner BOQ: finish items by name (column K), `area` = room floor area. Test: `tmp/arch.test.tsx`.
  WBS Excel / IFC import carry rooms (kind ห้อง + level code in column K; IfcSpace under a storey → room, `WbsImportRow.level`).
  Test: `tmp/wbsRooms.test.ts`.
  Phase 3b: `MasonryWall` (kind `wall`: length × height − openings, type = library kind `masonry` WT, stiffener columns at
  the ends / ≤ spacing / beside openings, lintels = opening width + 2 × bearing, tie beams × length, `wallQuantities()`; items
  `เสาเอ็น / ทับหลัง / คานเอ็น ค.ส.ล.` in m) and `Roof` (kind `roof`: plan area / cos pitch, covering = library kind `roof`,
  ridge / eave / verge m). Excel sheet “Walls” (`planWallImport`: openings by door / window type codes). Measures: wall
  area = net, length; roof area = slope.
  Phase 3c: room `waterproof {finish, upturn}` (library kind `waterproof`: floor + (perimeter − doors) × upturn), `Railing`
  (kind `railing`: length × library kind `railing` items per m) and `Fixture` (kind `fixture`: description, unit, items per set;
  placed by WBS like doors; Excel sheet “Fixtures”, `planFixtureImport`). Rooms sheet columns P / Q = waterproof code / upturn (m).
- Steel Structure (phase 4a): category `SteelAssembly` (member = Tekla-style assembly, `steelCategories` in
  `src/domain/steelInputSchema.ts`, quantity only). `member.steelInput {type, name, parts[mark, profile, grade, count,
  length, main, weight?], bolts, welds, paint}`; profiles parsed from their names by `parseProfile()` (`steelProfiles.ts`:
  H / C / [ / L / PIPE / RHS / PL / RB, area → kg/m at 7,850, H root radius table, paint perimeter; listed weight wins).
  `applySteelInput()` (`steelInput.ts`) writes site items `stl-*` (kg per profile + grade, plates per thickness, bolts,
  welds m, paint m²); owner BOQ: kg items in tonnes when the unit says so, `area` = paint area. A3 sheet `steelSheet.ts`
  (material list, bolt list, welds, notes, main part strip, plate outlines, title block) → `SteelSheetPreview.tsx` in the
  “แบบ & BBS” tab (PDF via `drawPrims`, DXF via `primsDxf`); form tab “Assembly เหล็ก” `SteelForm.tsx`; Steel page
  `SteelSchedules.tsx` + Excel Parts / Bolts / Welds / Assemblies (`src/data/steelExcel.ts`, `planSteelImport`).
  Elevation / sections / weld symbols = phase 4b. Test: `tmp/steel.test.tsx` (sample FS-AS-C21).
- Owner / consultant BOQ chapters per project: `project.boqChapters` (`src/domain/boqChapters.ts`: items code / title / unit +
  optional `rule {component, disciplines, categories, mix, diameters, grades, buildings, siteItem}`; no rule = heading).
  `boqContributions()` = every quantity per occurrence (concrete, formwork, excavation, backfill, lean, rebar per bar,
  pile / pile cut, site-work items); `boqChapterReport()` puts each in the most specific matching item, rest = unmatched
  (pile / cut by length when the unit is m, rebar ÷ 1000 for ตัน). Excel sheet “BOQ” (A–L rules, M–O quantity / rate /
  amount) `src/data/boqChaptersExcel.ts`; command `saveBoqChapters` (admin / QS, null clears); in backup / restore.
  UI: BOQ Summary tab “ตามหมวด BOQ เจ้าของงาน” `components/OwnerBoq.tsx` (uses the page scope). Test: `tmp/boqChapters.test.tsx`.
- Help (คู่มือ): topics in `src/help/helpContent.ts` (`helpTopics`: group, summary, where, steps, tips, limits, related,
  figure, `updated`; `helpChanges` = “มีอะไรใหม่”; `contextTopic()` maps page / category → topic), schematic SVGs in
  `src/help/HelpFigures.tsx`, drawer `src/components/HelpCenter.tsx` (top-bar “คู่มือ” button / F1 opens the current page's
  topic; `<HelpButton topic>` beside headings / tools; `openHelp(id)` from anywhere). **Every feature change updates its topic
  (text, limits, `updated` date) and adds a `helpChanges` row; a new menu / tab / tool gets a topic and a HelpButton.**
  Harness: `tmp/preview/help.html` (`#<topic>`, `#all` = every figure).
- Windows PowerShell 5 `Get-Content`/`Set-Content` corrupts Thai UTF-8 text — edit files with the editor tools only.
- Storage reads use `getBlob`, which needs bucket CORS: `cors.json` (applied to `my-boq-app.firebasestorage.app`;
  add new web origins there and re-apply with `gcloud storage buckets update gs://my-boq-app.firebasestorage.app --cors-file=cors.json`).
- Do not deploy `firestore.rules` / `storage.rules`, and do not edit `.env` or Firebase config; the owner deploys. Since SEC1 the rules
  in the repo are the real ones (project roles from the user profile, append-only records, AI keys in `apiProviderSecrets`):
  docs/SECURITY_RULES.md (path × role table, deploy order, rollback). A new collection / project key / Storage folder needs a rule
  and a case in `tests/rules/securityRules.emu.ts` (`npm run test:rules`, separate demo emulators). UI check with the new rules:
  `tmp/secemu/` (copies of the rules, ports 9397 / 8382 / 9597, `node tmp/secemu/dev.mjs` on 5183).
