import {command} from './firebase';
import {Spec,SpecChangeState} from '../domain/model';
import {readProjectRecord} from './projectReadback';
import {auth} from './firebase';
async function specCommand(action:string,projectId:string,data:Record<string,unknown>){
 const requestId=crypto.randomUUID();
 try{
  if(!data.jobId)return await command(action,projectId,data,requestId);
  const uid=auth.currentUser?.uid,before=await readProjectRecord(projectId,'specChangeJobs',String(data.jobId));if(!before)throw Error('ไม่พบงานเปลี่ยนโครงการ');
  const pending=command(action,projectId,data,requestId).then(value=>({value})).catch(error=>({error}));
  for(;;){let timer:ReturnType<typeof setTimeout>|undefined;const wait=new Promise<{waiting:true}>(resolve=>{timer=setTimeout(()=>resolve({waiting:true}),20000);});let result;try{result=await Promise.race([pending,wait]);}finally{clearTimeout(timer);}if(auth.currentUser?.uid!==uid)throw Error('บัญชีเปลี่ยนระหว่างดำเนินงาน');if('value'in result)return result.value;
   if('error'in result&&!['unavailable','aborted','internal','deadline-exceeded'].includes(result.error.code))throw result.error;
   if(auth.currentUser?.uid!==uid)throw Error('บัญชีเปลี่ยนระหว่างดำเนินงาน');
   try{const job=await readProjectRecord(projectId,'specChangeJobs',String(data.jobId));if(job&&(job.status!==before.status||job.completed>before.completed||(job.rollbackCompleted||0)>(before.rollbackCompleted||0)||['Complete','Cancelled'].includes(job.status)))return {id:job.id,status:job.status,completed:job.status==='RollingBack'?job.rollbackCompleted||0:job.completed,total:job.status==='RollingBack'?job.rollbackTotal||0:job.total};}catch(e:any){if(['permission-denied','unauthenticated','aborted'].includes(e.code))throw e;}
   if('error'in result)throw result.error;
   // No confirmed change: keep awaiting the same live request, do not reissue it.
  }
 }catch(e:any){
  if(['internal','unavailable','deadline-exceeded'].includes(e.code))throw Error(action==='beginSpecChange'?'ยังยืนยันการเริ่มเปลี่ยนสเป็คไม่ได้ หากมีแถบความคืบหน้าให้กดทำต่อ หากไม่มีให้ลองบันทึกอีกครั้ง':'งานเปลี่ยนสเป็คหยุดก่อนเสร็จ ตรวจความคืบหน้าแล้วกดทำต่อ หรือคืนสเป็คเดิม');
  throw e;
 }
}
export async function resumeSpecChange(projectId:string,jobId:string,progress:(message:string)=>void=()=>{},cancel=false,label='เปลี่ยนสเป็ค'){
 let state:SpecChangeState;
 do{state=await specCommand(cancel?'cancelSpecChange':'advanceSpecChange',projectId,{jobId});await progress(`${state.status==='RollingBack'?'ย้อนกลับ':label} ${state.completed} / ${state.total} สมาชิก`);}while(['Applying','RollingBack'].includes(state.status));
 if(!cancel&&state.status==='Cancelled')throw Error('งานเปลี่ยนสเป็คถูกยกเลิกแล้ว');
 if(cancel&&state.status==='Complete')throw Error('เปลี่ยนสเป็คเสร็จแล้ว ไม่สามารถยกเลิกชุดนี้ได้');
 return state;
}
export async function changeSpec(projectId:string,spec:Spec,version:number,progress:(message:string)=>void=()=>{}){
 progress('ตรวจสมาชิกทั้งหมดกับสเป็คใหม่…');const state=await specCommand('beginSpecChange',projectId,{spec,version});return resumeSpecChange(projectId,state.id,progress);
}
