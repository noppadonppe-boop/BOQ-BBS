import {getDoc} from 'firebase/firestore';
import {recordRef,must} from './direct/common';
import {decodeStorage} from '../domain/storageCodec';
import {loadSnapshot,digestData} from './snapshots';
import {verifyIssuedReference} from './releaseReview';
import {captureIssuedCutBasis,captureCutAllocations,type CutAllocation} from '../domain/issuedCutting';
import {verifyCurrentCutBasis,type CutPlanBasis} from '../domain/cutPlanBasis';
import {issuedReferenceSchema} from '../domain/publication';
import type {Stock,ExportScope} from '../domain/model';
import {selectUnallocatedBatch,validateAllocationSubset,validateCutBatch,type CutBatch} from '../domain/cutBatch';

export async function loadIssuedCutBasis(pid:string,revisionId:string,stock:Stock[],scope:ExportScope,options:{batchLimit?:number;plans?:any[];allocations?:CutAllocation[];batch?:CutBatch}={}){
 const [rs,ss]=await Promise.all([getDoc(recordRef(pid,'revisions',revisionId)),getDoc(recordRef(pid,'revisionStates',revisionId))]);
 must(rs.exists()&&ss.data()?.status==='Issued','เลือกฉบับ Issued ปัจจุบันสำหรับแผนตัด');const revision=decodeStorage(rs.data()),original=await loadSnapshot(revision);
 must(original.project.id===pid,'ฉบับตัดเป็นของโครงการอื่น');const publication=await verifyIssuedReference(pid,revision,decodeStorage(ss.data()),original);
 must(!options.allocations||options.batch,'ยอดชุดย่อยต้องมีข้อมูลชุดตัด');const scoped=captureCutAllocations(original,scope),capacity=captureCutAllocations(original,{}),chosen=options.batchLimit!==undefined?selectUnallocatedBatch(publication,scoped,capacity,options.plans||[],options.batchLimit):undefined,allocations=chosen?.allocations||(options.allocations?validateAllocationSubset(options.allocations,scoped):scoped),batch=chosen?.batch||options.batch;
 if(batch)validateCutBatch(batch,allocations,scoped);return {basis:captureIssuedCutBasis(original,stock,scope,batch?allocations:undefined),issuedReference:publication,revisionNumber:revision.number,allocations,capacity,original,...(batch?{batch}:{})};
}
export async function verifyIssuedCutPlan(pid:string,plan:{issuedReference:unknown;revisionNumber?:string;inputBasis:CutPlanBasis;scope?:ExportScope;allocations?:CutAllocation[];batch?:CutBatch}){
 const reference=issuedReferenceSchema.parse(plan.issuedReference);must(reference.projectId===pid,'แผนตัดอ้างอิงโครงการอื่น');const current=await loadIssuedCutBasis(pid,reference.revisionId,plan.inputBasis.stock,plan.scope||{},plan.batch?{allocations:plan.allocations,batch:plan.batch}:{});
 must(await digestData(reference)===await digestData(current.issuedReference)&&plan.revisionNumber===current.revisionNumber,'หลักฐานแผนตัดไม่ตรงฉบับ Issued');must(await digestData(plan.allocations||[])===await digestData(current.allocations),'ยอดจองชิ้นงานไม่ตรงตำแหน่งในฉบับ');verifyCurrentCutBasis(plan.inputBasis,current.basis);return {issuedReference:current.issuedReference,capacity:current.capacity};
}
