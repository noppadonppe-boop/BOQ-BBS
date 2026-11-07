import {z} from 'zod';

// Wall Run (docs/WALL_RUN.md): one Wall member = a wall axis on plan (straight / L / U / box / T / drawn) over levels and
// pour lifts. Stored in `elementInput.run` of a Wall input with `layout: 'run'`; the old straight wall (`layout: 'single'`)
// keeps its fields and results. Kept free of runtime imports from elementInput (that module imports this one).
export const WALL_RUN_VERSION=1 as const;
export const wallTypes=['tank','lift','general','retaining'] as const;
export type WallType=typeof wallTypes[number];
export const wallTypeLabels:Record<WallType,string>={tank:'ผนังบ่อน้ำ / ถังเก็บน้ำ',lift:'ผนังลิฟต์ / แกนบันได',general:'ผนัง RC ทั่วไป / Shear wall',retaining:'ผนังกันดิน'};
/** wall types of the next rounds (shown on the type picker, not selectable yet) */
export const wallTypesLater=['ผนังกันดินแบบมีค้ำ (Counterfort)','ผนังห้องใต้ดิน (Basement)','ผนังรับแรงเฉือนแบบมีคาน coupling','ผนังโค้ง / ถังกลม'] as const;

const mm=z.number().finite().min(0).max(200000);
const len=z.number().finite().min(1).max(200000);
const dia=z.number().finite().min(0).max(60);
const coord=z.number().finite().min(-200000).max(200000);
const id=z.string().regex(/^[A-Za-z0-9_-]{1,16}$/,'รหัสใช้ A–Z 0–9 _ - ไม่เกิน 16 ตัว');
/** bar size @ spacing (spacing 0 = none) */
export const wallMeshSchema=z.object({diameter:dia,spacing:mm}).strict();
export type WallMesh=z.infer<typeof wallMeshSchema>;
/** number of bars × size */
export const wallCountBarSchema=z.object({count:z.number().int().min(0).max(40),diameter:dia}).strict();
export type WallCountBar=z.infer<typeof wallCountBarSchema>;
const faceMesh=z.object({vertical:wallMeshSchema,horizontal:wallMeshSchema}).strict();
const slabMesh=z.object({top:wallMeshSchema,bottom:wallMeshSchema}).strict();

/** One straight piece of the wall axis: length along the axis, thickness, turn (degrees, + = left) to the next segment
 * (closed path: the last turn closes back to the first segment). */
export const wallSegmentSchema=z.object({id,length:len,thickness:z.number().finite().min(100).max(3000),turn:z.number().finite().min(-179).max(179)}).strict();
export type WallSegment=z.infer<typeof wallSegmentSchema>;
/** T junction: a branch wall leaves segment `fromSegment` at `at` mm along its axis to the left / right side; `length`
 * from the main wall axis to the free end. */
export const wallBranchSchema=z.object({id,fromSegment:z.string().max(16),at:mm,side:z.enum(['L','R']),length:len,thickness:z.number().finite().min(100).max(3000)}).strict();
export type WallBranch=z.infer<typeof wallBranchSchema>;
/** Storey / level: bottom and top of the wall in this level (m), pour lifts inside it (equal heights), optional thickness of
 * every segment in this level (0 / absent = the segment thickness; the axis stays, both faces step). */
export const wallLevelSchema=z.object({id,name:z.string().trim().min(1).max(20),bottom:z.number().finite().min(-1000).max(1000),top:z.number().finite().min(-1000).max(1000),
 lifts:z.number().int().min(1).max(6),thickness:z.number().finite().min(0).max(3000).optional()}).strict();
export type WallLevel=z.infer<typeof wallLevelSchema>;
export const wallOpeningSchema=z.object({id,label:z.string().max(40),segment:z.string().max(16),
 /** through = hole through the wall; out / in = recess from the outer / inner face `depth` deep */
 face:z.enum(['out','in','through']),
 /** x along the segment axis from its start, z from the bottom of `level` (mm) */
 x:mm,z:mm,w:len,h:len,level:z.string().max(16).optional(),depth:mm.optional(),
 /** the same opening at the same place in every listed level (lift doors): one bar set, count × levels */
 repeat:z.object({levels:z.array(z.string().max(16)).max(12)}).strict().optional(),
 /** trimming bars per face per side, past the corners by ext (Ld / lap / mm), diagonals at the corners */
 trim:z.object({count:z.number().int().min(0).max(6),diameter:dia,ext:z.union([z.literal('ld'),z.literal('lap'),mm]),diagonal:z.boolean()}).strict()}).strict();
