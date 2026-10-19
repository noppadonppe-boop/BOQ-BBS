from pathlib import Path
import json,hashlib,base64
root=Path(__file__).resolve().parents[1];out=root/'output/fabrication-inspection-verification'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
checkpoint=root/'output/emulator-checkpoints/v0.37-inspection-reviewed-final-20261012-3'
metadata=read(checkpoint/'firebase-export-metadata.json');folder=checkpoint/metadata['storage']['path'];hashes={}
for p in (folder/'metadata').glob('*.json'):
    r=read(p);data=(folder/'blobs'/p.stem).read_bytes()
    assert len(data)==int(r['size']) and base64.b64encode(hashlib.md5(data).digest()).decode()==r['md5Hash']
    assert r['name'] not in hashes;hashes[r['name']]=hashlib.sha256(data).hexdigest()
previous=root/'output/emulator-checkpoints/v0.36-context-openings-reviewed-final-20261012'
previous=previous/read(previous/'firebase-export-metadata.json')['storage']['path']
files=list((previous/'metadata').glob('*.json'));assert len(files)==3983
for p in files:
    r=read(p);assert hashes[r['name']]==hashlib.sha256((previous/'blobs'/p.stem).read_bytes()).hexdigest()
for service in ['auth','firestore','storage']:
    assert service in metadata and (checkpoint/metadata[service]['path']).is_dir()
assert (checkpoint/metadata['firestore']['path']/metadata['firestore']['metadata_file'].split('/')[-1]).is_file()
copy=read(root/'output/context-openings-verification/copy-import-results.json')
assert copy['targetProject']=='demo-boq-v036' and not copy['sourceServicesRestarted']
command=read(out/'checkpoint-command-result.json');assert command['exitCode']!=0 and command['localOnly'] and not command['rulesDeployed']
result={'status':'PASS_FOR_EXPORTED_STORAGE_ONLY','checkpoint':str(checkpoint),'storageBlobs':len(hashes),'allSizeMd5Verified':True,
 'previousV36BlobsSha256Preserved':len(files),'exportedServices':['auth','firestore','storage'],
 'targetProject':'demo-boq-v036','originalServicesRestarted':False,'defaultFolderReplaced':False,
 'sourceCopyImportPerformed':True,'selectedWorkingAndFrozenReadbackVerified':True,
 'wholeFirestoreParityVerified':False,'finalCheckpointReimportPerformed':False,
 'exportCommandExitCode':command['exitCode'],'exportCommandPassed':False,
 'exportCompletionLoggedBeforeExitFailure':True,'firestoreExportContentsVerified':False,
 'scope':'Local isolated QA export after final PDF jobs, before subsequent Excel row-height/replay jobs. CLI logged Export complete then failed at shutdown in both final attempts; both copies/logs retained. Only exported Storage size/MD5/SHA and service metadata/file presence are verified. Earlier selected Working/Frozen readback and actual ZIP restore are separate evidence. Not latest whole-project backup; no complete final checkpoint, whole-Firestore parity, final-checkpoint reimport or production recovery claim.'}
(out/'checkpoint-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='scope'}))
