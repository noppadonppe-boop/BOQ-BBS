import {useMemo,useRef,useState,type PointerEvent as RPointerEvent} from 'react';
import {Box,Plus,Trash2} from 'lucide-react';
import type {Member,Spec} from '../domain/model';
import type {WallInput} from '../domain/elementInput';
import {defaultWallRun,runAxis,runLevels,wallJoints,axisLength,wallRunLiftQuantities,wallRunShapeModel,wallRunSets,wallKindNames,type WallKind} from '../domain/wallRun';
import {wallTypeLabels,wallTypes,wallTypesLater,type WallMesh,type WallOpening,type WallRun,type WallType} from '../domain/wallRunSchema';
import {applyWallTemplateToRun,wallTemplateSummary} from '../domain/slabWallTemplates';
import {NumInput,number} from './EditorControls';
import {HelpButton} from './HelpCenter';

const diameters=[6,9,10,12,16,20,25,28,32];
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
type P2=[number,number];
/** What a wall type sets up (shown on the picker and in the editor). */
export const wallTypeNotes:Record<WallType,string>={
 tank:'กล่องปิด · เหล็ก 2 ชั้น · มุม U-bar · พื้นบ่อ + ฝาบ่อ (manhole) · haunch · waterstop ทุกรอยต่อ · ปลอกท่อ (sleeve)',
 lift:'กล่อง / U หลายชั้น · ทาบทุกช่วงเท · ช่องประตูซ้ำทุกชั้น · บ่อลิฟต์ · BBS แยกตามชั้น',
 general:'ตรง / L / T · เดือยจากฐาน · ปลาย U + EDGE BAR หรือ boundary element · ช่องเปิด',
 retaining:'stem + toe / heel / key · เหล็กหลักฝั่งดิน + ตัดเป็นช่วง · รูระบายน้ำ (BOQ)'};
const typeShape:Record<WallType,string>={tank:'□ กล่องปิด',lift:'□ / ⊓',general:'— / L / T',retaining:'— + ฐาน'};

/** Wall type cards: the 4 types of this round, the old straight wall, the types of the next rounds (disabled). */
export function WallTypePicker({onPick,onSingle,onClose}:{onPick:(t:WallType)=>void;onSingle?:()=>void;onClose:()=>void}){
 return <div className="modal-shade" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal wall-type-picker" role="dialog" aria-label="เลือกชนิดผนัง">
  <header><b>เลือกชนิดผนัง</b><span className="muted">ชนิด = ชุดค่าเริ่มต้น + รูปทรงเริ่มต้น · แก้ได้ทุกค่าหลังเลือก</span><button type="button" onClick={onClose} aria-label="ปิด">×</button></header>
  <div className="wall-type-grid">
   {wallTypes.map(t=><button key={t} type="button" className="wall-type-card" onClick={()=>onPick(t)}><b>{wallTypeLabels[t]}</b><code>{typeShape[t]}</code><span>{wallTypeNotes[t]}</span></button>)}
   {onSingle&&<button type="button" className="wall-type-card plain" onClick={onSingle}><b>ผนังตรงแบบเดิม</b><code>—</code><span>ผนังตรง 1 ช่วง ยาว × หนา × สูง (ข้อมูลเดิมใช้ต่อได้)</span></button>}
   {wallTypesLater.map(t=><div key={t} className="wall-type-card later" aria-disabled="true"><b>{t}</b><span className="tag">รอบถัดไป</span></div>)}
  </div></div></div>;
}

type Preview={member:Member;q:{concrete:number;formwork:number;rebar:number;rows:{id:string;mark:string;diameter:number;weight:number;count:number}[]}};
type Props={input:WallInput;spec:Spec;readOnly:boolean;preview?:Preview;onChange:(run:WallRun)=>void;onBuild:()=>void;buildDisabled:boolean;onView3d:()=>void;onType:()=>void};
const seg=(id:string,length:number,thickness:number,turn:number)=>({id,length,thickness,turn});
const nextId=(used:string[],p:string)=>{let k=1;while(used.includes(`${p}${k}`))k++;return `${p}${k}`;};
const letters='ABCDEFGHIJKLMNOPQRSTUVWX';

