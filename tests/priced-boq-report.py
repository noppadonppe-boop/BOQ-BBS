from pathlib import Path
import json,html,hashlib
out=Path('output/priced-boq-verification')
read=lambda f:json.loads((out/f).read_text(encoding='utf-8'))
unit=read('unit-results.json');assert unit['success'] and unit['numPassedTests']==676 and not unit['numFailedTests']
sets=[('Firebase SDK','sdk-results.json'),('Restored Frozen file','restored-history-results.json'),('Dev UI','ui-results.json'),('Compiled UI','built-results.json'),('Account-bound dialogs','session-results.json'),('Compiled exports','export-results.json')]
count=0;rows=[]
for label,file in sets:
    data=read(file);assert all(r['status']=='PASS' for r in data['results']);assert not data.get('errors') and not data.get('cloud');count+=len(data['results'])
    rows.extend(f'<tr><td>{html.escape(label)}</td><td>{html.escape(r["name"])}</td><td>PASS</td></tr>' for r in data['results'])
assert count==30
protected=read('protected-config.json');assert len(protected)==6 and all(p['unchanged'] for p in protected)
for p in protected:assert hashlib.sha256(Path(p['file']).read_bytes()).hexdigest()==p['sha256']
rule_copies=[]
for name in ['firestore.rules','storage.rules']:
    original=Path(name).read_bytes();copy=Path('tmp/composer-backend')/name;assert copy.read_bytes()==original
    rule_copies.append({'file':name,'sha256':hashlib.sha256(original).hexdigest(),'identicalTestCopy':True})
(out/'rule-copy-checks.json').write_text(json.dumps(rule_copies,indent=2),encoding='utf-8')
pdf=read('pdf-results.json');excel=read('excel-results.json');assert pdf['pages']==8 and len(excel['views'])==6
art=read('export-results.json')['artifacts'];assert len(art)==4
for a in art:assert hashlib.sha256((out/a['file']).read_bytes()).hexdigest()==a['sha256']
images=['built-price-dialog.png','built-price-mobile.png','built-price-stale.png','built-price-scoped.png','built-price-viewer.png','session-price-before.png','session-price-cleared.png','session-copy-cleared.png','frozen-priced-BOQ-contact.png','working-priced-BOQ-contact.png']+[v['local'] for v in excel['views']]
for f in images:assert (out/f).exists()
e=html.escape
links=''.join(f'<li><a href="{e(a["file"])}">{e(a["file"])}</a> · {a["bytes"]:,} bytes · {e(a["status"])} · <code>{a["sha256"]}</code></li>' for a in art)
gallery=''.join(f'<figure><a href="{e(f)}"><img loading="lazy" src="{e(f)}" alt="{e(f)}"></a><figcaption>{e(f)}</figcaption></figure>' for f in images)
status=Path('docs/CURRENT_REQUIREMENTS_STATUS.md').read_text(encoding='utf-8')
requirements=[]
for line in status.splitlines():
    if line.startswith('| ') and len(line)>2 and line[2].isdigit():
        cells=[c.strip() for c in line.strip('|').split('|')];requirements.append('<tr>'+''.join('<td>'+e(c)+'</td>' for c in cells)+'</tr>')
