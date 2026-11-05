import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {expandPrims,textWidth,type Prim} from '../domain/drawingPrims';
import type {SheetViewInfo} from '../domain/bbsSheet';
import {anchorPoint,concreteBox,lostAnchors,viewSnapPoints,type ViewSnap} from '../domain/elementViews';
import {annotationKind,nextRevision,type Anchor,type AnnotationOverride,type DrawingEdits,type DrawingRevision,type UserAnnotation,type ViewEdits} from '../domain/drawingEdits';
import type {ViewKey} from '../domain/sheetLayoutSchema';
import {PrimsSvg} from './PrimsSvg';

/** Drawing Edit mode of the Sheet Composer (Tekla-style). Phase 1: select the annotations of the sheet (automatic ones by their
 * stable key, user objects), move / hide / retext them, add text (T) and leaders (L). Phase 2: user dimension chains (D, snaps on
 * concrete corners / edge midpoints / bars, add point A, remove point), level marks (E) on vertical sections, Mark leaders picked
 * from a bar (M), automatic dims turned into user dims, anchors lost when their bar is gone. Everything is written to
 * `member.drawingEdits` (`drawingEdits.ts`) through `commit`; `renderView` draws it, so SVG / PDF / DXF stay identical. */
type Info={prims:Prim[];views:SheetViewInfo[]};
type Box={x0:number;y0:number;x1:number;y1:number};
type Kind='mark'|'dim'|'cover'|'ex'|'level'|'text'|'leader'|'cloud';
export type Ann={id:string;view:SheetViewInfo;vk:ViewKey;key:string;user:boolean;kind:Kind;label:string;box:Box;prims:Prim[];dir?:'h'|'v'};
const KIND:Record<Kind,string>={mark:'ป้าย Mark',dim:'Dimension',cover:'ระยะหุ้ม C',ex:'Dimension EX',level:'ระดับ',text:'ข้อความ',leader:'Leader',cloud:'Revision cloud'};
const uid=()=>Math.random().toString(36).slice(2,9);
const r1=(v:number)=>Math.round(v*10)/10;
const SNAP_TOL=2.5;

function bboxOf(prims:Prim[]):Box{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;const add=(x:number,y:number)=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);};
 for(const p of expandPrims(prims)){
  if(p.t==='line'){add(p.x1,p.y1);add(p.x2,p.y2);}else if(p.t==='poly')p.pts.forEach(q=>add(q[0],q[1]));else if(p.t==='rect'){add(p.x,p.y);add(p.x+p.w,p.y+p.h);}
  else if(p.t==='circle'){add(p.cx-p.r,p.cy-p.r);add(p.cx+p.r,p.cy+p.r);}else if(p.t==='ellipse'){add(p.cx-p.rx,p.cy-p.ry);add(p.cx+p.rx,p.cy+p.ry);}
  else if(p.t==='text'){const w=textWidth(p.text,p.size),x=p.anchor==='middle'?p.x-w/2:p.anchor==='end'?p.x-w:p.x;add(x,p.y-p.size);add(x+w,p.y+p.size*.3);}}
 return {x0,y0,x1,y1};}
/** Distance (sheet mm) from a point to the drawing of primitives: segments, circles, text boxes (0 inside). */
function distTo(prims:Prim[],x:number,y:number){let d=Infinity;const seg=(x1:number,y1:number,x2:number,y2:number)=>{const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/l)):0;d=Math.min(d,Math.hypot(x-x1-t*dx,y-y1-t*dy));};
 const box=(x0:number,y0:number,x1:number,y1:number)=>{d=Math.min(d,Math.hypot(Math.max(x0-x,0,x-x1),Math.max(y0-y,0,y-y1)));};
 for(const p of expandPrims(prims)){
  if(p.t==='line')seg(p.x1,p.y1,p.x2,p.y2);else if(p.t==='poly')p.pts.forEach((q,i)=>{const n=p.pts[i+1]||(p.closed===false?undefined:p.pts[0]);if(n)seg(q[0],q[1],n[0],n[1]);});
  else if(p.t==='rect')box(p.x,p.y,p.x+p.w,p.y+p.h);else if(p.t==='circle')d=Math.min(d,Math.max(0,Math.hypot(x-p.cx,y-p.cy)-p.r));
  else if(p.t==='text'){const w=textWidth(p.text,p.size),x0=p.anchor==='middle'?p.x-w/2:p.anchor==='end'?p.x-w:p.x;box(x0,p.y-p.size,x0+w,p.y+p.size*.3);}}
 return d;}
/** Annotations of a drawn sheet: primitives grouped by (view, key); only views with a ViewKey (not beam groups / notes).
 * User objects take their kind from the edits (`kindOf`). */
export function sheetAnnotations(info:Info,kindOf?:(vk:string,key:string)=>Kind|undefined):Ann[]{
 const byView=new Map(info.views.filter(v=>v.key&&v.key!=='notes').map(v=>[v.id,v]));
 const groups=new Map<string,{view:SheetViewInfo;key:string;prims:Prim[]}>();
 for(const p of info.prims){if(!p.key||!p.view)continue;const v=byView.get(p.view);if(!v)continue;const id=`${v.key}|${p.key}`;let g=groups.get(id);if(!g)groups.set(id,g={view:v,key:p.key,prims:[]});g.prims.push(p);}
 return [...groups.entries()].map(([id,g])=>{const user=g.key.startsWith('user:'),sem=g.prims.find(p=>p.t==='dim'||p.t==='leader'||p.t==='mtext');
  const kind:Kind=user?kindOf?.(g.view.key!,g.key)||(sem?.t==='leader'?'leader':sem?.t==='dim'?'dim':'text'):annotationKind(g.key);
  const label=sem?.t==='leader'?sem.text.join(' / '):sem?.t==='mtext'?sem.lines.join(' / '):sem?.t==='dim'?g.prims.map(p=>p.t==='dim'?Math.round(p.value).toLocaleString('en-US'):'').filter(Boolean).join(' · '):
   (g.prims.find(p=>p.t==='text') as {text?:string}|undefined)?.text||g.key;
  return {id,view:g.view,vk:g.view.key!,key:g.key,user,kind,label,box:bboxOf(g.prims),prims:g.prims,...(sem?.t==='dim'?{dir:sem.dir}:{})};}).filter(a=>Number.isFinite(a.box.x0));
}
const viewEdits=(e:DrawingEdits|undefined,vk:string):ViewEdits=>e?.views[vk]||{};
const withView=(e:DrawingEdits|undefined,vk:string,f:(v:ViewEdits)=>ViewEdits):DrawingEdits=>({version:1,views:{...(e?.views||{}),[vk]:f(structuredClone(viewEdits(e,vk)))}});
/** Patch (undefined fields removed) or remove (null) the override of an automatic annotation. */
export function setOverride(e:DrawingEdits|undefined,vk:string,key:string,patch:Partial<AnnotationOverride>|null):DrawingEdits{
 return withView(e,vk,v=>{const over={...(v.over||{})};if(patch===null)delete over[key];else{const n:Record<string,unknown>={...over[key],...patch};for(const k of Object.keys(n))if(n[k]===undefined)delete n[k];if(Object.keys(n).length)over[key]=n as AnnotationOverride;else delete over[key];}return {...v,over};});}
/** Add / replace (same id, same place in the list) or remove (null) a user object. */
export function setUserObject(e:DrawingEdits|undefined,vk:string,id:string,o:UserAnnotation|null):DrawingEdits{
 return withView(e,vk,v=>{const objs=v.objs||[],i=objs.findIndex(x=>x.id===id);return {...v,objs:o?i<0?[...objs,o]:objs.map(x=>x.id===id?o:x):objs.filter(x=>x.id!==id)};});}
