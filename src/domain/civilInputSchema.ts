import {z} from 'zod';

// Parametric input of Civil Work members (phase 2a). Generators in civilInput.ts turn it into the existing geometry
// (shape model / prism) or quantity-only site items; reinforcement: automatic (civilRebar.ts) or the free-form tools.
export const civilCategories=['UDitch','VDitch','Trench','Manhole','Pit','UGTank','AGTank','ConcretePaving','AsphaltPaving','RCPipe','PEPipe'] as const;
/** Members measured without concrete (no BBS): asphalt layers, precast RC / PE pipes, rooms, doors / windows, masonry walls, roofs, steel assemblies. */
export const quantityOnlyCategories:readonly string[]=['AsphaltPaving','RCPipe','PEPipe','Room','Opening','MasonryWall','Roof','SteelAssembly'];
export type CivilCategory=typeof civilCategories[number];
const mm=z.number().finite().min(0).max(200000),len=z.number().finite().positive().max(200000);
/** Earthwork of buried parts: excavation to the underside of the lean layer, working space each side, lean layer. */
export const civilSiteSchema=z.object({excavation:z.boolean(),workingSpace:mm,leanThickness:mm,leanProjection:mm}).strict();
const barSetSchema=z.object({diameter:z.number().int().min(6).max(40),spacing:z.number().finite().min(50).max(1000)}).strict();
/** Automatic reinforcement (phase 2b): main = transverse / vertical / both ways of base slabs, dist = longitudinal /
 * horizontal wall bars, slab = cover slab both ways; single = one layer (wall centre, paving top), double = each face. */
export const civilRebarSchema=z.object({cover:z.number().finite().min(15).max(150),layers:z.enum(['single','double']),main:barSetSchema,dist:barSetSchema,slab:barSetSchema.optional()}).strict();
export type CivilRebar=z.infer<typeof civilRebarSchema>;
export const asphaltLayerSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),label:z.string().trim().min(1).max(100),thickness:mm,unit:z.enum(['m²','m³'])}).strict();
export const civilInputSchema=z.discriminatedUnion('kind',[
 /** U-ditch / trench: base + two side walls along X, optional cover slab (0 = open) */
 z.object({kind:z.literal('channel'),length:len,innerWidth:len,innerHeight:len,wall:len,base:len,cover:mm,site:civilSiteSchema,rebar:civilRebarSchema.optional()}).strict(),
 /** V-ditch: concrete lining of a trapezoid channel (bottom width 0 = V) */
 z.object({kind:z.literal('vchannel'),length:len,topWidth:len,bottomWidth:mm,depth:len,lining:len,rebar:civilRebarSchema.optional()}).strict(),
 /** manhole / pit / tank: base (+ toe) + walls around the inner space + optional cover slab with an opening */
 z.object({kind:z.literal('box'),innerLength:len,innerWidth:len,innerHeight:len,wall:len,base:len,toe:mm,cover:mm,openingLength:mm,openingWidth:mm,site:civilSiteSchema,rebar:civilRebarSchema.optional()}).strict(),
 /** concrete paving / yard slab */
 z.object({kind:z.literal('paving'),length:len,width:len,thickness:len,rebar:civilRebarSchema.optional()}).strict(),
 /** asphalt paving: quantity only, one site item per layer */
 z.object({kind:z.literal('asphalt'),length:len,width:len,layers:z.array(asphaltLayerSchema).min(1).max(8)}).strict(),
 /** pipe laying (precast RC / PE): run length, nominal / outside diameter, piece length, class; trench and bedding */
 z.object({kind:z.literal('pipe'),length:len,diameter:len,outerDiameter:len,pieceLength:len,pipeClass:z.string().trim().max(60),trenchWidth:len,trenchDepth:len,sideSlope:z.number().finite().min(0).max(5),bedding:mm,excavation:z.boolean()}).strict(),
]);
export type CivilInput=z.infer<typeof civilInputSchema>;
