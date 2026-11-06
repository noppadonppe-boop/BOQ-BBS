// Beams from the slab floor plan (round S3, docs/SLAB_FLOOR.md “Beams from the floor”): every beam line of the floor
// (collinear touching segments on one grid line) becomes a beam-group member `<floor>-B-<line>`; spans grid to grid between
// the stations where the beam is supported (column, or the primary beam when this one is secondary) or changes mark / size;
// ≤ 12 spans per group (longer lines split evenly). The floor owns the geometry (line, spans, sizes, supports, level); the
// beam member owns the bars (Beam Template by mark, kept by mark on update). Pure functions: the command writes the plan.
import type {Member,Spec} from './model';
import {blankMember} from './model';
import {applyElementInput,defaultElementInput,newBeamGrid,plainBeamRebar,type BeamGrid,type BeamRebar,type BeamSpan,type ElementInput} from './elementInput';
import {validateMember} from './engine';
import {floorBeamRects,gridAt,sortGrids,type Floor} from './slabFloor';
import type {FloorBeam,FloorColumn} from './slabFloorSchema';

type BeamInput=Extract<ElementInput,{category:'Beam'}>;
type SlabFloorInput=Extract<ElementInput,{category:'Slab'}>;
const EPS=.5;

/** Floor of a slab member (layout floor), else undefined. */
export function floorOfMember(m:Pick<Member,'category'|'elementInput'>):Floor|undefined{
 const i=m.elementInput as SlabFloorInput|undefined;return m.category==='Slab'&&i?.category==='Slab'&&i.layout==='floor'&&i.floor?i.floor:undefined;
}
/** Primary / secondary at a crossing: explicit ranks first, else the deeper beam, else the one along X. */
export function primaryOver(a:FloorBeam,b:FloorBeam){
 if(a.rank&&b.rank&&a.rank!==b.rank)return a.rank==='primary';
 if(a.rank&&!b.rank)return a.rank==='primary';if(b.rank&&!a.rank)return b.rank!=='primary';
 if(Math.abs(a.depth-b.depth)>EPS)return a.depth>b.depth;
 return a.along==='X'&&b.along!=='X';
}
/** Rank of a whole line as shown in the editor (explicit, else auto from its first segment against the crossing beams). */
export function lineRank(f:Floor,along:'X'|'Y',line:string):'primary'|'secondary'{
 const mine=f.beams.filter(b=>b.along===along&&b.line===line);if(mine.some(b=>b.rank))return mine.find(b=>b.rank)!.rank!;
 const other=f.beams.filter(b=>b.along!==along);return !mine.length||!other.length||other.every(o=>primaryOver(mine[0],o))?'primary':'secondary';
}
const columnAt=(f:Floor,gx:string,gy:string):FloorColumn|undefined=>(f.columns||[]).find(c=>c.x===gx&&c.y===gy);

export type GroupPlan={key:string;code:string;along:'X'|'Y';line:string;part:number;parts:number;beamIds:string[];input:BeamInput;hash:string;
 spans:number;concrete:number;length:number;warnings:string[]};
/** Hash of the geometry a floor owns (grids + supports, spans without bars, placement): equal hash = nothing to update;
 * a member whose own hash differs from `floorSource.generatedHash` was edited by hand. */
export function beamGeometryHash(i:Pick<BeamInput,'grids'|'spans'|'placement'>){
 const g={grids:i.grids.map(x=>[x.label,x.support,x.supportY]),spans:i.spans.map(s=>[s.mark,s.kind,s.length,s.width,s.depth,s.top]),p:i.placement?[i.placement.along,i.placement.line,i.placement.from,i.placement.to,i.placement.offset,i.placement.level,i.placement.ends||[0,0]]:null};
 let h=0x811c9dc5;const t=JSON.stringify(g);for(let k=0;k<t.length;k++){h^=t.charCodeAt(k);h=Math.imul(h,0x01000193)>>>0;}
 return `f1-${h.toString(16).padStart(8,'0')}-${t.length}`;
}

