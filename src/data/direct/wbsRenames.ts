import type {Member,Project} from '../../domain/model';
import {wbsRenameSchema,wbsRenamePlan} from '../../domain/wbsRename';
import {validateMember} from '../../domain/engine';
import {readCollectionPages} from '../collections';
import {readProjectRecord,readOwnProfileRecord} from '../projectReadback';
import {restProjectTransaction} from './restTransaction';
import {writeManifest} from './manifests';
import {allow,clean,encode,must,now,projectRef,recordRef,writable} from './common';
// WBS code rename: member labels through the spec-change job; the manifest's tree is written when the job completes.
export async function beginWbsRename(pid:string,data:Record<string,unknown>,id:string){
 const input=wbsRenameSchema.parse(data),u=await readOwnProfileRecord(),p=await readProjectRecord(pid) as Project;must(p,'ไม่พบโครงการ');allow(p,u,['admin','qs']);
 if(await readProjectRecord(pid,'operations',id))return restProjectTransaction('beginWbsRename',pid,data,id,['admin','qs'],async()=>{throw Error('Unexpected replay');});
 writable(p);must(p.version===input.version&&(p.locations?.version||0)===input.locationsVersion,'ข้อมูลโครงการหรือ WBS เปลี่ยนแล้ว เปิดหน้าต่างเปลี่ยนรหัสใหม่','aborted');
 const [members,stock,plans,exports,submissions]=await Promise.all(['members','stock','cutPlans','exportJobs','submissionJobs'].map(n=>readCollectionPages(pid,n)));must(members.length<=5000,'แบ่งโครงการ: เกิน 5,000 สมาชิก');
 must(!stock.some(s=>s.reserved>0)&&!plans.some(s=>s.status==='Reserved'),'มีสต็อกจองอยู่ ให้ดำเนินการหรือยกเลิกก่อนเปลี่ยนรหัส WBS');must(![...exports,...submissions].some(j=>j.status==='Generating'&&j.leaseUntil>Date.now()),'มีงานส่งออกกำลังสร้างไฟล์ ให้รอจนเสร็จ');
 const plan=wbsRenamePlan(members as Member[],p.locations,input);const preparedAt=now();
 // building label only: status kept; zone / floor text changed: review restarts like a Zone / floor rename
 const changes=plan.pairs.map(({relabelled,...e})=>{const errors=validateMember(e.after,p.spec);must(!errors.length,`${e.before.code}: ${errors.join('\n')}`,'invalid-argument');return {...e,after:{...e.after,version:e.before.version+1,inputEpoch:id,updatedAt:preparedAt,...(relabelled?{status:'Draft' as const,bars:e.after.bars.map(b=>({...b,placementConfirmed:false}))}:{})}};});
 const wbsRename={version:1,nodeId:plan.node.id,kind:plan.node.kind,from:plan.path+plan.from,to:plan.path+plan.to,note:input.note,memberCount:plan.memberCount,rowCount:plan.rowCount,relabelledCount:plan.relabelledCount};
 const manifest={id,projectId:pid,sourceVersion:p.version,oldSpec:p.spec,newSpec:p.spec,preparedAt,wbsRename,locations:plan.locations,members:changes,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[]};
 const file=await writeManifest(pid,'spec-manifests',clean(manifest));
 return restProjectTransaction('beginWbsRename',pid,data,id,['admin','qs'],async(tx,current,user)=>{must(user.uid===u.uid,'ผู้ใช้เปลี่ยนระหว่างเตรียมงาน','aborted');must(current.version===p.version&&current.stockEpoch===p.stockEpoch&&(current.locations?.version||0)===input.locationsVersion,'ข้อมูลหรือสต็อกเปลี่ยนระหว่างเตรียมงาน','aborted');const state={id,status:'Applying' as const,completed:0,total:changes.length};tx.set(recordRef(pid,'specChangeJobs',id),encode({...state,manifest:file,sourceVersion:p.version,createdBy:u.uid,createdAt:preparedAt,targetSpec:p.spec,sourceScope:null,sourceIntakes:[],sourceChanges:[],sourceAdoptions:[],sourceIntakeCount:0,sourceChangeCount:0,sourceAdoptionCount:0,memberIds:changes.map(e=>e.id),sourceIds:[],wbsRename}));tx.update(projectRef(pid),{specChangeState:state,historyEpoch:id});return state;});
}
