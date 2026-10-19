from pathlib import Path
import hashlib
import html
import json

out = Path('output/component-pricing-verification')
read = lambda name: json.loads((out / name).read_text(encoding='utf-8-sig'))
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
unit = read('unit-results.json')
assert unit['success'] and unit['numPassedTests'] == 697 and unit['numFailedTests'] == 0
assert len(unit['testResults']) == 48
sets = [
    ('บันทึก / สิทธิ์ / Backup', 'sdk-results.json', 7),
    ('หน้าจอรุ่นพัฒนา', 'dev-results.json', 8),
    ('หน้าจอรุ่นสร้างใหม่', 'built-results.json', 8),
    ('ไฟล์ประวัติของโครงการที่กู้คืน', 'history-results.json', 1),
    ('ดาวน์โหลดจริงจากรุ่นสร้างใหม่', 'export-results.json', 4),
]
rows = []
count = 0
for label, file, expected in sets:
    data = read(file)
    assert len(data['results']) == expected and all(r['status'] == 'PASS' for r in data['results'])
    assert not data.get('cloud') and not data.get('errors')
    count += len(data['results'])
    rows.extend(
        f'<tr><td>{html.escape(label)}</td><td>{html.escape(r["name"])}</td><td class="pass">PASS</td></tr>'
        for r in data['results']
    )
assert count == 28

file_checks = read('file-results.json')
excel = read('excel-results.json')
assert file_checks['pages'] == 10 and len(file_checks['views']) == 10
assert len(excel['views']) == 8 and len(excel['results']) == 2
assert all(r['status'] == 'PASS' for r in file_checks['results'] + excel['results'])
for view in file_checks['views']:
    assert (out / view).is_file()
for view in excel['views']:
    assert (out / view['local']).is_file()
exports = read('export-results.json')['artifacts']
assert len(exports) == 4
for a in exports:
    assert sha(out / a['file']) == a['sha256']
    assert (out / a['file']).stat().st_size == a['bytes']
    assert a['report']['currencies'][0]['total'] == ('1215.44' if a['frozen'] else '1715.44')
ctx = read('context.json')
assert sha(out / 'component-backup.zip') == ctx['backup']['sha256']
assert ctx['frozenRecord']['engineVersion'] == 'geometry-2.2+bs8666-2000-v7'

protected = read('protected-config.json')
assert len(protected) == 6 and all(p['unchanged'] for p in protected)
for p in protected:
    assert sha(p['file']) == p['sha256']
copies = []
for name in ['firestore.rules', 'storage.rules']:
    assert (Path('tmp/composer-backend') / name).read_bytes() == Path(name).read_bytes()
    copies.append({'file': name, 'sha256': sha(name), 'identicalTestCopy': True})
(out / 'rule-copy-checks.json').write_text(json.dumps(copies, indent=2), encoding='utf-8')
auth_sha = '31e18928ae50fb5ba2ec0626b330c5df3dddccf74a3725deef3fdbef2bbdccea'
assert sha('src/data/firebase.ts') == auth_sha
version = json.loads(Path('package.json').read_text(encoding='utf-8'))['version']
assert version == '0.45.0'
assert 'built in' in (out / 'build.log').read_text(encoding='utf-8-sig')
assert 'blank is pending, and zero needs a source.' in Path('src/data/pricingPdf.ts').read_text(encoding='utf-8')

