import type {Category,Member,Spec} from './model';
import {archCategories,archInputSchema,finishKindLabels,type ArchCategory,type ArchInput,type Finish,type FinishKind,type OpeningInput,type FixtureInput,type RailingInput,type RoofInput,type RoomInput,type WallInput} from './archInputSchema';
import {emptySiteWork,withSiteWork,type SiteItem} from './siteWork';

export const isArchCategory=(c:Category):c is ArchCategory=>(archCategories as readonly string[]).includes(c);
export const ARCH_ITEM_PREFIX='arch-';
export const isArchItem=(i:Pick<SiteItem,'id'>)=>i.id.startsWith(ARCH_ITEM_PREFIX);
export function defaultArchInput(c:ArchCategory):ArchInput{
 switch(c){
  case 'Room':return {kind:'room',name:'',width:4000,length:4000,area:0,perimeter:0,height:2700,floor:'',skirting:'',wall:'',ceiling:'',openings:[]};
  case 'Opening':return {kind:'opening',type:'door',width:900,height:2000,description:'ประตูบานเปิดเดี่ยว',items:[]};
  case 'MasonryWall':return {kind:'wall',length:5000,height:3000,thickness:100,type:'',openings:[],stiffenerSpacing:2500,stiffenersAtOpenings:true,lintelBearing:200,tieBeams:0};
  case 'Roof':return {kind:'roof',width:10000,length:12000,area:0,pitch:30,covering:'',ridge:0,eave:0,verge:0};
  case 'Railing':return {kind:'railing',length:5000,height:1100,type:''};
  case 'Fixture':return {kind:'fixture',description:'',unit:'ชุด',items:[]};
 }
}
const sum=(v:number[])=>v.reduce((a,b)=>a+b,0);
/** Room quantities (m², m): floor / ceiling = area, skirting = perimeter − door widths, wall = perimeter × height −
 * openings, split into the dado band (doors deducted up to the dado height) and the wall above. */
export function roomQuantities(i:RoomInput){
 const area=i.area>0?i.area:i.width*i.length/1e6,perimeter=i.perimeter>0?i.perimeter:2*(i.width+i.length)/1000,h=i.height/1000;
 const doors=i.openings.filter(o=>o.door),doorWidth=sum(doors.map(o=>o.width*o.count))/1000,openArea=sum(i.openings.map(o=>o.width*Math.min(o.height,i.height)*o.count))/1e6;
 const dh=i.dado?Math.min(i.dado.height,i.height)/1000:0,dado=i.dado?Math.max(0,perimeter*dh-sum(doors.map(o=>o.width*Math.min(o.height,dh*1000)*o.count))/1e6):0;
 const waterproof=i.waterproof?area+Math.max(0,perimeter-doorWidth)*Math.min(i.waterproof.upturn,i.height)/1000:0;
 return {area,perimeter,floor:area,ceiling:area,skirting:Math.max(0,perimeter-doorWidth),dado,wall:Math.max(0,perimeter*h-openArea-dado),openArea,doorWidth,waterproof};
}
/** Opening quantities per set: area (m²) and frame length (m: door = width + 2 × height, window = perimeter). */
export function openingQuantities(i:OpeningInput){return {set:1,area:i.width*i.height/1e6,perimeter:(i.type==='door'?i.width+2*i.height:2*(i.width+i.height))/1000};}

export const findFinish=(finishes:readonly Finish[]|undefined,kind:FinishKind,code:string)=>code?finishes?.find(f=>f.kind===kind&&f.code.toUpperCase()===code.trim().toUpperCase()):undefined;
const faces=[['floor','floor','m²'],['skirting','skirting','m'],['dado','wall','m²'],['wall','wall','m²'],['ceiling','ceiling','m²'],['waterproof','waterproof','m²']] as const;
const round=(v:number)=>Number(v.toFixed(6));
/** BOQ items of a room: each chosen finish × its items (finish without items = one item in m² / m). */
export function roomItems(i:RoomInput,finishes:readonly Finish[]|undefined):{items:SiteItem[];problems:string[]}{
 const q=roomQuantities(i),items:SiteItem[]=[],problems:string[]=[];
 for(const [face,kind,unit] of faces){
  const code=face==='dado'?i.dado?.finish||'':face==='waterproof'?i.waterproof?.finish||'':i[face],base=q[face];if(!code||base<=0)continue;
  const f=findFinish(finishes,kind,code),name=face==='dado'?'ผนังส่วนล่าง':finishKindLabels[kind];
  if(!f){problems.push(`ไม่พบ${finishKindLabels[kind]}รหัส ${code} ในคลังวัสดุผิว`);items.push({id:`${ARCH_ITEM_PREFIX}${face}`,label:`${name} ${code}`,unit,quantity:round(base)});continue;}
  if(!f.items.length)items.push({id:`${ARCH_ITEM_PREFIX}${face}`,label:`${f.code} ${f.name}`.slice(0,120),unit,quantity:round(base)});
  for(const it of f.items)items.push({id:`${ARCH_ITEM_PREFIX}${face}-${it.id}`.slice(0,80),label:`${f.code} ${it.label}`.slice(0,120),unit:it.unit,quantity:round(base*it.factor)});
 }
 if(q.openArea>q.perimeter*i.height/1000+1e-9)problems.push('ช่องเปิดรวมมากกว่าพื้นที่ผนัง');
 return {items,problems};
}
/** Masonry wall run: net area (gross − openings), stiffener columns (ends + every ≤ spacing + beside openings), lintels
 * over openings (+ bearing each side), tie beams over the length (m). Concrete stiffeners / lintels are not deducted. */
