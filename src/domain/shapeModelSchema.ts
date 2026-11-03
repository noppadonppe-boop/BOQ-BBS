import {z} from 'zod';

// Custom element shape model: concrete built from vertical parts (each a plan shape extruded from
// level z0 by height), combined by union; voids are subtracted. Parts of different kinds mix freely.
// Coordinates are member-local mm (plan X/Y, level Z); the applied model is normalised so the
// lowest concrete corner is at 0,0,0. Piles and earthwork are carried for takeoff and drawings.
export const SHAPE_MODEL_VERSION=1 as const;
const coord=z.number().finite().min(-200000).max(200000);
const len=z.number().finite().positive().max(200000);
const mm=z.number().finite().min(0).max(200000);
const pt=z.tuple([coord,coord]);
export const shapeKinds=['box','polygon','circle','shaft'] as const;
export const rebarNoteFaces=['B','T','EF','LOOP','ADD','NOTE'] as const;
export type RebarNoteFace=typeof rebarNoteFaces[number];
/** What a part is for: picks the preset bar sets (`partRebar.ts`); other = drawn by hand only. */
export const partPurposes=['column','beam','slab','wall','footing','other'] as const;
export type PartPurpose=typeof partPurposes[number];
export const partPurposeLabels:Record<PartPurpose,string>={column:'เสา / ตอม่อ',beam:'คาน',slab:'พื้น',wall:'ผนัง',footing:'ฐานราก',other:'อื่นๆ (วาดเอง)'};
const dia=z.number().finite().positive().max(60);
/** bar size + spacing (0 = layer not used) / bar size + count */
const barAt=z.object({d:dia,s:mm}).strict(),barN=z.object({d:dia,n:z.number().int().min(0).max(40)}).strict();
/** Preset reinforcement of one part; bars `pp-<part id>-…` are rebuilt from it whenever the part changes.
 * column: main (bars per X / Y face incl. corners) + ties, ext above the top, anchor = 90° feet in the part below;
 * beam: top / bottom bars along the longer plan side + stirrups, ext past both ends; slab: meshB / meshT both ways;
 * wall: vert / horz per face (layers 1 | 2), ext above the top, anchor = feet on the bottom mesh of the part below; footing: meshB (legs = bent up) / meshT + loops. */
