import {useEffect,useState,useRef} from 'react';
import {collection,documentId,onSnapshot,query,where} from 'firebase/firestore';
import {db} from './firebase';
import type {UserProfile} from '../domain/auth';
import type {Project} from '../domain/model';
import {decodeStorage} from '../domain/storageCodec';
import {profileMaster} from '../domain/authAccess';
import {readProjectRecord,readProjectDirectoryPage} from './projectReadback';
import {reconciledProject} from '../domain/projectReadback';
export function useAssignedProjects(uid:string|undefined,profile:UserProfile|null,onError:(message:string)=>void){
 const [state,setState]=useState<{key:string;projects:Project[];loading:boolean}>({key:'',projects:[],loading:true}),key=uid&&profile?.status==='approved'?JSON.stringify([uid,profileMaster(profile),profileMaster(profile)?[]:[...profile.assignedProjects].sort()]):'';
 const activeKey=useRef(key),verified=useRef(new Map<string,Project>());activeKey.current=key;
 useEffect(()=>{
  verified.current.clear();if(!key){setState({key,projects:[],loading:false});return;}
  const all=profileMaster(profile),ids=[...new Set(profile!.assignedProjects)].sort(),groups=all?[[]]:Array.from({length:Math.ceil(ids.length/20)},(_,i)=>ids.slice(i*20,i*20+20)),values=new Map<number,Project[]>();let active=true,fallbackStarted=false,denied=false;
  const fallback=async()=>{if(fallbackStarted||!active)return;fallbackStarted=true;try{let projects:Project[]=[];if(all){let token:string|undefined;do{const page=await readProjectDirectoryPage(token);projects.push(...page.records);token=page.next;}while(token&&active);}else projects=(await Promise.all(ids.map(id=>readProjectRecord(id)))).filter(Boolean);if(active&&activeKey.current===key)setState({key,projects:projects.map(p=>reconciledProject(p,verified.current.get(p.id))),loading:false});}catch(e:any){if(active){denied=e.code==='permission-denied'||e.code==='unauthenticated';setState({key,projects:[],loading:false});onError(e.message);}}};
  setState({key,projects:[],loading:!!groups.length});
  const timer=setTimeout(()=>{if(values.size<groups.length)void fallback();},10000);
  const stops=groups.map((ids,i)=>onSnapshot(all?query(collection(db,'projects')):query(collection(db,'projects'),where(documentId(),'in',ids)),snapshot=>{if(!active||denied)return;values.set(i,snapshot.docs.map(d=>decodeStorage(d.data()) as Project));setState({key,projects:[...values.values()].flat().map(p=>reconciledProject(p,verified.current.get(p.id))),loading:values.size<groups.length});},()=>{if(active)void fallback();}));
  return()=>{active=false;clearTimeout(timer);stops.forEach(stop=>stop());};
 },[key]);
 const refresh=async(pid:string)=>{const expected=key;if(!expected)return;try{const p=await readProjectRecord(pid) as Project|undefined;if(activeKey.current!==expected)return;if(p){verified.current.set(pid,p);setState(s=>s.key===expected?{...s,projects:s.projects.map(x=>x.id===pid?p:x)}:s);}else setState(s=>({...s,projects:s.projects.filter(x=>x.id!==pid)}));}catch(e:any){if(activeKey.current!==expected)return;if(e.code==='permission-denied')setState(s=>({...s,projects:s.projects.filter(x=>x.id!==pid)}));throw e;}};
 return {...(state.key===key?state:{key,projects:[],loading:!!key}),refresh};
}
