import type {Bar,Member,Project,Vec3} from './model';
import {barPaths} from './engine';
import {shapePileQuantities} from './shapeGeometry';
import {shapeStageVolumes} from './shapeApply';
import {pourStageQuantities} from './solids';
import type {ElementInput} from './elementInput';
import {barCouplerEnds,footingColumns,pileQuantities} from './elementInput';
import {beamGroupSheet,beamSheetPages} from './beamGroupSheet';
import {buildView,columnSectionCut,defaultCuts,markColors,planLayerOf,renderView,type ViewData,type ViewRow,type ViewSpec} from './elementViews';
import {mapPrimText,textWidth,wrapText,type PlainPrim,type Prim} from './drawingPrims';
import {composeDrawingNumber,sheetSetupOf,sheetSizes,standardScales,type ViewScale} from './drawingStandard';
import {sheetLangOf,sheetPhrase,sheetText} from './sheetText';
import {concreteNote,memberConcrete} from './concreteMixes';
import type {SheetScope} from './tagSheets';
import {DEFAULT_SECTION_IDS,resolveSheetLayout,sectionSpec,sheetSections} from './sheetLayout';
import type {PlacedView,SheetLayout,ViewKey} from './sheetLayoutSchema';
import type {SheetSection} from './drawingViews';

/** A3 landscape (mm). Standard frame: 20 mm binding margin on the left, 10 mm elsewhere.
 * Left: plan, section X–X, section Y–Y and notes. Right strip: BBS table, BOQ table and title block. */
export const SHEET={w:420,h:297,left:20,margin:10,strip:135,title:72,bbsRow:9,bbsHead:6,boqRow:4.4};
/** Paper of a sheet (A3 / A2 landscape): same frame, text and tables; the views and the BBS table get the extra room. */
export const sheetFormat=(s:Pick<SheetData,'project'|'member'>)=>{const setup=sheetSetupOf(s.project,s.member);return {...SHEET,...sheetSizes[setup.size],...setup};};
/** Paper scale (sheet mm per model mm) for a view: fixed 1:N when it fits, else the largest standard 1:N that fits. */
function pickScale(fit:number,want:ViewScale){
 if(want!=='auto'&&1/want<=fit*1.0001)return {s:1/want,n:want,fits:true};
 const n=standardScales.find(n=>1/n<=fit);return n?{s:1/n,n,fits:want==='auto'}:{s:fit,n:0,fits:want==='auto'};
}
export type SheetRow=ViewRow&{grade:string;shapeCode:string;cutLength:number;weight:number};
export type SheetData={member:Member;rows:SheetRow[];input?:ElementInput;project:Project;quantity:number;
 takeoff:{concrete:number;formwork:number;excavation:number;backfill:number;lean:number;rebar:number;sand?:number;sheet?:number;compaction?:number};
 status:string;revision:string;date:string;provisional:boolean;
 /** Company logo (data URL + pixel size) shown in the title block. */
 logo?:{src:string;width:number;height:number};
 /** one sheet set of a custom element split per Tag (`tagSheets.ts`): a tag's bars, or the summary of the tags */
 scope?:SheetScope};
type BoqLine={item:string;unit:string;each:number;total:number;bold?:boolean;count?:boolean};
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const fmt=(v:number,d=2)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});

export function sheetBoq(s:SheetData):BoqLine[]{
 const q=s.takeoff,n=s.quantity,m=s.member,B=sheetText[sheetLangOf(s.project)].boq,mix=memberConcrete(m),out:BoqLine[]=[{item:mix?`${B.concrete} ${mix}`:B.concrete,unit:'m³',each:q.concrete,total:q.concrete*n}];
 if(s.scope?.kind==='tag'&&s.scope.rebarOnly){out.length=0;steelLines(s,out,B);return out;}
 // shape model with several pour stages: concrete per stage (manual deductions stay in the total above)
 const stages=m.shapeModel?shapeStageVolumes(m.shapeModel):[];if(stages.length>1)for(const st of stages)out.push({item:B.stage(st.stage),unit:'m³',each:st.volume,total:st.volume*n});
 // footing (box) pour stages: concrete and formwork per stage, construction joints between stages
 const pour=pourStageQuantities(m);if(pour.length>1)for(const st of pour)out.push({item:B.stage(st.stage),unit:'m³',each:st.concrete,total:st.concrete*n});
 out.push({item:B.formwork,unit:'m²',each:q.formwork,total:q.formwork*n});
 if(pour.length>1){for(const st of pour)out.push({item:B.stageForm(st.stage),unit:'m²',each:st.formwork,total:st.formwork*n});
  const joint=pour.reduce((t,st)=>t+st.joint,0);if(joint>0)out.push({item:B.joint,unit:'m²',each:joint,total:joint*n});}
 if(m.category==='Foundation'||m.shapeModel?.site)out.push({item:B.excavation,unit:'m³',each:q.excavation,total:q.excavation*n},{item:B.backfill,unit:'m³',each:q.backfill,total:q.backfill*n},{item:B.lean,unit:'m³',each:q.lean,total:q.lean*n});
 else if(q.lean>0)out.push({item:B.lean,unit:'m³',each:q.lean,total:q.lean*n});
 // sub-base layers and manual items (any category)
 for(const [k,unit] of [['sand','m³'],['sheet','m²'],['compaction','m²']] as const){const v=q[k]??0;if(v>0)out.push({item:B[k],unit,each:v,total:v*n});}
 for(const it of m.siteWork?.items||[])if(it.quantity>0)out.push({item:it.label,unit:it.unit,each:it.quantity,total:it.quantity*n});
 const piles=(p:{count:number;size:number;lengthEach:number;totalLength:number;cutCount:number;cutLengthEach:number})=>{if(!p.count)return;out.push({item:B.pile(p.size,p.lengthEach),unit:B.piece,each:p.count,total:p.count*n,count:true},{item:B.pileLength,unit:'m',each:p.totalLength,total:p.totalLength*n});if(p.cutCount)out.push({item:B.pileCut(Math.round(p.cutLengthEach*1000)),unit:B.piece,each:p.cutCount,total:p.cutCount*n,count:true});};
 if(s.input?.category==='Foundation'&&s.input.foundationType==='pile')piles(pileQuantities(s.input));
 if(m.shapeModel?.piles)piles(shapePileQuantities(m.shapeModel));
 steelLines(s,out,B);
 return out;
}
function steelLines(s:SheetData,out:BoqLine[],B:typeof sheetText['th']['boq']){
 const n=s.quantity,bySize=new Map<string,{d:number;grade:string;w:number}>();
 for(const r of s.rows){const k=`${r.diameter}|${r.grade}`,v=bySize.get(k)||{d:r.diameter,grade:r.grade,w:0};v.w+=r.weight;bySize.set(k,v);}
 for(const v of [...bySize.values()].sort((a,b)=>a.d-b.d))out.push({item:B.steel(barName(v.d),v.grade),unit:'kg',each:v.w,total:v.w*n});
 out.push({item:B.steelTotal,unit:'kg',each:s.takeoff.rebar,total:s.takeoff.rebar*n,bold:true});
}
/** Rows of the sheet's table: bars, or the tags of a summary set. */
const tableCount=(s:SheetData)=>s.scope?.kind==='summary'?s.scope.tags.length:s.rows.length;
type SheetView={key:ViewKey;title:string;spec:ViewSpec;cuts?:{x:number;y:number};plan:boolean;sec?:SheetSection};
const lying=(r:SheetRow)=>r.paths.some(p=>p.some((q,i)=>i>0&&Math.hypot(q[0]-p[i-1][0],q[1]-p[i-1][1])>=1));
/** Title of a section view: the default X–X / Y–Y / Z–Z titles as before, added cuts by their label. */
function sectionTitle(T:typeof sheetText['th'],lang:string,sec:SheetSection,colKind:'pedestal'|'starter'){
 const pos=Math.round(sec.position);
 if(sec.id===DEFAULT_SECTION_IDS.x)return T.sectionX(pos);if(sec.id===DEFAULT_SECTION_IDS.y)return T.sectionY(pos);if(sec.id===DEFAULT_SECTION_IDS.z)return T.columnSection(colKind,pos);
 const label=sec.label.replace('-','–');return `${lang==='zh'?'剖面':lang==='en'?'Section':'รูปตัด'} ${label} (${sec.axis} = ${pos})${sec.look==='-'?' ↶':''}`;
}
/** Sections of a sheet + the plan cut positions drawn as X / Y lines (default sections, else the old default cuts). */
function sheetCuts(s:SheetData){
 const S=sheetFormat(s),secs=sheetSections(s,S.size).sections,d=defaultCuts(s.member,s.rows),pos=(id:string)=>secs.find(x=>x.id===id)?.position;
 return {secs,cuts:{x:pos(DEFAULT_SECTION_IDS.y)??d.x,y:pos(DEFAULT_SECTION_IDS.x)??d.y}};
}
/** Every view a sheet can show: plan (or bottom / top plans) and the sections (plan section Z–Z of pedestal / starter bars). */
/** Views of the sheet. `extras` = also the views only a composed layout places: ISO 3D (`iso`) and Detail views (`det:<id>`,
 * member.drawingEdits.details). Automatic sheets leave them out, so their drawing is unchanged. */
