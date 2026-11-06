import {useEffect,useMemo,useState} from 'react';
import {collection,doc,getDoc,getDocs,onSnapshot,query,runTransaction,where} from 'firebase/firestore';
import {db} from './firebase';
import {decodeStorage} from '../domain/storageCodec';
import {centralTemplatesPath,elementTemplateSchema,nextTemplate,projectTemplatesPath,proposalSchema,templateMigrationPlan,templateProposalsPath,TEMPLATE_VERSIONS,withDefault,
 type ElementTemplate,type ListedTemplate,type TemplateLevel,type TemplatePayload,type TemplateProposal} from '../domain/elementTemplates';
import {displayName} from '../domain/auth';
import {profileMaster} from '../domain/authAccess';
import type {Category,Project} from '../domain/model';
import {actor,allow,encode,must,now,projectRef,projectTransaction} from './direct/common';

const parse=(d:{data:()=>unknown})=>{const r=elementTemplateSchema.safeParse(decodeStorage(d.data() as Record<string,unknown>));return r.success?[r.data]:[];};
const byName=(a:ElementTemplate,b:ElementTemplate)=>a.name.localeCompare(b.name,'th',{numeric:true});
const templateRef=(level:TemplateLevel,pid:string|undefined,id:string)=>level==='project'?doc(db,projectTemplatesPath(pid!),id):doc(db,centralTemplatesPath,id);
const versionRef=(level:TemplateLevel,pid:string|undefined,id:string,n:number)=>level==='project'?doc(db,projectTemplatesPath(pid!),id,TEMPLATE_VERSIONS,String(n)):doc(db,centralTemplatesPath,id,TEMPLATE_VERSIONS,String(n));
const denied=(e:{code?:string;message:string},what:string)=>e.code==='permission-denied'?`ยังอ่าน${what}ไม่ได้ · ตรวจสิทธิ์ (rules ใหม่ของ Template ต้อง deploy ก่อน)`:e.message;

/** Live template library of a project: its own templates (projects/{pid}/elementTemplates + old central documents with
 * scope 'project' of this project, until migrated) and the central ones; optionally one category. */
