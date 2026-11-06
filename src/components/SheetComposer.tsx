import {useEffect,useMemo,useRef,useState,type PointerEvent as RPointerEvent} from 'react';
import {Redo2,Undo2} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {takeoff,sum} from '../domain/engine';
import {quantityBasisState} from '../domain/quantityBasis';
import {elementInputSchema} from '../domain/elementInput';
import {drawSheetInfo,layoutPage,sheetArea,sheetFormat,sheetPageCount,sheetViews,type SheetData,type SheetViewInfo} from '../domain/bbsSheet';
import {buildView,markColors,renderView} from '../domain/elementViews';
import {standardScales} from '../domain/drawingStandard';
import {boundsOf} from '../domain/solids';
import {axisIndex,nextSectionLabel,type SheetSection} from '../domain/drawingViews';
import {DEFAULT_SECTION_IDS,boxesOverlap,composerSupported,freeSpot,layoutBoxProblems,resolveSheetLayout,sectionSpec,sheetSections,sheetTemplatesOf,sectionSnaps,snapModelPoint,templateEdits,templateFrom,templateLayout,templateSections,defaultSections} from '../domain/sheetLayout';
import {sheetLayoutSchema,type PlacedView,type ProjectSheetTemplates,type SheetLayout,type ViewKey} from '../domain/sheetLayoutSchema';
import {sheetLangOf} from '../domain/sheetText';
import {PrimsSvg} from './PrimsSvg';
import {HelpButton} from './HelpCenter';
import {labelReport,type LabelIssue} from '../domain/labelQa';
import {labelRulesOf} from '../domain/cadStandard';
import {LabelQaBar,LabelQaOverlay} from './LabelQa';
import {EditCopyDialog,useDrawingEdit} from './DrawingEditLayer';
import {cleanDrawingEdits,drawingEditsSchema,type DetailView,type DrawingEdits} from '../domain/drawingEdits';
import {drawingStatus,drawingStatusText,memberDrawingHash} from '../domain/drawingStatus';
import {FLOOR_PAPER,floorCtx,floorPaperTitles,isFloorPaper} from '../domain/slabFloorSheet';

type Box={x:number;y:number;w:number;h:number};
type Draft={layout?:SheetLayout;sections:SheetSection[];edits?:DrawingEdits};
type Drag={key:ViewKey;mode:'move'|'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw';x0:number;y0:number;box:Box;cur:Box;guides:{x?:number;y?:number;label?:string}[]};
type CutDrag={id:string;axis:'X'|'Y';view:SheetViewInfo;pos:number};
type Tool={step:1|2|3;view?:SheetViewInfo;p1?:[number,number];p2?:[number,number];sec?:SheetSection;size?:{w:number;h:number};at?:[number,number]};
const PREF=[10,15,20,25,30,40,50,75,100,125,150,200,250];
const uid=()=>Math.random().toString(36).slice(2,10);
const H=['nw','n','ne','e','se','s','sw','w'] as const;
const sameJson=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Sheet Composer (full screen): views of the BBS sheet as boxes to move / crop / scale, projection lock, smart guides,
 * view list + unplaced views, sheets, automatic arrangement, undo / redo, the section tool (S: 3 clicks, snaps on bars /
 * concrete edges / centre), dragging cut lines in plans, right-click on a bar → perpendicular section, templates.
 * Mode “แก้ไขแบบ” (Drawing Edit, `DrawingEditLayer.tsx`): move / hide / retext automatic annotations, add text and leaders.
 * Writes member.sheetLayout, member.drawingViews (v2, only when the sections changed) and member.drawingEdits through `onApply`. */
