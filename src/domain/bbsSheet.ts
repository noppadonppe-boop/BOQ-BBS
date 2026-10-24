import type {Bar,Member,Project,Vec3} from './model';
import {barPaths} from './engine';
import {shapePileQuantities} from './shapeGeometry';
import {shapeStageVolumes} from './shapeApply';
import {pourStageQuantities} from './solids';
import type {ElementInput} from './elementInput';
import {barCouplerEnds,footingColumns,pileQuantities} from './elementInput';
import {beamGroupSheet,beamSheetPages} from './beamGroupSheet';
import {buildView,columnSectionCut,defaultCuts,markColors,renderView,type ViewRow} from './elementViews';
import {textWidth,wrapText,type Prim} from './drawingPrims';
import {composeDrawingNumber} from './drawingStandard';
import {sheetLangOf,sheetPhrase,sheetText} from './sheetText';

/** A3 landscape (mm). Standard frame: 20 mm binding margin on the left, 10 mm elsewhere.
 * Left: plan, section X–X, section Y–Y and notes. Right strip: BBS table, BOQ table and title block. */
export const SHEET={w:420,h:297,left:20,margin:10,strip:135,title:72,bbsRow:9,bbsHead:6,boqRow:4.4};
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
 const q=s.takeoff,n=s.quantity,m=s.member,B=sheetText[sheetLangOf(s.project)].boq,out:BoqLine[]=[{item:B.concrete,unit:'m³',each:q.concrete,total:q.concrete*n}];
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
function layout(s:SheetData){
 const S=SHEET,sx=S.w-S.margin-S.strip,titleTop=S.h-S.margin-S.title,boq=sheetBoq(s),boqH=7+5+boq.length*S.boqRow+(s.provisional?5:0),boqTop=titleTop-3-boqH,tableTop=S.margin+8;
 const perPage=Math.max(1,Math.floor((boqTop-4-tableTop-S.bbsHead)/S.bbsRow));
 return {sx,titleTop,boq,boqTop,tableTop,perPage,pages:Math.max(1,Math.ceil(s.rows.length/perPage),beamSheetPages(s.input))};
}
export function sheetPageCount(s:SheetData){return layout(s).pages;}

