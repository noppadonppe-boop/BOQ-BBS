import {HelpButton} from './HelpCenter';
import {lazy,Suspense,useEffect,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent as RPointerEvent} from 'react';
import {Box,Layers,Maximize2,Ruler,MousePointer2,PenLine,Grid3x3,Repeat,Sparkles,SquarePen,Trash2,Undo2,Wand2,X as Close} from 'lucide-react';
import type {Bar,Member,Project} from '../domain/model';
import {takeoff,validateMember} from '../domain/engine';
import {buildView,markColors} from '../domain/elementViews';
import {codeValues} from '../domain/designCodes';
import {partPolygon,shapeGeometry} from '../domain/shapeGeometry';
import {hookDevLength,lapLength} from '../domain/elementInput';
import {faceLabels,partPurposeLabels,partPurposes,type FaceKey,type PartPurpose,type PartRebar,type ShapePart} from '../domain/shapeModelSchema';
import {addHooks,barLayout,boxFaces,hookInfo,hookRadius,stdHookLength,coverRings,defaultRange,detectShapeCode,edgeSegments,insideCover,isSketchBar,offsetSegments,polyLength,rayHit,sketchBar,snapPoint,snapToCover,toView,traceCover,viewAxes,viewRegion,withEnds,
 type CoverHit,type HookEnd,type HookTable,type LayoutRule,type P2,type SketchEndSet,type Snap,type SketchView} from '../domain/rebarSketch';
import {BarEditModal} from './BarEditModal';
import {applyPartPresets,defaultPartRebar,detachPreset,edgeCover,edgeFaces,faceCovers,detailingFor,guessPurpose,isPresetBar,outsideLengths,partBox,partCoverage,partSketchId,withOutsideRegions,type Box3} from '../domain/partRebar';
import {barOwner,markFor,modelTags,newGroupId,nextTag,ownerParts,tagMarks,withAutoTags} from '../domain/partTags';
import {Field,number} from './EditorControls';
import {ModelView} from './Geometry';
import {DIAS,HookFields,LayoutFields,LoopTool,MeshTool,NotesTool,viewOfBar,type Tool} from './RebarSketch';

const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');
type Kind=SketchView['kind'];
/** Cut positions shared by the views: x = section Y–Y plane, y = section X–X plane, z = plan level. */
type Cuts={x:number;y:number;z:number};
const viewOf=(kind:Kind,c:Cuts):SketchView=>({kind,at:kind==='sx'?c.y:kind==='sy'?c.x:c.z});
type CSnap=Snap|{p:P2;kind:'lap';label:string}|{p:P2;kind:'bar';label:string};
type FacePick={part:string;face:FaceKey|'side'};
const snapLabels:Record<CSnap['kind'],string>={corner:'มุม cover',cover:'แนว cover',edge:'ขอบคอนกรีต',ortho:'แนวฉาก',grid:'grid',free:'อิสระ',lap:'ระยะพ้นผิวคอนกรีต',bar:'ชิดเหล็กเส้นอื่น'};
const cutLabels=['Y–Y','X–X','แปลน'];
const viewTitles:Record<Kind,string>={plan:'แปลน (Z)',sx:'รูปตัด X–X',sy:'รูปตัด Y–Y'};
const Custom3DModal=lazy(()=>import('./Element3DModal').then(m=>({default:m.Custom3DModal})));
const unionBox=(bs:Box3[]):Box3|undefined=>bs.length?{x0:Math.min(...bs.map(b=>b.x0)),x1:Math.max(...bs.map(b=>b.x1)),y0:Math.min(...bs.map(b=>b.y0)),y1:Math.max(...bs.map(b=>b.y1)),z0:Math.min(...bs.map(b=>b.z0)),z1:Math.max(...bs.map(b=>b.z1))}:undefined;
/** Box of a part in a view: [u lo, v lo] – [u hi, v hi]. */
const boxIn=(b:Box3,kind:Kind)=>{const lo=[b.x0,b.y0,b.z0],hi=[b.x1,b.y1,b.z1],a=viewAxes({kind,at:0});return {lo:[lo[a.u],lo[a.v]] as P2,hi:[hi[a.u],hi[a.v]] as P2};};
const noEnds:SketchEndSet={start:{ext:null,hook:'none',leg:0,n:0},end:{ext:null,hook:'none',leg:0,n:0}};

type Ctx={
 m:Member;rows:ReturnType<typeof takeoff>['rows'];colors:Map<string,string>;readOnly:boolean;tool:Tool;force:boolean;grid:number;ortho:boolean;dia:number;off:number;
 cover:number;extra:number;snapFaces:boolean;snapBars:boolean;picked:FacePick[];pickFaces:(f:FacePick[])=>void;
 cuts:Cuts;setCuts:(c:Cuts)=>void;active:Kind;setActive:(k:Kind)=>void;focus:string;focusIds:string[];fbox?:Box3;setFocus:(id:string)=>void;
 pts:P2[];hits:CoverHit[];drawKind:Kind|null;setPts:(f:(p:P2[])=>P2[])=>void;setHits:(f:(h:CoverHit[])=>CoverHit[])=>void;setDrawKind:(k:Kind)=>void;reset:()=>void;
 hooks:{start:HookEnd;end:HookEnd};hookTable:HookTable;laps:{label:string;len:number}[];
 finish:(view:SketchView,points:P2[],rings:P2[][],warn?:string[])=>void;sel:string;setSel:(id:string)=>void;selBar?:Bar;selView?:SketchView;
 updateSel:(patch:{points?:P2[];layout?:LayoutRule;ends?:SketchEndSet},final?:boolean)=>void;settle:()=>void;deleteSel:()=>void;
 editBar:(id:string)=>void;big:Kind|'3d'|'';expand:(k:Kind|'3d'|'')=>void;
};

/** Rebar of shape-model members. The tab lists the parts and bar groups (Tag no., purpose, bar sets); a part (or several
 * picked together = one bar group) opens the rebar window: plan (Z) / section X–X / section Y–Y framed on it + 3D,
 * presets, drawing tools, bar ends (past / short of the face, standard or custom hooks) and group / single layouts.
 * Bars drawn in the window belong to the part / group (`sk-<id>-…`, Marks `<tag>/nn`). */
