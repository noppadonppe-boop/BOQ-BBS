import {auth,db,emulator} from '../firebase';
import {decodeDocumentValue} from '../projectReadback';
import {userDocPath} from '../../domain/auth';
import {profileApproved} from '../../domain/authAccess';
import {decodeStorage} from '../../domain/storageCodec';
import {digestData} from '../snapshots';
import {allow,encode,must,now} from './common';
import type {Project,Role} from '../../domain/model';
export function documentFields(data:any):Record<string,any>{return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,documentValue(v)]));}
function documentValue(v:any):any{if(v===null)return {nullValue:null};if(Array.isArray(v))return {arrayValue:{values:v.map(documentValue)}};if(typeof v==='object')return {mapValue:{fields:documentFields(v)}};if(typeof v==='string')return {stringValue:v};if(typeof v==='boolean')return {booleanValue:v};if(typeof v==='number'){must(Number.isFinite(v),'ค่าจำนวนไม่ถูกต้อง');return Number.isSafeInteger(v)?{integerValue:String(v)}:{doubleValue:v};}throw Error('ชนิดข้อมูลเขียนไม่รองรับ');}
export async function restProjectTransaction<T>(action:string,pid:string,data:unknown,id:string,roles:Role[],body:(tx:any,p:Project,u:any)=>Promise<T>){
 const user=auth.currentUser;must(user&&!user.isAnonymous&&user.email,'กรุณาเข้าสู่ระบบ','unauthenticated');const uid=user.uid,token=await user.getIdToken(),project=db.app.options.projectId,root=`projects/${project}/databases/(default)/documents`,base=(emulator?`http://127.0.0.1:${Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT||8080)}`:'https://firestore.googleapis.com')+'/v1/'+root,inputHash=await digestData({action,pid,data});
 const request=async(method:string,payload:any)=>{must(auth.currentUser?.uid===uid,'บัญชีเปลี่ยนแล้ว','aborted');let response:Response;try{response=await fetch(base+':'+method,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});}catch{throw Object.assign(Error(`Firebase transaction ${method} รอคำตอบไม่สำเร็จ`),{code:'unavailable'});}must(auth.currentUser?.uid===uid,'บัญชีเปลี่ยนแล้ว','aborted');if(!response.ok){const error=await response.json().catch(()=>({}));throw Object.assign(Error(`Firebase transaction ${method} ไม่สำเร็จ (${response.status}${error.error?.status?' / '+error.error.status:''})`),{code:response.status===403?'permission-denied':response.status===409?'aborted':response.status===400?'invalid-argument':'unavailable'});}return response.json();};
 for(let attempt=0;attempt<5;attempt++){let transaction:string|undefined;try{
  transaction=(await request('beginTransaction',{})).transaction;must(transaction,'ไม่ได้รับรหัส transaction');const writes:any[]=[];
  const nameFor=(ref:{path:string},write=false)=>{must(ref.path===`projects/${pid}`||ref.path.startsWith(`projects/${pid}/`)||!write&&ref.path===userDocPath(user.email!),'เอกสารอยู่นอกโครงการ','permission-denied');must(!ref.path.split('/').some(s=>s==='.'||s==='..'),'รหัสเอกสารไม่ถูกต้อง');return root+'/'+ref.path;};
  const tx={getMany:async(refs:{path:string}[])=>{if(!refs.length)return [];const names=refs.map(r=>nameFor(r)),rows=await request('batchGet',{documents:names,transaction});return names.map(name=>{const row=rows.find((r:any)=>r.found?.name===name||r.missing===name);must(row,'เอกสารตอบกลับไม่ตรง transaction');return {exists:()=>!!row.found,data:()=>row.found?decodeDocumentValue({mapValue:{fields:row.found.fields}}):undefined};});},set:(ref:{path:string},value:any)=>writes.push({update:{name:nameFor(ref,true),fields:documentFields(value)}}),update:(ref:{path:string},value:any)=>writes.push({update:{name:nameFor(ref,true),fields:documentFields(value)},updateMask:{fieldPaths:Object.keys(value)}})};
  const get=async(ref:{path:string})=>(await tx.getMany([ref]))[0];
  const adapter={...tx,get};
  const profile=(await get({path:userDocPath(user.email!)})).data();must(profile&&profileApproved(profile,uid,user.email!)&&profile.uid===uid,'บัญชีหรือสิทธิ์ยังไม่ได้รับอนุมัติ','permission-denied');const pr={path:'projects/'+pid},ps=await get(pr);must(ps.exists(),'ไม่พบโครงการ','not-found');const p=decodeStorage(ps.data()) as Project;allow(p,profile,roles);const or={path:`projects/${pid}/operations/${id}`},op=await get(or);let result:T;
  if(op.exists()){const o=op.data();must(o.uid===uid&&o.action===action&&o.inputHash===inputHash,'รหัสคำขอถูกใช้กับข้อมูลอื่น','aborted');result=decodeStorage(o.result) as T;}
  else{result=await body(adapter,p,profile);tx.set(or,encode({id,action,uid,inputHash,createdAt:now(),result}));}
  await request('commit',{transaction,writes});return result;
 }catch(e:any){if(transaction&&auth.currentUser?.uid===uid)await request('rollback',{transaction}).catch(()=>{});if(attempt===4||!['aborted','unavailable'].includes(e.code))throw e;}}
 throw Error('ไม่สามารถยืนยัน transaction');
}
