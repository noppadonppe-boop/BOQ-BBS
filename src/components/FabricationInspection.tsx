import {useState} from 'react';
import type {Bar,Member,Spec} from '../domain/model';
import {schedule} from '../domain/engine';
import {bsToleranceReference} from '../domain/bsTolerances';
import {fabricationInspectionsSchema} from '../domain/fabricationInspectionSchema';
import {fabricationInspectionResult,inspectionNominalBasis} from '../domain/fabricationInspection';
import {Field} from './EditorControls';

const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:3});
const statuses={'Stale nominal':'มิติกำหนดเปลี่ยนแล้ว ต้องตรวจใหม่','Outside listed limits':'นอกช่วง/ขีดจำกัดที่ตรวจ','Incomplete':'ข้อมูลไม่ครบหรือมิติรูปยังไม่รองรับ','Within listed ranges':'อยู่ในช่วงรายมิติ · การผลิตยังรอตรวจ'} as const;
function MeasurementField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <label className="field"><span>{label}</span><input type="number" step="any" value={value} onChange={e=>onChange(e.target.value)}/></label>;}
export function FabricationInspection({member,bar,spec,onChange}:{member:Member;bar:Bar;spec:Spec;onChange?:(bar:Bar)=>void}){
 const row=schedule({...member,bars:[bar]},spec)[0],reference=bsToleranceReference(spec,row);
 const [piece,setPiece]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[observer,setObserver]=useState(''),[source,setSource]=useState(''),[cut,setCut]=useState(''),[radius,setRadius]=useState(''),[dimensions,setDimensions]=useState<Record<string,string>>({}),[note,setNote]=useState(''),[error,setError]=useState('');
 const records=bar.fabricationInspections||[];
 const add=()=>{try{
  const candidate={version:1,id:crypto.randomUUID(),pieceReference:piece,inspectedOn:date,observer,source,nominalBasis:inspectionNominalBasis(spec,row),measuredCut:Number(cut),measuredDimensions:Object.fromEntries(Object.entries(dimensions).filter(([,v])=>v.trim()!=='').map(([k,v])=>[k,Number(v)])),...(radius.trim()?{measuredInnerRadius:Number(radius)}:{}),note};
  const parsed=fabricationInspectionsSchema.safeParse([...records,candidate]);if(!parsed.success)throw Error(parsed.error.issues[0].message+' · ระบุรหัสชิ้น ผู้บันทึก อ้างอิง และค่าที่วัดได้เป็นบวก');
  onChange?.({...bar,fabricationInspections:parsed.data,bsDimensionsConfirmed:false,placementConfirmed:false});setError('');setPiece('');setCut('');setRadius('');setDimensions({});setNote('');
 }catch(e){setError((e as Error).message);}};
 return <details className="fabrication-inspection full"><summary>ผลวัดเหล็กที่ผลิตจริงรายชิ้น · {records.length}/20</summary>
  <p className="muted">BS Table 4 · บันทึกค่าที่วัดจริง ไม่กรอกค่ากำหนดแทนผลวัด ผลครอบคลุมเฉพาะชิ้น/ตัวอย่างที่ระบุ ไม่รับรองทั้ง Mark หรืออนุมัติผลิต และไม่เปลี่ยน geometry, BOQ หรือยาวตัด</p>
  {records.map(record=>{const result=fabricationInspectionResult(spec,row,record);return <details key={record.id} className="inspection-record"><summary>{record.pieceReference} · {record.inspectedOn} · {statuses[result.status]}</summary><p>{record.observer} · {record.source}</p>
   {result.recordedNominal&&<p>มิติกำหนดที่เก็บพร้อมผลวัด: Code {result.recordedNominal.code} · ยาวตัด {fmt(result.recordedNominal.cut)} mm · {result.recordedNominal.dimensions.map(d=>`${d.free?'('+d.label+')':d.label} ${fmt(d.value)}`).join(' / ')} · {result.recordedNominal.policy}</p>}
   {result.stale&&<p className="notice warning">ผลนี้อ้างมิติกำหนดก่อนแก้ เก็บไว้เป็นประวัติ ค่าช่วงด้านล่างเทียบมิติปัจจุบันและไม่ถือเป็นผลตรวจรับ</p>}
   <div className="table-scroll"><table><thead><tr><th>รายการ</th><th>กำหนด mm</th><th>ช่วง mm</th><th>วัดได้ mm</th><th>ผลเฉพาะช่วง</th></tr></thead><tbody>{result.criteria.map(c=><tr key={c.label}><td>{c.label}</td><td>{fmt(c.nominal)}</td><td>{fmt(c.lower)} ถึง {fmt(c.upper)}</td><td>{c.measured===undefined?'ยังไม่วัด':fmt(c.measured)}</td><td>{c.result==='Missing'?'ขาดผลวัด':c.result==='Within range'?'อยู่ในช่วง':'นอกช่วง'}</td></tr>)}</tbody></table></div>
   {record.measuredInnerRadius!==undefined&&<p>r ด้านในที่วัดได้ {fmt(record.measuredInnerRadius)} mm · ไม่กำหนด tolerance ให้รัศมีอัตโนมัติ</p>}
   {result.balance&&<p className="notice">เทียบสมการ Table 1: ({result.balance.freeLabel}) {result.balance.available?<>ที่ต้องการจากยาวตัด/มิติที่วัด = {fmt(result.balance.required)} mm · {result.balance.residual===undefined?'ยังไม่มีผลวัดมิติอิสระ':`ผลวัดลบค่าที่ต้องการ = ${fmt(result.balance.residual)} mm`} · {result.balance.withinFreeRange?'ค่าที่ต้องการอยู่ในช่วงมิติอิสระ':'ค่าที่ต้องการนอกช่วงมิติอิสระ'}</>:<>ยังขาด {result.balance.missing.join(', ')}</>} · เป็นการเทียบทางคณิตศาสตร์ ยังไม่มีเกณฑ์ยอมรับผลต่างและไม่ปรับเหล็กอัตโนมัติ</p>}
   {[...result.minimumProblems,...result.notes].map(n=><p className="muted" key={n}>{n}</p>)}{record.note&&<p>{record.note}</p>}
   {onChange&&<button type="button" onClick={()=>onChange({...bar,fabricationInspections:records.filter(r=>r.id!==record.id),bsDimensionsConfirmed:false,placementConfirmed:false})}>ลบผลวัด {record.pieceReference}</button>}
  </details>;})}
  {onChange&&records.length<20&&<div className="form-grid inspection-inputs">
   <Field label="รหัสชิ้น/ตัวอย่าง" value={piece} onChange={setPiece}/><Field label="วันที่ตรวจวัด" type="date" value={date} onChange={setDate}/>
   <Field label="ผู้บันทึกผลวัด" value={observer} onChange={setObserver}/><Field label="เอกสาร/รายงานตรวจวัด" value={source} onChange={setSource}/>
   <MeasurementField label="ยาวตัดที่วัดได้ mm" value={cut} onChange={setCut}/>
   {!!reference?.dimensions.length&&<MeasurementField label="r ด้านในที่วัดได้ mm" value={radius} onChange={setRadius}/>}
   {reference?.dimensions.map(d=><MeasurementField key={d.label} label={`มิติ ${d.label} ที่วัดได้ mm`} value={dimensions[d.label]||''} onChange={v=>setDimensions({...dimensions,[d.label]:v})}/>)}
   <Field label="หมายเหตุผลวัด" value={note} onChange={setNote}/><button type="button" onClick={add}>เพิ่มผลวัดของชิ้นนี้</button>
   <p className="muted full">เพิ่มผลแล้วใช้ชุดเหล็กและบันทึกสมาชิก ข้อมูลกลับ Draft และต้องยืนยันมิติ/ตำแหน่งอีกครั้ง ผลวัดเก่าที่มิติกำหนดเปลี่ยนยังเก็บไว้และแสดงว่าต้องตรวจใหม่</p>
  </div>}{error&&<p role="alert" className="notice warning">{error}</p>}
 </details>;
}