export const partRebarSchema=z.object({
 purpose:z.enum(partPurposes),cover:mm.optional(),
 main:z.object({d:dia,nx:z.number().int().min(2).max(20),ny:z.number().int().min(2).max(20)}).strict().optional(),tie:barAt.optional(),
 top:barN.optional(),bottom:barN.optional(),stirrup:barAt.optional(),
 meshB:barAt.optional(),meshT:barAt.optional(),legs:z.boolean().optional(),loops:barAt.optional(),
 /** footing loops run round the joined outline of touching footing parts at the same base level (built by the first of them) */
 loopsJoined:z.boolean().optional(),
 vert:barAt.optional(),horz:barAt.optional(),layers:z.union([z.literal(1),z.literal(2)]).optional(),
 ext:mm.optional(),anchor:z.boolean().optional(),
}).strict();
export type PartRebar=z.infer<typeof partRebarSchema>;
/** Tag no. of a part / bar group: names it on the drawings, prefixes its Marks (`F-01/01`) and splits the BBS sheets. */
export const TAG_RE=/^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/;
const tag=z.string().regex(TAG_RE,'Tag no. ใช้ A–Z 0–9 และ - ไม่เกิน 16 ตัว');
const base={
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),label:z.string().trim().min(1).max(80),tag:tag.optional(),
 /** solid = concrete; void = opening / pit / recess subtracted from the solids;
  * reference = a column / wall above this element cast later (no concrete / formwork here; its starter bars
  * and dowels may run inside it: placement region `genref-<id>`) */
 role:z.enum(['solid','void','reference']),
 /** pour stage (1 = first pour); overlaps belong to the lower stage */
 stage:z.number().int().min(1).max(9),
 z0:coord,height:len,
 /** formwork on the vertical faces of this part (openings: faces of the opening); bottom = soffit above the base */
 formSides:z.boolean(),formBottom:z.boolean(),
 /** where the dimensions come from (drawing / section / note) */
 source:z.string().max(200).default(''),
 /** purpose + preset bars of this part */
 rebar:partRebarSchema.optional(),
};
export const shapePartSchema=z.discriminatedUnion('shape',[
 z.object({...base,shape:z.literal('box'),x:coord,y:coord,w:len,d:len}).strict(),
 z.object({...base,shape:z.literal('polygon'),points:z.array(pt).min(3).max(64)}).strict(),
 /** circle: inner = 0 solid cylinder; inner > 0 ring wall (circular wall / round shaft / tank) */
 z.object({...base,shape:z.literal('circle'),cx:coord,cy:coord,diameter:len,inner:mm}).strict(),
 /** rectangular shaft: walls of thickness `wall` around an open core (lift / duct shaft) */
 z.object({...base,shape:z.literal('shaft'),x:coord,y:coord,w:len,d:len,wall:len}).strict(),
]);
export type ShapePart=z.infer<typeof shapePartSchema>;
export const shapePilesSchema=z.object({
 type:z.enum(['round','square']),size:len,
 /** ordered pile length (m), cut-off per pile (mm), embedment of the head into the concrete (mm) */
 length:z.number().finite().min(0).max(200),cutoff:mm,embed:mm,
 positions:z.array(pt).max(100),
}).strict();
export const shapeSiteSchema=z.object({
 /** excavation depth below the ground line, working space each side, side slope H:V, lean layer */
 excavationDepth:mm,workingSpace:mm,slope:z.number().finite().min(0).max(5),leanThickness:mm,leanProjection:mm,
}).strict();
export const shapeModelSchema=z.object({
 version:z.literal(SHAPE_MODEL_VERSION),
 parts:z.array(shapePartSchema).min(1).max(40),
 piles:shapePilesSchema.optional(),
 site:shapeSiteSchema.optional(),
 /** bar groups: several parts reinforced as one (bars drawn on the group `sk-<group id>-…` run across its parts) */
 groups:z.array(z.object({id:z.string().regex(/^g[a-zA-Z0-9_-]{1,39}$/),tag,label:z.string().trim().min(1).max(80),parts:z.array(z.string().max(40)).min(2).max(40)}).strict()).max(20).optional(),
 /** reinforcement notes read from the drawings (AI or typed), used to suggest bar sets */
 rebarNotes:z.array(z.object({text:z.string().trim().min(1).max(120),meaning:z.string().max(200).default(''),source:z.string().max(200).default(''),
  /** where the AI placed the note: part id, face (B/T/EF/LOOP/ADD/NOTE) and direction */
  partId:z.string().max(40).optional(),face:z.enum(rebarNoteFaces).optional(),dir:z.enum(['X','Y','XY','V']).optional()}).strict()).max(60).optional(),
 /** reinforcement data the drawings do not give (AI questions), answered before bars are confirmed */
 rebarQuestions:z.array(z.string().trim().min(1).max(300)).max(30).optional(),
 /** user confirmed every dimension against the drawings */
 confirmed:z.boolean(),
 note:z.string().max(1000).default(''),
}).strict().superRefine((s,c)=>{
 if(new Set(s.parts.map(p=>p.id)).size!==s.parts.length)c.addIssue({code:'custom',path:['parts'],message:'รหัสชิ้นส่วนซ้ำ'});
 const tags=[...s.parts.flatMap(p=>p.tag?[p.tag.toUpperCase()]:[]),...(s.groups||[]).map(g=>g.tag.toUpperCase())];
 if(new Set(tags).size!==tags.length)c.addIssue({code:'custom',path:['parts'],message:'Tag no. ซ้ำ'});
 const ids=new Set(s.parts.map(p=>p.id));
 (s.groups||[]).forEach((g,i)=>{if(ids.has(g.id))c.addIssue({code:'custom',path:['groups',i,'id'],message:'รหัสกลุ่มซ้ำกับชิ้นส่วน'});if(g.parts.some(p=>!ids.has(p)))c.addIssue({code:'custom',path:['groups',i,'parts'],message:`กลุ่ม ${g.tag}: มีชิ้นส่วนที่ไม่มีในโมเดล`});});
 if(!s.parts.some(p=>p.role==='solid'))c.addIssue({code:'custom',path:['parts'],message:'ต้องมีชิ้นส่วนคอนกรีตอย่างน้อย 1 ชิ้น'});
 s.parts.forEach((p,i)=>{
  if(p.shape==='circle'&&p.inner>=p.diameter)c.addIssue({code:'custom',path:['parts',i,'inner'],message:'Ø ใน ต้องน้อยกว่า Ø นอก'});
  if(p.shape==='shaft'&&2*p.wall>=Math.min(p.w,p.d))c.addIssue({code:'custom',path:['parts',i,'wall'],message:'ผนังปล่องหนาเกินครึ่งของขนาด'});
 });
});
export type ShapeModel=z.infer<typeof shapeModelSchema>;
export const shapeKindLabels:Record<ShapePart['shape'],string>={box:'กล่อง',polygon:'ยกหลายเหลี่ยม',circle:'ทรงกระบอก / ผนังกลม',shaft:'ปล่อง (สี่เหลี่ยม)'};
