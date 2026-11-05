import {useState} from 'react';
import {Download,RotateCcw,Upload} from 'lucide-react';
import type {Spec} from '../domain/model';
import {layerRoles,type LayerRole} from '../domain/drawingPrims';
import {aciHex,cadFonts,cadStandardOf,cadStandardSchema,defaultCadStandard,dxfLineweights,layerRoleLabels,type CadLayer,type CadStandard} from '../domain/cadStandard';
import {NumInput} from './EditorControls';
import {defaultLabelRules,type LabelRules} from '../domain/labelQa';
import {HelpButton} from './HelpCenter';

const Num=({onChange,...rest}:{value:number;min:number;max:number;step?:number;disabled:boolean;'aria-label'?:string;onChange:(v:number)=>void})=><NumInput {...rest} onChange={e=>onChange(Number(e.target.value))}/>;
const linetypes:CadLayer['linetype'][]=['Continuous','HIDDEN2','DASHED','CENTER2'];
/** General Spec · CAD Standard of the DXF export (spec.cadStandard): layers per drawing role (ByLayer colour / linetype /
 * lineweight / plot), dimension and text basics, the Mark block. No value = the app's S-* set. */
export function CadStandardEditor({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const cad=cadStandardOf(spec),own=!!spec.cadStandard,[tab,setTab]=useState<'layer'|'dim'|'block'|'qa'>('layer'),check=cadStandardSchema.safeParse(cad);
 const store=(next:CadStandard|undefined)=>{const {cadStandard:_,...rest}=spec;onChange(next?{...rest,cadStandard:next}:rest);};
 const layer=(r:LayerRole,patch:Partial<CadLayer>)=>store({...cad,layers:{...cad.layers,[r]:{...cad.layers[r],...patch}}});
 const qa:LabelRules={...defaultLabelRules,...cad.labelQa},setQa=(patch:Partial<LabelRules>)=>store({...cad,labelQa:{...qa,...patch}});
 const exportJson=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({format:'form-spec-import',source:'CAD Standard',codes:{},cadStandard:cad},null,1)],{type:'application/json'}));a.download='cad-standard.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 return <section className="foundation-templates cad-standard" aria-label="CAD Standard สำหรับ DXF">
  <h3>มาตรฐาน CAD สำหรับ DXF <HelpButton topic="dxf-export"/></h3>
  <p className="muted">ใช้กับไฟล์ DXF 2018 ที่ส่งออกจากแบบ BBS ทุกแผ่นของโครงการที่ใช้ Spec นี้ · ทุก object ใช้สี / linetype / lineweight แบบ ByLayer · {own?'ตั้งค่าเองแล้ว':'ยังไม่ตั้งค่า: ใช้ชุด S-* ของแอป'} · ค่าใหม่มีผลกับไฟล์ที่ส่งออกครั้งถัดไป (PDF ไม่เปลี่ยน)</p>
  <div className="actions">
   <button type="button" disabled title="รอบถัดไป: อ่าน Layer / DIMSTYLE จากไฟล์ Template ของลูกค้า (DXF)"><Upload size={14}/>นำเข้าจาก Template (รอบถัดไป)</button>
   <button type="button" onClick={exportJson}><Download size={14}/>ส่งออก (ไฟล์ Spec .json)</button>
   {own&&!disabled&&<button type="button" onClick={()=>store(undefined)}><RotateCcw size={14}/>ใช้ค่าเริ่มต้น S-*</button>}
  </div>
  <div className="segmented" role="tablist" aria-label="หมวด CAD Standard">{([['layer','Layer'],['dim','Dimension / Text'],['block','Block Mark'],['qa','ตรวจป้าย Mark']] as const).map(([k,t])=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{t}</button>)}</div>
  {!check.success&&<p role="alert" className="notice danger">{check.error.issues[0]?.message}</p>}
  {tab==='layer'&&<div className="table-scroll"><table className="cad-layers"><thead><tr><th>สิ่งที่วาดในแอป</th><th>ชื่อ Layer</th><th>สี (ACI)</th><th>Linetype</th><th>LW (mm)</th><th>Plot</th></tr></thead><tbody>
   {layerRoles.map(r=>{const l=cad.layers[r];return <tr key={r}><td>{layerRoleLabels[r]}</td>
    <td><input aria-label={`ชื่อ Layer ${layerRoleLabels[r]}`} className="mono" value={l.name} disabled={disabled} maxLength={60} onChange={e=>layer(r,{name:e.target.value.toUpperCase()})}/></td>
    <td><span className="cad-swatch" style={{background:aciHex(l.aci)}}/><Num aria-label={`สี ACI ${layerRoleLabels[r]}`} value={l.aci} min={1} max={255} disabled={disabled} onChange={v=>layer(r,{aci:Math.max(1,Math.min(255,Math.round(v)))})}/></td>
    <td><select aria-label={`Linetype ${layerRoleLabels[r]}`} value={l.linetype} disabled={disabled} onChange={e=>layer(r,{linetype:e.target.value as CadLayer['linetype']})}>{linetypes.map(t=><option key={t}>{t}</option>)}</select></td>
    <td><select aria-label={`Lineweight ${layerRoleLabels[r]}`} value={String(l.lineweight)} disabled={disabled} onChange={e=>layer(r,{lineweight:Number(e.target.value)})}>{dxfLineweights.filter(v=>v>0).map(v=><option key={v} value={String(v/100)}>{(v/100).toFixed(2)}</option>)}</select></td>
    <td><input type="checkbox" aria-label={`Plot ${layerRoleLabels[r]}`} checked={l.plot} disabled={disabled} onChange={e=>layer(r,{plot:e.target.checked})}/></td></tr>;})}
  </tbody></table></div>}
  {tab==='dim'&&<div className="form-grid">
   <label className="field"><span>ความสูงตัวเลข Dimension (บนกระดาษ, mm)</span><Num value={cad.dim.textHeight} min={.5} max={10} step={.1} disabled={disabled} onChange={v=>store({...cad,dim:{...cad.dim,textHeight:v}})}/></label>
   <label className="field"><span>หัวลูกศร</span><select value={cad.dim.arrow} disabled={disabled} onChange={e=>store({...cad,dim:{...cad.dim,arrow:e.target.value as CadStandard['dim']['arrow']}})}><option value="tick">Architectural tick</option><option value="closed">Closed filled</option><option value="dot">Dot</option></select></label>
   <label className="field"><span>เส้นช่วยยื่นเลยเส้นบอกระยะ (mm)</span><Num value={cad.dim.extBeyond} min={0} max={10} step={.25} disabled={disabled} onChange={v=>store({...cad,dim:{...cad.dim,extBeyond:v}})}/></label>
   <label className="field"><span>ระยะเว้นจากวัตถุ (mm)</span><Num value={cad.dim.extOffset} min={0} max={10} step={.25} disabled={disabled} onChange={v=>store({...cad,dim:{...cad.dim,extOffset:v}})}/></label>
   <label className="field"><span>ทศนิยม</span><select value={cad.dim.precision} disabled={disabled} onChange={e=>store({...cad,dim:{...cad.dim,precision:Number(e.target.value)}})}>{[0,1,2,3].map(v=><option key={v} value={v}>{v}{v?'':' (mm)'}</option>)}</select></label>
   <label className="field"><span>ฟอนต์ข้อความ (STYLE)</span><select value={cad.text.font} disabled={disabled} onChange={e=>store({...cad,text:{...cad.text,font:e.target.value as CadStandard['text']['font']}})}>{cadFonts.map(f=><option key={f}>{f}</option>)}</select></label>
   <label className="field"><span>ความสูงข้อความพื้นฐาน (mm)</span><Num value={cad.text.height} min={.5} max={10} step={.1} disabled={disabled} onChange={v=>store({...cad,text:{...cad.text,height:v}})}/></label>
   <p className="muted full">DIMSTYLE ต่อมาตราส่วน: BBS-DIM-1-n (Model: DIMSCALE = n · พิกัดกระดาษ: DIMLFAC = n) · Annotative scale อยู่ในรอบถัดไป</p></div>}
  {tab==='qa'&&<div className="form-grid">
   <label className="check full"><input type="checkbox" checked={qa.enabled} disabled={disabled} onChange={e=>setQa({enabled:e.target.checked})}/>ตรวจป้าย Mark บนแบบ (ตัวอย่างแบบ · จัดหน้าแบบ · ส่งออก DXF) <HelpButton topic="label-qa"/></label>
   <label className="field"><span>ระยะห่างขั้นต่ำระหว่างป้าย (บนกระดาษ, mm)</span><Num value={qa.minGap} min={0} max={10} step={.25} disabled={disabled||!qa.enabled} onChange={v=>setQa({minGap:Math.max(0,Math.min(10,v))})}/></label>
   <label className="field"><span>เส้นชี้ยาวสุด (บนกระดาษ, mm)</span><Num value={qa.maxLeader} min={10} max={500} step={5} disabled={disabled||!qa.enabled} onChange={v=>setQa({maxLeader:Math.max(10,Math.min(500,v))})}/></label>
   <label className="check"><input type="checkbox" checked={qa.lines} disabled={disabled||!qa.enabled} onChange={e=>setQa({lines:e.target.checked})}/>ตรวจป้ายที่วางทับเส้นเหล็ก / ขอบคอนกรีต / เส้น Dimension</label>
   <p className="muted full">ตรวจเสมอ: ป้ายทับกัน · ทับข้อความ / ตัวเลข · เส้นชี้ไขว้กัน · ล้นกรอบรูป (สีแดง) · ชิดเกิน / ทับเส้น / เส้นชี้ยาว (สีเหลือง) · เป็นคำเตือน ไม่บล็อกการส่งออก</p></div>}
  {tab==='block'&&<div className="form-grid">
   <label className="field"><span>ชื่อ Block ป้าย Mark</span><input className="mono" value={cad.mark.blockName} disabled={disabled} maxLength={60} onChange={e=>store({...cad,mark:{...cad.mark,blockName:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'')||defaultCadStandard().mark.blockName}})}/></label>
   <label className="check"><input type="checkbox" checked={cad.mark.useBlock} disabled={disabled} onChange={e=>store({...cad,mark:{...cad.mark,useBlock:e.target.checked}})}/>ป้าย Mark เป็น Block + Attribute (LABEL · MARK · N · SIZE · SPACING · LAYER)</label>
   <p className="muted full">Leader = LEADER (หัวจุด) ผูกกับ INSERT ของ Block · แก้ข้อความด้วย ATTEDIT / ดับเบิลคลิก · ปิดตัวเลือกนี้ = ข้อความ MTEXT ปลาย leader</p></div>}
 </section>;
}
