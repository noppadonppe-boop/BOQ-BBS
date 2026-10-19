import type {Bar,Member,Spec,Vec3} from './model';
import {bsGeneration,bsAssessment} from './bs8666';
import {helixGeometry,helixBounds} from './helixGeometry';
import {boundsOf,solidsOf} from './solids';
import {barPaths,validateMember} from './engine';

export function buildBSHelix(member:Member,bar:Bar,spec:Spec,A:number,B:number,C:number,plane:'XY'|'XZ'|'YZ'='XY',hand:'Right'|'Left'='Right',phaseDegrees=0){
 if(bsGeneration(spec)<6)throw Error('เลือกชุดกฎ BS ขั้นต่ำรุ่น 6 ใน General Spec ก่อนสร้างเกลียว');
 if([A,B].some(n=>!Number.isFinite(n)||n<=0||Math.abs(n/5-Math.round(n/5))>1e-6))throw Error('A เส้นผ่านศูนย์กลาง/B ระยะเกลียวต้องเป็นค่าบวกทีละ 5 mm');
 if(!Number.isFinite(C)||C<=0||C>1000||!Number.isFinite(phaseDegrees))throw Error('ระบุจำนวนรอบ C มากกว่า 0 ไม่เกิน 1000 และมุมเริ่มต้นที่มีขอบเขต');
 const ext=bar.outsideDiameter??bar.diameter,radius=(A-ext)/2,c=member.cover+ext/2;
 const base:Record<typeof plane,{u:Vec3;v:Vec3;axis:Vec3}>={XY:{u:[1,0,0],v:[0,1,0],axis:[0,0,1]},XZ:{u:[1,0,0],v:[0,0,-1],axis:[0,1,0]},YZ:{u:[0,1,0],v:[0,0,1],axis:[1,0,0]}},frame=base[plane],angle=phaseDegrees*Math.PI/180,sign=hand==='Right'?1:-1,u=frame.u.map((n,i)=>n*Math.cos(angle)+frame.v[i]*Math.sin(angle)) as Vec3,v=frame.u.map((n,i)=>sign*(-n*Math.sin(angle)+frame.v[i]*Math.cos(angle))) as Vec3;
 let candidate:Bar={...bar,pathInput:undefined,shape:'helix',curve:undefined,helix:{center:[0,0,0],u,v,axis:frame.axis,pitch:B,turns:C},radius,shapeCode:'77',points:[],lengthMethod:'bs8666',outsideDiameter:ext,start:0,end:0,tail:0,axis:plane==='XY'?'Z':plane==='XZ'?'Y':'X',distributionStart:0,distributionEnd:0,cutOverride:0,freeDimensionLeg:undefined,spatialDimensions:undefined,dimensionView:undefined,bsDimensionsConfirmed:false,placementConfirmed:false};
 const geometry=helixGeometry(candidate);if(geometry.errors.length)throw Error(geometry.errors.join(' · '));
 const target=bar.targetSolidId?solidsOf(member).find(s=>s.id===bar.targetSolidId):undefined;if(bar.targetSolidId&&!target)throw Error('ไม่พบชิ้นส่วนเป้าหมาย');const size=target?.size||boundsOf(member),margin=geometry.sagitta+.001,bounds=helixBounds(candidate.helix!,radius),center=bounds.lo.map(n=>c+margin-n) as Vec3,axisIndex=plane==='XY'?2:plane==='XZ'?1:0,span=size[axisIndex]-2*(c+margin)-(bounds.hi[axisIndex]-bounds.lo[axisIndex]);
 if(span<0||bounds.hi.some((n,i)=>n-bounds.lo[i]+2*(c+margin)>size[i]))throw Error('รูปเกลียวและ cover เกินชิ้นส่วนที่เลือก');
 candidate={...candidate,helix:{...candidate.helix!,center},distributionStart:c+margin,distributionEnd:c+margin+(bar.count===1?0:span)};
 const problems=[...validateMember({...member,bars:[candidate]},spec),...bsAssessment({...candidate,bsDimensionsConfirmed:true},barPaths(member,candidate)[0]||[],spec).problems];if(problems.length)throw Error([...new Set(problems)].join(' · '));
 return candidate;
}
