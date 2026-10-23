import {useEffect,useState} from 'react';
import {collection,doc,onSnapshot,runTransaction} from 'firebase/firestore';
import {db} from './firebase';
import {decodeStorage} from '../domain/storageCodec';
import {elementTemplateSchema,elementTemplatesPath,type ElementTemplate,type TemplatePayload} from '../domain/elementTemplates';
import type {Category,Project} from '../domain/model';
import {actor,encode,must,now} from './direct/common';

/** Live list of element templates usable in `project` (workspace templates + this project's), optionally one category. */
export function useElementTemplates(project:Pick<Project,'id'>|undefined,category?:Category){
 const [all,setAll]=useState<ElementTemplate[]>([]),[error,setError]=useState('');
 useEffect(()=>onSnapshot(collection(db,elementTemplatesPath),s=>{setError('');setAll(s.docs.map(d=>elementTemplateSchema.safeParse(decodeStorage(d.data()))).flatMap(r=>r.success?[r.data]:[]));},
  e=>setError(e.code==='permission-denied'?'ยังอ่าน Template ไม่ได้ · ผู้ดูแลระบบต้องเปิดสิทธิ์ Firestore ของ elementTemplates':e.message)),[]);
 const templates=all.filter(t=>(t.scope==='workspace'||t.projectId===project?.id)&&(!category||t.category===category)).sort((a,b)=>a.name.localeCompare(b.name,'th',{numeric:true}));
 return {templates,error};
}

/** Create (no id) or update a template; `version` must match the stored version. */
export async function saveElementTemplate(data:{id?:string;version?:number;name:string;description:string;category:Category;scope:'workspace'|'project';project:Pick<Project,'id'|'code'>;payload:TemplatePayload}){
 const id=data.id||crypto.randomUUID();
 return runTransaction(db,async tx=>{
  const u=await actor(tx),ref=doc(db,elementTemplatesPath,id),s=await tx.get(ref),old=s.exists()?decodeStorage(s.data()) as ElementTemplate:undefined;
  if(data.id){must(old,'ไม่พบ Template');must(old.version===data.version,'Template ถูกแก้ไขโดยผู้อื่นแล้ว โหลดล่าสุดก่อนบันทึก','aborted');}
  else must(!old,'รหัส Template ซ้ำ','aborted');
  const next=elementTemplateSchema.parse({id,name:data.name.trim(),description:data.description,category:data.category,scope:data.scope,
   ...(data.scope==='project'?{projectId:data.project.id,projectCode:data.project.code}:{}),payload:data.payload,
   version:old?old.version+1:1,createdAt:old?.createdAt||now(),updatedAt:now(),createdBy:old?.createdBy||u.uid,updatedBy:u.uid});
  tx.set(ref,encode(next));return next;
 });
}

export async function deleteElementTemplate(id:string,version:number){
 return runTransaction(db,async tx=>{
  await actor(tx);const ref=doc(db,elementTemplatesPath,id),s=await tx.get(ref);must(s.exists(),'ไม่พบ Template');
  must((decodeStorage(s.data()) as ElementTemplate).version===version,'Template ถูกแก้ไขโดยผู้อื่นแล้ว','aborted');
  tx.delete(ref);
 });
}