export function useTemplateLibrary(project:Pick<Project,'id'>|undefined,category?:Category){
 const [central,setCentral]=useState<ElementTemplate[]>([]),[own,setOwn]=useState<ElementTemplate[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState({c:false,p:false});
 useEffect(()=>onSnapshot(collection(db,centralTemplatesPath),s=>{setError(e=>e.startsWith('central:')?'':e);setCentral(s.docs.flatMap(parse));setLoaded(l=>({...l,c:true}));},
  e=>{setError('central:'+denied(e,' Template กลาง'));setLoaded(l=>({...l,c:true}));}),[]);
 useEffect(()=>{if(!project?.id){setOwn([]);setLoaded(l=>({...l,p:true}));return;}
  return onSnapshot(collection(db,projectTemplatesPath(project.id)),s=>{setOwn(s.docs.flatMap(parse));setLoaded(l=>({...l,p:true}));},
   e=>{setError('project:'+denied(e,' Template ของโครงการ'));setLoaded(l=>({...l,p:true}));});},[project?.id]);
 return useMemo(()=>{
  const ownIds=new Set(own.map(t=>t.id)),cat=(t:ElementTemplate)=>!category||t.category===category;
  const projectList:ListedTemplate[]=[...own.map(t=>({...t,level:'project' as const})),...central.filter(t=>t.scope==='project'&&t.projectId===project?.id&&!ownIds.has(t.id)).map(t=>({...t,level:'project' as const,legacy:true}))].filter(cat).sort(byName);
  const centralList:ListedTemplate[]=central.filter(t=>t.scope==='workspace').map(t=>({...t,level:'central' as const})).filter(cat).sort(byName);
  return {project:projectList,central:centralList,all:[...projectList,...centralList],legacyCount:central.filter(t=>t.scope==='project').length,error:error.replace(/^(central|project):/,''),loading:!loaded.c||!loaded.p};
 },[own,central,category,project?.id,error,loaded]);
}
/** @deprecated kept for older callers: project + central templates in one list */
export function useElementTemplates(project:Pick<Project,'id'>|undefined,category?:Category){const l=useTemplateLibrary(project,category);return {templates:l.all,error:l.error};}

export type SaveTemplateInput={level:TemplateLevel;project:Pick<Project,'id'|'code'>;id?:string;version?:number;name:string;description:string;tags?:string[];category:Category;payload:TemplatePayload;key?:string;setDefault?:boolean;origin?:ElementTemplate['origin']};
/** Create (no id) or save over (id + the stored version) a project template (admin / QS of the project) or a central one
 * (MasterAdmin). Saving over = version + 1 and the previous version kept in versions/{n}. `setDefault` (project level) also
 * makes it the project default for `key`. An old central document with scope 'project' is saved into the project. */
export async function saveTemplate(data:SaveTemplateInput,requestId=crypto.randomUUID()){
 const tid=data.id||crypto.randomUUID();
 if(data.level==='project'){
  const pid=data.project.id;
  return projectTransaction('saveElementTemplate',pid,{...data,payload:undefined,id:tid},requestId,['admin','qs'],async(tx,p,u)=>{
   const ref=templateRef('project',pid,tid),s=await tx.get(ref);let old=s.exists()?parse(s)[0]:undefined;
   if(!old&&data.id){const legacy=await tx.get(templateRef('central',undefined,tid));const l=legacy.exists()?parse(legacy)[0]:undefined;if(l?.scope==='project'&&l.projectId===pid)old=l;}
   if(data.id){must(old,'ไม่พบ Template');must(old.version===data.version,'Template ถูกแก้ไขโดยผู้อื่นแล้ว โหลดล่าสุดก่อนบันทึก','aborted');must(old.category===data.category,'หมวดของ Template ไม่ตรง','invalid-argument');}
   else must(!old,'รหัส Template ซ้ำ','aborted');
   const at=now(),{next,previous}=nextTemplate(old,{id:tid,name:data.name,description:data.description,category:data.category,level:'project',projectId:pid,projectCode:p.code,payload:data.payload,tags:data.tags,key:data.key,origin:data.origin},u.uid,at);
   if(previous)tx.set(versionRef('project',pid,tid,previous.version),encode(previous));
   tx.set(ref,encode(next));
   if(data.setDefault&&data.key)tx.update(projectRef(pid),encode({templateDefaults:withDefault(p.templateDefaults,data.key,tid),version:p.version+1}));
   return next;
  });
 }
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(profileMaster(u),'เฉพาะ MasterAdmin บันทึก Template กลางได้ · ใช้ “เสนอเข้า Template กลาง”','permission-denied');
  const ref=templateRef('central',undefined,tid),s=await tx.get(ref),old=s.exists()?parse(s)[0]:undefined;
  if(data.id){must(old&&old.scope==='workspace','ไม่พบ Template กลาง');must(old.version===data.version,'Template ถูกแก้ไขโดยผู้อื่นแล้ว โหลดล่าสุดก่อนบันทึก','aborted');}
  else must(!old,'รหัส Template ซ้ำ','aborted');
  const at=now(),{next,previous}=nextTemplate(old,{id:tid,name:data.name,description:data.description,category:data.category,level:'central',projectCode:data.project.code,payload:data.payload,tags:data.tags,key:data.key,origin:data.origin??{projectId:data.project.id,projectCode:data.project.code}},u.uid,at);
  if(previous)tx.set(versionRef('central',undefined,tid,previous.version),encode(previous));
  tx.set(ref,encode(next));return next;
 });
}
/** Delete a template (project: admin / QS, its defaults cleared; central: MasterAdmin). Stored versions stay (append-only). */
export async function deleteTemplate(t:ListedTemplate,pid:string,requestId=crypto.randomUUID()){
 if(t.level==='project'&&!t.legacy)return projectTransaction('deleteElementTemplate',pid,{id:t.id,version:t.version},requestId,['admin','qs'],async(tx,p)=>{
  const ref=templateRef('project',pid,t.id),s=await tx.get(ref);must(s.exists(),'ไม่พบ Template');must(parse(s)[0]?.version===t.version,'Template ถูกแก้ไขโดยผู้อื่นแล้ว','aborted');
  tx.delete(ref);const d=p.templateDefaults||{},keys=Object.keys(d).filter(k=>d[k]===t.id);
  if(keys.length)tx.update(projectRef(pid),encode({templateDefaults:keys.reduce((a,k)=>withDefault(a,k,null),d),version:p.version+1}));return {deleted:t.id};
 });
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(profileMaster(u),t.legacy?'Template เดิมที่ยังไม่ย้าย: ให้ MasterAdmin ย้ายเข้าโครงการก่อน (หน้า Admin)':'เฉพาะ MasterAdmin ลบ Template กลางได้','permission-denied');
  const ref=templateRef('central',undefined,t.id),s=await tx.get(ref);must(s.exists(),'ไม่พบ Template');must(parse(s)[0]?.version===t.version,'Template ถูกแก้ไขโดยผู้อื่นแล้ว','aborted');tx.delete(ref);return {deleted:t.id};
 });
}
/** Set (templateId) or clear (null) the project default of `key`. The template must be one of the project's or a central one. */
export async function setTemplateDefault(pid:string,key:string,templateId:string|null,version:number,requestId=crypto.randomUUID()){
 return projectTransaction('setTemplateDefault',pid,{key,templateId,version},requestId,['admin','qs'],async(tx,p)=>{
  must(p.version===version,'ข้อมูลเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนบันทึก','aborted');
  if(templateId){
   const own=await tx.get(templateRef('project',pid,templateId)),central=own.exists()?undefined:await tx.get(templateRef('central',undefined,templateId));
   const t=own.exists()?parse(own)[0]:central?.exists()?parse(central)[0]:undefined;
   must(t&&(own.exists()||t.scope==='workspace'||t.projectId===pid),'ใช้ได้เฉพาะ Template ของโครงการนี้หรือ Template กลาง','invalid-argument');
   must(key===t.category||key.startsWith(t.category+':'),'หมวดของ Template ไม่ตรงกับค่ามาตรฐาน','invalid-argument');
  }
  tx.update(projectRef(pid),encode({templateDefaults:withDefault(p.templateDefaults,key,templateId),version:p.version+1}));return {version:p.version+1};
 });
}

