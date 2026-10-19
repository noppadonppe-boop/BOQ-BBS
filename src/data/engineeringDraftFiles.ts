import {canonical} from '../domain/canonical';
import {engineeringDraftSchema,ENGINEERING_DRAFT_MAX_BYTES,type EngineeringDraft} from '../domain/engineeringDraft';
import {digestData} from './snapshots';
export async function encodeEngineeringDraft(body:EngineeringDraft){
 const parsed=engineeringDraftSchema.parse(body),contentDigest=await digestData(parsed),text=JSON.stringify({body:parsed,contentDigest},null,2);
 if(new TextEncoder().encode(text).length>ENGINEERING_DRAFT_MAX_BYTES)throw Error('ไฟล์เตรียมตรวจใหญ่เกิน1MB แบ่งข้อมูลสมาชิกก่อนเตรียมกรณี');
 return text;
}
export async function decodeEngineeringDraft(text:string){
 if(new TextEncoder().encode(text).length>ENGINEERING_DRAFT_MAX_BYTES)throw Error('ไฟล์เตรียมตรวจใหญ่เกิน1MB');
 let value:unknown;try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('ไฟล์เตรียมตรวจไม่ใช่ JSON ที่อ่านได้');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('โครงสร้างไฟล์เตรียมตรวจไม่ถูกต้อง');
 const raw=value as Record<string,unknown>;
 if(Object.keys(raw).sort().join(',')!=='body,contentDigest'||typeof raw.contentDigest!=='string'||!/^[a-f0-9]{64}$/.test(raw.contentDigest))throw Error('ไฟล์นี้ไม่ใช่ไฟล์เตรียมตรวจรุ่นที่รองรับ');
 const parsed=engineeringDraftSchema.safeParse(raw.body);
 if(!parsed.success||canonical(parsed.data)!==canonical(raw.body))throw Error('ข้อมูลไฟล์เตรียมตรวจไม่ครบหรือมีช่องที่ไม่รองรับ');
 if(await digestData(parsed.data)!==raw.contentDigest)throw Error('ไฟล์เตรียมตรวจ checksum ไม่ตรง อาจเปลี่ยนหลังบันทึก');
 return parsed.data;
}