/** Anchor of a snap (concrete edge flags / bar kept), rounded to 0.1 mm. */
const anchorOf=(s:ViewSnap|{u:number;v:number}):Anchor=>({u:r1(s.u),v:r1(s.v),...('eu' in s&&s.eu?{eu:s.eu}:{}),...('ev' in s&&s.ev?{ev:s.ev}:{}),...('bar' in s&&s.bar?{bar:s.bar}:{}),...('pos' in s&&s.pos&&'bar' in s&&s.bar?{pos:s.pos,...(s.t!==undefined?{t:s.t}:{})}:{})});
/** Mark label of a bar row in a view (as the automatic labels), for the fallback text of Mark leaders. */
const markText=(view:SheetViewInfo,bar:string)=>{const b=view.data?.bars.find(x=>x.row.id===bar);if(!b)return bar;const d=b.row.diameter;return b.dist?`${b.row.mark} ${b.dist.n}-${d<=9?'RB':'DB'}${d}@${Math.round(b.dist.spacing/5)*5}`:b.row.mark;};

type Tool='select'|'text'|'leader'|'dim'|'level'|'mark'|'addpt'|'cloud'|'reanchor';
type Snap={view:SheetViewInfo;s:ViewSnap;x:number;y:number};
type Pend={kind:'leader'|'mark'|'cloud';view:SheetViewInfo;at:[number,number];bar?:string;pos?:'first'|'last';t?:number}|{kind:'dim';view:SheetViewInfo;pts:Anchor[]};
type Drag={ann:Ann;x0:number;y0:number;dx:number;dy:number;moved:boolean};
/** context menu (client px) on an annotation or at a sheet point */
type Menu={cx:number;cy:number;ann?:string;x:number;y:number};
type ListFilter='all'|'user'|'edited'|'lost';
const BADGE:Record<Kind,string>={mark:'MRK',dim:'DIM',cover:'C',ex:'EX',level:'LVL',text:'TXT',leader:'LDR',cloud:'REV'};
const SNAP_TOOLS:Tool[]=['dim','level','mark','addpt','leader','reanchor'];
export function useDrawingEdit({info,edits,commit,readOnly,setMsg,status}:{info:Info;edits:DrawingEdits|undefined;commit:(e:DrawingEdits)=>void;readOnly:boolean;setMsg:(m:string)=>void;
 /** drawing status (P4) shown in the panel */ status?:{state:string;label:string;detail:string}}){
 const [tool,setTool0]=useState<Tool>('select'),[sel,setSel]=useState<string>(),[hover,setHover]=useState<{x:number;y:number;ann?:string;snap?:Snap}>();
 const [pend,setPend]=useState<Pend>(),[drag,setDrag0]=useState<Drag>(),[focusText,setFocusText]=useState(0);
 const [menu,setMenu]=useState<Menu>(),[filter0,setFilter]=useState<ListFilter>('all');
 // the drag also lives in a ref: the release may come from the window (outside the sheet) and must be applied once
 const dragRef=useRef<Drag|undefined>(undefined),setDrag=(d:Drag|undefined)=>{dragRef.current=d;setDrag0(d);};
 const setTool=(t:Tool)=>{setTool0(t);setPend(undefined);};
 const objOf=(vk:string,key:string)=>viewEdits(edits,vk).objs?.find(o=>`user:${o.id}`===key);
 const anns=useMemo(()=>sheetAnnotations(info,(vk,key)=>objOf(vk,key)?.kind),[info,edits]),selAnn=anns.find(a=>a.id===sel);
 // snap points per drawn view (cached on the view data object)
 const snapCache=useRef(new WeakMap<object,ViewSnap[]>());
 const snapsOf=(v:SheetViewInfo)=>{if(!v.data)return [];let s=snapCache.current.get(v.data);if(!s){s=viewSnapPoints(v.data);snapCache.current.set(v.data,s);}return s;};
 const lost=useMemo(()=>new Set(info.views.flatMap(v=>v.key&&v.data?lostAnchors(v.data,viewEdits(edits,v.key)).map(id=>`${v.key}|user:${id}`):[])),[info,edits]);
 const viewAt=(x:number,y:number)=>info.views.find(v=>v.key&&v.key!=='notes'&&v.n>0&&x>=v.box.x&&x<=v.box.x+v.box.w&&y>=v.box.y&&y<=v.box.y+v.box.h);
 const toModel=(v:SheetViewInfo,x:number,y:number):[number,number]=>[r1(v.origin.model[0]+(x-v.origin.sheet[0])/v.s),r1(v.origin.model[1]-(y-v.origin.sheet[1])/v.s)];
 const toSheet=(v:SheetViewInfo,u:number,w:number):[number,number]=>[v.origin.sheet[0]+(u-v.origin.model[0])*v.s,v.origin.sheet[1]-(w-v.origin.model[1])*v.s];
 const anchorSheet=(v:SheetViewInfo,a:Anchor)=>{const [u,w]=v.data?anchorPoint(a,concreteBox(v.data),v.data.bars):[a.u,a.v];return toSheet(v,u,w);};
 const findSnap=(x:number,y:number,only?:SheetViewInfo,bars=false):Snap|undefined=>{const v=only||viewAt(x,y);if(!v)return;let best:Snap|undefined,bd=SNAP_TOL;
  for(const s of snapsOf(v)){if(bars&&s.kind!=='bar')continue;const [sx,sy]=toSheet(v,s.u,s.v),d=Math.hypot(sx-x,sy-y);if(d<bd||d<bd+.2&&best&&best.s.kind==='bar'&&s.kind!=='bar'){bd=Math.min(bd,d);best={view:v,s,x:sx,y:sy};}}
  return best;};
 // pick: the annotation whose drawn lines / text lie nearest the cursor (≤ 1.5 mm), ties → smaller box
 const hit=(x:number,y:number)=>anns.filter(a=>x>=a.box.x0-1.5&&x<=a.box.x1+1.5&&y>=a.box.y0-1.5&&y<=a.box.y1+1.5).map(a=>({a,d:distTo(a.prims,x,y)})).filter(c=>c.d<=1.5)
  .sort((p,q)=>p.d-q.d||(p.a.box.x1-p.a.box.x0)*(p.a.box.y1-p.a.box.y0)-(q.a.box.x1-q.a.box.x0)*(q.a.box.y1-q.a.box.y0))[0]?.a;
 const over=(a:Ann)=>viewEdits(edits,a.vk).over?.[a.key];
 const obj=(a:Ann)=>objOf(a.vk,a.key);
 const movable=(a:Ann)=>a.kind!=='cover'&&a.kind!=='ex';
 const vertical=(v:SheetViewInfo)=>v.data?.normal!==undefined&&v.data.normal!==2;
 /** commit a move of (dx, dy) sheet mm: Marks / leaders move the text, dims the dimension line, levels sideways, user text its point */
 const moveBy=(a:Ann,dx:number,dy:number)=>{if(readOnly||!movable(a))return;const o=over(a)||{},u=obj(a);
  if(u){if(u.kind==='text')commit(setUserObject(edits,a.vk,u.id,{...u,at:[r1(u.at[0]+dx/a.view.s),r1(u.at[1]-dy/a.view.s)]}));
   else if(u.kind==='leader')commit(setUserObject(edits,a.vk,u.id,{...u,dx:r1(u.dx+dx),dy:r1(u.dy+dy)}));
   else if(u.kind==='dim')commit(setUserObject(edits,a.vk,u.id,{...u,off:r1(u.off+(u.dir==='v'?dx:dy))}));
   else if(u.kind==='cloud')commit(setUserObject(edits,a.vk,u.id,{...u,pts:u.pts.map(q=>[r1(q[0]+dx/a.view.s),r1(q[1]-dy/a.view.s)] as [number,number])}));
   else commit(setUserObject(edits,a.vk,u.id,{...u,dx:r1(u.dx+dx)}));return;}
  if(a.kind==='mark')commit(setOverride(edits,a.vk,a.key,{dx:r1((o.dx||0)+dx)||undefined,dy:r1((o.dy||0)+dy)||undefined}));
  else if(a.kind==='dim')commit(setOverride(edits,a.vk,a.key,{off:r1((o.off||0)+(a.dir==='v'?dx:dy))||undefined}));
  else if(a.kind==='level')commit(setOverride(edits,a.vk,a.key,{dx:r1((o.dx||0)+dx)||undefined}));};
 const remove=(a:Ann)=>{if(readOnly)return;const u=obj(a);commit(u?setUserObject(edits,a.vk,u.id,null):setOverride(edits,a.vk,a.key,{hidden:true}));setSel(undefined);};
 const created=(v:SheetViewInfo,o:UserAnnotation,text=false)=>{commit(setUserObject(edits,v.key!,o.id,o));setSel(`${v.key}|user:${o.id}`);setTool('select');if(text)setFocusText(n=>n+1);};
 const dimDir=(pts:Anchor[]):'h'|'v'=>{const us=pts.map(p=>p.u),vs=pts.map(p=>p.v);return Math.max(...us)-Math.min(...us)>=Math.max(...vs)-Math.min(...vs)?'h':'v';};
 const placeDim=(p:Extract<Pend,{kind:'dim'}>,x:number,y:number)=>{const dir=dimDir(p.pts),[fx,fy]=anchorSheet(p.view,p.pts[0]);
  created(p.view,{id:`d${uid()}`,kind:'dim',pts:p.pts,dir,off:r1(dir==='h'?y-fy:x-fx)});};
 /** automatic dimension chain → user dimension (points from its segments, corners follow the concrete) + the automatic one hidden */
 const detachDim=(a:Ann)=>{if(readOnly||a.user||a.kind!=='dim'||!a.view.data)return;const segs=a.prims.filter(p=>p.t==='dim');if(!segs.length)return;
  const cb=concreteBox(a.view.data),near=(p:number,q:number)=>Math.abs(p-q)<.6,flag=(u:number,w:number):Anchor=>({u:r1(u),v:r1(w),...(near(u,cb.u0)?{eu:'min' as const}:near(u,cb.u1)?{eu:'max' as const}:{}),...(near(w,cb.v0)?{ev:'min' as const}:near(w,cb.v1)?{ev:'max' as const}:{})});
  const d0=segs[0];if(d0.t!=='dim')return;const raw=[d0.a,...segs.map(p=>p.t==='dim'?p.b:d0.b)],pts=raw.map(p=>flag(...toModel(a.view,p[0],p[1]))),[fx,fy]=toSheet(a.view,pts[0].u,pts[0].v);
  const off=d0.dir==='h'?d0.line[1]-fy:d0.line[0]-fx,id=`d${uid()}`,o=over(a);
  let next=setUserObject(edits,a.vk,id,{id,kind:'dim',pts,dir:d0.dir,off:r1(off),...(o?.text?{text:o.text}:{})});next=setOverride(next,a.vk,a.key,{hidden:true});commit(next);setSel(`${a.vk}|user:${id}`);};
 const down=(x:number,y:number)=>{
  const snap=SNAP_TOOLS.includes(tool)?findSnap(x,y,pend?.view,tool==='mark'):undefined;
  if(tool!=='select'&&readOnly)return;
  if(tool==='text'){const v=viewAt(x,y);if(!v){setMsg('คลิกในรูปที่มีมาตราส่วนเพื่อวางข้อความ');return;}created(v,{id:`t${uid()}`,kind:'text',at:toModel(v,x,y),lines:['ข้อความ']},true);return;}
  if(tool==='leader'||tool==='mark'){
   if(!pend){if(tool==='mark'&&!snap){setMsg('Mark: คลิกที่เหล็ก (จุด snap ○)');return;}const v=snap?.view||viewAt(x,y);if(!v){setMsg('คลิกจุดหัวลูกศรในรูปที่มีมาตราส่วน');return;}
    setPend({kind:tool,view:v,at:snap?[r1(snap.s.u),r1(snap.s.v)]:toModel(v,x,y),...(snap?.s.bar?{bar:snap.s.bar,...(snap.s.pos?{pos:snap.s.pos,...(snap.s.t!==undefined?{t:snap.s.t}:{})}:{})}:{})});return;}
   if(pend.kind==='dim')return;const [ax,ay]=toSheet(pend.view,...pend.at),id=`l${uid()}`;
   created(pend.view,{id,kind:'leader',at:pend.at,dx:r1(x-ax),dy:r1(y-ay),lines:[pend.kind==='mark'&&pend.bar?markText(pend.view,pend.bar):'ข้อความ'],arrow:'dot',...(pend.bar?{bar:pend.bar,...(pend.pos?{pos:pend.pos,...(pend.t!==undefined?{t:pend.t}:{})}:{})}:{}),...(pend.kind==='mark'?{fromMark:true as const}:{})},pend.kind==='leader');return;}
  if(tool==='dim'){
   if(!pend||pend.kind!=='dim'){if(!snap){setMsg('Dimension: คลิกจุด snap (มุม □ / กึ่งกลาง △ / เหล็ก ○)');return;}setPend({kind:'dim',view:snap.view,pts:[anchorOf(snap.s)]});return;}
   if(snap&&!pend.pts.some(p=>Math.abs(p.u-snap.s.u)<.5&&Math.abs(p.v-snap.s.v)<.5)){if(pend.pts.length>=20){setMsg('Dimension ได้ไม่เกิน 20 จุด');return;}setPend({...pend,pts:[...pend.pts,anchorOf(snap.s)]});return;}
   if(pend.pts.length>=2)placeDim(pend,x,y);return;}
  if(tool==='level'){if(!snap){setMsg('ระดับ: คลิกจุด snap บนรูปตัดแนวดิ่ง');return;}if(!vertical(snap.view)){setMsg('ระดับใช้ได้ในรูปตัดแนวดิ่งเท่านั้น');return;}
   created(snap.view,{id:`e${uid()}`,kind:'level',at:anchorOf(snap.s),dx:x>=snap.x?8:-8,label:'EL.'});return;}
  if(tool==='cloud'){const v=pend?.kind==='cloud'?pend.view:viewAt(x,y);if(!v){setMsg('Revision cloud: คลิกมุมแรกในรูป');return;}
   if(pend?.kind!=='cloud'){setPend({kind:'cloud',view:v,at:toModel(v,x,y)});return;}
   const [u0,v0]=pend.at,[u1,v1]=toModel(v,x,y);if(Math.abs(u1-u0)*v.s<2||Math.abs(v1-v0)*v.s<2){setMsg('ก้อนเมฆเล็กเกินไป');return;}
   // revision of the cloud: the latest one; a first cloud creates revision A (today)
   const revs=edits?.revisions||[],rev=revs.at(-1)?.rev||nextRevision(revs),id=`c${uid()}`;
   let next=setUserObject(edits,v.key!,id,{id,kind:'cloud',pts:[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],rev});
   if(!revs.length)next={...next,revisions:[{rev,date:new Date().toISOString().slice(0,10),desc:'แก้ไขแบบ',by:''}]};
   commit(next);setSel(`${v.key}|user:${id}`);setTool('select');return;}
  if(tool==='reanchor'){const u=selAnn&&obj(selAnn);if(!u||!selAnn||!selAnn.view.data){setTool('select');return;}
   const s2=findSnap(x,y,selAnn.view,u.kind!=='dim');if(!s2){setMsg(u.kind==='dim'?'คลิกจุด snap ในรูปเดียวกัน':'คลิกที่เหล็ก ○ ในรูปเดียวกัน');return;}
   const a=anchorOf(s2.s),ids=new Set(selAnn.view.data.bars.map(b=>b.row.id)),gone=(p:Anchor)=>!!p.bar&&!ids.has(p.bar);
   if(u.kind==='leader'){const {bar:_b,pos:_p,t:_t,fromMark:_f,...rest}=u;commit(setUserObject(edits,selAnn.vk,u.id,{...rest,at:[a.u,a.v],...(a.bar?{bar:a.bar,...(u.fromMark?{fromMark:true as const}:{}),...(a.pos?{pos:a.pos,...(a.t!==undefined?{t:a.t}:{})}:{})}:{})}));setTool('select');return;}
   if(u.kind==='level'){commit(setUserObject(edits,selAnn.vk,u.id,{...u,at:a}));setTool('select');return;}
   if(u.kind==='dim'){const i=u.pts.findIndex(gone);if(i<0){setTool('select');return;}const pts=u.pts.map((p,j)=>j===i?a:p);commit(setUserObject(edits,selAnn.vk,u.id,{...u,pts}));if(!pts.some(gone))setTool('select');return;}
   setTool('select');return;}
  if(tool==='addpt'){const u=selAnn&&obj(selAnn);if(!u||u.kind!=='dim'||!selAnn){setTool('select');return;}const s2=findSnap(x,y,selAnn.view);if(!s2){setMsg('คลิกจุด snap ในรูปเดียวกับ Dimension');return;}
   if(u.pts.length>=20){setMsg('Dimension ได้ไม่เกิน 20 จุด');return;}commit(setUserObject(edits,selAnn.vk,u.id,{...u,pts:[...u.pts,anchorOf(s2.s)]}));setTool('select');return;}
  const a=hit(x,y);setSel(a?.id);setFocusText(0);if(a&&!readOnly&&movable(a))setDrag({ann:a,x0:x,y0:y,dx:0,dy:0,moved:false});};
 const move=(x:number,y:number)=>{
  if(drag){let dx=x-drag.x0,dy=y-drag.y0;const u=obj(drag.ann),dir=u?.kind==='dim'?u.dir:drag.ann.dir;
   if(drag.ann.kind==='dim'){if(dir==='v')dy=0;else dx=0;}if(drag.ann.kind==='level')dy=0;setDrag({...drag,dx,dy,moved:drag.moved||Math.hypot(dx,dy)>.3});return;}
  const snap=SNAP_TOOLS.includes(tool)?findSnap(x,y,pend?.view||(tool==='addpt'||tool==='reanchor'?selAnn?.view:undefined),tool==='mark'&&!pend||tool==='reanchor'&&obj(selAnn!)?.kind!=='dim'):undefined;
  setHover({x,y,ann:tool==='select'?hit(x,y)?.id:undefined,snap:tool==='leader'&&pend||tool==='mark'&&pend?undefined:snap});};
 const up=()=>{const d=dragRef.current;if(!d)return;setDrag(undefined);if(d.moved)moveBy(d.ann,d.dx,d.dy);};
 useEffect(()=>{if(!drag)return;const end=()=>up();window.addEventListener('pointerup',end);return()=>window.removeEventListener('pointerup',end);});
 /** keyboard of the edit mode; true = handled */
 const key=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();
  if(e.key==='Escape'){if(pend)setPend(undefined);else if(tool!=='select')setTool('select');else setSel(undefined);return true;}
  if(e.key==='Enter'&&pend?.kind==='dim'&&pend.pts.length>=2){const p=pend,[fx,fy]=anchorSheet(p.view,p.pts[0]),dir=dimDir(p.pts);placeDim(p,fx+(dir==='v'?-8:0),fy+(dir==='h'?-8:0));return true;}
  const tk:Record<string,Tool>={v:'select',t:'text',l:'leader',d:'dim',e:'level',m:'mark',a:'addpt',c:'cloud'};
  if(tk[k]){if(tk[k]==='select'||!readOnly){if(tk[k]==='addpt'){const u=selAnn&&obj(selAnn);if(u?.kind==='dim')setTool('addpt');else setMsg('เลือก Dimension ที่เพิ่มเองก่อน แล้วกด A');}else setTool(tk[k]);}return true;}
  if(!selAnn)return false;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(selAnn);return true;}
  const st=e.shiftKey?2:.5,d={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key];
  if(d){e.preventDefault();moveBy(selAnn,d[0],d[1]);return true;}
  return false;};
 /** sheet primitives without the annotation being dragged (its moved copy is drawn by the overlay) */
 const filter=(prims:Prim[])=>drag?.moved?prims.filter(p=>!(p.view===drag.ann.view.id&&p.key===drag.ann.key)):prims;
 const hov=anns.find(a=>a.id===hover?.ann),snapView=hover&&SNAP_TOOLS.includes(tool)?pend?.view||(tool==='addpt'||tool==='reanchor'?selAnn?.view:undefined)||viewAt(hover.x,hover.y):undefined;
 const marker=(s:ViewSnap,x:number,y:number,cls:string,r=.7)=>s.kind==='bar'?<circle className={cls} cx={x} cy={y} r={r}/>:s.kind==='mid'?<polygon className={cls} points={`${x},${y-r*1.2} ${x+r},${y+r*.8} ${x-r},${y+r*.8}`}/>:<rect className={cls} x={x-r} y={y-r} width={2*r} height={2*r}/>;
 const dimPreview=()=>{if(pend?.kind!=='dim'||!hover)return null;const pts=pend.pts.map(a=>anchorSheet(pend.view,a)),all=hover.snap?[...pts,[hover.snap.x,hover.snap.y] as [number,number]]:pts;
  if(pts.length<2)return <g className="ed-pend">{pts.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={.6}/>)}<polyline points={`${pts[0][0]},${pts[0][1]} ${hover.snap?.x??hover.x},${hover.snap?.y??hover.y}`}/></g>;
  const dir=dimDir(pend.pts),h=dir==='h',pos=h?hover.y:hover.x,sorted=[...all].sort((a,b)=>h?a[0]-b[0]:a[1]-b[1]),s=pend.view.s;
  return <g className="ed-pend">{sorted.map((p,i)=><line key={i} x1={p[0]} y1={p[1]} x2={h?p[0]:pos} y2={h?pos:p[1]}/>)}
   <line x1={h?sorted[0][0]:pos} y1={h?pos:sorted[0][1]} x2={h?sorted.at(-1)![0]:pos} y2={h?pos:sorted.at(-1)![1]}/>
   {sorted.slice(1).map((p,i)=>{const q=sorted[i],val=Math.round(Math.abs(h?p[0]-q[0]:p[1]-q[1])/s);return <text key={'t'+i} x={h?(p[0]+q[0])/2:pos-.9} y={h?pos-.9:(p[1]+q[1])/2} fontSize={2.6} textAnchor={h?'middle':'end'}>{val.toLocaleString('en-US')}</text>;})}</g>;};
 const overlay:ReactNode=<g className="ed-layer" pointerEvents="none">
  {snapView&&snapsOf(snapView).filter(s=>tool!=='mark'||pend||s.kind==='bar').slice(0,800).map((s,i)=>{const [x,y]=toSheet(snapView,s.u,s.v);return <g key={i}>{marker(s,x,y,'ed-snapc',.45)}</g>;})}
  {hov&&hov.id!==sel&&<rect className="ed-hover" x={hov.box.x0-.8} y={hov.box.y0-.8} width={hov.box.x1-hov.box.x0+1.6} height={hov.box.y1-hov.box.y0+1.6}/>}
  {anns.filter(a=>a.user&&a.id!==sel).map(a=><rect key={a.id} className={`ed-user${lost.has(a.id)?' lost':''}`} x={a.box.x0-.6} y={a.box.y0-.6} width={a.box.x1-a.box.x0+1.2} height={a.box.y1-a.box.y0+1.2}/>)}
  {selAnn&&!drag?.moved&&<rect className={`ed-sel${selAnn.user?' user':''}${lost.has(selAnn.id)?' lost':''}`} x={selAnn.box.x0-1} y={selAnn.box.y0-1} width={selAnn.box.x1-selAnn.box.x0+2} height={selAnn.box.y1-selAnn.box.y0+2}/>}
  {selAnn&&!drag&&(()=>{const u=obj(selAnn);if(u?.kind!=='dim')return null;const ids=new Set(selAnn.view.data?.bars.map(b=>b.row.id));return u.pts.map((p,i)=>{const [x,y]=anchorSheet(selAnn.view,p);return <circle key={i} className={`ed-grip${p.bar&&!ids.has(p.bar)?' lost':''}`} cx={x} cy={y} r={.8}/>;});})()}
  {drag?.moved&&<g transform={`translate(${drag.dx} ${drag.dy})`} opacity={.75}><PrimsSvg prims={drag.ann.prims}/><rect className="ed-sel" x={drag.ann.box.x0-1} y={drag.ann.box.y0-1} width={drag.ann.box.x1-drag.ann.box.x0+2} height={drag.ann.box.y1-drag.ann.box.y0+2}/></g>}
  {(pend?.kind==='leader'||pend?.kind==='mark')&&hover&&(()=>{const [ax,ay]=toSheet(pend.view,...pend.at);return <g className="ed-pend"><circle cx={ax} cy={ay} r={.8}/><polyline points={`${ax},${ay} ${hover.x},${hover.y} ${hover.x+(hover.x>=ax?3:-3)},${hover.y}`}/>
   {pend.kind==='mark'&&pend.bar&&<text x={hover.x+(hover.x>=ax?4:-4)} y={hover.y+.9} fontSize={2.6} textAnchor={hover.x>=ax?'start':'end'}>{markText(pend.view,pend.bar)}</text>}</g>;})()}
  {dimPreview()}
  {pend?.kind==='cloud'&&hover&&(()=>{const [ax,ay]=toSheet(pend.view,...pend.at);return <rect className="ed-cloud" x={Math.min(ax,hover.x)} y={Math.min(ay,hover.y)} width={Math.abs(hover.x-ax)} height={Math.abs(hover.y-ay)}/>;})()}
  {hover?.snap&&marker(hover.snap.s,hover.snap.x,hover.snap.y,'ed-snaph',1.3)}
 </g>;
 const hint=tool==='cloud'?pend?'คลิกมุมตรงข้าม':'Revision cloud: คลิกมุมแรก (ใช้ Rev ล่าสุด)':tool==='text'?'คลิกในรูปเพื่อวางข้อความ':tool==='leader'?pend?'คลิกตำแหน่งข้อความ':'คลิกจุดหัวลูกศร (snap เหล็ก = ยึดกับเหล็กนั้น)':
  tool==='mark'?pend?'คลิกตำแหน่งป้าย':'คลิกที่เหล็ก ○ เพื่อทำป้าย Mark':tool==='dim'?!pend?'Dimension: คลิกจุดแรก (□ มุม · △ กึ่งกลาง · ○ เหล็ก)':pend.kind==='dim'&&pend.pts.length<2?'คลิกจุดที่สอง':'คลิกจุด snap เพื่อต่อ chain · คลิกที่ว่างเพื่อวางเส้น · Enter = วางระยะมาตรฐาน':
  tool==='level'?'ระดับ: คลิกจุด snap บนรูปตัดแนวดิ่ง':tool==='reanchor'?'ยึดจุดใหม่: คลิกจุด snap (เหล็ก ○) แทนจุดที่หลุด · Esc = ยกเลิก':tool==='addpt'?'คลิกจุด snap ที่จะเพิ่มเข้า Dimension ที่เลือก':drag?.moved?`ย้าย ${drag.dx.toFixed(1)} · ${drag.dy.toFixed(1)} mm`:hov?`${KIND[hov.kind]}${hov.user?' (เพิ่มเอง)':''} · ${hov.label}`:'';
 const snapHint=hover?.snap?` · Snap: ${hover.snap.s.label}${hover.snap.s.eu||hover.snap.s.ev?' (ขอบคอนกรีต)':''}`:'';
 const tb=(t:Tool,label:string,k:string,dis=readOnly)=><button key={t} aria-pressed={tool===t} className={tool===t?'active':''} disabled={dis} onClick={()=>setTool(t)}>{label} <kbd>{k}</kbd></button>;
 const toolbar:ReactNode=<>{tb('select','เลือก / ย้าย','V',false)}{tb('dim','+ Dimension','D')}{tb('level','+ ระดับ','E')}{tb('mark','+ Mark','M')}{tb('text','+ ข้อความ','T')}{tb('leader','+ Leader','L')}{tb('cloud','+ ก้อนเมฆ Rev','C')}</>;
 const lostList=anns.filter(a=>lost.has(a.id));
 const edited=(a:Ann)=>!a.user&&!!over(a);
 const reanchor=(a:Ann)=>{if(readOnly)return;setSel(a.id);setTool('reanchor');};
 const editText=(a:Ann)=>{setSel(a.id);setFocusText(n=>n+1);};
 const canText=(a:Ann)=>{const u=obj(a);return u?u.kind==='text'||u.kind==='leader'&&!(u.fromMark&&!lost.has(a.id)):a.kind==='mark'||a.kind==='dim'||a.kind==='level';};
 /** right click: ends a running command (Tekla), else opens the menu of the annotation under the cursor / of the point */
 const context=(x:number,y:number,cx:number,cy:number)=>{if(pend||tool!=='select'){setTool('select');setMenu(undefined);return;}
  const a=hit(x,y);if(a){setSel(a.id);setFocusText(0);}else if(!viewAt(x,y)){setMenu(undefined);return;}setMenu({cx,cy,x,y,ann:a?.id});};
 useEffect(()=>{if(!menu)return;const close=(e:Event)=>{if(!(e.target instanceof Element&&e.target.closest('.ed-menu')))setMenu(undefined);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(undefined);};
  window.addEventListener('pointerdown',close,true);window.addEventListener('keydown',esc,true);window.addEventListener('scroll',close,true);
  return()=>{window.removeEventListener('pointerdown',close,true);window.removeEventListener('keydown',esc,true);window.removeEventListener('scroll',close,true);};},[menu]);
 const mAnn=menu?.ann?anns.find(a=>a.id===menu.ann):undefined,mView=menu&&!menu.ann?viewAt(menu.x,menu.y):undefined;
 const mi=(label:string,f:()=>void,o:{dis?:boolean;danger?:boolean;k?:string}={})=><button key={label} role="menuitem" className={o.danger?'danger-text':''} disabled={o.dis} onClick={()=>{setMenu(undefined);f();}}>{label}{o.k&&<kbd>{o.k}</kbd>}</button>;
 const menuEl:ReactNode=menu&&(mAnn||mView)?<div className="composer-ctx ed-menu" role="menu" style={{left:menu.cx,top:menu.cy}}>
  {mAnn?(()=>{const a=mAnn,u=obj(a),ro=readOnly;return <>
   <div className="ed-menu-head"><span className={`ed-badge k-${a.kind}${a.user?' user':''}`}>{BADGE[a.kind]}</span>{a.user?'เพิ่มเอง':'อัตโนมัติ'} · {a.label.slice(0,30)}</div>
   {canText(a)&&mi('แก้ข้อความ',()=>editText(a),{dis:ro})}
   {lost.has(a.id)&&mi('ยึดจุดใหม่',()=>reanchor(a),{dis:ro})}
   {u?.kind==='dim'&&mi('+ เพิ่มจุด',()=>{setSel(a.id);setTool('addpt');},{dis:ro,k:'A'})}
   {!a.user&&a.kind==='dim'&&mi('แยกเป็นของผู้ใช้',()=>detachDim(a),{dis:ro})}
   {!a.user&&mi('คืนค่า Auto',()=>commit(setOverride(edits,a.vk,a.key,null)),{dis:ro||!over(a)})}
   {a.user?mi('ลบ',()=>remove(a),{dis:ro,danger:true,k:'Del'}):mi('ซ่อน',()=>remove(a),{dis:ro,k:'Del'})}</>;})()
  :mView&&<>
   <div className="ed-menu-head">{mView.title}</div>
   {mi('+ ข้อความที่นี่',()=>created(mView,{id:`t${uid()}`,kind:'text',at:toModel(mView,menu.x,menu.y),lines:['ข้อความ']},true),{dis:readOnly,k:'T'})}
   {mi('+ Dimension',()=>setTool('dim'),{dis:readOnly,k:'D'})}
   {mi('+ Mark',()=>setTool('mark'),{dis:readOnly,k:'M'})}
   {mi('+ Leader',()=>setTool('leader'),{dis:readOnly,k:'L'})}
   {vertical(mView)&&mi('+ ระดับ',()=>setTool('level'),{dis:readOnly,k:'E'})}</>}
 </div>:null;
 /** object list (left column): the annotations of the sheet per view, user objects first; click = select, double click = edit text */
 const shown=anns.filter(a=>filter0==='all'||(filter0==='user'?a.user:filter0==='edited'?edited(a):lost.has(a.id)));
 const nUser=anns.filter(a=>a.user).length,nEdited=anns.filter(edited).length;
 const list:ReactNode=<div className="ed-list">
  <h4>วัตถุบนแผ่น <small>{nUser} เพิ่มเอง · {anns.length-nUser} auto</small></h4>
  <div className="segmented ed-filter" role="group" aria-label="กรองวัตถุ">{([['all','ทั้งหมด'],['user',`เพิ่มเอง ${nUser}`],['edited',`แก้แล้ว ${nEdited}`],['lost',`หลุด ${lostList.length}`]] as [ListFilter,string][])
   .filter(([f])=>f!=='lost'||lostList.length||filter0==='lost').map(([f,l])=><button key={f} type="button" className={filter0===f?'active':''} aria-pressed={filter0===f} onClick={()=>setFilter(f)}>{l}</button>)}</div>
  {info.views.filter(v=>v.key&&v.key!=='notes').map(v=>{const items=shown.filter(a=>a.view.id===v.id).sort((p,q)=>Number(q.user)-Number(p.user));if(!items.length)return null;
   return <div key={v.id} className="ed-group"><div className="ed-group-head">{v.title}{v.n>0?` · 1:${v.n}`:''} <small>{items.length}</small></div>
    {items.slice(0,250).map(a=><div key={a.id} role="button" tabIndex={0} className={`ed-item${a.id===sel?' active':''}${a.user?' user':''}${lost.has(a.id)?' lost':''}`}
     onClick={()=>{setSel(a.id);setFocusText(0);}} onDoubleClick={()=>canText(a)&&editText(a)} onKeyDown={e=>{if(e.key==='Enter')setSel(a.id);}}
     onContextMenu={e=>{e.preventDefault();setSel(a.id);setMenu({cx:e.clientX,cy:e.clientY,x:0,y:0,ann:a.id});}}>
     <span className={`ed-badge k-${a.kind}${a.user?' user':''}`}>{BADGE[a.kind]}</span><span className="ed-name">{a.label||KIND[a.kind]}</span>
     {lost.has(a.id)?<small className="ed-flag lost">หลุด</small>:edited(a)?<small className="ed-flag">แก้</small>:null}</div>)}
    {items.length>250&&<p className="muted">… อีก {items.length-250} รายการ</p>}</div>;})}
  {!shown.length&&<p className="muted">{filter0==='all'?'ยังไม่มีวัตถุ':'ไม่มีรายการ'}</p>}
  <p className="muted composer-hint">คลิก = เลือก · ดับเบิลคลิก = แก้ข้อความ · คลิกขวา = เมนู (บนแผ่นด้วย) · คลิกขวาระหว่างใช้เครื่องมือ = จบคำสั่ง</p>
 </div>;
 const panel:ReactNode=<EditPanel status={status} ann={selAnn} edits={edits} readOnly={readOnly} info={info} commit={commit} focusText={focusText} over={selAnn?over(selAnn):undefined} obj={selAnn?obj(selAnn):undefined}
  lost={!!selAnn&&lost.has(selAnn.id)} lostList={lostList} onPick={setSel} onReanchor={()=>selAnn&&reanchor(selAnn)} onRemove={()=>selAnn&&remove(selAnn)} onAddPoint={()=>setTool('addpt')} onDetach={()=>selAnn&&detachDim(selAnn)}/>;
 return {tool,down,move,up,key,filter,overlay,toolbar,panel,list,menu:menuEl,context,hint:hint+snapHint,cursor:tool!=='select'?'crosshair':drag?.moved?'grabbing':hov?'pointer':'default',clear:()=>{setSel(undefined);setPend(undefined);setDrag(undefined);setMenu(undefined);}};
}

