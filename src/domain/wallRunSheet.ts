import type {LeaderPrim,PlainPrim,Prim} from './drawingPrims';
import {expandPrims,tagPrims,textWidth} from './drawingPrims';
import type {Member,Project,Vec3} from './model';
import type {SheetViewInfo,SheetData} from './bbsSheet';
import {barSketch} from './bbsSheet';
import {clipPrims} from './primClip';
import {lapLength,type WallInput} from './elementInput';
import {normaliseShape} from './shapeGeometry';
import {shapeModelSchema} from './shapeModelSchema';
import type {SheetLayout,ViewKey} from './sheetLayoutSchema';
import {resolveSheetLayout} from './sheetLayout';
import {axisLength,runAxis,runLevels,wallJoints,wallRunLiftQuantities,wallRunSets,wallRunShapeModel,wallKindNames,type RunSeg,type WallKind,type WallSet} from './wallRun';
import {wallTypeLabels} from './wallRunSchema';

// Wall Run sheet set (docs/WALL_RUN.md; W1 + W1.1): drawing sheets of views placed by a layout (the member's own from the
// Sheet Composer, the project default template, or the system layout “ผนัง (Wall Run)” planned here), then BBS pages in
// one of 3 presentations (whole wall / by lift / by face). Views (ViewKeys): `sec:wall-out-<g>` / `sec:wall-in-<g>` unfolded
// elevations per storey group g (≥ 1:75, target 1:50; A2, A1 when A2 is not enough), `sec:wall-det-<k>` corner / T / free
// end plan details (1:20), `sec:wall-sec` section A–A, `sec:wall-op` opening detail (1:20, other bars faded), paper views
// `stddet` (standard details), `keyplan`, `schedule` (steel per lift / face × size). Mark labels sit inside each view next
// to the representative bar (short leaders, never crossing, never on a line or a text); full label once per Mark per face
// (+ TYP. when repeated), short code elsewhere; option “ป้ายทุกจุด” = full label at every segment.
type P2=[number,number];type V3=Vec3;type Box={x:number;y:number;w:number;h:number};
export type WallBbsMode='wall'|'lift'|'face';
export type WallLabelMode='typ'|'all';
export const wallBbsModes:{id:WallBbsMode;label:string}[]=[{id:'wall',label:'ทั้งผนัง'},{id:'lift',label:'แยกตามชั้น / ช่วงเท'},{id:'face',label:'แยกตามด้าน'}];
export type WallRow={id:string;mark:string;diameter:number;grade:string;shapeCode:string;cutLength:number;count:number;weight:number;eachWeight?:number;paths:V3[][];points?:V3[]};
export type WallSheetPage={prims:Prim[];views:SheetViewInfo[];w:number;h:number;size:WallPaper;title:string;paper?:{key:ViewKey;box:Box}[];
 /** Mark labels that found no free spot on this page (the label check cannot see them) */ miss?:number};
export type WallPaper='A3'|'A2'|'A1';
const INK='#203940',MUTED='#5f6b6d',LINE='#9aa6a8',CONC='#5b21b6',JOINT='#7c3aed',FADE='#cbd5e1';
const KIND_COLOR:Record<WallKind,string>={V:'#1d4ed8',H:'#0891b2',C:'#db2777',T:'#c2410c',S:'#15803d',OP:'#9333ea',B:'#475569',K:'#a16207'};
const SCALES=[5,10,20,25,50,75,100,125,150,200,250,300,400,500];
export const WALL_PAPER:Record<WallPaper,{w:number;h:number}>={A3:{w:420,h:297},A2:{w:594,h:420},A1:{w:841,h:594}};
/** Frame margin, header band, title block (bottom right) of every wall sheet. */
export const WALL_SHEET={m:12,head:12,tb:{w:150,h:40}};
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const fmt=(v:number,d=1)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const text=(x:number,y:number,s:string,size=2.4,o:{bold?:boolean;anchor?:'start'|'middle'|'end';color?:string;halo?:boolean;layer?:PlainPrim['layer']}={}):PlainPrim=>({t:'text',x,y,text:s,size,color:o.color||INK,anchor:o.anchor,bold:o.bold,halo:o.halo,...(o.layer?{layer:o.layer}:{})});
const rect=(r:Box,o:{fill?:string;stroke?:string;width?:number}={}):PlainPrim=>({t:'rect',...r,stroke:o.stroke??INK,width:o.width??.25,...(o.fill?{fill:o.fill}:{})});
const line=(x1:number,y1:number,x2:number,y2:number,stroke=INK,width=.25,dash?:number[]):PlainPrim=>({t:'line',x1,y1,x2,y2,stroke,width,...(dash?{dash}:{})} as PlainPrim);
const fitScale=(mw:number,mh:number,w:number,h:number,want:number)=>{const ok=(n:number)=>mw/n<=w+1e-6&&mh/n<=h+1e-6;if(ok(want))return {n:want,fits:true};const n=SCALES.find(x=>x>want&&ok(x));return {n:n||SCALES[SCALES.length-1],fits:false};};
const autoScale=(mw:number,mh:number,w:number,h:number,min=20)=>SCALES.find(n=>n>=min&&mw/n<=w&&mh/n<=h)||SCALES[SCALES.length-1];
/** Design spacing text of a set (wall meshes / opening counts). */
function setText(i:WallInput,s:WallSet,row:WallRow,face:string){
 const r=i.run!.rebar,mesh=face==='in'&&r.layers===2?r.inner:r.outer;
 if(s.kind==='V'&&/^เหล็กตั้ง/.test(s.what))return `${s.mark} ${barName(row.diameter)}@${mesh.vertical.spacing}`;
 if(s.kind==='H')return `${s.mark} ${barName(row.diameter)}@${mesh.horizontal.spacing}`;
 if(s.kind==='C'&&/U-bar|U ปิด/.test(s.what))return `${s.mark} U ${barName(row.diameter)}@${mesh.horizontal.spacing}`;
 return `${s.mark} ${row.count}-${barName(row.diameter)}`;
}
const shortCode=(mark:string)=>mark.replace(/^.*-(?=[A-Z]+\d+$)/,'');
// ---------- model helpers ----------
type Ctx={m:Member;i:WallInput;segs:RunSeg[];offs:number[];shift:V3;lv:ReturnType<typeof runLevels>;sets:Map<string,WallSet>;rows:WallRow[];lvs:WallInput['run'] extends infer R?R extends {levels:infer L}?L:never:never;
 zLo:number;zHi:number;U:number;labels:WallLabelMode};
function ctxOf(m:Member,rows:WallRow[],labels:WallLabelMode='typ'):Ctx|undefined{
 const i=m.elementInput as WallInput|undefined;if(!i?.run||i.layout!=='run')return;
 const ax=runAxis(i.run),segs=[...ax.segs,...ax.branches],offs:number[]=[];let a=0;for(const s of segs){offs.push(a);a+=s.len+800;}
 const {shift}=normaliseShape(shapeModelSchema.parse(wallRunShapeModel(i))),lv=runLevels(i.run);
 const zLo=Math.min(lv.zBase,lv.bottom?.[0]??lv.zBase,lv.pit?.[0]??lv.zBase,lv.base?.[0]??lv.zBase,lv.key?.[0]??lv.zBase),zHi=Math.max(lv.zTop,lv.cover?.[1]??lv.zTop);
 return {m,i,segs,offs,shift,lv,sets:new Map(wallRunSets(m).map(s=>[s.id,s])),rows,lvs:[...i.run.levels].sort((x,y)=>x.bottom-y.bottom) as never,zLo,zHi,U:a-800,labels};
}
const unshift=(c:Ctx,p:V3):V3=>[p[0]-c.shift[0],p[1]-c.shift[1],p[2]-c.shift[2]];
/** Segment a plan point belongs to (nearest axis within its reach), u along it and o toward the outer face. */
function locate(c:Ctx,p:V3):{k:number;u:number;o:number}|undefined{let best:{k:number;u:number;o:number;d:number}|undefined;
 c.segs.forEach((s,k)=>{const dx=p[0]-s.a[0],dy=p[1]-s.a[1],u=dx*s.dir[0]+dy*s.dir[1],o=dx*s.out[0]+dy*s.out[1],reach=s.t/2+50,du=u<-reach?-reach-u:u>s.len+reach?u-s.len-reach:0,d=Math.abs(o)>reach?Math.abs(o)-reach+du:du;
  if(!best||d<best.d||(d===best.d&&Math.abs(o)<Math.abs(best.o)))best={k,u,o,d};});return best;}

// ---------- label placer (inside the view) ----------
type LabelReq={x:number;y:number;full:string;short:string;mark:string;color:string;n:number;d:number;useShort:boolean};
type SB={x0:number;x1:number;y0:number;y1:number};type Seg=[number,number,number,number];
const tbox=(x:number,y:number,t:string,sz:number,anchor?:'start'|'middle'|'end'):SB=>{const w=textWidth(t,sz),x0=anchor==='middle'?x-w/2:anchor==='end'?x-w:x;return {x0,x1:x0+w,y0:y-sz*.8,y1:y+sz*.2};};
const segsOf=(p:PlainPrim):Seg[]=>{
 if(p.t==='line')return [[p.x1,p.y1,p.x2,p.y2]];
 if(p.t==='rect')return [[p.x,p.y,p.x+p.w,p.y],[p.x+p.w,p.y,p.x+p.w,p.y+p.h],[p.x+p.w,p.y+p.h,p.x,p.y+p.h],[p.x,p.y+p.h,p.x,p.y]];
 if(p.t==='poly'){const s:Seg[]=[];for(let i=1;i<p.pts.length;i++)s.push([p.pts[i-1][0],p.pts[i-1][1],p.pts[i][0],p.pts[i][1]]);if(p.closed&&p.pts.length>2)s.push([p.pts[p.pts.length-1][0],p.pts[p.pts.length-1][1],p.pts[0][0],p.pts[0][1]]);return s;}
 return [];};
