import {doc,getDoc,runTransaction,Transaction} from 'firebase/firestore';
import {auth,db} from '../firebase';
import {APP_NAME,userDocPath} from '../../domain/auth';
import {profileApproved,assignedRoles} from '../../domain/authAccess';
import type {UserProfile} from '../../domain/auth';
import type {Project,Role} from '../../domain/model';
import {decodeStorage,encodeStorage} from '../../domain/storageCodec';
import {digestData} from '../snapshots';

export const now=()=>new Date().toISOString();
export function fail(message:string,code='failed-precondition'):never {throw Object.assign(new Error(message),{code});}
export function must(condition:unknown,message:string,code?:string):asserts condition {if(!condition)fail(message,code);}
export const clean=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
export const encode=<T>(v:T)=>encodeStorage(clean(v));
export const projectRef=(pid:string)=>doc(db,'projects',pid);
export const recordRef=(pid:string,name:string,id:string)=>doc(db,'projects',pid,name,id);
export const directoryRef=(uid:string)=>doc(db,`${APP_NAME}/root/directory`,uid);
export const profileOperationRef=(id:string)=>doc(db,`${APP_NAME}/root/profileOperations`,id);
export function signedUser(){const u=auth.currentUser;must(u&&!u.isAnonymous&&u.email,'กรุณาเข้าสู่ระบบ','unauthenticated');return u;}
export async function actor(tx?:Transaction,allowPending=false){
 await auth.authStateReady();
 const u=signedUser(),r=doc(db,userDocPath(u.email!)),s=tx?await tx.get(r):await getDoc(r);
 must(s.exists(),'ไม่พบโปรไฟล์ผู้ใช้','permission-denied');const p=s.data() as UserProfile;
 must(p.uid===u.uid&&p.email.toLowerCase()===u.email!.toLowerCase()&&(allowPending||profileApproved(p,u.uid,u.email!)),'บัญชีหรือสิทธิ์ผู้ใช้ยังไม่ได้รับอนุมัติ','permission-denied');return p;
}
export function allow(p:Project,u:UserProfile,rs:Role[]){must(assignedRoles(u,p.id).some(r=>rs.includes(r)),'ไม่มีสิทธิ์ดำเนินการ','permission-denied');}
export function writable(p:Project){must(!['Importing','Cancelling'].includes(p.restoreState?.status||''),'โครงการกำลัง Restore ให้ทำต่อหรือยกเลิกจนเสร็จ');must(!['Applying','RollingBack'].includes(p.specChangeState?.status||''),'โครงการกำลังเปลี่ยนสเป็คหรือแบบ ให้ทำต่อหรือยกเลิกจนเสร็จ');}
export function directory(p:UserProfile){return {uid:p.uid,email:p.email,firstName:p.firstName,lastName:p.lastName,status:p.status,profileVersion:p.profileVersion||1};}
export async function projectTransaction<T>(action:string,pid:string,data:unknown,id:string,roles:Role[],body:(tx:Transaction,p:Project,u:UserProfile)=>Promise<T>,allowLocked=false){
 const inputHash=await digestData({action,pid,data});
 return runTransaction(db,async tx=>{
  const u=await actor(tx),pr=projectRef(pid),s=await tx.get(pr),or=recordRef(pid,'operations',id),op=await tx.get(or);
  must(s.exists(),'ไม่พบโครงการ','not-found');const p=decodeStorage(s.data()) as Project;allow(p,u,roles);
  if(op.exists()){const o=op.data();must(o.uid===u.uid&&o.action===action&&o.inputHash===inputHash,'รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว','aborted');return decodeStorage(o.result) as T;}
  must(!p.deleted,'โครงการถูกลบแล้ว · อ่านได้อย่างเดียว','failed-precondition');
  if(!allowLocked)writable(p);const result=await body(tx,p,u);
  tx.set(or,encode({id,action,uid:u.uid,inputHash,createdAt:now(),result}));return result;
 });
}
