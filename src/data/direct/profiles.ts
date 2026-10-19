import {doc,runTransaction} from 'firebase/firestore';
import {db} from '../firebase';
import {userDocPath} from '../../domain/auth';
import type {UserProfile} from '../../domain/auth';
import type {Project,Role} from '../../domain/model';
import {profileMaster,projectProfileRoles} from '../../domain/authAccess';
import {digestData} from '../snapshots';
import {actor,directory,directoryRef,profileOperationRef,projectRef,recordRef,encode,must,now,clean} from './common';
import {adminProfilePatchSchema,ownProfilePatchSchema,setProfileProjectRoles} from '../../domain/profilePatch';

const mutable=['firstName','lastName','position','department','photoURL'] as const;
export async function updateDirectProfile(action:string,data:{profile:Partial<UserProfile>},requestId:string){
 const inputHash=await digestData({action,data}),master=action==='updateUserProfile';
 const parsed=(master?adminProfilePatchSchema:ownProfilePatchSchema).safeParse(data.profile);
 must(parsed.success,'ข้อมูลโปรไฟล์หรือสิทธิ์ไม่ถูกต้อง ตรวจ Role สถานะ รหัสโครงการ และเวอร์ชัน','invalid-argument');
 return runTransaction(db,async tx=>{
  const u=await actor(tx,!master);must(!master||profileMaster(u),'เฉพาะ MasterAdmin เท่านั้น','permission-denied');
  const or=profileOperationRef(requestId),os=await tx.get(or);if(os.exists()){must(os.data().uid===u.uid&&os.data().inputHash===inputHash,'รหัสคำขอถูกใช้แล้ว','aborted');return os.data().result;}
  const email=master?String(data.profile.email||'').trim().toLowerCase():u.email,tr=doc(db,userDocPath(email)),ts=await tx.get(tr);must(ts.exists(),'ไม่พบโปรไฟล์ผู้ใช้','not-found');
  const old=ts.data() as UserProfile,patch=parsed.data as Partial<UserProfile>;
  must(patch.profileVersion===(old.profileVersion||1),'ข้อมูลโปรไฟล์เปลี่ยนแล้ว กรุณาโหลดใหม่','aborted');
  const next={...old};for(const k of mutable){if(patch[k]!==undefined){must(typeof patch[k]==='string'&&patch[k]!.length<=(k==='photoURL'?2000:200),'ข้อมูลโปรไฟล์ยาวเกินกำหนด','invalid-argument');next[k]=patch[k];}}
  if(master){
   next.roles=patch.roles||old.roles;next.status=patch.status||old.status;next.assignedProjects=[...new Set(patch.assignedProjects||old.assignedProjects)].sort();
   must(next.roles.length>0&&next.roles.length<=9,'เลือก Role อย่างน้อยหนึ่งรายการ','invalid-argument');
   must(!old.isFirstUser||(next.status==='approved'&&next.roles.includes('MasterAdmin')),'ต้องคง MasterAdmin คนแรกที่อนุมัติแล้ว');
   must(u.uid!==old.uid||(next.status==='approved'&&next.roles.includes('MasterAdmin')),'ให้ผู้ดูแลอีกคนเปลี่ยนสิทธิ์ของคุณ');
   must(next.assignedProjects.length<=500,'มอบหมายได้ไม่เกิน 500 โครงการในบัญชีเดียว','invalid-argument');
   const ids=[...new Set([...old.assignedProjects,...next.assignedProjects])];
   must(ids.length<=160,'แบ่งการเปลี่ยนสิทธิ์เป็นชุดละไม่เกิน 160 โครงการ เพื่อบันทึกพร้อมประวัติในครั้งเดียว');
   const snapshots=await Promise.all(ids.map(id=>tx.get(projectRef(id))));
   next.projectRoles={};
   const globalChanged=JSON.stringify(next.roles)!==JSON.stringify(old.roles);
   for(const [i,s] of snapshots.entries()){
    const id=ids[i],assigned=next.status==='approved'&&next.assignedProjects.includes(id);
    must(s.exists()||!assigned,'ไม่พบโครงการที่มอบหมาย','not-found');if(!s.exists())continue;
    const p=s.data() as Project,effective=patch.projectRoles?.[id]||(!globalChanged&&old.projectRoles?.[id])||projectProfileRoles(next.roles),rs:Role[]=assigned?effective:[];
    if(next.assignedProjects.includes(id))setProfileProjectRoles(next.projectRoles!,id,effective.length?effective:projectProfileRoles(next.roles));
    const acl={...p.acl},roleSets={...(p.roleSets||{})};if(assigned){Object.defineProperty(acl,old.uid,{value:rs[0]||'viewer',enumerable:true,configurable:true,writable:true});Object.defineProperty(roleSets,old.uid,{value:rs.length?rs:['viewer'],enumerable:true,configurable:true,writable:true});}else{delete acl[old.uid];delete roleSets[old.uid];}
    must(Object.values(acl).includes('admin'),'ต้องมีผู้ดูแลโครงการอย่างน้อยหนึ่งคน');
    if(JSON.stringify(acl)!==JSON.stringify(p.acl)||JSON.stringify(roleSets)!==JSON.stringify(p.roleSets||{})){
     const beforeDigest=await digestData({acl:p.acl,roleSets:p.roleSets||{}}),afterDigest=await digestData({acl,roleSets});
     tx.update(s.ref,encode({acl,roleSets,version:p.version+1}));
     tx.set(recordRef(id,'accessEvents',requestId),encode({id:requestId,actorUid:u.uid,targetUid:old.uid,beforeRole:p.acl[old.uid]||null,afterRole:acl[old.uid]||null,beforeRoles:p.roleSets?.[old.uid]||[],afterRoles:roleSets[old.uid]||[],reason:'ปรับการอนุมัติ Role หรือโครงการจากหน้าจัดการผู้ใช้งาน',createdAt:now(),beforeDigest,afterDigest,legacy:false}));
    }
   }
   next.role=next.roles[0];
  }
  next.profileVersion=(old.profileVersion||1)+1;
  const update:Record<string,unknown>={profileVersion:next.profileVersion,updatedAt:now()};for(const k of mutable)if(next[k]!==undefined)update[k]=next[k];
  if(master)Object.assign(update,{roles:next.roles,role:next.role,status:next.status,assignedProjects:next.assignedProjects,projectRoles:next.projectRoles});
  tx.update(tr,update);tx.set(directoryRef(next.uid),directory(next));
  const result={profile:clean({...next,createdAt:undefined})};
  tx.set(or,encode({id:requestId,uid:u.uid,email:u.email,action,inputHash,createdAt:now(),result}));return result;
 });
}
