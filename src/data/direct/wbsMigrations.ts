import type {Member,Project} from '../../domain/model';
import {wbsMigrationSchema,wbsMigrationPlan} from '../../domain/wbsMigration';
import {validateMember} from '../../domain/engine';
import {readCollectionPages} from '../collections';
import {readProjectRecord,readOwnProfileRecord} from '../projectReadback';
import {restProjectTransaction} from './restTransaction';
import {writeManifest} from './manifests';
import {allow,clean,encode,must,now,projectRef,recordRef,writable} from './common';
// Member migration into project.locations through the bounded spec-change manifest / resume / rollback path.
export async function beginWbsMigration(pid:string,data:Record<string,unknown>,id:string){
 const input=wbsMigrationSchema.parse(data),u=await readOwnProfileRecord(),p=await readProjectRecord(pid) as Project;must(p,'ไม่พบโครงการ');allow(p,u,['admin','qs']);
 if(await readProjectRecord(pid,'operations',id))return restProjectTransaction('beginWbsMigration',pid,data,id,['admin','qs'],async()=>{throw Error('Unexpected replay');});
 writable(p);must(p.version===input.version&&(p.locations?.version||0)===input.locationsVersion,'ข้อมูลโครงการหรือ WBS เปลี่ยนแล้ว เปิดตัวช่วยย้ายข้อมูลใหม่','aborted');
 const [members,stock,plans,exports,submissions]=await Promise.all(['members','stock','cutPlans','exportJobs','submissionJobs'].map(n=>readCollectionPages(pid,n)));must(members.length<=5000,'แบ่งโครงการ: เกิน 5,000 สมาชิก');
 must(!stock.some(s=>s.reserved>0)&&!plans.some(s=>s.status==='Reserved'),'มีสต็อกจองอยู่ ให้ดำเนินการหรือยกเลิกก่อนย้ายข้อมูลเข้า WBS');must(![...exports,...submissions].some(j=>j.status==='Generating'&&j.leaseUntil>Date.now()),'มีงานส่งออกกำลังสร้างไฟล์ ให้รอจนเสร็จ');
 const plan=wbsMigrationPlan(members as Member[],p.locations,p.spec,input);must(plan.memberCount>0,'ไม่มีตำแหน่งที่ต้องย้าย','invalid-argument');const preparedAt=now();
 // loc only: member keeps its review status; changed zone / floor text restarts review like a Zone / floor rename
 const changes=plan.pairs.map(({relabelled,...e})=>{const errors=validateMember(e.after,p.spec);must(!errors.length,`${e.before.code}: ${errors.join('\n')}`,'invalid-argument');return {...e,after:{...e.after,version:e.before.version+1,inputEpoch:id,updatedAt:preparedAt,...(relabelled?{status:'Draft' as const,bars:e.after.bars.map(b=>({...b,placementConfirmed:false}))}:{})}};});
 const wbsChange={version:1,locationsVersion:input.locationsVersion,relabel:input.relabel,onlyUnlinked:input.onlyUnlinked,note:input.note,comboCount:input.combos.filter(c=>c.loc.building).length,memberCount:plan.memberCount,rowCount:plan.rowCount,relabelledCount:plan.relabelledCount,quantity:plan.quantity};
 const manifest={id,projectId:pid,sourceVersion:p.version,oldSpec:p.spec,newSpec:p.spec,preparedAt,wbsChange,members:changes,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[]};
 const file=await writeManifest(pid,'spec-manifests',clean(manifest));
 return restProjectTransaction('beginWbsMigration',pid,data,id,['admin','qs'],async(tx,current,user)=>{must(user.uid===u.uid,'ผู้ใช้เปลี่ยนระหว่างเตรียมงาน','aborted');must(current.version===p.version&&current.stockEpoch===p.stockEpoch,'ข้อมูลหรือสต็อกเปลี่ยนระหว่างเตรียมงาน','aborted');const state={id,status:'Applying' as const,completed:0,total:changes.length};tx.set(recordRef(pid,'specChangeJobs',id),encode({...state,manifest:file,sourceVersion:p.version,createdBy:u.uid,createdAt:preparedAt,targetSpec:p.spec,sourceScope:null,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[],sourceIntakeCount:0,sourceChangeCount:0,sourceAdoptionCount:0,memberIds:changes.map(e=>e.id),sourceIds:[],wbsChange}));tx.update(projectRef(pid),{specChangeState:state,historyEpoch:id});return state;});
}