export function sheetViews(s:SheetData,extras=true):SheetView[]{
 const S=sheetFormat(s),m=s.member,input=s.input,lang=sheetLangOf(s.project),T=sheetText[lang],{secs,cuts}=sheetCuts(s),colCut=columnSectionCut(input,s.rows),rep=S.bars==='representative';
 const split=S.split&&s.rows.some(r=>lying(r)&&planLayerOf(m,input,r)==='bottom')&&s.rows.some(r=>lying(r)&&planLayerOf(m,input,r)==='top');
 const plan=(key:ViewKey,title:string,layer?:'bottom'|'top'):SheetView=>({key,title,spec:{axes:[0,1],rep,layer,tight:true},cuts,plan:true});
 const base=[...(split?[plan('plan-bottom',T.planBottom,'bottom'),plan('plan-top',T.planTop,'top')]:[plan('plan',T.plan)]),
  ...secs.map(sec=>({key:`sec:${sec.id}`,title:sectionTitle(T,lang,sec,colCut?.kind||'pedestal'),spec:{...sectionSpec(sec),...(sec.columns?{}:{tight:true})},plan:false,sec}) as SheetView)];
 if(!extras)return base;
 const det=(m.drawingEdits?.details||[]).flatMap(d=>{const p=base.find(v=>v.key===d.parent);if(!p)return [];const {tight:_t,...spec}=p.spec;
  return [{key:`det:${d.id}` as ViewKey,title:`DETAIL ${d.label}`,spec:{...spec,window:{u:d.u,v:d.v,r:d.r,circle:d.circle!==false}},plan:false} as SheetView];});
 return [...base,...det,{key:'iso' as ViewKey,title:'3D ISO',spec:{axes:[0,1],iso:true},plan:false}];
}
type Box={x:number;y:number;w:number;h:number};
/** Boxes of the views of a drawing sheet: the arrangement (side by side, stacked, large + two, top + two, rows, 2 × 2)
 * whose views get the largest scales (geometric mean of each view's fit, `spans` = model width / height of each view;
 * views are assigned to the boxes in order, the first one gets the large box). */