// ------------------------------------------------------------------ proposals to the central library
/** Propose a template for the central library (admin / QS of the source project). `targetCentralId` = ask for a new
 * version of that central template. */
export async function proposeTemplate(data:{project:Pick<Project,'id'|'code'>;name:string;description:string;tags?:string[];category:Category;payload:TemplatePayload;sourceTemplateId?:string;targetCentralId?:string}){
 const id=crypto.randomUUID();
 return runTransaction(db,async tx=>{
  const u=await actor(tx),ps=await tx.get(projectRef(data.project.id));must(ps.exists(),'ไม่พบโครงการ','not-found');const p=decodeStorage(ps.data()) as Project;allow(p,u,['admin','qs']);
  const next=proposalSchema.parse({id,status:'pending',uid:u.uid,email:u.email.toLowerCase(),proposerName:displayName(u).slice(0,200),projectId:p.id,projectCode:p.code,
   ...(data.sourceTemplateId?{sourceTemplateId:data.sourceTemplateId}:{}),...(data.targetCentralId?{targetCentralId:data.targetCentralId}:{}),
   name:data.name.trim(),description:data.description,category:data.category,...(data.tags?.length?{tags:data.tags}:{}),payload:data.payload,createdAt:now()});
  tx.set(doc(db,templateProposalsPath,id),encode(next));return next;
 });
}
const parseProposal=(d:{data:()=>unknown})=>{const r=proposalSchema.safeParse(decodeStorage(d.data() as Record<string,unknown>));return r.success?[r.data]:[];};
/** Proposals: the caller's own (uid) or, for MasterAdmin (`all`), every one; newest first. */
export function useProposals(uid:string|undefined,all=false){
 const [list,setList]=useState<TemplateProposal[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(!uid){setList([]);return;}const c=collection(db,templateProposalsPath);
  return onSnapshot(all?c:query(c,where('uid','==',uid)),s=>{setError('');setList(s.docs.flatMap(parseProposal).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));},e=>setError(denied(e,'คำขอ Template กลาง')));},[uid,all]);
 return {proposals:list,error};
}
/** MasterAdmin: approve (copy into the central library: a new template, or a new version of `targetCentralId`) or reject with a reason. */
export async function decideProposal(data:{id:string;approve:boolean;reason?:string;targetCentralId?:string|null}){
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(profileMaster(u),'เฉพาะ MasterAdmin พิจารณาคำขอได้','permission-denied');
  const ref=doc(db,templateProposalsPath,data.id),s=await tx.get(ref);must(s.exists(),'ไม่พบคำขอ','not-found');const p=parseProposal(s)[0];must(p,'คำขอไม่ถูกต้อง');must(p.status==='pending','คำขอนี้พิจารณาแล้ว','aborted');
  const at=now(),reason=(data.reason||'').trim().slice(0,500);
  if(!data.approve){must(reason,'ระบุเหตุผลที่ไม่อนุมัติ','invalid-argument');tx.update(ref,{status:'rejected',decidedAt:at,decidedBy:u.uid,reason});return {status:'rejected' as const};}
  const target=data.targetCentralId===null?undefined:data.targetCentralId||p.targetCentralId,cid=target||crypto.randomUUID(),cref=templateRef('central',undefined,cid),cs=await tx.get(cref),old=cs.exists()?parse(cs)[0]:undefined;
  if(target){must(old&&old.scope==='workspace','ไม่พบ Template กลางที่จะออกเวอร์ชันใหม่');must(old.category===p.category,'หมวดไม่ตรงกับ Template กลาง','invalid-argument');}else must(!old,'รหัส Template ซ้ำ','aborted');
  const {next,previous}=nextTemplate(old,{id:cid,name:target?old!.name:p.name,description:p.description,category:p.category,level:'central',projectCode:p.projectCode,payload:p.payload,tags:p.tags,
   origin:{proposalId:p.id,projectId:p.projectId,projectCode:p.projectCode,...(p.sourceTemplateId?{templateId:p.sourceTemplateId}:{})}},u.uid,at);
  if(previous)tx.set(versionRef('central',undefined,cid,previous.version),encode(previous));
  tx.set(cref,encode(next));tx.update(ref,{status:'approved',decidedAt:at,decidedBy:u.uid,centralId:cid,centralVersion:next.version,...(reason?{reason}:{})});
  return {status:'approved' as const,centralId:cid,version:next.version};
 });
}
/** Stored previous versions of a template (newest first). */
export async function templateVersions(t:ListedTemplate,pid:string){
 const c=t.level==='project'&&!t.legacy?collection(db,projectTemplatesPath(pid),t.id,TEMPLATE_VERSIONS):collection(db,centralTemplatesPath,t.id,TEMPLATE_VERSIONS);
 return (await getDocs(c)).docs.map(d=>decodeStorage(d.data() as Record<string,unknown>) as ElementTemplate&{supersededAt:string}).sort((a,b)=>b.version-a.version);
}