function segBox(s:Seg,b:SB){const [x1,y1,x2,y2]=s;let t0=0,t1=1;const dx=x2-x1,dy=y2-y1;
 for(const [p,q] of [[-dx,x1-b.x0],[dx,b.x1-x1],[-dy,y1-b.y0],[dy,b.y1-y1]]){if(p===0){if(q<0)return false;continue;}const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}}return true;}
const segCross=(a:Seg,b:Seg)=>{const o=(px:number,py:number,qx:number,qy:number,rx:number,ry:number)=>Math.sign((qx-px)*(ry-py)-(qy-py)*(rx-px));
 return o(a[0],a[1],a[2],a[3],b[0],b[1])*o(a[0],a[1],a[2],a[3],b[2],b[3])<0&&o(b[0],b[1],b[2],b[3],a[0],a[1])*o(b[0],b[1],b[2],b[3],a[2],a[3])<0;};
const boxHit=(a:SB,b:SB,g=0)=>a.x0<b.x1+g&&b.x0<a.x1+g&&a.y0<b.y1+g&&b.y0<a.y1+g;
const segBB=(s:Seg):SB=>({x0:Math.min(s[0],s[2]),x1:Math.max(s[0],s[2]),y0:Math.min(s[1],s[3]),y1:Math.max(s[1],s[3])});
/** Places labels around their anchors inside `R` (sheet mm): never on a drawn line / text / other label, leaders ≤ 70 mm,
 * never crossing; full text first, the short code when the full one finds no spot. */
function placeLabels(reqs:LabelReq[],drawn:Prim[],R:SB,view:string,size=2.1):Prim[]{
 const plain=expandPrims(drawn),asc=size*.8,desc=size*.2,H=asc+desc,gap=1.25;
 const hardB:SB[]=[],hardS:Seg[]=[];
 for(const p of plain){if(p.t==='text'){hardB.push(tbox(p.x,p.y,p.text,p.size,p.anchor));continue;}
  if(p.t==='circle'){hardB.push({x0:p.cx-p.r,x1:p.cx+p.r,y0:p.cy-p.r,y1:p.cy+p.r});continue;}hardS.push(...segsOf(p));}
 const anchors=reqs.map(r=>({x:r.x,y:r.y})),placedB:SB[]=[],placedS:Seg[]=[],out:Prim[]=[];
 const order=reqs.map((_,i)=>i).sort((a,b)=>Number(reqs[a].useShort)-Number(reqs[b].useShort)||reqs[b].full.length-reqs[a].full.length);
 for(const i of order){const r=reqs[i],{x:ax,y:ay}=anchors[i];let done=false;
  for(const txt of r.useShort?[r.short]:[r.full,r.short]){const w=textWidth(txt,size);let best:{s:number;x:number;y:number;px:number;py:number;b:SB}|undefined;
   for(const reach of [30,70]){
    const near=(b:SB)=>b.x0<ax+reach+w&&b.x1>ax-reach-w&&b.y0<ay+reach+H&&b.y1>ay-reach-H;
    const hb=[...hardB,...placedB].filter(near),hs=[...hardS,...placedS].filter(s=>near(segBB(s))),others=anchors.filter((_,j)=>j!==i).map(a=>({x0:a.x-.9,x1:a.x+.9,y0:a.y-.9,y1:a.y+.9})).filter(near);
    const step=1.5,nx=Math.ceil((reach+w)/step),ny=Math.ceil(reach/(H*.6));
    for(let jy=-ny;jy<=ny;jy++)for(let jx=-nx;jx<=nx;jx++){
     const x0=ax+jx*step-w/2,yb=ay+jy*H*.6+H/2-desc,b={x0,x1:x0+w,y0:yb-asc,y1:yb+desc};
     const px=Math.min(Math.max(ax,b.x0),b.x1),py=Math.min(Math.max(ay,b.y0),b.y1),dist=Math.hypot(px-ax,py-ay);
     if(dist>reach||dist<.7||best&&dist>=best.s)continue;
     if(b.x0<R.x0||b.x1>R.x1||b.y0<R.y0||b.y1>R.y1)continue;
     if(hb.some(q=>boxHit(b,q,gap))||others.some(q=>boxHit(b,q,.3))||hs.some(q=>segBox(q,{x0:b.x0-.3,x1:b.x1+.3,y0:b.y0-.3,y1:b.y1+.3})))continue;
     const lead:Seg=[ax,ay,px,py];if(placedS.some(q=>segCross(q,lead))||placedB.some(q=>segBox(lead,{x0:q.x0-.4,x1:q.x1+.4,y0:q.y0-.4,y1:q.y1+.4})))continue;
     best={s:dist,x:x0,y:yb,px,py,b};}
    if(best)break;}
   if(!best)continue;
   placedB.push(best.b);placedS.push([ax,ay,best.px,best.py]);hardB.push(best.b);
   const draw:PlainPrim[]=[{t:'circle',cx:ax,cy:ay,r:.4,fill:r.color,stroke:r.color,width:.1},{t:'line',x1:ax,y1:ay,x2:best.px,y2:best.py,stroke:r.color,width:.15},text(best.x,best.y,txt,size,{color:r.color})];
   out.push({t:'leader',pts:[[ax,ay],[best.px,best.py]],text:[txt],at:[best.x,best.y],anchor:'start',mark:{mark:r.mark,n:r.n,size:barName(r.d)},arrow:'dot',color:r.color,size,draw,view,layer:'mark',key:`mark:${r.mark}`} as LeaderPrim);done=true;break;}
  void done;}
 return out;
}

// ---------- views ----------
type Rendered={prims:Prim[];info?:SheetViewInfo;n:number;fits:boolean;miss:number};
type Win={u0:number;u1:number;z0:number;z1:number};
const TITLE=9,LEFT=17;
const levelName=(c:Ctx,l:{level:number})=>l.level<0?'PIT':c.lvs[l.level]?.name||'';
/** Unfolded elevation of one face over a model window (storey group or opening detail). `focus` = only these kinds are
 * labelled, the other bars are drawn faded. */