/** All primitives of one A3 sheet (mm). */
export function drawSheet(s:SheetData,page=0):Prim[]{
 const S=SHEET,L=layout(s),{sx}=L,out:Prim[]=[],ink='#22393f',grid='#9fb2ad',k=.26,lang=sheetLangOf(s.project),T=sheetText[lang];
 const line=(x1:number,y1:number,x2:number,y2:number,width=.2,stroke=grid)=>out.push({t:'line',x1,y1,x2,y2,stroke,width});
 // generated Thai phrases (bar descriptions, notes typed in Thai) are translated for EN / ZH sheets
 const text=(t:string,x:number,y:number,size=2.6,o:{anchor?:'start'|'middle'|'end';bold?:boolean;color?:string;raw?:boolean}={})=>out.push({t:'text',x,y,text:o.raw?t:sheetPhrase(t,lang),size,color:o.color||ink,anchor:o.anchor,bold:o.bold});
 const cell=(t:string,x:number,y:number,w:number,h:number,size=2.3,align:'start'|'end'|'middle'='start',color=ink,raw=false)=>{const lines=wrapText(raw?t:sheetPhrase(t,lang),size,w-2,Math.max(1,Math.floor((h-.6)/(size*1.15))));const top=y+h/2-(lines.length-1)*size*.575+size*.35;lines.forEach((l,i)=>text(l,align==='end'?x+w-1:align==='middle'?x+w/2:x+1,top+i*size*1.15,size,{anchor:align,color,raw:true}));};
 // Frame.
 out.push({t:'rect',x:S.left,y:S.margin,w:S.w-S.left-S.margin,h:S.h-2*S.margin,stroke:ink,width:.7});
 line(sx,S.margin,sx,S.h-S.margin,.45,ink);
 // Left: heading, views and notes.
 const m=s.member,input=s.input,colors=markColors(s.rows),cuts=defaultCuts(m,s.rows);
 text(`${m.code} · ${T.category[m.category]} · ${lang==='zh'?'配筋详图':'REINFORCEMENT DETAIL'}`,S.left+4,S.margin+6,4.2,{bold:true});
 text(`${s.project.code} · ${s.project.name}`,S.left+4,S.margin+10.5,2.6,{color:'#4b6166',raw:true});
 line(S.left,S.margin+13,sx,S.margin+13,.3,ink);
 const left=S.left+2,colW=(sx-S.left-6)/2,topY=S.margin+15,topH=128,botY=topY+topH+3,botH=S.h-S.margin-botY-2;
 // beam group: elevation + cross-sections (paged) instead of plan / sections X–Y
 const bg=beamGroupSheet(m,s.rows,input,{x:left,y:topY,w:sx-left-2,h:S.h-S.margin-topY-2},page,k);
 const det=input?.detailing,names=T.coverNames;
 const notes=[
  T.nts,
  `${T.cover}: ${input?Object.entries(input.cover).map(([k2,v])=>`${names[k2]||k2} ${v}`).join(' · '):m.cover}${input?.category==='Foundation'&&input.column.type!=='none'?` · ${input.column.type==='pedestal'?T.pedestal:'Starter'} ${footingColumns(input).map(c=>c.columnNo).filter(Boolean).join(', ')} ${input.column.cover}`:''}`,
  input?.category==='Column'&&input.layout!=='stack'&&input.rebar.top.mode==='coupler'?T.coupler((m.siteWork?.items||[]).filter(it=>it.id.startsWith('gen-coupler-')).map(it=>`${it.label.replace(/^.*\) /,'')} × ${it.quantity}`).join(', '),0):'',
  input?.category==='Foundation'&&input.column.type!=='none'&&footingColumns(input).some(c=>c.splice?.type==='coupler')?T.coupler((m.siteWork?.items||[]).filter(it=>it.id.startsWith('gen-coupler-')).map(it=>`${it.label.replace(/^.*\) /,'')} × ${it.quantity}`).join(', '),Math.max(0,...footingColumns(input).filter(c=>c.splice?.type==='coupler').map(c=>c.splice.stagger))):'',
  det?T.bendRadius(det.bendSmall,det.bendLarge,det.tieBend):T.bendPerMark,
  det?T.hooks(det.hook90,det.hook135,det.hook135Min,det.lapTable?T.lapSpec(det.lapTable.map(r=>`Ø${r.bar}=${r.length}`).join(', ')):`${det.lap}d`):'',
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
 const colBox=colCut?under?{x:left+colW+2,y:botY+noteH+2,w:colW,h:botH-noteH-2}:{x:left+secW+2,y:botY,w:colW-secW-2,h:botH}:undefined;
 const views=bg?bg.views:[{title:T.plan,box:{x:left,y:topY,w:colW,h:topH},spec:{axes:[0,1] as [number,number]},cuts},{title:T.sectionX(Math.round(cuts.y)),box:{x:left+colW+2,y:topY,w:colW,h:topH},spec:{axes:[0,2] as [number,number],normal:1,cut:cuts.y}},{title:T.sectionY(Math.round(cuts.x)),box:{x:left,y:botY,w:secW,h:botH},spec:{axes:[1,2] as [number,number],normal:0,cut:cuts.x}},
  ...(colCut&&colBox?[{title:T.columnSection(colCut.kind,Math.round(colCut.z)),box:colBox,spec:{axes:[0,1] as [number,number],normal:2,cut:colCut.z,columns:true}}]:[])];
 for(const v of views){
  out.push({t:'rect',x:v.box.x,y:v.box.y,w:v.box.w,h:v.box.h,stroke:'#c8d5d0',width:.2});
  text(v.title,v.box.x+2,v.box.y+4,2.8,{bold:true});
  out.push(...renderView(buildView(m,s.rows,input,v.spec),{x:v.box.x,y:v.box.y+4,w:v.box.w,h:v.box.h-4},{k,colors,cuts:'cuts' in v?v.cuts:undefined,zCut:colCut?.z}).map(p=>p.t==='text'?{...p,text:sheetPhrase(p.text,lang)}:p));
 }
 if(bg)out.push(...bg.marks);
 // Notes and Mark legend.
 const nb=bg?bg.notes:{x:left+colW+2,y:botY,w:colW,h:under?noteH:botH};out.push({t:'rect',x:nb.x,y:nb.y,w:nb.w,h:nb.h,stroke:'#c8d5d0',width:.2});
 text(T.notes,nb.x+2,nb.y+4.5,3,{bold:true});
 let ny=nb.y+9;for(const n of notes){for(const l of wrapText(`• ${n}`,2.3,nb.w-4,3)){text(l,nb.x+2,ny,2.3);ny+=2.9;}ny+=.6;}
 ny+=2;text(T.legend,nb.x+2,ny,2.6,{bold:true});ny+=3.6;
 const per=2,cw=(nb.w-4)/per;s.rows.forEach((r,i)=>{const cx=nb.x+2+(i%per)*cw,cy=ny+Math.floor(i/per)*3.4;if(cy>nb.y+nb.h-2)return;out.push({t:'rect',x:cx,y:cy-2,w:2.4,h:2.4,fill:colors.get(r.id),stroke:colors.get(r.id),width:.1});text(T.perPiece(`${r.mark} ${barName(r.diameter)}`,r.count),cx+3.4,cy,2.2);});
 // Right strip: BBS table.
 const cols:{title:string;w:number;align?:'end'}[]=[{w:10},{w:31},{w:13},{w:24},{w:15,align:'end' as const},{w:10,align:'end' as const},{w:13,align:'end' as const},{w:19,align:'end' as const}].map((c,i)=>({...c,title:T.cols[i]}));
 text(`${lang==='zh'?'钢筋弯曲表 BAR BENDING SCHEDULE':'BAR BENDING SCHEDULE'}${L.pages>1?` (${page+1}/${L.pages})`:''}`,sx+3,S.margin+5.5,3.4,{bold:true});text(`${s.rows.length} Marks`,S.w-S.margin-3,S.margin+5.5,2.4,{anchor:'end',color:'#4b6166'});
 let y=L.tableTop,x=sx;out.push({t:'rect',x:sx,y,w:S.strip,h:S.bbsHead,fill:'#203940'});
 for(const c of cols){cell(c.title,x,y,c.w,S.bbsHead,2.2,c.align||'start','#ffffff');x+=c.w;}y+=S.bbsHead;
 const subset=s.rows.slice(page*L.perPage,(page+1)*L.perPage);
 for(const r of subset){x=sx;const values=[r.mark,r.note||'',`${barName(r.diameter)} ${r.grade}`,'',fmt(r.cutLength,0),String(r.count),String(r.count*s.quantity),fmt(r.weight*s.quantity)];
  const bar=r as unknown as Bar,raw=bar.shape&&!['arc','helix'].includes(bar.shape)?barPaths(m,bar)[0]||[]:[];
  cols.forEach((c,i)=>{if(i===3){sketch(out,r.paths[0]||[],raw,r.diameter,x+5,y+2.6,c.w-10,S.bbsRow-5,colors.get(r.id)||ink,barCouplerEnds(input,r.id));text(r.shapeCode?`#${r.shapeCode}`:'',x+1,y+S.bbsRow-.8,1.8,{color:'#4b6166'});}else cell(values[i],x,y,c.w,S.bbsRow,i===1?1.9:2.3,c.align||'start');x+=c.w;});
  line(sx,y+S.bbsRow,S.w-S.margin,y+S.bbsRow);y+=S.bbsRow;}
 if(!subset.length){cell(T.noBars,sx,y,S.strip,S.bbsRow);y+=S.bbsRow;}
 x=sx;for(const c of cols.slice(0,-1)){x+=c.w;line(x,L.tableTop,x,y);}
 text(T.totalWeight(fmt(s.takeoff.rebar*s.quantity),s.quantity),S.w-S.margin-2,y+4,2.5,{anchor:'end',bold:true});
 // Right strip: BOQ table.
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
 grid3([[B.size,'A3 · NTS'],[B.sheet,`${page+1} / ${L.pages}`],[B.status,s.status]],rowsH[6]);
 return out;
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
