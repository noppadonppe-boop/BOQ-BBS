import type {Attachment,Bar,Member,Project,Spec} from './model';
import {code99Print} from './code99Print';
import {barDetail} from './barDetails';
import {bsEnabled,bsMinimum} from './bs8666';
import {CODE99_REVIEW_POLICY,CODE99_HOLD,type Code99Review,type Code99ReviewRequest} from './code99ReviewSchema';
import {sourceCurrent} from './sourceRevisions';
export {CODE99_REVIEW_POLICY,CODE99_HOLD};
export const indexedApprover=(p:Project,uid:string)=>!!p.roleSets?.[uid]?.includes('approver')||p.acl[uid]==='approver';
export const code99MemberBasis=(m:Member)=>({id:m.id,code:m.code,category:m.category,inputEpoch:m.inputEpoch||'',x:m.x,y:m.y,z:m.z,cover:m.cover,faces:m.faces,pedestal:m.pedestal,geometry:m.geometry,prismGeometry:m.prismGeometry,beamAssembly:m.beamAssembly,placementContext:m.placementContext,sourceSchedule:m.sourceSchedule,bars:m.bars});
export const code99EvidenceBasis=(a:Attachment)=>({id:a.id,path:a.path,name:a.name,memberId:a.memberId,kind:a.kind,revision:a.revision,sha256:a.sha256,version:a.version||1,pageCount:a.pageCount,sourceStatus:a.sourceStatus||'Current',supersededById:a.supersededById||''});
export const code99SpecBasis=(s:Spec)=>s;
export function reviewDimensions(m:Member,b:Bar,request:Code99ReviewRequest){
 if(request.mode==='external')return request.dimensions;
 const p=code99Print(m,b);if(!p.available)throw Error(p.reason+' · ใช้แบบเต็มที่รับรองและกรอกมิติภายนอกสำหรับโหมด external');
 return p.parts.flatMap(p=>p.dimensions.map(d=>({label:d.label,leg:d.leg,value:d.value,free:d.free})));
}
export function code99ReviewProblems(m:Member,b:Bar,s:Spec,r:Code99ReviewRequest,dimensions=reviewDimensions(m,b,r)){
 const out:string[]=[];if(s.code99ReviewPolicy!==CODE99_REVIEW_POLICY||!bsEnabled(s))out.push('เปิดนโยบายตรวจรับ Code99 และ BS ขั้นต่ำก่อนตรวจรับ');
 if(b.shapeCode.trim()!=='99'||['arc','helix'].includes(b.shape))out.push('ใช้กับ Code99 ที่เป็นแนวประกอบช่วงตรงและส่วนดัดเท่านั้น');
 if(!b.bsDimensionsConfirmed||b.outsideDiameter===undefined)out.push('ยืนยันผิวนอก/ซี่บั้งและมิติจากแบบก่อนตรวจรับ');
 if(!b.placementConfirmed)out.push('ยืนยันตำแหน่งของ Mark ก่อนตรวจรับ');
 if(b.cutOverride>0)out.push('การตรวจรับรุ่นนี้ไม่อนุมัติยาวตัด override');
 const detail=barDetail(m,b),n=detail.legs.length;
 if(!dimensions.length||dimensions.some(d=>!Number.isFinite(d.value)||d.value<=0||Math.abs(d.value/5-Math.round(d.value/5))>1e-6))out.push('มิติดัดต้องเป็นค่าบวกทีละ5mm ตามฐานที่ตรวจ');
 if(dimensions.filter(d=>d.free).length!==1||dimensions.some(d=>d.free&&d.leg===null))out.push('เลือกมิติอิสระของช่วงจริงหนึ่งมิติ');
 const legs=dimensions.filter(d=>d.leg!==null);if(legs.length!==n||new Set(legs.map(d=>d.leg)).size!==n||legs.some(d=>d.leg!<1||d.leg!>n))out.push('มิติภายนอกต้องระบุช่วงจริงครบโดยไม่ซ้ำ');
 if(new Set(dimensions.map(d=>d.label)).size!==dimensions.length)out.push('ป้ายมิติซ้ำ');
 const min=bsMinimum(b.bsType,b.diameter,s,b.grade);if(!min)out.push('ไม่พบขั้นต่ำชนิด/ขนาด BS');else if(legs.some(d=>(d.leg===1||d.leg===n)&&d.value<min.endDimension-1e-6))out.push(`${min.projectRule?'วัสดุ X ของโครงการ':'Table3'}: มิติปลายต้อง≥${min.endDimension}mm`);
 const minStraight=(r.kind==='link'?10:5)*b.diameter;
 if([detail.legs[0],detail.legs.at(-1)].some(l=>!l||l.straightLength<minStraight-1e-6))out.push(`Table3 note2: ปลาย${r.kind}ต้องมีช่วงตรง≥${minStraight}mm`);
 if(Math.min(...r.transportBox)>2750)out.push('Clause7.5: ด้านสั้นของกรอบขนส่งต้องไม่เกิน2750mm');
 if(r.mode==='computed'){
  const p=code99Print(m,b);if(p.available){const actual=[0,1].map(i=>Math.max(...p.drawing.outline.map(v=>v[i]))-Math.min(...p.drawing.outline.map(v=>v[i]))).sort((a,b)=>a-b),box=[...r.transportBox].sort((a,b)=>a-b);if(actual.some((v,i)=>v>box[i]+1e-6))out.push('กรอบขนส่งที่กรอกเล็กกว่ารูปผิวนอกที่ระบบคำนวณ');}
 }
 const cut=Math.ceil((detail.geometricLength-.000001)/s.rounding)*s.rounding;
 if(cut>18000||cut>12000&&!r.supplyAgreement.trim())out.push('ต้องมีข้อตกลงจัดส่งเมื่อยาวเกิน12m และไม่เกิน18m');
 if(r.mode==='computed'&&r.dimensions.length)out.push('โหมด computed ไม่รับมิติภายนอกที่กรอกทับ');
 const free=legs.find(d=>d.free);if(free&&b.freeDimensionLeg!==free.leg)out.push('มิติอิสระในแบบและชุดตรวจรับไม่ตรงกัน');
 return out;
}
export function currentReviewMetadata(p:Project,m:Member,a:Attachment|undefined,r:Code99Review){
 return p.spec.code99ReviewPolicy===CODE99_REVIEW_POLICY&&r.projectId===p.id&&r.memberId===m.id&&r.memberEpoch===m.inputEpoch&&(m.status!=='Draft'||m.version===r.request.memberVersion)&&indexedApprover(p,r.actorUid)&&!!a&&sourceCurrent(a)&&(a.memberId===''||a.memberId===m.id)&&a.sha256===r.evidence.sha256&&(a.version||1)===r.evidence.version;
}
