import {wrapText,type Prim} from './drawingPrims';
import {beamGroupLayout,beamSpliceReport,beamZoneLabels,columnStackLayout,type SpliceReportRow,type BeamInput,type BeamZone,type ColumnInput,type ElementInput} from './elementInput';
import {buildView,exDimRows,type ViewRow} from './elementViews';
import type {Member} from './model';

type Box={x:number;y:number;w:number;h:number};
type ViewSpec={axes:[number,number];normal?:number;cut?:number};
export type BeamSection={letter:string;mark:string;zone:BeamZone;x:number};
const groupOf=(input?:ElementInput):BeamInput|undefined=>input?.category==='Beam'&&input.layout==='group'&&input.spans.length?input:undefined;
const SECTIONS_PER_PAGE=5;

/** Cross-sections of a beam group as on the beam details: per beam mark its END / MID / CON / CANT sections
 * (each cut once, where it first occurs: support sections at L/8 from the face, MID at mid-span). */
export function beamGroupSections(input:BeamInput):BeamSection[]{
 const lay=beamGroupLayout(input),out:BeamSection[]=[],seen=new Set<string>();
 const add=(mark:string,zone:BeamZone,x:number)=>{const key=`${mark}|${zone}`;if(seen.has(key))return;seen.add(key);out.push({letter:'',mark,zone,x});};
 for(const s of lay.spans){const near=s.clear/8;
  if(s.kind==='cantilever'){add(s.mark,'cant',(s.a+s.b)/2);continue;}
  add(s.mark,s.zoneA,s.a+near);add(s.mark,'mid',(s.a+s.b)/2);add(s.mark,s.zoneB,s.b-near);}
 const order:Record<BeamZone,number>={end:0,mid:1,con:2,cant:3};
 return out.sort((a,b)=>a.mark.localeCompare(b.mark,'en',{numeric:true})||order[a.zone]-order[b.zone]).map((v,i)=>({...v,letter:i<26?String.fromCharCode(65+i):`A${i-25}`}));
}
/** Extra sheet pages needed for the beam-group sections (the BBS table may need more). */
export function beamSheetPages(input?:ElementInput){const g=groupOf(input);if(g)return Math.ceil(beamGroupSections(g).length/SECTIONS_PER_PAGE)+(beamSpliceReport(g).length?1:0);const c=stackOf(input);return c?Math.ceil(c.stack.storeys.length/COLUMN_SECTIONS_PER_PAGE):1;}

/** Left-area layout of an A3 sheet for a beam group: elevation (whole group, section marks), a row of
 * cross-sections for this page and the notes box. Returns undefined for other members. */
