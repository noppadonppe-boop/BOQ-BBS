# Sheet Composer (จัดหน้าแบบ)

Member › tab “แบบ & BBS” › **จัดหน้าแบบ** opens a full-screen editor of the BBS sheet: move / crop / scale each view,
projection lock, smart guides, view list with unplaced views, sheets, automatic arrangement, undo / redo, the section
tool, and layout templates. PDF, the on-screen preview and the DXF export (every mode; mode B = one VIEWPORT per box)
draw the same layout. Members without a layout / template draw exactly as before (snapshot test of round 1).

## Data

### Sections — `member.drawingViews` version 2 (`src/domain/drawingViews.ts`)

Version 1 is still read. v2 sections add `look` ('+' default, '-' = seen from the other side: the horizontal axis is
mirrored), `depth` (mm beyond the cut whose bar planes are also drawn), `extent` (range along the cut line → the view is
cropped to it + a margin), `source` default | user, `columns` (pedestal / starter plan section). Up to 12; labels and
planes unique (schema); positions past the member are `drawingViewProblems`. `migrateDrawingViews(v1, defaults)` keeps every
v1 cut (source user) after the default ones. `nextSectionLabel()` = next free A-A, B-B ….

Without v2 sections the sheet derives the defaults (`defaultSections()` in `src/domain/sheetLayout.ts`): `def-x` X–X
(axis Y at `defaultCuts().y`), `def-y` Y–Y (axis X at `.x`), `def-z` Z–Z (axis Z at `columnSectionCut().z`, columns) —
the same views as before, nothing written until the user changes them. A member that only has v1 views keeps its old sheet.
The view editor (“ภาพหลัก / รูปตัด”) and the Composer edit the same list and write v2; section edits follow the old
drawingViews rules (member → Draft). `sheetViews()` (`bbsSheet.ts`) builds every view from these sections.

### Layout — `member.sheetLayout` (`src/domain/sheetLayoutSchema.ts`)

`{version:1, sheets:[{id, views:[{view, x, y, w, h, n:'auto'|1..1000, lock?:{to, axis:'x'|'y'}, fixed?, show?:{dims, marks, levels, allBars}}]}], unplaced}`,
`view` = `plan | plan-bottom | plan-top | sec:<section id> | notes`; boxes are sheet mm (the frame incl. the title band).
A view appears once. Unknown keys are skipped when drawing; views not in the layout are unplaced.

- **One page layout**: layout sheet k = page k; the right strip (BBS / BOQ / title block) and the header band are keep-out;
  `notes` is a box (notes + Mark legend are drawn only where it is placed). Pages = max(table pages, layout sheets).
- **Split layout**: table pages first, then one page per layout sheet; header band and title strip are keep-out.
- Views of a composed 'one' layout are drawn without the tight crop, like the automatic sheet, so a layout written out from
  the automatic arrangement (“จัดอัตโนมัติ”) draws the same views (test).
- Beam groups and column stacks keep their own paging (Composer disabled).

Resolution (`resolveSheetLayout`): member layout → project default template of the category (foundation type) → slab floor
system layout “พื้น” (`from:'system'`, docs/SLAB_FLOOR.md) → automatic. Slab floors add the paper ViewKeys
`schedule | legend | keyplan | stddet` (and template roles of the same names) and automatic opening details `det:op-<id>`.

**Projection lock** (`lock`): rendered after its target; same scale and the shared model axis (x: horizontal axis, y:
vertical axis, no mirrored view) → the box is shifted so that the same model coordinate lies on the same sheet x / y
(< 0.01 mm, test); otherwise the centre lines are aligned and `lockNote` explains why.

**Scale**: `n` fixed or 'auto' (sheet setting); when the view does not fit its box at `n`, the next standard scale that
fits is used and the view is reported `fits:false` (preview warning, red frame in the Composer).

**Checks** (`layoutBoxProblems`): overlapping boxes, outside the drawing area, on a keep-out → “เสร็จ” disabled.

### Templates