export function wallQuantities(i:WallInput){
 const L=i.length/1000,H=i.height/1000,gross=L*H,open=sum(i.openings.map(o=>o.width*Math.min(o.height,i.height)*o.count))/1e6,count=sum(i.openings.map(o=>o.count));
 const stiffeners=2+(i.stiffenerSpacing>0?Math.max(0,Math.ceil(i.length/i.stiffenerSpacing-1e-9)-1):0)+(i.stiffenersAtOpenings?2*count:0);
 return {gross,open,net:Math.max(0,gross-open),stiffeners,stiffener:stiffeners*H,lintel:sum(i.openings.map(o=>(o.width+2*i.lintelBearing)*o.count))/1000,tie:i.tieBeams*L};
}
/** Roof: plan area (width × length or measured) and slope area = plan / cos(pitch). */
export function roofQuantities(i:RoofInput){const plan=i.area>0?i.area:i.width*i.length/1e6;return {plan,slope:plan/Math.cos(i.pitch*Math.PI/180)};}
/** Items of one library code over a base quantity (missing code → a problem and one item with the code). */
function libraryItems(finishes:readonly Finish[]|undefined,kind:FinishKind,code:string,base:number,unit:string,id:string,problems:string[]):SiteItem[]{
 if(!code||base<=0)return [];const f=findFinish(finishes,kind,code);
 if(!f){problems.push(`ไม่พบ${finishKindLabels[kind]}รหัส ${code} ในคลังวัสดุผิว`);return [{id:`${ARCH_ITEM_PREFIX}${id}`,label:`${finishKindLabels[kind]} ${code}`,unit,quantity:round(base)}];}
 if(!f.items.length)return [{id:`${ARCH_ITEM_PREFIX}${id}`,label:`${f.code} ${f.name}`.slice(0,120),unit,quantity:round(base)}];
 return f.items.map(it=>({id:`${ARCH_ITEM_PREFIX}${id}-${it.id}`.slice(0,80),label:`${f.code} ${it.label}`.slice(0,120),unit:it.unit,quantity:round(base*it.factor)}));
}
export function wallItems(i:WallInput,finishes:readonly Finish[]|undefined):{items:SiteItem[];problems:string[]}{
 const q=wallQuantities(i),problems:string[]=[],t=i.thickness?` (ผนังหนา ${Math.round(i.thickness)} mm)`:'';
 if(!i.type)problems.push('เลือกชนิดผนังก่อ');if(q.open>q.gross+1e-9)problems.push('ช่องเปิดรวมมากกว่าพื้นที่ผนัง');
 const rc=(id:string,label:string,v:number):SiteItem[]=>v>0?[{id:`${ARCH_ITEM_PREFIX}${id}`,label:`${label}${t}`,unit:'m',quantity:round(v)}]:[];
 return {items:[...libraryItems(finishes,'masonry',i.type,q.net,'m²','wall',problems),...rc('stiffener','เสาเอ็น ค.ส.ล.',q.stiffener),...rc('lintel','ทับหลัง ค.ส.ล.',q.lintel),...rc('tie','คานเอ็น ค.ส.ล.',q.tie)],problems};
}
export function roofItems(i:RoofInput,finishes:readonly Finish[]|undefined):{items:SiteItem[];problems:string[]}{
 const q=roofQuantities(i),problems:string[]=[];if(!i.covering)problems.push('เลือกวัสดุมุงหลังคา');
 const len=(id:string,label:string,v:number):SiteItem[]=>v>0?[{id:`${ARCH_ITEM_PREFIX}${id}`,label,unit:'m',quantity:round(v)}]:[];
 return {items:[...libraryItems(finishes,'roof',i.covering,q.slope,'m²','roof',problems),...len('ridge','ครอบสันหลังคา',i.ridge),...len('eave','เชิงชาย',i.eave),...len('verge','ปั้นลม',i.verge)],problems};
}
export function railingItems(i:RailingInput,finishes:readonly Finish[]|undefined):{items:SiteItem[];problems:string[]}{
 const problems:string[]=[];if(!i.type)problems.push('เลือกชนิดราว');
 return {items:libraryItems(finishes,'railing',i.type,i.length/1000,'m','rail',problems),problems};
}
export function fixtureItems(code:string,i:FixtureInput):SiteItem[]{
 if(!i.items.length)return [{id:`${ARCH_ITEM_PREFIX}set`,label:`${code} ${i.description}`.trim().slice(0,120),unit:i.unit,quantity:1}];
 return i.items.map(it=>({id:`${ARCH_ITEM_PREFIX}${it.id}`,label:`${code} ${it.label}`.slice(0,120),unit:it.unit,quantity:round(it.factor)}));
}
/** BOQ items and problems of any arch input. */
export function archItems(code:string,i:ArchInput,finishes:readonly Finish[]|undefined):{items:SiteItem[];problems:string[]}{
 return i.kind==='room'?roomItems(i,finishes):i.kind==='wall'?wallItems(i,finishes):i.kind==='roof'?roofItems(i,finishes):i.kind==='railing'?railingItems(i,finishes):i.kind==='fixture'?{items:fixtureItems(code,i),problems:[]}:{items:openingItems(code,i),problems:[]};
}
/** BOQ items of a door / window type (per set). */
export function openingItems(code:string,i:OpeningInput):SiteItem[]{
 const q=openingQuantities(i),size=`${Math.round(i.width)}×${Math.round(i.height)}`;
 if(!i.items.length)return [{id:`${ARCH_ITEM_PREFIX}set`,label:`${code} ${i.description||(i.type==='door'?'ประตู':'หน้าต่าง')} ${size}`.slice(0,120),unit:'ชุด',quantity:1}];
 return i.items.map(it=>({id:`${ARCH_ITEM_PREFIX}${it.id}`,label:`${code} ${it.label}`.slice(0,120),unit:it.unit,quantity:round(q[it.basis]*it.factor)}));
}
export function roomProblems(i:RoomInput):string[]{
 const out:string[]=[];
 if(!(i.area>0||i.width>0&&i.length>0))out.push('กรอกกว้าง × ยาว หรือพื้นที่ห้อง');
 if(!(i.height>0))out.push('กรอกความสูงฝ้า');
 return out;
}
/** Applies an arch input: no concrete / geometry, quantities as `arch-*` site items (other items kept), input kept. */
export function applyArchInput(m:Member,raw:ArchInput,spec?:Pick<Spec,'finishes'>):Member{
 const input=archInputSchema.parse(raw),{shapeModel:_s,geometry:_g,prismGeometry:_p,civilInput:_c,...rest}=m;
 if(input.kind==='room'){const bad=roomProblems(input);if(bad.length)throw Error(bad.join(' · '));}
 if(input.kind==='roof'&&!(input.area>0||input.width>0&&input.length>0))throw Error('กรอกกว้าง × ยาว หรือพื้นที่แปลนหลังคา');
 const items=archItems(m.code,input,spec?.finishes).items;
 const keep=(m.siteWork?.items||[]).filter(i=>!isArchItem(i)).slice(0,30-items.length);
 const sw=withSiteWork({...rest},{...(m.siteWork||emptySiteWork()),items:[...items,...keep]});
 const side=(v:number)=>Math.max(1,Math.round(v));
 const [x,y,z]=input.kind==='room'?[input.width||Math.sqrt(input.area)*1000,input.length||Math.sqrt(input.area)*1000,input.height]:input.kind==='wall'?[input.length,input.thickness||100,input.height]
  :input.kind==='roof'?[input.width||Math.sqrt(input.area)*1000,input.length||Math.sqrt(input.area)*1000,1000]:input.kind==='railing'?[input.length,50,input.height||1000]:input.kind==='fixture'?[1000,1000,1000]:[input.width,100,input.height];
 return {...sw,x:side(x),y:side(y),z:side(z),cover:0,faces:[false,false,false,false,false,false],pedestal:{x:0,y:0,z:0},lean:{x:0,y:0,thickness:0},excavation:{bottomX:0,bottomY:0,topX:0,topY:0,depth:0,buriedConcrete:0},archInput:input,status:'Draft'};
}
/** Measures a BOQ item can take: room floor area, opening area, net wall area + wall length, roof slope area. */
export function archMeasures(m:Pick<Member,'archInput'>):{area?:number;length?:number}{
 const i=m.archInput;if(!i)return {};
 return i.kind==='room'?{area:roomQuantities(i).area}:i.kind==='wall'?{area:wallQuantities(i).net,length:i.length/1000}:i.kind==='roof'?{area:roofQuantities(i).slope}:i.kind==='railing'?{length:i.length/1000}:i.kind==='fixture'?{}:{area:openingQuantities(i).area};
}
