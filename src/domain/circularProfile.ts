import {z} from 'zod';
export const CIRCULAR_PRISM_POLICY='concrete-prism-4.0' as const;
export const CIRCLE_STATIONS=64;
export const circularProfileSchema=z.object({outerRadius:z.number().finite().positive().max(100000),innerRadius:z.number().finite().nonnegative().max(100000)}).strict().superRefine((p,c)=>{if(p.innerRadius>=p.outerRadius)c.addIssue({code:'custom',message:'รัศมีช่องเปิดต้องน้อยกว่ารัศมีภายนอก'});if(Math.PI*(p.outerRadius*p.outerRadius-p.innerRadius*p.innerRadius)<1)c.addIssue({code:'custom',message:'พื้นที่วงกลมสุทธิต้องไม่น้อยกว่า 1 mm²'});});
export type CircularProfile=z.infer<typeof circularProfileSchema>;
// Local profile bounds begin at0 as for all existing member profiles. The
// polygon is only the display mesh; quantities/containment use the radii.
export function circleVertices(radius:number,center:number):[number,number][]{return Array.from({length:CIRCLE_STATIONS},(_,i)=>{const a=2*Math.PI*i/CIRCLE_STATIONS;return [center+radius*Math.cos(a),center+radius*Math.sin(a)].map(v=>Math.abs(v)<1e-8?0:v) as [number,number];});}
