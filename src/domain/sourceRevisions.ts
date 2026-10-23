import type {Attachment,Bar} from './model';
import {canonical} from './canonical';
import {isModelFile} from './fileTypes';

export const sourceCurrent=(a:Attachment)=>a.sourceStatus!=='Superseded';
export const generalSourceInfo=(a:Attachment)=>a.sourceRevision?.scope==='GeneralSpec'?a.sourceRevision:a.sourceIntake?.scope==='GeneralSpec'?a.sourceIntake:undefined;
// CAD / BIM files carry no Mark pointers, so they never open a member source review
export const memberSourceInfo=(a:Attachment)=>a.memberId&&!isModelFile(a)?(a.sourceRevision?.scope!=='GeneralSpec'?a.sourceRevision:undefined)||(a.sourceIntake?.scope==='Member'?a.sourceIntake:undefined):undefined;
export const generalSource=(a:Attachment)=>!a.memberId&&!!generalSourceInfo(a);
export function generalSourceReview(a:Attachment){const required=generalSource(a)&&sourceCurrent(a),review=generalSourceInfo(a)?.review,reviewed=required&&!!review?.note?.trim()&&review.annotationVersion===(a.version||1);return {required,reviewed,pending:required&&!reviewed};}
export function generalSourceProblems(attachments:Attachment[]){return attachments.filter(a=>generalSourceReview(a).pending).map(a=>`${a.name} / Rev ${a.revision}: ตรวจเอกสาร General Spec ฉบับใหม่ก่อนตรวจสมาชิก`);}
export const sourceBarNames=(bars:Bar[])=>bars.map(b=>({id:b.id,mark:b.mark})).sort((a,b)=>a.id.localeCompare(b.id));
export function sourceReconciliation(a:Attachment,bars:Bar[],attachments:Attachment[]=[],noRebarBasis?:string){
 const info=memberSourceInfo(a),baseline=info?.baselineBars||[],current=sourceBarNames(bars),ids=new Set(current.map(b=>b.id));
 const peers=attachments.filter(p=>p.id!==a.id&&p.memberId===a.memberId&&sourceCurrent(p)&&(!a.sourceAdoption||!!memberSourceInfo(p)));
 const rows=current.map(b=>{const old=baseline.find(x=>x.id===b.id),points=(a.annotations||[]).filter(x=>x.mark===b.mark),peerPoints=peers.flatMap(p=>(p.annotations||[]).filter(x=>x.mark===b.mark));return {...b,previousMark:old?.mark||'',change:old?(old.mark===b.mark?'Unchanged':'Renamed'):'Added',points:points.length,otherPoints:peerPoints.length,pages:[...new Set(points.map(p=>p.page))].sort((a,b)=>a-b)};});
 const removed=baseline.filter(b=>!ids.has(b.id)),dangling=(a.annotations||[]).filter(p=>!bars.some(b=>b.mark===p.mark));
 const otherDangling=peers.flatMap(p=>(p.annotations||[]).filter(x=>!bars.some(b=>b.mark===x.mark)));
 const noRebar=!bars.length&&!!noRebarBasis?.trim(),review=info?.review,ready=!!info&&sourceCurrent(a)&&(noRebar?true:!!bars.length&&!!a.annotations?.length&&rows.every(r=>r.points+r.otherPoints>0))&&!dangling.length&&!otherDangling.length;
 const reviewed=ready&&!!review&&review.annotationVersion===(a.version||1)&&canonical([...review.bars].sort((a,b)=>a.id.localeCompare(b.id)))===canonical(current)&&(!noRebar||review.noRebarBasis===noRebarBasis);
 return {rows,removed,dangling,otherDangling,noRebar,ready,reviewed,pending:!!info&&!reviewed};
}
export function sourceReviewProblems(attachments:Attachment[],bars:Bar[],noRebarBasis?:string){return attachments.filter(a=>sourceCurrent(a)&&memberSourceInfo(a)&&sourceReconciliation(a,bars,attachments,noRebarBasis).pending).map(a=>`${a.name} / Rev ${a.revision}: ${noRebarBasis&&!bars.length?'ทบทวนเอกสารยืนยันขอบเขตไม่มีเหล็ก':'ตรวจจุดชี้ Mark ของ'+(a.sourceRevision?'revision ใหม่':'แบบที่รับใหม่')+'ให้ครบ'}ก่อนตรวจสมาชิก`);}
export function remapSourceLinks(a:Attachment,ids:Record<string,string>):Attachment{
 const mapped=(id:string)=>{if(!ids[id])throw Error('ไม่พบไฟล์ในสาย revision: '+id);return ids[id];};
 return {...a,...(a.supersededById?{supersededById:mapped(a.supersededById)}:{}),...(a.sourceRevision?{sourceRevision:{...a.sourceRevision,previousAttachmentId:mapped(a.sourceRevision.previousAttachmentId)}}:{})};
}
export function validateSourceChains(attachments:Attachment[]){
 const map=new Map(attachments.map(a=>[a.id,a]));if(map.size!==attachments.length)throw Error('ไฟล์แนบซ้ำ');
 for(const a of attachments){
  if(a.sourceAdoption&&(!a.sourceIntake||a.sourceRevision||a.sourceAdoption.specChangeJobId!==a.sourceIntake.specChangeJobId))throw Error('ข้อมูลนำไฟล์เดิมเข้าทะเบียนต้องมีประวัติรับแบบที่ตรงกัน: '+a.name);
  if(a.sourceIntake&&(a.sourceRevision||(a.sourceIntake.scope==='GeneralSpec'?!!a.memberId:!a.memberId)))throw Error('ข้อมูลรับแบบครั้งแรกต้องมีเจ้าของตามขอบเขตและไม่มี revision ก่อนหน้า: '+a.name);
  const prev=a.sourceRevision?map.get(a.sourceRevision.previousAttachmentId):undefined,next=a.supersededById?map.get(a.supersededById):undefined;
  if(a.sourceRevision&&(!prev||prev.memberId!==a.memberId||prev.kind!==a.kind||prev.revision!==a.sourceRevision.previousRevision||prev.supersededById!==a.id||sourceCurrent(prev)))throw Error('ไฟล์ revision ก่อนหน้าไม่ตรงสาย: '+a.name);
  if(a.sourceStatus==='Superseded'&&(!next||next.memberId!==a.memberId||next.sourceRevision?.previousAttachmentId!==a.id))throw Error('ไฟล์ที่แทน revision ไม่ตรงสาย: '+a.name);
  if(sourceCurrent(a)&&a.supersededById)throw Error('ฉบับปัจจุบันมีไฟล์แทนที่แล้ว: '+a.name);
  if(a.sourceRevision&&!a.memberId&&!generalSource(a))throw Error('สาย General Spec ต้องระบุขอบเขตเอกสารโครงการ: '+a.name);
  if(a.sourceRevision?.scope==='GeneralSpec'&&(a.memberId||a.sourceRevision.baselineBars.length||!a.sourceRevision.specChangeJobId||a.sourceRevision.affectedMemberCount===undefined))throw Error('ข้อมูลสาย General Spec ไม่ครบ: '+a.name);
  const seen=new Set<string>();let p:Attachment|undefined=a;
  while(p){if(seen.has(p.id))throw Error('สาย revision วนซ้ำ');seen.add(p.id);p=p.sourceRevision?map.get(p.sourceRevision.previousAttachmentId):undefined;}
 }
}
