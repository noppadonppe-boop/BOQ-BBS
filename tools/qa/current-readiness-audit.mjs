import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Read existing acceptance evidence. Do not initialize Firebase or run deployment.
const root = process.cwd();
const evidenceDir = 'output/component-quantity-verification';
const out = 'output/current-readiness-audit';
const read = relative => fs.readFile(path.join(root, relative), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const unit = await read(`${evidenceDir}/unit-tests.log`);
const tests = Number(unit.match(/Tests\s+(\d+) passed/)?.[1]);
const files = Number(unit.match(/Test Files\s+(\d+) passed/)?.[1]);
assert.equal(pkg.version, '0.101.0', 'Re-audit the evidence when the application version changes');
assert.equal(tests, 1685);
assert.equal(files, 122);
const evidence = {};
for (const name of ['app', 'lifecycle', 'compiled', 'artifact', 'excel', 'pdf', 'restore', 'report']) {
  const result = JSON.parse(await read(`${evidenceDir}/${name}-results.json`));
  assert.equal(result.status, 'PASS', name);
  evidence[name] = result.status;
}
const protectedRows = [];
for (const name of ['protected-config', 'reference-checksums']) {
  const rows = JSON.parse(await read(`output/area-change-verification/${name}.json`));
  assert.ok(rows.every(row => row.unchanged === true && row.actualSha256 === row.sha256));
  protectedRows.push(...rows);
}
const scope = [
  ['หลายโครงการ / สิทธิ์ผู้ใช้', 'มีระบบแยกโครงการและบทบาท พร้อมทดสอบบัญชีและขอบเขตข้อมูลใน QA', 'ตรวจสิทธิ์และการทำงานพร้อมกันกับ Rules ที่เจ้าของกำหนดในสภาพแวดล้อมจริง'],
  ['ข้อมูลโครงการ', 'มีสร้าง/แก้ไขรหัส ชื่อ ตำแหน่ง เจ้าของ และข้อมูลเพิ่มเติม', 'ตรวจการใช้งานจริงและความเข้ากันได้ของข้อมูล'],
  ['General Spec', 'มีข้อมูลมาตรฐานและแบบอ้างอิง ใช้ BS 8666 ที่แนบเป็นค่าเริ่มต้นตามขอบเขตที่รองรับ', 'กำหนดปีฉบับ ACI และรายละเอียด/วัสดุที่ผู้รับผิดชอบรับรอง'],
  ['Foundation', 'มีมิติ จำนวน งานดิน คอนกรีต แบบหล่อ เหล็กจาก BBS และมุมมอง 3D', 'ตรวจกรณีฐานรากจริงและขอบเขตการวัดอิสระ'],
  ['Beam / Column / Slab / Wall / Custom', 'มีเครื่องมือสมาชิกทั้งห้าประเภท และหลักฐานทดสอบเรขาคณิตหลายรูปแบบ', 'ตรวจสมาชิกจริงครบทุกประเภทและประสิทธิภาพตามขนาดโครงการ'],
  ['BBS และตำแหน่ง Mark', 'มีตำแหน่งเหล็ก มุมมอง/รูปตัด เครื่องมือชี้ Mark และเชื่อมหน้าแบบอ้างอิง', 'สร้างและตรวจตำแหน่งเหล็ก GULF จริงครบชุด ตัวอย่าง C1 ยังไม่ได้เป็น BBS ก่อสร้าง'],
  ['BS 8666 / ACI 318', 'มีสูตร BS ที่รองรับและการตรวจเงื่อนไขก่อนออกงาน', 'รับรองกรณีวิศวกรรม วัสดุ รัศมี การปิดปลาย 33/51 ระยะทาบ/ยึดเหนี่ยว/หุ้ม/เรียงเหล็ก'],
  ['BOQ สมาชิก / หมวด / รวม', 'มีรายงานและการแยกปริมาณที่ตรวจ input แล้วกับรายการรอตรวจ', 'ตรวจปริมาณและราคาประมูล/ก่อสร้างอิสระ ข้อมูล C1 ยืนยัน input เฉพาะจำนวนและคอนกรีต'],
  ['Zone / Floor', 'มีตำแหน่งสมาชิกและตัวกรองจาก occurrence เดียวกัน', 'ตรวจชุดข้อมูลตำแหน่งจริง การใช้งานจำนวนมากและการแก้ไขพร้อมกัน'],
  ['Excel / PDF', 'มีไฟล์ส่งออกจากแอป ลงทะเบียนไฟล์และตรวจ SHA รวมถึง Backup/Restore ใน QA', 'ตรวจไฟล์โครงการจริงและการพิมพ์ในเครื่องใช้งานจริง'],
  ['Drawing A3 / A1', 'มีกรอบชื่อแบบ เลขหน้า และรูปแบบ BBS พร้อมหลักฐาน render เฉพาะชุดที่ทดสอบ', 'ให้เจ้าของงานตรวจรับรูปแบบ และทดสอบ Issued จริงภายใต้นโยบายที่เจ้าของกำหนด'],
  ['ตัดเหล็ก / Stock / เศษเหล็ก', 'มี optimizer สต็อก รายการเคลื่อนไหว และทดสอบ reserve/cancel ใน QA', 'ตรวจ Issued/Consumed จริง การบังคับสิทธิ์ฝั่งบริการ และยอดสต็อกหน้างาน'],
];
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BOQ/BBS — สถานะตรวจรับและขอบเขตการส่งมอบ</title><style>
body{margin:0;background:#eef2f6;color:#172738;font:16px/1.7 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:28px}article{background:white;border:1px solid #dbe3eb;border-radius:12px;padding:24px;margin:20px 0}h1{font-size:28px;line-height:1.4}h2{font-size:21px}a{color:#075c9e}strong{color:#123c60}.notice{border-left:5px solid #bd7100;background:#fff7e9;padding:16px}.table-wrap{overflow:auto}table{border-collapse:collapse;min-width:760px;width:100%}th,td{text-align:left;vertical-align:top;padding:12px;border:1px solid #dbe3eb}th{background:#edf3f8}td:first-child{width:23%}.muted{color:#536779}li{margin:8px 0}@media(max-width:650px){main{padding:12px}article{padding:16px}h1{font-size:23px}}</style><main>
<h1>BOQ/BBS — สถานะตรวจรับและขอบเขตการส่งมอบ</h1><p class="muted">ตรวจเอกสารและหลักฐานเดิมวันที่ 14 ตุลาคม 2026 · แอป ${esc(pkg.version)} · ไม่มีการเปลี่ยนรุ่นหรือรันชุดทดสอบแอปใหม่ในรอบสรุปนี้</p>
<article><h2>คุณเป็นผู้กำหนดและ deploy Rules</h2><p>คำตอบล่าสุดของคุณไม่อนุญาตให้เอเจนต์ deploy Firestore/Storage Rules รอบนี้จึงไม่แก้หรือ deploy Rules, .env, Firebase configuration หรือ Auth และไม่มีการติดต่อ Production หรือเพิ่ม Cloud Functions</p><p>ตรวจ checksum ใหม่ผ่าน: ไฟล์คุ้มครองและแบบอ้างอิง ${protectedRows.length} รายการยังตรงกับ baseline หลักฐานการทดสอบสิทธิ์ในเครื่องไม่ใช่ผลตรวจ Rules ที่คุณ deploy จริง</p></article>
<article><h2>มีหลักฐานทดสอบในเครื่อง แต่ยังไม่ผ่านการตรวจรับระบบเต็ม</h2><p>หลักฐานแอปรุ่นล่าสุดระบุ ${tests} กรณี / ${files} ไฟล์ผ่าน พร้อม TypeScript/build และ UI/ไฟล์ส่งออก/Backup/Restore เฉพาะชุดที่ทดสอบ <a href="../component-quantity-verification/DEVELOPMENT_REPORT.html">เปิดหลักฐานรุ่นปัจจุบัน</a></p><p>ตัวอย่าง C1 สี่แบบมีจำนวนรวม 78 และคอนกรีต 252.252 m³ ที่ตรวจ input แล้ว รายการแบบหล่อ งานดิน และเหล็กยังถูกพัก ผลนี้ไม่ใช่การรับรองปริมาณทั้งโครงการหรือแบบ BBS ใช้ก่อสร้าง</p><p class="notice">ยังไม่พร้อมออก BBS สำหรับก่อสร้าง: ต้องตรวจวิศวกรรม แบบและตำแหน่งเหล็กจริง การรับงานเจ้าของ และการทำงาน Production รวมถึง Issued/Consumed ภายใต้นโยบายสิทธิ์ที่เจ้าของกำหนด</p></article>
<article><h2>ข้อกำหนดเดิมครบ 12 ข้อ</h2><div class="table-wrap"><table><thead><tr><th>ข้อกำหนด</th><th>มีหลักฐานในเครื่อง</th><th>ยังต้องตรวจรับ</th></tr></thead><tbody>${scope.map((row, i) => `<tr><td>${i + 1}. ${esc(row[0])}</td><td>${esc(row[1])}</td><td>${esc(row[2])}</td></tr>`).join('')}</tbody></table></div><p><a href="../../docs/REQUIREMENTS_MATRIX.md">ตารางข้อกำหนดและหลักฐานรายหัวข้อ</a> · <a href="../../docs/AUTHENTICATION_SETUP.md">โครงสร้างบัญชีและขอบเขตสิทธิ์</a></p></article>
<article><h2>งานที่เหลือและผู้รับผิดชอบ</h2><ul><li><strong>งานซอฟต์แวร์ยังทำต่อได้:</strong>แก้ปัญหา RPC/capture ของ QA เดิม และตรวจประสิทธิภาพ/การแก้ไขพร้อมกันตามขนาดโครงการ ไม่ถือว่าชุด QA แยกที่ผ่านได้ซ่อมชุดเดิมแล้ว</li><li><strong>เจ้าของระบบ:</strong>กำหนดและ deploy Rules เอง จากนั้นจึงทดสอบกับ environment ที่เจ้าของอนุญาต ไม่มีการขอหรือใช้สิทธิ์ deploy แทน</li><li><strong>ผู้รับผิดชอบวิศวกรรม:</strong>ระบุปีฉบับ ACI ผู้ตรวจ และรายละเอียดปิดปลาย 33/51 ที่รับรอง รวมถึงวัสดุ/ระยะ/ตำแหน่งเหล็กจริง คำถามข้อมูลเหล่านี้ยังไม่มีคำตอบ จึงไม่เลือกหรือรับรองแทน</li><li><strong>เจ้าของงาน/ทีมโครงการ:</strong>ตรวจชุดนำร่องจริงครบประเภท ปริมาณ BBS และรูปแบบ Drawing ก่อนใช้หน้างาน</li></ul><p>Backup/Restore ที่ผ่านใน QA มีขอบเขตตามรายงาน ไม่ใช่การรับรองกู้คืน Production ทั้งระบบ ผลทดสอบเดิมไม่ถูกตีความเป็นการอนุมัติวิศวกรรมหรือการส่งงานจริง</p></article>
</main></html>`;
await fs.mkdir(path.join(root, out), {recursive: true});
await fs.writeFile(path.join(root, out, 'OWNER_HANDOVER.html'), html);
for (const match of html.matchAll(/href="([^"#]+)"/g)) {
  await fs.access(path.resolve(root, out, match[1]));
}
const result = {status: 'PASS', appVersion: pkg.version, evidenceReadOnly: evidence, previousUnitEvidence: {tests, files}, protectedFilesRechecked: protectedRows.length, requirements: scope.length, localLinksExist: true, rulesChanged: false, deployments: false, productionRequests: false, fullAcceptance: false};
await fs.writeFile(path.join(root, out, 'audit-results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
