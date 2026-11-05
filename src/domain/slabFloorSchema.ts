import {z} from 'zod';

// Slab floor (Slab layout 'floor'): one member = a whole floor of slab panels on a grid. Grids X / Y (mm, floor coordinates),
// reference beams on grid lines (not quantified in this round; data kept for real beam members later), panels = polygons cut at
// the beam faces (concrete between faces), openings, drops / sunken areas. Slab marks (เบอร์พื้น) carry the bars of the slab list;
// panels may override them. Kept free of runtime imports (elementInput.ts imports this schema).
const mm=z.number().finite().min(0).max(200000);
const coord=z.number().finite().min(-200000).max(200000);
const dia=z.number().finite().min(0).max(60);
const label=z.string().trim().min(1).max(12);
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/);
const pt=z.tuple([coord,coord]);
/** bar size + spacing; spacing 0 = layer not used */
export const slabBarSchema=z.object({diameter:dia,spacing:mm}).strict();
export type SlabBar=z.infer<typeof slabBarSchema>;
/** extra top bars over the beams: length fixed (from the beam face / centre) or a fraction of the clear short span */
export const topExtraSchema=z.object({diameter:dia,spacing:mm,
 length:z.discriminatedUnion('mode',[z.object({mode:z.literal('fixed'),value:mm,from:z.enum(['face','centre'])}).strict(),z.object({mode:z.literal('ratio'),n:z.union([z.literal(3),z.literal(4)])}).strict()])}).strict();
export type TopExtra=z.infer<typeof topExtraSchema>;
/** Bars of one slab mark: bottom / top mesh along the short / long span, extra top bars at the beams, outer edge detail
 * (bend = top bars turn down into the edge beam, ubar = U bars close the edge), bottom bars at the beams (continuous = run on
 * across the beam with laps at the beams, stop = end in the beam). */
export const slabRebarSpecSchema=z.object({shortBottom:slabBarSchema,longBottom:slabBarSchema,shortTop:slabBarSchema,longTop:slabBarSchema,
 topExtra:topExtraSchema.optional(),edge:z.enum(['bend','ubar']),bottomAtBeam:z.enum(['continuous','stop'])}).strict();
export type SlabRebarSpec=z.infer<typeof slabRebarSpecSchema>;
export const DEFAULT_SLAB_REBAR:SlabRebarSpec={shortBottom:{diameter:12,spacing:200},longBottom:{diameter:12,spacing:200},shortTop:{diameter:12,spacing:0},longTop:{diameter:12,spacing:0},
 topExtra:{diameter:12,spacing:200,length:{mode:'fixed',value:1000,from:'face'}},edge:'bend',bottomAtBeam:'continuous'};
const gridSchema=z.object({label,at:coord}).strict();
export const floorBeamSchema=z.object({id,mark:z.string().trim().min(1).max(20),along:z.enum(['X','Y']),
 /** grid line the beam lies on (a Y grid for a beam along X) and the grids it runs between (other direction) */
 line:label,from:label,to:label,width:mm,depth:mm,
 /** centre offset from the grid line (mm, + = toward larger coordinates) */
 offset:coord.optional(),
 /** S3: at a crossing the primary beam runs through, the secondary stops at its faces (absent = auto: deeper, else along X) */
 rank:z.enum(['primary','secondary']).optional()}).strict();
export type FloorBeam=z.infer<typeof floorBeamSchema>;
/** S3: column at a grid crossing — reference only (no member), size X × Y (mm); gives the beam supports. */
export const floorColumnSchema=z.object({id,x:label,y:label,sx:mm,sy:mm,
 /** spec.columnTemplates id the size came from */ template:z.string().max(40).optional()}).strict();
export type FloorColumn=z.infer<typeof floorColumnSchema>;
export const floorMarkSchema=z.object({name:z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/,'เบอร์พื้นใช้ A–Z 0–9 และ -'),thickness:mm,support:z.enum(['elevated','ground']),rebar:slabRebarSpecSchema,
 /** spec.slabTemplates id the mark came from */
 template:z.string().max(40).optional()}).strict();
export type FloorMark=z.infer<typeof floorMarkSchema>;
const partialRebar=z.object({shortBottom:slabBarSchema,longBottom:slabBarSchema,shortTop:slabBarSchema,longTop:slabBarSchema,topExtra:topExtraSchema,edge:z.enum(['bend','ubar']),bottomAtBeam:z.enum(['continuous','stop'])}).partial().strict();
export const floorPanelSchema=z.object({id,mark:z.string().trim().min(1).max(12),
 /** Tag no. of the panel (unique, e.g. S1-01): names its shape part and sheet */
 tag:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/),
 /** the user typed the tag: it stays when the slab mark changes (else the tag follows the mark: `<mark>-nn`) */
 tagCustom:z.boolean().optional(),
 /** plan polygon (floor mm), already cut at the beam faces */
 outline:z.array(pt).min(3).max(64),
 /** 0 = thickness of the slab mark */
 thickness:mm,
 /** top of the panel from the floor level (mm, − = lowered) */
 top:z.number().finite().min(-3000).max(3000),
 rebar:partialRebar.optional()}).strict();
