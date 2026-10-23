import {lazy,Suspense,useEffect,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent as RPointerEvent} from 'react';
import {Box,MousePointer2,PenLine,Grid3x3,Repeat,Sparkles,Trash2,Undo2} from 'lucide-react';
import {barsFromSuggestions,suggestFromNotes,type NoteAction,type Suggestion} from '../domain/rebarNotes';
import type {Bar,Member,Project} from '../domain/model';
import {takeoff,validateMember} from '../domain/engine';
import {buildView} from '../domain/elementViews';
import {codeValues} from '../domain/designCodes';
import {shapeGeometry} from '../domain/shapeGeometry';
import {addHooks,coverRings,snapToCover,traceCover,type CoverHit,type HookEnd,type HookTable} from '../domain/rebarSketch';
import {defaultRange,detectShapeCode,edgeSegments,isSketchBar,layoutOf,loopBars,meshBars,nextMark,offsetSegments,polyLength,sketchBar,snapPoint,toView,viewAxes,viewRegion,type LayoutRule,type P2,type Snap,type SketchView} from '../domain/rebarSketch';
import {Field,number} from './EditorControls';
import {markColors} from '../domain/elementViews';

const DIAS=[6,9,10,12,16,20,25,28,32,36,40];
const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');
type Tool='draw'|'select'|'mesh'|'loop'|'notes';
const viewOfBar=(b:Bar):SketchView|undefined=>b.shape==='polyline'&&b.distributionAxis&&b.points.length>=2?{kind:b.distributionAxis==='Y'?'sx':b.distributionAxis==='X'?'sy':'plan',at:b.distributionStart}:undefined;

