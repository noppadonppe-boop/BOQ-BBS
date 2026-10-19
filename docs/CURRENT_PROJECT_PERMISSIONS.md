# การตรวจสิทธิ์หลายโครงการในระบบปัจจุบัน — v0.97

การบันทึกโปรไฟล์ตรวจชนิดข้อมูล Role/สถานะ/รายการโครงการ/เวอร์ชันก่อนเริ่มtransaction ข้อมูลผิดหรือRoleไม่รองรับ/ซ้ำถูกปฏิเสธโดยไม่เปลี่ยนโปรไฟล์และACL รหัสโครงการสงวนของFirestore เช่น__proto__ถูกปฏิเสธ ส่วนชื่อที่ใช้ได้อย่างconstructorถูกเก็บเป็นown data propertyและserializeครบ ไม่ใช้สิทธิ์รวมของบัญชีแทนViewerที่กำหนดเฉพาะโครงการ

นี่เป็นการตรวจ input ในเส้นทางบันทึกของแอป ไม่ใช่การเพิ่ม backendหรือการปรับ Rules สิทธิ์อ่าน/เขียนจริงยังบังคับโดยFirebase AuthและRulesที่ผู้ใช้จัดการ การแก้โปรไฟล์ตัวเองยังเก็บเฉพาะช่องชื่อ/ตำแหน่ง/แผนก/รูปและเวอร์ชัน ช่องสิทธิ์ที่ส่งมาในown-profileถูกละไว้เพื่อคงcompatibility ไม่ทำให้อนุมัติตนเอง

ทดสอบผ่านบัญชีQAแยกจริงในdemo-boq-v041:ผู้รออนุมัติอ่านโครงการ/สมาชิก/ไฟล์ไม่ได้;เจ้าของระบบอนุมัติQS+Checkerให้AและViewerให้B;ทั้งสองโครงการมีFoundationF-001แต่occurrence2กับ7ไม่ปะปน;QSแก้Aได้/อ่านBไม่ได้;Viewerอ่านBได้/แก้ไม่ได้ผ่านคำสั่งและrawbatchที่สอดคล้องversion การลดAเป็นViewerปรับprofile/ACLพร้อมกัน และการrejectบัญชีปิดการอ่านไฟล์ด้วยtokenเดิมจริง

ทดสอบconstructor project scopeผ่านAPIและrawbatchจริง:บัญชีมีglobalAdminแต่projectRolesเป็นViewerและยังแก้โครงการนั้นไม่ได้ การปฏิเสธ__proto__ในSDKเป็นข้อจำกัดชื่อของFirestore ไม่ใช่หลักฐานว่าโครงการชื่อนี้มีอยู่หรือเป็นช่องโหว่ที่ใช้โจมตีแล้ว

MasterAdminคนแรกถอนสถานะตนเองไม่ได้ กรณีQA Viewerที่อ่านโครงการ/ไฟล์ได้ถูกลบAuthและสร้างใหม่ด้วยอีเมลเดิม:UIDใหม่เข้าสืบทอดapproved profileไม่ได้ ทั้งFirestore/Storageปฏิเสธ โปรไฟล์เดิมคงเดิม บัญชีที่ลบเป็นfixtureท้องถิ่นที่สร้างเพื่อทดสอบเท่านั้น ไม่มีบัญชีProductionถูกลบ

รุ่นbuild0.97แสดงViewerเพียง1โครงการและปิดเพิ่ม/บันทึกทั้งจอใหญ่และมือถือ 1651unitcases/118files +TypeScript/buildผ่าน รวม28กรณีvalidation คำสั่งใหม่test:current-permissionsเรียกtests/direct-permissions-current.mjs โดยต้องมีชุดlocalQA5291/10121/8751/9531กับprivatebootstrapcontextที่ตั้งไว้ ไม่ใช้CloudFunctions ทดสอบliteral-scopeต้องเป็นfixtureใหม่และไม่แทนที่projectconstructorที่มีอยู่

รายงานมีเพียงชื่อกรณี/boolean/count ไม่มีtoken/password/UID ส่วนprivatecontextsอยู่tmp ข้อผิดพลาดsetupเรื่องnote/pageและการส่งcodeจากpage.evaluateถูกแก้ในharness;ไม่ผ่อนRulesเพื่อให้ผ่าน ไม่มีPDF/Excelใหม่หรือสูตร/enginepolicyเปลี่ยน

[รายงานหลักฐาน](../output/current-permissions-verification/DEVELOPMENT_REPORT.html) · [ข้อกำหนดเดิม12ข้อ](REQUIREMENTS_MATRIX.md)

ข้อมูลที่ยังต้องใช้สำหรับงานจริง:ปีฉบับACI318/ผู้รับผิดชอบวิศวกรรม/approvedclosingdetail33และ51 ชุดกรณีวัสดุ/geometry/Markจริงและowner/native-print/Issued/Consumed/Productionยังไม่ผ่านครบ การapproveบัญชีQAไม่ใช่engineeringapproval ผู้ใช้คงจัดการRules/deployเอง
