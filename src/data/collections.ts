import {useEffect,useRef,useState,useCallback} from 'react';
import {collection,doc,getDocFromServer,getDocsFromServer,query,where,orderBy,documentId,limit,startAfter,QueryDocumentSnapshot,DocumentData} from 'firebase/firestore';
import {db} from './firebase';
import {decodeStorage} from '../domain/storageCodec';
import {Project,Member,Attachment} from '../domain/model';
import {workspacePath} from '../domain/firebasePaths';
import {readProjectPage,readProjectRecord} from './projectReadback';

const PAGE_SIZE=50;
export async function readCollectionPages(pid:string,name:string,progress:(count:number)=>void=()=>{},active=()=>true){
 const records:any[]=[];let cursor:QueryDocumentSnapshot<DocumentData>|undefined,rest=false,token:string|undefined;
 while(active()){
  if(rest){const page=await readProjectPage(pid,name,token);if(!active())break;records.push(...page.records);progress(records.length);token=page.next;if(!token)break;continue;}
  const q=query(collection(db,`${workspacePath(pid)}/${name}`),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(PAGE_SIZE));let timer:ReturnType<typeof setTimeout>|undefined,page;
  try{page=await Promise.race([getDocsFromServer(q),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),10000);})]);}finally{clearTimeout(timer);}if(!active())break;
  if(!page){records.length=0;progress(0);rest=true;continue;}
  records.push(...page.docs.map(d=>decodeStorage(d.data())));progress(records.length);
  if(page.size<PAGE_SIZE)break;cursor=page.docs[page.docs.length-1];
 }
 return records;
}
export function useWorkspaceData(project:Project|undefined,onError:(message:string)=>void){
 const [data,setData]=useState<{pid:string;version:number;project:Project;members:Member[];attachments:Attachment[]}|null>(null),[loaded,setLoaded]=useState(0),[attempt,setAttempt]=useState(0);
 const restoring=['Importing','Cancelling'].includes(project?.restoreState?.status||''),changingSpec=['Applying','RollingBack'].includes(project?.specChangeState?.status||''),locked=restoring||changingSpec;
 useEffect(()=>{
  let active=true;setLoaded(0);if(!project||restoring){setData(null);return;}if(changingSpec)return;
  const basis=structuredClone(project),pid=basis.id,version=basis.version;
  Promise.all([readCollectionPages(pid,'members',n=>{if(active)setLoaded(n);},()=>active),readCollectionPages(pid,'attachments',()=>{},()=>active)]).then(async([members,attachments])=>{
   if(!active)return;const latest=await readProjectRecord(pid);if(active&&latest?.version===version&&!['Importing','Cancelling'].includes(latest?.restoreState?.status)&&!['Applying','RollingBack'].includes(latest?.specChangeState?.status))setData({pid,version,project:basis,members,attachments});
  }).catch(e=>{if(active)onError(e.message);});
  return ()=>{active=false;};
 },[project?.id,project?.version,locked,onError,attempt]);
 const ready=!!project&&!locked&&data?.pid===project.id&&data?.version===project.version;
 const available=!!project&&!restoring&&data?.pid===project.id;
 return {ready,available,project:available?data!.project:undefined,version:data?.version,loaded,refresh:()=>setAttempt(n=>n+1),members:available?data!.members:[],attachments:available?data!.attachments:[]};
}
export function useAllRecords(pid:string,name:string,epoch:unknown,enabled:boolean,onError:(message:string)=>void){
 const [records,setRecords]=useState<any[]>([]);
 useEffect(()=>{let active=true;setRecords([]);if(pid&&enabled)readCollectionPages(pid,name,()=>{},()=>active).then(r=>{if(active)setRecords(r);}).catch(e=>{if(active)onError(e.message);});return ()=>{active=false;};},[pid,name,epoch,enabled,onError]);
 return records;
}
export function usePagedRecords(pid:string,name:string,field:string,epoch:unknown,enabled:boolean,onError:(message:string)=>void){
 const [records,setRecords]=useState<any[]>([]),[loading,setLoading]=useState(false),[hasMore,setHasMore]=useState(false);
 const session=useRef<{generation:number;cursor?:QueryDocumentSnapshot<DocumentData>;busy:boolean;count:number;key:string}>({generation:0,busy:false,count:0,key:''});
 const fetchPage=useCallback(async(reset=false)=>{
  if(!pid||!enabled||(!reset&&session.current.busy))return;
  const key=pid+'/'+name+'/'+field,target=reset?Math.max(25,session.current.key===key?session.current.count:0):25;
  if(reset){const changed=session.current.key!==key;session.current={generation:session.current.generation+1,busy:false,count:changed?0:session.current.count,key};if(changed){setRecords([]);setHasMore(false);}}
  const generation=session.current.generation;session.current.busy=true;setLoading(true);
  try{let cursor=session.current.cursor,more=false;const fetched:any[]=[];
   do{const page=await getDocsFromServer(query(collection(db,`${workspacePath(pid)}/${name}`),...(name==='exportJobs'?[where('kind','in',['excel','drawing','boq','schedule','inventory-excel','inventory-pdf'])]:[]),orderBy(field,'desc'),orderBy(documentId(),'desc'),...(cursor?[startAfter(cursor)]:[]),limit(25)));if(generation!==session.current.generation)return;
    cursor=page.docs[page.size-1]||cursor;fetched.push(...page.docs.map(d=>decodeStorage(d.data())));more=page.size===25;
   }while(more&&fetched.length<target);
   session.current.cursor=cursor;session.current.count=reset?fetched.length:session.current.count+fetched.length;setRecords(r=>reset?fetched:[...r,...fetched]);setHasMore(more);
  }catch(e:any){if(generation===session.current.generation)onError(e.message);}finally{if(generation===session.current.generation){session.current.busy=false;setLoading(false);}}
 },[pid,name,field,enabled,onError]);
 useEffect(()=>{if(enabled&&pid)void fetchPage(true);else{session.current.generation++;session.current.busy=false;session.current.key='';session.current.count=0;setRecords([]);setHasMore(false);setLoading(false);}return ()=>{session.current.generation++;session.current.busy=false;};},[fetchPage,epoch]);
 return {records,loading,hasMore,loadMore:()=>fetchPage()};
}
