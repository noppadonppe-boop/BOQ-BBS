// “สร้าง / อัปเดตคานจากแปลนพื้น” (S3): writes the beam-group members planned by `planFloorBeams` (domain/floorBeams.ts) in one
// project transaction — ≤ 25 members and ≤ 4 MiB per call, idempotent by request id (`projectTransaction`), admin / qs.
// New members must not exist; an existing one may only be overwritten when it is linked to this floor; the floor must still
// be at the version the plan was made from. Members are saved like saveMember (Draft, version + 1, review trail).
import {collection,getDoc,getDocs,limit,query,where} from 'firebase/firestore';
import {db} from '../firebase';
import {memberSchema,type Member} from '../../domain/model';
import {validateMember} from '../../domain/engine';
import {occurrenceLocProblems} from '../../domain/locations';
import {nextReview} from '../../domain/memberReview';
import {displayName} from '../../domain/auth';
import {decodeStorage} from '../../domain/storageCodec';
import {projectTransaction,recordRef,projectRef,encode,must,now} from './common';

export const FLOOR_BEAM_BATCH={members:25,bytes:4*1024*1024};
type BeamIn={floorSource?:{floorMember?:string}};
const linkOf=(m:Member)=>(m.elementInput as BeamIn|undefined)?.floorSource?.floorMember;

export async function syncFloorBeams(pid:string,data:Record<string,any>,requestId:string){
 must(typeof data.floorId==='string'&&Number.isSafeInteger(data.floorVersion),'ระบุแปลนพื้นและรุ่น','invalid-argument');
 must(Array.isArray(data.members)&&data.members.length>0,'ไม่มีคานที่ต้องสร้าง / อัปเดต','invalid-argument');
 must(data.members.length<=FLOOR_BEAM_BATCH.members,`สร้าง / อัปเดตได้ครั้งละไม่เกิน ${FLOOR_BEAM_BATCH.members} สมาชิก`,'invalid-argument');
 const members=(data.members as unknown[]).map(x=>memberSchema.parse(x)),floorId=data.floorId as string;
 for(const m of members){must(m.category==='Beam'&&linkOf(m)===floorId,`${m.code}: ไม่ใช่คานของแปลนพื้นนี้`,'invalid-argument');
  must(new TextEncoder().encode(JSON.stringify(encode(m))).length<700000,`${m.code}: ข้อมูลเกินขนาดเอกสาร 700 KB`,'invalid-argument');}
 must(new TextEncoder().encode(JSON.stringify(encode(members))).length<=FLOOR_BEAM_BATCH.bytes,'ข้อมูลเกิน 4 MiB ต่อครั้ง · แบ่งทำหลายครั้ง','invalid-argument');
 const codes=members.map(m=>m.code.toUpperCase());must(new Set(codes).size===codes.length,'รหัสสมาชิกซ้ำในชุดที่สร้าง','invalid-argument');
 // code uniqueness against the project (outside the transaction, as saveMember); replays skip it
 const op=await getDoc(recordRef(pid,'operations',requestId));
 if(!op.exists())for(const m of members){const d=await getDocs(query(collection(db,'projects',pid,'members'),where('code','==',m.code),limit(2)));must(!d.docs.some(s=>s.id!==m.id),`Member no. ${m.code} ซ้ำในโครงการ`,'invalid-argument');}
 return projectTransaction('syncFloorBeams',pid,data,requestId,['admin','qs'],async(tx,p,u)=>{
  if(data.expectedVersion!==undefined)must(data.expectedVersion===p.version,'รุ่นโครงการเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อน','aborted');
  const fs=await tx.get(recordRef(pid,'members',floorId));must(fs.exists(),'ไม่พบแปลนพื้น','not-found');
  const floor=decodeStorage(fs.data()) as Member;must(floor.category==='Slab'&&floor.version===data.floorVersion,'แปลนพื้นเปลี่ยนแล้ว · เปิดพรีวิวใหม่','aborted');
  const olds:(Member|undefined)[]=[];for(const m of members){const s=await tx.get(recordRef(pid,'members',m.id));olds.push(s.exists()?decodeStorage(s.data()) as Member:undefined);}
  const at=now(),actor={uid:u.uid,name:displayName(u)},out:{id:string;code:string;version:number;created:boolean}[]=[];
  members.forEach((m,k)=>{const old=olds[k];
   must((old?.version||0)===m.version,`${m.code}: ข้อมูลเปลี่ยนแล้ว · เปิดพรีวิวใหม่`,'aborted');
   if(old)must(old.category==='Beam'&&linkOf(old)===floorId,`${m.code}: สมาชิกนี้ไม่ได้สร้างจากแปลนพื้นนี้ · ไม่เขียนทับ`,'failed-precondition');
   const loc=occurrenceLocProblems(p.locations,m.occurrences);must(!loc.length,`${m.code}: ${loc.slice(0,2).join(' · ')}`,'invalid-argument');
   const errors=validateMember(m,p.spec);must(!errors.length,`${m.code}: ${errors.slice(0,3).join(' · ')}`,'invalid-argument');
   const review=nextReview(old?.review,{action:old?'Edited':'Created',from:old?.status||'',to:'Draft',actor,at,note:`จากแปลนพื้น ${floor.code} v${floor.version}`});
   const next={...m,status:'Draft',version:m.version+1,inputEpoch:requestId,updatedAt:at,review,bars:m.bars.map(b=>({...b,placementConfirmed:false,bsDimensionsConfirmed:false}))};
   tx.set(recordRef(pid,'members',m.id),encode(next));out.push({id:m.id,code:m.code,version:next.version,created:!old});});
  tx.update(projectRef(pid),{version:p.version+1});
  return {members:out,projectVersion:p.version+1};
 });
}
