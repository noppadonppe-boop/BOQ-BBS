import {sourceScheduleSchema,type SourceSchedule,type SourceScheduleRow} from './sourceSchedule';
import {sourceShapeReferenceSchema,type SourceShapeReference} from './sourceRegions';
import type {Attachment} from './model';
import {mergeHorizontalRules,type HorizontalRule} from './pdfTableRules';
import {readReportedMemberQuantity,type ReportedMemberQuantity} from './reportedMemberQuantity';

export type NativeSourceTextItem={text:string;x:number;y:number;width:number;height:number;angle?:number};
export type NativeSourceTextPage={page:number;width:number;height:number;rotation:number;items:NativeSourceTextItem[];horizontalRules?:HorizontalRule[]};
export type SourceTableCandidate={sha256:string;page:number;rows:SourceScheduleRow[];statedTotalWeight?:number;tableRegion?:SourceShapeReference;tableRegions?:SourceShapeReference[];memberQuantity?:ReportedMemberQuantity;issues:string[];warnings:string[];ready:boolean};
type Column='mark'|'diameter'|'count'|'grade'|'cutLength'|'unitWeight'|'weight'|'shape';
const heading=(s:string):Column|undefined=>({pos:'mark',mark:'mark',diameter:'diameter',number:'count',qty:'count',"q'ty":'count',grade:'grade',length:'cutLength','kg/p':'unitWeight',weight:'weight',bendingshape:'shape'} as Record<string,Column>)[s.replace(/\s/g,'').toLowerCase()];
const center=(i:NativeSourceTextItem)=>i.x+i.width/2;
const decimal=(s:string)=>/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)?Number(s.replace(/,/g,'')):undefined;
const clean=(s:string)=>s.trim().replace(/\s+/g,' ');

type PanelContext={title:NativeSourceTextItem;total:NativeSourceTextItem;totalWeight:number;left:number;right:number};
/** Each panel reads its literal cells. Continuation metadata comes from the
 * real shared title/Total; it never inserts invented titles or subtotal cells. */
