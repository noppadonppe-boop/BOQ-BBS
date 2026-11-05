# DXF export (editable, DXF 2018)

BBS drawing sheets export to **DXF 2018 (AC1032)** that a CAD drafter can keep editing: dimensions are
`DIMENSION` objects, Mark labels are `LEADER` + `INSERT` of block `BBS-MARK` with attributes, notes and table cells are
`MTEXT`, and every entity is **ByLayer** on the project's CAD standard layers. PDF and the on-screen preview are
unchanged (snapshot test, see below). The old R12 writer (`src/data/primsDxf.ts`) stays as the “ไฟล์แบบเดิม R12” option.

Where: member › tab “แบบ & BBS” › **ส่งออก DXF** (saved data only, like the PDF). Steel assembly sheets export mode A.
Standard: General Spec › **มาตรฐาน CAD สำหรับ DXF** (`spec.cadStandard`).

## Modes

| Mode | Model space | Paper space | Dimensions |
|---|---|---|---|
| **B · Model 1:1 + Layout** (default) | every view at true size (mm), views of sheet *k* after those of sheet *k−1* along X, never overlapping | one Layout per sheet `A3-01`, `A3-02` … with frame, BBS / BOQ tables, notes, title block and one **locked VIEWPORT** per view (view height = paper height × n) | `BBS-DIM-1-n`: DIMSCALE = n, DIMLFAC = 1; text height = textHeight × n |
| **C · Model only** | sheet frame = block `TTLB-<k>` inserted ×N (N = most used scale of the sheet), views at 1:N drawn at true size on it; views at another 1:n = block `VIEW-<k>-<view>` of the true-size view inserted ×N/n | empty `Layout1` | `BBS-DIM-1-n` (DIMSCALE = n) — inside a view block the dimension measures in block units, i.e. true size, so DIMLFAC stays 1 |
| **A · Sheet coordinates** | every sheet as on the PDF (pages side by side, 20 mm apart) | empty `Layout1` | real `DIMENSION`s on paper; `BBS-DIM-1-n` has DIMLFAC = n so the number is the real length |

Not-to-scale views (n = 0, e.g. beam-group elevations fitted to the box) stay in paper space in B, on the frame in C, and use
`BBS-DIM-NTS-<f>` with DIMLFAC = real mm per drawn unit. The export window warns about NTS views and about scales outside
1:1 / 2 / 5 / 10 / 20 / 25 / 50 / 75 / 100 / 200 / 250 / 500 / 1000.

The export window can switch each editable object off (dimensions, leaders, MTEXT, Mark block); a switched-off object
is written as the plain lines / text the PDF draws. “แยกไฟล์ตาม Tag” writes one file per Tag sheet set into a ZIP.
File name: `<project>-<member>-BBS-<LANG>-<mode>.dxf`.

## Layers (default S-* set, all ByLayer)

| role | Layer | ACI | Linetype | LW | Plot |
|---|---|---|---|---|---|
| concrete | S-CONC-OTLN | 8 | Continuous | 0.35 | ✓ |
| concreteHidden (context, piles, excavation, reference columns) | S-CONC-HIDN | 8 | HIDDEN2 | 0.18 | ✓ |
| barMain | S-REBR-MAIN | 5 | Continuous | 0.50 | ✓ |
| barLink (ties / stirrups / links / hoops) | S-REBR-LINK | 4 | Continuous | 0.35 | ✓ |
| barRef | S-REBR-REFR | 9 | DASHED | 0.18 | ✓ |
| dim (dimensions, cover marks, level marks, grid bubbles) | S-ANNO-DIMS | 3 | Continuous | 0.18 | ✓ |
| mark (leaders, Mark block, legend) | S-ANNO-MARK | 2 | Continuous | 0.25 | ✓ |
| text | S-ANNO-TEXT | 7 | Continuous | 0.25 | ✓ |
| symbol (cut lines, grid lines, pour joints) | S-ANNO-SYMB | 6 | CENTER2 | 0.18 | ✓ |
| titleBlock (frame, tables, title block) | S-ANNO-TTLB | 7 | Continuous | 0.35 | ✓ |
| viewport | S-ANNO-VPRT | 1 | Continuous | 0.09 | ✗ |

Every layer of the standard is written even when empty. Lineweights are rounded to the nearest DXF standard value.

## Architecture

- `src/domain/drawingPrims.ts`: semantic primitives `dim` (linear: feature points `a` / `b`, a point on the dimension
  line, `value` = real mm, optional text with `<>`), `leader` (points from the bar, text, Mark data) and `mtext`, plus
  `layer` (role) / `view` (sheet view id) on every primitive. Each semantic primitive carries `draw` = the exact plain
  primitives drawn before; `expandPrims()` returns them, and the SVG (`PrimsSvg`), PDF (`primsPdf.ts`), R12 DXF and MCP
  tools expand first, so the drawing is bit-for-bit the same. A dimension chain keeps its whole drawing on the first segment.
