from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'output/fabrication-inspection-verification';old=root/'output/context-openings-verification'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=read(out/'config-baseline.json');protected={p:sha(root/p) for p in baseline};assert protected==baseline
(out/'config-verification.json').write_text(json.dumps({'status':'PASS','unchangedProtectedFiles':len(protected),'sha256':protected,'rulesEdited':False,'rulesDeployed':False,'cloudFunctionsRestored':False,'cloudDeployed':False},indent=2),encoding='utf-8')
ctx=read(out/'context.json');current=ctx['artifacts']+read(out/'ui-results.json')['artifacts']+read(out/'built-results.json')['artifacts']+[read(out/'stress-results.json')['artifact']]
def verify(folder,artifacts):
    for a in artifacts:assert (folder/a['local']).stat().st_size==a['size'] and sha(folder/a['local'])==a['sha256'],a['local']
verify(out,current);assert len(current)==7 and len({a['local'] for a in current})==7
previous=read(old/'artifact-verification.json');verify(old,previous['artifacts']);assert len(previous['artifacts'])==12
for folder in ['previous-excel','previous-pdf-layout']:verify(out/folder,read(out/folder/'manifest.json'))
assert sha(out/'INS-backup.zip')==ctx['backupSha256']
assert sha(old/'CTX2-backup.zip')==previous['backupSha256']
gulf=read(root/'output/placement-context-verification/context.json')['source'];assert sha(root/gulf['path'])==gulf['sha256']
assert sha(root/'Referrence/BS 8666.pdf')=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'artifact-verification.json').write_text(json.dumps({'status':'PASS','currentArtifactsVerified':7,'priorV36ArtifactsPreserved':12,'earlierV37WorkbooksPreserved':3,'earlierV37PdfPreserved':4,'priorBackupPreserved':True,'actualGulfSourceSha256Preserved':True,'bsSourceSha256Preserved':True,'artifacts':current,'backupSha256':ctx['backupSha256']},indent=2),encoding='utf-8')
unit=read(out/'unit-results.json');assert unit['success'] and unit['numFailedTests']==0 and unit['numPassedTests']==513
workflow=[]
for name in ['api-results.json','ui-results.json','built-results.json','stress-results.json','excel-replay-results.json','pdf-replay-results.json','render-results.json']:
    r=read(out/name);assert all(t['status']=='PASS' for t in r['results']) and not r.get('errors',[]) and not r.get('cloud',[]),name
    workflow.extend({'evidence':name,**t} for t in r['results'])
assert len(workflow)==20
build=read(out/'build-results.json');assert build['typeCheckExit']==build['productionBuildExit']==build['localBuildExit']==0 and not build['deployed']
pdf=read(out/'pdf-results.json');assert pdf['renderedPages']==41 and all(r['status']=='PASS' for r in pdf['results'])
old_pdf=read(out/'previous-pdf-layout/pdf-results.json');assert next(r['pages'] for r in old_pdf['results'] if r['name']=='INS-max-A4')==50
assert read(out/'render-results.json')['views']==5
facts=ctx['facts'];assert facts['concrete']==125 and facts['formwork']==100 and facts['cut']==750
summary={'version':'0.37.0','unitTests':513,'scopedWorkflowTests':20,'totalScopedTests':533,'workflowTests':workflow,'pdfPagesRendered':41,'excelViews':5,'currentArtifacts':7,'priorV36Artifacts':12,'previousV37Artifacts':7,'backupSha256':ctx['backupSha256'],
 'fixture':{'concretePer':125,'formworkPer':100,'quantity':3,'concreteTotal':375,'formworkTotal':300,'cutLength':750,'bars':6,'totalCutLengthMetres':4.5,'rebarKg':facts['rebar']*3,'frozenDimensionB':510,'currentDimensionB':515,'measuredA':260,'measuredB':510,'measuredInnerRadius':32,'requiredFreeB':522,'freeResidual':-12},
 'maximumTextFixture':{'pieces':20,'pieceAndObserverMax':80,'referenceAndNoteMax':500,'oldPdfPages':50,'finalPdfPages':23},
 'preservedProtectedFiles':len(protected),'buildPassed':True,'fullOriginalAcceptance':False,'engineeringAcceptance':False,'rulesDeployed':False,'productionDeployed':False,
 'limitations':['Per-piece user measurements only; no batch/fabrication approval or full Clause9/BS/ACI acceptance','Algebraic free-dimension comparison is not a residual acceptance rule or geometry/cut adjustment','Native Excel printing not verified; Excel range formula is live but app status/free balance captured','ZIP backup precedes later UI and export replays; final checkpoint commands logged export completion then failed at shutdown. Exported Storage bytes verified only, no complete checkpoint/reimport/production recovery claim','Full original GULF/owner/geometry/engineering/production scope remains incomplete'],
 'retainedFailedAttempts':['api-fixture-missing-reference-results.json','ui-coordinate-locator-attempt-results.json','ui-profile-menu-attempt-results.json','excel-replay-port-attempt.log','checkpoint-export-final.log','checkpoint-export-retry.log','checkpoint-command-result.json'],
 'isolation':{'targetProject':'demo-boq-v036','originalServicesRestarted':False,'wholeFirestoreParityVerified':False,'finalCheckpointReimportPerformed':False}}
(out/'verification-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:summary[k] for k in ['unitTests','scopedWorkflowTests','totalScopedTests','pdfPagesRendered','excelViews','currentArtifacts','preservedProtectedFiles']}))
