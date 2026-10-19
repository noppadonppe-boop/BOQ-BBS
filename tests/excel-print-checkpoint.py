from pathlib import Path
import json,hashlib,base64
root=Path(__file__).resolve().parents[1]
out=root/'output/excel-print-verification'
checkpoint=root/'output/emulator-checkpoints/v0.27-excel-print-final-20261012'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
meta=read(checkpoint/'firebase-export-metadata.json')
folder=checkpoint/meta['storage']['path']
hashes={}
for p in (folder/'metadata').glob('*.json'):
    record=read(p);data=(folder/'blobs'/p.stem).read_bytes()
    assert len(data)==int(record['size'])
    assert base64.b64encode(hashlib.md5(data).digest()).decode()==record['md5Hash']
    assert record['name'] not in hashes
    hashes[record['name']]=hashlib.sha256(data).hexdigest()
old=root/'output/emulator-checkpoints/v0.26-direct-sdk-verified-20261012'
old_folder=old/read(old/'firebase-export-metadata.json')['storage']['path']
previous=list((old_folder/'metadata').glob('*.json'))
assert len(previous)==3551
for p in previous:
    record=read(p)
    assert hashes[record['name']]==hashlib.sha256((old_folder/'blobs'/p.stem).read_bytes()).hexdigest()
result={'status':'PASS','checkpoint':str(checkpoint),'fileCounts':{k:sum(p.is_file() for p in (checkpoint/meta[k]['path']).rglob('*')) for k in ['auth','firestore','storage']},'storageBlobs':len(hashes),'allSizeMd5Verified':True,'previousV26BlobsSha256Preserved':len(previous),'defaultFolderReplaced':False,'reimportPerformed':False,'scope':'Local export byte verification only; no new whole-database parity/reimport/production recovery claim.'}
(out/'checkpoint-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('PASS checkpoint:',len(hashes),'blobs;',len(previous),'prior objects unchanged')