- `renderView()` (`elementViews.ts`) emits dimension chains, cover marks, beam EX dimensions and Mark leaders as semantic
  primitives with layer roles and reports its sheet ↔ model map (`frame`); `drawSheetInfo()` (`bbsSheet.ts`) returns
  `views [{id, title, box, n, s, axes, normal, cut, origin {sheet, model}}]` (u = model₀ + (x − sheet₀)/s, v = model₀ − (y − sheet₀)/s);
  table / title-block cells and notes are `mtext`.
- `src/domain/cadStandard.ts`: `cadStandardSchema` / `defaultCadStandard()` / `cadStandardOf(spec)`; stored as
  `spec.cadStandard` (spec schema, backup / restore with the project, spec import key `cadStandard`). UI
  `CadStandardEditor.tsx` (layers, dimension / text basics, Mark block; template import shown disabled for the next round).
- `src/data/dxf/`: `writer.ts` (handles, owners, tables, blocks, objects), `entities.ts` (primitive → entity),
  `layoutA|B|C.ts`, `common.ts`, `index.ts` (`buildBbsDxf` / `exportBbsDxf`). Runs in the browser; no runtime dependency.
  UI `DxfExportDialog.tsx`.

## Leader: LEADER + block instead of MULTILEADER

The Mark label is a `LEADER` (no arrowhead, annotation type 2 = block reference, code 340 → the INSERT) bound to an
`INSERT` of `BBS-MARK` whose attributes are `LABEL` (visible, the text as drawn) and `MARK`, `N`, `SIZE`, `SPACING`,
`LAYER` (invisible, bar data). The dot at the bar is a solid `HATCH` on the Mark layer. MULTILEADER was not used in this
round: its context-data block is large and version-sensitive, and it could not be checked in AutoCAD here; LEADER +
INSERT is understood by every reader we target and passes the ezdxf audit. Moving the leader does not move the dot.

## Dimension blocks

Each `DIMENSION` (rotated, 70 = 32) owns an anonymous block `*D<n>` with the extension lines (offset `extOffset`,
beyond `extBeyond`), the dimension line, ticks / closed arrows / dots, the text as MTEXT and the def points on
`Defpoints`, so programs that do not regenerate dimensions still show them. The DIMSTYLE arrow “dot” is drawn in the block
but written to the style as the default arrow (no `_DOT` block yet).

## Tests and audit

- `tests/sheetSnapshot.test.ts` — expanded sheet primitives of the fixtures (pile cap 2 stages + pedestal, its split
  layout, 2-storey column stack with couplers, 4-span beam group, tagged custom assembly per Tag, steel FS-AS-C21) equal
  the snapshot taken before the change (`tests/__snapshots__/sheets.json.gz`, tolerance 1e-6, `layer` / `view` ignored).
- `tests/dxfExport.test.ts` — every fixture × mode: unique handles, every owner / pointer exists, `$HANDSEED` above all
  handles, one DIMENSION per semantic dimension with distance(13, 14) = value in B / C and × DIMLFAC = value in A,
  B viewport view height / height = n, leaders bound to INSERTs, no colour / linetype / lineweight on entities,
  Thai / Chinese text as UTF-8 (no `\U+`). Writes `output/dxf-verification/<fixture>-<mode>.dxf`.
- `tools/qa/dxf_audit.py` (`pip install ezdxf matplotlib`; test step only) — `ezdxf.readfile` + `doc.audit()`, counts
  per type / layer, viewport scales, PNG of Model and every Layout next to the files, `audit.json`.

Audit result (ezdxf 1.4.5, 2026-11-05): all 18 files (6 fixtures × B / C / A) read with **0 errors and 0 fixes**; the PNGs
of the B layouts match the PDF sheets (frame, tables, views at their scales), B model space holds the true-size views,
C model space the ×N frames.

## Limits / next round

- Not checked in AutoCAD / BricsCAD here (no CAD program on the build machine); structure follows ezdxf's R2018 output.
- No Annotative scaling (text heights are scaled per view instead), no MULTILEADER, no AutoCAD TABLE, no DWG.
- DXF 2013 / 2010 are shown disabled in the export window.
- CAD standard import from a customer template (DXF / DWT) — button shown disabled.
- **Pending:** the export pipeline that registers file checksums (`src/data/exports.ts` → server command
  `startExport`) only knows the PDF / Excel kinds and the server side is owner-managed, so the DXF downloads directly
  from the saved member data (the button stays disabled while the member is unsaved).
- Bar shape thumbnails in the BBS table are polylines + TEXT leg lengths (not dimensions).
- Images (company logo) are left out of the DXF.
