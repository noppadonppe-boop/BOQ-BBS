# BOQ print reinforcement coverage — v0.52

The Excel print sheets preserve the same captured quantities and reinforcement coverage as BOQ Summary. This is input completeness, not engineering approval. Draft/Frozen exports retain NOT FOR CONSTRUCTION.

| Printed field | Meaning |
|---|---|
| เหล็กที่กรอก kg | Subtotal of entered BBS rows, including entered rows whose source comparison is still pending. A numeric zero here can mean no rows have been entered. |
| เหล็กครบตามข้อมูล kg | Available only when every member in that group has entered reinforcement or an explicit no-rebar declaration with a basis. It remains blank when any member is pending. |
| สถานะข้อมูลเหล็ก | Identifies pending BBS/source comparison, a declared zero in a member group, or complete entered data. |

The complete steel total also remains blank if any selected member is pending. An explicit no-rebar scope retains a numeric zero and its basis in BOQ Coverage; it is never inferred from an empty BBS. Grouped rows count unique pending members, while quantities use the selected occurrence counts exactly once. A complete Zone can export a complete subtotal even when another Zone in the project is pending.

Rebar Summary and BBS Print identify their weights and totals as entered quantities. Both repeat the captured coverage notice and refer to BOQ Coverage. Their weights, source formulas, cut lengths and thumbnails keep their existing meaning. These sheets do not establish that source shapes or installation positions have been approved.

BOQ Print uses eleven columns on A3 landscape, repeats rows1–4 and excludes the total from its filter. Long group names wrap with adequate row height, including the supported80-character Zone. The workbook contains typed numbers and formulas; pending complete quantities have no formula or numeric cache. Native Excel printing still requires acceptance on the user's workstation.

Working exports capture the saved input at export time. Regenerating an older Frozen revision uses its original input coverage even after a later Working no-rebar declaration. Existing files remain historical evidence. Backup/Restore preserves declarations, source bytes, Frozen records and generated files; restored inputs remain Draft and are not engineering-approved.

Verification uses actual local Firebase Auth/Firestore/Storage and compiled public UI, including an assigned Viewer export. The three final XLSX files are checked against completed export jobs and Storage hashes, original OOXML types/formulas, independent entered-weight arithmetic, a readonly workbook recalculation and genuine Backup/Restore. Reader-only empty-string normalization does not modify exported bytes. The reader may display original Code00 text as0; the original XML remains text00.

User-owned Rules, Firebase/Auth configuration and deployment are unchanged. The numerical engine remains geometry-2.2+bs8666-2000-v7 for this dataset. Opt-in earthwork policy and older Frozen engine identities keep their existing behavior. Supplied BS8666:2000+Amd1/2 remains the startup minimum; ACI policy, independently approved cases, code33/code51 limitations, actual GULF reconstruction, owner/Issued and production acceptance remain outstanding.

See [verification evidence](../output/quantity-print-verification/DEVELOPMENT_REPORT.html), [coverage basis](BOQ_REINFORCEMENT_COVERAGE.md) and [original requirements](CURRENT_REQUIREMENTS_STATUS.md).
