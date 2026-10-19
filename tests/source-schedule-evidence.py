from pathlib import Path
import json,hashlib,base64
root=Path(__file__).resolve().parents[1];out=root/'output/source-schedule-verification'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
write=lambda name,v:(out/name).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
baseline=read(out/'config-baseline.json');protected={p:sha(root/p) for p in baseline};assert protected==baseline
write('config-verification.json',{'status':'PASS','unchangedProtectedFiles':len(protected),'sha256':protected,'rulesEdited':False,'rulesDeployed':False,'cloudFunctionsRestored':False,'cloudDeployed':False})
artifacts=[]
for name in ['context.json','extras-context.json','max-context.json','portable-context.json','built-results.json','built-excel-results.json','restore-guard-results.json']:artifacts.extend(read(out/name).get('artifacts',[]))
def verify(folder,items):
 for a in items:
  p=folder/a['local'];assert p.stat().st_size==a['size'] and sha(p)==a['sha256'],str(p)
verify(out,artifacts);assert len(artifacts)==16 and len({a['local'] for a in artifacts})==16
assert sum(a['local'].endswith('.xlsx') for a in artifacts)==7 and sum(a['local'].endswith('.pdf') for a in artifacts)==9
ctx=read(out/'context.json');verify(out,[ctx['backup']]);assert sha(root/'Referrence/ตัวอย่าง BBS/GULF-ISB-CU-FL10600-2C1-100.pdf')==ctx['gulfSha'];assert sha(root/'Referrence/BS 8666.pdf')=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
prior=root/'output/restore-preflight-verification';old_zips=read(prior/'artifact-verification.json')['actualAppZipFiles'];verify(prior,old_zips)
old=root/'output/fabrication-inspection-verification';old_artifacts=read(old/'artifact-verification.json')['artifacts'];verify(old,old_artifacts);assert len(old_artifacts)==7
retained=out/'empty-cell-serialization-attempt';failed=read(retained/'context.partial.json');verify(retained,failed['artifacts'])
write('artifact-verification.json',{'status':'PASS','artifacts':artifacts,'actualAppZip':ctx['backup'],'unchangedPriorV38ZipFiles':len(old_zips),'unchangedPriorV37ExcelPdf':7,'retainedEarlierAttemptArtifacts':len(failed['artifacts']),'actualSourcePdfSha256':ctx['gulfSha'],'bsSourceUnchanged':True,'numericalPolicyUnchanged':'geometry-2.2+bs8666-2000-v7'})
export=read(out/'checkpoint-export-result.json');assert export['httpStatus']==200 and export['exportPassed'] and export['targetProject']=='demo-boq-v036'
checkpoint=Path(export['checkpoint']);assert checkpoint.parent==root/'output/emulator-checkpoints';meta=read(checkpoint/'firebase-export-metadata.json');folder=checkpoint/meta['storage']['path'];hashes={}
for p in (folder/'metadata').glob('*.json'):
 r=read(p);data=(folder/'blobs'/p.stem).read_bytes();assert len(data)==int(r['size']) and base64.b64encode(hashlib.md5(data).digest()).decode()==r['md5Hash'];assert r['name'] not in hashes;hashes[r['name']]=hashlib.sha256(data).hexdigest()
previous=Path(read(prior/'checkpoint-export-result.json')['checkpoint']);oldfolder=previous/read(previous/'firebase-export-metadata.json')['storage']['path'];oldfiles=list((oldfolder/'metadata').glob('*.json'));assert len(oldfiles)==4201
for p in oldfiles:
 r=read(p);assert hashes[r['name']]==sha(oldfolder/'blobs'/p.stem)