function readPanel(input:NativeSourceTextPage,sha256:string,panel?:PanelContext):SourceTableCandidate{
 const result:SourceTableCandidate={sha256,page:input.page,rows:[],issues:[],warnings:['ตรวจหน่วย mm/kg และฐานจำนวนจากต้นฉบับก่อนรับตาราง รูปดัดที่เลือกเป็นรูปอ้างอิง ไม่ใช่แนวเหล็กที่คำนวณแล้ว'],ready:false};
 const fail=(message:string)=>{result.issues.push(message);return result;};
 if(!/^[a-f0-9]{64}$/.test(sha256)||!Number.isInteger(input.page)||input.page<1||![input.width,input.height].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(input.rotation))return fail('ตัวตนหรือขนาดหน้าต้นทางไม่ถูกต้อง');
 if(input.rotation%90!==0)return fail('การหมุนหน้าต้นทางไม่ถูกต้อง');
 if(input.items.length>30000)return fail('ข้อความหน้านี้เกินขนาดที่รองรับ ให้กรอกตารางด้วยมือ');
 const items=input.items.filter(i=>clean(i.text)&&[i.x,i.y,i.width,i.height].every(Number.isFinite)&&i.width>=0&&i.height>0).map(i=>({...i,text:clean(i.text)}));
 const titles=items.filter(i=>/^REBAR\s+BENDING\s+SCHEDULE$/i.test(i.text));
 if(titles.length!==1)return fail(titles.length?'พบหลายตารางในหน้าเดียว ให้แยกตรวจและกรอกด้วยมือ':'ยังไม่พบตาราง REBAR BENDING SCHEDULE จาก text layer ให้เลือกหน้าอื่นหรือกรอกด้วยมือ');
 // /Rotate can be compensated by the PDF's text matrix. Use the visible text
 // baseline, as displayed in FilePanel, rather than rejecting a page flag.
 if(Math.abs(titles[0].angle||0)>.01)return fail('ข้อความตารางที่แสดงยังไม่อยู่แนวนอน ให้กรอกค่าหรือเลือกกรอบรูปด้วยมือ');
 const title=panel?.title||titles[0],headers=items.filter(i=>heading(i.text)&&i.y>title.y&&i.y<=title.y+input.height*.05&&i.x>=(panel?.left??title.x-input.width*.01)&&i.x<(panel?.right??input.width));
 const baseline=headers.find(h=>heading(h.text)==='mark')?.y;
 if(baseline===undefined)return fail('ยังแยกหัวคอลัมน์ Mark / Pos ไม่ได้ ให้กรอกตารางด้วยมือ');
 const line=headers.filter(i=>Math.abs(i.y-baseline)<Math.max(i.height,6)*.6).sort((a,b)=>center(a)-center(b));
 if(line.some(i=>Math.abs(i.angle||0)>.01))return fail('ข้อความหัวคอลัมน์ไม่ได้แสดงแนวนอน ให้กรอกด้วยมือ');
 const columns=line.map(i=>({key:heading(i.text)!,item:i,c:center(i)}));
 const required:Column[]=['mark','diameter','count','grade','cutLength','weight','shape'];
 if(required.some(key=>columns.filter(c=>c.key===key).length!==1)||new Set(columns.map(c=>c.key)).size!==columns.length)return fail('หัวคอลัมน์จำนวน/ขนาด/เกรด/ยาวตัด/น้ำหนัก/รูปดัดยังไม่ครบหรือซ้ำ ให้กรอกด้วยมือ');
 if(columns.map(c=>c.key).filter(c=>c!=='unitWeight').join(',')!==required.join(','))return fail('ลำดับคอลัมน์ไม่ตรงรูปแบบที่รองรับ ให้กรอกด้วยมือ');
 const gaps=columns.slice(1).map((c,i)=>c.c-columns[i].c),gap=gaps.slice(0,5).sort((a,b)=>a-b)[2];
 if(!gap||gap<1)return fail('ระยะคอลัมน์ไม่ถูกต้อง');
 const shape=columns.find(c=>c.key==='shape')!,left=Math.max(0,columns[0].c-gap/2),right=Math.min(input.width,shape.c+Math.max(shape.item.width,gap*1.35));
 // A centred "Bending shape" heading spans a wide drawing cell. Its centre
 // is not the numeric Weight cell's edge: dimensions may use the same font.
 const boundaries=columns.map((c,i)=>({key:c.key,left:i?(columns[i-1].c+c.c)/2:left,right:i<columns.length-1?Math.min((c.c+columns[i+1].c)/2,c.key==='weight'?c.c+gap/2:Infinity):right}));
 const cell=(key:Column,y:number,tolerance:number,fontHeight?:number)=>{const c=boundaries.find(c=>c.key===key)!;return items.filter(i=>center(i)>=c.left&&center(i)<c.right&&Math.abs(i.y-y)<=tolerance&&(fontHeight===undefined||Math.abs(i.height-fontHeight)<=Math.max(.2,fontHeight*.1))).sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ').trim();};
 const totals=items.filter(i=>/^Total\s*:$/i.test(i.text)&&i.y>baseline&&center(i)>=left&&center(i)<shape.c);
 if(!panel&&totals.length!==1)return fail('ยังระบุแถว Total ของตารางเดียวกันไม่ได้ ให้กรอกด้วยมือ');
 const total=panel?.total||totals[0],totalText=panel?'':cell('weight',total.y,Math.max(total.height,8)*.6),totalWeight=panel?.totalWeight??decimal(totalText);
 if(totalWeight===undefined||totalWeight<=0)return fail('น้ำหนัก Total อ่านไม่ชัด ให้กรอกด้วยมือ');
 result.statedTotalWeight=totalWeight;
 const grades=items.filter(i=>{const c=boundaries.find(c=>c.key==='grade')!;return center(i)>=c.left&&center(i)<c.right&&i.y>baseline+i.height*.5&&i.y<total.y;}).sort((a,b)=>a.y-b.y);
 if(!grades.length||grades.length>300)return fail('จำนวนแถวข้อมูลไม่อยู่ในช่วง1–300แถวที่รองรับ');
 const bodyHeight=grades[0].height,weightColumn=boundaries.find(c=>c.key==='weight')!;
 const weightItems=items.filter(i=>center(i)>=weightColumn.left&&center(i)<weightColumn.right&&i.y>baseline&&i.y<total.y&&Math.abs(i.height-bodyHeight)<=Math.max(.2,bodyHeight*.1));
 const shapeLeft=Math.max(columns.find(c=>c.key==='weight')!.item.x+columns.find(c=>c.key==='weight')!.item.width,...weightItems.map(i=>i.x+i.width))+gap*.15;
 const shapeItems=items.filter(i=>i.x>=shapeLeft&&i.y>baseline&&i.y<total.y&&i.height<=bodyHeight*1.1&&i.x<(panel?.right??input.width));
 const shapeRight=Math.min(panel?.right??input.width,Math.max(shape.item.x+shape.item.width,...shapeItems.map(i=>i.x+i.width))+gap*.5);
 const rowYs:number[]=[];for(const i of grades)if(!rowYs.some(y=>Math.abs(y-i.y)<Math.max(i.height,8)*.6))rowYs.push(i.y);
 const pageRules=mergeHorizontalRules((input.horizontalRules||[]).slice(0,5000).filter(r=>[r.left,r.right,r.y].every(Number.isFinite)));
 for(const [index,y]of rowYs.entries()){
  const height=grades.find(i=>Math.abs(i.y-y)<1)?.height||12,tolerance=Math.max(height,8)*.6;
  const mark=cell('mark',y,tolerance,height),diameter=decimal(cell('diameter',y,tolerance,height)),count=decimal(cell('count',y,tolerance,height)),grade=cell('grade',y,tolerance,height),cutLength=decimal(cell('cutLength',y,tolerance,height)),weight=decimal(cell('weight',y,tolerance,height));
  const hasUnitWeight=columns.some(c=>c.key==='unitWeight'),unitWeight=hasUnitWeight?decimal(cell('unitWeight',y,tolerance,height)):undefined;
  if(hasUnitWeight&&(unitWeight===undefined||unitWeight<0||unitWeight>1e15)){result.issues.push(`แถว ${index+1}: คอลัมน์ Kg/p อ่านไม่ครบหรือไม่ถูกต้อง ห้ามตัดข้อมูลช่องนี้ทิ้ง`);continue;}
  if(!/^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,31}$/.test(mark)||diameter===undefined||diameter<=0||diameter>100||count===undefined||!Number.isInteger(count)||count<1||count>200000000||!grade||grade.length>40||cutLength===undefined||cutLength<=0||cutLength>200000||weight===undefined||weight<=0){result.issues.push(`แถว ${index+1}: อ่าน Mark/ขนาด/จำนวน/เกรด/ยาวตัด/น้ำหนักไม่ครบหรือไม่ถูกต้อง ห้ามรับเฉพาะแถวที่อ่านได้`);continue;}
  let top=index?(rowYs[index-1]+y)/2:baseline+Math.max(height,8)*.35,bottom=index<rowYs.length-1?(y+rowYs[index+1])/2:(y+total.y)/2;
  const rules=pageRules.filter(r=>r.left<=columns[0].item.x+gap/2&&r.right>=shape.c&&r.y>=baseline&&r.y<=total.y),above=rules.filter(r=>r.y<y-height*.5).sort((a,b)=>b.y-a.y)[0],below=rules.filter(r=>r.y>y+height*.1).sort((a,b)=>a.y-b.y)[0];
  if(above&&below&&below.y-above.y>=height&&below.y-above.y<input.height*.3){top=above.y;bottom=below.y;}
  const reference=sourceShapeReferenceSchema.safeParse({sha256,page:input.page,rect:{x:shapeLeft/input.width,y:top/input.height,width:(shapeRight-shapeLeft)/input.width,height:(bottom-top)/input.height}});
  if(!reference.success){result.issues.push(`แถว ${index+1}: กรอบรูปดัดไม่ถูกต้อง ให้เลือกด้วยมือ`);continue;}
  result.rows.push({id:'native-row-'+(index+1),mark,diameter,count,grade,cutLength,weight,...(unitWeight===undefined?{}:{unitWeight}),note:'อ่านจาก text layer; ตรวจรูป/มิติและจับคู่ BBS แยกต่างหาก',shapeReference:reference.data});
 }
 const marks=result.rows.map(r=>r.mark.toUpperCase());if(new Set(marks).size!==marks.length)result.issues.push('Mark ในตารางซ้ำ ห้ามรวมจำนวนหรือตัดแถวทิ้งอัตโนมัติ');
 const tableRegion=sourceShapeReferenceSchema.safeParse({sha256,page:input.page,rect:{x:left/input.width,y:(title.y-title.height)/input.height,width:(shapeRight-left)/input.width,height:(total.y+total.height*.4-title.y+title.height)/input.height}});
 if(tableRegion.success)result.tableRegion=tableRegion.data;
 if(result.rows.length&&result.rows.length===rowYs.length&&!result.issues.length){const sum=result.rows.reduce((n,r)=>n+r.weight!,0);if(!panel&&Math.abs(sum-totalWeight)>1e-8)result.warnings.push(`ผลรวมแถว ${sum.toFixed(6)} kg ต่างจาก Total ${totalWeight.toFixed(6)} kg อยู่ ${(sum-totalWeight).toFixed(6)} kg ต้องทบทวน ไม่ปรับแก้อัตโนมัติ`);result.ready=true;}
 return result;
}

