import {useState} from 'react';
import type {Bar,Member,Spec} from '../domain/model';
import {bsGeneration} from '../domain/bs8666';
import {buildBSRectLink} from '../domain/bsRectLinkBuilder';
import {Field} from './EditorControls';
export function BSRectLinkBuilder({member,bar,spec,onChange}:{member:Member;bar:Bar;spec:Spec;onChange:(b:Bar)=>void}){
 const [A,setA]=useState(400),[B,setB]=useState(300),[C,setC]=useState(210),[r,setR]=useState(32),[error,setError]=useState(''),[created,setCreated]=useState(false);
 if(bsGeneration(spec)<7)return null;
 const clear=()=>{setError('');setCreated(false);};
 return <details className="bs-template rect-link-builder full"><summary>สร้างรูป 51 · เหล็กปลอกสี่เหลี่ยม</summary><p className="muted">A/B คือมิติผิวนอกของวงปลอก · C และ (D) คือมิติปลายตามรูปมาตรฐาน โดย D เท่ากับ C · รัศมีที่กรอกเป็นด้านใน</p><div className="form-grid"><Field label="A วงปลอกผิวนอก mm" type="number" value={A} onChange={v=>{setA(v);clear();}}/><Field label="B วงปลอกผิวนอก mm" type="number" value={B} onChange={v=>{setB(v);clear();}}/><Field label="C ปลายปลอก / D เท่ากับ C mm" type="number" value={C} onChange={v=>{setC(v);clear();}}/><Field label="r ด้านในรูป 51 mm" type="number" value={r} onChange={v=>{setR(v);clear();}}/><button type="button" onClick={()=>{try{onChange(buildBSRectLink(member,bar,spec,A,B,C,r));setError('');setCreated(true);}catch(e){setError((e as Error).message);setCreated(false);}}}>สร้างปลอก 51</button></div><p className="notice warning">แสดงแนวฉายการปิดปลายที่ซ้อนกันตามรูปตาราง ไม่มีการสร้างระยะยกหรือขยับปลายให้เอง ต้องตรวจรายละเอียดการปิดปลายและการผลิตก่อนใช้ก่อสร้าง</p>{error&&<p role="alert" className="notice warning">{error}</p>}{created&&<p role="status" className="notice">สร้างปลอกแล้ว · ตรวจ A/B/C/(D) จำนวน และตำแหน่ง ก่อนใช้ชุดเหล็กและบันทึกสมาชิก</p>}</details>;
}
