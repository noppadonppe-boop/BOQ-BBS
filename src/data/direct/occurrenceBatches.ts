import type {Member,Project} from '../../domain/model';
import {occurrenceBatchSchema,occurrenceBatchPlan} from '../../domain/occurrenceBatch';
import {validateMember} from '../../domain/engine';
import {readCollectionPages} from '../collections';
import {readProjectRecord,readOwnProfileRecord} from '../projectReadback';
import {restProjectTransaction} from './restTransaction';
import {writeManifest} from './manifests';
import {allow,clean,encode,must,now,projectRef,recordRef,writable} from './common';
export async function beginOccurrenceBatch(pid:string,data:Record<string,unknown>,id:string){
 const input=occurrenceBatchSchema.parse(data),u=await readOwnProfileRecord(),p=await readProjectRecord(pid) as Project;must(p,'ไม่พบโครงการ');allow(p,u,['admin','qs']);
 if(await readProjectRecord(pid,'operations',id))return restProjectTransaction('beginOccurrenceBatch',pid,data,id,['admin','qs'],async()=>{throw Error('Unexpected replay');});
 writable(p);must(p.version===input.version,'ข้อมูลโครงการเปลี่ยนแล้ว เปิดตัวอย่างชุดใหม่','aborted');
 const [members,stock,plans,exports,submissions]=await Promise.all(['members','stock','cutPlans','exportJobs','submissionJobs'].map(n=>readCollectionPages(pid,n)));must(members.length<=5000,'แบ่งโครงการ: เกิน 5,000 สมาชิก');
 must(!stock.some(s=>s.reserved>0)&&!plans.some(s=>s.status==='Reserved'),'มีสต็อกจองอยู่ ให้ดำเนินการหรือยกเลิกก่อนปรับจำนวน/ตำแหน่ง');must(![...exports,...submissions].some(j=>j.status==='Generating'&&j.leaseUntil>Date.now()),'มีงานส่งออกกำลังสร้างไฟล์ ให้รอจนเสร็จ');
 const plan=occurrenceBatchPlan(members as Member[],p.spec,input,p.locations);must(plan.memberCount>0,'ข้อมูลที่เลือกไม่มีการเปลี่ยนแปลง','invalid-argument');const preparedAt=now();
 const changes=plan.pairs.map(e=>{const errors=validateMember(e.after,p.spec);must(!errors.length,`${e.before.code}: ${errors.join('\n')}`,'invalid-argument');return {...e,after:{...e.after,status:'Draft' as const,version:e.before.version+1,inputEpoch:id,updatedAt:preparedAt,bars:e.after.bars.map(b=>({...b,placementConfirmed:false}))}};});
 const occurrenceChange={version:1,fields:Object.keys(input.patch),patch:input.patch,note:input.note,memberCount:plan.memberCount,rowCount:plan.rowCount,quantityBefore:plan.quantityBefore,quantityAfter:plan.quantityAfter};
 const manifest={id,projectId:pid,sourceVersion:p.version,oldSpec:p.spec,newSpec:p.spec,preparedAt,occurrenceChange,members:changes,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[]};
 const file=await writeManifest(pid,'spec-manifests',clean(manifest));
 return restProjectTransaction('beginOccurrenceBatch',pid,data,id,['admin','qs'],async(tx,current,user)=>{must(user.uid===u.uid,'ผู้ใช้เปลี่ยนระหว่างเตรียมงาน','aborted');must(current.version===p.version&&current.stockEpoch===p.stockEpoch,'ข้อมูลหรือสต็อกเปลี่ยนระหว่างเตรียมงาน','aborted');const state={id,status:'Applying' as const,completed:0,total:changes.length};tx.set(recordRef(pid,'specChangeJobs',id),encode({...state,manifest:file,sourceVersion:p.version,createdBy:u.uid,createdAt:preparedAt,targetSpec:p.spec,sourceScope:null,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[],sourceIntakeCount:0,sourceChangeCount:0,sourceAdoptionCount:0,memberIds:changes.map(e=>e.id),sourceIds:[],occurrenceChange}));tx.update(projectRef(pid),{specChangeState:state,historyEpoch:id});return state;});
}