function EditPanel({status,ann,edits,readOnly,info,commit,focusText,over,obj,lost,lostList,onPick,onReanchor,onRemove,onAddPoint,onDetach}:{status?:{state:string;label:string;detail:string};ann?:Ann;edits:DrawingEdits|undefined;readOnly:boolean;info:Info;commit:(e:DrawingEdits)=>void;focusText:number;over?:AnnotationOverride;obj?:UserAnnotation;
 lost:boolean;lostList:Ann[];onPick:(id:string)=>void;onReanchor:()=>void;onRemove:()=>void;onAddPoint:()=>void;onDetach:()=>void}){
 const keys=new Set(info.views.map(v=>v.key).filter(Boolean) as string[]);
 const hidden=Object.entries(edits?.views||{}).filter(([vk])=>keys.has(vk)).flatMap(([vk,v])=>Object.entries(v.over||{}).filter(([,o])=>o.hidden).map(([key])=>({vk,key,title:info.views.find(x=>x.key===vk)?.title||vk})));
 const userCount=Object.values(edits?.views||{}).reduce((n,v)=>n+(v.objs?.length||0),0),overCount=Object.values(edits?.views||{}).reduce((n,v)=>n+Object.keys(v.over||{}).length,0);
 const setO=(patch:Partial<AnnotationOverride>|null)=>ann&&commit(setOverride(edits,ann.vk,ann.key,patch));
 const setU=(o:UserAnnotation)=>ann&&commit(setUserObject(edits,ann.vk,o.id,o));
 const num=(v:string)=>{const n=Number(v);return Number.isFinite(n)?Math.max(-500,Math.min(500,r1(n))):0;};
 const lines=(v:string)=>v.split('\n').slice(0,10).map(l=>l.slice(0,200));
 const ptLabel=(a:Anchor)=>`${a.eu?`${a.eu==='min'?'ขอบซ้าย':'ขอบขวา'}`:Math.round(a.u).toLocaleString()} , ${a.ev?`${a.ev==='min'?'ขอบล่าง':'ขอบบน'}`:Math.round(a.v).toLocaleString()}${a.bar?' · เหล็ก':''}`;
 const datum=ann?.view.data?.datum;
 return <div className="ed-panel">
  {status&&status.state!=='auto'&&<p className={`notice ${status.state==='ok'?'':'warning'}`}><b>{status.label}</b>{status.detail?` · ${status.detail}`:''}{status.state==='check'?' · ตรวจแล้วกด “เสร็จ” เพื่อยืนยัน':''}</p>}
  {lostList.length>0&&<div className="notice danger"><b>หลุดจุดยึด {lostList.length} รายการ</b> — เหล็กที่ยึดไว้ไม่อยู่ในรูปแล้ว (แสดงสีแดง) · ลบหรือวางใหม่
   <div className="ed-lost">{lostList.slice(0,8).map(a=><button key={a.id} onClick={()=>onPick(a.id)}>{a.view.title} · {KIND[a.kind]} · {a.label.slice(0,24)}</button>)}</div></div>}
  {!ann?<><p className="muted">คลิก Dimension, ป้าย Mark, ระดับ หรือข้อความบนแผ่นเพื่อแก้ · ลากเพื่อย้าย · Delete = ซ่อน / ลบ · ลูกศร 0.5 mm (Shift 2 mm)</p>
    <p className="muted">เพิ่มเอง: Dimension (D) คลิกจุด snap ต่อเป็น chain แล้วคลิกที่ว่างเพื่อวาง · ระดับ (E) บนรูปตัด · Mark (M) คลิกเหล็กแล้ววางป้าย · ข้อความ (T) · Leader (L)</p>
    <p className="muted">ของที่แก้เก็บแยกจากแบบอัตโนมัติ จึงคงอยู่เมื่อสร้างแบบใหม่ · ตอนนี้แก้ {overCount} รายการ · เพิ่มเอง {userCount} รายการ</p></>:<>
   <div className="sel-head"><small>{ann.view.title} · {ann.user?'เพิ่มโดยผู้ใช้':'สร้างอัตโนมัติ'}</small><b>{obj?.kind==='leader'&&obj.fromMark?'ป้าย Mark (เพิ่มเอง)':KIND[ann.kind]}</b></div>
   {lost&&<div className="notice danger">เหล็กที่ยึดไว้ไม่อยู่ในรูปนี้แล้ว: ยึดกับเหล็กเส้นใหม่ หรือลบทิ้ง<div className="actions"><button disabled={readOnly} onClick={onReanchor}>ยึดจุดใหม่</button></div></div>}
   {!ann.user&&<p className="muted ed-label">{ann.label}</p>}
   {!ann.user&&ann.kind==='mark'&&<>
    <label className="field"><span>ข้อความป้าย (ว่าง = ตาม Mark)</span><textarea key={`${ann.id}-${focusText}`} autoFocus={focusText>0} rows={2} disabled={readOnly} value={over?.text??''} placeholder={ann.label} onChange={e=>setO({text:e.target.value?e.target.value.slice(0,200):undefined})}/></label>
    <div className="form-grid"><label className="field"><span>เลื่อน x (mm)</span><input type="number" step={.5} disabled={readOnly} value={over?.dx||0} onChange={e=>setO({dx:num(e.target.value)||undefined})}/></label>
     <label className="field"><span>เลื่อน y (mm)</span><input type="number" step={.5} disabled={readOnly} value={over?.dy||0} onChange={e=>setO({dy:num(e.target.value)||undefined})}/></label></div></>}
   {!ann.user&&ann.kind==='dim'&&<>
    <label className="field"><span>ข้อความ (&lt;&gt; = ค่าที่วัดได้, ว่าง = ค่าจริง)</span><input key={`${ann.id}-${focusText}`} autoFocus={focusText>0} disabled={readOnly} value={over?.text??''} placeholder="<>" maxLength={200} onChange={e=>setO({text:e.target.value||undefined})}/></label>
    <label className="field"><span>เลื่อนเส้น Dimension ({ann.dir==='v'?'x':'y'}, mm)</span><input type="number" step={.5} disabled={readOnly} value={over?.off||0} onChange={e=>setO({off:num(e.target.value)||undefined})}/></label></>}
   {!ann.user&&ann.kind==='level'&&<>
    <label className="field"><span>ข้อความระดับ (ว่าง = ตามแบบ)</span><input key={`${ann.id}-${focusText}`} autoFocus={focusText>0} disabled={readOnly} value={over?.text??''} placeholder={ann.label} maxLength={200} onChange={e=>setO({text:e.target.value||undefined})}/></label>
    <label className="field"><span>เลื่อนสัญลักษณ์ x (mm)</span><input type="number" step={.5} disabled={readOnly} value={over?.dx||0} onChange={e=>setO({dx:num(e.target.value)||undefined})}/></label></>}
   {!ann.user&&(ann.kind==='cover'||ann.kind==='ex')&&<p className="muted">รายการนี้ซ่อนได้อย่างเดียว</p>}
   {obj?.kind==='dim'&&<>
    <label className="field"><span>ข้อความ (&lt;&gt; = ค่าที่วัดได้, ว่าง = ค่าจริง)</span><input disabled={readOnly} value={obj.text??''} placeholder="<>" maxLength={200} onChange={e=>setU({...obj,text:e.target.value||undefined})}/></label>
    <div className="field"><span>แนว</span><div className="segmented">{(['h','v'] as const).map(d=><button key={d} type="button" disabled={readOnly} className={obj.dir===d?'active':''} onClick={()=>setU({...obj,dir:d})}>{d==='h'?'แนวนอน':'แนวตั้ง'}</button>)}</div></div>
    <div className="form-grid"><label className="field"><span>ระยะเส้นจากจุดแรก (mm)</span><input type="number" step={.5} disabled={readOnly} value={obj.off} onChange={e=>setU({...obj,off:num(e.target.value)})}/></label>
     <label className="field"><span>ขนาดตัวอักษร (mm)</span><input type="number" min={1.5} max={10} step={.1} disabled={readOnly} value={obj.size??2.6} onChange={e=>{const n=Number(e.target.value);if(n>=1.5&&n<=10)setU({...obj,size:n});}}/></label></div>
    <div className="field"><span>จุดวัด ({obj.pts.length}) · ขอบ = ตามขอบคอนกรีตเมื่อขนาดเปลี่ยน</span><div className="ed-pts">{obj.pts.map((p,i)=><div key={i}><code>{ptLabel(p)}</code>{obj.pts.length>2&&<button disabled={readOnly} aria-label="ลบจุด" onClick={()=>setU({...obj,pts:obj.pts.filter((_,j)=>j!==i)})}>×</button>}</div>)}</div></div>
    <div className="actions"><button disabled={readOnly||obj.pts.length>=20} onClick={onAddPoint}>+ เพิ่มจุด (A)</button></div></>}
   {obj?.kind==='cloud'&&<label className="field"><span>Revision</span><select disabled={readOnly} value={obj.rev} onChange={e=>setU({...obj,rev:e.target.value})}>
    {[...new Set([obj.rev,...(edits?.revisions||[]).map(r=>r.rev)])].map(r=><option key={r} value={r}>{r}{(edits?.revisions||[]).find(x=>x.rev===r)?` · ${(edits?.revisions||[]).find(x=>x.rev===r)!.desc}`:' (ไม่มีในตาราง)'}</option>)}</select></label>}
   {obj?.kind==='level'&&<>
    <div className="field"><span>ระดับ{datum===undefined?' (นับจากฐานสมาชิก: ไม่มีระดับอ้างอิง)':''}</span><code>{(()=>{const z=(datum??0)+(obj.at.v)/1000;return `${z>0?'+':z<0?'−':'±'}${Math.abs(z).toFixed(3)} m`;})()}</code></div>
    <div className="form-grid"><label className="field"><span>ชื่อ</span><input disabled={readOnly} maxLength={40} value={obj.label} onChange={e=>setU({...obj,label:e.target.value})}/></label>
     <label className="field"><span>ระยะสัญลักษณ์ (mm)</span><input type="number" step={.5} disabled={readOnly} value={obj.dx} onChange={e=>setU({...obj,dx:num(e.target.value)})}/></label></div></>}
   {(obj?.kind==='text'||obj?.kind==='leader')&&<>
    {obj.kind==='leader'&&obj.bar&&<label className="check"><input type="checkbox" disabled={readOnly} checked={!!obj.fromMark} onChange={e=>setU({...obj,fromMark:e.target.checked||undefined})}/>ข้อความตาม Mark ของเหล็ก (เปลี่ยนตามจำนวน / ระยะ)</label>}
    {!(obj.kind==='leader'&&obj.fromMark&&!lost)&&<label className="field"><span>ข้อความ (หลายบรรทัดได้)</span><textarea key={`${obj.id}-${focusText}`} autoFocus={focusText>0} rows={3} disabled={readOnly} value={obj.lines.join('\n')} onFocus={e=>e.currentTarget.select()} onChange={e=>setU({...obj,lines:lines(e.target.value)})}/></label>}
    <div className="form-grid"><label className="field"><span>ขนาดตัวอักษร (mm)</span><input type="number" min={1.5} max={10} step={.1} disabled={readOnly} value={obj.size??2.6} onChange={e=>{const n=Number(e.target.value);if(n>=1.5&&n<=10)setU({...obj,size:n});}}/></label>
     {obj.kind==='leader'?<label className="field"><span>หัวลูกศร</span><select disabled={readOnly} value={obj.arrow} onChange={e=>setU({...obj,arrow:e.target.value as 'dot'|'closed'|'none'})}><option value="dot">จุด</option><option value="closed">ลูกศรทึบ</option><option value="none">ไม่มี</option></select></label>
      :<label className="check"><input type="checkbox" disabled={readOnly} checked={!!obj.bold} onChange={e=>setU({...obj,bold:e.target.checked||undefined})}/>ตัวหนา</label>}</div>
    <p className="muted">{obj.kind==='leader'?`หัวลูกศร${obj.bar?'ยึดกับเหล็ก':''}ที่ (${obj.at[0].toLocaleString()}, ${obj.at[1].toLocaleString()} mm) · ลากเพื่อย้ายข้อความ`:`ยึดกับตำแหน่งในรูป (${obj.at[0].toLocaleString()}, ${obj.at[1].toLocaleString()} mm): ย้ายตามเมื่อย้ายหรือเปลี่ยนมาตราส่วนรูป`}</p></>}
   <div className="actions">
    {ann.user?<button className="danger-text" disabled={readOnly} onClick={onRemove}>ลบ</button>:<>
     <button disabled={readOnly} onClick={onRemove}>ซ่อน</button>
     <button disabled={readOnly||!over} onClick={()=>setO(null)}>คืนค่า Auto</button>
     {ann.kind==='dim'&&<button disabled={readOnly} title="สร้าง Dimension ของผู้ใช้จากเส้นนี้ (เพิ่ม / ลบจุดได้) แล้วซ่อนเส้นเดิม" onClick={onDetach}>แยกเป็นของผู้ใช้</button>}</>}
   </div></>}
  {!ann&&<Revisions revs={edits?.revisions||[]} readOnly={readOnly} onChange={revisions=>commit({...(edits||{version:1,views:{}}),revisions})}/>}
  {hidden.length>0&&<fieldset className="composer-show"><legend>ซ่อนไว้ ({hidden.length})</legend>
   {hidden.map(h=><div key={h.vk+h.key} className="ed-hidden"><span><small>{h.title}</small>{KIND[annotationKind(h.key)]||h.key} <code>{h.key.split(':').slice(1).join(':')}</code></span>
    <button disabled={readOnly} onClick={()=>commit(setOverride(edits,h.vk,h.key,{hidden:undefined}))}>แสดง</button></div>)}</fieldset>}
 </div>;
}

