import {blankBar,blankMember,memberSchema,type Bar,type Member,type Project,type Spec,type Vec3} from './model';
import type {OccurrenceLoc} from './locations';
import {locationTree,withLoc} from './locations';
import {applyShapeModel} from './shapeApply';
import type {ShapeModel,ShapePart} from './shapeModelSchema';
import {detectShapeCode,sketchRadius} from './rebarSketch';
import {validateMember,takeoff} from './engine';
import {DEFAULT_DETAILING,gradeFor} from './elementInput';
import {detailingFromSpec} from './specDetailing';
import {canonical} from './canonical';
import {frameOf,toLocal,toWorld,v3,type Frame,type IfcBarSet,type IfcElement,type IfcElemKind,type IfcModelData,type V3} from './ifcTypes';

// IFC (Revit / Tekla) → members with their bars, without AI. Hosts: footings (with pedestals merged and piles below),
// columns and beams. Bars go to their Tekla cast unit (assembly) or, by position, to the concrete element that holds
// most of them. Equal bars (same size and shape, only moved) are one Mark placed by offsets. Bars running on into
// neighbouring concrete (columns above, piles below, slabs) get reference regions so the cover / inside checks hold.

export type IfcHostBy='assembly'|'position';
export type IfcImportOptions={hostBy:IfcHostBy;mergeMarks:boolean;useIfcMarks:boolean;
 /** IFC storey name → WBS location (undefined = keep the storey name as the floor label) */
 storeyMap:Record<string,OccurrenceLoc|undefined>};
export const defaultIfcOptions:IfcImportOptions={hostBy:'assembly',mergeMarks:true,useIfcMarks:true,storeyMap:{}};
export type IfcStatus='add'|'update'|'same'|'error';
export type IfcCandidate={
 key:string;code:string;category:'Foundation'|'Column'|'Beam';name:string;mark:string;files:string[];guids:string[];
 storeys:{name:string;count:number}[];pedestals:number;piles:number;sets:number;bars:number;marks:number;
 /** kg: app (BS 8666 cut lengths) / model (lengths the model reports) */
 weight:number;ifcWeight:number;concrete:number;
 member:Member;existing?:Member;status:IfcStatus;changes:string[];problems:string[];notes:string[];
 /** checkIfcCandidate() has run (the save checks the same rules) */
 checked:boolean;
 /** per Mark: model length vs app cut length */
 rows:{mark:string;diameter:number;shapeCode:string;count:number;cut:number;ifcLength:number;weight:number;note:string}[];
};
export type IfcPlan={candidates:IfcCandidate[];missing:Member[];unassigned:{sets:number;bars:number};
 skipped:{kind:IfcElemKind;elements:number;bars:number}[];storeys:string[];files:string[];warnings:string[]};

const HOST_KINDS:IfcElemKind[]=['footing','column','beam'];
const priority:Record<IfcElemKind,number>={footing:6,column:5,beam:4,wall:3,slab:2,pile:1,other:0};
const kgPerM=(d:number)=>d*d/162.2;
const r1=(v:number)=>Math.round(v*10)/10;

// ---------------------------------------------------------------- geometry helpers
const corners=(e:{min:V3;max:V3}):V3[]=>[0,1,2,3,4,5,6,7].map(i=>[i&1?e.max[0]:e.min[0],i&2?e.max[1]:e.min[1],i&4?e.max[2]:e.min[2]]);
const worldBox=(e:IfcElement)=>{const w=corners(e).map(p=>toWorld(e.frame,p));return {min:[0,1,2].map(k=>Math.min(...w.map(p=>p[k]))) as V3,max:[0,1,2].map(k=>Math.max(...w.map(p=>p[k]))) as V3};};
function inPoly(p:[number,number],poly:[number,number][],tol:number){
 let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>p[1])!==(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)inside=!inside;}
 if(inside||tol<=0)return inside;
 return poly.some((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L));return Math.hypot(a[0]+t*dx-p[0],a[1]+t*dy-p[1])<=tol;});
}
export function insideElement(e:IfcElement,p:V3,tol=10){
 const q=toLocal(e.frame,p);
 for(let k=0;k<3;k++)if(q[k]<e.min[k]-tol||q[k]>e.max[k]+tol)return false;
 return !e.outline||e.approx?true:inPoly([q[0],q[1]],e.outline,tol);
}
/** Points along a bar every `step` mm (vertices included). */
function samples(pts:V3[],step:number):V3[]{
 const out:V3[]=[pts[0]];
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],L=v3.len(v3.sub(b,a)),n=Math.max(1,Math.ceil(L/step));for(let k=1;k<=n;k++)out.push(v3.add(a,v3.mul(v3.sub(b,a),k/n)));}
 return out;
}
const polyLen=(p:V3[])=>p.slice(1).reduce((n,q,i)=>n+v3.len(v3.sub(q,p[i])),0);
function hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}

