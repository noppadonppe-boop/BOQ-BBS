import type {Bar,Member,Spec,Vec3} from './model';
import {bsGeneration,bsAssessment} from './bs8666';
import {OVAL_CLOSURE_PENDING} from './bsOvalLink';
import {barPaths,validateMember} from './engine';
import {boundsOf,solidsOf} from './solids';
export function buildBSOvalLink(member:Member,bar:Bar,spec:Spec,A:number,B:number,C:number,otherEnd=C){
 if(bsGeneration(spec)<8)throw Error('เลือกรุ่นขั้นต่ำ 8 ใน General Spec ก่อนสร้างรูป 33');
 if([A,B,C,otherEnd].some(n=>!Number.isFinite(n)||n<=0||n>200000||Math.abs(n/5-Math.round(n/5))>1e-6))throw Error('A/B/C และปลายกลับอ้างอิงต้องเป็นค่าบวกทีละ 5 mm และไม่เกิน 200,000 mm');
 const ext=bar.outsideDiameter??bar.diameter,half=ext/2,R=(B-ext)/2,c=member.cover+half,a=A-ext,h=B-ext,end=C-half;
 if(R<=half||end<=R||otherEnd-half<=R||a<=2*R)throw Error('ขนาดปลาย/ช่วงตรงหรือรัศมีของรูป 33 ไม่เป็นบวก');
 const xy=[[a-end,h],[a,h],[a,0],[0,0],[0,h],[a,h],[a,0],[a-otherEnd+half,0]],lowX=Math.min(...xy.map(v=>v[0])),lowZ=Math.min(...xy.map(v=>v[1]));
 const points=xy.map(([x,z])=>[x-lowX+c,c,z-lowZ+c] as Vec3),target=bar.targetSolidId?solidsOf(member).find(s=>s.id===bar.targetSolidId):undefined;
 if(bar.targetSolidId&&!target)throw Error('ไม่พบชิ้นส่วนเป้าหมาย');
 const size=target?.size||boundsOf(member);
 const candidate:Bar={...bar,pathInput:undefined,shape:'polyline',shapeCode:'33',curve:undefined,helix:undefined,placementLayout:undefined,axis:'X',face:'bottom',start:0,end:0,tail:0,points,radius:R,distributionStart:c,distributionEnd:bar.count===1?c:size[1]-c,lengthMethod:'bs8666',outsideDiameter:ext,cutOverride:0,dimensions:undefined,spatialDimensions:undefined,dimensionView:undefined,freeDimensionLeg:undefined,bsDimensionsConfirmed:false,placementConfirmed:false};
 const aCheck=bsAssessment({...candidate,bsDimensionsConfirmed:true},barPaths(member,candidate)[0]||[],spec),problems=[...validateMember({...member,bars:[candidate]},spec),...aCheck.problems.filter(p=>p!==OVAL_CLOSURE_PENDING)];
 if(!aCheck.ovalLink)problems.push('พิกัดไม่ตรงแนวฉายรูป 33 ที่รองรับ');
 if(problems.length)throw Error([...new Set(problems)].join(' · '));return candidate;
}
