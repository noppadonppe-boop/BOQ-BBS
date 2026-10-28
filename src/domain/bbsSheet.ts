import type {Bar,Member,Project,Vec3} from './model';
import {barPaths} from './engine';
import {shapePileQuantities} from './shapeGeometry';
import {shapeStageVolumes} from './shapeApply';
import {pourStageQuantities} from './solids';
import type {ElementInput} from './elementInput';
import {barCouplerEnds,footingColumns,pileQuantities} from './elementInput';
import {beamGroupSheet,beamSheetPages} from './beamGroupSheet';
import {buildView,columnSectionCut,defaultCuts,markColors,planLayerOf,renderView,type ViewRow} from './elementViews';
import {textWidth,wrapText,type Prim} from './drawingPrims';
import {composeDrawingNumber,sheetSetupOf,sheetSizes,standardScales,type ViewScale} from './drawingStandard';
import {sheetLangOf,sheetPhrase,sheetText} from './sheetText';
import {concreteNote,memberConcrete} from './concreteMixes';

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
 logo?:{src:string;width:number;height:number}};
type BoqLine={item:string;unit:string;each:number;total:number;bold?:boolean;count?:boolean};
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const fmt=(v:number,d=2)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});

export function sheetBoq(s:SheetData):BoqLine[]{
 const q=s.takeoff,n=s.quantity,m=s.member,B=sheetText[sheetLangOf(s.project)].boq,mix=memberConcrete(m),out:BoqLine[]=[{item:mix?`${B.concrete} ${mix}`:B.concrete,unit:'m³',each:q.concrete,total:q.concrete*n}];
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
 const bySize=new Map<string,{d:number;grade:string;w:number}>();
 for(const r of s.rows){const k=`${r.diameter}|${r.grade}`,v=bySize.get(k)||{d:r.diameter,grade:r.grade,w:0};v.w+=r.weight;bySize.set(k,v);}
 for(const v of [...bySize.values()].sort((a,b)=>a.d-b.d))out.push({item:B.steel(barName(v.d),v.grade),unit:'kg',each:v.w,total:v.w*n});
 out.push({item:B.steelTotal,unit:'kg',each:q.rebar,total:q.rebar*n,bold:true});
 return out;
}
type SheetView={title:string;spec:Parameters<typeof buildView>[3];cuts?:ReturnType<typeof defaultCuts>;plan:boolean};
const lying=(r:SheetRow)=>r.paths.some(p=>p.some((q,i)=>i>0&&Math.hypot(q[0]-p[i-1][0],q[1]-p[i-1][1])>=1));
/** Views of a member on the drawing sheets of the split layout: plan (or bottom / top plans), sections X–X / Y–Y and
 * the pedestal / starter section. */
function sheetViews(s:SheetData):SheetView[]{
 const S=sheetFormat(s),m=s.member,input=s.input,T=sheetText[sheetLangOf(s.project)],cuts=defaultCuts(m,s.rows),colCut=columnSectionCut(input,s.rows),rep=S.bars==='representative';
 const split=S.split&&s.rows.some(r=>lying(r)&&planLayerOf(m,input,r)==='bottom')&&s.rows.some(r=>lying(r)&&planLayerOf(m,input,r)==='top');
 const plan=(title:string,layer?:'bottom'|'top'):SheetView=>({title,spec:{axes:[0,1],rep,layer,tight:true},cuts,plan:true});
 return [...(split?[plan(T.planBottom,'bottom'),plan(T.planTop,'top')]:[plan(T.plan)]),
  {title:T.sectionX(Math.round(cuts.y)),spec:{axes:[0,2],normal:1,cut:cuts.y,tight:true},plan:false},{title:T.sectionY(Math.round(cuts.x)),spec:{axes:[1,2],normal:0,cut:cuts.x,tight:true},plan:false},
  ...(colCut?[{title:T.columnSection(colCut.kind,Math.round(colCut.z)),spec:{axes:[0,1],normal:2,cut:colCut.z,columns:true},plan:false} as SheetView]:[])];
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
 if(S.layout!=='split'||own)return {...base,split:false,tablePages:0,groups:[] as number[][],tRow:0,tHead:0,tTop:0,tPer:0,pages:Math.max(1,Math.ceil(s.rows.length/perPage),beamSheetPages(s.input))};
 const tRow=S.bbsRow*1.35,tHead=S.bbsHead*1.2,tTop=S.margin+22,tPer=Math.max(1,Math.floor((S.h-S.margin-9-tTop-tHead)/tRow)),tablePages=Math.max(1,Math.ceil(s.rows.length/tPer));
 const views=sheetViews(s),idx=views.map((_,i)=>i),n=Math.min(4,S.perPage);
 const groups=n?Array.from({length:Math.ceil(idx.length/n)},(_,k)=>idx.slice(k*n,(k+1)*n)):[idx.filter(i=>views[i].plan),idx.filter(i=>!views[i].plan)].filter(g=>g.length);
 return {...base,split:true,tablePages,groups,tRow,tHead,tTop,tPer,pages:tablePages+groups.length};
}
export function sheetPageCount(s:SheetData){return layout(s).pages;}

