import {z} from 'zod';

// Parametric input of Civil Work members (phase 2a). Generators in civilInput.ts turn it into the existing geometry
// (shape model / prism) or quantity-only site items; reinforcement uses the free-form tools for now.
export const civilCategories=['UDitch','VDitch','Trench','Manhole','Pit','UGTank','AGTank','ConcretePaving','AsphaltPaving','RCPipe','PEPipe'] as const;
/** Civil members measured without concrete (no BBS): asphalt layers, precast RC / PE pipes. */
export const quantityOnlyCategories:readonly string[]=['AsphaltPaving','RCPipe','PEPipe'];
export type CivilCategory=typeof civilCategories[number];
const mm=z.number().finite().min(0).max(200000),len=z.number().finite().positive().max(200000);
/** Earthwork of buried parts: excavation to the underside of the lean layer, working space each side, lean layer. */
export const civilSiteSchema=z.object({excavation:z.boolean(),workingSpace:mm,leanThickness:mm,leanProjection:mm}).strict();
export const asphaltLayerSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),label:z.string().trim().min(1).max(100),thickness:mm,unit:z.enum(['m²','m³'])}).strict();
export const civilInputSchema=z.discriminatedUnion('kind',[
 /** U-ditch / trench: base + two side walls along X, optional cover slab (0 = open) */
 z.object({kind:z.literal('channel'),length:len,innerWidth:len,innerHeight:len,wall:len,base:len,cover:mm,site:civilSiteSchema}).strict(),
 /** V-ditch: concrete lining of a trapezoid channel (bottom width 0 = V) */
 z.object({kind:z.literal('vchannel'),length:len,topWidth:len,bottomWidth:mm,depth:len,lining:len}).strict(),
 /** manhole / pit / tank: base (+ toe) + walls around the inner space + optional cover slab with an opening */
 z.object({kind:z.literal('box'),innerLength:len,innerWidth:len,innerHeight:len,wall:len,base:len,toe:mm,cover:mm,openingLength:mm,openingWidth:mm,site:civilSiteSchema}).strict(),
 /** concrete paving / yard slab */
 z.object({kind:z.literal('paving'),length:len,width:len,thickness:len}).strict(),
 /** asphalt paving: quantity only, one site item per layer */
 z.object({kind:z.literal('asphalt'),length:len,width:len,layers:z.array(asphaltLayerSchema).min(1).max(8)}).strict(),
 /** pipe laying (precast RC / PE): run length, nominal / outside diameter, piece length, class; trench and bedding */
 z.object({kind:z.literal('pipe'),length:len,diameter:len,outerDiameter:len,pieceLength:len,pipeClass:z.string().trim().max(60),trenchWidth:len,trenchDepth:len,sideSlope:z.number().finite().min(0).max(5),bedding:mm,excavation:z.boolean()}).strict(),
]);
export type CivilInput=z.infer<typeof civilInputSchema>;
