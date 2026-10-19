import type {NativeSourceTextItem,NativeSourceTextPage} from './sourceTableIntake';
import type {SourceShapeReference} from './sourceRegions';
export type ReportedMemberQuantity={value:number;unit:'EA';rect:SourceShapeReference['rect']};
const clean=(text:string)=>text.trim().replace(/\s+/g,' ');
const integer=(text:string)=>/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)?Number(text.replace(/,/g,'')):undefined;
const horizontal=(item:NativeSourceTextItem)=>item.angle===undefined||Number.isFinite(item.angle)&&Math.abs(item.angle)<.01;
/** A proposed printed count, bounded by its adjacent header and explicit EA
 * unit. It never changes occurrences or interprets a document's issue status. */
export function readReportedMemberQuantity(input:NativeSourceTextPage):{fact?:ReportedMemberQuantity;warning?:string}{
 if(!Number.isFinite(input.width)||!Number.isFinite(input.height)||input.width<=0||input.height<=0||input.items.length>30000)return {};
 const items=input.items.filter(i=>[i.x,i.y,i.width,i.height].every(Number.isFinite)&&i.width>=0&&i.height>0&&horizontal(i)).map(i=>({...i,text:clean(i.text)}));
 const labels=items.filter(i=>/^QUANTITY\s*:$/i.test(i.text));if(!labels.length)return {};
 const ambiguous=()=>({warning:'ช่อง QUANTITY ในแบบอ่านขอบเขตหรือจำนวนไม่ชัด ให้ตรวจจำนวนสมาชิกด้วยมือ'});
 if(labels.length!==1)return ambiguous();
 const label=labels[0],next=items.filter(i=>i.x>label.x+label.width&&Math.abs(i.y-label.y)<=label.height*.6&&/^[A-Z][A-Z /().'-]*\s*:$/i.test(i.text)).sort((a,b)=>a.x-b.x)[0];
 if(!next)return ambiguous();
 const field=items.filter(i=>i.x>=label.x&&i.x+i.width<=next.x+1&&i.y>label.y+label.height*.2&&i.y<=label.y+label.height*3);
 const pairs:{value:number;items:NativeSourceTextItem[]}[]=[];
 for(const unit of field.filter(i=>/^EA\.?$/i.test(i.text))){const numbers=field.filter(i=>i.x+i.width<=unit.x+1&&Math.abs(i.y-unit.y)<=Math.max(i.height,unit.height)*.5&&integer(i.text)!==undefined);if(numbers.length!==1)return ambiguous();pairs.push({value:integer(numbers[0].text)!,items:[numbers[0],unit]});}
 for(const item of field){const combined=item.text.match(/^(\d+(?:,\d{3})*)\s+EA\.?$/i);if(combined)pairs.push({value:integer(combined[1])!,items:[item]});}
 if(pairs.length!==1||!Number.isInteger(pairs[0].value)||pairs[0].value<1||pairs[0].value>100000)return ambiguous();
 const matched=[label,...pairs[0].items],x=Math.max(0,Math.min(...matched.map(i=>i.x))-2),y=Math.max(0,Math.min(...matched.map(i=>i.y-i.height))-2),right=Math.min(input.width,Math.max(...matched.map(i=>i.x+i.width))+2),bottom=Math.min(input.height,Math.max(...matched.map(i=>i.y))+2);
 if(right<=x||bottom<=y)return ambiguous();
 return {fact:{value:pairs[0].value,unit:'EA',rect:{x:x/input.width,y:y/input.height,width:(right-x)/input.width,height:(bottom-y)/input.height}}};
}
