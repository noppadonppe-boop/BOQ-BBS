import type {LeaderPrim,PlainPrim,Prim} from './drawingPrims';
import {tagPrims,textWidth} from './drawingPrims';
import type {Member,Project,Vec3} from './model';
import type {SheetViewInfo} from './bbsSheet';
import {barSketch} from './bbsSheet';
import {clipPrims} from './primClip';
import {lapLength,type WallInput} from './elementInput';
import {normaliseShape} from './shapeGeometry';
import {shapeModelSchema} from './shapeModelSchema';
import {axisLength,runAxis,runLevels,wallJoints,wallRunLiftQuantities,wallRunSets,wallRunShapeModel,wallKindNames,type RunSeg,type WallKind,type WallSet} from './wallRun';
import {wallTypeLabels} from './wallRunSchema';

// Wall Run sheet (docs/WALL_RUN.md, artboard 15): drawing page = unfolded elevations (outer / inner face) with one
// representative bar + one distribution line per Mark per face and segment, corner / T / free-end plan details (1:20),
// vertical section (dowels, pour joints with laps + waterstop, top end, own slabs / base), opening detail, standard
// details, key plan, title block; then BBS pages in one of 3 presentations (whole wall / by lift / by face) with
// summaries. Renderer-agnostic prims (sheet mm) + view infos (scale, sheet ↔ model) so PDF / SVG / DXF A–B–C all work.
type P2=[number,number];type V3=Vec3;type Box={x:number;y:number;w:number;h:number};
export type WallBbsMode='wall'|'lift'|'face';
export const wallBbsModes:{id:WallBbsMode;label:string}[]=[{id:'wall',label:'ทั้งผนัง'},{id:'lift',label:'แยกตามชั้น / ช่วงเท'},{id:'face',label:'แยกตามด้าน'}];
export type WallRow={id:string;mark:string;diameter:number;grade:string;shapeCode:string;cutLength:number;count:number;weight:number;eachWeight?:number;paths:V3[][];points?:V3[]};
export type WallSheetPage={prims:Prim[];views:SheetViewInfo[];w:number;h:number;size:string;title:string};
const INK='#203940',MUTED='#5f6b6d',LINE='#9aa6a8',CONC='#5b21b6',JOINT='#7c3aed';
const KIND_COLOR:Record<WallKind,string>={V:'#1d4ed8',H:'#0891b2',C:'#db2777',T:'#c2410c',S:'#15803d',OP:'#9333ea',B:'#475569',K:'#a16207'};
const SCALES=[5,10,20,25,50,75,100,125,150,200,250,300,400,500];
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const fmt=(v:number,d=1)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const text=(x:number,y:number,s:string,size=2.4,o:{bold?:boolean;anchor?:'start'|'middle'|'end';color?:string;halo?:boolean}={}):PlainPrim=>({t:'text',x,y,text:s,size,color:o.color||INK,anchor:o.anchor,bold:o.bold,halo:o.halo});
const rect=(r:Box,o:{fill?:string;stroke?:string;width?:number}={}):PlainPrim=>({t:'rect',...r,stroke:o.stroke??INK,width:o.width??.25,...(o.fill?{fill:o.fill}:{})});
const line=(x1:number,y1:number,x2:number,y2:number,stroke=INK,width=.25,dash?:number[]):PlainPrim=>({t:'line',x1,y1,x2,y2,stroke,width,...(dash?{dash}:{})} as PlainPrim);
/** Sheet size: A2 for walls of several lifts / storeys or long runs, else A3. */
export function wallSheetSize(m:Member):'A3'|'A2'{const i=m.elementInput as WallInput|undefined;if(!i?.run)return 'A3';const lv=runLevels(i.run);return lv.lifts.length>2||lv.zTop-lv.zBase>6000||axisLength(i.run)>14?'A2':'A3';}
const PAPER={A3:{w:420,h:297},A2:{w:594,h:420}};
const pickScale=(mw:number,mh:number,w:number,h:number,min=1)=>SCALES.find(n=>n>=min&&mw/n<=w&&mh/n<=h)||SCALES[SCALES.length-1];
/** Design spacing text of a set (wall meshes / opening counts). */
function setText(i:WallInput,s:WallSet,row:WallRow,face:string){
 const r=i.run!.rebar,mesh=face==='in'&&r.layers===2?r.inner:r.outer;
 if(s.kind==='V'&&/เหล็กตั้ง/.test(s.what))return `${s.mark} ${barName(row.diameter)}@${mesh.vertical.spacing}`;
 if(s.kind==='H')return `${s.mark} ${barName(row.diameter)}@${mesh.horizontal.spacing}`;
 if(s.kind==='C'&&/U-bar|U ปิด/.test(s.what))return `${s.mark} U ${barName(row.diameter)}@${mesh.horizontal.spacing}`;
 return `${s.mark} ${row.count}-${barName(row.diameter)}`;
}
// ---------- model helpers ----------
type Ctx={m:Member;i:WallInput;segs:RunSeg[];offs:number[];shift:V3;lv:ReturnType<typeof runLevels>;sets:Map<string,WallSet>;rows:WallRow[]};
function ctxOf(m:Member,rows:WallRow[]):Ctx|undefined{
 const i=m.elementInput as WallInput|undefined;if(!i?.run||i.layout!=='run')return;
 const ax=runAxis(i.run),segs=[...ax.segs,...ax.branches],offs:number[]=[];let a=0;for(const s of segs){offs.push(a);a+=s.len+800;}
 const {shift}=normaliseShape(shapeModelSchema.parse(wallRunShapeModel(i)));
 return {m,i,segs,offs,shift,lv:runLevels(i.run),sets:new Map(wallRunSets(m).map(s=>[s.id,s])),rows};
}
const unshift=(c:Ctx,p:V3):V3=>[p[0]-c.shift[0],p[1]-c.shift[1],p[2]-c.shift[2]];
/** Segment a plan point belongs to (nearest axis within its reach), u along it and o toward the outer face. */
function locate(c:Ctx,p:V3):{k:number;u:number;o:number}|undefined{let best:{k:number;u:number;o:number;d:number}|undefined;
 c.segs.forEach((s,k)=>{const dx=p[0]-s.a[0],dy=p[1]-s.a[1],u=dx*s.dir[0]+dy*s.dir[1],o=dx*s.out[0]+dy*s.out[1],reach=s.t/2+50,du=u<-reach?-reach-u:u>s.len+reach?u-s.len-reach:0,d=Math.abs(o)>reach?Math.abs(o)-reach+du:du;
  if(!best||d<best.d||(d===best.d&&Math.abs(o)<Math.abs(best.o)))best={k,u,o,d};});return best;}