/** Beam groups the floor gives (no project data needed): one per beam line run (part k of n when > 12 spans). */
export function floorBeamGroups(floor:Pick<Member,'id'|'code'|'category'|'elementInput'>,spec:Pick<Spec,'beamTemplates'>&Partial<Spec>):{groups:GroupPlan[];warnings:string[]}{
 const f=floorOfMember(floor);if(!f)return {groups:[],warnings:['ไม่ใช่สมาชิกพื้นทั้งชั้น']};
 const warnings:string[]=[],groups:GroupPlan[]=[],noTemplate=new Set<string>();
 const rects=new Map(floorBeamRects(f).map(r=>[r.beam.id,r]));
 // lines: segments on one grid line with one offset, sorted along the line; touching segments form one run
 const lines=new Map<string,FloorBeam[]>();
 for(const b of f.beams){if(!rects.has(b.id))continue;const k=`${b.along}|${b.line}|${Math.round(b.offset||0)}`;lines.set(k,[...(lines.get(k)||[]),b]);}
 const order=[...lines.keys()].sort((a,b)=>{const [pa,la]=a.split('|'),[pb,lb]=b.split('|');if(pa!==pb)return pa==='Y'?-1:1;
  const ga=sortGrids(pa==='X'?f.gridsY:f.gridsX),i=ga.findIndex(g=>g.label===la),j=ga.findIndex(g=>g.label===lb);return i-j;});
 for(const key of order){const segs=lines.get(key)!,along=segs[0].along,line=segs[0].line,offset=segs[0].offset||0;
  const runs=sortGrids(along==='X'?f.gridsX:f.gridsY),cross=sortGrids(along==='X'?f.gridsY:f.gridsX),at=gridAt(cross,line)!;
  const idx=(l:string)=>runs.findIndex(g=>g.label===l),lo=(b:FloorBeam)=>Math.min(idx(b.from),idx(b.to)),hi=(b:FloorBeam)=>Math.max(idx(b.from),idx(b.to));
  const sorted=[...segs].sort((a,b)=>lo(a)-lo(b)),chains:FloorBeam[][]=[];
  for(const b of sorted){const last=chains.at(-1);if(last&&hi(last.at(-1)!)===lo(b))last.push(b);else chains.push([b]);}
  chains.forEach((chain,ci)=>{
   const i0=lo(chain[0]),i1=hi(chain.at(-1)!),segAt=(i:number)=>chain.find(b=>lo(b)<=i&&hi(b)>i)!;
   // crossing beams at grid i: along the other direction on that grid label, running over this line
   const crossing=(i:number)=>f.beams.filter(o=>o.along!==along&&o.line===runs[i].label&&rects.has(o.id)&&(()=>{const a=gridAt(cross,o.from),e=gridAt(cross,o.to);return a!==undefined&&e!==undefined&&at>=Math.min(a,e)-EPS&&at<=Math.max(a,e)+EPS;})());
   type Station={i:number;support:number;supportY:number;ext:number;free:boolean};
   const stations:Station[]=[];
   for(let i=i0;i<=i1;i++){
    const col=columnAt(f,along==='X'?runs[i].label:line,along==='X'?line:runs[i].label),xs=crossing(i),me=segAt(Math.min(i,i1-1));
    const over=xs.filter(o=>!primaryOver(me,o)),under=xs.filter(o=>primaryOver(me,o));
    const colAlong=col?(along==='X'?col.sx:col.sy):0,colAcross=col?(along==='X'?col.sy:col.sx):0;
    const support=Math.max(colAlong,...over.map(o=>o.width));
    const change=i>i0&&i<i1&&(()=>{const a=segAt(i-1),b=segAt(i);return a.mark!==b.mark||a.width!==b.width||a.depth!==b.depth;})();
    if(!(i===i0||i===i1||support>0||change))continue;
    stations.push({i,support,supportY:col&&colAcross!==colAlong?colAcross:0,ext:!(support>0)&&(i===i0||i===i1)&&under.length?Math.max(...under.map(o=>o.width/2)):0,free:!col&&!xs.length});
   }
   // > 12 spans: equal parts (shared station)
   const nSpans=stations.length-1,parts=Math.max(1,Math.ceil(nSpans/12)),per=Math.ceil(nSpans/parts);
   for(let p=0;p<parts;p++){const st=stations.slice(p*per,Math.min(stations.length,(p+1)*per+1));if(st.length<2)continue;
    const spans:BeamSpan[]=[],grids:BeamGrid[]=st.map(s=>({...newBeamGrid(runs[s.i].label,s.support,s.supportY)}));
    for(let k=0;k+1<st.length;k++){const a=st[k],b=st[k+1],seg=segAt(a.i),length=Math.round(runs[b.i].at-runs[a.i].at);
     const end=(k===0&&a.free&&p===0)||(k===st.length-2&&b.free&&p===parts-1),cant=end&&st.length>2;
     const t=spec.beamTemplates?.find(x=>x.name===seg.mark);if(!t)noTemplate.add(seg.mark);
     else if(t.width!==seg.width||t.depth!==seg.depth)warnings.push(`คาน ${seg.mark} แนว ${line}: ขนาดในแปลน ${seg.width}×${seg.depth} ต่างจาก Template ${t.width}×${t.depth} (ใช้ขนาดจากแปลน)`);
     spans.push({mark:seg.mark,kind:cant?'cantilever':'span',length,width:seg.width,depth:seg.depth,top:0,rebar:t?structuredClone(t.rebar):plainBeamRebar(),...(t?{template:t.id}:{})});}
    const first=st[0],last=st.at(-1)!,suffix=parts>1||chains.length>1?`-${chains.length>1?`${ci+1}`:''}${parts>1?`${chains.length>1?'.':''}${p+1}`:''}`:'';
    const code=`${floor.code}-B-${line}${suffix}`.slice(0,50),beamIds=chain.filter(b=>hi(b)>first.i&&lo(b)<last.i).map(b=>b.id);
    const base=defaultElementInput('Beam','manual',spec as Spec) as BeamInput;
    const placement={floorMember:floor.id,along,line,from:runs[first.i].label,to:runs[last.i].label,offset,level:f.level,...(first.ext||last.ext?{ends:[first.ext,last.ext] as [number,number]}:{})};
    const input:BeamInput={...base,layout:'group',grids,spans,placement};
    const hash=beamGeometryHash(input),part=ci*parts+p+1;
    input.floorSource={kind:'slabFloor',floorMember:floor.id,floorCode:floor.code,floorVersion:0,beamIds,part,generatedHash:hash};
    const length=runs[last.i].at-runs[first.i].at+first.ext+last.ext;
    const concrete=spans.reduce((v,s,k)=>{const a=k===0?(grids[0].support>0?grids[0].support/2:-first.ext):grids[k].support/2,b=k===spans.length-1?(grids[k+1].support>0?grids[k+1].support/2:-last.ext):grids[k+1].support/2;return v+Math.max(0,s.length-a-b)*s.width*s.depth;},0)/1e9;
    groups.push({key:`${along}|${line}|${Math.round(offset)}|${part}`,code,along,line,part,parts,beamIds,input,hash,spans:spans.length,concrete,length,warnings:[]});}
  });
 }
 for(const mk of noTemplate)warnings.push(`คาน ${mk} ยังไม่มี Template (ใช้เหล็กค่าเริ่มต้นที่วางได้ในหน้าตัด)`);
 return {groups,warnings};
}

