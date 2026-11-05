import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {expandPrims,textWidth,type Prim} from '../domain/drawingPrims';
import type {SheetViewInfo} from '../domain/bbsSheet';
import {annotationKind,type AnnotationOverride,type DrawingEdits,type UserAnnotation,type ViewEdits} from '../domain/drawingEdits';
import type {ViewKey} from '../domain/sheetLayoutSchema';
import {PrimsSvg} from './PrimsSvg';

/** Drawing Edit mode of the Sheet Composer (Tekla-style, phase 1): select the annotations of the sheet (automatic ones by
 * their stable key, user text / leaders), move / hide / retext them, add text (T) and leaders (L). Everything is written to
 * `member.drawingEdits` (`drawingEdits.ts`) through `commit`; `renderView` draws it, so SVG / PDF / DXF stay identical. */
type Info={prims:Prim[];views:SheetViewInfo[]};
type Box={x0:number;y0:number;x1:number;y1:number};
export type Ann={id:string;view:SheetViewInfo;vk:ViewKey;key:string;user:boolean;kind:'mark'|'dim'|'cover'|'ex'|'level'|'text'|'leader';label:string;box:Box;prims:Prim[];dir?:'h'|'v'};
const KIND:Record<Ann['kind'],string>={mark:'ป้าย Mark',dim:'Dimension',cover:'ระยะหุ้ม C',ex:'Dimension EX',level:'ระดับ',text:'ข้อความ',leader:'Leader ข้อความ'};
const uid=()=>Math.random().toString(36).slice(2,9);
const r1=(v:number)=>Math.round(v*10)/10;

function bboxOf(prims:Prim[]):Box{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;const add=(x:number,y:number)=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);};
 for(const p of expandPrims(prims)){
  if(p.t==='line'){add(p.x1,p.y1);add(p.x2,p.y2);}else if(p.t==='poly')p.pts.forEach(q=>add(q[0],q[1]));else if(p.t==='rect'){add(p.x,p.y);add(p.x+p.w,p.y+p.h);}
  else if(p.t==='circle'){add(p.cx-p.r,p.cy-p.r);add(p.cx+p.r,p.cy+p.r);}else if(p.t==='ellipse'){add(p.cx-p.rx,p.cy-p.ry);add(p.cx+p.rx,p.cy+p.ry);}
  else if(p.t==='text'){const w=textWidth(p.text,p.size),x=p.anchor==='middle'?p.x-w/2:p.anchor==='end'?p.x-w:p.x;add(x,p.y-p.size);add(x+w,p.y+p.size*.3);}}
 return {x0,y0,x1,y1};}