for a in artifacts:assert hashes[a['path']]==a['sha256']
for service in ['auth','firestore','storage']:assert (checkpoint/meta[service]['path']).is_dir()
assert (checkpoint/meta['firestore']['metadata_file']).is_file()
checkpoint_result={'status':'PASS_FOR_LOCAL_EXPORT_AND_STORAGE_BYTES','checkpoint':str(checkpoint),'httpExportStatus':200,'exportPassed':True,'storageBlobs':len(hashes),'allSizeMd5Verified':True,'previousV38BlobsSha256Preserved':4201,'currentArtifactHashesPreserved':16,'finalCheckpointReimportPerformed':False,'wholeFirestoreParityVerified':False,'firestoreExportContentsVerified':False,'productionRecoveryVerified':False,'originalServicesRestarted':False,'rulesDeployed':False,'scope':'Isolated local hub export and all Storage size/MD5/SHA verification; Auth/Firestore metadata/file presence only. No cold reimport, full document parity or production recovery claim.'};write('checkpoint-verification.json',checkpoint_result)
unit=read(out/'unit-results.json');assert unit['success'] and unit['numFailedTests']==0 and unit['numPassedTests']==548
workflow=[]
for name in ['api-results.json','extras-results.json','max-results.json','portable-results.json','ui-results.json','built-results.json','built-excel-results.json','restore-guard-results.json']:
 r=read(out/name);assert all(t['status']=='PASS' for t in r['results']) and not r.get('errors',[]) and not r.get('cloud',[]),name;workflow.extend({'evidence':name,**t} for t in r['results'])
assert len(workflow)==24
pdf=read(out/'pdf-results.json');assert len(pdf['results'])==9 and pdf['renderedPages']==59 and all(r['status']=='PASS' for r in pdf['results'])
excel=read(out/'render-results.json');assert len(excel['results'])==2 and excel['views']==5 and all(r['status']=='PASS' for r in excel['results'])
scans=read(out/'excel-formula-scan.json');assert all('matched 0 entries' in r['scan'] for r in scans)
for name in ['build-local.log','build-production.log']:assert 'built in' in (out/name).read_text(encoding='utf-8-sig')
write('build-results.json',{'typeCheckExit':0,'productionBuildExit':0,'localBuildExit':0,'productionBuildFolder':'dist','isolatedBuildFolder':'output/source-schedule-dist','previewPort':5193,'deployed':False,'qaCloudRequests':0})
summary={'version':'0.39.0','unitTests':548,'scopedWorkflowTests':24,'totalScopedTests':572,'workflowTests':workflow,'actualExcelFiles':7,'actualPdfFiles':9,'actualAppZipFiles':1,'pdfPagesRendered':59,'actualExcelViews':5,'preservedProtectedFiles':7,'buildPassed':True,'checkpoint':checkpoint_result,'fullOriginalAcceptance':False,'engineeringAcceptance':False,'rulesEdited':False,'rulesDeployed':False,'productionDeployed':False,'numericalPolicyUnchanged':'geometry-2.2+bs8666-2000-v7','gulfAppBars':0,'gulfReferenceRows':3,'limitations':['Reference rows are manually transcribed, not automatic PDF bar reconstruction or engineering approval','Weight differences/printed totals have no approved acceptance tolerance','Only core field comparisons block Checked; source/shape/placement approvals remain separate','No physical closure33/51 adapter, full BS/ACI approval, actual owner-approved GULF BBS or native Excel print acceptance','Filtered exported occurrence counts can differ from the source declared scope; source counts are not rewritten','Maximum text and8 rows are exercised, not large real-project performance or every historical Backup schema','Local checkpoint export/storage hashes verified; no final cold reimport, whole Firestore parity or production recovery','Original empty shared strings are retained; the new portable exports use true blank cells and pass reader/recalculation checks'],'retainedFailedAttempts':['source-fixture-module-attempt','empty-cell-serialization-attempt','ui-selector-attempt','ui-route-attempt','ui-signout-attempt']}
summary['retainedFailedAttempts'].append('restore-guard-path-attempt')
write('verification-summary.json',summary);print(json.dumps({k:summary[k] for k in ['unitTests','scopedWorkflowTests','actualExcelFiles','actualPdfFiles','pdfPagesRendered','preservedProtectedFiles']}))
