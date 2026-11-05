/** Sheet Composer logic: sections of the BBS sheet (member.drawingViews v2, else the defaults equal to `defaultCuts` /
 * `columnSectionCut`, plus a template's added cuts), the custom layout of a member (own → project default template →
 * none = automatic), templates (roles ↔ keys, proportional cut positions) and layout checks. Docs: docs/SHEET_COMPOSER.md. */
import type {DrawingEdits,ViewEdits} from './drawingEdits';
import type {Member} from './model';
import type {ElementInput} from './elementInput';
import {columnSectionCut,defaultCuts,type ViewRow,type ViewSpec} from './elementViews';
import {boundsOf} from './solids';
import {axisIndex,type SheetSection} from './drawingViews';
import {floorCtx,floorSectionCuts,floorSystemLayout} from './slabFloorSheet';
import type {SheetSize} from './drawingStandard';
import type {PlacedView,ProjectSheetTemplates,RoleKey,SheetLayout,SheetTemplate,ViewKey} from './sheetLayoutSchema';

type Src={member:Member;input?:ElementInput;rows:ViewRow[];project:{spec:{sheetLayoutTemplates?:SheetTemplate[]};sheetTemplates?:ProjectSheetTemplates|null}};
export const DEFAULT_SECTION_IDS={x:'def-x',y:'def-y',z:'def-z'} as const;
/** Sheet sections of a member without its own: X–X (cut along Y at `defaultCuts().y`), Y–Y (along X at `.x`), and the
 * pedestal / starter plan section Z–Z at `columnSectionCut().z` — exactly what the sheet drew before the Composer. */
