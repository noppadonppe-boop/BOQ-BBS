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
  positions + reference section); `applyFoundationTemplate()` keeps detailing, column bars and pile length (when 0).
  UI: footing section 1 button → `FoundationTemplatePicker.tsx`; General Spec list `FoundationTemplateList.tsx`; spec import
  key `foundationTemplates`. Footing stirrups `rebar.stirrups {width, dir}` (closed links over a band, role `stirrup`).
  J-078 Phase 1 (F10 / F12 from MPK01B-IFC-S-PLIE FD Review): `tmp/j078Foundations.test.ts` → `tmp/Spec-Project-J-078.json`.
- Concrete mixes (General Notes strength schedule): `spec.concrete {mixes (f'c 28 / 14 / 7 d in ksc, W/C, shrinkage), uses
  (member type → mix, categories)}` in `src/domain/concreteMixes.ts`, UI `ConcreteMixEditor.tsx` (General Spec), spec import
  key `concrete` (J-078: `tmp/Spec-Project-J-078.json`). Member mix = element input `concreteMix` or the first use row of
  its category; `detailingFromSpec(spec, base, {category, mix})` writes `detailing.concrete` and picks the lap table by the
  mix f'c (`lapConcreteFor`: 350 ksc → 35 MPa). Shown on the A3 notes / BOQ line (`memberConcrete`, `concreteNote`),
  `quantityReport().concreteByMix`, price labels and the Excel BOQ. Test: `tmp/concreteMix.test.ts`.
- Windows PowerShell 5 `Get-Content`/`Set-Content` corrupts Thai UTF-8 text — edit files with the editor tools only.
- Storage reads use `getBlob`, which needs bucket CORS: `cors.json` (applied to `my-boq-app.firebasestorage.app`;
  add new web origins there and re-apply with `gcloud storage buckets update gs://my-boq-app.firebasestorage.app --cors-file=cors.json`).
- Do not edit or deploy `firestore.rules`, `storage.rules`, `.env` or Firebase config; the owner manages them.
