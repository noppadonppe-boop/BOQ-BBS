from pathlib import Path
import json, hashlib, html

root = Path(__file__).resolve().parents[1]
out = root / 'output/scope-verification'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
esc = lambda value: html.escape(str(value))
unit = read(out / 'unit-results.json')
assert unit['numTotalTests'] == 174 and unit['numFailedTests'] == 0
groups = [
    ('Unit / ปริมาณและการเลือกขอบเขต', 'unit-results.json', 174),
    ('Firebase / ขอบเขต BOQ และ revision', 'api-results.json', 8),
    ('Browser / ขอบเขตและไฟล์ส่งออกจริง', 'ui-results.json', 11),
    ('Firebase / แบบต้นทางและสิทธิ์เดิม', 'regression-source/api-results.json', 10),
    ('Browser / แบบต้นทางและการกู้คืนเดิม', 'regression-source/ui-results.json', 11),
    ('Firebase / งานเดิมทั้งหกหมวด', 'regression-baseline/integration-results.json', 6),
    ('Browser / งานเดิมทั้งหกหมวด', 'regression-baseline/ui-results.json', 13),
]
for name, file, count in groups[1:]:
    result = read(out / file)
    assert len(result['results']) == count and all(r['status'] == 'PASS' for r in result['results']), name
    assert not result.get('errors', []), name
build = read(out / 'build-results.json')
assert build['status'] == 'PASS' and build['scenarioCount'] == 1 and not build['errors']
assert build['actualBuiltGroupedBoq'] and build['actualFirstUseBuiltScopedSourceA1']
assert build['heavyModulesDeferred'] and build['totalInitialJavaScriptBytes'] < 1120000
groups.append(('Built / ส่งออกครั้งแรกจาก build จริง', 'build-results.json', 1))
total = sum(n for _, _, n in groups)
assert total == 234
pdf = read(out / 'pdf-verification.json')
assert len(pdf['results']) == 11 and sum(r['pages'] for r in pdf['results']) == 35
assert pdf['visualReview'].startswith('PASS')
assert all(r['status'] == 'PASS' and r['renderedAllPages'] and r['allTextWithinPaper'] for r in pdf['results'])
assert pdf['scopedHistoryRestoredByteExact'] and pdf['retryAndBuiltTextAndPixelsExact'] and pdf['previousPrimaryAndBSUnchanged']
checkpoint = read(out / 'checkpoint-verification.json')
default = read(out / 'default-data-verification.json')
cli = read(out / 'checkpoint-cli.json')
reimport = read(out / 'final-reimport-results.json')
lock = read(out / 'lockfile-verification.json')
assert checkpoint['status'] == default['status'] == cli['status'] == lock['status'] == 'PASS'
assert cli['exitCode'] == 0 and cli['restartReimportTested'] and default['allFileSha256Match']
assert checkpoint['allBlobSizeAndMd5Match'] and checkpoint['previousV15BlobBytesPreserved'] == 2154
assert len(reimport['results']) == 4 and all(r['status'] == 'PASS' for r in reimport['results'])
assert lock['rootVersion'] == '0.16.0'
package = read(root / 'package.json')
package_lock = read(root / 'package-lock.json')
assert package['version'] == package_lock['version'] == package_lock['packages']['']['version'] == '0.16.0'
assert package_lock['packages']['node_modules/pdf-lib']['version'] == '1.17.1'

