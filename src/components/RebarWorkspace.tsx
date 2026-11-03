import {lazy,Suspense,useEffect,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent as RPointerEvent} from 'react';
import {Box,MousePointer2,PenLine,Grid3x3,Repeat,Sparkles,Trash2,Undo2,Wand2} from 'lucide-react';
import type {Bar,Member,Project} from '../domain/model';
import {takeoff,validateMember} from '../domain/engine';
import {buildView,markColors} from '../domain/elementViews';
import {codeValues} from '../domain/designCodes';
import {partPolygon,shapeGeometry} from '../domain/shapeGeometry';
import {hookDevLength,lapLength} from '../domain/elementInput';
import {partPurposeLabels,partPurposes,type PartPurpose,type PartRebar,type ShapePart} from '../domain/shapeModelSchema';
import {addHooks,coverRings,defaultRange,detectShapeCode,edgeSegments,insideCover,isSketchBar,nextMark,offsetSegments,polyLength,sketchBar,snapPoint,snapToCover,toView,traceCover,viewAxes,viewRegion,
 type CoverHit,type HookEnd,type HookTable,type LayoutRule,type P2,type Seg,type Snap,type SketchView} from '../domain/rebarSketch';
import {applyPartPresets,barPart,defaultPartRebar,detailingFor,guessPurpose,isPresetBar,outsideLengths,partBox,partCoverage,partSketchId,withOutsideRegions} from '../domain/partRebar';
import {Field,number} from './EditorControls';
import {ModelView} from './Geometry';
import {DIAS,HookFields,LayoutFields,LoopTool,MeshTool,NotesTool,viewOfBar,type Tool} from './RebarSketch';

const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');
type Kind=SketchView['kind'];
/** Cut positions shared by the views: x = section Y–Y plane, y = section X–X plane, z = plan level. */
type Cuts={x:number;y:number;z:number};
const viewOf=(kind:Kind,c:Cuts):SketchView=>({kind,at:kind==='sx'?c.y:kind==='sy'?c.x:c.z});
type CSnap=Snap|{p:P2;kind:'lap';label:string};
const snapLabels:Record<CSnap['kind'],string>={corner:'มุม cover',cover:'แนว cover',edge:'ขอบคอนกรีต',ortho:'แนวฉาก',grid:'grid',free:'อิสระ',lap:'ระยะพ้นผิวคอนกรีต'};
const cutLabels=['Y–Y','X–X','แปลน'];
const viewTitles:Record<Kind,string>={plan:'แปลน',sx:'รูปตัด X–X',sy:'รูปตัด Y–Y'};
/** Distance along the ray o + t·u to segment s (undefined when it misses). */
function rayHit(o:P2,u:P2,s:Seg){const e=[s.b[0]-s.a[0],s.b[1]-s.a[1]],den=u[0]*e[1]-u[1]*e[0];if(Math.abs(den)<1e-9)return;const w=[s.a[0]-o[0],s.a[1]-o[1]],t=(w[0]*e[1]-w[1]*e[0])/den,k=(w[0]*u[1]-w[1]*u[0])/den;return k>=-1e-9&&k<=1+1e-9?t:undefined;}
const Custom3DModal=lazy(()=>import('./Element3DModal').then(m=>({default:m.Custom3DModal})));

type Ctx={
 m:Member;rows:ReturnType<typeof takeoff>['rows'];colors:Map<string,string>;readOnly:boolean;tool:Tool;force:boolean;grid:number;ortho:boolean;dia:number;off:number;
 cuts:Cuts;setCuts:(c:Cuts)=>void;active:Kind;setActive:(k:Kind)=>void;focus:string;setFocus:(id:string)=>void;
 pts:P2[];hits:CoverHit[];drawKind:Kind|null;setPts:(f:(p:P2[])=>P2[])=>void;setHits:(f:(h:CoverHit[])=>CoverHit[])=>void;setDrawKind:(k:Kind)=>void;reset:()=>void;
 hooks:{start:HookEnd;end:HookEnd};hookTable:HookTable;laps:{label:string;len:number}[];
 finish:(view:SketchView,points:P2[],rings:P2[][])=>void;sel:string;setSel:(id:string)=>void;selBar?:Bar;selView?:SketchView;
 updateSel:(patch:{points?:P2[];layout?:LayoutRule},final?:boolean)=>void;settle:()=>void;deleteSel:()=>void;
};

/** Rebar workspace for shape-model members: pick a part (purpose + preset bars, completeness), draw bars in plan /
 * section X–X / section Y–Y side by side with 3D; cut lines, bar points and distribution ranges are dragged in any view;
 * bars may run past the concrete (laps / starters / dowels get reference regions, snaps at lap / Ldh). */
