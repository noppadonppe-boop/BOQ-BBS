import type {Attachment, Bar, Member, SnapshotBundle} from './model';
import {sourceCurrent,memberSourceInfo} from './sourceRevisions';

export type SourceAnchor = NonNullable<Attachment['annotations']>[number] & {number:number;bar:Bar};
export type SourceSheet = {attachment:Attachment;member:Member;reference:string;page:number;part:number;parts:number;anchors:SourceAnchor[]};
export const SOURCE_LIMITS={files:50,bytes:90*1024*1024,sheets:200,packagePages:500};

// Annotation coordinates are normalized to the visible, rotated page in FilePanel.
// They are source references and never physical occurrences or bar quantities.
export function sourceSheets(bundle:SnapshotBundle,size:'A3'|'A1'):SourceSheet[]{
 const members=new Map(bundle.members.map(m=>[m.id,m]));
 for(const a of bundle.attachments)if(sourceCurrent(a)&&memberSourceInfo(a)&&members.has(a.memberId)&&!a.annotations?.length)throw Error(`${a.name} / Rev ${a.revision}: ${a.sourceRevision?'revision ใหม่':'แบบที่รับใหม่'}ยังไม่มีจุดชี้ ให้บันทึก Mark ก่อนส่งชุดแบบต้นทาง`);
 const sources=bundle.attachments.filter(a=>sourceCurrent(a)&&members.has(a.memberId)&&(a.annotations?.length||0)>0)
  .sort((a,b)=>members.get(a.memberId)!.code.localeCompare(members.get(b.memberId)!.code,'en',{numeric:true})||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 if(!sources.length)throw Error('ยังไม่มีจุดชี้ Mark ที่บันทึกบนแบบต้นทางของสมาชิกที่เลือก');
 if(sources.length>SOURCE_LIMITS.files||sources.reduce((n,a)=>n+a.size,0)>SOURCE_LIMITS.bytes)throw Error('แบ่งชุดแบบต้นทาง: สูงสุด 50 ไฟล์ / 90 MB ต่อชุด');
 const sheets:SourceSheet[]=[],perPage=size==='A3'?12:28;
 sources.forEach((attachment,i)=>{
  const member=members.get(attachment.memberId)!,bars=new Map(member.bars.map(b=>[b.mark,b])),byPage=new Map<number,SourceAnchor[]>();
  if(!['application/pdf','image/png','image/jpeg'].includes(attachment.contentType))throw Error(`${attachment.name}: ชนิดไฟล์ต้นทางไม่รองรับ`);
  attachment.annotations!.forEach((a,index)=>{
   if(!Number.isInteger(a.page)||a.page<1||![a.x,a.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error(`${attachment.name}: จุดชี้ #${index+1} ไม่ถูกต้อง`);
   if(a.label&&![a.label.x,a.label.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error(`${attachment.name}: ตำแหน่งป้าย #${index+1} ไม่ถูกต้อง`);
   const bar=bars.get(a.mark);if(!bar)throw Error(`${member.code} / ${attachment.name}: จุดชี้ #${index+1} อ้าง Mark ${a.mark} ที่ไม่มีในชุดข้อมูลนี้ ให้แก้จุดชี้ก่อนส่งออก`);
   if(attachment.contentType!=='application/pdf'&&a.page!==1)throw Error(`${attachment.name}: รูปภาพมีหน้า 1 เท่านั้น`);
   const rows=byPage.get(a.page)||[];rows.push({...a,number:index+1,bar});byPage.set(a.page,rows);
  });
  for(const [page,anchors] of [...byPage].sort(([a],[b])=>a-b)){
   const parts=Math.ceil(anchors.length/perPage);
   for(let part=0;part<parts;part++)sheets.push({attachment,member,reference:'S'+String(i+1).padStart(2,'0'),page,part,parts,anchors:anchors.slice(part*perPage,(part+1)*perPage)});
  }
 });
 if(sheets.length>SOURCE_LIMITS.sheets)throw Error('แบ่งชุดแบบต้นทาง: เกิน 200 หน้ารูปอ้างอิงต่อชุด');
 return sheets;
}

export type SourceBox={x:number;y:number;w:number;h:number};
export function sourceFit(width:number,height:number,rotation:number,box:SourceBox){
 if(![width,height,box.w,box.h].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(rotation)||rotation%90!==0)throw Error('ขนาด/การหมุนหน้าแบบไม่ถูกต้อง');
 const angle=((rotation%360)+360)%360,sw=angle%180?height:width,sh=angle%180?width:height,scale=Math.min(box.w/sw,box.h/sh);
 const fit={x:box.x+(box.w-sw*scale)/2,y:box.y+(box.h-sh*scale)/2,w:sw*scale,h:sh*scale,scale,angle};
 return fit;
}

export function sourceCallouts(anchors:SourceAnchor[],box:SourceBox,labelBox:SourceBox=box){
 const used:{x:number;y:number}[]=[];
 return anchors.map(a=>{
  const target={x:box.x+a.x*box.w,y:box.y+a.y*box.h};
  if(a.label){const label={x:Math.max(labelBox.x+4,Math.min(labelBox.x+labelBox.w-4,box.x+a.label.x*box.w)),y:Math.max(labelBox.y+4,Math.min(labelBox.y+labelBox.h-4,box.y+a.label.y*box.h))};used.push(label);return {...a,target,label,numberText:String(a.number).padStart(3,'0')};}
  const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
  let best={x:target.x,y:target.y},score=Infinity;
  for(const distance of [8,15,22,29,36])for(const dx of [-1,1])for(const dy of [-1,0,1]){
   const at={x:clamp(target.x+dx*distance,labelBox.x+4,labelBox.x+labelBox.w-4),y:clamp(target.y+dy*distance*.6,labelBox.y+4,labelBox.y+labelBox.h-4)};
   const collisions=used.filter(p=>Math.hypot(at.x-p.x,at.y-p.y)<8).length;
   const cost=collisions*10000+Math.hypot(at.x-target.x,at.y-target.y);
   if(cost<score){best=at;score=cost;}
  }
  used.push(best);return {...a,target,label:best,numberText:String(a.number).padStart(3,'0')};
 });
}

/** Number circles in exported source sheets have a6.2mm diameter. */
export function assertSourceCalloutSpacing(calls:ReturnType<typeof sourceCallouts>){
 for(let i=0;i<calls.length;i++)for(let j=i+1;j<calls.length;j++)if(Math.hypot(calls[i].label.x-calls[j].label.x,calls[i].label.y-calls[j].label.y)<7)throw Error(`ป้ายจุดชี้ #${calls[i].numberText} / #${calls[j].numberText} ซ้อนกันในกระดาษที่เลือก ให้จัดป้ายใหม่หรือแยกชุดก่อนส่งออก`);
}
