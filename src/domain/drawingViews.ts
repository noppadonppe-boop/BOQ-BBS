import {z} from 'zod';
import type {Member,Vec3} from './model';
import {boundsOf} from './solids';
const sectionV1={id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),label:z.string().trim().regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?$/).max(12),axis:z.enum(['X','Y','Z']),position:z.number().finite().nonnegative().max(200000)};
/** v2 (Sheet Composer): look = viewing direction along the cut normal ('+' default), depth = mm seen beyond the cut (absent =
 * nearest bar plane as before), extent = range along the cut line (crops the view), source default | user, columns = footing
 * pedestal / starter plan section (column outlines + column bars only). */
const sectionV2={...sectionV1,look:z.enum(['+','-']).optional(),depth:z.number().finite().positive().max(100000).optional(),
 extent:z.tuple([z.number().finite(),z.number().finite()]).refine(([a,b])=>b>a,'ช่วงแนวตัดไม่ถูกต้อง').optional(),source:z.enum(['default','user']).optional(),columns:z.boolean().optional(),
 /** stepped section (Drawing Edit P3): from `from` mm along the view's horizontal axis the cut moves to `position` */
 steps:z.array(z.object({from:z.number().finite().nonnegative().max(200000),position:z.number().finite().nonnegative().max(200000)}).strict()).max(4).optional()};
const unique=(v:{sections:{id:string;label:string;axis:string;position:number}[]},c:z.RefinementCtx)=>{
 const ids=new Set<string>(),labels=new Set<string>(),planes=new Set<string>();v.sections.forEach((s,i)=>{const label=s.label.toUpperCase(),plane=s.axis+':'+s.position;if(ids.has(s.id)||labels.has(label)||planes.has(plane))c.addIssue({code:'custom',path:['sections',i],message:'รหัส ชื่อ หรือแนวรูปตัดซ้ำ'});ids.add(s.id);labels.add(label);planes.add(plane);});
};
const head={primaryPlane:z.enum(['XY','XZ','YZ']),basis:z.string().trim().min(1).max(500)};
export const drawingViewsV1Schema=z.object({version:z.literal(1),...head,sections:z.array(z.object(sectionV1).strict()).min(1).max(6)}).strict().superRefine(unique);
export const drawingViewsV2Schema=z.object({version:z.literal(2),...head,sections:z.array(z.object(sectionV2).strict()).min(1).max(12)}).strict().superRefine(unique);
/** Version 1 (plan / elevation + up to 6 cuts) is still read; the Sheet Composer and the view editor write version 2. */
export const drawingViewsSchema=z.union([drawingViewsV1Schema,drawingViewsV2Schema]);
export type DrawingViews=z.infer<typeof drawingViewsSchema>;
export type DrawingViewsV2=z.infer<typeof drawingViewsV2Schema>;
export type SheetSection=DrawingViewsV2['sections'][number];
export type DrawingSection=DrawingViews['sections'][number]&Partial<Pick<SheetSection,'look'|'depth'|'extent'|'source'|'columns'>>;
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
/** v1 → v2 without losing data: the v1 cuts stay (source user) after the sheet's default cuts (`defaults`, skipped where a
 * v1 cut has the same label or plane). */
export function migrateDrawingViews(v:DrawingViews,defaults:SheetSection[]):DrawingViewsV2{
 if(v.version===2)return v;
 const own=v.sections.map(s=>({...s,source:'user' as const})),taken=new Set(own.flatMap(s=>[s.label.toUpperCase(),s.axis+':'+s.position]));
 return {version:2,primaryPlane:v.primaryPlane,basis:v.basis,sections:[...defaults.filter(d=>!taken.has(d.label.toUpperCase())&&!taken.has(d.axis+':'+d.position)),...own].slice(0,12)};
}
/** Next free section label A-A, B-B … (letters already used as the first part of a label are skipped). */
export function nextSectionLabel(sections:{label:string}[]){
 const used=new Set(sections.map(s=>s.label.toUpperCase().split('-')[0]));
 for(let i=0;i<26*27;i++){const t=i<26?String.fromCharCode(65+i):String.fromCharCode(64+Math.floor(i/26))+String.fromCharCode(65+i%26);if(!used.has(t)&&!['X','Y','Z'].includes(t))return `${t}-${t}`;}
 return `S${sections.length+1}`;
}
