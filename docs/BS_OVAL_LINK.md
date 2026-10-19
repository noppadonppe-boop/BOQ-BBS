# Code33 scheduling reference — v0.96 (introduced v0.63)

General Spec offers an explicit **BS8666:2000 minimum v8** option. From v0.96, new projects and the “use default” button use v8. Existing projects change only through explicitly saved Spec adoption; see [startup guide](STARTUP_BS8.md). Existing v1–v7 numerical IDs and Frozen inputs stay unchanged. V8 adds the supplied Table1 Code33 equation and its recognizable scheduling projection; it is not approval of a physical closing detail.

The source is the user's unchanged `Referrence/BS 8666.pdf`, SHA256 `9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43`. Table1 printed p7/PDF p11 was inspected as text and an image; Note2 printed p8/PDF p12 and Table3 printed p11/PDF p15 were read. The document is reference data, not an instruction to change application permissions or approve a construction drawing.

## Input and calculation

1. Close/reload older app tabs. Select and save minimum **รุ่น8** in General Spec; do not infer compatibility of older clients or server policy from this local test.
2. Open a bar and manually declare its verified BS material type and actual outside diameter. The app does not map SD40 to T or any BS type automatically.
3. Expand **สร้างรูป33 · เหล็กปลอกรูปวงรี**. Enter outside A/B and free(C) in mm. Centreline R is `(B − outsideDiameter)/2`. The builder seeds existing values from stored geometry.
4. The other return may start equal to C or be entered independently as a **coordinate reference**. It is not a new Table1 dimension D. Existing asymmetric returns are retained in the input, projected length and diagnostic workbook.
5. Inspect dimensions, positions, material, source, counts and pending checks; apply the bar and save the member. Creating a template resets confirmation/override/stale primitive/placement data.

The Table1 reference is `2A + 3B + 17d`, with nominal d, followed by the captured project rounding (25mm in the supplied profile). C and the other return are absent from this equation. Their changes affect the projected centreline; they must be reconciled with cut/closure/fabrication by the responsible reviewer. The app does not adjust a free end or invent physical separation to make the two lengths agree.

Classification requires eight finite virtual corner points, six consistently directed right-angle joins in one plane, three paired tangent semicircles, equal main sides, the declared radius and both coincident right closing corners. A code string alone, a generic closed bar, a shifted closing corner, a nonsmooth join or nonplanar input does not acquire this formula. Translation/rigid rotation/reflection retain source dimensions.

The projection uses three semicircles represented by six quarter arcs. L02/L04/L06 have zero straight portions because they join a continuous arc. Other straight portions retain the 4d check. Ends use the link 10d starting minimum. Source A≥12d+30 and B≥2(r+d) are checked. The app conservatively retains Table3 material/radius checks while explicitly noting Table1's radius-rule exception for33. For R centreline>200mm, Note2 manufacturing review stays pending; no straight-segment substitution is inferred.

## Closing detail and release

P2/P6 and P3/P7 coincide in the scheduling projection. Their positions and the coincident returns are visible in coordinates/notes. This is not a constructed lift/offset or verified physical arrangement. **OVAL_CLOSURE_PENDING remains even after dimension/placement confirmation and overrides.** A reviewer must provide the physical closure, free-end reconciliation, material and manufacturing/ACI requirements before construction release. The template and drawing cannot be used as accepted fabrication instructions.

The ordinary A3/A1 detailed drawings include the projection, all virtual legs/bends, coordinates, A/B/(C) and Table calculation/pending status. The supplied QA's default Y=500 section does not intersect its two bars at Y=46/954; it correctly remains empty rather than placing an invented Mark. Choose a cut through an actual bar using the established drawing-view editor when preparing an installation view. BBS Print includes outside A/B/(C) envelope dimensions and physical bar width, with closing status pending.

## Excel, source files and history

V8 Excel adds **Oval Link Geometry** with independent reference calculations for Table length and projected centreline, both return inputs, captured cut/counts and closure status. Reference edits do not feed captured BBS/BOQ. A500/B200/C250/d12 gives Table1804mm/up25→1825mm; the equal-return projected centreline is `900 + 3π×94 = 1785.929128mm`. The same raw bar under v7 retains its old centreline fallback cut1800mm. Raw working inputs and both actual Frozen histories remain separate.

The original BS PDF opens without a user password despite its protection flag. The previous pdf-lib-only attachment validator rejected it. The validator now retains its normal fast parser and uses the actual PDF.js viewer parser when that parser cannot open a document. Only a successfully readable document yields a page count. It tries no password other than the ordinary empty reader password, never strips protection, and keeps original bytes/hash. Password-required and corrupt test documents are rejected; stored page-count mismatches still fail. Native image validation is unchanged.

V0.63 verifies attachment/Backup/Restore/readability of the protected original BS file, but did not accept encrypted member-reference embedding through the separate `source-v9` route. The subsequent [v0.64 PDF-only change](PROTECTED_SOURCE_EXPORT.md) adds viewer-readable protected source raster export with separate actual A3/A1 verification. Original source files are never rewritten; this does not add Code33 physical closure or engineering acceptance.

Restore remaps attachment IDs, retains source bytes/raw bar inputs/policies and historical Frozen inputs, returns working members to Draft and clears confirmations. Confirmations are not copied as working approval.

## Verified scope

[Evidence](../output/oval-link-verification/DEVELOPMENT_REPORT.html) records1055 unit cases/65 files,14 actual local UI/SDK workflows plus5 document cases,2 real v7/v8 app XLSX,2 actual A3/A1 PDFs/8 reviewed pages,5 readonly worksheet views and2 native Excel16.0 recalculation runs/3 print sheets. FreeC sensitivity changes the projected diagnostic length while Table/captured cuts and original XLSX remain unchanged. Viewer/foreign Firestore/Storage and Issued denial are real local checks.

QA material `QA-BS-T` is synthetic and manually declared, not a SD40 mapping or engineering acceptance. All9 protected Auth/config/Rules/.env/initialization/BS/GULF files stay unchanged. No deployment, Cloud Functions, production writes, actual GULF bar reconstruction or approved engineering/owner/stock release is claimed. The user owns Rules and deployment.