function elevation(c:Ctx,face:'out'|'in',box:Box,id:string,title:string,win:Win,o:{n?:number;want?:number;focus?:WallKind[];labels?:boolean;breakLo?:boolean;breakHi?:boolean}={}):Rendered{
 const lv=c.lv,run=c.i.run!,W=win,iw=box.w-LEFT-3,ih=box.h-TITLE-3;
 const sc=o.n?fitScale(W.u1-W.u0,W.z1-W.z0,iw,ih,o.n):{n:autoScale(W.u1-W.u0,W.z1-W.z0,iw,ih,o.want||20),fits:true},n=sc.n;
 const ox=box.x+LEFT+(iw-(W.u1-W.u0)/n)/2,oy=box.y+TITLE+(ih-(W.z1-W.z0)/n)/2,X=(u:number)=>ox+(u-W.u0)/n,Y=(z:number)=>oy+(W.z1-z)/n;
 const R:SB={x0:X(W.u0),x1:X(W.u1),y0:Y(W.z1),y1:Y(W.z0)},g:Prim[]=[];
 c.segs.forEach((s,k)=>{const u0=c.offs[k],u1=u0+s.len;
  g.push({...rect({x:X(u0),y:Y(lv.zTop),w:s.len/n,h:(lv.zTop-lv.zBase)/n},{stroke:CONC,width:.35}),layer:'concrete'} as Prim);
  for(const b of [lv.bottom,lv.cover,lv.pit,lv.base])if(b)g.push({...rect({x:X(u0),y:Y(b[1]),w:s.len/n,h:(b[1]-b[0])/n},{stroke:CONC,width:.25,fill:'#f1f5f9'}),layer:'concrete'} as Prim);
  if(lv.key)g.push({...rect({x:X(u0),y:Y(lv.key[1]),w:s.len/n,h:(lv.key[1]-lv.key[0])/n},{stroke:CONC,width:.2,fill:'#f1f5f9'}),layer:'concreteHidden'} as Prim);
  for(const l of lv.lifts.slice(1))g.push({...line(X(u0),Y(l.z0),X(u1),Y(l.z0),JOINT,l.k===0?.3:.2,l.k===0?undefined:[1.6,.8]),layer:'symbol'} as Prim);});
 for(const op of run.openings){const k=c.segs.findIndex(s=>s.id===op.segment);if(k<0)continue;if(op.face!=='through'&&op.face!==face)continue;
  for(const L of [op.level||c.lvs[0].id,...(op.repeat?.levels||[])]){const ls=lv.lifts.filter(l=>l.level>=0&&c.lvs[l.level].id===L);if(!ls.length)continue;
   const z0=ls[0].z0+op.z,u0=c.offs[k]+op.x;g.push({...rect({x:X(u0),y:Y(z0+op.h),w:op.w/n,h:op.h/n},{stroke:CONC,width:.3,fill:'#ffffff'}),layer:'concrete'} as Prim,
    {...line(X(u0),Y(z0),X(u0+op.w),Y(z0+op.h),LINE,.15),layer:'concreteHidden'} as Prim,{...line(X(u0),Y(z0+op.h),X(u0+op.w),Y(z0),LINE,.15),layer:'concreteHidden'} as Prim);}}
 // bars: one representative per Mark per segment (+ distribution line); labels only where the rep lies in the window
 const reqs:LabelReq[]=[],labelled=new Set<string>(),labels=o.labels!==false;
 for(const row of c.rows){const s=c.sets.get(row.id);if(!s||s.kind==='B'||s.kind==='K')continue;const faded=!!o.focus&&!o.focus.includes(s.kind),color=faded?FADE:KIND_COLOR[s.kind];
  const bySeg=new Map<number,{path:V3[];a:{u:number;z:number}}[]>();
  for(const p0 of row.paths){const p=p0.map(q=>unshift(c,q)),at=locate(c,p[0]);if(!at)continue;
   const onFace=run.rebar.layers===1?face==='out':(at.o>0?'out':'in')===face;if(!onFace&&!(s.faceCount.has('')&&!s.faces.size))continue;
   const zs=p.map(q=>q[2]);if(Math.max(...zs)<W.z0||Math.min(...zs)>W.z1)continue;
   const list=bySeg.get(at.k)||[];list.push({path:p,a:{u:c.offs[at.k]+at.u,z:p[0][2]}});bySeg.set(at.k,list);}
  const segsOfMark=bySeg.size;
  for(const [,list] of [...bySeg].sort((a,b)=>a[0]-b[0])){
   const wc={u:(W.u0+W.u1)/2,z:(W.z0+W.z1)/2},inside=list.filter(x=>x.a.z>=W.z0&&x.a.z<=W.z1),pool=inside.length?inside:list,rep=o.focus?pool.reduce((b,x)=>Math.hypot(x.a.u-wc.u,x.a.z-wc.z)<Math.hypot(b.a.u-wc.u,b.a.z-wc.z)?x:b):pool[Math.floor(pool.length/2)],pts:P2[]=[];
   for(let j=1;j<rep.path.length;j++){const a=rep.path[j-1],b=rep.path[j],mid:V3=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],L=locate(c,mid);if(!L)continue;const s2=c.segs[L.k];
    const ua=c.offs[L.k]+(a[0]-s2.a[0])*s2.dir[0]+(a[1]-s2.a[1])*s2.dir[1],ub=c.offs[L.k]+(b[0]-s2.a[0])*s2.dir[0]+(b[1]-s2.a[1])*s2.dir[1];
    if(Math.abs(ua-ub)<1&&Math.abs(a[2]-b[2])<1)continue;if(!pts.length)pts.push([X(ua),Y(a[2])]);pts.push([X(ub),Y(b[2])]);}
   if(pts.length<2)continue;
   g.push({t:'poly',pts,closed:false,stroke:color,width:faded?.25:.45,layer:faded?'barRef':s.kind==='C'||s.kind==='T'?'barLink':'barMain',group:row.id} as Prim);
   if(list.length>1&&!faded){const us=list.map(x=>x.a.u),zs=list.map(x=>Math.min(Math.max(x.a.z,W.z0),W.z1)),du=Math.max(...us)-Math.min(...us),dz=Math.max(...zs)-Math.min(...zs);
    if(du>=dz){const yy=Math.min(Math.max((pts[0][1]+pts[pts.length-1][1])/2+.9,R.y0),R.y1);g.push(line(X(Math.min(...us)),yy,X(Math.max(...us)),yy,color,.15),{t:'circle',cx:X(Math.min(...us)),cy:yy,r:.3,stroke:color,width:.12} as Prim,{t:'circle',cx:X(Math.max(...us)),cy:yy,r:.3,stroke:color,width:.12} as Prim);}
    else{const xx=(pts[0][0]+pts[pts.length-1][0])/2+.9;g.push(line(xx,Y(Math.max(...zs)),xx,Y(Math.min(...zs)),color,.15),{t:'circle',cx:xx,cy:Y(Math.max(...zs)),r:.3,stroke:color,width:.12} as Prim,{t:'circle',cx:xx,cy:Y(Math.min(...zs)),r:.3,stroke:color,width:.12} as Prim);}}
   if(!labels||faded)continue;
   // anchor on the longest drawn piece inside the window
   let best:{x:number;y:number;l:number}|undefined;
   for(let j=1;j<pts.length;j++){const a=pts[j-1],b=pts[j],cl=(t:number):P2=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    for(const t of [.5,.35,.65,.25,.75]){const q=cl(t);if(q[0]>R.x0+.5&&q[0]<R.x1-.5&&q[1]>R.y0+.5&&q[1]<R.y1-.5){const l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!best||l>best.l)best={x:q[0],y:q[1],l};break;}}}
   if(!best)continue;
   const first=!labelled.has(s.mark),full=`${setText(c.i,s,row,face)}${s.every?' · ทุกช่วงเท':''}${c.labels==='typ'&&segsOfMark>1?' TYP.':''}`;labelled.add(s.mark);
   reqs.push({x:best.x,y:best.y,full,short:shortCode(s.mark),mark:s.mark,color,n:row.count,d:row.diameter,useShort:c.labels==='typ'&&!first});}}
 const geo=clipPrims(g,{kind:'rect',x0:R.x0-.01,y0:R.y0-.01,x1:R.x1+.01,y1:R.y1+.01});
 // break lines where the window cuts the wall (storey groups)
 const brk=(y:number)=>{const pts:P2[]=[[R.x0-2,y]];for(let x=R.x0;x<R.x1;x+=6)pts.push([x+2,y],[x+3,y-1.2],[x+4,y+1.2],[x+5,y]);pts.push([R.x1+2,y]);return {t:'poly',pts,closed:false,stroke:MUTED,width:.2,layer:'symbol'} as Prim;};
 if(o.breakLo)geo.push(brk(R.y1));if(o.breakHi)geo.push(brk(R.y0));
 // levels (continuous elevations), segment names, opening sizes: left of / above the drawing
 const marks:Prim[]=[text(box.x,box.y+4.5,`${title} · 1:${n}`,2.8,{bold:true,layer:'text'})];
 for(const l of lv.lifts)if((l.k===0||l.level<0)&&l.z0>=W.z0&&l.z0<=W.z1)marks.push(line(R.x0-LEFT+1,Y(l.z0),R.x0-1,Y(l.z0),MUTED,.15),text(R.x0-LEFT+1,Y(l.z0)-.5,`${levelName(c,l)} ${l.z0>=0?'+':''}${(l.z0/1000).toFixed(3)}`,1.7,{color:MUTED}));
 if(lv.zTop>=W.z0&&lv.zTop<=W.z1)marks.push(line(R.x0-LEFT+1,Y(lv.zTop),R.x0-1,Y(lv.zTop),MUTED,.15),text(R.x0-LEFT+1,Y(lv.zTop)-.5,`T.O.W. ${(lv.zTop/1000).toFixed(3)}`,1.7,{color:MUTED}));
 if(!o.focus)c.segs.forEach((s,k)=>{const cx=X(c.offs[k]+s.len/2);if(cx>R.x0&&cx<R.x1)marks.push(text(cx,R.y0-1,`${s.id} · ${s.len}`,2,{bold:true,anchor:'middle',color:CONC}));});
 const lab=placeLabels(reqs,[...geo,...marks],{x0:box.x+1,x1:box.x+box.w-1,y0:box.y+TITLE,y1:box.y+box.h-1},id);
 const info:SheetViewInfo={id,title,box,n,s:1/n,fits:sc.fits,axes:[0,2],origin:{sheet:[ox,oy],model:[W.u0,W.z1]}};
 return {prims:tagPrims([...geo,...marks,...lab],{view:id}),info,n,fits:sc.fits,miss:reqs.length-lab.length};
}
/** Plan detail (corner / T / free end) around `center` (radius r). */
function planDetail(c:Ctx,box:Box,id:string,title:string,center:P2,r:number,want:number|'auto'):Rendered{
 const sm=wallRunShapeModel(c.i),first=c.lv.lifts[0],iw=box.w-4,ih=box.h-TITLE-2,sc=want==='auto'?{n:autoScale(2*r,2*r,iw,ih,20),fits:true}:fitScale(2*r,2*r,iw,ih,want),n=sc.n;
 const cx=box.x+2+iw/2,cy=box.y+TITLE+ih/2,X=(x:number)=>cx+(x-center[0])/n,Y=(y:number)=>cy-(y-center[1])/n,g:Prim[]=[];
 for(const p of sm.parts)if(p.role==='solid'&&p.shape==='polygon'&&p.z0<=first.z0+1&&p.z0+p.height>=first.z0+1&&/^w/.test(p.id))g.push({t:'poly',pts:p.points.map(q=>[X(q[0]),Y(q[1])] as P2),closed:true,stroke:CONC,width:.35,fill:'#f5f3ff',layer:'concrete'} as Prim);
 const zs=c.rows.flatMap(row=>{const s=c.sets.get(row.id);return s&&s.kind==='H'?row.paths.map(p=>unshift(c,p[0])[2]):[];}),z0=zs.length?Math.min(...zs):first.z0+100;
 const reqs:LabelReq[]=[],R={x0:cx-iw/2,x1:cx+iw/2,y0:cy-ih/2,y1:cy+ih/2};
 for(const row of c.rows){const s=c.sets.get(row.id);if(!s||s.kind==='B'||s.kind==='K'||s.kind==='OP')continue;const color=KIND_COLOR[s.kind];let labelled=false;
  for(const p0 of row.paths){const p=p0.map(q=>unshift(c,q)),flat=p.every(q=>Math.abs(q[2]-p[0][2])<1);
   if(flat&&Math.abs(p[0][2]-z0)<=row.diameter*2+1){const pts=p.map(q=>[X(q[0]),Y(q[1])] as P2);if(!pts.some(q=>q[0]>R.x0&&q[0]<R.x1&&q[1]>R.y0&&q[1]<R.y1))continue;
    g.push({t:'poly',pts,closed:s.kind==='C'&&p.length>5,stroke:color,width:.5,layer:'barMain'} as Prim);
    if(!labelled){let a:P2|undefined;for(let j=1;j<pts.length&&!a;j++){const m:P2=[(pts[j-1][0]+pts[j][0])/2,(pts[j-1][1]+pts[j][1])/2];if(m[0]>R.x0+2&&m[0]<R.x1-2&&m[1]>R.y0+2&&m[1]<R.y1-2)a=m;}
     if(a){reqs.push({x:a[0],y:a[1],full:`${s.mark} ${barName(row.diameter)}`,short:shortCode(s.mark),mark:s.mark,color,n:row.count,d:row.diameter,useShort:false});labelled=true;}}}
   else if(!flat&&p.some(q=>q[2]<=z0&&q[2]>=z0-2000)&&Math.hypot(p[0][0]-center[0],p[0][1]-center[1])<r*1.4){const q=p[0];g.push({t:'circle',cx:X(q[0]),cy:Y(q[1]),r:Math.max(.35,row.diameter/2/n),fill:color,stroke:color,width:.1,layer:'barMain'} as Prim);}}}
 const geo=clipPrims(g,{kind:'rect',...R}),head=[text(box.x,box.y+4.5,`${title} · 1:${n}`,2.6,{bold:true,layer:'text'})],lab=placeLabels(reqs,[...geo,...head],{x0:box.x+1,x1:box.x+box.w-1,y0:box.y+TITLE,y1:box.y+box.h-1},id);
 return {prims:tagPrims([...geo,...head,...lab],{view:id}),info:{id,title,box,n,s:1/n,fits:sc.fits,axes:[0,1],origin:{sheet:[cx,cy],model:[center[0],center[1]]}},n,fits:sc.fits,miss:reqs.length-lab.length};
}
/** Section geometry window of segment 1 (model o, z). */
function sectionWin(c:Ctx){const run=c.i.run!,t=c.segs[0].t,rt=run.retaining;
 const zLo=c.zLo-(run.base.kind==='dowel-footing'||run.base.kind==='dowel-slab'?900:300),zHi=c.zHi+(run.top.kind==='continue'||run.top.kind==='bend-into-slab'?600:300);
 const oL=rt?-(t/2+(rt.soilSide==='out'?rt.toe:rt.heel))-300:-t/2-1200,oR=rt?t/2+(rt.soilSide==='out'?rt.heel:rt.toe)+300:t/2+1200;return {zLo,zHi,oL,oR};}
