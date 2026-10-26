import {guessLevel,locationIssues,locationTree,newLocationId,nextOrder,rootKinds,type LocationKind,type LocationNode,type Locations} from './locations';

// WBS import (Excel rows / IFC spatial structure) merged into the draft tree: match by IFC GlobalId, then by code under the
// same parent; matched nodes keep their id (member links stay valid), nothing is removed.
export type WbsImportRow={root:string;kind:LocationKind;code:string;name:string;
 /** room: code of its level */
 level?:string;elevation?:number;chainage?:{from:number;to:number};levels?:string[];ifcGuid?:string;note?:string;source:string};
export type WbsImportAction={row:WbsImportRow;action:'add'|'update'|'same';path:string;changes:string[]};

const kindWords:[LocationKind,RegExp][]=[['building',/^(building|bldg|อาคาร)$/i],['external',/^(external|ext|งานภายนอก|ภายนอก)$/i],['level',/^(level|storey|story|floor|ชั้น)$/i],['zone',/^(zone|โซน)$/i],['segment',/^(segment|line|ช่วง|สาย|ช่วง\s*\/\s*สาย)$/i],['room',/^(room|space|ห้อง)$/i]];
export const parseKind=(text:string):LocationKind|undefined=>kindWords.find(([,re])=>re.test(text.trim()))?.[0];
/** Code from free text (IFC / Excel names): A–Z 0–9 + . _ -, max 20. */
export const toCode=(text:string)=>text.toUpperCase().normalize('NFKD').replace(/[^A-Z0-9+._-]+/g,'-').replace(/^-+|-+$/g,'').replace(/-{2,}/g,'-').slice(0,20);

/** Tree → rows (export; also the Excel template). */
export function rowsFromLocations(l:Locations|undefined):WbsImportRow[]{
 const t=locationTree(l),rows:WbsImportRow[]=[],code=(id:string)=>t.byId.get(id)?.code||'';
 for(const r of t.roots){
  rows.push({root:r.code,kind:r.kind,code:r.code,name:r.name,ifcGuid:r.ifcGuid,note:r.note,source:''});
  for(const k of ['level','segment','zone'] as const)for(const n of t.children(r.id,k))rows.push({root:r.code,kind:k,code:n.code,name:n.name,elevation:n.elevation,chainage:n.chainage,levels:n.levels?.map(code).filter(Boolean),ifcGuid:n.ifcGuid,note:n.note,source:''});
  for(const lv of t.children(r.id,'level'))for(const n of t.children(lv.id,'room'))rows.push({root:r.code,kind:'room',level:lv.code,code:n.code,name:n.name,ifcGuid:n.ifcGuid,note:n.note,source:''});
 }
 return rows;
}