export function defaultSections(m:Member,input:ElementInput|undefined,rows:ViewRow[]):SheetSection[]{
 // slab floor: X–X / Y–Y through the representative panel of the sheet (a drop / lowered area first), cropped around it
 const fc=floorSectionCuts(m);
 if(fc)return [{id:DEFAULT_SECTION_IDS.x,label:'X-X',axis:'Y',position:Math.round(fc.y),extent:fc.extentX,source:'default'},{id:DEFAULT_SECTION_IDS.y,label:'Y-Y',axis:'X',position:Math.round(fc.x),extent:fc.extentY,source:'default'}];
 const cuts=defaultCuts(m,rows),col=columnSectionCut(input,rows);
 return [{id:DEFAULT_SECTION_IDS.x,label:'X-X',axis:'Y',position:cuts.y,source:'default'},{id:DEFAULT_SECTION_IDS.y,label:'Y-Y',axis:'X',position:cuts.x,source:'default'},
  ...(col?[{id:DEFAULT_SECTION_IDS.z,label:'Z-Z',axis:'Z' as const,position:col.z,source:'default' as const,columns:true}]:[])];
}
/** Ownership of the layout: beam groups and column stacks page their own views (no Composer). */
export const composerSupported=(input?:ElementInput)=>!(input?.category==='Beam'&&input.layout==='group'||input?.category==='Column'&&input.layout==='stack');
/** All templates the project can use: its own first, then those of the General Spec (same id = project wins). */
export function sheetTemplatesOf(p:Src['project']):SheetTemplate[]{const own=p.sheetTemplates?.templates||[],ids=new Set(own.map(t=>t.id));return [...own,...(p.spec.sheetLayoutTemplates||[]).filter(t=>!ids.has(t.id))];}
const foundationTypeOf=(input?:ElementInput)=>input?.category==='Foundation'?input.foundationType:undefined;
const layoutTypeOf=(input?:ElementInput)=>input&&'layout' in input?String((input as {layout?:string}).layout??''):undefined;
/** Project default template of the member's category (a foundation-type entry wins over a plain one). */
export function defaultTemplate(s:Src,size:string):SheetTemplate|undefined{
 const d=s.project.sheetTemplates?.defaults||[],ft=foundationTypeOf(s.input),list=sheetTemplatesOf(s.project);
 const hit=d.find(x=>x.category===s.member.category&&x.foundationType&&x.foundationType===ft)||d.find(x=>x.category===s.member.category&&!x.foundationType);
 const t=hit&&list.find(x=>x.id===hit.id);
 if(!t||t.size!==size)return;
 if(t.match?.foundationType&&t.match.foundationType!==ft||t.match?.layout&&t.match.layout!==layoutTypeOf(s.input))return;
 return t;
}
const extentOf=(m:Member,axis:SheetSection['axis'])=>boundsOf(m)[axisIndex(axis)];
/** Sections a template adds to a member (cut position = at × member size), ids tpl-<k>. */
export function templateSections(t:SheetTemplate,m:Member):SheetSection[]{
 return t.sections.map(x=>({id:`tpl-${x.role.slice(5)}`,label:x.label,axis:x.axis,position:Math.round(x.at*extentOf(m,x.axis)*10)/10,look:x.look,...(x.depth?{depth:x.depth}:{}),source:'user' as const}));
}
const roleToKey=(r:RoleKey,user:(n:string)=>string|undefined):ViewKey|undefined=>r==='sec-x'?`sec:${DEFAULT_SECTION_IDS.x}`:r==='sec-y'?`sec:${DEFAULT_SECTION_IDS.y}`:r==='col-z'?`sec:${DEFAULT_SECTION_IDS.z}`:r.startsWith('user-')?(user(r.slice(5))?`sec:${user(r.slice(5))}`:undefined):r as ViewKey;
/** Template → member layout (keys of `sections`; roles without a section are left out). */
export function templateLayout(t:SheetTemplate,sections:SheetSection[]):SheetLayout{
 const ids=new Set(sections.map(s=>s.id)),user=(n:string)=>ids.has(`tpl-${n}`)?`tpl-${n}`:undefined,key=(r:RoleKey)=>{const k=roleToKey(r,user);return k&&(!k.startsWith('sec:')||ids.has(k.slice(4)))?k:undefined;};
 return {version:1,unplaced:[],sheets:t.sheets.map(sh=>({id:sh.id,views:sh.views.flatMap(v=>{const k=key(v.view as RoleKey);if(!k)return [];const lock=v.lock&&key(v.lock.to as RoleKey);
  return [{...v,view:k,...(v.lock?(lock?{lock:{to:lock,axis:v.lock.axis}}:{lock:undefined}):{})}];})}))};
}
/** Member layout + its sections → template (roles; added cuts as fractions of the member size). */
export function templateFrom(o:{id:string;name:string;category:string;size:'A3'|'A2'|'A1';match?:SheetTemplate['match']},layout:SheetLayout,sections:SheetSection[],m:Member,edits?:DrawingEdits):SheetTemplate{
 const users=sections.filter(s=>!Object.values(DEFAULT_SECTION_IDS).includes(s.id as never)),role=new Map<string,RoleKey>([[`sec:${DEFAULT_SECTION_IDS.x}`,'sec-x'],[`sec:${DEFAULT_SECTION_IDS.y}`,'sec-y'],[`sec:${DEFAULT_SECTION_IDS.z}`,'col-z'],...users.map((s,i)=>[`sec:${s.id}`,`user-${i+1}`] as [string,RoleKey])]);
 // Detail views belong to the member's own edits: not in templates
 const r=(k:string)=>role.get(k)||(k.startsWith('sec:')||k.startsWith('det:')?undefined:k as RoleKey);
 return {...o,sheets:layout.sheets.map(sh=>({id:sh.id,views:sh.views.flatMap(v=>{const k=r(v.view);if(!k)return [];const to=v.lock&&r(v.lock.to);const {lock:_l,...rest}=v;return [{...rest,view:k,...(to?{lock:{to,axis:v.lock!.axis}}:{})}];})})),
  sections:users.slice(0,12).map((s,i)=>({role:`user-${i+1}`,label:s.label,axis:s.axis,at:Math.min(1,Math.max(0,s.position/Math.max(1,extentOf(m,s.axis)))),look:s.look||'+',...(s.depth?{depth:s.depth}:{})})),
  // Drawing Edit layer by role (clouds belong to the member's revisions: left out)
  ...(()=>{const out:Record<string,ViewEdits>={};for(const [k,v] of Object.entries(edits?.views||{})){const role=r(k);if(!role)continue;const objs=(v.objs||[]).filter(o=>o.kind!=='cloud');
   if(Object.keys(v.over||{}).length||objs.length)out[role]={...(v.over&&Object.keys(v.over).length?{over:v.over}:{}),...(objs.length?{objs}:{})};}
   return Object.keys(out).length?{edits:out as SheetTemplate['edits']}:{};})()};
}
/** Template Drawing Edit layer → member view keys (roles without a view are left out); details / revisions are kept by the caller. */
export function templateEdits(t:SheetTemplate,sections:SheetSection[]):DrawingEdits['views']{
 const ids=new Set(sections.map(s=>s.id)),user=(n:string)=>ids.has(`tpl-${n}`)?`tpl-${n}`:undefined,out:DrawingEdits['views']={};
 for(const [role,v] of Object.entries(t.edits||{})){const k=roleToKey(role as RoleKey,user);if(k&&(!k.startsWith('sec:')||ids.has(k.slice(4))))out[k]=structuredClone(v);}
 return out;
}
/** Sections of the sheet: member v2 sections, else defaults (+ the default template's added cuts). */
export function sheetSections(s:Src,size:string):{sections:SheetSection[];from:'member'|'template'|'default'}{
 const dv=s.member.drawingViews;
 if(dv?.version===2)return {sections:dv.sections,from:'member'};
 const base=defaultSections(s.member,s.input,s.rows),t=!s.member.sheetLayout&&composerSupported(s.input)?defaultTemplate(s,size):undefined;
 return t?{sections:[...base,...templateSections(t,s.member)],from:'template'}:{sections:base,from:'default'};
}
/** Layout of the sheet: the member's own, else the project default template, else none (automatic arrangement). */
export function resolveSheetLayout(s:Src,size:string):{layout?:SheetLayout;from:'member'|'template'|'system'|'auto';template?:SheetTemplate}{
 if(!composerSupported(s.input))return {from:'auto'};
 if(s.member.sheetLayout)return {layout:s.member.sheetLayout,from:'member'};
 const t=defaultTemplate(s,size);
 // slab floor without a layout / project template: system template “พื้น (Slab Floor)”
 if(!t&&floorCtx(s.member)){const secs=sheetSections(s,size).sections,has=(id:string)=>secs.some(x=>x.id===id)?id:undefined;
  return {layout:floorSystemLayout(s.member,size as SheetSize,has(DEFAULT_SECTION_IDS.x),has(DEFAULT_SECTION_IDS.y)),from:'system'};}
 if(!t)return {from:'auto'};
 return {layout:templateLayout(t,sheetSections(s,size).sections),from:'template',template:t};
}
/** View spec of a section (look '-' mirrors the horizontal axis, depth / extent as stored). */
export function sectionSpec(sec:SheetSection):ViewSpec{
 const axes:[number,number]=sec.axis==='X'?[1,2]:sec.axis==='Y'?[0,2]:[0,1],normal=axisIndex(sec.axis);
 return {axes,normal,cut:sec.position,...(sec.columns?{columns:true}:{}),...(sec.look==='-'?{look:'-' as const}:{}),...(sec.depth?{depth:sec.depth}:{}),...(sec.extent?{extent:sec.extent}:{}),...(sec.steps?.length?{steps:sec.steps.map(x=>({from:x.from,cut:x.position}))}:{})};
}
type Box={x:number;y:number;w:number;h:number};
const overlap=(a:Box,b:Box,tol=.5)=>a.x<b.x+b.w-tol&&b.x<a.x+a.w-tol&&a.y<b.y+b.h-tol&&b.y<a.y+a.h-tol;
const inside=(a:Box,f:Box,tol=.01)=>a.x>=f.x-tol&&a.y>=f.y-tol&&a.x+a.w<=f.x+f.w+tol&&a.y+a.h<=f.y+f.h+tol;
/** Errors (no save): boxes overlapping, outside the drawing area, on a keep-out (tables / title block / header).
 * `area` = drawing frame of a view sheet, `keep` = keep-out boxes. */