/** Spatial index of elements by plan cells (world XY). */
function indexOf(elements:IfcElement[],cell=3000){
 const map=new Map<string,IfcElement[]>(),boxes=new Map<IfcElement,{min:V3;max:V3}>();
 for(const e of elements){const b=worldBox(e);boxes.set(e,b);for(let i=Math.floor(b.min[0]/cell);i<=Math.floor(b.max[0]/cell);i++)for(let j=Math.floor(b.min[1]/cell);j<=Math.floor(b.max[1]/cell);j++){const k=`${i},${j}`;map.set(k,[...(map.get(k)||[]),e]);}}
 return {near:(p:V3)=>(map.get(`${Math.floor(p[0]/cell)},${Math.floor(p[1]/cell)}`)||[]).filter(e=>{const b=boxes.get(e)!;return p[2]>=b.min[2]-50&&p[2]<=b.max[2]+50;}),box:(e:IfcElement)=>boxes.get(e)!};
}

// ---------------------------------------------------------------- plan
export function planIfcImport(models:IfcModelData[],ctx:{project:Project;members:Member[];spec:Spec},opt:IfcImportOptions=defaultIfcOptions):IfcPlan{
 const seenE=new Set<string>(),seenB=new Set<string>(),elements:IfcElement[]=[],sets:IfcBarSet[]=[];
 for(const m of models){for(const e of m.elements)if(!seenE.has(e.guid)){seenE.add(e.guid);elements.push(e);}for(const s of m.barSets)if(!seenB.has(s.guid)){seenB.add(s.guid);sets.push(s);}}
 const index=indexOf(elements);
 // pedestals: short columns standing in / on a footing; piles below a footing
 const footings=elements.filter(e=>e.kind==='footing'),pedestalOf=new Map<IfcElement,IfcElement>(),pilesOf=new Map<IfcElement,IfcElement[]>();
 for(const c of elements.filter(e=>e.kind==='column')){
  const b=index.box(c);if(b.max[2]-b.min[2]>3000)continue;
  const base:V3=[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,b.min[2]+1];
  const f=footings.find(f=>{const fb=index.box(f);return base[2]>=fb.min[2]-10&&base[2]<=fb.max[2]+50&&insideElement(f,[base[0],base[1],Math.min(base[2],fb.max[2]-1)],5);});
  if(f)pedestalOf.set(c,f);
 }
 for(const p of elements.filter(e=>e.kind==='pile')){
  const b=index.box(p),top:V3=[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,b.max[2]];
  const f=footings.find(f=>{const fb=index.box(f);return top[2]>=fb.min[2]-10&&top[2]<=fb.max[2]&&insideElement(f,[top[0],top[1],fb.min[2]+1],5);});
  if(f)pilesOf.set(f,[...(pilesOf.get(f)||[]),p]);
 }
 // cast units with several concrete parts (Tekla beam segments, haunches …): the largest host-kind part carries the rest
 const vol=(e:IfcElement)=>(e.max[0]-e.min[0])*(e.max[1]-e.min[1])*(e.max[2]-e.min[2]);
 const byAsm=new Map<string,IfcElement[]>();for(const e of elements)if(e.assembly&&e.kind!=='pile'&&!pedestalOf.has(e))byAsm.set(e.assembly,[...(byAsm.get(e.assembly)||[]),e]);
 for(const list of byAsm.values()){if(list.length<2)continue;const main=list.filter(e=>HOST_KINDS.includes(e.kind)).sort((a,b)=>vol(b)-vol(a))[0];if(main)for(const e of list)if(e!==main)pedestalOf.set(e,main);}
 const hostOf=(e:IfcElement)=>pedestalOf.get(e)||e;
 // bar sets → element
 const byAssembly=new Map<string,IfcElement[]>();for(const e of elements)if(e.assembly)byAssembly.set(e.assembly,[...(byAssembly.get(e.assembly)||[]),e]);
 const assigned=new Map<IfcElement,IfcBarSet[]>();let unSets=0,unBars=0;
 for(const s of sets){
  let host:IfcElement|undefined;
  if(opt.hostBy==='assembly'&&s.assembly)host=(byAssembly.get(s.assembly)||[]).slice().sort((a,b)=>priority[b.kind]-priority[a.kind])[0];
  if(!host){
   const pts=s.bars.slice(0,6).flatMap(b=>samples(b.pts,200)),score=new Map<IfcElement,number>();
   for(const p of pts)for(const e of index.near(p))if(insideElement(e,p))score.set(e,(score.get(e)||0)+1);
   host=[...score.entries()].sort((a,b)=>b[1]-a[1]||priority[b[0].kind]-priority[a[0].kind])[0]?.[0];
  }
  if(!host){unSets++;unBars+=s.bars.length;continue;}
  const h=hostOf(host);assigned.set(h,[...(assigned.get(h)||[]),s]);
 }
 const skipped=new Map<IfcElemKind,{elements:number;bars:number}>();
 for(const e of elements){if(HOST_KINDS.includes(e.kind)&&!pedestalOf.has(e)&&(e.kind==='footing'||assigned.has(e)))continue;if(pedestalOf.has(e)||(e.kind==='pile'&&[...pilesOf.values()].some(l=>l.includes(e))))continue;
  const k=skipped.get(e.kind)||{elements:0,bars:0};k.elements++;k.bars+=(assigned.get(e)||[]).reduce((n,s)=>n+s.bars.length,0);skipped.set(e.kind,k);}

 // one member draft per host instance, then equal drafts → one member with occurrences
 const det=detailingFromSpec(ctx.spec,DEFAULT_DETAILING,{category:'Foundation'});
 type Draft={host:IfcElement;member:Member;signature:string;sets:IfcBarSet[];pedestals:number;piles:number;notes:string[];ifcWeight:number;rows:IfcCandidate['rows']};
 const drafts:Draft[]=[];
 // columns / beams only when the model reinforces them (a whole building has thousands); footings always (concrete + piles)
 for(const host of elements.filter(e=>HOST_KINDS.includes(e.kind)&&!pedestalOf.has(e)&&(e.kind==='footing'||assigned.has(e)))){
  const peds=[...pedestalOf.entries()].filter(([,f])=>f===host).map(([c])=>c),barSets=assigned.get(host)||[];
  drafts.push(buildDraft(host,peds,pilesOf.get(host)||[],barSets,elements,index,opt,det,ctx.spec));
 }
 // group equal drafts
 const groups=new Map<string,Draft[]>();
 for(const d of drafts){const k=`${d.member.category}|${d.host.mark}|${d.signature}`;groups.set(k,[...(groups.get(k)||[]),d]);}
 const tree=locationTree(ctx.project.locations),used=new Set<string>(),candidates:IfcCandidate[]=[];
 const ifcMembers=ctx.members.filter(m=>m.ifcSource);
 for(const [key,list] of [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}))){
  const d=list[0],guids=list.map(x=>x.host.guid);
  const existing=ifcMembers.find(m=>m.ifcSource!.guids.some(g=>guids.includes(g)));
  let code=existing?.code||(d.host.mark||d.host.name||'IFC').slice(0,44);
  if(!existing){const base=code;for(let i=2;used.has(code.toUpperCase())||ctx.members.some(m=>m.code.toUpperCase()===code.toUpperCase()&&!m.ifcSource);i++)code=`${base}${ctx.members.some(m=>m.code.toUpperCase()===base.toUpperCase()&&!m.ifcSource)&&i===2?'-IFC':`/${i}`}`.slice(0,50);}
  used.add(code.toUpperCase());
  const counts=new Map<string,number>();for(const x of list)counts.set(x.host.storey,(counts.get(x.host.storey)||0)+1);
  const occurrences=[...counts.entries()].map(([s,n])=>{const loc=opt.storeyMap[s],o={id:crypto.randomUUID(),zone:'',floor:s.slice(0,80),grid:'',quantity:n};return loc?.building?withLoc(tree,o,loc):o;});
  const files=[...new Set(list.flatMap(x=>[x.host.file,...x.sets.map(s=>s.file)]))];
  let member:Member={...d.member,code,occurrences,
   ifcSource:{version:1,tool:models.find(m=>m.file===d.host.file)?.tool||'other',files:files.slice(0,20),guids:guids.slice(0,1000),mark:d.host.mark.slice(0,50),signature:d.signature.slice(0,80),importedAt:new Date().toISOString(),ifcWeight:r1(d.ifcWeight),barSets:d.sets.length}};
  if(existing)member={...member,id:existing.id,version:existing.version,drawingSetup:existing.drawingSetup,review:existing.review,description:existing.description||member.description,
   occurrences:member.occurrences.map(o=>{const was=existing.occurrences.find(x=>x.floor===o.floor||canonical(x.loc||null)===canonical(o.loc||null));return was?{...o,id:was.id}:o;})};
  // full checks are slow on big mats (≈ 0.4 s each): checkIfcCandidate() runs them one by one after the plan
  const parsed=memberSchema.safeParse(member),problems=parsed.success?[]:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);
  let weight=0,concrete=0;try{const q=takeoff(member,ctx.spec);weight=q.rebar;concrete=q.concrete;}catch{/* shown as problems */}
  const changes=existing?diff(existing,member):[];
  const status:IfcStatus=problems.length?'error':!existing?'add':changes.length?'update':'same';
  candidates.push({key,code,category:member.category as IfcCandidate['category'],name:d.host.name,mark:d.host.mark,files,guids,storeys:[...counts.entries()].map(([name,count])=>({name,count})),
   pedestals:d.pedestals,piles:d.piles,sets:d.sets.length,bars:d.member.bars.reduce((n,b)=>n+b.count,0),marks:d.member.bars.length,weight,ifcWeight:d.ifcWeight,concrete,
   member,existing,status,changes,problems,notes:d.notes,rows:d.rows,checked:!!problems.length});
 }
 const importedFiles=new Set(models.map(m=>m.file));
 const missing=ifcMembers.filter(m=>m.ifcSource!.files.some(f=>importedFiles.has(f))&&!candidates.some(c=>c.existing?.id===m.id));
 const storeys=[...new Set(elements.filter(e=>HOST_KINDS.includes(e.kind)).map(e=>e.storey))].filter(Boolean);
 return {candidates,missing,unassigned:{sets:unSets,bars:unBars},skipped:[...skipped.entries()].map(([kind,v])=>({kind,...v})).filter(x=>x.bars>0||x.kind!=='pile'),storeys,files:models.map(m=>m.file),warnings:models.flatMap(m=>m.warnings.map(w=>`${m.file}: ${w}`))};
}

