"""Read-only evidence audit and scoped HTML report for the native Excel run."""
from pathlib import Path
import json, hashlib, html, zipfile, posixpath, re
from xml.etree import ElementTree as ET

root = Path(__file__).resolve().parents[1]
out = root / 'output/native-excel-verification'
old = root / 'output/section-views-verification'
def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def dump(name, value): (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')
def esc(value): return html.escape(str(value), quote=True)
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
rels_ns = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
rid = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'

def xml_sheets(path):
    result = {}
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            shared = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        for sheet in ET.fromstring(z.read('xl/workbook.xml')).find('s:sheets', ns):
            target = rels[sheet.attrib[rid]]
            target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            tree = ET.fromstring(z.read(target))
            cells = {}
            for c in tree.findall('.//s:sheetData/s:row/s:c', ns):
                typ = c.attrib.get('t', 'n')
                v = c.find('s:v', ns)
                value = v.text if v is not None else None
                if typ == 's': value = shared[int(value)]
                if typ == 'inlineStr': value = ''.join(c.find('s:is', ns).itertext())
                f = c.find('s:f', ns)
                cells[c.attrib['r']] = {'type': typ, 'value': value, 'formula': f.text if f is not None else None}
            result[sheet.attrib['name']] = {'tree': tree, 'cells': cells}
    return result

artifacts = read(out / 'artifacts.json')
native = read(out / 'native-results.json')
files = read(out / 'file-results.json')
baseline_native = read(out / 'before/native-results.json')
unit = read(out / 'unit-results.json')
exports = read(out / 'export-results.json')
assert unit['success'] and unit['numPassedTests'] == 900 and unit['numFailedTests'] == 0
assert len(unit['testResults']) == 57
assert len(exports['results']) == 2 and all(r['status'] == 'PASS' for r in exports['results'])
assert exports['cloud'] == [] and exports['errors'] == []
assert len(native['results']) == 2 and all(r['status'] == 'PASS' for r in native['results'])
assert len(files['results']) == 2 and all(r['pages'] == 4 and r['status'] == 'PASS' for r in files['results'])
assert not native['rulesChanged'] and not native['deployed'] and not native['reusedGeneratedPdf']
protected = []
for item in read(old / 'protected-config.json'):
    actual = sha(root / item['file'])
    assert actual == item['sha256'], item['file']
    protected.append({'file': item['file'], 'sha256': actual, 'unchanged': True})
for name in ['firestore.rules', 'storage.rules']:
    assert sha(root / name) == sha(root / 'tmp/bar-placement-backend' / name), name
dump('protected-config.json', protected)
audits = []
for a in artifacts:
    assert sha(out / a['file']) == a['sha256']
    previous = next(p for p in baseline_native['artifacts'] if p['source'] == a['file'])
    assert sha(old / a['file']) == previous['sourceSha256']
    original = xml_sheets(old / a['file'])
    current = xml_sheets(out / a['file'])
    compared = ['BOQ', 'BBS', 'BOQ Print', 'Rebar Summary', 'BBS Print', 'Drawing Views']
    metadata_changes = []
    for name in compared:
        changed = [{'cell': k, 'before': original[name]['cells'].get(k), 'after': current[name]['cells'].get(k)} for k in set(current[name]['cells']) | set(original[name]['cells']) if current[name]['cells'].get(k) != original[name]['cells'].get(k)]
        for change in changed:
            # A fresh Working capture records its actual export time. Permit only
            # that timestamp in raw-sheet A2; identity/version/status remain exact.
            before, after = change['before'], change['after']
            stamp = r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z'
            assert not a['frozen'] and name in ['BOQ', 'BBS'] and change['cell'] == 'A2', (a['file'], name, change)
            assert before['type'] == after['type'] and before['formula'] == after['formula']
            assert re.search(stamp, before['value']) and re.search(stamp, after['value'])
            assert re.sub(stamp, '<captured-at>', before['value']) == re.sub(stamp, '<captured-at>', after['value'])
            metadata_changes.append({'sheet': name, **change, 'reason': 'Fresh Working export capture time only'})
    tree = current['BOQ Print']['tree']
    setup = tree.find('s:pageSetup', ns).attrib
    assert setup['paperSize'] == '8' and setup['orientation'] == 'landscape'
    assert setup['fitToWidth'] == '1' and setup['fitToHeight'] == '0' and 'scale' not in setup
    assert tree.find('s:sheetPr/s:pageSetUpPr', ns).attrib['fitToPage'] == '1'
    before_setup = original['BOQ Print']['tree'].find('s:pageSetup', ns).attrib
    assert before_setup.get('scale') == '100'
    bbs = current['BBS']['cells']
    assert all(float(bbs[f'K{i}']['value']) == 1 for i in range(4, 9))
    assert abs(sum(float(bbs[f'M{i}']['value']) for i in range(4, 9)) - a['rebar']) < 1e-10
    printed = current['BBS Print']['cells']
    assert all(printed[f'D{i}']['type'] in ['s', 'inlineStr', 'str'] and printed[f'D{i}']['value'] == '00' for i in range(5, 10))
    assert float(current['Drawing Views']['cells']['E5']['value']) == (1000 if a['frozen'] else 1200)
    p = next(n for n in native['artifacts'] if n['source'] == a['file'])
    assert p['sourceSha256'] == a['sha256'] and sha(out / p['file']) == p['sha256']
    assert sha(out / 'before' / previous['file']) == previous['sha256']
    audits.append({'file': a['file'], 'status': 'PASS', 'sourceSha256': a['sha256'],
                   'previousUnmodifiedSha256': previous['sourceSha256'], 'comparedTabs': compared,
                   'allBusinessCellValuesTypesAndFormulasUnchanged': True, 'captureTimestampChanges': metadata_changes, 'boqPageSetup': setup,
                   'fiveCode00TextRows': True, 'rebarKg': a['rebar'], 'nativeSourceBytesUnchanged': True})
dump('ooxml-audit.json', {'results': audits, 'localRulesCopiesMatch': True})
reviewed_images = [image for f in files['results'] for image in f['images']]
assert len(reviewed_images) == 8 and all((out / n).is_file() for n in reviewed_images)
dump('visual-review.json', {'status': 'PASS', 'method': 'All eight final 120dpi Poppler page images inspected by the agent',
                           'pages': reviewed_images, 'beforeDefect': 'BOQ Print status column K alone on page3; quantities on page2',
                           'after': 'All11 BOQ columns and total on page2; Thai text, Code00 and all5 shapes readable',
                           'scope': 'Only these two datasets and four selected tabs; no physical printer acceptance'})
dump('diagnostic-history.json', {'records': [
    {'stage': 'Native startup inside sandbox', 'status': 'FAIL', 'observedTerminalError': '0x80070520: A specified logon session does not exist',
     'resolution': 'Automatically approved owned hidden Excel read-only probe outside sandbox confirmed version16.0 build16130. No unrelated Excel process stopped.'},
    {'stage': 'First native baseline metadata writer', 'status': 'FAIL', 'observedTerminalError': 'Argument types do not match',
     'resolution': 'PDF exports had already completed. Replaced PowerShell5 generic-list array conversion with ToArray; rechecked original bytes and reused those exact baseline PDFs for metadata recovery.'},
    {'stage': 'Baseline content/page-size check', 'status': 'INSUFFICIENT',
     'evidence': 'before/file-results.json records five A3 pages and content presence; it did not assert one page per selected tab or same-page coverage.',
     'resolution': 'Visual review reproduced a real BOQ layout FAIL. Strengthened final verifier to require four pages and BOQ quantities plus coverage/status on the same page.'},
    {'stage': 'Baseline native BOQ layout', 'status': 'FAIL', 'beforePagesPerWorkbook': 5,
     'evidence': 'before/*-page-2.png and before/*-page-3.png show quantity/status split',
     'resolution': 'BOQ Print only: fitToPage=true, fitToWidth=1, fitToHeight=0, remove scale100. Regenerated both app files and printed fresh native PDFs.'},
    {'stage': 'Strict old/new cell comparison', 'status': 'FAIL_THEN_RESOLVED',
     'observedTerminalError': 'Working BOQ A2 differs: capture timestamp 2026-10-13T02:39:11.880Z vs 2026-10-13T02:56:45.918Z',
     'resolution': 'Six-tab comparison permits only ISO capture time in Working raw BOQ/BBS A2; exact identity/status/version, every business cell type/value/formula and all print cells remain equal. Full differences are retained in ooxml-audit.json.'},
    {'stage': 'Final fresh app exports/native print/files/visual review', 'status': 'PASS',
     'pagesPerWorkbook': 4, 'totalFinalPages': 8, 'newAppExports': 2, 'newNativePrintRuns': 2,
     'newBackupRestoreTest': False, 'protectedRulesChanged': False, 'deployed': False}
]})

req = (root / 'docs/CURRENT_REQUIREMENTS_STATUS.md').read_text(encoding='utf8')
rows = []
for line in req.splitlines():
    if re.match(r'^\| \d+ \|', line):
        columns = [c.strip() for c in line.strip('|').split('|')]
        assert len(columns) == 4
        rows.append('<tr>' + ''.join('<td>' + esc(c) + '</td>' for c in columns) + '</tr>')
assert len(rows) == 12
def figure(src, label): return f'<figure><a href="{esc(src)}"><img loading="lazy" src="{esc(src)}" alt="{esc(label)}"></a><figcaption>{esc(label)}</figcaption></figure>'
before_figures = ''.join(figure(f'before/{prefix}-sections-native-a3-page-{i}.png', f'ก่อนแก้ {prefix} / หน้า{i}: ' + ('ปริมาณ BOQ ไม่มีคอลัมน์สถานะ' if i == 2 else 'สถานะถูกแยกออกไปอีกหน้า')) for prefix in ['frozen','working'] for i in [2,3])
after_figures = ''.join(figure(name, ('Frozen R003' if name.startswith('frozen') else 'Working D11') + f' / หน้า{1 + i % 4} / Microsoft Excel พิมพ์จริง') for i,name in enumerate(reviewed_images))
artifact_rows = []
for a in artifacts:
    p = next(n for n in native['artifacts'] if n['source'] == a['file'])
    artifact_rows.append(f'<tr><td>{"Frozen R003" if a["frozen"] else "Working D11"}</td><td><a href="{a["file"]}">XLSX จากแอป</a> ({a["bytes"]:,} bytes)<br><code>{a["sha256"]}</code></td><td><a href="{p["file"]}">PDF พิมพ์จาก Microsoft Excel</a> / 4 หน้า ({p["bytes"]:,} bytes)<br><code>{p["sha256"]}</code></td><td>{"SDK ของแอป" if a["frozen"] else "ปุ่ม Excel ในแอปที่ build แล้ว"}<br>Storage/job Complete ตรวจ SHA แล้ว</td></tr>')
checks = [('TypeScript + Vite build','ผ่าน / 7.80วินาที; preview5217'), ('Unit tests','900 cases / 57 files / ไม่มี failure'),
          ('ส่งออก XLSX จากแอปจริง','2 เส้นทาง ผ่าน / Guard ไม่มีคำขอ production'), ('Microsoft Excel อ่าน/คำนวณ/พิมพ์จริง','2 เส้นทาง ผ่าน / version16.0 build16130'),
          ('ขนาดหน้าและเนื้อหา PDF','2 ไฟล์ / 8 หน้า A3 แนวนอน / คอลัมน์สถานะอยู่หน้าเดียวกับปริมาณ'),
          ('ตรวจภาพทุกหน้า','8/8 หน้า ผ่าน / ไทย Code00 และรูปเหล็ก5รูป'), ('ตรวจ OOXML ต้นฉบับ','6 แท็บต่อไฟล์: ค่าปริมาณ ชนิดเซลล์และสูตรตรงกับ v0.55; Working raw A2 เปลี่ยนเฉพาะเวลาส่งออกใหม่'),
          ('Rules/config/Auth/ต้นฉบับแบบ','9 SHA ตรงเดิม / Rules ของ emulator ตรงไฟล์เดิม'), ('Backup/Restore รอบนี้','ไม่ได้ทดสอบซ้ำ; มีหลักฐาน v0.55 แยกต่างหาก')]
check_rows = ''.join(f'<tr><td>{esc(a)}</td><td>{esc(b)}</td></tr>' for a,b in checks)
protected_rows = ''.join(f'<tr><td>{esc(p["file"])}</td><td><code>{p["sha256"]}</code></td><td>ตรงเดิม</td></tr>' for p in protected)
body = f'''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>v0.56 — ตรวจการพิมพ์ BOQ ด้วย Microsoft Excel</title><style>
:root{{color-scheme:light;--ink:#17323b;--muted:#52656e;--line:#cddade;--blue:#12657a}}*{{box-sizing:border-box}}body{{margin:0;background:#f3f7f8;color:var(--ink);font-family:Tahoma,Arial,sans-serif;line-height:1.7}}main{{max-width:1200px;margin:auto;padding:36px 24px 64px}}header{{background:#17323b;color:white;padding:28px;border-radius:14px}}header a{{color:#bde8f0}}h1{{font-size:30px;line-height:1.4;margin:0 0 12px}}h2{{font-size:23px;margin:0 0 15px}}h3{{font-size:18px}}p{{margin:12px 0}}section{{margin-top:24px;background:white;padding:24px;border-radius:12px;border:1px solid var(--line)}}a{{color:var(--blue);overflow-wrap:anywhere}}.eyebrow{{color:#bde8f0;font-size:14px;margin:0 0 10px}}.note{{background:#fff5d8;border-left:4px solid #d89c1c;padding:12px 16px}}.ok{{background:#e2f0e9;padding:12px 16px;border-left:4px solid #2d875e}}.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0 0}}.card{{background:white;border:1px solid var(--line);border-radius:10px;padding:14px}}.card strong{{font-size:25px;display:block}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}figure{{margin:0}}img{{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:5px}}figcaption{{font-size:13px;color:var(--muted);margin:7px 0 14px}}.scroll{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}}th{{background:#e7f0f2}}code{{overflow-wrap:anywhere;word-break:break-all;font-size:11px}}#requirements table{{min-width:880px}}.details-table{{min-width:650px}}li{{margin:7px 0}}footer{{margin-top:24px;color:var(--muted);font-size:13px}}@media(max-width:680px){{main{{padding:16px 12px 32px}}header,section{{padding:18px}}h1{{font-size:24px}}h2{{font-size:21px}}.cards{{grid-template-columns:repeat(2,1fr)}}.grid{{grid-template-columns:1fr}}}}
</style><main><header><p class="eyebrow">BOQ / BBS · v0.56 · 13 ตุลาคม 2026 · ตรวจในเครื่องทดสอบ</p><h1>แก้ BOQ พิมพ์แยกคอลัมน์สถานะ<br>ยืนยันด้วย Microsoft Excel จริง</h1><p>ก่อนแก้ Excel พิมพ์ตาราง BOQ สองหน้าตามแนวนอน โดยคอลัมน์ “สถานะข้อมูลเหล็ก” แยกออกไป หลังแก้ครบทั้ง11คอลัมน์บน A3 หน้าเดียว ปริมาณ สูตร และไฟล์อ้างอิงเดิมไม่เปลี่ยน</p><p><a href="../../docs/NATIVE_EXCEL_PRINTING.md">วิธีพิมพ์</a> · <a href="../../docs/CURRENT_REQUIREMENTS_STATUS.md">สถานะข้อกำหนด12ข้อ</a> · <a href="../section-views-verification/DEVELOPMENT_REPORT.html">หลักฐานรอบก่อน</a></p></header>
<div class="cards"><div class="card"><strong>900</strong>unit cases / 57 files</div><div class="card"><strong>4</strong>เส้นทางใช้งานจริงในเครื่อง</div><div class="card"><strong>8/8</strong>หน้า A3 ตรวจภาพแล้ว</div><div class="card"><strong>9</strong>SHA ไฟล์ที่คงเดิม</div></div>
<section><h2>ผลและขอบเขต</h2><p class="ok">ผ่านเฉพาะชุดตรวจนี้: XLSX ใหม่จากแอป2ไฟล์ พิมพ์ด้วย Microsoft Excel16.0 build16130 แบบอ่านอย่างเดียว สี่แท็บที่เลือกเป็น PDF ได้4หน้าต่อไฟล์ ทั้ง Working และ Frozen</p><p class="note">ยังไม่ผ่านตรวจรับระบบเต็ม หรือพร้อมออก BBS ก่อสร้าง: กรณีนี้ใช้เหล็กสังเคราะห์ห้าชิ้น ยังไม่มีการถอดเหล็ก GULF จริงหรือการรับรอง BS/ACI และเจ้าของงาน ไม่ได้ตรวจ production หรือเครื่องพิมพ์จริง ผู้ใช้จัดการ Rules และ deploy เอง</p><p>สี่แท็บคือ Drawing Views, BOQ Print, Rebar Summary และ BBS Print PDF รอบนี้เป็นการพิมพ์ตาราง XLSX ผ่าน Excel ไม่ใช่ BBS drawing PDF ที่แอปจัดรูปแปลน/รูปตัดและกรอบแบบ</p></section>
<section><h2>ก่อนแก้: แยกสถานะออกจากปริมาณ</h2><p>ไฟล์เดิม v0.55 ทั้งสองชุดพิมพ์5หน้า หน้า2มีปริมาณ แต่หน้า3มีคอลัมน์สถานะเพียงคอลัมน์เดียว หลักฐานเดิมคงอยู่ทั้ง PDF และ SHA การตรวจเนื้อหา/ขนาดหน้าใน before/file-results.json เคยให้ PASS แต่ไม่ได้ตรวจการแยกคอลัมน์ จึงใช้เป็นหลักฐานการจัดหน้าผ่านไม่ได้</p><div class="grid">{before_figures}</div><p><a href="before/frozen-sections-native-a3.pdf">PDF ก่อนแก้ Frozen / 5หน้า</a> · <a href="before/working-sections-native-a3.pdf">PDF ก่อนแก้ Working / 5หน้า</a> · <a href="diagnostic-history.json">ข้อผิดพลาดและวิธีแก้ที่บันทึกไว้</a></p></section>
<section><h2>สิ่งที่เปลี่ยน</h2><p>ปรับเฉพาะการพิมพ์ BOQ Print ให้กว้างหนึ่งหน้าและแบ่งตามแนวตั้งได้: fitToPage=true, fitToWidth=1, fitToHeight=0 และเลิกบังคับ scale100 โดยรักษาขนาดคอลัมน์ เนื้อหา สูตรและปริมาณเดิม พฤติกรรมจัดหน้าของชุดใหญ่และเครื่องอื่นยังต้องตรวจด้วยไฟล์จริง</p><p>สร้าง XLSX ใหม่จากคำสั่งของแอปและปุ่ม Excel ในแอปที่ build แล้ว ตรวจ job Complete และไฟล์ใน Storage ท้องถิ่น เปิดไฟล์แบบ read-only ใน Excel คำนวณใหม่ แล้วพิมพ์เฉพาะแท็บที่เลือกโดยไม่ละเลยพื้นที่พิมพ์ ปิดเฉพาะ Excel instance ที่การตรวจนี้สร้าง ไม่บันทึกทับ XLSX ต้นฉบับและไม่หยุดบริการที่มีอยู่</p><p>การส่งออก PDF ใช้พฤติกรรมพื้นที่พิมพ์ตาม <a href="https://learn.microsoft.com/en-us/office/vba/api/excel.worksheet.exportasfixedformat">เอกสาร Microsoft Worksheet.ExportAsFixedFormat</a> รหัส SHA ของ XLSX ก่อนและหลังเปิดด้วย Excel ตรงกัน</p></section>
<section><h2>ไฟล์ส่งออกและผลตรวจ</h2><div class="scroll"><table class="details-table"><thead><tr><th>ชุดข้อมูล</th><th>XLSX จากแอป</th><th>Native Excel PDF</th><th>ช่องทาง</th></tr></thead><tbody>{''.join(artifact_rows)}</tbody></table></div><p>Frozen R003 ใช้ B-B Z1000mm / Working D11 ใช้ B-B Z1200mm คอนกรีต3.234m³ แบบหล่อ18.48m² เหล็กที่กรอก40.563239033502256kg ห้าชิ้น25.7m รวมปริมาณครั้งเดียว ข้อความ `00` และรูปเหล็กทั้งห้ารูปแสดงครบ</p><p>ไฟล์ระบุ Sarabun แต่เครื่องนี้ใช้ Arial/Tahoma ทดแทน ข้อความไทยในทุกหน้าที่ตรวจอ่านได้ ไม่อ้างว่าได้พิมพ์ด้วย Sarabun หรือรับรองฟอนต์/เครื่องพิมพ์อื่น</p><div class="scroll"><table><thead><tr><th>การตรวจ</th><th>หลักฐาน</th></tr></thead><tbody>{check_rows}</tbody></table></div><p><a href="export-results.json">ผลส่งออกจากแอป</a> · <a href="artifacts.json">ข้อมูล job/ไฟล์</a> · <a href="native-results.json">ผล Microsoft Excel</a> · <a href="file-results.json">ขนาดหน้า/เนื้อหา/ฟอนต์</a> · <a href="ooxml-audit.json">ค่าและสูตร OOXML</a> · <a href="visual-review.json">ผลตรวจภาพ</a> · <a href="unit-results.json">unit tests</a></p></section>
<section><h2>หลังแก้: PDF จาก Excel ทุกหน้า</h2><p>ตรวจภาพ Poppler120dpi ทั้ง8หน้าแล้ว ไม่มีคอลัมน์ BOQ แยกออกไป รูปเหล็กและตัวเลขไม่ชนกัน ชื่อสถานะ/ภาษาไทยอ่านได้</p><div class="grid">{after_figures}</div></section>
<section><h2>การดาวน์โหลดจากหน้าจอแอปจริง</h2>{figure('working-excel-ui.png','ปุ่ม Excel ใน BOQ Summary ของแอปที่ build แล้ว / Working D11 / local emulator')}</section>
<section><h2>สิ่งที่ยังต้องตรวจต่อ</h2><ul><li>Native Excel: ชุดข้อมูลใหญ่/ข้อความยาว/แท็บอื่น การแบ่งหลายหน้าตามแนวตั้ง และเครื่องพิมพ์จริง ยังไม่ตรวจรับรอบนี้</li><li>วิศวกรรม: BS8666:2000+Amd1/2 ขั้นต่ำและ engine v7 เดิม ไม่เปลี่ยนสูตร Code33 ยังไม่รองรับ และรายละเอียดปิดปลายทางกายภาพของ51ยังรอข้อกำหนดที่รับรอง พร้อมชุดกรณี BS/ACI ที่ผู้รับผิดชอบตรวจ</li><li>โครงการจริง: ถอดและเทียบเหล็ก GULF จริง รับรองตำแหน่งติดตั้ง/จำนวน/ความยาว กรอบเจ้าของงานและ Issued ยังไม่ผ่าน</li><li>Production: คง Rules/config/Auth ที่ผู้ใช้ดูแล ไม่ deploy หรือทดสอบ production กฎ local เดิมยังให้ client เก่าสำรองเหล็กบาง scope ได้ และไม่อนุญาต transaction ใช้เหล็กจริง/สร้างเศษ จึงยังไม่รับรองการบริหาร stock จริง</li><li>Backup/Restore: ไม่ได้ทำซ้ำสำหรับ2ไฟล์ใหม่รอบนี้ หลักฐาน v0.55 เป็นการตรวจ source/ประวัติและ5ไฟล์ของรอบก่อน</li></ul></section>
<section id="requirements"><h2>ข้อกำหนดเดิมทั้ง12ข้อยังคงอยู่</h2><p>สถานะจากเอกสารปัจจุบัน ไม่ลดเป้าหมายเหลือเฉพาะงานพิมพ์ Excel</p><div class="scroll"><table><thead><tr><th>#</th><th>ความต้องการ</th><th>ส่วนที่มีในซอฟต์แวร์</th><th>ตรวจรับที่เหลือ</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div></section>
<section><h2>ยืนยันไฟล์ที่คงเดิม</h2><p>ตรวจ9 SHA เทียบหลักฐาน v0.55 โดยไม่เปิดเผยค่า .env เนื้อหา Rules ใน local emulator ตรงไฟล์ที่ผู้ใช้ดูแล ไม่มี Rules/Hosting deployment ไม่มี Cloud Functions หรือ backend ใหม่</p><div class="scroll"><table class="details-table"><thead><tr><th>ไฟล์</th><th>SHA256</th><th>ผล</th></tr></thead><tbody>{protected_rows}</tbody></table></div><p><a href="protected-config.json">หลักฐาน SHA</a> · <a href="runtime.json">runtime ท้องถิ่น</a> · <a href="../../docs/NATIVE_EXCEL_PRINTING.md">คู่มือใช้งาน</a></p></section>
<footer>รายงานพัฒนาที่มีขอบเขตชัดเจน · v0.56 · ไม่ใช่การตรวจรับระบบเต็มหรืออนุมัติใช้งานก่อสร้าง</footer></main></html>'''
(out / 'DEVELOPMENT_REPORT.html').write_text(body, encoding='utf8')
print(json.dumps({'status':'PASS','protected':len(protected),'ooxmlWorkbooks':len(audits),'reviewedPdfPages':len(reviewed_images),'actualWorkflows':4,'requirements':len(rows),'htmlImages':13},ensure_ascii=False))