function placeViews(spans:[number,number][],a:Box,margin:number,g=3):Box[]{
 const n=spans.length,half=(a.w-g)/2,hh=(a.h-g)/2,cols=(k:number)=>Array.from({length:k},(_,i)=>({x:a.x+i*((a.w-(k-1)*g)/k+g),y:a.y,w:(a.w-(k-1)*g)/k,h:a.h})),rows=(k:number)=>Array.from({length:k},(_,i)=>({x:a.x,y:a.y+i*((a.h-(k-1)*g)/k+g),w:a.w,h:(a.h-(k-1)*g)/k}));
 if(n<=1)return [a];
 const cands:Box[][]=n===2?[cols(2),rows(2)]:n===3?[
  (()=>{const lw=(a.w-g)*.56,rw=a.w-g-lw;return [{...a,w:lw},{x:a.x+lw+g,y:a.y,w:rw,h:hh},{x:a.x+lw+g,y:a.y+hh+g,w:rw,h:hh}];})(),
  (()=>{const th=(a.h-g)*.5;return [{...a,h:th},{x:a.x,y:a.y+th+g,w:half,h:a.h-th-g},{x:a.x+half+g,y:a.y+th+g,w:half,h:a.h-th-g}];})(),
  cols(3),rows(3)]:[[0,1,2,3].map(i=>({x:a.x+(i%2)*(half+g),y:a.y+Math.floor(i/2)*(hh+g),w:half,h:hh})),rows(4)];
 // fit of a view in a box: room for the margins and about a fifth of the width for Mark labels / level marks
 const score=(bs:Box[])=>spans.reduce((t,[w,h],i)=>t+Math.log(Math.max(1e-9,Math.min((bs[i].w*.8-2*margin)/Math.max(w,1),(bs[i].h-2*margin)/Math.max(h,1)))),0);
 return cands.reduce((b,c)=>score(c)>score(b)?c:b);
}
function layout(s:SheetData){
 const S=sheetFormat(s),sx=S.w-S.margin-S.strip,titleTop=S.h-S.margin-S.title,boq=sheetBoq(s),boqH=7+5+boq.length*S.boqRow+(s.provisional?5:0),boqTop=titleTop-3-boqH,tableTop=S.margin+8;
 const perPage=Math.max(1,Math.floor((boqTop-4-tableTop-S.bbsHead)/S.bbsRow)),base={sx,titleTop,boq,boqTop,tableTop,perPage};
 // split layout (not for beam groups / column stacks, which page their own views): BBS table over the left area of the
 // first sheet(s) (bigger rows), notes + BOQ + title block on the right; then sheets of large views with a title strip
 const own=s.input?.category==='Beam'&&s.input.layout==='group'||s.input?.category==='Column'&&s.input.layout==='stack';
 // Sheet Composer layout (member's own or the project default template): one sheet per layout sheet
 const custom:SheetLayout|undefined=own?undefined:resolveSheetLayout(s,S.size).layout;
 if(S.layout!=='split'||own)return {...base,split:false,tablePages:0,groups:[] as number[][],tRow:0,tHead:0,tTop:0,tPer:0,custom,pages:Math.max(1,Math.ceil(tableCount(s)/perPage),beamSheetPages(s.input),custom?.sheets.length||0)};
 const tRow=S.bbsRow*1.35,tHead=S.bbsHead*1.2,tTop=S.margin+22,tPer=Math.max(1,Math.floor((S.h-S.margin-9-tTop-tHead)/tRow)),tablePages=Math.max(1,Math.ceil(tableCount(s)/tPer));
 const views=sheetViews(s,false),idx=views.map((_,i)=>i),n=Math.min(4,S.perPage);
 const groups=n?Array.from({length:Math.ceil(idx.length/n)},(_,k)=>idx.slice(k*n,(k+1)*n)):[idx.filter(i=>views[i].plan),idx.filter(i=>!views[i].plan)].filter(g=>g.length);
 return {...base,split:true,tablePages,groups:custom?[]:groups,tRow,tHead,tTop,tPer,custom,pages:tablePages+(custom?custom.sheets.length:groups.length)};
}
export function sheetPageCount(s:SheetData){return layout(s).pages;}
/** Page of a layout sheet (split layout: after the table pages) and the drawing area / keep-out boxes of a view sheet. */
export function layoutPage(s:SheetData,sheet:number){const L=layout(s);return (L.split?L.tablePages:0)+sheet;}
export function sheetArea(s:SheetData){
 const S=sheetFormat(s),L=layout(s),sx=S.w-S.margin-S.strip,area={x:S.left,y:S.margin,w:S.w-S.left-S.margin,h:S.h-2*S.margin},head={x:S.left,y:S.margin,w:area.w,h:15};
 return {area,keep:L.split?[head,{x:S.left,y:S.h-S.margin-12,w:area.w,h:12}]:[head,{x:sx,y:S.margin,w:S.w-S.margin-sx,h:S.h-2*S.margin}],split:L.split,notes:!L.split};
}

export type SheetViewScale={title:string;n:number;fits:boolean};
/** A view on a sheet: its box (sheet mm), scale 1:n (0 = not to scale, `s` = sheet mm per model mm) and the linear map
 * sheet ↔ view model coordinates (mm along the view axes `axes`): u = model[0] + (x − sheet[0]) / s, v = model[1] − (y − sheet[1]) / s.
 * Primitives drawn in the view carry `view` = id; the rest of the sheet (tables, title block, notes) is paper. */
export type SheetViewInfo={id:string;key?:ViewKey;lockNote?:string;title:string;box:{x:number;y:number;w:number;h:number};n:number;s:number;fits:boolean;axes:[number,number];normal?:number;cut?:number;
 origin:{sheet:[number,number];model:[number,number]};
 /** the drawn view data (Drawing Edit snaps / anchors) */ data?:ViewData};