assert len(requirements)==12
doc=f'''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BOQ/BBS v0.43 — scoped development verification</title>
<style>body{{margin:0;background:#f1f5f3;color:#203940;font:16px/1.7 system-ui,sans-serif}}main{{max-width:1180px;margin:auto;padding:32px}}h1{{font-size:30px}}h2{{margin-top:34px}}.notice{{padding:20px;background:#fff2d9;border-left:5px solid #bd842e}}.ok{{background:#deeee5;padding:16px}}table{{border-collapse:collapse;background:white;width:100%;font-size:14px}}th,td{{padding:12px;border:1px solid #dce5e1;text-align:left;vertical-align:top}}th{{background:#203940;color:white}}.scroll{{overflow:auto}}code{{overflow-wrap:anywhere;font-size:12px}}a{{color:#126a58}}figure{{background:white;padding:14px;margin:18px 0}}img{{max-width:100%;height:auto}}figcaption{{overflow-wrap:anywhere}}li{{margin:8px 0}}@media(max-width:500px){{main{{padding:16px}}table{{min-width:780px}}}}</style>
<main><p>BOQ &amp; BBS / 2026-10-13 / v0.43</p><h1>เพิ่มประมาณราคา BOQ — ผ่านเฉพาะขอบเขตที่ตรวจ</h1>
<p class="notice"><strong>ยังไม่ผ่านตรวจรับระบบเต็ม และยังไม่พร้อมออก BBS ใช้ก่อสร้าง</strong><br>รอบนี้เพิ่มราคาต่อหน่วยที่ผู้ใช้กรอก พร้อมที่มา เงื่อนไข ทศนิยม สกุลเงิน และการเก็บราคาใน Revision ไม่ได้รับรองราคา ปริมาณจากโครงการจริง BS/ACI แบบส่งเจ้าของงาน หรือ Production</p>
<p class="ok">676 unit tests /36 pricing tests · 30 เส้นทางจริงในระบบจำลอง · Build/TypeScript ผ่าน · 2 XLSX +2 BOQ PDFs จากแอปจริง · ตรวจ PDF ครบ8หน้า A3 และ6ภาพแท็บราคา Excel</p>
<h2>ผลที่ผู้ใช้ตรวจได้</h2><p>กด “กรอกราคา BOQ” ในสมาชิกที่บันทึกแล้ว หรือ BOQ Summary → “ประมาณราคา BOQ” ราคาจะแยกเหล็กตามขนาดและเกรดจาก BBS ช่องว่างคือรอราคา ส่วน0ที่กรอกพร้อมที่มาคือราคา0จริง เก็บหมายเหตุที่ยังรอใบเสนอราคาได้</p>
<p>ปัดปริมาณต่อรายการ × ตำแหน่งตามค่าที่ระบุ แล้วคูณราคาและปัดเงินก่อนรวม ใช้เลขทศนิยมแบบจำนวนเต็มในการคิดเงิน การดู Member/Category/Zone/Floor/Summary ไม่เปลี่ยนยอด ปริมาณวิศวกรรมเดิมไม่เปลี่ยน หากไม่มีฐานราคา ช่องปริมาณคิดราคาจะเป็นรอฐาน/ว่าง แสดงยอดเฉพาะที่มีราคาแยกจากยอดรวมที่ยังไม่ครบ และไม่รวมคนละสกุลเงิน</p>
<p>ตัวอย่างสังเคราะห์ Frozen มีคอนกรีต100.005ต่อหน่วย ได้ยอด813.73; ราคาทำงาน321.005 ได้ยอดเฉพาะที่กรอก1918.73 เมื่อมีสมาชิกสำเนายังไม่กรอกราคา ยอดรวมทั้งขอบเขตยังรอราคา ตัวเลขเหล่านี้ใช้ทดสอบซอฟต์แวร์เท่านั้น</p><p>แก้การค้างหน้าต่างราคาส่วนตัวหลังเปลี่ยนบัญชี: หน้าต่างราคา/ทำสำเนาผูกกับUIDที่เปิดไว้และล้างเมื่อUIDเปลี่ยน Devทดสอบผ่านการเปลี่ยนบัญชีอีกแท็บ ส่วนรุ่นbuildตรวจด้วยFirebase Auth signoutจริงและเข้าสู่ระบบด้วยUIเป็นบัญชีใหม่ แยกcontextแต่ละหน้าต่าง การรอeventข้ามแท็บของรุ่นbuildเคยtimeoutก่อนUIDหลักเปลี่ยน จึงยังไม่ได้ตรวจรับbroadcastข้ามแท็บ/การเข้าสู่ระบบซ้ำทั่วไป ภาพsession-price-beforeเป็นอาการก่อนแก้ ส่วนภาพclearedแสดงหลังแก้</p>
<p>แก้ราคาทำให้สมาชิกกลับ Draft และเพิ่มรุ่น โดยเก็บมิติ/เหล็ก/การยืนยันทางเทคนิคเดิม ฉบับ Frozen คงราคาเดิม การทำสำเนาไม่ย้ายราคา Backup/Restore เก็บข้อมูล ณ เวลาสำรอง และตรวจอ่านไฟล์ Frozen ที่คืนมาใน Storage ของโครงการปลายทางจริงแล้ว</p>
<h2>ไฟล์จริงและขอบเขตส่งออก</h2><ul>{links}</ul><p>ทุกไฟล์ตรง SHA256/ขนาดกับ Export Job ที่ Complete และ bytesที่อ่านจาก Storage จริง Excelเพิ่ม BOQ Prices / Price Summary / Price Basis เป็นค่าที่ตรึงไว้ ปริมาณและราคาเป็นข้อความทศนิยมตรงตามฐาน เงินเป็นผลตัวเลขที่บันทึกไว้ ไม่ใช่สูตรราคาที่แก้ใน Excelแล้วคำนวณใหม่ สูตรปริมาณ BOQ/BBS เดิมคงอยู่ BOQ PDFรอบนี้เป็น A3; แบบBBS A1ไม่ได้เปลี่ยนและไม่ได้ทดสอบใหม่ในรอบนี้</p>
<p>Excel QAเป็นการนำเข้า/คำนวณซ้ำ/Renderแบบอ่านอย่างเดียวผ่าน ArtifactTool ไม่ใช่การพิมพ์ใน Microsoft Excel ช่องข้อความว่างที่ตรวจ XMLแล้วปรับเฉพาะในหน่วยความจำของตัว Render; ไฟล์ต้นฉบับไม่เปลี่ยน ตัวRenderอาจตัด0ท้ายข้อความทศนิยม เช่น2.000แสดงเป็น2 แต่XMLต้นฉบับคงข้อความทศนิยมไว้ หัวตารางใช้ความกว้างช่องที่รวมเพื่อไม่กินความสูงเกินไป ยังไม่มีคอลัมน์วัสดุ/แรงงานแยก หรือ VAT/OH/กำไรและอัตราแลกเปลี่ยนอัตโนมัติ จำกัด100,000รายการราคา/15หลักของหน่วยเงินย่อย/PDF500หน้า ต้องแบ่งขอบเขตเมื่อเกิน และไม่ได้อ้างว่าทดสอบโหลดเต็มทุกขนาด</p>
<h2>Rules และ Production</h2><p><strong>คง firestore.rules, storage.rules, firebase.json, .env และไฟล์ Authentication ทั้ง2ไว้ตามเดิม ไม่ deploy Rules/Hosting และไม่ใช้ Cloud Functions</strong> ผู้ใช้จัดการ Rules/deployเองตามคำสั่งล่าสุด ทดสอบกับ backend demo-boq-v041ในเครื่อง โดย Rulesสำเนาตรงทุกbyteกับไฟล์เดิม และใช้ตัวแก้การรับข้อความ stdoutของ Storage runtimeเฉพาะชุดทดสอบที่บันทึกไว้ก่อนหน้า บริการเดิมไม่เปลี่ยนหรือหยุด</p>
<p>การตรวจเลขทศนิยม/เงื่อนไขราคาอยู่ในแอป การทดสอบสิทธิ์จริงยืนยัน Viewerอ่านได้แต่เขียนไม่ได้ และ QSที่ได้รับสิทธิ์โครงการเขียนได้ ยังไม่ได้ยืนยัน Rulesที่คุณจะใช้จริงว่าสอดคล้องกับ schemaนี้หรือไม่ รายการคืนประวัติ/ไฟล์จากBackupทดสอบเฉพาะชุดสังเคราะห์นี้</p>
<h2>หลักฐานการทดสอบ30เส้นทาง</h2><div class="scroll"><table><thead><tr><th>ชุด</th><th>กรณี</th><th>ผล</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>
<p><a href="unit-results.json">Unit results</a> · <a href="protected-config.json">6ไฟล์คงเดิม</a> · <a href="rule-copy-checks.json">Rulesสำเนาตรงเดิม</a> · <a href="export-results.json">Job/Storage/artifact results</a> · <a href="restored-history-results.json">Restored Frozen file</a> · <a href="pdf-results.json">PDF QA</a> · <a href="excel-results.json">Excel QA</a> · <a href="build.log">Build</a> · <a href="priced-backup.zip">Backupสังเคราะห์ก่อนแก้ราคาทางUI</a></p>
<h2>ข้อกำหนดเดิม12ข้อยังต้องตรวจรับ</h2><div class="scroll"><table><thead><tr><th>#</th><th>ความต้องการ</th><th>ซอฟต์แวร์ที่มี</th><th>ยังรอตรวจรับ</th></tr></thead><tbody>{''.join(requirements)}</tbody></table></div>
<p>ยังรอผู้รับผิดชอบ/กรณีวิศวกรรมที่ตรวจรับจริง ปีฉบับACIและกฎที่อนุมัติ การสร้างรูปเหล็ก/ตำแหน่งจากแบบGULFจริง code33และการปิดปลายcode51 การตรวจเจ้าของงาน Issued สต็อกจริง/rollback Native Excel print และProduction ไม่ถือการทดสอบซอฟต์แวร์หรือ checksumเป็นการอนุมัติก่อสร้าง</p>
<h2>ภาพตรวจหน้าจอและไฟล์จริง</h2>{gallery}<p><a href="../../docs/BOQ_PRICING.md">คู่มือราคา</a> · <a href="../../docs/CURRENT_REQUIREMENTS_STATUS.md">สถานะข้อกำหนดเดิม</a></p></main></html>'''
(out/'DEVELOPMENT_REPORT.html').write_text(doc,encoding='utf-8')
print('PASS report:676 unit tests,30 actual paths,4 matched files,8 PDF pages,6 Excel views; full acceptance incomplete')
