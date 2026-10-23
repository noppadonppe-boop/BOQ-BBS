import {useEffect,useState} from 'react';
import {collection,doc,onSnapshot,runTransaction} from 'firebase/firestore';
import {z} from 'zod';
import {db} from './firebase';
import {decodeStorage} from '../domain/storageCodec';
import {beamRebarSchema} from '../domain/elementInput';
import {actor,encode,must,now} from './direct/common';

// Project beam mark table (beam details: one mark = b × h + END / MID / CON / CANT sections), entered once and
// copied into the spans of any beam group of the project. Spans keep their own copy, so bars never depend on it.
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const beamMarkSchema=z.object({id,mark:z.string().trim().min(1).max(32),width:z.number().finite().positive().max(10000),depth:z.number().finite().positive().max(10000),
 rebar:beamRebarSchema,note:z.string().max(300),version:z.number().int().min(1),updatedAt:z.string().max(40),updatedBy:z.string().max(128)}).strict();
export type BeamMark=z.infer<typeof beamMarkSchema>;
const path=(pid:string)=>collection(db,'projects',pid,'beamMarks');

export function useBeamMarks(pid:string){
 const [marks,setMarks]=useState<BeamMark[]>([]),[error,setError]=useState('');
 useEffect(()=>onSnapshot(path(pid),s=>{setError('');setMarks(s.docs.map(d=>beamMarkSchema.safeParse(decodeStorage(d.data()))).flatMap(r=>r.success?[r.data]:[]).sort((a,b)=>a.mark.localeCompare(b.mark,'en',{numeric:true})));},
  e=>setError(e.code==='permission-denied'?'ยังอ่านตารางเบอร์คานไม่ได้ · ผู้ดูแลระบบต้องเปิดสิทธิ์ Firestore ของ beamMarks':e.message)),[pid]);
 return {marks,error};
}
/** Save a mark (same mark text = update that document). */
export async function saveBeamMark(pid:string,data:{mark:string;width:number;depth:number;rebar:BeamMark['rebar'];note?:string},existing?:BeamMark){
 const mid=existing?.id||crypto.randomUUID();
 return runTransaction(db,async tx=>{
  const u=await actor(tx),ref=doc(db,'projects',pid,'beamMarks',mid),s=await tx.get(ref),old=s.exists()?decodeStorage(s.data()) as BeamMark:undefined;
  if(existing)must(old&&old.version===existing.version,'เบอร์คานถูกแก้ไขโดยผู้อื่นแล้ว โหลดล่าสุดก่อนบันทึก','aborted');
  const next=beamMarkSchema.parse({id:mid,mark:data.mark.trim(),width:data.width,depth:data.depth,rebar:data.rebar,note:data.note??old?.note??'',version:(old?.version||0)+1,updatedAt:now(),updatedBy:u.uid});
  tx.set(ref,encode(next));return next;
 });
}
export async function deleteBeamMark(pid:string,m:BeamMark){
 return runTransaction(db,async tx=>{await actor(tx);const ref=doc(db,'projects',pid,'beamMarks',m.id),s=await tx.get(ref);must(s.exists(),'ไม่พบเบอร์คาน');tx.delete(ref);});
}