export type FloorPanel=z.infer<typeof floorPanelSchema>;
export const openingTrimSchema=z.object({method:z.enum(['cut','deviate','none']),
 /** area = replace the area of the cut bars (count per side rounded up), or a fixed count + Ø per side per layer */
 bars:z.union([z.literal('area'),z.object({count:z.number().int().min(1).max(10),diameter:dia}).strict()]),
 /** extension past the opening corners: Ld, lap, or mm */
 ext:z.union([z.literal('ld'),z.literal('lap'),mm]),diagonal:z.boolean(),layers:z.enum(['both','bottom','top'])}).strict();
export type OpeningTrim=z.infer<typeof openingTrimSchema>;
export const DEFAULT_OPENING_TRIM:OpeningTrim={method:'cut',bars:'area',ext:'ld',diagonal:true,layers:'both'};
export const floorOpeningSchema=z.object({id,label:z.string().max(40),panel:z.string().max(24).optional(),shape:z.enum(['rect','circle']),
 /** lower-left corner (circle: of its bounding square), size along X / Y (circle: w = diameter) */
 x:coord,y:coord,w:mm,h:mm,trim:openingTrimSchema}).strict();
export type FloorOpening=z.infer<typeof floorOpeningSchema>;
export const floorDropSchema=z.object({id,label:z.string().max(40).default(''),kind:z.enum(['drop','sunken']),outline:z.array(pt).min(3).max(64),
 /** drop: extra thickness below the panel; sunken: how far the area is lowered (mm, > 0) */
 depth:mm,rebar:z.enum(['crank','separate'])}).strict();
export type FloorDrop=z.infer<typeof floorDropSchema>;
/** S4a: background drawing under the floor plan (display / snap only: no quantities, never exported). Source coordinates =
 * DXF drawing units or PDF page points (y up); floor mm = scale · R(rotation) · source + (tx, ty). */
export const floorUnderlaySchema=z.object({attachmentId:z.string().min(1).max(80),page:z.number().int().min(1).max(9999).optional(),
 transform:z.object({scale:z.number().finite().positive().max(1e7),rotation:z.number().finite().min(-10).max(10),tx:z.number().finite().min(-1e9).max(1e9),ty:z.number().finite().min(-1e9).max(1e9)}).strict(),
 opacity:z.number().finite().min(0.05).max(1),locked:z.boolean(),hidden:z.boolean(),
 /** the two alignment pairs (source point → grid crossing labels) the transform came from */
 align:z.array(z.object({src:z.tuple([z.number().finite(),z.number().finite()]),x:label,y:label}).strict()).max(2).optional()}).strict();
export type FloorUnderlay=z.infer<typeof floorUnderlaySchema>;
/** Import roles of DXF layers (S4a). */
export const IMPORT_ROLES=['grid','gridLabel','beam','column','opening','slabMark','text'] as const;
export type ImportRole=typeof IMPORT_ROLES[number];
/** S4a: DXF layer → role mapping used by the last import (the project's floors are read to guess the next file's layers). */
export const floorImportMapSchema=z.object({layers:z.partialRecord(z.enum(IMPORT_ROLES),z.array(z.string().max(255)).max(60)),units:z.enum(['mm','cm','m','inch']).optional(),at:z.string().max(40).optional()}).strict();
export type FloorImportMap=z.infer<typeof floorImportMapSchema>;
export const slabFloorSchema=z.object({version:z.literal(1),
 /** top of slab reference level (m) */
 level:z.number().finite().min(-1000).max(1000),
 gridsX:z.array(gridSchema).max(30),gridsY:z.array(gridSchema).max(30),
 beams:z.array(floorBeamSchema).max(120),
 marks:z.array(floorMarkSchema).max(20),
 panels:z.array(floorPanelSchema).max(100),
 openings:z.array(floorOpeningSchema).max(40),
 drops:z.array(floorDropSchema).max(30),
 /** S3: reference columns at grid crossings (beam supports) */
 columns:z.array(floorColumnSchema).max(300).optional(),
 /** S4a: background drawing (PDF / DXF / image attachment) */
 underlay:floorUnderlaySchema.optional(),
 /** S4a: layer roles of the last DXF import */
 importMap:floorImportMapSchema.optional(),
}).strict();
export type SlabFloor=z.infer<typeof slabFloorSchema>;
/** Slab floor accessories as BOQ items (General Spec `spec.slabAccessories`, copied into the slab detailing; default off):
 * chairs under the top bars per m² of panels with top bars (size, shape U / Z / continuous), concrete spacers per m² of panel. */
export const slabAccessoriesSchema=z.object({
 chair:z.object({enabled:z.boolean(),diameter:dia,shape:z.enum(['U','Z','continuous']),perM2:z.number().finite().min(0).max(50)}).strict(),
 spacer:z.object({enabled:z.boolean(),perM2:z.number().finite().min(0).max(50)}).strict()}).strict();
export type SlabAccessories=z.infer<typeof slabAccessoriesSchema>;
export const DEFAULT_SLAB_ACCESSORIES:SlabAccessories={chair:{enabled:false,diameter:12,shape:'U',perM2:1},spacer:{enabled:false,perM2:4}};
