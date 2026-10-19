import {getDoc} from 'firebase/firestore';
import {z} from 'zod';
import {emulator} from '../firebase';
import {readCollectionPages} from '../collections';
import {Member,Stock,Project,Attachment} from '../../domain/model';
import {captureCutBasis,validateCapturedCutPlan,verifyCurrentCutBasis,cutBasisReady} from '../../domain/cutPlanBasis';
import {digestData,sha256} from '../snapshots';
import {getBlob,ref} from 'firebase/storage';
import {storage} from '../firebase';
import {cuttingObjectives} from '../../domain/cutOptimizer';
import {normalizeScope,selectedMembers} from '../../domain/exportScope';
import {runCutOptimization,cutAbort,type CutRunOptions} from '../cutOptimization';
import {decodeStorage} from '../../domain/storageCodec';
import {canonical} from '../../domain/canonical';
import {cutExecutionSchema,assertCutAllocationsAvailable} from '../../domain/issuedCutting';
import {loadIssuedCutBasis,verifyIssuedCutPlan} from '../issuedCutting';
import type {IssuedReference} from '../../domain/publication';
import {consumeDirectCutReceipt,cancelDirectPartialCut,verifyReceiptHistory} from './cutReceiptCommands';
import {verifyCutSourceBytes as verifySourceBytes} from '../cutSources';
import {cutBatchLimitSchema} from '../../domain/cutBatch';
import {projectRef,recordRef,projectTransaction,encode,must,now,actor,allow,writable} from './common';

export async function planDirectCutting(pid:string,data:Record<string,any>,id:string,options:CutRunOptions={}){
 if(options.signal?.aborted)throw cutAbort();options.onProgress?.({phase:'reading'});
 const old=await getDoc(recordRef(pid,'operations',id));if(old.exists())return projectTransaction('planCutting',pid,data,id,['admin','qs'],async()=>{throw Error('Unexpected replay');});
 const kerf=z.number().min(0).max(20).parse(data.kerf),minOffcut=z.number().min(0).max(12000).parse(data.minOffcut),objective=z.enum(cuttingObjectives).default('material').parse(data.objective),scope=normalizeScope(data.scope||{}),ps=await getDoc(projectRef(pid));must(ps.exists(),'ไม่พบโครงการ');const p=decodeStorage(ps.data()) as Project;const initiating=await actor();allow(p,initiating,['admin','qs']);writable(p);
 const batchLimit=data.batchLimit===undefined?undefined:cutBatchLimitSchema.parse(data.batchLimit);must(batchLimit===undefined||data.revisionId,'ชุดชิ้นงานที่เหลือต้องใช้ BBS จาก Issued');
 const active=()=>!options.signal?.aborted,[ms,ss,ats]=await Promise.all([readCollectionPages(pid,'members',()=>{},active),readCollectionPages(pid,'stock',()=>{},active),readCollectionPages(pid,'attachments',()=>{},active)]);
 if(options.signal?.aborted)throw cutAbort();const members=selectedMembers(ms as Member[],scope);must(data.revisionId||members.some(m=>m.bars.length),'ไม่มี BBS ในสมาชิกหรือพื้นที่ที่เลือก');
 const otherPlans=batchLimit===undefined?[]:await readCollectionPages(pid,'cutPlans');must(otherPlans.length<=20000,'แผนตัดเกิน20,000รายการ');if(batchLimit!==undefined){const ledger=await readCollectionPages(pid,'stockLedger'),byPlan=new Map<string,any[]>();must(ledger.length<=20000,'ประวัติสต็อกเกิน20,000รายการ');for(const l of ledger as any[]){const rows=byPlan.get(l.planId)||[];rows.push(l);byPlan.set(l.planId,rows);}for(const plan of otherPlans as any[])if(plan.executionState&&plan.issuedReference?.revisionId===data.revisionId)await verifyReceiptHistory(pid,plan,byPlan.get(plan.id)||[]);}const released=data.revisionId?await loadIssuedCutBasis(pid,z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).parse(data.revisionId),ss as Stock[],scope,batchLimit===undefined?{}:{batchLimit,plans:otherPlans}):undefined;
 const inputBasis=released?.basis||captureCutBasis(p,ms as Member[],ats as Attachment[],ss as Stock[],scope);
 const plan=await runCutOptimization({members:released?[]:members,spec:inputBasis.spec,stock:ss as Stock[],kerf,minOffcut,objective,...(released?{capturedDemand:inputBasis.demand}:{})},options);
 validateCapturedCutPlan(plan,inputBasis,kerf,minOffcut);await verifySourceBytes(inputBasis.sources);
 const inputDigest=await digestData(inputBasis),stored={id,...plan,scope,status:'Proposal',projectVersion:p.version,kerf,minOffcut,createdAt:now(),inputBasis,inputDigest,...(released?{issuedReference:released.issuedReference,revisionNumber:released.revisionNumber,allocations:released.allocations,...(released.batch?{batch:released.batch}:{})}:{})};
 must(plan.patterns.length<=1000&&new TextEncoder().encode(JSON.stringify(encode(stored))).length<700000,'แบ่งแผนตัดพร้อมฐานข้อมูลไม่เกิน 1,000 เส้นหรือ 700 KB ต่อชุด');
 if(options.signal?.aborted)throw cutAbort();options.onProgress?.({phase:'saving'});
 return projectTransaction('planCutting',pid,data,id,['admin','qs'],async(tx,current,u)=>{must(u.uid===initiating.uid,'ผู้ใช้เปลี่ยนระหว่างคำนวณ ให้จัดแผนใหม่','aborted');must(current.version===p.version&&current.stockEpoch===p.stockEpoch,'ข้อมูล BBS หรือสต็อกเปลี่ยนแล้ว จัดแผนใหม่','aborted');if(released){const state=await tx.get(recordRef(pid,'revisionStates',released.issuedReference.revisionId));must(state.data()?.status==='Issued'&&state.data()?.issuedEventId===released.issuedReference.issuedEventId,'ฉบับถูกแทนที่ระหว่างจัดแผน','aborted');}tx.set(recordRef(pid,'cutPlans',id),encode(stored));tx.update(projectRef(pid),{stockEpoch:id});return {id};});
}