export function RebarSketch({member:m,project,readOnly,onChange}:{member:Member;project:Project;readOnly:boolean;onChange:(next:Member)=>void}){
 const sm=m.shapeModel,spec=project.spec,det=useMemo(()=>detailingFor(spec),[spec]);
 const g=useMemo(()=>sm?shapeGeometry(sm):undefined,[sm]);
 const [focus,setFocusId]=useState(''),[win,setWin]=useState(false),[picks,setPicks]=useState<string[]>([]);
 const focusGroup=sm?.groups?.find(x=>x.id===focus),focusParts=useMemo(()=>sm&&focus?ownerParts(sm,focus):[],[sm,focus]);
 const focusPart=!focusGroup&&focusParts.length===1?focusParts[0]:undefined,fbox=unionBox(focusParts.map(partBox));
 const focusTag=focusGroup?.tag||focusPart?.tag,focusLabel=focusGroup?.label||focusPart?.label||'ทั้งโมเดล';
 const [cuts,setCuts]=useState<Cuts>(()=>({x:Math.round(m.x/2),y:Math.round(m.y/2),z:Math.round(Math.min(m.z/2,m.cover+8))}));
 const setFocus=(id:string)=>{setFocusId(id);const b=unionBox(sm&&id?ownerParts(sm,id).map(partBox):[]);if(b)setCuts({x:Math.round((b.x0+b.x1)/2),y:Math.round((b.y0+b.y1)/2),z:Math.round((b.z0+b.z1)/2)});};
 const [active,setActive]=useState<Kind>('sx'),[view3d,setView3d]=useState(false),[tool,setTool]=useState<Tool>(()=>m.shapeModel?.rebarNotes?.length&&!m.bars.some(isSketchBar)&&!m.bars.some(isPresetBar)?'notes':'select');
 const [dia,setDia]=useState(16),[cover,setCover]=useState(m.cover),[extra,setExtra]=useState(0),[grid,setGrid]=useState(25),[ortho,setOrtho]=useState(true);
 const grades=codeValues(spec.codeData,spec.designCode).grades,gradeOf=(d:number)=>grades.find(r=>r.bar===d)?.grade||(d<=9?'SR24':'SD40');
 // default distribution range: along the drawing view's normal over the part / group in focus (else the member)
 const rangeFor=(kind:Kind):[number,number]=>{const n=viewAxes({kind,at:0}).n,c=cover+dia/2;if(fbox){const lo=[fbox.x0,fbox.y0,fbox.z0][n],hi=[fbox.x1,fbox.y1,fbox.z1][n];return [lo+c,Math.max(lo+c,hi-c)];}return defaultRange(m,{kind,at:0},cover,dia);};
 const [layout,setLayout]=useState<LayoutRule>(()=>{const [from,to]=defaultRange(m,{kind:'sx',at:0},m.cover,16);return {rule:'spacing',spacing:200,count:5,from,to};});
 useEffect(()=>{const [from,to]=rangeFor(active);setLayout(l=>({...l,from,to}));},[active,focus,cover,dia,m.x,m.y,m.z]);
 const [pts,setPts]=useState<P2[]>([]),[hits,setHits]=useState<CoverHit[]>([]),[drawKind,setDrawKind]=useState<Kind|null>(null),[sel,setSel]=useState('');
 const [force,setForce]=useState(true),[hooks,setHooks]=useState<{start:HookEnd;end:HookEnd}>({start:{kind:'none',leg:0},end:{kind:'none',leg:0}});
 // hook data: STIRRUP AND TIE HOOKS (D, 90° / 135° seismic A/G and H), sizes it lacks from END HOOKS (D)
 const hookTable:HookTable=useMemo(()=>{const cv=codeValues(spec.codeData,spec.designCode),ties=cv.stirrupHooks.map(h=>({bar:h.bar,D:h.D,a90:h.a90,a135:h.a135s,h135:h.h135s}));return [...ties,...cv.endHooks.filter(h=>!ties.some(t=>t.bar===h.bar)).map(h=>({bar:h.bar,D:h.D}))].sort((a,b)=>a.bar-b.bar);},[spec]);
 const laps=useMemo(()=>[{label:`Lap ${fmt(lapLength(det,dia))}`,len:lapLength(det,dia)},{label:`Ldh ${fmt(hookDevLength(det,dia))}`,len:hookDevLength(det,dia)},{label:`12d ${fmt(12*dia)}`,len:12*dia}],[det,dia]);
 const rows=useMemo(()=>takeoff(m,spec).rows,[m,spec]),colors=useMemo(()=>markColors(rows),[rows]);
 const errors=useMemo(()=>validateMember(m,spec),[m,spec]),outsideLen=useMemo(()=>outsideLengths(m),[m]);
 const selBar=m.bars.find(b=>b.id===sel),selView=selBar?viewOfBar(selBar):undefined;
 const [picked,setPicked]=useState<FacePick[]>([]),[snapFaces,setSnapFaces]=useState(true),[snapBars,setSnapBars]=useState(true);
 const [notes,setNotes]=useState<string[]>([]),[edit,setEdit]=useState(''),[big,setBig]=useState<Kind|'3d'|''>('');
 const commitBars=(bars:Bar[],select?:string,final=true)=>{const next={...m,bars};onChange(final?withOutsideRegions(next,spec):next);if(select!==undefined)setSel(select);};
 // bars made by the tools while a part / group is in focus belong to it: owner id + its tag's Marks
 const commitNew=(made:Bar[])=>{if(!made.length)return;let work=m;const own=made.map(b=>{const nb={...b,id:focus?partSketchId(focus):b.id,mark:''};nb.mark=markFor(work,focus||undefined);work={...work,bars:[...work.bars,nb]};return nb;});commitBars([...m.bars,...own],own[0].id);};
 const reset=()=>{setPts([]);setHits([]);setDrawKind(null);};
 const finish=(view:SketchView,points:P2[],rings:P2[][],warn:string[]=[])=>{if(points.length<2||readOnly){reset();return;}const h=addHooks(points,hooks,dia,rings,hookTable),mark=markFor(m,focus||undefined);
  const ends:SketchEndSet={start:{ext:null,hook:hooks.start.kind,leg:hooks.start.leg,...(hooks.start.flip?{flip:true}:{}),n:h.n.start,...(h.shift.start?{shift:Number(h.shift.start.toFixed(3))}:{})},end:{ext:null,hook:hooks.end.kind,leg:hooks.end.leg,...(hooks.end.flip?{flip:true}:{}),n:h.n.end,...(h.shift.end?{shift:Number(h.shift.end.toFixed(3))}:{})}};
  const bar=sketchBar({...(focus?{id:partSketchId(focus)}:{}),mark,view,points:h.points,diameter:dia,grade:gradeOf(dia),layout,radius:hookRadius(dia,hookTable)});commitBars([...m.bars,{...bar,ends}],bar.id);setNotes([...h.notes,...warn]);reset();setTool('select');};
 const updateSel=(patch:{points?:P2[];diameter?:number;layout?:LayoutRule;grade?:string;mark?:string;ends?:SketchEndSet},final=true)=>{if(!selBar||!selView)return;
  const old=selBar.points.map(p=>toView(selView,p as [number,number,number]));const l=patch.layout||barLayout(selBar);
  const next=sketchBar({id:selBar.id,mark:patch.mark||selBar.mark,view:selView,points:patch.points||old,diameter:patch.diameter||selBar.diameter,grade:patch.grade||selBar.grade,layout:l,note:selBar.note,radius:hookRadius(patch.diameter||selBar.diameter,hookTable)});
  const ends=patch.ends||selBar.ends;
  commitBars(m.bars.map(b=>b.id===selBar.id?{...next,...(ends?{ends}:{}),placementConfirmed:false}:b),undefined,final);};
 const settle=()=>onChange(withOutsideRegions(m,spec));
 const deleteSel=()=>{if(selBar&&!readOnly)commitBars(m.bars.filter(b=>b.id!==selBar.id),'');};
 const levels=g?[...new Set(g.levels)]:[];
 const sketchErrors=errors.filter(t=>m.bars.some(b=>(isSketchBar(b)||isPresetBar(b))&&t.startsWith(`${b.mark}:`)));
 useEffect(()=>{if(!win)return;const esc=(e:globalThis.KeyboardEvent)=>{if(e.key!=='Escape'||edit||(e.target as HTMLElement).closest('input,select,textarea,.sketch-canvas'))return;if(big)setBig('');else setWin(false);};window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc);},[win,big,edit]);
 if(!sm)return <section className="panel padded"><p className="notice">สร้างรูปทรงในแท็บ “รูปทรง (หลายชิ้นส่วน)” และกดใช้กับสมาชิกก่อน แล้วจึงใส่เหล็ก</p></section>;
 const owned=(b:Bar)=>barOwner(sm,b),mine=(b:Bar)=>!focus||owned(b)===focus;
 const listed=m.bars.filter(b=>(isSketchBar(b)||isPresetBar(b))&&(!win||mine(b))).sort((a,b)=>Number(!!focus&&owned(b)===focus)-Number(!!focus&&owned(a)===focus));
 const ctx:Ctx={m,rows,colors,readOnly,tool,force,grid,ortho,dia,off:cover+extra+dia/2,cover,extra,snapFaces,snapBars,picked,pickFaces:setPicked,cuts,setCuts,active,setActive,focus,focusIds:focusParts.map(p=>p.id),fbox:win?fbox:undefined,setFocus,pts,hits,drawKind,setPts,setHits,setDrawKind,reset,hooks,hookTable,laps,finish,sel,setSel,selBar,selView,updateSel,settle,deleteSel,editBar:id=>{setSel(id);setEdit(id);},big,expand:setBig};
 // cover of one face (undefined = back to the part / member cover); presets follow
 const setFaceCover=(id:string,face:FaceKey|'side',v:number|undefined)=>{const next={...m,shapeModel:{...sm,parts:sm.parts.map(p=>{if(p.id!==id)return p;const c={...p.covers};if(v===undefined)delete c[face];else c[face]=v;return {...p,covers:Object.keys(c).length?c:undefined};})}};const res=applyPartPresets(next,spec);setNotes(res.notes);onChange(res.member);};
 const savePart=(id:string,rebar:PartRebar|undefined)=>{const next={...m,shapeModel:{...sm,parts:sm.parts.map(p=>p.id===id?{...p,rebar}:p)}};const res=applyPartPresets(next,spec);setNotes(res.notes);onChange(res.member);};
 const open=(id:string)=>{setFocus(id);setSel('');reset();setTool(t=>t==='notes'?'select':t);setWin(true);};
 // picked parts → the group with exactly these parts, else a new group (tag G-nn)
 const openGroup=()=>{const ids=picks.filter(id=>sm.parts.some(p=>p.id===id));if(ids.length<2)return;const same=sm.groups?.find(x=>x.parts.length===ids.length&&ids.every(id=>x.parts.includes(id)));
  if(same){open(same.id);return;}if(readOnly||(sm.groups?.length||0)>=20)return;
  const id=newGroupId(sm),grp={id,tag:nextTag('G',modelTags(sm)),label:sm.parts.filter(p=>ids.includes(p.id)).map(p=>p.tag||p.label).join(' + ').slice(0,80),parts:ids};
  onChange({...m,shapeModel:{...sm,groups:[...(sm.groups||[]),grp]}});setPicks([]);open(id);};
 const putGroup=(id:string,patch:{tag?:string;label?:string})=>onChange(tagMarks({...m,shapeModel:{...sm,groups:sm.groups!.map(x=>x.id===id?{...x,...patch}:x)}}));
 const dropGroup=(id:string)=>{const n=m.bars.filter(b=>owned(b)===id).length;if(n&&!confirm(`ลบกลุ่มนี้และเหล็ก ${n} ชุดของกลุ่ม?`))return;const groups=sm.groups!.filter(x=>x.id!==id);
  onChange(withOutsideRegions({...m,bars:m.bars.filter(b=>owned(b)!==id),shapeModel:{...sm,groups:groups.length?groups:undefined}},spec));setFocusId('');setWin(false);};
 const putTag=(id:string,tag:string|undefined)=>onChange(tagMarks({...m,shapeModel:{...sm,parts:sm.parts.map(p=>p.id===id?{...p,tag}:p)}}));
 const tagTaken=(id:string,t:string)=>[...sm.parts.filter(p=>p.id!==id).map(p=>p.tag),...(sm.groups||[]).filter(x=>x.id!==id).map(x=>x.tag)].some(x=>x&&x.toUpperCase()===t.toUpperCase());
 const tagInput=(id:string,value:string|undefined,on:(t:string|undefined)=>void)=><input className="tag-input" aria-label="Tag no." disabled={readOnly} defaultValue={value||''} key={value||''} placeholder="—" onBlur={e=>{const t=e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16);if(t===(value||''))return;if(t&&(!/^[A-Z0-9]/.test(t)||tagTaken(id,t))){alert(`Tag “${t}” ใช้ไม่ได้หรือซ้ำ`);e.target.value=value||'';return;}on(t||undefined);}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>;
 const kg=(id:string)=>rows.filter(r=>barOwner(sm,{id:r.id})===id).reduce((t,r)=>t+r.weight,0);
 return <section className="panel padded rebar-sketch">
  {view3d&&<Suspense fallback={<div className="e3d-shade"><div className="notice">กำลังเปิดมุมมอง 3D…</div></div>}><Custom3DModal member={m} spec={spec} readOnly={readOnly} onChange={onChange} onClose={()=>setView3d(false)}/></Suspense>}
  <div className="section-heading"><div><h3>ใส่เหล็ก · ชิ้นส่วน (Tag no.)</h3><p className="muted">คลิก “ใส่เหล็ก” ของชิ้นส่วนเพื่อเปิดหน้าต่างใส่เหล็ก (แปลน Z · รูปตัด X–X · Y–Y · 3D เฉพาะชิ้นนั้น) · ติ๊กหลายชิ้นแล้ว “ใส่เหล็กเป็นกลุ่ม” เพื่อวางเหล็กก้อนเดียวต่อเนื่องข้ามชิ้นส่วน · Mark ของเหล็กขึ้นต้นด้วย Tag (เช่น F-01/01)</p></div>
   <div className="actions"><button className="view3d-button" onClick={()=>setView3d(true)} title="มุมมอง 3D แบบเต็ม · คลิกขวาเพื่อแก้ไขชิ้นส่วนและเหล็กเสริม"><Box size={15}/>3D Modal</button></div></div>
  {!readOnly&&!sm.parts.some(p=>p.tag)&&<div className="notice tag-notice"><span>ชิ้นส่วนยังไม่มี Tag no. · ตั้ง Tag ตามหน้าที่ (F-01, C-01, W-01 …) เพื่อแยกแบบ BBS ตามชิ้นส่วน · Mark ของเหล็กจะเปลี่ยนเป็น Tag/เลข (เช่น F-01/01)</span>
   <button type="button" className="primary" onClick={()=>{const n=m.bars.filter(b=>barOwner(sm,b)).length;if(n&&!confirm(`ตั้ง Tag no. ให้ทุกชิ้น และเปลี่ยน Mark ของเหล็ก ${n} ชุดที่เป็นของชิ้นส่วนเป็น Tag/เลข?
แบบ BBS ที่ส่งออกไปแล้วจะไม่ตรงกับ Mark ใหม่`))return;onChange(tagMarks({...m,shapeModel:withAutoTags(sm,p=>guessPurpose(p,sm))}));}}>ตั้ง Tag no. อัตโนมัติ</button></div>}
  <table className="part-table"><thead><tr><th/><th>Tag no.</th><th>ชิ้นส่วน / กลุ่ม</th><th>หน้าที่</th><th className="num">ชุดเหล็ก</th><th className="num">kg</th><th/></tr></thead><tbody>
   {sm.parts.map(p=>{const n=m.bars.filter(b=>owned(b)===p.id).length;return <tr key={p.id} className={`${p.role}${picks.includes(p.id)?' picked':''}`}>
    <td><input type="checkbox" aria-label={`เลือก ${p.label}`} checked={picks.includes(p.id)} onChange={e=>setPicks(x=>e.target.checked?[...x,p.id]:x.filter(y=>y!==p.id))}/></td>
    <td>{tagInput(p.id,p.tag,t=>putTag(p.id,t))}</td>
    <td><b>{p.label}</b><small>{p.role==='void'?'ช่องเปิด / บ่อ':p.role==='reference'?'อ้างอิง (เทภายหลัง)':`Stage ${p.stage}`} · Z {fmt(p.z0)}–{fmt(p.z0+p.height)}</small></td>
    <td>{p.rebar?partPurposeLabels[p.rebar.purpose]:<span className="muted">ยังไม่กำหนด</span>}</td><td className="num">{n||'—'}</td><td className="num">{n?number(kg(p.id),1):'—'}</td>
    <td><button type="button" className="primary" onClick={()=>open(p.id)}><PenLine size={13}/>ใส่เหล็ก</button></td></tr>;})}
   {(sm.groups||[]).map(x=>{const n=m.bars.filter(b=>owned(b)===x.id).length;return <tr key={x.id} className="group">
    <td><Layers size={14}/></td><td>{tagInput(x.id,x.tag,t=>{if(t)putGroup(x.id,{tag:t});})}</td>
    <td><b>{x.label}</b><small>กลุ่มเหล็ก · {x.parts.map(id=>sm.parts.find(p=>p.id===id)?.tag||sm.parts.find(p=>p.id===id)?.label).join(' + ')}</small></td>
    <td>เหล็กต่อเนื่องข้ามชิ้น</td><td className="num">{n||'—'}</td><td className="num">{n?number(kg(x.id),1):'—'}</td>
    <td><button type="button" className="primary" onClick={()=>open(x.id)}><PenLine size={13}/>ใส่เหล็ก</button></td></tr>;})}
  </tbody></table>
  <div className="actions part-table-actions">
   <button type="button" disabled={picks.length<2} title="เปิดหน้าต่างใส่เหล็กของชิ้นที่ติ๊กรวมกัน (สร้างกลุ่ม Tag G-nn ถ้ายังไม่มี)" onClick={openGroup}><Layers size={13}/>ใส่เหล็กเป็นกลุ่ม ({picks.length} ชิ้น)</button>
   <button type="button" onClick={()=>open('')}>ใส่เหล็กทั้งโมเดล</button>
   {sm.parts.some(p=>!p.tag)&&<span className="muted">ตั้ง Tag no. ได้ในตาราง หรือปุ่ม “ตั้ง Tag อัตโนมัติ” ในแท็บรูปทรง</span>}
  </div>
  {notes.length>0&&!win&&<p className="notice warning">{notes.join(' · ')}</p>}
  <h4>ตรวจ</h4>
  {sketchErrors.length?<ul className="shape-check bad">{sketchErrors.slice(0,8).map(t=><li key={t}>{t}</li>)}</ul>:<p className="ok-text">✔ cover · อยู่ในคอนกรีต / พื้นที่อ้างอิง · ไม่ผ่านช่องเปิด</p>}
  <p className="muted">หลังใส่เหล็ก: ตรวจในแท็บ “ตรวจเหล็กทับกัน” · ยืนยันตำแหน่งใน “แบบ & BBS” (เลือกแบบทั้งโมเดล หรือแยกตาม Tag) · บันทึกสมาชิก</p>
  {win&&<div className="rebar-window" role="dialog" aria-label={`ใส่เหล็ก ${focusTag||''} ${focusLabel}`}>
   <div className="rebar-window-head">
    <div><h3>{focusTag&&<em className="part-tag">{focusTag}</em>}{focusLabel}</h3><p className="muted">{focusGroup?`กลุ่มเหล็ก · ${focusParts.length} ชิ้น · เหล็กที่วาดวิ่งต่อเนื่องข้ามชิ้นส่วน`:focusPart?`${focusPart.rebar?partPurposeLabels[focusPart.rebar.purpose]:'ยังไม่กำหนดหน้าที่'} · ขนาด ${fmt(fbox!.x1-fbox!.x0)} × ${fmt(fbox!.y1-fbox!.y0)} × ${fmt(fbox!.z1-fbox!.z0)}`:'ทั้งโมเดล'} · วาด: คลิกวางจุด ดับเบิลคลิก/Enter จบเส้น · ลากแนวตัด จุดเหล็ก (□) ช่วงกระจาย (◆) · Esc ปิด</p></div>
    <label className="field compact"><span>ชิ้น</span><select value={focus} onChange={e=>{setFocus(e.target.value);setSel('');reset();}}><option value="">ทั้งโมเดล</option>{sm.parts.map(p=><option key={p.id} value={p.id}>{p.tag?`${p.tag} · `:''}{p.label}</option>)}{(sm.groups||[]).map(x=><option key={x.id} value={x.id}>{x.tag} · {x.label} (กลุ่ม)</option>)}</select></label>
    <button type="button" className="e3d-close" aria-label="ปิดหน้าต่างใส่เหล็ก" onClick={()=>setWin(false)}><Close size={18}/></button>
   </div>
  <div className={`sketch-layout${tool==='notes'?' notes-open':''}`}>
   <aside className="sketch-tools">
    {focusPart?<PartPanel key={focusPart.id} part={focusPart} m={m} spec={spec} det={det} readOnly={readOnly} onSave={r=>savePart(focusPart.id,r)}/>
     :focusGroup?<div className="part-panel"><h4>กลุ่มเหล็ก · {focusGroup.tag}</h4><Field label="ชื่อกลุ่ม" value={focusGroup.label} disabled={readOnly} onChange={v=>{const t=String(v).slice(0,80);if(t.trim())putGroup(focusGroup.id,{label:t});}}/>
      <p className="muted">ชิ้นในกลุ่ม: {focusParts.map(p=>p.tag||p.label).join(' + ')} · เหล็ก Preset ยังเป็นของแต่ละชิ้น · เหล็กที่วาดที่นี่เป็นของกลุ่ม (BBS แยกชุด {focusGroup.tag})</p>
      <button type="button" className="danger-text" disabled={readOnly} onClick={()=>dropGroup(focusGroup.id)}><Trash2 size={13}/>ลบกลุ่ม</button></div>
     :<p className="muted part-hint">ทั้งโมเดล · เลือกชิ้นจากรายการด้านบนเพื่อกำหนดหน้าที่และใช้เหล็ก Preset</p>}
    <h4>เครื่องมือวาด</h4>
    <div className="sketch-toolbar">{([['draw',<PenLine size={14}/>,'วาดเหล็ก'],['select',<MousePointer2 size={14}/>,'เลือก / แก้'],['mesh',<Grid3x3 size={14}/>,'ตะแกรง (แปลน)'],['loop',<Repeat size={14}/>,'Loop / Hoop'],['notes',<Sparkles size={14}/>,'จาก Note ในแบบ'],['cover',<Ruler size={14}/>,'Cover รายด้าน']] as const).map(([k,i,l])=><button key={k} className={tool===k?'active':''} disabled={readOnly&&k!=='select'} onClick={()=>{setTool(k);reset();}}>{i}{l}</button>)}<HelpButton topic={tool==='cover'?'cover-faces':tool==='loop'?'loop-laps':tool==='select'?'rebar-window':'rebar-tools'}/></div>
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
    {!force&&<div className="snap-opts"><span>Snap อ้างอิง:</span><label className="check"><input type="checkbox" checked disabled/>แนว cover</label><label className="check"><input type="checkbox" checked={snapFaces} onChange={e=>setSnapFaces(e.target.checked)}/>ผิวคอนกรีต</label><label className="check" title="เส้นขนานกับเหล็กที่มีอยู่ ห่างศูนย์ d₁/2 + d₂/2 (ผิวชนผิว) ไม่ทับกันในระนาบเดียวกัน"><input type="checkbox" checked={snapBars} onChange={e=>setSnapBars(e.target.checked)}/>ชิดเหล็กเส้นอื่น</label></div>}
    <div className="actions layer-step"><button type="button" title="เลื่อนแนววาดเข้าอีก 1 ชั้นเหล็ก (ขนาดที่เลือก) เพื่อไม่ทับเหล็กชั้นแรก" onClick={()=>setExtra(x=>x+dia)}>+ ชั้นถัดไป (+{dia})</button>{extra>0&&<button type="button" onClick={()=>setExtra(0)}>กลับชั้นแรก</button>}</div>
    <Field label="ระดับแปลน Z (mm)" type="number" value={cuts.z} onChange={v=>setCuts({...cuts,z:Number(v)||0})}/>
    <div className="sketch-levels">{levels.filter(z=>!fbox||z>=fbox.z0-1e-6&&z<=fbox.z1+1e-6).map(z=><button key={z} type="button" onClick={()=>setCuts({...cuts,z})}>{fmt(z)}</button>)}</div>
    <h4>ขอที่ปลายเหล็ก (เส้นใหม่)</h4>
    <HookFields label="ปลายต้น" value={hooks.start} d={dia} table={hookTable} onChange={v=>setHooks(h=>({...h,start:v}))}/>
    <HookFields label="ปลายท้าย" value={hooks.end} d={dia} table={hookTable} onChange={v=>setHooks(h=>({...h,end:v}))}/>
    {tool==='draw'&&<><h4>เหล็กกลุ่ม / เดี่ยว · กระจายตั้งฉาก{viewTitles[active]}{focusTag?` · ใน ${focusTag}`:''}</h4><LayoutFields layout={layout} range={rangeFor(active)} onChange={setLayout}/></>}
    {tool==='mesh'&&<MeshTool m={m} z={cuts.z} dia={dia} cover={cover} grade={gradeOf(dia)} within={focusParts.map(p=>p.id)} readOnly={readOnly} onCreate={commitNew}/>}
    {tool==='notes'&&<NotesTool m={m} readOnly={readOnly} gradeOf={gradeOf} onNotes={rebarNotes=>onChange({...m,shapeModel:{...sm,...(rebarNotes.length?{rebarNotes}:{rebarNotes:undefined})}})} onCreate={commitNew}/>}
    {tool==='cover'&&<CoverTool m={m} focusPart={focusPart} picked={picked} readOnly={readOnly} onSet={setFaceCover}/>}
    {tool==='loop'&&<LoopTool m={m} z={cuts.z} dia={dia} cover={cover} grade={gradeOf(dia)} det={det} within={focusParts.map(p=>p.id)} readOnly={readOnly} onCreate={commitNew}/>}
   </aside>
   <div className="sketch-views">
    <SketchCanvas kind="plan" ctx={ctx}/>
    <div className="sketch-canvas sketch-3d"><div className="sketch-status"><b>3D</b><span>ชิ้นที่เลือก = สีส้ม · คลิกเหล็กเลือก Mark · คลิกคอนกรีตเปลี่ยนชิ้น</span><button type="button" className="view-expand" title="ขยายมุมมอง" aria-label="ขยายมุมมอง 3D" onClick={()=>setBig('3d')}><Maximize2 size={13}/></button></div><ModelView member={m} spec={spec} selected={sel} onSelect={setSel} part={focusParts.map(p=>p.id).join(',')} onPart={id=>{if(!focusGroup)setFocus(id);}} onFace={tool==='cover'?(part,face)=>setPicked([{part,face}]):undefined} height={330} keepView/></div>
    <SketchCanvas kind="sx" ctx={ctx}/>
    <SketchCanvas kind="sy" ctx={ctx}/>
   </div>
   <aside className="sketch-props">
    {notes.length>0&&<p className="notice warning">{notes.join(' · ')}</p>}
    <h4>ชุดเหล็ก{focusTag?` ของ ${focusTag}`:''} ({listed.length})</h4>
    <div className="sketch-list">{listed.map(b=>{const o=owned(b),op=sm.parts.find(p=>p.id===o)||sm.groups?.find(x=>x.id===o),out=outsideLen.get(b.id);return <button key={b.id} type="button" title="คลิกขวา / ดับเบิลคลิก = แก้ไขเหล็ก" onContextMenu={e=>{e.preventDefault();setSel(b.id);setEdit(b.id);}} onDoubleClick={()=>{setSel(b.id);setEdit(b.id);}} className={`${b.id===sel?'active':''} ${focus&&o!==focus?'dim':''}`} onClick={()=>{setSel(b.id);const v=viewOfBar(b);if(v)setCuts({...cuts,...(v.kind==='sx'?{y:Math.round(b.points[0][1])}:v.kind==='sy'?{x:Math.round(b.points[0][0])}:{z:Math.round(b.points[0][2])})});setTool('select');}}>
     <i style={{background:colors.get(b.id)}}/><span><b>{b.mark}</b> {b.diameter<=9?'RB':'DB'}{b.diameter} × {b.count} · {b.shapeCode}{isPresetBar(b)?' · Preset':''}<small>{op&&!focus?`${op.label} · `:''}{b.note}{out?` · ยื่นพ้นคอนกรีต ${fmt(out)} mm`:''}</small></span></button>;})}</div>
    {selBar&&<div className="sketch-sel"><h4>{selBar.mark} · คุณสมบัติ <button type="button" className="link-button" onClick={()=>setEdit(selBar.id)}><SquarePen size={12}/>แก้ไขเหล็ก…</button></h4>
     {isSketchBar(selBar)&&selView?<>
      <div className="form-grid"><Field label="Mark" value={selBar.mark} disabled={readOnly} onChange={v=>updateSel({mark:String(v).slice(0,32)||selBar.mark})}/>
       <label className="field"><span>ขนาด</span><select disabled={readOnly} value={selBar.diameter} onChange={e=>{const d=Number(e.target.value);updateSel({diameter:d,grade:gradeOf(d)});}}>{DIAS.map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label></div>
      <LayoutFields layout={barLayout(selBar)} range={rangeFor(selView.kind)} onChange={l=>updateSel({layout:l})} disabled={readOnly}/>
      <EndsEditor key={selBar.id} bar={selBar} view={selView} m={m} cover={cover} focusBox={focusPart?fbox:undefined} det={det} table={hookTable} readOnly={readOnly} onApply={(points,ends,n)=>{setNotes(n);updateSel({points,ends});}}/>
      <p className="muted">Shape {selBar.shapeCode} · {selBar.points.length} จุด · ลากจุด (□) ใน{viewTitles[selView.kind]} · ลากช่วงกระจาย (◆) ในมุมมองอื่น</p></>
      :isPresetBar(selBar)?<p className="muted">ชุด Preset ของชิ้นส่วน · แก้ขนาด / ระยะในแผง “หน้าที่ของชิ้น” ด้านซ้าย (สร้างใหม่ทุกครั้งที่รูปทรงเปลี่ยน)</p>
      :<p className="muted">ชุดนี้สร้างด้วยเครื่องมืออื่น · แก้ในแท็บ “แบบ & BBS”</p>}
     {(()=>{const r=rows.find(x=>x.id===selBar.id);return r?<table className="shape-qty"><tbody><tr><td>ยาวตัด</td><td>{fmt(r.cutLength)} mm</td></tr><tr><td>จำนวน</td><td>{r.count}</td></tr><tr><td>น้ำหนัก / ชิ้น</td><td>{number(r.weight,2)} kg</td></tr>{outsideLen.get(selBar.id)?<tr><td>ยื่นพ้นคอนกรีต</td><td>{fmt(outsideLen.get(selBar.id)!)} mm</td></tr>:null}</tbody></table>:null;})()}
     {!isPresetBar(selBar)&&<button type="button" className="danger-text" disabled={readOnly} onClick={deleteSel}><Trash2 size={13}/>ลบชุดเหล็กนี้</button>}</div>}
    <h4>ตรวจ</h4>
    {sketchErrors.length?<ul className="shape-check bad">{sketchErrors.slice(0,8).map(t=><li key={t}>{t}</li>)}</ul>:<p className="ok-text">✔ cover · อยู่ในคอนกรีต / พื้นที่อ้างอิง · ไม่ผ่านช่องเปิด</p>}
    {m.placementContext?.regions.some(r=>r.id.startsWith('genext-'))&&<p className="muted">เส้นประทอง = พื้นที่อ้างอิงของเหล็กที่ยื่นพ้นคอนกรีต (ไม่คิดคอนกรีต / แบบหล่อ)</p>}
   </aside>
  </div>
  {big&&<div className="e3d-shade view-zoom-shade" onMouseDown={e=>{if(e.target===e.currentTarget)setBig('');}}><div className="view-zoom">
   {big==='3d'?<div className="sketch-canvas sketch-3d"><div className="sketch-status"><b>3D · {focusTag||''} {focusLabel}</b><span className="actions"><button type="button" onClick={()=>setBig('')}><Close size={13}/>ปิด</button></span></div><ModelView member={m} spec={spec} selected={sel} onSelect={setSel} part={focusParts.map(p=>p.id).join(',')} onPart={id=>{if(!focusGroup)setFocus(id);}} height={Math.round(window.innerHeight*.78)} keepView/></div>
    :<SketchCanvas kind={big} ctx={ctx} large/>}</div></div>}
  </div>}
  {edit&&(()=>{const b=m.bars.find(x=>x.id===edit);if(!b)return null;return <BarEditModal key={b.id} bar={b} m={m} spec={spec} range={(()=>{const v=viewOfBar(b);return v?rangeFor(v.kind):undefined;})()} readOnly={readOnly} gradeOf={gradeOf} onClose={()=>setEdit('')}
   onSave={d=>{commitBars(m.bars.map(x=>x.id===d.id?d:x),d.id);setEdit('');}}
   onDetach={isPresetBar(b)?()=>{const res=detachPreset(m,b.id);if(!res)return;onChange(withOutsideRegions(res.member,spec));setSel(res.id);setEdit(res.id);}:undefined}
   onDuplicate={()=>{const o=barOwner(sm,b),c:Bar={...structuredClone(b),id:o?partSketchId(o):`sk-${crypto.randomUUID().slice(0,12)}`,mark:markFor(m,o),placementConfirmed:false};commitBars([...m.bars,c],c.id);setEdit(c.id);}}
   onDelete={()=>{commitBars(m.bars.filter(x=>x.id!==b.id),'');setEdit('');}}
   ends={(d,apply)=>{const v=viewOfBar(d);return v?<EndsEditor key={d.id} bar={d} view={v} m={m} cover={cover} focusBox={focusPart?fbox:undefined} det={det} table={hookTable} readOnly={readOnly} onApply={apply}/>:null;}}/>;})()}
 </section>;
}