export type BeamPlanStatus='new'|'update'|'same'|'edited'|'removed'|'conflict';
export type BeamPlanRow={key:string;code:string;status:BeamPlanStatus;line?:string;along?:'X'|'Y';spans:number;concrete:number;
 /** member to write (new / update / edited when overwritten); removed / same / conflict / failed check: undefined */ member?:Member;
 existing?:Member;note?:string;
 /** the planned member fails `validateMember` (the command's check): not written, the line is skipped */ errors?:string[]};
/** Default bars for spans without a Beam Template, largest first: the first set the member check accepts is used
 * (top / bottom count × Ø, stirrup Ø @ spacing). Each bar set is tried with RB9 then DB10 stirrups: RB9 (135° hooks,
 * `tieHook`) passes under the bend cover policy `rebar-bend-tolerance-1.0` (new projects) and ACI; specs on the legacy
 * cover check (0.0001 mm) reject the hook arc that sits on the cover line by rounding, so DB10 (90° hooks) is taken there. */
export const DEFAULT_BEAM_BARS:{top:[number,number];bottom:[number,number];stirrup:[number,number]}[]=([
 [[2,16],[3,16]],[[2,16],[2,16]],[[2,12],[3,12]],[[2,12],[2,12]],[[2,10],[2,10]]] as [number,number][][]).flatMap(([top,bottom])=>
 [{top,bottom,stirrup:[9,200] as [number,number]},{top,bottom,stirrup:[10,200] as [number,number]}]);