/** All primitives of one sheet (mm). */
export function drawSheet(s:SheetData,page=0):Prim[]{return drawSheetInfo(s,page).prims;}
/** Sheet primitives plus the scale used for each view (n = 0: not to scale; fits = false: the chosen 1:N did not fit). */
export function drawSheetInfo(s:SheetData,page=0):{prims:Prim[];scales:SheetViewScale[];views:SheetViewInfo[];notes?:{x:number;y:number;w:number;h:number};revs?:{x:number;y:number;w:number;h:number};size:keyof typeof sheetSizes;w:number;h:number}{
 const S=sheetFormat(s),L=layout(s),{sx}=L,out:Prim[]=[],ink='#22393f',grid='#9fb2ad',k=.26,lang=sheetLangOf(s.project),T=sheetText[lang];
 // 'one' = views + tables; split layout: 'tables' sheets (BBS on the left) then 'views' sheets (views + title strip)
 const kind=!L.split?'one':page<L.tablePages?'tables':'views',right=S.w-S.margin;
 const line=(x1:number,y1:number,x2:number,y2:number,width=.2,stroke=grid)=>out.push({t:'line',x1,y1,x2,y2,stroke,width,layer:'titleBlock'});
 // generated Thai phrases (bar descriptions, notes typed in Thai) are translated for EN / ZH sheets
 const textPrim=(t:string,x:number,y:number,size=2.6,o:{anchor?:'start'|'middle'|'end';bold?:boolean;color?:string;raw?:boolean}={}):PlainPrim=>({t:'text',x,y,text:o.raw?t:sheetPhrase(t,lang),size,color:o.color||ink,anchor:o.anchor,bold:o.bold,layer:'text'});
 const text=(t:string,x:number,y:number,size=2.6,o:{anchor?:'start'|'middle'|'end';bold?:boolean;color?:string;raw?:boolean}={})=>out.push(textPrim(t,x,y,size,o));
 // table / title block cell: one MTEXT (DXF) whose drawing = the wrapped lines as before
 const cell=(t:string,x:number,y:number,w:number,h:number,size=2.3,align:'start'|'end'|'middle'='start',color=ink,raw=false)=>{const lines=wrapText(raw?t:sheetPhrase(t,lang),size,w-2,Math.max(1,Math.floor((h-.6)/(size*1.15))));const top=y+h/2-(lines.length-1)*size*.575+size*.35,tx=align==='end'?x+w-1:align==='middle'?x+w/2:x+1;
  if(lines.length)out.push({t:'mtext',x:tx,y:top,w:w-2,lines,size,step:size*1.15,anchor:align,color,layer:'text',draw:lines.map((l,i)=>textPrim(l,tx,top+i*size*1.15,size,{anchor:align,color,raw:true}))});};
 // Frame.
 out.push({t:'rect',x:S.left,y:S.margin,w:S.w-S.left-S.margin,h:S.h-2*S.margin,stroke:ink,width:.7,layer:'titleBlock'});
 if(kind!=='views')line(sx,S.margin,sx,S.h-S.margin,.45,ink);
 // Left: heading, views and notes.
 const m=s.member,input=s.input,colors=markColors(s.rows),{secs,cuts}=sheetCuts(s),secOf=(id:string)=>secs.find(x=>x.id===id);
 text(`${m.code} · ${s.scope?.kind==='tag'?`${s.scope.label} · `:s.scope?.kind==='summary'?'SUMMARY · ':''}${T.category[m.category]} · ${lang==='zh'?'配筋详图':'REINFORCEMENT DETAIL'}`,S.left+4,S.margin+6,4.2,{bold:true});
 text(`${s.project.code} · ${s.project.name}`,S.left+4,S.margin+10.5,2.6,{color:'#4b6166',raw:true});
 line(S.left,S.margin+13,kind==='views'?right:sx,S.margin+13,.3,ink);
 // A3: 128 mm for plan / section X–X; larger paper keeps the same split of the height
 const left=S.left+2,colW=(sx-S.left-6)/2,topY=S.margin+15,topH=Math.round((S.h-S.margin-topY)*128/262),botY=topY+topH+3,botH=S.h-S.margin-botY-2;
 // beam group: elevation + cross-sections (paged) instead of plan / sections X–Y
 const bg=beamGroupSheet(m,s.rows,input,{x:left,y:topY,w:sx-left-2,h:S.h-S.margin-topY-2},page,k);
 const det=input?.detailing,names=T.coverNames;
 const notes=[
  bg?T.nts:T.scaled(S.size),
  `${T.cover}: ${input?Object.entries(input.cover).map(([k2,v])=>`${names[k2]||k2} ${v}`).join(' · '):m.cover}${input?.category==='Foundation'&&input.column.type!=='none'?` · ${input.column.type==='pedestal'?T.pedestal:'Starter'} ${footingColumns(input).map(c=>c.columnNo).filter(Boolean).join(', ')} ${input.column.cover}`:''}`,
  input?.category==='Column'&&input.layout!=='stack'&&input.rebar.top.mode==='coupler'?T.coupler((m.siteWork?.items||[]).filter(it=>it.id.startsWith('gen-coupler-')).map(it=>`${it.label.replace(/^.*\) /,'')} × ${it.quantity}`).join(', '),0):'',
  input?.category==='Foundation'&&input.column.type!=='none'&&footingColumns(input).some(c=>c.splice?.type==='coupler')?T.coupler((m.siteWork?.items||[]).filter(it=>it.id.startsWith('gen-coupler-')).map(it=>`${it.label.replace(/^.*\) /,'')} × ${it.quantity}`).join(', '),Math.max(0,...footingColumns(input).filter(c=>c.splice?.type==='coupler').map(c=>c.splice.stagger))):'',
  det?T.bendRadius(det.bendSmall,det.bendLarge,det.tieBend):T.bendPerMark,
  det?T.hooks(det.hook90,det.hook135,det.hook135Min,det.lapTable?T.lapSpec(det.lapTable.map(r=>`Ø${r.bar}=${r.length}`).join(', ')):`${det.lap}d`):'',
  det?.concrete?T.concrete(concreteNote(det.concrete,s.project.spec.concrete)):'',
  T.rounding(s.project.spec.rounding,s.project.spec.bsEdition||'',det?`${det.mainGrade} / ${T.tie} ${det.tieGrade}`:T.perTable),
  input?.category==='Foundation'&&input.foundationType==='pile'?(()=>{const p=pileQuantities(input);return T.pile(p.count,p.size,p.lengthEach,Math.round(p.cutLengthEach*1000),input.pile.embed,false);})():'',
  pourStageQuantities(m).length>1?T.stages(pourStageQuantities(m).length,pourStageQuantities(m).map(x=>`Stage ${x.stage} = ${Math.round(x.z0)}–${Math.round(x.z1)} mm ${x.concrete.toFixed(2)} m³`).join(' · ')):'',
  // shape-model (custom) members: pour stages, piles and the rule used for sketched bars
  ...(m.shapeModel?[(()=>{const st=shapeStageVolumes(m.shapeModel);return st.length>1?T.stages(st.length,st.map(x=>`Stage ${x.stage} = ${x.volume.toFixed(2)} m³`).join(' · ')):'';})(),
   m.shapeModel.piles?.positions.length?(()=>{const p=shapePileQuantities(m.shapeModel);return T.pile(p.count,p.size,p.lengthEach,Math.round(p.cutLengthEach*1000),m.shapeModel.piles!.embed,true);})():'',
   m.bars.some(b=>b.id.startsWith('sk-'))?T.sketched:'']:[]),
  T.quantity(s.quantity,[...new Set(m.occurrences.map(o=>[o.zone,o.floor,o.grid].filter(Boolean).join('/')))].filter(Boolean).join(', ')||T.noLocation),
  T.dashes,
 ].filter(Boolean);
 // footing pedestal / starter plan section: under the notes when they leave room, else beside section Y–Y
 const colCut0=bg?undefined:columnSectionCut(input,s.rows),secZ=secOf(DEFAULT_SECTION_IDS.z),colCut=colCut0&&secZ?{...colCut0,z:secZ.position}:undefined,noteH=9+notes.reduce((h,n)=>h+wrapText(`• ${n}`,2.3,colW-4,3).length*2.9+.6,0)+5.6+Math.ceil(s.rows.length/2)*3.4+2;
 const under=!!colCut&&botH-noteH-2>=48,secW=colCut&&!under?colW*.58:colW;
 // split plans (bottom / top bars) when the member has bars lying in both layers: three columns,
 // top row plan bottom | plan top | section X–X, bottom row section Y–Y (| column section) | notes
 const split=!bg&&S.split&&s.rows.some(r=>lying(r)&&planLayerOf(m,input,r)==='bottom')&&s.rows.some(r=>lying(r)&&planLayerOf(m,input,r)==='top');
 const c3=(sx-S.left-8)/3,col3=(i:number)=>left+i*(c3+2);
 const colBox=!colCut?undefined:split?{x:col3(1),y:botY,w:c3,h:botH}:under?{x:left+colW+2,y:botY+noteH+2,w:colW,h:botH-noteH-2}:{x:left+secW+2,y:botY,w:colW-secW-2,h:botH};
 const rep=S.bars==='representative',planSpec=(layer?:'bottom'|'top')=>({axes:[0,1] as [number,number],rep,layer});
 const sheetBox={x:left,y:topY,w:right-2-left,h:S.h-S.margin-14-topY},all=kind==='views'||L.custom?sheetViews(s,!!L.custom):[],group=kind==='views'&&!L.custom?L.groups[page-L.tablePages]:[];
 const built=group.map(i=>buildView(m,s.rows,input,all[i].spec));
 const secX=secOf(DEFAULT_SECTION_IDS.x),secY=secOf(DEFAULT_SECTION_IDS.y);
 type Item={key?:ViewKey;title:string;box:Box;spec:ViewSpec;cuts?:{x:number;y:number};pv?:PlacedView};
 // Sheet Composer layout: the boxes as placed (sheet `page` of the layout); notes only where placed
 const lsheet=L.custom&&kind!=='tables'?L.custom.sheets[page-(L.split?L.tablePages:0)]:undefined;
 const byKey=new Map(all.map(v=>[v.key,v]));
 const views:Item[]=L.custom?kind==='tables'?[]:(lsheet?.views||[]).flatMap(pv=>{const v=byKey.get(pv.view);if(!v)return [];const allBars=pv.show?.allBars;
   // 'one' page layout draws its views without the tight crop (as the automatic sheet), split view sheets with it
   const {tight:_t,...loose}=v.spec,spec=L.split?v.spec:loose;
   return [{key:v.key,title:v.title,box:{x:pv.x,y:pv.y,w:pv.w,h:pv.h},spec:allBars!==undefined&&v.plan?{...spec,rep:!allBars}:spec,cuts:v.cuts,pv}];}):
  kind==='tables'?[]:kind==='views'?placeViews(built.map(v=>[v.u[1]-v.u[0],v.v[1]-v.v[0]]),sheetBox,48*k).map((box,j)=>({...all[group[j]],box})):bg?bg.views:[...(split?[{key:'plan-bottom' as ViewKey,title:T.planBottom,box:{x:col3(0),y:topY,w:c3,h:topH},spec:planSpec('bottom'),cuts},{key:'plan-top' as ViewKey,title:T.planTop,box:{x:col3(1),y:topY,w:c3,h:topH},spec:planSpec('top'),cuts}]:[{key:'plan' as ViewKey,title:T.plan,box:{x:left,y:topY,w:colW,h:topH},spec:planSpec(),cuts}]),
  ...(secX?[{key:`sec:${secX.id}` as ViewKey,title:T.sectionX(Math.round(secX.position)),box:split?{x:col3(2),y:topY,w:c3,h:topH}:{x:left+colW+2,y:topY,w:colW,h:topH},spec:{...sectionSpec(secX)}}]:[]),
  ...(secY?[{key:`sec:${secY.id}` as ViewKey,title:T.sectionY(Math.round(secY.position)),box:split?{x:left,y:botY,w:colCut?c3:2*c3+2,h:botH}:{x:left,y:botY,w:secW,h:botH},spec:{...sectionSpec(secY)}}]:[]),
  ...(colCut&&colBox&&secZ?[{key:`sec:${secZ.id}` as ViewKey,title:T.columnSection(colCut.kind,Math.round(colCut.z)),box:colBox,spec:{...sectionSpec(secZ)}}]:[])];
 const notesBox=L.custom&&kind==='one'?(lsheet?.views||[]).find(v=>v.view==='notes'):undefined;
 // sheet number of each section view (cut-line bubbles in plans): Composer layout, else auto pages
 const pageOfSec=new Map<string,number>(),pageOfDet=new Map<string,number>(),allViews=L.split&&!L.custom?sheetViews(s,false):[];
 if(L.custom)L.custom.sheets.forEach((sh,i)=>sh.views.forEach(v=>{if(v.view.startsWith('sec:'))pageOfSec.set(v.view.slice(4),(L.split?L.tablePages:0)+i+1);if(v.view.startsWith('det:'))pageOfDet.set(v.view.slice(4),(L.split?L.tablePages:0)+i+1);}));
 else if(L.split)L.groups.forEach((g,i)=>g.forEach(j=>{const v=allViews[j];if(v?.sec)pageOfSec.set(v.sec.id,L.tablePages+i+1);}));
 const userCuts=secs.filter(x=>!Object.values(DEFAULT_SECTION_IDS).includes(x.id as never)&&x.axis!=='Z');
 // render order: projection-locked views after the view they are locked to
 const order=views.map((_,i)=>i),depth=(i:number,n=0):number=>{const to=views[i].pv?.lock?.to,j=to?views.findIndex(x=>x.key===to):-1;return j<0||n>4?n:depth(j,n+1);};
 order.sort((a,b)=>depth(a)-depth(b)||a-b);
 const frames=new Map<string,{x0:number;y0:number;u0:number;v0:number;s:number;axes:[number,number];flip:boolean;box:Box}>();
 // beam-group marks are placed for the fitted views: those views stay not to scale
 const scales:SheetViewScale[]=[],viewInfo:SheetViewInfo[]=[];
 const results:{j:number;scale:SheetViewScale;info:SheetViewInfo}[]=[];
 for(const j of order){const v=views[j];
  let used={n:0,fits:true},frame={s:1,x0:0,y0:0,u0:0,v0:0},box=v.box,lockNote:string|undefined;const id=`V${j+1}`,pv=v.pv;
  const want=pv?(pv.n==='auto'?S.scale:pv.n):S.scale;
  const scale=bg?undefined:(fit:number)=>{const r=pickScale(fit,want);used=r;return r.s;};
  const data=buildView(m,s.rows,input,v.spec),isPlan=v.spec.normal===undefined;
  const opts={k,colors,cuts:v.cuts,zCut:colCut?.z,scale,gutter:!bg&&S.gutter,frame:(f:typeof frame)=>{frame=f;},
   hide:pv?.show?{dims:pv.show.dims===false,marks:pv.show.marks===false,levels:pv.show.levels===false}:undefined,
   // Drawing Edit layer of this view (overrides of automatic annotations + user text / leaders)
   edits:v.key?m.drawingEdits?.views[v.key]:undefined,
   sectionLines:isPlan&&userCuts.length?userCuts.map(c=>({axis:c.axis==='X'?0:1,at:c.position,label:c.label,ref:pageOfSec.has(c.id)?String(pageOfSec.get(c.id)):undefined,look:c.look,extent:c.extent,...(c.steps?.length?{steps:c.steps.map(x=>({from:x.from,at:x.position}))}:{})})):undefined,
   // Detail marks of the placed Detail views on their parent view
   detailMarks:v.key?(m.drawingEdits?.details||[]).filter(d=>d.parent===v.key&&pageOfDet.has(d.id)).map(d=>({u:d.u,v:d.v,r:d.r,circle:d.circle!==false,label:d.label,ref:String(pageOfDet.get(d.id))})):undefined};
  const inner=(b:Box)=>({x:b.x,y:b.y+4,w:b.w,h:b.h-4});
  // projection lock: same scale and shared model axis → that axis at the same sheet x / y as the target view, else centre lines
  if(pv?.lock){const t=frames.get(pv.lock.to);
   if(!t)lockNote='ไม่พบรูปที่ล็อกแนวฉาย';
   else{renderView(data,inner(box),opts);const ax=pv.lock.axis==='x'?0:1,own={...frame,axes:data.axes as [number,number],flip:!!data.flip};
    const shared=t.axes[ax]===own.axes[ax]&&Math.abs(t.s-own.s)<1e-9&&(ax===1||!t.flip&&!own.flip);
    const d=shared?(ax===0?(t.x0-t.u0*t.s)-(own.x0-own.u0*own.s):(t.y0+t.v0*t.s)-(own.y0+own.v0*own.s)):(ax===0?(t.box.x+t.box.w/2)-(box.x+box.w/2):(t.box.y+t.box.h/2)-(box.y+box.h/2));
    if(!shared)lockNote=Math.abs(t.s-own.s)>=1e-9?'มาตราส่วนต่างจากรูปที่ล็อก: ล็อกเส้นกึ่งกลางแทน':'ไม่มีแกนร่วมกับรูปที่ล็อก: ล็อกเส้นกึ่งกลางแทน';
    box=ax===0?{...box,x:box.x+d}:{...box,y:box.y+d};}}
  out.push({t:'rect',x:box.x,y:box.y,w:box.w,h:box.h,stroke:'#c8d5d0',width:.2,layer:'titleBlock'});
  // one view of a large member has more prims than a spread call takes as arguments
  for(const p of renderView(data,inner(box),opts)){const q=mapPrimText(p,t=>sheetPhrase(t,lang));q.view=id;out.push(q);}
  text(`${v.title} · ${used.n?`1:${used.n}`:'NTS'}`,box.x+2,box.y+4,2.8,{bold:true});
  if(v.key)frames.set(v.key,{...frame,axes:data.axes as [number,number],flip:!!data.flip,box});
  results.push({j,scale:{title:v.title,...used},info:{id,key:v.key,...(lockNote?{lockNote}:{}),title:v.title,box,n:used.n,s:frame.s,fits:used.fits,axes:v.spec.axes,normal:v.spec.normal,cut:v.spec.cut,origin:{sheet:[frame.x0,frame.y0],model:[frame.u0,frame.v0]},data}});
 }
 for(const r of results.sort((a,b)=>a.j-b.j)){scales.push(r.scale);viewInfo.push(r.info);}
 if(bg)out.push(...bg.marks);
 // Notes and Mark legend (Composer layout: only where the notes box is placed).
 // Revision table (Drawing Edit P4): box `revs` of a composed layout, newest revision first
 const revsBox=L.custom&&kind!=='tables'?(lsheet?.views||[]).find(v=>v.view==='revs'):undefined;let revsNb:Box|undefined;
 if(revsBox){const rb={x:revsBox.x,y:revsBox.y,w:revsBox.w,h:revsBox.h},revs=[...(m.drawingEdits?.revisions||[])].reverse(),cw=[.12,.2,.48,.2].map(f=>f*rb.w),rh=5;revsNb=rb;
  out.push({t:'rect',x:rb.x,y:rb.y,w:rb.w,h:rb.h,stroke:ink,width:.3,layer:'titleBlock'},{t:'rect',x:rb.x,y:rb.y,w:rb.w,h:rh,fill:'#203940',layer:'titleBlock'});
  let cx=rb.x;['REV','DATE',lang==='th'?'รายละเอียด':'DESCRIPTION','BY'].forEach((t,i)=>{cell(t,cx,rb.y,cw[i],rh,2.1,'start','#ffffff',true);cx+=cw[i];});
  revs.forEach((r,j)=>{const y=rb.y+rh*(j+1);if(y+rh>rb.y+rb.h+.01)return;cx=rb.x;[r.rev,r.date,r.desc,r.by].forEach((t,i)=>{cell(t,cx,y,cw[i],rh,2.1,'start',ink,true);cx+=cw[i];});line(rb.x,y+rh,rb.x+rb.w,y+rh,.2,ink);});
  cx=rb.x;for(const w of cw.slice(0,-1)){cx+=w;line(cx,rb.y,cx,rb.y+rh*(1+revs.length),.2,ink);}}
 let notesNb:Box|undefined;
 if(kind!=='views'&&(!L.custom||kind==='tables'||notesBox)){
 const nb=notesBox?{x:notesBox.x,y:notesBox.y,w:notesBox.w,h:notesBox.h}:kind==='tables'?{x:sx,y:S.margin,w:S.strip,h:L.boqTop-4-S.margin}:bg?bg.notes:split?{x:col3(2),y:botY,w:c3,h:botH}:{x:left+colW+2,y:botY,w:colW,h:under?noteH:botH};out.push({t:'rect',x:nb.x,y:nb.y,w:nb.w,h:nb.h,stroke:'#c8d5d0',width:.2});
 notesNb=nb;text(T.notes,nb.x+2,nb.y+4.5,3,{bold:true});
 let ny=nb.y+9;for(const n of notes){const ls=wrapText(`• ${n}`,2.3,nb.w-4,3),y0=ny,draw:PlainPrim[]=[];for(const l of ls){draw.push(textPrim(l,nb.x+2,ny,2.3));ny+=2.9;}if(ls.length)out.push({t:'mtext',x:nb.x+2,y:y0,w:nb.w-4,lines:draw.map(d=>d.t==='text'?d.text:''),size:2.3,step:2.9,color:ink,layer:'text',draw});ny+=.6;}
 ny+=2;text(T.legend,nb.x+2,ny,2.6,{bold:true});ny+=3.6;
 const per=2,cw=(nb.w-4)/per;s.rows.forEach((r,i)=>{const cx=nb.x+2+(i%per)*cw,cy=ny+Math.floor(i/per)*3.4;if(cy>nb.y+nb.h-2)return;out.push({t:'rect',x:cx,y:cy-2,w:2.4,h:2.4,fill:colors.get(r.id),stroke:colors.get(r.id),width:.1,layer:'mark'});text(T.perPiece(`${r.mark} ${barName(r.diameter)}`,r.count),cx+3.4,cy,2.2);});
 }
 if(kind!=='views'){
 // BBS table: right strip, or (tables sheet) the whole left area with bigger rows / text
 const big=kind==='tables',tx=big?S.left:sx,tw=big?sx-S.left:S.strip,f=tw/S.strip,fz=big?1.2:1,rowH=big?L.tRow:S.bbsRow,headH=big?L.tHead:S.bbsHead,top=big?L.tTop:L.tableTop,per=big?L.tPer:L.perPage,tr=tx+tw;
 const cols:{title:string;w:number;align?:'end'}[]=[{w:10},{w:31},{w:13},{w:24},{w:15,align:'end' as const},{w:10,align:'end' as const},{w:13,align:'end' as const},{w:19,align:'end' as const}].map((c,i)=>({...c,w:c.w*f,title:T.cols[i]}));
 const tPages=big?L.tablePages:L.pages,hy=big?top-3.5:S.margin+5.5;
 text(`${s.scope?.kind==='summary'?'SUMMARY BY TAG':lang==='zh'?'钢筋弯曲表 BAR BENDING SCHEDULE':'BAR BENDING SCHEDULE'}${tPages>1?` (${page+1}/${tPages})`:''}`,tx+3,hy,3.4*fz,{bold:true});text(`${s.rows.length} Marks`,tr-3,hy,2.4*fz,{anchor:'end',color:'#4b6166'});
 let y=top,x=tx;out.push({t:'rect',x:tx,y,w:tw,h:headH,fill:'#203940'});
 for(const c of cols){cell(c.title,x,y,c.w,headH,2.2*fz,c.align||'start','#ffffff');x+=c.w;}y+=headH;
 const summary=s.scope?.kind==='summary'?s.scope.tags:undefined,subset=summary?[]:s.rows.slice(page*per,(page+1)*per);
 if(summary){
  // summary set: one row per tag (sheet set, Marks, concrete, rebar) instead of the bars
  const sw=[22,52,14,22,25].map(v=>v*f),head=['TAG','',"MARKS",'m³','kg'],part=summary.slice(page*per,(page+1)*per);
  y=top+headH;out.push({t:'rect',x:tx,y:top,w:tw,h:headH,fill:'#203940'});x=tx;head.forEach((t,i)=>{cell(i===1?(lang==='th'?'ชิ้นส่วน / กลุ่ม':'PART / GROUP'):t,x,top,sw[i],headH,2.2*fz,i>1?'end':'start','#ffffff',true);x+=sw[i];});
  for(const t of part){x=tx;[t.tag,t.label,String(t.marks),t.concrete===null?'—':fmt(t.concrete*s.quantity,3),fmt(t.weight*s.quantity)].forEach((v,i)=>{cell(v,x,y,sw[i],rowH,2.3*fz,i>1?'end':'start',ink,i!==1);x+=sw[i];});line(tx,y+rowH,tr,y+rowH);y+=rowH;}
  x=tx;for(const w of sw.slice(0,-1)){x+=w;line(x,top,x,y);}
 }
 for(const r of subset){x=tx;const values=[r.mark,r.note||'',`${barName(r.diameter)} ${r.grade}`,'',fmt(r.cutLength,0),String(r.count),String(r.count*s.quantity),fmt(r.weight*s.quantity)];
  const bar=r as unknown as Bar,raw=bar.shape&&!['arc','helix'].includes(bar.shape)?barPaths(m,bar)[0]||[]:[];
  cols.forEach((c,i)=>{if(i===3){const n0=out.length;sketch(out,r.paths[0]||[],raw,r.diameter,x+5*fz,y+2.6*fz,c.w-10*fz,rowH-5*fz,colors.get(r.id)||ink,barCouplerEnds(input,r.id));for(const q of out.slice(n0))q.layer=q.t==='text'?'dim':'barMain';text(r.shapeCode?`#${r.shapeCode}`:'',x+1,y+rowH-.8,1.8*fz,{color:'#4b6166'});}else cell(values[i],x,y,c.w,rowH,(i===1?1.9:i===0&&r.mark.length>5?Math.max(1.5,Math.min(2.3,(c.w/fz-1.6)/(r.mark.length*.56))):2.3)*fz,c.align||'start');x+=c.w;});
  line(tx,y+rowH,tr,y+rowH);y+=rowH;}
 if(!summary&&!subset.length){cell(T.noBars,tx,y,tw,rowH);y+=rowH;}
 if(!summary){x=tx;for(const c of cols.slice(0,-1)){x+=c.w;line(x,top,x,y);}}
 if(big)out.push({t:'rect',x:tx,y:top,w:tw,h:y-top,stroke:ink,width:.3});
 if(!big||page===L.tablePages-1)text(T.totalWeight(fmt(s.takeoff.rebar*s.quantity),s.quantity),tr-2,y+4,2.5*fz,{anchor:'end',bold:true});
 // Right strip: BOQ table.
 {
 y=L.boqTop;line(sx,y-1.5,S.w-S.margin,y-1.5,.3,ink);text(`BOQ · ${m.code}`,sx+3,y+4.5,3.2,{bold:true});y+=7;
 const bw=[60,13,30,32];out.push({t:'rect',x:sx,y,w:S.strip,h:5,fill:'#203940'});x=sx;
 T.boqHead(s.quantity).forEach((t,i)=>{cell(t,x,y,bw[i],5,2.2,i>1?'end':'start','#ffffff');x+=bw[i];});y+=5;
 for(const l of L.boq){if(l.bold)out.push({t:'rect',x:sx,y,w:S.strip,h:S.boqRow,fill:'#e8f0eb'});x=sx;const dec=l.count?0:3;[l.item,l.unit,fmt(l.each,dec),fmt(l.total,dec)].forEach((t,i)=>{cell(t,x,y,bw[i],S.boqRow,2.25,i>1?'end':'start');x+=bw[i];});line(sx,y+S.boqRow,S.w-S.margin,y+S.boqRow);y+=S.boqRow;}
 if(s.provisional)cell(T.provisional,sx,y,S.strip,5,2.1,'start','#926327');
 // Title block.
 const tb=L.titleTop,p=s.project,prof=p.drawingProfile,W2=S.strip,rowsH=[12,10,10,10,10,10,10];out.push({t:'rect',x:sx,y:tb,w:W2,h:S.title,stroke:ink,width:.45});
 let ty=tb;const hl=(h:number)=>{ty+=h;if(ty<tb+S.title-.1)line(sx,ty,S.w-S.margin,ty,.25,ink);};
 const lab=(t:string,xx:number,yy:number)=>text(t,xx+1,yy+2.4,1.8,{color:'#6b7f84'});
 const logoW=s.logo?30:0;if(s.logo){const bw=logoW-3,bh=rowsH[0]-2,r=Math.min(bw/s.logo.width,bh/s.logo.height),w=s.logo.width*r,h=s.logo.height*r;out.push({t:'image',src:s.logo.src,x:sx+1.5+(bw-w)/2,y:ty+1+(bh-h)/2,w,h});line(sx+logoW,ty,sx+logoW,ty+rowsH[0],.25,ink);}
 // typed values (names, titles, numbers) are printed as entered; only the labels follow the sheet language
 const B=T.tb;
 lab(B.company,sx+logoW,ty);cell(prof?.company||p.titleBlock.company||p.contractor||'—',sx+logoW,ty+1.5,W2-logoW,rowsH[0]-1.5,3.2,'start',ink,true);hl(rowsH[0]);
 lab(B.project,sx,ty);cell(`${p.code} · ${prof?.projectName||p.name}${p.location?` · ${p.location}`:''}`,sx,ty+1.5,W2,rowsH[1]-1.5,2.5,'start',ink,true);hl(rowsH[1]);
 lab(B.title,sx,ty);cell(m.drawingSetup?.title||B.defaultTitle(T.category[m.category],m.code),sx,ty+1.5,W2,rowsH[3]-1.5,2.7,'start',ink,true);hl(rowsH[3]);
 const thirds=[0,W2/3,2*W2/3],grid3=(vals:[string,string][],h:number)=>{vals.forEach(([l,v],i)=>{lab(l,sx+thirds[i],ty);cell(v,sx+thirds[i],ty+1.8,W2/3,h-1.8,2.4,'start',ink,true);});line(sx+W2/3,ty,sx+W2/3,ty+h,.25,ink);line(sx+2*W2/3,ty,sx+2*W2/3,ty+h,.25,ink);hl(h);};
 grid3([[B.client,p.owner||'—'],[B.contractor,p.contractor||'—'],[B.sub,p.subcontractor||'—']],rowsH[2]);
 grid3([[B.drawn,prof?.preparedBy||p.titleBlock.drawnBy||''],[B.checked,prof?.checkedBy||p.titleBlock.checkedBy||''],[B.approved,p.titleBlock.approvedBy||'']],rowsH[4]);
 const number=m.drawingSetup?.number||composeDrawingNumber(p,m.drawingSetup?.run,m.drawingSetup?.rev);
 grid3([[B.number,number],[B.rev,m.drawingSetup?.revision||s.revision],[B.date,s.date]],rowsH[5]);
 const ns=[...new Set(scales.map(v=>v.n))],scaleText=ns.length===1?ns[0]?`1:${ns[0]}`:'NTS':'AS SHOWN';
 grid3([[B.size,`${S.size} · ${scaleText}`],[B.sheet,`${page+1} / ${L.pages}`],[B.status,s.status]],rowsH[6]);
 }}
 else{
  // drawing sheet of the split layout: title strip along the bottom (member, project, number, revision, date, scale, sheet)
  const ty=S.h-S.margin-12,p=s.project,B=T.tb,number=m.drawingSetup?.number||composeDrawingNumber(p,m.drawingSetup?.run,m.drawingSetup?.rev),ns=[...new Set(scales.map(v=>v.n))];
  line(S.left,ty,right,ty,.45,ink);
  const cells:[string,string,number][]=[[B.title,m.drawingSetup?.title||B.defaultTitle(T.category[m.category],m.code),.27],[B.project,`${p.code} · ${p.drawingProfile?.projectName||p.name}`,.25],[B.number,number,.16],[B.rev,m.drawingSetup?.revision||s.revision,.06],[B.date,s.date,.09],[B.size,`${S.size} · ${ns.length===1?ns[0]?`1:${ns[0]}`:'NTS':'AS SHOWN'}`,.09],[B.sheet,`${page+1} / ${L.pages}`,.08]];
  let cx=S.left;const tw=right-S.left;cells.forEach(([l,v,w],i)=>{const cw=tw*w;text(l,cx+1,ty+2.6,1.8,{color:'#6b7f84'});cell(v,cx,ty+3,cw,9,2.5,'start',ink,true);cx+=cw;if(i<cells.length-1)line(cx,ty,cx,S.h-S.margin,.25,ink);});
 }
 // remaining sheet primitives: text on the text layer, lines / frames / fills on the title block layer
 for(const p of out)if(!p.layer)p.layer=p.t==='text'||p.t==='mtext'?'text':'titleBlock';
 return {prims:out,scales,views:viewInfo,...(notesNb?{notes:notesNb}:{}),...(revsNb?{revs:revsNb}:{}),size:S.size,w:S.w,h:S.h};
}
/** Bar shape sketch (NTS: each axis stretched to the cell so short legs stay readable) with the outside
 * length of every straight leg written next to it. `raw` = unrounded bar vertices (centreline). */