/** Annotations of a drawn sheet: primitives grouped by (view, key); only views with a ViewKey (not beam groups / notes). */
export function sheetAnnotations(info:Info):Ann[]{
 const byView=new Map(info.views.filter(v=>v.key&&v.key!=='notes').map(v=>[v.id,v]));
 const groups=new Map<string,{view:SheetViewInfo;key:string;prims:Prim[]}>();
 for(const p of info.prims){if(!p.key||!p.view)continue;const v=byView.get(p.view);if(!v)continue;const id=`${v.key}|${p.key}`;let g=groups.get(id);if(!g)groups.set(id,g={view:v,key:p.key,prims:[]});g.prims.push(p);}
 return [...groups.entries()].map(([id,g])=>{const user=g.key.startsWith('user:'),sem=g.prims.find(p=>p.t==='dim'||p.t==='leader'||p.t==='mtext');
  const kind:Ann['kind']=user?(sem?.t==='leader'?'leader':'text'):annotationKind(g.key);
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

type Tool='select'|'text'|'leader';
type Drag={ann:Ann;x0:number;y0:number;dx:number;dy:number;moved:boolean};
export function useDrawingEdit({info,edits,commit,readOnly,setMsg}:{info:Info;edits:DrawingEdits|undefined;commit:(e:DrawingEdits)=>void;readOnly:boolean;setMsg:(m:string)=>void}){
 const [tool,setTool]=useState<Tool>('select'),[sel,setSel]=useState<string>(),[hover,setHover]=useState<{x:number;y:number;ann?:string}>();
 const [pend,setPend]=useState<{view:SheetViewInfo;at:[number,number]}>(),[drag,setDrag0]=useState<Drag>(),[focusText,setFocusText]=useState(0);
 // the drag also lives in a ref: the release may come from the window (outside the sheet) and must be applied once
 const dragRef=useRef<Drag|undefined>(undefined),setDrag=(d:Drag|undefined)=>{dragRef.current=d;setDrag0(d);};
 const anns=useMemo(()=>sheetAnnotations(info),[info]),selAnn=anns.find(a=>a.id===sel);
 const viewAt=(x:number,y:number)=>info.views.find(v=>v.key&&v.key!=='notes'&&v.n>0&&x>=v.box.x&&x<=v.box.x+v.box.w&&y>=v.box.y&&y<=v.box.y+v.box.h);
 const toModel=(v:SheetViewInfo,x:number,y:number):[number,number]=>[Math.round(v.origin.model[0]+(x-v.origin.sheet[0])/v.s),Math.round(v.origin.model[1]-(y-v.origin.sheet[1])/v.s)];
 const toSheet=(v:SheetViewInfo,u:number,w:number):[number,number]=>[v.origin.sheet[0]+(u-v.origin.model[0])*v.s,v.origin.sheet[1]-(w-v.origin.model[1])*v.s];
 const hit=(x:number,y:number)=>anns.filter(a=>x>=a.box.x0-1&&x<=a.box.x1+1&&y>=a.box.y0-1&&y<=a.box.y1+1).sort((a,b)=>(a.box.x1-a.box.x0)*(a.box.y1-a.box.y0)-(b.box.x1-b.box.x0)*(b.box.y1-b.box.y0))[0];
 const over=(a:Ann)=>viewEdits(edits,a.vk).over?.[a.key];
 const obj=(a:Ann)=>viewEdits(edits,a.vk).objs?.find(o=>`user:${o.id}`===a.key);
 const movable=(a:Ann)=>a.kind!=='cover'&&a.kind!=='ex';
 /** commit a move of (dx, dy) sheet mm: Marks / user leaders move the text, dims the dimension line, levels sideways, user text its point */
 const moveBy=(a:Ann,dx:number,dy:number)=>{if(readOnly||!movable(a))return;const o=over(a)||{},u=obj(a);
  if(a.kind==='mark')commit(setOverride(edits,a.vk,a.key,{dx:r1((o.dx||0)+dx)||undefined,dy:r1((o.dy||0)+dy)||undefined}));
  else if(a.kind==='dim')commit(setOverride(edits,a.vk,a.key,{off:r1((o.off||0)+(a.dir==='v'?dx:dy))||undefined}));
  else if(a.kind==='level')commit(setOverride(edits,a.vk,a.key,{dx:r1((o.dx||0)+dx)||undefined}));
  else if(u?.kind==='text')commit(setUserObject(edits,a.vk,u.id,{...u,at:[Math.round(u.at[0]+dx/a.view.s),Math.round(u.at[1]-dy/a.view.s)]}));
  else if(u?.kind==='leader')commit(setUserObject(edits,a.vk,u.id,{...u,dx:r1(u.dx+dx),dy:r1(u.dy+dy)}));};
 const remove=(a:Ann)=>{if(readOnly)return;const u=obj(a);commit(u?setUserObject(edits,a.vk,u.id,null):setOverride(edits,a.vk,a.key,{hidden:true}));setSel(undefined);};
 const down=(x:number,y:number)=>{
  if(tool==='text'){const v=viewAt(x,y);if(!v){setMsg('คลิกในรูปที่มีมาตราส่วนเพื่อวางข้อความ');return;}if(readOnly)return;const id=`t${uid()}`;
   commit(setUserObject(edits,v.key!,id,{id,kind:'text',at:toModel(v,x,y),lines:['ข้อความ']}));setSel(`${v.key}|user:${id}`);setTool('select');setFocusText(n=>n+1);return;}
  if(tool==='leader'){const v=pend?.view||viewAt(x,y);if(!v){setMsg('คลิกในรูปที่มีมาตราส่วน: จุดหัวลูกศรก่อน');return;}if(readOnly)return;
   if(!pend){setPend({view:v,at:toModel(v,x,y)});return;}
   const [ax,ay]=toSheet(v,...pend.at),id=`l${uid()}`;
   commit(setUserObject(edits,v.key!,id,{id,kind:'leader',at:pend.at,dx:r1(x-ax),dy:r1(y-ay),lines:['ข้อความ'],arrow:'dot'}));setPend(undefined);setSel(`${v.key}|user:${id}`);setTool('select');setFocusText(n=>n+1);return;}
  const a=hit(x,y);setSel(a?.id);if(a&&!readOnly&&movable(a))setDrag({ann:a,x0:x,y0:y,dx:0,dy:0,moved:false});};
 const move=(x:number,y:number)=>{
  if(drag){let dx=x-drag.x0,dy=y-drag.y0;if(drag.ann.kind==='dim'){if(drag.ann.dir==='v')dy=0;else dx=0;}if(drag.ann.kind==='level')dy=0;setDrag({...drag,dx,dy,moved:drag.moved||Math.hypot(dx,dy)>.3});return;}
  setHover({x,y,ann:tool==='select'?hit(x,y)?.id:undefined});};
 const up=()=>{const d=dragRef.current;if(!d)return;setDrag(undefined);if(d.moved)moveBy(d.ann,d.dx,d.dy);};
 useEffect(()=>{if(!drag)return;const end=()=>up();window.addEventListener('pointerup',end);return()=>window.removeEventListener('pointerup',end);});
 /** keyboard of the edit mode; true = handled */
 const key=(e:KeyboardEvent)=>{const k=e.key;
  if(k==='Escape'){if(pend)setPend(undefined);else if(tool!=='select')setTool('select');else setSel(undefined);return true;}
  if(k==='v'||k==='V'){setTool('select');setPend(undefined);return true;}
  if(k==='t'||k==='T'){if(!readOnly){setTool('text');setPend(undefined);}return true;}
  if(k==='l'||k==='L'){if(!readOnly){setTool('leader');setPend(undefined);}return true;}
  if(!selAnn)return false;
  if(k==='Delete'||k==='Backspace'){e.preventDefault();remove(selAnn);return true;}
  const st=e.shiftKey?2:.5,d={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[k];
  if(d){e.preventDefault();moveBy(selAnn,d[0],d[1]);return true;}
  return false;};
 /** sheet primitives without the annotation being dragged (its moved copy is drawn by the overlay) */
 const filter=(prims:Prim[])=>drag?.moved?prims.filter(p=>!(p.view===drag.ann.view.id&&p.key===drag.ann.key)):prims;
 const hov=anns.find(a=>a.id===hover?.ann);
 const overlay:ReactNode=<g className="ed-layer" pointerEvents="none">
  {hov&&hov.id!==sel&&<rect className="ed-hover" x={hov.box.x0-.8} y={hov.box.y0-.8} width={hov.box.x1-hov.box.x0+1.6} height={hov.box.y1-hov.box.y0+1.6}/>}
  {selAnn&&!drag?.moved&&<rect className={`ed-sel${selAnn.user?' user':''}`} x={selAnn.box.x0-1} y={selAnn.box.y0-1} width={selAnn.box.x1-selAnn.box.x0+2} height={selAnn.box.y1-selAnn.box.y0+2}/>}
  {drag?.moved&&<g transform={`translate(${drag.dx} ${drag.dy})`} opacity={.75}><PrimsSvg prims={drag.ann.prims}/><rect className="ed-sel" x={drag.ann.box.x0-1} y={drag.ann.box.y0-1} width={drag.ann.box.x1-drag.ann.box.x0+2} height={drag.ann.box.y1-drag.ann.box.y0+2}/></g>}
  {pend&&hover&&(()=>{const [ax,ay]=toSheet(pend.view,...pend.at);return <g className="ed-pend"><circle cx={ax} cy={ay} r={.8}/><polyline points={`${ax},${ay} ${hover.x},${hover.y} ${hover.x+(hover.x>=ax?3:-3)},${hover.y}`}/></g>;})()}
  {anns.filter(a=>a.user&&a.id!==sel).map(a=><rect key={a.id} className="ed-user" x={a.box.x0-.6} y={a.box.y0-.6} width={a.box.x1-a.box.x0+1.2} height={a.box.y1-a.box.y0+1.2}/>)}
 </g>;
 const hint=tool==='text'?'คลิกในรูปเพื่อวางข้อความ':tool==='leader'?pend?'คลิกตำแหน่งข้อความ':'คลิกจุดหัวลูกศร (ยึดกับตำแหน่งในรูป)':drag?.moved?`ย้าย ${drag.dx.toFixed(1)} · ${drag.dy.toFixed(1)} mm`:hov?`${KIND[hov.kind]} · ${hov.label}`:'';
 const toolbar:ReactNode=<>
  <button aria-pressed={tool==='select'} className={tool==='select'?'active':''} onClick={()=>{setTool('select');setPend(undefined);}}>เลือก / ย้าย <kbd>V</kbd></button>
  <button aria-pressed={tool==='text'} className={tool==='text'?'active':''} disabled={readOnly} onClick={()=>{setTool('text');setPend(undefined);}}>+ ข้อความ <kbd>T</kbd></button>
  <button aria-pressed={tool==='leader'} className={tool==='leader'?'active':''} disabled={readOnly} onClick={()=>{setTool('leader');setPend(undefined);}}>+ Leader <kbd>L</kbd></button>
  <button disabled title="Phase 2">+ Dimension</button><button disabled title="Phase 2">+ ระดับ</button></>;
 const panel:ReactNode=<EditPanel ann={selAnn} edits={edits} readOnly={readOnly} info={info} commit={commit} focusText={focusText} over={selAnn?over(selAnn):undefined} obj={selAnn?obj(selAnn):undefined} onRemove={()=>selAnn&&remove(selAnn)}/>;
 return {tool,down,move,up,key,filter,overlay,toolbar,panel,hint,cursor:tool!=='select'?'crosshair':drag?.moved?'grabbing':hov?'pointer':'default',clear:()=>{setSel(undefined);setPend(undefined);setDrag(undefined);}};
}

function EditPanel({ann,edits,readOnly,info,commit,focusText,over,obj,onRemove}:{ann?:Ann;edits:DrawingEdits|undefined;readOnly:boolean;info:Info;commit:(e:DrawingEdits)=>void;focusText:number;over?:AnnotationOverride;obj?:UserAnnotation;onRemove:()=>void}){
 const keys=new Set(info.views.map(v=>v.key).filter(Boolean) as string[]);
 const hidden=Object.entries(edits?.views||{}).filter(([vk])=>keys.has(vk)).flatMap(([vk,v])=>Object.entries(v.over||{}).filter(([,o])=>o.hidden).map(([key])=>({vk,key,title:info.views.find(x=>x.key===vk)?.title||vk})));
 const userCount=Object.values(edits?.views||{}).reduce((n,v)=>n+(v.objs?.length||0),0),overCount=Object.values(edits?.views||{}).reduce((n,v)=>n+Object.keys(v.over||{}).length,0);
 const setO=(patch:Partial<AnnotationOverride>|null)=>ann&&commit(setOverride(edits,ann.vk,ann.key,patch));
 const setU=(o:UserAnnotation)=>ann&&commit(setUserObject(edits,ann.vk,o.id,o));
 const num=(v:string)=>{const n=Number(v);return Number.isFinite(n)?Math.max(-500,Math.min(500,r1(n))):0;};
 const lines=(v:string)=>v.split('\n').slice(0,10).map(l=>l.slice(0,200));
 return <div className="ed-panel">
  {!ann?<><p className="muted">คลิก Dimension, ป้าย Mark, ระดับ หรือข้อความบนแผ่นเพื่อแก้ · ลากเพื่อย้าย · Delete = ซ่อน / ลบ · ลูกศร 0.5 mm (Shift 2 mm)</p>
    <p className="muted">ของที่แก้เก็บแยกจากแบบอัตโนมัติ จึงคงอยู่เมื่อสร้างแบบใหม่ · ตอนนี้แก้ {overCount} รายการ · เพิ่มเอง {userCount} รายการ</p></>:<>
   <div className="sel-head"><small>{ann.view.title} · {ann.user?'เพิ่มโดยผู้ใช้':'สร้างอัตโนมัติ'}</small><b>{KIND[ann.kind]}</b></div>
   {!ann.user&&<p className="muted ed-label">{ann.label}</p>}
   {ann.kind==='mark'&&<>
    <label className="field"><span>ข้อความป้าย (ว่าง = ตาม Mark)</span><textarea rows={2} disabled={readOnly} value={over?.text??''} placeholder={ann.label} onChange={e=>setO({text:e.target.value?e.target.value.slice(0,200):undefined})}/></label>
    <div className="form-grid"><label className="field"><span>เลื่อน x (mm)</span><input type="number" step={.5} disabled={readOnly} value={over?.dx||0} onChange={e=>setO({dx:num(e.target.value)||undefined})}/></label>
     <label className="field"><span>เลื่อน y (mm)</span><input type="number" step={.5} disabled={readOnly} value={over?.dy||0} onChange={e=>setO({dy:num(e.target.value)||undefined})}/></label></div></>}
   {ann.kind==='dim'&&<>
    <label className="field"><span>ข้อความ (&lt;&gt; = ค่าที่วัดได้, ว่าง = ค่าจริง)</span><input disabled={readOnly} value={over?.text??''} placeholder="<>" maxLength={200} onChange={e=>setO({text:e.target.value||undefined})}/></label>
    <label className="field"><span>เลื่อนเส้น Dimension ({ann.dir==='v'?'x':'y'}, mm)</span><input type="number" step={.5} disabled={readOnly} value={over?.off||0} onChange={e=>setO({off:num(e.target.value)||undefined})}/></label></>}
   {ann.kind==='level'&&<>
    <label className="field"><span>ข้อความระดับ (ว่าง = ตามแบบ)</span><input disabled={readOnly} value={over?.text??''} placeholder={ann.label} maxLength={200} onChange={e=>setO({text:e.target.value||undefined})}/></label>
    <label className="field"><span>เลื่อนสัญลักษณ์ x (mm)</span><input type="number" step={.5} disabled={readOnly} value={over?.dx||0} onChange={e=>setO({dx:num(e.target.value)||undefined})}/></label></>}
   {(ann.kind==='cover'||ann.kind==='ex')&&<p className="muted">รายการนี้ซ่อนได้อย่างเดียวใน Phase 1</p>}
   {obj&&<>
    <label className="field"><span>ข้อความ (หลายบรรทัดได้)</span><textarea key={`${obj.id}-${focusText}`} autoFocus={focusText>0} rows={3} disabled={readOnly} value={obj.lines.join('\n')} onFocus={e=>e.currentTarget.select()} onChange={e=>setU({...obj,lines:lines(e.target.value)})}/></label>
    <div className="form-grid"><label className="field"><span>ขนาดตัวอักษร (mm)</span><input type="number" min={1.5} max={10} step={.1} disabled={readOnly} value={obj.size??2.6} onChange={e=>{const n=Number(e.target.value);if(n>=1.5&&n<=10)setU({...obj,size:n});}}/></label>
     {obj.kind==='leader'?<label className="field"><span>หัวลูกศร</span><select disabled={readOnly} value={obj.arrow} onChange={e=>setU({...obj,arrow:e.target.value as 'dot'|'closed'|'none'})}><option value="dot">จุด</option><option value="closed">ลูกศรทึบ</option><option value="none">ไม่มี</option></select></label>
      :<label className="check"><input type="checkbox" disabled={readOnly} checked={!!obj.bold} onChange={e=>setU({...obj,bold:e.target.checked||undefined})}/>ตัวหนา</label>}</div>
    {obj.kind==='leader'&&<p className="muted">หัวลูกศรยึดกับตำแหน่งในรูป ({obj.at[0].toLocaleString()}, {obj.at[1].toLocaleString()} mm) · ลากเพื่อย้ายข้อความ</p>}
    {obj.kind==='text'&&<p className="muted">ยึดกับตำแหน่งในรูป ({obj.at[0].toLocaleString()}, {obj.at[1].toLocaleString()} mm): ย้ายตามเมื่อย้ายหรือเปลี่ยนมาตราส่วนรูป</p>}</>}
   <div className="actions">
    {ann.user?<button className="danger-text" disabled={readOnly} onClick={onRemove}>ลบ</button>:<>
     <button disabled={readOnly} onClick={onRemove}>ซ่อน</button>
     <button disabled={readOnly||!over} onClick={()=>setO(null)}>คืนค่า Auto</button></>}
   </div></>}
  {hidden.length>0&&<fieldset className="composer-show"><legend>ซ่อนไว้ ({hidden.length})</legend>
   {hidden.map(h=><div key={h.vk+h.key} className="ed-hidden"><span><small>{h.title}</small>{KIND[annotationKind(h.key)]||h.key} <code>{h.key.split(':').slice(1).join(':')}</code></span>
    <button disabled={readOnly} onClick={()=>commit(setOverride(edits,h.vk,h.key,{hidden:undefined}))}>แสดง</button></div>)}</fieldset>}
 </div>;
}
