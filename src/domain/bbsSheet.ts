import type {Bar,Member,Project,Vec3} from './model';
import {siteKinds,siteLabels,siteUnits} from './siteWork';
import {barPaths} from './engine';
import {shapePileQuantities} from './shapeGeometry';
import {shapeStageVolumes} from './shapeApply';
import {labels} from './model';
import type {ElementInput} from './elementInput';
import {pileQuantities} from './elementInput';
import {buildView,defaultCuts,markColors,renderView,type ViewRow} from './elementViews';
import {textWidth,wrapText,type Prim} from './drawingPrims';

/** A3 landscape (mm). Standard frame: 20 mm binding margin on the left, 10 mm elsewhere.
 * Left: plan, section X–X, section Y–Y and notes. Right strip: BBS table, BOQ table and title block. */
export const SHEET={w:420,h:297,left:20,margin:10,strip:135,title:72,bbsRow:9,bbsHead:6,boqRow:4.4};
export type SheetRow=ViewRow&{grade:string;shapeCode:string;cutLength:number;weight:number};
export type SheetData={member:Member;rows:SheetRow[];input?:ElementInput;project:Project;quantity:number;
 takeoff:{concrete:number;formwork:number;excavation:number;backfill:number;lean:number;rebar:number;sand?:number;sheet?:number;compaction?:number};
 status:string;revision:string;date:string;provisional:boolean;
 /** Company logo (data URL + pixel size) shown in the title block. */
 logo?:{src:string;width:number;height:number}};
type BoqLine={item:string;unit:string;each:number;total:number;bold?:boolean};
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const fmt=(v:number,d=2)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});

export function sheetBoq(s:SheetData):BoqLine[]{
 const q=s.takeoff,n=s.quantity,m=s.member,out:BoqLine[]=[{item:'คอนกรีต',unit:'m³',each:q.concrete,total:q.concrete*n}];
 // shape model with several pour stages: concrete per stage (manual deductions stay in the total above)
 const stages=m.shapeModel?shapeStageVolumes(m.shapeModel):[];if(stages.length>1)for(const st of stages)out.push({item:`  คอนกรีต Stage ${st.stage}`,unit:'m³',each:st.volume,total:st.volume*n});
 out.push({item:'แบบหล่อ',unit:'m²',each:q.formwork,total:q.formwork*n});
 if(m.category==='Foundation'||m.shapeModel?.site)out.push({item:'งานขุดดิน',unit:'m³',each:q.excavation,total:q.excavation*n},{item:'ถมดินกลับ',unit:'m³',each:q.backfill,total:q.backfill*n},{item:'คอนกรีตหยาบ (Lean)',unit:'m³',each:q.lean,total:q.lean*n});
 // sub-base layers and manual items (any category)
 for(const k of siteKinds){const v=q[k]??0;if(v>0)out.push({item:siteLabels[k],unit:siteUnits[k],each:v,total:v*n});}
 for(const it of m.siteWork?.items||[])if(it.quantity>0)out.push({item:it.label,unit:it.unit,each:it.quantity,total:it.quantity*n});
 if(s.input?.category==='Foundation'&&s.input.foundationType==='pile'){const p=pileQuantities(s.input);if(p.count){out.push({item:`เสาเข็ม ${p.size} mm × ${p.lengthEach} m`,unit:'ต้น',each:p.count,total:p.count*n},{item:'ความยาวเสาเข็มรวม',unit:'m',each:p.totalLength,total:p.totalLength*n});if(p.cutCount)out.push({item:`ตัดหัวเข็ม (${Math.round(p.cutLengthEach*1000)} mm/ต้น)`,unit:'ต้น',each:p.cutCount,total:p.cutCount*n});}}
 if(m.shapeModel?.piles){const p=shapePileQuantities(m.shapeModel);if(p.count){out.push({item:`เสาเข็ม ${p.size} mm × ${p.lengthEach} m`,unit:'ต้น',each:p.count,total:p.count*n},{item:'ความยาวเสาเข็มรวม',unit:'m',each:p.totalLength,total:p.totalLength*n});if(p.cutCount)out.push({item:`ตัดหัวเข็ม (${Math.round(p.cutLengthEach*1000)} mm/ต้น)`,unit:'ต้น',each:p.cutCount,total:p.cutCount*n});}}
 const bySize=new Map<string,{d:number;grade:string;w:number}>();
 for(const r of s.rows){const k=`${r.diameter}|${r.grade}`,v=bySize.get(k)||{d:r.diameter,grade:r.grade,w:0};v.w+=r.weight;bySize.set(k,v);}
 for(const v of [...bySize.values()].sort((a,b)=>a.d-b.d))out.push({item:`เหล็ก ${barName(v.d)} (${v.grade})`,unit:'kg',each:v.w,total:v.w*n});
 out.push({item:'เหล็กรวม',unit:'kg',each:q.rebar,total:q.rebar*n,bold:true});
 return out;
}
function layout(s:SheetData){
 const S=SHEET,sx=S.w-S.margin-S.strip,titleTop=S.h-S.margin-S.title,boq=sheetBoq(s),boqH=7+5+boq.length*S.boqRow+(s.provisional?5:0),boqTop=titleTop-3-boqH,tableTop=S.margin+8;
 const perPage=Math.max(1,Math.floor((boqTop-4-tableTop-S.bbsHead)/S.bbsRow));
 return {sx,titleTop,boq,boqTop,tableTop,perPage,pages:Math.max(1,Math.ceil(s.rows.length/perPage))};
}
export function sheetPageCount(s:SheetData){return layout(s).pages;}

