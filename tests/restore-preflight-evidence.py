from pathlib import Path
import json, hashlib, base64, zipfile

root=Path(__file__).resolve().parents[1]
out=root/'output/restore-preflight-verification'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
write=lambda name,value:(out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
baseline=read(out/'config-baseline.json')
protected={p:sha(root/p) for p in baseline}
assert protected==baseline
write('config-verification.json',{'status':'PASS','unchangedProtectedFiles':len(protected),'sha256':protected,'rulesEdited':False,'rulesDeployed':False,'cloudFunctionsRestored':False,'cloudDeployed':False})

ctx=read(out/'context.json')
def verify(folder,artifacts):
    for a in artifacts:
        p=folder/a['local']
        assert p.stat().st_size==a['size'] and sha(p)==a['sha256'],str(p)
verify(out,ctx['artifacts'])
assert len(ctx['artifacts'])==3
for folder in ['initial-scope-attempt','permission-code-attempt']:
    verify(out/folder,read(out/folder/'context.json')['artifacts'])
previous=root/'output/fabrication-inspection-verification'
previous_artifacts=read(previous/'artifact-verification.json')['artifacts']
verify(previous,previous_artifacts)
assert len(previous_artifacts)==7
assert {(a['local'],a['size'],a['sha256']) for a in ctx['currentArtifactsPreserved']}=={(a['local'],a['size'],a['sha256']) for a in previous_artifacts}
v36=root/'output/context-openings-verification'
verify(v36,read(v36/'artifact-verification.json')['artifacts'])
assert sha(root/'Referrence/BS 8666.pdf')=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
gulf=root/'Referrence/ตัวอย่าง BBS/GULF-ISB-CU-FL10600-2C1-100.pdf'
assert sha(gulf)==ctx['sourceFileSha256']==ctx['sourceRestoredSha256']
assert ctx['workingPreview']['counts']['members']==6 and ctx['workingPreview']['counts']['measurements']==35
assert sum(m['measurements'] for m in ctx['restoredWorking'])==35
assert ctx['sourcePreview']['counts']['members']==1 and ctx['sourcePreview']['counts']['marks']==0
assert ctx['sourcePreview']['files'][0]['pages']==1
write('artifact-verification.json',{'status':'PASS','actualAppZipFiles':ctx['artifacts'],'currentV37ArtifactBytesPreserved':ctx['currentArtifactsPreserved'],'priorV36ArtifactsPreserved':12,'retainedEarlierAttemptZips':4,'actualGulfOriginalAndRestoredSha256':ctx['sourceRestoredSha256'],'bsSourceUnchanged':True,'pdfsNewlyRendered':0,'frozenBundleOriginalDigest':ctx['originalFrozenDigest']})

export=read(out/'checkpoint-export-result.json')
assert export['httpStatus']==200 and export['exportPassed'] and export['targetProject']=='demo-boq-v036'
checkpoint=Path(export['checkpoint'])
assert checkpoint.parent==root/'output/emulator-checkpoints'
metadata=read(checkpoint/'firebase-export-metadata.json')
folder=checkpoint/metadata['storage']['path']
hashes={}
for p in (folder/'metadata').glob('*.json'):
    r=read(p);data=(folder/'blobs'/p.stem).read_bytes()
    assert len(data)==int(r['size']) and base64.b64encode(hashlib.md5(data).digest()).decode()==r['md5Hash']
    assert r['name'] not in hashes
    hashes[r['name']]=hashlib.sha256(data).hexdigest()
previous_checkpoint=root/'output/emulator-checkpoints/v0.37-inspection-reviewed-final-20261012-3'
oldfolder=previous_checkpoint/read(previous_checkpoint/'firebase-export-metadata.json')['storage']['path']
oldfiles=list((oldfolder/'metadata').glob('*.json'))
assert len(oldfiles)==4028
for p in oldfiles:
    r=read(p)
    assert hashes[r['name']]==sha(oldfolder/'blobs'/p.stem)
for a in previous_artifacts:
    assert hashes[a['path']]==a['sha256']
for service in ['auth','firestore','storage']:
    assert (checkpoint/metadata[service]['path']).is_dir()
assert (checkpoint/metadata['firestore']['metadata_file']).is_file()
checkpoint_result={'status':'PASS_FOR_LOCAL_EXPORT_AND_STORAGE_BYTES','checkpoint':str(checkpoint),'httpExportStatus':200,'exportPassed':True,'exportedServices':['auth','firestore','storage'],'storageBlobs':len(hashes),'allSizeMd5Verified':True,'previousV37BlobsSha256Preserved':len(oldfiles),'currentV37ArtifactsSha256Preserved':7,'targetProject':'demo-boq-v036','originalServicesRestarted':False,'defaultFolderReplaced':False,'finalCheckpointReimportPerformed':False,'wholeFirestoreParityVerified':False,'firestoreExportContentsVerified':False,'productionRecoveryVerified':False,'scope':'The existing isolated hub returned HTTP200/OK after all current SDK/dev/compiled UI checks. All exported Storage bytes and old4028 blob hashes verified. Auth/Firestore metadata and file presence verified only; no cold reimport, full document parity or production recovery claim. Previous CLI shutdown failures and checkpoints remain retained.'}
write('checkpoint-verification.json',checkpoint_result)

unit=read(out/'unit-results.json')
assert unit['success'] and unit['numFailedTests']==0 and unit['numPassedTests']==532
workflow=[]
for name in ['api-results.json','readonly-results.json','ui-results.json','built-results.json']:
    r=read(out/name)
    assert all(t['status']=='PASS' for t in r['results']) and not r.get('errors',[]) and not r.get('cloud',[]) and not r.get('storageWrites',[]),name
    workflow.extend({'evidence':name,**t} for t in r['results'])
assert len(workflow)==34
build=read(out/'build-results.json')
assert build['typeCheckExit']==build['productionBuildExit']==build['localBuildExit']==0 and not build['deployed']
for prefix in ['ui','built']:
    for view in ['preview','mobile','invalid','restored','occupied','viewer']:
        assert (out/f'{prefix}-{view}.png').stat().st_size>1000
summary={'version':'0.38.0','unitTests':532,'scopedWorkflowTests':34,'totalScopedTests':566,'workflowTests':workflow,'actualAppZipFiles':3,'priorCompletedArtifactBytesPreserved':7,'pdfPagesNewlyRendered':0,'screenshots':12,'preservedProtectedFiles':len(protected),'buildPassed':True,'workingFixture':ctx['workingPreview']['counts'],'sourceFixture':ctx['sourcePreview']['counts'],'checkpoint':checkpoint_result,'fullOriginalAcceptance':False,'engineeringAcceptance':False,'rulesDeployed':False,'productionDeployed':False,'numericalPolicyUnchanged':'geometry-2.2+bs8666-2000-v7','limitations':['Only supported current member geometries are restored; schema1 compatibility has unit coverage, not every historical archive fixture','Checksums validate package consistency, not who approved the drawings or engineering conformity','ZIP decoding and file hashing occur in browser memory; large real-project archive performance remains to be qualified','Network/access changes during actual transfer can leave staged Storage objects; automatic atomic Storage rollback is not implemented','Local checkpoint export succeeds, but final checkpoint cold reimport/full Firestore parity/production recovery are unverified','Approved BS/ACI cases, physical closure33/51, real GULF reinforcement/owner BBS, unsupported assemblies, native Excel printing and production remain incomplete'],'retainedFailedAttemptFolders':['initial-scope-attempt','schema-message-attempt','permission-code-attempt']}
write('verification-summary.json',summary)
print(json.dumps({'unitTests':532,'scopedWorkflowTests':34,'totalScopedTests':566,'actualAppZipFiles':3,'protectedFiles':len(protected),'checkpointStorageBlobs':len(hashes),'oldStorageBlobsPreserved':len(oldfiles)}))