/** Cover per face: faces picked in a view (edges in plan / sections, surfaces in 3D) and every face of the part in focus.
 * Blank = the part cover / member cover; never below the member cover (the placement checks use it). Commits on Enter / blur. */
function CoverTool({m,focusPart,picked,readOnly,onSet}:{m:Member;focusPart?:ShapePart;picked:FacePick[];readOnly:boolean;onSet:(part:string,face:FaceKey|'side',v:number|undefined)=>void}){
 const sm=m.shapeModel!,eff=(p:ShapePart,face:FaceKey|'side')=>face==='side'?Math.max(m.cover,p.covers?.side??p.rebar?.cover??m.cover):faceCovers(m,p)[face];
 const row=(p:ShapePart,face:FaceKey|'side')=>{const v=p.covers?.[face],commit=(raw:string)=>{const t=raw.trim(),n=t===''?undefined:Math.min(1000,Math.max(m.cover,Number(t)||m.cover));if(n!==v)onSet(p.id,face,n);};return <label className="field cover-row" key={`${p.id}-${face}-${v??''}`}><span>{p.tag?`${p.tag} · `:''}{faceLabels[face]}</span>
  <input type="number" min={m.cover} max={1000} disabled={readOnly} defaultValue={v??''} placeholder={`${fmt(eff(p,face))}`} onBlur={e=>commit(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit((e.target as HTMLInputElement).value);}}}/></label>;};
 const picks=picked.flatMap(k=>{const p=sm.parts.find(q=>q.id===k.part);return p?[{p,face:k.face}]:[];});
 const all:(FaceKey|'side')[]=focusPart?.shape==='box'?['x0','x1','y0','y1','bottom','top']:['side','bottom','top'];
 return <div className="sketch-sub cover-tool"><h4>Cover รายด้าน</h4><p className="muted">คลิกขอบคอนกรีตในแปลน / รูปตัด หรือคลิกผิวใน 3D เพื่อเลือกด้าน · ช่องว่าง = ใช้ cover ของชิ้น · ต่ำสุด {m.cover} (cover สมาชิก ที่ใช้ตรวจ) · Enter เพื่อบันทึก · เหล็ก Preset สร้างใหม่ตาม cover</p>
  {picks.length?<div className="form-grid">{picks.map(x=>row(x.p,x.face))}</div>:<p className="muted">ยังไม่ได้เลือกด้าน</p>}
  {focusPart&&<><h4>ทุกด้านของ {focusPart.tag||focusPart.label}</h4><div className="form-grid">{all.map(face=>row(focusPart,face))}</div></>}</div>;
}

