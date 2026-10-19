import {blankMember,blankBar,currentStarterSpec,type Project} from '../src/domain/model';
const project=(id:string,density:number)=>({id,code:id,name:'COMPONENT QA ONLY',version:1,spec:{...currentStarterSpec,density},titleBlock:{company:'',drawingPrefix:'',drawnBy:'',checkedBy:''}} as Project);
const rows=(count:number)=>Array.from({length:count},(_,i)=>{const m=blankMember('Custom','C'+i);m.id='M'+String(i).padStart(3,'0');m.occurrences=[{id:'A',zone:'A',floor:'L1',grid:'',quantity:2},{id:'B',zone:'B',floor:'L2',grid:'',quantity:3}];if(i===0){m.bars=[{...blankBar('R1'),diameter:12,grade:'B500B',bsType:'T',shape:'polyline',points:[[100,100,100],[900,100,100]],shapeCode:'00',lengthMethod:'bs8666',start:0,end:0,count:1}];}else m.noRebar={version:1,basis:'Synthetic plain-concrete scope only'};return m;});
export const state={projects:new Map([['P',project('P',7850)],['Q',project('Q',7800)]]),members:new Map([['P',rows(57)],['Q',rows(1)]]),hold:new Set<string>(),release:[] as (()=>void)[],reads:[] as string[]};
export const db={};
export const doc=(_db:unknown,path:string)=>({path});
export const collection=doc;
export const orderBy=()=>({}),documentId=()=>'',where=()=>({}),limit=(n:number)=>({limit:n}),startAfter=(cursor:any)=>({after:cursor.id});
export const query=(ref:any,...args:any[])=>({...ref,...Object.assign({},...args)});
export async function getDocFromServer(ref:any){const p=state.projects.get(ref.path.split('/')[1]);return {exists:()=>!!p,data:()=>structuredClone(p)};}
export async function getDocsFromServer(ref:any){const pid=ref.path.split('/')[1],name=ref.path.split('/')[2];state.reads.push(ref.path);if(state.hold.has(pid))await new Promise<void>(resolve=>state.release.push(resolve));const all=name==='members'?state.members.get(pid)||[]:[],start=ref.after?all.findIndex(m=>m.id===ref.after)+1:0,list=all.slice(start,start+(ref.limit||50));return {size:list.length,docs:list.map(m=>({id:m.id,data:()=>structuredClone(m)}))};}
export const getDoc=getDocFromServer;
export async function readProjectRecord(pid:string){return structuredClone(state.projects.get(pid));}
export async function readProjectPage(pid:string,name:string,token?:string){const all=name==='members'?state.members.get(pid)||[]:[],start=Number(token||0);return {records:structuredClone(all.slice(start,start+50)),next:start+50<all.length?String(start+50):undefined};}
