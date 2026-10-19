# BS code 13 — supplied minimum policy v4

The source is the user's unchanged `Referrence/BS 8666.pdf`, BS 8666:2000 + Amendments1/2, SHA256 `9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43`. Table1 printedp.6 (PDFp.10), Note2 printedp.8 (PDFp.12), Table3 printedp.11 (PDFp.15) and clauses7/8 were inspected as both text and pixels. This implements the supplied historical baseline, not a claim of current-edition or full BS/ACI conformity.

## วิธีใช้งาน

1. โครงการใหม่เริ่มด้วยชุดกฎขั้นต่ำรุ่น4 โครงการเดิมเลือกและบันทึกรุ่น4 ใน General Spec อย่างชัดเจน งานเปลี่ยน Spec จะคืนสมาชิกเป็น Draft และล้างการยืนยันมิติ/ตำแหน่ง Revision ที่ตรึงไว้คงเดิม
2. เปิดชุดเหล็ก กำหนด nominal diameter, ขนาดผิวนอก/ซี่บั้งและ BS material type ที่ผู้รับผิดชอบตรวจเทียบแล้ว เลือกสร้างรูป13 และกรอก A/B/C ทีละ5mm
3. B เป็นมิติสูงผิวนอก จึงกำหนด R ศูนย์กลาง=(B−outside)/2 และ r ด้านใน=(B−2×outside)/2 ไม่ป้อนรัศมีอิสระที่ขัดกับครึ่งวงกลม
4. สร้างพิกัด ตรวจรูปสองเส้น มิติอิสระ(C) แปลน/รูปตัดและ3D ยืนยันมิติและตำแหน่งแยกกัน กดใช้ชุดเหล็ก แล้วบันทึกสมาชิก
5. ใช้แบบผิวเหล็ก A3/A1 ตารางA4 หรือ Excel จาก Working/Frozen ที่ต้องการ ไฟล์ทดสอบยังระบุ NOT FOR CONSTRUCTION

## Numerical and geometric contract

- Only four virtual vertices forming a planar U with parallel returning arms, two same-direction right-angle quarters and a middle virtual leg exactly2R qualify. The quarters share one centre and form ONE continuous180° curve; their intervening straight is zero. The generic two-bend4d requirement remains enforced for code21 and any unmatched13.
- A=first virtual leg+outside/2, B=middle virtual leg+outside, C=last virtual leg+outside/2. Free(C) is prescribed; user reference dimensions cannot replace geometry.
- Selected Table1 formula is `A + 0.57B + C − 1.57d`, using nominal d and the supplied coefficients. Separately displayed true centreline is `(A−B/2)+(C−B/2)+πR`. No silent substitution of π coefficients. Cut rounds UP to25mm increments before mass and occurrence multiplication.
- Golden synthetic case: A1005/B100/C225/d16/outside16 → R42, inner r34, formula1261.88, cut1275mm. Two bars per member × three occurrences =6 physical bars.
- Rounding boundary case: A1000/B285/C300/d8/outside8 → Table formula1449.89 →1450mm; exact centreline1450.1105825 →1475mm if separately rounded. Both values remain visible; this discrepancy must be assessed in independent engineering cases before production.
- A and C must satisfy both Table3 end dimension and B/2+5d. B must satisfy2(rminimum+d); actual inside radius independently satisfies Table3, including an outside diameter greater than nominal. Types/sizes outside supplied Table3 remain pending.
- Note2 describes fabrication limitations for large continuous curves. As a conservative APPLICATION guard, centreline R>200mm stays pending fabrication review; this is not asserted as the standard's precise nominal-radius definition or an automatic segmented-curve model. No unapproved chord fabrication is generated.
- Length method must be BS8666 and outside dimensions explicitly confirmed for minimum checks to pass. Manual cut overrides remain pending; constructing a template clears previous override and both confirmations.
- Numerical profile IDs v1/v2/v3 are retained. Geometry engine remains geometry2.0; new policy is `geometry-2.0+bs8666-2000-v4`. A v3 code13 remains fallback/pending and retains its old quantity. V4 preserves all previously implemented oblique Note1 branches.

## Views and outputs

The same existing rounded-path engine renders two tangent quarter arcs in2D/3D and calculates analytic length; it is not a chamfer or a sharp U. The two-line envelope uses actual rib width and square cut ends. A/B/(C), nominal/outside diameters, inside/centreline radius, prescribed formula, exact length, selected cut and quantity appear in genuine exports. The radius label is placed between the arms to avoid the freeC annotation.

Detailed coordinate views retain L01/L02/L03 and B01/B02 for the virtual representation. L02 straight=0 and B01/B02 are two90° portions of one180° semicircle, explained in the interface and fabrication PDF. They are not two separate bending operations. Table4 references are informational, with A/C marked as endpoints and B treated as a height.

Backup/Restore preserves the geometric inputs and policy. Restored Working members become Draft with confirmations cleared; archived revisions remain reference-only `importedHistory`, with copied snapshot bytes verified. Importing history does not create operative issued revisions or import project ACL.

## Acceptance limits

See `output/semicircle-verification/DEVELOPMENT_REPORT.html` for local software and actual download evidence. All fixtures are synthetic. Supplied shapes33/51/67/77, full ACI318 hook/lap/development rules, tolerance compensation, approved engineer cases, real GULF/owner acceptance and production commissioning remain open. Issued and production consumption remain closed. This increment does not edit Rules/Auth configuration/.env or deploy; the user manages/deploys Rules. A concurrent change to storage.rules was observed and preserved. Local emulator checks do not prove compatibility with the user's current or live Rules.
