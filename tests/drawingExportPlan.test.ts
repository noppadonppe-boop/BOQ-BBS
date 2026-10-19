import {describe,it,expect} from 'vitest';
import {blankMember,currentStarterSpec} from '../src/domain/model';
import {exportBasisProblem} from '../src/domain/exportBasis';
import {drawingExportPlan,workingExportInput} from '../src/domain/drawingExportPlan';

const project:any={id:'p',code:'QA',version:7,spec:structuredClone(currentStarterSpec),titleBlock:{company:'',drawnBy:'',checkedBy:'',drawingPrefix:''}};
function input(){const m=blankMember('Custom','CUBE');m.id='cube';m.occurrences=[{id:'a',zone:'A',floor:'L1',grid:'',quantity:2},{id:'b',zone:'B',floor:'L2',grid:'',quantity:3}];return workingExportInput(project,[m],[]);}
describe('export preview basis',()=>{
 it('preserves compatibility for callers without a preview',()=>expect(exportBasisProblem({},{version:9})).toBe(''));
 it('rejects a changed Working version',()=>expect(exportBasisProblem({expectedVersion:7},{version:8})).toContain('ข้อมูลทำงานเปลี่ยน'));
 it('accepts the exact Working version',()=>expect(exportBasisProblem({expectedVersion:7},{version:7})).toBe(''));
 it.each([0,-1,1.5,NaN,Infinity])('rejects malformed Working version %s',expectedVersion=>expect(exportBasisProblem({expectedVersion},{version:7})).toContain('ไม่ถูกต้อง'));
 it('rejects mixing Working and revision',()=>expect(exportBasisProblem({revisionId:'r',expectedVersion:7},{version:7})).toContain('พร้อมกันไม่ได้'));
 it('requires an identified revision for checksum/status',()=>expect(exportBasisProblem({expectedRevisionDigest:'a'.repeat(64)},{version:7})).toContain('ระบุฉบับ'));
 it('requires a valid checksum',()=>expect(exportBasisProblem({revisionId:'r',expectedRevisionDigest:'ABC'},{version:7})).toContain('Checksum'));
 it('rejects a changed revision digest',()=>expect(exportBasisProblem({revisionId:'r',expectedRevisionDigest:'a'.repeat(64)},{version:99,digest:'b'.repeat(64)})).toContain('Revision เปลี่ยน'));
 it('accepts frozen input after Working changes',()=>expect(exportBasisProblem({revisionId:'r',expectedRevisionDigest:'a'.repeat(64),expectedRevisionStatus:'Frozen'},{version:99,digest:'a'.repeat(64),status:'Frozen'})).toBe(''));
 it('rejects a superseded revision after a Frozen preview',()=>expect(exportBasisProblem({revisionId:'r',expectedRevisionStatus:'Frozen'},{version:7,status:'Superseded'})).toContain('สถานะ Revision เปลี่ยน'));
 it('rejects an unknown revision state',()=>expect(exportBasisProblem({revisionId:'r',expectedRevisionStatus:'Approved'},{version:7,status:'Approved'})).toContain('ไม่ถูกต้อง'));
});
describe('scoped drawing export plan',()=>{
 it('pins member/spec/title-block arrays independently of later live edits',()=>{const m=blankMember('Custom','PIN'),p=structuredClone(project),b=workingExportInput(p,[m],[]);m.x=9000;p.spec.density=1;p.titleBlock.company='CHANGED';expect(b.members[0].x).toBe(1000);expect(b.project.spec.density).toBe(7850);expect(b.project.titleBlock.company).toBe('');});
 it('filters actual occurrences and applies each quantity once',()=>{const plan=drawingExportPlan(input(),{zone:'B',floor:'L2'},'schedule-v1','A1');expect(plan.report.totals.slice(0,3)).toEqual([3,3,18]);expect(plan.size).toBe('A1');expect(plan.bundle.members[0].occurrences.map(o=>o.id)).toEqual(['b']);});
 it('keeps captured per-unit quantities rather than recalculating historical geometry',()=>{const b=input();b.status='Frozen';b.calculations={cube:{quantity:5,concrete:2,formwork:9,excavation:0,backfill:0,lean:0,rebar:0,bars:[]}};const p=drawingExportPlan(b,{zone:'B'},'boq','A1');expect(p.report.totals.slice(0,3)).toEqual([3,6,27]);expect(p.size).toBe('A3');});
 it('does not clear an empty or conflicting member scope to all project',()=>expect(()=>drawingExportPlan(input(),{memberId:'deleted'},'excel','A3')).toThrow(/ไม่มีสมาชิก/));
 it('blocks incompatible captured calculation versions',()=>{const b=input();b.engineVersion='old-unknown';expect(()=>drawingExportPlan(b,{},'excel','A3')).toThrow(/รุ่นคำนวณ/);});
 it('fixes Excel and BOQ print size at the actual supported A3 size',()=>{for(const f of ['excel','boq'])expect(drawingExportPlan(input(),{},f,'A1').size).toBe('A3');});
 it('checks required A4 table numbering before generating a job',()=>{const b=input();expect(()=>drawingExportPlan(b,{},'cutting-a4-v1','A1')).toThrow(/ตั้งเลขแบบ/);b.members[0].scheduleSetup={drawingNumber:'QA-001',startNumber:1,revisionLetter:'A'};expect(drawingExportPlan(b,{},'cutting-a4-v1','A1').size).toBe('A4');});
 it('checks owner drawing numbers in the selected snapshot',()=>{const b=input();b.project.drawingProfile={template:'owner-v1',language:'en',projectName:'QA',company:'',owner:'',location:'',contract:'',discipline:'',preparedBy:'',checkedBy:'',indexNumber:'',indexRevision:''};expect(()=>drawingExportPlan(b,{},'schedule-v1','A3')).toThrow(/เลขแบบ BBS/);b.members[0].drawingSetup={number:'QA-101',title:'Cube',revision:'A'};expect(drawingExportPlan(b,{},'schedule-v1','A3').references[0].number).toBe('QA-101');});
 it('requires actual saved source anchors for the source drawing layout',()=>expect(()=>drawingExportPlan(input(),{},'source-v9','A3')).toThrow(/จุดชี้ Mark/));
 it('rejects an unknown format instead of silently using a different layout',()=>expect(()=>drawingExportPlan(input(),{},'unsupported','A3')).toThrow(/รูปแบบไฟล์/));
});

