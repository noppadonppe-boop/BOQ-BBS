from pathlib import Path
import json,hashlib,base64
root=Path(__file__).resolve().parents[1];out=root/'output/context-openings-verification';checkpoint=root/'output/emulator-checkpoints/v0.36-context-openings-reviewed-final-20261012'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
metadata=read(checkpoint/'firebase-export-metadata.json');folder=checkpoint/metadata['storage']['path'];hashes={}
for p in (folder/'metadata').glob('*.json'):
    r=read(p);data=(folder/'blobs'/p.stem).read_bytes();assert len(data)==int(r['size']);assert base64.b64encode(hashlib.md5(data).digest()).decode()==r['md5Hash'];assert r['name'] not in hashes;hashes[r['name']]=hashlib.sha256(data).hexdigest()
old=root/'output/emulator-checkpoints/v0.35-context-reviewed-final-20261012';previous=old/read(old/'firebase-export-metadata.json')['storage']['path'];files=list((previous/'metadata').glob('*.json'));assert len(files)==3945
for p in files:
    r=read(p);assert hashes[r['name']]==hashlib.sha256((previous/'blobs'/p.stem).read_bytes()).hexdigest()
copy=read(out/'copy-import-results.json');assert copy['targetProject']=='demo-boq-v036' and not copy['sourceServicesRestarted'] and all(r['status']=='PASS' for r in copy['results'])
result={'status':'PASS','checkpoint':str(checkpoint),'storageBlobs':len(hashes),'allSizeMd5Verified':True,'previousV35BlobsSha256Preserved':len(files),'exportedServices':[s for s in ['auth','firestore','storage'] if s in metadata],'defaultFolderReplaced':False,'targetProject':'demo-boq-v036','sourceCheckpoint':copy['sourceCheckpoint'],'sourceCopyImportPerformed':True,'selectedWorkingAndFrozenReadbackVerified':True,'wholeFirestoreParityVerified':False,'originalServicesRestarted':False,'finalCheckpointReimportPerformed':False,'scope':'สำรองสำเนาทดสอบ demo-boq-v036 หลังชุดทดสอบและดาวน์โหลดสุดท้าย สำเนานี้นำ checkpoint ก่อนหน้าเข้ามาและอ่าน Working/Frozen ที่เลือกกลับได้ ตรวจ Storage ที่ส่งออกทุกไฟล์ ไม่อ้างข้อมูล Firestore เท่ากันทั้งฐาน การนำ checkpoint สุดท้ายกลับเข้าหรือการกู้คืน Production; ชุดเดิมไม่ถูกหยุดหรือเริ่มใหม่'}
(out/'checkpoint-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in result.items() if k!='scope'}))
