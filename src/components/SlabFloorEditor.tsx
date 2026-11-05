import {useMemo,useRef,useState,type PointerEvent as RPointerEvent} from 'react';
import {Box,Plus,Redo2,Trash2,Undo2} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {lineRank} from '../domain/floorBeams';
import {FloorBeamsDialog,floorLinks,linkStateLabel} from './FloorBeamsDialog';
import {openMember} from './memberNav';
import type {BeamInput,SlabInput} from '../domain/elementInput';
import {DEFAULT_OPENING_TRIM,DEFAULT_SLAB_REBAR,type FloorBeam,type FloorColumn,type FloorDrop,type FloorMark,type FloorOpening,type FloorPanel,type SlabBar,type SlabFloor,type TopExtra} from '../domain/slabFloorSchema';
import {autoBeams,autoPanels,retagPanels,floorBars,floorBeamRects,floorMarkSummary,freeId,freeTag,gridRef,gridsFromBeamGroup,markIndex,mergePanels,openingPanel,openingRing,panelThickness,parseGridRef,polyArea,slabFloorProblems,snapLines,toggleBeamSegment} from '../domain/slabFloor';
import {floorMarkFromTemplate,topExtraText} from '../domain/slabWallTemplates';
import {readCollectionPages} from '../data/collections';
import {HelpButton} from './HelpCenter';
import {NumInput} from './EditorControls';

// Floor plan of a slab floor (Slab layout 'floor'): grids, reference beams, panels per slab mark, openings and drops on an
// SVG plan with snapping (grids, beam faces, panel edges) + undo / redo; the right column edits the selection.
type Tool='select'|'grid'|'beam'|'column'|'panel'|'opening'|'drop';
type Sel={kind:'panel'|'opening'|'beam'|'drop'|'column';id:string}|null;
type P2=[number,number];
const tools:[Tool,string][]=[['select','เลือก'],['grid','กริด'],['beam','คาน'],['column','เสา'],['panel','แผงพื้น'],['opening','ช่องเปิด'],['drop','Drop / ลดระดับ']];
const colors=[['#ccfbf1','#0f766e'],['#fef3c7','#b45309'],['#e0e7ff','#4338ca'],['#fce7f3','#be185d'],['#dcfce7','#15803d'],['#ffedd5','#c2410c'],['#e0f2fe','#0369a1'],['#f3e8ff','#7e22ce']];
const barText=(b:{diameter:number;spacing:number})=>b.spacing>0?`${b.diameter<=9?'RB':'DB'}${b.diameter}@${b.spacing}`:'–';
const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');
const diameters=[6,9,10,12,16,20,25,28,32];