function section(c:Ctx,box:Box,id:string,want:number|'auto'):Rendered{
 const run=c.i.run!,s=c.segs[0],lv=c.lv,t=s.t,uc=Math.round(s.len/2),det=c.i.detailing,{zLo,zHi,oL,oR}=sectionWin(c),rt=run.retaining;
 const iw=box.w-4,ih=box.h-TITLE-6,sc=want==='auto'?{n:autoScale(oR-oL,zHi-zLo,iw,ih,20),fits:true}:fitScale(oR-oL,zHi-zLo,iw,ih,want),n=sc.n;
 const ox=box.x+2+(iw-(oR-oL)/n)/2,oy=box.y+TITLE,X=(o:number)=>ox+(oR-o)/n,Y=(z:number)=>oy+(zHi-z)/n,g:Prim[]=[];
 const conc=(o0:number,o1:number,z0:number,z1:number,fill='#f5f3ff',ref=false)=>g.push({t:'rect',x:X(Math.max(o0,o1)),y:Y(z1),w:Math.abs(o1-o0)/n,h:(z1-z0)/n,stroke:CONC,width:ref?.18:.35,fill,...(ref?{dash:[1.2,.8]}:{}),layer:ref?'concreteHidden':'concrete'} as Prim);
 for(const l of lv.lifts){const tl=l.t&&l.t>0?l.t:t;conc(-tl/2,tl/2,l.z0,l.z1);}
 if(lv.bottom&&run.tank)conc(-(t/2+run.tank.bottom.projection),oL+300,lv.bottom[0],lv.bottom[1],'#eef2f6');
 if(lv.cover&&run.tank?.cover)conc(t/2,oL+300,lv.cover[0],lv.cover[1],'#eef2f6');
 if(lv.pit&&run.liftPit)conc(t/2,oL+300,lv.pit[0],lv.pit[1],'#eef2f6');
 if(lv.base&&rt){const sg=rt.soilSide==='out'?1:-1;conc(-sg*(t/2+rt.toe),sg*(t/2+rt.heel),lv.base[0],lv.base[1],'#eef2f6');if(lv.key)conc(-rt.key!.width/2,rt.key!.width/2,lv.key[0],lv.key[1],'#eef2f6');}
 const own=run.wallType==='tank'||!!rt||(run.wallType==='lift'&&!!run.liftPit);
 if(!own&&run.base.kind==='dowel-footing')conc(-t/2-500,t/2+500,zLo+50,lv.zBase,'#ffffff',true);
 if(!own&&run.base.kind==='dowel-slab')conc(-t/2-900,t/2+900,lv.zBase-200,lv.zBase,'#ffffff',true);
 if(!(run.tank?.cover)&&run.top.kind==='bend-into-slab')conc(-t/2-900,t/2+900,lv.zTop,lv.zTop+(run.top.slab||200),'#ffffff',true);
 const joints=[...(wallJoints(run).base?[lv.zBase]:[]),...lv.lifts.slice(1).map(l=>l.z0),...(lv.cover?[lv.cover[0]]:[])];
 for(const z of joints){g.push({...line(X(t/2+150),Y(z),X(-t/2-150),Y(z),JOINT,.25,[1.4,.7]),layer:'symbol'} as Prim);
  if(run.waterstop?.joints)g.push({t:'rect',x:X(15),y:Y(z+100),w:30/n,h:200/n,stroke:'#0f766e',width:.2,fill:'#99f6e4',layer:'symbol'} as Prim);}
 const reqs:LabelReq[]=[];
 for(const row of c.rows){const st=c.sets.get(row.id);if(!st)continue;const color=KIND_COLOR[st.kind];let best:{p:V3[];d:number}|undefined;const dots:P2[]=[];
  for(const p0 of row.paths){const p=p0.map(q=>unshift(c,q)),loc=p.map(q=>{const dx=q[0]-s.a[0],dy=q[1]-s.a[1];return {u:dx*s.dir[0]+dy*s.dir[1],o:dx*s.out[0]+dy*s.out[1],z:q[2]};});
   if(loc.some(q=>Math.abs(q.o)>Math.max(oR,-oL)+200))continue;
   const us=loc.map(q=>q.u);if(Math.max(...us)-Math.min(...us)<5){const d=Math.abs(us[0]-uc);if(d<400&&(!best||d<best.d))best={p,d};continue;}
   for(let j=1;j<loc.length;j++){const a=loc[j-1],b=loc[j];if((a.u-uc)*(b.u-uc)<0){const f=(uc-a.u)/(b.u-a.u);dots.push([X(a.o+(b.o-a.o)*f),Y(a.z+(b.z-a.z)*f)]);}}}
  if(best){const pts=best.p.map(q=>{const dx=q[0]-s.a[0],dy=q[1]-s.a[1];return [X(dx*s.out[0]+dy*s.out[1]),Y(q[2])] as P2;});g.push({t:'poly',pts,closed:false,stroke:color,width:.45,layer:'barMain'} as Prim);
   const j=pts.reduce((b,_,k)=>k&&Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1])>b.l?{k,l:Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1])}:b,{k:1,l:0}).k;
   reqs.push({x:(pts[j][0]+pts[j-1][0])/2,y:(pts[j][1]+pts[j-1][1])/2,full:`${st.mark} ${barName(row.diameter)}`,short:shortCode(st.mark),mark:st.mark,color,n:row.count,d:row.diameter,useShort:false});}
  for(const d of dots)g.push({t:'circle',cx:d[0],cy:d[1],r:Math.max(.3,row.diameter/2/n),fill:color,stroke:color,width:.1,layer:'barMain'} as Prim);
  if(!best&&dots.length&&(st.kind==='H'||st.kind==='B'||st.kind==='K')){const d=dots[Math.floor(dots.length/2)];reqs.push({x:d[0]+.6,y:d[1],full:`${st.mark} ${barName(row.diameter)}`,short:shortCode(st.mark),mark:st.mark,color,n:row.count,d:row.diameter,useShort:false});}}
 const head=[text(box.x,box.y+4.5,`รูปตัด A–A ผ่าน ${s.id} (u = ${uc}) · 1:${n}`,2.6,{bold:true,layer:'text'}),
  text(box.x+1,box.y+box.h-1.5,`C.J. = รอยต่อการเท${run.waterstop?.joints?` + WATERSTOP ${run.waterstop.material}`:''}${run.base.kicker?` · KICKER ${run.base.kicker}`:''} · ทาบ ${barName(run.rebar.outer.vertical.diameter)} = ${Math.round(lapLength(det,run.rebar.outer.vertical.diameter))} mm ทุกช่วงเท${run.rebar.stagger?' (เหลื่อม 50%)':''}`,1.7,{color:MUTED})];
 const lab=placeLabels(reqs,[...g,...head],{x0:box.x+1,x1:box.x+box.w-1,y0:box.y+TITLE,y1:box.y+box.h-5},id);
 return {prims:tagPrims([...clipPrims(g,{kind:'rect',x0:box.x,y0:box.y,x1:box.x+box.w,y1:box.y+box.h}),...head,...lab],{view:id}),info:{id,title:'รูปตัด A–A',box,n,s:1/n,fits:sc.fits,axes:[1,2],origin:{sheet:[ox,oy],model:[oR,zHi]}},n,fits:sc.fits,miss:reqs.length-lab.length};
}
// ---------- paper views ----------
function standardDetails(c:Ctx,box:Box):Prim[]{
 const r=c.i.run!.rebar,run=c.i.run!,cells=[
  ['มุม L',r.layers===1||r.corner==='lap-l'?'งอ L รอบมุม · ทาบนอกมุม':r.corner==='hook90'?'ขอ 90° เข้าผนังตั้งฉาก':'U-bar ทับมุม 2 ผิว · ขาทาบ Lap'],
  ['จุดต่อ T',r.tee==='ubar'?'U-bar คร่อม เข้าผนังหลัก':'ผนังรองงอ L ยึด Ldh'],
  ['ปลายอิสระ',r.freeEnd==='boundary'?`Boundary ${r.boundary?.length||0} · ปลอก ${barName(r.boundary?.ties.diameter||9)}@${r.boundary?.ties.spacing||0}`:r.freeEnd==='ucap-edge'?`U ปิดปลาย + EDGE ${r.edgeBar?.count||0}-${barName(r.edgeBar?.diameter||12)}`:'ปลายตรงที่ cover'],
  ['ล่าง / บน',`${run.wallType==='tank'?'L จากพื้นบ่อ':run.wallType==='retaining'?'L ยึดในฐาน':({'dowel-footing':'เดือยจากฐานราก','dowel-slab':'เดือยจากพื้น',continue:'ต่อจากผนังล่าง',none:'—'} as Record<string,string>)[run.base.kind]} · ${run.tank?.cover?'L เข้าฝาบ่อ':({'bend-into-slab':'งอ 90° เข้าพื้น','u-cap':'U ปิดบน',straight:'ตรง',continue:'ต่อขึ้น'} as Record<string,string>)[run.top.kind]}`]] as const;
 const out:Prim[]=[text(box.x,box.y+4.5,'รายละเอียดมาตรฐาน (NTS)',2.6,{bold:true})],w=(box.w-6)/4,h=box.h-TITLE;
 cells.forEach(([t,d],k)=>{const b={x:box.x+k*(w+2),y:box.y+TITLE-1,w,h:h},mx=b.x+b.w/2,my=b.y+b.h*.4,s=Math.min(b.w,b.h)*.26;out.push(rect(b,{stroke:LINE,width:.2,fill:'#f8fafc'}));
  if(k===0)out.push({t:'poly',pts:[[mx-s,my+s],[mx-s,my-s],[mx+s,my-s]],closed:false,stroke:CONC,width:.8} as Prim,{t:'poly',pts:[[mx-s+3,my+s],[mx-s+3,my-s+3],[mx+s,my-s+3]],closed:false,stroke:CONC,width:.8} as Prim,{t:'poly',pts:[[mx-s+6,my-s+1.5],[mx-s+1.5,my-s+1.5],[mx-s+1.5,my-s+6]],closed:false,stroke:KIND_COLOR.C,width:.5} as Prim);
  if(k===1)out.push(line(mx-s,my-s,mx+s,my-s,CONC,.8),line(mx,my-s,mx,my+s,CONC,.8),{t:'poly',pts:[[mx-1,my+2],[mx-1,my-s+1],[mx-3,my-s+1]],closed:false,stroke:KIND_COLOR.T,width:.5} as Prim);
  if(k===2)out.push(rect({x:mx-s,y:my-2,w:2*s,h:4},{stroke:CONC,width:.6}),{t:'poly',pts:[[mx,my-1],[mx+s-1,my-1],[mx+s-1,my+1],[mx,my+1]],closed:false,stroke:KIND_COLOR.C,width:.5} as Prim);
  if(k===3)out.push(rect({x:mx-1.5,y:my-s,w:3,h:2*s},{stroke:CONC,width:.6}),line(mx-s,my+s,mx+s,my+s,CONC,.6),{t:'poly',pts:[[mx-3,my+s-1],[mx-.5,my+s-1],[mx-.5,my-1]],closed:false,stroke:KIND_COLOR.S,width:.5} as Prim);
  out.push(text(b.x+1.5,b.y+b.h-5.5,t,2.1,{bold:true}),text(b.x+1.5,b.y+b.h-2,d.slice(0,Math.floor(b.w/1.05)),1.55,{color:MUTED}));});
 return out;
}
function keyPlan(c:Ctx,box:Box):Prim[]{
 const sm=wallRunShapeModel(c.i),polys=sm.parts.filter(p=>p.shape==='polygon'&&p.role==='solid'&&/^(w|base-|tank-bottom|pit-slab)/.test(p.id)).map(p=>(p as {points:P2[]}).points),all=polys.flat();
 const out:Prim[]=[text(box.x,box.y+4.5,'Key plan',2.6,{bold:true}),rect({x:box.x,y:box.y+TITLE-1,w:box.w,h:box.h-TITLE+1},{stroke:LINE,width:.2,fill:'#f8fafc'})];if(!all.length)return out;
 const x0=Math.min(...all.map(p=>p[0])),x1=Math.max(...all.map(p=>p[0])),y0=Math.min(...all.map(p=>p[1])),y1=Math.max(...all.map(p=>p[1])),sc=Math.min((box.w-12)/(x1-x0||1),(box.h-TITLE-10)/(y1-y0||1));
 const X=(x:number)=>box.x+6+(x-x0)*sc+((box.w-12)-(x1-x0)*sc)/2,Y=(y:number)=>box.y+TITLE+4+(y1-y)*sc;
 polys.forEach(p=>out.push({t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])] as P2),closed:true,stroke:CONC,width:.2,fill:'#ede9fe'} as Prim));
 const s=c.segs[0],m:P2=[s.a[0]+s.dir[0]*s.len/2,s.a[1]+s.dir[1]*s.len/2],a:P2=[m[0]+s.out[0]*(s.t+400),m[1]+s.out[1]*(s.t+400)],b:P2=[m[0]-s.out[0]*(s.t+400),m[1]-s.out[1]*(s.t+400)];
 out.push(line(X(a[0]),Y(a[1]),X(b[0]),Y(b[1]),'#b91c1c',.3,[1,.6]),text(X(a[0]),Y(a[1])-.8,'A',2,{bold:true,color:'#b91c1c',anchor:'middle'}));
 c.segs.forEach(sg=>out.push(text(X((sg.a[0]+sg.b[0])/2+sg.out[0]*(sg.t+500)),Y((sg.a[1]+sg.b[1])/2+sg.out[1]*(sg.t+500))+.7,sg.id,1.9,{anchor:'middle',color:CONC,bold:true})));
 return out;
}
/** Steel per group (lift / face / whole wall) × bar size, as a paper table. */
function scheduleTable(c:Ctx,box:Box,mode:WallBbsMode,qty:number):Prim[]{
 const sum=wallBbsSummary(c.m,c.rows,mode,qty),cw=Math.min(20,(box.w-46)/(sum.sizes.length+1)),out:Prim[]=[text(box.x,box.y+4.5,mode==='lift'?'น้ำหนักเหล็กต่อช่วงเท × ขนาด (kg)':mode==='face'?'น้ำหนักเหล็กต่อด้าน × ขนาด (kg)':'น้ำหนักเหล็กตามขนาด (kg)',2.6,{bold:true})];
 const hy=box.y+TITLE-1,rows=[...sum.groups,{name:'รวม',kg:new Map(sum.sizes.map(d=>[d,sum.groups.reduce((n,g)=>n+(g.kg.get(d)||0),0)])),total:sum.total}],rh=Math.min(4.4,(box.h-TITLE-6)/(rows.length+1));
 out.push(rect({x:box.x,y:hy,w:46+cw*(sum.sizes.length+1),h:rh},{fill:'#e8eeee',width:.15}),text(box.x+1,hy+rh*.75,'กลุ่ม',1.8,{bold:true}));
 sum.sizes.forEach((d,k)=>out.push(text(box.x+46+cw*(k+1)-1,hy+rh*.75,barName(d),1.8,{bold:true,anchor:'end'})));out.push(text(box.x+46+cw*(sum.sizes.length+1)-1,hy+rh*.75,'รวม',1.8,{bold:true,anchor:'end'}));
 rows.forEach((g,k)=>{const y=hy+rh*(k+1);out.push(text(box.x+1,y+rh*.75,g.name.slice(0,26),1.7,{bold:k===rows.length-1}));sum.sizes.forEach((d,j)=>out.push(text(box.x+46+cw*(j+1)-1,y+rh*.75,g.kg.get(d)?fmt(g.kg.get(d)!,1):'—',1.7,{anchor:'end'})));
  out.push(text(box.x+46+cw*(sum.sizes.length+1)-1,y+rh*.75,fmt(g.total,1),1.7,{anchor:'end',bold:true}),line(box.x,y+rh,box.x+46+cw*(sum.sizes.length+1),y+rh,LINE,.12));});
 return out;
}