export type SheetViewScale={title:string;n:number;fits:boolean};
/** All primitives of one sheet (mm). */
export function drawSheet(s:SheetData,page=0):Prim[]{return drawSheetInfo(s,page).prims;}
/** Sheet primitives plus the scale used for each view (n = 0: not to scale; fits = false: the chosen 1:N did not fit). */
export function drawSheetInfo(s:SheetData,page=0):{prims:Prim[];scales:SheetViewScale[];size:keyof typeof sheetSizes}{
 const S=sheetFormat(s),L=layout(s),{sx}=L,out:Prim[]=[],ink='#22393f',grid='#9fb2ad',k=.26,lang=sheetLangOf(s.project),T=sheetText[lang];
 // 'one' = views + tables; split layout: 'tables' sheets (BBS on the left) then 'views' sheets (views + title strip)
 const kind=!L.split?'one':page<L.tablePages?'tables':'views',right=S.w-S.margin;
 const line=(x1:number,y1:number,x2:number,y2:number,width=.2,stroke=grid)=>out.push({t:'line',x1,y1,x2,y2,stroke,width});
 // generated Thai phrases (bar descriptions, notes typed in Thai) are translated for EN / ZH sheets
 const text=(t:string,x:number,y:number,size=2.6,o:{anchor?:'start'|'middle'|'end';bold?:boolean;color?:string;raw?:boolean}={})=>out.push({t:'text',x,y,text:o.raw?t:sheetPhrase(t,lang),size,color:o.color||ink,anchor:o.anchor,bold:o.bold});
 const cell=(t:string,x:number,y:number,w:number,h:number,size=2.3,align:'start'|'end'|'middle'='start',color=ink,raw=false)=>{const lines=wrapText(raw?t:sheetPhrase(t,lang),size,w-2,Math.max(1,Math.floor((h-.6)/(size*1.15))));const top=y+h/2-(lines.length-1)*size*.575+size*.35;lines.forEach((l,i)=>text(l,align==='end'?x+w-1:align==='middle'?x+w/2:x+1,top+i*size*1.15,size,{anchor:align,color,raw:true}));};
 // Frame.
 out.push({t:'rect',x:S.left,y:S.margin,w:S.w-S.left-S.margin,h:S.h-2*S.margin,stroke:ink,width:.7});
 if(kind!=='views')line(sx,S.margin,sx,S.h-S.margin,.45,ink);
 // Left: heading, views and notes.
 const m=s.member,input=s.input,colors=markColors(s.rows),cuts=defaultCuts(m,s.rows);
 text(`${m.code} · ${T.category[m.category]} · ${lang==='zh'?'配筋详图':'REINFORCEMENT DETAIL'}`,S.left+4,S.margin+6,4.2,{bold:true});
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
 const colCut=bg?undefined:columnSectionCut(input,s.rows),noteH=9+notes.reduce((h,n)=>h+wrapText(`• ${n}`,2.3,colW-4,3).length*2.9+.6,0)+5.6+Math.ceil(s.rows.length/2)*3.4+2;
 const under=!!colCut&&botH-noteH-2>=48,secW=colCut&&!under?colW*.58:colW;
 // split plans (bottom / top bars) when the member has bars lying in both layers: three columns,
 // top row plan bottom | plan top | section X–X, bottom row section Y–Y (| column section) | notes
 const split=!bg&&S.split&&s.rows.some(r=>lying(r)&&planLayerOf(m,input,r)==='bottom')&&s.rows.some(r=>lying(r)&&planLayerOf(m,input,r)==='top');
 const c3=(sx-S.left-8)/3,col3=(i:number)=>left+i*(c3+2);
 const colBox=!colCut?undefined:split?{x:col3(1),y:botY,w:c3,h:botH}:under?{x:left+colW+2,y:botY+noteH+2,w:colW,h:botH-noteH-2}:{x:left+secW+2,y:botY,w:colW-secW-2,h:botH};
 const rep=S.bars==='representative',planSpec=(layer?:'bottom'|'top')=>({axes:[0,1] as [number,number],rep,layer});
 const sheetBox={x:left,y:topY,w:right-2-left,h:S.h-S.margin-14-topY},group=kind==='views'?L.groups[page-L.tablePages]:[],all=kind==='views'?sheetViews(s):[];
 const built=group.map(i=>buildView(m,s.rows,input,all[i].spec));
 const views=kind==='tables'?[]:kind==='views'?placeViews(built.map(v=>[v.u[1]-v.u[0],v.v[1]-v.v[0]]),sheetBox,48*k).map((box,j)=>({...all[group[j]],box})):bg?bg.views:[...(split?[{title:T.planBottom,box:{x:col3(0),y:topY,w:c3,h:topH},spec:planSpec('bottom'),cuts},{title:T.planTop,box:{x:col3(1),y:topY,w:c3,h:topH},spec:planSpec('top'),cuts}]:[{title:T.plan,box:{x:left,y:topY,w:colW,h:topH},spec:planSpec(),cuts}]),
  {title:T.sectionX(Math.round(cuts.y)),box:split?{x:col3(2),y:topY,w:c3,h:topH}:{x:left+colW+2,y:topY,w:colW,h:topH},spec:{axes:[0,2] as [number,number],normal:1,cut:cuts.y}},
  {title:T.sectionY(Math.round(cuts.x)),box:split?{x:left,y:botY,w:colCut?c3:2*c3+2,h:botH}:{x:left,y:botY,w:secW,h:botH},spec:{axes:[1,2] as [number,number],normal:0,cut:cuts.x}},
  ...(colCut&&colBox?[{title:T.columnSection(colCut.kind,Math.round(colCut.z)),box:colBox,spec:{axes:[0,1] as [number,number],normal:2,cut:colCut.z,columns:true}}]:[])];
 // beam-group marks are placed for the fitted views: those views stay not to scale
 const scales:SheetViewScale[]=[];
 for(const v of views){
  out.push({t:'rect',x:v.box.x,y:v.box.y,w:v.box.w,h:v.box.h,stroke:'#c8d5d0',width:.2});
  let used={n:0,fits:true};
  const scale=bg?undefined:(fit:number)=>{const r=pickScale(fit,S.scale);used=r;return r.s;};
  // one view of a large member has more prims than a spread call takes as arguments
  for(const p of renderView(buildView(m,s.rows,input,v.spec),{x:v.box.x,y:v.box.y+4,w:v.box.w,h:v.box.h-4},{k,colors,cuts:'cuts' in v?v.cuts:undefined,zCut:colCut?.z,scale,gutter:!bg&&S.gutter}))out.push(p.t==='text'?{...p,text:sheetPhrase(p.text,lang)}:p);
  text(`${v.title} · ${used.n?`1:${used.n}`:'NTS'}`,v.box.x+2,v.box.y+4,2.8,{bold:true});
  scales.push({title:v.title,...used});
 }
 if(bg)out.push(...bg.marks);
 // Notes and Mark legend.
 if(kind!=='views'){
 const nb=kind==='tables'?{x:sx,y:S.margin,w:S.strip,h:L.boqTop-4-S.margin}:bg?bg.notes:split?{x:col3(2),y:botY,w:c3,h:botH}:{x:left+colW+2,y:botY,w:colW,h:under?noteH:botH};out.push({t:'rect',x:nb.x,y:nb.y,w:nb.w,h:nb.h,stroke:'#c8d5d0',width:.2});
 text(T.notes,nb.x+2,nb.y+4.5,3,{bold:true});
 let ny=nb.y+9;for(const n of notes){for(const l of wrapText(`• ${n}`,2.3,nb.w-4,3)){text(l,nb.x+2,ny,2.3);ny+=2.9;}ny+=.6;}
 ny+=2;text(T.legend,nb.x+2,ny,2.6,{bold:true});ny+=3.6;
 const per=2,cw=(nb.w-4)/per;s.rows.forEach((r,i)=>{const cx=nb.x+2+(i%per)*cw,cy=ny+Math.floor(i/per)*3.4;if(cy>nb.y+nb.h-2)return;out.push({t:'rect',x:cx,y:cy-2,w:2.4,h:2.4,fill:colors.get(r.id),stroke:colors.get(r.id),width:.1});text(T.perPiece(`${r.mark} ${barName(r.diameter)}`,r.count),cx+3.4,cy,2.2);});
 }
 if(kind!=='views'){
 // BBS table: right strip, or (tables sheet) the whole left area with bigger rows / text
 const big=kind==='tables',tx=big?S.left:sx,tw=big?sx-S.left:S.strip,f=tw/S.strip,fz=big?1.2:1,rowH=big?L.tRow:S.bbsRow,headH=big?L.tHead:S.bbsHead,top=big?L.tTop:L.tableTop,per=big?L.tPer:L.perPage,tr=tx+tw;
 const cols:{title:string;w:number;align?:'end'}[]=[{w:10},{w:31},{w:13},{w:24},{w:15,align:'end' as const},{w:10,align:'end' as const},{w:13,align:'end' as const},{w:19,align:'end' as const}].map((c,i)=>({...c,w:c.w*f,title:T.cols[i]}));
 const tPages=big?L.tablePages:L.pages,hy=big?top-3.5:S.margin+5.5;
 text(`${lang==='zh'?'钢筋弯曲表 BAR BENDING SCHEDULE':'BAR BENDING SCHEDULE'}${tPages>1?` (${page+1}/${tPages})`:''}`,tx+3,hy,3.4*fz,{bold:true});text(`${s.rows.length} Marks`,tr-3,hy,2.4*fz,{anchor:'end',color:'#4b6166'});
 let y=top,x=tx;out.push({t:'rect',x:tx,y,w:tw,h:headH,fill:'#203940'});
 for(const c of cols){cell(c.title,x,y,c.w,headH,2.2*fz,c.align||'start','#ffffff');x+=c.w;}y+=headH;
 const subset=s.rows.slice(page*per,(page+1)*per);
 for(const r of subset){x=tx;const values=[r.mark,r.note||'',`${barName(r.diameter)} ${r.grade}`,'',fmt(r.cutLength,0),String(r.count),String(r.count*s.quantity),fmt(r.weight*s.quantity)];
  const bar=r as unknown as Bar,raw=bar.shape&&!['arc','helix'].includes(bar.shape)?barPaths(m,bar)[0]||[]:[];
  cols.forEach((c,i)=>{if(i===3){sketch(out,r.paths[0]||[],raw,r.diameter,x+5*fz,y+2.6*fz,c.w-10*fz,rowH-5*fz,colors.get(r.id)||ink,barCouplerEnds(input,r.id));text(r.shapeCode?`#${r.shapeCode}`:'',x+1,y+rowH-.8,1.8*fz,{color:'#4b6166'});}else cell(values[i],x,y,c.w,rowH,(i===1?1.9:2.3)*fz,c.align||'start');x+=c.w;});
  line(tx,y+rowH,tr,y+rowH);y+=rowH;}
 if(!subset.length){cell(T.noBars,tx,y,tw,rowH);y+=rowH;}
 x=tx;for(const c of cols.slice(0,-1)){x+=c.w;line(x,top,x,y);}
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
 return {prims:out,scales,size:S.size};
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
