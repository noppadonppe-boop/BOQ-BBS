# Code99 drawings in Excel

Export **Excel · BOQ และ BBS** from the drawing export dialog. Choose a Frozen revision and the required member/category/zone/floor scope. Two new sheets appear when the selected scope contains Code99 bars:

- **Code99 Details** contains both steel surfaces, centreline, numbered vertices, free dimension in parentheses, inside radius and construction lines. Each drawing part contains at most six dimensions. The table stores numeric outside dimensions, straight lengths and bend angles; absent bend data stays blank.
- **Code99 Coordinates** contains every virtual centreline intersection of the first physical bar in the member datum. These are not curve tangent points. Captured cut/count/weight cells link to the master BBS rows.

Regular planar Code99, legacy single-acute A/B/C and the explicit chained support basis use the same geometry adapters as the corresponding app/PDF details. The chained support figure follows its entered plane before physical template/pose rotations. Each part draws the supporting tangents adjoining its selected legs. All vertices remain in the physical coordinate appendix. A geometry that cannot provide an outside detail prints **OUTSIDE PENDING**, its reason and the available coordinates; it never invents outside dimensions or substitutes zero.

The compact BBS Print image now uses the available two-line Code99 drawing. Its dimensions and continuation reference point to the detailed sheets. The image cache includes the free dimension and authoring basis so figures with different free legs are not silently reused.

Details continue on another sheet after200 drawing parts; coordinates continue after8000 vertex rows. Row heights accommodate member identifiers and references. Long labels may cause a table to continue on another printed page. Printing uses true A3 landscape at100%. Dimension/vertex rows repeat the same bar's cut/count/weight for identification: **do not sum these repeated values**. BOQ/BBS remain the authoritative quantity tables. Edit the geometry in the app and export again.

The actual C1 review example retains its provisional111/600/111 support-basis/r24 interpretation, one entered position and800mm cut. It is not the source148-bar arrangement, and it does not resolve the source790mm cut or SD40 mapping. The other four cases in the combined workbook are explicitly synthetic printing tests.

Version0.70 adds an opt-in [Code99 user review workflow](CODE99_REVIEW.md). A qualified current review can clear the specific clause8.5 hold while other minimum checks remain. Historical records appear in Code99 Review; external full-detail mode points to its captured evidence/dimensions without inventing generated outside geometry. This is not automatic engineering certification. The original C1 review example remains unresolved. GULF geometry/closure, project BS/ACI/material evidence, owner/Issued, stock/server enforcement and production acceptance remain open. Rules/deployment are controlled by the user. Numerical geometry/cut/mass policies and previous Frozen inputs stay unchanged.
