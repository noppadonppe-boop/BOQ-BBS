import {z} from 'zod';
import type {Member} from './model';

// Project Location / WBS tree: buildings and external works at the root, levels / zones (and segments of external works)
// below them. Flat list with parentId; levels and zones are independent dimensions of one building.
export const locationKinds=['building','external','level','zone','segment'] as const;
export type LocationKind=typeof locationKinds[number];
export const locationKindLabels:Record<LocationKind,string>={building:'อาคาร',external:'งานภายนอก',level:'ชั้น',zone:'โซน',segment:'ช่วง / สาย'};
export const rootKinds:LocationKind[]=['building','external'];
export const childKinds=(parent:LocationKind):LocationKind[]=>parent==='building'?['level','zone']:parent==='external'?['segment','zone','level']:[];
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const locationNodeSchema=z.object({
 id,kind:z.enum(locationKinds),parentId:id.nullable(),
 code:z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9+._-]+$/,'รหัสใช้ A–Z 0–9 + . _ - เท่านั้น'),
 name:z.string().trim().max(120),order:z.number().int().min(0).max(100000),
 elevation:z.number().finite().min(-1e6).max(1e6).optional(),   // level: SSL (mm)
 levels:z.array(id).max(300).optional(),                          // zone: levels it applies to (empty / absent = all)
 chainage:z.object({from:z.number().finite().min(0),to:z.number().finite().min(0)}).optional(), // segment (m)
 ifcGuid:z.string().max(64).optional(),archived:z.boolean().optional(),note:z.string().max(500).optional(),
}).strict();
export type LocationNode=z.infer<typeof locationNodeSchema>;
export const locationsSchema=z.object({version:z.number().int().nonnegative(),nodes:z.array(locationNodeSchema).max(3000)}).strict();
export type Locations=z.infer<typeof locationsSchema>;
/** Occurrence reference (ids are the truth; occurrence.zone / floor / building stay as label cache). */
export const occurrenceLocSchema=z.object({building:id.optional(),level:id.optional(),zone:id.optional(),segment:id.optional()}).strict();
export type OccurrenceLoc=z.infer<typeof occurrenceLocSchema>;
export const emptyLocations=():Locations=>({version:1,nodes:[]});

export function locationIssues(l:Locations):string[]{
 const out:string[]=[],by=new Map(l.nodes.map(n=>[n.id,n]));
 if(by.size!==l.nodes.length)out.push('มี id ซ้ำ');
 const seen=new Map<string,LocationNode>();
 for(const n of l.nodes){
  const p=n.parentId?by.get(n.parentId):undefined,where=p?`${p.code} / `:'';
  if(rootKinds.includes(n.kind)){if(n.parentId)out.push(`${n.code}: ${locationKindLabels[n.kind]}ต้องอยู่ระดับบนสุด`);}
  else if(!p)out.push(`${n.code}: ไม่พบอาคาร / งานภายนอกที่สังกัด`);
  else if(!childKinds(p.kind).includes(n.kind))out.push(`${where}${n.code}: ${locationKindLabels[p.kind]}ไม่มี${locationKindLabels[n.kind]}`);
  const key=`${n.parentId||''}|${rootKinds.includes(n.kind)?'root':n.kind}|${n.code.toUpperCase()}`;
  if(seen.has(key))out.push(`${where}${n.code}: รหัสซ้ำ`);seen.set(key,n);
  for(const lv of n.levels||[]){const x=by.get(lv);if(!x||x.kind!=='level'||x.parentId!==n.parentId){out.push(`${where}${n.code}: ชั้นที่ใช้กับโซนไม่อยู่ในอาคารเดียวกัน`);break;}}
  if(n.chainage&&n.chainage.to<n.chainage.from)out.push(`${where}${n.code}: Chainage ปลายน้อยกว่าต้น`);
 }
 return out;
}
export function parseLocations(raw:unknown):Locations{
 const l=locationsSchema.parse(raw),issues=locationIssues(l);if(issues.length)throw Error(issues.slice(0,5).join(' · '));return l;
}

