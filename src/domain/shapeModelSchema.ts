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
const base={
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),label:z.string().trim().min(1).max(80),
 /** solid = concrete; void = opening / pit / recess subtracted from the solids */
 role:z.enum(['solid','void']),
 /** pour stage (1 = first pour); overlaps belong to the lower stage */
 stage:z.number().int().min(1).max(9),
 z0:coord,height:len,
 /** formwork on the vertical faces of this part (openings: faces of the opening); bottom = soffit above the base */
 formSides:z.boolean(),formBottom:z.boolean(),
 /** where the dimensions come from (drawing / section / note) */
 source:z.string().max(200).default(''),
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
 if(!s.parts.some(p=>p.role==='solid'))c.addIssue({code:'custom',path:['parts'],message:'ต้องมีชิ้นส่วนคอนกรีตอย่างน้อย 1 ชิ้น'});
 s.parts.forEach((p,i)=>{
  if(p.shape==='circle'&&p.inner>=p.diameter)c.addIssue({code:'custom',path:['parts',i,'inner'],message:'Ø ใน ต้องน้อยกว่า Ø นอก'});
  if(p.shape==='shaft'&&2*p.wall>=Math.min(p.w,p.d))c.addIssue({code:'custom',path:['parts',i,'wall'],message:'ผนังปล่องหนาเกินครึ่งของขนาด'});
 });
});
export type ShapeModel=z.infer<typeof shapeModelSchema>;
export const shapeKindLabels:Record<ShapePart['shape'],string>={box:'กล่อง',polygon:'ยกหลายเหลี่ยม',circle:'ทรงกระบอก / ผนังกลม',shaft:'ปล่อง (สี่เหลี่ยม)'};