function sketch(out:Prim[],path:Vec3[],raw:Vec3[],d:number,x:number,y:number,w:number,h:number,color:string,coupler:{top:boolean;bottom:boolean}={top:false,bottom:false}){
 if(path.length<2)return;
 const spans=[0,1,2].map(i=>Math.max(...path.map(p=>p[i]))-Math.min(...path.map(p=>p[i]))),axes=spans.map((s,i)=>({s,i})).sort((a,b)=>b.s-a.s).slice(0,2).map(v=>v.i);
 const lo=axes.map(a=>Math.min(...path.map(p=>p[a]))),flat=spans[axes[1]]<1e-6,sx=w/(spans[axes[0]]||1),sy=flat?0:h/spans[axes[1]];
 const P=(p:Vec3):[number,number]=>[x+(p[axes[0]]-lo[0])*sx,flat?y+h/2:y+h-(p[axes[1]]-lo[1])*sy];
 out.push({t:'poly',pts:path.map(P),closed:false,stroke:color,width:.35});
 // mechanical couplers at the coupled ends (top = higher Z end): box along the end leg with a joint line across it
 const ends=(coupler.top?[true]:[]).concat(coupler.bottom?[false]:[]);
 for(const wantTop of ends){const firstHigh=path[0][2]>path.at(-1)![2],atFirst=wantTop===firstHigh,[ex,ey]=P(atFirst?path[0]:path.at(-1)!),[px,py]=P(atFirst?path[1]:path.at(-2)!),l=Math.hypot(ex-px,ey-py)||1,ux=(ex-px)/l,uy=(ey-py)/l,a=1.3,b=.65,vert=Math.abs(uy)>Math.abs(ux);
  const pt=(s:number,t:number):[number,number]=>[ex+ux*s-uy*t,ey+uy*s+ux*t];
  out.push({t:'poly',pts:[pt(-a,-b),pt(a,-b),pt(a,b),pt(-a,b)],closed:true,fill:'#ffffff',stroke:color,width:.3},{t:'line',x1:pt(0,-b)[0],y1:pt(0,-b)[1],x2:pt(0,b)[0],y2:pt(0,b)[1],stroke:color,width:.2},
   {t:'text',x:vert?ex+1.2:ex,y:vert?ey+.6:ey-1.2,text:'COUPLER',size:1.4,color,bold:true,halo:true,anchor:vert?'start':'middle'});}
 if(raw.length<2||raw.length>8)return;
 const cx=x+w/2,size=1.5;
 for(let i=0;i<raw.length-1;i++){
  // outside dimension: vertex distance + d/2 at each bent end (BS 8666 dimensions are to the outside of the bar)
  const len=Math.hypot(...raw[i+1].map((v,k)=>v-raw[i][k]))+(i>0?d/2:0)+(i<raw.length-2?d/2:0);if(len<1)continue;
  const [ax,ay]=P(raw[i]),[bx,by]=P(raw[i+1]),mx=(ax+bx)/2,my=(ay+by)/2,label=Math.round(len).toLocaleString('en-US');
  if(Math.hypot(bx-ax,by-ay)<.8)continue; // e.g. closing hooks of loops: too small to label legibly
  if(Math.abs(bx-ax)>=Math.abs(by-ay))out.push({t:'text',x:mx,y:my-.45,text:label,size,color:'#33494e',anchor:'middle',halo:true});
  else out.push({t:'text',x:mx<cx?mx-.5:mx+.5,y:my+size*.35,text:label,size,color:'#33494e',anchor:mx<cx?'end':'start',halo:true});
 }
}
export const sheetTextWidth=textWidth;