export function SlabFloorEditor({input,project,readOnly,onChange,onView3d,onBuild,buildDisabled,memberId,members,onReloadMembers}:{input:SlabInput;project:Project;readOnly:boolean;onChange:(f:SlabFloor)=>void;onView3d?:()=>void;onBuild?:()=>void;buildDisabled?:boolean;
 /** S3: this floor member and the project members (beam groups linked to the floor) */ memberId?:string;members?:Member[]|null;onReloadMembers?:()=>Promise<void>}){
 const f=input.floor!,spec=project.spec;
 const [tool,setTool]=useState<Tool>('select'),[sel,setSel]=useState<Sel>(null),[multi,setMulti]=useState<string[]>([]),[msg,setMsg]=useState('');
 const [hist,setHist]=useState<{past:SlabFloor[];future:SlabFloor[]}>({past:[],future:[]});
 const [beamSize,setBeamSize]=useState({mark:'B1',width:300,depth:600}),[colSize,setColSize]=useState<{sx:number;sy:number;template?:string}>({sx:400,sy:400}),[beamsOpen,setBeamsOpen]=useState(false);
 // S3: beam groups linked to this floor (saved floor = the stored member)
 const links=useMemo(()=>floorLinks(members?.find(m=>m.id===memberId),members||null,project),[members,memberId,project]);
 const linkOf=(along:'X'|'Y',line:string)=>links.filter(l=>l.input.placement?.along===along&&l.input.placement?.line===line);
 const colTemplates=(spec.columnTemplates||[]).flatMap(t=>t.rows[0]?[{id:t.id,label:`${t.name} ${t.rows[0].width}×${t.rows[0].depth}`,sx:t.rows[0].width,sy:t.rows[0].depth}]:[]);
 const setColumn=(id:string,patch:Partial<FloorColumn>)=>commit({...f,columns:(f.columns||[]).map(c=>c.id===id?{...c,...patch}:c)});
 const allColumns=()=>{const have=new Set((f.columns||[]).map(c=>`${c.x}|${c.y}`)),used=new Set((f.columns||[]).map(c=>c.id));let n=0;const add:FloorColumn[]=[];
  for(const x of f.gridsX)for(const y of f.gridsY)if(!have.has(`${x.label}|${y.label}`)){let id='';do{id=`col${++n}`;}while(used.has(id));used.add(id);add.push({id,x:x.label,y:y.label,sx:colSize.sx,sy:colSize.sy,...(colSize.template?{template:colSize.template}:{})});}
  commit({...f,columns:[...(f.columns||[]),...add].slice(0,300)});};
 const [groups,setGroups]=useState<{code:string;grids:{label:string;at:number}[]}[]|null>(null),[loading,setLoading]=useState(false);
 const commit=(next:SlabFloor)=>{if(readOnly)return;setHist(h=>({past:[...h.past.slice(-49),f],future:[]}));onChange(next);};
 const undo=()=>{const prev=hist.past.at(-1);if(!prev)return;setHist(h=>({past:h.past.slice(0,-1),future:[f,...h.future]}));onChange(prev);};
 const redo=()=>{const nxt=hist.future[0];if(!nxt)return;setHist(h=>({past:[...h.past,f],future:h.future.slice(1)}));onChange(nxt);};
 const problems=useMemo(()=>slabFloorProblems(input),[input]);
 // live bar statistics (openings) from the same generator the apply uses
 const stats=useMemo(()=>{try{return problems.length?undefined:floorBars(input,input.detailing);}catch{return undefined;}},[input,problems]);
 const summary=floorMarkSummary(f);

 // ---------- plan frame (Y up) ----------
 const beams=floorBeamRects(f),xs=[...f.gridsX.map(g=>g.at),...beams.flatMap(b=>[b.x0,b.x1]),...f.panels.flatMap(p=>p.outline.map(q=>q[0]))],ys=[...f.gridsY.map(g=>g.at),...beams.flatMap(b=>[b.y0,b.y1]),...f.panels.flatMap(p=>p.outline.map(q=>q[1]))];
 const x0=Math.min(0,...xs),x1=Math.max(1000,...xs),y0=Math.min(0,...ys),y1=Math.max(1000,...ys),W=900,H=620,pad=70,s=Math.min((W-2*pad)/(x1-x0||1),(H-2*pad)/(y1-y0||1));
 const X=(x:number)=>pad+(x-x0)*s,Y=(y:number)=>H-pad-(y-y0)*s,path=(r:P2[])=>r.map((q,i)=>`${i?'L':'M'}${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`).join(' ')+'Z';
 const svg=useRef<SVGSVGElement>(null);
 const toModel=(e:{clientX:number;clientY:number}):P2=>{const r=svg.current!.getBoundingClientRect(),px=(e.clientX-r.left)*W/r.width,py=(e.clientY-r.top)*H/r.height;return [x0+(px-pad)/s,y0+(H-pad-py)/s];};
 const lines=useMemo(()=>[snapLines(f,0),snapLines(f,1)],[f]);
 const snap=(v:number,axis:0|1)=>{const tol=8/s;let best=v,d=tol;for(const l of lines[axis])if(Math.abs(l-v)<d){d=Math.abs(l-v);best=l;}return best===v?Math.round(v/25)*25:best;};
 // drag: move / resize an opening or drop (rect bbox)
 const drag=useRef<{kind:'opening'|'drop';id:string;mode:'move'|'size';start:P2;orig:SlabFloor}|null>(null);
 const onDown=(e:RPointerEvent,kind:'opening'|'drop',id:string,mode:'move'|'size')=>{e.stopPropagation();setSel({kind,id});if(readOnly||tool!=='select'&&tool!==kind)return;(e.target as Element).setPointerCapture?.(e.pointerId);drag.current={kind,id,mode,start:toModel(e),orig:f};};
 const onMove=(e:RPointerEvent)=>{const d=drag.current;if(!d)return;const p=toModel(e),dx=p[0]-d.start[0],dy=p[1]-d.start[1];
  if(d.kind==='opening'){const o=d.orig.openings.find(x=>x.id===d.id)!;let next:FloorOpening;
   if(d.mode==='move'){const nx=snap(o.x+dx,0),ny=snap(o.y+dy,1),rx=snap(o.x+dx+o.w,0)-o.w,ry=snap(o.y+dy+(o.shape==='circle'?o.w:o.h),1)-(o.shape==='circle'?o.w:o.h);next={...o,x:Math.abs(nx-(o.x+dx))<=Math.abs(rx-(o.x+dx))?nx:rx,y:Math.abs(ny-(o.y+dy))<=Math.abs(ry-(o.y+dy))?ny:ry};}
   else{const w=Math.max(100,snap(o.x+o.w+dx,0)-o.x),h=Math.max(100,snap(o.y+dy,1));next=o.shape==='circle'?{...o,w}:{...o,w,h:Math.max(100,o.y+o.h-h),y:Math.min(h,o.y+o.h-100)};}
   onChange({...d.orig,openings:d.orig.openings.map(x=>x.id===d.id?next:x)});}
  else{const dr=d.orig.drops.find(x=>x.id===d.id)!;const b=bbox(dr.outline as P2[]);
   const ring:P2[]=d.mode==='move'?(()=>{const ox=snap(b[0]+dx,0)-b[0],oy=snap(b[1]+dy,1)-b[1];return dr.outline.map(([x,y])=>[x+ox,y+oy] as P2);})():(()=>{const nx=Math.max(b[0]+100,snap(b[2]+dx,0)),ny=Math.min(b[3]-100,snap(b[1]+dy,1));return [[b[0],ny],[nx,ny],[nx,b[3]],[b[0],b[3]]] as P2[];})();
   onChange({...d.orig,drops:d.orig.drops.map(x=>x.id===d.id?{...x,outline:ring}:x)});}};
 const onUp=()=>{const d=drag.current;if(!d)return;drag.current=null;setHist(h=>({past:[...h.past.slice(-49),d.orig],future:[]}));};
 const panelUnder=(p:P2)=>f.panels.find(x=>inside(p,x.outline as P2[]));
 const onPlanClick=(e:React.MouseEvent)=>{if(readOnly)return;const p=toModel(e);
  if(tool==='opening'){const host=panelUnder(p);if(!host){setMsg('คลิกในแผงพื้นเพื่อวางช่องเปิด');return;}const id=freeId(f,'op');const o:FloorOpening={id,label:`OP-${f.openings.length+1}`,panel:host.id,shape:'rect',x:snap(p[0]-300,0),y:snap(p[1]-300,1),w:600,h:600,trim:{...DEFAULT_OPENING_TRIM}};commit({...f,openings:[...f.openings,o]});setSel({kind:'opening',id});return;}
  if(tool==='drop'){const host=panelUnder(p);if(!host){setMsg('คลิกในแผงพื้นเพื่อวาง Drop / พื้นลดระดับ');return;}const id=freeId(f,'dp'),a=snap(p[0]-600,0),b=snap(p[1]-600,1);const d:FloorDrop={id,label:`D-${f.drops.length+1}`,kind:'drop',outline:[[a,b],[a+1200,b],[a+1200,b+1200],[a,b+1200]],depth:150,rebar:'separate'};commit({...f,drops:[...f.drops,d]});setSel({kind:'drop',id});return;}
  if(tool==='column'){// nearest grid crossing: add a column / remove the one there
   const tol=14/s,gxs=f.gridsX.find(g=>Math.abs(g.at-p[0])<tol),gys=f.gridsY.find(g=>Math.abs(g.at-p[1])<tol);
   if(!gxs||!gys){setMsg('คลิกที่จุดตัดกริดเพื่อวาง / ลบเสา');return;}
   const hit=(f.columns||[]).find(c=>c.x===gxs.label&&c.y===gys.label);
   if(hit){commit({...f,columns:(f.columns||[]).filter(c=>c!==hit)});return;}
   const used=new Set((f.columns||[]).map(c=>c.id));let k=1;while(used.has(`col${k}`))k++;
   commit({...f,columns:[...(f.columns||[]),{id:`col${k}`,x:gxs.label,y:gys.label,sx:colSize.sx,sy:colSize.sy,...(colSize.template?{template:colSize.template}:{})}]});setSel({kind:'column',id:`col${k}`});return;}
  if(tool==='beam'){// nearest grid segment
   const gx=[...f.gridsX].sort((a,b)=>a.at-b.at),gy=[...f.gridsY].sort((a,b)=>a.at-b.at),tol=12/s;
   const ly=gy.find(g=>Math.abs(g.at-p[1])<tol),lx=gx.find(g=>Math.abs(g.at-p[0])<tol);
   if(ly){const k=gx.findIndex((g,i)=>i+1<gx.length&&p[0]>=g.at&&p[0]<=gx[i+1].at);if(k>=0){commit(toggleBeamSegment(f,'X',ly.label,gx[k].label,gx[k+1].label,beamSize));return;}}
   if(lx){const k=gy.findIndex((g,i)=>i+1<gy.length&&p[1]>=g.at&&p[1]<=gy[i+1].at);if(k>=0){commit(toggleBeamSegment(f,'Y',lx.label,gy[k].label,gy[k+1].label,beamSize));return;}}
   setMsg('คลิกบนเส้นกริดระหว่างกริดสองเส้น เพื่อเพิ่ม / ลบคานช่วงนั้น');return;}
  setSel(null);if(tool==='panel')setMulti([]);};
 const pick=(e:React.MouseEvent,kind:'panel'|'beam',id:string)=>{if(tool==='opening'||tool==='drop'||tool==='beam')return;e.stopPropagation();
  if(kind==='panel'&&(tool==='panel'||e.shiftKey)){setMulti(m=>m.includes(id)?m.filter(x=>x!==id):[...m,id]);}setSel({kind,id});};

 // ---------- edits ----------
 const setGrid=(axis:'gridsX'|'gridsY',list:{label:string;at:number}[])=>commit({...f,[axis]:list});
 const regenerate=(what:'beams'|'panels')=>{if(what==='beams'){if(f.beams.length&&!confirm('สร้างคานอ้างอิงใหม่ทุกแนวกริด (แทนคานเดิม)?'))return;const nf={...f,beams:autoBeams(f,beamSize)};commit(nf);return;}
  if(f.panels.length&&!confirm('สร้างแผงพื้นใหม่จากช่องกริด (แทนแผงเดิม · ช่องเปิดที่อ้างแผงเดิมจะหาแผงจากตำแหน่ง)?'))return;
  const mark=f.marks[0]?.name||'S1';commit({...f,panels:autoPanels(f,mark),openings:f.openings.map(({panel:_p,...o})=>o)});};
 // a new slab mark renames automatic tags to <mark>-nn (`retagPanels`); a typed tag is kept (`tagCustom`)
 const setPanel=(id:string,patch:Partial<FloorPanel>)=>commit(retagPanels({...f,panels:f.panels.map(p=>p.id===id?{...p,...patch}:p)}));
 const setOpening=(id:string,patch:Partial<FloorOpening>)=>commit({...f,openings:f.openings.map(o=>o.id===id?{...o,...patch}:o)});
 const setBeam=(id:string,patch:Partial<FloorBeam>)=>commit({...f,beams:f.beams.map(b=>b.id===id?{...b,...patch}:b)});
 const setDrop=(id:string,patch:Partial<FloorDrop>)=>commit({...f,drops:f.drops.map(d=>d.id===id?{...d,...patch}:d)});
 const setMark=(name:string,patch:Partial<FloorMark>)=>{const renamed=patch.name&&patch.name!==name?patch.name:undefined;commit(retagPanels({...f,marks:f.marks.map(m=>m.name===name?{...m,...patch}:m),panels:renamed?f.panels.map(p=>p.mark===name?{...p,mark:renamed}:p):f.panels}));};
 const remove=()=>{if(!sel)return;const k=sel.kind;if(k==='column'){commit({...f,columns:(f.columns||[]).filter(c=>c.id!==sel.id)});setSel(null);return;}commit({...f,panels:k==='panel'?f.panels.filter(p=>p.id!==sel.id):f.panels,openings:k==='opening'?f.openings.filter(o=>o.id!==sel.id):f.openings,beams:k==='beam'?f.beams.filter(b=>b.id!==sel.id):f.beams,drops:k==='drop'?f.drops.filter(d=>d.id!==sel.id):f.drops});setSel(null);};
 const merge=()=>{const r=mergePanels(f,multi);if('error' in r){setMsg(r.error);return;}commit(r.floor);setMulti([]);setMsg('รวมแผงแล้ว');};
 const loadGroups=async()=>{setLoading(true);setMsg('');try{const all=await readCollectionPages(project.id,'members');
  const list=all.filter((m:any)=>m.category==='Beam'&&m.elementInput?.layout==='group'&&m.elementInput.spans?.length).map((m:any)=>({code:String(m.code),grids:gridsFromBeamGroup(m.elementInput as BeamInput)})).filter(g=>g.grids.length>=2);
  setGroups(list);if(!list.length)setMsg('ไม่พบกลุ่มคานที่มีชื่อกริดในโครงการ');}catch(e){setMsg(e instanceof Error?e.message:String(e));}finally{setLoading(false);}};
 const addMarkFromSpec=(id:string)=>{const t=spec.slabTemplates?.find(x=>x.id===id);if(!t)return;const mk=floorMarkFromTemplate(t);if(f.marks.some(m=>m.name.toUpperCase()===mk.name.toUpperCase())){commit({...f,marks:f.marks.map(m=>m.name.toUpperCase()===mk.name.toUpperCase()?{...mk,name:m.name}:m)});setMsg(`อัปเดตเบอร์พื้น ${mk.name} ตามตารางพื้น`);return;}commit({...f,marks:[...f.marks,mk]});};
 const addMark=()=>{const used=new Set(f.marks.map(m=>m.name.toUpperCase()));let k=f.marks.length+1;while(used.has(`S${k}`))k++;commit({...f,marks:[...f.marks,{name:`S${k}`,thickness:150,support:'elevated',rebar:structuredClone(DEFAULT_SLAB_REBAR)}]});};

 const selPanel=sel?.kind==='panel'?f.panels.find(p=>p.id===sel.id):undefined,selOpening=sel?.kind==='opening'?f.openings.find(o=>o.id===sel.id):undefined,selBeam=sel?.kind==='beam'?f.beams.find(b=>b.id===sel.id):undefined,selDrop=sel?.kind==='drop'?f.drops.find(d=>d.id===sel.id):undefined;
 const gx=[...f.gridsX].sort((a,b)=>a.at-b.at),gy=[...f.gridsY].sort((a,b)=>a.at-b.at);
 const num=(label:string,value:number,on:(v:number)=>void,opts:{min?:number;step?:string}={})=><label className="field"><span>{label}</span><NumInput type="number" step={opts.step||'any'} disabled={readOnly} value={value} onChange={e=>{const v=Number(e.target.value);on(Number.isFinite(v)?opts.min!==undefined?Math.max(opts.min,v):v:0);}}/></label>;
 const refField=(label:string,axis:'X'|'Y',value:number,on:(v:number)=>void)=><RefInput key={`${label}${value}`} label={label} list={axis==='X'?f.gridsX:f.gridsY} value={value} readOnly={readOnly} onChange={on}/>;
 const dia=(label:string,value:number,on:(v:number)=>void)=><label className="field"><span>{label}</span><select disabled={readOnly} value={value} onChange={e=>on(Number(e.target.value))}>{[...new Set([...diameters,value])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label>;
 const barRow=(label:string,b:SlabBar,on:(b:SlabBar)=>void)=><div className="sf-bar-row">{dia(`${label} Ø`,b.diameter,d=>on({...b,diameter:d}))}{num(`@ (0 = ไม่มี)`,b.spacing,v=>on({...b,spacing:v}),{min:0})}</div>;
 const extraFields=(e:TopExtra|undefined,on:(e:TopExtra|undefined)=>void)=>{const v=e||{diameter:12,spacing:0,length:{mode:'fixed' as const,value:1000,from:'face' as const}};
  return <div className="sf-extra">{barRow('บนเสริม',v,b=>on({...v,...b}))}
   <label className="field"><span>ความยาวบนเสริม</span><select disabled={readOnly} value={v.length.mode==='ratio'?`r${v.length.n}`:`f-${v.length.from}`} onChange={ev=>{const k=ev.target.value;on({...v,length:k==='r3'?{mode:'ratio',n:3}:k==='r4'?{mode:'ratio',n:4}:{mode:'fixed',value:v.length.mode==='fixed'?v.length.value:1000,from:k==='f-centre'?'centre':'face'}});}}>
    <option value="f-face">ระยะคงที่ จากหน้าคาน</option><option value="f-centre">ระยะคงที่ จากศูนย์กลางคาน</option><option value="r4">L/4 ของช่วงสั้น</option><option value="r3">L/3 ของช่วงสั้น</option></select></label>
   {v.length.mode==='fixed'&&num('ระยะ (mm)',v.length.value,x=>on({...v,length:{...(v.length as {mode:'fixed';value:number;from:'face'|'centre'}),value:x}}),{min:0})}</div>;};

 return <div className="slab-floor">
  <div className="sf-toolbar" role="toolbar" aria-label="เครื่องมือแปลนพื้น">
   <div className="segmented">{tools.map(([t,l])=><button key={t} type="button" aria-pressed={tool===t} className={tool===t?'active':''} onClick={()=>{setTool(t);setMsg('');}}>{l}</button>)}</div>
   <button type="button" className="icon-button" title="ย้อนกลับ" disabled={readOnly||!hist.past.length} onClick={undo}><Undo2 size={15}/></button>
   <button type="button" className="icon-button" title="ทำซ้ำ" disabled={readOnly||!hist.future.length} onClick={redo}><Redo2 size={15}/></button>
   {onView3d&&<button type="button" onClick={onView3d}><Box size={14}/>ดู 3D</button>}
   <HelpButton topic="slab-floor"/>
   {onBuild&&<button type="button" className="primary" disabled={readOnly||buildDisabled||problems.length>0} title="ใช้แปลนพื้นกับสมาชิก: สร้างเหล็กและปริมาณ (เหมือนปุ่ม “ใช้ข้อมูลและสร้าง Bar cut list”) แล้วกดบันทึกสมาชิก" onClick={onBuild}>สร้างเหล็ก + ใช้กับสมาชิก</button>}
   <span className="muted sf-hint">{tool==='beam'?'คลิกบนเส้นกริดเพื่อเพิ่ม / ลบคานช่วงนั้น':tool==='column'?'คลิกที่จุดตัดกริดเพื่อวาง / ลบเสา (ขนาดตั้งที่แผงซ้าย)':tool==='opening'?'คลิกในแผงเพื่อวางช่องเปิด · ลากเพื่อย้าย · มุมขวาล่างปรับขนาด':tool==='drop'?'คลิกในแผงเพื่อวาง Drop / พื้นลดระดับ':tool==='panel'?'คลิกเลือกหลายแผงเพื่อรวม (ตัว L) / ลบ':tool==='grid'?'แก้กริดในตารางด้านซ้าย':'คลิกเลือกเพื่อแก้คุณสมบัติด้านขวา · Shift+คลิก เลือกหลายแผง'}</span>
  </div>
  {msg&&<p className="notice" role="status">{msg}</p>}
  {beamsOpen&&memberId&&<FloorBeamsDialog project={project} floorId={memberId} editedInput={input} readOnly={readOnly} members={members||null} onReload={async()=>{await onReloadMembers?.();}} onClose={()=>setBeamsOpen(false)}/>}
  {problems.length>0&&<div className="notice warning"><b>ต้องแก้ก่อนสร้างเหล็ก ({problems.length})</b><ul>{problems.slice(0,8).map(p=><li key={p}>{p}</li>)}</ul></div>}
  <div className="sf-body">
   <aside className="sf-left">
    <GridTable title="กริด X" list={f.gridsX} readOnly={readOnly} onChange={l=>setGrid('gridsX',l)} next={nextLabel(f.gridsX,'A')}/>
    <GridTable title="กริด Y" list={f.gridsY} readOnly={readOnly} onChange={l=>setGrid('gridsY',l)} next={nextLabel(f.gridsY,'1')}/>
    <div className="sf-actions">
     <button type="button" disabled={readOnly||loading} onClick={()=>void loadGroups()} title="อ่านชื่อกริดและความยาวช่วงของกลุ่มคานในโครงการ (กลุ่มคานยังไม่มีตำแหน่ง / ทิศบนแปลน จึงใช้ได้ทีละแนว)">{loading?'กำลังอ่าน…':'ดึงจากกลุ่มคาน'}</button>
     {groups&&groups.length>0&&<select disabled={readOnly} defaultValue="" onChange={e=>{const [k,axis]=e.target.value.split('|');const g=groups[Number(k)];if(g){setGrid(axis==='Y'?'gridsY':'gridsX',g.grids);setMsg(`ใช้กริดของกลุ่มคาน ${g.code} เป็นกริด ${axis}`);}e.target.value='';}}>
      <option value="">— เลือกกลุ่มคาน → แนว —</option>{groups.flatMap((g,k)=>(['X','Y'] as const).map(a=><option key={`${k}${a}`} value={`${k}|${a}`}>{g.code} ({g.grids.map(x=>x.label).join('–')}) → กริด {a}</option>))}</select>}
    </div>
    <h5>คานอ้างอิง <small className="muted">ไม่คิดปริมาณในพื้น (คิดในสมาชิกคาน)</small> <HelpButton topic="slab-floor-beams"/></h5>
    <div className="sf-beam-size">{<label className="field"><span>Mark</span><input disabled={readOnly} value={beamSize.mark} maxLength={20} onChange={e=>setBeamSize({...beamSize,mark:e.target.value})}/></label>}{num('กว้าง',beamSize.width,v=>setBeamSize({...beamSize,width:v}),{min:0})}{num('ลึก',beamSize.depth,v=>setBeamSize({...beamSize,depth:v}),{min:0})}</div>
    <div className="sf-actions"><button type="button" disabled={readOnly} onClick={()=>regenerate('beams')}>คานทุกแนวกริด</button><button type="button" disabled={readOnly} onClick={()=>regenerate('panels')}>สร้างแผงจากช่องกริด</button></div>
    <ul className="sf-list">{f.beams.map(b=>{const l=linkOf(b.along,b.line);return <li key={b.id} className={sel?.id===b.id?'on':''} onClick={()=>setSel({kind:'beam',id:b.id})}>{b.mark} {b.width}×{b.depth} · แนว {b.line} ({b.from}–{b.to}){lineRank(f,b.along,b.line)==='secondary'?' · รอง':''}
     {l.map(x=><button key={x.member.id} type="button" className={`link-chip ls-${x.state}`} title={`สมาชิกคาน ${x.member.code} · ${linkStateLabel[x.state]} · คลิกเพื่อเปิด`} onClick={e=>{e.stopPropagation();openMember(x.member.id);}}>{x.member.code} · {linkStateLabel[x.state]}</button>)}</li>;})}</ul>
    <h5>เสา <small className="muted">อ้างอิง · เป็นที่รองรับคาน</small></h5>
    <div className="sf-beam-size">{num('X',colSize.sx,v=>setColSize({...colSize,sx:v,template:undefined}),{min:0})}{num('Y',colSize.sy,v=>setColSize({...colSize,sy:v,template:undefined}),{min:0})}
     {colTemplates.length>0&&<label className="field"><span>Column Template</span><select disabled={readOnly} value={colSize.template||''} onChange={e=>{const t=colTemplates.find(x=>x.id===e.target.value);setColSize(t?{sx:t.sx,sy:t.sy,template:t.id}:{...colSize,template:undefined});}}><option value="">— ขนาดเอง —</option>{colTemplates.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}</div>
    <div className="sf-actions"><button type="button" disabled={readOnly} onClick={allColumns}>เสาทุกจุดตัดกริด</button><span className="muted">{(f.columns||[]).length} ต้น</span></div>
    <div className="sf-actions"><button type="button" className="primary" disabled={!memberId} title={memberId?'สร้างสมาชิกกลุ่มคานจริงทุกแนวจากแปลนพื้นที่บันทึกแล้ว (พรีวิวก่อน)':'บันทึกสมาชิกพื้นก่อน'} onClick={()=>setBeamsOpen(true)}>สร้าง / อัปเดตคานจากแปลนพื้น</button>{links.length>0&&<span className="muted">{links.length} สมาชิกคาน</span>}</div>
    <h5>เบอร์พื้นในชั้นนี้</h5>
    <ul className="sf-list">{summary.map(m=>{const [bg,fg]=colors[markIndex(f,m.mark)%colors.length];return <li key={m.mark}><span className="sf-swatch" style={{background:bg,borderColor:fg}}/><b>{m.mark}</b> หนา {f.marks.find(x=>x.name===m.mark)?.thickness} · {m.panels} แผง · {m.area.toFixed(2)} m² · {m.volume.toFixed(2)} m³</li>;})}</ul>
   </aside>
   <div className="sf-plan">
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="แปลนพื้น: กริด คานอ้างอิง แผงพื้นตามเบอร์ ช่องเปิด และ Drop" onClick={onPlanClick} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} className={`tool-${tool}`}>
     <rect x={0} y={0} width={W} height={H} className="sf-bg"/>
     {gx.map(g=><g key={`gx${g.label}`}><line x1={X(g.at)} x2={X(g.at)} y1={H-pad+30} y2={pad-30} className="sf-grid"/><circle cx={X(g.at)} cy={H-pad+44} r={13} className="sf-bubble"/><text x={X(g.at)} y={H-pad+48} className="sf-bubble-t">{g.label}</text></g>)}
     {gy.map(g=><g key={`gy${g.label}`}><line y1={Y(g.at)} y2={Y(g.at)} x1={pad-30} x2={W-pad+30} className="sf-grid"/><circle cx={pad-44} cy={Y(g.at)} r={13} className="sf-bubble"/><text x={pad-44} y={Y(g.at)+4} className="sf-bubble-t">{g.label}</text></g>)}
     {gx.slice(1).map((g,k)=><text key={`dx${k}`} x={(X(g.at)+X(gx[k].at))/2} y={H-pad+66} className="sf-dim">{fmt(g.at-gx[k].at)}</text>)}
     {gy.slice(1).map((g,k)=><text key={`dy${k}`} x={pad-66} y={(Y(g.at)+Y(gy[k].at))/2} className="sf-dim" transform={`rotate(-90 ${pad-66} ${(Y(g.at)+Y(gy[k].at))/2})`}>{fmt(g.at-gy[k].at)}</text>)}
     {f.panels.map(p=>{const [bg,fg]=colors[markIndex(f,p.mark)%colors.length],c=centre(p.outline as P2[]),on=sel?.id===p.id||multi.includes(p.id);
      return <g key={p.id} onClick={e=>pick(e,'panel',p.id)} className="sf-panel"><path d={path(p.outline as P2[])} fill={bg} stroke={fg} strokeWidth={on?3:1.2}/>
       <text x={X(c[0])} y={Y(c[1])} fill={fg} className="sf-mark">{p.mark}</text><text x={X(c[0])} y={Y(c[1])+15} fill={fg} className="sf-tag">{p.tag}{p.top?` · ${p.top>0?'+':''}${p.top}`:''}</text></g>;})}
     {(f.columns||[]).map(c=>{const cx=f.gridsX.find(g=>g.label===c.x)?.at,cy=f.gridsY.find(g=>g.label===c.y)?.at;if(cx===undefined||cy===undefined)return null;
      return <rect key={c.id} x={X(cx-c.sx/2)} y={Y(cy+c.sy/2)} width={c.sx*s} height={c.sy*s} className={`sf-col${sel?.id===c.id?' on':''}`} onClick={e=>{if(tool==='column')return;e.stopPropagation();setSel({kind:'column',id:c.id});}}><title>{`เสา ${c.x}/${c.y} ${c.sx}×${c.sy}`}</title></rect>;})}
     {beams.map(b=><rect key={b.beam.id} x={X(b.x0)} y={Y(b.y1)} width={(b.x1-b.x0)*s} height={(b.y1-b.y0)*s} className={`sf-beam${sel?.id===b.beam.id?' on':''}`} onClick={e=>pick(e,'beam',b.beam.id)}/>)}
     {f.drops.map(d=>{const r=d.outline as P2[],bb=bbox(r),on=sel?.id===d.id;return <g key={d.id}><path d={path(r)} className={`sf-drop ${d.kind}${on?' on':''}`} onPointerDown={e=>onDown(e,'drop',d.id,'move')} onClick={e=>e.stopPropagation()}/>
      <text x={X((bb[0]+bb[2])/2)} y={Y((bb[1]+bb[3])/2)+4} className="sf-drop-t">{d.kind==='drop'?`DROP +${d.depth}`:`ลดระดับ −${d.depth}`}</text>
      {on&&!readOnly&&<rect x={X(bb[2])-5} y={Y(bb[1])-5} width={10} height={10} className="sf-grip" onPointerDown={e=>onDown(e,'drop',d.id,'size')}/>}</g>;})}
     {f.openings.map(o=>{const r=openingRing(o),bx=o.x,by=o.y,bw=o.w,bh=o.shape==='circle'?o.w:o.h,on=sel?.id===o.id,host=openingPanel(f,o);
      return <g key={o.id}><path d={path(r)} className={`sf-open${on?' on':''}`} onPointerDown={e=>onDown(e,'opening',o.id,'move')} onClick={e=>e.stopPropagation()}/>
       <path d={`M${X(bx)} ${Y(by)}L${X(bx+bw)} ${Y(by+bh)}M${X(bx+bw)} ${Y(by)}L${X(bx)} ${Y(by+bh)}`} className="sf-open-x"/>
       {on&&<>{host&&(()=>{const gl=[...gx].reverse().find(g=>g.at<=bx)||gx[0];return gl?<g className="sf-odim"><line x1={X(gl.at)} x2={X(bx)} y1={Y(by+bh)-14} y2={Y(by+bh)-14}/><text x={(X(gl.at)+X(bx))/2} y={Y(by+bh)-18}>{gridRef(f.gridsX,bx)}</text></g>:null;})()}
        <text x={X(bx+bw/2)} y={Y(by)+16} className="sf-odim-t">{o.shape==='circle'?`Ø${bw}`:`${bw}×${bh}`}</text>
        {!readOnly&&<rect x={X(bx+bw)-5} y={Y(by)-5} width={10} height={10} className="sf-grip" onPointerDown={e=>onDown(e,'opening',o.id,'size')}/>}</>}</g>;})}
    </svg>
    {tool==='panel'&&<div className="sf-actions"><span className="muted">เลือก {multi.length} แผง</span><button type="button" disabled={readOnly||multi.length<2} onClick={merge}>รวมแผง (ตัว L / หลายเหลี่ยม)</button><button type="button" disabled={readOnly||!multi.length} onClick={()=>{commit({...f,panels:f.panels.filter(p=>!multi.includes(p.id))});setMulti([]);}}><Trash2 size={13}/>ลบแผงที่เลือก</button>
     <label className="field inline"><span>ตั้งเบอร์พื้น</span><select disabled={readOnly||!multi.length} value="" onChange={e=>{if(e.target.value)commit(retagPanels({...f,panels:f.panels.map(p=>multi.includes(p.id)?{...p,mark:e.target.value}:p)}));}}><option value="">—</option>{f.marks.map(m=><option key={m.name}>{m.name}</option>)}</select></label></div>}
   </div>
   <aside className="sf-right">
    {selPanel&&<div className="sf-props"><span className="sf-kicker">แผงพื้นที่เลือก</span><b>{selPanel.tag} · {selPanel.mark}</b>
     <label className="field"><span>เบอร์พื้น</span><select disabled={readOnly} value={selPanel.mark} onChange={e=>setPanel(selPanel.id,{mark:e.target.value})}>{[...new Set([selPanel.mark,...f.marks.map(m=>m.name)])].map(n=><option key={n}>{n}</option>)}</select></label>
     <label className="field"><span>Tag (ห้ามซ้ำ)</span><input disabled={readOnly} value={selPanel.tag} maxLength={16} onChange={e=>setPanel(selPanel.id,{tag:e.target.value.replace(/[^A-Za-z0-9-]/g,''),tagCustom:true})}/></label>
     {num(`หนา (0 = ตามเบอร์ ${panelThickness({...f},{...selPanel,thickness:0})})`,selPanel.thickness,v=>setPanel(selPanel.id,{thickness:v}),{min:0})}
     {num('ระดับหลังพื้นเทียบระดับชั้น (mm, − = ลด)',selPanel.top,v=>setPanel(selPanel.id,{top:v}))}
     <p className="muted">พื้นที่ {(polyArea(selPanel.outline as P2[])/1e6).toFixed(2)} m² · {selPanel.outline.length} จุดยอด</p>
     <details><summary>แก้จุดยอด (กริด + ระยะ)</summary><OutlineEditor f={f} ring={selPanel.outline as P2[]} readOnly={readOnly} onChange={r=>setPanel(selPanel.id,{outline:r})}/></details>
     <details><summary>เหล็กเฉพาะแผงนี้ (override)</summary>
      <label className="check"><input type="checkbox" disabled={readOnly} checked={!!selPanel.rebar?.topExtra} onChange={e=>setPanel(selPanel.id,{rebar:e.target.checked?{...selPanel.rebar,topExtra:structuredClone(f.marks.find(m=>m.name===selPanel.mark)?.rebar.topExtra||DEFAULT_SLAB_REBAR.topExtra!)}:(({topExtra:_t,...r})=>r)(selPanel.rebar||{})})}/>บนเสริมของแผงนี้</label>
      {selPanel.rebar?.topExtra&&extraFields(selPanel.rebar.topExtra,e=>setPanel(selPanel.id,{rebar:{...selPanel.rebar,...(e?{topExtra:e}:{})}}))}
      <label className="field"><span>ขอบนอก</span><select disabled={readOnly} value={selPanel.rebar?.edge||''} onChange={e=>setPanel(selPanel.id,{rebar:{...selPanel.rebar,...(e.target.value?{edge:e.target.value as 'bend'|'ubar'}:{edge:undefined})}})}><option value="">ตามเบอร์พื้น</option><option value="bend">งอฉากลงในคานริม</option><option value="ubar">เหล็ก U ปิดขอบ</option></select></label>
      <label className="field"><span>เหล็กล่างที่คาน</span><select disabled={readOnly} value={selPanel.rebar?.bottomAtBeam||''} onChange={e=>setPanel(selPanel.id,{rebar:{...selPanel.rebar,...(e.target.value?{bottomAtBeam:e.target.value as 'continuous'|'stop'}:{bottomAtBeam:undefined})}})}><option value="">ตามเบอร์พื้น</option><option value="continuous">ต่อเนื่อง ทาบที่คาน</option><option value="stop">หยุดฝังในคาน</option></select></label>
     </details>
     <button type="button" disabled={readOnly} onClick={remove}><Trash2 size={13}/>ลบแผง</button></div>}
    {selOpening&&(()=>{const o=selOpening,st=stats?.openings.get(o.id),host=openingPanel(f,o),t=o.trim,setT=(patch:Partial<typeof t>)=>setOpening(o.id,{trim:{...t,...patch}});
     return <div className="sf-props"><span className="sf-kicker">ช่องเปิดที่เลือก{host?` · แผง ${host.tag}`:''}</span><b>{o.label||o.id}</b>
      <label className="field"><span>ชื่อ</span><input disabled={readOnly} value={o.label} maxLength={40} onChange={e=>setOpening(o.id,{label:e.target.value})}/></label>
      <div className="sf-two">{refField('จากกริด X',  'X',o.x,v=>setOpening(o.id,{x:v}))}{refField('จากกริด Y','Y',o.y,v=>setOpening(o.id,{y:v}))}</div>
      <div className="sf-two">{num(o.shape==='circle'?'Ø':'กว้าง (X)',o.w,v=>setOpening(o.id,{w:v}),{min:0})}{o.shape==='rect'&&num('ยาว (Y)',o.h,v=>setOpening(o.id,{h:v}),{min:0})}</div>
      <label className="field"><span>รูปร่าง</span><select disabled={readOnly} value={o.shape} onChange={e=>setOpening(o.id,{shape:e.target.value as 'rect'|'circle'})}><option value="rect">สี่เหลี่ยม</option><option value="circle">วงกลม</option></select></label>
      <h5>เหล็กเสริมรอบช่องเปิด</h5>
      <label className="field"><span>วิธี</span><select disabled={readOnly} value={t.method} onChange={e=>setT({method:e.target.value as typeof t.method})}><option value="cut">ตัดเหล็กที่ช่องเปิด + เหล็กเสริมขอบ (แนะนำ)</option><option value="deviate">เบี่ยงเหล็กหลบ (ช่องเล็ก ≤ 300)</option><option value="none">ไม่เสริม</option></select></label>
      {t.method!=='none'&&<><label className="field"><span>เหล็กเสริมขอบ ต่อด้าน ต่อชั้น</span><select disabled={readOnly} value={t.bars==='area'?'area':'custom'} onChange={e=>setT({bars:e.target.value==='area'?'area':{count:2,diameter:12}})}><option value="area">แทนพื้นที่เหล็กที่ถูกตัด (คำนวณให้)</option><option value="custom">กำหนดเอง</option></select></label>
       {t.bars!=='area'&&<div className="sf-two">{num('จำนวน / ด้าน',t.bars.count,v=>setT({bars:{...(t.bars as {count:number;diameter:number}),count:Math.max(1,Math.min(10,Math.round(v)))}}),{min:1})}{dia('Ø',t.bars.diameter,d=>setT({bars:{...(t.bars as {count:number;diameter:number}),diameter:d}}))}</div>}
       <label className="field"><span>ยื่นเลยมุมช่องเปิด</span><select disabled={readOnly} value={typeof t.ext==='number'?'mm':t.ext} onChange={e=>setT({ext:e.target.value==='mm'?600:e.target.value as 'ld'|'lap'})}><option value="ld">ระยะฝัง Ld จาก Spec</option><option value="lap">ระยะทาบ</option><option value="mm">กำหนดเอง</option></select></label>
       {typeof t.ext==='number'&&num('ระยะยื่น (mm)',t.ext,v=>setT({ext:v}),{min:0})}
       <label className="check"><input type="checkbox" disabled={readOnly} checked={t.diagonal} onChange={e=>setT({diagonal:e.target.checked})}/>เหล็กทแยงที่มุม (ยาว 2 × ระยะยื่น)</label>
       <label className="field"><span>ชั้นเหล็ก</span><select disabled={readOnly} value={t.layers} onChange={e=>setT({layers:e.target.value as typeof t.layers})}><option value="both">ทั้งชั้นบนและชั้นล่าง</option><option value="bottom">ชั้นล่าง</option><option value="top">ชั้นบน</option></select></label></>}
      <div className="sf-live">{st?<>{st.fallback?<>{st.fallback} · </>:null}{t.method==='deviate'&&!st.fallback?`เบี่ยงเหล็กหลบ${st.deviated?'':' (ไม่มีเหล็กผ่านช่อง)'} · ไม่ตัดเหล็ก`:`ตัดเหล็กล่าง X ${st.cut.X} เส้น และ Y ${st.cut.Y} เส้น`}{st.trim||st.diag?` → เพิ่มเหล็กเสริมขอบ ${st.trim} เส้น${st.diag?` และเหล็กทแยง ${st.diag} เส้น`:''} · +${st.kg.toFixed(1)} kg`:''}</>:'แก้รายการที่ต้องแก้ก่อนเพื่อดูผลเหล็ก'}</div>
      <button type="button" disabled={readOnly} onClick={remove}><Trash2 size={13}/>ลบช่องเปิด</button></div>;})()}
    {selBeam&&<div className="sf-props"><span className="sf-kicker">คานอ้างอิง</span><b>{selBeam.mark} · แนว {selBeam.line}</b>
     <label className="field"><span>Mark</span><input disabled={readOnly} value={selBeam.mark} maxLength={20} onChange={e=>setBeam(selBeam.id,{mark:e.target.value})}/></label>
     <label className="field"><span>คานหลัก / คานรอง (ทั้งแนว {selBeam.line})</span><select disabled={readOnly} value={f.beams.find(b=>b.along===selBeam.along&&b.line===selBeam.line&&b.rank)?.rank||''} onChange={e=>{const rank=e.target.value as ''|'primary'|'secondary';commit({...f,beams:f.beams.map(b=>{if(b.along!==selBeam.along||b.line!==selBeam.line)return b;const {rank:_r,...rest}=b;return rank?{...rest,rank}:rest;})});}}>
      <option value="">อัตโนมัติ ({lineRank({...f,beams:f.beams.map(b=>{const {rank:_r,...rest}=b;return rest;})},selBeam.along,selBeam.line)==='primary'?'หลัก':'รอง'}: ลึกกว่าเป็นหลัก · เท่ากันแนว X หลัก)</option><option value="primary">คานหลัก (วิ่งต่อเนื่องที่จุดตัด)</option><option value="secondary">คานรอง (หยุดที่หน้าคานหลัก)</option></select></label>
     {linkOf(selBeam.along,selBeam.line).map(x=><p key={x.member.id} className="muted">สมาชิกคาน <button type="button" className="link-chip" onClick={()=>openMember(x.member.id)}>{x.member.code}</button> · {linkStateLabel[x.state]}</p>)}
     <div className="sf-two">{num('กว้าง',selBeam.width,v=>setBeam(selBeam.id,{width:v}),{min:0})}{num('ลึก (รวมพื้น)',selBeam.depth,v=>setBeam(selBeam.id,{depth:v}),{min:0})}</div>
     <label className="field"><span>แนวคาน</span><select disabled={readOnly} value={selBeam.along} onChange={e=>{const along=e.target.value as 'X'|'Y',l=along==='X'?gy:gx,r=along==='X'?gx:gy;setBeam(selBeam.id,{along,line:l[0]?.label||'',from:r[0]?.label||'',to:r.at(-1)?.label||''});}}><option value="X">ขนานแกน X</option><option value="Y">ขนานแกน Y</option></select></label>
     <div className="sf-two"><label className="field"><span>อยู่บนกริด</span><select disabled={readOnly} value={selBeam.line} onChange={e=>setBeam(selBeam.id,{line:e.target.value})}>{(selBeam.along==='X'?gy:gx).map(g=><option key={g.label}>{g.label}</option>)}</select></label>{num('เยื้องจากกริด',selBeam.offset||0,v=>setBeam(selBeam.id,{offset:v}))}</div>
     <div className="sf-two">{(['from','to'] as const).map(k=><label key={k} className="field"><span>{k==='from'?'จากกริด':'ถึงกริด'}</span><select disabled={readOnly} value={selBeam[k]} onChange={e=>setBeam(selBeam.id,{[k]:e.target.value})}>{(selBeam.along==='X'?gx:gy).map(g=><option key={g.label}>{g.label}</option>)}</select></label>)}</div>
     <p className="muted">คานอ้างอิง: ไม่คิดคอนกรีต / แบบหล่อ (คิดในสมาชิกคาน) · เป็นที่รองรับ ตัดแผง และให้เหล็กพื้นวิ่งผ่าน</p>
     <button type="button" disabled={readOnly} onClick={remove}><Trash2 size={13}/>ลบคาน</button></div>}
    {sel?.kind==='column'&&(()=>{const c=(f.columns||[]).find(x=>x.id===sel.id);if(!c)return null;
     return <div className="sf-props"><span className="sf-kicker">เสาอ้างอิง</span><b>เสา {c.x}/{c.y}</b>
      <div className="sf-two">{num('X',c.sx,v=>setColumn(c.id,{sx:v,template:undefined}),{min:0})}{num('Y',c.sy,v=>setColumn(c.id,{sy:v,template:undefined}),{min:0})}</div>
      {colTemplates.length>0&&<label className="field"><span>Column Template</span><select disabled={readOnly} value={c.template||''} onChange={e=>{const t=colTemplates.find(x=>x.id===e.target.value);setColumn(c.id,t?{sx:t.sx,sy:t.sy,template:t.id}:{template:undefined});}}><option value="">— ขนาดเอง —</option>{colTemplates.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
      <p className="muted">เสาอ้างอิง: ไม่สร้างสมาชิกเสาในรอบนี้ · ใช้เป็นที่รองรับ (support) ของกริดคาน</p>
      <button type="button" disabled={readOnly} onClick={remove}><Trash2 size={13}/>ลบเสา</button></div>;})()}
    {selDrop&&(()=>{const d=selDrop,b=bbox(d.outline as P2[]),setBox=(x:number,y:number,w:number,h:number)=>setDrop(d.id,{outline:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]});
     return <div className="sf-props"><span className="sf-kicker">{d.kind==='drop'?'Drop (หนาลง)':'พื้นลดระดับ (บางส่วน)'}</span><b>{d.label||d.id}</b>
      <label className="field"><span>ชนิด</span><select disabled={readOnly} value={d.kind} onChange={e=>setDrop(d.id,{kind:e.target.value as 'drop'|'sunken'})}><option value="drop">Drop · หนาลงใต้พื้น</option><option value="sunken">ลดระดับบางส่วน (ห้องน้ำ / ระเบียง)</option></select></label>
      {num(d.kind==='drop'?'หนาเพิ่ม (mm)':'ลดลง (mm)',d.depth,v=>setDrop(d.id,{depth:v}),{min:0})}
      <label className="field"><span>เหล็ก</span><select disabled={readOnly} value={d.rebar} onChange={e=>setDrop(d.id,{rebar:e.target.value as 'crank'|'separate'})}><option value="crank">คอม้า 1:6 (ต่างระดับ ≤ 75)</option><option value="separate">ตัดแยก + เหล็กยึด Ld</option></select></label>
      {d.outline.length===4&&<><div className="sf-two">{refField('มุมซ้ายล่าง X','X',b[0],v=>setBox(v,b[1],b[2]-b[0],b[3]-b[1]))}{refField('มุมซ้ายล่าง Y','Y',b[1],v=>setBox(b[0],v,b[2]-b[0],b[3]-b[1]))}</div>
       <div className="sf-two">{num('กว้าง X',b[2]-b[0],v=>setBox(b[0],b[1],Math.max(100,v),b[3]-b[1]),{min:100})}{num('ยาว Y',b[3]-b[1],v=>setBox(b[0],b[1],b[2]-b[0],Math.max(100,v)),{min:100})}</div></>}
      <button type="button" disabled={readOnly} onClick={remove}><Trash2 size={13}/>ลบ</button></div>;})()}
    {!sel&&<div className="sf-props"><span className="sf-kicker">เบอร์พื้น (ตารางเหล็กพื้น)</span>
     {spec.slabTemplates?.length?<label className="field"><span>เพิ่ม / อัปเดตจากตารางพื้น (General Spec)</span><select disabled={readOnly} value="" onChange={e=>addMarkFromSpec(e.target.value)}><option value="">— เลือกเบอร์พื้น —</option>{spec.slabTemplates.map(t=><option key={t.id} value={t.id}>{t.name} · หนา {t.thickness}{t.rebar.topExtra?.spacing?` · บนเสริม ${topExtraText(t.rebar.topExtra)}`:''}</option>)}</select></label>:<p className="muted">General Spec ยังไม่มีตารางพื้น · เพิ่มเบอร์เองได้</p>}
     {f.marks.map(m=><details key={m.name} className="sf-mark-card" open={f.marks.length===1}><summary><b>{m.name}</b> หนา {m.thickness} · ล่าง {barText(m.rebar.shortBottom)} / {barText(m.rebar.longBottom)} · บนเสริม {topExtraText(m.rebar.topExtra)}{m.template?' · จากตารางพื้น':''}</summary>
      <div className="sf-two"><label className="field"><span>เบอร์</span><input disabled={readOnly} defaultValue={m.name} maxLength={12} onBlur={e=>{const v=e.target.value.trim().replace(/[^A-Za-z0-9-]/g,'');if(v&&v!==m.name)setMark(m.name,{name:v});}}/></label>{num('หนา',m.thickness,v=>setMark(m.name,{thickness:v}),{min:0})}</div>
      <label className="field"><span>ตำแหน่ง</span><select disabled={readOnly} value={m.support} onChange={e=>setMark(m.name,{support:e.target.value as 'elevated'|'ground'})}><option value="elevated">พื้นลอย (มีไม้แบบท้อง)</option><option value="ground">พื้นบนดิน</option></select></label>
      {barRow('ล่างด้านสั้น (B1)',m.rebar.shortBottom,b=>setMark(m.name,{rebar:{...m.rebar,shortBottom:b}}))}{barRow('ล่างด้านยาว (B2)',m.rebar.longBottom,b=>setMark(m.name,{rebar:{...m.rebar,longBottom:b}}))}
      {barRow('บนด้านสั้น (T1)',m.rebar.shortTop,b=>setMark(m.name,{rebar:{...m.rebar,shortTop:b}}))}{barRow('บนด้านยาว (T2)',m.rebar.longTop,b=>setMark(m.name,{rebar:{...m.rebar,longTop:b}}))}
      {extraFields(m.rebar.topExtra,e=>setMark(m.name,{rebar:{...m.rebar,...(e?{topExtra:e}:{})}}))}
      <div className="sf-two"><label className="field"><span>ขอบนอก</span><select disabled={readOnly} value={m.rebar.edge} onChange={e=>setMark(m.name,{rebar:{...m.rebar,edge:e.target.value as 'bend'|'ubar'}})}><option value="bend">งอฉากลงในคานริม</option><option value="ubar">เหล็ก U ปิดขอบ</option></select></label>
       <label className="field"><span>เหล็กล่างที่คาน</span><select disabled={readOnly} value={m.rebar.bottomAtBeam} onChange={e=>setMark(m.name,{rebar:{...m.rebar,bottomAtBeam:e.target.value as 'continuous'|'stop'}})}><option value="continuous">ต่อเนื่อง ทาบที่คาน</option><option value="stop">หยุดฝังในคาน</option></select></label></div>
      <button type="button" disabled={readOnly||f.panels.some(p=>p.mark===m.name)} title={f.panels.some(p=>p.mark===m.name)?'ยังมีแผงใช้เบอร์นี้':undefined} onClick={()=>commit({...f,marks:f.marks.filter(x=>x.name!==m.name)})}><Trash2 size={13}/>ลบเบอร์</button></details>)}
     <button type="button" disabled={readOnly||f.marks.length>=20} onClick={addMark}><Plus size={13}/>เพิ่มเบอร์พื้น</button>
     <label className="field"><span>ระดับหลังพื้นอ้างอิง (m)</span><NumInput type="number" step="0.001" disabled={readOnly} value={f.level} onChange={e=>commit({...f,level:Number(e.target.value)||0})}/></label></div>}
   </aside>
  </div>
 </div>;
}

const inside=(p:P2,r:P2[])=>{let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
const bbox=(r:P2[])=>[Math.min(...r.map(q=>q[0])),Math.min(...r.map(q=>q[1])),Math.max(...r.map(q=>q[0])),Math.max(...r.map(q=>q[1]))];
const centre=(r:P2[]):P2=>{const b=bbox(r),c:P2=[(b[0]+b[2])/2,(b[1]+b[3])/2];if(inside(c,r))return c;return [r.reduce((n,q)=>n+q[0],0)/r.length,r.reduce((n,q)=>n+q[1],0)/r.length];};
function nextLabel(list:{label:string}[],first:string){if(!list.length)return first;const last=[...list].map(g=>g.label).sort().at(-1)!;
 if(/^\d+$/.test(last))return String(Number(last)+1);if(/^[A-Z]$/.test(last))return String.fromCharCode(last.charCodeAt(0)+1);return `${last}'`;}
function GridTable({title,list,readOnly,onChange,next}:{title:string;list:{label:string;at:number}[];readOnly:boolean;onChange:(l:{label:string;at:number}[])=>void;next:string}){
 const sorted=[...list].sort((a,b)=>a.at-b.at);
 return <div className="sf-grids"><h5>{title}</h5><table><thead><tr><th>กริด</th><th>ระยะ (mm)</th><th>ช่วง</th><th/></tr></thead><tbody>
  {sorted.map((g,k)=><tr key={`${g.label}${k}`}><td><input aria-label={`${title} ชื่อ`} disabled={readOnly} defaultValue={g.label} maxLength={12} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==g.label)onChange(list.map(x=>x===g?{...x,label:v}:x));}}/></td>
   <td><NumInput aria-label={`${title} ระยะ`} type="number" disabled={readOnly} value={g.at} onChange={e=>onChange(list.map(x=>x===g?{...x,at:Number(e.target.value)||0}:x))}/></td><td className="muted">{k?Math.round(g.at-sorted[k-1].at).toLocaleString('en-US'):''}</td>
   <td><button type="button" className="icon-button" title="ลบกริด" disabled={readOnly} onClick={()=>onChange(list.filter(x=>x!==g))}><Trash2 size={12}/></button></td></tr>)}
 </tbody></table><button type="button" disabled={readOnly||list.length>=30} onClick={()=>onChange([...list,{label:next,at:(sorted.at(-1)?.at||0)+(sorted.length>1?sorted.at(-1)!.at-sorted.at(-2)!.at:5000)}])}><Plus size={12}/>เพิ่มกริด</button></div>;
}
/** Position typed as “grid + distance” (B +1,200) or plain mm. */
function RefInput({label,list,value,readOnly,onChange}:{label:string;list:{label:string;at:number}[];value:number;readOnly:boolean;onChange:(v:number)=>void}){
 const [text,setText]=useState(gridRef(list,value)),[bad,setBad]=useState(false);
 return <label className="field"><span>{label}</span><input className={`mono${bad?' invalid':''}`} disabled={readOnly} value={text} onChange={e=>{setText(e.target.value);setBad(parseGridRef(list,e.target.value)===undefined);}} onBlur={()=>{const v=parseGridRef(list,text);if(v!==undefined)onChange(v);else{setText(gridRef(list,value));setBad(false);}}} title="เช่น B +1,200 หรือระยะจากศูนย์ (mm)"/></label>;
}
function OutlineEditor({f,ring,readOnly,onChange}:{f:SlabFloor;ring:P2[];readOnly:boolean;onChange:(r:P2[])=>void}){
 const [text,setText]=useState(ring.map(([x,y])=>`${gridRef(f.gridsX,x)} ; ${gridRef(f.gridsY,y)}`).join('\n')),[err,setErr]=useState('');
 const apply=()=>{const pts=text.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [a,b]=l.split(/[;\t]/);return [parseGridRef(f.gridsX,a||''),parseGridRef(f.gridsY,b||'')];});
  if(pts.length<3||pts.some(p=>p[0]===undefined||p[1]===undefined)){setErr('ทุกบรรทัดต้องเป็น “X ; Y” เช่น A +150 ; 1 +150');return;}if(pts.length>64){setErr('ไม่เกิน 64 จุด');return;}setErr('');onChange(pts as P2[]);};
 return <div className="sf-outline"><textarea rows={Math.min(10,ring.length+1)} disabled={readOnly} value={text} onChange={e=>setText(e.target.value)} className="mono"/>{err&&<small className="error">{err}</small>}<button type="button" disabled={readOnly} onClick={apply}>ใช้จุดยอด</button></div>;
}
