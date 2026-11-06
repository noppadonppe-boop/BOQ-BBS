import type {Spec} from '../domain/model';
import type {ColumnTemplate} from '../domain/columnTemplates';
import {DEFAULT_EMBED_TIE_STANDARD,embedTiesLabel,type EmbedTies,embedTieFromLabel,embedTieText,resolveEmbedTie,standardEmbedTie,standardText,type EmbedTieStandard,type EmbedTieType,type FootingEmbedTie} from '../domain/embedTie';
import {NumInput} from './EditorControls';
import {HelpButton} from './HelpCenter';

const tieDiameters=[9,10,12,16,20];
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
/** Outer hoop only, or every tie of the section (hoop + set-2 inner / cross ties). */
export function TiesSelect({value,readOnly,onChange,label='ปลอกที่ใส่ในฐาน',short}:{value:EmbedTies;readOnly?:boolean;onChange:(v:EmbedTies)=>void;label?:string;short?:boolean}){
 const sel=<select aria-label={label} disabled={readOnly} value={value} onChange={e=>onChange(e.target.value as EmbedTies)}><option value="all">{short?'ทั้งหมด':embedTiesLabel.all}</option><option value="outer">{short?'ปลอกนอก':embedTiesLabel.outer}</option></select>;
 return short?sel:<label className="field"><span>{label}</span>{sel}</label>;
}

/** Typical detail of the ties in the footing (top gap, spacing, bent feet ≥ 12d). */
export function EmbedTieSketch({std,size=170}:{std:EmbedTieStandard;size?:number}){
 return <svg className="etie-sketch" viewBox="0 0 190 230" width={size} role="img" aria-label="รูปขยายเหล็กปลอกในฐานราก">
  <rect x="10" y="70" width="170" height="130" fill="none" stroke="#7a8a8f"/>
  <line x1="75" y1="6" x2="75" y2="185" stroke="#203940" strokeWidth="2"/><line x1="115" y1="6" x2="115" y2="185" stroke="#203940" strokeWidth="2"/>
  <path d="M75 185 Q75 192 68 192 L30 192" fill="none" stroke="#203940" strokeWidth="2"/><path d="M115 185 Q115 192 122 192 L160 192" fill="none" stroke="#203940" strokeWidth="2"/>
  <g stroke="#7a8a8f">{[20,34,48,60].map(y=><line key={y} x1="71" y1={y} x2="119" y2={y}/>)}</g>
  <g stroke="#1a73c9" strokeWidth="2">{[84,122,160].map(y=><line key={y} x1="71" y1={y} x2="119" y2={y}/>)}</g>
  <g stroke="#1a73c9" strokeDasharray="3 2">{[87,125,163].map(y=><line key={y} x1="80" y1={y} x2="110" y2={y}/>)}</g>
  <g fontSize="11" fill="#55666b"><text x="124" y="81">−{std.top}</text><text x="124" y="40">S2</text><text x="134" y="210">≥12d</text></g>
  <text x="124" y="145" fontSize="11" fill="#1a73c9">≤ @{std.spacing}</text>
  <text x="14" y="145" fontSize="11" fill="#1a73c9">{std.diameter?barName(std.diameter):'= ปลอกเสา'}</text>
 </svg>;
}

