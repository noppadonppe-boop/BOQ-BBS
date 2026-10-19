import {z} from 'zod';
import type {Revision,RevisionState,SnapshotBundle} from './model';
import {canonical} from './canonical';
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const issuedReferenceSchema=z.object({format:z.literal('issued-reference-1.0'),projectId:id,revisionId:id,revisionDigest:sha,issuedEventId:id,issuedAt:z.string().datetime(),issuedBy:z.string().min(1).max(128),ruleSetDigest:sha,approvalId:id,engineVersion:z.string().min(1).max(200)}).strict();
export type IssuedReference=z.infer<typeof issuedReferenceSchema>;
export function issuedReference(b:Pick<SnapshotBundle,'project'|'status'|'engineVersion'|'issuedReference'>){
 if(!b.issuedReference){if(b.status==='Issued')throw Error('Issued snapshot ไม่มีหลักฐานออกฉบับ');return undefined;}
 const r=issuedReferenceSchema.parse(b.issuedReference);if(r.projectId!==b.project.id||r.engineVersion!==b.engineVersion)throw Error('หลักฐานออกฉบับไม่ตรงโครงการ/รุ่นคำนวณ');return r;
}
export function publicationLabel(b:Pick<SnapshotBundle,'project'|'status'|'engineVersion'|'issuedReference'>){const r=issuedReference(b);return b.status==='Issued'&&r?'ISSUED / FOR CONSTRUCTION':b.status==='Superseded'?'SUPERSEDED / NOT FOR CONSTRUCTION':`${b.status} / NOT FOR CONSTRUCTION`;}
export const constructionPublication=(b:Pick<SnapshotBundle,'project'|'status'|'engineVersion'|'issuedReference'>)=>b.status==='Issued'&&!!issuedReference(b);
// UI identity includes all state fields, so replacing an issue event while keeping
// status=Issued still invalidates the preview. This is not an approval token.
export const revisionPreviewKey=(pid:string,record?:Revision,state?:RevisionState)=>{const {bundle:_,...identity}=record||{};return canonical({pid,record:record?identity:null,state:state||null});};