export function layoutBoxProblems(views:(Pick<PlacedView,'view'|'x'|'y'|'w'|'h'>&{title?:string})[],area:Box,keep:Box[]):string[]{
 const out:string[]=[],name=(v:typeof views[number])=>v.title||v.view;
 views.forEach((v,i)=>{if(!inside(v,area))out.push(`${name(v)}: ออกนอกพื้นที่วาดของแผ่น`);if(keep.some(k=>overlap(v,k)))out.push(`${name(v)}: ทับพื้นที่ตาราง / Title block`);
  for(const w of views.slice(i+1))if(overlap(v,w))out.push(`${name(v)} ซ้อนกับ ${name(w)}`);});
 return out;
}
/** Largest free spot for a w × h box (sheet mm) on a sheet: candidate corners on a 2 mm grid, first fit nearest the top left. */
export function freeSpot(size:{w:number;h:number},area:Box,taken:Box[]):Box|undefined{
 const xs=[area.x,...taken.map(t=>t.x+t.w+2)],ys=[area.y,...taken.map(t=>t.y+t.h+2)];
 const cands=xs.flatMap(x=>ys.map(y=>({x,y,...size}))).filter(b=>inside(b,area)&&!taken.some(t=>overlap(b,t,0)));
 return cands.sort((a,b)=>a.y-b.y||a.x-b.x)[0];
}
export {overlap as boxesOverlap};
/** Snap lines of a view (section tool): bar legs parallel to a view axis (“แนวเหล็ก <Mark>”), concrete edges and the centre
 * of the member. axis 0 = constant along the view's horizontal axis (a vertical line on the sheet), 1 = horizontal line. */
