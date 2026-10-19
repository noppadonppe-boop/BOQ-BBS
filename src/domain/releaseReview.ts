import {quantityBasisState} from './quantityBasis';
import {z} from 'zod';
import type {Project,Revision,RevisionState,SnapshotBundle,Attachment} from './model';
import type {Code99Review} from './code99ReviewSchema';
import {canonical} from './canonical';
import {fixtureSpec} from './engineeringFixtures';
import {calculationEngine,supportsBundle} from './version';
import {validateMember,minimumProblems,takeoff} from './engine';
import {steelCoverage} from './reinforcementCoverage';
import {declaredNoRebar} from './reinforcementScopeSchema';
import {sourceCurrent,generalSourceInfo,generalSourceReview,memberSourceInfo,sourceReviewProblems} from './sourceRevisions';
import {drawingReferences} from './drawingStandard';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const engineeringApprovalSchema=z.object({format:z.literal('engineering-approval-1.0'),id,projectId:id,specDigest:sha,engineVersion:z.string().min(1),actorUid:z.string().min(1),createdAt:z.string().datetime(),evidence:z.object({id,version:z.number().int().positive(),sha256:sha}),runs:z.array(z.object({id,digest:sha})).min(1).max(20),fixtures:z.array(z.object({id,digest:sha,sourceId:id,sourceSha256:sha,sourceVersion:z.number().int().positive()})).min(2).max(400),categories:z.array(z.string()).min(1),shapeCodes:z.array(z.string()),note:z.string().trim().min(1).max(2000),aciReview:z.literal('Manual review of project evidence; not automatic ACI certification')}).strict();
export type EngineeringApproval=z.infer<typeof engineeringApprovalSchema>;
export type ReleaseCheck={group:'revision'|'engineering'|'member'|'source'|'coverage'|'drawing'|'calculation';code:string;message:string;memberId?:string;sourceId?:string};
export type ReleaseReport={format:'release-preflight-1.0';projectId:string;projectVersion:number;revisionId:string;revisionNumber:string;revisionDigest:string;checkedAt:string;engineVersion:string;ready:boolean;memberCount:number;markCount:number;checks:ReleaseCheck[];sourceChecks:{id:string;sha256:string;version:number;verified:boolean;message?:string}[];approvalId?:string};
export const releaseReportSchema=z.object({format:z.literal('release-preflight-1.0'),projectId:id,projectVersion:z.number().int().nonnegative(),revisionId:id,revisionNumber:z.string().min(1).max(80),revisionDigest:sha,checkedAt:z.string().datetime(),engineVersion:z.string().min(1).max(200),ready:z.boolean(),memberCount:z.number().int().nonnegative().max(5000),markCount:z.number().int().nonnegative().max(1500000),checks:z.array(z.object({group:z.enum(['revision','engineering','member','source','coverage','drawing','calculation']),code:z.string().min(1).max(80),message:z.string().min(1).max(20000),memberId:id.optional(),sourceId:id.optional()}).strict()).max(100000),sourceChecks:z.array(z.object({id,sha256:z.string().max(64),version:z.number().int().positive(),verified:z.boolean(),message:z.string().max(20000).optional()}).strict()).max(10000),approvalId:id.optional()}).strict().superRefine((r,c)=>{if(r.ready&&(r.checks.length||r.sourceChecks.some(s=>!s.verified)))c.addIssue({code:'custom',message:'Ready result contains unresolved checks'});});
export function releaseChecks(b:SnapshotBundle,p:Project,r:Revision,state:RevisionState|undefined,liveFiles:Attachment[],reviews:Code99Review[],approval:EngineeringApproval|undefined){
 const checks:ReleaseCheck[]=[],add=(group:ReleaseCheck['group'],code:string,message:string,memberId?:string,sourceId?:string)=>checks.push({group,code,message,...(memberId?{memberId}:{}),...(sourceId?{sourceId}:{})});
 if(b.project.id!==p.id)add('revision','project','Revision เป็นของโครงการอื่น');
 if(!state||state.status!=='Frozen')add('revision','state','เลือก Frozen revision ที่ยังไม่ถูกแทนที่');
 if(!supportsBundle(b)||r.engineVersion!==b.engineVersion)add('revision','engine','รุ่นคำนวณของ Revision ไม่รองรับ');
 if(canonical(fixtureSpec(p.spec))!==canonical(fixtureSpec(b.project.spec)))add('engineering','spec-changed','สเป็คปัจจุบันต่างจาก Revision สร้าง Revision ใหม่หลังตรวจสมาชิก');
 if(!p.spec.approved||!p.spec.bsEdition||!p.spec.aciEdition||!p.spec.ruleSource||!p.spec.ruleVersion||!p.spec.engineer||!p.spec.evidenceFileId||!p.spec.fixtureReferences)add('engineering','approval','ต้องมีปีฉบับ BS/ACI ผู้รับผิดชอบ หลักฐาน และชุดกรณีอ้างอิงที่รับรอง');
 if(!approval)add('engineering','approval-record','ยังไม่มีบันทึกผู้อนุมัติชุดกฎที่ตรวจข้อมูลและหลักฐานครบ');
 if(!b.members.length)add('member','empty','ไม่มีสมาชิกใน Revision');
 if(!b.project.drawingProfile)add('drawing','profile','ตั้งกรอบชื่อแบบสำหรับโครงการก่อนออก Issued');else try{drawingReferences(b,'schedule-v1');}catch(e){add('drawing','identity',(e as Error).message);}
 for(const m of b.members){
  if(quantityBasisState(m)==='Provisional')add('coverage','quantity-basis',m.code+': ข้อมูลปริมาณ BOQ ยังเป็นค่าชั่วคราว',m.id);
  if(m.status!=='ApprovedForIssue')add('member','status',m.code+': ยังไม่ ApprovedForIssue',m.id);
  for(const message of [...validateMember(m,b.project.spec),...minimumProblems(m,b.project.spec,reviews)])add('member','geometry',m.code+': '+message,m.id);
  for(const bar of m.bars){if(!bar.placementConfirmed)add('member','placement',m.code+'/'+bar.mark+': รอยืนยันตำแหน่ง',m.id);if(!bar.bsDimensionsConfirmed)add('member','dimensions',m.code+'/'+bar.mark+': รอยืนยันมิติ',m.id);}
  const coverage=steelCoverage(m,b);for(const reason of coverage.reasons)add('coverage','steel',m.code+': '+reason,m.id);
  const files=b.attachments.filter(a=>a.memberId===m.id&&sourceCurrent(a));
  if(!files.length)add('source','missing',m.code+': แนบแบบหรือเอกสารยืนยันขอบเขตก่อนออก Issued',m.id);
  for(const a of files)if(!memberSourceInfo(a))add('source','legacy',m.code+'/'+a.name+': นำเอกสารเข้าทะเบียนและทบทวนก่อนส่งงาน',m.id,a.id);
  for(const message of sourceReviewProblems(files,m.bars,declaredNoRebar(m)?m.noRebar!.basis:undefined))add('source','review',m.code+': '+message,m.id);
  if(approval&&!approval.categories.includes(m.category))add('engineering','category-case',m.code+': ชุดกรณีที่รับรองยังไม่ครอบคลุม '+m.category,m.id);
  if(approval)for(const bar of m.bars)if(bar.shapeCode.trim()!=='99'&&!approval.shapeCodes.includes(bar.shapeCode.trim()))add('engineering','shape-case',m.code+'/'+bar.mark+': ชุดกรณีที่รับรองยังไม่ครอบคลุมรูป '+bar.shapeCode,m.id);
  const stored=b.calculations?.[m.id],q=takeoff(m,b.project.spec),close=(a:number|undefined,v:number)=>a!==undefined&&Number.isFinite(a)&&Math.abs(a-v)<=1e-8*Math.max(1,Math.abs(v));
  if(!stored)add('calculation','missing',m.code+': ไม่มีฐานคำนวณที่ตรึงไว้',m.id);else{
   for(const key of ['quantity','concrete','formwork','excavation','backfill','lean','rebar'] as const)if(key==='quantity'?stored[key]!==q[key]:!close(stored[key],q[key]))add('calculation','changed',m.code+': ค่า '+key+' ต่างจากฐานที่ตรึงไว้',m.id);
   for(const row of q.rows){const f=stored.bars.find(x=>x.id===row.id);if(!f||f.cutLength!==row.cutLength||!close(f.geometricLength,row.geometricLength)||!close(f.weight,row.weight))add('calculation','bar-changed',m.code+'/'+row.mark+': ความยาวหรือน้ำหนักต่างจากฐานที่ตรึงไว้',m.id);}
  }
 }
 for(const a of b.attachments.filter(sourceCurrent)){
  const live=liveFiles.find(v=>v.id===a.id);if(!live||!sourceCurrent(live)||live.sha256!==a.sha256||(live.version||1)!==(a.version||1))add('source','changed',a.name+': เอกสารปัจจุบันต่างจาก Revision',a.memberId||undefined,a.id);
  if(!a.sha256)add('source','hash',a.name+': ยังไม่มี checksum ของไฟล์',a.memberId||undefined,a.id);
  if(!a.memberId&&(!generalSourceInfo(a)||!generalSourceReview(a).reviewed))add('source','general-review',a.name+': ทบทวนเอกสารโครงการฉบับปัจจุบัน',undefined,a.id);
 }
 return checks;
}
