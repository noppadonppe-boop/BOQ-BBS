import type {Member,Vec3} from './model';
import type {SheetData} from './bbsSheet';
import {barOwner,ownerParts} from './partTags';
import {partBox} from './partRebar';
import {solidQuantities} from './solids';
import {editablePlacementContext,REGION_LIMIT} from './placementContext';
import {sheetSetupOf} from './drawingStandard';

// BBS sheets per Tag (custom elements with tagged parts / bar groups): one sheet set per tag with only the bars it owns
// and its own concrete (other parts drawn as reference outlines), bars of untagged owners on a "general" set, then a
// summary set (whole model views, a table of the tags and the whole BOQ). Group sets are rebar only: their concrete
// is counted on the part sets. Slab floors: one set per slab mark (its panels' concrete + every bar of the mark).
export type TagSummary={tag:string;label:string;marks:number;weight:number;concrete:number|null};
export type SheetScope={kind:'tag';tag:string;label:string;rebarOnly:boolean}|{kind:'summary';tags:TagSummary[]};
/** owner of a sheet set: a part / bar group, or a slab mark of a slab floor (`ids` = its panels + the mark's bar group) */
type Owner={id:string;tag:string;label:string;group:boolean;ids:string[]};

/** Tagged owners of a member in model order (parts, then groups); slab floors: one owner per slab mark (เบอร์พื้น). */
export function sheetOwners(m:Member):Owner[]{
 const sm=m.shapeModel;if(!sm)return [];
 const fl=floorOf(m);
 if(fl){const marks=[...new Set(fl.panels.map(p=>p.mark))];return marks.map(mark=>{const ps=fl.panels.filter(p=>p.mark===mark),g=sm.groups?.find(x=>x.tag===mark);
  return {id:g?.id||ps[0].id,tag:mark,label:`เบอร์พื้น ${mark} · ${ps.length} แผง (${ps.map(p=>p.tag).join(', ')})`.slice(0,120),group:false,ids:[...ps.map(p=>p.id),...(g?[g.id]:[])]};});}
 return [...sm.parts.filter(p=>p.tag).map(p=>({id:p.id,tag:p.tag!,label:p.label,group:false,ids:[p.id]})),...(sm.groups||[]).map(g=>({id:g.id,tag:g.tag,label:g.label,group:true,ids:[g.id]}))];
}
/** Slab floor input of a member (Slab layout floor), if any. */
const floorOf=(m:Member)=>{const i=m.elementInput as {category?:string;layout?:string;floor?:{panels:{id:string;mark:string;tag:string}[]}}|undefined;return i?.category==='Slab'&&i.layout==='floor'&&i.floor?.panels.length?i.floor:undefined;};
const GENERAL='GEN';
/** Member of one tag: bars it owns, its concrete (other solids become reference outlines), piles under it. */
function tagMember(m:Member,o:Owner|null,ids:Set<string>):{member:Member;rebarOnly:boolean}{
 const sm=m.shapeModel!,mine=o?o.ids.flatMap(id=>ownerParts(sm,id)):[],solid=mine.filter(p=>p.role==='solid');
 const rebarOnly=!o||o.group||!solid.length,bars=m.bars.filter(b=>ids.has(b.id));
 const code=`${m.code}-${o?.tag||GENERAL}`.slice(0,50),title=m.drawingSetup?.title?{...m.drawingSetup,title:`${m.drawingSetup.title} · ${o?.tag||GENERAL}`.slice(0,120)}:m.drawingSetup;
 if(!solid.length)return {member:{...m,code,bars,drawingSetup:title,siteWork:undefined},rebarOnly};
 const keep=new Set(solid.map(p=>p.id)),others=sm.parts.filter(p=>p.role==='solid'&&!keep.has(p.id));
 const ctx=editablePlacementContext(m),room=Math.max(0,REGION_LIMIT-ctx.regions.length);
 const boxes=others.slice(0,room).map((p,k)=>{const b=partBox(p);return {id:`tagctx${k+1}`,label:`${p.tag||p.label}`.slice(0,80),origin:[b.x0,b.y0,b.z0] as Vec3,size:[Math.max(1,b.x1-b.x0),Math.max(1,b.y1-b.y0),Math.max(1,b.z1-b.z0)] as Vec3,reference:'ชิ้นส่วนอื่นของโมเดล (แสดงอ้างอิง)',cover:0,openings:[]};});
 // piles only under a part that sits on the lowest concrete level
 const base=Math.min(...sm.parts.filter(p=>p.role==='solid').map(p=>p.z0)),low=solid.filter(p=>Math.abs(p.z0-base)<1).map(partBox);
 const piles=sm.piles&&low.length?{...sm.piles,positions:sm.piles.positions.filter(([x,y])=>low.some(b=>x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1))}:undefined;
 const shapeModel={...sm,parts:sm.parts.map(p=>p.role==='solid'&&!keep.has(p.id)?{...p,role:'reference' as const,rebar:undefined}:p),groups:undefined,site:undefined,piles:piles?.positions.length?piles:undefined};
 return {member:{...m,code,bars,drawingSetup:title,shapeModel,siteWork:undefined,deductions:[],placementContext:{version:2,regions:[...ctx.regions,...boxes]}},rebarOnly};
}
/** Sheet sets of a member: [s] unless the sheet setup asks for sets per Tag and the model has tags; `pick` (tags)
 * limits the tag sets (the summary always follows). */
export function tagSheetSets(s:SheetData):SheetData[]{
 const m=s.member,sm=m.shapeModel,setup=sheetSetupOf(s.project,m);
 const owners=sheetOwners(m);if(!sm||setup.parts!=='tag'||!owners.length)return [s];
 const pick=new Set((m.drawingSetup?.partTags||[]).map(t=>t.toUpperCase())),tagged=new Map(owners.flatMap(o=>o.ids.map(id=>[id,o] as const)));
 const ownerOf=(id:string)=>{const o=barOwner(sm,{id});return o?tagged.get(o)?.id:undefined;};
 const sets:SheetData[]=[],summary:TagSummary[]=[];
 const add=(o:Owner|null)=>{
  const rows=s.rows.filter(r=>(ownerOf(r.id)??null)===(o?.id??null)),ids=new Set(rows.map(r=>r.id));
  const mine=o?o.ids.flatMap(id=>ownerParts(sm,id)):[];if(!rows.length&&!mine.some(p=>p.role==='solid'))return;
  const {member,rebarOnly}=tagMember(m,o,ids),q=rebarOnly?{volume:0,formwork:0}:solidQuantities(member);
  const weight=rows.reduce((t,r)=>t+r.weight,0),tag=o?.tag||GENERAL,label=o?.label||'เหล็กที่ไม่อยู่ใน Tag';
  summary.push({tag,label,marks:rows.length,weight,concrete:rebarOnly?null:q.volume});
  if(pick.size&&!pick.has(tag.toUpperCase()))return;
  sets.push({...s,member,rows,input:undefined,takeoff:{concrete:q.volume,formwork:q.formwork,excavation:0,backfill:0,lean:0,rebar:weight},scope:{kind:'tag',tag,label,rebarOnly}});
 };
 for(const o of owners)add(o);
 add(null);
 sets.push({...s,scope:{kind:'summary',tags:summary}});
 return sets;
}
