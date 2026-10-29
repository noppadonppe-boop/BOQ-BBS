// Plain data read from IFC files (src/data/ifcModel.ts) and used by the IFC import (src/domain/ifcImport.ts).
// Lengths in mm, world coordinates of the file (Z up).
export type V3=[number,number,number];
/** Local frame: origin + unit axes (world). */
export type Frame={o:V3;x:V3;y:V3;z:V3};
export type IfcElemKind='footing'|'pile'|'column'|'beam'|'wall'|'slab'|'other';
export type IfcElement={
 guid:string;ifcType:string;kind:IfcElemKind;name:string;
 /** type mark / reference (Revit Pset Reference, Tekla assembly mark without the position number) */
 mark:string;storey:string;assembly?:string;file:string;
 /** frame of the concrete body (extrusion position when there is one, else the object placement) */
 frame:Frame;
 /** extents in `frame` */
 min:V3;max:V3;
 /** plan outline in `frame` (x, y) when the body is a vertical extrusion; circle = round section */
 outline?:[number,number][];circle?:boolean;
 /** body could not be read exactly (clipped / boolean / mesh bounding box) */
 approx?:boolean;
 /** m³ of the real body (mesh) when `approx` */
 volume?:number;
 grade?:string;props:Record<string,string>;
};
export type IfcBar={pts:V3[];radius:number};
export type IfcBarSet={
 guid:string;name:string;file:string;
 /** rebar mark of the model (Tekla Rebar Mark, Revit Schedule Mark / Rebar Number); '' = none */
 mark:string;diameter:number;grade:string;
 /** shape name / code in the authoring tool (Tekla shape, Revit shape family) */
 shape:string;assembly?:string;group?:string;storey:string;
 /** length / weight of one bar as the model reports (0 = not given) */
 length:number;weight:number;
 bars:IfcBar[];
};
export type IfcStorey={guid:string;name:string;elevation:number};
export type IfcModelData={file:string;app:string;tool:'Revit'|'Tekla'|'other';schema:string;storeys:IfcStorey[];elements:IfcElement[];barSets:IfcBarSet[];warnings:string[]};

export const v3={
 add:(a:V3,b:V3):V3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
 sub:(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
 mul:(a:V3,k:number):V3=>[a[0]*k,a[1]*k,a[2]*k],
 dot:(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
 cross:(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
 len:(a:V3)=>Math.hypot(a[0],a[1],a[2]),
 norm:(a:V3):V3=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];},
};
export const IDENTITY:Frame={o:[0,0,0],x:[1,0,0],y:[0,1,0],z:[0,0,1]};
/** Point given in frame f → world. */
export const toWorld=(f:Frame,p:V3):V3=>[f.o[0]+f.x[0]*p[0]+f.y[0]*p[1]+f.z[0]*p[2],f.o[1]+f.x[1]*p[0]+f.y[1]*p[1]+f.z[1]*p[2],f.o[2]+f.x[2]*p[0]+f.y[2]*p[1]+f.z[2]*p[2]];
/** World point → coordinates in frame f (orthonormal axes). */
export const toLocal=(f:Frame,p:V3):V3=>{const d=v3.sub(p,f.o);return [v3.dot(d,f.x),v3.dot(d,f.y),v3.dot(d,f.z)];};
/** Child frame given in parent coordinates → world. */
export const compose=(parent:Frame,child:Frame):Frame=>({o:toWorld(parent,child.o),x:dirOf(parent,child.x),y:dirOf(parent,child.y),z:dirOf(parent,child.z)});
/** Direction given in frame f → world. */
export const dirOf=(f:Frame,d:V3):V3=>[f.x[0]*d[0]+f.y[0]*d[1]+f.z[0]*d[2],f.x[1]*d[0]+f.y[1]*d[1]+f.z[1]*d[2],f.x[2]*d[0]+f.y[2]*d[1]+f.z[2]*d[2]];
/** Frame from an origin, Z axis and approximate X axis (IfcAxis2Placement3D rules). */
export function frameOf(o:V3,z?:V3,x?:V3):Frame{
 const Z=v3.norm(z||[0,0,1]),ortho=(a:V3)=>v3.sub(a,v3.mul(Z,v3.dot(a,Z)));
 let X=ortho(x||[1,0,0]);
 for(const alt of [[1,0,0],[0,1,0],[0,0,1]] as V3[])if(v3.len(X)<1e-6)X=ortho(alt);
 X=v3.norm(X);
 return {o,x:X,y:v3.cross(Z,X),z:Z};
}
