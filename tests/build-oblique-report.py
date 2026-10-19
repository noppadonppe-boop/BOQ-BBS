from pathlib import Path
import json, html, hashlib

root = Path(__file__).resolve().parents[1]
out = root / 'output/oblique-shape-verification'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
esc = lambda s: html.escape(str(s))
unit = read(out / 'unit-results.json')
assert unit['numPassedTests'] == unit['numTotalTests'] == 275
assert unit['numFailedTests'] == 0
groups = [(label, read(out / name)) for label, name in [
    ('API / สูตรและ revision', 'api-results.json'), ('API / สิทธิ์และการสร้างโครงการ', 'guard-results.json'),
    ('หน้าจอและ Restore', 'ui-results.json'), ('แอปที่ build แล้ว', 'final-results.json')]]
assert [len(d['results']) for _, d in groups] == [11, 3, 12, 4]
assert all(r['status'] == 'PASS' for _, d in groups for r in d['results'])
assert all(not d.get('errors') for _, d in groups)
visual = read(out / 'visual-verification.json')
assert visual['allFinalPagesVisuallyInspected'] == 22
checkpoint = read(out / 'checkpoint-verification.json')
copy = read(out / 'default-copy-verification.json')
reimport = read(out / 'final-reimport-results.json')
previous = read(out / 'previous-regression-results.json')
assert len(reimport['results']) == 5 and len(previous['results']) == 7
assert all(r['status'] == 'PASS' for d in [reimport, previous] for r in d['results'])
assert checkpoint['status'] == copy['status'] == 'PASS'
log = (root / 'tmp/multiproject-firestore-restore.log').read_text(encoding='utf-8-sig')
assert 'Deploy complete' in log and "'my-boq-app'" in log
cloud = {'status': 'PASS', 'firebaseProject': 'my-boq-app', 'scope': 'firestore:rules only',
         'explicitUserAuthorization': 'อนุญาตให้คืนกฎแยกโครงการบน my-boq-app',
         'localRuleSha256': hashlib.sha256((root / 'firestore.rules').read_bytes()).hexdigest(),
         'deploymentLog': 'tmp/multiproject-firestore-restore.log',
         'limitations': 'No cloud data migration/deletion. Functions, Storage, Hosting and new formulas were not deployed in this increment. No full cloud acceptance.'}
