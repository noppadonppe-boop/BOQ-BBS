from pathlib import Path
import sys, json, hashlib, base64
root=Path(__file__).resolve().parents[1]
name=sys.argv[1] if len(sys.argv)>1 else 'v0.20-verified-20261012'
checkpoint=root/'output/emulator-checkpoints'/name
assert checkpoint.resolve().parent == (root/'output/emulator-checkpoints').resolve()
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
meta=read(checkpoint/'firebase-export-metadata.json')
counts={k:sum(p.is_file() for p in (checkpoint/meta[k]['path']).rglob('*')) for k in ['auth','firestore','storage']}
folder=checkpoint/meta['storage']['path'];hashes={}
for p in (folder/'metadata').glob('*.json'):
 j=read(p);data=(folder/'blobs'/p.stem).read_bytes();assert len(data)==int(j['size']);assert base64.b64encode(hashlib.md5(data).digest()).decode()==j['md5Hash'];assert j['name'] not in hashes;hashes[j['name']]=hashlib.sha256(data).hexdigest()
old=root/'output/emulator-checkpoints/v0.19-verified-20261012';prior=read(old/'firebase-export-metadata.json');old_folder=old/prior['storage']['path'];old_blobs=list((old_folder/'metadata').glob('*.json'))
for p in old_blobs:
 j=read(p);assert hashes[j['name']]==hashlib.sha256((old_folder/'blobs'/p.stem).read_bytes()).hexdigest(),j['name']
result={'status':'PASS','path':str(checkpoint),'fileCounts':counts,'verifiedStorageBlobs':len(hashes),'allBlobSizeAndMd5Match':True,'previousV19BlobBytesPreserved':len(old_blobs),'scope':'Canonical Storage object-name/byte parity with v0.19 only; new Firestore/Auth records are not whole-database parity or production DR acceptance.'}
output=root/'output/member-intake-verification'/('recovery-checkpoint-verification.json' if 'recovery' in name else 'checkpoint-verification.json')
output.write_text(json.dumps(result,indent=2),encoding='utf-8');print('PASS checkpoint',name,counts,'verified',len(hashes),'blobs;',len(old_blobs),'previous unchanged')