const sortNodes=(a:LocationNode,b:LocationNode)=>a.kind==='level'&&b.kind==='level'&&a.elevation!==undefined&&b.elevation!==undefined&&a.elevation!==b.elevation?a.elevation-b.elevation:a.order-b.order||a.code.localeCompare(b.code,'en',{numeric:true});
export type LocationTree={byId:Map<string,LocationNode>;roots:LocationNode[];children:(parentId:string,kind?:LocationKind)=>LocationNode[]};
export function locationTree(l:Locations|undefined):LocationTree{
 const nodes=l?.nodes||[],byId=new Map(nodes.map(n=>[n.id,n])),kids=new Map<string,LocationNode[]>();
 for(const n of nodes)if(n.parentId){const a=kids.get(n.parentId)||[];a.push(n);kids.set(n.parentId,a);}
 for(const a of kids.values())a.sort(sortNodes);
 return {byId,roots:nodes.filter(n=>!n.parentId).sort(sortNodes),children:(p,kind)=>(kids.get(p)||[]).filter(n=>!kind||n.kind===kind)};
}
/** WBS code, e.g. A-L02-Z1 / EXT-ROAD-01. */
export function wbsCode(tree:LocationTree,loc:OccurrenceLoc|undefined):string{
 if(!loc)return '';return [loc.building,loc.level,loc.segment,loc.zone].map(i=>i&&tree.byId.get(i)?.code).filter(Boolean).join('-');
}
export function nodePath(tree:LocationTree,n:LocationNode):string{const p=n.parentId?tree.byId.get(n.parentId):undefined;return p?`${p.code}-${n.code}`:n.code;}

export const nextOrder=(l:Locations,parentId:string|null,kind:LocationKind)=>Math.max(-1,...l.nodes.filter(n=>n.parentId===parentId&&(n.kind===kind||!parentId)).map(n=>n.order))+1;
export const newLocationId=()=>crypto.randomUUID().replace(/-/g,'').slice(0,20);

export type LevelPlan={foundation:boolean;foundationElevation:number;basements:number;ground:boolean;floors:number;roof:boolean;groundElevation:number;storeyHeight:number;codeStyle:'L1'|'L01'|'1F'};
export const defaultLevelPlan:LevelPlan={foundation:true,foundationElevation:-1500,basements:0,ground:true,floors:3,roof:true,groundElevation:0,storeyHeight:3500,codeStyle:'L1'};
/** FDN, B2, B1, GF, L1 … Ln, RF from a storey height (mm); first suspended floor = ground + storey height. */
export function generateLevels(plan:LevelPlan,parentId:string,start=0):LocationNode[]{
 const out:Omit<LocationNode,'id'|'order'|'parentId'|'kind'>[]=[],h=plan.storeyHeight,g=plan.groundElevation;
 const floor=(k:number)=>plan.codeStyle==='L01'?`L${String(k).padStart(2,'0')}`:plan.codeStyle==='1F'?`${k}F`:`L${k}`;
 if(plan.foundation)out.push({code:'FDN',name:'ฐานราก',elevation:plan.foundationElevation});
 for(let b=plan.basements;b>=1;b--)out.push({code:`B${b}`,name:`ชั้นใต้ดิน ${b}`,elevation:g-b*h});
 if(plan.ground)out.push({code:'GF',name:'ชั้นล่าง',elevation:g});
 for(let k=1;k<=plan.floors;k++)out.push({code:floor(k),name:`ชั้น ${k}`,elevation:g+k*h});
 if(plan.roof)out.push({code:'RF',name:'หลังคา',elevation:g+(plan.floors+1)*h});
 return out.map((n,i)=>({...n,id:newLocationId(),kind:'level',parentId,order:start+i}));
}
/** Copy a building / external work with its levels, zones and segments (zone → level links remapped). */
export function copyRoot(l:Locations,sourceId:string,code:string,name:string):Locations{
 const src=l.nodes.find(n=>n.id===sourceId);if(!src||src.parentId)throw Error('ไม่พบอาคารต้นแบบ');
 const root={...src,id:newLocationId(),code,name,order:nextOrder(l,null,src.kind),ifcGuid:undefined,archived:undefined},map=new Map<string,string>();
 const kids=l.nodes.filter(n=>n.parentId===sourceId).map(n=>{const c={...n,id:newLocationId(),parentId:root.id,ifcGuid:undefined};map.set(n.id,c.id);return c;});
 return {...l,nodes:[...l.nodes,root,...kids.map(n=>n.levels?{...n,levels:n.levels.map(i=>map.get(i)!).filter(Boolean)}:n)]};
}
export function removeNode(l:Locations,nodeId:string):Locations{
 const gone=new Set([nodeId,...l.nodes.filter(n=>n.parentId===nodeId).map(n=>n.id)]);
 return {...l,nodes:l.nodes.filter(n=>!gone.has(n.id)).map(n=>n.levels?.some(i=>gone.has(i))?{...n,levels:n.levels.filter(i=>!gone.has(i))}:n)};
}
/** Swap order with the previous / next sibling of the same kind. */
export function moveNode(l:Locations,nodeId:string,dir:-1|1):Locations{
 const n=l.nodes.find(x=>x.id===nodeId);if(!n)return l;
 const t=locationTree(l),list=n.parentId?t.children(n.parentId,n.kind):t.roots,i=list.findIndex(x=>x.id===nodeId),j=i+dir;if(j<0||j>=list.length)return l;
 // renumber the siblings so equal / missing orders cannot keep the swap from showing
 const order=new Map(list.map((x,k)=>[x.id,k]));order.set(list[i].id,j);order.set(list[j].id,i);
 return {...l,nodes:l.nodes.map(x=>order.has(x.id)?{...x,order:order.get(x.id)!}:x)};
}