export function WallRunEditor({input,spec,readOnly,preview,onChange,onBuild,buildDisabled,onView3d,onType}:Props){
 const run=input.run!,set=(f:(r:WallRun)=>void)=>{const n=structuredClone(run);f(n);onChange(n);};
 const [corner,setCorner]=useState<number|null>(null),[draw,setDraw]=useState<P2[]|null>(null),[sel,setSel]=useState<string|null>(null),[tab,setTab]=useState<'plan'|'elev'>('plan');
 const ax=useMemo(()=>runAxis(run),[run]),lv=useMemo(()=>runLevels(run),[run]);
 const sm=useMemo(()=>{try{return wallRunShapeModel(input);}catch{return undefined;}},[input]);
 const lifts=useMemo(()=>preview?wallRunLiftQuantities(preview.member,preview.q.rows):[],[preview]);
 const sets=useMemo(()=>preview?wallRunSets(preview.member):[],[preview]);
 const t0=run.path.segments[0]?.thickness||200;
 const shape=(k:'straight'|'L'|'U'|'box')=>set(r=>{const L=r.path.segments.map(s=>s.length),a=L[0]||4000,b=L[1]||3000,t=t0;
  r.path=k==='straight'?{closed:false,segments:[seg('A',a,t,0)]}:k==='L'?{closed:false,segments:[seg('A',a,t,90),seg('B',b,t,0)]}:k==='U'?{closed:false,segments:[seg('A',b,t,90),seg('B',a,t,90),seg('C',b,t,0)]}:{closed:true,segments:[seg('A',a,t,90),seg('B',b,t,90),seg('C',a,t,90),seg('D',b,t,90)]};
  r.openings=r.openings.filter(o=>r.path.segments.some(s=>s.id===o.segment));r.branches=r.branches?.filter(x=>r.path.segments.some(s=>s.id===x.fromSegment));});
 const finishDraw=(pts:P2[],closed:boolean)=>{if(pts.length<2){setDraw(null);return;}
  const ps=closed&&pts.length>=3?[...pts,pts[0]]:pts,segs=ps.slice(1).map((p,k)=>{const q=ps[k],len=Math.round(Math.hypot(p[0]-q[0],p[1]-q[1]));return {len,ang:Math.atan2(p[1]-q[1],p[0]-q[0])*180/Math.PI};}).filter(s=>s.len>=300);
  const turn=(a:number,b:number)=>{let d=b-a;while(d>180)d-=360;while(d<-180)d+=360;return Math.round(d*10)/10;};
  set(r=>{r.origin={x:Math.round(ps[0][0]),y:Math.round(ps[0][1]),rotation:Math.round(segs[0].ang*10)/10};r.path={closed:closed&&pts.length>=3,segments:segs.map((s,k)=>seg(letters[k]||`S${k}`,s.len,t0,k<segs.length-1?turn(s.ang,segs[k+1].ang):closed?turn(s.ang,segs[0].ang):0))};
   r.openings=r.openings.filter(o=>r.path.segments.some(s=>s.id===o.segment));});setDraw(null);};
 const num=(v:number,on:(n:number)=>void,o:{min?:number;step?:number;label:string;w?:number}={label:''})=><NumInput aria-label={o.label} disabled={readOnly} value={v} step={o.step||'any'} style={o.w?{width:o.w}:undefined} onChange={e=>on(Math.max(o.min??0,Number(e.target.value)||0))}/>;
 const dsel=(v:number,on:(d:number)=>void,label:string)=><select aria-label={label} disabled={readOnly} value={v} onChange={e=>on(Number(e.target.value))}>{[...new Set([...diameters,v])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{barName(d)}</option>)}</select>;
 const meshRow=(label:string,m:WallMesh,on:(m:WallMesh)=>void)=><div className="wr-mesh" key={label}><span>{label}</span>{dsel(m.diameter,d=>on({...m,diameter:d}),`${label} ขนาด`)}<span>@</span>{num(m.spacing,s=>on({...m,spacing:s}),{label:`${label} ระยะ`,w:70})}</div>;
 const lvs=[...run.levels].sort((a,b)=>a.bottom-b.bottom);
 const tank=run.wallType==='tank',lift=run.wallType==='lift',ret=run.wallType==='retaining';
 const marks=(k:WallKind)=>sets.filter(s=>s.kind===k).length;

 // ---- plan (world mm, y up → svg y down)
 const planParts=(sm?.parts||[]).filter(p=>p.shape==='polygon'&&p.role==='solid'),firstKey=planParts.find(p=>/^w/.test(p.id))?.id.split('-').slice(1).join('-');
 const wallPolys=planParts.filter(p=>/^w/.test(p.id)&&p.id.endsWith(`-${firstKey}`)).map(p=>(p as {points:P2[]}).points);
 const slabPolys=planParts.filter(p=>/^(tank-bottom|base-|pit-slab)/.test(p.id)).map(p=>(p as {points:P2[]}).points);
 const all=[...wallPolys,...slabPolys].flat(),pad=900;
 const bb=all.length?{x0:Math.min(...all.map(p=>p[0]))-pad,y0:Math.min(...all.map(p=>p[1]))-pad,x1:Math.max(...all.map(p=>p[0]))+pad,y1:Math.max(...all.map(p=>p[1]))+pad}:{x0:-1000,y0:-1000,x1:9000,y1:7000};
 const vb=draw?{x0:Math.min(bb.x0,-2000),y0:Math.min(bb.y0,-2000),x1:Math.max(bb.x1,14000),y1:Math.max(bb.y1,10000)}:bb,sw=(vb.x1-vb.x0)/400;
 const pts=(ps:P2[])=>ps.map(p=>`${p[0]},${-p[1]}`).join(' ');
 const svgRef=useRef<SVGSVGElement>(null);
 const toWorld=(e:{clientX:number;clientY:number},el:SVGSVGElement|null):P2=>{if(!el)return [0,0];const pt=el.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const q=pt.matrixTransform(el.getScreenCTM()!.inverse());return [Math.round(q.x/50)*50,Math.round(-q.y/50)*50];};
 const joints=ax.segs.map((s,k)=>({k,p:s.b,next:ax.segs[k+1]||(ax.closed?ax.segs[0]:undefined),s})).filter(j=>j.next);
 const cornerInfo=corner!==null&&joints[corner]?(()=>{const j=joints[corner],name=`${j.s.id}–${j.next!.id}`,u=preview?.member.bars.filter(b=>b.note.includes(`มุม ${name}`))||[];
  const how=run.rebar.layers===1||run.rebar.corner==='lap-l'?'เหล็กนอนงอรอบมุม (L) ต่อเนื่อง · ทาบนอกมุมเมื่อยาวเกินเหล็กเส้น':run.rebar.corner==='hook90'?`เหล็กนอนวิ่งถึงผิวนอกผนังตั้งฉาก งอ 90° ยาว ${input.detailing.hook90}d + r`:'เหล็กนอนหยุดก่อนมุม + U-bar ทับมุม 2 ผิว (ขาทาบ Lap)';
  return {name,how,u:u.map(b=>`${b.mark} ${barName(b.diameter)} × ${b.count}`).join(' · ')};})():undefined;

 // ---- unfolded elevation: main segments then branches, x = cumulative axis length + gaps
 const elevSegs=[...ax.segs,...ax.branches],gap=600,offs:number[]=[];let acc=0;for(const s of elevSegs){offs.push(acc);acc+=s.len+gap;}
 const zLo=Math.min(lv.zBase,lv.bottom?.[0]??lv.zBase,lv.pit?.[0]??lv.zBase,lv.base?.[0]??lv.zBase,lv.key?.[0]??lv.zBase),zHi=Math.max(lv.zTop,lv.cover?.[1]??lv.zTop),eW=Math.max(1000,acc-gap),eH=Math.max(1000,zHi-zLo);
 const ex=(i:number,u:number)=>offs[i]+u,ez=(z:number)=>zHi-z;
 const elevRef=useRef<SVGSVGElement>(null),drag=useRef<{id:string;x:number;z:number;sx:number;sy:number;k:number}|null>(null);
 const scale=()=>{const el=elevRef.current;if(!el)return 1;const r=el.getBoundingClientRect();return Math.max((eW+1200)/r.width,(eH+900)/r.height);};
 const opDown=(e:RPointerEvent,o:WallOpening)=>{if(readOnly)return;(e.target as Element).setPointerCapture(e.pointerId);drag.current={id:o.id,x:o.x,z:o.z,sx:e.clientX,sy:e.clientY,k:scale()};setSel(o.id);};
 const opMove=(e:RPointerEvent)=>{const d=drag.current;if(!d)return;const dx=(e.clientX-d.sx)*d.k,dz=-(e.clientY-d.sy)*d.k;
  set(r=>{const o=r.openings.find(x=>x.id===d.id);if(!o)return;o.x=Math.max(0,Math.round((d.x+dx)/25)*25);o.z=Math.max(0,Math.round((d.z+dz)/25)*25);});};
 const levelBase=(id?:string)=>{const L=lvs.find(l=>l.id===(id||lvs[0].id));const ls=lv.lifts.filter(l=>l.level>=0&&lvs[l.level]?.id===L?.id);return ls.length?ls[0].z0:lv.zBase;};
 const addOpening=()=>set(r=>{const s=r.path.segments[0],id=nextId(r.openings.map(o=>o.id),'O');r.openings.push({id,label:id,segment:s.id,face:'through',x:Math.max(300,Math.round(s.length/2-500)),z:0,w:1000,h:2100,level:lvs[0].id,trim:{count:2,diameter:12,ext:'ld',diagonal:true}});setSel(id);});
 const so=run.openings.find(o=>o.id===sel);

 return <div className="wall-run">
  <div className="wr-head"><b>{wallTypeLabels[run.wallType]}</b><span className="muted">{run.path.segments.length} segment{run.path.closed?' (ปิด)':''} · {lvs.length} ชั้น · {lv.lifts.length} ช่วงเท · แกนยาว {number(axisLength(run),2)} m</span>
   <HelpButton topic="wall-run"/>
   <div className="actions"><button type="button" disabled={readOnly} onClick={onType}>เปลี่ยนชนิดผนัง…</button><button type="button" onClick={onView3d}><Box size={14}/>3D</button><button type="button" className="primary" disabled={readOnly||buildDisabled} onClick={onBuild}>สร้างเหล็ก + ใช้กับสมาชิก</button></div></div>
  <div className="wr-grid">
   {/* ---------- left: shape, segments, T, levels, base / top ---------- */}
   <aside className="wr-left" aria-label="รูปทรงและระดับ">
    <b className="wr-title">รูปทรงแปลน</b>
    <div className="wr-shapes" role="group" aria-label="รูปทรง">{([['straight','—','ตรง'],['L','L','L'],['U','⊓','U'],['box','□','กล่อง']] as const).map(([k,i,l])=><button key={k} type="button" aria-label={l} disabled={readOnly} onClick={()=>shape(k)}>{i}</button>)}
     <button type="button" disabled={readOnly} aria-pressed={!!draw} onClick={()=>{setDraw(draw?null:[]);setTab('plan');}}>วาด</button></div>
    {draw&&<p className="notice">คลิกบนแปลนเพื่อวางจุดแกนผนัง (snap 50 mm) · {draw.length} จุด <button type="button" disabled={draw.length<2} onClick={()=>finishDraw(draw,false)}>จบ (เปิด)</button> <button type="button" disabled={draw.length<3} onClick={()=>finishDraw(draw,true)}>ปิดรูป</button> <button type="button" onClick={()=>setDraw(null)}>ยกเลิก</button></p>}
    <table className="wr-table"><thead><tr><th>ด้าน</th><th>ยาว (แกน)</th><th>หนา</th><th>เลี้ยว°</th><th/></tr></thead><tbody>
     {run.path.segments.map((s,k)=><tr key={s.id}><td><b>{s.id}</b></td><td>{num(s.length,v=>set(r=>{r.path.segments[k].length=v;}),{label:`ยาว ${s.id}`,min:300})}</td><td>{num(s.thickness,v=>set(r=>{r.path.segments[k].thickness=v;}),{label:`หนา ${s.id}`,min:100})}</td>
      <td>{k<run.path.segments.length-1||run.path.closed?num(s.turn,v=>set(r=>{r.path.segments[k].turn=v;}),{label:`เลี้ยว ${s.id}`,min:-179}):'—'}</td>
      <td>{run.path.segments.length>1&&<button type="button" className="icon" aria-label={`ลบ ${s.id}`} disabled={readOnly} onClick={()=>set(r=>{r.path.segments.splice(k,1);r.openings=r.openings.filter(o=>o.segment!==s.id);})}><Trash2 size={13}/></button>}</td></tr>)}
    </tbody></table>
    <div className="actions"><button type="button" disabled={readOnly||run.path.segments.length>=24} onClick={()=>set(r=>{const used=r.path.segments.map(s=>s.id),id=letters.split('').find(l=>!used.includes(l))||nextId(used,'S');r.path.segments.push(seg(id,3000,t0,0));})}><Plus size={13}/>segment</button>
     <label className="check"><input type="checkbox" disabled={readOnly} checked={run.path.closed} onChange={e=>set(r=>{r.path.closed=e.target.checked;})}/>เส้นแกนปิด</label></div>
    <p className="muted">ความยาววัดตามแนวแกนผนัง · เลี้ยว + = ซ้าย · ผิวนอก = {run.path.closed?'ด้านนอกวง':'ขวาของทิศทางเดิน'} · จุดเริ่ม X {num(run.origin.x,v=>set(r=>{r.origin.x=v;}),{label:'origin x',min:-200000,w:80})} Y {num(run.origin.y,v=>set(r=>{r.origin.y=v;}),{label:'origin y',min:-200000,w:80})} มุม {num(run.origin.rotation,v=>set(r=>{r.origin.rotation=v;}),{label:'rotation',min:-360,w:60})}°</p>

    <b className="wr-title">จุดต่อ T</b>
    {(run.branches||[]).map((b,k)=><div key={b.id} className="wr-row">{b.id} จาก <select aria-label="segment หลัก" disabled={readOnly} value={b.fromSegment} onChange={e=>set(r=>{r.branches![k].fromSegment=e.target.value;})}>{run.path.segments.map(s=><option key={s.id}>{s.id}</option>)}</select>
     ที่ {num(b.at,v=>set(r=>{r.branches![k].at=v;}),{label:'ระยะจากต้น',w:70})} <select aria-label="ด้าน" disabled={readOnly} value={b.side} onChange={e=>set(r=>{r.branches![k].side=e.target.value as 'L'|'R';})}><option value="L">ซ้าย</option><option value="R">ขวา</option></select>
     ยาว {num(b.length,v=>set(r=>{r.branches![k].length=v;}),{label:'ยาว',w:70})} หนา {num(b.thickness,v=>set(r=>{r.branches![k].thickness=v;}),{label:'หนา',w:60})}
     <button type="button" className="icon" aria-label={`ลบ ${b.id}`} disabled={readOnly} onClick={()=>set(r=>{r.branches!.splice(k,1);})}><Trash2 size={13}/></button></div>)}
    <button type="button" disabled={readOnly||(run.branches?.length||0)>=8} onClick={()=>set(r=>{const s=r.path.segments[0];r.branches=[...(r.branches||[]),{id:nextId((r.branches||[]).map(b=>b.id),'T'),fromSegment:s.id,at:Math.round(s.length/2),side:'L',length:2000,thickness:s.thickness}];})}><Plus size={13}/>จุดต่อ T</button>

    <b className="wr-title">ระดับ / ช่วงเท</b>
    <table className="wr-table"><thead><tr><th>ชั้น</th><th>ล่าง (m)</th><th>บน (m)</th><th>เท</th><th>หนา*</th><th/></tr></thead><tbody>
     {lvs.map(l=>{const k=run.levels.findIndex(x=>x.id===l.id);return <tr key={l.id}><td><input aria-label="ชื่อชั้น" disabled={readOnly} value={l.name} size={4} onChange={e=>set(r=>{r.levels[k].name=e.target.value.slice(0,20)||l.name;})}/></td>
      <td>{num(l.bottom,v=>set(r=>{r.levels[k].bottom=v;}),{label:'ล่าง',min:-1000,w:64})}</td><td>{num(l.top,v=>set(r=>{r.levels[k].top=v;}),{label:'บน',min:-1000,w:64})}</td>
      <td><select aria-label="จำนวนช่วงเท" disabled={readOnly} value={l.lifts} onChange={e=>set(r=>{r.levels[k].lifts=Number(e.target.value);})}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></td>
      <td>{num(l.thickness||0,v=>set(r=>{if(v>0)r.levels[k].thickness=v;else delete r.levels[k].thickness;}),{label:'หนาชั้นนี้',w:56})}</td>
      <td>{run.levels.length>1&&<button type="button" className="icon" aria-label={`ลบ ${l.name}`} disabled={readOnly} onClick={()=>set(r=>{r.levels.splice(k,1);})}><Trash2 size={13}/></button>}</td></tr>;})}
    </tbody></table>
    <button type="button" disabled={readOnly||run.levels.length>=12} onClick={()=>set(r=>{const top=lvs[lvs.length-1],h=top.top-top.bottom,id=nextId(r.levels.map(l=>l.id),'L');r.levels.push({id,name:`${r.levels.length+1}F`,bottom:top.top,top:Math.round((top.top+h)*1000)/1000,lifts:top.lifts});})}><Plus size={13}/>ชั้นบน</button>
    <p className="muted">* หนาชั้นนี้ 0 = ตาม segment · เปลี่ยน ≤ 75 mm ใช้คอม้า 1:6 · มากกว่านั้นใส่เดือยใหม่ · ช่วงเทสูงไม่เกิน 4.5 m</p>
    <label className="check"><input type="checkbox" disabled={readOnly} checked={!!run.rebar.stagger} onChange={e=>set(r=>{r.rebar.stagger=e.target.checked||undefined;})}/>ทาบเหล็กตั้งเหลื่อม 50% (ชุด B สูงขึ้น 1 Lap)</label>

    <b className="wr-title">ล่าง / บน</b>
    {tank||ret||(lift&&run.liftPit)?<p className="muted">ล่าง: {tank?'เหล็ก L จากพื้นบ่อ':ret?'เหล็กยึด stem งอ L ในฐาน':'เหล็ก L จากพื้นบ่อลิฟต์'}</p>
     :<label className="field"><span>ล่าง</span><select disabled={readOnly} value={run.base.kind} onChange={e=>set(r=>{r.base.kind=e.target.value as WallRun['base']['kind'];})}><option value="dowel-footing">เดือยจากฐานราก (Ldh + ทาบ)</option><option value="dowel-slab">เดือยจากพื้น</option><option value="continue">ต่อจากผนังชั้นล่าง (ทาบลง)</option><option value="none">ไม่มี (ปลายตรงที่ cover)</option></select></label>}
    {(run.base.kind==='dowel-footing'||run.base.kind==='dowel-slab')&&!tank&&!ret&&!(lift&&run.liftPit)&&<label className="field"><span>ระยะฝังเดือย (0 = Ldh)</span>{num(run.base.embed==='ldh'?0:run.base.embed,v=>set(r=>{r.base.embed=v>0?v:'ldh';}),{label:'ระยะฝัง'})}</label>}
    {tank&&run.tank?.cover?<p className="muted">บน: เหล็กตั้งงอ L เข้าฝาบ่อ (ขา = Lap)</p>:<label className="field"><span>บน</span><select disabled={readOnly} value={run.top.kind} onChange={e=>set(r=>{r.top.kind=e.target.value as WallRun['top']['kind'];})}><option value="bend-into-slab">งอ 90° เข้าพื้นบนผนัง</option><option value="u-cap">U ปิดบน</option><option value="straight">ตรง (หยุดที่ cover)</option><option value="continue">ตรง ต่อขึ้นชั้นถัดไป (ยื่น Lap)</option></select></label>}
    {run.top.kind==='bend-into-slab'&&!(tank&&run.tank?.cover)&&<label className="field"><span>พื้นบนผนัง หนา (mm)</span>{num(run.top.slab||200,v=>set(r=>{r.top.slab=Math.max(100,v);}),{label:'พื้นหนา'})}</label>}
    <label className="field"><span>Kicker สูง (mm · 0 = ไม่มี)</span>{num(run.base.kicker||0,v=>set(r=>{r.base.kicker=v||undefined;}),{label:'kicker'})}</label>
    <label className="check"><input type="checkbox" disabled={readOnly} checked={!!run.waterstop?.joints} onChange={e=>set(r=>{r.waterstop=e.target.checked?{joints:true,material:r.waterstop?.material||'PVC 150 mm'}:undefined;})}/>Waterstop ที่รอยต่อ ({wallJoints(run).count} รอยต่อ × {number(axisLength(run),2)} m)</label>
    {run.waterstop?.joints&&<input aria-label="ชนิด waterstop" disabled={readOnly} value={run.waterstop.material} onChange={e=>set(r=>{r.waterstop!.material=e.target.value.slice(0,60);})}/>}

    {tank&&run.tank&&<><b className="wr-title">พื้นบ่อ / ฝาบ่อ</b>
     <div className="wr-row">พื้นหนา {num(run.tank.bottom.thickness,v=>set(r=>{r.tank!.bottom.thickness=Math.max(100,v);}),{label:'พื้นบ่อหนา',w:64})} ยื่น {num(run.tank.bottom.projection,v=>set(r=>{r.tank!.bottom.projection=v;}),{label:'ยื่น',w:64})}</div>
     {meshRow('พื้น · บน',run.tank.bottom.rebar.top,m=>set(r=>{r.tank!.bottom.rebar.top=m;}))}{meshRow('พื้น · ล่าง',run.tank.bottom.rebar.bottom,m=>set(r=>{r.tank!.bottom.rebar.bottom=m;}))}
     <label className="check"><input type="checkbox" disabled={readOnly} checked={!!run.tank.cover} onChange={e=>set(r=>{r.tank!.cover=e.target.checked?{thickness:200,rebar:{top:{diameter:12,spacing:200},bottom:{diameter:12,spacing:200}},manholes:[]}:null;})}/>มีฝาบ่อ</label>
     {run.tank.cover&&<><div className="wr-row">ฝาหนา {num(run.tank.cover.thickness,v=>set(r=>{r.tank!.cover!.thickness=Math.max(100,v);}),{label:'ฝาหนา',w:64})}</div>
      {meshRow('ฝา · บน',run.tank.cover.rebar.top,m=>set(r=>{r.tank!.cover!.rebar.top=m;}))}{meshRow('ฝา · ล่าง',run.tank.cover.rebar.bottom,m=>set(r=>{r.tank!.cover!.rebar.bottom=m;}))}
      {run.tank.cover.manholes.map((h,k)=><div key={k} className="wr-row">Manhole {k+1} X {num(h.x,v=>set(r=>{r.tank!.cover!.manholes[k].x=v;}),{label:'x',min:-200000,w:60})} Y {num(h.y,v=>set(r=>{r.tank!.cover!.manholes[k].y=v;}),{label:'y',min:-200000,w:60})} {num(h.w,v=>set(r=>{r.tank!.cover!.manholes[k].w=Math.max(100,v);}),{label:'กว้าง',w:52})}×{num(h.h,v=>set(r=>{r.tank!.cover!.manholes[k].h=Math.max(100,v);}),{label:'ยาว',w:52})}
       <button type="button" className="icon" aria-label="ลบ manhole" disabled={readOnly} onClick={()=>set(r=>{r.tank!.cover!.manholes.splice(k,1);})}><Trash2 size={13}/></button></div>)}
      <button type="button" disabled={readOnly||run.tank.cover.manholes.length>=6} onClick={()=>set(r=>{const s=r.path.segments;r.tank!.cover!.manholes.push({x:Math.round((s[0]?.length||2000)/2-300),y:Math.round((s[1]?.length||2000)/2-300),w:600,h:600});})}><Plus size={13}/>Manhole</button></>}
     <div className="wr-row">Haunch {num(run.tank.haunch?.size||0,v=>set(r=>{r.tank!.haunch=v>0?{size:v}:undefined;}),{label:'haunch',w:60})} mm</div>
     <b className="wr-title">ปลอกท่อ (Sleeve)</b>
     {(run.tank.sleeves||[]).map((p,k)=><div key={k} className="wr-row"><select aria-label="segment" disabled={readOnly} value={p.segment} onChange={e=>set(r=>{r.tank!.sleeves![k].segment=e.target.value;})}>{run.path.segments.map(s=><option key={s.id}>{s.id}</option>)}</select>
      x {num(p.x,v=>set(r=>{r.tank!.sleeves![k].x=v;}),{label:'x',w:60})} z {num(p.z,v=>set(r=>{r.tank!.sleeves![k].z=v;}),{label:'z',w:60})} Ø {num(p.dia,v=>set(r=>{r.tank!.sleeves![k].dia=Math.max(20,v);}),{label:'dia',w:56})}
      <button type="button" className="icon" aria-label="ลบ sleeve" disabled={readOnly} onClick={()=>set(r=>{r.tank!.sleeves!.splice(k,1);})}><Trash2 size={13}/></button></div>)}
     <button type="button" disabled={readOnly} onClick={()=>set(r=>{r.tank!.sleeves=[...(r.tank!.sleeves||[]),{segment:r.path.segments[0].id,x:1000,z:500,dia:150}];})}><Plus size={13}/>ปลอกท่อ</button></>}
    {lift&&<><b className="wr-title">บ่อลิฟต์</b>
     <label className="check"><input type="checkbox" disabled={readOnly} checked={!!run.liftPit} onChange={e=>set(r=>{r.liftPit=e.target.checked?{depth:1500,bottomThickness:300,rebar:{top:{diameter:12,spacing:200},bottom:{diameter:12,spacing:200}}}:undefined;})}/>มีบ่อลิฟต์ (ผนังลงถึงพื้นบ่อ)</label>
     {run.liftPit&&<><div className="wr-row">ลึก {num(run.liftPit.depth,v=>set(r=>{r.liftPit!.depth=Math.max(300,v);}),{label:'ลึก',w:64})} พื้นหนา {num(run.liftPit.bottomThickness,v=>set(r=>{r.liftPit!.bottomThickness=Math.max(150,v);}),{label:'หนา',w:64})}</div>
      {meshRow('พื้นบ่อ · บน',run.liftPit.rebar.top,m=>set(r=>{r.liftPit!.rebar.top=m;}))}{meshRow('พื้นบ่อ · ล่าง',run.liftPit.rebar.bottom,m=>set(r=>{r.liftPit!.rebar.bottom=m;}))}</>}</>}
    {ret&&run.retaining&&<><b className="wr-title">ฐานกันดิน</b>
     <div className="wr-row">Toe {num(run.retaining.toe,v=>set(r=>{r.retaining!.toe=v;}),{label:'toe',w:60})} Heel {num(run.retaining.heel,v=>set(r=>{r.retaining!.heel=v;}),{label:'heel',w:60})} หนา {num(run.retaining.baseThickness,v=>set(r=>{r.retaining!.baseThickness=Math.max(200,v);}),{label:'ฐานหนา',w:60})}</div>
     <label className="field"><span>ฝั่งดิน (เหล็กหลัก)</span><select disabled={readOnly} value={run.retaining.soilSide} onChange={e=>set(r=>{r.retaining!.soilSide=e.target.value as 'out'|'in';})}><option value="out">ผิวนอก (ขวาของแกน)</option><option value="in">ผิวใน (ซ้ายของแกน)</option></select></label>
     <label className="check"><input type="checkbox" disabled={readOnly} checked={!!run.retaining.key} onChange={e=>set(r=>{r.retaining!.key=e.target.checked?{width:400,depth:400}:undefined;})}/>มี Key</label>
     {run.retaining.key&&<div className="wr-row">Key กว้าง {num(run.retaining.key.width,v=>set(r=>{r.retaining!.key!.width=Math.max(150,v);}),{label:'key w',w:60})} ลึก {num(run.retaining.key.depth,v=>set(r=>{r.retaining!.key!.depth=Math.max(150,v);}),{label:'key d',w:60})}</div>}
     <div className="wr-row">ตัดเหล็กหลักที่ {(run.retaining.curtail||[]).map((c,k)=><span key={k}>{num(Math.round(c.at*100),v=>set(r=>{r.retaining!.curtail![k].at=Math.min(.9,Math.max(.1,v/100));}),{label:'ตัดที่ %',w:48})}%</span>)}
      <button type="button" disabled={readOnly||(run.retaining.curtail?.length||0)>=3} onClick={()=>set(r=>{r.retaining!.curtail=[...(r.retaining!.curtail||[]),{at:.5}];})}>+</button>{!!run.retaining.curtail?.length&&<button type="button" disabled={readOnly} onClick={()=>set(r=>{r.retaining!.curtail!.pop();})}>−</button>}</div>
     {meshRow('ฐาน · บน',run.retaining.rebar.top,m=>set(r=>{r.retaining!.rebar.top=m;}))}{meshRow('ฐาน · ล่าง',run.retaining.rebar.bottom,m=>set(r=>{r.retaining!.rebar.bottom=m;}))}{meshRow('ฐาน · กระจาย',run.retaining.rebar.dist,m=>set(r=>{r.retaining!.rebar.dist=m;}))}
     <label className="check"><input type="checkbox" disabled={readOnly} checked={!!run.retaining.weepHoles} onChange={e=>set(r=>{r.retaining!.weepHoles=e.target.checked?{spacing:2000,dia:75}:undefined;})}/>รูระบายน้ำ (BOQ)</label>
     {run.retaining.weepHoles&&<div className="wr-row">@ {num(run.retaining.weepHoles.spacing,v=>set(r=>{r.retaining!.weepHoles!.spacing=Math.max(500,v);}),{label:'ระยะ',w:64})} Ø {num(run.retaining.weepHoles.dia,v=>set(r=>{r.retaining!.weepHoles!.dia=Math.max(25,v);}),{label:'Ø',w:52})}</div>}
     <label className="check"><input type="checkbox" disabled={readOnly} checked={run.retaining.formSoilFace!==false} onChange={e=>set(r=>{r.retaining!.formSoilFace=e.target.checked;})}/>คิดแบบหล่อผิวฝั่งดิน</label></>}
   </aside>

   {/* ---------- centre: plan / unfolded elevation ---------- */}
   <main className="wr-main">
    <div className="segmented" role="tablist" aria-label="มุมมอง">{([['plan','แปลน + มุม'],['elev','Elevation คลี่']] as const).map(([k,t])=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{t}</button>)}<button type="button" onClick={onView3d}>3D</button></div>
    {tab==='plan'&&<svg ref={svgRef} className="wr-plan" viewBox={`${vb.x0} ${-vb.y1} ${vb.x1-vb.x0} ${vb.y1-vb.y0}`} role="img" aria-label="แปลน Wall Run"
     onClick={e=>{if(!draw)return;const p=toWorld(e,svgRef.current);setDraw([...draw,p]);}}>
     {draw&&<g stroke="#e2e8f0" strokeWidth={sw*.5}>{Array.from({length:Math.ceil((vb.x1-vb.x0)/1000)+1},(_,k)=>Math.floor(vb.x0/1000)*1000+k*1000).map(x=><line key={`x${x}`} x1={x} x2={x} y1={-vb.y1} y2={-vb.y0}/>)}{Array.from({length:Math.ceil((vb.y1-vb.y0)/1000)+1},(_,k)=>Math.floor(vb.y0/1000)*1000+k*1000).map(y=><line key={`y${y}`} y1={-y} y2={-y} x1={vb.x0} x2={vb.x1}/>)}</g>}
     {slabPolys.map((p,k)=><polygon key={`s${k}`} points={pts(p)} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={sw} strokeDasharray={`${sw*6} ${sw*3}`}/>)}
     {wallPolys.map((p,k)=><polygon key={k} points={pts(p)} fill="#ede9fe" stroke="#5b21b6" strokeWidth={sw}/>)}
     {ax.segs.map(s=><g key={s.id}><line x1={s.a[0]} y1={-s.a[1]} x2={s.b[0]} y2={-s.b[1]} stroke="#7c3aed" strokeWidth={sw*.7} strokeDasharray={`${sw*8} ${sw*4}`}/>
      <text x={(s.a[0]+s.b[0])/2+s.out[0]*(s.t/2+sw*28)} y={-((s.a[1]+s.b[1])/2+s.out[1]*(s.t/2+sw*28))} fontSize={sw*13} textAnchor="middle" fill="#5b21b6" fontWeight={700}>{s.id} · {s.len}</text></g>)}
     {ax.branches.map(b=><text key={b.id} x={b.b[0]} y={-b.b[1]} fontSize={sw*12} fill="#5b21b6">{b.id}</text>)}
     {run.openings.map(o=>{const s=[...ax.segs,...ax.branches].find(x=>x.id===o.segment);if(!s)return null;const a=[s.a[0]+s.dir[0]*o.x,s.a[1]+s.dir[1]*o.x],b=[s.a[0]+s.dir[0]*(o.x+o.w),s.a[1]+s.dir[1]*(o.x+o.w)];
      return <line key={o.id} x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} stroke="#db2777" strokeWidth={sw*4} onClick={()=>{setSel(o.id);setTab('elev');}}><title>{o.label}</title></line>;})}
     {!draw&&joints.map((j,k)=><circle key={k} cx={j.p[0]} cy={-j.p[1]} r={Math.max(j.s.t,250)} fill={corner===k?'rgba(124,58,237,.15)':'transparent'} stroke="#7c3aed" strokeWidth={sw} strokeDasharray={`${sw*4} ${sw*3}`} style={{cursor:'pointer'}} onClick={()=>setCorner(corner===k?null:k)}><title>มุม {j.s.id}–{j.next!.id}</title></circle>)}
     {draw&&draw.length>0&&<polyline points={pts(draw)} fill="none" stroke="#db2777" strokeWidth={sw*2}/>}{draw?.map((p,k)=><circle key={k} cx={p[0]} cy={-p[1]} r={sw*5} fill="#db2777"/>)}
    </svg>}
    {tab==='plan'&&cornerInfo&&<p className="notice wr-corner"><b>มุม {cornerInfo.name}</b> · {cornerInfo.how}{cornerInfo.u?<><br/>{cornerInfo.u}</>:preview?'':' · กด “สร้างเหล็ก” เพื่อดู Mark'}</p>}
    {tab==='elev'&&<svg ref={elevRef} className="wr-elev" viewBox={`${-600} ${-450} ${eW+1200} ${eH+900}`} role="img" aria-label="Elevation คลี่ ทุกด้าน" onPointerMove={opMove} onPointerUp={()=>{drag.current=null;}}>
     {elevSegs.map((s,i)=>{const x0=ex(i,0),w=s.len;return <g key={s.id}>
      <rect x={x0} y={ez(lv.zTop)} width={w} height={lv.zTop-lv.zBase} fill="#f5f3ff" stroke="#5b21b6" strokeWidth={eW/700}/>
      {lv.bottom&&<rect x={x0} y={ez(lv.bottom[1])} width={w} height={lv.bottom[1]-lv.bottom[0]} fill="#e2e8f0" stroke="#64748b" strokeWidth={eW/900}/>}
      {lv.cover&&<rect x={x0} y={ez(lv.cover[1])} width={w} height={lv.cover[1]-lv.cover[0]} fill="#e2e8f0" stroke="#64748b" strokeWidth={eW/900}/>}
      {(lv.pit||lv.base)&&<rect x={x0} y={ez((lv.pit||lv.base)![1])} width={w} height={(lv.pit||lv.base)![1]-(lv.pit||lv.base)![0]} fill="#e2e8f0" stroke="#64748b" strokeWidth={eW/900}/>}
      {lv.lifts.slice(1).map(l=><line key={l.id} x1={x0} x2={x0+w} y1={ez(l.z0)} y2={ez(l.z0)} stroke="#7c3aed" strokeWidth={eW/900} strokeDasharray={l.k===0?undefined:`${eW/120} ${eW/240}`}/>)}
      <text x={x0+w/2} y={ez(zHi)-120} fontSize={eW/45} textAnchor="middle" fill="#5b21b6" fontWeight={700}>{s.id}</text></g>;})}
     {lv.lifts.filter(l=>l.k===0).map(l=><text key={l.id} x={-520} y={ez(l.z0)-30} fontSize={eW/55} fill="#475569">{l.level<0?'PIT':lvs[l.level]?.name}</text>)}
     {run.openings.flatMap(o=>{const i=elevSegs.findIndex(s=>s.id===o.segment);if(i<0)return [];const levs=[o.level||lvs[0].id,...(o.repeat?.levels||[])];
      return levs.map((L,k)=>{const z=levelBase(L)+o.z;return <rect key={`${o.id}-${L}`} x={ex(i,o.x)} y={ez(z+o.h)} width={o.w} height={o.h} fill={k===0?'#fff':'#fdf2f8'} stroke={sel===o.id?'#db2777':'#9d174d'} strokeWidth={eW/(sel===o.id?400:800)} style={{cursor:readOnly||k?'default':'move'}} onPointerDown={k===0?e=>opDown(e,o):undefined} onClick={()=>setSel(o.id)}><title>{o.label} {k?'(ซ้ำ)':'· ลากเพื่อย้าย'}</title></rect>;});})}
    </svg>}
    <b className="wr-title">ช่องเปิด</b>
    <div className="wr-openings">{run.openings.map(o=><button key={o.id} type="button" className={sel===o.id?'active':''} onClick={()=>setSel(o.id)}>{o.label||o.id} · {o.segment}</button>)}<button type="button" disabled={readOnly||run.openings.length>=30} onClick={addOpening}><Plus size={13}/>ช่องเปิด</button></div>
    {so&&(()=>{const k=run.openings.findIndex(o=>o.id===so.id),up=(f:(o:WallOpening)=>void)=>set(r=>f(r.openings[k]));return <div className="wr-open-edit">
     <input aria-label="ชื่อช่องเปิด" disabled={readOnly} value={so.label} onChange={e=>up(o=>{o.label=e.target.value.slice(0,40);})}/>
     <select aria-label="segment" disabled={readOnly} value={so.segment} onChange={e=>up(o=>{o.segment=e.target.value;})}>{elevSegs.map(s=><option key={s.id}>{s.id}</option>)}</select>
     <select aria-label="ชนิด" disabled={readOnly} value={so.face} onChange={e=>up(o=>{o.face=e.target.value as WallOpening['face'];if(o.face!=='through'&&!o.depth)o.depth=100;})}><option value="through">ทะลุ</option><option value="out">เว้าผิวนอก</option><option value="in">เว้าผิวใน</option></select>
     {so.face!=='through'&&<>ลึก {num(so.depth||0,v=>up(o=>{o.depth=v;}),{label:'ลึก',w:52})}</>}
     x {num(so.x,v=>up(o=>{o.x=v;}),{label:'x',w:64})} z {num(so.z,v=>up(o=>{o.z=v;}),{label:'z',w:64})} {num(so.w,v=>up(o=>{o.w=Math.max(1,v);}),{label:'กว้าง',w:60})}×{num(so.h,v=>up(o=>{o.h=Math.max(1,v);}),{label:'สูง',w:60})}
     ชั้น <select aria-label="ชั้น" disabled={readOnly} value={so.level||lvs[0].id} onChange={e=>up(o=>{o.level=e.target.value;})}>{lvs.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>
     <span className="wr-rep">ซ้ำชั้น {lvs.filter(l=>l.id!==(so.level||lvs[0].id)).map(l=><label key={l.id} className="check"><input type="checkbox" disabled={readOnly} checked={!!so.repeat?.levels.includes(l.id)} onChange={e=>up(o=>{const s=new Set(o.repeat?.levels||[]);if(e.target.checked)s.add(l.id);else s.delete(l.id);o.repeat=s.size?{levels:[...s]}:undefined;})}/>{l.name}</label>)}</span>
     <span>เหล็กรอบช่อง {num(so.trim.count,v=>up(o=>{o.trim.count=Math.min(6,Math.round(v));}),{label:'จำนวน/ด้าน',w:44})}-{dsel(so.trim.diameter,d=>up(o=>{o.trim.diameter=d;}),'ขนาดเหล็กรอบช่อง')} ยื่น <select aria-label="ระยะยื่น" disabled={readOnly} value={typeof so.trim.ext==='number'?'mm':so.trim.ext} onChange={e=>up(o=>{o.trim.ext=e.target.value==='mm'?600:e.target.value as 'ld'|'lap';})}><option value="ld">Ld</option><option value="lap">Lap</option><option value="mm">กำหนด mm</option></select>
      {typeof so.trim.ext==='number'&&num(so.trim.ext,v=>up(o=>{o.trim.ext=v;}),{label:'ยื่น mm',w:60})}
      <label className="check"><input type="checkbox" disabled={readOnly} checked={so.trim.diagonal} onChange={e=>up(o=>{o.trim.diagonal=e.target.checked;})}/>ทแยง</label></span>
     <button type="button" className="icon" aria-label="ลบช่องเปิด" disabled={readOnly} onClick={()=>{set(r=>{r.openings.splice(k,1);});setSel(null);}}><Trash2 size={13}/></button></div>;})()}
   </main>

   {/* ---------- right: bars, methods, summary ---------- */}
   <aside className="wr-right" aria-label="เหล็กผนัง">
    <b className="wr-title">เหล็กผนัง</b>
    {(spec.wallTemplates||[]).length>0&&<label className="field"><span>ดึงจากตาราง RC Wall</span><select disabled={readOnly} value="" onChange={e=>{const t=spec.wallTemplates!.find(x=>x.id===e.target.value);if(t)onChange(applyWallTemplateToRun(run,t));}}><option value="">— เลือกเบอร์ผนัง —</option>{spec.wallTemplates!.map(t=><option key={t.id} value={t.id} title={wallTemplateSummary(t)}>{t.name} · {wallTemplateSummary(t)}</option>)}</select></label>}
    <label className="field"><span>จำนวนชั้นเหล็ก</span><select disabled={readOnly} value={run.rebar.layers} onChange={e=>set(r=>{r.rebar.layers=Number(e.target.value) as 1|2;})}><option value={2}>2 ชั้น (ผิวนอก / ผิวใน)</option><option value={1}>1 ชั้น (กึ่งกลาง)</option></select></label>
    {meshRow(run.rebar.layers===2?'ตั้ง · นอก':'ตั้ง',run.rebar.outer.vertical,m=>set(r=>{r.rebar.outer.vertical=m;}))}{meshRow(run.rebar.layers===2?'นอน · นอก':'นอน',run.rebar.outer.horizontal,m=>set(r=>{r.rebar.outer.horizontal=m;}))}
    {run.rebar.layers===2&&<>{meshRow('ตั้ง · ใน',run.rebar.inner.vertical,m=>set(r=>{r.rebar.inner.vertical=m;}))}{meshRow('นอน · ใน',run.rebar.inner.horizontal,m=>set(r=>{r.rebar.inner.horizontal=m;}))}</>}
    {ret&&<p className="muted">เหล็กหลักฝั่งดิน = ผิว{run.retaining?.soilSide==='out'?'นอก':'ใน'}</p>}
    <label className="field"><span>มุมผนัง (L)</span><select disabled={readOnly||run.rebar.layers===1} value={run.rebar.corner} onChange={e=>set(r=>{r.rebar.corner=e.target.value as WallRun['rebar']['corner'];})}><option value="ubar">U-bar ทับมุม · เหล็กนอนหยุดก่อนมุม (แนะนำ)</option><option value="lap-l">งอ L รอบมุม · ทาบนอกมุม</option><option value="hook90">ขอ 90° เข้าผนังตั้งฉาก</option></select></label>
    <label className="field"><span>จุดต่อ T</span><select disabled={readOnly} value={run.rebar.tee} onChange={e=>set(r=>{r.rebar.tee=e.target.value as WallRun['rebar']['tee'];})}><option value="l-anchor">ผนังรองงอ L ยึดเข้าผนังหลัก (Ldh)</option><option value="ubar">U-bar คร่อม</option></select></label>
    <label className="field"><span>ปลายผนังอิสระ</span><select disabled={readOnly} value={run.rebar.freeEnd} onChange={e=>set(r=>{r.rebar.freeEnd=e.target.value as WallRun['rebar']['freeEnd'];if(r.rebar.freeEnd==='boundary'&&!r.rebar.boundary)r.rebar.boundary={length:600,ties:{diameter:9,spacing:150},bars:{count:6,diameter:16}};})}><option value="ucap-edge">U ปิดปลาย + EDGE BAR</option><option value="boundary">Boundary element (ปลอกรัด)</option><option value="plain">ปลายตรงที่ cover (แบบเดิม)</option></select></label>
    {run.rebar.freeEnd==='ucap-edge'&&<div className="wr-mesh"><span>EDGE BAR</span>{num(run.rebar.edgeBar?.count||0,v=>set(r=>{r.rebar.edgeBar={count:Math.min(40,Math.round(v)),diameter:r.rebar.edgeBar?.diameter||12};}),{label:'จำนวน EDGE',w:44})}-{dsel(run.rebar.edgeBar?.diameter||12,d=>set(r=>{r.rebar.edgeBar={count:r.rebar.edgeBar?.count||0,diameter:d};}),'ขนาด EDGE')}</div>}
    {run.rebar.freeEnd==='boundary'&&run.rebar.boundary&&<><div className="wr-mesh"><span>ยาว</span>{num(run.rebar.boundary.length,v=>set(r=>{r.rebar.boundary!.length=Math.max(200,v);}),{label:'ยาว boundary',w:60})}<span>เหล็ก</span>{num(run.rebar.boundary.bars.count,v=>set(r=>{r.rebar.boundary!.bars.count=Math.round(v);}),{label:'จำนวน',w:40})}-{dsel(run.rebar.boundary.bars.diameter,d=>set(r=>{r.rebar.boundary!.bars.diameter=d;}),'ขนาด boundary')}</div>
     {meshRow('ปลอกรัด',run.rebar.boundary.ties,m=>set(r=>{r.rebar.boundary!.ties=m;}))}</>}
    <div className="wr-type-note"><b>ชนิด “{wallTypeLabels[run.wallType]}”</b> ตั้งค่าให้: {wallTypeNotes[run.wallType]}</div>
    <b className="wr-title">สรุป</b>
    {preview?<><p>คอนกรีต <b>{number(preview.q.concrete,3)}</b> m³ · แบบหล่อ <b>{number(preview.q.formwork,2)}</b> m²<br/>เหล็ก <b>{number(preview.q.rebar,1)}</b> kg · {preview.member.bars.length} Mark</p>
     <p className="muted">{(['V','H','C','T','S','OP','B','K'] as WallKind[]).filter(k=>marks(k)).map(k=>`${wallKindNames[k]} ${marks(k)}`).join(' · ')}</p>
     {lifts.length>1&&<table className="wr-table wr-lifts"><thead><tr><th>ช่วงเท</th><th>m³</th><th>m²</th><th>kg</th></tr></thead><tbody>{lifts.map(l=><tr key={l.id}><td>{l.name}</td><td>{number(l.concrete,2)}</td><td>{number(l.formwork,1)}</td><td>{number(l.kg,0)}</td></tr>)}</tbody></table>}</>
     :<p className="muted">แก้ข้อมูลที่ขาดให้ครบเพื่อดูปริมาณ</p>}
   </aside>
  </div>
 </div>;
}
/** New Wall Run input of a wall type (keeps the cover / detailing of the current wall input). */
export function withWallType(i:WallInput,t:WallType):WallInput{return {...i,layout:'run',run:defaultWallRun(t),cover:t==='tank'||t==='retaining'?{face:Math.max(i.cover.face,40),edge:Math.max(i.cover.edge,40)}:i.cover};}