export function beamGroupSheet(m:Member,rows:ViewRow[],input:ElementInput|undefined,area:Box,page:number,k:number){
 const g=groupOf(input);if(!g)return columnStackSheet(m,rows,input,area,page,k);
 const lay=beamGroupLayout(g),all=beamGroupSections(g),secPages=Math.ceil(all.length/SECTIONS_PER_PAGE),runs=beamSpliceReport(g),pages=secPages+(runs.length?1:0);
 // last page of a spliced group: splice diagram + bar-run table instead of the elevation / sections
 if(runs.length&&page%pages===secPages)return {...spliceSheet(g,runs,rows,area),pages,sectionPage:`${pages}/${pages}`};
 const list=all.slice((page%pages)*SECTIONS_PER_PAGE,(page%pages+1)*SECTIONS_PER_PAGE);
 const elevH=Math.min(110,area.h*.38),secY=area.y+elevH+3,secH=Math.min(78,area.h*.3),secW=(area.w-(SECTIONS_PER_PAGE-1)*2)/SECTIONS_PER_PAGE;
 const elevBox={x:area.x,y:area.y,w:area.w,h:elevH},elevSpec:ViewSpec={axes:[0,2],normal:1,cut:lay.W/2};
 const views:{title:string;box:Box;spec:ViewSpec}[]=[{title:`รูปด้านคาน (ELEVATION) · ${[...new Set(g.spans.map(s=>s.mark))].join(', ')} · ${g.spans.length} ช่วง`,box:elevBox,spec:elevSpec},
  ...list.map((c,i)=>({title:`ตัด ${c.letter}-${c.letter} · ${c.mark} (${beamZoneLabels[c.zone]} SPAN)`,box:{x:area.x+i*(secW+2),y:secY,w:secW,h:secH},spec:{axes:[1,2] as [number,number],normal:0,cut:c.x}}))];
 // section marks on the elevation: same mapping as renderView (box inset by the title band)
 const v=buildView(m,rows,input,elevSpec),b={x:elevBox.x,y:elevBox.y+4,w:elevBox.w,h:elevBox.h-4},M=48*k,spanU=v.u[1]-v.u[0],spanV=v.v[1]-v.v[0];
 const sc=Math.min((b.w-2*M)/spanU,(b.h-2*M)/spanV),offU=(b.w-2*M-spanU*sc)/2,offV=(b.h-2*M-spanV*sc)/2;
 const X=(x:number)=>b.x+M+offU+(x-v.u[0])*sc,Y=(z:number)=>b.y+b.h-M-offV-(z-v.v[0])*sc,marks:Prim[]=[];
 // cut lines reach past the EX bar dimension rows above / below the beam
 const rowsOf=(top:boolean)=>Math.max(0,...exDimRows(v.exDims).filter(r=>r.d.top===top).map(r=>r.row+1));
 for(const c of all){const x=X(c.x),y0=Y(lay.H)-3-rowsOf(true)*9*k,y1=Y(0)+3+rowsOf(false)*9*k,on=list.includes(c),color=on?'#c2410c':'#7c8b8f';
  marks.push({t:'line',x1:x,y1:y0,x2:x,y2:y1,stroke:color,width:.25,dash:[2,1,.5,1]},{t:'text',x,y:y0-.8,text:c.letter,size:2.4,color,anchor:'middle',bold:on},{t:'text',x,y:y1+2.6,text:c.letter,size:2.4,color,anchor:'middle',bold:on});}
 // grid bubbles: drawn by renderView at the bottom of the grid lines
 const notesY=secY+secH+3;
 return {views,marks,notes:{x:area.x,y:notesY,w:area.w,h:area.y+area.h-notesY},pages,sectionPage:`${page%pages+1}/${pages}`};
}

// ---------------- splice diagram + bar-run table (beam group with laps) ----------------
const fmtMm=(v:number)=>Math.round(v).toLocaleString('en-US');
const setColor=(r:SpliceReportRow,set:string)=>r.face==='top'?'#0f6e56':r.face==='side'?'#5f5e5a':set==='B'?'#993c1d':'#534ab7';
/** Grid label + distance from that grid line, e.g. "2 +1,375". */
function gridAt(g:BeamInput,grid:number[],x:number){let k=0;while(k+1<grid.length&&grid[k+1]<=x)k++;const d=x-grid[k];return `${g.grids[k]?.label||k+1} ${d<0?'−':'+'}${fmtMm(Math.abs(d))}`;}
/** Splice page: the beam elevation strip with grid lines, then per spliced main run (top / bottom, sets A / B) a row of
 * its pieces (Mark · cut length; overlaps = laps) over the no-lap zones (hatched), then the run table (all spliced runs:
 * bars, extent, Class B lap, pieces by Mark, lap positions as grid + distance, check results). */