// Level labels as typed in old occurrences: FDN / B1 / GF / L1 / 1F / ชั้น 1 / RF …
export function guessLevel(label:string):{code:string;rank:number}|null{
 const s=label.trim().toUpperCase().replace(/\s+/g,'');if(!s)return null;
 if(/^(FDN|FD|F\.?D|FOUNDATION(LEVEL)?|FOOTING(LEVEL)?|ฐานราก|ฐาน)$/.test(s))return {code:'FDN',rank:-100};
 let m=s.match(/^B(\d{1,2})$/)||s.match(/^(?:ชั้นใต้ดิน|BASEMENT)(\d{1,2})$/);if(m)return {code:`B${+m[1]}`,rank:-Number(m[1])};
 if(/^(GF|G|G\.?F\.?|L0|0F|GROUND(FLOOR|LEVEL)?|ชั้นล่าง|ชั้นพื้นดิน)$/.test(s))return {code:'GF',rank:0};
 if(/^(RF|R|ROOF(FLOOR|LEVEL|DECK)?|หลังคา|ดาดฟ้า)$/.test(s))return {code:'RF',rank:1000};
 m=s.match(/^(?:L|LV|LEVEL|FL|ชั้น)?0*(\d{1,3})(?:F|FL)?$/);if(m)return {code:`L${+m[1]}`,rank:+m[1]};
 return null;
}
export type LocationSuggestion={locations:Locations;floors:{label:string;nodeId:string;count:number;guessed:boolean}[];zones:{label:string;nodeId:string;count:number}[]};
/** First tree from the free-text zone / floor values already used by the members (one building, code MAIN). */
export function suggestLocations(members:Pick<Member,'occurrences'>[],code='MAIN',name='อาคารหลัก'):LocationSuggestion{
 const count=(k:'zone'|'floor')=>{const c=new Map<string,number>();for(const m of members)for(const o of m.occurrences){const v=o[k].trim();if(v)c.set(v,(c.get(v)||0)+1);}return c;};
 const root:LocationNode={id:newLocationId(),kind:'building',parentId:null,code,name,order:0},nodes:LocationNode[]=[root],floors:LocationSuggestion['floors']=[],zones:LocationSuggestion['zones']=[];
 const byCode=new Map<string,LocationNode>(),levelRows=[...count('floor')].map(([label,n])=>({label,n,g:guessLevel(label)}));
 levelRows.sort((a,b)=>(a.g?.rank??5000)-(b.g?.rank??5000)||a.label.localeCompare(b.label,'th',{numeric:true}));
 for(const r of levelRows){
  const c=(r.g?.code||r.label.toUpperCase().replace(/[^A-Z0-9+._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,20))||`LV${byCode.size+1}`;
  let node=byCode.get('level:'+c);
  if(!node){node={id:newLocationId(),kind:'level',parentId:root.id,code:c,name:r.label,order:byCode.size};byCode.set('level:'+c,node);nodes.push(node);}
  floors.push({label:r.label,nodeId:node.id,count:r.n,guessed:!!r.g});
 }
 let z=0;
 for(const [label,n] of [...count('zone')].sort((a,b)=>a[0].localeCompare(b[0],'th',{numeric:true}))){
  const c=label.toUpperCase().replace(/[^A-Z0-9+._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,20)||`Z${z+1}`;
  let node=byCode.get('zone:'+c);
  if(!node){node={id:newLocationId(),kind:'zone',parentId:root.id,code:c,name:label,order:z++};byCode.set('zone:'+c,node);nodes.push(node);}
  zones.push({label,nodeId:node.id,count:n});
 }
 return {locations:{version:1,nodes},floors,zones};
}

export type LocationUsage={occurrences:number;members:number;quantity:number;byLabel:boolean};
/** Occurrences at a node: by id (occurrence.loc) or, before migration, by label = code in a project with one root. */
type Occ=Member['occurrences'][number];
/** Problems of an occurrence target (empty = valid; no building = not linked). */
export function locIssues(tree:LocationTree,loc:OccurrenceLoc):string[]{
 const out:string[]=[],b=loc.building?tree.byId.get(loc.building):undefined;
 if(!loc.building)return Object.values(loc).some(Boolean)?['เลือกอาคาร / งานภายนอกก่อน']:[];
 if(!b||b.parentId)return ['ไม่พบอาคาร / งานภายนอก'];
 for(const k of ['level','zone','segment'] as const){const id=loc[k];if(!id)continue;const n=tree.byId.get(id);if(!n||n.kind!==k||n.parentId!==b.id)out.push(`${k} ไม่อยู่ใน ${b.code}`);}
 const z=loc.zone?tree.byId.get(loc.zone):undefined;if(z?.levels?.length&&loc.level&&!z.levels.includes(loc.level))out.push(`โซน ${z.code} ไม่ได้ใช้กับชั้นนี้`);
 if(loc.level&&loc.segment)out.push('เลือกชั้นหรือช่วงอย่างใดอย่างหนึ่ง');
 return out;
}
/** Link an occurrence to WBS (or unlink with no building): labels follow the WBS codes so every report keeps working. */
export function withLoc(tree:LocationTree,o:Occ,loc:OccurrenceLoc):Occ{
 const clean=Object.fromEntries(Object.entries(loc).filter(([,v])=>v)) as OccurrenceLoc;
 if(!clean.building){const {loc:_l,building:_b,...rest}=o;return rest;}
 const code=(id?:string)=>id?tree.byId.get(id)?.code||'':'';
 return {...o,loc:clean,building:code(clean.building),floor:code(clean.level||clean.segment),zone:code(clean.zone)};
}
/** Free-text zone / floor edit on a linked row: drop the link so labels and loc never disagree. */
export function unlinkLoc<T extends Occ>(o:T):T{if(!o.loc&&o.building===undefined)return o;const {loc:_l,building:_b,...rest}=o;return rest as T;}
/** Same place in another project's tree by codes (building, level / segment, zone); parts without a match are dropped. */
export function mapLocByCode(from:LocationTree,to:LocationTree,loc:OccurrenceLoc|undefined):OccurrenceLoc{
 const b=loc?.building&&from.byId.get(loc.building),root=b&&to.roots.find(r=>r.code===b.code&&r.kind===b.kind&&!r.archived);if(!root)return {};
 const pick=(id:string|undefined,kind:'level'|'segment'|'zone')=>{const c=id&&from.byId.get(id)?.code;return c?to.children(root.id,kind).find(n=>n.code===c&&!n.archived)?.id:undefined;};
 return Object.fromEntries(Object.entries({building:root.id,level:pick(loc!.level,'level'),segment:pick(loc!.segment,'segment'),zone:pick(loc!.zone,'zone')}).filter(([,v])=>v)) as OccurrenceLoc;
}
/** Save-time check: linked occurrences must point at existing, consistent WBS nodes. */
export function occurrenceLocProblems(locations:Locations|undefined,occurrences:Occ[]):string[]{
 const tree=locationTree(locations);
 return occurrences.flatMap((o,i)=>o.loc?locIssues(tree,o.loc).map(s=>`ตำแหน่ง ${i+1}: ${s}`):[]);
}
// Report grouping by WBS: keys come from the occurrence ids only (coverage maps need no tree); labels / order from the tree.
export const wbsReportGroups=['Building','Level','WBS'] as const;
export const isWbsGroup=(group:string)=>(wbsReportGroups as readonly string[]).includes(group);
/** Group value of one occurrence for Zone / Floor (labels) and Building / Level / WBS (ids); 'Summary' otherwise. */
export function occurrenceGroup(group:string,o:Occ):string{
 if(group==='Zone')return o.zone;if(group==='Floor')return o.floor;
 const l=o.loc;if(!isWbsGroup(group))return 'Summary';if(!l?.building)return '';
 return group==='Building'?l.building:[l.building,l.level||l.segment||'',...(group==='WBS'?[l.zone||'']:[])].join('/');
}
/** Label + sort rank of a Building / Level / WBS group key. */
export function wbsGroupDisplay(tree:LocationTree,raw:string):{label:string;rank:number}{
 if(!raw)return {label:'ไม่ผูก WBS',rank:Number.MAX_SAFE_INTEGER};
 const [b,lv,z]=raw.split('/'),root=tree.byId.get(b),lvl=lv?tree.byId.get(lv):undefined,zone=z?tree.byId.get(z):undefined;
 if(!root)return {label:raw,rank:Number.MAX_SAFE_INTEGER-1};
 const kids=tree.children(root.id),line=[...kids.filter(n=>n.kind==='level'),...kids.filter(n=>n.kind==='segment')],zones=kids.filter(n=>n.kind==='zone');
 const code=[root.code,...(lv!==undefined?[lvl?.code||'—']:[]),...(z!==undefined&&zone?[zone.code]:[])].join('-');
 const names=[root.name,lvl?.name,zone?.name].filter(Boolean).join(' / ');
 const rank=tree.roots.indexOf(root)*1e6+(lvl?line.indexOf(lvl)+1:0)*1e3+(zone?zones.indexOf(zone)+1:0);
 return {label:names?`${code} · ${names}`:code,rank};
}
export function atLocation(tree:LocationTree,node:LocationNode,o:Occ):'id'|'label'|false{
 const loc=o.loc;
 if(loc)return (node.parentId?loc[node.kind as 'level'|'zone'|'segment']===node.id:loc.building===node.id||tree.children(node.id).some(k=>Object.values(loc).includes(k.id)))&&'id';
 if(tree.roots.length!==1)return false;if(!node.parentId)return 'label';
 const s=(node.kind==='level'?o.floor:node.kind==='zone'?o.zone:'').trim().toUpperCase();
 return !!s&&(s===node.code.toUpperCase()||s===node.name.trim().toUpperCase())&&'label';
}
export function locationUsage(tree:LocationTree,members:Pick<Member,'id'|'occurrences'>[],node:LocationNode):LocationUsage{
 const ids=new Set<string>(),u:LocationUsage={occurrences:0,members:0,quantity:0,byLabel:false};
 for(const m of members)for(const o of m.occurrences){const hit=atLocation(tree,node,o);if(!hit)continue;if(hit==='label')u.byLabel=true;u.occurrences++;u.quantity+=o.quantity;ids.add(m.id);}
 u.members=ids.size;return u;
}
