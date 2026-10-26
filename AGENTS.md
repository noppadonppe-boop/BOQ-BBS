# AGENTS.md

## Commands
- Dev server: `npm run dev` (Vite, http://127.0.0.1:5173)
- Local Firebase: `npm run emulators`
- Verify (typecheck + build): `npm run build`
- No test suite is committed; `vitest` is installed for ad-hoc tests (`npx vitest run <file>`).

## Structure notes
- Element input (manual / from drawing) → `src/domain/elementInput.ts`; UI `src/components/ElementInputPanel.tsx`.
  It converts the per-category input into the existing member fields and generated bars (ids prefixed `gen-`).
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
  old `bend` / `endHook` inputs are migrated in `migrateShapes()`. Shape 41 (U legs full depth + 15d inward, footing only).
  Footing `slab` (cast with floor slab: reference slab regions `genslab-*`, top bars extend into slab) and
  `rebar.side` (horizontal perimeter loops), `rebar.sideBars` (vertical face bars, outermost; one Mark via offsets +
  offsetTurns) — `footingSlabOn()`, `migrateFootingSlab()`. Ad-hoc test: `npx vitest run tmp/shapes.test.ts`.
- Custom element shape model (Phase 1): `member.shapeModel` (`src/domain/shapeModelSchema.ts`) = vertical parts
  (box / polygon / circle-ring / shaft, solid or void, stage, z0+height) + piles + site. Geometry engine
  `src/domain/shapeGeometry.ts` (level slabs, polygon-clipping union/difference, equal-area circles, surfaces, contains,
  sections) hooked in `solids.ts`; apply/checks in `shapeApply.ts`; views in `elementViews.ts` / `projection.ts`;
  UI `ShapeModelEditor.tsx` (tab “รูปทรง” for Custom). AI shape reading: gateway task `shape` in `functions/index.js`
  (owner must deploy) + `src/data/aiShapeAnalysis.ts` + `src/domain/shapeProposal.ts`; the browser sends zoomed views of
  the sheet (`src/data/drawingViews.ts`, overview + 3×2 tiles) as `context.views`. Proposal notes carry part / face / dir
  (`shapeModel.rebarNotes[].partId|face|dir`, questions in `rebarQuestions`) used as hints by `suggestFromNotes`.
  Tests: `tmp/shapeModel.test.ts`, `tmp/f02.test.ts`.
  CAD / BIM sources (`src/domain/fileTypes.ts`): DWG / DXF / IFC upload as reference attachments (no Mark review);
  DXF (`dxf-parser`) and IFC (`web-ifc`, lazy WASM) are read in the browser by `src/data/cadDrawings.ts` into views
  + an exact text summary (`context.cadText`); the gateway never sends the raw CAD file. DWG: user saves as DXF.
- Rebar sketch (Phase 2): `src/domain/rebarSketch.ts` (view regions, cover snap lines, snapping, shape-code detection,
  layout rules, `sketchBar`, `meshBars`, `loopBars`; sketched bars have ids `sk-`, polyline + distributionAxis so the
  view is recovered from the bar) + UI `RebarSketch.tsx` (tab “ใส่เหล็ก (วาดบนรูปตัด)” for shape-model members).
  Tests: `tmp/rebarSketch.test.ts`. Forced cover drawing: `coverRings` / `snapToCover` / `traceCover`; end hooks `addHooks`.
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
  Beam groups (plan / elevation): `buildView` → `beamCols` (dashed column faces, grid centre lines + bubbles) and
  `exDims` (EX bar extents split at column faces, rows by `exDimRows()`, top above / bottom below); grid c/c chain on top.
  Test: `tmp/beamGrid.test.tsx`. Column size per grid: `support` (X, along the beam) × `supportY` (across, 0 = X);
  3D views draw the columns (display only, stub below / above) from `beamColumnBoxes()` via `contextBoxes()`.
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
  `tmp/Spec-Project-J-078.json`.
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
- Windows PowerShell 5 `Get-Content`/`Set-Content` corrupts Thai UTF-8 text — edit files with the editor tools only.
- Storage reads use `getBlob`, which needs bucket CORS: `cors.json` (applied to `my-boq-app.firebasestorage.app`;
  add new web origins there and re-apply with `gcloud storage buckets update gs://my-boq-app.firebasestorage.app --cors-file=cors.json`).
- Do not edit or deploy `firestore.rules`, `storage.rules`, `.env` or Firebase config; the owner manages them.