const hookNames:Record<SketchEndSet['start']['hook'],string>={none:'ปลายตรง',std90:'ขอมาตรฐาน 90°',std135:'ขอมาตรฐาน 135°',std180:'ขอมาตรฐาน 180°',custom:'ฉาก 90° กำหนดความยาว'};
/** Both ends of a drawn bar: distance past (+) / short of (−) the part face along the end run (blank = as drawn), and
 * the end hook (standard 90° / 180° from the spec hook table, or a custom leg). Faces = the part in focus, else the concrete. */
function EndsEditor({bar,view,m,cover,focusBox,det,table,readOnly,onApply}:{bar:Bar;view:SketchView;m:Member;cover:number;focusBox?:Box3;det:ReturnType<typeof detailingFor>;table:HookTable;readOnly:boolean;onApply:(points:P2[],ends:SketchEndSet,notes:string[])=>void}){
 const [e,setE]=useState<SketchEndSet>(()=>bar.ends||noEnds),d=bar.diameter;
 const std=stdHookLength('std90',d,table);
 const quick:[string,number][]=[[`cover −${fmt(cover)}`,-cover],['ผิว 0',0],[`Lap +${fmt(lapLength(det,d))}`,lapLength(det,d)],[`Ldh +${fmt(hookDevLength(det,d))}`,hookDevLength(det,d)]];
 const apply=()=>{const at={...view,at:bar.points[0][viewAxes(view).n]},region=viewRegion(m,at),faces=focusBox?boxFaces([boxIn(focusBox,view.kind)]):edgeSegments(region),rings=coverRings(region,(p,q)=>Math.max(cover,edgeCover(m,view.kind,p,q,at.at)??0)+d/2);
  const res=withEnds(bar.points.map(p=>toView(at,p as [number,number,number])),bar.ends,e,d,faces,rings,table);onApply(res.points,res.ends,res.notes);setE(res.ends);};
 const end=(k:'start'|'end',label:string)=>{const v=e[k],put=(p:Partial<typeof v>)=>setE({...e,[k]:{...v,...p}});return <div className="bar-end" key={k}><b>{label}</b>
  <div className="form-grid"><label className="field"><span>ระยะหยุดเหล็ก จากผิว{focusBox?'ชิ้น':'คอนกรีต'} (+ ออก / − เข้า{v.hook!=='none'?' · ถึงผิวนอกส่วนโค้ง':''})</span><input type="number" disabled={readOnly} value={v.ext??''} placeholder="ตามที่วาด" onChange={x=>put({ext:x.target.value===''?null:Number(x.target.value)})}/></label>
   <label className="field"><span>ปลาย</span><select disabled={readOnly} value={v.hook} onChange={x=>{const h=x.target.value as typeof v.hook;put({hook:h,leg:h==='custom'?v.leg||std:0});}}>{(Object.keys(hookNames) as (keyof typeof hookNames)[]).map(h=><option key={h} value={h}>{hookNames[h]}{h==='std90'?` (ขา ${fmt(std)})`:h==='std135'?` (10d = ${fmt(10*d)})`:''}</option>)}</select></label>
   {v.hook!=='none'&&<label className="field"><span>{v.hook==='custom'?'ความยาวขา 90° (mm)':v.hook==='std90'?`ความยาวขาจากปลาย (ว่าง = มาตรฐาน ${fmt(stdHookLength(v.hook,d,table))})`:`ส่วนตรงหลังงอ (ว่าง = มาตรฐาน ${fmt(stdHookLength(v.hook,d,table))})`}</span><input type="number" min={0} disabled={readOnly} value={v.leg||''} placeholder={fmt(stdHookLength(v.hook,d,table))} onChange={x=>put({leg:Math.max(0,Number(x.target.value)||0)})}/></label>}
   {v.hook!=='none'&&(()=>{const i=hookInfo(v.hook,d,table,v.leg);return <p className="hook-info">D {fmt(i.D)} · {v.hook==='std135'||v.hook==='std180'?'ส่วนตรงหลังงอ':'ขา'} {fmt(v.hook==='custom'?v.leg:i.L)}{v.hook==='std135'?` · H ${fmt(i.H)}`:''}{i.ag?` · A/G ตาราง ${fmt(i.ag)}`:''} · ยาวขอ ≈ {fmt(i.dev)}</p>;})()}
   {v.hook!=='none'&&<label className="check" title="ปกติของอเข้าหาคอนกรีต · ติ๊กเพื่องอไปอีกด้าน"><input type="checkbox" disabled={readOnly} checked={!!v.flip} onChange={x=>put({flip:x.target.checked||undefined})}/>กลับทิศขอ</label>}</div>
  <div className="bar-end-quick">{quick.map(([t,x])=><button key={t} type="button" disabled={readOnly} onClick={()=>put({ext:x})}>{t}</button>)}<button type="button" disabled={readOnly} onClick={()=>put({ext:null})}>ตามที่วาด</button></div></div>;};
 return <div className="bar-ends"><h4>ปลายเหล็ก <HelpButton topic="bar-ends"/> <HelpButton topic="hooks" label="ขอ"/></h4>{end('start','ปลายต้น · จุด A (จุดแรกที่วาด)')}{end('end',`ปลายท้าย · จุดสุดท้าย (หลังช่วง ${String.fromCharCode(64+Math.max(1,bar.points.length-1-(bar.ends?.start.n||0)-(bar.ends?.end.n||0)))})`)}
  <div className="actions"><button type="button" className="primary" disabled={readOnly} onClick={apply}>ใช้กับเหล็กนี้</button><button type="button" disabled={readOnly} onClick={()=>setE({...e,end:{...e.start,n:e.end.n}})}>ปลายท้าย = ปลายต้น</button></div></div>;
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
  <div className="actions part-actions"><button type="button" className="primary" disabled={readOnly||(!dirty&&!!part.rebar&&m.bars.some(b=>barOwner(m.shapeModel,b)===part.id&&isPresetBar(b)))} onClick={()=>onSave(r)}><Wand2 size={13}/>{part.rebar?'อัปเดตเหล็ก Preset':'สร้างเหล็ก Preset'}</button>
   {part.rebar&&<button type="button" className="danger-text" disabled={readOnly} onClick={()=>{if(confirm(`ลบเหล็ก Preset ของ “${part.label}”?`))onSave(undefined);}}><Trash2 size={13}/>ลบ Preset</button>}</div>
  {cov.length>0&&<><h4>ความครบของเหล็ก</h4><ul className="part-coverage">{cov.map(c=><li key={c.label} className={c.ok===true?'ok':c.ok==='warn'?'warn':'bad'}>{c.ok===true?'✔':c.ok==='warn'?'!':'✖'} {c.label}{c.hint?<small> · {c.hint}</small>:null}</li>)}</ul></>}
 </div>;
}