export function SheetComposer({member,project,readOnly,onApply,onSaveDrawing,memberDirty,onSaveTemplates,onClose,siblings,onCopyEdits}:{member:Member;project:Project;readOnly:boolean;onApply?:(m:Member)=>void;
 /** drawing-only save (layout + Drawing Edit layer; admin / qs / detailer): the member keeps its status; used when the sections did
  * not change and the member editor has no unsaved changes, else `onApply` (member edit → Draft on save) */
 onSaveDrawing?:(d:{sheetLayout?:SheetLayout;drawingEdits?:DrawingEdits})=>Promise<void>;memberDirty?:boolean;onSaveTemplates?:(next:ProjectSheetTemplates)=>Promise<void>;onClose:()=>void;
 /** members of the same category (copy of the Drawing Edit layer) */ siblings?:Member[];onCopyEdits?:(t:{member:Member;edits:DrawingEdits|undefined}[])=>Promise<void>;}){
 const [copyOpen,setCopyOpen]=useState(false);
 // sections are member data (saveMember → Draft): only with `onApply`
 const secRO=readOnly||!onApply;
 const base=useMemo(()=>{const q=takeoff(member,project.spec),parsed=elementInputSchema.safeParse(member.elementInput);
  return {member,rows:q.rows,input:parsed.success?parsed.data:undefined,project,quantity:sum(member.occurrences.map(o=>o.quantity)),takeoff:q,status:'DRAFT / NOT FOR CONSTRUCTION',revision:'D'+project.version,date:new Date().toISOString().slice(0,10),provisional:quantityBasisState(member)==='Provisional'} as SheetData;},[member,project]);
 const size=sheetFormat(base).size,initSections=useMemo(()=>sheetSections(base,size).sections,[base,size]);
 const withDraft=(d:Draft):SheetData=>({...base,member:{...member,sheetLayout:d.layout,drawingEdits:d.edits,drawingViews:{version:2,primaryPlane:member.drawingViews?.primaryPlane||'XY',basis:member.drawingViews?.basis||'Sheet Composer',sections:d.sections}}});
 /** editable layout: the member's own, else the template's, else the automatic arrangement written out */
 const autoLayout=(d:Draft):SheetLayout=>{const s={...withDraft({...d,layout:undefined}),member:{...withDraft(d).member,sheetLayout:undefined}},keys=new Set<string>(),sheets:SheetLayout['sheets']=[];
  for(let p=0;p<sheetPageCount(s);p++){const i=drawSheetInfo(s,p),views:PlacedView[]=i.views.filter(v=>v.key).map(v=>({view:v.key!,x:v.box.x,y:v.box.y,w:v.box.w,h:v.box.h,n:'auto'}));
   if(i.notes&&!keys.has('notes')&&sheetArea(s).notes)views.push({view:'notes',...i.notes,n:'auto'});if(!views.length)continue;views.forEach(v=>keys.add(v.view));sheets.push({id:`s${sheets.length+1}`,views});}
  if(!sheets.length)sheets.push({id:'s1',views:[]});
  return {version:1,sheets,unplaced:sheetViews(s).map(v=>v.key).filter(k=>!keys.has(k))};};
 const [draft,setDraft]=useState<Draft>(()=>({layout:member.sheetLayout,sections:initSections,edits:member.drawingEdits}));
 const [mode,setMode]=useState<'layout'|'edit'>('layout');
 const [undo,setUndo]=useState<Draft[]>([]),[redo,setRedo]=useState<Draft[]>([]),[sheet,setSheet]=useState(0),[sel,setSel]=useState<ViewKey>();
 const [tool,setTool]=useState<Tool|undefined>(),[opt,setOpt]=useState({lock:true,guides:true,grid:false}),[drag,setDrag]=useState<Drag>(),[cut,setCut]=useState<CutDrag>();
 const [hover,setHover]=useState<{x:number;y:number;snap?:string}>(),[menu,setMenu]=useState<{x:number;y:number;sec:SheetSection}>(),[tplOpen,setTplOpen]=useState<'save'|'apply'|undefined>(),[msg,setMsg]=useState('');
 const svg=useRef<SVGSVGElement>(null);
 const data=useMemo(()=>withDraft(draft),[draft,base]);
 const layout=useMemo(()=>draft.layout||resolveSheetLayout(data,size).layout||autoLayout(draft),[draft,data]);
 const shown=useMemo(()=>({...data,member:{...data.member,sheetLayout:layout}}),[data,layout]);
 const area=useMemo(()=>sheetArea(shown),[shown]),page=Math.min(sheet,layout.sheets.length-1),info=useMemo(()=>drawSheetInfo(shown,layoutPage(shown,page)),[shown,page]);
 const all=useMemo(()=>sheetViews(shown),[shown]),title=(k:ViewKey)=>k==='notes'?'หมายเหตุ':k==='revs'?'ตาราง Revision':all.find(v=>v.key===k&&v.paper)?.title||(isFloorPaper(k)?floorPaperTitles[k]:all.find(v=>v.key===k)?.title||k);
 // slab floor: paper views (slab schedule, legend, key plan, standard details)
 const paperKeys=useMemo(()=>floorCtx(member)?[...FLOOR_PAPER] as ViewKey[]:[],[member]);
 const placed=layout.sheets[page]?.views||[],boxOf=(k:ViewKey)=>info.views.find(v=>v.key===k)?.box||placed.find(v=>v.view===k);
 const problems=useMemo(()=>layout.sheets.flatMap((sh,i)=>{const inf=i===page?info:drawSheetInfo(shown,layoutPage(shown,i));
  const boxes=[...inf.views.filter(v=>v.key).map(v=>({view:v.key!,title:v.title,...v.box})),...(inf.notes?[{view:'notes',title:'หมายเหตุ',...inf.notes}]:[]),...(inf.revs?[{view:'revs',title:'ตาราง Revision',...inf.revs}]:[]),...(inf.paper||[]).map(p=>({view:p.key,title:title(p.key),...p.box}))];
  return layoutBoxProblems(boxes,area.area,area.keep).map(p=>`แผ่น ${i+1}: ${p}`);}),[layout,shown,info,page,area]);
 const qa=useMemo(()=>labelReport(info.prims,info.views,labelRulesOf(project.spec)),[info,project.spec]),[qaShow,setQaShow]=useState(true),[qaFocus,setQaFocus]=useState<LabelIssue>();
 useEffect(()=>setQaFocus(undefined),[qa]);
 const fitWarn=info.views.filter(v=>!v.fits),dirty=!sameJson(draft.layout,member.sheetLayout)||!sameJson(draft.sections,initSections)||!sameJson(cleanDrawingEdits(draft.edits),cleanDrawingEdits(member.drawingEdits));
 const unplaced=[...new Set([...layout.unplaced,...[...all.map(v=>v.key),...paperKeys,...(draft.edits?.revisions?.length?['revs' as ViewKey]:[])].filter(k=>!layout.sheets.some(s=>s.views.some(v=>v.view===k)))])].filter(k=>k!=='notes'||area.notes);

 // partial drafts keep the other parts (e.g. a layout change keeps the drawing edits)
 const commit=(d:Partial<Draft>)=>{if(readOnly)return;setUndo(u=>[...u.slice(-49),draft]);setRedo([]);setDraft({...draft,...d});};
 // drawing status (P4): model changed since the last save / confirmation, lost anchors, overrides without target
 const dstat=useMemo(()=>{const d=drawingStatus(shown);return {...d,...drawingStatusText(d)};},[shown]);
 const ed=useDrawingEdit({info,edits:draft.edits,commit:e=>commit({edits:e}),readOnly,setMsg,status:dstat,extras:{
  section:{disabled:secRO,title:secRO&&!readOnly?'แก้รูปตัดต้องมีสิทธิ์แก้สมาชิก (Admin / QS)':'รูปตัด (S): สลับไปโหมดจัดหน้าแล้วเริ่มสร้างรูปตัด',run:()=>{ed.clear();setMode('layout');setDt(undefined);setTool({step:1});}},
  detail:{disabled:readOnly||(draft.edits?.details?.length||0)>=8,run:()=>{ed.clear();setMode('layout');setTool(undefined);setDt({step:1});}}}});
 const editLayout=(f:(l:SheetLayout)=>SheetLayout)=>commit({...draft,layout:f(structuredClone(layout))});
 const editView=(k:ViewKey,patch:Partial<PlacedView>)=>editLayout(l=>({...l,sheets:l.sheets.map(s=>({...s,views:s.views.map(v=>v.view===k?{...v,...patch}:v)}))}));
 const editSection=(id:string,patch:Partial<SheetSection>)=>commit({layout:draft.layout||layout,sections:draft.sections.map(s=>s.id===id?{...s,...patch}:s)});
 const back=()=>{if(!undo.length)return;setRedo(r=>[...r,draft]);setDraft(undo.at(-1)!);setUndo(u=>u.slice(0,-1));};
 const fwd=()=>{if(!redo.length)return;setUndo(u=>[...u,draft]);setDraft(redo.at(-1)!);setRedo(r=>r.slice(0,-1));};
 const unplace=(k:ViewKey)=>editLayout(l=>({...l,sheets:l.sheets.map(s=>({...s,views:s.views.filter(v=>v.view!==k)})),unplaced:[...l.unplaced.filter(x=>x!==k),k]}));
 const place=(k:ViewKey,box:Box,on=page,n:PlacedView['n']='auto')=>editLayout(l=>{const sheets=l.sheets.map(s=>({...s,views:s.views.filter(v=>v.view!==k)}));while(sheets.length<=on)sheets.push({id:`s${uid()}`,views:[]});sheets[on].views.push({view:k,...box,n});return {...l,sheets,unplaced:l.unplaced.filter(x=>x!==k)};});
 const moveTo=(k:ViewKey,to:number)=>{const v=layout.sheets.flatMap(s=>s.views).find(x=>x.view===k);if(v)place(k,{x:v.x,y:v.y,w:v.w,h:v.h},to,v.n);};
 const sizeFor=(k:ViewKey,n:number):{w:number;h:number}=>{if(k==='notes')return {w:120,h:80};if(k==='revs')return {w:110,h:Math.min(110,5*((draft.edits?.revisions?.length||0)+1)+3)};if(isFloorPaper(k))return k==='stddet'?{w:200,h:90}:{w:150,h:k==='keyplan'?110:80};const v=all.find(x=>x.key===k);if(!v)return {w:120,h:90};if(v.sizeAt)return v.sizeAt(n);const d=buildView(base.member,base.rows,base.input,v.spec);
  return {w:Math.min(area.area.w-4,(d.u[1]-d.u[0])/n*1.25+30),h:Math.min(area.area.h-30,(d.v[1]-d.v[0])/n+30)};};
 const planN=()=>info.views.find(v=>v.key?.startsWith('plan'))?.n||50;
 const placeFree=(k:ViewKey,sz=sizeFor(k,planN()))=>{const taken=[...info.views.map(v=>v.box),...(info.notes?[info.notes]:[]),...(info.paper||[]).map(p=>p.box),...area.keep],spot=freeSpot(sz,area.area,taken);
  if(spot)place(k,spot);else{place(k,{x:area.area.x+4,y:area.area.y+20,...sz},layout.sheets.length);setSheet(layout.sheets.length);setMsg('แผ่นนี้เต็ม · วางในแผ่นใหม่');}};
 const autoArrange=()=>commit({...draft,layout:autoLayout(draft)});

 // pointer → sheet mm
 const pt=(e:{clientX:number;clientY:number}):[number,number]=>{const s=svg.current!,m=s.getScreenCTM()!.inverse(),p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m);return [p.x,p.y];};
 const others=(k:ViewKey)=>[...info.views.filter(v=>v.key&&v.key!==k).map(v=>v.box),...(info.notes&&k!=='notes'?[info.notes]:[]),...(info.paper||[]).filter(p=>p.key!==k).map(p=>p.box)];
 // projection lock partner: a view sharing the horizontal (x) / vertical (y) model axis whose box overlaps across that direction
 const partner=(k:ViewKey,b:Box)=>{const me=info.views.find(v=>v.key===k);if(!me||k==='notes')return;
  const c=info.views.filter(v=>v.key&&v.key!==k).map(v=>{const ax=v.axes[0]===me.axes[0]&&b.x<v.box.x+v.box.w&&v.box.x<b.x+b.w?'x' as const:v.axes[1]===me.axes[1]&&b.y<v.box.y+v.box.h&&v.box.y<b.y+b.h?'y' as const:undefined;return ax&&{v,ax};}).filter(Boolean) as {v:SheetViewInfo;ax:'x'|'y'}[];
  return c.sort((a,b2)=>Number(b2.v.key==='plan')-Number(a.v.key==='plan'))[0];};
 const onDown=(e:RPointerEvent,k:ViewKey,mode:Drag['mode'])=>{if(readOnly||tool)return;e.stopPropagation();setSel(k);const v=placed.find(x=>x.view===k);if(!v||v.fixed&&mode==='move')return;
  (e.target as Element).setPointerCapture?.(e.pointerId);const [x,y]=pt(e),d=boxOf(k)||v,b={x:d.x,y:d.y,w:d.w,h:d.h};setDrag({key:k,mode,x0:x,y0:y,box:b,cur:b,guides:[]});};
 const onMove=(e:RPointerEvent)=>{const [x,y]=pt(e);
  if(cut){const s=cut.view.s,pos=cut.axis==='X'?cut.view.origin.model[0]+(x-cut.view.origin.sheet[0])/s:cut.view.origin.model[1]-(y-cut.view.origin.sheet[1])/s;setCut({...cut,pos:Math.round(pos)});return;}
  if(tool){toolMove(x,y);return;}
  if(!drag)return;let dx=x-drag.x0,dy=y-drag.y0;const b={...drag.box},g:Drag['guides']=[],m=drag.mode;
  if(opt.grid){dx=Math.round(dx/5)*5;dy=Math.round(dy/5)*5;}
  if(m==='move'){b.x+=dx;b.y+=dy;}else{if(m.includes('e'))b.w=Math.max(20,b.w+dx);if(m.includes('s'))b.h=Math.max(20,b.h+dy);if(m.includes('w')){b.x+=Math.min(dx,b.w-20);b.w=Math.max(20,b.w-dx);}if(m.includes('n')){b.y+=Math.min(dy,b.h-20);b.h=Math.max(20,b.h-dy);}}
  if(m==='move'&&opt.guides){const near=(a:number,c:number)=>Math.abs(a-c)<1.5;
   for(const o of others(drag.key)){for(const [mine,theirs] of [[b.x,o.x],[b.x,o.x+o.w],[b.x+b.w,o.x],[b.x+b.w,o.x+o.w],[b.x+b.w/2,o.x+o.w/2]])if(near(mine,theirs)){b.x+=theirs-mine;g.push({x:theirs});break;}
    for(const [mine,theirs] of [[b.y,o.y],[b.y,o.y+o.h],[b.y+b.h,o.y],[b.y+b.h,o.y+o.h],[b.y+b.h/2,o.y+o.h/2]])if(near(mine,theirs)){b.y+=theirs-mine;g.push({y:theirs});break;}
    const gap=b.x>=o.x+o.w?b.x-o.x-o.w:o.x>=b.x+b.w?o.x-b.x-b.w:b.y>=o.y+o.h?b.y-o.y-o.h:o.y>=b.y+b.h?o.y-b.y-b.h:undefined;if(gap!==undefined&&gap<20&&gap>=0)g.push({label:`ห่าง ${gap.toFixed(1)} mm`});}}
  if(m==='move'&&opt.lock){const p=partner(drag.key,b);if(p){g.push({label:p.v.key==='plan'?'ล็อกแนวฉายกับแปลน':`ล็อกแนวฉายกับ ${p.v.title}`});
   const me=info.views.find(v=>v.key===drag.key)!,d=p.ax==='x'?(p.v.origin.sheet[0]-p.v.origin.model[0]*p.v.s)-(me.origin.sheet[0]+(b.x-drag.box.x)-me.origin.model[0]*me.s):(p.v.origin.sheet[1]+p.v.origin.model[1]*p.v.s)-(me.origin.sheet[1]+(b.y-drag.box.y)+me.origin.model[1]*me.s);
   if(Math.abs(p.v.s-me.s)<1e-9){if(p.ax==='x'){b.x+=d;g.push({x:b.x+b.w/2,label:undefined});}else{b.y+=d;g.push({y:b.y+b.h/2});}}}}
  setDrag({...drag,cur:b,guides:g});setHover({x,y});};
 const onUp=()=>{
  if(cut){const sec=draft.sections.find(s=>s.id===cut.id),max=boundsOf(base.member)[axisIndex(cut.axis)];if(sec&&cut.pos!==sec.position)editSection(cut.id,{position:Math.max(0,Math.min(max,cut.pos))});setCut(undefined);return;}
  if(!drag)return;const b=drag.cur,moved=!sameJson(b,drag.box);setDrag(undefined);if(!moved)return;
  const p=opt.lock&&drag.mode==='move'?partner(drag.key,b):undefined;
  editLayout(l=>({...l,sheets:l.sheets.map(s=>({...s,views:s.views.map(v=>v.view!==drag.key?v:{...v,...b,...(p?{lock:{to:p.v.key!,axis:p.ax}}:drag.mode==='move'&&!opt.lock?{lock:undefined}:{})})}))}));};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,select,textarea'))return;
   if(e.key==='Escape'&&mode!=='edit'){setDrag(undefined);setCut(undefined);setTool(undefined);setMenu(undefined);setDt(undefined);return;}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();back();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();fwd();return;}
   if(mode==='edit'){if(!e.ctrlKey&&!e.metaKey&&!e.altKey)ed.key(e);return;}
   if(e.key==='s'||e.key==='S'){if(!secRO){setDt(undefined);setTool({step:1});}return;}
   if(e.key==='k'||e.key==='K'){if(!readOnly&&details.length<8){setTool(undefined);setDt({step:1});}return;}if(e.key==='v'||e.key==='V'){setTool(undefined);return;}
   if(tool?.step===2&&e.key==='Tab'){e.preventDefault();setTool(t=>t?.sec?{...t,sec:{...t.sec,look:t.sec.look==='-'?'+':'-'}}:t);return;}
   if(!sel||readOnly)return;const v=placed.find(x=>x.view===sel);if(!v)return;const st=e.shiftKey?5:1;
   if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();unplace(sel);setSel(undefined);return;}
   const d={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key];if(d&&!v.fixed){e.preventDefault();editView(sel,{x:v.x+d[0],y:v.y+d[1]});}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});

 // ---- section tool (S): model point of a view under the cursor, snaps on bars / concrete edges / centre
 const viewAt=(x:number,y:number)=>info.views.find(v=>v.key&&v.key!=='notes'&&x>=v.box.x&&x<=v.box.x+v.box.w&&y>=v.box.y&&y<=v.box.y+v.box.h&&v.n>0);
 const toModel=(v:SheetViewInfo,x:number,y:number):[number,number]=>[v.origin.model[0]+(x-v.origin.sheet[0])/v.s,v.origin.model[1]-(y-v.origin.sheet[1])/v.s];
 const toSheet=(v:SheetViewInfo,u:number,w:number):[number,number]=>[v.origin.sheet[0]+(u-v.origin.model[0])*v.s,v.origin.sheet[1]-(w-v.origin.model[1])*v.s];
 const snapPoint=(v:SheetViewInfo,x:number,y:number)=>{const [u,w]=toModel(v,x,y),r=snapModelPoint(sectionSnaps(base.member,base.rows,v.axes),u,w,2.5/v.s),su=Math.round(r.u),sw=Math.round(r.v),ax=['X','Y','Z'];
  return {p:[su,sw] as [number,number],label:r.labelU?`${r.labelU} · ${ax[v.axes[0]]} = ${su.toLocaleString()} mm`:r.labelV?`${r.labelV} · ${ax[v.axes[1]]} = ${sw.toLocaleString()} mm`:''};};
 /** section from two model points of a view: axis-parallel only (the larger direction wins) */
 const sectionFrom=(v:SheetViewInfo,p1:[number,number],p2:[number,number],look:'+'|'-'='+'):SheetSection|undefined=>{
  const horiz=Math.abs(p2[0]-p1[0])>=Math.abs(p2[1]-p1[1]),normal=horiz?v.axes[1]:v.axes[0],pos=horiz?p1[1]:p1[0],ax=(['X','Y','Z'] as const)[normal],max=boundsOf(base.member)[normal];
  if(pos<0||pos>max)return;const along=horiz?v.axes[0]:v.axes[1],range=horiz?[p1[0],p2[0]]:[p1[1],p2[1]],secAxes=sectionSpec({id:'t',label:'T',axis:ax,position:0}).axes;
  const ext:[number,number]|undefined=along===secAxes[0]&&Math.abs(range[1]-range[0])>50?[Math.min(...range),Math.max(...range)]:undefined;
  return {id:`u-${uid()}`,label:nextSectionLabel(draft.sections),axis:ax,position:Math.round(pos),look,source:'user',...(ext?{extent:ext}:{})};};
 const toolMove=(x:number,y:number)=>{if(!tool)return;
  if(tool.step===1){const v=viewAt(x,y);setHover({x,y,snap:v?snapPoint(v,x,y).label:''});return;}
  if(tool.step===2&&tool.view&&tool.p1){const p2=snapPoint(tool.view,x,y).p;setTool({...tool,p2,sec:sectionFrom(tool.view,tool.p1,p2,tool.sec?.look||'+')});setHover({x,y});return;}
  if(tool.step===3&&tool.size)setTool({...tool,at:[x,y]});};
 const toolClick=(x:number,y:number)=>{if(!tool)return;
  if(tool.step===1){const v=viewAt(x,y);if(!v){setMsg('คลิกบนแปลนหรือรูปตัดที่มีมาตราส่วน');return;}if(draft.sections.length>=12){setMsg('รูปตัดได้สูงสุด 12 รูป');return;}setTool({step:2,view:v,p1:snapPoint(v,x,y).p});return;}
  if(tool.step===2&&tool.view&&tool.p1){const p2=snapPoint(tool.view,x,y).p,sec=sectionFrom(tool.view,tool.p1,p2,tool.sec?.look||'+');if(!sec){setMsg('แนวตัดอยู่นอกสมาชิก');return;}
   const keep=tool.sec&&tool.sec.axis===sec.axis&&tool.sec.position!==sec.position?{...sec,position:tool.sec.position}:sec,n=tool.view.n||planN();setTool({...tool,p2,sec:keep,step:3,size:estimate(keep,n)});return;}
  if(tool.step===3&&tool.sec&&tool.size){const b={x:x-tool.size.w/2,y:y-tool.size.h/2,...tool.size};addSection(tool.sec,b);}};
 const estimate=(sec:SheetSection,n:number)=>{const d=buildView(base.member,base.rows,base.input,sectionSpec(sec));return {w:Math.min(area.area.w-4,(d.u[1]-d.u[0])/n*1.25+30),h:Math.min(area.area.h-30,(d.v[1]-d.v[0])/n+30)};};
 const addSection=(sec:SheetSection,b?:Box,on=page)=>{const k=`sec:${sec.id}` as ViewKey,l=structuredClone(layout),sheets=l.sheets;while(sheets.length<=on)sheets.push({id:`s${uid()}`,views:[]});
  if(b)sheets[on].views.push({view:k,...b,n:'auto'});else l.unplaced.push(k);
  commit({layout:{...l,sheets},sections:[...draft.sections,sec]});setTool(undefined);setSel(k);};
 const suggested=tool?.step===3&&tool.size?freeSpot(tool.size,area.area,[...info.views.map(v=>v.box),...(info.notes?[info.notes]:[]),...area.keep]):undefined;
 const preview=useMemo(()=>{if(!tool?.sec)return;const d=buildView(base.member,base.rows,base.input,sectionSpec(tool.sec)),seen=d.bars.filter(b=>b.lines.length||b.dots.length).length;
  return {prims:renderView(d,{x:0,y:0,w:320,h:220},{colors:markColors(base.rows)}),seen};},[tool?.sec,base]);
 // right click on a bar in a plan → perpendicular section through the clicked point
 const onContext=(e:React.MouseEvent)=>{e.preventDefault();if(secRO)return;const [x,y]=pt(e),v=viewAt(x,y);if(!v)return;const [u,w]=toModel(v,x,y),tol=2/v.s,[a,b]=v.axes;
  for(const r of base.rows)for(const p of r.paths)for(let i=1;i<p.length;i++){const s0=p[i-1],s1=p[i];
   if(Math.abs(s0[b]-s1[b])<.5&&Math.abs(w-s0[b])<tol&&u>=Math.min(s0[a],s1[a])&&u<=Math.max(s0[a],s1[a])){const sec=sectionFrom(v,[u,w],[u,w+1]);if(sec){setMenu({x:e.clientX,y:e.clientY,sec:{...sec,label:sec.label}});return;}}
   if(Math.abs(s0[a]-s1[a])<.5&&Math.abs(u-s0[a])<tol&&w>=Math.min(s0[b],s1[b])&&w<=Math.max(s0[b],s1[b])){const sec=sectionFrom(v,[u,w],[u+1,w]);if(sec){setMenu({x:e.clientX,y:e.clientY,sec});return;}}}};
 const startPlace=(sec:SheetSection)=>{setMenu(undefined);setTool({step:3,sec,view:undefined,size:estimate(sec,planN())});};

 // ---- Detail tool (K): centre on a plan / section → radius → place the box; drawing data (member.drawingEdits.details)
 const details=draft.edits?.details||[];
 const [dt,setDt]=useState<{step:1|2|3;view?:SheetViewInfo;c?:[number,number];r?:number;at?:[number,number];size?:{w:number;h:number};n?:number}>();
 const detView=(x:number,y:number)=>{const v=viewAt(x,y);return v&&(v.key?.startsWith('plan')||v.key?.startsWith('sec:'))?v:undefined;};
 const dtMove=(x:number,y:number)=>{if(!dt)return;
  if(dt.step===1){const v=detView(x,y);setHover({x,y,snap:v?snapPoint(v,x,y).label:''});return;}
  if(dt.step===2&&dt.view&&dt.c){const [u,w]=toModel(dt.view,x,y);setDt({...dt,r:Math.max(50,Math.round(Math.hypot(u-dt.c[0],w-dt.c[1])/10)*10)});setHover({x,y});return;}
  if(dt.step===3)setDt({...dt,at:[x,y]});};
 const dtClick=(x:number,y:number)=>{if(!dt)return;
  if(dt.step===1){const v=detView(x,y);if(!v){setMsg('Detail: คลิกจุดศูนย์กลางบนแปลนหรือรูปตัด');return;}setDt({step:2,view:v,c:snapPoint(v,x,y).p,r:300});return;}
  if(dt.step===2&&dt.view&&dt.c&&dt.r){const parentN=dt.view.n||planN(),n=[...standardScales].filter(q=>q<=Math.max(1,parentN/2.5)).pop()||Math.max(1,Math.round(parentN/2)),side=2*dt.r/n+34;
   setDt({...dt,step:3,n,size:{w:Math.min(area.area.w-4,side),h:Math.min(area.area.h-20,side)},at:[x,y]});return;}
  if(dt.step===3&&dt.view?.key&&dt.c&&dt.r&&dt.size&&dt.n){let k=details.length+1;while(details.some(d=>d.label.toUpperCase()===`D${k}`))k++;
   const d:DetailView={id:`d${uid()}`,label:`D${k}`,parent:dt.view.key,u:Math.round(dt.c[0]),v:Math.round(dt.c[1]),r:dt.r,circle:true},key=`det:${d.id}` as ViewKey;
   const l=structuredClone(layout);l.sheets[page].views.push({view:key,x:x-dt.size.w/2,y:y-dt.size.h/2,...dt.size,n:dt.n});
   commit({layout:l,edits:{version:1,views:draft.edits?.views||{},details:[...details,d]}});setDt(undefined);setSel(key);}};
 const editDetail=(id:string,patch:Partial<DetailView>)=>commit({edits:{version:1,views:draft.edits?.views||{},details:details.map(d=>d.id===id?{...d,...patch}:d)}});
 const removeDetail=(id:string)=>{const k=`det:${id}`,views={...(draft.edits?.views||{})};delete views[k];
  commit({layout:{...layout,sheets:layout.sheets.map(s=>({...s,views:s.views.filter(v=>v.view!==k&&v.lock?.to!==k)})),unplaced:layout.unplaced.filter(x=>x!==k)},edits:{version:1,views,details:details.filter(d=>d.id!==id)}});setSel(undefined);};
 const selDet=sel?.startsWith('det:')?details.find(d=>`det:${d.id}`===sel):undefined;
 // ---- templates
 const templates=sheetTemplatesOf(project).filter(t=>t.size===size&&t.category===member.category);
 const [tplName,setTplName]=useState(''),[tplDefault,setTplDefault]=useState(false),[tplMatch,setTplMatch]=useState(false),[tplEdits,setTplEdits]=useState(true);
 const ftype=base.input?.category==='Foundation'?base.input.foundationType:undefined;
 const saveTemplate=async()=>{if(!onSaveTemplates||!tplName.trim())return;const cur=project.sheetTemplates||{version:0,templates:[],defaults:[]},old=cur.templates.find(t=>t.name.toUpperCase()===tplName.trim().toUpperCase());
  const tpl=templateFrom({id:old?.id||`t${uid()}`,name:tplName.trim(),category:member.category,size,...(tplMatch&&ftype?{match:{foundationType:ftype}}:{})},layout,draft.sections,base.member,tplEdits?draft.edits:undefined);
  const defaults=tplDefault?[...cur.defaults.filter(d=>!(d.category===member.category&&(d.foundationType||'')===(tplMatch&&ftype?ftype:''))),{category:member.category,...(tplMatch&&ftype?{foundationType:ftype}:{}),id:tpl.id}]:cur.defaults;
  try{await onSaveTemplates({version:cur.version+1,templates:[...cur.templates.filter(t=>t.id!==tpl.id),tpl],defaults});setTplOpen(undefined);setMsg(`บันทึก Template “${tpl.name}” แล้ว${tplDefault?' · ตั้งเป็นค่าเริ่มต้นของโครงการ':''}`);}catch(e){setMsg(e instanceof Error?e.message:String(e));}};
 const applyTemplate=(id:string)=>{const t=templates.find(x=>x.id===id);if(!t)return;const secs=[...defaultSections(base.member,base.input,base.rows),...templateSections(t,base.member)],l=templateLayout(t,secs),keys=new Set(l.sheets.flatMap(s=>s.views.map(v=>v.view)));
  const warn=t.sections.filter(x=>!secs.some(s=>s.id===`tpl-${x.role.slice(5)}`)).length;
  // the template's Drawing Edit layer replaces the views' edits; details / revisions of this member stay
  const edits=t.edits?{...(draft.edits||{version:1 as const,views:{}}),views:templateEdits(t,secs)}:draft.edits;
  commit({sections:secs,layout:{...l,unplaced:sheetViews(withDraft({sections:secs})).map(v=>v.key).filter(k=>!keys.has(k))},edits});setTplOpen(undefined);setSheet(0);setMsg(`ใช้ Template “${t.name}”${warn?` · ข้าม ${warn} รูปตัด`:''}${t.edits?' · รวมการแก้ไขแบบ':''}`);};
 const revert=()=>{commit({layout:undefined,sections:member.drawingViews?.version===2?draft.sections:initSections});setMsg('กลับไปใช้ Template ของโครงการ / จัดอัตโนมัติ');};

 const done=()=>{if(problems.length){setMsg('แก้ปัญหาการจัดหน้าก่อน (กรอบซ้อน / ออกนอกแผ่น / ทับตาราง)');return;}
  const own=draft.layout?sheetLayoutSchema.safeParse({...layout,unplaced:unplaced.filter(k=>k!=='notes'||area.notes)}):undefined;if(own&&!own.success){setMsg(own.error.issues[0]?.message||'Layout ไม่ถูกต้อง');return;}
  const secsChanged=!sameJson(draft.sections,initSections),next:Member={...member},edits=cleanDrawingEdits(draft.edits);
  if(edits){const ok=drawingEditsSchema.safeParse(edits);if(!ok.success){setMsg(`แก้ไขแบบ: ${ok.error.issues[0]?.message||'ข้อมูลไม่ถูกต้อง'}`);return;}next.drawingEdits=ok.data;}else delete next.drawingEdits;
  if(own?.data)next.sheetLayout=own.data;else delete next.sheetLayout;
  if(secsChanged)next.drawingViews={version:2,primaryPlane:member.drawingViews?.primaryPlane||'XY',basis:member.drawingViews?.basis||'Sheet Composer',sections:draft.sections};
  // saving the edited drawing = checked against this model (status “ตรงกับโมเดล” until the model changes)
  if(next.drawingEdits)next.drawingEdits={...next.drawingEdits,check:{hash:memberDrawingHash(next),at:new Date().toISOString()}};
  if(secsChanged&&!onApply){setMsg('แก้รูปตัดต้องมีสิทธิ์แก้สมาชิก (Admin / QS)');return;}
  if(!secsChanged&&onSaveDrawing&&(!memberDirty||!onApply)){onSaveDrawing({sheetLayout:next.sheetLayout,drawingEdits:next.drawingEdits}).then(onClose,e=>setMsg(e instanceof Error?e.message:String(e)));return;}
  onApply?.(next);onClose();};
 const close=()=>{if(dirty&&!readOnly&&!confirm('ทิ้งการจัดหน้าที่ยังไม่ได้กด “เสร็จ”?'))return;onClose();};
 const selV=sel?placed.find(v=>v.view===sel):undefined,selInfo=sel?info.views.find(v=>v.key===sel):undefined,selSec=sel?.startsWith('sec:')?draft.sections.find(s=>`sec:${s.id}`===sel):undefined;
 const selBad=(k:ViewKey)=>problems.some(p=>p.includes(title(k)))||info.views.some(v=>v.key===k&&!v.fits);
 const planView=info.views.filter(v=>v.key?.startsWith('plan'));

 if(!composerSupported(base.input))return <div className="composer-shade"><div className="composer composer-empty"><p className="notice">กลุ่มคานและเสาหลายชั้นจัดหน้าเองตามช่วงคาน / ชั้น · ยังจัดหน้าด้วย Composer ไม่ได้</p><button onClick={onClose}>ปิด</button></div></div>;
 return <div className="composer-shade" role="dialog" aria-modal="true" aria-label={`จัดหน้าแบบ · ${member.code}`}>
  <div className="composer">
   <header className="composer-head">
    <button onClick={close}>← กลับตัวอย่าง</button>
    <div className="segmented composer-mode" role="tablist" aria-label="โหมด">
     <button role="tab" aria-selected={mode==='layout'} className={mode==='layout'?'active':''} onClick={()=>{setMode('layout');ed.clear();}}>จัดหน้า</button>
     <button role="tab" aria-selected={mode==='edit'} className={mode==='edit'?'active':''} onClick={()=>{setMode('edit');setTool(undefined);setSel(undefined);}}>แก้ไขแบบ</button></div>
    <div className="composer-title"><b>{member.code} · {mode==='edit'?'แก้ไขแบบ':'จัดหน้าแบบ'} <HelpButton topic={mode==='edit'?'drawing-edit':'sheet-composer'}/></b><small>{size} · แผ่น {page+1} / {layout.sheets.length}{draft.layout?'':' · ตาม Template / อัตโนมัติ'}{readOnly?' · อ่านอย่างเดียว':''} <span className={`ds-pill ${dstat.state}`} title={dstat.detail}>{dstat.label}</span></small></div>
    <div className="composer-tools" role="toolbar" aria-label="เครื่องมือ">
     {mode==='edit'?ed.toolbar:<>
     <button aria-pressed={!tool} className={!tool?'active':''} onClick={()=>setTool(undefined)}>เลือก / ย้าย <kbd>V</kbd></button>
     <button aria-pressed={!!tool} className={tool?'active':''} disabled={secRO} title={secRO&&!readOnly?'แก้รูปตัดต้องมีสิทธิ์แก้สมาชิก (Admin / QS)':undefined} onClick={()=>setTool({step:1})}>+ รูปตัด <kbd>S</kbd></button>
     <button aria-pressed={!!dt} className={dt?'active':''} disabled={readOnly||details.length>=8} onClick={()=>{setTool(undefined);setDt({step:1});}}>+ รูปขยาย Detail <kbd>K</kbd></button>
     <button disabled={readOnly||layout.sheets.some(s=>s.views.some(v=>v.view==='iso'))} onClick={()=>placeFree('iso',{w:120,h:110})}>+ 3D ISO</button>
     <button disabled title="รูปตัดเอียง: ยังไม่รองรับ · รูปตัดหักมุม: เลือกรูปตัดแล้วเพิ่มขั้นในแถบขวา">รูปตัดเอียง</button></>}
    </div>
    <div className="composer-opts">
     {mode==='edit'?ed.snapBar:<>
     <label className="check"><input type="checkbox" checked={opt.lock} onChange={e=>setOpt({...opt,lock:e.target.checked})}/>Snap แนวฉาย</label>
     <label className="check"><input type="checkbox" checked={opt.guides} onChange={e=>setOpt({...opt,guides:e.target.checked})}/>Smart guide</label>
     <label className="check"><input type="checkbox" checked={opt.grid} onChange={e=>setOpt({...opt,grid:e.target.checked})}/>Grid 5 mm</label>
     <button disabled={readOnly} onClick={autoArrange}>จัดอัตโนมัติ</button></>}
     <button aria-label="ย้อนกลับ" disabled={!undo.length} onClick={back}><Undo2 size={15}/></button><button aria-label="ทำซ้ำ" disabled={!redo.length} onClick={fwd}><Redo2 size={15}/></button>
     <details className="composer-menu"><summary>Template</summary><div>
      <button disabled={readOnly||!onSaveTemplates} title={onSaveTemplates?undefined:'ต้องเป็น Admin / QS ของโครงการ'} onClick={()=>{setTplName(member.code);setTplOpen('save');}}>บันทึกเป็น Template…</button>
      <button disabled={readOnly||!templates.length} onClick={()=>setTplOpen('apply')}>ใช้ Template…{templates.length?` (${templates.length})`:''}</button>
      <button disabled={readOnly||!draft.layout} onClick={revert}>กลับไปใช้ Template / อัตโนมัติ</button>
      <button disabled={!onCopyEdits||!draft.edits} title={!onCopyEdits?'ต้องมีสิทธิ์แก้แบบ (Admin / QS / Detailer)':!draft.edits?'ยังไม่มีการแก้ไขแบบ':undefined} onClick={()=>setCopyOpen(true)}>คัดลอกการแก้ไขแบบไปยังสมาชิกอื่น…</button></div></details>
     {copyOpen&&onCopyEdits&&<EditCopyDialog source={member.code} edits={draft.edits} siblings={siblings||[]} onCopy={onCopyEdits} onClose={()=>setCopyOpen(false)}/>}
     <button className="primary" disabled={readOnly||!!problems.length} title={problems[0]} onClick={done}>เสร็จ</button>
    </div>
   </header>
   <div className="composer-body">
    <aside className="composer-list" aria-label={mode==='edit'?'วัตถุบนแผ่น':'รายการรูป'}>{mode==='edit'?ed.list:<>
     <h4>รูปในแผ่นนี้</h4>
     {placed.map((v,i)=>{const inf=info.views.find(x=>x.key===v.view),sec=draft.sections.find(s=>`sec:${s.id}`===v.view);
      return <div key={v.view} draggable={!readOnly} onDragStart={e=>e.dataTransfer.setData('text/view',v.view)} className={`composer-item${sel===v.view?' active':''}${selBad(v.view)?' bad':''}`} onClick={()=>setSel(v.view)}>
       <span className="grip" aria-hidden>⋮⋮</span><span className="name"><b>{title(v.view)}</b><small>{sec?`${sec.axis} = ${Math.round(sec.position).toLocaleString()} mm${sec.look==='-'?' · มองกลับ':''}`:v.view==='notes'?'MTEXT':''}</small></span>
       <code>{inf?.n?`1:${inf.n}`:v.view==='notes'?'—':'NTS'}</code>
       <span className="order"><button aria-label="ขึ้น" disabled={readOnly||!i} onClick={e=>{e.stopPropagation();editLayout(l=>{const vs=l.sheets[page].views,[x]=vs.splice(i,1);vs.splice(i-1,0,x);return l;});}}>↑</button><button aria-label="ลง" disabled={readOnly||i===placed.length-1} onClick={e=>{e.stopPropagation();editLayout(l=>{const vs=l.sheets[page].views,[x]=vs.splice(i,1);vs.splice(i+1,0,x);return l;});}}>↓</button></span></div>;})}
     <h4>ยังไม่ได้วาง</h4>
     {!unplaced.length&&<p className="muted">—</p>}
     {unplaced.map(k=><div key={k} className="composer-item unplaced" draggable={!readOnly} onDragStart={e=>e.dataTransfer.setData('text/view',k)}><span className="grip" aria-hidden>⋮⋮</span><span className="name"><b>{title(k)}</b></span><button disabled={readOnly} onClick={()=>placeFree(k)}>วาง</button></div>)}
     <p className="muted composer-hint">ลากรายการลงแผ่นหรือแผ่นด้านล่าง · Delete = เอาออก · ลูกศร 1 mm · Shift 5 mm · Ctrl+Z / Ctrl+Y</p></>}
    </aside>
    <main className="composer-canvas" onDragOver={e=>e.preventDefault()} onDrop={e=>{const k=e.dataTransfer.getData('text/view') as ViewKey;if(!k||readOnly)return;const [x,y]=pt(e),v=layout.sheets.flatMap(s=>s.views).find(q=>q.view===k),sz=v?{w:v.w,h:v.h}:sizeFor(k,planN());place(k,{x:x-sz.w/2,y:y-sz.h/2,...sz},page,v?.n);}}>
     <svg ref={svg} viewBox={`0 0 ${info.w} ${info.h}`} className={mode==='edit'?'edit':tool?'tool':''} style={mode==='edit'?{cursor:ed.cursor}:undefined}
      onPointerMove={e=>{if(mode==='edit'){const [x,y]=pt(e);ed.move(x,y);setHover({x,y});return;}if(dt){const [x,y]=pt(e);dtMove(x,y);return;}onMove(e);}} onPointerUp={()=>{if(mode==='edit'){ed.up();return;}onUp();}} onPointerLeave={()=>setHover(undefined)} onContextMenu={e=>{if(mode==='edit'){e.preventDefault();const [x,y]=pt(e);ed.context(x,y,e.clientX,e.clientY);return;}onContext(e);}}
      onPointerDown={e=>{if(mode==='edit'){(e.currentTarget as Element).setPointerCapture?.(e.pointerId);const [x,y]=pt(e);ed.down(x,y);return;}if(dt){const [x,y]=pt(e);dtClick(x,y);return;}if(tool){const [x,y]=pt(e);toolClick(x,y);}else setSel(undefined);}} role="img" aria-label="แผ่นที่กำลังจัด" fontFamily="Sarabun, sans-serif">
      <rect x={0} y={0} width={info.w} height={info.h} fill="#fff"/><PrimsSvg prims={ed.filter(info.prims)}/>{qaShow&&<LabelQaOverlay reports={qa} focus={qaFocus}/>}
      {mode==='edit'&&ed.overlay}
      {mode==='layout'&&<>
      {area.keep.map((k,i)=><rect key={i} {...k} className="keepout"/>)}
      {opt.grid&&<g className="grid5">{Array.from({length:Math.floor(info.w/5)},(_,i)=><line key={'x'+i} x1={i*5} x2={i*5} y1={0} y2={info.h}/>)}{Array.from({length:Math.floor(info.h/5)},(_,i)=><line key={'y'+i} y1={i*5} y2={i*5} x1={0} x2={info.w}/>)}</g>}
      {[...placed].map(v=>{const b=drag?.key===v.view?drag.cur:boxOf(v.view)||v,on=sel===v.view;
       return <g key={v.view} className={`vbox${on?' on':''}${selBad(v.view)?' bad':''}${v.fixed?' fixed':''}`}>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} onPointerDown={e=>onDown(e,v.view,'move')}/>
        {on&&!readOnly&&H.map(h=>{const hx=b.x+(h.includes('w')?0:h.includes('e')?b.w:b.w/2),hy=b.y+(h.includes('n')?0:h.includes('s')?b.h:b.h/2);return <rect key={h} className={`handle h-${h}`} x={hx-1.4} y={hy-1.4} width={2.8} height={2.8} onPointerDown={e=>onDown(e,v.view,h)}/>;})}
       </g>;})}
      {drag?.guides.map((g,i)=>g.x!==undefined?<line key={i} className="guide" x1={g.x} x2={g.x} y1={0} y2={info.h}/>:g.y!==undefined?<line key={i} className="guide" y1={g.y} y2={g.y} x1={0} x2={info.w}/>:null)}
      {drag&&drag.guides.some(g=>g.label)&&<g className="guide-label"><rect x={drag.cur.x} y={drag.cur.y-8} width={Math.max(40,drag.guides.filter(g=>g.label).map(g=>g.label!).join(' · ').length*1.8)} height={6} rx={1.2}/><text x={drag.cur.x+2} y={drag.cur.y-3.6} fontSize={3.2}>{drag.guides.filter(g=>g.label).map(g=>g.label).join(' · ')}</text></g>}
      {/* cut lines of the sections on the plans: drag to move the cut */}
      {!tool&&!secRO&&planView.flatMap(pv=>draft.sections.filter(s=>s.axis!=='Z').map(s=>{const pos=cut?.id===s.id&&cut.view.key===pv.key?cut.pos:s.position,vert=s.axis==='X'?pv.axes[0]===0:pv.axes[0]===1;
       const [x,y]=toSheet(pv,s.axis==='X'?pos:0,s.axis==='Y'?pos:0);const b=pv.box;
       return <line key={pv.key+s.id} className={`cutline${cut?.id===s.id?' on':''}`} x1={vert?x:b.x} x2={vert?x:b.x+b.w} y1={vert?b.y+4:y} y2={vert?b.y+b.h:y} onPointerDown={e=>{e.stopPropagation();(e.target as Element).setPointerCapture?.(e.pointerId);setCut({id:s.id,axis:s.axis as 'X'|'Y',view:pv,pos:s.position});}}><title>{`ลากแนวตัด ${s.label.replace('-','–')}`}</title></line>;}))}
      {tool?.step===2&&tool.view&&tool.p1&&tool.p2&&(()=>{const a=toSheet(tool.view,...tool.p1),b=toSheet(tool.view,...tool.p2),h=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1]);return <line className="newcut" x1={a[0]} y1={a[1]} x2={h?b[0]:a[0]} y2={h?a[1]:b[1]}/>;})()}
      {suggested&&<rect className="suggest" {...suggested}/>}
      {tool?.step===3&&tool.size&&tool.at&&<rect className="placing" x={tool.at[0]-tool.size.w/2} y={tool.at[1]-tool.size.h/2} width={tool.size.w} height={tool.size.h}/>}
      {dt?.view&&dt.c&&dt.r&&(()=>{const [cx,cy]=toSheet(dt.view,...dt.c);return <circle className="newcut" cx={cx} cy={cy} r={dt.r*dt.view.s} fill="none"/>;})()}
      {dt?.step===3&&dt.size&&dt.at&&<rect className="placing" x={dt.at[0]-dt.size.w/2} y={dt.at[1]-dt.size.h/2} width={dt.size.w} height={dt.size.h}/>}</>}
     </svg>
     {mode==='edit'&&ed.hint&&<div className="composer-tip">{ed.hint}</div>}
     {mode==='edit'&&ed.menu}
     {mode==='layout'&&hover&&(drag||tool)&&<div className="composer-tip">{drag?`x ${drag.cur.x.toFixed(1)} · y ${drag.cur.y.toFixed(1)} mm`:tool?.step===1?hover.snap?`Snap: ${hover.snap}`:'คลิกจุดเริ่มบนแปลน / รูปตัด':tool?.step===2?`${tool.sec?`${tool.sec.label.replace('-','–')} · ${tool.sec.axis} = ${tool.sec.position.toLocaleString()} mm · มอง ${tool.sec.look==='-'?'−':'+'}${tool.sec.axis} (Tab สลับ)`:'นอกสมาชิก'}`:'คลิกบนแผ่นเพื่อวางรูปตัด · Esc ยกเลิก'}</div>}
     {mode==='layout'&&dt&&<div className="composer-toolbox"><b>+ รูปขยาย Detail · ขั้น {dt.step} / 3</b>
      <p>{dt.step===1?'คลิกจุดศูนย์กลางบนแปลนหรือรูปตัด (snap แนวเหล็ก / ขอบ)':dt.step===2?`ลากออกแล้วคลิกเพื่อกำหนดรัศมี · R = ${dt.r?.toLocaleString()} mm`:`คลิกวางบนแผ่น · มาตราส่วน 1:${dt.n}`}</p>
      <button onClick={()=>setDt(undefined)}>ยกเลิก (Esc)</button></div>}
     {mode==='layout'&&tool&&<div className="composer-toolbox">
      <b>+ รูปตัด · ขั้น {tool.step} / 3</b>
      {tool.step===1&&<p>คลิกจุดเริ่มบนแปลนหรือรูปตัด (snap: แนวเหล็ก · ขอบคอนกรีต · กึ่งกลาง)</p>}
      {tool.step===2&&<><p>คลิกจุดจบ · แนวตัดตั้งฉากแกน · Tab = สลับทิศมอง</p>
       {preview&&<svg viewBox="0 0 320 220" className="composer-preview"><PrimsSvg prims={preview.prims}/></svg>}
       {preview&&<p className={preview.seen?'muted':'notice warning'}>{preview.seen?`เห็นเหล็ก ${preview.seen} Mark`:'แนวตัดนี้ไม่โดนเหล็กเลย'}</p>}
       {tool.sec&&<label className="field inline"><span>ตำแหน่ง {tool.sec.axis} (mm)</span><input type="number" value={tool.sec.position} onChange={e=>setTool({...tool,sec:{...tool.sec!,position:Number(e.target.value)}})}/></label>}</>}
      {tool.step===3&&<><p>คลิกบนแผ่นเพื่อวาง · กรอบเขียว = จุดว่างที่แนะนำ</p><div className="actions">
       {suggested&&tool.sec&&<button className="primary" onClick={()=>addSection(tool.sec!,suggested)}>วางที่แนะนำ</button>}
       {tool.sec&&tool.size&&<button onClick={()=>{addSection(tool.sec!,{x:area.area.x+4,y:area.area.y+20,...tool.size!},layout.sheets.length);setSheet(layout.sheets.length);}}>วางแผ่นใหม่</button>}
       {tool.sec&&<button onClick={()=>addSection(tool.sec!)}>เก็บไว้ยังไม่วาง</button>}</div></>}
      <button onClick={()=>setTool(undefined)}>ยกเลิก (Esc)</button></div>}
     {menu&&<div className="composer-ctx" style={{left:menu.x,top:menu.y}} onPointerLeave={()=>setMenu(undefined)}><button onClick={()=>startPlace(menu.sec)}>สร้างรูปตัดตั้งฉาก ({menu.sec.axis} = {menu.sec.position.toLocaleString()} mm)</button></div>}
    </main>
    <aside className="composer-props" aria-label="คุณสมบัติรูป">
     {msg&&<p className="notice" role="status" onClick={()=>setMsg('')}>{msg}</p>}
     {problems.length>0&&<div className="notice danger"><b>บันทึกไม่ได้:</b><ul>{problems.slice(0,6).map(p=><li key={p}>{p}</li>)}</ul></div>}
     <LabelQaBar compact reports={qa} show={qaShow} onShow={setQaShow} focus={qaFocus} onFocus={i=>{setQaFocus(i);const k=i&&info.views.find(v=>v.id===i.view)?.key;if(k)setSel(k);}}/>
     {fitWarn.length>0&&<p className="notice warning">{fitWarn.map(v=>`${v.title}: ใช้ ${v.n?`1:${v.n}`:'NTS'} (มาตราส่วนที่เลือกไม่พอดีกรอบ)`).join(' · ')}</p>}
     {mode==='edit'?ed.panel:!selV?<p className="muted">เลือกรูปบนแผ่นหรือในรายการ</p>:<>
      <div className="sel-head"><small>รูปที่เลือก</small><b>{title(selV.view)}</b></div>
      {selSec&&selSec.source==='user'&&<label className="field"><span>ชื่อรูปตัด</span><input value={selSec.label} maxLength={12} disabled={secRO} onChange={e=>{const v=e.target.value.toUpperCase();if(/^[A-Z0-9]+(?:-[A-Z0-9]*)?$/.test(v)&&!draft.sections.some(s=>s.id!==selSec.id&&s.label.toUpperCase()===v))editSection(selSec.id,{label:v});}}/></label>}
      <div className="form-grid">
       {selV.view!=='notes'&&!isFloorPaper(selV.view)&&<label className="field"><span>มาตราส่วน</span><select value={String(selV.n)} disabled={readOnly} onChange={e=>editView(selV.view,{n:e.target.value==='auto'?'auto':Number(e.target.value)})}><option value="auto">Auto{selInfo?.n?` (1:${selInfo.n})`:''}</option>{[...new Set([...PREF,...standardScales.filter(n=>n>=5&&n<=500)])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>1:{n}</option>)}</select></label>}
       {selSec&&<label className="field"><span>ตำแหน่งตัด {selSec.axis} (mm)</span><input type="number" min={0} max={boundsOf(base.member)[axisIndex(selSec.axis)]} value={selSec.position} disabled={secRO} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0&&v<=boundsOf(base.member)[axisIndex(selSec.axis)])editSection(selSec.id,{position:v});}}/></label>}
      </div>
      {selSec&&!selSec.columns&&<><div className="field"><span>ทิศที่มอง</span><div className="segmented">{(['+','-'] as const).map(l=><button key={l} type="button" disabled={secRO} className={(selSec.look||'+')===l?'active':''} onClick={()=>editSection(selSec.id,{look:l})}>มอง {l==='+'?'+':'−'}{selSec.axis}</button>)}</div></div>
       <label className="field"><span>ความลึกที่มองเห็นหลังแนวตัด (mm · 0 = เฉพาะแนวที่ใกล้สุด)</span><input type="number" min={0} step={50} value={selSec.depth||0} disabled={secRO} onChange={e=>{const v=Number(e.target.value);editSection(selSec.id,{depth:v>0?v:undefined});}}/></label></>}
      {selSec&&!selSec.columns&&selSec.axis!=='Z'&&<fieldset className="composer-show"><legend>หักมุม (Stepped section)</legend>
       <p className="muted">ตั้งแต่ระยะ “จาก” (ตามแกนแนวนอนของรูปตัด) แนวตัดย้ายไปที่ตำแหน่งใหม่ · สูงสุด 4 ขั้น</p>
       {(selSec.steps||[]).map((st,i)=><div key={i} className="form-grid step-row">
        <label className="field"><span>จาก (mm)</span><input type="number" min={0} disabled={secRO} value={st.from} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0)editSection(selSec.id,{steps:(selSec.steps||[]).map((x,j)=>j===i?{...x,from:v}:x)});}}/></label>
        <label className="field"><span>ตัดที่ {selSec.axis} (mm)</span><input type="number" min={0} disabled={secRO} value={st.position} onChange={e=>{const v=Number(e.target.value),max=boundsOf(base.member)[axisIndex(selSec.axis)];if(Number.isFinite(v)&&v>=0&&v<=max)editSection(selSec.id,{steps:(selSec.steps||[]).map((x,j)=>j===i?{...x,position:v}:x)});}}/></label>
        <button className="danger-text" disabled={secRO} aria-label="ลบขั้น" onClick={()=>{const steps=(selSec.steps||[]).filter((_,j)=>j!==i);editSection(selSec.id,{steps:steps.length?steps:undefined});}}>×</button></div>)}
       <button disabled={secRO||(selSec.steps||[]).length>=4} onClick={()=>{const along=sectionSpec(selSec).axes[0],size=boundsOf(base.member)[along],max=boundsOf(base.member)[axisIndex(selSec.axis)],last=selSec.steps?.at(-1);
        editSection(selSec.id,{steps:[...(selSec.steps||[]),{from:Math.round(last?(last.from+size)/2:size/2),position:Math.round(Math.min(max,(last?.position??selSec.position)+Math.min(500,max/4)))}]});}}>+ เพิ่มขั้น</button></fieldset>}
      {selDet&&<fieldset className="composer-show"><legend>รูปขยาย Detail</legend>
       <div className="form-grid"><label className="field"><span>ชื่อ</span><input value={selDet.label} maxLength={8} disabled={readOnly} onChange={e=>{const v=e.target.value.toUpperCase();if(/^[A-Z0-9-]{1,8}$/.test(v)&&!details.some(d=>d.id!==selDet.id&&d.label.toUpperCase()===v))editDetail(selDet.id,{label:v});}}/></label>
        <label className="field"><span>รัศมี (mm)</span><input type="number" min={20} max={20000} step={10} disabled={readOnly} value={selDet.r} onChange={e=>{const v=Number(e.target.value);if(v>=20&&v<=20000)editDetail(selDet.id,{r:v});}}/></label></div>
       <div className="segmented">{([true,false] as const).map(c=><button key={String(c)} type="button" disabled={readOnly} className={(selDet.circle!==false)===c?'active':''} onClick={()=>editDetail(selDet.id,{circle:c})}>{c?'วงกลม':'สี่เหลี่ยม'}</button>)}</div>
       <p className="muted">จาก {title(selDet.parent as ViewKey)} · ศูนย์กลาง ({selDet.u.toLocaleString()}, {selDet.v.toLocaleString()}) mm · วงรอบ + ป้าย {selDet.label} แสดงบนรูปต้นทาง</p>
       <button className="danger-text" disabled={readOnly} onClick={()=>removeDetail(selDet.id)}>ลบ Detail</button></fieldset>}
      {selV.view!=='notes'&&!isFloorPaper(selV.view)&&<fieldset className="composer-show"><legend>แสดงในรูป</legend>
       {([['dims','Dimension อัตโนมัติ'],['marks','ป้าย Mark'],['levels','ระดับ T.O.F. / B.O.F.']] as const).map(([k,t])=><label key={k} className="check"><input type="checkbox" disabled={readOnly} checked={selV.show?.[k]!==false} onChange={e=>editView(selV.view,{show:{...selV.show,[k]:e.target.checked}})}/>{t}</label>)}
       {selV.view.startsWith('plan')&&<label className="check"><input type="checkbox" disabled={readOnly} checked={!!selV.show?.allBars} onChange={e=>editView(selV.view,{show:{...selV.show,allBars:e.target.checked}})}/>เหล็กทุกเส้น (ปิด = ตัวแทน)</label>}</fieldset>}
      <fieldset className="composer-show"><legend>การจัดวาง</legend>
       {selV.view!=='notes'&&!isFloorPaper(selV.view)&&<label className="check"><input type="checkbox" disabled={readOnly} checked={!!selV.lock} onChange={e=>{const p=partner(selV.view,selV);editView(selV.view,{lock:e.target.checked&&p?{to:p.v.key!,axis:p.ax}:undefined});if(e.target.checked&&!p)setMsg('ไม่มีรูปที่ใช้แกนเดียวกันในแนวเดียวกัน');}}/>ล็อกแนวฉาย{selV.lock?` กับ ${title(selV.lock.to)} (แกน ${selV.lock.axis})`:''}</label>}
       {selInfo?.lockNote&&<p className="notice warning">{selInfo.lockNote}</p>}
       <label className="check"><input type="checkbox" disabled={readOnly} checked={!!selV.fixed} onChange={e=>editView(selV.view,{fixed:e.target.checked||undefined})}/>ล็อกตำแหน่ง</label>
       <p className="muted">x {selV.x.toFixed(1)} · y {selV.y.toFixed(1)} · {selV.w.toFixed(0)} × {selV.h.toFixed(0)} mm</p></fieldset>
      <div className="actions"><button disabled={readOnly} onClick={()=>unplace(selV.view)}>เอาออกจากแผ่น</button>
       {selSec&&selSec.source==='user'&&<button className="danger-text" disabled={secRO} onClick={()=>{const k=`sec:${selSec.id}`;commit({layout:{...layout,sheets:layout.sheets.map(s=>({...s,views:s.views.filter(v=>v.view!==k&&v.lock?.to!==k)})),unplaced:layout.unplaced.filter(x=>x!==k)},sections:draft.sections.filter(s=>s.id!==selSec.id)});setSel(undefined);}}>ลบรูปตัด</button>}</div>
     </>}
    </aside>
   </div>
   <footer className="composer-sheets" aria-label="แผ่นในชุด"><span>แผ่น</span>
    {layout.sheets.map((s,i)=><button key={s.id} className={`sheet-thumb${i===page?' active':''}`} onClick={()=>setSheet(i)} onDragOver={e=>e.preventDefault()} onDrop={e=>{const k=e.dataTransfer.getData('text/view') as ViewKey;if(k&&!readOnly){if(layout.sheets.some(x=>x.views.some(v=>v.view===k)))moveTo(k,i);else{setSheet(i);placeFree(k);}}}}>
     <svg viewBox={`0 0 ${info.w} ${info.h}`} aria-hidden>{s.views.map(v=><rect key={v.view} x={v.x} y={v.y} width={v.w} height={v.h}/>)}</svg><b>{i+1}</b><small>{s.views.length} รูป</small>
     {!s.views.length&&layout.sheets.length>1&&!readOnly&&<span role="button" tabIndex={0} className="del" onClick={e=>{e.stopPropagation();editLayout(l=>({...l,sheets:l.sheets.filter((_,j)=>j!==i)}));setSheet(Math.max(0,i-1));}}>ลบ</span>}</button>)}
    <button className="sheet-thumb add" disabled={readOnly||layout.sheets.length>=20} onClick={()=>{editLayout(l=>({...l,sheets:[...l.sheets,{id:`s${uid()}`,views:[]}]}));setSheet(layout.sheets.length);}}>+ แผ่นใหม่</button>
    <span className="muted">ลากรูปจากรายการมาวางที่แผ่นอื่นได้</span>
   </footer>
   {tplOpen==='save'&&<div className="composer-dialog"><h3>บันทึกเป็น Template</h3>
    <label className="field"><span>ชื่อ</span><input value={tplName} maxLength={80} onChange={e=>setTplName(e.target.value)}/></label>
    <p className="muted">ใช้กับ: {member.category} · {size} · รูปตัดที่เพิ่มเก็บเป็นสัดส่วนตามขนาดสมาชิก</p>
    {ftype&&<label className="check"><input type="checkbox" checked={tplMatch} onChange={e=>setTplMatch(e.target.checked)}/>เฉพาะ foundation type “{ftype}”</label>}
    <label className="check"><input type="checkbox" checked={tplEdits} onChange={e=>setTplEdits(e.target.checked)}/>รวมการแก้ไขแบบ (ป้าย / Dimension / ข้อความที่แก้หรือเพิ่ม)</label>
    <label className="check"><input type="checkbox" checked={tplDefault} onChange={e=>setTplDefault(e.target.checked)}/>ตั้งเป็นค่าเริ่มต้นของโครงการ (สมาชิกที่ไม่ได้จัดหน้าเองใช้ Template นี้)</label>
    <div className="actions"><button onClick={()=>setTplOpen(undefined)}>ยกเลิก</button><button className="primary" disabled={!tplName.trim()} onClick={()=>void saveTemplate()}>บันทึก Template</button></div></div>}
   {tplOpen==='apply'&&<div className="composer-dialog"><h3>ใช้ Template</h3>
    {templates.map(t=><button key={t.id} className="tpl-row" onClick={()=>applyTemplate(t.id)}><b>{t.name}</b><small>{t.sheets.length} แผ่น · {t.sheets.reduce((n,s)=>n+s.views.length,0)} รูป · รูปตัดเพิ่ม {t.sections.length}{project.sheetTemplates?.defaults.some(d=>d.id===t.id)?' · ค่าเริ่มต้น':''}</small></button>)}
    <div className="actions"><button onClick={()=>setTplOpen(undefined)}>ปิด</button></div></div>}
  </div>
 </div>;
}
export const boxesTouch=boxesOverlap;
