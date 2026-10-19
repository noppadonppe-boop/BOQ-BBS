from pathlib import Path
import json,hashlib,base64
root=Path(__file__).resolve().parents[1];out=root/'output/source-verification';checkpoint=root/'output/emulator-checkpoints/v0.15-verified-20261012'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
meta=read(checkpoint/'firebase-export-metadata.json');counts={};blobs=0
for name in ['auth','firestore','storage']:
    paths=list((checkpoint/meta[name]['path']).rglob('*'));counts[name]=sum(p.is_file() for p in paths);assert counts[name]>0
folder=checkpoint/meta['storage']['path'];hashes={}
for p in (folder/'metadata').glob('*.json'):
    j=read(p);data=(folder/'blobs'/p.stem).read_bytes();assert len(data)==int(j['size']) and base64.b64encode(hashlib.md5(data).digest()).decode()==j['md5Hash'];blobs+=1;hashes[j['name']]=hashlib.sha256(data).hexdigest()
old=root/'output/emulator-checkpoints/v0.14-verified-20261012';old_meta=read(old/'firebase-export-metadata.json');old_folder=old/old_meta['storage']['path'];old_blobs=list((old_folder/'metadata').glob('*.json'))
for p in old_blobs:
    j=read(p);assert hashes[j['name']]==hashlib.sha256((old_folder/'blobs'/p.stem).read_bytes()).hexdigest(),j['name']
(out/'checkpoint-verification.json').write_text(json.dumps({'status':'PASS','path':str(checkpoint),'fileCounts':counts,'verifiedStorageBlobs':blobs,'allBlobSizeAndMd5Match':True,'previousV14BlobBytesPreserved':len(old_blobs),'scope':'Storage blobs only compared to previous checkpoint. Firestore/Auth exports contain new data; this is not whole-database parity or production DR acceptance.'},indent=2),encoding='utf-8')
print('PASS checkpoint',counts,'verified blobs',blobs,'previous blobs unchanged',len(old_blobs))