export type WallOpening=z.infer<typeof wallOpeningSchema>;
export const wallTankSchema=z.object({
 /** bottom slab under the walls: thickness, projection past the outer face, top / bottom mesh both ways */
 bottom:z.object({thickness:z.number().finite().min(100).max(3000),projection:mm,rebar:slabMesh}).strict(),
 /** cover slab on the walls (null = open tank) with manholes (plan x, y = lower-left corner in plan coordinates) */
 cover:z.object({thickness:z.number().finite().min(100).max(1500),rebar:slabMesh,manholes:z.array(z.object({x:coord,y:coord,w:len,h:len}).strict()).max(6)}).strict().nullable().optional(),
 /** haunch at the wall / bottom slab inner corner (size = leg of the 45° fillet), diagonal bars at the wall spacing;
  * barEnd (W2a) centre = bar ends at the wall centre / slab mid-depth (≥ 150 past the faces, default of new walls),
  * ld = Ld past both faces cut at the opposite cover (absent = ld: members saved before W2a keep their steel) */
 haunch:z.object({size:z.number().finite().min(0).max(600),barEnd:z.enum(['centre','ld']).optional()}).strict().optional(),
 /** pipe sleeves through the walls: BOQ items + trimming bars (x along the segment, z above the wall base) */
 sleeves:z.array(z.object({segment:z.string().max(16),x:mm,z:mm,dia:z.number().finite().min(20).max(1500)}).strict()).max(20).optional(),
}).strict();
export const wallLiftPitSchema=z.object({depth:z.number().finite().min(300).max(5000),bottomThickness:z.number().finite().min(150).max(2000),rebar:slabMesh}).strict();
export const wallRetainingSchema=z.object({
 toe:mm,heel:mm,baseThickness:z.number().finite().min(200).max(3000),
 key:z.object({width:len,depth:len}).strict().optional(),
 /** soil side of the stem: out = outer face (right of the axis for an open path) */
 soilSide:z.enum(['out','in']),
 /** main soil-face bars: alternate groups stop at these fractions of the stem height (+ Ld) */
 curtail:z.array(z.object({at:z.number().finite().min(.1).max(.9)}).strict()).max(3).optional(),
 weepHoles:z.object({spacing:z.number().finite().min(500).max(10000),dia:z.number().finite().min(25).max(200)}).strict().optional(),
 /** base bars: transverse top / bottom (hooked), longitudinal distribution top & bottom */
 rebar:z.object({top:wallMeshSchema,bottom:wallMeshSchema,dist:wallMeshSchema}).strict(),
 /** formwork on the soil face of the stem (false = cast against soil / not counted) */
 formSoilFace:z.boolean().optional(),
}).strict();

export const wallRunSchema=z.object({
 version:z.literal(WALL_RUN_VERSION),
 wallType:z.enum(wallTypes),
 /** plan placement: start of the first segment (mm) and its direction (degrees from +X) */
 origin:z.object({x:coord,y:coord,rotation:z.number().finite().min(-360).max(360)}).strict(),
 path:z.object({closed:z.boolean(),segments:z.array(wallSegmentSchema).min(1).max(24)}).strict(),
 branches:z.array(wallBranchSchema).max(8).optional(),
 levels:z.array(wallLevelSchema).min(1).max(12),
 /** start of the wall: dowels from a footing / slab (embedment Ldh or mm, kicker height mm), bars from the wall below, none */
 base:z.object({kind:z.enum(['dowel-footing','dowel-slab','continue','none']),embed:z.union([z.literal('ldh'),mm]),kicker:mm.optional()}).strict(),
 /** top of the wall: bars bent into the slab on top (slab thickness mm), U caps, straight, or on into the wall above */
 top:z.object({kind:z.enum(['bend-into-slab','u-cap','straight','continue']),slab:z.number().finite().min(100).max(1500).optional()}).strict(),
 waterstop:z.object({joints:z.boolean(),material:z.string().max(60)}).strict().optional(),
 rebar:z.object({outer:faceMesh,inner:faceMesh,layers:z.union([z.literal(1),z.literal(2)]),
  /** L corners: U bars over the corner (bars stop before it) | bars bent round the corner, lapped away from it | 90° hooks */
  corner:z.enum(['ubar','lap-l','hook90']),
  /** T junctions: branch bars bent L into the main wall (Ldh) | U bars across */
  tee:z.enum(['l-anchor','ubar']),
  /** free ends: U caps + EDGE bars | boundary element | plain (bars stop at the cover, as the old straight wall) */
  freeEnd:z.enum(['ucap-edge','boundary','plain']),
  edgeBar:wallCountBarSchema.optional(),
  boundary:z.object({length:z.number().finite().min(200).max(3000),ties:wallMeshSchema,bars:wallCountBarSchema}).strict().optional(),
  /** vertical laps of alternate bars staggered (set B one lap higher) */
  stagger:z.boolean().optional()}).strict(),
 openings:z.array(wallOpeningSchema).max(30),
 tank:wallTankSchema.optional(),
 liftPit:wallLiftPitSchema.optional(),
 retaining:wallRetainingSchema.optional(),
 /** set by “แปลงเป็น Wall Run” from a straight wall: bars cut like the old wall (lap added under the base) */
 converted:z.boolean().optional(),
}).strict().superRefine((r,c)=>{
 const segs=new Set(r.path.segments.map(s=>s.id));
 if(segs.size!==r.path.segments.length)c.addIssue({code:'custom',path:['path','segments'],message:'รหัส segment ซ้ำ'});
 if(new Set(r.levels.map(l=>l.id)).size!==r.levels.length)c.addIssue({code:'custom',path:['levels'],message:'รหัสชั้นซ้ำ'});
 if(new Set(r.openings.map(o=>o.id)).size!==r.openings.length)c.addIssue({code:'custom',path:['openings'],message:'รหัสช่องเปิดซ้ำ'});
 (r.branches||[]).forEach((b,i)=>{if(!segs.has(b.fromSegment))c.addIssue({code:'custom',path:['branches',i,'fromSegment'],message:'ไม่พบ segment'});});
 r.openings.forEach((o,i)=>{if(!segs.has(o.segment))c.addIssue({code:'custom',path:['openings',i,'segment'],message:'ไม่พบ segment'});});
 if(r.path.closed&&r.path.segments.length<3)c.addIssue({code:'custom',path:['path'],message:'เส้นแกนปิดต้องมีอย่างน้อย 3 segment'});
});
export type WallRun=z.infer<typeof wallRunSchema>;
