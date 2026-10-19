# ตรวจจำนวนก่อนส่ง BBS/ตารางตัด — v0.94

เปิดแบบส่งงาน → สร้างไฟล์ส่งออก เลือกข้อมูลทำงานหรือFrozen ขอบเขตMember/Category/Zone/Floor และชนิดไฟล์ หน้าตัวอย่างแจ้งเมื่อมีมิติ/จำนวนที่ยังProvisional ตรวจที่มาปริมาณและยืนยันinputปัจจุบันก่อนใช้ยอดจริง การยืนยันinputไม่ใช่การตรวจรับมาตรฐาน/รูปดัด/ตำแหน่ง/วิศวกรรม

หากยังต้องส่งDraftเพื่อตรวจ PDFแบบBBSและตารางตัดที่สร้างผ่านขั้นตอนหลักจะมีหน้าตรวจปริมาณ ระบุสมาชิก สถานะ จำนวนraw และที่มา มีข้อความPACKAGE HAS PROVISIONAL INPUTSและRAW QUANTITY PREVIEW / NOT FOR FABRICATIONทุกหน้า กรอบชื่อแบบของสมาชิกชั่วคราวแสดงMemberqtyPENDING/preview ตารางA4มีคำเตือนเพิ่มในหน้าเดิม ตัวเลขnativeยังเป็นrawจากinputที่เลือก ไม่ใช้ตัด/ดัดผลิต

ExcelคงBBSraw/formulasเพื่อเทียบแบบ พร้อมหัวบอกสถานะและชีตBBS Quantity Review ช่องจำนวน/น้ำหนักตามinputที่ตรวจยังว่างสำหรับสมาชิกชั่วคราว และคงตัวเลขของสมาชิกEntered/Legacy การกรองเฉพาะสมาชิกที่ไม่มีinputชั่วคราวไม่เพิ่มcover/markนี้ แต่ยังต้องตรวจengineering release/statusเดิม การไม่มีprovisionalwarningไม่ใช่ใบรับรองผลิต

ใช้policyfabrication-input-review-1.0สำหรับไฟล์ที่ลงทะเบียนผ่านgenerateJob ไม่เปลี่ยนสูตร/ค่าengine/BBS/BOQ/stock ไม่เพิ่มหรือลบเหล็ก และไม่แก้bytesของFrozenหรือไฟล์ประวัติเดิม Helperrenderersที่ใช้ดูแยกโดยไม่ผ่านขั้นตอนหลักไม่มีpackagecoverนี้ ดาวน์โหลดไฟล์เก่ารักษาbytesเดิม ควรสร้างไฟล์ใหม่ด้วยรุ่นปัจจุบันหลังตรวจinput

หากข้อมูลIssued/Supersededมีinputชั่วคราวขัดกับสถานะ ระบบปฏิเสธสร้างไฟล์ผลิตใหม่และให้ตรวจประวัติ ไม่ลดสถานะหรือแก้ข้อมูลให้เอง ยังไม่ได้พิสูจน์positiveIssued/Consumedหรือการบังคับผ่านownerAPI/RulesในProduction ผู้ใช้ยังจัดการRules/deployเอง

ชุดทดสอบเป็นFoundation2องค์ประกอบชั่วคราวและBeam3องค์ประกอบEntered ทั้งคู่เป็นข้อมูลซอฟต์แวร์/B500Bที่ป้อนเอง ไม่มีการเทียบGULF SD40หรือรับรองเรขาคณิตจริง ค่าinputReviewedในตัวอย่างยังไม่ใช่engineeringapproved มาตรฐานBS8666/ACI318 วัสดุ รูปดัด/ปิดปลาย/ฝังทาบ ตำแหน่ง/Markและการพิมพ์จริงต้องตรวจรับก่อนใช้ก่อสร้าง

[รายงานและไฟล์จริง](../output/fabrication-input-review-verification/DEVELOPMENT_REPORT.html) · [ข้อกำหนดเดิม12ข้อ](REQUIREMENTS_MATRIX.md)
