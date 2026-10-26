import {z} from 'zod';

// Architecture Work (phase 3a): rooms (finish schedule) and doors / windows. Quantity only: the input becomes the
// member's BOQ items (`siteWork.items` ids `arch-*`), so every report, pricing and the owner BOQ take them as they are.
export const archCategories=['Room','Opening','MasonryWall','Roof'] as const;
export type ArchCategory=typeof archCategories[number];
const mm=z.number().finite().min(0).max(200000),id=z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),code=z.string().trim().max(20);

/** Finish library of the spec (General Spec → คลังวัสดุผิว): a code per face kind, BOQ items per m² (m for skirting);
 * masonry = wall types (per m² of net wall, both faces' plaster as factor 2), roof = coverings (per m² of roof slope). */
export const finishKinds=['floor','skirting','wall','ceiling','masonry','roof'] as const;
export type FinishKind=typeof finishKinds[number];
export const finishKindLabels:Record<FinishKind,string>={floor:'พื้น',skirting:'บัว',wall:'ผนัง',ceiling:'ฝ้า',masonry:'ผนังก่อ',roof:'หลังคา'};
export const finishItemSchema=z.object({id,label:z.string().trim().min(1).max(120),unit:z.string().trim().min(1).max(12),factor:z.number().finite().min(0).max(1000)}).strict();
export const finishSchema=z.object({id,code:code.min(1),kind:z.enum(finishKinds),name:z.string().trim().min(1).max(120),items:z.array(finishItemSchema).max(6)}).strict();
export type Finish=z.infer<typeof finishSchema>;
export const finishesSchema=z.array(finishSchema).max(300).superRefine((list,ctx)=>{const seen=new Set<string>();list.forEach((f,i)=>{const k=`${f.kind}|${f.code.toUpperCase()}`;if(seen.has(k))ctx.addIssue({code:'custom',path:[i,'code'],message:`รหัส${finishKindLabels[f.kind]} ${f.code} ซ้ำ`});seen.add(k);});});

/** Opening in a room wall (deducted from the wall finish; doors also from the skirting). */
export const roomOpeningSchema=z.object({code:code.min(1),door:z.boolean(),width:mm,height:mm,count:z.number().int().min(0).max(1000)}).strict();
export type RoomOpening=z.infer<typeof roomOpeningSchema>;
export const openingItemSchema=z.object({id,label:z.string().trim().min(1).max(120),unit:z.string().trim().min(1).max(12),basis:z.enum(['set','area','perimeter']),factor:z.number().finite().min(0).max(1000)}).strict();
export type OpeningItem=z.infer<typeof openingItemSchema>;
export const archInputSchema=z.discriminatedUnion('kind',[
 /** room: size by width × length or measured area / perimeter (> 0 overrides), ceiling height; finish codes per face,
  * optional dado (lower wall finish up to a height); openings deducted from the wall / skirting */
 z.object({kind:z.literal('room'),name:z.string().trim().max(120),width:mm,length:mm,area:z.number().finite().min(0).max(1e6),perimeter:z.number().finite().min(0).max(1e5),height:mm,
  floor:code,skirting:code,wall:code,ceiling:code,dado:z.object({finish:code.min(1),height:mm}).strict().optional(),openings:z.array(roomOpeningSchema).max(40)}).strict(),
 /** door / window type of the schedule: size, description, BOQ items per set / opening area / frame length */
 z.object({kind:z.literal('opening'),type:z.enum(['door','window']),width:z.number().finite().positive().max(20000),height:z.number().finite().positive().max(20000),description:z.string().trim().max(200),items:z.array(openingItemSchema).max(10)}).strict(),
 /** masonry wall run: length × height − openings, wall type code; stiffener columns at the ends, at ≤ spacing and beside
  * openings (optional), lintels over openings (+ bearing each side), horizontal tie beams (count over the length) */
 z.object({kind:z.literal('wall'),length:z.number().finite().positive().max(200000),height:z.number().finite().positive().max(20000),thickness:mm,type:code,openings:z.array(roomOpeningSchema).max(40),
  stiffenerSpacing:mm,stiffenersAtOpenings:z.boolean(),lintelBearing:mm,tieBeams:z.number().int().min(0).max(10)}).strict(),
 /** roof: plan area (width × length or measured), pitch (°) → slope area; covering code; ridge / eave / verge lengths (m) */
 z.object({kind:z.literal('roof'),width:mm,length:mm,area:z.number().finite().min(0).max(1e6),pitch:z.number().finite().min(0).max(75),covering:code,ridge:z.number().finite().min(0).max(1e5),eave:z.number().finite().min(0).max(1e5),verge:z.number().finite().min(0).max(1e5)}).strict(),
]);
export type ArchInput=z.infer<typeof archInputSchema>;
export type RoomInput=Extract<ArchInput,{kind:'room'}>;
export type OpeningInput=Extract<ArchInput,{kind:'opening'}>;
export type WallInput=Extract<ArchInput,{kind:'wall'}>;
export type RoofInput=Extract<ArchInput,{kind:'roof'}>;
