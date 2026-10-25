import type {Member,SnapshotBundle} from './model';
export type SourceQuantityBasis={quantity:number;memberVersion:number};
export function sourceComparisonQuantity(m:Member,b:Pick<SnapshotBundle,'sourceMemberQuantities'|'scope'>){
 if(m.sourceSchedule?.basis!=='allOccurrences')return undefined;
 const q=b.sourceMemberQuantities?.[m.id];
 if(!q){if(b.scope?.zone||b.scope?.floor||b.scope?.zoneUnassigned||b.scope?.floorUnassigned||b.scope?.building||b.scope?.wbsUnassigned)throw Error(`${m.code}: ชุดข้อมูลเก่าไม่มีจำนวนเต็มสมาชิกสำหรับเทียบตารางต้นทาง ใช้ไฟล์เดิมหรือเลือกชุดข้อมูลเต็ม`);return undefined;}
 const selected=m.occurrences.reduce((n,o)=>n+o.quantity,0);
 if(q.memberVersion!==m.version||!Number.isSafeInteger(q.quantity)||q.quantity<selected||q.quantity<=0)throw Error(`${m.code}: จำนวนอ้างอิงตารางต้นทางไม่ตรงรุ่นหรือขอบเขต`);
 return q.quantity;
}
