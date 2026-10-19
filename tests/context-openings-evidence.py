from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'output/context-openings-verification';old=root/'output/placement-context-verification'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=read(out/'config-baseline.json');protected={p:sha(root/p) for p in baseline};assert protected==baseline
(out/'config-verification.json').write_text(json.dumps({'status':'PASS','unchangedProtectedFiles':len(protected),'sha256':protected,'rulesEdited':False,'rulesDeployed':False,'cloudFunctionsRestored':False,'cloudDeployed':False},indent=2),encoding='utf-8')
ctx=read(out/'context.json');prior=read(old/'context.json');ps=read(old/'verification-summary.json');owner=read(out/'owner-stress-results.json')
compiled=[read(out/f)['artifact'] for f in ['built-export-results.json','built-excel-results.json','built-owner-results.json','built-owner-two-results.json']]
current=ctx['artifacts']+owner['artifacts']+read(out/'owner-two-results.json')['artifacts']+compiled
for a in current:assert (out/a['local']).stat().st_size==a['size'] and sha(out/a['local'])==a['sha256'],a['local']
previous=prior['artifacts']+prior['previousArtifacts']+[ps['compiledWorkingArtifact'],ps['compiledFrozenExcelArtifact']]
for a in previous:assert (old/a['local']).stat().st_size==a['size'] and sha(old/a['local'])==a['sha256'],a['local']
old_two=read(out/'previous-owner-two/owner-two-results.json')['artifacts']
for a in old_two:assert (out/'previous-owner-two'/a['local']).stat().st_size==a['size'] and sha(out/'previous-owner-two'/a['local'])==a['sha256'],a['local']
assert sha(old/'CTX-backup.zip')==ps['backupSha256'];assert sha(root/prior['source']['path'])==prior['source']['sha256']
(out/'artifact-verification.json').write_text(json.dumps({'status':'PASS','currentArtifactsVerified':len(current),'priorV35ArtifactsPreserved':len(previous),'earlierV36OwnerTwoArtifactsPreserved':len(old_two),'priorBackupPreserved':True,'actualGulfSourceSha256Preserved':True,'artifacts':current,'backupSha256':sha(out/'CTX2-backup.zip')},indent=2),encoding='utf-8')
unit=read(out/'unit-results.json');assert unit['success'] and unit['numFailedTests']==0
files=['api-results.json','ui-results.json','built-results.json','3d-results.json','built-export-results.json','built-excel-results.json','built-owner-results.json','owner-stress-results.json','owner-two-results.json','built-owner-two-results.json','render-results.json','domain-entry-results.json','copy-import-results.json']
workflow=[]
for name in files:
    r=read(out/name);assert all(t['status']=='PASS' for t in r['results']),name
    assert not r.get('errors',[]) and not r.get('cloud',[]),name
    workflow.extend({'evidence':name,**t} for t in r['results'])
build=read(out/'build-results.json');assert build['typeCheckExit']==build['buildExit']==0
summary={'version':'0.36.0','unitTests':unit['numPassedTests'],'scopedWorkflowTests':len(workflow),'totalScopedTests':unit['numPassedTests']+len(workflow),'workflowTests':workflow,'pdfPagesRendered':read(out/'pdf-results.json')['renderedPages'],'excelViews':read(out/'render-results.json')['views'],'currentArtifacts':len(current),'priorArtifacts':len(previous),'backupSha256':sha(out/'CTX2-backup.zip'),'fixture':{'ownedConcretePer':3.234,'ownedFormworkPer':18.48,'quantity':3,'ownedConcreteTotal':9.702,'ownedFormworkTotal':55.44,'cutLength':7800,'bars':6,'totalCutLength':46800,'nominalRebarKg':ctx['quantities']['rebar']*3,'frozenPreviousCover':30,'workingPreviousCover':35,'futureCover':70,'openingLowerOriginZ':-600,'openingUpperOriginZ':6800},'maximumOwnerFixture':{'regions':6,'openings':24,'labelMax':80,'referenceMax':500,'a3Pages':22,'a1Pages':10},'preservedProtectedFiles':len(protected),'buildPassed':True,'fullOriginalAcceptance':False,'engineeringAcceptance':False,'rulesDeployed':False,'productionDeployed':False,'limitations':['Rectangular declared references only; full engineering, actual GULF reinforcement/Mark mapping and owner/production acceptance pending','Native Excel printing not verified','Backup captures working cover35 and Frozen cover30 before later UI wizard and compiled export replays; not latest whole-project backup','Checkpoint preservation verifies exported Storage bytes; no whole-Firestore parity or reimport claim']}
summary['isolation']={'targetProject':'demo-boq-v036','sourceCheckpoint':'output/emulator-checkpoints/v0.36-context-openings-final-20261012','sourceServicesRestarted':False,'selectedWorkingAndFrozenReadbackVerified':True,'wholeFirestoreParityVerified':False,'finalReplayEvidence':['ui-results.json','built-results.json','owner-two-results.json','built-owner-two-results.json'],'earlierBackendConnectionFailureRecorded':'login-probe.json'}
summary['freshDomainEntryTests']=3
summary['earlierV36OwnerTwoArtifactsPreserved']=len(old_two)
summary['limitations'][-1]='Final checkpoint backs up the isolated imported QA copy; selected Working/Frozen readback and all exported Storage bytes verified, not whole-Firestore parity or final-checkpoint/production recovery'
(out/'verification-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:summary[k] for k in ['unitTests','scopedWorkflowTests','totalScopedTests','pdfPagesRendered','excelViews','currentArtifacts','priorArtifacts','preservedProtectedFiles']}))