/** Member checks of one candidate (slow on big mats): the cover measured from the model is lowered (half, then 0) when the
 * cover check still fails, as the model's bars are what they are. */
export function checkIfcCandidate(c:IfcCandidate,spec:Spec):IfcCandidate{
 if(c.checked)return c;
 const measured=c.member.cover;let member=c.member,problems:string[]=[];
 for(const cover of [measured,Math.floor(measured/10)*5,0]){member={...member,cover};problems=validateMember(member,spec);if(!problems.some(x=>/ระยะหุ้ม|cover/i.test(x))||cover<=0)break;}
 const notes=member.cover<measured?[...c.notes,`ระยะหุ้มลดเป็น ${member.cover} mm ให้ผ่านการตรวจ (วัดจากโมเดลได้ ${measured} mm)`]:c.notes;
 return {...c,member,problems,notes,checked:true,status:problems.length?'error':c.status==='error'?(c.existing?'update':'add'):c.status};
}
function diff(a:Member,b:Member):string[]{
 const out:string[]=[],mm=(v:number)=>Math.round(v);
 if([a.x,a.y,a.z].some((v,i)=>Math.abs(v-[b.x,b.y,b.z][i])>1))out.push(`ขนาด ${mm(a.x)}×${mm(a.y)}×${mm(a.z)} → ${mm(b.x)}×${mm(b.y)}×${mm(b.z)}`);
 const sig=(m:Member)=>m.bars.map(x=>`${x.diameter}|${x.count}|${x.points.map(p=>p.map(Math.round).join(',')).join(';')}`).sort().join('#');
 if(sig(a)!==sig(b)){const n=(m:Member)=>m.bars.reduce((s,x)=>s+x.count,0);out.push(`เหล็ก ${a.bars.length} Mark / ${n(a)} เส้น → ${b.bars.length} Mark / ${n(b)} เส้น`);
  const da=new Set(a.bars.map(x=>x.diameter)),db=new Set(b.bars.map(x=>x.diameter));if(canonical([...da].sort())!==canonical([...db].sort()))out.push(`ขนาดเหล็ก ${[...da].sort().map(d=>'Ø'+d).join(' ')} → ${[...db].sort().map(d=>'Ø'+d).join(' ')}`);}
 const q=(m:Member)=>m.occurrences.map(o=>`${o.floor}×${o.quantity}`).sort().join(', ');if(q(a)!==q(b))out.push(`ตำแหน่ง ${q(a)} → ${q(b)}`);
 return out;
}