source_files = [
    'src/domain/boqPricingSchema.ts', 'src/domain/boqPricing.ts',
    'src/components/MemberPricingDialog.tsx', 'src/components/CostReport.tsx',
    'src/data/pricingExcel.ts', 'src/data/pricingPdf.ts', 'src/App.tsx',
]
manifest = {
    'version': version,
    'authSdk': json.loads(Path('node_modules/@firebase/auth/package.json').read_text(encoding='utf-8'))['version'],
    'backend': 'demo-boq-v041', 'authPort': 9899, 'firestorePort': 8380,
    'storagePort': 9399, 'devPort': 5196, 'compiledPort': 5201,
    'unitTests': 697, 'unitFiles': 48, 'actualLocalPaths': count,
    'appXlsxFiles': 2, 'appPdfFiles': 2, 'pdfPagesRendered': 10,
    'readonlyCommercialExcelViews': 8, 'buildPassed': True,
    'engineeringPolicyUnchanged': ctx['frozenRecord']['engineVersion'],
    'authInitializationUnchangedFromV044': auth_sha,
    'sourceSha256': {f: sha(f) for f in source_files},
    'artifacts': [{k: a[k] for k in ['file', 'sha256', 'bytes', 'frozen', 'jobId']} for a in exports],
    'backupSha256': ctx['backup']['sha256'],
    'golden': {
        'frozen': {'material': '813.73', 'labor': '281.40', 'combined': '120.31', 'total': '1215.44'},
        'working': {'material': '1313.73', 'labor': '281.40', 'combined': '120.31', 'total': '1715.44'},
        'workingSouthL2': '957.08',
    },
    'scope': 'Synthetic quotes; actual local Chromium/UI/SDK/Rules/Storage/restore and app downloads. No Rules changes, deployment, engineering or owner acceptance. Readonly workbook views are not native Excel printing.',
}
(out / 'provenance.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

images = [
    ('กรอกราคาค่าวัสดุและค่าแรง พร้อมที่มาแยกกัน', 'built-component-form.png'),
    ('ฟอร์มบนจอ 390px และปุ่มบันทึกที่เข้าถึงได้', 'built-components-mobile.png'),
    ('ดูเฉพาะ SOUTH / L2 ได้ยอด 957.08 จากรายการเดิม', 'built-component-scope.png'),
    ('Viewer อ่านยอดได้และปุ่มแก้ไขราคาถูกปิด', 'built-component-viewer.png'),
    ('Frozen PDF: ยอดเดิม 1,215.44', 'pdf-render/frozen-component-BOQ-2.png'),
    ('Frozen PDF: รายการค่าวัสดุ / ค่าแรง / ราคารวมเดิม', 'pdf-render/frozen-component-BOQ-4.png'),
    ('Frozen PDF: เงื่อนไขและวิธีคำนวณที่บันทึกไว้', 'pdf-render/frozen-component-BOQ-5.png'),
    ('Working PDF: ยอดแยกส่วนหลังแก้ราคาวัสดุ', 'pdf-render/working-component-BOQ-3.png'),
    ('Working PDF: ราคาวัสดุ 200.005 และที่มาใหม่', 'pdf-render/working-component-BOQ-4.png'),
    ('Frozen Excel: ยอดยังเป็น 1,215.44', 'frozen-component-BOQ-price-summary.png'),
    ('Working Excel: ยอดใหม่ 1,715.44', 'working-component-BOQ-price-summary.png'),
    ('Working Excel: ค่าวัสดุ / ค่าแรง / ราคารวมเดิม', 'working-component-BOQ-cost-components.png'),
]
for _, name in images:
    assert (out / name).is_file()
gallery = ''.join(
    f'<figure><figcaption>{html.escape(label)}</figcaption><a href="{name}"><img src="{name}" alt="{html.escape(label)}" loading="eager"></a></figure>'
    for label, name in images
)
requirements = [
    line for line in Path('docs/CURRENT_REQUIREMENTS_STATUS.md').read_text(encoding='utf-8').splitlines()
    if line.startswith('| ') and line.split('|')[1].strip().isdigit()
]
assert len(requirements) == 12
requirement_rows = ''.join(
    '<tr>' + ''.join('<td>' + html.escape(c.strip()) + '</td>' for c in line.split('|')[1:-1]) + '</tr>'
    for line in requirements
)
protected_rows = ''.join(
    f'<tr><td>{html.escape(p["file"])}</td><td class="pass">SHA-256 เท่าเดิม</td></tr>' for p in protected
)
links = ''.join(
    f'<li><a href="{file}">{label}</a></li>' for label, file in [
        ('การบันทึก สิทธิ์ CAS และ Backup/Restore', 'sdk-results.json'),
        ('หน้าจอรุ่นพัฒนา', 'dev-results.json'),
        ('หน้าจอรุ่นสร้างใหม่', 'built-results.json'),
        ('ตรวจไฟล์ Frozen ใน Storage ของโครงการที่กู้คืน', 'history-results.json'),
        ('ไฟล์ดาวน์โหลด งานส่งออก และ Storage checksum', 'export-results.json'),
        ('Unit tests 697 กรณี', 'unit-results.json'),
        ('ตรวจ PDF ทุกหน้าและ XML ของ Excel', 'file-results.json'),
        ('ตรวจเซลล์ต้นฉบับ Excel', 'xlsx-source-checks.json'),
        ('ตรวจและแสดงผล Excel แบบอ่านอย่างเดียว', 'excel-results.json'),
        ('ผลตรวจชนิดข้อมูลและ Build', 'build.log'),
        ('ตรวจไฟล์ที่คงไว้', 'protected-config.json'),
        ('ตรวจสำเนา Rules ที่ใช้ทดสอบ', 'rule-copy-checks.json'),
        ('รุ่น ขอบเขต และที่มาของหลักฐาน', 'provenance.json'),
    ]
)
downloads = ''.join(
    f'<tr><td>{"Frozen" if a["frozen"] else "Working"}</td><td><a href="{a["file"]}">{a["file"]}</a></td><td>{a["bytes"]:,} bytes</td><td class="pass">ตรงกับงาน Complete / Storage</td></tr>'
    for a in exports
)

doc = f'''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BOQ/BBS v0.45 — ราคาแยกค่าวัสดุและค่าแรง</title>
<style>*{{box-sizing:border-box}}body{{margin:0;background:#f2f6f4;color:#203b43;font:16px/1.65 Tahoma,"Segoe UI",sans-serif}}main{{max-width:1180px;padding:32px 24px;margin:auto}}h1{{font-size:32px;line-height:1.4}}h2{{font-size:23px}}section,.notice{{background:white;border:1px solid #d5e2de;border-radius:12px;padding:22px;margin:22px 0}}.notice{{border-left:5px solid #b87818}}.stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}}.stats div{{background:#1d3b43;color:white;border-radius:12px;padding:18px}}.stats b{{font-size:30px;display:block}}a{{color:#096c5c;overflow-wrap:anywhere}}.pass{{color:#096c5c;font-weight:bold}}.scroll{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{text-align:left;padding:12px;vertical-align:top;border-bottom:1px solid #e0e9e5;overflow-wrap:anywhere}}th{{background:#edf3f0}}.gallery{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}figure{{margin:0;border:1px solid #dae6e0;border-radius:8px;padding:12px}}figcaption{{min-height:52px;font-size:14px}}img{{width:100%;height:330px;object-fit:contain;background:#f1f5f3}}code{{overflow-wrap:anywhere}}summary{{cursor:pointer}}li{{margin:8px 0}}.muted{{color:#607d83;font-size:14px}}@media(max-width:680px){{main{{padding:18px 12px}}h1{{font-size:25px}}section,.notice{{padding:16px}}.stats,.gallery{{grid-template-columns:1fr}}img{{height:280px}}}}</style>
<main><p class="muted">BOQ &amp; BBS · v0.45 · 13 ตุลาคม 2026 · ตรวจในเครื่อง</p>
<h1>ราคา BOQ แยกค่าวัสดุและค่าแรง — ผ่านเฉพาะชุดทดสอบนี้</h1>
<p>เพิ่มตัวเลือกราคาค่าวัสดุและค่าแรงของแต่ละรายการ พร้อมที่มาราคาแยกกัน ดูยอดตามสมาชิก ประเภท โซน ชั้น และภาพรวมได้ ข้อมูลราคาต่อหน่วยรวมและ Frozen revision เดิมยังใช้ราคากับวิธีคำนวณที่บันทึกไว้ ส่งออก Excel/PDF จริงจากแอปและตรวจ Backup/Restore แล้ว</p>
<div class="stats"><div><b>697</b>Unit tests / 48 ไฟล์ผ่าน</div><div><b>28</b>เส้นทางจริงในระบบจำลองผ่าน</div><div><b>2 + 2</b>Excel / PDF จากแอปจริง</div></div>
<div class="notice"><strong>ยังไม่ผ่านการตรวจรับระบบเต็ม หรือ BBS ใช้ก่อสร้าง</strong><p>รอบนี้รับรองเฉพาะการทำงานซอฟต์แวร์กับราคาสังเคราะห์ในเครื่อง ยังรอกรณีวิศวกรรมและแบบจริงที่ตรวจรับ การยอมรับแบบจากเจ้าของงาน และ Production กับ Rules ที่คุณกำหนดและ deploy เอง <strong>ไม่ได้แก้หรือ deploy Rules/Hosting ไม่เพิ่ม Cloud Functions</strong></p></div>
<section><h2>ใช้ราคาสองรูปแบบได้</h2><ol>
<li>เปิดสมาชิกที่บันทึกแล้ว → <strong>กรอกราคา BOQ</strong> หรือเลือกสมาชิกในหน้า BOQ Summary → ประมาณราคา BOQ</li>
<li>เลือก <strong>ราคาต่อหน่วยรวม</strong> หรือ <strong>แยกค่าวัสดุและค่าแรง</strong> กรอกราคาและที่มาของแต่ละส่วน ปริมาณเหล็กใช้ BBS แยกขนาดและเกรด</li>
<li>ช่องว่างหมายถึง <strong>รอราคา</strong> ไม่ใช่ศูนย์ ถ้าไม่มีค่าใช้จ่ายให้กรอก 0 พร้อมที่มา ยอดสมบูรณ์จะยังรอจนทุกรายการที่เลือกมีราคาและฐานคำนวณครบ</li>
<li>บันทึกได้ตามสิทธิ์ Admin/QS และตรวจรุ่นข้อมูลก่อนเขียน การเปลี่ยนราคาปัจจุบันไม่เปลี่ยนใบราคาที่ Frozen ไว้</li>
</ol><p>สลับรูปแบบในฟอร์มแล้วกลับมาได้โดยค่าที่ยังไม่บันทึกของแต่ละรูปแบบยังอยู่จนปิดหรือโหลดข้อมูลใหม่ ระบบไม่แบ่งราคาต่อหน่วยรวมเดิมเป็นวัสดุและค่าแรงเอง การคัดลอกสมาชิกยังล้างราคาเพื่อให้ตรวจใหม่สำหรับบริบทปลายทาง</p></section>
<section><h2>ตัวเลขที่ตรวจจากไฟล์จริง</h2><p class="muted">โครงการทดสอบมีราคาสองรูปแบบร่วมกัน ตัวเลขด้านล่างเป็นราคาสังเคราะห์ THB ไม่ใช่ราคาตลาดหรือใบเสนอราคาสำหรับโครงการจริง</p>
<div class="scroll"><table><thead><tr><th>ชุดข้อมูล</th><th>ค่าวัสดุที่กรอก</th><th>ค่าแรงที่กรอก</th><th>ราคารวมเดิม</th><th>ยอดทั้งชุด</th></tr></thead><tbody>
<tr><td>Frozen R001</td><td>813.73</td><td>281.40</td><td>120.31</td><td>1,215.44</td></tr>
<tr><td>Working หลังแก้ราคาวัสดุ</td><td>1,313.73</td><td>281.40</td><td>120.31</td><td>1,715.44</td></tr>
</tbody></table></div>
<p>เปลี่ยนราคาวัสดุคอนกรีตจาก 100.005 เป็น 200.005 และเปลี่ยนที่มาราคาในหน้าจอจริง ค่าแรงกับราคาต่อหน่วยรวมเดิมยังเท่าเดิม Frozen ยังคงยอด 1,215.44 โดยอ่านราคาของ Revision นั้น ส่วน Working ได้ 1,715.44 การเลือกเฉพาะ SOUTH/L2 ได้ 957.08 และการเปลี่ยนวิธีจัดกลุ่มยังรวมรายการที่ปัดเศษไว้ชุดเดิม</p>
<p>เมื่อปล่อยค่าแรงคอนกรีตว่างในการทดสอบ ยอดเฉพาะส่วนที่กรอกได้ 1,115.41 และยอดสมบูรณ์ยังรอราคา จากนั้นคืนราคาให้ครบก่อนสร้าง Backup <strong>Backup จึงเป็นชุดราคาเดิมก่อนแก้ในหน้าจอ</strong> เมื่อกู้คืน ตรวจไฟล์ Frozen ใน Storage ของโครงการที่กู้คืนเอง ทั้งราคา v1/v2 และ checksum ตรงกับต้นฉบับ ไม่ได้ตรวจเพียงลิงก์กลับไปโครงการเดิม</p></section>
<section><h2>ฐานคำนวณและความหมายของยอดแยกส่วน</h2><p>ราคาต่อหน่วยรวมยังเป็น <code>boq-pricing-1.0</code> รูปแบบแยกส่วนใช้ <code>boq-pricing-2.0</code>: ปัดปริมาณที่ใช้คิดราคาต่อรายการและตำแหน่งหนึ่งครั้ง คูณราคาวัสดุและค่าแรงของแต่ละส่วน ปัดจำนวนเงินของแต่ละส่วน แล้วรวมจำนวนเงินที่ปัดแล้ว จึงอาจต่างจากการรวมราคาทั้งสองก่อนปัด เช่น ปริมาณ 1 วัสดุ 0.005 กับค่าแรง 0.005 ที่เงินทศนิยม 2 ให้ 0.02 ส่วนราคาต่อหน่วยรวม 0.010 แบบเดิมให้ 0.01 แต่ละแบบเก็บวิธีคำนวณของตนเองไว้</p>
<p>ยอดค่าวัสดุและค่าแรงแสดงเฉพาะส่วนที่กรอกจริง ราคารวมเดิมไม่ถูกจัดสรรลงสองส่วนนั้น ถ้ายังมีราคาแบบรวมหรือรายการรอราคา จึงไม่ถือว่าได้แยกต้นทุนทั้งโครงการครบแล้ว สกุลเงินแสดงแยกกัน ไม่แปลงสกุลเงินหรือเติม VAT/OH/กำไรให้อัตโนมัติ ค่าวัสดุและค่าแรงใช้ปริมาณเดียวกันในการคิดราคา <strong>ห้ามรวมปริมาณซ้ำของสองส่วนเป็นปริมาณงานจริง</strong> สูตรปริมาณ BOQ/BBS และมาตรฐาน BS เดิมไม่ได้เปลี่ยน</p></section>
<section><h2>ไฟล์ส่งออกจากแอป</h2><div class="scroll"><table><thead><tr><th>ฐานข้อมูล</th><th>ไฟล์</th><th>ขนาด</th><th>หลักฐาน</th></tr></thead><tbody>{downloads}</tbody></table></div>
<p>ไฟล์ทั้งสี่ดาวน์โหลดผ่านหน้าจอส่งออกของรุ่นสร้างใหม่ มีงานสถานะ Complete และขนาด/checksum ตรงกับ bytes ใน Storage Excel ตรวจเซลล์ต้นฉบับและเปิดคำนวณใหม่แบบอ่านอย่างเดียว 8 มุมมอง; ราคาปริมาณเป็นข้อความทศนิยมตรงตามค่าที่เก็บ จำนวนเงินเป็นค่าที่คำนวณและบันทึกไว้ ไม่ใช่สูตรราคา Excel ที่แก้ต่อแล้วคำนวณเอง</p>
<p>PDF สองชุดเป็น A3 แนวนอน ชุดละ 5 หน้า แสดงผลตรวจครบ <strong>10 หน้า</strong> พร้อม NOT FOR CONSTRUCTION และเลขหน้า ตารางรายละเอียดช่วงแรกเหลือรายการท้ายหน้าแยกอีกหน้า จึงปรับระยะในช่องจาก 2 เป็น 1.6 โดยไม่ลดขนาดตัวอักษรหรือเปลี่ยนตัวเลข แล้วส่งออกจากแอปและตรวจซ้ำครบ สร้างไฟล์รอบสุดท้ายหลังเก็บข้อความอธิบายศูนย์ให้ชัดขึ้น</p>
<p><a href="frozen-component-BOQ-contact.png">ดูทุกหน้า Frozen PDF</a> · <a href="working-component-BOQ-contact.png">ดูทุกหน้า Working PDF</a> · <a href="component-backup.zip">Backup ทดสอบจริง</a> · <a href="before-layout/export-results.json">หลักฐานรอบก่อนปรับระยะตาราง</a> · <a href="extra-price-detail-page.png">หน้ารายการท้ายที่พบก่อนแก้</a></p>
<p class="muted">มุมมอง Excel เป็นการตรวจแบบอ่านอย่างเดียว ตัวแสดงผลอาจตัดศูนย์ท้ายข้อความ เช่น 2.000 แสดงเป็น 2 โดยเซลล์ใน XLSX ต้นฉบับยังเป็นข้อความ 2.000 มีการจัดการเฉพาะเซลล์ข้อความว่างที่ตรวจจาก XML ในหน่วยความจำและไม่เขียนทับไฟล์ต้นฉบับ การตรวจนี้ยังไม่ใช่การพิมพ์ด้วย Microsoft Excel จริง</p></section>
<section><h2>หลักฐานหน้าจอและไฟล์</h2><p class="muted">ภาพหน้าจอจริงและภาพที่แสดงผลจากไฟล์ส่งออกจริง คลิกเพื่อดูเต็มขนาด</p><div class="gallery">{gallery}</div></section>
<section><h2>เส้นทางที่ทดสอบผ่าน</h2><div class="scroll"><table><thead><tr><th>ชุดตรวจ</th><th>กรณี</th><th>ผล</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>
<p>ตรวจชนิดข้อมูลและ Build ผ่าน Unit tests 48 ไฟล์ / 697 กรณี รวม 21 กรณีแยกส่วนใหม่และ 36 กรณีราคาของเดิม ทดสอบการปัดเงินอย่างอิสระ ยอดกลุ่มกับขอบเขต ช่องว่างกับศูนย์ เกรด/ขนาดเหล็ก รูปแบบราคาที่ไม่รองรับ และอ่าน XLSX จริงกลับมา การทดสอบ UI ครั้งแรกเลือกสมาชิกตามค่าเริ่มต้น ซึ่งเป็น COMBINED-CUBE จึงแก้ตัวทดสอบให้เลือก SPLIT-CUBE ผ่านช่องเลือกสมาชิกจริงและทดสอบซ้ำครบ เก็บผลครั้งแรกไว้ ไม่ใช่การแก้ระบบเพื่อให้ตัวทดสอบผ่าน</p></section>
<section><h2>ไฟล์และสิทธิ์ที่คงไว้</h2><div class="scroll"><table><thead><tr><th>ไฟล์</th><th>ผลเทียบก่อน–หลัง</th></tr></thead><tbody>{protected_rows}</tbody></table></div>
<p>เพิ่มเฉพาะรูปแบบราคา ฟอร์ม รายงาน และการส่งออก พร้อมเลขรุ่น/เอกสารประกอบ ระบบบัญชีจาก v0.44 ยังคงเดิม รุ่นนี้ไม่มี collection ใหม่หรือการเปลี่ยนสิทธิ์ ใช้คำสั่งบันทึกและกลไกตรวจรุ่น/ทำซ้ำเดิม Viewer อ่านได้แต่คำสั่งบันทึกและการเขียน Firestore โดยตรงถูกปฏิเสธในการทดสอบ</p>
<p>Rules ชุดจำลองเป็นสำเนาที่เหมือนไฟล์เดิมทุกไบต์ ใช้ระบบทดสอบ demo-boq-v041 กับตัวแก้การจัดรูปแบบ stdout ของ Storage CLI ที่บันทึกไว้ก่อนหน้านี้เฉพาะ runtime ทดสอบ ไม่มีการเพิ่มสิทธิ์ในกฎหรือ deploy ไป Production การตรวจสิทธิ์ในเครื่องนี้ไม่รับรองว่า Rules Production ที่คุณกำหนดเองตรวจรูปแบบราคา v2 หรืออนุญาตใช้งานเหมือนกัน</p></section>
<section><h2>ขอบเขตและงานที่ยังรอตรวจรับ</h2><ul>
<li>ทดสอบ Chromium และ Firebase จำลองในเครื่อง ไม่มีการเรียกหรือเปลี่ยนข้อมูล Production ก่อนใช้ราคา v2 ให้โหลดใหม่ทุกแท็บของแอปรุ่นเก่า โปรแกรมที่อ่านราคา v2 ต้องเป็น v0.45 หรือรุ่นถัดไปที่รองรับ</li>
<li>การเริ่มต้นบัญชีหลายแท็บยังเป็นชุดแก้ v0.44 ดู <a href="../auth-persistence-verification/DEVELOPMENT_REPORT.html">หลักฐานก่อน–หลัง</a> รุ่นนี้ไม่ได้เพิ่มการตรวจเบราว์เซอร์อื่น Google OAuth จริง offline/queued writes หรือการใช้หลายรุ่นพร้อมกัน</li>
<li>ยังรอการเทียบปริมาณและราคาของโครงการจริง การคำนวณปรับราคาอัตโนมัติ VAT/OH/กำไร ค่าเครื่องจักร/ส่วนประกอบอื่น และการแปลงสกุลเงินยังไม่มี</li>
<li>BS8666 ที่ผู้ใช้ให้ยังเป็นขั้นต่ำเริ่มต้นเดิม <code>geometry-2.2+bs8666-2000-v7</code> ไม่เปลี่ยนสูตร/รุ่นวิศวกรรม รอบนี้ไม่รับรอง ACI318 code33 ยังไม่รองรับ และ code51 ยังรอตรวจการปิดรูปจริง</li>
<li>ตำแหน่งและรูปร่างเหล็กในแบบ GULF จริง กรณีตัวเลขที่ผู้รับผิดชอบรับรอง และแบบมาตรฐานที่เจ้าของงานยอมรับยังค้างอยู่ Frozen ไม่ใช่ Issued เพื่อก่อสร้าง และยังไม่รับรองการใช้ stock ใน Production</li>
<li>A3/A1 BBS ของรอบก่อนมีหลักฐานแยกตามรายงานเดิม รอบนี้ส่งออก A3 BOQ ราคาเท่านั้น ไม่ถือว่าได้ตรวจ BBS ทุกแบบใหม่ การพิมพ์ Excel จริงและระบบที่ deploy แล้วยังรอตรวจ</li>
</ul><details><summary>สถานะข้อกำหนดเดิมทั้ง 12 ข้อ</summary><div class="scroll"><table><thead><tr><th>#</th><th>ข้อกำหนด</th><th>ส่วนที่มีแล้ว</th><th>รอตรวจรับ</th></tr></thead><tbody>{requirement_rows}</tbody></table></div></details></section>
<section><h2>เอกสารและผลตรวจ</h2><ul>{links}<li><a href="../../docs/BOQ_PRICING.md">วิธีใช้ราคาและข้อกำหนดการคำนวณ</a></li><li><a href="../../docs/CURRENT_REQUIREMENTS_STATUS.md">สถานะข้อกำหนดเดิม</a></li><li><a href="../priced-boq-verification/DEVELOPMENT_REPORT.html">รายงานราคาต่อหน่วยรวม v0.43</a></li></ul></section>
</main></html>'''
doc = doc.replace('</style>', 'table{min-width:620px}details table{min-width:980px}</style>')
(out / 'DEVELOPMENT_REPORT.html').write_text(doc, encoding='utf-8')
print(f'Written v0.45 report: {count} actual local paths,697 unit tests,10 PDF pages,8 readonly Excel views,{len(images)} images; full acceptance remains pending')
