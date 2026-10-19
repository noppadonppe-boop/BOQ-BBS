import type {Vec3} from './model';
export const OBLIQUE_CODES=['15','25','26','46'] as const;
export type ObliqueCode=typeof OBLIQUE_CODES[number];
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const len=(v:Vec3)=>Math.hypot(...v);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Supplied Table 1 pp.6-8: non-right, planar open shapes. No shape inferred from its code alone.
export function obliqueAssessment(code:string,points:Vec3[],outside:number,radius:number){
 if(!OBLIQUE_CODES.includes(code as ObliqueCode)||points.length!==({15:3,25:4,26:4,46:6}[code as ObliqueCode]))return undefined;
 const vectors=points.slice(1).map((p,i)=>sub(p,points[i])),legs=vectors.map(len);if(legs.some(v=>v<.001))return undefined;
 const dirs=vectors.map((v,i)=>v.map(n=>n/legs[i]) as Vec3),angles=dirs.slice(1).map((v,i)=>Math.acos(Math.max(-1,Math.min(1,dot(dirs[i],v)))));
 if(angles.some(a=>a<1e-5||a>=Math.PI/2-1e-5))return undefined;
 const normals=dirs.slice(1).map((v,i)=>cross(dirs[i],v)),n=normals[0].map(v=>v/len(normals[0])) as Vec3;
 if(dirs.some(v=>Math.abs(dot(n,v))>1e-5))return undefined;
 if(code==='26'&&(dot(dirs[0],dirs[2])<.99999||Math.abs(angles[0]-angles[1])>1e-5))return undefined;
 if(code==='25'&&dot(normals[0],normals[1])<=0)return undefined;
 if(code==='46'&&(dot(dirs[0],dirs[2])<.99999||dot(dirs[0],dirs[4])<.99999||Math.abs(legs[1]-legs[3])>.001||angles.some(a=>Math.abs(a-angles[0])>1e-5)||dot(normals[0],normals[1])>=0||dot(normals[1],normals[2])<=0||dot(normals[2],normals[3])>=0))return undefined;
 const half=outside/2,t=angles.map(a=>Math.tan(a/2));
 let values:number[],formula:string,free:string,ends:string[];
 if(code==='15'){values=[legs[0]+half*t[0],legs[0]*Math.sin(angles[0])+half*(1+Math.cos(angles[0])),legs[1]+half*t[0]];formula='A + (C)';free='C';ends=['A','C'];}
 else if(code==='25'){values=[legs[0]+half*t[0],legs[2]+half*t[1],legs[0]*Math.sin(angles[0])+half*(1+Math.cos(angles[0])),legs[2]*Math.sin(angles[1])+half*(1+Math.cos(angles[1])),legs[1]+half*(t[0]+t[1])];formula='A + B + (E)';free='E';ends=['A','B'];}
 else if(code==='26'){values=[legs[0]+half*t[0],legs[1]+outside*t[0],legs[2]+half*t[0],legs[1]*Math.sin(angles[0])+outside];formula='A + B + (C)';free='C';ends=['A','C'];}
 else{values=[legs[0]+half*t[0],legs[1]+outside*t[0],legs[2]+outside*t[0],legs[1]*Math.sin(angles[0])+outside,legs[4]+half*t[0]];formula='A + 2B + C + (E)';free='E';ends=['A','E'];}
 const dimensions=values.map((value,i)=>({label:'ABCDE'[i],value,free:'ABCDE'[i]===free}));
 const byLabel=Object.fromEntries(dimensions.map(d=>[d.label,d.value]));
 const approximateLength=code==='15'?byLabel.A+byLabel.C:code==='25'?byLabel.A+byLabel.B+byLabel.E:code==='26'?byLabel.A+byLabel.B+byLabel.C:byLabel.A+2*byLabel.B+byLabel.C+byLabel.E;
 const exactLength=legs.reduce((a,b)=>a+b,0)+angles.reduce((a,b)=>a+radius*(b-2*Math.tan(b/2)),0),exactRequired=angles.some(a=>a>Math.PI/4+1e-8);
 return{dimensions,tableFormula:formula,formula:exactRequired?'Sum of tangent straights + centerline arcs (Table 1 Note 1)':formula,formulaLength:exactRequired?exactLength:approximateLength,approximateLength,exactLength,exactRequired,anglesDegrees:angles.map(a=>a*180/Math.PI),endLabels:ends,sourcePage:code==='15'||code==='25'?6:7};
}
// Outside height = outside inclined length*sin(theta) + outside diameter*cos(theta).
// Restrict the inverse to a unique non-right branch; near-vertical ambiguous inputs need explicit coordinates.
function angleForHeight(leg:number,height:number,outside:number){
 if(height<=outside||height>=leg)throw Error('มิติสูงต้องมากกว่าผิวนอกและน้อยกว่าช่วงเอียง เพื่อกำหนดมุมได้แน่นอน; รูปใกล้มุมฉากใช้พิกัด/Code 99 ตรวจร่วมกัน');
 const angle=Math.asin(height/Math.hypot(leg,outside))-Math.atan2(outside,leg);
 if(!Number.isFinite(angle)||angle<=1e-5||angle>=Math.PI/2-1e-5)throw Error('มุมจากมิติไม่ใช่รูปเอียงที่รองรับ');return angle;
}
export function obliqueTemplatePoints(code:ObliqueCode,d:{A:number;B:number;C:number;D:number;E:number},outside:number):[number,number][]{
 const half=outside/2;
 if(code==='15'){const a=angleForHeight(d.A,d.B,outside),t=Math.tan(a/2),l=d.A-half*t,c=d.C-half*t;return[[0,l*Math.sin(a)],[l*Math.cos(a),0],[l*Math.cos(a)+c,0]];}
 if(code==='25'){const a=angleForHeight(d.A,d.C,outside),b=angleForHeight(d.B,d.D,outside),ta=Math.tan(a/2),tb=Math.tan(b/2),l=d.A-half*ta,r=d.B-half*tb,c=d.E-half*(ta+tb),x=l*Math.cos(a);return[[0,l*Math.sin(a)],[x,0],[x+c,0],[x+c+r*Math.cos(b),r*Math.sin(b)]];}
 const a=angleForHeight(d.B,d.D,outside),t=Math.tan(a/2),l=d.A-half*t,b=d.B-outside*t,h=b*Math.sin(a),x=b*Math.cos(a);
 if(code==='26'){const c=d.C-half*t;return[[0,0],[l,0],[l+x,h],[l+x+c,h]];}
 const c=d.C-outside*t,e=d.E-half*t;return[[0,h],[l,h],[l+x,0],[l+x+c,0],[l+2*x+c,h],[l+2*x+c+e,h]];
}