// ---------- unfolded elevation ----------
type View={info:SheetViewInfo;prims:Prim[]};
type LabelReq={x:number;y:number;text:string;mark:string;color:string;n:number;d:number};
/** Leaders to a label column at the right of the view: elbow leaders in the order of their anchors (no crossings). */
function labelColumn(reqs:LabelReq[],box:Box,colX:number,view:string):Prim[]{
 const out:Prim[]=[],top=box.y+8,bottom=box.y+box.h-2,n=reqs.length;if(!n)return out;
 // fit the column: step 3.2 mm, compressed down to 2.2 mm (smaller text) before anything is clamped
 const step=Math.max(2.2,Math.min(3.2,(bottom-top)/n)),size=Math.min(2.1,step*.68),need=n*step;
 // distinct anchor heights first, then the order (elbow leaders in anchor order never cross)
 const used:number[]=[],list=[...reqs].sort((a,b)=>a.y-b.y||a.x-b.x).map(r=>{let y=r.y;while(used.some(u=>Math.abs(u-y)<.6))y+=.6;used.push(y);return {...r,y};}).sort((a,b)=>a.y-b.y||a.x-b.x);
 let y0=Math.max(top,Math.min(list[0].y-step,bottom-need));if(y0+need>bottom)y0=top;
 list.forEach((r,k)=>{const ty=y0+k*step+step*.75,xe=colX-4,draw:PlainPrim[]=[{t:'circle',cx:r.x,cy:r.y,r:.45,fill:r.color,stroke:r.color,width:.1},{t:'poly',pts:[[r.x,r.y],[xe,r.y],[colX-.8,ty-size*.35]],closed:false,stroke:r.color,width:.15},text(colX,ty,r.text,size,{color:r.color})];
  out.push({t:'leader',pts:[[r.x,r.y],[xe,r.y],[colX-.8,ty-size*.35]],text:[r.text],at:[colX,ty],anchor:'start',mark:{mark:r.mark,n:r.n,size:barName(r.d)},arrow:'dot',color:r.color,size,draw,view,layer:'mark',key:`mark:${r.mark}`} as LeaderPrim);});
 return out;
}
/** Elevation of one face (unfolded: segments side by side), model window U0..U1 × Z0..Z1 into box at 1:n. */
function elevation(c:Ctx,face:'out'|'in',box:Box,id:string,title:string,o:{n?:number;win?:{u0:number;u1:number;z0:number;z1:number};only?:WallKind[];labels?:boolean}={}):View{
 const lv=c.lv,run=c.i.run!,labels=o.labels!==false,labW=labels?44:0;
 const zLo=Math.min(lv.zBase,lv.bottom?.[0]??lv.zBase,lv.pit?.[0]??lv.zBase,lv.base?.[0]??lv.zBase,lv.key?.[0]??lv.zBase),zHi=Math.max(lv.zTop,lv.cover?.[1]??lv.zTop);
 const W=o.win||{u0:-300,u1:c.offs[c.offs.length-1]+c.segs[c.segs.length-1].len+300,z0:zLo-300,z1:zHi+300};
 const n=o.n||pickScale(W.u1-W.u0,W.z1-W.z0,box.w-labW-4,box.h-12),ox=box.x+2,oy=box.y+8,X=(u:number)=>ox+(u-W.u0)/n,Y=(z:number)=>oy+(W.z1-z)/n;
 const out:Prim[]=[text(box.x,box.y+4,`${title} · 1:${n}`,2.8,{bold:true})];
 // concrete outline per segment, slabs, pour joints, levels
 c.segs.forEach((s,k)=>{const u0=c.offs[k],u1=u0+s.len;
  out.push({...rect({x:X(u0),y:Y(lv.zTop),w:s.len/n,h:(lv.zTop-lv.zBase)/n},{stroke:CONC,width:.35}),layer:'concrete'} as Prim);
  for(const b of [lv.bottom,lv.cover,lv.pit,lv.base])if(b)out.push({...rect({x:X(u0),y:Y(b[1]),w:s.len/n,h:(b[1]-b[0])/n},{stroke:CONC,width:.25,fill:'#f1f5f9'}),layer:'concrete'} as Prim);
  if(lv.key)out.push({...rect({x:X(u0),y:Y(lv.key[1]),w:s.len/n,h:(lv.key[1]-lv.key[0])/n},{stroke:CONC,width:.2,fill:'#f1f5f9'}),layer:'concreteHidden'} as Prim);
  for(const l of lv.lifts.slice(1))out.push({...line(X(u0),Y(l.z0),X(u1),Y(l.z0),JOINT,l.k===0?.3:.2,l.k===0?undefined:[1.6,.8]),layer:'symbol'} as Prim);
  out.push(text(X((u0+u1)/2),Y(Math.min(W.z1,zHi+250))-1,`${s.id} · ${s.len}`,2.4,{bold:true,anchor:'middle',color:CONC}));});
 for(const l of lv.lifts){if(l.k!==0&&l.level>=0)continue;const name=l.level<0?'PIT':run.levels.slice().sort((a,b)=>a.bottom-b.bottom)[l.level]?.name||'';
  out.push(text(X(W.u0)+1,Y(l.z0)-.6,`${name} ${l.z0>=0?'+':''}${(l.z0/1000).toFixed(3)}`,1.9,{color:MUTED}));}
 out.push(text(X(W.u0)+1,Y(lv.zTop)-.6,`T.O.W. ${(lv.zTop/1000).toFixed(3)}`,1.9,{color:MUTED}));
 // openings
 for(const op of run.openings){const k=c.segs.findIndex(s=>s.id===op.segment);if(k<0)continue;if(op.face!=='through'&&op.face!==face)continue;
  for(const L of [op.level||run.levels.slice().sort((a,b)=>a.bottom-b.bottom)[0].id,...(op.repeat?.levels||[])]){const ls=lv.lifts.filter(l=>l.level>=0&&run.levels.slice().sort((a,b)=>a.bottom-b.bottom)[l.level].id===L);if(!ls.length)continue;
   const z0=ls[0].z0+op.z,u0=c.offs[k]+op.x;out.push({...rect({x:X(u0),y:Y(z0+op.h),w:op.w/n,h:op.h/n},{stroke:CONC,width:.3,fill:'#ffffff'}),layer:'concrete'} as Prim,
    {...line(X(u0),Y(z0),X(u0+op.w),Y(z0+op.h),LINE,.15),layer:'concreteHidden'} as Prim,{...line(X(u0),Y(z0+op.h),X(u0+op.w),Y(z0),LINE,.15),layer:'concreteHidden'} as Prim,
    text(X(u0+op.w/2),Y(z0+op.h/2)+.8,`${op.label||op.id} ${op.w}×${op.h}`,1.8,{anchor:'middle',color:MUTED,halo:true}));}}
 // bars: representative per Mark per segment + distribution line, label once per Mark
 const reqs:LabelReq[]=[];
 for(const row of c.rows){const s=c.sets.get(row.id);if(!s)continue;if(s.kind==='B'||s.kind==='K')continue;if(o.only&&!o.only.includes(s.kind))continue;
  const color=KIND_COLOR[s.kind],bySeg=new Map<number,{path:V3[];a:{u:number;z:number}}[]>();
  for(const p0 of row.paths){const p=p0.map(q=>unshift(c,q));const at=locate(c,p[0]);if(!at)continue;
   const twoFace=s.faces.size>0||s.faceCount.has('');const onFace=c.i.run!.rebar.layers===1?face==='out':(at.o>0?'out':'in')===face;
   if(!onFace&&!(s.faceCount.has('')&&!s.faces.size))continue;void twoFace;
   const list=bySeg.get(at.k)||[];list.push({path:p,a:{u:c.offs[at.k]+at.u,z:p[0][2]}});bySeg.set(at.k,list);}
  let labelled=false;
  for(const [k,list] of [...bySeg].sort((a,b)=>a[0]-b[0])){
   const rep=list[Math.floor(list.length/2)],pts:P2[]=[];
   for(let j=1;j<rep.path.length;j++){const a=rep.path[j-1],b=rep.path[j],mid:V3=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],L=locate(c,mid);if(!L)continue;const s2=c.segs[L.k];
    const ua=c.offs[L.k]+(a[0]-s2.a[0])*s2.dir[0]+(a[1]-s2.a[1])*s2.dir[1],ub=c.offs[L.k]+(b[0]-s2.a[0])*s2.dir[0]+(b[1]-s2.a[1])*s2.dir[1];
    if(Math.abs(ua-ub)<1&&Math.abs(a[2]-b[2])<1)continue;
    if(!pts.length)pts.push([X(ua),Y(a[2])]);pts.push([X(ub),Y(b[2])]);}
   if(pts.length<2)continue;
   out.push({t:'poly',pts,closed:false,stroke:color,width:.45,layer:s.kind==='C'||s.kind==='T'?'barLink':'barMain',view:id,group:row.id} as Prim);
   // distribution line across the instances of this segment
   if(list.length>1){const us=list.map(x=>x.a.u),zs=list.map(x=>x.a.z),du=Math.max(...us)-Math.min(...us),dz=Math.max(...zs)-Math.min(...zs);
    if(du>=dz){const yy=(pts[0][1]+pts[pts.length-1][1])/2+.9;out.push(line(X(Math.min(...us)),yy,X(Math.max(...us)),yy,color,.18),{t:'circle',cx:X(Math.min(...us)),cy:yy,r:.35,stroke:color,width:.15} as Prim,{t:'circle',cx:X(Math.max(...us)),cy:yy,r:.35,stroke:color,width:.15} as Prim);}
    else{const xx=(pts[0][0]+pts[pts.length-1][0])/2+.9;out.push(line(xx,Y(Math.max(...zs)),xx,Y(Math.min(...zs)),color,.18),{t:'circle',cx:xx,cy:Y(Math.max(...zs)),r:.35,stroke:color,width:.15} as Prim,{t:'circle',cx:xx,cy:Y(Math.min(...zs)),r:.35,stroke:color,width:.15} as Prim);}}
   if(labels&&!labelled){const seg=pts.reduce((b,p,j)=>j&&Math.hypot(p[0]-pts[j-1][0],p[1]-pts[j-1][1])>b.l?{l:Math.hypot(p[0]-pts[j-1][0],p[1]-pts[j-1][1]),j}:b,{l:0,j:1});
    const f=.3+.4*((reqs.length*.37)%1),ax=pts[seg.j-1][0]+(pts[seg.j][0]-pts[seg.j-1][0])*f,ay=pts[seg.j-1][1]+(pts[seg.j][1]-pts[seg.j-1][1])*f;
    reqs.push({x:ax,y:ay,text:`${setText(c.i,s,row,face)}${bySeg.size>1?' TYP.':''}`,mark:s.mark,color,n:row.count,d:row.diameter});labelled=true;}
   void k;}}
 out.push(...labelColumn(reqs,box,box.x+box.w-labW+1,id));
 const info:SheetViewInfo={id,title,box,n,s:1/n,fits:true,axes:[0,2],origin:{sheet:[ox,oy],model:[W.u0,W.z1]}};
 const clip={kind:'rect' as const,x0:box.x,y0:box.y,x1:box.x+box.w,y1:box.y+box.h};
 return {info,prims:tagPrims(clipPrims(out,clip),{view:id})};
}
// ---------- plan detail (corner / T / free end) ----------
function planDetail(c:Ctx,box:Box,id:string,title:string,center:P2,r:number):View{
 const run=c.i.run!,sm=wallRunShapeModel(c.i),first=c.lv.lifts[0],n=pickScale(2*r,2*r,box.w-4,box.h-12,20),cx=box.x+box.w/2,cy=box.y+8+(box.h-10)/2,X=(x:number)=>cx+(x-center[0])/n,Y=(y:number)=>cy-(y-center[1])/n;
 const out:Prim[]=[text(box.x,box.y+4,`${title} · 1:${n}`,2.6,{bold:true})];
 for(const p of sm.parts)if(p.role==='solid'&&p.shape==='polygon'&&p.z0<=first.z0+1&&p.z0+p.height>=first.z0+1&&/^w/.test(p.id))out.push({t:'poly',pts:p.points.map(q=>[X(q[0]),Y(q[1])] as P2),closed:true,stroke:CONC,width:.35,fill:'#f5f3ff',layer:'concrete'} as Prim);
 // horizontal layer: the lowest bar level of the first lift (+ U bars one bar above), verticals as dots
 const zs=c.rows.flatMap(row=>{const s=c.sets.get(row.id);return s&&(s.kind==='H')?row.paths.map(p=>unshift(c,p[0])[2]):[];});const z0=zs.length?Math.min(...zs):first.z0+100;
 const reqs:LabelReq[]=[];
 for(const row of c.rows){const s=c.sets.get(row.id);if(!s||s.kind==='B'||s.kind==='K'||s.kind==='OP')continue;const color=KIND_COLOR[s.kind];let labelled=false;
  for(const p0 of row.paths){const p=p0.map(q=>unshift(c,q)),flat=p.every(q=>Math.abs(q[2]-p[0][2])<1);
   if(flat&&Math.abs(p[0][2]-z0)<=row.diameter*2+1){const pts=p.map(q=>[X(q[0]),Y(q[1])] as P2);if(!pts.some(q=>Math.abs(q[0]-cx)<box.w/2&&Math.abs(q[1]-cy)<box.h/2))continue;
    out.push({t:'poly',pts,closed:s.kind==='C'&&p.length>5,stroke:color,width:.5,layer:'barMain'} as Prim);
    if(!labelled){const q=pts.find(q=>Math.abs(q[0]-cx)<box.w/2-6&&Math.abs(q[1]-cy)<box.h/2-6)||pts[0];reqs.push({x:q[0],y:q[1],text:`${s.mark} ${barName(row.diameter)}`,mark:s.mark,color,n:row.count,d:row.diameter});labelled=true;}}
   else if(!flat&&p.some(q=>q[2]<=z0&&q[2]>=z0-2000)&&Math.hypot(p[0][0]-center[0],p[0][1]-center[1])<r*1.4){const q=p[0];out.push({t:'circle',cx:X(q[0]),cy:Y(q[1]),r:Math.max(.35,row.diameter/2/n),fill:color,stroke:color,width:.1,layer:'barMain'} as Prim);}}}
 void run;
 out.push(...labelColumn(reqs,{...box,h:box.h},box.x+box.w-30,id));
 const info:SheetViewInfo={id,title,box,n,s:1/n,fits:true,axes:[0,1],origin:{sheet:[cx,cy],model:[center[0],center[1]]}};
 return {info,prims:tagPrims(clipPrims(out,{kind:'rect',x0:box.x,y0:box.y,x1:box.x+box.w,y1:box.y+box.h}),{view:id})};
}
// ---------- vertical section through the first segment ----------
function section(c:Ctx,box:Box,id:string):View{
 const run=c.i.run!,s=c.segs[0],lv=c.lv,first=lv.lifts[0],t=s.t,uc=Math.round(s.len/2),det=c.i.detailing;
 const zLo=Math.min(lv.zBase,lv.bottom?.[0]??lv.zBase,lv.pit?.[0]??lv.zBase,lv.key?.[0]??lv.base?.[0]??lv.zBase)-(run.base.kind==='dowel-footing'||run.base.kind==='dowel-slab'?900:300),zHi=Math.max(lv.zTop,lv.cover?.[1]??lv.zTop)+(run.top.kind==='continue'||run.top.kind==='bend-into-slab'?600:300);
 const rt=run.retaining,oL=rt?-(t/2+(rt.soilSide==='out'?rt.toe:rt.heel))-300:-t/2-1200,oR=rt?t/2+(rt.soilSide==='out'?rt.heel:rt.toe)+300:t/2+1200;
 const labW=46,n=pickScale(oR-oL,zHi-zLo,box.w-labW-4,box.h-12,10),ox=box.x+2,oy=box.y+8,X=(o:number)=>ox+(oR-o)/n,Y=(z:number)=>oy+(zHi-z)/n;
 const out:Prim[]=[text(box.x,box.y+4,`รูปตัด A–A ผ่าน ${s.id} (u = ${uc}) · 1:${n}`,2.6,{bold:true})];
 const conc=(o0:number,o1:number,z0:number,z1:number,fill='#f5f3ff',ref=false)=>out.push({t:'rect',x:X(Math.max(o0,o1)),y:Y(z1),w:Math.abs(o1-o0)/n,h:(z1-z0)/n,stroke:CONC,width:ref?.18:.35,fill,...(ref?{dash:[1.2,.8]}:{}),layer:ref?'concreteHidden':'concrete'} as Prim);
 for(const l of lv.lifts){const tl=l.t&&l.t>0?l.t:t;conc(-tl/2,tl/2,l.z0,l.z1);}
 if(lv.bottom&&run.tank)conc(-(t/2+run.tank.bottom.projection),oL+300,lv.bottom[0],lv.bottom[1],'#eef2f6');
 if(lv.cover&&run.tank?.cover)conc(t/2,oL+300,lv.cover[0],lv.cover[1],'#eef2f6');
 if(lv.pit&&run.liftPit)conc(t/2,oL+300,lv.pit[0],lv.pit[1],'#eef2f6');
 if(lv.base&&rt){const sg=rt.soilSide==='out'?1:-1;conc(-sg*(t/2+rt.toe),sg*(t/2+rt.heel),lv.base[0],lv.base[1],'#eef2f6');if(lv.key)conc(-rt.key!.width/2,rt.key!.width/2,lv.key[0],lv.key[1],'#eef2f6');}
 if(!run.tank&&!rt&&!(run.wallType==='lift'&&run.liftPit)&&run.base.kind==='dowel-footing')conc(-t/2-500,t/2+500,zLo+50,lv.zBase,'#ffffff',true);
 if(!run.tank&&!rt&&!(run.wallType==='lift'&&run.liftPit)&&run.base.kind==='dowel-slab')conc(-t/2-900,t/2+900,lv.zBase-200,lv.zBase,'#ffffff',true);
 if(!(run.tank?.cover)&&run.top.kind==='bend-into-slab')conc(-t/2-900,t/2+900,lv.zTop,lv.zTop+(run.top.slab||200),'#ffffff',true);
 // pour joints: C.J. + waterstop + kicker
 const joints=[...(wallJoints(run).base?[lv.zBase]:[]),...lv.lifts.slice(1).map(l=>l.z0),...(lv.cover?[lv.cover[0]]:[])];
 for(const z of joints){out.push({...line(X(t/2+150),Y(z),X(-t/2-150),Y(z),JOINT,.25,[1.4,.7]),layer:'symbol'} as Prim);
  if(run.waterstop?.joints)out.push({t:'rect',x:X(15)-0,y:Y(z+100),w:30/n,h:200/n,stroke:'#0f766e',width:.2,fill:'#99f6e4',layer:'symbol'} as Prim);}
 out.push(text(X(-t/2-160),Y(lv.zBase)+2.6,`C.J.${run.waterstop?.joints?` + WATERSTOP ${run.waterstop.material}`:''}${run.base.kicker?` · KICKER ${run.base.kicker}`:''}`,1.8,{color:JOINT}));
 // bars: lines of the nearest instance in the cut plane, dots where bars cross it
 const reqs:LabelReq[]=[];
 for(const row of c.rows){const st=c.sets.get(row.id);if(!st)continue;const color=KIND_COLOR[st.kind];let best:{p:V3[];d:number}|undefined;const dots:P2[]=[];
  for(const p0 of row.paths){const p=p0.map(q=>unshift(c,q)),loc=p.map(q=>{const dx=q[0]-s.a[0],dy=q[1]-s.a[1];return {u:dx*s.dir[0]+dy*s.dir[1],o:dx*s.out[0]+dy*s.out[1],z:q[2]};});
   if(loc.some(q=>Math.abs(q.o)>Math.max(oR,-oL)+200))continue;
   const us=loc.map(q=>q.u);if(Math.max(...us)-Math.min(...us)<5){const d=Math.abs(us[0]-uc);if(d<400&&(!best||d<best.d))best={p,d};continue;}
   for(let j=1;j<loc.length;j++){const a=loc[j-1],b=loc[j];if((a.u-uc)*(b.u-uc)<0){const f=(uc-a.u)/(b.u-a.u);dots.push([X(a.o+(b.o-a.o)*f),Y(a.z+(b.z-a.z)*f)]);}}}
  if(best){const pts=best.p.map(q=>{const dx=q[0]-s.a[0],dy=q[1]-s.a[1];return [X(dx*s.out[0]+dy*s.out[1]),Y(q[2])] as P2;});out.push({t:'poly',pts,closed:false,stroke:color,width:.45,layer:'barMain'} as Prim);
   const mid=pts[Math.floor(pts.length/2)],prev=pts[Math.max(0,Math.floor(pts.length/2)-1)];reqs.push({x:(mid[0]+prev[0])/2,y:(mid[1]+prev[1])/2,text:`${st.mark} ${barName(row.diameter)}`,mark:st.mark,color,n:row.count,d:row.diameter});}
  for(const d of dots)out.push({t:'circle',cx:d[0],cy:d[1],r:Math.max(.3,row.diameter/2/n),fill:color,stroke:color,width:.1,layer:'barMain'} as Prim);
  if(!best&&dots.length&&(st.kind==='H'||st.kind==='B'||st.kind==='K')&&reqs.length<40){const d=dots[Math.floor(dots.length/2)];reqs.push({x:d[0],y:d[1],text:`${st.mark} ${barName(row.diameter)}`,mark:st.mark,color,n:row.count,d:row.diameter});}}
 out.push(...labelColumn(reqs,box,box.x+box.w-labW+1,id));
 out.push(text(box.x+1,box.y+box.h-1.5,`ทาบ (Lap) ${barName(run.rebar.outer.vertical.diameter)} = ${Math.round(lapLength(det,run.rebar.outer.vertical.diameter))} mm · ทาบทุกช่วงเท${run.rebar.stagger?' (เหลื่อม 50%)':''}`,1.9,{color:MUTED}));
 const info:SheetViewInfo={id,title:'รูปตัด A–A',box,n,s:1/n,fits:true,axes:[1,2],origin:{sheet:[ox,oy],model:[oR,zHi]}};
 return {info,prims:tagPrims(clipPrims(out,{kind:'rect',x0:box.x,y0:box.y,x1:box.x+box.w,y1:box.y+box.h}),{view:id})};
}
// ---------- paper: standard details, key plan, title block ----------
function standardDetails(c:Ctx,box:Box):Prim[]{
 const r=c.i.run!.rebar,cells=[
  ['มุม L',r.layers===1||r.corner==='lap-l'?'งอ L รอบมุม · ทาบนอกมุม':r.corner==='hook90'?'ขอ 90° เข้าผนังตั้งฉาก':'U-bar ทับมุม 2 ผิว · ขาทาบ Lap'],
  ['จุดต่อ T',r.tee==='ubar'?'U-bar คร่อม เข้าผนังหลัก':'ผนังรองงอ L ยึด Ldh'],
  ['ปลายอิสระ',r.freeEnd==='boundary'?`Boundary ${r.boundary?.length||0} mm · ปลอก ${barName(r.boundary?.ties.diameter||9)}@${r.boundary?.ties.spacing||0}`:r.freeEnd==='ucap-edge'?`U ปิดปลาย + EDGE ${r.edgeBar?.count||0}-${barName(r.edgeBar?.diameter||12)}`:'ปลายตรงที่ cover'],
  ['ล่าง / บน',`${c.i.run!.wallType==='tank'?'L จากพื้นบ่อ':c.i.run!.wallType==='retaining'?'L ยึดในฐาน':({'dowel-footing':'เดือยจากฐานราก','dowel-slab':'เดือยจากพื้น',continue:'ต่อจากผนังล่าง',none:'—'} as Record<string,string>)[c.i.run!.base.kind]} · ${c.i.run!.tank?.cover?'L เข้าฝาบ่อ':({'bend-into-slab':'งอ 90° เข้าพื้น','u-cap':'U ปิดบน',straight:'ตรง',continue:'ต่อขึ้น'} as Record<string,string>)[c.i.run!.top.kind]}`]] as const;
 const out:Prim[]=[text(box.x,box.y+4,'รายละเอียดมาตรฐาน (NTS)',2.6,{bold:true})],w=(box.w-6)/4,h=box.h-8;
 cells.forEach(([t,d],k)=>{const b={x:box.x+k*(w+2),y:box.y+7,w,h:h-1},mx=b.x+b.w/2,my=b.y+b.h*.42,s=Math.min(b.w,b.h)*.28;out.push(rect(b,{stroke:LINE,width:.2,fill:'#f8fafc'}));
  if(k===0)out.push({t:'poly',pts:[[mx-s,my+s],[mx-s,my-s],[mx+s,my-s]],closed:false,stroke:CONC,width:.8} as Prim,{t:'poly',pts:[[mx-s+3,my+s],[mx-s+3,my-s+3],[mx+s,my-s+3]],closed:false,stroke:CONC,width:.8} as Prim,{t:'poly',pts:[[mx-s+6,my-s+1.5],[mx-s+1.5,my-s+1.5],[mx-s+1.5,my-s+6]],closed:false,stroke:KIND_COLOR.C,width:.5} as Prim);
  if(k===1)out.push(line(mx-s,my-s,mx+s,my-s,CONC,.8),line(mx,my-s,mx,my+s,CONC,.8),{t:'poly',pts:[[mx-1,my+2],[mx-1,my-s+1],[mx-3,my-s+1]],closed:false,stroke:KIND_COLOR.T,width:.5} as Prim);
  if(k===2)out.push(rect({x:mx-s,y:my-2,w:2*s,h:4},{stroke:CONC,width:.6}),{t:'poly',pts:[[mx,my-1],[mx+s-1,my-1],[mx+s-1,my+1],[mx,my+1]],closed:false,stroke:KIND_COLOR.C,width:.5} as Prim);
  if(k===3)out.push(rect({x:mx-1.5,y:my-s,w:3,h:2*s},{stroke:CONC,width:.6}),line(mx-s,my+s,mx+s,my+s,CONC,.6),{t:'poly',pts:[[mx-3,my+s-1],[mx-.5,my+s-1],[mx-.5,my-1]],closed:false,stroke:KIND_COLOR.S,width:.5} as Prim);
  out.push(text(b.x+1.5,b.y+b.h-6,t,2.1,{bold:true}),text(b.x+1.5,b.y+b.h-2.5,d.slice(0,Math.floor(b.w/1.15)),1.6,{color:MUTED}));});
 return out;
}
function keyPlan(c:Ctx,box:Box):Prim[]{
 const sm=wallRunShapeModel(c.i),polys=sm.parts.filter(p=>p.shape==='polygon'&&p.role==='solid'&&/^(w|base-|tank-bottom|pit-slab)/.test(p.id)).map(p=>(p as {points:P2[]}).points),all=polys.flat();
 const out:Prim[]=[text(box.x,box.y+4,'Key plan',2.6,{bold:true}),rect({x:box.x,y:box.y+6,w:box.w,h:box.h-6},{stroke:LINE,width:.2,fill:'#f8fafc'})];if(!all.length)return out;
 const x0=Math.min(...all.map(p=>p[0])),x1=Math.max(...all.map(p=>p[0])),y0=Math.min(...all.map(p=>p[1])),y1=Math.max(...all.map(p=>p[1])),sc=Math.min((box.w-8)/(x1-x0||1),(box.h-14)/(y1-y0||1));
 const X=(x:number)=>box.x+4+(x-x0)*sc+((box.w-8)-(x1-x0)*sc)/2,Y=(y:number)=>box.y+10+(y1-y)*sc;
 polys.forEach(p=>out.push({t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])] as P2),closed:true,stroke:CONC,width:.2,fill:'#ede9fe'} as Prim));
 const s=c.segs[0],m:P2=[s.a[0]+s.dir[0]*s.len/2,s.a[1]+s.dir[1]*s.len/2],a:P2=[m[0]+s.out[0]*(s.t+400),m[1]+s.out[1]*(s.t+400)],b:P2=[m[0]-s.out[0]*(s.t+400),m[1]-s.out[1]*(s.t+400)];
 out.push(line(X(a[0]),Y(a[1]),X(b[0]),Y(b[1]),'#b91c1c',.3,[1,.6]),text(X(a[0]),Y(a[1])-.8,'A',2,{bold:true,color:'#b91c1c',anchor:'middle'}));
 c.segs.forEach(sg=>out.push(text(X((sg.a[0]+sg.b[0])/2+sg.out[0]*(sg.t+500)),Y((sg.a[1]+sg.b[1])/2+sg.out[1]*(sg.t+500))+.7,sg.id,1.9,{anchor:'middle',color:CONC,bold:true})));
 return out;
}
function titleBlock(out:Prim[],tb:Box,m:Member,project:Project,o:{status:string;date:string;revision:string},page:number,pages:number,title:string){
 const lab=(x:number,y:number,l:string,v:string,size=2.4)=>out.push(text(x+1.5,y+3,l,1.7,{color:MUTED}),text(x+1.5,y+8,v.slice(0,58),size,{bold:true}));
 out.push(rect(tb,{width:.4}),line(tb.x,tb.y+10,tb.x+tb.w,tb.y+10),line(tb.x,tb.y+20,tb.x+tb.w,tb.y+20),line(tb.x,tb.y+30,tb.x+tb.w,tb.y+30),line(tb.x+tb.w/2,tb.y+20,tb.x+tb.w/2,tb.y+40));
 lab(tb.x,tb.y,'PROJECT',`${project.code} · ${project.name}`);lab(tb.x,tb.y+10,'TITLE',title);
 lab(tb.x,tb.y+20,'DWG. NO.',`${project.code}-W-${m.code}`);lab(tb.x+tb.w/2,tb.y+20,'MEMBER',m.code);
 lab(tb.x,tb.y+30,'DATE',o.date,2.2);lab(tb.x+tb.w/2,tb.y+30,'REV · SHEET',`${o.revision} · ${page+1}/${pages}`,2.2);
 out.push(text(tb.x,tb.y-2,o.status,2.4,{bold:true,color:'#a3402d'}));
}
// ---------- BBS ----------
export type WallBbsItem={head:string;sub?:string}|{row:WallRow;count:number;weight:number};
/** BBS items of a presentation: whole wall (rows), by lift (header per pour band, counts of that band) or by face. Every
 * presentation adds up to the member's steel. */
