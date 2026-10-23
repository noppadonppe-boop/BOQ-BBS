import {z} from 'zod';
import {aiCommandSchema,buildAiDraft} from './aiModelTools';
import type {Spec} from './model';
export const sheetRegionSchema=z.object({page:z.number().int().min(1).max(9999),kind:z.enum(['plan','section','elevation','detail','notes','schedule']),label:z.string().max(200),box:z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().positive().max(1),z.number().positive().max(1)])}).strict().refine(r=>r.box[0]+r.box[2]<=1.001&&r.box[1]+r.box[3]<=1.001,'กรอบภาพเกินหน้า');
export const sheetGroupSchema=z.object({code:z.string().trim().min(1).max(50),label:z.string().max(200),regions:z.array(sheetRegionSchema).min(1).max(24),warnings:z.array(z.string().max(500)).max(50)}).strict();
export type SheetGroup=z.infer<typeof sheetGroupSchema>;
export const sheetDetailSchema=z.object({code:z.string().min(1).max(50),summary:z.string().max(3000),dimensions:z.object({x:z.number().positive().nullable(),y:z.number().positive().nullable(),z:z.number().positive().nullable(),excavationDepth:z.number().nonnegative().nullable()}).strict(),evidence:z.array(z.object({page:z.number().int().positive(),field:z.string().max(80),quote:z.string().min(1).max(500)}).strict()).max(200),missing:z.array(z.string().max(500)).max(100),conflicts:z.array(z.string().max(500)).max(100),warnings:z.array(z.string().max(500)).max(100),commands:z.array(aiCommandSchema).max(80)}).strict();
export type SheetDetail=z.infer<typeof sheetDetailSchema>;
export function buildSheetDraft(detail:SheetDetail,code:string,spec:Spec){
 const r=sheetDetailSchema.parse(detail);
 if(r.missing.length||r.conflicts.length)throw Error([...r.missing,...r.conflicts].join('\n'));
 if(!r.evidence.length)throw Error('ยังไม่มีหลักฐานมิติ');
 const draft=buildAiDraft(code,r.commands,spec);
 for(const axis of ['x','y','z'] as const){const v=r.dimensions[axis];if(v===null||Math.abs(draft.member[axis]-v)>1)throw Error(`มิติ ${axis.toUpperCase()} ของโมเดลไม่ตรงกับข้อสรุปจากแบบ`);}
 return draft;
}
export function mergeSheetGroups(groups:SheetGroup[]){
 const merged=new Map<string,SheetGroup>();
 for(const raw of groups){const g=sheetGroupSchema.parse(raw),key=g.code.trim().toUpperCase(),old=merged.get(key);if(old){merged.set(key,sheetGroupSchema.parse({...old,regions:[...old.regions,...g.regions],warnings:[...old.warnings,...g.warnings]}));}else merged.set(key,g);}
 return [...merged.values()];
}