`project.sheetTemplates = {version, templates[], defaults:[{category, foundationType?, id}]}` saved by command
`saveSheetTemplates` (admin / QS; layout only, no member change), restored with backups (`restoredSheetTemplates`).
The General Spec may carry `spec.sheetLayoutTemplates` (spec import key `sheetLayoutTemplates`, merged by name); the project
sees its own templates first, then the spec's (`sheetTemplatesOf`). Template = `{id, name, category, match?, size, sheets
(views by role: plan…, notes, sec-x, sec-y, col-z, user-n), sections:[{role, label, axis, at (0..1 of the member size), look, depth?}]}`.
`templateFrom()` / `templateLayout()` / `templateSections()` (ids `tpl-<n>`). Using a template copies it into the member;
the project default is applied live to members without their own layout.

## UI (`src/components/SheetComposer.tsx`)

Sheet = `drawSheetInfo` prims (PrimsSvg) + overlay boxes (8 crop handles; the drawing keeps its scale), keep-out shading,
grid 5 mm, smart guides (edges / centres + gap label), projection snap while dragging (purple guide “ล็อกแนวฉายกับแปลน”,
lock written on release). Keys: arrows 1 mm, Shift 5 mm, Delete → unplaced, Ctrl+Z / Ctrl+Y, Esc, V / S. Left: views of the
sheet (reorder, drag to a sheet thumbnail), unplaced (“วาง” = free spot). Bottom: sheets, + new sheet, delete an empty one.
Right: scale, cut position, look, depth, show switches, lock / fixed, remove / delete section.

Section tool (S): click a start point on a plan / section (`sectionSnaps` + `snapModelPoint`: bar legs, concrete edges,
centre; label “Snap: แนวเหล็ก F03 · X = 1,620 mm”, position editable), click the end (axis-parallel cut, live preview with the
number of Marks seen and a warning when none, Tab = look), then click on the sheet (green = suggested free spot, or
“วางแผ่นใหม่” / keep unplaced). Plans draw added cuts with split bubbles (letter / sheet number) on PDF, preview and DXF.
Cut lines on plans can be dragged; right click on a bar leg → “สร้างรูปตัดตั้งฉาก”.

“เสร็จ” writes `sheetLayout` (and drawingViews v2 only when the sections changed) into the member draft; save the member as
usual. Read-only users can open it to look.

## Mark label check (`src/domain/labelQa.ts`)

`labelIssues(prims, views, rules)` / `labelReport()` check the drawn sheet (never change it): label boxes (text width
estimate `textWidth`, cap 0.8 · size) — `overlap`, `onText` (dimension / level / other text of the view), `cross` (leaders
crossing), `outside` (label past its view box) = high; `tight` (closer than `minGap`), `onLine` (bar / concrete / dimension
line through the label), `long` (leader > `maxLeader`) = low. Rules `spec.cadStandard.labelQa {enabled, minGap 1, maxLeader 75,
lines}` (optional key: standards saved before still parse), read with `labelRulesOf(spec)`; UI tab “ตรวจป้าย Mark” in
`CadStandardEditor`. Shown by `LabelQaBar` / `LabelQaOverlay` (`components/LabelQa.tsx`): preview (chips per view, “แสดงบนแบบ”,
issue list → zoom `zoomBox`), Composer right panel (click selects the view), DXF dialog “ตรวจก่อนส่งออก” (all pages). Warnings
only. Test `tests/labelQa.test.ts`; ad-hoc counts on every fixture sheet `tmp/labelAudit.test.ts`. Next: placement solver +
“ลองหลายแบบ” variants, dragged label offsets.

## Tests

`tests/sheetComposer.test.ts`: default sections = old cuts, v1 member sheet unchanged, v1 → v2, schema / bounds, snap on a
bar line, depth / look, projection lock (≤ 0.01 mm, also after a drag) and centre-line fallback, box checks, written-out
auto layout = automatic sheet, unknown keys / notes / pages, template 2,100 × 1,050 → 3,600 × 2,400 (cut at the same
fraction, smaller scale + warning, bubble on the plan), restore, DXF mode B viewports at the boxes
(`output/dxf-verification/composed-B.dxf`, audited by `tools/qa/dxf_audit.py`). Dev harness `tmp/preview/composer.html#footing|small|big`.

## Drawing Edit mode (แก้ไขแบบ, phase 1)

The header switch “จัดหน้า | แก้ไขแบบ” turns the canvas into an annotation editor (`components/DrawingEditLayer.tsx`):

- Select an automatic annotation (Mark leader, dimension chain, level, cover C, EX dimension) by clicking it; drag / arrow keys move
  it (Mark text and elbow, the arrow stays on the bar; dimension line perpendicular only; level sideways). Panel: own text (dims:
  `<>` = measured value), offsets, Hide (Delete), Restore Auto. Hidden items are listed under “ซ่อนไว้” with “แสดง”.
- Add text (T) and leaders (L: arrow point, then text point). They are stored at view model coordinates, so they follow the view when
  it is moved or rescaled.
- Data: `member.drawingEdits` `{version:1, views:{<ViewKey>:{over:{<key>:{hidden,dx,dy,off,text}}, objs:[text | leader]}}}`
  (`src/domain/drawingEdits.ts`). Keys come from `renderView` (`mark:<bar id>`, `dim:<dir><side><n>`, `cover:<n>`, `ex:<id>`,
  `level:<n>`); an override whose key no longer exists is ignored. Undo / redo and “เสร็จ” are shared with the layout mode.
- Output: the edits are applied inside `renderView`, so preview, PDF and DXF (MTEXT / LEADER / DIMENSION) are the same; members
  without edits draw exactly as before (`tests/sheetSnapshot.test.ts`). Test `tests/drawingEdits.test.ts`.

### Phase 2

- Tools: + Dimension (D: snap points one by one into a chain, click empty space to place the line, Enter = standard offset; A adds
  a point to the selected user dim, × removes one), + ระดับ (E: vertical sections), + Mark (M: click a bar, then the text point).