function spliceSheet(g:BeamInput,runs:SpliceReportRow[],rows:ViewRow[],area:Box){
 const lay=beamGroupLayout(g),out:Prim[]=[],ink='#22393f',muted='#4b6166',markOf=new Map(rows.map(r=>[r.id,r.mark]));
 const text=(t:string,x:number,y:number,size=2.2,o:{anchor?:'start'|'middle'|'end';bold?:boolean;color?:string}={})=>out.push({t:'text',x,y,text:t,size,color:o.color||ink,anchor:o.anchor,bold:o.bold});
 const frame=g.detailing.beam?.frame==='special';
 text(`ผังการต่อเหล็ก (SPLICE DIAGRAM) · ${[...new Set(g.spans.map(s=>s.mark))].join(', ')} · Class B · เหล็กเส้น ${fmtMm(g.detailing.stockLength)}`,area.x+2,area.y+4,2.8,{bold:true});
 const main=runs.filter(r=>r.face!=='side').sort((a,b)=>Number(b.face==='top')-Number(a.face==='top')),labelW=26,x0=area.x+labelW+2,w=area.w-labelW-6,sc=w/lay.L,X=(x:number)=>x0+x*sc;
 const rowH=11,top=area.y+9,beamY=top+9,beamH=6,diagTop=beamY+beamH+6;
 // grid lines + bubbles, beam outline, columns, span lengths
 const nRows=main.reduce((n,r)=>n+r.sets.length,0),diagBot=diagTop+nRows*rowH;
 lay.grid.forEach((gx,k)=>{const x=X(gx);out.push({t:'line',x1:x,y1:top+3,x2:x,y2:diagBot,stroke:'#9fb2ad',width:.15,dash:[1.5,1]},{t:'circle',cx:x,cy:top+1,r:2,stroke:ink,width:.2,fill:'#ffffff'});text(g.grids[k]?.label||String(k+1),x,top+1.8,2,{anchor:'middle'});});
 out.push({t:'rect',x:X(0),y:beamY,w:lay.L*sc,h:beamH,stroke:ink,width:.25});
 for(const q of lay.columns)out.push({t:'rect',x:X(q.x0),y:beamY-2,w:(q.x1-q.x0)*sc,h:beamH+4,fill:'#d3d1c7',stroke:ink,width:.2});
 lay.spans.forEach((s,k)=>text(fmtMm(lay.grid[k+1]-lay.grid[k]),(X(lay.grid[k])+X(lay.grid[k+1]))/2,beamY+beamH/2+.8,2,{anchor:'middle',color:muted}));
 // no-lap zones: outside the allowed zones (pale = widened fallback zone)
 const gaps=(zs:[number,number][],a:number,b:number)=>{const z=[...zs].sort((p,q)=>p[0]-q[0]),res:[number,number][]=[];let c=a;for(const [lo,hi] of z){if(lo>c)res.push([c,Math.min(lo,b)]);c=Math.max(c,hi);}if(c<b)res.push([c,b]);return res.filter(([p,q])=>q-p>1);};
 let y=diagTop;
 for(const r of main)for(const st of r.sets){
  for(const [a,b] of gaps(r.zones,0,lay.L))out.push({t:'rect',x:X(a),y:y+.5,w:(b-a)*sc,h:rowH-1,fill:'#fbf1dc'});
  for(const [a,b] of gaps([...r.zones,...r.wide],0,lay.L))out.push({t:'rect',x:X(a),y:y+.5,w:(b-a)*sc,h:rowH-1,fill:'#f6e3c3'});
  const layer=r.face==='top'?'บน':'ล่าง',extra=/-x\d+$/.test(r.role)?' (เพิ่ม)':'';
  text(`${layer}${st.set?` ${st.set}`:''}${extra} ${st.count}${r.diameter<=9?'RB':'DB'}${r.diameter}`,area.x+2,y+4,2.2,{bold:true});
  text(`ทาบ ${fmtMm(r.lap)} (${r.lapKind})`,area.x+2,y+7.4,1.9,{color:muted});
  const color=setColor(r,st.set),leg=r.face==='top'?1.6:-1.6;
  st.pieces.forEach((p,j)=>{const yy=y+(j%2?6.8:4.2),xa=X(p.a),xb=X(p.b),mark=markOf.get(`gen-${p.role}`)||'?';
   const pts:[number,number][]=[...(j===0&&r.h0?[[xa,yy+leg] as [number,number]]:[]),[xa,yy],[xb,yy],...(j===st.pieces.length-1&&r.h1?[[xb,yy+leg] as [number,number]]:[])];
   out.push({t:'poly',pts,stroke:color,width:.45,closed:false});
   text(`${mark} · ${fmtMm(p.length)}`,(xa+xb)/2,j%2?yy+2.6:yy-1,1.9,{anchor:'middle',color});});
  y+=rowH;}
 const legY=Math.max(y+3,diagBot+3);
 out.push({t:'rect',x:area.x,y:area.y,w:area.w,h:legY+2-area.y,stroke:'#c8d5d0',width:.2});
 out.push({t:'rect',x:area.x+2,y:legY-2,w:4,h:2.4,fill:'#f6e3c3'},{t:'rect',x:area.x+40,y:legY-2,w:4,h:2.4,fill:'#fbf1dc'});
 text('ห้ามต่อ',area.x+7,legY,1.9,{color:muted});text('โซนขยาย (ผู้ออกแบบยืนยัน)',area.x+45,legY,1.9,{color:muted});
 text(`ต่อ: บน 1/3 กลางช่วง (ขยายได้ครึ่งกลางช่วง) · ล่าง ${frame?'2h ถึง L/4 (SMF)':'ผิวเสาถึง L/4'} (ขยายได้ L/3) · ห้ามต่อในจุดต่อเสา-คาน · สลับ 50% ห่าง ≥ 1 ระยะทาบ · เส้นซ้อนกัน = ระยะทาบ`,area.x+90,legY,1.9,{color:muted});
 // run table
 let ty=legY+4;const tw=area.w,cols=[{t:'แนวเหล็ก',w:.22},{t:'เหล็ก',w:.07},{t:'ระยะทาบ',w:.08},{t:'ท่อน (Mark × จำนวนท่อน)',w:.2},{t:'ต่อที่ (กริด + ระยะถึงกึ่งกลางทาบ)',w:.2},{t:'ผลตรวจ',w:.23}].map(c=>({...c,w:c.w*tw}));
 text('ตารางแนวเหล็ก (BAR RUNS)',area.x+2,ty+3,2.6,{bold:true});ty+=5;
 out.push({t:'rect',x:area.x,y:ty,w:tw,h:4.6,fill:'#203940'});let cx=area.x;for(const c of cols){text(c.t,cx+1,ty+3.2,2,{color:'#ffffff'});cx+=c.w;}ty+=4.6;
 const icon=(s:string)=>s==='warn'?'ตรวจ:':'ไม่ผ่าน:',bottom=area.y+area.h;
 for(const r of runs){
  const marks=r.sets.map(st=>{const ids=st.pieces.map(p=>`gen-${p.role}`),cnt=new Map<string,number>();
   ids.forEach(id=>{const mk=markOf.get(id)||'?';cnt.set(mk,(cnt.get(mk)||0)+1);});return `${st.set?`${st.set}: `:''}${[...cnt].map(([mk,n])=>n>1?`${mk}×${n}`:mk).join(' + ')}`;}).join(' · ');
  const laps=r.sets.map(st=>`${st.set?`${st.set}: `:''}${st.laps.map(l=>gridAt(g,lay.grid,l.x)+(l.status==='ok'?'':l.status==='wide'?' (ขยาย)':' (นอกโซน)')).join(' · ')}`).join(' / ');
  const checks=r.checks.filter(c=>c.state!=='ok').map(c=>`${icon(c.state)} ${c.text}`);
  const cells=[`${r.note} · ${gridAt(g,lay.grid,r.x0)} – ${gridAt(g,lay.grid,r.x1)}`,`${r.count}${r.diameter<=9?'RB':'DB'}${r.diameter}`,`${fmtMm(r.lap)} ${r.lapKind}`,marks,laps,checks.length?checks.join(' · '):'ผ่านทุกข้อ'];
  const lines=cells.map((t,i)=>wrapText(t,1.9,cols[i].w-2,4)),h=Math.max(...lines.map(l=>l.length))*2.3+1.6;
  if(ty+h>bottom-1){text(`… อีก ${runs.length-runs.indexOf(r)} แนว (ดูตาราง “ตรวจการต่อทาบเหล็ก” ในหน้าคาน)`,area.x+1,ty+3,1.9,{color:muted});ty+=4;break;}
  cx=area.x;lines.forEach((ls,i)=>{ls.forEach((l,j)=>text(l,cx+1,ty+2.4+j*2.3,1.9,{color:i===5&&checks.some(c=>c.startsWith('ไม่ผ่าน'))?'#b24e44':i===5&&checks.length?'#926327':ink}));cx+=cols[i].w;});
  ty+=h;out.push({t:'line',x1:area.x,y1:ty,x2:area.x+tw,y2:ty,stroke:'#9fb2ad',width:.15});}
 const notesY=ty+3;
 return {views:[] as {title:string;box:Box;spec:ViewSpec}[],marks:out,notes:{x:area.x,y:notesY,w:area.w,h:Math.max(20,area.y+area.h-notesY)}};
}

