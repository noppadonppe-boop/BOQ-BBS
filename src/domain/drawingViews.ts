import {z} from 'zod';
import type {Member,Vec3} from './model';
import {boundsOf} from './solids';
export const drawingViewsSchema=z.object({version:z.literal(1),primaryPlane:z.enum(['XY','XZ','YZ']),basis:z.string().trim().min(1).max(500),sections:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),label:z.string().trim().regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?$/).max(12),axis:z.enum(['X','Y','Z']),position:z.number().finite().nonnegative().max(200000)}).strict()).min(1).max(6)}).strict().superRefine((v,c)=>{
 const ids=new Set<string>(),labels=new Set<string>(),planes=new Set<string>();v.sections.forEach((s,i)=>{const label=s.label.toUpperCase(),plane=s.axis+':'+s.position;if(ids.has(s.id)||labels.has(label)||planes.has(plane))c.addIssue({code:'custom',path:['sections',i],message:'รหัส ชื่อ หรือแนวรูปตัดซ้ำ'});ids.add(s.id);labels.add(label);planes.add(plane);});
});
export type DrawingViews=z.infer<typeof drawingViewsSchema>;
export type DrawingSection=DrawingViews['sections'][number];
export const axisIndex=(axis:DrawingSection['axis'])=>({X:0,Y:1,Z:2} as const)[axis];
export const planeAxes=(plane:DrawingViews['primaryPlane']):[number,number]=>plane==='XY'?[0,1]:plane==='XZ'?[0,2]:[1,2];
export const primaryAxes=(m:Member)=>planeAxes(m.drawingViews?.primaryPlane||'XY');
export const sectionAxes=(s:DrawingSection):[number,number]=>s.axis==='X'?[1,2]:s.axis==='Y'?[0,2]:[0,1];
export function drawingSections(m:Member):DrawingSection[]{return m.drawingViews?.sections||[{id:'legacy-AA',label:'A-A',axis:'Y',position:m.sectionY??boundsOf(m)[1]/2}];}
export function drawingViewProblems(m:Member){return(m.drawingViews?.sections||[]).filter(s=>s.position>boundsOf(m)[axisIndex(s.axis)]).map(s=>`รูปตัด ${s.label}: ${s.axis}=${s.position} mm เกินสมาชิก`);}
export const primaryTitle=(m:Member)=>`${m.drawingViews?.primaryPlane&&m.drawingViews.primaryPlane!=='XY'?'ELEVATION':'PLAN'} ${primaryAxes(m).map(a=>['X','Y','Z'][a]).join('/')}`;
export const sectionTitle=(s:DrawingSection)=>`SECTION ${s.label} / ${s.axis}=${s.position} mm`;
export function projectionCutLine(axes:[number,number],s:DrawingSection,p:{x:number;y:number;w:number;h:number;point:(v:Vec3)=>number[]},margin=12){
 const axis=axisIndex(s.axis),point=[0,0,0] as Vec3;point[axis]=s.position;
 if(axes[0]===axis){const x=p.point(point)[0];return [[x,p.y-margin],[x,p.y+p.h+margin]];}
 if(axes[1]===axis){const y=p.point(point)[1];return [[p.x-margin,y],[p.x+p.w+margin,y]];}
 return undefined;
}
export function drawingSummarySheets(m:Member,rowCount:number,perSheet:number){const groups=Math.max(1,Math.ceil(rowCount/perSheet));return drawingSections(m).flatMap(section=>Array.from({length:groups},(_,i)=>({section,offset:i*perSheet})));}