export function RebarSketch({member:m,project,readOnly,onChange}:{member:Member;project:Project;readOnly:boolean;onChange:(next:Member)=>void}){
 const sm=m.shapeModel,spec=project.spec,det=useMemo(()=>detailingFor(spec),[spec]);
 const g=useMemo(()=>sm?shapeGeometry(sm):undefined,[sm]);
 const solids=sm?.parts||[];
 const [focus,setFocusId]=useState(''),focusPart=solids.find(p=>p.id===focus);
 const [cuts,setCuts]=useState<Cuts>(()=>({x:Math.round(m.x/2),y:Math.round(m.y/2),z:Math.round(Math.min(m.z/2,m.cover+8))}));
 const setFocus=(id:string)=>{setFocusId(id);const p=solids.find(q=>q.id===id);if(p){const b=partBox(p);setCuts({x:Math.round((b.x0+b.x1)/2),y:Math.round((b.y0+b.y1)/2),z:Math.round((b.z0+b.z1)/2)});}};
 const [active,setActive]=useState<Kind>('sx'),[view3d,setView3d]=useState(false),[tool,setTool]=useState<Tool>(()=>m.shapeModel?.rebarNotes?.length&&!m.bars.some(isSketchBar)&&!m.bars.some(isPresetBar)?'notes':'select');
 const [dia,setDia]=useState(16),[cover,setCover]=useState(m.cover),[extra,setExtra]=useState(0),[grid,setGrid]=useState(25),[ortho,setOrtho]=useState(true);
 const grades=codeValues(spec.codeData,spec.designCode).grades,gradeOf=(d:number)=>grades.find(r=>r.bar===d)?.grade||(d<=9?'SR24':'SD40');
 // default distribution range: along the drawing view's normal over the part in focus (else the member)
 const rangeFor=(kind:Kind):[number,number]=>{const n=viewAxes({kind,at:0}).n,c=cover+dia/2;if(focusPart){const b=partBox(focusPart),lo=[b.x0,b.y0,b.z0][n],hi=[b.x1,b.y1,b.z1][n];return [lo+c,Math.max(lo+c,hi-c)];}return defaultRange(m,{kind,at:0},cover,dia);};
 const [layout,setLayout]=useState<LayoutRule>(()=>{const [from,to]=defaultRange(m,{kind:'sx',at:0},m.cover,16);return {rule:'spacing',spacing:200,count:5,from,to};});
 useEffect(()=>{const [from,to]=rangeFor(active);setLayout(l=>({...l,from,to}));},[active,focus,cover,dia,m.x,m.y,m.z]);
 const [pts,setPts]=useState<P2[]>([]),[hits,setHits]=useState<CoverHit[]>([]),[drawKind,setDrawKind]=useState<Kind|null>(null),[sel,setSel]=useState('');
 const [force,setForce]=useState(true),[hooks,setHooks]=useState<{start:HookEnd;end:HookEnd}>({start:{kind:'none',leg:0},end:{kind:'none',leg:0}});
 const hookTable:HookTable=codeValues(spec.codeData,spec.designCode).endHooks.map(h=>({bar:h.bar,a90:h.a90}));
 const laps=useMemo(()=>[{label:`Lap ${fmt(lapLength(det,dia))}`,len:lapLength(det,dia)},{label:`Ldh ${fmt(hookDevLength(det,dia))}`,len:hookDevLength(det,dia)},{label:`12d ${fmt(12*dia)}`,len:12*dia}],[det,dia]);
 const rows=useMemo(()=>takeoff(m,spec).rows,[m,spec]),colors=useMemo(()=>markColors(rows),[rows]);
 const errors=useMemo(()=>validateMember(m,spec),[m,spec]),outsideLen=useMemo(()=>outsideLengths(m),[m]);
 const selBar=m.bars.find(b=>b.id===sel),selView=selBar?viewOfBar(selBar):undefined;
 const [notes,setNotes]=useState<string[]>([]);
 const commitBars=(bars:Bar[],select?:string,final=true)=>{const next={...m,bars};onChange(final?withOutsideRegions(next,spec):next);if(select!==undefined)setSel(select);};
 const reset=()=>{setPts([]);setHits([]);setDrawKind(null);};
 const finish=(view:SketchView,points:P2[],rings:P2[][])=>{if(points.length<2||readOnly){reset();return;}const h=addHooks(points,hooks,dia,rings,hookTable),mark=nextMark(m);
  const bar=sketchBar({...(focus?{id:partSketchId(focus)}:{}),mark,view,points:h.points,diameter:dia,grade:gradeOf(dia),layout});setNotes(h.notes);commitBars([...m.bars,bar],bar.id);reset();setTool('select');};
 const updateSel=(patch:{points?:P2[];diameter?:number;layout?:LayoutRule;grade?:string;mark?:string},final=true)=>{if(!selBar||!selView)return;
  const old=selBar.points.map(p=>toView(selView,p as [number,number,number]));const l=patch.layout||{rule:selBar.count===1?'single':'count',spacing:layout.spacing,count:selBar.count,from:selBar.distributionStart,to:selBar.distributionEnd} as LayoutRule;
  const next=sketchBar({id:selBar.id,mark:patch.mark||selBar.mark,view:selView,points:patch.points||old,diameter:patch.diameter||selBar.diameter,grade:patch.grade||selBar.grade,layout:l,note:selBar.note});
  commitBars(m.bars.map(b=>b.id===selBar.id?{...next,placementConfirmed:false}:b),undefined,final);};
 const settle=()=>onChange(withOutsideRegions(m,spec));
 const deleteSel=()=>{if(selBar&&!readOnly)commitBars(m.bars.filter(b=>b.id!==selBar.id),'');};
 const levels=g?[...new Set(g.levels)]:[];
 const sketchErrors=errors.filter(t=>m.bars.some(b=>(isSketchBar(b)||isPresetBar(b))&&t.startsWith(`${b.mark}:`)));
 if(!sm)return <section className="panel padded"><p className="notice">สร้างรูปทรงในแท็บ “รูปทรง (หลายชิ้นส่วน)” และกดใช้กับสมาชิกก่อน แล้วจึงใส่เหล็ก</p></section>;
 const ctx:Ctx={m,rows,colors,readOnly,tool,force,grid,ortho,dia,off:cover+extra+dia/2,cuts,setCuts,active,setActive,focus,setFocus,pts,hits,drawKind,setPts,setHits,setDrawKind,reset,hooks,hookTable,laps,finish,sel,setSel,selBar,selView,updateSel,settle,deleteSel};
 const owned=(b:Bar)=>barPart(sm,b),listed=m.bars.filter(b=>isSketchBar(b)||isPresetBar(b)).sort((a,b)=>Number(!!focus&&owned(b)===focus)-Number(!!focus&&owned(a)===focus));
 const savePart=(id:string,rebar:PartRebar|undefined)=>{const next={...m,shapeModel:{...sm,parts:sm.parts.map(p=>p.id===id?{...p,rebar}:p)}};const res=applyPartPresets(next,spec);setNotes(res.notes);onChange(res.member);};
 return <section className="panel padded rebar-sketch">
  {view3d&&<Suspense fallback={<div className="e3d-shade"><div className="notice">กำลังเปิดมุมมอง 3D…</div></div>}><Custom3DModal member={m} spec={spec} readOnly={readOnly} onChange={onChange} onClose={()=>setView3d(false)}/></Suspense>}
  <div className="section-heading"><div><h3>ใส่เหล็ก · เลือกชิ้นส่วน แล้วใช้ Preset หรือวาดในมุมมองใดก็ได้</h3><p className="muted">คลิกชิ้นส่วน (ในรายการ / มุมมอง / 3D) เพื่อโฟกัส · วาด: คลิกวางจุด ดับเบิลคลิก/Enter จบเส้น · ลากเส้นแนวตัด จุดเหล็ก (□) และช่วงกระจาย (◆) ได้ทุกมุมมอง · ปลดล็อก “บังคับตามแนว cover” เพื่อวาดเหล็กยื่นพ้นคอนกรีต</p></div>
   <div className="actions"><button className="view3d-button" onClick={()=>setView3d(true)} title="มุมมอง 3D แบบเต็ม · คลิกขวาเพื่อแก้ไขชิ้นส่วนและเหล็กเสริม"><Box size={15}/>3D Modal</button></div></div>
  <div className="part-strip" role="toolbar" aria-label="ชิ้นส่วน">
   <button type="button" className={!focus?'active':''} onClick={()=>setFocusId('')}>ทั้งหมด</button>
   {solids.map(p=>{const n=m.bars.filter(b=>owned(b)===p.id).length;return <button key={p.id} type="button" className={p.id===focus?'active':''} onClick={()=>setFocus(p.id)}><b>{p.label}</b><small>{p.rebar?partPurposeLabels[p.rebar.purpose]:'ยังไม่กำหนดหน้าที่'} · {n} ชุด</small></button>;})}
  </div>
  <div className={`sketch-layout${tool==='notes'?' notes-open':''}`}>
   <aside className="sketch-tools">
    {focusPart?<PartPanel key={focusPart.id} part={focusPart} m={m} spec={spec} det={det} readOnly={readOnly} onSave={r=>savePart(focusPart.id,r)}/>:<p className="muted part-hint">เลือกชิ้นส่วนด้านบนเพื่อกำหนดหน้าที่ (เสา / คาน / พื้น / ผนัง / ฐานราก) และใช้เหล็ก Preset</p>}
    <h4>เครื่องมือวาด</h4>
    <div className="sketch-toolbar">{([['draw',<PenLine size={14}/>,'วาดเหล็ก'],['select',<MousePointer2 size={14}/>,'เลือก / แก้'],['mesh',<Grid3x3 size={14}/>,'ตะแกรง (แปลน)'],['loop',<Repeat size={14}/>,'ลูปรอบผิว'],['notes',<Sparkles size={14}/>,'จาก Note ในแบบ']] as const).map(([k,i,l])=><button key={k} className={tool===k?'active':''} disabled={readOnly&&k!=='select'} onClick={()=>{setTool(k);reset();}}>{i}{l}</button>)}</div>
    <h4>เหล็ก</h4>
    <div className="form-grid">
     <label className="field"><span>ขนาด</span><select value={dia} onChange={e=>setDia(Number(e.target.value))}>{DIAS.map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label>
     <label className="field"><span>เกรด (ตาราง Spec)</span><input value={gradeOf(dia)} disabled/></label>
     <Field label="Cover (mm)" type="number" value={cover} onChange={v=>setCover(Math.max(0,Number(v)||0))}/>
     <Field label="เลื่อนชั้นเหล็กเพิ่ม (mm)" type="number" value={extra} onChange={v=>setExtra(Math.max(0,Number(v)||0))}/>
     <label className="field"><span>Snap grid</span><select value={grid} onChange={e=>setGrid(Number(e.target.value))}>{[0,5,10,25,50,100].map(v=><option key={v} value={v}>{v?`${v} mm`:'ปิด'}</option>)}</select></label>
     <label className="check"><input type="checkbox" checked={ortho} disabled={force} onChange={e=>setOrtho(e.target.checked)}/>แนวฉาก 90°</label>
    </div>
    <label className="check sketch-force"><input type="checkbox" checked={force} onChange={e=>{setForce(e.target.checked);reset();}}/><b>บังคับวาดตามแนว cover</b> (ปิดเพื่อวาดเหล็กยื่นพ้นคอนกรีต · Snap ที่ระยะ Lap / Ldh / 12d จากผิว)</label>
    <Field label="ระดับแปลน Z (mm)" type="number" value={cuts.z} onChange={v=>setCuts({...cuts,z:Number(v)||0})}/>
    <div className="sketch-levels">{levels.map(z=><button key={z} type="button" onClick={()=>setCuts({...cuts,z})}>{fmt(z)}</button>)}</div>
    <h4>ขอที่ปลายเหล็ก</h4>
    <HookFields label="ปลายต้น" value={hooks.start} d={dia} table={hookTable} onChange={v=>setHooks(h=>({...h,start:v}))}/>
    <HookFields label="ปลายท้าย" value={hooks.end} d={dia} table={hookTable} onChange={v=>setHooks(h=>({...h,end:v}))}/>
    {tool==='draw'&&<><h4>Layout · กระจายตั้งฉาก{viewTitles[active]}{focusPart?` · ในชิ้น ${focusPart.label}`:''}</h4><LayoutFields layout={layout} onChange={setLayout}/></>}
    {tool==='mesh'&&<MeshTool m={m} z={cuts.z} dia={dia} cover={cover} grade={gradeOf(dia)} readOnly={readOnly} onCreate={bars=>commitBars([...m.bars,...bars],bars[0]?.id||'')}/>}
    {tool==='notes'&&<NotesTool m={m} readOnly={readOnly} gradeOf={gradeOf} onNotes={rebarNotes=>onChange({...m,shapeModel:{...sm,...(rebarNotes.length?{rebarNotes}:{rebarNotes:undefined})}})} onCreate={bars=>commitBars([...m.bars,...bars],bars[0]?.id||'')}/>}
    {tool==='loop'&&<LoopTool m={m} z={cuts.z} dia={dia} cover={cover} grade={gradeOf(dia)} readOnly={readOnly} onCreate={bars=>commitBars([...m.bars,...bars],bars[0]?.id||'')}/>}
   </aside>
   <div className="sketch-views">
    <SketchCanvas kind="plan" ctx={ctx}/>
    <div className="sketch-canvas sketch-3d"><div className="sketch-status"><b>3D</b><span>ชิ้นที่โฟกัส = สีส้ม · คลิกเหล็กเลือก Mark · คลิกคอนกรีตเลือกชิ้น</span></div><ModelView member={m} spec={spec} selected={sel} onSelect={setSel} part={focus} onPart={setFocus} height={330} keepView/></div>
    <SketchCanvas kind="sx" ctx={ctx}/>
    <SketchCanvas kind="sy" ctx={ctx}/>
   </div>
   <aside className="sketch-props">
    {notes.length>0&&<p className="notice warning">{notes.join(' · ')}</p>}
    <h4>ชุดเหล็ก ({listed.length}){focusPart?` · ${focusPart.label} อยู่บนสุด`:''}</h4>
    <div className="sketch-list">{listed.map(b=>{const o=owned(b),op=sm.parts.find(p=>p.id===o),out=outsideLen.get(b.id);return <button key={b.id} type="button" className={`${b.id===sel?'active':''} ${focus&&o!==focus?'dim':''}`} onClick={()=>{setSel(b.id);const v=viewOfBar(b);if(v)setCuts({...cuts,...(v.kind==='sx'?{y:Math.round(b.points[0][1])}:v.kind==='sy'?{x:Math.round(b.points[0][0])}:{z:Math.round(b.points[0][2])})});setTool('select');}}>
     <i style={{background:colors.get(b.id)}}/><span><b>{b.mark}</b> {b.diameter<=9?'RB':'DB'}{b.diameter} × {b.count} · {b.shapeCode}{isPresetBar(b)?' · Preset':''}<small>{op?`${op.label} · `:''}{b.note}{out?` · ยื่นพ้นคอนกรีต ${fmt(out)} mm`:''}</small></span></button>;})}</div>
    {selBar&&<div className="sketch-sel"><h4>{selBar.mark} · คุณสมบัติ</h4>
     {isSketchBar(selBar)&&selView?<>
      <div className="form-grid"><Field label="Mark" value={selBar.mark} disabled={readOnly} onChange={v=>updateSel({mark:String(v).slice(0,32)||selBar.mark})}/>
       <label className="field"><span>ขนาด</span><select disabled={readOnly} value={selBar.diameter} onChange={e=>{const d=Number(e.target.value);updateSel({diameter:d,grade:gradeOf(d)});}}>{DIAS.map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label></div>
      <LayoutFields layout={{rule:selBar.count===1?'single':'count',spacing:layout.spacing,count:selBar.count,from:selBar.distributionStart,to:selBar.distributionEnd}} onChange={l=>updateSel({layout:l})} disabled={readOnly}/>
      <div className="actions sketch-hook-add">{(['start','end'] as const).map(k=><button key={k} type="button" disabled={readOnly||hooks[k].kind==='none'} title="ใช้ชนิดขอที่เลือกในแผงซ้าย" onClick={()=>{const old=selBar.points.map(p=>toView(selView,p as [number,number,number])),rings=coverRings(viewRegion(m,{...selView,at:selView.kind==='sx'?cuts.y:selView.kind==='sy'?cuts.x:cuts.z}),cover+extra+selBar.diameter/2),h=addHooks(old,{start:k==='start'?hooks.start:{kind:'none',leg:0},end:k==='end'?hooks.end:{kind:'none',leg:0}},selBar.diameter,rings,hookTable);setNotes(h.notes);updateSel({points:h.points});}}>+ ขอ{k==='start'?'ปลายต้น':'ปลายท้าย'}</button>)}</div>
      <p className="muted">Shape {selBar.shapeCode} · {selBar.points.length} จุด · ลากจุด (□) ใน{viewTitles[selView.kind]} · ลากช่วงกระจาย (◆) ในมุมมองอื่น</p></>
      :isPresetBar(selBar)?<p className="muted">ชุด Preset ของชิ้นส่วน · แก้ขนาด / ระยะในแผง “หน้าที่ของชิ้น” ด้านซ้าย (สร้างใหม่ทุกครั้งที่รูปทรงเปลี่ยน)</p>
      :<p className="muted">ชุดนี้สร้างด้วยเครื่องมืออื่น · แก้ในแท็บ “แบบ & BBS”</p>}
     {(()=>{const r=rows.find(x=>x.id===selBar.id);return r?<table className="shape-qty"><tbody><tr><td>ยาวตัด</td><td>{fmt(r.cutLength)} mm</td></tr><tr><td>จำนวน</td><td>{r.count}</td></tr><tr><td>น้ำหนัก / ชิ้น</td><td>{number(r.weight,2)} kg</td></tr>{outsideLen.get(selBar.id)?<tr><td>ยื่นพ้นคอนกรีต</td><td>{fmt(outsideLen.get(selBar.id)!)} mm</td></tr>:null}</tbody></table>:null;})()}
     {!isPresetBar(selBar)&&<button type="button" className="danger-text" disabled={readOnly} onClick={deleteSel}><Trash2 size={13}/>ลบชุดเหล็กนี้</button>}</div>}
    <h4>ตรวจ</h4>
    {sketchErrors.length?<ul className="shape-check bad">{sketchErrors.slice(0,8).map(t=><li key={t}>{t}</li>)}</ul>:<p className="ok-text">✔ cover · อยู่ในคอนกรีต / พื้นที่อ้างอิง · ไม่ผ่านช่องเปิด</p>}
    {m.placementContext?.regions.some(r=>r.id.startsWith('genext-'))&&<p className="muted">เส้นประทอง = พื้นที่อ้างอิงของเหล็กที่ยื่นพ้นคอนกรีต (ไม่คิดคอนกรีต / แบบหล่อ)</p>}
    <p className="muted">หลังใส่เหล็ก: ตรวจในแท็บ “ตรวจเหล็กทับกัน” · ยืนยันตำแหน่งใน “แบบ & BBS” · บันทึกสมาชิก</p>
   </aside>
  </div>
 </section>;
}

/** Purpose of the part in focus, its preset values and what is still missing. Edits stay local until “สร้าง / อัปเดต”. */
function PartPanel({part,m,spec,det,readOnly,onSave}:{part:ShapePart;m:Member;spec:Project['spec'];det:ReturnType<typeof detailingFor>;readOnly:boolean;onSave:(r:PartRebar|undefined)=>void}){
 const [r,setR]=useState<PartRebar>(()=>part.rebar||defaultPartRebar(guessPurpose(part,m.shapeModel),part,det,m.shapeModel));
 const dirty=JSON.stringify(r)!==JSON.stringify(part.rebar);
 const cov=useMemo(()=>partCoverage(m,part,spec),[m,part,spec]);
 const dsel=(label:string,v:number,on:(d:number)=>void)=><label className="field"><span>{label}</span><select disabled={readOnly} value={v} onChange={e=>on(Number(e.target.value))}>{DIAS.map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label>;
 const num=(label:string,v:number,on:(n:number)=>void,min=0)=><Field label={label} type="number" disabled={readOnly} value={v} onChange={x=>on(Math.max(min,Number(x)||0))}/>;
 const at=(k:'meshB'|'meshT'|'loops'|'vert'|'horz'|'tie'|'stirrup',label:string)=>{const v=r[k]||{d:12,s:0};return <>{dsel(`${label} ขนาด`,v.d,d=>setR({...r,[k]:{...v,d}}))}{num(`${label} @ (0 = ไม่ใช้)`,v.s,s=>setR({...r,[k]:{...v,s}}))}</>;};
 const cnt=(k:'top'|'bottom',label:string)=>{const v=r[k]||{d:16,n:0};return <>{dsel(`${label} ขนาด`,v.d,d=>setR({...r,[k]:{...v,d}}))}{num(`${label} จำนวน`,v.n,n=>setR({...r,[k]:{...v,n:Math.min(40,Math.trunc(n))}}))}</>;};
 const lap=lapLength(det,r.main?.d||r.vert?.d||r.top?.d||16);
 return <div className="part-panel"><h4>หน้าที่ของชิ้น · {part.label}</h4>
  <label className="field"><span>ใช้เป็น</span><select disabled={readOnly} value={r.purpose} onChange={e=>setR(defaultPartRebar(e.target.value as PartPurpose,part,det,m.shapeModel))}>{(part.role==='void'?(['other','wall'] as const):partPurposes).map(k=><option key={k} value={k}>{part.role==='void'&&k==='wall'?'เหล็กรอบผิวบ่อ / ช่องเปิด':partPurposeLabels[k]}{!part.rebar&&k===guessPurpose(part,m.shapeModel)?' (แนะนำ)':''}</option>)}</select></label>
  <div className="form-grid">
   {r.purpose==='column'&&<>{dsel('เหล็กยืน ขนาด',r.main?.d||16,d=>setR({...r,main:{...r.main!,d}}))}<span/>{num('จำนวนต่อด้าน X (รวมมุม)',r.main?.nx||2,n=>setR({...r,main:{...r.main!,nx:Math.min(20,Math.max(2,Math.trunc(n)))}}),2)}{num('จำนวนต่อด้าน Y (รวมมุม)',r.main?.ny||2,n=>setR({...r,main:{...r.main!,ny:Math.min(20,Math.max(2,Math.trunc(n)))}}),2)}{at('tie','ปลอก')}</>}
   {r.purpose==='beam'&&<>{cnt('top','เหล็กบน')}{cnt('bottom','เหล็กล่าง')}{at('stirrup','ปลอก')}</>}
   {(r.purpose==='slab'||r.purpose==='footing')&&<>{at('meshB','ตะแกรงล่าง')}{at('meshT','ตะแกรงบน')}</>}
   {r.purpose==='footing'&&<>{at('loops','ลูปรอบผิว')}<label className="check"><input type="checkbox" disabled={readOnly} checked={!!r.legs} onChange={e=>setR({...r,legs:e.target.checked})}/>ตะแกรงล่างงอขึ้น (U)</label>
    <label className="check" title="ฐาน / ก้อนเทที่ติดกันและเริ่มระดับเดียวกัน: ลูปวิ่งรอบแปลนรวม ชิ้นแรกของกลุ่มเป็นผู้สร้าง"><input type="checkbox" disabled={readOnly} checked={!!r.loopsJoined} onChange={e=>setR({...r,loopsJoined:e.target.checked})}/>ลูปรอบแปลนรวมกับชิ้นที่ติดกัน</label></>}
   {r.purpose==='wall'&&<>{at('vert','เหล็กตั้ง')}{at('horz','เหล็กนอน')}<label className="field"><span>ชั้นเหล็ก</span><select disabled={readOnly} value={r.layers??2} onChange={e=>setR({...r,layers:Number(e.target.value) as 1|2})}><option value={2}>2 ชั้น (2 ผิว)</option><option value={1}>1 ชั้น (กลาง)</option></select></label><span/></>}
   {(r.purpose==='column'||r.purpose==='wall'||r.purpose==='beam')&&<>{num(r.purpose==='beam'?'ยื่นพ้นปลายคาน (mm)':'ยื่นพ้นหัว (mm)',r.ext||0,ext=>setR({...r,ext}))}<button type="button" className="link-button" disabled={readOnly} onClick={()=>setR({...r,ext:lap})}>= Lap {fmt(lap)}</button></>}
   {(r.purpose==='column'||r.purpose==='wall')&&<label className="check"><input type="checkbox" disabled={readOnly} checked={!!r.anchor} onChange={e=>setR({...r,anchor:e.target.checked})}/>ยึดลงชิ้นด้านล่าง (ขา 90°)</label>}
   {r.purpose!=='other'&&num(`Cover ชิ้นนี้ (≥ ${m.cover})`,r.cover??m.cover,c=>setR({...r,cover:Math.max(m.cover,c)}))}
  </div>
  {r.purpose==='other'?<p className="muted">ไม่มี Preset · ใช้ “วาดเหล็ก” ในมุมมอง (เหล็กที่วาดขณะโฟกัสชิ้นนี้จะย้ายตามชิ้น)</p>:null}
  <div className="actions part-actions"><button type="button" className="primary" disabled={readOnly||(!dirty&&!!part.rebar&&m.bars.some(b=>barPart(m.shapeModel,b)===part.id&&isPresetBar(b)))} onClick={()=>onSave(r)}><Wand2 size={13}/>{part.rebar?'อัปเดตเหล็ก Preset':'สร้างเหล็ก Preset'}</button>
   {part.rebar&&<button type="button" className="danger-text" disabled={readOnly} onClick={()=>{if(confirm(`ลบเหล็ก Preset ของ “${part.label}”?`))onSave(undefined);}}><Trash2 size={13}/>ลบ Preset</button>}</div>
  {cov.length>0&&<><h4>ความครบของเหล็ก</h4><ul className="part-coverage">{cov.map(c=><li key={c.label} className={c.ok===true?'ok':c.ok==='warn'?'warn':'bad'}>{c.ok===true?'✔':c.ok==='warn'?'!':'✖'} {c.label}{c.hint?<small> · {c.hint}</small>:null}</li>)}</ul></>}
 </div>;
}

type CanvasDrag={kind:'pt';index:number}|{kind:'cut';axis:number}|{kind:'range';end:'from'|'to'};
/** One 2D view (plan / section X–X / section Y–Y) of the workspace: parts, cover lines, bars, cut lines, drawing and grips. */
function SketchCanvas({kind,ctx}:{kind:Kind;ctx:Ctx}){
 const {m}=ctx,view=viewOf(kind,ctx.cuts),a=viewAxes(view),sm=m.shapeModel!;
 const region=useMemo(()=>viewRegion(m,view),[m,kind,view.at]);
 const coverSegs=useMemo(()=>offsetSegments(region,ctx.off),[region,ctx.off]),edges=useMemo(()=>edgeSegments(region),[region]);
 const rings=useMemo(()=>coverRings(region,ctx.off),[region,ctx.off]),faces=useMemo(()=>coverRings(region,0),[region]);
 const vd=useMemo(()=>buildView(m,ctx.rows,undefined,kind==='plan'?{axes:[0,1]}:{axes:[a.u,a.v] as [number,number],normal:a.n,cut:view.at}),[m,ctx.rows,kind,view.at]);
 const W=560,H=380,M=46,svg=useRef<SVGSVGElement>(null),size=[m.x,m.y,m.z];
 const all:P2[]=[[0,0],[size[a.u],size[a.v]],...vd.bars.flatMap(b=>[...b.lines.flatMap(l=>[l.a,l.b]),...b.dots])];
 const live={lo:[Math.min(...all.map(p=>p[0])),Math.min(...all.map(p=>p[1]))],hi:[Math.max(...all.map(p=>p[0])),Math.max(...all.map(p=>p[1]))]};
 const [drag,setDrag]=useState<(CanvasDrag&{frame:typeof live})|null>(null),{lo,hi}=drag?.frame??live;
 const s=Math.min((W-2*M)/(hi[0]-lo[0]||1),(H-2*M)/(hi[1]-lo[1]||1)),ox=M+((W-2*M)-(hi[0]-lo[0])*s)/2,oy=H-M-((H-2*M)-(hi[1]-lo[1])*s)/2;
 const X=(u:number)=>ox+(u-lo[0])*s,Y=(v:number)=>oy-(v-lo[1])*s;
 const world=(e:{clientX:number;clientY:number}):P2=>{const t=svg.current!.getScreenCTM()!.inverse(),p=new DOMPoint(e.clientX,e.clientY).matrixTransform(t);return [(p.x-ox)/s+lo[0],(oy-p.y)/s+lo[1]];};
 const [hover,setHover]=useState<CSnap|null>(null),[hoverHit,setHoverHit]=useState<CoverHit|null>(null);
 const mine=ctx.drawKind===kind,pts=mine?ctx.pts:[],hits=mine?ctx.hits:[];
 // bar running past the concrete: snap at lap / Ldh / 12d beyond the first face crossed from the previous point
 const lapSnap=(raw:P2,prev?:P2):CSnap|undefined=>{
  if(ctx.force||!prev)return;let dx=raw[0]-prev[0],dy=raw[1]-prev[1];if(ctx.ortho){if(Math.abs(dx)>=Math.abs(dy))dy=0;else dx=0;}
  const L=Math.hypot(dx,dy);if(L<1)return;const u:P2=[dx/L,dy/L];let tE=Infinity;for(const e of edges){const t=rayHit(prev,u,e);if(t!==undefined&&t>1e-6&&t<tE)tE=t;}
  if(!Number.isFinite(tE))return;const along=(raw[0]-prev[0])*u[0]+(raw[1]-prev[1])*u[1];
  for(const l of ctx.laps){const t=tE+l.len;if(Math.abs(along-t)<=14/s)return {p:[prev[0]+u[0]*t,prev[1]+u[1]*t],kind:'lap',label:l.label};}
 };
 const snapAt=(e:{clientX:number;clientY:number},prev?:P2):CSnap=>{const w=world(e),base=snapPoint(w,{cover:coverSegs,edges,prev,tol:12/s,grid:ctx.grid,ortho:ctx.ortho}),lap=lapSnap(w,prev);return lap&&base.kind!=='corner'&&base.kind!=='cover'?lap:base;};
 const coverAt=(e:{clientX:number;clientY:number})=>snapToCover(world(e),rings,12/s,ctx.grid);
 const finish=()=>ctx.finish(view,pts,rings);
 const editable=!!ctx.selBar&&isSketchBar(ctx.selBar)&&ctx.selView?.kind===kind;
 // distribution range grips: the selected sketch bar's distribution axis lies in this view
 const dAxis=ctx.selBar&&isSketchBar(ctx.selBar)&&ctx.selBar.distributionAxis?'XYZ'.indexOf(ctx.selBar.distributionAxis):-1,inPlane=dAxis===a.u||dAxis===a.v;
 const begin=(e:RPointerEvent,d:CanvasDrag)=>{if(ctx.readOnly)return;e.stopPropagation();(e.currentTarget as Element).setPointerCapture?.(e.pointerId);setDrag({...d,frame:live});};
 const down=(e:RPointerEvent)=>{ctx.setActive(kind);if(ctx.readOnly||ctx.tool!=='draw')return;(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  if(!mine&&ctx.pts.length)ctx.reset();if(e.detail>=2&&mine){finish();return;}
  ctx.setDrawKind(kind);
  if(ctx.force){const h=coverAt(e);if(!h)return;const last=pts.at(-1);if(last&&Math.hypot(last[0]-h.p[0],last[1]-h.p[1])<1)return;
   const via=hits.length?traceCover(rings,hits.at(-1)!,h):[];ctx.setPts(p=>[...p,...via,h.p]);ctx.setHits(x=>[...x,...via.map(()=>x.at(-1)!),h]);return;}
  const sp=snapAt(e,pts.at(-1));ctx.setPts(p=>p.length&&Math.hypot(p.at(-1)![0]-sp.p[0],p.at(-1)![1]-sp.p[1])<1?p:[...p,sp.p]);};
 const move=(e:RPointerEvent)=>{
  if(ctx.tool==='draw'&&(mine||!ctx.pts.length)){if(ctx.force){const h=coverAt(e)||null;setHoverHit(h);setHover(h?{p:h.p,kind:h.corner?'corner':'cover'}:null);}else setHover(snapAt(e,pts.at(-1)));}
  if(!drag)return;const w=world(e),g=ctx.grid>0?ctx.grid:1,sn=(v:number)=>Math.round(v/g)*g;
  if(drag.kind==='cut'){const k=drag.axis,v=sn(k===a.u?w[0]:w[1]);ctx.setCuts({...ctx.cuts,...(k===0?{x:v}:k===1?{y:v}:{z:v})});return;}
  const b=ctx.selBar,sv=ctx.selView;if(!b||!sv)return;
  if(drag.kind==='pt'&&editable){const old=b.points.map(p=>toView(sv,p as [number,number,number])),sp=ctx.force?coverAt(e)?.p:snapAt(e,old[drag.index-1]??old[drag.index+1]).p;if(sp)ctx.updateSel({points:old.map((p,i)=>i===drag.index?sp:p)},false);}
  if(drag.kind==='range'&&inPlane){const v=sn(dAxis===a.u?w[0]:w[1]),from=drag.end==='from'?v:b.distributionStart,to=drag.end==='to'?v:b.distributionEnd;
   ctx.updateSel({layout:{rule:b.count===1?'single':'count',spacing:0,count:b.count,from:Math.max(0,Math.min(from,to)),to:Math.max(0,Math.max(from,to))}},false);}
 };
 const up=()=>{if(drag&&drag.kind!=='cut')ctx.settle();setDrag(null);};
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();ctx.reset();}if(e.key==='Enter'&&mine)finish();if(e.key==='Backspace'&&mine&&pts.length){e.preventDefault();ctx.setPts(p=>p.slice(0,-1));ctx.setHits(x=>x.slice(0,-1));}if(e.key==='Delete')ctx.deleteSel();};
 const via=ctx.force&&mine&&hits.length&&hoverHit?traceCover(rings,hits.at(-1)!,hoverHit):[];
 const core=pts.length&&hover?[...pts,...via,hover.p]:pts,liveLine=core.length>=2?addHooks(core,ctx.hooks,ctx.dia,rings,ctx.hookTable).points:core,code=detectShapeCode(liveLine),total=polyLength(liveLine);
 // parts cut by this view (largest first so small parts stay clickable on top)
 const parts=sm.parts.filter(p=>p.role!=='void').map(p=>({p,b:partBox(p)})).sort((x,y)=>(y.b.x1-y.b.x0)*(y.b.y1-y.b.y0)-(x.b.x1-x.b.x0)*(x.b.y1-x.b.y0));
 const partShape=({p,b}:{p:ShapePart;b:ReturnType<typeof partBox>})=>{
  if(kind==='plan')return view.at>=b.z0-1e-6&&view.at<=b.z1+1e-6?partPolygon(p).map(r=>`M${r.map(q=>`${X(q[0])},${Y(q[1])}`).join('L')}Z`).join(''):'';
  const n0=[b.x0,b.y0,b.z0][a.n],n1=[b.x1,b.y1,b.z1][a.n];if(view.at<n0-1e-6||view.at>n1+1e-6)return '';
  const u0=[b.x0,b.y0,b.z0][a.u],u1=[b.x1,b.y1,b.z1][a.u];return `M${X(u0)},${Y(b.z0)}L${X(u1)},${Y(b.z0)}L${X(u1)},${Y(b.z1)}L${X(u0)},${Y(b.z1)}Z`;};
 // bar pieces past the concrete in sections (dashed)
 const outside=(l:{a:P2;b:P2})=>{if(kind==='plan')return [];const n=24,out:{a:P2;b:P2}[]=[];let start:P2|null=null;
  for(let k=0;k<=n;k++){const t=k/n,p:P2=[l.a[0]+(l.b[0]-l.a[0])*t,l.a[1]+(l.b[1]-l.a[1])*t],o=!insideCover(p,faces);if(o&&!start)start=p;if((!o||k===n)&&start){out.push({a:start,b:p});start=null;}}return out;};
 const status=mine&&pts.length?`${pts.length} จุด · ยาว ${fmt(total)} mm · Shape ${code||'—'}`:'';
 const cutLines=[a.u,a.v].map(k=>({k,v:k===0?ctx.cuts.x:k===1?ctx.cuts.y:ctx.cuts.z}));
 return <div className={`sketch-canvas ${ctx.active===kind?'active':''}`} tabIndex={0} onKeyDown={key}>
  <div className="sketch-status"><b>{viewTitles[kind]} · {kind==='plan'?`Z ${fmt(view.at)}`:kind==='sx'?`Y ${fmt(view.at)}`:`X ${fmt(view.at)}`}</b>
   {ctx.tool==='draw'&&(mine||!ctx.pts.length)&&<span>{status||'คลิกจุดเริ่มต้น'}{hover&&(mine||!ctx.pts.length)?` · Snap: ${hover.kind==='lap'?hover.label:snapLabels[hover.kind]}`:''}</span>}
   {mine&&pts.length>0&&<span className="actions"><button type="button" onClick={()=>{ctx.setPts(p=>p.slice(0,-1));ctx.setHits(x=>x.slice(0,-1));}}><Undo2 size={13}/>ลบจุด</button><button type="button" className="primary" disabled={pts.length<2} onClick={finish}>จบเส้น ({pts.length})</button></span>}</div>
  <svg ref={svg} className={`sketch-svg tool-${ctx.tool}`} viewBox={`0 0 ${W} ${H}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={()=>{setHover(null);up();}}>
   {region.map((poly,i)=><path key={i} className="sk-concrete" fillRule="evenodd" d={poly.map(r=>`M${(r as P2[]).map(p=>`${X(p[0])},${Y(p[1])}`).join('L')}Z`).join('')}/>)}
   {parts.map(q=>{const d=partShape(q);return d&&<path key={q.p.id} d={d} fillRule="evenodd" className={`sk-part ${q.p.role} ${q.p.id===ctx.focus?'focus':''}`} onPointerDown={()=>{if(ctx.tool!=='draw')ctx.setFocus(q.p.id);}}><title>{q.p.label}</title></path>;})}
   {rings.map((r,i)=><polygon key={i} className={`sk-cover ${ctx.force?'forced':''}`} points={r.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ')}/>)}
   {ctx.force&&ctx.tool==='draw'&&rings.flatMap((r,i)=>r.map((p,k)=><circle key={`${i}-${k}`} className="sk-corner" cx={X(p[0])} cy={Y(p[1])} r={2.5}/>))}
   {vd.bars.map(b=>{const c=ctx.colors.get(b.row.id)||'#167561',on=b.row.id===ctx.sel,dim=!!ctx.focus&&barPart(sm,b.row as unknown as Bar)!==ctx.focus&&!on;return <g key={b.row.id} className={`sk-bar ${on?'sel':''}`} opacity={dim?.28:1} onPointerDown={e=>{if(ctx.tool==='select'){e.stopPropagation();ctx.setSel(b.row.id);}}}>
    {b.lines.map((l,i)=><line key={i} x1={X(l.a[0])} y1={Y(l.a[1])} x2={X(l.b[0])} y2={Y(l.b[1])} stroke={on?'#d4802a':c} strokeWidth={Math.max(2,b.row.diameter*s)+(on?2:0)} strokeLinecap="round"/>)}
    {b.dots.map((d,i)=><circle key={i} cx={X(d[0])} cy={Y(d[1])} r={Math.max(2.5,b.row.diameter*s/2)} fill={on?'#d4802a':c}/>)}
    {!dim&&b.lines.flatMap((l,i)=>outside(l).map((o,k)=><line key={`o${i}-${k}`} className="sk-out" x1={X(o.a[0])} y1={Y(o.a[1])} x2={X(o.b[0])} y2={Y(o.b[1])}/>))}</g>;})}
   {cutLines.map(({k,v})=>k===a.u?<g key={k} className="sk-cut"><line x1={X(v)} x2={X(v)} y1={8} y2={H-8} onPointerDown={e=>begin(e,{kind:'cut',axis:k})}/><text x={X(v)+4} y={16}>{cutLabels[k]}</text></g>
    :<g key={k} className="sk-cut"><line y1={Y(v)} y2={Y(v)} x1={8} x2={W-8} onPointerDown={e=>begin(e,{kind:'cut',axis:k})}/><text x={W-10} y={Y(v)-4} textAnchor="end">{cutLabels[k]}</text></g>)}
   {editable&&ctx.selView&&ctx.selBar!.points.map((p,i)=>{const q=toView(ctx.selView!,p as [number,number,number]);return <rect key={i} className="sk-grip" x={X(q[0])-5} y={Y(q[1])-5} width={10} height={10} onPointerDown={e=>begin(e,{kind:'pt',index:i})}/>;})}
   {inPlane&&ctx.selBar&&(()=>{const b=ctx.selBar,p0=b.points[0],other=dAxis===a.u?a.v:a.u;return (['from','to'] as const).map(end=>{const v=end==='from'?b.distributionStart:b.distributionEnd,w:[number,number]=dAxis===a.u?[v,p0[other]]:[p0[other],v];
    return <g key={end} className="sk-range" onPointerDown={e=>begin(e,{kind:'range',end})}><circle className="hit" cx={X(w[0])} cy={Y(w[1])} r={13}/><polygon points={`${X(w[0])},${Y(w[1])-9} ${X(w[0])+9},${Y(w[1])} ${X(w[0])},${Y(w[1])+9} ${X(w[0])-9},${Y(w[1])}`}/><title>{end==='from'?'เริ่มกระจาย':'สิ้นสุดกระจาย'} {fmt(v)} · ลากเพื่อปรับ</title></g>;});})()}
   {liveLine.length>1&&<polyline className="sk-ghost" points={liveLine.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ')} strokeWidth={Math.max(2.5,ctx.dia*s)}/>}
   {liveLine.slice(1).map((p,i)=>{const q=liveLine[i],len=Math.hypot(p[0]-q[0],p[1]-q[1]);return len*s>36&&<text key={i} className="sk-len" x={(X(p[0])+X(q[0]))/2} y={(Y(p[1])+Y(q[1]))/2-6} textAnchor="middle">{fmt(len)}</text>;})}
   {pts.map((p,i)=><rect key={i} className="sk-pt" x={X(p[0])-4} y={Y(p[1])-4} width={8} height={8}/>)}
   {ctx.tool==='draw'&&hover&&(mine||!ctx.pts.length)&&<g className={`sk-snap ${hover.kind}`}><circle cx={X(hover.p[0])} cy={Y(hover.p[1])} r={hover.kind==='corner'?8:6}/>{hover.kind==='corner'&&<path d={`M${X(hover.p[0])-8} ${Y(hover.p[1])}h16M${X(hover.p[0])} ${Y(hover.p[1])-8}v16`}/>}{hover.kind==='lap'&&<text className="sk-len" x={X(hover.p[0])+8} y={Y(hover.p[1])-8}>{hover.label}</text>}</g>}
   <text className="sk-axis" x={W-10} y={H-8} textAnchor="end">{['X','Y','Z'][a.u]} → · {['X','Y','Z'][a.v]} ↑</text>
  </svg>
 </div>;
}
