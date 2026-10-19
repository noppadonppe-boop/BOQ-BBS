import {getDoc} from 'firebase/firestore';
import type {Member,Project} from '../../domain/model';
import {areaChangeSchema,areaChangePlan} from '../../domain/areaChange';
import {validateMember} from '../../domain/engine';
import {decodeStorage} from '../../domain/storageCodec';
import {readCollectionPages} from '../collections';
import {actor,allow,clean,encode,must,now,projectRef,recordRef,projectTransaction,writable} from './common';
import {writeManifest} from './manifests';
import {readProjectRecord,readOwnProfileRecord} from '../projectReadback';
import {restProjectTransaction} from './restTransaction';
// Reuse the existing bounded project-change manifest/lock/resume/rollback path.
// No new collection, Rules permission or remote runtime is introduced.
export async function beginAreaChange(pid:string,data:Record<string,unknown>,id:string){
 const input=areaChangeSchema.parse(data),u=await readOwnProfileRecord(),p=await readProjectRecord(pid) as Project;must(p,'ไม่พบโครงการ');allow(p,u,['admin','qs']);
 if(await readProjectRecord(pid,'operations',id))return restProjectTransaction('beginAreaChange',pid,data,id,['admin','qs'],async()=>{throw Error('Unexpected replay');});
 writable(p);must(p.version===input.version,'ข้อมูลโครงการเปลี่ยนแล้ว โหลดทะเบียนล่าสุดก่อนเริ่ม','aborted');
 const [members,stock,plans,exports,submissions]=await Promise.all(['members','stock','cutPlans','exportJobs','submissionJobs'].map(n=>readCollectionPages(pid,n)));must(members.length<=5000,'แบ่งโครงการ: เกิน 5,000 สมาชิก');
 must(!stock.some(s=>s.reserved>0)&&!plans.some(s=>s.status==='Reserved'),'มีสต็อกจองอยู่ ให้ดำเนินการหรือยกเลิกก่อนย้าย Zone/ชั้น');must(![...exports,...submissions].some(j=>j.status==='Generating'&&j.leaseUntil>Date.now()),'มีงานส่งออกกำลังสร้างไฟล์ ให้รอจนเสร็จก่อน');
 const plan=areaChangePlan(members as Member[],p.spec,input);must(plan.memberCount>0,'ไม่พบตำแหน่งตามชื่อเดิม','invalid-argument');const preparedAt=now();
 const changes=plan.pairs.map(e=>{const errors=validateMember(e.after,p.spec);must(!errors.length,`${e.before.code}: ${errors.join('\n')}`,'invalid-argument');return {...e,after:{...e.after,status:'Draft' as const,version:e.before.version+1,inputEpoch:id,updatedAt:preparedAt,bars:e.after.bars.map(b=>({...b,placementConfirmed:false}))}};});
 const areaChange={...input,version:1,versionBasis:input.version,memberCount:plan.memberCount,occurrenceCount:plan.occurrenceCount,quantity:plan.quantity,existingDestination:plan.existingDestination};
 const manifest={id,projectId:pid,sourceVersion:p.version,oldSpec:p.spec,newSpec:p.spec,preparedAt,areaChange,members:changes,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[]};
 const file=await writeManifest(pid,'spec-manifests',clean(manifest));
 return restProjectTransaction('beginAreaChange',pid,data,id,['admin','qs'],async(tx,current,user)=>{must(user.uid===u.uid,'ผู้ใช้เปลี่ยนระหว่างเตรียมงาน','aborted');must(current.version===p.version&&current.stockEpoch===p.stockEpoch,'ข้อมูลหรือสต็อกเปลี่ยนระหว่างเตรียมงาน','aborted');const state={id,status:'Applying' as const,completed:0,total:changes.length};const job={...state,manifest:file,sourceVersion:p.version,createdBy:u.uid,createdAt:preparedAt,targetSpec:p.spec,sourceScope:null,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[],sourceIntakeCount:0,sourceChangeCount:0,sourceAdoptionCount:0,memberIds:changes.map(e=>e.id),sourceIds:[],areaChange};tx.set(recordRef(pid,'specChangeJobs',id),encode(job));tx.update(projectRef(pid),{specChangeState:state,historyEpoch:id});return state;});
}
