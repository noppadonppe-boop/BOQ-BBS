import {z} from 'zod';
import {boqPricingSchema,priceKey} from '../../domain/boqPricingSchema';
import {priceItems,pricingReport} from '../../domain/boqPricing';
import {memberSchema,type SnapshotBundle} from '../../domain/model';
import {decodeStorage} from '../../domain/storageCodec';
import {projectRef,recordRef,projectTransaction,must,now,encode} from './common';
const inputSchema=z.object({memberId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),memberVersion:z.number().int().positive(),projectVersion:z.number().int().nonnegative(),pricing:boqPricingSchema.nullable()}).strict();
export async function saveDirectPricing(pid:string,data:Record<string,unknown>,requestId:string){
 const input=inputSchema.parse(data);
 return projectTransaction('savePricing',pid,data,requestId,['admin','qs'],async(tx,project)=>{
  must(project.version===input.projectVersion,'ข้อมูลโครงการเปลี่ยนแล้ว โหลดค่าล่าสุดก่อนบันทึกราคา','aborted');
  const ref=recordRef(pid,'members',input.memberId),snapshot=await tx.get(ref);must(snapshot.exists(),'ไม่พบสมาชิก','not-found');
  const member=memberSchema.parse(decodeStorage(snapshot.data()));must(member.version===input.memberVersion,'ข้อมูลสมาชิกเปลี่ยนแล้ว โหลดค่าล่าสุดก่อนบันทึกราคา','aborted');
  const active=new Set(priceItems(member,{project}).map(i=>i.key));must(!input.pricing?.entries.some(e=>!active.has(priceKey(e))),'รายการราคาไม่ตรงวัสดุ/ขนาดเหล็กปัจจุบัน','invalid-argument');
  const next={...member,status:'Draft' as const,version:member.version+1,updatedAt:now()};if(input.pricing)next.pricing=input.pricing;else delete next.pricing;
  // Verify the entire estimate, including arithmetic bounds, before committing.
  pricingReport({project,members:[next],status:'Draft'} as SnapshotBundle);
  const saved=encode(next);must(new TextEncoder().encode(JSON.stringify(saved)).length<=700000,'สมาชิกเกินขนาดเอกสาร แบ่งข้อมูลก่อนบันทึก');
  tx.set(ref,saved);tx.update(projectRef(pid),{version:project.version+1});return {version:next.version,projectVersion:project.version+1};
 });
}