export function wallBbsItems(m:Member,rows:WallRow[],mode:WallBbsMode,qty=1):WallBbsItem[]{
 const sets=new Map(wallRunSets(m).map(s=>[s.id,s])),each=(r:WallRow)=>r.eachWeight??(r.count?r.weight/r.count:0);
 if(mode==='wall')return rows.map(r=>({row:r,count:r.count*qty,weight:r.weight*qty}));
 const groups=new Map<string,{name:string;items:{row:WallRow;count:number}[]}>();
 const i=m.elementInput as WallInput,lv=i?.run?runLevels(i.run):undefined,bandName=new Map((lv?.bands||[]).map(b=>[b.id,b.name]));
 const order=mode==='lift'?(lv?.bands||[]).map(b=>b.id):['out','in','mid',''];
 const faceTitle:Record<string,string>={out:'ผิวนอก',in:'ผิวใน',mid:'กึ่งกลาง (ชั้นเดียว)','':'เหล็กข้ามผิว / พื้น / ฐาน'};
 for(const r of rows){const s=sets.get(r.id),parts=s?(mode==='lift'?s.lifts:s.faceCount):new Map([['',r.count]]);
  for(const [k,n] of parts){const g=groups.get(k)||{name:mode==='lift'?bandName.get(k)||k:faceTitle[k]||k,items:[]};g.items.push({row:r,count:n});groups.set(k,g);}}
 const out:WallBbsItem[]=[];
 for(const k of [...order,...[...groups.keys()].filter(x=>!order.includes(x))]){const g=groups.get(k);if(!g)continue;const kg=g.items.reduce((n,x)=>n+each(x.row)*x.count*qty,0);
  out.push({head:g.name,sub:`${fmt(kg,1)} kg`});for(const x of g.items)out.push({row:x.row,count:x.count*qty,weight:each(x.row)*x.count*qty});}
 return out;
}
/** Steel per group × bar size (kg): lifts / faces / whole wall. */
export function wallBbsSummary(m:Member,rows:WallRow[],mode:WallBbsMode,qty=1){
 const items=wallBbsItems(m,rows,mode,qty),sizes=[...new Set(rows.map(r=>r.diameter))].sort((a,b)=>a-b),groups:{name:string;kg:Map<number,number>;total:number}[]=[];
 let cur:{name:string;kg:Map<number,number>;total:number}|undefined=mode==='wall'?{name:'ทั้งผนัง',kg:new Map(),total:0}:undefined;if(cur)groups.push(cur);
 for(const it of items){if('head' in it){cur={name:it.head,kg:new Map(),total:0};groups.push(cur);continue;}cur!.kg.set(it.row.diameter,(cur!.kg.get(it.row.diameter)||0)+it.weight);cur!.total+=it.weight;}
 return {sizes,groups,total:groups.reduce((n,g)=>n+g.total,0)};
}
// ---------- pages ----------
const BBS_ROW=7.2;
/** All pages of the Wall Run sheet set. `rows` = schedule rows of the member (takeoff), `qty` = occurrences. */
export function wallRunSheets(m:Member,rows:WallRow[],project:Project,o:{mode:WallBbsMode;qty?:number;status:string;date:string;revision:string}):WallSheetPage[]{
 const c=ctxOf(m,rows);if(!c)return [];
 const size=wallSheetSize(m),P=PAPER[size],A={x:15,y:15,w:P.w-30,h:P.h-30},run=c.i.run!,qty=o.qty||1,title=`แบบเหล็กเสริม${wallTypeLabels[run.wallType]} ${m.code}`;
 const pages:WallSheetPage[]=[];
 // ---- drawing page
 {const out:Prim[]=[rect({x:10,y:10,w:P.w-20,h:P.h-20},{width:.5})],views:SheetViewInfo[]=[];
  const leftW=A.w*.6,rightX=A.x+leftW+6,rightW=A.w-leftW-6,stripH=size==='A2'?62:48,elevH=(A.h-stripH-6)/2;
  const add=(v:View)=>{out.push(...v.prims);views.push(v.info);};
  const two=run.rebar.layers===2;
  add(elevation(c,'out',{x:A.x,y:A.y,w:leftW,h:elevH},'elev-out',two?'ELEVATION คลี่ · ผิวนอก':'ELEVATION คลี่ · เหล็กกึ่งกลาง'));
  if(two)add(elevation(c,'in',{x:A.x,y:A.y+elevH+3,w:leftW,h:elevH},'elev-in','ELEVATION คลี่ · ผิวใน'));
  out.push(...standardDetails(c,{x:A.x,y:A.y+2*elevH+6,w:leftW*.72,h:stripH}),...keyPlan(c,{x:A.x+leftW*.74,y:A.y+2*elevH+6,w:leftW*.26,h:stripH}));
  // right column: plan details, section, opening detail, title block
  const ax=runAxis(run),dets:{title:string;center:P2;r:number}[]=[],lapH=lapLength(c.i.detailing,run.rebar.outer.horizontal.diameter);
  const j=ax.segs.find((s,k)=>k<ax.segs.length-1||ax.closed);if(j&&(ax.segs.length>1))dets.push({title:`รายละเอียดมุม ${j.id}–${(ax.segs[j.k+1]||ax.segs[0]).id}`,center:j.b,r:Math.max(900,lapH+j.t)});
  const br=ax.branches[0];if(br)dets.push({title:`จุดต่อ T ${br.id}`,center:br.a,r:Math.max(900,lapH+br.t)});
  if(!ax.closed){const s=ax.segs[0];dets.push({title:`ปลายผนัง ${s.id} (${run.rebar.freeEnd==='boundary'?'Boundary':run.rebar.freeEnd==='ucap-edge'?'U + EDGE':'ปลายตรง'})`,center:s.a,r:Math.max(800,(run.rebar.boundary?.length||0)+400)});}
  const dw=(rightW-(dets.length-1)*3)/Math.max(1,dets.length),dh=size==='A2'?82:62;
  dets.slice(0,3).forEach((d,k)=>add(planDetail(c,{x:rightX+k*(dw+3),y:A.y,w:dw,h:dh},`det-${k}`,d.title,d.center,d.r)));
  const tbH=40,secY=A.y+(dets.length?dh+4:0),secH=A.h-(secY-A.y)-tbH-6;
  const op=run.openings[0];
  const secW=op?rightW*.55:rightW;add(section(c,{x:rightX,y:secY,w:secW,h:secH},'sec-a'));
  if(op){const k=c.segs.findIndex(s=>s.id===op.segment),L=op.level||run.levels.slice().sort((a,b)=>a.bottom-b.bottom)[0].id,ls=c.lv.lifts.filter(l=>l.level>=0&&run.levels.slice().sort((a,b)=>a.bottom-b.bottom)[l.level].id===L);
   if(k>=0&&ls.length){const ext=Math.max(900,lapLength(c.i.detailing,op.trim.diameter||12)+300),u0=c.offs[k]+op.x-ext,u1=c.offs[k]+op.x+op.w+ext,z0=ls[0].z0+op.z-ext,z1=ls[0].z0+op.z+op.h+ext;
    add(elevation(c,two?'out':'out',{x:rightX+secW+3,y:secY,w:rightW-secW-3,h:secH},'det-op',`รูปขยายช่องเปิด ${op.label||op.id}`,{win:{u0,u1,z0,z1},only:['OP','V','H'],n:pickScale(u1-u0,z1-z0,rightW-secW-3-48,secH-12,20)}));}}
  titleBlock(out,{x:rightX,y:A.y+A.h-tbH,w:rightW,h:tbH},m,project,o,0,0,title);
  pages.push({prims:out,views,w:P.w,h:P.h,size,title:'แบบ'});}
 // ---- BBS pages
 const items=wallBbsItems(m,rows,o.mode,qty),sum=wallBbsSummary(m,rows,o.mode,qty),cols=[{h:'Mark',w:26},{h:'Ø',w:14},{h:'รูปเหล็ก',w:58},{h:'Shape',w:13},{h:'ยาวตัด (mm)',w:22},{h:'จำนวน',w:16},{h:'น้ำหนัก (kg)',w:22},{h:'หมายเหตุ',w:0}];
 const tableW=size==='A2'?(P.w-40)/2-6:P.w-40,colRest=tableW-cols.slice(0,-1).reduce((n,c2)=>n+c2.w,0);cols[cols.length-1].w=Math.max(20,colRest);
 const perCol=Math.floor((P.h-20-40-10-32)/BBS_ROW)-1,columns=size==='A2'?2:1,perPage=perCol*columns,setOf=new Map(wallRunSets(m).map(s=>[s.id,s]));
 const chunks:WallBbsItem[][]=[];for(let k=0;k<Math.max(1,items.length);k+=perPage)chunks.push(items.slice(k,k+perPage));
 chunks.forEach((chunk,pi)=>{const out:Prim[]=[rect({x:10,y:10,w:P.w-20,h:P.h-20},{width:.5}),text(20,22,`BBS · ${m.code} · ${wallBbsModes.find(x=>x.id===o.mode)!.label}${qty>1?` · × ${qty} ชุด`:''}`,3.6,{bold:true}),
   text(20,27.5,`${wallTypeLabels[run.wallType]} · ${runLevels(run).lifts.length} ช่วงเท · แกนยาว ${fmt(axisLength(run),2)} m · เหล็กรวม ${fmt(sum.total,1)} kg`,2.3,{color:MUTED})];
  for(let col=0;col<columns;col++){const part=chunk.slice(col*perCol,(col+1)*perCol);if(!part.length)continue;const x0=20+col*(tableW+12),y0=32;
   let x=x0;out.push(rect({x:x0,y:y0,w:tableW,h:BBS_ROW},{fill:'#233a44',stroke:'#233a44'}));for(const cl of cols){out.push(text(x+1,y0+4.8,cl.h,2.1,{color:'#ffffff',bold:true}));x+=cl.w;}
   part.forEach((it,k)=>{const y=y0+BBS_ROW*(k+1);
    if('head' in it){out.push(rect({x:x0,y,w:tableW,h:BBS_ROW},{fill:'#f5f3ff',stroke:LINE,width:.15}),text(x0+1.5,y+4.8,it.head,2.4,{bold:true,color:CONC}),...(it.sub?[text(x0+tableW-1.5,y+4.8,it.sub,2.2,{anchor:'end',color:CONC})]:[]));return;}
    const r=it.row,s=setOf.get(r.id);let cx=x0;out.push(line(x0,y+BBS_ROW,x0+tableW,y+BBS_ROW,LINE,.12));
    const cells=[r.mark,barName(r.diameter),'',r.shapeCode?`#${r.shapeCode}`:'',String(r.cutLength),String(it.count),fmt(it.weight,1),s?`${wallKindNames[s.kind]} · ${s.what}`.slice(0,Math.floor(cols[7].w/1.1)):''];
    cells.forEach((v,ci)=>{if(ci===2){const n0=out.length;barSketch(out,r.paths[0]||[],r.points||r.paths[0]||[],r.diameter,cx+2,y+1.2,cols[2].w-4,BBS_ROW-2.4,s?KIND_COLOR[s.kind]:INK);for(const q of out.slice(n0))q.layer=q.t==='text'?'dim':'barMain';}
     else out.push(text(ci>=4&&ci<=6?cx+cols[ci].w-1:cx+1,y+4.8,v,ci===7?1.8:2.2,{anchor:ci>=4&&ci<=6?'end':'start',bold:ci===0}));cx+=cols[ci].w;});});
   out.push(rect({x:x0,y:y0,w:tableW,h:BBS_ROW*(part.length+1)},{width:.3}));}
  if(pi===chunks.length-1){// summary per group × size, BOQ lines
   const sy=Math.min(P.h-62,32+BBS_ROW*(Math.min(perCol,chunk.length)+1)+8),sx=size==='A2'&&chunk.length>perCol?20+tableW+12:20,cw=Math.min(22,(tableW-50)/(sum.sizes.length+1));
   out.push(text(sx,sy,o.mode==='lift'?'สรุปน้ำหนักต่อช่วงเท × ขนาดเหล็ก (kg)':o.mode==='face'?'สรุปน้ำหนักต่อด้าน × ขนาดเหล็ก (kg)':'สรุปน้ำหนักตามขนาดเหล็ก (kg)',2.6,{bold:true}));
   const hy=sy+2;out.push(rect({x:sx,y:hy,w:50+cw*(sum.sizes.length+1),h:5},{fill:'#e8eeee'}),text(sx+1,hy+3.6,'กลุ่ม',2,{bold:true}));
   sum.sizes.forEach((d,k)=>out.push(text(sx+50+cw*(k+1)-1,hy+3.6,barName(d),2,{bold:true,anchor:'end'})));out.push(text(sx+50+cw*(sum.sizes.length+1)-1,hy+3.6,'รวม',2,{bold:true,anchor:'end'}));
   const lines=[...sum.groups.slice(0,Math.max(1,Math.floor((P.h-hy-30)/4.6)-2)),{name:'รวมทั้งหมด',kg:new Map(sum.sizes.map(d=>[d,sum.groups.reduce((n,g)=>n+(g.kg.get(d)||0),0)])),total:sum.total}];
   lines.forEach((g,k)=>{const y=hy+5+k*4.6;out.push(text(sx+1,y+3.4,g.name.slice(0,30),1.9,{bold:k===lines.length-1}));sum.sizes.forEach((d,j)=>out.push(text(sx+50+cw*(j+1)-1,y+3.4,g.kg.get(d)?fmt(g.kg.get(d)!,1):'—',1.9,{anchor:'end'})));
    out.push(text(sx+50+cw*(sum.sizes.length+1)-1,y+3.4,fmt(g.total,1),1.9,{anchor:'end',bold:true}),line(sx,y+4.6,sx+50+cw*(sum.sizes.length+1),y+4.6,LINE,.12));});
   const by=hy+5+lines.length*4.6+5,boq=[...(m.siteWork?.items||[]).filter(x=>/^gen-wall-/.test(x.id)).map(x=>`${x.label}: ${fmt(x.quantity*qty,2)} ${x.unit}`)];
   if(o.mode==='lift'){const lq=wallRunLiftQuantities(m,rows);boq.push(...lq.map(l=>`${l.name}: คอนกรีต ${fmt(l.concrete*qty,2)} m³ · แบบหล่อ ${fmt(l.formwork*qty,1)} m²`));}
   boq.slice(0,Math.max(0,Math.floor((P.h-by-58)/3.6))).forEach((s,k)=>out.push(text(sx,by+k*3.6,s.slice(0,110),2,{color:MUTED})));}
  titleBlock(out,{x:P.w-20-150,y:P.h-20-40,w:150,h:40},m,project,o,pi+1,chunks.length+1,`${title} · BBS`);
  pages.push({prims:out,views:[],w:P.w,h:P.h,size,title:`BBS ${pi+1}`});});
 // page numbers in the title blocks: total = pages.length
 const total=pages.length;for(const [k,p] of pages.entries())for(const q of p.prims)if(q.t==='text'&&/^D?\S* · \d+\/\d+$/.test(q.text))q.text=q.text.replace(/\d+\/\d+$/,`${k+1}/${total}`);
 return pages;
}
/** Label boxes of a page for the Mark label check (`labelReport`). */
export const wallSheetLabelViews=(p:WallSheetPage)=>p.views.map(v=>({id:v.id,title:v.title,box:v.box}));
export {textWidth};
