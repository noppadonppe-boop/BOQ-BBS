# Separate A4 Draft cutting/bending schedule — v0.7

Source: unchanged supplied BS 8666:2000 + Amendments 1/2, PDF p.6 clauses 5.1–5.6 and PDF p.8 Figure 2. See BS8666_BASELINE.md for the full source hash and numerical adapter limits. Source pages were inspected visually, not solely through extracted text.

## Implemented output

A4 portrait, separate from A3/A1 installation/detail drawings. Figure 2 sequence: Member; Bar mark; Type and size; No. of members; Bars in each; Total number; Length of each bar mm; Shape code; A/B/C/D; E/R; Rev letter. Computer-produced column widths vary as permitted by clause 5.2. Supported formula dimensions are derived outside dimensions, with parentheses for the standard free variable. Code 12 schedules INNER R in E/R. Nominal d and exact geometric length remain separate from outside diameter and selected cut basis.

Every schedule has ten Mark slots. Member setup stores the actual drawing number (ending in three numeric characters), start number 1–99 and revision letter A–Z. References use its last three characters + two-digit table number + revision letter. No source drawing number or approval is inferred from a member code. Optional `scheduleRevisionLetter` is user-entered only for affected rows; it is not automatically stamped on every row. No terms “page number” or “sheet number” are printed. Full-package output sorts schedules by numeric reference; selected-member exports retain their stored numbering. Gaps/incomplete packages require manual coordination against the drawing register.

Missing setup, overlap within the selected package (including different full drawing numbers with the same three-digit suffix), and ranges past 99 block generation through both server and renderer. Different revision letters do not authorize overlapping numbers in one package. Partition distinct drawing groups into separate scopes/projects where necessary. Configured 500-leaf ceiling includes calculation appendices; it is not production load acceptance.

Each Mark has an A4 calculation/check appendix using the same reference. It includes full Mark/material, count calculation, radii, outside dimensions, equation, selected length/cut, centerline length, rounding, weight, pending minimum checks, note and source fingerprint. Code 99 dimensions/sketches are NOT substituted by generic A/B references. A3/A1 diagnostic coordinates remain separately available, while complete fabrication drawings remain pending.

## Immutable export/recovery

`kind=schedule`, `size=A4`, `drawingLayout=cutting-a4-v1` identify this renderer. Other export kinds retain their A3/A1 restrictions. Retry must keep kind/size/layout/name and its frozen snapshot. A4 layout metadata is checked by Storage rules and finishExport; real bytes are SHA-256 checked. Export-history pagination includes the new kind. Existing legacy layouts and snapshots remain accepted as before.

The renderer uses original Frozen inputs and quantities. It does not adopt the current project Spec or live member occurrence edits. Backup carries setup fields, per-row revision letters, export manifests and exact PDF bytes; Restore retains archived provenance and does not activate old revisions/approvals. A regenerated PDF can have different document timestamps/IDs and therefore a different file hash; a downloaded/stored/archived PDF must match its own recorded hash exactly.

## Verification and boundary

Synthetic fixture: 2 members / 15 Marks, 3 schedules (04601A–04603A), 15 check appendices, 18 A4 leaves. Selected member has four supported formulas and five leaves, cuts 925/750/750/1000 mm, 3 members × 2 bars = 6 pieces per Mark. Working edits change to 04705C / 9 members and row revision B; Frozen exports retain 04601A / 3 members / row revision A. Stress row has Mark 32 characters, grade 40 characters and note 500 characters; it stays visibly pending because its Mark violates the six-character minimum rule.

Evidence: output/schedule-verification API/UI/build/PDF results and actual downloads/ZIP/Poppler renders. Software fixtures are not independently approved engineering cases. This iteration does not claim large-project production acceptance.

The schedule remains a Draft with NOT FOR CONSTRUCTION. Clause 5.4's blanket conformity declaration is deliberately not printed because the current partial adapter cannot establish full conformity. Unimplemented shapes, fabrication tolerances, transport/mesh/end preparation, material evidence, ACI/project rules and independent engineering review remain pending. This output does not unlock construction Issued or production cutting release. No cloud deployment or submission to the owner has occurred.