export function sectionSnaps(m:Member,rows:ViewRow[],axes:[number,number]){
 const [a,b]=axes,size=boundsOf(m),out:{axis:0|1;at:number;label:string}[]=[];
 for(const r of rows)for(const p of r.paths.slice(0,60))for(let i=1;i<p.length;i++){const s0=p[i-1],s1=p[i];
  if(Math.abs(s0[a]-s1[a])<.5&&Math.abs(s0[b]-s1[b])>1)out.push({axis:0,at:s0[a],label:`แนวเหล็ก ${r.mark}`});
  if(Math.abs(s0[b]-s1[b])<.5&&Math.abs(s0[a]-s1[a])>1)out.push({axis:1,at:s0[b],label:`แนวเหล็ก ${r.mark}`});}
 for(const [i,ax] of [[0,a],[1,b]] as const)out.push({axis:i,at:0,label:'ขอบคอนกรีต'},{axis:i,at:size[ax],label:'ขอบคอนกรีต'},{axis:i,at:size[ax]/2,label:'กึ่งกลาง'});
 return out;
}
/** Nearest snap of a model point (u, v) of a view within `tol` mm (each axis on its own). */
export function snapModelPoint(snaps:ReturnType<typeof sectionSnaps>,u:number,v:number,tol:number){
 let su=u,sv=v,lu='',lv='';
 for(const s of snaps){if(s.axis===0&&Math.abs(s.at-u)<tol&&(!lu||Math.abs(s.at-u)<Math.abs(su-u))){su=s.at;lu=s.label;}if(s.axis===1&&Math.abs(s.at-v)<tol&&(!lv||Math.abs(s.at-v)<Math.abs(sv-v))){sv=s.at;lv=s.label;}}
 return {u:su,v:sv,labelU:lu,labelV:lv};
}
