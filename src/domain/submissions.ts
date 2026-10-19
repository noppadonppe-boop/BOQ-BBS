import {drawingNumberKey} from './drawingStandard';
import type {DrawingReference,DrawingProfile} from './drawingStandard';
import {z} from 'zod';
import type {ExportScope,SnapshotFile,ExportKind,ExportSize,ExportLayout} from './model';
import {issuedReferenceSchema,type IssuedReference} from './publication';
export const SUBMISSION_LIMITS={documents:30,drawingReferences:120,coverPages:20,sourceBytes:40*1024*1024,zipBytes:50*1024*1024,coverBytes:2*1024*1024,manifestBytes:2*1024*1024};
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const submissionInputSchema=z.object({revisionId:id,number:z.string().trim().min(1).max(80),recipient:z.string().trim().min(1).max(200),purpose:z.enum(['For Review','Tender','For Construction']),note:z.string().trim().max(2000),items:z.array(z.object({exportJobId:id,reference:z.string().trim().min(1).max(80),title:z.string().trim().min(1).max(240)})).min(1).max(SUBMISSION_LIMITS.documents)});
export type SubmissionInput=z.infer<typeof submissionInputSchema>;
export const submissionReferenceKey=(s:string)=>s.normalize('NFC').trim().toLowerCase();
export function validateSubmissionInput(data:unknown){const input=submissionInputSchema.parse(data);if(new Set(input.items.map(r=>r.exportJobId)).size!==input.items.length)throw Error('ไฟล์ส่งออกซ้ำในชุด');if(new Set(input.items.map(r=>submissionReferenceKey(r.reference))).size!==input.items.length)throw Error('รหัสเอกสารในใบส่งซ้ำ');return input;}
export const submissionDocumentKey=(i:number,name:string)=>`documents/${String(i+1).padStart(3,'0')}_${name.replace(/[\\/\x00-\x1f]/g,'_')}`;
export type SubmissionDocument={exportJobId:string;reference:string;title:string;kind:ExportKind;size:ExportSize;drawingLayout?:ExportLayout;scope:ExportScope;scopeLabel:string;snapshotDigest:string;file:SnapshotFile;zipKey:string;drawingReferences?:DrawingReference[];pages?:number;paperSummary?:string;issuedReference?:IssuedReference};
export type SubmissionManifest={schemaVersion:1|2;id:string;projectId:string;project:{code:string;name:string;owner:string;location:string;company:string;drawnBy:string;checkedBy:string;drawingProfile?:DrawingProfile};number:string;recipient:string;purpose:'For Review'|'Tender'|'For Construction';note:string;status:'Draft'|'Issued';revisionId:string;revisionNumber:string;revisionDigest:string;sourceVersion:number;createdAt:string;createdBy:string;documents:SubmissionDocument[];issuedReference?:IssuedReference};
export type SubmissionJob={id:string;number:string;revisionId:string;revisionNumber:string;revisionDigest:string;createdAt:string;createdBy:string;status:'Prepared'|'Generating'|'Complete'|'Failed';digest:string;manifest:SnapshotFile;documentCount:number;sourceBytes:number;purpose:'For Review'|'Tender'|'For Construction';recipient:string;attempt?:number;leaseToken?:string;leaseUntil?:number;name?:string;file?:SnapshotFile;error?:string;completedAt?:string};
export const submissionZipName=(m:Pick<SubmissionManifest,'number'|'project'>&Partial<Pick<SubmissionManifest,'status'>>)=>`${m.project.code.replace(/[^a-zA-Z0-9_-]/g,'_')}-${m.number.replace(/[^a-zA-Z0-9_-]/g,'_')}-${m.status==='Issued'?'ISSUED':'DRAFT'}.zip`;
export const submissionRequiredState=(purpose:SubmissionManifest['purpose'])=>purpose==='For Construction'?'Issued':'Frozen';
export function validateSubmissionPublication(m:SubmissionManifest){
 if(m.status==='Issued'||m.purpose==='For Construction'){
  if(m.schemaVersion!==2||m.status!=='Issued'||m.purpose!=='For Construction')throw Error('ชุดก่อสร้างต้องเป็น Issued manifest รุ่น2');
  const r=issuedReferenceSchema.parse(m.issuedReference);if(r.projectId!==m.projectId||r.revisionId!==m.revisionId||r.revisionDigest!==m.revisionDigest)throw Error('หลักฐาน Issued ไม่ตรงชุด');
  for(const d of m.documents){const item=issuedReferenceSchema.parse(d.issuedReference);if(JSON.stringify(item)!==JSON.stringify(r))throw Error('ไฟล์ในชุดไม่ได้สร้างจาก Issued เดียวกัน');}
 }else if(m.issuedReference||m.documents.some(d=>d.issuedReference))throw Error('ห้ามนำไฟล์ Issued มาปะปนในชุด Draft');
}
export function submissionStatusLabel(m:SubmissionManifest){validateSubmissionPublication(m);return m.status==='Issued'?'ISSUED / FOR CONSTRUCTION':'DRAFT / NOT FOR CONSTRUCTION';}

export function validatePackageDrawingReferences(refs:DrawingReference[]){const numbers=new Set<string>();for(const r of refs){const key=drawingNumberKey(r.number);if(numbers.has(key))throw Error('เลขแบบเดียวกันอยู่หลายไฟล์: '+r.number+' · เลือกรูปแบบ BBS เดียวต่อเลขแบบ');numbers.add(key);}if(numbers.size>SUBMISSION_LIMITS.drawingReferences)throw Error('แบ่งชุด: ทะเบียนเลขแบบ BBS เกิน120รายการ');return numbers.size;}