/** All primitives of one A3 sheet (mm). */
export function drawSheet(s:SheetData,page=0):Prim[]{
 const S=SHEET,L=layout(s),{sx}=L,out:Prim[]=[],ink='#22393f',grid='#9fb2ad',k=.26;
 const line=(x1:number,y1:number,x2:number,y2:number,width=.2,stroke=grid)=>out.push({t:'line',x1,y1,x2,y2,stroke,width});
 const text=(t:string,x:number,y:number,size=2.6,o:{anchor?:'start'|'middle'|'end';bold?:boolean;color?:string}={})=>out.push({t:'text',x,y,text:t,size,color:o.color||ink,anchor:o.anchor,bold:o.bold});
 const cell=(t:string,x:number,y:number,w:number,h:number,size=2.3,align:'start'|'end'|'middle'='start',color=ink)=>{const lines=wrapText(t,size,w-2,Math.max(1,Math.floor((h-.6)/(size*1.15))));const top=y+h/2-(lines.length-1)*size*.575+size*.35;lines.forEach((l,i)=>text(l,align==='end'?x+w-1:align==='middle'?x+w/2:x+1,top+i*size*1.15,size,{anchor:align,color}));};
 // Frame.
 out.push({t:'rect',x:S.left,y:S.margin,w:S.w-S.left-S.margin,h:S.h-2*S.margin,stroke:ink,width:.7});
 line(sx,S.margin,sx,S.h-S.margin,.45,ink);
 // Left: heading, views and notes.
 const m=s.member,input=s.input,colors=markColors(s.rows),cuts=defaultCuts(m,s.rows);
 text(`${m.code} · ${labels[m.category]} · REINFORCEMENT DETAIL`,S.left+4,S.margin+6,4.2,{bold:true});
 text(`${s.project.code} · ${s.project.name}`,S.left+4,S.margin+10.5,2.6,{color:'#4b6166'});
 line(S.left,S.margin+13,sx,S.margin+13,.3,ink);
 const left=S.left+2,colW=(sx-S.left-6)/2,topY=S.margin+15,topH=128,botY=topY+topH+3,botH=S.h-S.margin-botY-2;
 const views=[{title:'แปลน',box:{x:left,y:topY,w:colW,h:topH},spec:{axes:[0,1] as [number,number]},cuts},{title:`รูปตัด X–X (Y = ${Math.round(cuts.y)})`,box:{x:left+colW+2,y:topY,w:colW,h:topH},spec:{axes:[0,2] as [number,number],normal:1,cut:cuts.y}},{title:`รูปตัด Y–Y (X = ${Math.round(cuts.x)})`,box:{x:left,y:botY,w:colW,h:botH},spec:{axes:[1,2] as [number,number],normal:0,cut:cuts.x}}];
 for(const v of views){
  out.push({t:'rect',x:v.box.x,y:v.box.y,w:v.box.w,h:v.box.h,stroke:'#c8d5d0',width:.2});
  text(v.title,v.box.x+2,v.box.y+4,2.8,{bold:true});
  out.push(...renderView(buildView(m,s.rows,input,v.spec),{x:v.box.x,y:v.box.y+4,w:v.box.w,h:v.box.h-4},{k,colors,cuts:'cuts' in v?v.cuts:undefined}));
 }
 // Notes and Mark legend.
 const nb={x:left+colW+2,y:botY,w:colW,h:botH};out.push({t:'rect',x:nb.x,y:nb.y,w:nb.w,h:nb.h,stroke:'#c8d5d0',width:.2});
 text('หมายเหตุ',nb.x+2,nb.y+4.5,3,{bold:true});
 const det=input?.detailing,names:Record<string,string>={bottom:'ล่าง',top:'บน',side:'ข้าง',edge:'ขอบ',face:'ผิว'};
 const notes=[
  'มิติทั้งหมดเป็นมิลลิเมตร (mm) · ไม่ใช้วัดจากแบบ (NTS)',
  `ระยะหุ้มคอนกรีต (Cover): ${input?Object.entries(input.cover).map(([k2,v])=>`${names[k2]||k2} ${v}`).join(' · '):m.cover}${input?.category==='Foundation'&&input.column.type!=='none'?` · ${input.column.type==='pedestal'?'เสาตอม่อ':'Starter'} ${input.column.columnNo} ${input.column.cover}`:''}`,
  det?`รัศมีดัดใน ${det.bendSmall}d (Ø ≤ 16) / ${det.bendLarge}d (Ø ≥ 20) · ปลอก ${det.tieBend}d`:'รัศมีดัดตามข้อมูลแต่ละ Mark',
  det?`ขอ 90° = ${det.hook90}d (ปลอกสี่เหลี่ยมงอฉากอ้อมเหล็กมุม) · ขอปลอกวงกลม 135° = ${det.hook135}d ≥ ${det.hook135Min} mm · ทาบ ${det.lapTable?`ตาม Spec (${det.lapTable.map(r=>`Ø${r.bar}=${r.length}`).join(', ')})`:`${det.lap}d`}`:'',
  `ยาวตัดปัดขึ้นทีละ ${s.project.spec.rounding} mm${s.project.spec.bsEdition?` (${s.project.spec.bsEdition})`:''} · เหล็ก ${det?`${det.mainGrade} / ปลอก ${det.tieGrade}`:'ตามตาราง'}`,
  input?.category==='Foundation'&&input.foundationType==='pile'?(()=>{const p=pileQuantities(input);return `เสาเข็ม ${p.count} ต้น ${p.size} mm ยาว ${p.lengthEach} m · ตัดหัวเข็ม ${Math.round(p.cutLengthEach*1000)} mm · ฝังในฐาน ${input.pile.embed} mm`;})():'',
  // shape-model (custom) members: pour stages, piles and the rule used for sketched bars
  ...(m.shapeModel?[(()=>{const st=shapeStageVolumes(m.shapeModel);return st.length>1?`เทคอนกรีต ${st.length} ขั้น: ${st.map(x=>`Stage ${x.stage} = ${x.volume.toFixed(2)} m³`).join(' · ')}`:'';})(),
   m.shapeModel.piles?.positions.length?(()=>{const p=shapePileQuantities(m.shapeModel);return `เสาเข็ม ${p.count} ต้น ${p.size} mm ยาว ${p.lengthEach} m · ตัดหัวเข็ม ${Math.round(p.cutLengthEach*1000)} mm · ฝังในคอนกรีต ${m.shapeModel.piles!.embed} mm`;})():'',
   m.bars.some(b=>b.id.startsWith('sk-'))?'เหล็กที่วาดบนรูปตัด: รัศมีดัดขั้นต่ำ BS 8666 (2d Ø ≤ 16 / 3.5d Ø ≥ 20) · ขอมาตรฐานตามตาราง Standard Hooks ของ Spec':'']:[]),
  `จำนวนองค์ประกอบ ${s.quantity} ชิ้น: ${[...new Set(m.occurrences.map(o=>[o.zone,o.floor,o.grid].filter(Boolean).join('/')))].filter(Boolean).join(', ')||'ไม่ระบุตำแหน่ง'}`,
  'เส้นประสีส้ม = ช่วงเหล็กโผล่ (พื้นที่อ้างอิง ไม่คิดปริมาณ) · เส้นประสีน้ำตาล = แนวขุด / เสาเข็ม',
 ].filter(Boolean);
 let ny=nb.y+9;for(const n of notes){for(const l of wrapText(`• ${n}`,2.3,nb.w-4,3)){text(l,nb.x+2,ny,2.3);ny+=2.9;}ny+=.6;}
 ny+=2;text('สัญลักษณ์ Mark',nb.x+2,ny,2.6,{bold:true});ny+=3.6;
 const per=2,cw=(nb.w-4)/per;s.rows.forEach((r,i)=>{const cx=nb.x+2+(i%per)*cw,cy=ny+Math.floor(i/per)*3.4;if(cy>nb.y+nb.h-2)return;out.push({t:'rect',x:cx,y:cy-2,w:2.4,h:2.4,fill:colors.get(r.id),stroke:colors.get(r.id),width:.1});text(`${r.mark} ${barName(r.diameter)} · ${r.count} เส้น/ชิ้น`,cx+3.4,cy,2.2);});
 // Right strip: BBS table.
 const cols:{title:string;w:number;align?:'end'}[]=[{title:'Mark',w:10},{title:'ตำแหน่ง',w:31},{title:'Ø / เกรด',w:13},{title:'รูปดัด',w:24},{title:'ยาว/เส้น',w:15,align:'end'},{title:'ต่อชิ้น',w:10,align:'end'},{title:'รวมเส้น',w:13,align:'end'},{title:'น้ำหนัก kg',w:19,align:'end'}];
 text(`BAR BENDING SCHEDULE${L.pages>1?` (${page+1}/${L.pages})`:''}`,sx+3,S.margin+5.5,3.4,{bold:true});text(`${s.rows.length} Marks`,S.w-S.margin-3,S.margin+5.5,2.4,{anchor:'end',color:'#4b6166'});
 let y=L.tableTop,x=sx;out.push({t:'rect',x:sx,y,w:S.strip,h:S.bbsHead,fill:'#203940'});
 for(const c of cols){cell(c.title,x,y,c.w,S.bbsHead,2.2,c.align||'start','#ffffff');x+=c.w;}y+=S.bbsHead;
 const subset=s.rows.slice(page*L.perPage,(page+1)*L.perPage);
 for(const r of subset){x=sx;const values=[r.mark,r.note||'',`${barName(r.diameter)} ${r.grade}`,'',fmt(r.cutLength,0),String(r.count),String(r.count*s.quantity),fmt(r.weight*s.quantity)];
  const bar=r as unknown as Bar,raw=bar.shape&&!['arc','helix'].includes(bar.shape)?barPaths(m,bar)[0]||[]:[];
  cols.forEach((c,i)=>{if(i===3){sketch(out,r.paths[0]||[],raw,r.diameter,x+5,y+2.6,c.w-10,S.bbsRow-5,colors.get(r.id)||ink);text(r.shapeCode?`#${r.shapeCode}`:'',x+1,y+S.bbsRow-.8,1.8,{color:'#4b6166'});}else cell(values[i],x,y,c.w,S.bbsRow,i===1?1.9:2.3,c.align||'start');x+=c.w;});
  line(sx,y+S.bbsRow,S.w-S.margin,y+S.bbsRow);y+=S.bbsRow;}
 if(!subset.length){cell('ยังไม่มีชุดเหล็ก · ใช้ข้อมูลพื้นฐานเพื่อสร้าง Bar cut list',sx,y,S.strip,S.bbsRow);y+=S.bbsRow;}
 x=sx;for(const c of cols.slice(0,-1)){x+=c.w;line(x,L.tableTop,x,y);}
 text(`น้ำหนักเหล็กรวม ${fmt(s.takeoff.rebar*s.quantity)} kg (${s.quantity} ชิ้น)`,S.w-S.margin-2,y+4,2.5,{anchor:'end',bold:true});
 // Right strip: BOQ table.
 y=L.boqTop;line(sx,y-1.5,S.w-S.margin,y-1.5,.3,ink);text(`BOQ · ${m.code}`,sx+3,y+4.5,3.2,{bold:true});y+=7;
 const bw=[60,13,30,32];out.push({t:'rect',x:sx,y,w:S.strip,h:5,fill:'#203940'});x=sx;
 ['รายการ','หน่วย','ต่อ 1 ชิ้น',`รวม ${s.quantity} ชิ้น`].forEach((t,i)=>{cell(t,x,y,bw[i],5,2.2,i>1?'end':'start','#ffffff');x+=bw[i];});y+=5;
 for(const l of L.boq){if(l.bold)out.push({t:'rect',x:sx,y,w:S.strip,h:S.boqRow,fill:'#e8f0eb'});x=sx;const dec=l.unit==='ต้น'?0:3;[l.item,l.unit,fmt(l.each,dec),fmt(l.total,dec)].forEach((t,i)=>{cell(t,x,y,bw[i],S.boqRow,2.25,i>1?'end':'start');x+=bw[i];});line(sx,y+S.boqRow,S.w-S.margin,y+S.boqRow);y+=S.boqRow;}
 if(s.provisional)cell('ค่าพรีวิว · ยังไม่ยืนยันที่มาข้อมูลปริมาณ (Provisional)',sx,y,S.strip,5,2.1,'start','#926327');
 // Title block.
 const tb=L.titleTop,p=s.project,prof=p.drawingProfile,W2=S.strip,rowsH=[12,10,10,10,10,10,10];out.push({t:'rect',x:sx,y:tb,w:W2,h:S.title,stroke:ink,width:.45});
 let ty=tb;const hl=(h:number)=>{ty+=h;if(ty<tb+S.title-.1)line(sx,ty,S.w-S.margin,ty,.25,ink);};
 const lab=(t:string,xx:number,yy:number)=>text(t,xx+1,yy+2.4,1.8,{color:'#6b7f84'});
 const logoW=s.logo?30:0;if(s.logo){const bw=logoW-3,bh=rowsH[0]-2,r=Math.min(bw/s.logo.width,bh/s.logo.height),w=s.logo.width*r,h=s.logo.height*r;out.push({t:'image',src:s.logo.src,x:sx+1.5+(bw-w)/2,y:ty+1+(bh-h)/2,w,h});line(sx+logoW,ty,sx+logoW,ty+rowsH[0],.25,ink);}
 lab('บริษัท / ผู้ออกแบบ',sx+logoW,ty);cell(prof?.company||p.titleBlock.company||p.contractor||'—',sx+logoW,ty+1.5,W2-logoW,rowsH[0]-1.5,3.2);hl(rowsH[0]);
 lab('โครงการ',sx,ty);cell(`${p.code} · ${prof?.projectName||p.name}${p.location?` · ${p.location}`:''}`,sx,ty+1.5,W2,rowsH[1]-1.5,2.5);hl(rowsH[1]);
 lab('ชื่อแบบ',sx,ty);cell(m.drawingSetup?.title||`แบบเหล็กเสริม ${labels[m.category]} ${m.code} · BBS & BOQ`,sx,ty+1.5,W2,rowsH[3]-1.5,2.7);hl(rowsH[3]);
 const thirds=[0,W2/3,2*W2/3],grid3=(vals:[string,string][],h:number)=>{vals.forEach(([l,v],i)=>{lab(l,sx+thirds[i],ty);cell(v,sx+thirds[i],ty+1.8,W2/3,h-1.8,2.4);});line(sx+W2/3,ty,sx+W2/3,ty+h,.25,ink);line(sx+2*W2/3,ty,sx+2*W2/3,ty+h,.25,ink);hl(h);};
 grid3([['Client',p.owner||'—'],['Contractor',p.contractor||'—'],['Sub Contract',p.subcontractor||'—']],rowsH[2]);
 grid3([['เขียนแบบ',prof?.preparedBy||p.titleBlock.drawnBy||''],['ตรวจ',prof?.checkedBy||p.titleBlock.checkedBy||''],['อนุมัติ','']],rowsH[4]);
 const number=m.drawingSetup?.number||`${p.titleBlock.drawingPrefix||p.code}-${m.code}-BBS`;
 grid3([['เลขที่แบบ',number],['Revision',m.drawingSetup?.revision||s.revision],['วันที่',s.date]],rowsH[5]);
 grid3([['ขนาด / มาตราส่วน','A3 · NTS'],['แผ่นที่',`${page+1} / ${L.pages}`],['สถานะ',s.status]],rowsH[6]);
 return out;
}
/** Bar shape sketch (NTS: each axis stretched to the cell so short legs stay readable) with the outside
 * length of every straight leg written next to it. `raw` = unrounded bar vertices (centreline). */
function sketch(out:Prim[],path:Vec3[],raw:Vec3[],d:number,x:number,y:number,w:number,h:number,color:string){
 if(path.length<2)return;
 const spans=[0,1,2].map(i=>Math.max(...path.map(p=>p[i]))-Math.min(...path.map(p=>p[i]))),axes=spans.map((s,i)=>({s,i})).sort((a,b)=>b.s-a.s).slice(0,2).map(v=>v.i);
 const lo=axes.map(a=>Math.min(...path.map(p=>p[a]))),flat=spans[axes[1]]<1e-6,sx=w/(spans[axes[0]]||1),sy=flat?0:h/spans[axes[1]];
 const P=(p:Vec3):[number,number]=>[x+(p[axes[0]]-lo[0])*sx,flat?y+h/2:y+h-(p[axes[1]]-lo[1])*sy];
 out.push({t:'poly',pts:path.map(P),closed:false,stroke:color,width:.35});
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