// ---------- storey groups, view catalogue, system layout ----------
export type WallGroup={id:number;name:string;z0:number;z1:number;breakLo:boolean;breakHi:boolean};
/** Storey groups whose elevation height (+ margins) stays ≤ maxH (model mm); a storey never splits (pit + first storey together). */
function storeyGroups(c:Ctx,maxH:number):WallGroup[]{
 const lv=c.lv,st:{name:string;z0:number;z1:number}[]=[];
 const by=new Map<number,{name:string;z0:number;z1:number}>();
 for(const l of lv.lifts){const e=by.get(l.level);if(e){e.z0=Math.min(e.z0,l.z0);e.z1=Math.max(e.z1,l.z1);}else by.set(l.level,{name:levelName(c,l),z0:l.z0,z1:l.z1});}
 st.push(...[...by].sort((x,y)=>x[0]-y[0]).map(([,v])=>v));
 // merge the pit into the first storey
 if(lv.lifts[0]?.level<0&&st.length>1&&st[0].name==='PIT'){st[1]={name:'PIT',z0:st[0].z0,z1:st[1].z1};st.shift();}
 if(st.length){st[0].z0=c.zLo;st[st.length-1].z1=c.zHi;}
 const out:WallGroup[]=[];let cur:{names:string[];z0:number;z1:number}|undefined;
 const push=()=>{if(!cur)return;out.push({id:out.length+1,name:cur.names.length>1?`${cur.names[0]} – ${cur.names[cur.names.length-1]}`:cur.names[0],z0:cur.z0,z1:cur.z1,breakLo:false,breakHi:false});};
 for(const s of st){if(cur&&s.z1-cur.z0+600<=maxH){cur.z1=s.z1;cur.names.push(s.name);}else{push();cur={names:[s.name],z0:s.z0,z1:s.z1};}}
 push();
 return out.map((g,k)=>({...g,breakLo:k>0,breakHi:k<out.length-1,z0:g.z0-(k===0?300:150),z1:g.z1+(k===out.length-1?300:150)}));
}
type ViewDef={key:ViewKey;title:string;paper:boolean;pref:number;size:(n:number)=>{w:number;h:number};render:(box:Box,n:number|'auto')=>Rendered};
const PAPER_N=0;
function viewDefs(c:Ctx,groups:WallGroup[],n:number,mode:WallBbsMode,qty:number):ViewDef[]{
 const run=c.i.run!,two=run.rebar.layers===2,ax=runAxis(run),out:ViewDef[]=[],U0=-300,U1=c.U+300,lapH=lapLength(c.i.detailing,run.rebar.outer.horizontal.diameter);
 const faces:('out'|'in')[]=two?['out','in']:['out'];
 for(const g of groups)for(const f of faces){const win={u0:U0,u1:U1,z0:g.z0,z1:g.z1},nm=groups.length>1?` · ${g.name}`:'';
  out.push({key:`sec:wall-${f}-${g.id}`,title:`ELEVATION คลี่ · ${two?(f==='out'?'ผิวนอก':'ผิวใน'):'เหล็กกึ่งกลาง'}${nm}`,paper:false,pref:n,
   size:k=>({w:(U1-U0)/k+LEFT+3,h:(g.z1-g.z0)/k+TITLE+3}),render:(box,k)=>elevation(c,f,box,`wall-${f}-${g.id}`,`ELEVATION คลี่ · ${two?(f==='out'?'ผิวนอก':'ผิวใน'):'เหล็กกึ่งกลาง'}${nm}`,win,{...(k==='auto'?{want:50}:{n:k}),breakLo:g.breakLo,breakHi:g.breakHi})});}
 const dets:{title:string;center:P2;r:number}[]=[];
 const j=ax.segs.find((s,k)=>k<ax.segs.length-1||ax.closed);if(j&&ax.segs.length>1)dets.push({title:`รายละเอียดมุม ${j.id}–${(ax.segs[j.k+1]||ax.segs[0]).id}`,center:j.b,r:Math.max(700,lapH+j.t)});
 const br=ax.branches[0];if(br)dets.push({title:`จุดต่อ T ${br.id}`,center:br.a,r:Math.max(700,lapH+br.t)});
 if(!ax.closed){const s=ax.segs[0];dets.push({title:`ปลายผนัง ${s.id} (${run.rebar.freeEnd==='boundary'?'Boundary':run.rebar.freeEnd==='ucap-edge'?'U + EDGE':'ปลายตรง'})`,center:s.a,r:Math.max(600,(run.rebar.boundary?.length||0)+400)});}
 dets.slice(0,3).forEach((d,k)=>out.push({key:`sec:wall-det-${k}`,title:d.title,paper:false,pref:20,size:s=>({w:2*d.r/s+4,h:2*d.r/s+TITLE+2}),render:(box,s)=>planDetail(c,box,`wall-det-${k}`,d.title,d.center,d.r,s)}));
 const sw=sectionWin(c),secPref=[20,25,50,75,100,125,150,200].find(s=>(sw.zHi-sw.zLo)/s<=230)||200;
 out.push({key:'sec:wall-sec',title:'รูปตัด A–A',paper:false,pref:secPref,size:s=>({w:(sw.oR-sw.oL)/s+4,h:(sw.zHi-sw.zLo)/s+TITLE+6}),render:(box,s)=>section(c,box,'wall-sec',s)});
 const op=run.openings[0];
 if(op){const k=c.segs.findIndex(s=>s.id===op.segment),L=op.level||c.lvs[0].id,ls=c.lv.lifts.filter(l=>l.level>=0&&c.lvs[l.level].id===L);
  if(k>=0&&ls.length){const ext=Math.max(600,lapLength(c.i.detailing,op.trim.diameter||12)+200),win={u0:c.offs[k]+op.x-ext,u1:c.offs[k]+op.x+op.w+ext,z0:ls[0].z0+op.z-ext,z1:ls[0].z0+op.z+op.h+ext};
   out.push({key:'sec:wall-op',title:`รูปขยายช่องเปิด ${op.label||op.id}`,paper:false,pref:20,size:s=>({w:(win.u1-win.u0)/s+LEFT+3,h:(win.z1-win.z0)/s+TITLE+3}),
    render:(box,s)=>elevation(c,'out',box,'wall-op',`รูปขยายช่องเปิด ${op.label||op.id}`,win,{...(s==='auto'?{want:20}:{n:s}),focus:['OP']})});}}
 const sizes=new Set(c.rows.map(r=>r.diameter)).size,groupsN=wallBbsSummary(c.m,c.rows,mode,qty).groups.length;
 out.push({key:'stddet',title:'รายละเอียดมาตรฐาน',paper:true,pref:PAPER_N,size:()=>({w:180,h:50}),render:box=>({prims:standardDetails(c,box),n:0,fits:true,miss:0})});
 out.push({key:'keyplan',title:'Key plan',paper:true,pref:PAPER_N,size:()=>({w:70,h:60}),render:box=>({prims:keyPlan(c,box),n:0,fits:true,miss:0})});
 out.push({key:'schedule',title:'น้ำหนักเหล็กต่อกลุ่ม',paper:true,pref:PAPER_N,size:()=>({w:46+20*(sizes+1),h:TITLE+4.4*(groupsN+2)+2}),render:box=>({prims:scheduleTable(c,box,mode,qty),n:0,fits:true,miss:0})});
 // a box is never narrower than its title (title + scale, 2.8 mm text)
 return out.map(d=>({...d,size:(n:number)=>{const z=d.size(n),tw=textWidth(`${d.key==='sec:wall-sec'?'รูปตัด A–A ผ่าน XX (u = 00000)':d.title} · 1:${n||100}`,2.8)+3;return {w:Math.max(z.w,tw),h:z.h};}}));
}
/** Drawing area and keep-outs of a wall sheet (header band, title block). */
export function wallSheetArea(size:WallPaper){const P=WALL_PAPER[size],M=WALL_SHEET.m,area={x:M,y:M,w:P.w-2*M,h:P.h-2*M};
 return {area,keep:[{x:M,y:M,w:P.w-2*M,h:WALL_SHEET.head},{x:P.w-M-WALL_SHEET.tb.w,y:P.h-M-WALL_SHEET.tb.h,w:WALL_SHEET.tb.w,h:WALL_SHEET.tb.h}]};}