describe('publication identity in composer planning',()=>{
 it('refuses an Issued label without an issue reference before planning any format',()=>{const b=input();b.status='Issued';expect(()=>drawingExportPlan(b,{},'excel','A3')).toThrow('หลักฐาน');});
 it.each(['Issued','Superseded'])('retains %s publication labels and captured issue identity through scope selection',status=>{const b=input();b.status=status as any;b.calculations={cube:{quantity:5,concrete:1,formwork:6,excavation:0,backfill:0,lean:0,rebar:0,bars:[]}};b.issuedReference={format:'issued-reference-1.0',projectId:project.id,revisionId:'R',revisionDigest:'a'.repeat(64),issuedEventId:'I',issuedAt:'2026-10-14T00:00:00.000Z',issuedBy:'U',ruleSetDigest:'b'.repeat(64),approvalId:'A',engineVersion:b.engineVersion};const plan=drawingExportPlan(b,{zone:'B'},'excel','A3');expect(plan.publication).toBe(status==='Issued'?'ISSUED / FOR CONSTRUCTION':'SUPERSEDED / NOT FOR CONSTRUCTION');expect(plan.bundle.issuedReference).toEqual(b.issuedReference);expect(plan.report.totals[0]).toBe(3);});
});

it('binds a revision preview to the complete live status/proof checksum even if the status string stays the same',()=>{const data={revisionId:'R',expectedRevisionStateDigest:'a'.repeat(64)};expect(exportBasisProblem(data,{version:1,stateDigest:'a'.repeat(64)})).toBe('');expect(exportBasisProblem(data,{version:1,stateDigest:'b'.repeat(64)})).toContain('หลักฐาน');expect(exportBasisProblem({...data,expectedRevisionStateDigest:'invalid'},{version:1})).toContain('Checksum');expect(exportBasisProblem({expectedRevisionStateDigest:'a'.repeat(64)},{version:1})).toContain('ระบุฉบับ');});