/** General Spec card: the project standard + the choice of every column type. */
export function EmbedTieStandardCard({spec,readOnly,onChange}:{spec:Spec;readOnly:boolean;onChange:(next:Spec)=>void}){
 const std=spec.columnEmbedTie,list=spec.columnTemplates||[];
 const setStd=(v:EmbedTieStandard|undefined)=>{const {columnEmbedTie:_,...rest}=spec;onChange(v?{...rest,columnEmbedTie:v}:rest);};
 const put=(f:(s:EmbedTieStandard)=>void)=>{const s={...(std??DEFAULT_EMBED_TIE_STANDARD)};f(s);setStd(s);};
 const setType=(t:ColumnTemplate,e:EmbedTieType|undefined)=>{const next=list.map(x=>{if(x.id!==t.id)return x;const {embedTie:_,...rest}=x;return e&&e.mode!=='std'?{...rest,embedTie:e}:rest;});const {columnTemplates:_,...rest}=spec;onChange({...rest,columnTemplates:next});};
 return <details className="ct-rules etie-card" open={!!std}><summary>มาตรฐานเหล็กปลอกในฐานราก (ปลอกรอบเหล็กยืนช่วงที่ฝังในฐาน){std?` · ${standardText(std)}`:' · ยังไม่ได้กำหนด'} <HelpButton topic="column-templates"/></summary>
  {!std?<p className="muted">ยังไม่มีมาตรฐาน · เสาบนฐานรากใส่ปลอกในฐานได้ทีละต้น <button type="button" disabled={readOnly} onClick={()=>setStd({...DEFAULT_EMBED_TIE_STANDARD})}>กำหนดมาตรฐาน (ค่าตามแบบ Typical: @ ≤ 500 · บนสุด −100)</button></p>:<>
   <div className="etie-std">
    <div className="form-grid">
     <label className="check full"><input type="checkbox" disabled={readOnly} checked={std.enabled} onChange={e=>put(s=>{s.enabled=e.target.checked;})}/>ค่าเริ่มต้น: ใส่ปลอกในฐานรากเมื่อวางเสาบนฐาน (เสาใหม่ และ Type ที่เลือก “ตามมาตรฐาน”)</label>
     <label className="field"><span>ขนาดปลอก</span><select disabled={readOnly} value={std.diameter} onChange={e=>put(s=>{s.diameter=Number(e.target.value);})}><option value={0}>= ขนาดปลอกเสา</option>{tieDiameters.map(d=><option key={d} value={d}>{barName(d)}</option>)}</select></label>
     <label className="field"><span>ระยะห่าง ≤ (mm)</span><NumInput type="number" min={50} max={2000} step={25} disabled={readOnly} value={std.spacing} onChange={e=>put(s=>{s.spacing=Math.min(2000,Math.max(50,Number(e.target.value)||500));})}/></label>
     <TiesSelect value={std.ties??'all'} readOnly={readOnly} onChange={v=>put(s=>{s.ties=v;})}/>
     <label className="field"><span>ปลอกบนสุด ต่ำกว่าผิวบนฐาน ≥ (mm)</span><NumInput type="number" min={0} max={1000} step={25} disabled={readOnly} value={std.top} onChange={e=>put(s=>{s.top=Math.min(1000,Math.max(0,Number(e.target.value)||0));})}/></label>
     <label className="field full"><span>แหล่งที่มา (แบบ / Detail)</span><input maxLength={200} disabled={readOnly} value={std.source??''} placeholder="RE MPK01B-IFC-S-CD · Typical detail column" onChange={e=>put(s=>{if(e.target.value)s.source=e.target.value;else delete s.source;})}/></label>
    </div>
    <EmbedTieSketch std={std}/>
   </div>
   <p className="muted">ปลอกล่างสุดอยู่เหนือขางอเหล็กยืน · ใต้ตะแกรงบนเสมอ · “ปลอกทั้งหมด” = ปลอกนอก + ปลอกชุดที่ 2 (ปลอกใน / เหล็กรัดขวาง) ตามรูปแบบหน้าตัดของ Type ทุกชั้น · “ปลอกนอกเท่านั้น” = ปลอกรอบนอกอย่างเดียว · เปลี่ยนมาตรฐานแล้วเสาที่ “ตามมาตรฐาน Spec” / “ตาม Type” ปรับตามเมื่อบันทึก Spec</p>
   {list.length>0&&<div className="table-scroll"><table className="subbase-table etie-types"><thead><tr><th>Type</th><th>หน้าตัด (ชั้นแรก)</th><th>ปลอกเสา</th><th>ปลอกในฐาน</th><th>ผล</th></tr></thead><tbody>
    {list.map(t=>{const r=t.rows[0];return <tr key={t.id}><td><b>{t.name}</b></td><td>{r.width} × {r.depth}</td><td>{barName(r.tie.diameter)}</td>
     <td><TypeEmbedTieSelect type={t.embedTie} tieD={r.tie.diameter} readOnly={readOnly} onChange={e=>setType(t,e)}/></td>
     <td className="muted">{typeResult(t,std)}</td></tr>;})}</tbody></table></div>}
   <p className="muted"><button type="button" disabled={readOnly} onClick={()=>setStd(undefined)}>ลบมาตรฐาน</button> เสาที่ผูก “ตามมาตรฐาน Spec” จะใช้ค่าที่เก็บไว้ล่าสุด</p>
  </>}
 </details>;
}
function typeResult(t:ColumnTemplate,std?:EmbedTieStandard){
 const e=t.embedTie,d=t.rows[0].tie.diameter;
 if(e?.mode==='off')return 'ไม่ใส่';
 if(e?.mode==='own')return `${barName(e.diameter)} @ ≤ ${e.spacing} · ${embedTiesLabel[e.ties??'all']}`;
 return std?std.enabled?`${barName(std.diameter||d)} @ ≤ ${std.spacing} · ${embedTiesLabel[std.ties??'all']}`:'ไม่ใส่ (มาตรฐานปิดค่าเริ่มต้น)':'ตามที่เลือกในเสา';
}

