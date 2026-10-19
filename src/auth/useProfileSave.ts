import {useRef,useState} from 'react';
import {command} from '../data/firebase';
export function useProfileSave(action:string,run:(f:()=>Promise<unknown>,message?:string)=>Promise<void>,onClose:()=>void){
 const request=useRef<{id:string;payload:Record<string,unknown>}|undefined>(undefined),[saving,setSaving]=useState(false),[submitted,setSubmitted]=useState(false),[error,setError]=useState('');
 const reset=()=>{request.current=undefined;setSubmitted(false);setError('');};
 const save=async(payload:Record<string,unknown>)=>{
  if(saving)return;const pending=request.current||{id:crypto.randomUUID(),payload:JSON.parse(JSON.stringify(payload))};request.current=pending;setSaving(true);setSubmitted(true);setError('');
 try{await run(async()=>{try{await command(action,undefined,pending.payload,pending.id);onClose();}catch(e:any){setError(e.message||'บันทึกไม่สำเร็จ');if(['aborted','failed-precondition','invalid-argument','permission-denied'].includes(e.code)){request.current=undefined;setSubmitted(false);}throw e;}},'บันทึกโปรไฟล์แล้ว');}finally{setSaving(false);}
 };
 return {saving,submitted,error,save,reset};
}
