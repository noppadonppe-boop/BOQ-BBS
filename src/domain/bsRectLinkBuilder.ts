import type {Bar,Member,Spec,Vec3} from './model';
import {bsGeneration,bsAssessment} from './bs8666';
import {LINK_CLOSURE_PENDING} from './bsRectLink';
import {barPaths,validateMember} from './engine';
import {boundsOf,solidsOf} from './solids';
export function buildBSRectLink(member:Member,bar:Bar,spec:Spec,A:number,B:number,C:number,innerRadius:number){
 if(bsGeneration(spec)<7)throw Error('เลือกรุ่นขั้นต่ำ 7 ใน General Spec ก่อนสร้างรูป 51');
 if([A,B,C].some(n=>!Number.isFinite(n)||n<=0||Math.abs(n/5-Math.round(n/5))>1e-6))throw Error('A/B/C ต้องเป็นค่าบวกทีละ 5 mm; D จะเท่ากับ C');
 if(!Number.isFinite(innerRadius)||innerRadius<=0)throw Error('ระบุรัศมีด้านในเป็นค่าบวก');
 const ext=bar.outsideDiameter??bar.diameter,half=ext/2,c=member.cover+half,a=A-ext,b=B-ext,end=C-half;
 if(a<=0||b<=0||end<=0)throw Error('มิติผิวนอกเล็กกว่าขนาดเหล็ก');
 const xy=[[a-end,b],[a,b],[a,0],[0,0],[0,b],[a,b],[a,b-end]];
 const points=xy.map(([x,z])=>[x+c,c,z+c] as Vec3),target=bar.targetSolidId?solidsOf(member).find(s=>s.id===bar.targetSolidId):undefined;
 if(bar.targetSolidId&&!target)throw Error('ไม่พบชิ้นส่วนเป้าหมาย');
 const size=target?.size||boundsOf(member);
 const candidate:Bar={...bar,pathInput:undefined,shape:'polyline',shapeCode:'51',curve:undefined,helix:undefined,axis:'X',face:'bottom',start:0,end:0,tail:0,points,radius:innerRadius+half,distributionStart:c,distributionEnd:bar.count===1?c:size[1]-c,lengthMethod:'bs8666',outsideDiameter:ext,cutOverride:0,dimensions:undefined,spatialDimensions:undefined,dimensionView:undefined,freeDimensionLeg:undefined,bsDimensionsConfirmed:false,placementConfirmed:false};
 const aCheck=bsAssessment({...candidate,bsDimensionsConfirmed:true},barPaths(member,candidate)[0]||[],spec),problems=[...validateMember({...member,bars:[candidate]},spec),...aCheck.problems.filter(p=>p!==LINK_CLOSURE_PENDING)];
 if(!aCheck.rectLink)problems.push('พิกัดไม่ตรงรูป 51 มาตรฐาน');
 if(problems.length)throw Error([...new Set(problems)].join(' · '));
 return candidate;
}
