import {canonical} from '../domain/canonical';
import {collection,getDocsFromServer,query,where,orderBy,documentId,limit,startAfter,type QueryDocumentSnapshot,type DocumentData} from 'firebase/firestore';
import {db} from './firebase';
import {decodeStorage} from '../domain/storageCodec';
import {digestData} from './snapshots';
import {code99ReviewSchema,code99RevocationSchema,CODE99_HOLD,CODE99_REVIEW_POLICY,type Code99Review} from '../domain/code99ReviewSchema';
import {code99MemberBasis,code99SpecBasis,code99EvidenceBasis,currentReviewMetadata,code99ReviewProblems,reviewDimensions,indexedApprover} from '../domain/code99Review';
import type {Attachment,Member,Project,SnapshotBundle} from '../domain/model';
import {schedule} from '../domain/engine';
import {verifiedAttachment} from './direct/sources';

export async function code99Bindings(m:Member,p:Project,a:Attachment){return {inputDigest:await digestData(code99MemberBasis(m)),specDigest:await digestData(code99SpecBasis(p.spec)),evidenceDigest:await digestData(code99EvidenceBasis(a))};}
export async function readCode99Reviews(pid:string,memberId?:string){
 const records:any[]=[];let cursor:QueryDocumentSnapshot<DocumentData>|undefined;
 const filter=memberId?where('result.memberId','==',memberId):where('action','in',['acceptCode99Detail','revokeCode99Detail']);
 for(;;){const page=await getDocsFromServer(query(collection(db,'projects',pid,'operations'),filter,orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(50)));records.push(...page.docs.map(s=>decodeStorage(s.data())));if(page.size<50)break;cursor=page.docs.at(-1);}
 return records;
}
export async function qualifiedCode99Reviews(p:Project,members:Member[],attachments:Attachment[],operations?:any[],verifyBytes=false){
 if(p.spec.code99ReviewPolicy!==CODE99_REVIEW_POLICY)return [];
 const relevant=members.filter(m=>m.bars.some(b=>b.shapeCode.trim()==='99'));if(!relevant.length)return [];
 const ops=operations||await readCode99Reviews(p.id,relevant.length===1?relevant[0].id:undefined),accepted:Code99Review[]=[],seen=new Set<string>(),bytes=new Map<string,Promise<Attachment>>();
 const events=[...ops].sort((a,b)=>(b.result?.request?.projectVersion??b.result?.projectVersion??0)-(a.result?.request?.projectVersion??a.result?.projectVersion??0));
 for(const op of events){
  const revoked=code99RevocationSchema.safeParse(op.result);
  if(op.action==='revokeCode99Detail'&&revoked.success&&op.id===revoked.data.id&&op.uid===revoked.data.actorUid&&revoked.data.projectId===p.id&&revoked.data.projectVersion<p.version&&indexedApprover(p,op.uid)){seen.add(revoked.data.memberId+'/'+revoked.data.barId);continue;}
  const parsed=code99ReviewSchema.safeParse(op.result);if(!parsed.success||op.action!=='acceptCode99Detail'||op.uid!==parsed.data.actorUid||op.id!==parsed.data.id)continue;
  const r=parsed.data;if(r.request.projectVersion>=p.version||r.request.memberId!==r.memberId||r.request.barId!==r.barId||r.request.attachmentId!==r.evidence.id)continue;
  const m=members.find(m=>m.id===r.memberId),a=attachments.find(a=>a.id===r.evidence.id),key=r.memberId+'/'+r.barId;
  if(!m||seen.has(key)||!indexedApprover(p,r.actorUid))continue;seen.add(key);if(!currentReviewMetadata(p,m,a,r))continue;
  const b=m.bars.find(b=>b.id===r.barId);if(!b)continue;const hashes=await code99Bindings(m,p,a!);
  if(hashes.inputDigest!==r.inputDigest||hashes.specDigest!==r.specDigest||hashes.evidenceDigest!==r.evidenceDigest)continue;
  try{if(canonical(reviewDimensions(m,b,r.request))!==canonical(r.dimensions))continue;}catch{continue;}
  const row=schedule(m,p.spec).find(b=>b.id===r.barId)!;const problems=[...row.standard.problems.filter(p=>p!==CODE99_HOLD),...code99ReviewProblems(m,b,p.spec,r.request,r.dimensions)];if(problems.length)continue;
  if(verifyBytes){if(!bytes.has(a!.id))bytes.set(a!.id,verifiedAttachment(p.id,a!));await bytes.get(a!.id);}
  accepted.push(r);
 }
 return accepted;
}
// Historical exports use the captured inputs and roles. Later withdrawals must
// not rewrite a Frozen document; these records never grant current permission.
export async function validateCapturedCode99Reviews(bundle:SnapshotBundle){
 const keys=new Set<string>();
 for(const value of bundle.code99Reviews||[]){
  const r=code99ReviewSchema.parse(value),key=r.memberId+'/'+r.barId;
  const m=bundle.members.find(m=>m.id===r.memberId),a=bundle.attachments.find(a=>a.id===r.evidence.id);
  if(!m)continue; // A filtered export may omit other captured members.
  if(keys.has(key)||!currentReviewMetadata(bundle.project,m,a,r)||r.request.memberId!==m.id||r.request.barId!==r.barId||r.request.attachmentId!==a?.id)throw Error('Captured Code99 review does not match the snapshot');
  keys.add(key);const b=m.bars.find(b=>b.id===r.barId);if(!b)throw Error('Captured Code99 Mark is missing');
  const hashes=await code99Bindings(m,bundle.project,a!);
  if(hashes.inputDigest!==r.inputDigest||hashes.specDigest!==r.specDigest||hashes.evidenceDigest!==r.evidenceDigest||canonical(reviewDimensions(m,b,r.request))!==canonical(r.dimensions))throw Error('Captured Code99 inputs or evidence changed');
  const row=schedule(m,bundle.project.spec).find(b=>b.id===r.barId)!;
  if(row.standard.problems.some(p=>p!==CODE99_HOLD)||code99ReviewProblems(m,b,bundle.project.spec,r.request,r.dimensions).length)throw Error('Captured Code99 requirements are incomplete');
 }
}