/** “บน 2-DB16 · ล่าง 3-DB16 · ปลอก DB10@200” (main bars + mid-span stirrup) */
export const rebarText=(r:BeamRebar)=>`บน ${r.top.count}-DB${r.top.diameter} · ล่าง ${r.bottom.count}-DB${r.bottom.diameter} · ปลอก ${r.stirrup.diameter<10?'RB':'DB'}${r.stirrup.diameter}@${r.stirrup.spacing.mid}`;
const barsOf=(c:typeof DEFAULT_BEAM_BARS[number]):BeamRebar=>plainBeamRebar({count:c.top[0],diameter:c.top[1]},{count:c.bottom[0],diameter:c.bottom[1]},{diameter:c.stirrup[0],spacing:c.stirrup[1]});
/** Builds the member; spans flagged in `free` (no template, no bars of their own) get the first default set that passes the
 * member check. Returns the member, its check errors ([] = ok) and the default set used. */
function fittedMember(base:Member,input:BeamInput,free:boolean[],spec:Spec):{member:Member;errors:string[]}{
 const build=(i:BeamInput)=>applyElementInput(base,i,{rounding:spec.rounding}).member;
 if(!free.some(Boolean)){const member=build(input);return {member,errors:validateMember(member,spec)};}
 let last:{member:Member;errors:string[]}|undefined;
 for(const c of DEFAULT_BEAM_BARS){
  const member=build({...input,spans:input.spans.map((s,k)=>free[k]?{...s,rebar:barsOf(c)}:s)}),errors=validateMember(member,spec);
  last={member,errors};if(!errors.length)return last;
 }
 return last!;
}
const linkKey=(i:BeamInput)=>i.placement&&i.floorSource?`${i.placement.along}|${i.placement.line}|${Math.round(i.placement.offset)}|${i.floorSource.part}`:'';
const beamInputOf=(m:Member)=>(m.elementInput as BeamInput|undefined)?.category==='Beam'?m.elementInput as BeamInput:undefined;
/** Members linked to a floor (beam groups with `floorSource.floorMember`). */
export const linkedBeams=(members:Member[],floorId:string)=>members.filter(m=>m.category==='Beam'&&beamInputOf(m)?.floorSource?.floorMember===floorId);
/** Link state of one beam member: current (matches the floor), stale (the floor changed), edited (geometry changed by hand). */
export function beamLinkState(m:Member,floor?:Pick<Member,'id'|'code'|'category'|'elementInput'>,spec?:Pick<Spec,'beamTemplates'>):'current'|'stale'|'edited'|'missing'{
 const i=beamInputOf(m);if(!i?.floorSource)return 'missing';if(beamGeometryHash(i)!==i.floorSource.generatedHash)return 'edited';
 if(!floor||!spec)return 'current';const g=floorBeamGroups(floor,spec).groups.find(x=>x.key===linkKey(i));
 return !g?'missing':g.hash===i.floorSource.generatedHash?'current':'stale';
}
/** What “สร้าง / อัปเดตคานจากแปลนพื้น” would do: per group new / update / same / edited (hash differs, overwrite only when
 * asked) / conflict (code used by another member); linked members no longer in the plan = removed (never deleted here).
 * Updates keep the member's bars by span mark (rebar + template), cover, detailing, extra top bars per grid label. */
