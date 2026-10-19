from pathlib import Path
import json,hashlib,base64
root=Path(__file__).resolve().parents[1];out=root/'output/arc-verification';checkpoint=root/'output/emulator-checkpoints/v0.31-arc-final-20261012'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
metadata=read(checkpoint/'firebase-export-metadata.json');folder=checkpoint/metadata['storage']['path'];hashes={}
for p in (folder/'metadata').glob('*.json'):
    r=read(p);data=(folder/'blobs'/p.stem).read_bytes();assert len(data)==int(r['size']);assert base64.b64encode(hashlib.md5(data).digest()).decode()==r['md5Hash'];assert r['name'] not in hashes;hashes[r['name']]=hashlib.sha256(data).hexdigest()
old=root/'output/emulator-checkpoints/v0.30-semicircle-final-20261012b';previous=old/read(old/'firebase-export-metadata.json')['storage']['path'];files=list((previous/'metadata').glob('*.json'));assert len(files)==3748
for p in files:
    r=read(p);assert hashes[r['name']]==hashlib.sha256((previous/'blobs'/p.stem).read_bytes()).hexdigest()
result={'status':'PASS','checkpoint':str(checkpoint),'storageBlobs':len(hashes),'allSizeMd5Verified':True,'previousV30BlobsSha256Preserved':len(files),'exportedServices':list(metadata),'defaultFolderReplaced':False,'reimportPerformed':False,'scope':'Local exported Storage bytes only; no whole-database parity/reimport or production recovery claim'}
(out/'checkpoint-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
