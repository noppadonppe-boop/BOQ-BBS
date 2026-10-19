import {z} from 'zod';

// Data validation must be loadable before the drawing/geometry engine.
const coordinate=z.number().finite().min(-200000).max(200000);
const point=z.tuple([coordinate,coordinate,coordinate]);
export function dimensionValue(d:{from:number[];to:number[];axis:string}){
 const delta=d.to.map((v,i)=>v-d.from[i]);
 return d.axis==='distance'?Math.hypot(...delta):Math.abs(delta['XYZ'.indexOf(d.axis)]);
}
export const spatialDimensionSchema=z.object({
 label:z.string().regex(/^[A-Z]$/,'ชื่อมิติต้องเป็น A-Z หนึ่งตัว'),
 from:point,to:point,axis:z.enum(['X','Y','Z','distance']),
 purpose:z.enum(['reference','outside-proposed']),source:z.string().trim().max(300),free:z.boolean()
}).superRefine((d,ctx)=>{
 if(dimensionValue(d)<=.001)ctx.addIssue({code:'custom',path:['to'],message:'ระยะตามแนววัดต้องมากกว่า 0.001 mm'});
 if(d.purpose==='outside-proposed'&&!d.source)ctx.addIssue({code:'custom',path:['source'],message:'มิติผิวนอกที่เสนอต้องระบุแบบ/หน้าหรือที่มาของจุด'});
});
export const spatialDimensionsSchema=z.array(spatialDimensionSchema).max(12).superRefine((ds,ctx)=>{
 if(new Set(ds.map(d=>d.label)).size!==ds.length)ctx.addIssue({code:'custom',message:'ชื่อมิติซ้ำ'});
 if(ds.filter(d=>d.free).length>1)ctx.addIssue({code:'custom',message:'เลือกมิติอิสระได้เพียงหนึ่งมิติ'});
});
export type SpatialDimension=z.infer<typeof spatialDimensionSchema>;
export const dimensionViewSchema=z.enum(['isometric','XY','XZ','YZ']);
export type DimensionView=z.infer<typeof dimensionViewSchema>;
