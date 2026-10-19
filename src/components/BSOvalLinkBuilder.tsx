import {useState} from 'react';
import type {Bar,Member,Spec} from '../domain/model';
import {bsGeneration} from '../domain/bs8666';
import {buildBSOvalLink} from '../domain/bsOvalLinkBuilder';
import {Field} from './EditorControls';
import {barPaths} from '../domain/engine';
import {ovalLinkAssessment} from '../domain/bsOvalLink';
export function BSOvalLinkBuilder({member,bar,spec,onChange}:{member:Member;bar:Bar;spec:Spec;onChange:(b:Bar)=>void}){
 const existing=bar.shapeCode==='33'?ovalLinkAssessment(barPaths(member,bar)[0]||[],bar.outsideDiameter??bar.diameter,bar.radius,bar.diameter):undefined;
 const [A,setA]=useState(existing?.dimensions[0].value??500),[B,setB]=useState(existing?.dimensions[1].value??200),[C,setC]=useState(existing?.dimensions[2].value??250),[sameEnd,setSameEnd]=useState(!existing||Math.abs(existing.dimensions[2].value-existing.otherEnd)<1e-6),[otherEnd,setOtherEnd]=useState(existing?.otherEnd??250),[error,setError]=useState(''),[created,setCreated]=useState(false);
 if(bsGeneration(spec)<8)return null;
 const clear=()=>{setError('');setCreated(false);};
 return <details className="bs-template oval-link-builder full"><summary>สร้างรูป 33 · เหล็กปลอกรูปวงรี</summary><p className="muted">A/B คือกรอบผิวนอก · (C) คือมิติอิสระของปลายตามรูปตาราง ปลายกลับอีกด้านเป็นระยะอ้างอิงจากพิกัด ไม่ตั้งชื่อมิติมาตรฐานใหม่ · R ศูนย์กลางได้จาก (B − ผิวนอก)/2 ไม่ระบุรัศมีอีกค่า</p><div className="form-grid"><Field label="A วงรีผิวนอก mm" type="number" value={A} onChange={v=>{setA(v);clear();}}/><Field label="B วงรีผิวนอก mm" type="number" value={B} onChange={v=>{setB(v);clear();}}/><Field label="C ปลายวงรี มิติอิสระ mm" type="number" value={C} onChange={v=>{setC(v);clear();}}/><label className="check"><input aria-label="ปลายกลับใช้ระยะเดียวกับ C" type="checkbox" checked={sameEnd} onChange={e=>{setSameEnd(e.target.checked);clear();}}/>ปลายกลับใช้ระยะเดียวกับ C</label>{!sameEnd&&<Field label="ปลายกลับอีกด้าน ระยะอ้างอิง mm" type="number" value={otherEnd} onChange={v=>{setOtherEnd(v);clear();}}/>}<button type="button" onClick={()=>{try{onChange(buildBSOvalLink(member,bar,spec,A,B,C,sameEnd?C:otherEnd));setError('');setCreated(true);}catch(e){setError((e as Error).message);setCreated(false);}}}>สร้างปลอก 33</button></div><p className="notice warning">แสดงแนวฉายสามครึ่งวงกลม ส่วนโค้งปิดปลายด้านขวาซ้อนกันตาม topology ที่รองรับ ไม่มีระยะยก/ขยับปลายจริง · สูตร Table 1 ไม่ใช้ C ต้องตรวจมิติอิสระให้สอดคล้องความยาวตัดและรายละเอียดการผลิตก่อนใช้ก่อสร้าง</p>{error&&<p role="alert" className="notice warning">{error}</p>}{created&&<p role="status" className="notice">สร้างแนวฉายรูป 33 แล้ว · ตรวจมิติ จำนวน ที่มาวัสดุ ตำแหน่ง และการปิดปลาย ก่อนบันทึก · ยังคงสถานะรอตรวจ</p>}</details>;
}