const Custom3DModal=lazy(()=>import('./Element3DModal').then(m=>({default:m.Custom3DModal})));
/** Phase 2 · Revit-like rebar sketching on sections / plan levels of a shape-model member. */
export function RebarSketch({member:m,project,readOnly,onChange}:{member:Member;project:Project;readOnly:boolean;onChange:(next:Member)=>void}){
 const g=useMemo(()=>m.shapeModel?shapeGeometry(m.shapeModel):undefined,[m.shapeModel]);
 const [view,setView]=useState<SketchView>({kind:'sx',at:Math.round(m.y/2)}),[view3d,setView3d]=useState(false),[tool,setTool]=useState<Tool>(()=>m.shapeModel?.rebarNotes?.length&&!m.bars.some(isSketchBar)?'notes':'draw');
 const [dia,setDia]=useState(16),[cover,setCover]=useState(m.cover),[extra,setExtra]=useState(0),[grid,setGrid]=useState(25),[ortho,setOrtho]=useState(true);
 const grades=codeValues(project.spec.codeData,project.spec.designCode).grades,gradeOf=(d:number)=>grades.find(r=>r.bar===d)?.grade||(d<=9?'SR24':'SD40');
 const [layout,setLayout]=useState<LayoutRule>(()=>{const [from,to]=defaultRange(m,{kind:'sx',at:0},m.cover,16);return {rule:'spacing',spacing:200,count:5,from,to};});
 const [pts,setPts]=useState<P2[]>([]),[hover,setHover]=useState<Snap|null>(null),[sel,setSel]=useState(''),[drag,setDrag]=useState<number|null>(null);
 // forced mode: every point lies on the cover outline and the bar follows it round the corners
 const [force,setForce]=useState(true),[hits,setHits]=useState<CoverHit[]>([]),[hoverHit,setHoverHit]=useState<CoverHit|null>(null);
 const [hooks,setHooks]=useState<{start:HookEnd;end:HookEnd}>({start:{kind:'none',leg:0},end:{kind:'none',leg:0}});
 const hookTable:HookTable=codeValues(project.spec.codeData,project.spec.designCode).endHooks.map(h=>({bar:h.bar,a90:h.a90}));
 // keep the layout range on the concrete when the view / size / cover changes
 useEffect(()=>{const [from,to]=defaultRange(m,view,cover,dia);setLayout(l=>({...l,from,to}));},[view.kind,cover,dia,m.x,m.y,m.z]);
 const region=useMemo(()=>viewRegion(m,view),[m,view.kind,view.at]),off=cover+extra+dia/2;
 const coverSegs=useMemo(()=>offsetSegments(region,off),[region,off]),edges=useMemo(()=>edgeSegments(region),[region]),rings=useMemo(()=>coverRings(region,off),[region,off]);
 const a=viewAxes(view),rows=useMemo(()=>takeoff(m,project.spec).rows,[m,project.spec]),colors=useMemo(()=>markColors(rows),[rows]);
 const vd=useMemo(()=>buildView(m,rows,undefined,view.kind==='plan'?{axes:[0,1]}:{axes:[a.u,a.v] as [number,number],normal:a.n,cut:view.at}),[m,rows,view.kind,view.at]);
 const errors=useMemo(()=>validateMember(m,project.spec),[m,project.spec]);
 const selBar=m.bars.find(b=>b.id===sel),selView=selBar?viewOfBar(selBar):undefined,editable=!!selBar&&isSketchBar(selBar)&&selView?.kind===view.kind;
 // view frame
 const W=900,H=520,M=60,ring=region.flatMap(p=>p.flatMap(r=>r as P2[])),all=[...ring,...vd.bars.flatMap(b=>[...b.lines.flatMap(l=>[l.a,l.b]),...b.dots])];
 const lo=[Math.min(0,...all.map(p=>p[0])),Math.min(0,...all.map(p=>p[1]))],hi=[Math.max(1,...all.map(p=>p[0])),Math.max(1,...all.map(p=>p[1]))];
 const s=Math.min((W-2*M)/(hi[0]-lo[0]||1),(H-2*M)/(hi[1]-lo[1]||1)),ox=M+((W-2*M)-(hi[0]-lo[0])*s)/2,oy=H-M-((H-2*M)-(hi[1]-lo[1])*s)/2;
 const X=(u:number)=>ox+(u-lo[0])*s,Y=(v:number)=>oy-(v-lo[1])*s,svg=useRef<SVGSVGElement>(null);
 const world=(e:{clientX:number;clientY:number}):P2=>{const t=svg.current!.getScreenCTM()!.inverse(),p=new DOMPoint(e.clientX,e.clientY).matrixTransform(t);return [(p.x-ox)/s+lo[0],(oy-p.y)/s+lo[1]];};
 const snapAt=(e:{clientX:number;clientY:number},prev?:P2)=>snapPoint(world(e),{cover:coverSegs,edges,prev,tol:12/s,grid,ortho});
 const commitBars=(bars:Bar[],select?:string)=>{onChange({...m,bars});if(select!==undefined)setSel(select);};
 const reset=()=>{setPts([]);setHits([]);setHover(null);setHoverHit(null);};
 const [notes,setNotes]=useState<string[]>([]);
 const finish=()=>{if(pts.length<2||readOnly){reset();return;}const h=addHooks(pts,hooks,dia,rings,hookTable),mark=nextMark(m),bar=sketchBar({mark,view,points:h.points,diameter:dia,grade:gradeOf(dia),layout});setNotes(h.notes);commitBars([...m.bars,bar],bar.id);reset();setTool('select');};
 const coverAt=(e:{clientX:number;clientY:number})=>snapToCover(world(e),rings,12/s,grid);
 const updateSel=(patch:{points?:P2[];diameter?:number;layout?:LayoutRule;grade?:string;mark?:string})=>{if(!selBar||!selView)return;
  const old=selBar.points.map(p=>toView(selView,p as [number,number,number]));const l=patch.layout||{rule:selBar.count===1?'single':'count',spacing:layout.spacing,count:selBar.count,from:selBar.distributionStart,to:selBar.distributionEnd} as LayoutRule;
  const next=sketchBar({id:selBar.id,mark:patch.mark||selBar.mark,view:selView,points:patch.points||old,diameter:patch.diameter||selBar.diameter,grade:patch.grade||selBar.grade,layout:l,note:selBar.note});
  commitBars(m.bars.map(b=>b.id===selBar.id?{...next,placementConfirmed:false}:b));};
 const down=(e:RPointerEvent)=>{if(readOnly)return;(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  if(tool==='draw'){if(e.detail>=2){finish();return;}
   if(force){const h=coverAt(e);if(!h)return;const last=pts.at(-1);if(last&&Math.hypot(last[0]-h.p[0],last[1]-h.p[1])<1)return;
    const via=hits.length?traceCover(rings,hits.at(-1)!,h):[];setPts(p=>[...p,...via,h.p]);setHits(x=>[...x,...via.map(()=>x.at(-1)!),h]);return;}
   const sp=snapAt(e,pts.at(-1));setPts(p=>p.length&&Math.hypot(p.at(-1)![0]-sp.p[0],p.at(-1)![1]-sp.p[1])<1?p:[...p,sp.p]);}};
 const move=(e:RPointerEvent)=>{if(tool==='draw'){if(force){const h=coverAt(e)||null;setHoverHit(h);setHover(h?{p:h.p,kind:h.corner?'corner':'cover'}:null);}else setHover(snapAt(e,pts.at(-1)));}
  if(drag!==null&&editable&&selView){const old=selBar!.points.map(p=>toView(selView,p as [number,number,number])),sp=force?coverAt(e)?.p:snapAt(e,old[drag-1]).p;if(sp)updateSel({points:old.map((p,i)=>i===drag?sp:p)});}};
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();reset();}if(e.key==='Enter')finish();if(e.key==='Backspace'&&pts.length){e.preventDefault();setPts(p=>p.slice(0,-1));setHits(x=>x.slice(0,-1));}if(e.key==='Delete'&&selBar&&!readOnly){commitBars(m.bars.filter(b=>b.id!==selBar.id),'');}};
 const via=force&&hits.length&&hoverHit?traceCover(rings,hits.at(-1)!,hoverHit):[];
 const core=pts.length&&hover?[...pts,...via,hover.p]:pts,live=core.length>=2?addHooks(core,hooks,dia,rings,hookTable).points:core,code=detectShapeCode(live),total=polyLength(live);
 const lay=layoutOf(layout),levels=g?[...new Set(g.levels)]:[];
 const sketchErrors=errors.filter(t=>m.bars.some(b=>isSketchBar(b)&&t.startsWith(`${b.mark}:`)));
 const viewLabel=view.kind==='sx'?`รูปตัด X–X · Y = ${fmt(view.at)}`:view.kind==='sy'?`รูปตัด Y–Y · X = ${fmt(view.at)}`:`แปลน · Z = ${fmt(view.at)}`;
 if(!m.shapeModel)return <section className="panel padded"><p className="notice">สร้างรูปทรงในแท็บ “รูปทรง (หลายชิ้นส่วน)” และกดใช้กับสมาชิกก่อน แล้วจึงวาดเหล็กบนรูปตัด</p></section>;
 return <section className="panel padded rebar-sketch">
  {view3d&&m.shapeModel&&<Suspense fallback={<div className="e3d-shade"><div className="notice">กำลังเปิดมุมมอง 3D…</div></div>}><Custom3DModal member={m} spec={project.spec} readOnly={readOnly} onChange={onChange} onClose={()=>setView3d(false)}/></Suspense>}
  <div className="section-heading"><div><h3>ใส่เหล็ก · วาดบนรูปตัด / แปลน (Sketch Rebar)</h3><p className="muted">คลิกเพื่อวางจุด · เส้นจะ Snap กับแนว cover (เส้นประส้ม) มุม และแนวฉาก · ดับเบิลคลิก/Enter = จบเส้น · Backspace = ลบจุดล่าสุด · Esc = ยกเลิก · Delete = ลบชุดที่เลือก</p></div><div className="actions"><button className="view3d-button" onClick={()=>setView3d(true)} title="มุมมอง 3D · หมุน ซูม คลิกขวาเพื่อแก้ไขชิ้นส่วนและเหล็กเสริม"><Box size={15}/>3D Modal</button></div></div>
  <div className={`sketch-layout${tool==='notes'?' notes-open':''}`}>
   <aside className="sketch-tools">
    <h4>มุมมอง</h4>
    <div className="segmented">{([['sx','รูปตัด X–X'],['sy','รูปตัด Y–Y'],['plan','แปลน']] as const).map(([k,l])=><button key={k} className={view.kind===k?'active':''} onClick={()=>{setPts([]);setView({kind:k,at:k==='sx'?Math.round(m.y/2):k==='sy'?Math.round(m.x/2):Math.round(cover+dia/2)});}}>{l}</button>)}</div>
    <Field label={view.kind==='plan'?'ระดับ Z ของแปลน (mm)':view.kind==='sx'?'ตำแหน่งตัด Y (mm)':'ตำแหน่งตัด X (mm)'} type="number" value={view.at} onChange={v=>{setPts([]);setView({...view,at:Number(v)||0});}}/>
    {view.kind==='plan'&&<div className="sketch-levels">{levels.map(z=><button key={z} type="button" onClick={()=>setView({...view,at:z})}>{fmt(z)}</button>)}</div>}
    <h4>เครื่องมือ</h4>
    <div className="sketch-toolbar">{([['draw',<PenLine size={14}/>,'วาดเหล็ก'],['select',<MousePointer2 size={14}/>,'เลือก / แก้'],['mesh',<Grid3x3 size={14}/>,'ตะแกรง (แปลน)'],['loop',<Repeat size={14}/>,'ลูปรอบผิว'],['notes',<Sparkles size={14}/>,'จาก Note ในแบบ']] as const).map(([k,i,l])=><button key={k} className={tool===k?'active':''} disabled={readOnly&&k!=='select'} onClick={()=>{setTool(k);setPts([]);if(k==='mesh'||k==='loop')setView(v=>v.kind==='plan'?v:{kind:'plan',at:Math.round(cover+dia/2)});}}>{i}{l}</button>)}</div>
    <h4>เหล็ก</h4>
    <div className="form-grid">
     <label className="field"><span>ขนาด</span><select value={dia} onChange={e=>setDia(Number(e.target.value))}>{DIAS.map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label>
     <label className="field"><span>เกรด (ตาราง Spec)</span><input value={gradeOf(dia)} disabled/></label>
     <Field label="Cover (mm)" type="number" value={cover} onChange={v=>setCover(Math.max(0,Number(v)||0))}/>
     <Field label="เลื่อนชั้นเหล็กเพิ่ม (mm)" type="number" value={extra} onChange={v=>setExtra(Math.max(0,Number(v)||0))}/>
     <label className="field"><span>Snap grid</span><select value={grid} onChange={e=>setGrid(Number(e.target.value))}>{[0,5,10,25,50,100].map(v=><option key={v} value={v}>{v?`${v} mm`:'ปิด'}</option>)}</select></label>
     <label className="check"><input type="checkbox" checked={ortho} disabled={force} onChange={e=>setOrtho(e.target.checked)}/>แนวฉาก 90°</label>
    </div>
    <label className="check sketch-force"><input type="checkbox" checked={force} onChange={e=>{setForce(e.target.checked);reset();}}/><b>บังคับวาดตามแนว cover</b> (จุดอยู่บนเส้นประส้มเสมอ · ลากผ่านมุมจะเดินตามขอบให้)</label>
    <h4>ขอที่ปลายเหล็ก</h4>
    <HookFields label="ปลายต้น" value={hooks.start} d={dia} table={hookTable} onChange={v=>setHooks(h=>({...h,start:v}))}/>
    <HookFields label="ปลายท้าย" value={hooks.end} d={dia} table={hookTable} onChange={v=>setHooks(h=>({...h,end:v}))}/>
    <p className="muted">ขอหันเข้าเนื้อคอนกรีต · ถ้ายาวเกินแนว cover ด้านตรงข้ามจะถูกตัดให้พอดี · มาตรฐาน 90° ใช้ A/G จากตาราง Standard Hooks ของ Spec · 180° = ครึ่งวงกลม + 4d ≥ 65</p>
    {tool==='draw'&&<><h4>Layout (กระจาย{view.kind==='plan'?'ตามแกน Z':`ตั้งฉากรูปตัด · แกน ${view.kind==='sx'?'Y':'X'}`})</h4><LayoutFields layout={layout} onChange={setLayout}/><p className="muted">{lay.count} เส้น · {fmt(lay.from)} → {fmt(lay.to)}</p></>}
    {tool==='mesh'&&<MeshTool m={m} z={view.at} dia={dia} cover={cover} grade={gradeOf(dia)} readOnly={readOnly} onCreate={bars=>commitBars([...m.bars,...bars],bars[0]?.id||'')}/>}
    {tool==='notes'&&<NotesTool m={m} readOnly={readOnly} gradeOf={gradeOf} onNotes={rebarNotes=>onChange({...m,shapeModel:{...m.shapeModel!,...(rebarNotes.length?{rebarNotes}:{rebarNotes:undefined})}})} onCreate={bars=>commitBars([...m.bars,...bars],bars[0]?.id||'')}/>}
    {tool==='loop'&&<LoopTool m={m} z={view.at} dia={dia} cover={cover} grade={gradeOf(dia)} readOnly={readOnly} onCreate={bars=>commitBars([...m.bars,...bars],bars[0]?.id||'')}/>}
   </aside>
   <div className="sketch-canvas" tabIndex={0} onKeyDown={key}>
    <div className="sketch-status"><b>{viewLabel}</b>{tool==='draw'&&<span>{pts.length?`${pts.length} จุด · ยาว ${fmt(total)} mm · Shape ${code||'—'}`:'คลิกจุดเริ่มต้น'}{hover?` · Snap: ${({corner:'มุม cover',cover:'แนว cover',edge:'ขอบคอนกรีต',ortho:'แนวฉาก',grid:'grid',free:'อิสระ'})[hover.kind]}`:''}</span>}
     {notes.length>0&&!pts.length&&<span className="code-own">{notes.join(' · ')}</span>}
     {pts.length>0&&<span className="actions"><button type="button" onClick={()=>setPts(p=>p.slice(0,-1))}><Undo2 size={13}/>ลบจุด</button><button type="button" className="primary" disabled={pts.length<2} onClick={finish}>จบเส้น ({pts.length})</button></span>}</div>
    <svg ref={svg} className={`sketch-svg tool-${tool}`} viewBox={`0 0 ${W} ${H}`} onPointerDown={down} onPointerMove={move} onPointerUp={()=>setDrag(null)} onPointerLeave={()=>{setHover(null);setDrag(null);}}>
     {region.map((poly,i)=><path key={i} className="sk-concrete" fillRule="evenodd" d={poly.map(r=>`M${(r as P2[]).map(p=>`${X(p[0])},${Y(p[1])}`).join('L')}Z`).join('')}/>)}
     {rings.map((r,i)=><polygon key={i} className={`sk-cover ${force?'forced':''}`} points={r.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ')}/>)}
     {force&&tool==='draw'&&rings.flatMap((r,i)=>r.map((p,k)=><circle key={`${i}-${k}`} className="sk-corner" cx={X(p[0])} cy={Y(p[1])} r={2.5}/>))}
     {vd.bars.map(b=>{const c=colors.get(b.row.id)||'#167561',on=b.row.id===sel;return <g key={b.row.id} className={`sk-bar ${on?'sel':''}`} onPointerDown={e=>{if(tool==='select'){e.stopPropagation();setSel(b.row.id);}}}>
      {b.lines.map((l,i)=><line key={i} x1={X(l.a[0])} y1={Y(l.a[1])} x2={X(l.b[0])} y2={Y(l.b[1])} stroke={on?'#d4802a':c} strokeWidth={Math.max(2,b.row.diameter*s)+(on?2:0)} strokeLinecap="round"/>)}
      {b.dots.map((d,i)=><circle key={i} cx={X(d[0])} cy={Y(d[1])} r={Math.max(2.5,b.row.diameter*s/2)} fill={on?'#d4802a':c}/>)}</g>;})}
     {editable&&selView&&selBar!.points.map((p,i)=>{const q=toView(selView,p as [number,number,number]);return <rect key={i} className="sk-grip" x={X(q[0])-5} y={Y(q[1])-5} width={10} height={10} onPointerDown={e=>{if(readOnly)return;e.stopPropagation();(e.currentTarget as Element).setPointerCapture?.(e.pointerId);setDrag(i);}}/>;})}
     {live.length>1&&<polyline className="sk-ghost" points={live.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ')} strokeWidth={Math.max(2.5,dia*s)}/>}
     {live.slice(1).map((p,i)=>{const q=live[i],len=Math.hypot(p[0]-q[0],p[1]-q[1]);return len*s>36&&<text key={i} className="sk-len" x={(X(p[0])+X(q[0]))/2} y={(Y(p[1])+Y(q[1]))/2-6} textAnchor="middle">{fmt(len)}</text>;})}
     {pts.map((p,i)=><rect key={i} className="sk-pt" x={X(p[0])-4} y={Y(p[1])-4} width={8} height={8}/>)}
     {tool==='draw'&&hover&&<g className={`sk-snap ${hover.kind}`}><circle cx={X(hover.p[0])} cy={Y(hover.p[1])} r={hover.kind==='corner'?8:6}/>{hover.kind==='corner'&&<path d={`M${X(hover.p[0])-8} ${Y(hover.p[1])}h16M${X(hover.p[0])} ${Y(hover.p[1])-8}v16`}/>}</g>}
     <text className="sk-axis" x={W-10} y={H-10} textAnchor="end">{['X','Y','Z'][a.u]} → · {['X','Y','Z'][a.v]} ↑</text>
    </svg>
   </div>
   <aside className="sketch-props">
    <h4>ชุดเหล็กที่วาด ({m.bars.filter(isSketchBar).length})</h4>
    <div className="sketch-list">{m.bars.filter(isSketchBar).map(b=><button key={b.id} type="button" className={b.id===sel?'active':''} onClick={()=>{setSel(b.id);const v=viewOfBar(b);if(v&&v.kind!==view.kind)setView(v.kind==='plan'?{kind:'plan',at:b.points[0][2]}:{...v,at:view.at});setTool('select');}}><i style={{background:colors.get(b.id)}}/><span><b>{b.mark}</b> {b.diameter<=9?'RB':'DB'}{b.diameter} × {b.count} · {b.shapeCode}<small>{b.note}</small></span></button>)}</div>
    {selBar&&<div className="sketch-sel"><h4>{selBar.mark} · คุณสมบัติ</h4>
     {isSketchBar(selBar)&&selView?<>
      <div className="form-grid"><Field label="Mark" value={selBar.mark} disabled={readOnly} onChange={v=>updateSel({mark:String(v).slice(0,32)||selBar.mark})}/>
       <label className="field"><span>ขนาด</span><select disabled={readOnly} value={selBar.diameter} onChange={e=>{const d=Number(e.target.value);updateSel({diameter:d,grade:gradeOf(d)});}}>{DIAS.map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label></div>
      <LayoutFields layout={{rule:selBar.count===1?'single':'count',spacing:layout.spacing,count:selBar.count,from:selBar.distributionStart,to:selBar.distributionEnd}} onChange={l=>updateSel({layout:l})} disabled={readOnly}/>
      <div className="actions sketch-hook-add">{(['start','end'] as const).map(k=><button key={k} type="button" disabled={readOnly||hooks[k].kind==='none'} title="ใช้ชนิดขอที่เลือกในแผงซ้าย" onClick={()=>{const old=selBar.points.map(p=>toView(selView,p as [number,number,number])),h=addHooks(old,{start:k==='start'?hooks.start:{kind:'none',leg:0},end:k==='end'?hooks.end:{kind:'none',leg:0}},selBar.diameter,rings,hookTable);setNotes(h.notes);updateSel({points:h.points});}}>+ ขอ{k==='start'?'ปลายต้น':'ปลายท้าย'}</button>)}</div>
      <p className="muted">Shape {selBar.shapeCode} · {selBar.points.length} จุด · ลากจุด (□) ในมุมมอง{selView.kind==='plan'?'แปลน':selView.kind==='sx'?'รูปตัด X–X':'รูปตัด Y–Y'}เพื่อแก้</p></>
      :<p className="muted">ชุดนี้สร้างด้วยเครื่องมืออื่น · แก้ในแท็บ “แบบ & BBS”</p>}
     {(()=>{const r=rows.find(x=>x.id===selBar.id);return r?<table className="shape-qty"><tbody><tr><td>ยาวตัด</td><td>{fmt(r.cutLength)} mm</td></tr><tr><td>จำนวน</td><td>{r.count}</td></tr><tr><td>น้ำหนัก / ชิ้น</td><td>{number(r.weight,2)} kg</td></tr></tbody></table>:null;})()}
     <button type="button" className="danger-text" disabled={readOnly} onClick={()=>commitBars(m.bars.filter(b=>b.id!==selBar.id),'')}><Trash2 size={13}/>ลบชุดเหล็กนี้</button></div>}
    <h4>ตรวจ</h4>
    {sketchErrors.length?<ul className="shape-check bad">{sketchErrors.slice(0,8).map(t=><li key={t}>{t}</li>)}</ul>:<p className="ok-text">✔ cover · อยู่ในคอนกรีต · ไม่ผ่านช่องเปิด</p>}
    <p className="muted">หลังวาด: ตรวจในแท็บ “ตรวจเหล็กทับกัน” · ยืนยันตำแหน่งใน “แบบ & BBS” · บันทึกสมาชิก</p>
   </aside>
  </div>
 </section>;
}

const actionLabels:Record<NoteAction,string>={bottom:'ตะแกรงล่าง',top:'ตะแกรงบน',loops:'ลูปรอบผิว',vertical:'แนวตั้งรอบผิว',skip:'ข้าม'};
/** Phase 3: reinforcement notes (AI-read or typed) → suggested bar sets to confirm one by one. */
function NotesTool({m,readOnly,gradeOf,onNotes,onCreate}:{m:Member;readOnly:boolean;gradeOf:(d:number)=>string;onNotes:(n:NonNullable<NonNullable<Member['shapeModel']>['rebarNotes']>)=>void;onCreate:(b:Bar[])=>void}){
 const saved=m.shapeModel?.rebarNotes||[],questions=m.shapeModel?.rebarQuestions||[],[text,setText]=useState(saved.map(n=>n.text).join('\n')||'Y32-150 (B)\nY32-150 (T)\nY16-200 LOOPS\n15d');
 const lines=text.split('\n').map(l=>l.trim()).filter(Boolean).slice(0,60);
 const first=useMemo(()=>saved.length&&!m.bars.some(isSketchBar)?suggestFromNotes(m,lines,saved):[],[]);
 const [list,setList]=useState<Suggestion[]>(first),[picked,setPicked]=useState<Record<string,boolean>>(()=>Object.fromEntries(first.map(x=>[x.id,x.action!=='skip'])));
 const suggest=()=>{const s=suggestFromNotes(m,lines,saved);setList(s);setPicked(Object.fromEntries(s.map(x=>[x.id,x.action!=='skip'])));onNotes(lines.map(t=>{const n=saved.find(x=>x.text===t);return n?{...n,text:t.slice(0,120)}:{text:t.slice(0,120),meaning:'',source:''};}));};
 const put=(id:string,patch:Partial<Suggestion>)=>setList(l=>l.map(s=>s.id===id?{...s,...patch}:s));
 const chosen=list.filter(s=>picked[s.id]&&s.action!=='skip');
 const [creating,setCreating]=useState(false),[result,setResult]=useState<{ok:boolean;text:string}|null>(null);
 /** Builds per suggestion so one failing note is reported without losing the others; yields first so the busy state paints. */
 const create=()=>{setCreating(true);setResult(null);setTimeout(()=>{
  const made:Bar[]=[],fails:string[]=[],empty:string[]=[];let work=m;
  for(const s of chosen){try{const bars=barsFromSuggestions(work,[s],gradeOf);if(!bars.length)empty.push(s.note.text);made.push(...bars);work={...work,bars:[...work.bars,...bars]};}
   catch(e){fails.push(`${s.note.text}: ${e instanceof Error?e.message:String(e)}`);}}
  if(made.length)onCreate(made);
  setResult({ok:made.length>0&&!fails.length,text:[made.length?`สร้างแล้ว ${made.length} ชุด (${made.map(b=>b.mark).join(', ')}) · ดูในรายการเหล็กและมุมมองด้านขวา`:'ไม่ได้สร้างเหล็ก',
   empty.length?`ไม่พบช่วงคอนกรีตที่ระดับ Z ที่กำหนด: ${empty.join(' · ')} (ตรวจ Z / ระดับของรูปทรง)`:'',fails.length?`ผิดพลาด: ${fails.join(' · ')}`:''].filter(Boolean).join('\n')});
  setCreating(false);},30);};
 return <div className="sketch-sub notes-tool"><h4>Note เหล็กในแบบ → ชุดเหล็ก</h4>
  <p className="muted">หนึ่งบรรทัดต่อหนึ่ง Note เช่น Y32-150 (B), DB16@200 LOOPS, ADD Y20-150, 15d {saved.length?`· มี ${saved.length} Note จากผลอ่านแบบ (ตำแหน่ง / ชิ้นส่วนตามที่ AI อ่าน)`:''}</p>
  {questions.length>0&&<div className="notice warning"><b>ข้อมูลเหล็กที่แบบไม่ได้ระบุ — ตรวจ / กำหนดก่อนยืนยัน</b>{questions.map((q,i)=><div key={i}>❓ {q}</div>)}</div>}
  <textarea rows={5} disabled={readOnly} value={text} onChange={e=>setText(e.target.value)}/>
  <button type="button" className="primary" disabled={readOnly||!lines.length} onClick={suggest}>เสนอชุดเหล็กจาก Note</button>
  {list.length>0&&<div className="notes-suggest">{list.map(s=>{const ai=saved.find(n=>n.text===s.note.text)?.meaning;return <div key={s.id} className={`note-row ${s.action==='skip'?'skip':''}`}>
   <label className="check"><input type="checkbox" disabled={readOnly||s.action==='skip'} checked={!!picked[s.id]&&s.action!=='skip'} onChange={e=>setPicked({...picked,[s.id]:e.target.checked})}/><b>{s.note.text}</b></label>
   <small>{s.reason}{ai?` · AI: ${ai}`:''}{s.manual?` · ${s.manual}`:''}</small>
   {s.action!=='skip'||s.note.diameter?<div className="form-grid">
    <label className="field"><span>ใช้เป็น</span><select disabled={readOnly} value={s.action} onChange={e=>put(s.id,{action:e.target.value as NoteAction})}>{(Object.keys(actionLabels) as NoteAction[]).map(k=><option key={k} value={k}>{actionLabels[k]}</option>)}</select></label>
    <label className="field"><span>ขนาด</span><select disabled={readOnly} value={s.diameter} onChange={e=>put(s.id,{diameter:Number(e.target.value)})}>{DIAS.map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label>
    <Field label="@ (mm)" type="number" disabled={readOnly} value={s.spacing} onChange={v=>put(s.id,{spacing:Math.max(50,Number(v)||50)})}/>
    {(s.action==='bottom'||s.action==='top')&&<label className="field"><span>ทิศ</span><select disabled={readOnly} value={s.dirs.join('')} onChange={e=>put(s.id,{dirs:e.target.value.split('') as ('X'|'Y')[]})}><option value="XY">X + Y</option><option value="X">X</option><option value="Y">Y</option></select></label>}
    {s.action!=='skip'&&<Field label={s.action==='loops'?'Z ล่าง':'Z (ศูนย์กลางเหล็ก)'} type="number" disabled={readOnly} value={Math.round(s.z)} onChange={v=>put(s.id,{z:Number(v)||0})}/>}
    {(s.action==='loops'||s.action==='vertical')&&<Field label="Z บน" type="number" disabled={readOnly} value={Math.round(s.zTop)} onChange={v=>put(s.id,{zTop:Number(v)||0})}/>}
    {(s.action==='bottom'||s.action==='top'||s.action==='vertical')&&<Field label={s.action==='vertical'?'ขางอเข้าใน (0 = ตรง)':'ขางอ (+ขึ้น / −ลง)'} type="number" disabled={readOnly} value={s.leg} onChange={v=>put(s.id,{leg:Number(v)||0})}/>}
   </div>:null}</div>;})}
   <button type="button" className="primary" disabled={readOnly||creating||!chosen.length} onClick={create}>{creating?'กำลังสร้างชุดเหล็ก…':`สร้างชุดเหล็กที่เลือก (${chosen.length})`}</button>
   {result&&<p className={`notice ${result.ok?'':'warning'}`} role="status" style={{whiteSpace:'pre-line'}}>{result.text}</p>}
   <p className="muted">ทุกชุดอยู่ในแนว cover ของสมาชิก · ลูป/เหล็กแนวตั้งหยุดก่อนระดับที่แปลนเปลี่ยน · ตรวจผลในมุมมองและรายการด้านขวาก่อนบันทึก</p></div>}
 </div>;
}
function HookFields({label,value,d,table,onChange}:{label:string;value:HookEnd;d:number;table:HookTable;onChange:(v:HookEnd)=>void}){
 const row=table.find(t=>t.bar===d)||table.filter(t=>t.bar>=d).sort((x,y)=>x.bar-y.bar)[0],std=row?row.a90:12*d;
 return <div className="form-grid sketch-hook"><label className="field"><span>{label}</span><select value={value.kind} onChange={e=>onChange({...value,kind:e.target.value as HookEnd['kind'],leg:value.leg||std})}>
  <option value="none">ไม่มีขอ (ปลายตรง)</option><option value="std90">ขอมาตรฐาน 90° (A/G {fmt(std)})</option><option value="std180">ขอมาตรฐาน 180°</option><option value="custom">ฉาก 90° กำหนดความยาวเอง</option></select></label>
  {value.kind==='custom'?<Field label="ความยาวฉาก (mm)" type="number" value={value.leg} onChange={v=>onChange({...value,leg:Math.max(0,Number(v)||0)})}/>:<span/>}</div>;
}
function LayoutFields({layout:l,onChange,disabled=false}:{layout:LayoutRule;onChange:(l:LayoutRule)=>void;disabled?:boolean}){
 return <div className="form-grid">
  <label className="field"><span>กฎการกระจาย</span><select disabled={disabled} value={l.rule} onChange={e=>onChange({...l,rule:e.target.value as LayoutRule['rule']})}><option value="spacing">ระยะห่างสูงสุด</option><option value="count">จำนวนคงที่</option><option value="single">เดี่ยว</option></select></label>
  {l.rule==='spacing'&&<Field label="ระยะ @ (mm)" type="number" disabled={disabled} value={l.spacing} onChange={v=>onChange({...l,spacing:Math.max(10,Number(v)||10)})}/>}
  {l.rule==='count'&&<Field label="จำนวน (เส้น)" type="number" disabled={disabled} value={l.count} onChange={v=>onChange({...l,count:Math.max(1,Math.min(2000,Math.trunc(Number(v)||1)))})}/>}
  <Field label="เริ่ม (mm)" type="number" disabled={disabled} value={Number(l.from.toFixed(1))} onChange={v=>onChange({...l,from:Number(v)||0})}/>
  {l.rule!=='single'&&<Field label="สิ้นสุด (mm)" type="number" disabled={disabled} value={Number(l.to.toFixed(1))} onChange={v=>onChange({...l,to:Number(v)||0})}/>}
 </div>;
}
function MeshTool({m,z,dia,cover,grade,readOnly,onCreate}:{m:Member;z:number;dia:number;cover:number;grade:string;readOnly:boolean;onCreate:(b:Bar[])=>void}){
 const [o,setO]=useState({spacing:200,x:true,y:true,leg:0});
 return <div className="sketch-sub"><h4>ตะแกรงตามแปลน (Area)</h4><p className="muted">วางเหล็กตรงทั้งพื้นที่คอนกรีตที่ระดับ Z = {fmt(z)} (ระยะ cover ทุกขอบ · แบ่ง Mark ตามความยาว)</p>
  <div className="form-grid"><Field label="ระยะ @ (mm)" type="number" value={o.spacing} onChange={v=>setO({...o,spacing:Math.max(50,Number(v)||50)})}/><Field label="ขางอปลาย (+ขึ้น / −ลง, 0 = ตรง)" type="number" value={o.leg} onChange={v=>setO({...o,leg:Number(v)||0})}/>
   <label className="check"><input type="checkbox" checked={o.x} onChange={e=>setO({...o,x:e.target.checked})}/>ทิศ X</label><label className="check"><input type="checkbox" checked={o.y} onChange={e=>setO({...o,y:e.target.checked})}/>ทิศ Y</label></div>
  <button type="button" className="primary" disabled={readOnly||(!o.x&&!o.y)} onClick={()=>onCreate(meshBars(m,{z,diameter:dia,grade,spacing:o.spacing,cover,dirs:[...(o.x?['X' as const]:[]),...(o.y?['Y' as const]:[])],leg:o.leg,note:`ตะแกรง Z ${fmt(z)}`}))}>สร้างตะแกรง</button>
  <p className="muted">ตั้ง Z ให้เป็นศูนย์กลางเหล็ก เช่น ตะแกรงล่าง = cover + d/2 · ชั้นที่ 2 บวกขนาดเหล็กชั้นแรก</p></div>;
}
function LoopTool({m,z,dia,cover,grade,readOnly,onCreate}:{m:Member;z:number;dia:number;cover:number;grade:string;readOnly:boolean;onCreate:(b:Bar[])=>void}){
 const [o,setO]=useState({zTop:Math.round(m.z-cover-dia),spacing:200,lap:Math.round(40*dia)});
 return <div className="sketch-sub"><h4>ลูปรอบผิวข้าง (LOOPS)</h4><p className="muted">ปลอกแนวนอนรอบขอบนอกของแปลนที่ระดับ Z = {fmt(z)} เรียงขึ้นถึง Z บน</p>
  <div className="form-grid"><Field label="Z บนสุด (mm)" type="number" value={o.zTop} onChange={v=>setO({...o,zTop:Number(v)||0})}/><Field label="ระยะ @ (mm)" type="number" value={o.spacing} onChange={v=>setO({...o,spacing:Math.max(50,Number(v)||50)})}/><Field label="ระยะทาบ (mm)" type="number" value={o.lap} onChange={v=>setO({...o,lap:Math.max(0,Number(v)||0)})}/></div>
  <button type="button" className="primary" disabled={readOnly} onClick={()=>onCreate(loopBars(m,{z,zTop:o.zTop,diameter:dia,grade,spacing:o.spacing,cover,lap:o.lap,mark:nextMark(m),note:'ลูปรอบผิว'}))}>สร้างลูป</button></div>;
}
