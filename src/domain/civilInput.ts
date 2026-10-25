import type {Category,Member} from './model';
import {civilCategories,civilInputSchema,type CivilCategory,type CivilInput} from './civilInputSchema';
import {applyShapeModel} from './shapeApply';
import {SHAPE_MODEL_VERSION,type ShapeModel,type ShapePart} from './shapeModelSchema';
import {prismBounds} from './prismGeometry';
import type {PrismGeometry} from './prismSchema';
import {emptySiteWork,withSiteWork} from './siteWork';

export const isCivilCategory=(c:Category):c is CivilCategory=>(civilCategories as readonly string[]).includes(c);
const site={excavation:true,workingSpace:300,leanThickness:50,leanProjection:100};
/** Starting input per civil category (typical sizes; edit to the drawing). */
export function defaultCivilInput(c:CivilCategory):CivilInput{
 switch(c){
  case 'UDitch':return {kind:'channel',length:10000,innerWidth:400,innerHeight:500,wall:150,base:150,cover:0,site};
  case 'Trench':return {kind:'channel',length:10000,innerWidth:600,innerHeight:800,wall:150,base:150,cover:120,site};
  case 'VDitch':return {kind:'vchannel',length:10000,topWidth:1200,bottomWidth:0,depth:500,lining:100};
  case 'Manhole':return {kind:'box',innerLength:1000,innerWidth:1000,innerHeight:1500,wall:200,base:200,toe:100,cover:200,openingLength:600,openingWidth:600,site};
  case 'Pit':return {kind:'box',innerLength:1500,innerWidth:1500,innerHeight:1500,wall:200,base:250,toe:150,cover:0,openingLength:0,openingWidth:0,site};
  case 'UGTank':return {kind:'box',innerLength:4000,innerWidth:3000,innerHeight:2500,wall:250,base:300,toe:200,cover:200,openingLength:800,openingWidth:800,site};
  case 'AGTank':return {kind:'box',innerLength:4000,innerWidth:3000,innerHeight:2500,wall:250,base:300,toe:200,cover:200,openingLength:800,openingWidth:800,site:{...site,excavation:false}};
  case 'ConcretePaving':return {kind:'paving',length:6000,width:4000,thickness:200};
  case 'AsphaltPaving':return {kind:'asphalt',length:20000,width:6000,layers:[{id:'wear',label:'Asphaltic concrete wearing course',thickness:50,unit:'m²'},{id:'tack',label:'Tack coat',thickness:0,unit:'m²'},{id:'binder',label:'Asphaltic concrete binder course',thickness:50,unit:'m²'},{id:'prime',label:'Prime coat',thickness:0,unit:'m²'},{id:'base',label:'Crushed rock base',thickness:200,unit:'m³'}]};
  // RC pipe ท่อ ค.ส.ล. (มอก. 128) Ø600, 1 m pieces · PE pipe HDPE PE100 (size = outside Ø), 6 m pieces
  case 'RCPipe':return {kind:'pipe',length:20000,diameter:600,outerDiameter:720,pieceLength:1000,pipeClass:'มอก. 128 ชั้น 3',trenchWidth:1320,trenchDepth:1500,sideSlope:0,bedding:100,excavation:true};
  case 'PEPipe':return {kind:'pipe',length:50000,diameter:200,outerDiameter:200,pieceLength:6000,pipeClass:'HDPE PE100 PN10',trenchWidth:600,trenchDepth:1000,sideSlope:0,bedding:100,excavation:true};
 }
}
/** Pipe run per piece: pieces, pipe volume (m³, displaces backfill), trench excavation (m³) and bedding sand (m³). */
export function pipeQuantities(i:Extract<CivilInput,{kind:'pipe'}>){
 const L=i.length/1000,od=i.outerDiameter/1000,w=i.trenchWidth/1000,d=i.trenchDepth/1000,top=w+2*d*i.sideSlope;
 return {pieces:Math.ceil(i.length/i.pieceLength-1e-9),pipeVolume:Math.PI/4*od*od*L,excavation:i.excavation?L*d*(w+top)/2:0,bedding:i.excavation?L*w*i.bedding/1000:0};
}
type PartIn={[K in ShapePart['shape']]:Omit<Extract<ShapePart,{shape:K}>,'source'|'stage'>&{stage?:number}}[ShapePart['shape']];
const part=(p:PartIn):ShapePart=>({stage:1,source:'แบบฟอร์มรูปทรงสำเร็จรูป',...p} as ShapePart);
// buried: shape-model site data (excavation, lean, backfill); on ground: no earthwork, lean layer set on the member
const siteOf=(s:{excavation:boolean;workingSpace:number;leanThickness:number;leanProjection:number},depth:number)=>s.excavation?{site:{excavationDepth:depth+s.leanThickness,workingSpace:s.workingSpace,slope:0,leanThickness:s.leanThickness,leanProjection:s.leanProjection}}:{};
/** Shape model of a channel / box / paving input. */
export function civilShape(input:CivilInput):ShapeModel|undefined{
 const i=civilInputSchema.parse(input);
 if(i.kind==='channel'){const W=i.innerWidth+2*i.wall,top=i.base+i.innerHeight;
  const parts=[part({id:'base',label:'พื้นราง',role:'solid',shape:'box',x:0,y:0,w:i.length,d:W,z0:0,height:i.base,formSides:true,formBottom:false}),
   part({id:'wall-1',label:'ผนังราง 1',role:'solid',shape:'box',x:0,y:0,w:i.length,d:i.wall,z0:i.base,height:i.innerHeight,formSides:true,formBottom:false,stage:2}),
   part({id:'wall-2',label:'ผนังราง 2',role:'solid',shape:'box',x:0,y:W-i.wall,w:i.length,d:i.wall,z0:i.base,height:i.innerHeight,formSides:true,formBottom:false,stage:2}),
   ...(i.cover>0?[part({id:'cover',label:'ฝาราง',role:'solid',shape:'box',x:0,y:0,w:i.length,d:W,z0:top,height:i.cover,formSides:true,formBottom:true,stage:3})]:[])];
  return {version:SHAPE_MODEL_VERSION,parts,...siteOf(i.site,top+i.cover),confirmed:false,note:''};}
 if(i.kind==='box'){const L=i.innerLength+2*i.wall,W=i.innerWidth+2*i.wall,t=i.toe,top=i.base+i.innerHeight;
  const parts=[part({id:'base',label:'พื้นบ่อ',role:'solid',shape:'box',x:0,y:0,w:L+2*t,d:W+2*t,z0:0,height:i.base,formSides:true,formBottom:false}),
   part({id:'walls',label:'ผนังบ่อ',role:'solid',shape:'shaft',x:t,y:t,w:L,d:W,wall:i.wall,z0:i.base,height:i.innerHeight,formSides:true,formBottom:false,stage:2}),
   ...(i.cover>0?[part({id:'cover',label:'ฝาบ่อ / พื้นบน',role:'solid',shape:'box',x:t,y:t,w:L,d:W,z0:top,height:i.cover,formSides:true,formBottom:true,stage:3}),
    ...(i.openingLength>0&&i.openingWidth>0?[part({id:'opening',label:'ช่องเปิดฝา',role:'void',shape:'box',x:t+(L-i.openingLength)/2,y:t+(W-i.openingWidth)/2,w:i.openingLength,d:i.openingWidth,z0:top,height:i.cover,formSides:true,formBottom:false,stage:3})]:[])]:[])];
  return {version:SHAPE_MODEL_VERSION,parts,...siteOf(i.site,top+i.cover),confirmed:false,note:''};}
 if(i.kind==='paving')return {version:SHAPE_MODEL_VERSION,parts:[part({id:'slab',label:'แผ่นพื้นคอนกรีต',role:'solid',shape:'box',x:0,y:0,w:i.length,d:i.width,z0:0,height:i.thickness,formSides:true,formBottom:false})],confirmed:false,note:''};
}
/** Prism of a V-ditch lining: section in Y–Z, extruded along X. */
export function vDitchPrism(i:Extract<CivilInput,{kind:'vchannel'}>):PrismGeometry{
 const t=i.lining,B=i.topWidth,b=Math.min(i.bottomWidth,B),D=i.depth,inset=(B-b)/2;
 // inner trapezoid (top width B at z = t+D, bottom width b at z = t); outer edge t outside at the top, t below at the bottom
 const inner:[number,number][]=b>0?[[t+inset,t],[t+inset+b,t]]:[[t+inset,t]];
 const v:[number,number][]=[[0,t+D],[t,t+D],...inner,[t+B,t+D],[2*t+B,t+D],[inset+b+2*t,0],[inset,0]];
 return {version:1,axis:'X',start:0,depth:i.length,profile:{vertices:v.map(([y,z])=>[Number(Math.max(0,y).toFixed(3)),Number(z.toFixed(3))]),formed:v.map(()=>false)},holes:[],endFaces:[false,false],basis:'V-Ditch · แบบฟอร์มรูปทรงสำเร็จรูป'};
}
/** Applies a civil input: geometry (or site items for asphalt), cover, input kept on the member for re-editing. */
export function applyCivilInput(m:Member,raw:CivilInput):Member{
 const input=civilInputSchema.parse(raw),cover=m.category==='ConcretePaving'?50:m.category==='VDitch'?40:50;
 if(input.kind==='vchannel'){const p=vDitchPrism(input),[x,y,z]=prismBounds(p),{shapeModel:_s,geometry:_g,...rest}=m;
  return {...rest,prismGeometry:p,x,y,z,cover,civilInput:input,status:'Draft',bars:m.bars.map(b=>({...b,placementConfirmed:false}))};}
 if(input.kind==='pipe'){
  // quantity only: the trench is the member's excavation (prismoid along the run), bedding = site sand, the pipe volume
  // is the buried volume taken out of the backfill
  const {shapeModel:_s,geometry:_g,prismGeometry:_p,...rest}=m,q=pipeQuantities(input),top=input.trenchWidth+2*input.trenchDepth*input.sideSlope;
  const sw=withSiteWork({...rest},{...(m.siteWork||emptySiteWork()),sand:input.excavation&&input.bedding>0?{x:input.length,y:input.trenchWidth,thickness:input.bedding}:{x:0,y:0,thickness:0}});
  return {...sw,x:input.length,y:input.outerDiameter,z:input.outerDiameter,cover:0,faces:[false,false,false,false,false,false],lean:{x:0,y:0,thickness:0},
   excavation:input.excavation?{bottomX:input.length,bottomY:input.trenchWidth,topX:input.length,topY:top,depth:input.trenchDepth,buriedConcrete:Number(q.pipeVolume.toFixed(6))}:{bottomX:0,bottomY:0,topX:0,topY:0,depth:0,buriedConcrete:0},
   civilInput:input,status:'Draft'};}
 if(input.kind==='asphalt'){const {shapeModel:_s,geometry:_g,prismGeometry:_p,...rest}=m,area=input.length*input.width/1e6;
  const items=input.layers.map(l=>({id:`asph-${l.id}`,label:l.thickness>0&&l.unit==='m²'?`${l.label} ${l.thickness} mm`:l.label,unit:l.unit,quantity:Number((l.unit==='m³'?area*l.thickness/1000:area).toFixed(6))}));
  const sw=withSiteWork({...rest},{...(m.siteWork||emptySiteWork()),items:[...(m.siteWork?.items||[]).filter(i=>!i.id.startsWith('asph-')),...items]});
  return {...sw,x:input.length,y:input.width,z:Math.max(1,input.layers.reduce((n,l)=>n+l.thickness,0)),cover:0,civilInput:input,status:'Draft'};}
 const sm=civilShape(input)!,next={...applyShapeModel(m,sm),cover,civilInput:input};
 if('site' in input&&!input.site.excavation&&input.site.leanThickness>0)next.lean={x:next.x+2*input.site.leanProjection,y:next.y+2*input.site.leanProjection,thickness:input.site.leanThickness};
 return next;
}
/** Quantities a BOQ item can take besides concrete / formwork: length (m) and area (m²) of linear / paved members. */
export function civilMeasures(m:Pick<Member,'civilInput'>):{length?:number;area?:number;pieces?:number;pipe?:{size:number;pipeClass:string}}{
 const i=m.civilInput;if(!i)return {};
 if(i.kind==='channel'||i.kind==='vchannel')return {length:i.length/1000};
 if(i.kind==='paving'||i.kind==='asphalt')return {length:i.length/1000,area:i.length*i.width/1e6};
 if(i.kind==='pipe')return {length:i.length/1000,pieces:pipeQuantities(i).pieces,pipe:{size:i.diameter,pipeClass:i.pipeClass}};
 return {};
}