// MaxRects free space of a sheet
const sub=(f:Box,o:Box):Box[]=>{if(o.x>=f.x+f.w||o.x+o.w<=f.x||o.y>=f.y+f.h||o.y+o.h<=f.y)return [f];const r:Box[]=[];
 if(o.x>f.x)r.push({x:f.x,y:f.y,w:o.x-f.x,h:f.h});if(o.x+o.w<f.x+f.w)r.push({x:o.x+o.w,y:f.y,w:f.x+f.w-o.x-o.w,h:f.h});
 if(o.y>f.y)r.push({x:f.x,y:f.y,w:f.w,h:o.y-f.y});if(o.y+o.h<f.y+f.h)r.push({x:f.x,y:o.y+o.h,w:f.w,h:f.y+f.h-o.y-o.h});return r.filter(b=>b.w>1&&b.h>1);};
const contains=(a:Box,b:Box)=>b.x>=a.x-1e-6&&b.y>=a.y-1e-6&&b.x+b.w<=a.x+a.w+1e-6&&b.y+b.h<=a.y+a.h+1e-6;
class Space{free:Box[];constructor(a:Box,keep:Box[]){this.free=[a];for(const k of keep)this.take({x:k.x-2,y:k.y-2,w:k.w+4,h:k.h+4});}
 take(b:Box){const next=this.free.flatMap(f=>sub(f,b));this.free=next.filter((f,i)=>!next.some((g,j)=>j!==i&&contains(g,f)&&!(contains(f,g)&&j>i)));}
 fit(w:number,h:number):Box|undefined{const c=this.free.filter(f=>f.w>=w&&f.h>=h).sort((a,b)=>a.y-b.y||a.x-b.x)[0];return c?{x:c.x,y:c.y,w,h}:undefined;}}
export type WallPlan={size:WallPaper;n:number;groups:WallGroup[];layout:SheetLayout;side:boolean};
/** System layout “ผนัง (Wall Run)”: elevations at 1:50 (else 1:75) on A2 (A3 for a short wall, A1 when A2 is not enough),
 * split by storey groups, both faces side by side or stacked; the details / section / opening detail / paper views packed
 * into the free space, else on a details sheet. */