export async function directStock(action:string,pid:string,data:Record<string,any>,id:string){
 if(action==='consumeCutting'&&data.receipt)return consumeDirectCutReceipt(pid,data,id);
 if(action==='addStock'){
  const stock=z.object({diameter:z.number().positive().max(100),grade:z.string().min(1).max(40),length:z.number().positive().max(50000),quantity:z.number().int().positive().max(100000),location:z.string().max(200),kind:z.enum(['Standard','Offcut']).optional()}).parse(data.stock);
  return projectTransaction(action,pid,data,id,['admin','qs'],async(tx,p,u)=>{tx.set(recordRef(pid,'stock',id),{...stock,id,reserved:0,version:1,source:'Receipt'});tx.set(recordRef(pid,'stockLedger',id),{id,recordVersion:2,stockId:id,action:'Receipt',...stock,movements:[{stockId:id,before:{quantity:0,reserved:0,version:0},after:{quantity:stock.quantity,reserved:0,version:1}}],createdAt:now(),createdBy:u.uid});tx.update(projectRef(pid),{stockEpoch:id});return {id};});
 }
 if(action==='planCutting')return planDirectCutting(pid,data,id);
 must(['reserveCutting','cancelCutting','consumeCutting'].includes(action),'ไม่รองรับคำสั่งสต็อก','invalid-argument');
 const done=await getDoc(recordRef(pid,'operations',id));if(done.exists())return projectTransaction(action,pid,data,id,['admin','qs'],async()=>{throw Error('Unexpected replay');});
 if(action==='cancelCutting'){const s=await getDoc(recordRef(pid,'cutPlans',data.planId));if(s.exists()&&s.data().executionState)return cancelDirectPartialCut(pid,data,id);}
 let verifiedVersion:number|undefined,verifiedDigest:string|undefined,initiatingUid:string|undefined,publication:IssuedReference|undefined,execution:ReturnType<typeof cutExecutionSchema.parse>|undefined,verifiedStockEpoch:string|undefined,verifiedAllocations:string|undefined;
 if(action!=='cancelCutting'){
  const initiating=await actor(),ps=await getDoc(projectRef(pid)),pr=(must(ps.exists(),'ไม่พบโครงการ'),decodeStorage(ps.data()!)) as Project;allow(pr,initiating,['admin','qs']);writable(pr);
  const saved=await getDoc(recordRef(pid,'cutPlans',data.planId));must(saved.exists(),'ไม่พบแผนตัด');const plan=decodeStorage(saved.data());must(plan.inputBasis,'แผนเดิมไม่มีฐานข้อมูลที่ตรึงไว้ คำนวณข้อเสนอใหม่ก่อนจอง');
  must(!plan.executionState,'แผนนี้ตัดบางเส้นแล้ว ให้บันทึกเฉพาะเส้นที่เหลือ');
  await verifyReceiptHistory(pid,plan);
  must(plan.inputDigest===await digestData(plan.inputBasis),'ฐานแผนตัด checksum ไม่ตรง');validateCapturedCutPlan(plan,plan.inputBasis,plan.kerf,plan.minOffcut);
  if(plan.issuedReference){const verified=await verifyIssuedCutPlan(pid,plan);publication=verified.issuedReference;const others=await readCollectionPages(pid,'cutPlans');must(others.length<=20000,'แผนตัดเกิน20,000รายการ แบ่งโครงการก่อนตรวจยอดจอง');assertCutAllocationsAvailable(plan,others as any[],verified.capacity);verifiedStockEpoch=pr.stockEpoch;verifiedAllocations=canonical(plan.allocations);}else{must(action!=='consumeCutting'||emulator,'การตัดจริงต้องอ้างอิงแผนจาก Issued revision ที่ตรวจรับแล้ว');const [members,attachments]=await Promise.all([readCollectionPages(pid,'members'),readCollectionPages(pid,'attachments')]);const current=captureCutBasis(pr,members as Member[],attachments as Attachment[],plan.inputBasis.stock,normalizeScope(plan.scope||{}));verifyCurrentCutBasis(plan.inputBasis,current);}
  if(action==='consumeCutting'&&publication)execution=cutExecutionSchema.parse(data.execution);
  await verifySourceBytes(plan.inputBasis.sources);
  must(cutBasisReady(plan.inputBasis),'ขอบเขตแผนยังรอ BBS หรือเทียบแบบก่อนจอง');verifiedVersion=pr.version;verifiedDigest=plan.inputDigest;initiatingUid=initiating.uid;
 }
 return projectTransaction(action,pid,data,id,['admin','qs'],async(tx,p,u)=>{
  const r=recordRef(pid,'cutPlans',data.planId),s=await tx.get(r);must(s.exists(),'ไม่พบแผนตัด');const plan=decodeStorage(s.data());
  if(action!=='cancelCutting')must(u.uid===initiatingUid&&p.version===verifiedVersion&&(publication||plan.projectVersion===p.version)&&plan.inputDigest===verifiedDigest&&(!publication||canonical(plan.issuedReference)===canonical(publication)),'ผู้ใช้หรือ BBS/ฐานแผนเปลี่ยนแล้ว จัดแผนใหม่','aborted');
  if(publication){must(p.stockEpoch===verifiedStockEpoch&&canonical(plan.allocations)===verifiedAllocations,'ยอดจองชิ้นงาน/สต็อกเปลี่ยนระหว่างตรวจ เริ่มใหม่','aborted');const state=await tx.get(recordRef(pid,'revisionStates',publication.revisionId));must(state.data()?.status==='Issued'&&state.data()?.issuedEventId===publication.issuedEventId,'ฉบับถูกแทนที่ระหว่างจอง/ตัดเหล็ก','aborted');}
  if(action==='reserveCutting')must(plan.status==='Proposal'&&(publication||plan.projectVersion===p.version)&&!plan.unfilled.length,'แผนเปลี่ยนหรือสต็อกไม่พอ ต้องจัดแผนใหม่');else must(plan.status==='Reserved','ต้องมีแผนที่จองไว้');
  const requirements:Record<string,number>={};for(const pattern of plan.patterns)requirements[pattern.stockId]=(requirements[pattern.stockId]||0)+1;
  const ids=Object.keys(requirements);must(ids.length<=160,'แบ่งแผนจองเป็นชุดละไม่เกิน 160 รายการสต็อก');const stocks=await Promise.all(ids.map(sid=>tx.get(recordRef(pid,'stock',sid))));
  const groups:Record<string,{diameter:number;grade:string;length:number;quantity:number}>={};
  if(action==='consumeCutting')for(const pattern of plan.patterns){if(pattern.remainder<=0||pattern.remainder<plan.minOffcut)continue;const key=`${pattern.diameter}:${pattern.grade}:${pattern.remainder}`;groups[key]||={diameter:pattern.diameter,grade:pattern.grade,length:pattern.remainder,quantity:0};groups[key].quantity++;}
  must(Object.keys(groups).length<=160,'แบ่งกลุ่มเศษเหล็กเป็นชุดละไม่เกิน 160 รายการ');
  const movements:Record<string,unknown>[]=[];stocks.forEach((s,i)=>{must(s.exists(),'สต็อกถูกลบ');const stock=decodeStorage(s.data()) as Stock,n=requirements[ids[i]];if(action!=='cancelCutting'){const original=plan.inputBasis.stock.find((x:Stock)=>x.id===stock.id);must(original&&['length','diameter','grade','kind','source'].every(k=>(stock as any)[k]===(original as any)[k]),'สต็อกจริงไม่ตรงขนาด/เกรด/ความยาวในแผน','aborted');}must(action==='reserveCutting'?stock.quantity-stock.reserved>=n:stock.reserved>=n&&stock.quantity>=n,'สต็อกถูกจองหรือเปลี่ยนแล้ว','aborted');const after={reserved:stock.reserved+(action==='reserveCutting'?n:-n),quantity:stock.quantity-(action==='consumeCutting'?n:0),version:stock.version+1};movements.push({stockId:stock.id,before:{quantity:stock.quantity,reserved:stock.reserved,version:stock.version},after});tx.update(s.ref,after);});
  const outputs:Record<string,unknown>[]=[];Object.values(groups).forEach((g,i)=>{const sid=`${id}-${i}`,created={...g,id:sid,reserved:0,version:1,kind:'Offcut',location:execution?.offcutLocation||'Offcut rack',source:`Cut ${plan.id}`};outputs.push({stockId:sid,...g});tx.set(recordRef(pid,'stock',sid),created);});
  const status=action==='reserveCutting'?'Reserved':action==='consumeCutting'?'Consumed':'Cancelled';tx.update(r,{status,...(execution?{execution:{version:1,...execution,recordedAt:now(),recordedBy:u.uid}}:{})});tx.set(recordRef(pid,'stockLedger',id),encode({id,recordVersion:2,action:status,planId:plan.id,requirements,movements,outputs,createdAt:now(),createdBy:u.uid,...(publication?{issuedReference:publication}:{}),...(execution?{execution:{version:1,...execution}}:{}),...(action==='consumeCutting'&&!publication?{simulation:true}:{})}));tx.update(projectRef(pid),{stockEpoch:id});return {status};
 });
}
