import type {SnapshotBundle} from './model';
import {quantityBasisState,quantityBasisEnglish} from './quantityBasis';
export const FABRICATION_INPUT_REVIEW_POLICY='fabrication-input-review-1.0';
export function fabricationInputReview(b:Pick<SnapshotBundle,'members'|'status'>){
 const rows=b.members.map(m=>({member:m,state:quantityBasisState(m),label:quantityBasisEnglish(m),quantity:m.occurrences.reduce((n,o)=>n+o.quantity,0)})),pending=rows.filter(r=>r.state==='Provisional');
 if(pending.length&&(b.status==='Issued'||b.status==='Superseded'))throw Error('ฉบับ Issued/Superseded มีข้อมูลปริมาณชั่วคราว ต้องตรวจความสอดคล้องของประวัติ ห้ามสร้างไฟล์ผลิตใหม่');
 return {policy:FABRICATION_INPUT_REVIEW_POLICY,rows,pending,complete:!pending.length};
}