function planWall(c:Ctx,mode:WallBbsMode,qty:number,force?:WallPaper):WallPlan{
 const run=c.i.run!,faces=run.rebar.layers===2?2:1,few=c.lv.lifts.length<=2&&c.zHi-c.zLo<=6000;
 const sizes:WallPaper[]=force?[force]:few?['A3','A2','A1']:['A2','A1'];
 let pick:{size:WallPaper;n:number;side:boolean;groups:WallGroup[]}|undefined;
 for(const size of sizes){const {area}=wallSheetArea(size),A={x:area.x,y:area.y+WALL_SHEET.head+2,w:area.w,h:area.h-WALL_SHEET.head-2},tbX=WALL_PAPER[size].w-WALL_SHEET.m-WALL_SHEET.tb.w-3;
  for(const n of [50,75]){const fw=(c.U+600)/n+LEFT+3;let side=false,hLim:number;
   if(faces===2&&2*fw+4<=A.w){side=true;hLim=A.h-(A.x+2*fw+4>tbX?WALL_SHEET.tb.h+4:0);}
   else if(fw<=A.w){hLim=(A.h-(A.x+fw>tbX?WALL_SHEET.tb.h+4:0)-3*(faces-1))/faces;}else continue;
   const maxH=(hLim-TITLE-3)*n,groups=storeyGroups(c,maxH);
   if(groups.some(g=>g.z1-g.z0>maxH+1))continue;
   if(size==='A3'&&groups.length>1)continue;
   pick={size,n,side,groups};break;}
  if(pick)break;}
 if(!pick){const size=force||'A1',{area}=wallSheetArea(size),n=autoScale(c.U+600,c.zHi-c.zLo+600,area.w-LEFT-3,(area.h-WALL_SHEET.head-WALL_SHEET.tb.h-10)/faces-TITLE-3,75);
  pick={size,n,side:false,groups:storeyGroups(c,Infinity)};}
 const {size,n,side,groups}=pick,defs=viewDefs(c,groups,n,mode,qty),{area,keep}=wallSheetArea(size),A={x:area.x,y:area.y+WALL_SHEET.head+2,w:area.w,h:area.h-WALL_SHEET.head-2};
 const sheets:{id:string;views:SheetLayout['sheets'][number]['views'];space:Space}[]=[];
 const newSheet=()=>{const sh={id:`s${sheets.length+1}`,views:[] as SheetLayout['sheets'][number]['views'],space:new Space(area,keep)};sh.space.take({x:area.x,y:area.y,w:area.w,h:WALL_SHEET.head+2});sheets.push(sh);return sh;};
 const put=(sh:typeof sheets[number],key:ViewKey,b:Box,k:number|'auto')=>{sh.views.push({view:key,x:Math.round(b.x*10)/10,y:Math.round(b.y*10)/10,w:Math.round(b.w*10)/10,h:Math.round(b.h*10)/10,n:k});sh.space.take({x:b.x-2,y:b.y-2,w:b.w+4,h:b.h+4});};
 for(const g of groups){const sh=newSheet(),els=defs.filter(d=>d.key.startsWith('sec:wall-out-')||d.key.startsWith('sec:wall-in-')).filter(d=>d.key.endsWith(`-${g.id}`));
  let x=A.x,y=A.y;for(const d of els){const s=d.size(n);put(sh,d.key,{x,y,w:s.w,h:s.h},n);if(side)x+=s.w+4;else y+=s.h+3;}}
 // details, section, opening detail, paper views: largest first, into the free space of any sheet, else a new sheet
 const rest=defs.filter(d=>!/^sec:wall-(out|in)-/.test(d.key)).map(d=>({d,s:d.size(d.paper?1:d.pref)})).sort((a,b)=>Number(a.d.paper)-Number(b.d.paper)||b.s.w*b.s.h-a.s.w*a.s.h);
 for(const {d,s} of rest){let done=false;
  for(const sh of sheets){const b=sh.space.fit(s.w,s.h);if(b){put(sh,d.key,b,d.paper?'auto':d.pref);done=true;break;}}
  if(done)continue;
  const sh=newSheet();let ss=s,k:number|'auto'=d.paper?'auto':d.pref;
  if(!sh.space.fit(ss.w,ss.h)&&!d.paper){const big=SCALES.find(x=>x>d.pref&&(()=>{const z=d.size(x);return !!sh.space.fit(z.w,z.h);})());if(big){k=big;ss=d.size(big);}}
  const b=sh.space.fit(ss.w,ss.h)||{x:A.x,y:A.y,w:Math.min(ss.w,A.w),h:Math.min(ss.h,A.h-WALL_SHEET.tb.h-4)};put(sh,d.key,b,k);}
 return {size,n,groups,side,layout:{version:1,unplaced:[],sheets:sheets.map(({id,views})=>({id,views}))}};
}

// ---------- sheet source (member + rows + options) ----------
export type WallSheetOpts={mode?:WallBbsMode;labels?:WallLabelMode;qty?:number;status:string;date:string;revision:string;layout?:SheetLayout};
type Src={m:Member;rows:WallRow[];project:Project;o:WallSheetOpts};
const optsOf=(m:Member,o:WallSheetOpts)=>({mode:o.mode||m.drawingSetup?.wallBbs||'lift',labels:o.labels||m.drawingSetup?.wallLabels||'typ',qty:o.qty||1});
const planCache=new WeakMap<object,Map<string,WallPlan>>();
/** System plan of a Wall Run member (cached per rows array). */
export function wallPlanOf(m:Member,rows:WallRow[],o:{mode?:WallBbsMode;labels?:WallLabelMode;qty?:number}={},force?:WallPaper):WallPlan|undefined{
 const c=ctxOf(m,rows,o.labels||'typ');if(!c)return;const p=optsOf(m,o as WallSheetOpts),key=`${p.mode}|${p.qty}|${force||m.drawingSetup?.sheetSize||''}`;
 let map=planCache.get(rows);if(!map){map=new Map();planCache.set(rows,map);}
 const hit=map.get(key);if(hit)return hit;const plan=planWall(c,p.mode,p.qty,force||m.drawingSetup?.sheetSize as WallPaper|undefined);map.set(key,plan);return plan;
}
const paperCache=new WeakMap<object,WallPaper>();
/** Paper size of a Wall Run member's sheets (member choice, else the system plan). */
export function wallPaperOf(m:Member):WallPaper{const own=m.drawingSetup?.sheetSize as WallPaper|undefined;if(own)return own;const hit=paperCache.get(m);if(hit)return hit;
 const p=wallPlanOf(m,[]),size=p?.size||'A2';paperCache.set(m,size);return size;}
