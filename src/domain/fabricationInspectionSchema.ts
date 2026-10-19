import {z} from 'zod';

const mm=z.number().finite().positive().max(200000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;},'วันที่ตรวจวัดไม่ถูกต้อง');
export const fabricationInspectionSchema=z.object({
 version:z.literal(1),id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
 pieceReference:z.string().trim().min(1).max(80),inspectedOn:date,
 observer:z.string().trim().min(1).max(80),source:z.string().trim().min(1).max(500),
 nominalBasis:z.string().min(1).max(20000),measuredCut:mm,
 measuredDimensions:z.record(z.string().regex(/^[A-Z]$/),mm),
 measuredInnerRadius:mm.optional(),note:z.string().max(500),
}).strict();
export const fabricationInspectionsSchema=z.array(fabricationInspectionSchema).max(20).superRefine((records,ctx)=>{
 const ids=new Set<string>(),pieces=new Set<string>();
 records.forEach((r,i)=>{const piece=r.pieceReference.toLocaleUpperCase('en-US');if(ids.has(r.id)||pieces.has(piece))ctx.addIssue({code:'custom',path:[i],message:'รหัสผลวัดหรือรหัสชิ้นซ้ำใน Mark นี้'});ids.add(r.id);pieces.add(piece);});
});
export type FabricationInspection=z.infer<typeof fabricationInspectionSchema>;
