import {lazy,Suspense,useEffect,useMemo,useState,type ReactNode} from 'react';
import {Box,Columns3,FileUp,Link2Off,Wand2} from 'lucide-react';
import type {Attachment,Member,Project} from '../domain/model';
import {DEFAULT_COLUMN_POUR,columnPour,beamGroupFrom,columnStackFrom,type GroundInput,columnExtent,columnLayout,columnLayouts,footingColumnName,footingColumns,footingExtent,footingEarth,footingLevels,footingPour,slopePresets,lapLength,applyElementInput,columnInputBars,columnMainMax,columnPresets,applyColumnPreset,type ColumnInput,columnSectionPreview,maxMainDiameter,pileQuantities,pileTypeLabels,type FoundationInput,defaultElementInput,elementInputProblems,layerShapes,shapesFor,shapeDefaults,type BarEnd,elementInputSchema,inputFromExtraction,isGeneratedBar,supportsElementInput,type ElementInput,type FootingColumn,type InputCategory} from '../domain/elementInput';
import {takeoff,validateMember} from '../domain/engine';
import {Field,number,NumInput} from './EditorControls';
import {ElementGraphic} from './ElementGraphic';
import {ColumnTieEditor} from './ColumnTieEditor';
import {FootingEarthworkSketch} from './FootingEarthworkSketch';
import {FootingPourEditor} from './FootingPourEditor';
import {FootingColumnsPlan} from './FootingColumnsPlan';
import {BeamGroupEditor} from './BeamGroupEditor';
import {ColumnStackEditor} from './ColumnStackEditor';
import {ColumnTemplatePicker} from './ColumnTemplatePicker';
import {SaveTemplateButton} from './ElementTemplates';
import {templatePayload} from '../domain/elementTemplates';
import {SiteItemsEditor} from './SiteItemsEditor';
import {emptySiteWork,siteKinds,siteLabels,siteUnits,withSiteWork,type SiteItem} from '../domain/siteWork';
import {detailingFromSpec,specLabel} from '../domain/specProfiles';
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const Element3DModal=lazy(()=>import('./Element3DModal').then(m=>({default:m.Element3DModal})));

const diameters=[6,9,10,12,16,20,25,28,32,36,40];
type Props={member:Member;project:Project;attachments:Attachment[];readOnly:boolean;onApply:(next:Member)=>void;onOpenFiles:()=>void;onDirty?:(dirty:boolean)=>void};

function seeded(m:Member,spec:Project['spec']):ElementInput{
 const stored=elementInputSchema.safeParse(m.elementInput);
 if(stored.success&&stored.data.category===m.category)return structuredClone(stored.data);
 const input=defaultElementInput(m.category as InputCategory,'manual',spec);
 if(m.version===0)return input;
 switch(input.category){
  case 'Foundation':{const p=m.pedestal,ped=p.x>0&&p.y>0&&p.z>0;return {...input,width:m.x,length:m.y,thickness:m.z,column:ped?{...input.column,type:'pedestal',width:p.x,depth:p.y,height:p.z}:input.column,excavation:{...input.excavation,depth:m.excavation.depth||input.excavation.depth},lean:{...input.lean,thickness:m.lean.thickness||input.lean.thickness}};}
  case 'Column':return {...input,width:m.x,depth:m.y,diameter:m.x,height:m.z,cover:{side:m.cover}};
  case 'Beam':return {...input,length:m.x,width:m.y,depth:m.z};
  case 'Slab':return {...input,lengthX:m.x,lengthY:m.y,thickness:m.z};
  case 'Wall':return {...input,length:m.x,thickness:m.y,height:m.z};
 }
}

