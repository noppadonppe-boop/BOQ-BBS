from pathlib import Path
import json,hashlib,html,re
root=Path(__file__).resolve().parents[1];out=root/'output/beam-assembly-verification'
read=lambda name:json.loads((out/name).read_text(encoding='utf-8-sig'))
unit=read('unit-results.json');assert unit['success'] and unit['numPassedTests']==440 and unit['numFailedTests']==0
groups=['api-results.json','export-final-results.json','cutting-results.json','3d-results.json','ui-results.json','built-results.json'];counts={}
for name in groups:
    r=read(name);assert not r.get('errors') and not r.get('cloud');assert all(x['status']=='PASS' for x in r['results']);counts[name]=len(r['results'])
total=440+sum(counts.values());assert total==462
for name in ['demo-build.log','production-build.log']:assert 'built in' in (out/name).read_text(encoding='utf-8-sig')
comparison=read('config-comparison.json')
for name,data in comparison.items():assert data['baselineSha256']==data['finalSha256']==hashlib.sha256((root/name).read_bytes()).hexdigest(),name
checkpoint=read('checkpoint-verification.json');assert checkpoint['status']=='PASS' and checkpoint['previousV33BlobsSha256Preserved']==3851
pdf=read('pdf-results.json');assert pdf['renderedPages']==21 and all(r['status']=='PASS' for r in pdf['results'])
excel=read('render-results.json');assert excel['status']=='PASS' and excel['views']==4
ctx=read('context.json');assert ctx['expectedCuts']==[3925,4925,3425,12425]
for a in ctx['artifacts']+ctx.get('previousArtifacts',[]):
    data=(out/a['local']).read_bytes();assert len(data)==a['size'] and hashlib.sha256(data).hexdigest()==a['sha256']
previous=json.loads((root/'output/link-verification/context.json').read_text(encoding='utf-8'));preserved=[]
for a in previous['artifacts']+previous.get('previousArtifacts',[]):
    data=(root/'output/link-verification'/a['local']).read_bytes();assert len(data)==a['size'] and hashlib.sha256(data).hexdigest()==a['sha256'];preserved.append(a)