/** Choice of one column type: standard / own / none. */
export function TypeEmbedTieSelect({type,tieD,readOnly,onChange}:{type?:EmbedTieType;tieD:number;readOnly:boolean;onChange:(e:EmbedTieType|undefined)=>void}){
 const mode=type?.mode??'std';
 return <span className="bar-cell">
  <select aria-label="ปลอกในฐาน" disabled={readOnly} value={mode} onChange={e=>{const m=e.target.value as EmbedTieType['mode'];onChange(m==='std'?undefined:{mode:m,diameter:type?.diameter||tieD,spacing:type?.spacing||500});}}>
   <option value="std">ตามมาตรฐาน</option><option value="own">กำหนดเอง</option><option value="off">ไม่ใส่</option></select>
  {mode==='own'&&<><select aria-label="ขนาดปลอกในฐาน" disabled={readOnly} value={type!.diameter} onChange={e=>onChange({...type!,diameter:Number(e.target.value)})}>{[...new Set([...tieDiameters,type!.diameter])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{barName(d)}</option>)}</select>
   @<NumInput aria-label="ระยะปลอกในฐาน" type="number" min={50} step={25} style={{width:58}} disabled={readOnly} value={type!.spacing} onChange={e=>onChange({...type!,spacing:Math.max(50,Number(e.target.value)||500)})}/>
   <TiesSelect short value={type!.ties??'all'} readOnly={readOnly} onChange={v=>onChange({...type!,ties:v})}/></>}
 </span>;
}

/** Footing column: none / the General Spec standard / own values (a column from a type shows “ตาม Type”). */
export function ColumnEmbedTieChoice({et,tieD,std,typeName,readOnly,onChange}:{et?:FootingEmbedTie;tieD:number;std?:EmbedTieStandard;typeName?:string;readOnly?:boolean;onChange:(et:FootingEmbedTie|undefined)=>void}){
 const mode=!et?'off':et.link==='spec'&&std?'spec':et.link==='type'?'type':'own',r=resolveEmbedTie(et,tieD,std);
 return <div className="etie-choice">
  <label className="field"><span>เหล็กปลอกในฐานราก (ช่วงเหล็กยืนที่ฝังในฐาน)</span>
   <select disabled={readOnly} value={mode} onChange={e=>{const m=e.target.value;const ties=et?.ties?{ties:et.ties}:{};onChange(m==='off'?undefined:m==='spec'?{...standardEmbedTie(tieD,{...std!,enabled:true})!,...ties}:m==='type'?et:{diameter:r?.diameter||tieD||12,spacing:r?.spacing||500,...ties});}}>
    <option value="off">ไม่ใส่</option>{std&&<option value="spec">ตามมาตรฐาน Spec</option>}{et?.link==='type'&&<option value="type">ตาม Type{typeName?` ${typeName}`:''}</option>}<option value="own">กำหนดเอง</option></select></label>
  {mode==='own'&&et&&<><label className="field"><span>ขนาด</span><select disabled={readOnly} value={et.diameter} onChange={e=>onChange({...et,diameter:Number(e.target.value)})}>{[...new Set([...tieDiameters,et.diameter])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{barName(d)}</option>)}</select></label>
   <label className="field"><span>@ ไม่เกิน (mm)</span><NumInput type="number" min={50} step={25} disabled={readOnly} value={et.spacing} onChange={e=>onChange({...et,spacing:Math.max(50,Number(e.target.value)||500)})}/></label></>}
  {et&&r&&<TiesSelect value={r.ties} readOnly={readOnly} onChange={v=>onChange({...et,ties:v})}/>}
  <p className="muted">{r?`${embedTieText(r)} · ${embedTieFromLabel[r.from]} · ตั้งแต่เหนือขางอถึงใต้ตะแกรงบน${r.ties==='all'?' · ชุดที่ 2 ตามรูปแบบหน้าตัด (ถ้ามี)':''}`:'ไม่มีปลอกในฐาน'}</p>
 </div>;
}
export function embedTieSummary(et:FootingEmbedTie|undefined,tieD:number,std?:EmbedTieStandard){const r=resolveEmbedTie(et,tieD,std);return {text:r?`${barName(r.diameter)} @ ≤ ${r.spacing} · ${r.ties==='all'?'ทั้งหมด':'ปลอกนอก'}`:'ไม่ใส่',from:r?embedTieFromLabel[r.from]:''};}