/** Revision table of the drawing (P4): rev / date / description / by; newest last (the table on the sheet shows newest first). */
function Revisions({revs,readOnly,onChange}:{revs:DrawingRevision[];readOnly:boolean;onChange:(r:DrawingRevision[])=>void}){
 const set=(i:number,p:Partial<DrawingRevision>)=>onChange(revs.map((r,j)=>j===i?{...r,...p}:r));
 return <fieldset className="composer-show"><legend>Revision ({revs.length})</legend>
  {revs.map((r,i)=><div key={i} className="ed-rev">
   <input aria-label="Rev" value={r.rev} maxLength={3} disabled={readOnly} onChange={e=>{const v=e.target.value.toUpperCase();if(/^[A-Z0-9]{1,3}$/.test(v)&&!revs.some((x,j)=>j!==i&&x.rev===v))set(i,{rev:v});}}/>
   <input aria-label="วันที่" type="date" value={r.date} disabled={readOnly} onChange={e=>set(i,{date:e.target.value})}/>
   <input aria-label="รายละเอียด" value={r.desc} maxLength={200} disabled={readOnly} onChange={e=>set(i,{desc:e.target.value})}/>
   <input aria-label="โดย" value={r.by} maxLength={60} disabled={readOnly} placeholder="โดย" onChange={e=>set(i,{by:e.target.value})}/>
   <button className="danger-text" aria-label="ลบ Revision" disabled={readOnly} onClick={()=>onChange(revs.filter((_,j)=>j!==i))}>×</button></div>)}
  <button disabled={readOnly||revs.length>=20} onClick={()=>onChange([...revs,{rev:nextRevision(revs),date:new Date().toISOString().slice(0,10),desc:'',by:''}])}>+ เพิ่ม Revision</button>
  <p className="muted">ก้อนเมฆ (C) ใช้ Rev ล่าสุด · วาง “ตาราง Revision” บนแผ่นได้จากโหมดจัดหน้า (รายการ “ยังไม่ได้วาง”)</p></fieldset>;
}
