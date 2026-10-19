import {collection,doc,getDoc,getDocs,limit,orderBy,query,documentId,runTransaction,startAfter,FieldPath,arrayUnion,arrayRemove,increment,deleteField,QueryConstraint} from 'firebase/firestore';
import {db} from '../firebase';
import {APP_NAME,userDocPath} from '../../domain/auth';
import {Project,Role} from '../../domain/model';
import {profileMaster,projectProfileRoles} from '../../domain/authAccess';
import {planProjectAccess} from '../../domain/projectAccess';
import {digestData} from '../snapshots';
import {canonical} from '../../domain/canonical';
import {actor,allow,directoryRef,projectRef,recordRef,encode,must,now} from './common';

export const accessDigest=(p:Project)=>digestData({acl:p.acl,roleSets:p.roleSets||{}});
export async function listDirectAccess(pid:string,data:Record<string,any>){
 const u=await actor(),ps=await getDoc(projectRef(pid));must(ps.exists(),'ไม่พบโครงการ','not-found');const p=ps.data() as Project;allow(p,u,['admin']);const digest=await accessDigest(p);must(!data.expectedDigest||data.expectedDigest===digest,'สิทธิ์เปลี่ยนแล้ว โหลดทีมล่าสุด','aborted');
 const ids=Object.keys(p.acl).sort(),after=data.cursor?ids.indexOf(data.cursor)+1:0;must(!data.cursor||after>0,'ตำแหน่งหน้าไม่ถูกต้อง','invalid-argument');const page=ids.slice(after,after+50),ds=await Promise.all(page.map(id=>getDoc(directoryRef(id))));
 const users=page.map((uid,i)=>{const d=ds[i].exists()?ds[i].data():undefined;return {uid,role:p.acl[uid],roles:p.roleSets?.[uid]||[p.acl[uid]],email:d?.email,displayName:d?`${d.firstName||''} ${d.lastName||''}`.trim()||d.email:undefined,accountState:d?d.status==='approved'?'active':'disabled':'missing',self:uid===u.uid};});
 return {users,total:ids.length,digest,...(after+50<ids.length?{nextCursor:page.at(-1)}:{})};
}
export async function listDirectAccessEvents(pid:string,data:Record<string,any>){
 const u=await actor(),ps=await getDoc(projectRef(pid));must(ps.exists(),'ไม่พบโครงการ','not-found');allow(ps.data() as Project,u,['admin']);
 const constraints:QueryConstraint[]=[orderBy('createdAt','desc'),orderBy(documentId(),'desc'),limit(26)];if(data.cursor)constraints.splice(2,0,startAfter(data.cursor.at,data.cursor.id));
 const snap=await getDocs(query(collection(db,'projects',pid,'accessEvents'),...constraints)),events=snap.docs.slice(0,25).map(s=>s.data()),ids=[...new Set(events.flatMap(e=>[e.actorUid,e.targetUid]))],profiles=await Promise.all(ids.map(uid=>getDoc(directoryRef(uid))));
 const labels=new Map(ids.map((uid,i)=>{const p=profiles[i].data();return [uid,p?`${p.firstName||''} ${p.lastName||''}`.trim()||p.email:uid];})),last=events.at(-1);
 return {events:events.map(e=>({...e,actorLabel:labels.get(e.actorUid),targetLabel:labels.get(e.targetUid)})),...(snap.size>25&&last?{nextCursor:{at:last.createdAt,id:last.id}}:{})};
}
export async function setDirectAccess(pid:string,data:Record<string,any>,requestId:string){
 const initialActor=await actor(),initialProject=await getDoc(projectRef(pid));must(initialProject.exists(),'ไม่พบโครงการ','not-found');allow(initialProject.data() as Project,initialActor,['admin']);
 const inputHash=await digestData({action:'setProjectAccess',pid,data}),targetUid=data.target?.uid;
 must(!targetUid||typeof targetUid==='string'&&targetUid.length<=128&&!targetUid.includes('/'),'รหัสบัญชีไม่ถูกต้อง','invalid-argument');
 let targetDirectory;if(targetUid)targetDirectory=directoryRef(targetUid);else{
  const email=String(data.target?.email||'').trim().toLowerCase();must(email,'ระบุอีเมลผู้ใช้','invalid-argument');const s=await getDoc(doc(db,`${APP_NAME}/root/directoryEmails`,email));must(s.exists(),'ไม่พบบัญชีที่สมัครแล้ว','not-found');targetDirectory=directoryRef(s.data().uid);
 }
 return runTransaction(db,async tx=>{
  const u=await actor(tx),pr=projectRef(pid),ps=await tx.get(pr),or=recordRef(pid,'operations',requestId),os=await tx.get(or),ds=await tx.get(targetDirectory!);
  must(ps.exists(),'ไม่พบโครงการ','not-found');const p=ps.data() as Project;allow(p,u,['admin']);
  if(os.exists()){must(os.data().uid===u.uid&&os.data().inputHash===inputHash,'รหัสคำขอถูกใช้กับข้อมูลอื่น','aborted');return os.data().result;}
  const target=ds.exists()?ds.data():data.role==='remove'&&targetUid&&Object.hasOwn(p.acl,targetUid)?{uid:targetUid}:undefined;must(target,'ไม่พบบัญชีที่สมัครแล้ว','not-found');must(data.role==='remove'||target.status==='approved','ต้องอนุมัติบัญชีก่อนมอบหมายโครงการ');
  must(typeof data.reason==='string'&&data.reason.trim().length>0&&data.reason.trim().length<=500,'ระบุเหตุผลการเปลี่ยนสิทธิ์','invalid-argument');
  const beforeDigest=await accessDigest(p);must(data.expectedDigest===beforeDigest,'สิทธิ์เปลี่ยนแล้ว โหลดทีมล่าสุดก่อนบันทึก','aborted');
  let change;try{change=planProjectAccess(p.acl,u.uid,target.uid,data.role,profileMaster(u));}catch(e){throw Object.assign(e as Error,{code:'failed-precondition'});}const roleSets={...(p.roleSets||{})};if(change.afterRole)Object.defineProperty(roleSets,target.uid,{value:[change.afterRole],enumerable:true,configurable:true,writable:true});else delete roleSets[target.uid];
  const changed=change.changed||canonical(p.roleSets?.[target.uid]||(change.beforeRole?[change.beforeRole]:[]))!==canonical(change.afterRole?[change.afterRole]:[]);
  const afterDigest=await accessDigest({...p,acl:change.acl as Record<string,Role>,roleSets}),result={changed,targetUid:target.uid,beforeRole:change.beforeRole,afterRole:change.afterRole,digest:afterDigest};
  if(changed){
   if(ds.exists()){
    const profileRef=doc(db,userDocPath(target.email));
    tx.update(profileRef,new FieldPath('assignedProjects'),change.afterRole?arrayUnion(pid):arrayRemove(pid),new FieldPath('projectRoles',pid),change.afterRole?[change.afterRole]:deleteField(),new FieldPath('profileVersion'),increment(1),new FieldPath('updatedAt'),now(),new FieldPath('accessChange'),{projectId:pid,operationId:requestId});
    tx.update(ds.ref,{profileVersion:(target.profileVersion||1)+1});
   }
   tx.update(pr,encode({acl:change.acl,roleSets,version:p.version+1}));
   tx.set(recordRef(pid,'accessEvents',requestId),encode({id:requestId,actorUid:u.uid,targetUid:target.uid,beforeRole:change.beforeRole,afterRole:change.afterRole,reason:data.reason.trim(),createdAt:now(),beforeDigest,afterDigest,legacy:!!data.legacy}));
  }
  tx.set(or,encode({id:requestId,action:'setProjectAccess',uid:u.uid,inputHash,createdAt:now(),result}));return result;
 });
}
