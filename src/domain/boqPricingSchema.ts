import {z} from 'zod';
export const priceKinds=['concrete','formwork','excavation','backfill','lean','rebar'] as const;
export type PriceKind=typeof priceKinds[number];
export const decimalRate=z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/,'ราคาต้องเป็นตัวเลขตั้งแต่0 ใช้ทศนิยมได้6ตำแหน่ง').refine(s=>s.replace('.','').replace(/^0+/,'').replace(/0+$/,'').length<=15,'ราคาเกินความละเอียด15หลักที่ Excel รองรับ');
export const priceEntrySchema=z.object({kind:z.enum(priceKinds),diameter:z.number().finite().positive().max(100).optional(),grade:z.string().min(1).max(40).optional(),rate:decimalRate.nullable(),source:z.string().trim().max(250),note:z.string().max(500)}).strict().superRefine((e,c)=>{
 if(e.kind==='rebar'&&(!e.diameter||!e.grade)||e.kind!=='rebar'&&(e.diameter!==undefined||e.grade!==undefined))c.addIssue({code:'custom',message:'รายการเหล็กต้องระบุขนาด/เกรด และรายการอื่นต้องไม่ระบุ'});
 if(e.rate!==null&&!e.source)c.addIssue({code:'custom',path:['source'],message:'ราคาที่กรอกต้องมีที่มาราคา'});
});
export const costComponents=['material','labor'] as const;
export type CostComponent='combined'|typeof costComponents[number];
const componentEntrySchema=z.object({kind:z.enum(priceKinds),diameter:z.number().finite().positive().max(100).optional(),grade:z.string().min(1).max(40).optional(),component:z.enum(costComponents),rate:decimalRate.nullable(),source:z.string().trim().max(250),note:z.string().max(500)}).strict().superRefine((e,c)=>{
 if(e.kind==='rebar'&&(!e.diameter||!e.grade)||e.kind!=='rebar'&&(e.diameter!==undefined||e.grade!==undefined))c.addIssue({code:'custom',message:'รายการเหล็กต้องระบุขนาด/เกรด และรายการอื่นต้องไม่ระบุ'});
 if(e.rate!==null&&!e.source)c.addIssue({code:'custom',path:['source'],message:'ราคาที่กรอกต้องมีที่มาราคา'});
});
export type PriceEntry=z.infer<typeof priceEntrySchema>|z.infer<typeof componentEntrySchema>;
export const priceKey=(e:Pick<PriceEntry,'kind'|'diameter'|'grade'>)=>JSON.stringify([e.kind,...(e.kind==='rebar'?[e.diameter,e.grade]:[])]);
export const entryComponent=(e:PriceEntry):CostComponent=>'component' in e?e.component:'combined';
export const priceEntryKey=(e:PriceEntry)=>JSON.stringify([priceKey(e),entryComponent(e)]);
const basis={currency:z.string().regex(/^[A-Z]{3}$/,'ระบุรหัสสกุลเงิน3ตัวอักษร'),quantityDecimals:z.number().int().min(0).max(6),amountDecimals:z.number().int().min(0).max(4),note:z.string().max(1000)};
const pricingV1=z.object({version:z.literal(1),...basis,entries:z.array(priceEntrySchema).max(305)}).strict().superRefine((p,c)=>{if(new Set(p.entries.map(priceKey)).size!==p.entries.length)c.addIssue({code:'custom',message:'รายการราคาซ้ำ'});});
const pricingV2=z.object({version:z.literal(2),...basis,entries:z.array(componentEntrySchema).max(610)}).strict().superRefine((p,c)=>{if(new Set(p.entries.map(priceEntryKey)).size!==p.entries.length)c.addIssue({code:'custom',message:'รายการราคา/ส่วนประกอบซ้ำ'});});
export const boqPricingSchema=z.union([pricingV1,pricingV2]);
export type BoqPricing=z.infer<typeof boqPricingSchema>;
