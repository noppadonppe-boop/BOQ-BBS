import {ref,uploadBytes} from 'firebase/storage';
import {storage,command} from './firebase';
import {sha256} from './snapshots';
import {Attachment,RestoreState} from '../domain/model';
import {remapSourceLinks} from '../domain/sourceRevisions';
import {prepareBackup} from './backupInspection';
import {buildRestorePlan,type RestoreFileRef} from '../domain/restorePlan';
export type TransferProgress=(message:string)=>void;

export async function resumeRestore(projectId:string,jobId:string,progress:TransferProgress=()=>{},cancel=false){
 let state:RestoreState;
 do{state=await command(cancel?'cancelRestore':'advanceRestore',projectId,{jobId});progress(`${cancel?'ยกเลิก':'กู้คืน'} ${state.completed.toLocaleString()} / ${state.total.toLocaleString()} รายการ`);}while(state.status==='Importing'||state.status==='Cancelling');
 if(!cancel&&state.status==='Cancelled')throw Error('งาน Restore ถูกยกเลิกแล้ว');
 return state;
}
export async function restore(projectId:string,file:File,progress:TransferProgress=()=>{}){
 const {bundle,digest,fileHashes,historyRecords,checked,checkedHistory}=await prepareBackup(file,progress);
 progress('ตรวจสิทธิ์และโครงการว่างก่อนอัปโหลด…');const targetAnchor=await(await import('./direct/restoreJobs')).inspectRestoreTarget(projectId);
 const attachmentIds:Record<string,string>={},archiveId=crypto.randomUUID(),jobId=crypto.randomUUID();let uploaded=0;
 const restored:Attachment[]=checked.map(({a,pages})=>{const id=crypto.randomUUID();attachmentIds[a.id]=id;return {...a,id,path:`projects/${projectId}/files/${id}/${a.name}`,pageCount:pages,sha256:fileHashes[a.id]};});
 const mapped=restored.map(a=>remapSourceLinks(a,attachmentIds));
 const historyFileRefs:RestoreFileRef[]=checkedHistory.map(({f})=>({originalPath:f.originalPath||f.path,path:`projects/${projectId}/archive/${archiveId}/${crypto.randomUUID()}/${f.name}`,name:f.name,size:f.size,contentType:f.contentType,sha256:f.sha256}));
 buildRestorePlan(bundle,mapped,historyRecords,historyFileRefs,jobId,new Date().toISOString(),attachmentIds);
 const body=new Blob([JSON.stringify({bundle,bundleDigest:digest,attachments:mapped,attachmentIds,fileHashes,historyRecords,historyFileRefs})],{type:'application/json'});if(body.size>20*1024*1024)throw Error('แบ่ง Backup: ข้อมูลกู้คืนเกิน20MB');
 for(const [i,{a,blob}] of checked.entries()){await uploadBytes(ref(storage,restored[i].path),blob,{contentType:a.contentType});progress(`อัปโหลดไฟล์ ${++uploaded}/${checked.length+checkedHistory.length}`);}
 for(const [i,{f,blob}] of checkedHistory.entries()){await uploadBytes(ref(storage,historyFileRefs[i].path),blob,{contentType:f.contentType});progress(`อัปโหลดไฟล์ ${++uploaded}/${checked.length+checkedHistory.length}`);}
 const path=`projects/${projectId}/archive/${archiveId}/${crypto.randomUUID()}/restore.json`,manifest={path,name:'restore.json',size:body.size,contentType:'application/json',sha256:await sha256(await body.arrayBuffer())};
 await uploadBytes(ref(storage,path),body,{contentType:'application/json'});progress('ตรวจข้อมูลและไฟล์ก่อนเริ่มกู้คืน…');
 const state=await command('beginRestore',projectId,{manifest,targetAnchor},jobId);return resumeRestore(projectId,state.id,progress);
}
