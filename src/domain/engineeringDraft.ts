import {z} from 'zod';
import {memberSchema,specSchema,type Project,type Member,type Spec,type Attachment} from './model';
import {canonical} from './canonical';
import {fixtureSpec,fixtureMetricKeys} from './engineeringFixtures';
import {calculationEngine} from './version';

export const ENGINEERING_DRAFT_MAX_BYTES=1000000;
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
// Empty fields must remain empty; in particular an absent expectation is not zero.
const entered=z.string().max(80).refine(s=>!s.trim()||Number.isFinite(Number(s))&&Number(s)>=0,'กรอกตัวเลขที่ไม่ติดลบ หรือเว้นว่าง');
const barInputs=z.object({cutLength:entered,totalCount:entered,weight:entered}).strict();
export const draftFormSchema=z.object({
 label:z.string().max(120),reference:z.string().max(500),note:z.string().max(500),outcome:z.enum(['valid','invalid']),
 sourcePage:z.string().max(10),expectedErrors:z.string().max(16000),
 numbers:z.object({quantity:entered,concrete:entered,formwork:entered,excavation:entered,lean:entered,backfill:entered,rebar:entered}).strict(),
 barNumbers:z.record(id,barInputs),tolerance:z.object({volume:entered,area:entered,weight:entered,cut:entered}).strict()
}).strict();
export type EngineeringDraftForm=z.infer<typeof draftFormSchema>;
const sourceSchema=z.object({id,memberId:z.string().max(80),name:z.string().min(1).max(250),revision:z.string().max(40),sha256:z.string().regex(/^[a-f0-9]{64}$/),pageCount:z.number().int().min(1).max(9999),sourceStatus:z.enum(['Current','Superseded'])}).strict();
export const engineeringDraftSchema=z.object({
 format:z.literal('boq-bbs-engineering-draft'),version:z.literal(1),engineeringApproved:z.literal(false),sourceBytesIncluded:z.literal(false),
 createdAt:z.string().datetime(),project:z.object({id,code:z.string().max(120),name:z.string().max(250)}).strict(),
 member:memberSchema,spec:specSchema,engineVersion:z.string().max(200),source:sourceSchema.optional(),form:draftFormSchema
}).strict().superRefine((d,c)=>{
 if(d.member.version<1)c.addIssue({code:'custom',path:['member'],message:'เลือกสมาชิกที่บันทึกแล้ว'});
 if(d.spec.approved||d.spec.evidenceFileId)c.addIssue({code:'custom',path:['spec'],message:'ไฟล์เตรียมตรวจไม่เก็บสิทธิ์อนุมัติวิศวกรรม'});
 if(d.engineVersion!==calculationEngine(d.spec))c.addIssue({code:'custom',path:['engineVersion'],message:'รุ่นคำนวณไม่ตรง Spec ที่เก็บไว้'});
 if(d.source?.memberId&&d.source.memberId!==d.member.id)c.addIssue({code:'custom',path:['source'],message:'ไฟล์อ้างอิงเป็นของสมาชิกอื่น'});
 if(Object.keys(d.form.barNumbers).some(key=>!d.member.bars.some(b=>b.id===key)))c.addIssue({code:'custom',path:['form','barNumbers'],message:'ค่าที่กรอกอ้างถึงเหล็กที่ไม่มีในข้อมูลสมาชิก'});
 if(d.source&&(!/^\d+$/.test(d.form.sourcePage)||Number(d.form.sourcePage)<1||Number(d.form.sourcePage)>d.source.pageCount))c.addIssue({code:'custom',path:['form','sourcePage'],message:'หน้าอ้างอิงเกินไฟล์ที่เลือก'});
});
export type EngineeringDraft=z.infer<typeof engineeringDraftSchema>;
export const draftSource=(a:Attachment)=>sourceSchema.parse({id:a.id,memberId:a.memberId,name:a.name,revision:a.revision,sha256:a.sha256,pageCount:a.pageCount,sourceStatus:a.sourceStatus||'Current'});
export function createEngineeringDraft(project:Project,member:Member,spec:Spec,source:Attachment|undefined,form:EngineeringDraftForm){
 return engineeringDraftSchema.parse({format:'boq-bbs-engineering-draft',version:1,engineeringApproved:false,sourceBytesIncluded:false,createdAt:new Date().toISOString(),project:{id:project.id,code:project.code,name:project.name},member:structuredClone(member),spec:fixtureSpec(spec),engineVersion:calculationEngine(spec),source:source?draftSource(source):undefined,form:structuredClone(form)});
}
export function draftResumeProblems(d:EngineeringDraft,project:Project,members:Member[],attachments:Attachment[]){
 if(d.project.id!==project.id)return ['ไฟล์เตรียมตรวจมาจากอีกโครงการ เปิดดูได้แต่กรอกต่อในโครงการนี้ไม่ได้'];
 const problems:string[]=[],m=members.find(m=>m.id===d.member.id);
 if(!m)problems.push('ไม่พบสมาชิกของไฟล์เตรียมตรวจในโครงการนี้');
 else if(canonical(memberSchema.parse(m))!==canonical(d.member))problems.push('ข้อมูลสมาชิกเปลี่ยนจากฉบับที่เก็บไว้ ต้องเตรียมกรณีใหม่จากข้อมูลปัจจุบัน');
 if(canonical(fixtureSpec(project.spec))!==canonical(d.spec))problems.push('Spec เปลี่ยนจากไฟล์เตรียมตรวจ ต้องเตรียมกรณีตาม Spec ปัจจุบัน');
 if(d.source){const a=attachments.find(a=>a.id===d.source!.id);if(!a||!a.sha256||!a.pageCount)problems.push('ไม่พบไฟล์อ้างอิงเดิมที่ตรวจข้อมูลไฟล์แล้ว');else if(canonical(draftSource(a))!==canonical(d.source))problems.push('ข้อมูลไฟล์อ้างอิงหรือฉบับใช้งานเปลี่ยน ต้องตรวจและเลือกไฟล์ใหม่');}
 return problems;
}
export function normalizedDraftForm(form:{label:string;reference:string;note:string;outcome:'valid'|'invalid';sourcePage:string;expectedErrors:string;numbers:Record<string,string>;barNumbers:Record<string,{cutLength:string;totalCount:string;weight:string}>;tolerance:{volume:string;area:string;weight:string;cut:string}}):EngineeringDraftForm{
 // Normalize only key presence here. Validation belongs to file creation, so
 // temporarily invalid edits cannot crash the form while the user is typing.
 return {...form,numbers:Object.fromEntries(fixtureMetricKeys.map(k=>[k,form.numbers[k]??''])) as EngineeringDraftForm['numbers']};
}