// ---------------- column stack: elevation (all storeys) + a plan section per storey ----------------
const stackOf=(input?:ElementInput):ColumnInput|undefined=>input?.category==='Column'&&input.layout==='stack'&&input.stack.storeys.length?input:undefined;
const COLUMN_SECTIONS_PER_PAGE=6;
const bar=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
/** Left-area layout of an A3 sheet for a column stack: tall elevation with level lines and section marks, plan sections
 * of this page's storeys (cut in the middle zone, as the column table) and the notes box. */
function columnStackSheet(m:Member,rows:ViewRow[],input:ElementInput|undefined,area:Box,page:number,k:number){
 const c=stackOf(input);if(!c)return undefined;
 const lay=columnStackLayout(c),pages=Math.ceil(lay.storeys.length/COLUMN_SECTIONS_PER_PAGE),p=page%pages;
 const all=lay.storeys.map((s,i)=>({...s,letter:i<26?String.fromCharCode(65+i):`A${i-25}`,cut:s.z0+s.lower+(s.clear-s.lower-s.upper+s.beamDepth)/2}));
 const list=all.slice(p*COLUMN_SECTIONS_PER_PAGE,(p+1)*COLUMN_SECTIONS_PER_PAGE);
 const elevW=Math.min(80,area.w*.3),elevH=area.h*.68,gx=area.x+elevW+3,gw=area.w-elevW-3,cols=2,rowsN=3,cw=(gw-(cols-1)*2)/cols,ch=(elevH-(rowsN-1)*2)/rowsN;
 const elevBox={x:area.x,y:area.y,w:elevW,h:elevH},elevSpec:ViewSpec={axes:[0,2],normal:1,cut:lay.D/2};
 const main=(s:typeof all[number])=>{const mm=s.main,n=4*mm.corner.count+2*(mm.sideX.count+mm.sideY.count);return `${n}${bar(mm.corner.diameter)}`;};
 const views:{title:string;box:Box;spec:ViewSpec}[]=[{title:`รูปด้านเสา ${m.code} · ${lay.storeys.length} ชั้น`,box:elevBox,spec:elevSpec},
  ...list.map((s,i)=>({title:`ตัด ${s.letter}-${s.letter} · ${s.name} · ${s.width}×${s.depth} · ${main(s)} · ${s.tie.sets||''}${bar(s.tie.diameter)}@${s.tie.s1}(${s.tie.diameter}@${s.tie.s2})`,
   box:{x:gx+(i%cols)*(cw+2),y:area.y+Math.floor(i/cols)*(ch+2),w:cw,h:ch},spec:{axes:[0,1] as [number,number],normal:2,cut:s.cut}}))];
 const v=buildView(m,rows,input,elevSpec),b={x:elevBox.x,y:elevBox.y+4,w:elevBox.w,h:elevBox.h-4},M=48*k,spanU=v.u[1]-v.u[0],spanV=v.v[1]-v.v[0];
 const sc=Math.min((b.w-2*M)/spanU,(b.h-2*M)/spanV),offU=(b.w-2*M-spanU*sc)/2,offV=(b.h-2*M-spanV*sc)/2;
 const X=(x:number)=>b.x+M+offU+(x-v.u[0])*sc,Y=(z:number)=>b.y+b.h-M-offV-(z-v.v[0])*sc,marks:Prim[]=[];
 for(const s of lay.storeys){const y=Y(s.z1);marks.push({t:'line',x1:X(0)-4,y1:y,x2:X(lay.W)+4,y2:y,stroke:'#7c8b8f',width:.2,dash:[2,1]},{t:'text',x:X(lay.W)+4.5,y:y+.8,text:`${s.name||s.k+1} +${(s.z1/1000).toFixed(2)}`,size:2,color:'#4a5a66'});}
 for(const s of all){const y=Y(s.cut),on=list.includes(s),color=on?'#c2410c':'#7c8b8f';
  marks.push({t:'line',x1:X(0)-3,y1:y,x2:X(lay.W)+3,y2:y,stroke:color,width:.25,dash:[2,1,.5,1]},{t:'text',x:X(0)-3.6,y:y+.8,text:s.letter,size:2.4,color,anchor:'end',bold:on});}
 const notesY=area.y+elevH+3;
 return {views,marks,notes:{x:area.x,y:notesY,w:area.w,h:area.y+area.h-notesY},pages,sectionPage:`${p+1}/${pages}`};
}
