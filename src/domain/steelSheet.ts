import type {Prim} from './drawingPrims';
import type {Member,Project} from './model';
import {assemblyTypeLabels,type SteelInput} from './steelInputSchema';
import {partLines,steelQuantities} from './steelInput';

// A3 assembly sheet, phase 4a: material list, bolt list, welds, plate sketches (outline + size) and a title block.
// Renderer-agnostic primitives (mm), drawn as SVG on screen and as PDF / DXF like the BBS sheet.
export const STEEL_SHEET={w:420,h:297};
const INK='#203940',MUTED='#5f6b6d',LINE='#9aa6a8';
type T={x:number;y:number;w:number;h:number};
const text=(x:number,y:number,s:string,size=2.4,o:{bold?:boolean;anchor?:'start'|'middle'|'end';color?:string}={}):Prim=>({t:'text',x,y,text:s,size,color:o.color||INK,anchor:o.anchor,bold:o.bold});
const rect=(r:T,o:{fill?:string;stroke?:string;width?:number}={}):Prim=>({t:'rect',...r,stroke:o.stroke??INK,width:o.width??.25,...(o.fill?{fill:o.fill}:{})});
const fmt=(v:number,d=1)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
/** Table: header + rows, column widths in mm, numeric columns right-aligned. */
function table(x:number,y:number,title:string,head:string[],widths:number[],rows:string[][],num:boolean[],rowH=4.6):{prims:Prim[];h:number}{
 const out:Prim[]=[text(x,y+3,title,2.8,{bold:true})],W=widths.reduce((a,b)=>a+b,0),top=y+5;
 out.push(rect({x,y:top,w:W,h:rowH},{fill:'#e8eeee'}));
 let cx=x;head.forEach((h,i)=>{out.push(text(num[i]?cx+widths[i]-1:cx+1,top+rowH-1.4,h,2.1,{bold:true,anchor:num[i]?'end':'start'}));cx+=widths[i];});
 rows.forEach((r,k)=>{const ry=top+rowH*(k+1);out.push({t:'line',x1:x,y1:ry+rowH,x2:x+W,y2:ry+rowH,stroke:LINE,width:.15});cx=x;r.forEach((c,i)=>{out.push(text(num[i]?cx+widths[i]-1:cx+1,ry+rowH-1.4,c,2.1,{anchor:num[i]?'end':'start'}));cx+=widths[i];});});
 const h=rowH*(rows.length+1);out.push(rect({x,y:top,w:W,h}));cx=x;widths.slice(0,-1).forEach(w=>{cx+=w;out.push({t:'line',x1:cx,y1:top,x2:cx,y2:top+h,stroke:LINE,width:.15});});
 return {prims:out,h:h+5};
}
export const PARTS_PER_PAGE=34;
export const steelSheetPages=(i:SteelInput)=>Math.max(1,Math.ceil(i.parts.length/PARTS_PER_PAGE));
export function drawSteelSheet(m:Member,project:Project,o:{page?:number;status:string;date:string;revision:string}):Prim[]{
 const i=m.steelInput!,q=steelQuantities(i),lines=partLines(i),page=o.page||0,pages=steelSheetPages(i),S=STEEL_SHEET,out:Prim[]=[];
 out.push(rect({x:10,y:10,w:S.w-20,h:S.h-20},{width:.5}));
 // header
 out.push(text(15,20,`ASSEMBLY ${m.code}${i.name?` · ${i.name}`:''}`,4.2,{bold:true}),text(15,26,`${assemblyTypeLabels[i.type]} · ${project.code} ${project.name}`.slice(0,110),2.6,{color:MUTED}));
 // right column: material list (this page's rows), totals, bolts, welds, notes
 const X=268,rowsOf=lines.slice(page*PARTS_PER_PAGE,(page+1)*PARTS_PER_PAGE);
 const mat=table(X,14,`MATERIAL LIST · ${m.code}${pages>1?` (${page+1}/${pages})`:''}`,['Mark','Profile','Material','No','Length','Area','Weight'],[17,37,15,8,15,12,17],
  [...rowsOf.map(l=>[l.part.mark+(l.part.main?' *':''),l.profile?.name||l.part.profile,l.part.grade,String(l.part.count),String(Math.round(l.part.length)),fmt(l.paint,1),fmt(l.weight,1)]),...(page===pages-1?[['','','','','Total',fmt(q.paint,1),fmt(q.weight,1)]]:[])],[false,false,false,true,true,true,true]);
 out.push(...mat.prims);let y=14+mat.h+2;
 if(page===pages-1){
  if(i.bolts.length){const b=table(X,y,`BOLT LIST · ${m.code}`,['Size','Grade','Length','No','Hole'],[22,25,25,25,24],i.bolts.map(x=>[x.size,x.grade,x.length?String(Math.round(x.length)):'—',String(x.count),x.hole?fmt(x.hole,1):'—']),[false,false,true,true,true]);out.push(...b.prims);y+=b.h+2;}
  if(i.welds.length){const w=table(X,y,'WELDS',['Type','Size (mm)','Length (mm)','No','Total (m)'],[22,25,25,20,29],i.welds.map(x=>[x.type==='fillet'?'Fillet':'Butt (CJP)',x.size?fmt(x.size,0):'—',String(Math.round(x.length)),String(x.count),fmt(x.length*x.count/1000,2)]),[false,true,true,true,true]);out.push(...w.prims);y+=w.h+2;}
  const holes=[...new Set(i.bolts.map(b=>b.hole).filter(Boolean))];
  out.push(text(X,y+3,'GENERAL NOTES',2.6,{bold:true}));
  [`ALL MATERIAL ${[...new Set(i.parts.map(p=>p.grade).filter(Boolean))].join(' / ')||'—'} UNLESS NOTED`,...(holes.length?[`HOLES ${holes.map(h=>`Ø${fmt(h,1)}`).join(' / ')} mm UNLESS NOTED`]:[]),`* = MAIN PART · WEIGHT ${fmt(q.weight,1)} kg · PAINT AREA ${fmt(q.paint,2)} m²`,i.paint?`PAINT: ${i.paint}`:'']
   .filter(Boolean).forEach((s,k)=>out.push(text(X,y+7.5+k*4,s.slice(0,70),2.1)));
 }
 // left area: plate sketches (outline to scale inside each cell) + main part strip
 const plates=lines.filter(l=>l.profile?.plate),cell={w:62,h:46},cols=4,X0=15,Y0=34;
 if(page===0){
  const mp=lines.find(l=>l.part.main)||lines[0];
  if(mp){const L=mp.part.length,Dp=mp.profile?.depth||100,sc=Math.min(240/L,18/Dp),w=L*sc,h=Math.max(1.2,Dp*sc);
   out.push(text(X0,Y0,`MAIN PART ${mp.part.mark} · ${mp.profile?.name||mp.part.profile} · L = ${Math.round(L)} mm · ${fmt(mp.each,1)} kg`,2.6,{bold:true}),rect({x:X0,y:Y0+4,w,h},{fill:'#f2f5f5'}),
    {t:'line',x1:X0,y1:Y0+h+8,x2:X0+w,y2:Y0+h+8,stroke:MUTED,width:.2},text(X0+w/2,Y0+h+7,String(Math.round(L)),2.2,{anchor:'middle',color:MUTED}));}
  out.push(text(X0,Y0+38,`PLATES (${plates.length})`,2.8,{bold:true}));
  plates.slice(0,cols*4).forEach((l,k)=>{const c={x:X0+(k%cols)*cell.w,y:Y0+42+Math.floor(k/cols)*cell.h},p=l.profile!.plate!,L=l.part.length,sc=Math.min((cell.w-16)/L,(cell.h-27)/p.w),w=L*sc,h=p.w*sc,ox=c.x+8+(cell.w-16-w)/2,oy=c.y+6;
   out.push(rect({x:c.x,y:c.y,w:cell.w-3,h:cell.h-3},{stroke:LINE,width:.15}),rect({x:ox,y:oy,w,h},{fill:'#f2f5f5'}),
    text(ox+w/2,oy+h+3.5,String(Math.round(L)),2.1,{anchor:'middle',color:MUTED}),text(ox-1.2,oy+h/2+.8,String(Math.round(p.w)),2.1,{anchor:'end',color:MUTED}),
    text(c.x+2,c.y+cell.h-10,`${l.part.mark} · ${l.profile!.name} × ${l.part.count}`,2.2,{bold:true}),text(c.x+2,c.y+cell.h-6.2,`L = ${Math.round(L)} · ${fmt(l.each,1)} kg/ชิ้น`,1.9,{color:MUTED}));});
  if(plates.length>cols*4)out.push(text(X0,Y0+42+4*cell.h+3,`… อีก ${plates.length-cols*4} แผ่น (ดูใน Material list)`,2.2,{color:MUTED}));
 }
 // title block
 const tb={x:268,y:S.h-50,w:S.w-278,h:40},tp=project.titleBlock||{};
 out.push(rect(tb,{width:.4}),{t:'line',x1:tb.x,y1:tb.y+10,x2:tb.x+tb.w,y2:tb.y+10,stroke:INK,width:.2},{t:'line',x1:tb.x,y1:tb.y+20,x2:tb.x+tb.w,y2:tb.y+20,stroke:INK,width:.2},{t:'line',x1:tb.x,y1:tb.y+30,x2:tb.x+tb.w,y2:tb.y+30,stroke:INK,width:.2},{t:'line',x1:tb.x+tb.w/2,y1:tb.y+20,x2:tb.x+tb.w/2,y2:tb.y+40,stroke:INK,width:.2});
 const lab=(x:number,yy:number,l:string,v:string,size=2.6)=>out.push(text(x+1.5,yy+3,l,1.8,{color:MUTED}),text(x+1.5,yy+8,v.slice(0,62),size,{bold:true}));
 lab(tb.x,tb.y,'PROJECT',`${project.code} · ${(tp as {project?:string}).project||project.name}`);
 lab(tb.x,tb.y+10,'OWNER / CONTRACTOR',[project.owner,project.contractor,project.subcontractor].filter(Boolean).join(' · ')||'—',2.2);
 lab(tb.x,tb.y+20,'DWG. NO.',`${project.code}-AS-${m.code}`);lab(tb.x+tb.w/2,tb.y+20,'TITLE',`ASSEMBLY NO. ${m.code}`);
 lab(tb.x,tb.y+30,'SCALE · DATE',`NTS · ${o.date}`,2.3);lab(tb.x+tb.w/2,tb.y+30,'REV · SHEET',`${o.revision} · ${page+1}/${pages}`,2.3);
 out.push(text(tb.x,tb.y-2,o.status,2.4,{bold:true,color:'#a3402d'}));
 return out;
}