type CanvasDrag={kind:'pt';index:number}|{kind:'cut';axis:number}|{kind:'range';end:'from'|'to'};
/** One 2D view (plan / section X–X / section Y–Y) of the workspace: parts, cover lines, bars, cut lines, drawing and grips. */
function SketchCanvas({kind,ctx,large=false}:{kind:Kind;ctx:Ctx;large?:boolean}){
 const {m}=ctx,view=viewOf(kind,ctx.cuts),a=viewAxes(view),sm=m.shapeModel!;
 const region=useMemo(()=>viewRegion(m,view),[m,kind,view.at]);
 // cover line per edge: the face cover where one is set (never below the tool cover) + layer shift + bar radius
 const offE=useMemo(()=>(p:P2,q:P2)=>Math.max(ctx.cover,edgeCover(m,kind,p,q,view.at)??0)+ctx.extra+ctx.dia/2,[m,kind,view.at,ctx.cover,ctx.extra,ctx.dia]);
 const coverSegs=useMemo(()=>offsetSegments(region,offE),[region,offE]),edges=useMemo(()=>edgeSegments(region),[region]);
 const rings=useMemo(()=>coverRings(region,offE),[region,offE]),faces=useMemo(()=>coverRings(region,0),[region]);
 const vd=useMemo(()=>buildView(m,ctx.rows,undefined,kind==='plan'?{axes:[0,1]}:{axes:[a.u,a.v] as [number,number],normal:a.n,cut:view.at}),[m,ctx.rows,kind,view.at]);
 // lines parallel to the bars in this plane, d₁/2 + d₂/2 off both sides: a new bar snapped there touches, never overlaps
 const barSegs=useMemo(()=>ctx.snapBars?vd.bars.flatMap(b=>b.lines.flatMap(l=>{const dx=l.b[0]-l.a[0],dy=l.b[1]-l.a[1],L=Math.hypot(dx,dy);if(L<1)return [];const o=(b.row.diameter+ctx.dia)/2,n:P2=[-dy/L*o,dx/L*o];
  return [1,-1].map(k=>({a:[l.a[0]+k*n[0],l.a[1]+k*n[1]] as P2,b:[l.b[0]+k*n[0],l.b[1]+k*n[1]] as P2,mark:b.row.mark}));})):[],[vd,ctx.dia,ctx.snapBars]);
 const W=560,H=380,M=46,svg=useRef<SVGSVGElement>(null),size=[m.x,m.y,m.z];
 // frame: the part / group in focus (rebar window) with its bars, else the member and every bar
 const fb=ctx.fbox&&boxIn(ctx.fbox,kind),fbars=fb?vd.bars.filter(b=>barOwner(sm,{id:b.row.id})===ctx.focus):vd.bars;
 const all:P2[]=[...(fb?[fb.lo,fb.hi]:[[0,0],[size[a.u],size[a.v]]] as P2[]),...fbars.flatMap(b=>[...b.lines.flatMap(l=>[l.a,l.b]),...b.dots])];
 if(fb){const pad=Math.max(150,.12*Math.max(fb.hi[0]-fb.lo[0],fb.hi[1]-fb.lo[1]));all.push([fb.lo[0]-pad,fb.lo[1]-pad],[fb.hi[0]+pad,fb.hi[1]+pad]);}
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
 const snapAt=(e:{clientX:number;clientY:number},prev?:P2):CSnap=>{const w=world(e),base=snapPoint(w,{cover:coverSegs,edges:ctx.snapFaces?edges:[],prev,tol:12/s,grid:ctx.grid,ortho:ctx.ortho}),lap=lapSnap(w,prev);
  // a cover snap on top of an existing bar (same plane) gives way to the line beside that bar
  const onBar=(p:P2)=>vd.bars.some(b=>b.lines.some(l=>{const ex=l.b[0]-l.a[0],ey=l.b[1]-l.a[1],LL=ex*ex+ey*ey;if(LL<1)return false;const t=((p[0]-l.a[0])*ex+(p[1]-l.a[1])*ey)/LL;return t>-.01&&t<1.01&&Math.hypot(p[0]-l.a[0]-t*ex,p[1]-l.a[1]-t*ey)<(b.row.diameter+ctx.dia)/2-.5;}));
  if((base.kind==='corner'||base.kind==='cover')&&!(ctx.snapBars&&onBar(base.p)))return base;
  // beside another bar (same plane): nearest offset line within reach, kept orthogonal to the previous point when possible
  let bb:{p:P2;d:number;mark:string}|undefined;for(const g of barSegs){const ex=g.b[0]-g.a[0],ey=g.b[1]-g.a[1],LL=ex*ex+ey*ey,t=Math.max(0,Math.min(1,((w[0]-g.a[0])*ex+(w[1]-g.a[1])*ey)/LL));let q:P2=[g.a[0]+t*ex,g.a[1]+t*ey];
   if(ctx.ortho&&prev){if(Math.abs(ey)<1e-6&&Math.abs(q[0]-prev[0])<12/s)q=[prev[0],q[1]];if(Math.abs(ex)<1e-6&&Math.abs(q[1]-prev[1])<12/s)q=[q[0],prev[1]];}
   const d=Math.hypot(w[0]-q[0],w[1]-q[1]);if(d<=10/s&&(!bb||d<bb.d))bb={p:q,d,mark:g.mark};}
  if(bb)return {p:bb.p,kind:'bar',label:`ชิด ${bb.mark}`};
  return lap??base;};
 // same plane, parallel and closer than the two radii: the new bar would overlap an existing one
 const clashes=(line:P2[])=>{const out=new Set<string>();for(let i=1;i<line.length;i++){const a0=line[i-1],a1=line[i],ux=a1[0]-a0[0],uy=a1[1]-a0[1],L=Math.hypot(ux,uy);if(L<1)continue;
   for(const b of vd.bars)for(const l of b.lines){const vx=l.b[0]-l.a[0],vy=l.b[1]-l.a[1],V=Math.hypot(vx,vy);if(V<1||Math.abs(ux*vy-uy*vx)/(L*V)>.02)continue;
    const dist=Math.abs((l.a[0]-a0[0])*uy-(l.a[1]-a0[1])*ux)/L;if(dist>=(b.row.diameter+ctx.dia)/2-.5)continue;
    const pr=(p:P2)=>((p[0]-a0[0])*ux+(p[1]-a0[1])*uy)/L,o0=Math.max(0,Math.min(pr(l.a),pr(l.b))),o1=Math.min(L,Math.max(pr(l.a),pr(l.b)));if(o1-o0>10)out.add(`${b.row.mark} (ห่างศูนย์ ${fmt(dist)} < ${fmt((b.row.diameter+ctx.dia)/2)})`);}}
  return [...out].map(t=>`ทับเหล็ก ${t} ในระนาบเดียวกัน · ใช้ “+ ชั้นถัดไป” หรือ Snap ชิดเหล็กเส้นอื่น`);};
 const coverAt=(e:{clientX:number;clientY:number})=>snapToCover(world(e),rings,12/s,ctx.grid);
 const finish=()=>ctx.finish(view,pts,rings,clashes(pts));
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
   ctx.updateSel({layout:{...barLayout(b),from:Math.max(0,Math.min(from,to)),to:Math.max(0,Math.max(from,to))}},false);}
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
   <button type="button" className="view-expand" title={large?'ปิดมุมมองขยาย (Esc)':'ขยายมุมมอง'} aria-label={large?'ปิดมุมมองขยาย':'ขยายมุมมอง'} onClick={()=>ctx.expand(large?'':kind)}>{large?<><Close size={13}/>ปิด</>:<Maximize2 size={13}/>}</button>
   {mine&&pts.length>0&&<span className="actions"><button type="button" onClick={()=>{ctx.setPts(p=>p.slice(0,-1));ctx.setHits(x=>x.slice(0,-1));}}><Undo2 size={13}/>ลบจุด</button><button type="button" className="primary" disabled={pts.length<2} onClick={finish}>จบเส้น ({pts.length})</button></span>}</div>
  <svg ref={svg} className={`sketch-svg tool-${ctx.tool}`} viewBox={`0 0 ${W} ${H}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={()=>{setHover(null);up();}}>
   {region.map((poly,i)=><path key={i} className="sk-concrete" fillRule="evenodd" d={poly.map(r=>`M${(r as P2[]).map(p=>`${X(p[0])},${Y(p[1])}`).join('L')}Z`).join('')}/>)}
   {parts.map(q=>{const d=partShape(q);return d&&<path key={q.p.id} d={d} fillRule="evenodd" className={`sk-part ${q.p.role} ${ctx.focusIds.includes(q.p.id)?'focus':''}`} onPointerDown={()=>{if(ctx.tool!=='draw')ctx.setFocus(q.p.id);}}><title>{q.p.label}</title></path>;})}
   {rings.map((r,i)=><polygon key={i} className={`sk-cover ${ctx.force?'forced':''}`} points={r.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ')}/>)}
   {ctx.tool==='cover'&&edges.map((e,i)=>{const hits=edgeFaces(m,kind,e.a,e.b,view.at);if(!hits.length)return null;const on=hits.some(h=>ctx.picked.some(p=>p.part===h.part.id&&p.face===h.face)),c=edgeCover(m,kind,e.a,e.b,view.at)??m.cover,mx=(e.a[0]+e.b[0])/2,my=(e.a[1]+e.b[1])/2;
    return <g key={`f${i}`} className={`sk-face ${on?'picked':''}`} onPointerDown={ev=>{ev.stopPropagation();ctx.pickFaces(hits.map(h=>({part:h.part.id,face:h.face})));}}><line x1={X(e.a[0])} y1={Y(e.a[1])} x2={X(e.b[0])} y2={Y(e.b[1])}/><text x={X(mx)} y={Y(my)} dy={-5} textAnchor="middle">c {fmt(c)}</text><title>{hits.map(h=>`${h.part.tag||h.part.label} · ${faceLabels[h.face]}`).join(' / ')} · คลิกเพื่อแก้ cover</title></g>;})}
   {ctx.force&&ctx.tool==='draw'&&rings.flatMap((r,i)=>r.map((p,k)=><circle key={`${i}-${k}`} className="sk-corner" cx={X(p[0])} cy={Y(p[1])} r={2.5}/>))}
   {vd.bars.map(b=>{const c=ctx.colors.get(b.row.id)||'#167561',on=b.row.id===ctx.sel,dim=!!ctx.focus&&barOwner(sm,{id:b.row.id})!==ctx.focus&&!on;return <g key={b.row.id} className={`sk-bar ${on?'sel':''}`} opacity={dim?.28:1} onPointerDown={e=>{if(ctx.tool==='select'){e.stopPropagation();ctx.setSel(b.row.id);}}} onContextMenu={e=>{e.preventDefault();ctx.editBar(b.row.id);}}>
    {b.lines.map((l,i)=><line key={i} x1={X(l.a[0])} y1={Y(l.a[1])} x2={X(l.b[0])} y2={Y(l.b[1])} stroke={on?'#d4802a':c} strokeWidth={Math.max(2,b.row.diameter*s)+(on?2:0)} strokeLinecap="round"/>)}
    {b.dots.map((d,i)=><circle key={i} cx={X(d[0])} cy={Y(d[1])} r={Math.max(2.5,b.row.diameter*s/2)} fill={on?'#d4802a':c}/>)}
    {!dim&&b.lines.flatMap((l,i)=>outside(l).map((o,k)=><line key={`o${i}-${k}`} className="sk-out" x1={X(o.a[0])} y1={Y(o.a[1])} x2={X(o.b[0])} y2={Y(o.b[1])}/>))}</g>;})}
   {cutLines.map(({k,v})=>k===a.u?<g key={k} className="sk-cut"><line x1={X(v)} x2={X(v)} y1={8} y2={H-8} onPointerDown={e=>begin(e,{kind:'cut',axis:k})}/><text x={X(v)+4} y={16}>{cutLabels[k]}</text></g>
    :<g key={k} className="sk-cut"><line y1={Y(v)} y2={Y(v)} x1={8} x2={W-8} onPointerDown={e=>begin(e,{kind:'cut',axis:k})}/><text x={W-10} y={Y(v)-4} textAnchor="end">{cutLabels[k]}</text></g>)}
   {editable&&ctx.selView&&(()=>{const b=ctx.selBar!,n0=b.ends?.start.n||0,n1=b.points.length-1-(b.ends?.end.n||0),q0=toView(ctx.selView!,b.points[n0] as [number,number,number]),q1=toView(ctx.selView!,b.points[n1] as [number,number,number]);
    return <g className="sk-ends"><text x={X(q0[0])+8} y={Y(q0[1])-8}>A ต้น</text><text x={X(q1[0])+8} y={Y(q1[1])-8}>ท้าย</text></g>;})()}
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