- Anchors `{u, v, eu?, ev?, bar?}`: `eu` / `ev` = the coordinate follows the min / max edge of the concrete box of the view
  (`concreteBox`, `anchorPoint`), `bar` = Mark row id. Snap points per view: `viewSnapPoints()` (concrete corners / edge midpoints,
  bar dots / line ends / midpoints) from `SheetViewInfo.data` (the drawn ViewData).
- Level values: `ViewData.datum` (level in m at v = 0: footing `footingLevels().bottom`, single column pour bottom), else from the
  member base. Mark leaders `fromMark` take the text of the bar row in that view (n-DB@s) and carry the DXF Mark block data.
- Lost anchors (`lostAnchors()`): a bar no longer drawn in the view → the object is drawn red and listed in the panel.
- Automatic dims: “แยกเป็นของผู้ใช้” creates the user dim at the same points (edge flags set) and hides the automatic one.

### Phase 3

- Detail views: `member.drawingEdits.details` [{id, label, parent ViewKey, u, v, r, circle}] → ViewKey `det:<id>`; the parent view's
  spec + `window` (`ViewSpec.window`): `renderView` fits the window, hides member-wide dims / levels, keeps Mark labels inside and cuts
  everything to the circle / square (`primClip.ts` `clipPrims`). The parent view draws a dashed region + bubble (label / sheet) for
  placed details (`detailMarks`). Composer tool “+ รูปขยาย Detail” (K): centre → radius → place (the sheet may be switched first);
  scale = largest standard ≤ parent / 2.5.
- ISO 3D: ViewKey `iso` (`ViewSpec.iso` → `isoView()`): concrete box / footing outline edges + bar centrelines, isometric.
- Stepped sections: `section.steps` [{from, position}] (drawingViews v2) → `ViewSpec.steps`: pieces built with `exact` extents and
  merged (`stepAt` = dash-dot break lines); plan cut lines step (`sectionLines[].steps`). Editor in the section panel.
- Detail and ISO views exist only in composed layouts (`sheetViews(s, extras)`), so automatic sheets are unchanged.
- Saving: the Composer uses `saveMemberDrawing` (sheetLayout + drawingEdits only; admin / qs / detailer; the member keeps its status)
  when the sections are unchanged and the member editor has nothing unsaved; else the member edit (`saveMember` → Draft).
  Project role `detailer` (ผู้เขียนแบบ): drawing only.

### Mockup gaps (after phase 4)

- Object list (left column in edit mode, `useDrawingEdit().list`): annotations per view, user first, badges MRK / DIM / LVL / TXT / LDR /
  C / EX / REV, filter all / user / edited (override) / lost; click selects, double click focuses the text field.
- Context menu (`list` items and the sheet, `useDrawingEdit().context`): edit text, hide / delete, restore Auto, detach dim, add point,
  re-anchor; empty view point: text here + tools. Right click while a tool runs ends the command.
- First / last bar anchors: `anchor.pos` first | last (+ `t` 0…1 along a bar line), also on leaders (`pos`, `t`); `barExtremes()` /
  `anchorPoint(a, cb, bars)` in `elementViews.ts`; `viewSnapPoints()` labels those snaps “เส้นแรก / เส้นสุดท้าย”.
- Re-anchor (tool `reanchor`): replaces the lost bar anchor of a leader / level (dims: one lost point per click).
- Grouped icon toolbar (`ed-ribbon`; section / detail via `EditExtras` switch to the layout mode and start the tool).
- Screen colours: user annotations orange, automatic grey (`tint` in `filter`, screen only); “สีพิมพ์” shows the printed colours.
  “ที่ซ่อน” = list filter `hidden` (single overrides + whole groups, “แสดง” restores).
- `ViewEdits.hide {dims, marks, levels}` (panel “แสดงในรูป”, `setHide`): renderView merges it into `hide` (dims include covers / EX);
  overrides of a hidden group are not counted stale; templates carry it.

### Phase 4

- Drawing status (`src/domain/drawingStatus.ts`): `auto` (no edits) · `ok` · `check` = the model changed since the drawing was saved
  (`drawingEdits.check.hash` vs `drawingModelHash(member)`: everything except the drawing layer, review / version data, occurrences),
  lost bar anchors, or overrides whose key is no longer drawn (hidden ones excluded). Saving in the Composer writes `check`.
  Pills in the Composer header / edit panel and next to “จัดหน้าแบบ” in the sheet preview.
- Revisions `drawingEdits.revisions` [{rev, date, desc, by}] (≤ 20, unique rev), table box ViewKey `revs` in composed layouts
  (newest first, `drawSheetInfo().revs`); clouds = user objects `cloud` {pts, rev} (scalloped polygon + rev triangle, symbol layer).
  Edit mode tool C (2 corners; a first cloud creates rev A), revision editor in the idle panel.
- Templates: `sheetTemplate.edits` (per role, `templateFrom(…, edits)` / `templateEdits()`): overrides + user objects except clouds;
  details / revisions stay with the member. Save dialog “รวมการแก้ไขแบบ”.

## Next round

Oblique (non axis-parallel) sections; beam groups / column stacks in the Composer.