/** One titled schedule may continue horizontally under repeated matching
 * headers and one real shared Total. Multiple titled/independent tables remain
 * ambiguous and are not merged. Order is left panel top-to-bottom, then right. */
export function sourceTableCandidate(input:NativeSourceTextPage,sha256:string):SourceTableCandidate{
 const result=readSourceTable(input,sha256),quantity=readReportedMemberQuantity(input);
 if(quantity.fact)result.memberQuantity=quantity.fact;
 if(quantity.warning)result.warnings.push(quantity.warning);
 return result;
}
function readSourceTable(input:NativeSourceTextPage,sha256:string):SourceTableCandidate{
 if(input.items.length>30000)return readPanel(input,sha256);
 const ordinary=()=>readPanel(input,sha256),items=input.items.filter(i=>clean(i.text)&&[i.x,i.y,i.width,i.height].every(Number.isFinite)&&i.width>=0&&i.height>0).map(i=>({...i,text:clean(i.text)})),titles=items.filter(i=>/^REBAR\s+BENDING\s+SCHEDULE$/i.test(i.text));
 if(titles.length!==1||input.items.length>30000)return ordinary();
 const title=titles[0],near=items.filter(i=>heading(i.text)&&i.y>title.y&&i.y<=title.y+input.height*.05&&i.x>=title.x-input.width*.01),first=near.find(i=>heading(i.text)==='mark');
 if(!first)return ordinary();
 const line=near.filter(i=>Math.abs(i.y-first.y)<Math.max(i.height,6)*.6).sort((a,b)=>center(a)-center(b)),starts=line.filter(i=>heading(i.text)==='mark');
 if(starts.length<2)return ordinary();
 const result:SourceTableCandidate={sha256,page:input.page,rows:[],issues:[],warnings:['ตารางต่อเนื่องหลายชุดคอลัมน์: ตรวจลำดับซ้าย→ขวาและ Total ร่วม ไม่ใช่ผลรวมย่อยต่อชุด','ตรวจหน่วย mm/kg และฐานจำนวนจากต้นฉบับก่อนรับตาราง รูปดัดเป็นรูปอ้างอิง ไม่ใช่แนวเหล็กที่คำนวณแล้ว'],ready:false};
 const fail=(message:string)=>{result.issues.push(message);return result;};
 if(starts.length>4)return fail('ตารางต่อเนื่องเกิน4ชุดคอลัมน์ ให้กรอกด้วยมือ');
 const panels=starts.map((start,i)=>line.filter(h=>center(h)>=center(start)&&center(h)<(starts[i+1]?center(starts[i+1]):Infinity))),keys=panels.map(p=>p.map(h=>heading(h.text)).join(',')),required='mark,diameter,count,grade,cutLength,weight,shape';
 if(keys.some(k=>k!==keys[0]||k.split(',').filter(k=>k!=='unitWeight').join(',')!==required))return fail('หัวคอลัมน์ตารางต่อเนื่องไม่ครบหรือไม่ตรงกัน ห้ามรับเฉพาะบางชุด');
 if(line.some(i=>Math.abs(i.angle||0)>.01))return fail('หัวคอลัมน์ตารางต่อเนื่องไม่ได้แสดงแนวนอน ให้กรอกด้วยมือ');
 const totals=items.filter(i=>/^Total\s*:$/i.test(i.text)&&i.y>first.y);if(totals.length!==1)return fail('ตารางต่อเนื่องต้องมี Total ร่วมเพียงหนึ่งแถว ห้ามรวมตารางอิสระ');
 const total=totals[0],last=panels.at(-1)!,weight=last.find(i=>heading(i.text)==='weight')!,wi=last.indexOf(weight),weightLeft=(center(last[wi-1])+center(weight))/2,weightRight=(center(weight)+center(last[wi+1]))/2;
 if(center(total)<center(last[0])||center(total)>=center(last.at(-1)!))return fail('Total ร่วมไม่ได้อยู่ใต้ชุดคอลัมน์สุดท้าย ให้ตรวจด้วยมือ');
 const texts=items.filter(i=>center(i)>=weightLeft&&center(i)<weightRight&&Math.abs(i.y-total.y)<=Math.max(total.height,8)*.6).sort((a,b)=>a.x-b.x).map(i=>i.text).join(' '),totalWeight=decimal(texts);
 if(totalWeight===undefined||totalWeight<=0)return fail('Total ร่วมอ่านไม่ชัด ห้ามใช้ผลรวมที่คำนวณแทนค่าพิมพ์');
 result.statedTotalWeight=totalWeight;const regions:SourceShapeReference[]=[];
 for(const [i,headers]of panels.entries()){
  const gap=center(headers[1])-center(headers[0]),left=Math.max(0,center(headers[0])-gap/2),right=i<panels.length-1?starts[i+1].x-gap/2:input.width;
  const part=readPanel(input,sha256,{title,total,totalWeight,left,right});result.rows.push(...part.rows.map(r=>({...r,id:`native-panel-${i+1}-${r.id}`})));result.issues.push(...part.issues.map(s=>`ชุดคอลัมน์ ${i+1}: ${s}`));if(!part.ready)result.issues.push(`ชุดคอลัมน์ ${i+1} ยังอ่านไม่ครบ ห้ามรับบางชุด`);if(part.tableRegion)regions.push(part.tableRegion);
 }
 if(result.rows.length>300)result.issues.push('ตารางรวมเกิน300แถวที่รองรับ');if(new Set(result.rows.map(r=>r.mark.toUpperCase())).size!==result.rows.length)result.issues.push('Mark ซ้ำข้ามชุดคอลัมน์ ห้ามรวมจำนวนอัตโนมัติ');
 result.tableRegions=regions;if(regions.length===panels.length){const x=Math.min(...regions.map(r=>r.rect.x)),y=Math.min(...regions.map(r=>r.rect.y)),right=Math.max(...regions.map(r=>r.rect.x+r.rect.width)),bottom=Math.max(...regions.map(r=>r.rect.y+r.rect.height));const region=sourceShapeReferenceSchema.safeParse({sha256,page:input.page,rect:{x,y,width:right-x,height:bottom-y}});if(region.success)result.tableRegion=region.data;}
 if(result.rows.length&&!result.issues.length){const sum=result.rows.reduce((n,r)=>n+r.weight!,0);if(Math.abs(sum-totalWeight)>1e-8)result.warnings.push(`ผลรวมแถว ${sum.toFixed(6)} kg ต่างจาก Total ${totalWeight.toFixed(6)} kg อยู่ ${(sum-totalWeight).toFixed(6)} kg ต้องทบทวน ไม่ปรับแก้อัตโนมัติ`);result.ready=true;}return result;
}

export function acceptSourceTable(candidate:SourceTableCandidate,attachment:Attachment,review:{basis:SourceSchedule['basis'];note:string;reviewed:boolean;unitsConfirmed:boolean}):SourceSchedule{
 if(!candidate.ready||candidate.issues.length||!candidate.rows.length||attachment.sha256!==candidate.sha256||attachment.sourceStatus==='Superseded'||attachment.contentType!=='application/pdf'||!attachment.pageCount||candidate.page>attachment.pageCount)throw Error('ตารางหรือไฟล์ต้นทางไม่ตรง/ยังอ่านไม่ครบ ต้องอ่านและตรวจใหม่');
 if(!review.reviewed||!review.unitsConfirmed)throw Error('ยืนยันตรวจตัวเลข รูปดัด และหน่วย mm/kg ก่อนรับตาราง');
 return sourceScheduleSchema.parse({version:2,attachmentId:attachment.id,sha256:candidate.sha256,page:candidate.page,basis:review.basis,note:review.note,statedTotalWeight:candidate.statedTotalWeight,rows:candidate.rows.map(r=>({...r,id:crypto.randomUUID(),barId:undefined}))});
}