primary = root / 'output/pdf/selected-zone-floor-BBS-source-draft.pdf'
sha = hashlib.sha256(primary.read_bytes()).hexdigest()
assert primary.read_bytes() == (out / 'downloads/scoped-source-A3.pdf').read_bytes()
previous_sha = hashlib.sha256((root / 'output/pdf/BBS-source-mark-references-draft.pdf').read_bytes()).hexdigest()
assert previous_sha == '62c5dd983c83119143204bdd3aaccb0dc11dec40373accafc4e4068d5c7720cb'
assert hashlib.sha256((root / 'Referrence/BS 8666.pdf').read_bytes()).hexdigest() == '9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
ui = read(out / 'ui-results.json')
summary = {
    'version': '0.16.0', 'date': '2026-10-12', 'status': 'Verified software increment / Draft only; full acceptance incomplete',
    'softwareScenarios': total, 'unit': 174, 'api': 24, 'browser': 35, 'built': 1,
    'actualSelectedPdfFiles': 11, 'actualSelectedPdfLeaves': 35, 'visualReview': pdf['visualReview'],
    'fixture': 'Synthetic boxes with independently checked volumes and explicit manual cuts; not GULF takeoff or BS/ACI engineering acceptance',
    'selectedFrozenZoneAFloorL1': {'physicalQuantity': 7, 'concreteM3': 7.68, 'rebarKgRounded': 136.131, 'barPieces': 18},
    'selectedWorkingAfterEdits': {'physicalQuantity': 25, 'concreteM3': 62.88},
    'completeBackupWorkingQuantity': 52, 'completeFrozenQuantity': 34,
    'initialJavaScriptBytes': build['totalInitialJavaScriptBytes'], 'heavyModulesDeferred': True,
    'primaryPdf': str(primary), 'primarySha256': sha, 'previousPrimaryAndBSUnchanged': True,
    'restoredScopedHistorySha256': ui['restoredScopedHash'],
    'checkpoint': checkpoint, 'defaultData': default, 'representativeReimportChecks': 4,
    'engineeringAndProduction': 'Pending; Issued and production cutting release remain blocked',
}
(out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

rows = ''.join(f'<tr><td>{esc(name)}</td><td>{n}</td><td class="pass">PASS</td><td><a href="{file}">ผลตรวจ</a></td></tr>' for name, file, n in groups)
pdfrows = ''.join(f'<tr><td><a href="downloads/{r["file"]}">{esc(r["file"])}</a></td><td>{r["pages"]} / {r["size"]}</td><td class="pass">PASS</td><td class="hash">{r["sha256"][:18]}…</td></tr>' for r in pdf['results'])
failures = ''.join(f'<li><a href="initial-attempt/{esc(p.name)}">{esc(p.name)}</a></li>' for p in sorted((out / 'initial-attempt').glob('*.json')))
shots = [
    ('working-category.png', 'BOQ ปัจจุบัน หลังแก้จำนวนและมิติ'),
    ('frozen-category.png', 'revision เดิม / เลือก Zone A และชั้น L1'),
    ('frozen-mobile.png', 'ตัวเลือก revision บนหน้าจอ 390 px'),
    ('scoped-source-A3-contact.png', 'ชุด BBS และแบบต้นทาง A3 / 8 หน้า'),
    ('scoped-source-A1-contact.png', 'ชุดเดียวกัน A1 / 8 หน้า'),
    ('scoped-schedule-A4-contact.png', 'ตารางตัด A4 เฉพาะสมาชิกและพื้นที่ / 4 หน้า'),
    ('grouped-boq-contacts.png', 'BOQ ที่ดาวน์โหลดจริง / ปัจจุบัน Frozen Retry Restore และ build'),
]
for file, _ in shots:
    assert (out / file).is_file(), file
gallery = ''.join(f'<figure><a href="{file}"><img src="{file}" alt="{esc(label)}"></a><figcaption>{esc(label)}</figcaption></figure>' for file, label in shots)
counts = checkpoint['fileCounts']
document = f'''<!doctype html>
<html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FORM v0.16 · BOQ และขอบเขตชุดแบบ</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f1f5f3;color:#203940;font:15px/1.7 "Sarabun","Segoe UI",sans-serif}}main{{max-width:1140px;margin:auto;padding:28px 24px 70px}}header{{background:#203940;color:#fff;border-radius:16px;padding:30px;margin-bottom:22px}}h1{{font-size:29px;margin:8px 0}}h2{{font-size:21px;margin:0 0 10px}}h3{{font-size:17px}}section{{background:white;border:1px solid #dce6e2;border-radius:13px;padding:24px;margin:20px 0}}p{{margin:9px 0}}a{{color:#167969;text-underline-offset:3px;overflow-wrap:anywhere}}.eyebrow{{font-size:12px;letter-spacing:2px}}.notice{{border-left:5px solid #c38c37;background:#fff7e8}}.pass{{color:#12765f;font-weight:600}}.metrics{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}}.metric{{background:#eaf3ee;border-radius:9px;padding:18px}}.metric strong{{display:block;font-size:28px;color:#1c6151}}.links{{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}}.scroll{{max-width:100%;overflow:auto}}table{{border-collapse:collapse;width:100%;min-width:690px;font-size:14px}}th,td{{text-align:left;padding:11px;border-bottom:1px solid #dce6e2}}th{{background:#eaf1ee}}.hash{{font:12px/1.7 ui-monospace,monospace;overflow-wrap:anywhere}}.gallery{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}}figure{{margin:0}}img{{display:block;width:100%;height:auto;max-height:700px;object-fit:contain;border:1px solid #dce6e2;background:#f8faf9}}figcaption{{padding:8px 0;color:#526d72}}li{{margin:5px 0}}@media(max-width:680px){{main{{padding:14px 12px 40px}}header,section{{padding:19px}}h1{{font-size:24px}}.metrics{{grid-template-columns:repeat(2,minmax(0,1fr))}}.gallery{{grid-template-columns:1fr}}}}
</style><main>
<header><div class="eyebrow">FORM · BOQ & BBS · 12 OCTOBER 2026</div><h1>v0.16 · เลือกขอบเขต BOQ และชุดแบบได้ตรงกัน</h1><p>Member · Category · Zone · Floor · Summary ใช้ร่วมกันในงานปัจจุบันและ revision ที่ตรึงไว้</p></header>
<section class="notice"><h2>ผ่านส่วนที่ทดสอบ · ระบบเต็มยังไม่ผ่านตรวจรับ</h2><p>รอบนี้พัฒนาการเลือกและจัดกลุ่มชุดส่งงาน ตรวจยอดและไฟล์ที่ดาวน์โหลดจริง พร้อมกู้ข้อมูลหลังเปิดบริการใหม่ ผลนี้เป็นการตรวจซอฟต์แวร์ ยังต้องตรวจรับกฎวิศวกรรมและโครงการจริงก่อนออก BBS ใช้ก่อสร้าง Issued และการปล่อยตัด Production ยังถูกบล็อก</p></section>
<div class="metrics"><div class="metric"><strong>{total}</strong>กรณีซอฟต์แวร์ผ่าน</div><div class="metric"><strong>11 / 35</strong>PDF จริง / หน้าที่ render</div><div class="metric"><strong>5</strong>รูปแบบจัดกลุ่ม BOQ</div><div class="metric"><strong>7</strong>ชิ้นในชุด Frozen ตัวอย่าง</div></div>
<section><h2>ใช้งานเพิ่มได้ในรอบนี้</h2><ul><li>เลือกสมาชิก ประเภท Zone และชั้นร่วมกันใน BOQ และหน้าแบบส่งงาน พร้อมยอดรวมและน้ำหนักเหล็กแยกขนาด/เกรด</li><li>แยก “ทุกพื้นที่” กับ “ไม่ระบุ” และพื้นที่ที่มีชื่อจริง เช่น null / 0; Zone และชั้นต้องตรงตำแหน่งเดียวกัน</li><li>Excel เพิ่มชีต BOQ Summary ตามการจัดกลุ่ม มีตัวเลข สูตรรวม และขอบเขตที่เลือก ส่วนตำแหน่งคอลัมน์ BOQ/BBS เดิมยังใช้ได้</li><li>BOQ PDF ตรงกลุ่มที่เลือก; ชุด BBS + จุดชี้แบบต้นทาง A3/A1 และตาราง A4 มีหน้าระบุสมาชิก/ตำแหน่ง/จำนวนที่รวม</li><li>ประวัติส่งออกบันทึกขอบเขต กลุ่ม และจำนวนจริง Retry ใช้ snapshot เดิม Backup เก็บทั้งโครงการ และ Restore เก็บไฟล์ประวัติเดิมพร้อมขอบเขต</li></ul><div class="links"><a href="http://127.0.0.1:5173">เปิดแอปในเครื่อง</a><a href="../pdf/selected-zone-floor-BBS-source-draft.pdf">ดูตัวอย่างชุด Frozen A3</a><a href="downloads/frozen-category.xlsx">ดู Excel ตัวอย่าง</a><a href="../../docs/REQUIREMENTS_MATRIX.md">ข้อกำหนดทั้งหมด</a></div><p class="hash">PDF ตัวอย่าง SHA256: {sha}</p></section>
<section><h2>ตรวจว่าปริมาณไม่คูณซ้ำ และ revision ไม่เปลี่ยนตามงานใหม่</h2><div class="scroll"><table><thead><tr><th>ขอบเขตตัวอย่าง</th><th>องค์ประกอบจริง</th><th>คอนกรีต m³</th><th>ข้อสังเกต</th></tr></thead><tbody><tr><td>Frozen / Zone A / L1</td><td>7 = ฐาน 2 + คาน 4 + เสา 1</td><td>7.680</td><td>18 ชิ้นเหล็ก / 136.131 kg</td></tr><tr><td>Working / Zone A / L1 หลังแก้</td><td>25</td><td>62.880</td><td>จำนวนฐาน มิติ และ density เปลี่ยน</td></tr><tr><td>Frozen / ทุกโครงการ</td><td>34</td><td>52.320</td><td>ค่าต่อหน่วยและ cuts เดิม</td></tr><tr><td>Working / ทุกโครงการ</td><td>52</td><td>117.120</td><td>Backup เก็บครบ ไม่ติดตัวกรองหน้าจอ</td></tr></tbody></table></div><p>ค่าต่อสมาชิกจาก Frozen ใช้ค่าที่บันทึกเดิม เปลี่ยนเฉพาะจำนวน occurrence ที่เลือก ไม่คำนวณใหม่ด้วยสเป็คปัจจุบัน ปริมาณรวมของทั้งห้ากลุ่มสะสมจากฐานเดียวกัน เพื่อลดความต่างจากลำดับการบวกทศนิยม แถวกลุ่ม/สูตร Excel อาจมีความต่างระดับทศนิยมเครื่องเมื่อคำนวณใหม่ แต่แสดงสามตำแหน่งตรงกัน</p><p>fixture รอบนี้เป็นกล่องที่ตรวจปริมาตรอิสระและความยาวตัดที่กรอกเอง ใช้ legacy spec อย่างตั้งใจในโครงการทดสอบ ไม่เปลี่ยน startup BS preset ของโครงการจริง และไม่ใช่ takeoff ของแบบ GULF หรือการตรวจรับสูตร BS/ACI ตำแหน่งเหล็ก/จุดชี้ทั้งหมดเป็นข้อมูลทดสอบ UNVERIFIED</p></section>
<section><h2>หลักฐานทดสอบที่ผ่านล่าสุด</h2><div class="scroll"><table><thead><tr><th>ส่วนที่ตรวจ</th><th>กรณี</th><th>ผล</th><th>หลักฐาน</th></tr></thead><tbody>{rows}</tbody></table></div><p>รวม234 =174 Unit +24 Firebase +35 Browser +1 Built ไม่รวมการตรวจ PDF การตรวจรายงาน และ4กรณีหลังเปิดบริการใหม่ ไม่ใช่234ข้อกำหนดตรวจรับระบบเต็ม งานเดิมทั้งหกหมวด 2D/3D Excel/PDF Stock และ Backup/Restore ผ่านซ้ำ รวม source ownership / immutable Storage / rotated CropBox / JPEG EXIF / Mark edits / Frozen / Retry / ประวัติไฟล์</p><p>Build ผ่าน JavaScript แรกเข้ารวม{build['totalInitialJavaScriptBytes']:,} bytes ส่วน PDF/Excel/3D/source cover โหลดเมื่อใช้งาน ส่ง grouped BOQ และ selected-source A1 ครั้งแรกจาก Hosting emulator ได้จริง Dedicated older geometry/A4/large-project suites เป็นหลักฐานเก่าเว้นแต่ระบุ rerun รอบนี้ scoped A4 เป็นการทดสอบใหม่ Production Node22 ยังไม่ถูกตรวจ เครื่องนี้ใช้ Node24 และ functions dry-run แจ้ง EBADENGINE ตามที่บันทึกไว้</p></section>
<section><h2>PDF ที่ดาวน์โหลดจริง</h2><div class="scroll"><table><thead><tr><th>ไฟล์</th><th>หน้า / กระดาษ</th><th>ผล</th><th>SHA256 ย่อ</th></tr></thead><tbody>{pdfrows}</tbody></table></div><p>Renderครบ35หน้า ตรวจภาพรวมของทุก layout ที่ต่างกัน และตรวจหน้าเต็ม A3 cover/BBS/source/BOQ กับ A4 cover/schedule/appendix ไม่พบข้อความเกินกระดาษหรือทับตาราง ชุด selected-source มี8หน้า: cover1 + BBS3 + index1 + source3 หน้าปกระบุจำนวน2/4/1ตรงกับตารางและ legends</p><p>ไฟล์ Zone ที่ Restore มี SHA256 <span class="hash">{ui['restoredScopedHash']}</span> ตรงทุกไบต์กับไฟล์เดิม Retry Category และ Built Category/Source A1 มีข้อความและพิกเซลทุกหน้าตรงกับต้นฉบับที่ตรวจ แม้ metadata เวลาสร้าง PDF ใหม่ต่างกัน แบบเก่า v0.15 และ BS อ้างอิงยังไม่เปลี่ยน การตรวจ35หน้านี้ไม่รวมทุก PDF ที่ดาวน์โหลดจากชุด regression-source</p><p><a href="pdf-verification.json">ขอบเขตและผลตรวจ PDF</a> · <a href="scoped-source-A3-contact.png">ภาพทั้ง8หน้า A3</a> · <a href="scoped-schedule-A4-contact.png">ภาพทั้ง4หน้า A4</a></p></section>
<section><h2>ข้อมูลสำรองและผลหลังเปิดระบบใหม่</h2><p>Checkpoint <span class="hash">output/emulator-checkpoints/v0.16-verified-20261012</span> export exit0; Auth{counts['auth']} / Firestore{counts['firestore']} / Storage{counts['storage']}ไฟล์ ตรวจขนาดและ MD5 ครบ{checkpoint['verifiedStorageBlobs']:,}blobs เทียบชื่อ Storage เดิมกับ v0.15 ทั้ง{checkpoint['previousV15BlobBytesPreserved']:,}รายการแล้ว bytesไม่เปลี่ยน</p><p>เก็บข้อมูลเริ่มต้นเดิมไว้ที่ <span class="hash">output/emulator-checkpoints/pre-v16-default-data-20261012</span> แล้วคัดลอก checkpoint ตรวจSHA256ตรงครบ{default['fileCount']:,}ไฟล์ เปิดบริการใหม่และตรวจ4กรณี: Working52/มิติ/density/sourcebytes; Frozen34/cuts/digest; scopedZonehistory/PDFเดิม; RestoreDraft52/ไฟล์ที่ remap/ประวัติขอบเขต การตรวจนี้เป็นตัวแทนข้อมูล ไม่ใช่การเทียบฐานข้อมูลทั้งหมดหรือ Production disaster recovery acceptance</p><div class="links"><a href="checkpoint-cli.json">ผล export/restart</a><a href="checkpoint-verification.json">ตรวจ checkpoint</a><a href="default-data-verification.json">ตรวจข้อมูลเริ่มต้น</a><a href="final-reimport-results.json">ผลหลังเปิดใหม่</a><a href="lockfile-verification.json">dependencies</a></div></section>
<section><h2>ข้อผิดพลาดระหว่างพัฒนาและการแก้</h2><p>พบยอดทศนิยมต่างจากลำดับรวมแต่ละกลุ่ม จึงแก้ให้ TOTAL สะสมตามสมาชิกฐานเดียวกัน และเพิ่ม aria-label ให้ตัวเลือกขอบเขต/กระดาษใช้งานและทดสอบได้ชัดเจน ข้อผิดพลาด fixture excavation0, attachment key, project path, ZIP history entry และที่เก็บ importedHistory แก้ในตัวทดสอบตาม schemaจริง ไม่ลดตัวตรวจปริมาณหรือสิทธิ์</p><p>การตรวจหลัง restart ครั้งแรกเริ่มก่อน Authพร้อมจึง network-request-failed เก็บผลไว้แล้วรอ All emulators ready ก่อนทดสอบซ้ำ รอบสุดท้ายผ่าน4กรณี TypeScript ไม่มี A3ใน PaperSize enum ของ ExcelJS จึงใช้ค่า8ตาม READMEของ dependency และตรวจ actualXLSX print settingจริง รายการ failed attempts ต่อไปนี้เป็นหลักฐานเก่า ผลผ่านล่าสุดอยู่ในตารางข้างต้น</p><ul>{failures}</ul></section>
<section><h2>ภาพหลักฐานจากแอปและไฟล์จริง</h2><div class="gallery">{gallery}</div></section>
<section class="notice"><h2>งานสำคัญที่ยังเหลือ</h2><ul><li>ตรวจรับมาตรฐานและกฎโครงการ พร้อมกรณีอ้างอิงจริงจากผู้รับผิดชอบ เติม full outside/free bending dimensions, tolerance และ ACI</li><li>ปรับปรุง source revision/Mark reconciliation และตรวจงานโครงการจริงตั้งแต่รับแบบจนถึงชุดส่งเจ้าของงาน</li><li>รองรับ geometry/assemblies ที่เกินกล่องและ composite รวม production export workers และข้อมูลโครงการขนาดใหญ่</li><li>ทำ Issued และ production cutting หลัง validatorsตรวจรับแล้ว เตรียม cloud environment, Node22, App Check, monitoring และ backupจริง</li></ul><p>Frozen เก่าที่ไม่มีฐานคำนวณต่อสมาชิกจะปฏิเสธการแยก Zone/Floor พร้อมคำอธิบาย ประวัติเก่าที่ไม่บันทึกขอบเขตจะแสดงว่าไม่ได้บันทึก ไม่อนุมานเป็นทั้งโครงการ ชุดงานใหม่ยังถูกจำกัดขนาดและจำนวนหน้าตาม guardเดิม; หน้าปกเป็น Draft ยังต้องรับรองกรอบและเลขหน้าของชุดส่งงานจริง เป้าหมายระบบเต็มยังไม่เสร็จ <a href="summary.json">สรุปผลที่ตรวจสอบได้</a></p></section>
</main></html>'''
(out / 'DEVELOPMENT_REPORT.html').write_text(document, encoding='utf-8')

status = f'''# Implementation status — v0.16 / 2026-10-12

Shared strict Member/Category/Zone/Floor scope and Member/Category/Zone/Floor/Summary grouping implemented for Working and Frozen BOQ/delivery. Zone AND Floor match the same occurrence row; explicit unassigned values cannot collide with literal null/zero names. Frozen selections retain exact saved per-unit quantities, bars/cuts/weights/spec and revision digest, adjusting only occurrence quantity. Legacy Frozen area slicing without stored calculation basis is rejected. Member grouping keys by ID, canonical total accumulation is independent of grouping order. Heavy report rows paged50; Working still holds bounded full member data.

Grouped BOQ PDF, append-only XLSX BOQ Summary with cached numeric SUM/A3 settings, selected multi-member source/BBS A3/A1 and scoped A4 cover implemented. Original BOQ/BBS columns preserved. Snapshot/job summaries persist readable scope/group/physical count; filenames bind scope hash. Empty scopes and filtered Backup reject. Retry retains original filtered snapshot/name; complete project Backup and archived Restore retain original scope metadata and artifact bytes. Numerical engine IDs and supplied BS/default policy unchanged.

Fresh checks234 =174 Unit +24 Firebase +35 Browser +1 Built. Scope8API/11UI; source regression10API/11UI; baseline six categories6API/13UI. Selected11actual PDFs/35leaves render and visual review pass; regression-source downloaded PDFs not all part of this selected layout review. FrozenZoneA/L1 qty7/concrete7.68/18bars/rebar136.131 vs live after edits qty25/concrete62.88; fullWorking52/Frozen34. Synthetic independent box/manual-cut legacy-spec fixture is not GULF takeoff or BS/ACI approval. Restored scopedZone artifact byte-exact {ui['restoredScopedHash']}; Retry/built counterparts text/pixels identical, regenerated metadata times differ. Primary output/pdf/selected-zone-floor-BBS-source-draft.pdf SHA256 {sha}; previous v0.15 primary and supplied BS unchanged. Initial JS{build['totalInitialJavaScriptBytes']}bytes; heavy PDF/Excel/3D/source modules deferred. Node24 local; productionNode22 pending.

Checkpoint v0.16-verified-20261012 exit0; {checkpoint['verifiedStorageBlobs']}blob sizes/MD5 verified, previous2154canonical Storage objects unchanged. Previous default preserved; new .emulator-data matches{default['fileCount']}checkpoint files bySHA256. Normal-runtime restart passes4 representative working/Frozen/source/scoped-artifact/archived-Restore checks, separate from234; not whole-database parity or productionDR. Startup-too-early network error and archived-history test-lookup failure retained and resolved by waiting readiness/reading importedHistory. Other fixture/selector tests and floating-order product fix retained in initial-attempt. Root/functions offline dependency dry-runs pass, Node22 engine warning recorded; no new dependencies.

Evidence:output/scope-verification/DEVELOPMENT_REPORT.html. Full engineering/fabrication/ACI, approved real cases, arbitrary geometry/server workers/cloud and Issued remain pending. Draft scope cover does not establish approved titleblock/page-index conformity. Production cutting release stays blocked. Full project goal is incomplete.

'''
p = root / 'docs/IMPLEMENTATION_STATUS.md'
old = p.read_text(encoding='utf-8')
marker = '# Implementation status — v0.15'
pos = old.find(marker)
assert pos >= 0
p.write_text(status + old[pos:], encoding='utf-8')
print('PASS report/status written:', total, 'software scenarios;', len(pdf['results']), 'actual PDFs;35leaves')