backup=out/'BEAM-backup.zip';source=root/'Referrence/BS 8666.pdf';source_sha=hashlib.sha256(source.read_bytes()).hexdigest();assert source_sha=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
summary={'version':'0.34.0','status':'PASS for tested software scope only','softwareScenarios':total,'unitTests':440,'testGroups':counts,'pdfPages':21,'workbookViews':4,'fullSystemAcceptance':False,'engineeringAccepted':False,'productionAccepted':False,'rulesDeployment':'User managed; explicitly declined','rulesFilesEditedByThisIncrement':False,'cloudChangesByThisIncrement':False,'configurationComparison':comparison,'checkpoint':checkpoint,'checkpointScope':'Storage bytes and retained prior bytes checked; checkpoint preceded final responsive UI replay; no latest whole-database parity or reimport claim','currentExportArtifacts':ctx['artifacts'],'preservedPreviousArtifacts':ctx.get('previousArtifacts',[]),'preservedV33Artifacts':preserved,'backupSha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'backupScope':'Actual pre-wizard/pre-cutting/pre-final-XLSX project backup and tested restore; not latest whole-project state','sourceEdition':'Supplied BS8666:2000 + Amendments1/2 unchanged','sourceSha256':source_sha,'enginePolicy':'Existing geometry-2.2+bs8666-2000-v7 unchanged','FrozenPieces':21,'FrozenCutLengthMm':110925,'WorkingPieces':21,'workingCutLengthMm':116925,'FrozenWeightKg':ctx['expectedWeight'],'FrozenConcreteTotalM3':8.4,'FrozenFormTotalM2':65.7,'nativeExcelPrintingVerified':False,'issuedEnabled':False,'productionStockConsumption':False}
(out/'verification-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
esc=lambda v:html.escape(str(v));link=lambda p,label:f'<a href="{esc(p)}">{esc(label)}</a>'
css=re.search(r'<style>(.*?)</style>',(root/'output/link-verification/DEVELOPMENT_REPORT.html').read_text(encoding='utf-8'),re.S).group(1)
gallery=[('built-builder.png','หน้าจอจริง: กรอกช่วงคานและระดับจากแบบ'),('built-summary.png','หน้าจอจริง: ช่วงคานสามช่วงและผิวต่างระดับ'),('built-primary-3d.png','แอป build: คาน Working จริง / X/Y/Z ซูมและหมุน'),('built-mobile.png','แอป build: รูปคานและตารางบนมือถือ'),('excel-spans.png','Excel จริง: ข้อมูลแต่ละช่วง / A3:I6'),('excel-form.png','Excel จริง: ผิวข้าง/ต่างระดับ/หัวท้าย / J3:P6'),('excel-check.png','Excel จริง: ปริมาณ Gross เทียบ Frozen Net'),('excel-bbs.png','Excel จริง: Frozen BBS 21 ชิ้น'),('pdf-A3-contact.png','PDF จริง: A3 / 8 หน้า'),('pdf-A1-contact.png','PDF จริง: A1 / 7 หน้า'),('pdf-A4-contact.png','PDF จริง: A4 / 6 หน้า')]
images=''.join(f'<figure><a href="{esc(p)}"><img src="{esc(p)}" alt="{esc(t)}" loading="lazy"></a><figcaption>{esc(t)}</figcaption></figure>' for p,t in gallery)
testrows=''.join(f'<tr><td>{esc(n)}</td><td>{v}</td><td>PASS</td></tr>' for n,v in {'Unit regression':440,**counts}.items())
artifactrows=''.join(f'<tr><td>{link(a["local"],a["local"])}</td><td>{a["size"]:,}</td><td><code>{a["sha256"]}</code></td></tr>' for a in ctx['artifacts'])
priorlinks=' · '.join(link(a['local'],a['local']) for a in ctx.get('previousArtifacts',[]))
evidence=' · '.join(link(n,n) for n in ['verification-summary.json','unit-results.json',*groups,'pdf-results.json','render-results.json','checkpoint-verification.json','config-comparison.json'])
page=f'''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FORM v0.34 — continuous beam verification</title><style>{css}</style>
<main><p class="tag">FORM BOQ &amp; BBS · DEVELOPMENT v0.34 · 2026-10-12</p><h1>คานต่อเนื่องหลายช่วง<br>รูปทรงจริง ปริมาณ และชุดส่งออก</h1>
<div class="notice"><b>ผ่านเฉพาะซอฟต์แวร์ที่ทดสอบ — ยังไม่ผ่านการตรวจรับระบบเต็ม</b><br>หลักฐานนี้ใช้โครงการสมมติและ Firebase Emulator ในเครื่อง ยังต้องรับรองกฎ BS/ACI และตรวจแบบ/วิธีวัดกับผู้รับผิดชอบก่อนใช้ก่อสร้าง ผู้ใช้จัดการ Rules/deploy เอง งานนี้ไม่แก้ Rules, .env หรือ Auth infrastructure และไม่ deploy Cloud</div>
<div class="cards"><div class="card"><strong>{total}</strong>กรณีซอฟต์แวร์ PASS</div><div class="card"><strong>21</strong>หน้า PDF จริง</div><div class="card"><strong>4</strong>ช่วงตาราง Excel ตรวจสูตร/ภาพ</div><div class="card"><strong>7/7</strong>ไฟล์ตั้งค่าเดิม</div></div>
<h2>ใช้งานเพิ่มได้</h2><p>เปิดสมาชิกประเภทคาน แล้วเลือก “คานต่อเนื่องหลายช่วง” กรอกชื่อช่วง/Grid ความยาวคอนกรีต กว้าง ลึก และระดับท้องคาน Z ตามแบบ รองรับ1–12ช่วงในแนว X หรือ Y ที่มีศูนย์กลางเดียวกัน และหน้าตัดร่วมที่รอยต่อ ใช้ชิ้นส่วนจริงของระบบเดิมเพื่อคำนวณคอนกรีต/แบบหล่อและแสดงแปลน รูปตัด และ3D</p>
<p>หน้าตัดและท้องคานต่างกันได้ ผิวต่างระดับที่รอยต่อคิดแบบหล่อ ส่วนหน้าตัดร่วมภายในไม่คิดซ้ำ คงช่องเปิด รายการหัก Zone/ชั้น และ Mark ไว้ เมื่อเปลี่ยนช่วงคานจะกลับ Draft และล้างการยืนยันมิติ/ตำแหน่งเหล็ก การลบช่วงที่มี Mark อ้างอิงแสดงข้อผิดพลาดให้ซ่อมก่อนบันทึก การแก้ชิ้นส่วนโดยตรงปลดข้อมูลช่วงคานและเก็บรูปทรงที่แก้จริง</p>
<p>แก้จังหวะซิงก์ข้อมูลรุ่นเก่าหลังบันทึกด้วย หน้าจอไม่ย้อนค่าทับรุ่นที่เพิ่งบันทึก ส่วนข้อมูลใหม่จากการซิงก์ยังรับได้เมื่อไม่มีการแก้ค้าง</p>
<h2>ตัวอย่างตรวจอิสระ</h2><div class="detail"><p>Frozen: ช่วง4000×300×600 /5000×400×800 /3500×250×600mm ท้องคาน0/0/100mm ได้คอนกรีต Gross2.845m³ แบบหล่อ Gross21.715m²/ชิ้น รวมผิวต่างระดับ0.310m² ช่องเปิด0.010m³ เพิ่มผิวแบบ0.340m² และรายการหัก0.035m³/0.155m² จึงได้ Net2.800m³/21.900m²ต่อชิ้น จำนวนจริง3ชิ้นรวม8.400m³/65.700m²</p>
<p>BBS Frozen: ตัด3925/4925/3425/12425mm รวม21ชิ้น/110925mm น้ำหนัก{ctx['expectedWeight']:.3f}kg เลือกZone A จำนวน2ชิ้นรวม5.600m³โดยไม่คูณซ้ำ Working เปลี่ยนช่วงที่สองเป็น6000mm: Net3.120m³ต่อชิ้น เหล็กเป้าหมายช่วงสองตัด5925mm และแผน Worker ใช้21ชิ้น/116925mm รายการ Frozen/ไฟล์เก่ายังเหมือนเดิม</p></div>
<h2>Excel และ Drawing</h2><p>Excel เพิ่ม Beam Spans และ Beam Check สถานีช่วงต่อกันด้วยสูตร ผิวรอยต่อใช้หน้าตัดต่างกันหักส่วนร่วม ปริมาณ Net เชื่อมกับ BOQ ที่จับไว้ใน Frozen แก้ความยาวในชีทเปรียบเทียบแล้วสูตร Gross/สถานีถัดไปเปลี่ยน โดยไม่เปลี่ยน Net BOQ หรือ BBS Frozen ตรวจสูตรส่งผ่านเมื่อเปลี่ยนค่า Net ใน BOQ แล้ว และตรวจZone Aแยกด้วย</p>
<p>A3/A1/A4 เป็นไฟล์ที่ระบบสร้างจากข้อมูล Frozen จริง รวม21หน้า ได้ render และตรวจขนาดกระดาษ/ขอบข้อความ/Mark/ค่าตัด ภาพด้านล่างแสดงชุดที่ตรวจ ตารางหลักฐานนี้ไม่รับรองการผลิตรายละเอียด Continuous/Anchorage/Lap หรือแบบ Owner</p>
<h2>หลักฐานหน้าจอและไฟล์จริง</h2><div class="gallery">{images}</div>
<h2>ผลทดสอบ</h2><div class="scroll"><table><thead><tr><th>ชุดตรวจ</th><th>จำนวน</th><th>ผล</th></tr></thead><tbody>{testrows}</tbody></table></div>
<p>ทดสอบ保存/โหลด/สิทธิ์ผ่าน Web SDK จริง ผู้ใช้viewerอ่านช่วงคานได้แต่เขียนไม่ได้ โครงการอื่นถูกปฏิเสธ รูป3Dจริงเปลี่ยนตามX/Y/Z/ISO ซูมและลากหมุน โดยไม่แก้ข้อมูลสมาชิก ปิด Issued/production consumeไว้ ไม่มี Cloud Functions หรือ API server เสริม</p>
<h2>ดาวน์โหลดชุดที่ตรวจ</h2><div class="scroll"><table><thead><tr><th>ไฟล์</th><th>Bytes</th><th>SHA256</th></tr></thead><tbody>{artifactrows}</tbody></table></div><p>{link('BEAM-backup.zip','Backup ZIP ที่ทดลอง Restore จริง')} · {link('../../docs/BEAM_ASSEMBLY.md','คู่มือและขอบเขตคานต่อเนื่อง')} · {link('../link-verification/DEVELOPMENT_REPORT.html','หลักฐาน v0.33 เดิม')}</p><p class="muted">Excelก่อนปรับสูตรสถานีถัดไปยังเก็บแยกตามjob-IDและตรวจhash: {priorlinks} · ไฟล์ v0.33เดิมทั้ง{len(preserved)}รายการยังตรงhashเดิม</p>
<h2>การเก็บข้อมูลและขอบเขตตรวจ</h2><p>ZIPเป็นข้อมูลก่อนสร้างwizard/ทดสอบcutting/ส่งExcelรอบสุดท้าย ไม่ใช่Backupล่าสุดทั้งโครงการ Restoreเก็บข้อมูลช่วงคาน ช่องเปิด และFrozenเดิมเป็นประวัติอ้างอิง ไม่เปิดIssuedหรือให้สิทธิ์จากโครงการต้นทาง Checkpointในเครื่องเก็บAuth/Firestore/Storage ตรวจStorageทุก{checkpoint['storageBlobs']:,}blobด้วยขนาดและMD5 พร้อมยืนยันSHA256ของ{checkpoint['previousV33BlobsSha256Preserved']:,}blobจากv0.33เดิม การส่งออกcheckpointเกิดก่อนทดสอบUI responsiveรอบสุดท้าย ไม่ได้อ้างว่าได้ตรวจเทียบฐานข้อมูลทั้งหมดหรือทดลองreimport/กู้Production</p>
<h2>งานที่ยังต้องทำก่อนใช้ส่งก่อสร้าง</h2><p>ยังต้องรองรับCode33 รายละเอียดปิดปลาย51จริง กฎBS/ACIครบตามฉบับที่โครงการอนุมัติ กรณีตรวจอิสระของวิศวกร Cumulative tolerance แบบGULF/Ownerจริง รูปทรง/องค์ประกอบนอกกล่องแกนและคานหักแนว/เอียง/โค้ง การพิมพ์ผ่านMicrosoft Excelจริง และตรวจProductionกับRulesของผู้ใช้ ค่าที่กรอกในตัวอย่างไม่ใช่รายละเอียดวิศวกรรมที่รับรองแล้ว มาตรฐานขั้นต่ำยังเป็นBS8666:2000ที่ผู้ใช้ให้มา ไม่ใช่การรับรองฉบับล่าสุดหรือความครบถ้วนของBS/ACI</p>
<p class="muted">หลักฐานดิบ: {evidence}</p></main></html>'''
page=page.replace('ทดสอบ保存/โหลด','ทดสอบบันทึก/โหลด')
(out/'DEVELOPMENT_REPORT.html').write_text(page,encoding='utf-8')
print('PASS: v0.34 report from462 software scenarios,21 PDF pages and4 workbook views')