export function planFloorBeams(floor:Member,members:Member[],spec:Spec,opts:{overwrite?:string[]}={}){
 const {groups,warnings}=floorBeamGroups(floor,spec),linked=linkedBeams(members,floor.id),rows:BeamPlanRow[]=[],used=new Set<string>();
 const occurrences=floor.occurrences.map(o=>({...o}));
 for(const g of groups){
  const ex=linked.find(m=>!used.has(m.id)&&linkKey(beamInputOf(m)!)===g.key);
  if(!ex){const clash=members.find(m=>m.code.toUpperCase()===g.code.toUpperCase());
   if(clash){rows.push({key:g.key,code:g.code,status:'conflict',line:g.line,along:g.along,spans:g.spans,concrete:g.concrete,existing:clash,note:'รหัสนี้มีสมาชิกอื่นใช้แล้ว'});continue;}
   const m0:Member={...blankMember('Beam',g.code),occurrences},input={...g.input,floorSource:{...g.input.floorSource!,floorVersion:floor.version}};
   const fit=fittedMember(m0,input,input.spans.map(s=>!s.template),spec);
   rows.push({key:g.key,code:g.code,status:'new',line:g.line,along:g.along,spans:g.spans,concrete:g.concrete,...fitRow(fit)});continue;}
  used.add(ex.id);const old=beamInputOf(ex)!,edited=beamGeometryHash(old)!==old.floorSource!.generatedHash;
  const sameOcc=JSON.stringify(ex.occurrences)===JSON.stringify(occurrences);
  if(!edited&&g.hash===old.floorSource!.generatedHash&&sameOcc&&JSON.stringify(old.floorSource!.beamIds)===JSON.stringify(g.beamIds)){rows.push({key:g.key,code:ex.code,status:'same',line:g.line,along:g.along,spans:g.spans,concrete:g.concrete,existing:ex});continue;}
  // keep the beam's own bars (by span mark), cover / detailing / ground, extra top bars by grid label
  const byMark=new Map(old.spans.map(s=>[s.mark,s])),grids=g.input.grids.map(x=>{const o=old.grids.find(y=>y.label===x.label);return o?{...x,extraTop:o.extraTop}:x;});
  const spans=g.input.spans.map(s=>{const o=byMark.get(s.mark);return o?{...s,rebar:structuredClone(o.rebar),...(o.template?{template:o.template}:{template:undefined})}:s;}).map(s=>{const {template,...r}=s;return template?{...r,template}:r;});
  const free=g.input.spans.map(s=>!byMark.has(s.mark)&&!s.template);
  const input:BeamInput={...old,layout:'group',grids,spans,placement:g.input.placement,floorSource:{...g.input.floorSource!,floorVersion:floor.version}};
  const status:BeamPlanStatus=edited?'edited':'update',write=!edited||opts.overwrite?.includes(ex.id);
  rows.push({key:g.key,code:ex.code,status,line:g.line,along:g.along,spans:g.spans,concrete:g.concrete,existing:ex,
   ...(write?fitRow(fittedMember({...ex,occurrences},input,free,spec)):{}),...(edited?{note:'สมาชิกคานถูกแก้รูปทรงเอง · เลือกเขียนทับหรือข้าม'}:{})});}
 for(const m of linked)if(!used.has(m.id))rows.push({key:linkKey(beamInputOf(m)!)||m.id,code:m.code,status:'removed',spans:beamInputOf(m)?.spans.length||0,concrete:0,existing:m,note:'ไม่อยู่ในแปลนแล้ว · ลบเองได้'});
 // which default bars each mark has (members written now, or unchanged ones); marks only on failing lines: none fits
 const sets=new Map<string,Set<string>>();for(const r of rows){const m=r.member||(r.status==='same'?r.existing:undefined);if(!m)continue;
  for(const s of beamInputOf(m)?.spans||[])if(!s.template)sets.set(s.mark,(sets.get(s.mark)||new Set()).add(rebarText(s.rebar)));}
 const out=warnings.map(w=>{const m=w.match(/^คาน (\S+) ยังไม่มี Template/);if(!m)return w;
  return sets.has(m[1])?`${w}: ${[...sets.get(m[1])!].join(' / ')}`:rows.some(r=>r.errors?.length)?`${w}: ไม่มีชุดค่าเริ่มต้นที่ตรวจผ่าน`:w;});
 return {rows,warnings:out};
}
function fitRow(fit:{member:Member;errors:string[]}):Partial<BeamPlanRow>{
 return fit.errors.length?{errors:[...new Set(fit.errors)].slice(0,8)}:{member:fit.member};
}
