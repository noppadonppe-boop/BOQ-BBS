import {useState} from 'react';
import type {Member,Spec} from '../domain/model';
import {drawingViewsSchema,axisIndex,migrateDrawingViews,nextSectionLabel,type DrawingViewsV2} from '../domain/drawingViews';
import {defaultSections} from '../domain/sheetLayout';
import {elementInputSchema} from '../domain/elementInput';
import {takeoff,validateMember as validateMemberOf} from '../domain/engine';
import {boundsOf} from '../domain/solids';
import {Modal} from './EditorControls';
export function DrawingViewsEditor({member,spec,readOnly=false,onApply,onClose}:{member:Member;spec:Spec;readOnly?:boolean;onApply:(m:Member)=>void;onClose:()=>void}){
 // same sections as the BBS sheet / Sheet Composer: v2 as stored, v1 migrated, none = the sheet's default cuts X–X / Y–Y / Z–Z
 const [draft,setDraft]=useState<DrawingViewsV2>(()=>{const parsed=elementInputSchema.safeParse(member.elementInput),defs=defaultSections(member,parsed.success?parsed.data:undefined,takeoff(member,spec).rows);
  return structuredClone(member.drawingViews?migrateDrawingViews(member.drawingViews,defs):{version:2,primaryPlane:'XY',basis:'',sections:defs});}),[error,setError]=useState('');
 const change=(id:string,patch:Partial<DrawingViewsV2['sections'][number]>)=>setDraft({...draft,sections:draft.sections.map(s=>s.id===id?{...s,...patch}:s)});
 const apply=()=>{const parsed=drawingViewsSchema.safeParse(draft);if(!parsed.success){setError(parsed.error.issues.map(i=>i.message).join(' · '));return;}const next={...member,drawingViews:parsed.data},errors=validateMemberOf(next,spec);if(errors.length){setError(errors.join(' · '));return;}onApply(next);onClose();};
 return <Modal title={`ภาพหลัก / รูปตัด · ${member.code}`} disabledFields={readOnly} onClose={onClose}><p className="notice">ตำแหน่งรูปตัดใช้พิกัดสมาชิกเดียวกับเหล็ก หน่วย mm · ชุดเดียวกับรูปตัดในแบบ BBS / จัดหน้าแบบ · กำหนดได้ 12 แนว เช่นเสาใช้ภาพด้าน X/Z และรูปตัดตามระดับ Z · ไม่คำนวณหรือสร้างเหล็กใหม่ · เปลี่ยนแนวตัดจะกลับ Draft และต้องตรวจยืนยันตำแหน่ง Mark อีกครั้ง</p>
 <label className="field"><span>ระนาบภาพหลัก</span><select value={draft.primaryPlane} onChange={e=>setDraft({...draft,primaryPlane:e.target.value as DrawingViewsV2['primaryPlane']})}><option value="XY">แปลน X/Y</option><option value="XZ">ภาพด้าน X/Z</option><option value="YZ">ภาพด้าน Y/Z</option></select></label>
 <button type="button" onClick={()=>setDraft({version:2,primaryPlane:'XZ',basis:'',sections:[{id:crypto.randomUUID(),label:'A-A',axis:'Z',position:boundsOf(member)[2]/2,source:'user'}]})}>เริ่มภาพด้านเสา / รูปตัดระดับ Z</button>
 {draft.sections.map((s,i)=><section className="drawing-section-editor" key={s.id}><div className="section-heading"><h3>รูปตัด {i+1}</h3><button type="button" disabled={draft.sections.length===1} onClick={()=>setDraft({...draft,sections:draft.sections.filter(v=>v.id!==s.id)})}>ลบรูปตัด {s.label}</button></div><div className="form-grid"><label className="field"><span>ชื่อรูปตัด {i+1}</span><input value={s.label} maxLength={12} onChange={e=>change(s.id,{label:e.target.value})}/></label><label className="field"><span>แกนที่ตัด {i+1}</span><select value={s.axis} onChange={e=>{const axis=e.target.value as typeof s.axis;change(s.id,{axis,position:boundsOf(member)[axisIndex(axis)]/2});}}>{['X','Y','Z'].map(a=><option key={a}>{a}</option>)}</select></label><label className="field"><span>ตำแหน่งรูปตัด {i+1} mm</span><input type="number" min={0} max={boundsOf(member)[axisIndex(s.axis)]} value={s.position} onChange={e=>change(s.id,{position:Number(e.target.value)})}/></label></div></section>)}
 <button type="button" disabled={draft.sections.length>=12} onClick={()=>setDraft({...draft,sections:[...draft.sections,{id:crypto.randomUUID(),label:nextSectionLabel(draft.sections),axis:'Y',position:boundsOf(member)[1]/2,source:'user'}]})}>เพิ่มรูปตัด</button>
 <label className="field"><span>แบบอ้างอิง / ที่มาของแนวตัด</span><textarea maxLength={500} value={draft.basis} onChange={e=>setDraft({...draft,basis:e.target.value})}/></label>
 {error&&<p role="alert" className="notice danger">{error}</p>}<footer>{member.drawingViews&&<button type="button" onClick={()=>{const {drawingViews,...legacy}=member;onApply(legacy);onClose();}}>กลับไปใช้แปลน / แนวตัด Y เดิม</button>}<button type="button" className="primary" onClick={apply}>ใช้ภาพหลักและรูปตัด</button></footer></Modal>;
}
