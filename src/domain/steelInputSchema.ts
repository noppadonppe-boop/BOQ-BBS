import {z} from 'zod';

// Steel Structure (phase 4a): one member = one assembly (Tekla style): parts (main + secondary profiles / plates),
// bolts and welds. Quantity only: weight per profile, bolts, weld length and paint area become the member's BOQ items
// (`siteWork.items` ids `stl-*`); the A3 material / bolt list sheet is drawn from the same input.
export const steelCategories=['SteelAssembly'] as const;
export type SteelCategory=typeof steelCategories[number];
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),mm=z.number().finite().min(0).max(100000),text=(n:number)=>z.string().trim().max(n);
export const assemblyTypes=['column','beam','brace','purlin','truss','stair','other'] as const;
export const assemblyTypeLabels:Record<typeof assemblyTypes[number],string>={column:'เสา',beam:'คาน',brace:'ค้ำยัน (Bracing)',purlin:'แป / Girt',truss:'โครงถัก (Truss)',stair:'บันไดเหล็ก',other:'อื่น ๆ'};
export const steelPartSchema=z.object({id,mark:text(20).min(1),profile:text(60).min(1),grade:text(20),count:z.number().int().min(1).max(10000),length:z.number().finite().positive().max(30000),main:z.boolean(),
 /** kg per piece as listed (e.g. Tekla, net of cuts); absent = from the profile */
 weight:z.number().finite().min(0).max(100000).optional(),note:text(120).optional()}).strict();
export type SteelPart=z.infer<typeof steelPartSchema>;
export const steelBoltSchema=z.object({id,size:text(12).min(1),grade:text(20),length:mm,count:z.number().int().min(1).max(100000),hole:mm,note:text(120).optional()}).strict();
export type SteelBolt=z.infer<typeof steelBoltSchema>;
export const steelWeldSchema=z.object({id,type:z.enum(['fillet','butt']),size:z.number().finite().min(0).max(100),length:z.number().finite().positive().max(100000),count:z.number().int().min(1).max(100000),note:text(120).optional()}).strict();
export type SteelWeld=z.infer<typeof steelWeldSchema>;
export const steelInputSchema=z.object({kind:z.literal('assembly'),type:z.enum(assemblyTypes),name:text(120),parts:z.array(steelPartSchema).min(1).max(200),bolts:z.array(steelBoltSchema).max(50),welds:z.array(steelWeldSchema).max(50),
 /** paint system as one BOQ line over the painted area (empty = none) */
 paint:text(120)}).strict();
export type SteelInput=z.infer<typeof steelInputSchema>;