type Det=ReturnType<typeof detailingFromSpec>;
function buildDraft(host:IfcElement,peds:IfcElement[],piles:IfcElement[],sets:IfcBarSet[],all:IfcElement[],index:ReturnType<typeof indexOf>,opt:IfcImportOptions,det:Det,spec:Spec){
 const notes:string[]=[],category:'Foundation'|'Column'|'Beam'=host.kind==='footing'?'Foundation':host.kind==='column'?'Column':'Beam';
 // member frame: host frame; beams along their longest plan side
 let frame:Frame=host.frame,lo=host.min,hi=host.max;
 if(category!=='Column'&&hi[1]-lo[1]>hi[0]-lo[0]+1){frame=frameOf(host.frame.o,[0,0,1],host.frame.y);const c=corners(host).map(p=>toLocal(frame,toWorld(host.frame,p)));lo=[0,1,2].map(k=>Math.min(...c.map(p=>p[k]))) as V3;hi=[0,1,2].map(k=>Math.max(...c.map(p=>p[k]))) as V3;}
 const local=(p:V3)=>toLocal(frame,p);
 const box=(e:IfcElement)=>{const c=corners(e).map(p=>local(toWorld(e.frame,p)));return {min:[0,1,2].map(k=>Math.min(...c.map(p=>p[k]))) as V3,max:[0,1,2].map(k=>Math.max(...c.map(p=>p[k]))) as V3};};
 // concrete parts in the member frame
 type PartBox={min:V3;max:V3;poly?:[number,number][];circle?:boolean};
 const outline=host.outline&&!host.approx?host.outline.map(([x,y])=>{const p=local(toWorld(host.frame,[x,y,0]));return [p[0],p[1]] as [number,number];}):undefined;
 const rect=!outline||outline.length===4&&outline.every((p,i)=>{const q=outline[(i+1)%4];return Math.abs(p[0]-q[0])<.5||Math.abs(p[1]-q[1])<.5;});
 const parts:PartBox[]=[{min:lo,max:hi,...(!rect&&outline?{poly:outline,circle:host.circle}:{})}];
 for(const c of peds)parts.push(box(c));
 if(host.approx)notes.push('รูปทรงคอนกรีตอ่านแบบกล่องขอบเขต (มีการตัด / ชิ้นส่วนหลายชิ้น) ตรวจปริมาตรอีกครั้ง');
 const shift:V3=[0,1,2].map(k=>-Math.min(...parts.map(p=>p.min[k]))) as V3;
 const M=(p:V3):V3=>{const q=local(p);return [q[0]+shift[0],q[1]+shift[1],q[2]+shift[2]];};
 const sp=parts.map(p=>({min:v3.add(p.min,shift),max:v3.add(p.max,shift),poly:p.poly?.map(([x,y])=>[x+shift[0],y+shift[1]] as [number,number]),circle:p.circle}));
 const inParts=(q:V3,tol=1)=>sp.some(p=>q.every((v,k)=>v>=p.min[k]-tol&&v<=p.max[k]+tol)&&(!p.poly||inPoly([q[0],q[1]],p.poly,tol)));
 // bars (member coordinates), grouped into Marks
 type One={pts:V3[];radius:number;set:IfcBarSet};
 const bars:One[]=sets.flatMap(s=>s.bars.map(b=>({pts:b.pts.map(M),radius:b.radius,set:s})));
 // equal bars → one Mark: shape relative to its last point, turned about Z to a canonical heading (engine offsetTurns
 // turn the template about its last point), either direction of the polyline
 const groups=new Map<string,(One&{turn:number})[]>();
 const canon=(pts:V3[])=>{const o=pts.at(-1)!,rel=pts.map(p=>v3.sub(p,o)),h=rel.find(r=>Math.hypot(r[0],r[1])>20),t=h?Math.atan2(h[1],h[0]):0,c=Math.cos(-t),sn=Math.sin(-t);
  return {t,key:rel.map(r=>[r[0]*c-r[1]*sn,r[0]*sn+r[1]*c,r[2]].map(v=>Math.round(v/2)*2).join(',')).join(';')};};
 for(const b of bars){
  let pts=b.pts,c=canon(pts);if(opt.mergeMarks){const r=canon(pts.slice().reverse());if(r.key<c.key){pts=pts.slice().reverse();c=r;}}
  const k=`${b.set.diameter}|${opt.mergeMarks?'':b.set.guid+'|'+Math.round(c.t*1e3)+'|'}${c.key}`;groups.set(k,[...(groups.get(k)||[]),{...b,pts,turn:c.t}]);}
 const list=[...groups.values()].sort((a,b)=>b[0].set.diameter-a[0].set.diameter||polyLen(b[0].pts)-polyLen(a[0].pts));
 const marks=new Set<string>(),out:Bar[]=[],rows:IfcCandidate['rows']=[];let ifcWeight=0;
 const H=Math.max(...sp.map(p=>p.max[2]));
 list.forEach((g,k)=>{
  const f=g[0],d=f.set.diameter,pts=f.pts.map(p=>p.map(v=>Number(v.toFixed(1))) as Vec3);
  const tekla=opt.useIfcMarks&&g.every(x=>x.set.mark&&x.set.mark===f.set.mark)?f.set.mark:'';
  let mark=(tekla||String(k+1)).slice(0,28);for(let i=2;marks.has(mark);i++)mark=`${tekla||k+1}-${i}`.slice(0,32);marks.add(mark);
  const legs=pts.slice(1).map((p,i)=>v3.sub(p as V3,pts[i] as V3)),long=legs.reduce((a,b)=>v3.len(b)>v3.len(a)?b:a,legs[0]||[1,0,0] as V3),ax=[0,1,2].reduce((a,b)=>Math.abs(long[b])>Math.abs(long[a])?b:a,0);
  const midZ=pts.reduce((n,p)=>n+p[2],0)/pts.length,code=shapeCode(pts as V3[]);
  const radius=pts.length>2?Number((f.radius>d/2?f.radius:sketchRadius(d)).toFixed(1)):0;
  const turns=g.map(x=>{let a=(x.turn-f.turn)*180/Math.PI;while(a>180)a-=360;while(a<=-180)a+=360;return Math.abs(a)<.05?0:Number(a.toFixed(3));});
  const offsets=g.map(x=>v3.sub(x.pts.at(-1)!,f.pts.at(-1)!).map(v=>Number(v.toFixed(1))) as Vec3);
  // the model's own bar length when it is believable (Revit writes some varying sets in feet)
  const centre=polyLen(f.pts),ifcLen=f.set.length>0&&Math.abs(f.set.length-centre)<.2*centre?f.set.length:centre;ifcWeight+=ifcLen/1000*kgPerM(d)*g.length;
  const grade=f.set.grade||gradeFor(det,d,det.mainGrade||'SD40');
  const note=`IFC ${f.set.file}${f.set.shape?` · Shape ${f.set.shape}`:''}${f.set.mark?` · Mark ${f.set.mark}`:''}${f.set.length?` · ยาว ${Math.round(f.set.length)}`:''}`.slice(0,500);
  out.push({...blankBar(mark),id:`ifc-${k+1}-${hash(mark+pts.flat().join(','))}`.slice(0,80),diameter:d,grade:grade.slice(0,40),count:g.length,shape:'polyline',shapeCode:code,
   axis:(['X','Y','Z'] as const)[ax],face:category!=='Foundation'?'side':midZ<H/3?'bottom':midZ>2*H/3?'top':'side',radius,points:pts,
   ...(['00','11','21'].includes(code)?{lengthMethod:'bs8666' as const}:{}),// always offsets (also for one bar): a polyline without them is moved along its distribution axis
   offsets,...(turns.some(t=>t!==0)?{offsetTurns:turns}:{}),note});
  rows.push({mark,diameter:d,shapeCode:code,count:g.length,cut:0,ifcLength:Math.round(ifcLen),weight:0,note:f.set.shape});
 });
 if(out.length>300)notes.push(`เหล็ก ${out.length} Mark เกิน 300 Mark ต่อสมาชิก`);
 // reference regions for bar parts outside the concrete (columns above, piles below, slabs …)
 const outside=new Map<string,{label:string;min:V3;max:V3}>();
 for(const b of bars)for(const q of samples(b.pts,25)){
  if(inParts(q))continue;
  const w=toWorld(frame,v3.sub(q,shift)),e=index.near(w).filter(x=>x!==host&&!peds.includes(x)&&insideElement(x,w,30)).sort((a,b)=>priority[b.kind]-priority[a.kind])[0];
  const id=e?e.guid:'free',r=outside.get(id)||{label:e?`${e.mark||e.name} (อ้างอิง)`:'เหล็กยื่นนอกคอนกรีตในโมเดล',min:[...q] as V3,max:[...q] as V3};
  for(let k=0;k<3;k++){r.min[k]=Math.min(r.min[k],q[k]);r.max[k]=Math.max(r.max[k],q[k]);}outside.set(id,r);
 }
 let regions=[...outside.entries()].map(([id,r],i)=>({id:`ifcref${i+1}`,label:r.label.slice(0,80),origin:r.min.map(v=>Number((v-60).toFixed(1))) as Vec3,size:r.min.map((v,k)=>Number((r.max[k]-v+120).toFixed(1))) as Vec3,reference:`เหล็กจาก IFC ต่อเข้า ${r.label} · พื้นที่อ้างอิง ไม่คิดปริมาณ`.slice(0,500),cover:0,openings:[]}));
 if(regions.length>16){const all=regions.slice(15),min=[0,1,2].map(k=>Math.min(...all.map(r=>r.origin[k]))) as Vec3,max=[0,1,2].map(k=>Math.max(...all.map(r=>r.origin[k]+r.size[k])));regions=[...regions.slice(0,15),{...all[0],id:'ifcref16',label:'เหล็กยื่นนอกคอนกรีต (รวม)',origin:min,size:min.map((v,k)=>max[k]-v) as Vec3}];}
 // member
 const base=blankMember(category,host.mark||'IFC');
 const pileList=piles.map(p=>{const b=box(p),c=[(b.min[0]+b.max[0])/2+shift[0],(b.min[1]+b.max[1])/2+shift[1]] as [number,number];return {c,size:Math.min(b.max[0]-b.min[0],b.max[1]-b.min[1]),len:b.max[2]-b.min[2],embed:Math.max(0,b.max[2]+shift[2]),circle:!!p.circle};});
 let member:Member;
 if(category==='Foundation'){
  const partsOut:ShapePart[]=sp.map((p,i):ShapePart=>{const common={id:i?`ped${i}`:'p1',label:i?`ตอม่อ ${peds[i-1].mark||i}`.slice(0,80):(host.mark||'ฐานราก').slice(0,80),role:'solid' as const,stage:i?2:1,z0:Number(p.min[2].toFixed(1)),height:Number((p.max[2]-p.min[2]).toFixed(1)),formSides:true,formBottom:false,source:`IFC ${host.file}`.slice(0,200)};
   if(p.poly&&p.circle){const cx=(p.min[0]+p.max[0])/2,cy=(p.min[1]+p.max[1])/2;return {...common,shape:'circle',cx,cy,diameter:Number((p.max[0]-p.min[0]).toFixed(1)),inner:0};}
   if(p.poly&&p.poly.length<=64)return {...common,shape:'polygon',points:p.poly.map(([x,y])=>[Number(x.toFixed(1)),Number(y.toFixed(1))] as [number,number])};
   return {...common,shape:'box',x:Number(p.min[0].toFixed(1)),y:Number(p.min[1].toFixed(1)),w:Number((p.max[0]-p.min[0]).toFixed(1)),d:Number((p.max[1]-p.min[1]).toFixed(1))};});
  const pl=pileList.slice(0,100),size=pl.length?pl.map(p=>Math.round(p.size)).sort((a,b)=>a-b)[Math.floor(pl.length/2)]:0;
  // earthwork is not in the model: dig to the top of the footing, 300 mm working space (edit in the shape tab)
  const site={excavationDepth:Number((sp[0].max[2]-sp[0].min[2]).toFixed(1)),workingSpace:300,slope:0,leanThickness:0,leanProjection:0};
  notes.push('งานดิน: ขุดถึงหลังฐาน เผื่อข้าง 300 mm ไม่มีคอนกรีตหยาบ (โมเดลไม่มีข้อมูล แก้ได้ในแท็บรูปทรง)');
  const sm:ShapeModel={version:1,confirmed:false,note:`นำเข้าจาก IFC ${host.file}`.slice(0,1000),parts:partsOut,site,
   ...(pl.length?{piles:{type:pl[0].circle?'round' as const:'square' as const,size,length:Number((Math.max(...pl.map(p=>p.len))/1000).toFixed(2)),cutoff:0,embed:Math.round(Math.max(...pl.map(p=>p.embed))),positions:pl.map(p=>[Number(p.c[0].toFixed(1)),Number(p.c[1].toFixed(1))] as [number,number])}}:{})};
  member=applyShapeModel({...base,description:`${host.name}`.slice(0,500),bars:out},sm);
  // clipped / boolean bodies are read as their box: deduct the difference to the real (mesh) volume of the model
  const boxVol=(sp[0].max[0]-sp[0].min[0])*(sp[0].max[1]-sp[0].min[1])*(sp[0].max[2]-sp[0].min[2])/1e9;
  if(host.approx&&host.volume&&!sp[0].poly&&boxVol-host.volume>.001){member={...member,deductions:[...member.deductions,{reason:'[IFC] ปรับปริมาตรตามรูปทรงจริงในโมเดล (ส่วนที่ตัด / บาก)',volume:Number((boxVol-host.volume).toFixed(4)),formwork:0}]};
   notes[0]=`รูปทรงที่มีการตัด / บาก: ใช้กล่องขอบเขต แล้วหักปริมาตรให้เท่าโมเดล ${host.volume.toFixed(3)} ม³`;}
  if(pileList.length>100)notes.push(`เข็ม ${pileList.length} ต้น เกิน 100 ต้น นำเข้า 100 ต้นแรก`);
 }else{
  const size=(p:{min:V3;max:V3})=>p.max.map((v,k)=>Number((v-p.min[k]).toFixed(1))) as Vec3,[x,y,z]=[0,1,2].map(k=>Number(Math.max(...sp.map(p=>p.max[k])).toFixed(1)));
  member={...base,description:host.name.slice(0,500),x,y,z,bars:out,
   ...(sp.length>1?{geometry:{solids:sp.slice(0,80).map((p,i)=>({id:i?`part${i}`:'main',label:(i?peds[i-1].mark||peds[i-1].name||`ชิ้น ${i}`:host.mark||'หลัก').slice(0,80),origin:p.min.map(v=>Number(v.toFixed(1))) as Vec3,size:size(p),faces:[...base.faces]})),voids:[]}}:{})};
  if(sp.length>1)notes.push(`รวม ${sp.length} ชิ้นคอนกรีตของ cast unit เดียวกัน`);
 }
 if(regions.length)member={...member,placementContext:{version:2,regions}};
 // cover from the model: smallest clearance of the bars inside the main part, then lower until the checks pass
 const main=sp[0];let cover=Infinity;
 for(const b of bars)for(const q of b.pts){if(!q.every((v,k)=>v>=main.min[k]&&v<=main.max[k]))continue;
  const faces=category==='Foundation'?[0,1,2]:[0,1];for(const k of faces)cover=Math.min(cover,q[k]-main.min[k]-b.set.diameter/2,main.max[k]-q[k]-b.set.diameter/2);}
 cover=Number.isFinite(cover)?Math.max(0,Math.floor(cover/5)*5):member.cover;member={...member,cover};
 // app cut lengths per Mark
 try{const q=takeoff(member,spec);for(const r of rows){const row=q.rows.find(x=>x.mark===r.mark);if(row){r.cut=Math.round(row.cutLength);r.weight=r1(row.weight);}}}catch{/* reported by validation */}
 const sig=hash(canonical([category,member.x,member.y,member.z,member.shapeModel?.parts||null,member.shapeModel?.piles||null,out.map(b=>[b.mark,b.diameter,b.count,b.points,b.offsets||null])]));
 return {host,member,signature:sig,sets,pedestals:peds.length,piles:piles.length,notes,ifcWeight,rows};
}

/** BS 8666 code of a 3D polyline: legs projected on their plane (non-planar → 99). */
function shapeCode(p:V3[]):string{
 if(p.length<2)return '';if(p.length===2)return '00';
 const legs=p.slice(1).map((q,i)=>v3.sub(q,p[i]));let n:V3=[0,0,0];
 for(let i=0;i+1<legs.length&&v3.len(n)<1e-6;i++){const c=v3.cross(legs[i],legs[i+1]);if(v3.len(c)>1e-3*v3.len(legs[i])*v3.len(legs[i+1]))n=v3.norm(c);}
 if(v3.len(n)<1e-6)return '00';
 if(p.some(q=>Math.abs(v3.dot(v3.sub(q,p[0]),n))>2))return '99';
 const u=v3.norm(legs[0]),w=v3.cross(n,u);
 return detectShapeCode(p.map(q=>{const d=v3.sub(q,p[0]);return [v3.dot(d,u),v3.dot(d,w)] as [number,number];}));
}
