import {getBlob,ref} from 'firebase/storage';
import {storage} from './firebase';
import {sha256,digestData} from './snapshots';
import {inspectAttachmentDocument} from './documentInspection';
import {canonical} from '../domain/canonical';
import {draftSource,engineeringDraftSchema,type EngineeringDraft} from '../domain/engineeringDraft';
import type {Attachment} from '../domain/model';
import {previewDecision,type EngineeringPreview,type SourceVerification} from '../domain/engineeringPreview';
export async function verifyEngineeringPreviewSource(draft:EngineeringDraft,pid:string,attachments:Attachment[]):Promise<SourceVerification>{
 const d=engineeringDraftSchema.parse(draft),pending=(message:string):SourceVerification=>({state:'Pending',messages:[message],checkedAt:new Date().toISOString()});
 if(d.project.id!==pid)return pending('ไฟล์เตรียมตรวจเป็นของอีกโครงการ ไม่อ่านไฟล์อ้างอิง');
 if(!d.source)return pending('ยังไม่เลือกเอกสารอ้างอิง');
 const a=attachments.find(a=>a.id===d.source!.id);
 try{if(!a||!a.sha256||!a.pageCount||canonical(draftSource(a))!==canonical(d.source))return pending('ข้อมูลเอกสารอ้างอิงเปลี่ยนหรือไม่ครบ');}catch{return pending('ข้อมูลเอกสารอ้างอิงไม่ถูกต้อง');}
 if(!a)return pending('ไม่พบเอกสารอ้างอิง');
 if(a.sourceStatus==='Superseded')return pending('เอกสารอ้างอิงเป็น Superseded');
 if(!a.path.startsWith(`projects/${pid}/files/`))return pending('ตำแหน่งไฟล์อ้างอิงไม่อยู่ในโครงการปัจจุบัน');
 if(a.size>50*1024*1024)return pending('ไฟล์อ้างอิงเกิน50MiB แบ่งเอกสารก่อนตรวจ');
 try{const blob=await getBlob(ref(storage,a.path),50*1024*1024),bytes=await blob.arrayBuffer(),hash=await sha256(bytes);if(blob.size!==a.size||hash!==d.source.sha256)return pending('เนื้อไฟล์อ้างอิง SHA256 หรือขนาดไม่ตรง');const pageCount=await inspectAttachmentDocument(a,blob);return {state:'Verified',messages:[],checkedAt:new Date().toISOString(),sha256:hash,bytes:blob.size,pageCount};}catch{return pending('อ่านหรือตรวจเนื้อไฟล์อ้างอิงไม่ได้ ตรวจสิทธิ์และไฟล์ต้นฉบับ');}
}
export async function captureEngineeringPreview(draft:EngineeringDraft,result:EngineeringPreview,source:SourceVerification,contextProblems:string[]){
 const values=structuredClone({draft:engineeringDraftSchema.parse(draft),result,sourceVerification:source,contextProblems}),createdAt=new Date().toISOString();if(values.result.engineeringApproved!==false)throw Error('รายงานเทียบไม่เก็บสิทธิ์อนุมัติ');
 const body={format:'boq-bbs-engineering-preview' as const,version:1 as const,engineeringApproved:false as const,sourceBytesIncluded:false as const,createdAt,inputDigest:await digestData(values.draft),...values,state:previewDecision(values.result,values.sourceVerification,values.contextProblems)};
 const record={body,contentDigest:await digestData(body)};
 if(new TextEncoder().encode(JSON.stringify(record,null,2)).length>2000000)throw Error('รายงานเทียบใหญ่เกิน2MB แบ่ง input ก่อนตรวจ');return record;
}
export type EngineeringPreviewCapture=Awaited<ReturnType<typeof captureEngineeringPreview>>;
export async function engineeringPreviewFile(draft:EngineeringDraft,result:EngineeringPreview,source:SourceVerification,contextProblems:string[],state:'Pending'|'Compared'|'Review'){
 const record=await captureEngineeringPreview(draft,result,source,contextProblems);if(record.body.state!==state)throw Error('สถานะรายงานไม่ตรงผลเทียบ');return JSON.stringify(record,null,2);
}