(out / 'cloud-firestore-restoration.json').write_text(json.dumps(cloud, indent=2, ensure_ascii=False), encoding='utf-8')
rows = read(out / 'api-results.json')['rows']
row_html = ''.join(f"<tr><td>{esc(r['mark'])}</td><td>{esc(r['code'])}</td><td>{esc(' / '.join(f'{a:.3f}' for a in r['angles']))}</td><td>{r['approx']:,.3f}</td><td>{r['exact']:,.3f}</td><td>{'แนวแกนจริง' if r['exactSelected'] else 'ค่าตามตาราง'}</td><td>{r['cut']:,}</td></tr>" for r in rows)
pdf_html = ''.join(f"<li><a href='../pdf/{Path(r['delivered']).name}'>{r['size']} · {r['pages']} หน้า · Draft</a><small>SHA256 {r['sha256']}</small></li>" for r in visual['results'])
test_html = ''.join(f"<details><summary>{esc(label)} · {len(d['results'])} ผ่าน</summary><ul>"+''.join(f"<li>{esc(r['name'])}</li>" for r in d['results'])+'</ul></details>' for label, d in groups)
checkpoint_counts = ' / '.join(f'{k} {v:,}' for k, v in checkpoint['fileCounts'].items())
text = f'''<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>FORM v0.24 · หลายโครงการและรูปเหล็กเอียง BS8666</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;color:#203740;background:#edf2f4;font:16px/1.7 "Sarabun","Segoe UI",sans-serif}}
main{{max-width:1200px;margin:auto;padding:32px 20px 64px}}header,section{{background:white;border:1px solid #d8e2e6;border-radius:16px;padding:26px;margin-bottom:22px}}
header{{border-top:7px solid #178173}}h1{{font-size:32px;line-height:1.3;margin:10px 0}}h2{{font-size:23px;margin:0 0 12px}}h3{{font-size:18px}}p{{margin:12px 0}}a{{color:#126b88;text-underline-offset:3px}}
.eyebrow{{letter-spacing:2px;color:#387267;font-size:13px}}.notice{{background:#fff3d7;border-left:4px solid #c68624;padding:14px 18px;border-radius:4px}}
.cards{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}}.card{{padding:18px;background:#f3f7f8;border-radius:12px}}.card b{{font-size:30px;display:block;color:#116f63}}
.twocol{{display:grid;grid-template-columns:1fr 1fr;gap:22px}}small{{display:block;color:#60747b;font-size:12px;overflow-wrap:anywhere}}li{{margin:8px 0}}.table-wrap{{overflow:auto;border:1px solid #d8e2e6;border-radius:8px}}
table{{border-collapse:collapse;width:100%;min-width:720px;font-size:14px}}th,td{{padding:11px;border-bottom:1px solid #e2e9ec;text-align:left;white-space:nowrap}}th{{background:#e8f1ef}}img{{width:100%;height:auto;border:1px solid #d8e2e6;border-radius:8px}}figure{{margin:20px 0}}figcaption{{font-size:14px;color:#60747b}}
details{{border-top:1px solid #d8e2e6;padding:12px 0}}summary{{cursor:pointer;font-weight:600}}code{{overflow-wrap:anywhere;background:#f0f4f5;padding:2px 5px}}footer{{color:#60747b;font-size:14px}}
@media(max-width:700px){{main{{padding:16px 12px}}header,section{{padding:18px}}h1{{font-size:26px}}.cards{{grid-template-columns:repeat(2,minmax(0,1fr))}}.twocol{{grid-template-columns:1fr}}}}
</style></head><body><main>
<header><div class="eyebrow">FORM · BOQ &amp; BBS / v0.24 / 12 ต.ค. 2026</div>
<h1>คงหลายโครงการ<br>เพิ่มรูปเหล็กเอียงตาม BS ที่แนบมา</h1>
<p>แยกข้อมูล ไฟล์ มาตรฐาน และสิทธิ์ผู้ใช้ตามโครงการ คืนกฎ Firestore บน <b>my-boq-app</b> สำเร็จตามการอนุมัติของผู้ใช้ และเพิ่ม Shape15/25/26/46 พร้อมเปรียบเทียบความยาวและไฟล์ส่งออกที่ตรวจจริง</p>
<p class="notice"><b>ผ่านการทดสอบส่วนที่ระบุสำหรับงาน Draft ในเครื่อง</b> ยังไม่ใช่การตรวจรับระบบเต็มหรือ BBS ที่อนุมัติใช้ก่อสร้าง ผลทดสอบเป็นข้อมูลจำลอง ยังต้องตรวจกรณีวิศวกรรมจริง มาตรฐานเต็ม และรูปแบบส่งเจ้าของงาน</p></header>
<section><div class="cards"><div class="card"><b>305</b>กรณีซอฟต์แวร์ผ่าน</div><div class="card"><b>4</b>รูปเหล็กเพิ่ม</div><div class="card"><b>22</b>หน้า PDF ตรวจครบ</div><div class="card"><b>12</b>กรณีตัวแทนเปิดระบบใหม่</div></div>
<p>305 = 275 unit + 14 API + 16 browser รวมหน้าจอแอปที่ build แล้ว 4 กรณี ส่วน 5 กรณีตัวแทนของ v0.24 และ 7 กรณีตัวแทนข้อมูลเดิมหลังเปิดระบบใหม่แยกนับ ไม่ใช่การทดสอบทุกข้อมูลหรือการรับรองกู้คืนระบบจริง</p></section>
<section><h2>หลายโครงการและสิทธิ์แยกผู้ใช้</h2><ul>
<li>เข้าสู่ระบบด้วยอีเมล เลือกเฉพาะโครงการที่ได้รับสิทธิ์ Admin / QS / Checker / Approver / Viewer ข้อมูลของแต่ละโครงการอยู่ในพื้นที่ของตนเอง</li>
<li>ยกเลิกการเข้าอัตโนมัติแบบ anonymous และพื้นที่กลางที่ทุกคนเป็น admin ทดสอบการปฏิเสธการอ่าน/เขียนข้ามโครงการและไฟล์แล้ว</li>
<li>กดสร้างโครงการซ้ำด้วยคำขอเดิมได้โครงการเดียว คำขอที่เปลี่ยนข้อมูลหรือผู้สร้างถูกปฏิเสธ</li>
<li>อัปโหลดเฉพาะ <b>firestore.rules</b> ไป my-boq-app ตามคำอนุมัติ “อนุญาตให้คืนกฎแยกโครงการบน my-boq-app” ผล deploy สำเร็จ ไม่มีการย้ายหรือลบข้อมูล</li></ul>
<p class="notice">ระบบคลาวด์เต็มยังไม่พร้อม: Functions ยังไม่ได้ deploy เพราะต้องใช้ Blaze และ Storage ยังไม่เปิดใช้งาน รอบนี้ไม่ได้ deploy สูตรใหม่ Functions Storage หรือ Hosting ข้อมูลเชื่อมต่อและการตั้งค่า Git/Hosting จากอีกแชตเก็บไว้ ไม่มี commit/push ในรอบนี้</p>
<p><a href="cloud-firestore-restoration.json">หลักฐานคืนกฎ Firestore</a> · <a href="../../tmp/multiproject-firestore-restore.log">ผล deploy</a> · <a href="guard-results.json">หลักฐานสิทธิ์ในเครื่อง</a></p></section>
<section><h2>สูตรจาก BS ที่ผู้ใช้ให้เป็นมาตรฐานเริ่มต้น</h2>
<p>ใช้ไฟล์เดิม <b>BS8666:2000 รวม Amendments1/2</b> ไม่เปลี่ยนฉบับโดยอัตโนมัติ โครงการใหม่เริ่ม V3 มีสูตรที่รองรับ11รูป โครงการเดิมและ Frozen V1/V2 คงรุ่นเดิม การเลือกชุดใหม่ใน General Spec ต้องบันทึกผ่านประวัติการเปลี่ยนมาตรฐานและตรวจยืนยันใหม่</p>
<p>เพิ่ม15: A+(C),25: A+B+(E),26: A+B+(C),46: A+2B+C+(E) ตรวจรูปร่างจริงและใช้มิติผิวนอก การพิมพ์ Shape code อย่างเดียวไม่ทำให้สูตรผ่าน เมื่อมีมุมดัดเกิน45° จะเลือกผลรวมเส้นตรงสัมผัสและส่วนโค้งตามแนวแกนจริงตาม Table1 Note1 พร้อมแสดงค่าตามตารางให้เปรียบเทียบ</p>
<div class="table-wrap"><table><thead><tr><th>Mark</th><th>Code</th><th>มุม °</th><th>ตาราง mm</th><th>แนวแกน mm</th><th>ฐานที่เลือก</th><th>Cut mm</th></tr></thead><tbody>{row_html}</tbody></table></div>
<p>ทุก Mark จำนวน2เส้นต่อชิ้น × Frozen3ชิ้น =6เส้น โดยคูณจำนวนครั้งเดียว Working เปลี่ยนเป็น5ชิ้น/Revision B ในภายหลัง แต่ Frozen V2/V3 ยังเก็บจำนวน3และค่าคำนวณเดิม Code46 แสดงมิติ B ของขาเอียงทั้งสองด้าน</p>
<p>เครื่องมือสร้างพิกัดจาก A–E/รัศมีตรวจข้อมูลก่อนเปลี่ยนเหล็ก หากมิติใกล้ตั้งฉากมีคำตอบกำกวมจะปฏิเสธ การสร้างพิกัดไม่ยืนยันตำแหน่งหรือมิติแทนผู้ใช้ โครงการใหม่ยังไม่กำหนด ACI/ผู้อนุมัติวิศวกรรม และสถานะ Issued ยังปิด</p>
<small>ต้นฉบับ24หน้า/280,175bytes SHA256 9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43 — ตรวจจากภาพหน้า Table1 ของไฟล์จริง สูตรเหล่านี้เป็นเพียงส่วนที่ทำแล้ว ไม่ใช่ BS/ACI เต็มหรือฉบับล่าสุด</small></section>
<section><h2>ไฟล์ที่แอปส่งออกจริง</h2><div class="twocol"><div><ul>{pdf_html}
<li><a href="downloads/oblique-final.xlsx">Excel Frozen · เพิ่มทะเบียน BS Note1 จำนวน6แถว</a><small>คอลัมน์ BBS เดิมคงตำแหน่ง V2 ไม่มีทะเบียน V3 แทรก</small></li></ul></div><div>
<p>PDF จากงานส่งออกที่สถานะ Complete ของ Frozen R002 เดียวกัน Render และตรวจภาพครบ22หน้า ตรวจขนาดกระดาษ ตาราง มิติ Mark ผิวเหล็ก Note1 แหล่งอ้างอิง และข้อความ Draft ไม่มีการตัดข้อความที่ขอบหน้า</p>
<p>แก้เส้นชี้รัศมีที่ยาวเกินไปและเส้นผ่านตัวอักษรของCode26 ก่อนสร้างไฟล์สุดท้าย การสำรองก่อนแก้รูปแบบยังเก็บ PDF เดิมตาม byte เดิม ไม่เขียนทับประวัติ</p>
<p><a href="pdf-verification.json">ผลตรวจไฟล์</a> · <a href="visual-verification.json">ทะเบียนตรวจภาพทุกหน้า</a> · <a href="final-results.json">ผลจากแอป build</a></p></div></div>
<figure><img src="pdf-render/final-A3-7.png" alt="แบบ Draft Mark E15 พร้อมมิติผิวนอกและความยาวตาม Note1"><figcaption>ตัวอย่างหน้าแบบจริงจาก A3 — ใช้ค่าตามแนวแกนเพราะมุมเกิน45° รูปนี้เป็นข้อมูลจำลองสำหรับตรวจซอฟต์แวร์</figcaption></figure></section>
<section><h2>ใช้งานและตรวจข้อมูลต่อเนื่อง</h2><div class="twocol"><figure><img src="builder-46.png" alt="หน้าจอสร้างรูปเหล็ก46"><figcaption>สร้างพิกัดจากมิติผิวนอก ตรวจเทียบแบบก่อนยืนยัน</figcaption></figure><figure><img src="built-final-mobile-checker.png" alt="หน้าจอสิทธิ์Checkerบนมือถือ"><figcaption>Checker อ่านข้อมูลได้ตามสิทธิ์ หน้าจอ390pxไม่ล้นขอบ</figcaption></figure></div>
<p>ทดสอบการบันทึก/เปิดใหม่/3D ตรวจมุมจริง ส่งออกตามFrozen และ Backup ZIP/Restore จริง ข้อมูลหลังRestoreกลับเป็นDraft ยกเลิกการยืนยันตำแหน่ง/มิติ แต่เก็บพิกัด รูปเหล็ก รุ่นมาตรฐาน และไฟล์ประวัติเดิม</p>
<p>JavaScriptเริ่มต้นของแอป build ทดสอบ {groups[-1][1]['initialJavaScriptBytes']:,}bytes ชุดPDF/Excel/3Dโหลดเมื่อใช้ Full build ผ่านหลังแก้ภาพสุดท้าย ไม่มีข้อผิดพลาดหน้าเว็บในชุดที่ตรวจ ทั้งหมดใช้ demo-boq-bbs ในเครื่อง ส่วนค่าตั้งต้น .env เป็น Firebaseจริง ต้องตั้ง demo environment ชัดเจนสำหรับทดสอบ</p>
<p><a href="http://127.0.0.1:5175">แอปทดสอบในเครื่อง</a> · <a href="http://127.0.0.1:5176">แอป build ทดสอบในเครื่อง</a> · <a href="../legacy-source-verification/DEVELOPMENT_REPORT.html">รายงานรุ่นก่อน v0.23</a></p></section>
<section><h2>หลักฐานทดสอบและสำรอง</h2>{test_html}
<details><summary>เปิดระบบใหม่และไฟล์สำรอง</summary><p>Checkpoint v0.24-verified-20261012: {checkpoint_counts} ตรวจ Storage {checkpoint['verifiedStorageBlobs']:,}blobs ขนาดและMD5ตรงทั้งหมด และ3412objectsเดิมจากV0.23มีbytesเดิมทุกไฟล์ สำเนา default ตรง SHA256 {copy['filesCompared']:,}ไฟล์ ก่อนเปิดระบบด้วย default import</p>
<p>เก็บdefaultก่อนหน้าไว้ที่ pre-v24-default-data-20261012 เปิดเฉพาะemulatorทดสอบใหม่ ไม่หยุดบริการเว็บ/คลาวด์ของอีกแชต 5กรณีใหม่และ7กรณีข้อมูลเก่าผ่านหลังเปิดระบบ ไม่ใช่การรับรองทุกFirestore/Authrecordหรือแผนกู้คืนproduction</p>
<p><a href="checkpoint-verification.json">ตรวจcheckpoint</a> · <a href="default-copy-verification.json">ตรวจสำเนา</a> · <a href="final-reimport-results.json">5กรณีV0.24</a> · <a href="previous-regression-results.json">7กรณีข้อมูลเดิม</a> · <a href="unit-results.json">275unit</a></p></details></section>
<section><h2>งานที่เหลือก่อนใช้ส่งเจ้าของงานหรือก่อสร้าง</h2><ul>
<li>สูตรและรายละเอียดBSที่เหลือ13/33/51/67/77/99 รวม tolerance/free dimension/ปลายเหล็กและข้อกำหนดโรงงาน ACIฉบับโครงการ hook/lap/anchorage/cover พร้อมกรณีคำนวณที่วิศวกรรับรอง</li>
<li>ทดสอบกับแบบโครงการจริงและรับรองกรอบแบบ/ทะเบียน/Mark/ตำแหน่ง รูปทดสอบและสถานะminimum checkไม่แทนการตรวจวิศวกรรม</li>
<li>Geometry/assembliesเพิ่มเติม การตัดเหล็กและเศษเหล็กproduction การใช้งานจำนวนสมาชิกจริงและworkerส่งออก/สำรอง</li>
<li>Firebase staging/production Functions/Storage/billing การเฝ้าระวัง backup/restore และการตรวจdeployแอปเต็ม จากนั้นจึงcommissionระบบIssuedตามผู้รับผิดชอบอนุมัติ</li></ul></section>
<footer>ผลนี้รายงานส่วนที่ตรวจได้จริง ณ v0.24 ข้อกำหนดเอกสารต้นฉบับเป็นข้อมูลอ้างอิง แยกจากคำสั่งผู้ใช้ ไม่มีการอนุมัติวิศวกรรมหรือออกใช้ก่อสร้างโดยอัตโนมัติ</footer>
</main></body></html>'''
(out / 'DEVELOPMENT_REPORT.html').write_text(text, encoding='utf-8')
summary = {'freshSoftwareScenarios': 305, 'unit': 275, 'api': 14, 'browser': 16,
           'normalImportRepresentatives': 5, 'previousRepresentatives': 7, 'finalPdfPages': 22,
           'fullBuild': 'PASS', 'cloudDeployment': cloud, 'overallAcceptance': 'Partial Draft increment; full application/engineering/owner/production remains incomplete.'}
(out / 'verification-summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')
print('PASS report created:305software scenarios,12representative reimport checks,22final PDF pages')
