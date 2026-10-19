import type {Bar,Member,Spec,Vec3} from './model';
import {bsGeneration,bsAssessment} from './bs8666';
import {OBLIQUE_CODES,obliqueTemplatePoints,ObliqueCode} from './bsOblique';
import {barPaths,validateMember} from './engine';
import {boundsOf,solidsOf} from './solids';

export type TemplateCode='13'|'31'|'41'|'44'|ObliqueCode;
export type TemplateDimensions={A:number;B:number;C:number;D:number;E:number;innerRadius:number};
export const templateLabels=(code:TemplateCode)=>code==='13'||code==='15'?['A','B','C']:code==='26'||code==='31'?['A','B','C','D']:['A','B','C','D','E'];
// Table 1 p.7: dimensions are outside dimensions, not virtual centreline leg lengths.
// Generated coordinates are local to the selected solid, in X/Z, distributed along Y.
export function buildBSTemplate(member:Member,bar:Bar,spec:Spec,code:TemplateCode,d:TemplateDimensions){
 const oblique=OBLIQUE_CODES.includes(code as ObliqueCode);
 const generation=code==='13'?4:oblique?3:2;
 if(bsGeneration(spec)<generation)throw Error(`เลือกชุดกฎ BS ขั้นต่ำรุ่น ${generation} ใน General Spec ก่อนสร้างรูปนี้`);
 const ext=bar.outsideDiameter??bar.diameter,c=member.cover+ext/2;
 const values=templateLabels(code).map(k=>d[k as keyof TemplateDimensions]);
 if(values.some(n=>!Number.isFinite(n)||n<=0||Math.abs(n/5-Math.round(n/5))>1e-6))throw Error('มิติผิวนอกต้องเป็นค่าบวกทีละ 5 mm');
 const radius=code==='13'?(d.B-ext)/2:d.innerRadius+ext/2;
 if(!Number.isFinite(radius)||radius<=ext/2)throw Error('ระบุรัศมีด้านในที่เป็นค่าบวก; รูป 13 ได้รัศมีจาก B และขนาดผิวนอก');
 const a=d.A-ext/2,b=d.B-ext,h=d.C-ext,tail=d.D-(code==='31'?ext/2:ext),e=d.E-ext/2;
 if(!oblique&&code!=='13'&&[a,b,h,tail,...(code==='31'?[]:[e])].some(n=>n<=0))throw Error('มิติผิวนอกเล็กกว่าความหนาเหล็ก');
 const xy=code==='13'?[[0,0],[d.A-ext/2,0],[d.A-ext/2,d.B-ext],[d.A-d.C,d.B-ext]]:oblique?obliqueTemplatePoints(code as ObliqueCode,d,ext):code==='31'?[[a,b],[0,b],[0,0],[h,0],[h,tail]]:code==='41'?[[a,b],[0,b],[0,0],[h,0],[h,tail],[h-e,tail]]:[[-a,b],[0,b],[0,0],[h,0],[h,tail],[h+e,tail]];
 const lowX=Math.min(...xy.map(p=>p[0])),lowZ=Math.min(...xy.map(p=>p[1]));
 const points=xy.map(([x,z])=>[x-lowX+c,c,z-lowZ+c] as Vec3);
 const target=bar.targetSolidId?solidsOf(member).find(s=>s.id===bar.targetSolidId):undefined;
 if(bar.targetSolidId&&!target)throw Error('ไม่พบชิ้นส่วนเป้าหมาย');
 const size=target?.size||boundsOf(member);
 if(size[1]<=2*c)throw Error('ระยะหุ้มและขนาดเหล็กเกินความกว้างชิ้นส่วน');
 const candidate:Bar={...bar,pathInput:undefined,shape:'polyline',curve:undefined,helix:undefined,shapeCode:code,axis:'X',face:'bottom',start:0,end:0,tail:0,radius,points,distributionStart:c,distributionEnd:size[1]-c,lengthMethod:'bs8666',outsideDiameter:ext,cutOverride:0,bsDimensionsConfirmed:false,placementConfirmed:false};
 const geometry=validateMember({...member,bars:[candidate]},spec);
 const standard=bsAssessment({...candidate,bsDimensionsConfirmed:true},barPaths(member,candidate)[0],spec);
 if(oblique&&(!standard.oblique||standard.dimensions.some(v=>Math.abs(v.value-d[v.label as keyof TemplateDimensions])>.001)))throw Error('พิกัดที่สร้างไม่ตรงมิติรูปมาตรฐาน ต้องตรวจและแก้มิติ');
 const problems=[...geometry,...standard.problems];
 if(problems.length)throw Error([...new Set(problems)].join(' · '));
 return candidate;
}