export function mergeWbsImport(current:Locations|undefined,rows:WbsImportRow[]){
 const nodes=(current?.nodes||[]).map(n=>({...n})),out:WbsImportAction[]=[],problems:string[]=[],rootOf=new Map<string,LocationNode>();
 const l=():Locations=>({version:current?.version||1,nodes});
 const byGuid=(g?:string)=>g?nodes.find(n=>n.ifcGuid===g):undefined;
 const findRoot=(code:string)=>nodes.find(n=>!n.parentId&&n.code.toUpperCase()===code.toUpperCase());
 const apply=(row:WbsImportRow,found:LocationNode|undefined,make:()=>LocationNode,path:string)=>{
  if(!found){const n=make();nodes.push(n);out.push({row,action:'add',path,changes:[]});return n;}
  const changes:string[]=[];const set=<K extends keyof LocationNode>(k:K,v:LocationNode[K]|undefined,label:string)=>{if(v===undefined||v===''||JSON.stringify(found[k])===JSON.stringify(v))return;changes.push(label);found[k]=v as LocationNode[K];};
  set('name',row.name,'ชื่อ');set('elevation',row.elevation,'ระดับ');set('chainage',row.chainage,'Chainage');set('ifcGuid',row.ifcGuid,'IFC');set('note',row.note,'หมายเหตุ');
  if(found.code!==row.code&&row.ifcGuid&&found.ifcGuid===row.ifcGuid)changes.push(`รหัสในโครงการ ${found.code} (คงไว้)`);
  out.push({row,action:changes.length?'update':'same',path,changes});return found;
 };
 // roots first (explicit rows, then roots named only by child rows)
 // roots in file order: the explicit root row, else an implicit building named by its first child row
 const rootRows=rows.filter(r=>rootKinds.includes(r.kind)),roots:WbsImportRow[]=[];
 for(const r of rows){const key=(rootKinds.includes(r.kind)?r.code:r.root).toUpperCase();if(roots.some(x=>x.code.toUpperCase()===key))continue;roots.push(rootRows.find(x=>x.code.toUpperCase()===key)||{root:r.root,kind:'building',code:r.root,name:'',source:r.source});}
 for(const r of roots){
  if(!r.code){problems.push(`${r.source}: ไม่มีรหัสอาคาร / งานภายนอก`);continue;}
  rootOf.set(r.code.toUpperCase(),apply(r,byGuid(r.ifcGuid)||findRoot(r.code),()=>({id:newLocationId(),kind:r.kind,parentId:null,code:r.code,name:r.name||(r.kind==='building'?`อาคาร ${r.code}`:'งานภายนอกอาคาร'),order:nextOrder(l(),null,r.kind),...(r.ifcGuid?{ifcGuid:r.ifcGuid}:{}),...(r.note?{note:r.note}:{})}),r.code));
 }
 const pendingLevels:[LocationNode,WbsImportRow][]=[];
 for(const r of rows.filter(r=>!rootKinds.includes(r.kind)&&r.kind!=='room')){
  const root=rootOf.get(r.root.toUpperCase());
  if(!root){problems.push(`${r.source}: ไม่พบ ${r.root}`);continue;}
  if(!r.code){problems.push(`${r.source}: ไม่มีรหัส`);continue;}
  const same=nodes.find(n=>n.parentId===root.id&&n.kind===r.kind&&n.code.toUpperCase()===r.code.toUpperCase());
  const n=apply(r,byGuid(r.ifcGuid)||same,()=>({id:newLocationId(),kind:r.kind,parentId:root.id,code:r.code,name:r.name,order:nextOrder(l(),root.id,r.kind),...(r.elevation!==undefined?{elevation:r.elevation}:{}),...(r.chainage?{chainage:r.chainage}:{}),...(r.ifcGuid?{ifcGuid:r.ifcGuid}:{}),...(r.note?{note:r.note}:{})}),`${root.code}-${r.code}`);
  if(r.kind==='zone'&&r.levels?.length)pendingLevels.push([n,r]);
 }
 // rooms under their level (by code), after every level exists
 for(const r of rows.filter(r=>r.kind==='room')){
  const root=rootOf.get(r.root.toUpperCase()),lv=root&&nodes.find(n=>n.parentId===root.id&&n.kind==='level'&&n.code.toUpperCase()===(r.level||'').toUpperCase());
  if(!root||!lv){problems.push(`${r.source}: ไม่พบชั้น ${r.level||'—'} ของห้อง ${r.code}${root?'':` (${r.root})`}`);continue;}
  if(!r.code){problems.push(`${r.source}: ไม่มีรหัสห้อง`);continue;}
  const same=nodes.find(n=>n.parentId===lv.id&&n.kind==='room'&&n.code.toUpperCase()===r.code.toUpperCase());
  apply(r,byGuid(r.ifcGuid)||same,()=>({id:newLocationId(),kind:'room',parentId:lv.id,code:r.code,name:r.name,order:nextOrder(l(),lv.id,'room'),...(r.ifcGuid?{ifcGuid:r.ifcGuid}:{}),...(r.note?{note:r.note}:{})}),`${root.code}-${lv.code}-${r.code}`);
 }
 // zone → levels by code, after every level exists
 for(const [z,r] of pendingLevels){
  const ids=r.levels!.map(c=>nodes.find(n=>n.parentId===z.parentId&&n.kind==='level'&&n.code.toUpperCase()===c.toUpperCase())?.id);
  if(ids.some(i=>!i)){problems.push(`${r.source}: โซน ${r.code} อ้างชั้นที่ไม่มี (${r.levels!.filter((_,i)=>!ids[i]).join(', ')})`);continue;}
  if(JSON.stringify(z.levels||[])!==JSON.stringify(ids)){z.levels=ids as string[];const a=out.find(x=>x.row===r);if(a&&a.action==='same'){a.action='update';a.changes.push('ชั้นที่ใช้');}}
 }
 const merged=l();problems.push(...locationIssues(merged));
 return {locations:merged,actions:out,problems,added:out.filter(a=>a.action==='add').length,updated:out.filter(a=>a.action==='update').length};
}

// ---------------------------------------------------------------- IFC spatial structure
export type IfcSpatial={buildings:{guid:string;name:string;longName:string;storeys:{guid:string;name:string;longName:string;elevation:number;spaces?:{guid:string;name:string;longName:string}[]}[]}[]};
/** IfcBuilding → building, IfcBuildingStorey → level (code from the storey name, elevation in mm), IfcSpace → room
 * (code from the space name / number, name from the long name). */
export function ifcRows(s:IfcSpatial):WbsImportRow[]{
 const rows:WbsImportRow[]=[],usedRoot=new Set<string>();
 s.buildings.forEach((b,i)=>{
  const label=b.name||b.longName,m=label.match(/^(?:building|bldg\.?|อาคาร)\s*[-_ ]?\s*(\S+)$/i);
  let code=toCode(m?m[1]:label)||String.fromCharCode(65+i%26);while(usedRoot.has(code))code=`${code}-${i+1}`.slice(0,20);usedRoot.add(code);
  rows.push({root:code,kind:'building',code,name:b.longName||b.name||`อาคาร ${code}`,ifcGuid:b.guid,source:`IFC ${label||code}`});
  const used=new Set<string>();
  for(const st of [...b.storeys].sort((a,b)=>a.elevation-b.elevation)){
   const name=st.name||st.longName;let c=guessLevel(name)?.code||toCode(name)||'LV';const base=c;for(let k=2;used.has(c);k++)c=`${base}-${k}`.slice(0,20);used.add(c);
   rows.push({root:code,kind:'level',code:c,name:st.longName&&st.longName!==name?`${name} · ${st.longName}`:name||c,elevation:Math.round(st.elevation),ifcGuid:st.guid,source:`IFC ${name||c}`});
   const usedRoom=new Set<string>();
   for(const sp of st.spaces||[]){let rc=toCode(sp.name||sp.longName)||'R';const b0=rc;for(let k=2;usedRoom.has(rc);k++)rc=`${b0}-${k}`.slice(0,20);usedRoom.add(rc);
    rows.push({root:code,kind:'room',level:c,code:rc,name:(sp.longName||sp.name||rc).slice(0,120),ifcGuid:sp.guid,source:`IFC ${sp.name||sp.longName||rc}`});}
  }
 });
 return rows;
}
