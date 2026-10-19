import type {Bar,Member,Spec,Vec3} from './model';
import {arcBounds,arcGeometry,type ArcFrame} from './arcGeometry';
import {bsAssessment,bsGeneration} from './bs8666';
import {barPaths,validateMember} from './engine';
import {boundsOf,solidsOf} from './solids';

export function buildBSArc(member:Member,bar:Bar,spec:Spec,A:number,R:number,plane:'XY'|'XZ'|'YZ'){
 if(bsGeneration(spec)<5)throw Error('เลือกชุดกฎ BS ขั้นต่ำรุ่น 5 ใน General Spec ก่อนสร้างรูป 67');
 if([A,R].some(n=>!Number.isFinite(n)||n<=0||Math.abs(n/5-Math.round(n/5))>1e-6))throw Error('A และ R ด้านในต้องเป็นค่าบวกทีละ 5 mm');
 const outside=bar.outsideDiameter??bar.diameter,radius=R+outside/2,sweepDegrees=A/radius*180/Math.PI;
 if(sweepDegrees>=360)throw Error('รูป 67 ที่รองรับต้องเป็นส่วนโค้งเปิดน้อยกว่า 360°; วงปิดต้องระบุการต่อ/ทาบและรูปที่เหมาะสม');
 const frame:Record<typeof plane,{u:Vec3;v:Vec3;normalAxis:number}>={XY:{u:[1,0,0],v:[0,1,0],normalAxis:2},XZ:{u:[1,0,0],v:[0,0,-1],normalAxis:1},YZ:{u:[0,1,0],v:[0,0,1],normalAxis:0}};
 const {u,v,normalAxis}=frame[plane],curve:ArcFrame={center:[0,0,0],u,v,sweepDegrees};
 const target=bar.targetSolidId?solidsOf(member).find(s=>s.id===bar.targetSolidId):undefined;
 if(bar.targetSolidId&&!target)throw Error('ไม่พบชิ้นส่วนเป้าหมาย');
 const size=target?.size||boundsOf(member),c=member.cover+outside/2;
 const probe={...bar,shape:'arc' as const,curve,radius},margin=arcGeometry(probe).sagitta+.001;
 const bounds=arcBounds(curve,radius);
 curve.center=bounds.lo.map(n=>c+margin-n) as Vec3;
 const candidate:Bar={...bar,pathInput:undefined,shape:'arc',helix:undefined,shapeCode:'67',axis:normalAxis===0?'X':normalAxis===1?'Y':'Z',face:'bottom',curve,radius,points:[],start:0,end:0,tail:0,distributionStart:c+margin,distributionEnd:size[normalAxis]-c-margin,lengthMethod:'bs8666',outsideDiameter:outside,cutOverride:0,bsDimensionsConfirmed:false,placementConfirmed:false,spatialDimensions:undefined,dimensionView:undefined,freeDimensionLeg:undefined};
 if(candidate.distributionEnd<candidate.distributionStart)throw Error('ระยะหุ้มและขนาดเหล็กเกินความหนาชิ้นส่วน');
 const problems=[...validateMember({...member,bars:[candidate]},spec),...bsAssessment({...candidate,bsDimensionsConfirmed:true},barPaths(member,candidate)[0]||[],spec).problems];
 if(problems.length)throw Error([...new Set(problems)].join(' · '));
 return candidate;
}