/** Views of the wall sheet (Sheet Composer list): key, title, natural size at its preferred scale. */
export function wallViewList(m:Member,rows:WallRow[],o:{mode?:WallBbsMode;qty?:number}={}){
 const c=ctxOf(m,rows),plan=wallPlanOf(m,rows,o);if(!c||!plan)return [];const p=optsOf(m,o as WallSheetOpts);
 return viewDefs(c,plan.groups,plan.n,p.mode,p.qty).map(d=>({key:d.key,title:d.title,paper:d.paper,pref:d.pref,natural:d.size(d.paper?1:d.pref),size:d.size}));
}
function titleBlock(out:Prim[],P:{w:number;h:number},m:Member,project:Project,o:{status:string;date:string;revision:string},page:number,pages:number,title:string){
 const M=WALL_SHEET.m,tb={x:P.w-M-WALL_SHEET.tb.w,y:P.h-M-WALL_SHEET.tb.h,w:WALL_SHEET.tb.w,h:WALL_SHEET.tb.h};
 const lab=(x:number,y:number,l:string,v:string,size=2.4)=>out.push(text(x+1.5,y+3,l,1.7,{color:MUTED,layer:'titleBlock'}),text(x+1.5,y+8,v.slice(0,58),size,{bold:true,layer:'titleBlock'}));
 out.push(...[rect(tb,{width:.4}),line(tb.x,tb.y+10,tb.x+tb.w,tb.y+10),line(tb.x,tb.y+20,tb.x+tb.w,tb.y+20),line(tb.x,tb.y+30,tb.x+tb.w,tb.y+30),line(tb.x+tb.w/2,tb.y+20,tb.x+tb.w/2,tb.y+40)].map(p=>({...p,layer:'titleBlock' as const})));
 lab(tb.x,tb.y,'PROJECT',`${project.code} · ${project.name}`);lab(tb.x,tb.y+10,'TITLE',title);
 lab(tb.x,tb.y+20,'DWG. NO.',`${project.code}-W-${m.code}`);lab(tb.x+tb.w/2,tb.y+20,'MEMBER',m.code);
 lab(tb.x,tb.y+30,'DATE',o.date,2.2);lab(tb.x+tb.w/2,tb.y+30,'REV · SHEET',`${o.revision} · ${page+1}/${pages}`,2.2);
 out.push(text(tb.x,tb.y-2,o.status,2.4,{bold:true,color:'#a3402d',layer:'titleBlock'}));
}
const frame=(P:{w:number;h:number}):Prim[]=>[{...rect({x:WALL_SHEET.m-2,y:WALL_SHEET.m-2,w:P.w-2*WALL_SHEET.m+4,h:P.h-2*WALL_SHEET.m+4},{width:.6}),layer:'titleBlock'} as Prim];

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
const BBS_ROW=7.2;
function bbsPages(c:Ctx,P:{w:number;h:number},size:WallPaper,project:Project,o:WallSheetOpts,mode:WallBbsMode,qty:number,first:number,total:()=>number,title:string):WallSheetPage[]{
 const m=c.m,rows=c.rows,run=c.i.run!,items=wallBbsItems(m,rows,mode,qty),cols=[{h:'Mark',w:26},{h:'Ø',w:14},{h:'รูปเหล็ก',w:58},{h:'Shape',w:13},{h:'ยาวตัด (mm)',w:22},{h:'จำนวน',w:16},{h:'น้ำหนัก (kg)',w:22},{h:'หมายเหตุ',w:0}];
 const columns=size==='A3'?1:2,M=WALL_SHEET.m,tableW=(P.w-2*M-16-(columns-1)*12)/columns;cols[cols.length-1].w=Math.max(20,tableW-cols.slice(0,-1).reduce((n,c2)=>n+c2.w,0));
 const y0=M+WALL_SHEET.head+8,perCol=Math.floor((P.h-M-WALL_SHEET.tb.h-8-y0)/BBS_ROW)-1,perPage=perCol*columns,setOf=new Map(wallRunSets(m).map(s=>[s.id,s])),sum=wallBbsSummary(m,rows,mode,qty);
 const chunks:WallBbsItem[][]=[];for(let k=0;k<Math.max(1,items.length);k+=perPage)chunks.push(items.slice(k,k+perPage));
 return chunks.map((chunk,pi)=>{const out:Prim[]=[...frame(P),text(M+4,M+7,`BBS · ${m.code} · ${wallBbsModes.find(x=>x.id===mode)!.label}${qty>1?` · × ${qty} ชุด`:''}`,3.6,{bold:true}),
   text(M+4,M+11.5,`${wallTypeLabels[run.wallType]} · ${runLevels(run).lifts.length} ช่วงเท · แกนยาว ${fmt(axisLength(run),2)} m · เหล็กรวม ${fmt(sum.total,1)} kg`,2.3,{color:MUTED})];
  for(let col=0;col<columns;col++){const part=chunk.slice(col*perCol,(col+1)*perCol);if(!part.length)continue;const x0=M+8+col*(tableW+12);
   let x=x0;out.push(rect({x:x0,y:y0,w:tableW,h:BBS_ROW},{fill:'#233a44',stroke:'#233a44'}));for(const cl of cols){out.push(text(x+1,y0+4.8,cl.h,2.1,{color:'#ffffff',bold:true}));x+=cl.w;}
   part.forEach((it,k)=>{const y=y0+BBS_ROW*(k+1);
    if('head' in it){out.push(rect({x:x0,y,w:tableW,h:BBS_ROW},{fill:'#f5f3ff',stroke:LINE,width:.15}),text(x0+1.5,y+4.8,it.head,2.4,{bold:true,color:CONC}),...(it.sub?[text(x0+tableW-1.5,y+4.8,it.sub,2.2,{anchor:'end',color:CONC})]:[]));return;}
    const r=it.row,s=setOf.get(r.id);let cx=x0;out.push(line(x0,y+BBS_ROW,x0+tableW,y+BBS_ROW,LINE,.12));
    const cells=[r.mark,barName(r.diameter),'',r.shapeCode?`#${r.shapeCode}`:'',String(r.cutLength),String(it.count),fmt(it.weight,1),s?`${wallKindNames[s.kind]} · ${s.what}${s.every?' · ทุกช่วงเท':''}`.slice(0,Math.floor(cols[7].w/1.1)):''];
    cells.forEach((v,ci)=>{if(ci===2){const n0=out.length;barSketch(out,r.paths[0]||[],r.points||r.paths[0]||[],r.diameter,cx+2,y+1.2,cols[2].w-4,BBS_ROW-2.4,s?KIND_COLOR[s.kind]:INK);for(const q of out.slice(n0))q.layer=q.t==='text'?'dim':'barMain';}
     else out.push(text(ci>=4&&ci<=6?cx+cols[ci].w-1:cx+1,y+4.8,v,ci===7?1.8:2.2,{anchor:ci>=4&&ci<=6?'end':'start',bold:ci===0}));cx+=cols[ci].w;});});
   out.push(rect({x:x0,y:y0,w:tableW,h:BBS_ROW*(part.length+1)},{width:.3}));}
  if(pi===chunks.length-1){const used=Math.min(perCol,chunk.length),sx=columns>1&&chunk.length>perCol?M+8+tableW+12:M+8,sy=y0+BBS_ROW*((columns>1&&chunk.length>perCol?chunk.length-perCol:used)+1)+8;
   const boxH=P.h-M-WALL_SHEET.tb.h-6-sy;
   if(boxH>20){out.push(...scheduleTable(c,{x:sx,y:sy,w:Math.min(tableW,200),h:Math.min(boxH,TITLE+4.4*(sum.groups.length+2)+2)},mode,qty));
    const by=sy+Math.min(boxH,TITLE+4.4*(sum.groups.length+2)+2)+5,boq=[...(m.siteWork?.items||[]).filter(x=>/^gen-wall-/.test(x.id)).map(x=>`${x.label}: ${fmt(x.quantity*qty,2)} ${x.unit}`)];
    if(mode==='lift')boq.push(...wallRunLiftQuantities(m,rows).map(l=>`${l.name}: คอนกรีต ${fmt(l.concrete*qty,2)} m³ · แบบหล่อ ${fmt(l.formwork*qty,1)} m²`));
    boq.slice(0,Math.max(0,Math.floor((P.h-M-WALL_SHEET.tb.h-6-by)/3.6))).forEach((s2,k)=>out.push(text(sx,by+k*3.6,s2.slice(0,110),2,{color:MUTED})));}}
  titleBlock(out,P,m,project,o,first+pi,total(),`${title} · BBS`);
  return {prims:out,views:[],w:P.w,h:P.h,size,title:`BBS ${pi+1}`};});
}
// ---------- pages ----------
/** Every page of a Wall Run sheet set: drawing sheets of the layout (member's own from the Composer, the default template,
 * else the system layout), then the BBS pages. */
export function wallSheetPages(m:Member,rows:WallRow[],project:Project,o:WallSheetOpts):WallSheetPage[]{
 const p=optsOf(m,o),c=ctxOf(m,rows,p.labels),plan=wallPlanOf(m,rows,p);if(!c||!plan)return [];
 const size=plan.size,P=WALL_PAPER[size],layout=o.layout||m.sheetLayout||plan.layout,run=c.i.run!,title=`แบบเหล็กเสริม${wallTypeLabels[run.wallType]} ${m.code}`;
 const defs=new Map(viewDefs(c,plan.groups,plan.n,p.mode,p.qty).map(d=>[d.key,d]));
 const pages:WallSheetPage[]=[];let total=0;const tot=()=>total;
 layout.sheets.forEach((sh,si)=>{const out:Prim[]=[...frame(P),text(WALL_SHEET.m+3,WALL_SHEET.m+7,title,3.6,{bold:true,layer:'titleBlock'}),
   {...line(WALL_SHEET.m,WALL_SHEET.m+WALL_SHEET.head,P.w-WALL_SHEET.m,WALL_SHEET.m+WALL_SHEET.head,INK,.3),layer:'titleBlock'} as Prim],views:SheetViewInfo[]=[],paper:{key:ViewKey;box:Box}[]=[];let miss=0;
  for(const pv of sh.views){const d=defs.get(pv.view);if(!d)continue;const box={x:pv.x,y:pv.y,w:pv.w,h:pv.h};
   if(d.paper){out.push(...d.render(box,'auto').prims);paper.push({key:d.key,box});continue;}
   if(pv.show?.marks===false){/* labels off */}
   const r=d.render(box,pv.n);miss+=pv.show?.marks===false?0:r.miss;out.push(...(pv.show?.marks===false?r.prims.filter(q=>q.t!=='leader'):r.prims));if(r.info)views.push({...r.info,key:d.key,title:d.title});}
  pages.push({prims:out,views,w:P.w,h:P.h,size,title:`แบบ ${si+1}`,paper,miss});});
 pages.push(...bbsPages(c,P,size,project,o,p.mode,p.qty,pages.length,tot,title));
 total=pages.length;
 pages.forEach((pg,k)=>{if(k<layout.sheets.length)titleBlock(pg.prims,P,m,project,o,k,total,title);});
 return pages;
}
/** Label views of a page for the Mark label check (`labelReport`). */
export const wallSheetLabelViews=(p:WallSheetPage)=>p.views.map(v=>({id:v.id,title:v.title,box:v.box}));
/** Old entry point (W1): every page with the options. */
export function wallRunSheets(m:Member,rows:WallRow[],project:Project,o:WallSheetOpts):WallSheetPage[]{return wallSheetPages(m,rows,project,o);}
// ---------- adapter for the BBS sheet engine (bbsSheet.ts / Sheet Composer) ----------
const pagesCache=new WeakMap<object,{key:string;pages:WallSheetPage[]}>();
/** Pages of a sheet data object (cached per rows + layout + options). */
export function wallPagesOf(s:Pick<SheetData,'member'|'rows'|'project'|'quantity'|'status'|'revision'|'date'>&{wall?:{mode?:WallBbsMode;labels?:WallLabelMode}}):WallSheetPage[]{
 const key=JSON.stringify([s.member.sheetLayout||null,s.member.drawingSetup||null,s.wall||null,s.quantity,s.status,s.revision,s.date,s.member.code]),hit=pagesCache.get(s.rows);if(hit&&hit.key===key)return hit.pages;
 const size=wallPaperOf(s.member),layout=resolveSheetLayout({member:s.member,rows:s.rows,project:s.project,input:s.member.elementInput} as never,size).layout;
 const pages=wallSheetPages(s.member,s.rows as unknown as WallRow[],s.project,{...s.wall,qty:s.quantity,status:s.status,date:s.date,revision:s.revision,...(layout?{layout}:{})});pagesCache.set(s.rows,{key,pages});return pages;
}
export {textWidth};
