import type {Spec} from './model';
import type {schedule} from './engine';
import {BS2000,bsEnabled} from './bs8666';

export const BS_TOLERANCE_REFERENCE={
 id:'bs8666-2000-table4-reference-1.0',
 source:'BS 8666:2000 + Amd 1/2 / clause 9 / Table 4 / printed p.13 (PDF p.17)',
 sha256:BS2000.sha256,
} as const;
export type ToleranceRange={nominal:number;minus:number;plus:number;lower:number;upper:number};
export function toleranceRange(nominal:number,kind:'cut'|'bend'):ToleranceRange{
 if(!Number.isFinite(nominal)||nominal<=0)throw Error('ระบุมิติอ้างอิงที่เป็นค่าบวกและไม่เกินช่วงตัวเลข');
 const plus=kind==='cut'?25:5,minus=kind==='cut'?25:nominal<=1000?5:nominal<=2000?10:25;
 const lower=nominal-minus,upper=nominal+plus;
 if(!Number.isFinite(upper))throw Error('ช่วงค่าคลาดเคลื่อนเกินช่วงตัวเลข');
 if(Math.abs((upper-nominal)-plus)>1e-6||Math.abs((nominal-lower)-minus)>1e-6)throw Error('ค่ามิติเกินความละเอียดที่แสดงค่าคลาดเคลื่อนได้');
 return {nominal,minus,plus,lower,upper};
}

// Informational ranges for the supplied edition. Never add tolerances to a cut,
// infer an aggregate allowance, move a free leg, or establish fabrication approval.
export function bsToleranceReference(spec:Spec,row:ReturnType<typeof schedule>[number]){
 if(!bsEnabled(spec))return null;
 const a=row.standard,notes:string[]=[];
 const valid=(n:number)=>Number.isFinite(n)&&n>0;
 let cut:ToleranceRange|null=null;
 if(valid(row.cutLength)){try{cut=toleranceRange(row.cutLength,'cut');}catch{notes.push('ค่าความยาวตัดเกินความละเอียดที่แสดงช่วงได้ ไม่แสดงขอบเขตที่คลาดเคลื่อน');}}
 else notes.push('ความยาวตัดยังไม่ถูกต้อง ไม่แสดงช่วงอ้างอิงจนกว่าจะแก้ข้อมูล');
 const ends:Record<string,string[]>={'33':['C'],'51':['C','D'],'13':['A','C'],'11':['A','B'],'12':['A','B'],'21':['A','C'],'31':['A','D'],'41':['A','E'],'44':['A','E'],'15':['A','C'],'25':['A','B'],'26':['A','C'],'46':['A','E']};
 const dimensions=a.formula&&a.hasBends&&!a.arc&&!a.helix?a.dimensions.filter(d=>valid(d.value)).map(d=>({
  label:d.label,free:d.free,...toleranceRange(d.value,'bend'),
  endMinimum:ends[row.shapeCode.trim()]?.includes(d.label)?a.min?.endDimension:undefined,
 })):[];
 if(cut&&cut.lower<=0)notes.push('ขอบล่างความยาวตัดไม่เป็นบวก ต้องตรวจกรณีนี้ก่อนใช้งาน');
 if(row.cutOverride>0)notes.push('ความยาวตัดระบุเองยังรอตรวจจากแบบ ช่วงนี้ไม่รับรองค่าที่ระบุ');
 if(row.errors.length||a.problems.length)notes.push('Mark นี้มีรายการรอตรวจขั้นต่ำ ช่วงอ้างอิงไม่ทำให้ผ่านการตรวจ');
 if(a.helix)notes.push('รูป 77: C เป็นจำนวนรอบ ไม่ใช่ mm; A/B เป็นวงเส้นผ่านศูนย์กลาง/ระยะต่อรอบ ยังไม่กำหนดช่วงดัดให้อัตโนมัติ');
 else if(a.arc)notes.push('รูป 67: A เป็นความยาวแนวศูนย์กลาง\nR เป็นรัศมีด้านใน ไม่ใช่มิติผิวนอก\nยังไม่กำหนดช่วงดัดให้ A/R อัตโนมัติ');
 else if(a.hasBends&&!dimensions.length||row.shapeCode.trim()==='99')notes.push('มิติผิวนอกของรูปนี้ยังไม่รองรับ ไม่ใช้ Lxx/พิกัด/มิติที่เสนอแทนมิติดัดที่รับรอง');
 if(dimensions.some(d=>d.endMinimum!==undefined&&d.lower<d.endMinimum))notes.push('ช่วงขอบล่างของมิติปลายต่ำกว่า Table 3 ต้องให้ผู้ตรวจพิจารณาร่วมกับข้อกำหนดการผลิต');
 if(dimensions.some(d=>d.free))notes.push(a.semicircle?'วงเล็บคือมิติอิสระตาม Table 1\nยังไม่ชดเชยค่าคลาดเคลื่อนสะสม\nไม่ปรับ geometry หรือยาวตัด':'วงเล็บระบุมิติอิสระตาม Table 1; ยังไม่คำนวณการรับค่าคลาดเคลื่อนสะสมหรือปรับ geometry/ยาวตัด');
 notes.push(a.semicircle||a.arc?'Table 4 เป็นช่วงอ้างอิงรายมิติ\nยังไม่ใช่ผลตรวจเหล็กที่ผลิตจริง\nไม่รวม tolerance stack หรือ ACI\nยังรออนุมัติวิศวกรรม':'ช่วงอ้างอิง Table 4 ไม่ใช่ผลตรวจเหล็กที่ผลิตจริง ไม่รวม tolerance stack, ACI หรือการอนุมัติวิศวกรรม');
 return {reference:BS_TOLERANCE_REFERENCE,cut,dimensions,notes};
}
