import {useEffect,useState} from 'react';
import {collection,doc,onSnapshot,runTransaction} from 'firebase/firestore';
import {db} from './firebase';
import {decodeStorage} from '../domain/storageCodec';
import {profileMaster,projectProfileRoles} from '../domain/authAccess';
import {specProfileInput,specProfilesPath,profileSpec,projectSpecFrom,designOf,type SpecProfile} from '../domain/specProfiles';
import type {Project,Spec} from '../domain/model';
import {canonical} from '../domain/canonical';
import {actor,encode,must,now} from './direct/common';
import {changeSpec} from './specChanges';

/** Live list of workspace General Spec profiles (newest first, archived last). */
export function useSpecProfiles(onError?:(message:string)=>void){
 const [profiles,setProfiles]=useState<SpecProfile[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>onSnapshot(collection(db,specProfilesPath),s=>{setProfiles(s.docs.map(d=>decodeStorage(d.data()) as SpecProfile).sort((a,b)=>Number(!!a.archived)-Number(!!b.archived)||a.name.localeCompare(b.name)));setLoading(false);},e=>{setLoading(false);onError?.(e.message);}),[]);
 return {profiles,loading};
}
const canManage=(u:Awaited<ReturnType<typeof actor>>)=>profileMaster(u)||projectProfileRoles(u.roles).includes('admin');

/** Create (no id) or update a profile; `version` must match the stored version. */
export async function saveSpecProfile(data:{id?:string;version?:number;name:string;description:string;spec:Spec;archived?:boolean}){
 const input=specProfileInput.parse({...data,spec:profileSpec(data.spec)}),id=data.id||crypto.randomUUID();
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(canManage(u),'เฉพาะผู้ดูแลระบบ / ผู้ดูแลโครงการแก้ไข General Spec ได้','permission-denied');
  const ref=doc(db,specProfilesPath,id),s=await tx.get(ref),old=s.exists()?decodeStorage(s.data()) as SpecProfile:undefined;
  if(data.id){must(old,'ไม่พบ Spec');must(old.version===data.version,'Spec ถูกแก้ไขโดยผู้อื่นแล้ว โหลดล่าสุดก่อนบันทึก','aborted');}
  else must(!old,'รหัส Spec ซ้ำ','aborted');
  const changed=!old||canonical(old.spec)!==canonical(input.spec)||old.name!==input.name;
  const next:SpecProfile={id,name:input.name,description:input.description,spec:input.spec,version:old?old.version+(changed?1:0):1,createdAt:old?.createdAt||now(),updatedAt:now(),updatedBy:u.uid,...(data.archived?{archived:true}:{})};
  tx.set(ref,encode(next));return next;
 });
}

/** Delete a profile; `version` must match the stored version. Callers must ensure no project links to it. */
export async function deleteSpecProfile(id:string,version:number){
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(canManage(u),'เฉพาะผู้ดูแลระบบ / ผู้ดูแลโครงการลบ General Spec ได้','permission-denied');
  const ref=doc(db,specProfilesPath,id),s=await tx.get(ref);must(s.exists(),'ไม่พบ Spec');
  must((decodeStorage(s.data()) as SpecProfile).version===version,'Spec ถูกแก้ไขโดยผู้อื่นแล้ว โหลดล่าสุดก่อนลบ','aborted');
  tx.delete(ref);
 });
}

/** Re-apply the latest profile to every linked project the user may change (live link).
 * Each project goes through the normal spec-change job (members → Draft, auto bars regenerated). */
export async function syncProjectsToProfile(profile:SpecProfile,projects:Project[],canChange:(p:Project)=>boolean,progress:(m:string)=>void,force=false){
 const linked=projects.filter(p=>p.spec.profileRef?.id===profile.id&&(force||p.spec.profileRef.version<profile.version));
 const done:string[]=[],skipped:string[]=[],failed:string[]=[];
 for(const p of linked){
  if(!canChange(p)||['Applying','RollingBack'].includes(p.specChangeState?.status||'')){skipped.push(p.code);continue;}
  try{progress(`อัปเดตโครงการ ${p.code} ตาม ${profile.name} v${profile.version}…`);await changeSpec(p.id,projectSpecFrom(profile,designOf(p.spec)),p.version,m=>progress(`${p.code}: ${m}`));done.push(p.code);}
  catch(e:any){failed.push(`${p.code} (${e.message||e})`);}
 }
 return {done,skipped,failed};
}
