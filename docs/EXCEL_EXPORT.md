# Excel export

Use **Excel** in BOQ Summary after selecting members/category/Zone/Floor/grouping, or **Excel revision** in Delivery for a saved revision. Working and saved data remain separate. Existing completed files are downloaded unchanged; create a new export job to receive the new worksheets.

The workbook retains BOQ, BBS, Placements, Basis and existing registers. It appends:

| Sheet | Use |
| --- | --- |
| BOQ Print | Selected BOQ groups and their total quantities |
| Rebar Summary | Pieces, metres and kilograms by exact diameter and grade |
| BBS Print | Mark, first-bar thumbnail, outside dimensions, counts, cut and mass |
| BS Tolerances | Supplied BS2000 Table4 individual ranges, only when that minimum profile is active |

New worksheets use A3 landscape at 100% scale with bounded print areas and rows1–4 repeated. Print only the desired output worksheet. Manual page breaks depend on physical row heights and keep the final record beside its total. Do not change to Fit sheet on one page: that can shrink a long schedule and override manual pagination. Microsoft documents this interaction in [Scale a worksheet](https://support.microsoft.com/en-gb/excel/scale-a-worksheet?nochrome=true). Use Sarabun or check wrapping again with the recipient's installed Thai font.

Thumbnails are NTS. Parentheses denote the implemented free dimension; r is the inside radius. Manual cut values and pending checks are labeled. Unsupported outside details show a centerline/spatial reference and require the full coordinate/detail drawing. Images/dimensions remain from the exported snapshot; edit geometry in the application and export again. Formula-linked counts/totals update if their source cells are changed, but such edits do not update the images, regroup grades or approve the engineering data.

Large irregular rebar groups use small helper SUMs below the printable summary. Those helpers remain inspectable and are excluded from the print area. Empty schedules have typed zero totals. Very large finite quantities use scientific display without changing their underlying numbers.

QA imports and recalculates actual app XLSX files with the bundled renderer and inspects saved OpenXML print settings/anchors/breaks. Native Microsoft Excel printer pagination and actual owner review are still required. The renderer coerces numeric-string identifiers such as00; the disposable preview copy restores the verified display, while the original XLSX retains text00 and is unchanged. No approved fabrication or construction Issued status is implied.

Current checks: `test:excel-print`, `test:excel-print-ui`, the same UI suite against the pinned demo build, and unit tests. They refuse cloud writes. Historical callable tests are not part of this increment.