export function ElementInputPanel({member:m,project,attachments,readOnly,onApply,onOpenFiles,onDirty}:Props){
 const [input,setInput]=useState<ElementInput|null>(()=>supportsElementInput(m.category)?seeded(m,project.spec):null);
 const [occurrences,setOccurrences]=useState(m.occurrences);
 const [filled,setFilled]=useState<string[]>([]);
 const [manualBars,setManualBars]=useState(()=>m.bars.filter(b=>!isGeneratedBar(b)));
 const [view3d,setView3d]=useState(false);
 const [items,setItems]=useState<SiteItem[]>(()=>m.siteWork?.items||[]);
 const [colSel,setColSel]=useState(0),[beamSel,setBeamSel]=useState(0),[picker,setPicker]=useState(false);
 const spec=project.spec;
 // typed but not yet applied = unsaved work (the member popup asks before closing)
 const snapshot=JSON.stringify([input,occurrences,manualBars,items]),[applied,setApplied]=useState(snapshot),dirty=snapshot!==applied;
 useEffect(()=>{onDirty?.(dirty);},[dirty]);
 useEffect(()=>()=>onDirty?.(false),[]);
 const base=useMemo(()=>withSiteWork({...m,occurrences,bars:[...m.bars.filter(isGeneratedBar),...manualBars]},{...(m.siteWork||emptySiteWork()),items}),[m,occurrences,manualBars,items]);
 const problems=useMemo(()=>input?elementInputProblems(input):[],[input]);
 const preview=useMemo(()=>{
  if(!input||problems.length)return undefined;
  try{const applied=applyElementInput(base,input,{rounding:spec.rounding});return {...applied,q:takeoff(applied.member,spec),errors:validateMember(applied.member,spec)};}
  catch(e){return {error:e instanceof Error?e.message:String(e)};}
 },[input,problems,base,spec]);
 if(!input)return <section className="panel padded element-input"><h3>ข้อมูลพื้นฐาน</h3><p className="notice">องค์ประกอบอื่น (Custom) ใช้เครื่องมือขั้นสูง “ชิ้นส่วน / ช่องเปิด” หรือหน้าตัดหลายเหลี่ยม และเพิ่มชุดเหล็กในแท็บ “แบบ & BBS”</p></section>;

 const set=(path:string,value:unknown)=>setInput(prev=>{const next=structuredClone(prev) as any,keys=path.split('.');let o=next;for(const k of keys.slice(0,-1))o=o[k];o[keys.at(-1)!]=value;return next;});
 const get=(path:string):any=>path.split('.').reduce((o:any,k)=>o?.[k],input);
 const num=(label:string,path:string,unit='mm')=><Field key={path} label={`${label}${unit?` (${unit})`:''}`} type="number" value={get(path)} onChange={v=>set(path,/offset[XY]$/.test(path)?Number(v)||0:Math.max(0,Number(v)||0))} disabled={readOnly}/>;
 const dia=(label:string,path:string)=><label className="field" key={path}><span>{label}</span><select disabled={readOnly} value={get(path)} onChange={e=>set(path,Number(e.target.value))}>{[...new Set([...diameters,get(path)])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{d<=9?'RB':'DB'}{d}</option>)}</select></label>;
 const check=(label:string,path:string)=><label className="check" key={path}><input type="checkbox" disabled={readOnly} checked={!!get(path)} onChange={e=>set(path,e.target.checked)}/>{label}</label>;
 const spacing=(label:string,path:string)=><div className="form-grid rebar-row" key={path}>{dia(`${label} · ขนาด`,`${path}.diameter`)}{num(`${label} · ระยะห่าง @`,`${path}.spacing`)}</div>;
 const count=(label:string,path:string)=><div className="form-grid rebar-row" key={path}><Field label={`${label} · จำนวน (เส้น)`} type="number" value={get(`${path}.count`)} onChange={v=>set(`${path}.count`,Math.max(0,Math.trunc(Number(v)||0)))} disabled={readOnly}/>{dia(`${label} · ขนาด`,`${path}.diameter`)}</div>;
 const select=(label:string,path:string,options:[string,string][],numeric=false)=><label className="field" key={path}><span>{label}</span><select disabled={readOnly} value={get(path)} onChange={e=>set(path,numeric?Number(e.target.value):e.target.value)}>{options.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
 const bendOptions=(d:number):[string,string][]=>[['none','ไม่งอ (ปลายตรง)'],['standard',`ฉากมาตรฐาน (${input.detailing.hook90}d + r ≈ ${Math.round(input.detailing.hook90*d+(d<=16?input.detailing.bendSmall:input.detailing.bendLarge)*d+d/2)} mm)`],['custom','กำหนดระยะฉากเอง']];
 const bend=(label:string,path:string,d:number)=><>{select(`${label} · การงอปลาย`,`${path}.bend`,bendOptions(d))}{get(`${path}.bend`)==='custom'&&num(`${label} · ระยะขางอ`,`${path}.leg`)}</>;
 // BS 8666 shape code of a bar layer (only shapes whose ends turn into the member thickness) + its leg / hook / R inputs
 const shapeFields=(label:string,path:string)=>{
  const l=get(path),info=layerShapes.find(s=>s.code===l.shape)||layerShapes[0],std=shapeDefaults(l.diameter,input.detailing,l.shape==='12'?l.radius:0),ends:readonly BarEnd[]=info.ends,bends=ends.includes('bend'),hooks=ends.includes('hook'),returns=ends.includes('return');
  return <>{select(`${label} · Shape code (BS 8666)`,`${path}.shape`,shapesFor(input.category).map(s=>[s.code,`${s.code} · ${s.label}`]))}
   {returns&&num(`${label} · งอเข้าในที่ปลายขา (0 = 15d ≈ ${Math.round(std.ret)})`,`${path}.leg`)}
   {(bends||hooks)&&num(`${label} · ${bends&&hooks?'ขางอ / ส่วนตรงหลังขอ':bends?'ระยะขางอ':'ส่วนตรงหลังขอ 180°'} (0 = มาตรฐาน ${[bends&&`ขา ≈ ${Math.round(std.bend)}`,hooks&&`หลังขอ ${std.hookTail}`].filter(Boolean).join(' / ')})`,`${path}.leg`)}
   {l.shape==='12'&&num(`${label} · รัศมีดัดใน R (Shape 12)`,`${path}.radius`)}
   <div className="shape-preview" key={`${path}.preview`}><ShapeIcon code={info.code}/><small><b>Shape {info.code}</b> · L = {info.formula}{hooks?` · ขอ 180° กว้าง B ≈ ${Math.round(std.hookOutside)} mm`:''}</small></div></>;
 };
 const mesh=(label:string,path:string,optionalLayer=false)=><div key={path} className="mesh-layer">{optionalLayer&&check(`มี${label}`,`${path}.enabled`)}{(!optionalLayer||get(`${path}.enabled`))&&<div className="form-grid">{dia(`${label} · ขนาด`,`${path}.diameter`)}{num(`${label} · ระยะห่าง @`,`${path}.spacing`)}{shapeFields(label,path)}</div>}</div>;
 const shapedCount=(label:string,path:string)=><div key={path} className="mesh-layer"><div className="form-grid"><Field label={`${label} · จำนวน (เส้น)`} type="number" value={get(`${path}.count`)} onChange={v=>set(`${path}.count`,Math.max(0,Math.trunc(Number(v)||0)))} disabled={readOnly}/>{dia(`${label} · ขนาด`,`${path}.diameter`)}{get(`${path}.count`)>0&&shapeFields(label,path)}</div></div>;

 // on ground / elevated + layers under the concrete (slab now, beam later): path = 'ground'
 const groundFields=(what:string)=>{const g=get('ground') as GroundInput,on=g.support==='ground',q=preview&&!('error' in preview)?preview.q:undefined,cell=(path:string)=><NumInput aria-label={path} type="number" step="any" disabled={readOnly} value={get(path)} onChange={e=>set(path,Math.max(0,Number(e.target.value)||0))}/>;
  return <div className="ground-fields"><div className="segmented" role="group" aria-label={`ตำแหน่ง${what}`}>{([['elevated',`${what}ลอย (มีไม้แบบท้อง)`],['ground',`${what}บนดิน`]] as const).map(([v,t])=><button key={v} type="button" disabled={readOnly} className={g.support===v?'active':''} onClick={()=>set('ground.support',v)}>{t}</button>)}</div>
   {on&&<><table className="subbase-table"><thead><tr><th>ชั้นใต้{what} (บน → ล่าง)</th><th>หนา (mm)</th><th>ยื่นจากขอบ (mm)</th><th className="num">ต่อ 1 ชิ้น</th></tr></thead><tbody>
    <tr><td>{check('Lean concrete','ground.lean.enabled')}</td><td>{g.lean.enabled?cell('ground.lean.thickness'):'—'}</td><td>{g.lean.enabled?cell('ground.lean.projection'):'—'}</td><td className="num">{q&&g.lean.enabled?`${number(q.lean)} m³`:'—'}</td></tr>
    <tr><td>{check('แผ่นพลาสติก','ground.sheet.enabled')}</td><td>—</td><td className="muted">{g.lean.enabled?'เท่า Lean':`เท่า${what}`}</td><td className="num">{q&&g.sheet.enabled?`${number(q.sheet)} m²`:'—'}</td></tr>
    <tr><td>{check('ทรายรองพื้น','ground.sand.enabled')}</td><td>{g.sand.enabled?cell('ground.sand.thickness'):'—'}</td><td>{g.sand.enabled?cell('ground.sand.projection'):'—'}</td><td className="num">{q&&g.sand.enabled?`${number(q.sand)} m³`:'—'}</td></tr>
    <tr><td>{check('บดอัดดินเดิม','ground.compaction.enabled')}</td><td>—</td><td className="muted">เท่าชั้นล่างสุด</td><td className="num">{q&&g.compaction.enabled?`${number(q.compaction)} m²`:'—'}</td></tr>
   </tbody></table><p className="muted">{what}บนดิน: ไม่คิดไม้แบบท้อง{what} · ไม่คิดงานขุด / ถม (ใส่เป็นรายการเพิ่มเองได้)</p></>}</div>;};
 const fillFromDrawing=()=>{if(!m.drawingExtraction)return;const r=inputFromExtraction(input,m.drawingExtraction as any);setInput(r.input);setFilled(r.filled);};
 const apply=(withBars:boolean)=>{
  if(!preview||'error' in preview)return;
  if(m.geometry||m.prismGeometry||m.beamAssembly){if(!confirm('สมาชิกนี้ใช้รูปทรงขั้นสูง (ชิ้นส่วน/หน้าตัดพิเศษ/คานต่อเนื่อง) การใช้ข้อมูลพื้นฐานจะแทนที่รูปทรงเหล่านั้น ดำเนินการต่อ?'))return;}
  if(withBars&&m.bars.some(isGeneratedBar)&&!confirm('แทนที่ Bar cut list ที่สร้างอัตโนมัติเดิม (รวมค่าที่แก้ไขด้วยมือในชุดที่สร้างอัตโนมัติ) · ชุดเหล็กที่เพิ่มเองยังคงอยู่'))return;
  const next=withBars?preview.member:applyElementInput(base,input,{rounding:spec.rounding,withBars:false}).member;
  setApplied(snapshot);onApply({...next,occurrences});
 };
 const qty=occurrences.reduce((n,o)=>n+(Number(o.quantity)||0),0);
 const sizes=preview&&!('error' in preview)?[...preview.q.rows.reduce((map,r)=>map.set(r.diameter,(map.get(r.diameter)||0)+r.weight),new Map<number,number>())].sort((a,b)=>a[0]-b[0]):[];
 const memberFiles=attachments.filter(a=>a.memberId===m.id);

 return <section className="panel padded element-input">
  <div className="section-heading"><div><h3>ข้อมูลพื้นฐาน & เหล็กเสริม · {m.code}</h3><p className="muted">เลือกวิธีป้อนข้อมูล · ทั้งสองวิธีให้ผลเป็นข้อมูลชุดเดียวกัน แล้วใช้คำนวณ BOQ และสร้าง Bar cut list</p></div>
   <div className="actions"><SaveTemplateButton project={project} category={m.category} defaultName={m.code} payload={()=>templatePayload(m,{elementInput:input,siteItems:items,bars:manualBars})}/><button className="view3d-button" onClick={()=>setView3d(true)} title="มุมมอง 3D · หมุน ซูม คลิกขวาเพื่อแก้ไขขนาดและเหล็กเสริม"><Box size={15}/>3D Modal</button>
   <div className="segmented mode-switch" role="group" aria-label="วิธีป้อนข้อมูล">{(['manual','drawing'] as const).map(mode=><button key={mode} disabled={readOnly} className={input.mode===mode?'active':''} onClick={()=>set('mode',mode)}>{mode==='manual'?'กรอกเอง':'อ่านจากแบบ'}</button>)}</div></div></div>
  {view3d&&<Suspense fallback={<div className="e3d-shade"><div className="notice">กำลังเปิดมุมมอง 3D…</div></div>}><Element3DModal member={m} input={input} manualBars={manualBars} preview={preview&&!('error' in preview)?preview:undefined} error={preview&&'error' in preview?preview.error:undefined} problems={problems} qty={qty} spec={spec} readOnly={readOnly} onInput={setInput} onManualBars={setManualBars} onApply={()=>apply(true)} onClose={()=>setView3d(false)}/></Suspense>}

  {input.mode==='drawing'&&<div className="notice drawing-steps">
   <b>อ่านค่าจากแบบ</b>
   <ol><li>อัปโหลดแบบ PDF / รูปของสมาชิกนี้ ({memberFiles.length} ไฟล์)</li><li>ส่งไฟล์ให้ AI วิเคราะห์ในแท็บ “แบบต้นทาง / อ่านจากแบบ”</li><li>กด “เติมค่าจากผลอ่านแบบ” แล้วตรวจทุกค่าก่อนใช้</li></ol>
   <div className="actions"><button onClick={onOpenFiles}><FileUp size={15}/>เปิดแท็บแบบต้นทาง</button><button className="primary" disabled={readOnly||!m.drawingExtraction} onClick={fillFromDrawing}><Wand2 size={15}/>เติมค่าจากผลอ่านแบบ</button></div>
   {m.drawingExtraction?<p>ผลอ่านล่าสุด: {m.drawingExtraction.fileName} · ความมั่นใจ {m.drawingExtraction.confidence} · {m.drawingExtraction.extractedAt.slice(0,16).replace('T',' ')}{m.drawingExtraction.warnings.length?` · ข้อควรตรวจ ${m.drawingExtraction.warnings.length} รายการ`:''}</p>:<p>ยังไม่มีผลอ่านแบบของสมาชิกนี้</p>}
   {filled.length>0&&<p className="filled-chips">เติมจากแบบ {filled.length} ค่า: {filled.join(' · ')}</p>}
   {input.source&&<p className="muted">ที่มา: {input.source.fileName}</p>}
  </div>}

  <div className="element-input-layout"><div className="element-input-form">
  <h4>1. มิติและรูปร่าง (จำเป็น)</h4>
  {input.category==='Foundation'&&<><div className="form-grid">{select('ชนิดฐานราก','foundationType',[['spread','ฐานแผ่'],['pile','ฐานเสาเข็ม']])}{select('รูปร่างแปลนฐาน','shape',[['rect','สี่เหลี่ยม'],['circle','กลม'],['hex','6 เหลี่ยม'],['oct','8 เหลี่ยม'],['L','ตัวแอล (L)'],['U','ตัวยู (U)']])}{num('หนา','thickness')}</div>
   <div className="form-grid">{input.shape==='circle'?num('เส้นผ่านศูนย์กลาง','diameter'):<>{num(input.shape==='hex'?'กว้าง X (มุมถึงมุม)':'กว้าง X','width')}{num(input.shape==='hex'?'ยาว Y (ด้านถึงด้าน)':'ยาว Y','length')}</>}
    {(input.shape==='hex'||input.shape==='oct')&&num('ระยะตัดมุม (0 = รูปปกติ)','chamfer')}
    {input.shape==='L'&&<>{num('ความหนาขาแนว X','armX')}{num('ความหนาขาแนว Y','armY')}</>}
    {input.shape==='U'&&<>{num('ความหนาเอว (แนว X)','armX')}{num('ความหนาปีก (แนว Y)','armY')}</>}</div>
   {input.foundationType==='pile'&&<><h4>เสาเข็ม</h4>
    <div className="form-grid">{select('ชนิดเสาเข็ม','pile.type',Object.entries(pileTypeLabels) as [string,string][])}{num(input.pile.type==='square'||input.pile.type==='I'?'ขนาดเข็ม (กว้าง)':'เส้นผ่านศูนย์กลางเข็ม','pile.size')}{select('การจัดวาง','pile.layout',[['standard','ตามจำนวน (รูปแบบมาตรฐาน)'],['grid','ตาราง แถว × คอลัมน์']])}
     {input.pile.layout==='standard'?<Field label="จำนวนเสาเข็ม (ต้น)" type="number" value={input.pile.count} onChange={v=>set('pile.count',Math.max(0,Math.min(100,Math.trunc(Number(v)||0))))} disabled={readOnly}/>:<><Field label="จำนวนตามแนว X" type="number" value={input.pile.nx} onChange={v=>set('pile.nx',Math.max(1,Math.min(20,Math.trunc(Number(v)||1))))} disabled={readOnly}/><Field label="จำนวนตามแนว Y" type="number" value={input.pile.ny} onChange={v=>set('pile.ny',Math.max(1,Math.min(20,Math.trunc(Number(v)||1))))} disabled={readOnly}/></>}
     {num(input.pile.layout==='grid'?'ระยะห่างแนว X (ศูนย์ถึงศูนย์)':'ระยะห่างเข็ม (ศูนย์ถึงศูนย์)','pile.spacingX')}{input.pile.layout==='grid'&&num('ระยะห่างแนว Y','pile.spacingY')}
     <Field label="ความยาวเสาเข็ม (m)" type="number" value={input.pile.length} onChange={v=>set('pile.length',Math.max(0,Number(v)||0))} disabled={readOnly}/>{num('ระยะตัดหัวเข็ม ต่อต้น','pile.cutoff')}{num('ระยะฝังหัวเข็มในฐาน','pile.embed')}{num('ระยะเยื้องกลุ่มเข็ม X (จากกึ่งกลางฐาน)','pile.offsetX')}{num('ระยะเยื้องกลุ่มเข็ม Y (จากกึ่งกลางฐาน)','pile.offsetY')}</div>
    <p className="muted">{pileSummary(input)}</p></>}
   <h4>งานดินและชั้นรองพื้น</h4>{(()=>{const earth=footingEarth(input),q=preview&&!('error' in preview)?preview.q:undefined,cell=(path:string,neg=false)=><NumInput aria-label={path} type="number" step="any" disabled={readOnly} value={get(path)} onChange={e=>set(path,neg?Number(e.target.value)||0:Math.max(0,Number(e.target.value)||0))}/>;
    return <div className="earthwork-input"><div>
     {check('กำหนดระดับอ้างอิง (คำนวณความลึกขุดให้)','levels.enabled')}
     <div className="form-grid">{input.levels.enabled?<>{<Field label="ระดับดินเดิม NGL (m)" type="number" step="0.001" value={input.levels.ground} onChange={v=>set('levels.ground',Number(v)||0)} disabled={readOnly}/>}<div className="field"><span>กำหนดระดับที่</span><div className="segmented" role="group" aria-label="ระดับอ้างอิงของฐาน">{([['top','Top of Foundation'],['bottom','Bottom of Foundation']] as const).map(([v,t])=><button key={v} type="button" disabled={readOnly} className={input.levels.ref===v?'active':''} onClick={()=>{const l=footingLevels(input);setInput(prev=>prev?.category!=='Foundation'?prev:{...prev,levels:{...prev.levels,ref:v,top:Number(l.top.toFixed(3)),bottom:Number(l.bottom.toFixed(3))}});}}>{t}</button>)}</div></div>
      {<Field label={`ระดับ${input.levels.ref==='top'?'หลังฐาน T.O.F.':'ใต้ฐาน B.O.F.'} (m, + / −)`} type="number" step="0.001" value={input.levels[input.levels.ref]} onChange={v=>set(`levels.${input.levels.ref}`,Number(v)||0)} disabled={readOnly}/>}
      <div className="field"><span>{input.levels.ref==='top'?'ระดับใต้ฐาน B.O.F.':'ระดับหลังฐาน T.O.F.'} (คำนวณ)</span><b className="computed">{(()=>{const l=footingLevels(input),v=input.levels.ref==='top'?l.bottom:l.top;return `${v>0?'+':v<0?'−':'±'}${Math.abs(v).toFixed(3)} m`;})()}</b></div>
      <div className="field"><span>ความลึกขุด (คำนวณถึงใต้{earth.sand?'ทราย':'Lean'})</span><b className="computed">{number(earth.depth,0)} mm{earth.bottomLevel!==undefined?` · ก้นขุด ${earth.bottomLevel.toFixed(3)} m`:''}</b></div></>
      :num(`ความลึกขุด (จากระดับดินถึงก้นหลุม = ใต้${earth.sand?'ทราย':'Lean'})`,'excavation.depth')}
      {num('ระยะเผื่อทำงานต่อด้าน','excavation.workingSpace')}</div>
     <div className="field slope-field"><span>ความลาดผนังขุด (ดิ่ง : ราบ)</span><div className="slope-row"><div className="segmented" role="group" aria-label="ความลาดผนังขุด">{slopePresets.map(([v,t])=><button key={v} type="button" disabled={readOnly} className={input.excavation.slope===v?'active':''} onClick={()=>set('excavation.slope',v)}>{t}</button>)}</div>
      <label className="inline">กำหนดเอง 1:<NumInput aria-label="ความลาดกำหนดเอง" type="number" min={0} max={5} step="0.1" disabled={readOnly} value={input.excavation.slope} onChange={e=>set('excavation.slope',Math.max(0,Math.min(5,Number(e.target.value)||0)))}/></label></div></div>
     <table className="subbase-table"><thead><tr><th>ชั้นใต้ฐาน (บน → ล่าง)</th><th>หนา (mm)</th><th>ยื่นจากขอบฐาน (mm)</th><th className="num">ต่อ 1 ฐาน</th></tr></thead><tbody>
      <tr><td>Lean concrete <small className="muted">(หนา 0 = ไม่มี)</small></td><td>{cell('lean.thickness')}</td><td>{cell('lean.projection')}</td><td className="num">{q?`${number(q.lean)} m³`:'—'}</td></tr>
      <tr><td>{check('แผ่นพลาสติก','subbase.sheet.enabled')}</td><td>—</td><td className="muted">เท่าพื้นที่ Lean</td><td className="num">{q&&input.subbase.sheet.enabled?`${number(q.sheet)} m²`:'—'}</td></tr>
      <tr><td>{check('ทรายรองพื้น','subbase.sand.enabled')}</td><td>{input.subbase.sand.enabled?cell('subbase.sand.thickness'):'—'}</td><td>{input.subbase.sand.enabled?cell('subbase.sand.projection'):'—'}</td><td className="num">{q&&input.subbase.sand.enabled?`${number(q.sand)} m³`:'—'}</td></tr>
      <tr><td>{check('บดอัดดินก้นหลุม','subbase.compaction.enabled')}</td><td>—</td><td className="muted">เต็มก้นหลุม</td><td className="num">{q&&input.subbase.compaction.enabled?`${number(q.compaction)} m²`:'—'}</td></tr>
     </tbody></table>
     {q&&<p className="muted">ขุด {number(q.excavation)} m³ · ถมกลับ {number(q.backfill)} m³ (= ขุด − Lean{earth.sand?' − ทราย':''} − คอนกรีตใต้ดิน) · ต่อ 1 ฐาน</p>}
    </div><FootingEarthworkSketch input={input}/></div>;})()}
   <FootingPourEditor input={input} readOnly={readOnly} stages={preview&&!('error' in preview)?preview.q.pourStages:undefined} edit={f=>setInput(prev=>{if(prev?.category!=='Foundation')return prev;const next=structuredClone(prev);f(next);return next;})}/></>}
  {input.category==='Column'&&<ColumnTemplateBar input={input} spec={spec} readOnly={readOnly} onPick={()=>setPicker(true)} onUnlink={()=>setInput(prev=>prev?.category==='Column'&&prev.template?{...prev,template:{...prev.template,linked:false}}:prev)}/>}
  {picker&&input.category==='Column'&&<ColumnTemplatePicker spec={spec} input={input} onApply={next=>setInput(next)} onClose={()=>setPicker(false)}/>}
  {input.category==='Column'&&<div className="segmented beam-layout" role="group" aria-label="รูปแบบเสา">{([['single','เสาชั้นเดียว'],['stack','เสาหลายชั้น · ตารางเสา (Coupler / ปลอกตาม H)']] as const).map(([v,t])=><button key={v} type="button" disabled={readOnly} className={input.layout===v?'active':''} onClick={()=>setInput(prev=>prev?.category!=='Column'?prev:v==='stack'?columnStackFrom(prev):{...prev,layout:'single'})}>{t}</button>)}</div>}
  {input.category==='Column'&&input.layout==='stack'&&<ColumnStackEditor input={input} readOnly={readOnly} edit={f=>setInput(prev=>{if(prev?.category!=='Column')return prev;const next=structuredClone(prev);f(next);return next;})}/>}
  {input.category==='Column'&&input.layout!=='stack'&&<><div className="form-grid"><label className="field full"><span>หน้าตัดพิเศษ (ตัวอย่างจากแบบ) · เติมขนาด เหล็กยืน และเหล็กปลอก</span><select disabled={readOnly} value="" onChange={e=>{const id=e.target.value;if(id)setInput(prev=>prev?.category==='Column'?applyColumnPreset(prev,id):prev);}}><option value="">— เลือกหน้าตัดพิเศษ —</option>{columnPresets.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
   <label className="field"><span>รูปร่างหน้าตัด</span><select disabled={readOnly} value={input.shape} onChange={e=>set('shape',e.target.value)}><option value="rect">สี่เหลี่ยม</option><option value="circle">วงกลม</option></select></label>
   {input.shape==='rect'?<>{num('กว้าง X','width')}{num('ลึก Y','depth')}</>:num('เส้นผ่านศูนย์กลาง','diameter')}{num('ความสูงเสา','height')}</div><HeightFromLevels what="เสา" readOnly={readOnly} onUse={h=>set('height',h)}/>
   <ColumnPourFields input={input} readOnly={readOnly} edit={f=>setInput(prev=>{if(prev?.category!=='Column')return prev;const next=structuredClone(prev);next.pour??={...DEFAULT_COLUMN_POUR};f(next);return next;})}/></>}
  {input.category==='Beam'&&<>
   <div className="segmented beam-layout" role="group" aria-label="รูปแบบคาน">{([['single','คานช่วงเดียว'],['group','กลุ่มคาน · หลายช่วง / คานยื่น / กริด']] as const).map(([v,t])=><button key={v} type="button" disabled={readOnly} className={input.layout===v?'active':''} onClick={()=>setInput(prev=>prev?.category!=='Beam'?prev:v==='group'?beamGroupFrom(prev):{...prev,layout:'single'})}>{t}</button>)}</div>
   {input.layout==='group'?<BeamGroupEditor input={input} projectId={project.id} readOnly={readOnly} selected={Math.min(beamSel,Math.max(0,input.spans.length-1))} onSelect={setBeamSel} edit={f=>setInput(prev=>{if(prev?.category!=='Beam')return prev;const next=structuredClone(prev);f(next);return next;})}/>
    :<div className="form-grid">{num('กว้าง b','width')}{num('ลึก h','depth')}{num('ความยาวคาน','length')}</div>}
   {groundFields('คาน')}</>}
  {input.category==='Slab'&&<><div className="form-grid">{num('ยาว X','lengthX')}{num('กว้าง Y','lengthY')}{num('ความหนาพื้น','thickness')}</div>{groundFields('พื้น')}</>}
  {input.category==='Wall'&&<div className="form-grid">{num('ความยาวผนัง','length')}{num('ความหนาผนัง','thickness')}{num('ความสูงผนัง','height')}</div>}
  {input.category==='Wall'&&<HeightFromLevels what="ผนัง" readOnly={readOnly} onUse={h=>set('height',h)}/>}

  <SiteItemsEditor items={items} onChange={setItems} readOnly={readOnly}/>

  <h4>2. จำนวนและตำแหน่ง (จำเป็น) · รวม {qty} ชิ้น</h4>
  <div className="table-scroll"><table className="occurrence-table"><thead><tr><th>Zone</th><th>ชั้น</th><th>Grid</th><th className="num">จำนวน</th><th/></tr></thead><tbody>{occurrences.map(o=><tr key={o.id}>{(['zone','floor','grid'] as const).map(k=><td key={k}><input aria-label={k} disabled={readOnly} value={o[k]} onChange={e=>setOccurrences(occurrences.map(n=>n.id===o.id?{...n,[k]:e.target.value}:n))}/></td>)}<td><NumInput aria-label="จำนวน" disabled={readOnly} type="number" min={1} value={o.quantity} onChange={e=>setOccurrences(occurrences.map(n=>n.id===o.id?{...n,quantity:Math.max(1,Math.trunc(Number(e.target.value)||1))}:n))}/></td><td><button disabled={readOnly||occurrences.length===1} onClick={()=>setOccurrences(occurrences.filter(n=>n.id!==o.id))}>ลบ</button></td></tr>)}</tbody></table></div>
  <button disabled={readOnly} onClick={()=>setOccurrences([...occurrences,{id:crypto.randomUUID(),zone:'',floor:'',grid:'',quantity:1}])}>เพิ่มตำแหน่ง</button>

  <h4>3. ระยะหุ้มคอนกรีต Cover</h4>
  <div className="form-grid">{input.category==='Foundation'&&<>{num('ด้านล่าง','cover.bottom')}{num('ด้านบน','cover.top')}{num('ด้านข้าง','cover.side')}</>}
   {input.category==='Column'&&num('รอบหน้าตัด','cover.side')}
   {input.category==='Beam'&&<>{num('ด้านบน','cover.top')}{num('ด้านล่าง','cover.bottom')}{num('ด้านข้าง/ปลาย','cover.side')}</>}
   {input.category==='Slab'&&<>{num('ด้านบน','cover.top')}{num('ด้านล่าง','cover.bottom')}{num('ขอบพื้น','cover.edge')}</>}
   {input.category==='Wall'&&<>{num('ผิวผนัง','cover.face')}{num('ขอบ/บน-ล่าง','cover.edge')}</>}</div>

  <h4>4. เหล็กเสริม</h4>
  {input.category==='Foundation'&&<><div className="footing-slab">{check('ฐานหล่อเป็นเนื้อเดียวกับพื้น (ผิวบนฐาน = ผิวบนพื้น · ไม่แสดงเหล็กพื้น)','slab.enabled')}
    {input.slab.enabled&&<><div className="form-grid">{num('ความหนาพื้น (อ้างอิง)','slab.thickness')}{num('เหล็กบนยื่นเข้าพื้น จากขอบฐาน','slab.extend')}</div>
     <p className="muted">พื้นแสดงเป็นพื้นที่อ้างอิงรอบฐาน (ไม่คิดคอนกรีต/เหล็กพื้น) · เหล็กบนทั้งสองทิศยื่นเข้าพื้นตามระยะที่กำหนด · หักแบบหล่อผิวข้างฐานช่วงความหนาพื้น · รองรับแปลนสี่เหลี่ยม</p></>}</div>
   {mesh('เหล็กล่างทิศ X','rebar.bottomX')}{mesh('เหล็กล่างทิศ Y','rebar.bottomY')}{mesh('เหล็กบนทิศ X','rebar.topX',true)}{mesh('เหล็กบนทิศ Y','rebar.topY',true)}
   <div className="mesh-layer">{check('มีเหล็กรอบข้าง (LOOPS · ปลอกแนวนอนรอบผิวข้างฐาน)','rebar.side.enabled')}{input.rebar.side.enabled&&spacing('เหล็กรอบข้าง (เรียงตามความลึก)','rebar.side')}
    {input.rebar.side.enabled&&input.pour.count>1&&(()=>{const st=footingPour(input).stages.filter(s=>s.z0<input.thickness),on=(n:number)=>!input.rebar.side.stages.length||input.rebar.side.stages.includes(n);
     const toggle=(n:number,v:boolean)=>setInput(prev=>{if(prev?.category!=='Foundation')return prev;const all=footingPour(prev).stages.map(s=>s.stage),cur=prev.rebar.side.stages.length?prev.rebar.side.stages:all,next=v?[...new Set([...cur,n])].sort((a,b)=>a-b):cur.filter(x=>x!==n);
      return {...prev,rebar:{...prev.rebar,side:{...prev.rebar.side,stages:next.length===all.length?[]:next}}};});
     return <div className="field loop-stages"><span>ใส่เหล็กรอบข้างใน Stage</span><div className="joint-end-row">{st.map(s=><label key={s.stage} className="check"><input type="checkbox" disabled={readOnly||on(s.stage)&&st.filter(x=>on(x.stage)).length===1} checked={on(s.stage)} onChange={e=>toggle(s.stage,e.target.checked)}/>Stage {s.stage} <small className="muted">({Math.round(s.z0)}–{Math.round(Math.min(s.z1,input.thickness))})</small></label>)}
      <button type="button" disabled={readOnly} onClick={()=>setInput(prev=>prev?.category!=='Foundation'?prev:{...prev,rebar:{...prev.rebar,side:{...prev.rebar.side,stages:[1]}}})}>Stage 1 อย่างเดียว</button></div>
</div>;})()}</div>
   <div className="mesh-layer">{check('มีเหล็กแนวตั้งผิวข้าง (รอบฐาน · ชั้นนอกสุด)','rebar.sideBars.enabled')}{input.rebar.sideBars.enabled&&<div className="form-grid">{dia('เหล็กแนวตั้งผิวข้าง · ขนาด','rebar.sideBars.diameter')}{num('เหล็กแนวตั้งผิวข้าง · ระยะห่าง @','rebar.sideBars.spacing')}
    {select('ปลายบน','rebar.sideBars.top',[['inward','งอฉากเข้าใน (ใต้เหล็กบน)'],['straight','ปลายตรง']])}{select('ปลายล่าง','rebar.sideBars.bottom',[['straight','ปลายตรง (ที่ cover ล่าง)'],['inward','งอฉากเข้าใน (เหนือเหล็กล่าง)']])}
    {(input.rebar.sideBars.top==='inward'||input.rebar.sideBars.bottom==='inward')&&num(`ระยะงอเข้าใน (0 = 15d = ${15*input.rebar.sideBars.diameter})`,'rebar.sideBars.leg')}</div>}</div>
   <p className="muted">เหล็กล่างงอ/ขอขึ้น · เหล็กบนงอ/ขอลง · ขางอถูกจำกัดไม่ให้เกินความหนาฐาน − cover · ถ้าขอ 180° ไม่พอดีความหนา ปลายนั้นจะเป็นปลายตรง</p>
   <h4>5. เสาตอม่อ / Starter bar</h4>
   {select('มีเสาร่วมกับฐานรากหรือไม่','column.type',[['none','ไม่มี'],['pedestal','มีเสาตอม่อ (คอนกรีต + เหล็กเสา)'],['starter','Starter bar (เหล็กรอเสา ไม่มีคอนกรีตตอม่อ)']])}
   {input.column.type!=='none'&&(()=>{
    const cols=footingColumns(input),n=cols.length,ext=footingExtent(input),sel=Math.min(colSel,n-1),ped=input.column.type==='pedestal',kind=ped?'เสาตอม่อ':'Starter bar';
    const fields={num,dia,select,spacing,bend,text:(label:string,path:string)=><Field key={path} label={label} value={get(path)} onChange={v=>set(path,String(v).slice(0,50))} disabled={readOnly}/>};
    const edit=(f:(i:FoundationInput)=>void)=>setInput(prev=>{if(prev?.category!=='Foundation')return prev;const next=structuredClone(prev);f(next);return next;});
    const place=(i:FoundationInput,pos:[number,number][])=>{[i.column,...i.extraColumns].forEach((c,k)=>{if(pos[k]){c.offsetX=pos[k][0];c.offsetY=pos[k][1];}});};
    const setCount=(count:number)=>edit(i=>{const pos=columnLayout('row-x',count,ext.w,ext.d),was=i.extraColumns.length;
     i.extraColumns=Array.from({length:count-1},(_,k)=>i.extraColumns[k]||{...structuredClone(i.column),columnNo:`C${k+2}`,offsetX:pos[k+1][0],offsetY:pos[k+1][1],linked:true});
     if(!was&&count>1){if(!i.column.columnNo)i.column.columnNo='C1';place(i,pos);}if(count===1){i.column.offsetX=0;i.column.offsetY=0;}setColSel(0);});
    const link=(k:number,on:boolean)=>edit(i=>{const c=i.extraColumns[k];i.extraColumns[k]=on?{...c,linked:true}:{...structuredClone(i.column),columnNo:c.columnNo,offsetX:c.offsetX,offsetY:c.offsetY,linked:false};});
    const off=(k:number,axis:'offsetX'|'offsetY',v:number)=>edit(i=>{(k?i.extraColumns[k-1]:i.column)[axis]=Math.round(v)||0;});
    return <div className="footing-columns">
     <div className="columns-toolbar"><label className="field"><span>จำนวน{kind}บนฐานนี้</span><select disabled={readOnly} value={n} onChange={e=>setCount(Number(e.target.value))}>{Array.from({length:10},(_,k)=><option key={k} value={k+1}>{k+1} ต้น</option>)}</select></label>
      {n>1&&<div className="field"><span>จัดตำแหน่งสำเร็จรูป</span><div className="segmented" role="group" aria-label="รูปแบบการวางเสา">{columnLayouts.filter(([id])=>id==='triangle'?n===3:id==='corners'?n===4:id==='grid'?n>=4:true).map(([id,t])=><button key={id} type="button" disabled={readOnly} onClick={()=>edit(i=>place(i,columnLayout(id,n,ext.w,ext.d)))}>{t}</button>)}</div></div>}</div>
     <div className={`columns-layout${n>1?'':' single'}`}><FootingColumnsPlan input={input} selected={sel} onSelect={setColSel} readOnly={readOnly} onMove={(k,x,y)=>edit(i=>{const c=k?i.extraColumns[k-1]:i.column;c.offsetX=x;c.offsetY=y;})}/>
      {n>1&&<table className="subbase-table columns-table"><thead><tr><th>เสา</th><th>เหมือน C1</th><th>หน้าตัด</th><th>เยื้อง X</th><th>เยื้อง Y</th>{ped&&<th>สูง</th>}</tr></thead><tbody>
       {cols.map((c,k)=>{const x=k?input.extraColumns[k-1]:undefined,{w,d}=columnExtent(c);return <tr key={k} className={k===sel?'active':''} onClick={()=>setColSel(k)}>
        <td><input aria-label={`เลขเสา ${k+1}`} disabled={readOnly} maxLength={50} value={(k?x!.columnNo:input.column.columnNo)} onChange={e=>edit(i=>{(k?i.extraColumns[k-1]:i.column).columnNo=e.target.value.slice(0,50);})}/></td>
        <td>{k?<input type="checkbox" aria-label={`เสา ${k+1} เหมือน C1`} disabled={readOnly} checked={x!.linked} onChange={e=>link(k-1,e.target.checked)}/>:<small className="muted">ต้นแบบ</small>}</td>
        <td><small>{c.shape==='circle'?`Ø${c.diameter}`:`${w}×${d}`}</small></td>
        <td><NumInput aria-label={`เยื้อง X เสา ${k+1}`} type="number" step={25} disabled={readOnly} value={c.offsetX} onChange={e=>off(k,'offsetX',Number(e.target.value))}/></td>
        <td><NumInput aria-label={`เยื้อง Y เสา ${k+1}`} type="number" step={25} disabled={readOnly} value={c.offsetY} onChange={e=>off(k,'offsetY',Number(e.target.value))}/></td>
        {ped&&<td><small>{c.height}</small></td>}</tr>;})}</tbody></table>}</div>
     {n>1&&<h5 className="column-detail-title">รายละเอียด {sel===0?`${input.column.columnNo||'C1'} (ต้นแบบของเสาที่ติ๊ก “เหมือน C1”)`:footingColumnName(cols[sel],sel,true)}</h5>}
     {sel===0?<FootingColumnFields col={input.column} pedestal={ped} field={fields}/>
      :input.extraColumns[sel-1].linked?<p className="notice">ใช้หน้าตัด เหล็กยืน เหล็กปลอก และความสูงเดียวกับ C1 · เอาติ๊ก “เหมือน C1” ออกเพื่อกำหนดเอง</p>
      :<FootingColumnFields col={cols[sel]} pedestal={ped} field={fields} base={`extraColumns.${sel-1}`}/>}
    </div>;})()}</>}
  {input.category==='Column'&&input.layout==='stack'&&<p className="muted">เสาหลายชั้น: เหล็กยืนและปลอกกำหนดต่อชั้นในตารางเสาด้านบน</p>}
  {input.category==='Column'&&input.layout!=='stack'&&<>{input.shape==='circle'?count('เหล็กยืน','rebar.main'):<ColumnMainFields input={input} dia={dia} int={(label,path,unit='เส้น')=><Field key={path} label={`${label} (${unit})`} type="number" value={get(path)} onChange={v=>set(path,Math.max(0,Math.min(200,Math.trunc(Number(v)||0))))} disabled={readOnly}/>} select={select}/>}
   <h4>End condition เหล็กยืน</h4>
   {([['bottom','ปลายล่าง (Bottom Col)'],['top','ปลายบน (Top Col)']] as const).map(([end,label])=>{const e=input.rebar[end],std=Math.round(lapLength(input.detailing,columnMainMax(input)));return <div className="form-grid rebar-row" key={end}>
    {select(label,`rebar.${end}.mode`,[['none',end==='bottom'?'ไม่มี (เริ่มที่ขอบล่างเสา)':'ไม่มี (ตัดที่ cover)'],['lap','Lap splice length (ทาบตรง)'],['crank','Crank 1:6 + ทาบ'],['coupler',end==='top'?'Coupler (ข้อต่อทางกล) · คิดใน BOQ':'Coupler (ต่อจาก Coupler ของชิ้นล่าง)']])}
    {e.mode==='coupler'?num('ระดับ Coupler เหนือรอยต่อ (0 = ที่รอยต่อ)',`rebar.${end}.lap`):e.mode!=='none'&&num(`ระยะทาบ (0 = ${input.detailing.lapTable?'ตาม Spec':`${input.detailing.lap}d`} = ${std})`,`rebar.${end}.lap`)}</div>;})}
   <p className="muted">ปลายบนต่อขึ้นเหนือระดับบนเสา · ปลายล่างต่อลงใต้ระดับล่างเสา · Crank เริ่ม Slope ที่ระดับปลายเสา ดัดเยื้องเข้า 1 × Ø ความชัน 1:6 (ยาวดัด 6Ø) แล้วต่อระยะทาบ · Coupler: เหล็กตัดพอดีที่ Coupler · นับ Coupler ปลายบน 1 ตัว/เส้นใน BOQ (Coupler ปลายล่างนับกับชิ้นล่าง)</p>
   <h4>เหล็กปลอก · 2 ชุด × 3 โซน</h4>
   <ColumnTieEditor input={input} readOnly={readOnly} set={set} num={num} dia={dia}/></>}
  {input.category==='Beam'&&input.layout==='group'&&<p className="muted">กลุ่มคาน: เหล็กบน / ล่าง / ปลอก กำหนดต่อช่วงในตารางด้านบน · เหล็กเสริมบนกำหนดที่กริด</p>}
  {input.category==='Beam'&&input.layout!=='group'&&<>{shapedCount('เหล็กบน','rebar.top')}{shapedCount('เหล็กล่าง','rebar.bottom')}{spacing('เหล็กปลอก','rebar.stirrup')}<p className="muted">เหล็กบนงอ/ขอลง · เหล็กล่างงอ/ขอขึ้น · ปลายอยู่ที่ cover ปลายคาน</p></>}
  {input.category==='Slab'&&<>{mesh('เหล็กล่างทิศ X','rebar.bottomX')}{mesh('เหล็กล่างทิศ Y','rebar.bottomY')}{mesh('เหล็กบนทิศ X','rebar.topX',true)}{mesh('เหล็กบนทิศ Y','rebar.topY',true)}<p className="muted">เหล็กล่างงอ/ขอขึ้น · เหล็กบนงอ/ขอลง · จำกัดตามความหนาพื้น − cover</p></>}
  {input.category==='Wall'&&<><label className="field"><span>จำนวนชั้นเหล็ก</span><select disabled={readOnly} value={input.rebar.layers} onChange={e=>set('rebar.layers',Number(e.target.value))}><option value={1}>1 ชั้น (กึ่งกลาง)</option><option value={2}>2 ชั้น (สองผิว)</option></select></label>{mesh('เหล็กแนวตั้ง','rebar.vertical')}{mesh('เหล็กแนวนอน','rebar.horizontal')}{check('รวมระยะทาบเหล็กแนวตั้ง','rebar.lap')}<p className="muted">งอ/ขอปลายเหล็กหันเข้าหาผิวผนังอีกด้าน · จำกัดตามความหนาผนัง − cover</p></>}

  <details className="detailing-defaults"><summary>มาตรฐานงอขอ / ระยะทาบ (กำหนดไว้เบื้องต้น)</summary>
   <div className="form-grid"><Field label="เกรดเหล็กหลัก" value={input.detailing.mainGrade} onChange={v=>set('detailing.mainGrade',v)} disabled={readOnly}/><Field label="เกรดเหล็กปลอก" value={input.detailing.tieGrade} onChange={v=>set('detailing.tieGrade',v)} disabled={readOnly}/>
    {num('รัศมีดัดใน Ø ≤ 16 (×d)','detailing.bendSmall','')}{num('รัศมีดัดใน Ø ≥ 20 (×d)','detailing.bendLarge','')}{num('รัศมีดัดในปลอก (×d)','detailing.tieBend','')}{num('ขอ 90° / ปลอกงอฉาก ส่วนตรงปลาย (×d)','detailing.hook90','')}{num('ขอปลอกวงกลม 135° ส่วนตรงปลาย (×d)','detailing.hook135','')}{num('ขอปลอกวงกลม 135° อย่างน้อย','detailing.hook135Min')}{num(input.detailing.lapTable?'ระยะทาบ (×d) · ใช้กับขนาดที่ไม่มีในตาราง Spec':'ระยะทาบ (×d)','detailing.lap','')}{num('ความยาวเหล็กเส้น','detailing.stockLength')}</div>
   {input.detailing.lapTable&&<p className="spec-lap-table">ระยะทาบตาม Spec ({input.detailing.specRef}): {input.detailing.lapTable.map(r=>`${barName(r.bar)} = ${r.length}`).join(' · ')} mm <button type="button" disabled={readOnly} onClick={()=>set('detailing',detailingFromSpec(project.spec,input.detailing))}>ดึงค่าจาก Spec โครงการอีกครั้ง</button></p>}
   {!input.detailing.lapTable&&<p><button type="button" disabled={readOnly} onClick={()=>set('detailing',detailingFromSpec(project.spec,input.detailing))}>ใช้ค่าจาก Spec โครงการ ({specLabel(project.spec)})</button></p>}
   <p className="muted">ค่าเริ่มต้น: รัศมีดัดขั้นต่ำ BS 8666:2000 Table 2 (2d / 3.5d) · ขอมาตรฐาน ACI 318 (90° = 12d ใช้กับปลอกสี่เหลี่ยมงอฉากอ้อมเหล็กมุม, ปลอกวงกลม 135° = 6d ≥ 75 mm) · ทาบ 40d · ปัดยาวตัดขึ้นทีละ {spec.rounding} mm ตาม General Spec</p></details>

  {problems.length>0&&<div className="notice warning"><b>ข้อมูลที่ยังขาด ({problems.length})</b>{'\n'}{problems.join('\n')}</div>}
  {preview&&'error' in preview&&<div className="notice danger">{preview.error}</div>}
  {preview&&!('error' in preview)&&<>
   <h4>ผลคำนวณ (พรีวิวก่อนใช้)</h4>
   <div className="kpis compact">{[['คอนกรีต',preview.q.concrete,'m³'],['แบบหล่อ',preview.q.formwork,'m²'],...(m.category==='Foundation'?[['งานขุด',preview.q.excavation,'m³'],['ถมกลับ',preview.q.backfill,'m³'],['Lean concrete',preview.q.lean,'m³']]:preview.q.lean>0?[['Lean concrete',preview.q.lean,'m³']]:[]),...siteKinds.filter(k=>preview.q[k]>0).map(k=>[siteLabels[k],preview.q[k],siteUnits[k]]),['เหล็กรวม',preview.q.rebar,'kg']].map(([l,v,u])=><div key={l as string}><small>{l}</small><strong>{number((v as number)*qty)} <em>{u}</em></strong><span>ต่อชิ้น {number(v as number)} {u} × {qty}</span></div>)}</div>
   {input.category==='Foundation'&&input.foundationType==='pile'&&(()=>{const p=pileQuantities(input);return <p className="pile-boq"><b>งานเสาเข็ม</b> {number(p.count*qty,0)} ต้น · {number(p.totalLength*qty,2)} m <b>งานตัดหัวเข็ม</b> {number(p.cutCount*qty,0)} ต้น · {number(p.totalCutLength*qty,2)} m <span className="muted">(ต่อฐาน {p.count} ต้น × {qty} ฐาน)</span></p>;})()}
   {sizes.length>0&&<p className="muted">เหล็กแยกขนาด (รวม {qty} ชิ้น): {sizes.map(([d,w])=>`${d<=9?'RB':'DB'}${d} = ${number(w*qty,2)} kg`).join(' · ')}</p>}
   <div className="table-scroll"><table><thead><tr><th>Mark</th><th>ตำแหน่ง</th><th>Ø / เกรด</th><th>Shape</th><th className="num">ยาวตัด mm</th><th className="num">ต่อชิ้น</th><th className="num">รวมเส้น</th><th className="num">รวม kg</th></tr></thead><tbody>{preview.q.rows.map(r=><tr key={r.id}><td>{r.mark}{!isGeneratedBar(r)&&<small className="block">เพิ่มเอง</small>}</td><td>{r.note}</td><td>{r.diameter} / {r.grade}</td><td>{r.shapeCode}</td><td className="num">{number(r.cutLength,0)}</td><td className="num">{r.count}</td><td className="num">{r.count*qty}</td><td className="num">{number(r.weight*qty,2)}</td></tr>)}</tbody></table></div>
   {preview.warnings.length>0&&<div className="notice warning">{preview.warnings.join('\n')}</div>}
   {preview.errors.length>0&&<div className="notice danger">{preview.errors.slice(0,6).join('\n')}</div>}
  </>}
  <footer className="actions element-input-actions">
   <button className="primary" disabled={readOnly||!preview||'error' in preview||preview.errors.length>0} onClick={()=>apply(true)}>ใช้ข้อมูลและสร้าง Bar cut list</button>
   <button disabled={readOnly||!preview||'error' in preview} onClick={()=>apply(false)}>ใช้เฉพาะมิติ/จำนวน (คงเหล็กเดิม)</button>
   <span className="muted">หลังใช้ข้อมูล: ตรวจตำแหน่งเหล็กในแท็บ “แบบ & BBS” แล้วกดบันทึกสมาชิก · แก้ไข Mark รายตัวได้</span>
  </footer>
  </div><aside className="element-input-graphic">{preview&&!('error' in preview)?<ElementGraphic member={preview.member} rows={preview.q.rows} input={input}/>:<div className="notice">รูปแปลน / รูปตัดจะแสดงเมื่อกรอกข้อมูลจำเป็นครบ{problems.length?` (ขาด ${problems.length} รายการ)`:''}</div>}</aside></div>
 </section>;
}

/** Schematic of a straight-run BS 8666 shape (run along the bottom, ends turning up). */
export function ShapeIcon({code}:{code:string}){
 const ends=(layerShapes.find(s=>s.code===code)||layerShapes[0]).ends;
 const start={straight:'M10 30',bend:'M10 8 L10 30',hook:'M34 14 L18 14 A8 8 0 0 0 18 30',return:'M30 4 L10 4 L10 30'}[ends[0]];
 const end={straight:'L110 30',bend:'L110 30 L110 8',hook:'L102 30 A8 8 0 0 0 102 14 L86 14',return:'L110 30 L110 4 L90 4'}[ends[1]];
 return <svg className="shape-icon" viewBox="0 0 120 38" width={120} height={38} role="img" aria-label={`Shape ${code}`}><path d={`${start} ${end}`} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

/** Column main bars: corner bundles + bars per X / Y face, evenly spaced (equal on opposite faces). */
function ColumnMainFields({input,dia,int:num,select}:{input:ColumnInput;dia:(label:string,path:string)=>ReactNode;int:(label:string,path:string,unit?:string)=>ReactNode;select:(label:string,path:string,options:[string,string][],numeric?:boolean)=>ReactNode}){
 const m=input.rebar.main,bars=input.width>0&&input.depth>0?columnInputBars(input):[],name=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
 const clear=(kind:'sideX'|'sideY')=>{const face=bars.filter(b=>b.kind===kind&&(kind==='sideX'?b.y<input.depth/2:b.x<input.width/2)).map(b=>kind==='sideX'?b.x:b.y).sort((a,b)=>a-b);return face.length>1?Math.round(face[1]-face[0]-m[kind].diameter):undefined;};
 const cx=clear('sideX'),cy=clear('sideY');
 return <>
  <div className="form-grid rebar-group"><span className="rebar-group-title">เหล็กมุม (4 มุม)</span>{dia('ขนาด','rebar.main.corner.diameter')}{select('จำนวนต่อมุม','rebar.main.corner.count',[['1','1 เส้น'],['2','2 เส้น (มัดคู่)'],['3','3 เส้น (มัด 3)']],true)}</div>
  <div className="form-grid rebar-group"><span className="rebar-group-title">เหล็กด้าน X (ด้านล่าง/บน)</span>{dia('ขนาด','rebar.main.sideX.diameter')}{num('จำนวนต่อด้าน (ไม่รวมมุม)','rebar.main.sideX.count','เส้น')}</div>
  <div className="form-grid rebar-group"><span className="rebar-group-title">เหล็กด้าน Y (ด้านซ้าย/ขวา)</span>{dia('ขนาด','rebar.main.sideY.diameter')}{num('จำนวนต่อด้าน (ไม่รวมมุม)','rebar.main.sideY.count','เส้น')}</div>
  <p className="muted column-total">รวม {bars.length} เส้น · มุม 4 × {m.corner.count} = {4*m.corner.count} เส้น {name(m.corner.diameter)} · ด้าน X 2 × {m.sideX.count} เส้น {name(m.sideX.diameter)}{cx!==undefined?` (ช่องว่าง ≈ ${cx} mm)`:''} · ด้าน Y 2 × {m.sideY.count} เส้น {name(m.sideY.diameter)}{cy!==undefined?` (ช่องว่าง ≈ ${cy} mm)`:''} · เหล็กด้านเรียงระยะเท่ากันระหว่างเหล็กมุม</p>
 </>;
}

/** Column pour: one stage or two (construction joint below the beam framing in at the top) with the levels of both stages. */
function ColumnPourFields({input,readOnly,edit}:{input:ColumnInput;readOnly:boolean;edit:(f:(i:ColumnInput)=>void)=>void}){
 const p=input.pour??DEFAULT_COLUMN_POUR,cp=columnPour(input),lv=(v:number)=>v.toFixed(3),two=p.stages===2;
 const level=(label:string,value:number,onUse:(v:number)=>void)=><Field label={label} type="number" step="0.001" value={Number(value.toFixed(3))} onChange={v=>{const n=Number(v);if(Number.isFinite(n))onUse(n);}} disabled={readOnly}/>;
 return <div className="column-pour"><h5>การเทคอนกรีตเสา</h5>
  <div className="segmented" role="group" aria-label="จำนวน Stage การเท">{([[1,'เทครั้งเดียว'],[2,'2 Stage · เทใต้ท้องคานที่มาชนด้านบน']] as const).map(([v,t])=><button key={v} type="button" disabled={readOnly} className={p.stages===v?'active':''} onClick={()=>edit(i=>{i.pour.stages=v;})}>{t}</button>)}</div>
  {two&&<><div className="form-grid">
   {level('ระดับล่างเสา B.O.C. (m) · เริ่ม Stage 1',p.bottom,v=>edit(i=>{if(i.pour.mode==='level')i.pour.joint+=v-i.pour.bottom;i.pour.bottom=v;}))}
   <label className="field"><span>กำหนดระดับรอยต่อ (C.J.)</span><select disabled={readOnly} value={p.mode} onChange={e=>edit(i=>{const m=e.target.value as 'beam'|'level';if(m==='level')i.pour.joint=Number(columnPour(i).joint.toFixed(3));else i.pour.beam=Math.max(0,Math.round(i.height-columnPour(i).z));i.pour.mode=m;})}><option value="beam">ใต้ท้องคาน (ระดับบน − ความลึกคาน)</option><option value="level">ระบุระดับเอง</option></select></label>
   {p.mode==='beam'?<Field label="ความลึกคานที่มาชนเสาด้านบน (mm)" type="number" value={p.beam} onChange={v=>{const n=Number(v);if(Number.isFinite(n)&&n>=0)edit(i=>{i.pour.beam=n;});}} disabled={readOnly}/>
    :level('ระดับรอยต่อ C.J. (m) · จบ Stage 1 / เริ่ม Stage 2',p.joint,v=>edit(i=>{i.pour.joint=v;}))}
   {level('ระดับบนเสา T.O.C. (m) · จบ Stage 2',cp.top,v=>edit(i=>{const h=Math.round((v-i.pour.bottom)*1000);if(h>0)i.height=h;}))}</div>
   <table className="subbase-table"><thead><tr><th>Stage</th><th>ระดับล่าง (m)</th><th>ระดับบน (m)</th><th>สูง (mm)</th></tr></thead><tbody>
    <tr><td>Stage 1 · เทถึงใต้ท้องคาน</td><td>{lv(cp.bottom)}</td><td>{lv(cp.joint)}</td><td>{Math.round(cp.z)}</td></tr>
    <tr><td>Stage 2 · เทพร้อมคาน / ส่วนบน</td><td>{lv(cp.joint)}</td><td>{lv(cp.top)}</td><td>{Math.round(input.height-cp.z)}</td></tr></tbody></table>
   {!cp.on&&<p className="notice warning">ระดับรอยต่อต้องอยู่ระหว่างระดับล่างและระดับบนของเสา</p>}
   <p className="muted">คิดคอนกรีต / แบบหล่อแยกตาม Stage และพื้นที่รอยต่อการเทใน BOQ · แสดงเส้นรอยต่อ ชื่อ Stage และระดับ B.O.C. / C.J. / T.O.C. ในรูปตัดและแบบ A3 · แก้ระดับบนจะเปลี่ยนความสูงเสา</p></>}
 </div>;
}
type Fields={num:(label:string,path:string,unit?:string)=>ReactNode;dia:(label:string,path:string)=>ReactNode;select:(label:string,path:string,options:[string,string][],numeric?:boolean)=>ReactNode;spacing:(label:string,path:string)=>ReactNode;bend:(label:string,path:string,d:number)=>ReactNode;text:(label:string,path:string)=>ReactNode};
function FootingColumnFields({col,pedestal,field:f,base:P='column'}:{col:FootingColumn;pedestal:boolean;field:Fields;base?:string}){
 const kind=pedestal?'เสาตอม่อ':'Starter bar',cpl=col.splice?.type==='coupler',corners={rect:4,circle:0,L:6,U:8}[col.shape],bars=columnSectionPreview(col).bars,by=(k:string)=>bars.filter(b=>b.kind===k).length,name=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
 return <div className="footing-column">
  <div className="form-grid">{f.text(pedestal?'Column no. (เลขเสา)':'Column no. (เสาที่รับ Starter)',`${P}.columnNo`)}{f.select(pedestal?'หน้าตัดเสา':'หน้าตัดการวาง Starter bar',`${P}.shape`,[['rect','สี่เหลี่ยม'],['circle','กลม'],['L','ตัวแอล (L)'],['U','ตัวยู (U)']])}{f.num(`cover ${kind}`,`${P}.cover`)}</div>
  <div className="footing-column-grid"><div>
   <div className="form-grid">{col.shape==='circle'?f.num('เส้นผ่านศูนย์กลาง',`${P}.diameter`):<>{f.num('กว้าง X (รวม)',`${P}.width`)}{f.num('ลึก Y (รวม)',`${P}.depth`)}</>}
    {col.shape==='L'&&<>{f.num('ความหนาขาแนว X',`${P}.armX`)}{f.num('ความหนาขาแนว Y',`${P}.armY`)}</>}
    {col.shape==='U'&&<>{f.num('ความหนาเอว (แนว X)',`${P}.armX`)}{f.num('ความหนาปีก (แนว Y)',`${P}.armY`)}</>}
    {f.num('ระยะเยื้องศูนย์ X (จากกึ่งกลางฐาน)',`${P}.offsetX`)}{f.num('ระยะเยื้องศูนย์ Y (จากกึ่งกลางฐาน)',`${P}.offsetY`)}
    {pedestal&&f.num('ความสูงเสาตอม่อ (เหนือฐาน)',`${P}.height`)}{f.num(cpl?`ระดับ Coupler เหนือ${pedestal?'ตอม่อ':'ฐาน'} (0 = ที่ผิวคอนกรีต)`:pedestal?'ระยะเหล็กโผล่เหนือตอม่อ (0 = ไม่โผล่)':'ระยะโผล่จากฐาน',`${P}.projection`)}</div>
   <div className="form-grid">{f.select('ปลายบนเหล็กยืน',`${P}.splice.type`,[['lap','ต่อทาบ / ปลายตรง'],['coupler','Coupler (ข้อต่อทางกล)']])}{cpl&&f.num('ระยะเหลื่อม Coupler ทีละครึ่ง (0 = ระดับเดียว)',`${P}.splice.stagger`)}</div>
   {cpl&&<p className="muted">Coupler {bars.length} ตัว ต่อเสา · คิดใน BOQ (ตัว) และแสดงในแบบ &amp; BBS</p>}
   <h5>เหล็กยืน{col.columnNo?` ${col.columnNo}`:''}</h5>
   {col.shape==='circle'?<div className="form-grid">{f.dia('ขนาดเหล็กยืน',`${P}.main.diameter`)}{f.num('จำนวนเหล็กรอบวง',`${P}.main.count`,'เส้น')}</div>:<>
    <div className="form-grid rebar-group"><span className="rebar-group-title">เหล็กมุม ({corners} มุม)</span>{f.dia('ขนาด',`${P}.main.corner.diameter`)}{f.select('จำนวนต่อมุม',`${P}.main.corner.count`,[['1','1 เส้น'],['2','2 เส้น (มัดคู่)'],['3','3 เส้น (มัด 3)']],true)}</div>
    <div className="form-grid rebar-group"><span className="rebar-group-title">เหล็กด้าน X</span>{f.dia('ขนาด',`${P}.main.sideX.diameter`)}{col.shape==='rect'?f.num('จำนวนต่อด้าน (ไม่รวมมุม)',`${P}.main.sideX.count`,'เส้น'):<span/>}</div>
    <div className="form-grid rebar-group"><span className="rebar-group-title">เหล็กด้าน Y</span>{f.dia('ขนาด',`${P}.main.sideY.diameter`)}{col.shape==='rect'?f.num('จำนวนต่อด้าน (ไม่รวมมุม)',`${P}.main.sideY.count`,'เส้น'):<span/>}</div>
    {col.shape!=='rect'&&<div className="form-grid">{f.num('ระยะห่างเหล็กด้านสูงสุด (ระหว่างมุม)',`${P}.main.spacing`)}</div>}</>}
   <p className="muted column-total">รวม {bars.length} เส้น{col.shape==='circle'?` · ${name(col.main.diameter)}`:` · มุม ${corners} × ${col.main.corner.count} = ${by('corner')} เส้น ${name(col.main.corner.diameter)} · ด้าน X ${by('sideX')} เส้น ${name(col.main.sideX.diameter)} · ด้าน Y ${by('sideY')} เส้น ${name(col.main.sideY.diameter)}`}</p>
   {pedestal&&f.spacing('เหล็กปลอกเสา',`${P}.tie`)}
   <h5>การฝังในฐานราก</h5>
   <div className="form-grid">{f.select('ระยะล้วงในฐาน',`${P}.embed.mode`,[['standard','ล้วงถึงตะแกรงเหล็กล่าง (มาตรฐาน)'],['custom','กำหนดระยะฝังเอง']])}{col.embed.mode==='custom'&&f.num('ระยะฝังจากผิวบนฐาน',`${P}.embed.depth`)}{f.bend('ปลายในฐาน','column',maxMainDiameter(col))}</div>
  </div><ColumnSectionSketch col={col}/></div>
 </div>;
}
/** Column section detail: outline, cover line, corner / side X / side Y bars and dimensions. */
function ColumnSectionSketch({col}:{col:FootingColumn}){
 const s=columnSectionPreview(col),size=220,pad=28,scale=s.w>0&&s.d>0?(size-2*pad)/Math.max(s.w,s.d):0;
 if(!scale)return null;
 const X=(x:number)=>pad+x*scale,Y=(y:number)=>size-pad-y*scale,c=col.cover;
 const coverLine=s.outline?s.outline.map(([x,y])=>[x,y] as [number,number]):undefined;
 return <figure className="column-sketch"><svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="หน้าตัดเสา">
  {s.outline?<polygon points={s.outline.map(([x,y])=>`${X(x)},${Y(y)}`).join(' ')} className="section"/>:<circle cx={X(s.w/2)} cy={Y(s.d/2)} r={s.w/2*scale} className="section"/>}
  {coverLine?<polygon points={insetPreview(coverLine,c).map(([x,y])=>`${X(x)},${Y(y)}`).join(' ')} className="cover"/>:<circle cx={X(s.w/2)} cy={Y(s.d/2)} r={Math.max(0,s.w/2-c)*scale} className="cover"/>}
  {s.bars.map((b,i)=><circle key={i} cx={X(b.x)} cy={Y(b.y)} r={Math.max(1.8,b.d/2*scale)} className={`bar ${b.kind}`}/>)}
  <line x1={X(0)} x2={X(s.w)} y1={size-10} y2={size-10} className="dim"/><text x={X(s.w/2)} y={size-13} textAnchor="middle" className="dim-text">{s.w}</text>
  <line x1={10} x2={10} y1={Y(0)} y2={Y(s.d)} className="dim"/><text x={13} y={Y(s.d/2)} className="dim-text">{s.d}</text>
 </svg><figcaption><span className="key corner"/>มุม <span className="key sideX"/>ด้าน X <span className="key sideY"/>ด้าน Y · เส้นประ = cover {c} mm</figcaption></figure>;
}
const insetPreview=(poly:[number,number][],c:number)=>poly.map((p,i)=>{const prev=poly[(i+poly.length-1)%poly.length],next=poly[(i+1)%poly.length],n=(a:[number,number],b:[number,number])=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [-dy/l,dx/l];},n1=n(prev,p),n2=n(p,next);return [p[0]+(n1[0]+n2[0])*c,p[1]+(n1[1]+n2[1])*c] as [number,number];});
function pileSummary(i:FoundationInput){
 const q=pileQuantities(i);
 return `${pileTypeLabels[q.type]} ${q.size} mm · ${q.count} ต้น × ${q.lengthEach} m = ${number(q.totalLength,2)} m ต่อฐาน · ตัดหัวเข็ม ${q.cutCount} ต้น × ${number(q.cutLengthEach,2)} m${i.pile.layout==='standard'&&[1,2,3,4,5,6,7,8,9].includes(i.pile.count)?' · รูปแบบมาตรฐาน':''}`;
}
/** Height from the bottom / top levels (m) shown on the drawings, e.g. top of footing −1.200 to beam soffit +3.500. */
function HeightFromLevels({what,readOnly,onUse}:{what:string;readOnly:boolean;onUse:(h:number)=>void}){
 const [bottom,setBottom]=useState(''),[top,setTop]=useState(''),h=Math.round((Number(top)-Number(bottom))*1000),ok=bottom!==''&&top!==''&&Number.isFinite(h)&&h>0;
 return <details className="height-levels"><summary>คำนวณความสูง{what}จากระดับในแบบ</summary><div className="form-grid">
  <label className="field"><span>ระดับล่าง (m) เช่น หลังฐาน</span><NumInput type="number" step="0.001" disabled={readOnly} value={bottom} onChange={e=>setBottom(e.target.value)}/></label>
  <label className="field"><span>ระดับบน (m) เช่น ท้องคาน / หลังพื้น</span><NumInput type="number" step="0.001" disabled={readOnly} value={top} onChange={e=>setTop(e.target.value)}/></label>
  <div className="field"><span>ความสูง</span><button type="button" disabled={readOnly||!ok} onClick={()=>onUse(h)}>{ok?`ใช้ ${h.toLocaleString()} mm`:'กรอกระดับให้ครบ'}</button></div></div></details>;
}

/** Project Column Template entry point of a column: pick button + the template / row the section came from. */
function ColumnTemplateBar({input,spec,readOnly,onPick,onUnlink}:{input:ColumnInput;spec:Project['spec'];readOnly:boolean;onPick:()=>void;onUnlink:()=>void}){
 const n=spec.columnTemplates?.length||0,ref=input.template,t=ref&&spec.columnTemplates?.find(x=>x.id===ref.id);
 const where=ref?`${ref.name}${ref.row<0?' · ทั้งตาราง':t?.rows[ref.row]?` · ${t.rows[ref.row].level}`:''}`:'';
 return <div className="ct-bar">
  <button type="button" className={n?'ct-open':''} disabled={readOnly} title={n?'เลือกหน้าตัด / เหล็กยืน / เหล็กปลอก จากตารางเสาของโครงการ':'ยังไม่มี Template · เพิ่มที่ General Spec ของโครงการ'} onClick={onPick}><Columns3 size={15}/>เลือกจาก Template โครงการ ({n})</button>
  {ref&&<span className={`ct-link ${ref.linked?'on':''}`}>{ref.linked?'ผูกกับ':'มาจาก'} Template <b>{where}</b>{!t&&' (ไม่พบใน Spec แล้ว)'}{ref.linked&&<small> · แก้ค่าในหน้านี้ได้ แต่จะถูกแทนเมื่อ Template ใน Spec เปลี่ยน</small>}</span>}
  {ref?.linked&&<button type="button" className="icon-button" disabled={readOnly} title="เลิกผูก (ค่าคงเดิม · ไม่ปรับตาม Template อีก)" onClick={onUnlink}><Link2Off size={14}/></button>}
 </div>;
}