// ------------------------------------------------------------------ migration of old project-scoped central documents
/** MasterAdmin: move central documents with scope 'project' into projects/{pid}/elementTemplates (same id). Idempotent;
 * the originals are deleted only after every copy is in place. `dryRun` reports the plan only. */
export async function migrateLegacyTemplates(o:{dryRun?:boolean}={}){
 const u=await actor();must(profileMaster(u),'เฉพาะ MasterAdmin ย้าย Template ได้','permission-denied');
 const central=(await getDocs(collection(db,centralTemplatesPath))).docs.flatMap(parse),existing=new Map<string,ElementTemplate>();
 for(const t of central.filter(t=>t.scope==='project'&&t.projectId)){const s=await getDoc(templateRef('project',t.projectId,t.id));if(s.exists()){const e=parse(s)[0];if(e)existing.set(`${t.projectId}/${t.id}`,e);}}
 const plan=templateMigrationPlan(central,existing);
 const report={moved:plan.copy.length,skipped:plan.skip,conflicts:plan.conflicts.map(t=>`${t.projectCode||t.projectId} · ${t.name}`),deleted:0,keep:plan.keep,total:plan.move.length};
 if(o.dryRun)return report;
 for(const t of plan.copy)await runTransaction(db,async tx=>{
  const ref=templateRef('project',t.projectId,t.id),s=await tx.get(ref),e=s.exists()?parse(s)[0]:undefined;if(e&&e.version>=t.version)return;
  tx.set(ref,encode(elementTemplateSchema.parse({...t,scope:'project',origin:{...(t.origin||{}),migratedFrom:`${centralTemplatesPath}/${t.id}`}})));
 });
 // every original must now have its copy (same or newer version) before anything is deleted
 for(const t of plan.move){const s=await getDoc(templateRef('project',t.projectId,t.id)),e=s.exists()?parse(s)[0]:undefined;must(e&&e.version>=t.version,`ย้าย “${t.name}” ไม่สำเร็จ · ยังไม่ลบต้นฉบับ (กดย้ายใหม่ได้)`);}
 for(const t of plan.move)await runTransaction(db,async tx=>{const ref=templateRef('central',undefined,t.id),s=await tx.get(ref);if(!s.exists())return;const c=parse(s)[0];if(c?.scope!=='project')return;tx.delete(ref);report.deleted++;});
 return report;
}
