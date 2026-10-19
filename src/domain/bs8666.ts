import {CODE99_HOLD} from './code99ReviewSchema';
import {projectMaterialMinimum} from './projectMaterials';
import {ovalLinkAssessment,OVAL_CLOSURE_PENDING} from './bsOvalLink';
import {rectLinkAssessment,LINK_CLOSURE_PENDING} from './bsRectLink';
import type {Bar,Spec,Vec3} from './model';
import {obliqueAssessment} from './bsOblique';
import {semicircleAssessment} from './bsSemicircle';
import {arcErrors,arcGeometry,arcSupply} from './arcGeometry';
import {helixErrors,helixAssessment} from './helixGeometry';

// Transcribed after text AND page-image inspection of the supplied, unchanged PDF.
export const BS2000={id:'bs8666-2000-v1' as const,edition:'BS 8666:2000 + Amd 1/2',source:'Referrence/BS 8666.pdf',sha256:'9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43',version:'bs8666-2000-minimum-1.0',cutIncrement:25};
export const BS2000V2={...BS2000,id:'bs8666-2000-v2' as const,version:'bs8666-2000-minimum-2.0'};
export const BS2000V3={...BS2000,id:'bs8666-2000-v3' as const,version:'bs8666-2000-minimum-3.0'};
export const BS2000V4={...BS2000,id:'bs8666-2000-v4' as const,version:'bs8666-2000-minimum-4.0'};
export const BS2000V5={...BS2000,id:'bs8666-2000-v5' as const,version:'bs8666-2000-minimum-5.0'};
export const BS2000V6={...BS2000,id:'bs8666-2000-v6' as const,version:'bs8666-2000-minimum-6.0'};
export const BS2000V7={...BS2000,id:'bs8666-2000-v7' as const,version:'bs8666-2000-minimum-7.0'};
export const BS2000V8={...BS2000,id:'bs8666-2000-v8' as const,version:'bs8666-2000-minimum-8.0'};
export const bsProfile=(s:Spec)=>s.minimumStandard===BS2000V8.id?BS2000V8:s.minimumStandard===BS2000V7.id?BS2000V7:s.minimumStandard===BS2000V6.id?BS2000V6:s.minimumStandard===BS2000V5.id?BS2000V5:s.minimumStandard===BS2000V4.id?BS2000V4:s.minimumStandard===BS2000V3.id?BS2000V3:s.minimumStandard===BS2000V2.id?BS2000V2:BS2000;
export const bsGeneration=(s:Spec)=>s.minimumStandard===BS2000V8.id?8:s.minimumStandard===BS2000V7.id?7:s.minimumStandard===BS2000V6.id?6:s.minimumStandard===BS2000V5.id?5:s.minimumStandard===BS2000V4.id?4:s.minimumStandard===BS2000V3.id?3:s.minimumStandard===BS2000V2.id?2:1;
export const bsFormulaCodes=(s:Spec)=>bsGeneration(s)>=8?'00/11/12/13/15/21/25/26/31/33/41/44/46/51/67/77':bsGeneration(s)>=7?'00/11/12/13/15/21/25/26/31/41/44/46/51/67/77':bsGeneration(s)>=6?'00/11/12/13/15/21/25/26/31/41/44/46/67/77':bsGeneration(s)>=5?'00/11/12/13/15/21/25/26/31/41/44/46/67':bsGeneration(s)===4?'00/11/12/13/15/21/25/26/31/41/44/46':bsGeneration(s)===3?'00/11/12/15/21/25/26/31/41/44/46':bsGeneration(s)===2?'00/11/12/21/31/41/44':'00/11/12/21';
export const bsTypes=['R','T','B','S','F','D','W','X'] as const;
export const bsShapeCodes=['00','11','12','13','15','21','25','26','31','33','41','44','46','51','67','77','99'];
// Table 3, printed p.11 (PDF page 15): r = INNER scheduling radius, M = former diameter.
const rRows:Record<number,[number,number,number]>={6:[12,24,110],8:[16,32,115],10:[20,40,120],12:[24,48,125],16:[32,64,130],20:[40,80,160],25:[50,100,200],32:[64,128,260],40:[80,160,320]};
const tRows={...rRows,20:[70,140,190],25:[87,175,240],32:[112,224,305],40:[140,280,380]} as typeof rRows;
const wRows:typeof rRows={5:[10,20,110],6:[12,24,110],7:[14,28,115],8:[16,32,115],9:[18,36,120],10:[20,40,120],12:[24,48,125]};
export function bsMinimum(type:string|undefined,d:number,spec?:Spec,grade?:string){if(type==='X')return projectMaterialMinimum(spec?.projectMaterials,grade,d);const a=type==='R'?rRows[d]:['T','B','S'].includes(type||'')?tRows[d]:['F','D','W'].includes(type||'')?wRows[d]:undefined;return a?{innerRadius:a[0],formerDiameter:a[1],endDimension:a[2],source:'Table 3 / p.11',projectRule:undefined}:undefined;}
export const bsEnabled=(s:Spec)=>s.minimumStandard===BS2000.id||s.minimumStandard===BS2000V2.id||s.minimumStandard===BS2000V3.id||s.minimumStandard===BS2000V4.id||s.minimumStandard===BS2000V5.id||s.minimumStandard===BS2000V6.id||s.minimumStandard===BS2000V7.id||s.minimumStandard===BS2000V8.id;
export type BSDimension={label:string;value:number;free:boolean;unit?:'turns'};
const minus=(a:Vec3,b:Vec3)=>a.map((n,i)=>n-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=(v:Vec3)=>Math.hypot(...v);
const multiple=(n:number,step:number)=>Math.abs(n/step-Math.round(n/step))<1e-6;
export function bsAssessment(b:Bar,points:Vec3[],spec:Spec){
 if(b.shape==='helix'){
  const active=bsEnabled(spec),problems=helixErrors(b),notes:string[]=[],ext=b.outsideDiameter??b.diameter,r=b.radius-ext/2,min=bsMinimum(b.bsType,b.diameter,spec,b.grade),geometry=helixAssessment(b),enabled=bsGeneration(spec)>=6&&b.shapeCode.trim()==='77',matched=enabled?geometry:undefined;
  const dimensions:BSDimension[]=matched?[{label:'A',value:matched.A,free:false},{label:'B',value:matched.B,free:false},{label:'C',value:matched.C,free:false,unit:'turns'}]:[],formula=matched?.formula||'',formulaLength=matched?.selectedLength;
  if(active){
   if(!enabled)problems.push('เกลียวจริงรองรับ Code 77 ในชุดกฎขั้นต่ำรุ่น 6 เท่านั้น');
   if(!geometry)problems.push('ข้อมูลเกลียว/จำนวนจุดแสดงผลยังไม่ผ่านขอบเขต geometry ของแอป');
   if(min?.projectRule)notes.push(`ข้อกำหนดโครงการวัสดุ X: ${min.projectRule.grade} Ø${b.diameter} / ${min.projectRule.reference} / ${min.projectRule.basis}; ไม่ใช่การเทียบเกรดกับ BS หรือรับรองกำลัง/ความเหนียว/ACI`);
  if(b.mark.length>6)problems.push('ข้อ 5.5: Mark ยาวเกิน 6 ตัวอักษร');
   if(!b.bsType||b.bsType==='X'&&!min)problems.push('ข้อ 4: รอการเทียบชนิด/เกรดเหล็กกับ BS หรือข้อกำหนดวัสดุ X ของโครงการ');
   if(ext<b.diameter)problems.push('ข้อ 7.1: ขนาดผิวนอกต้องไม่น้อยกว่า nominal diameter');
   if(!min)problems.push('Table 3: ไม่มีชนิด/ขนาดนี้ในตาราง ต้องกำหนดข้อกำหนดโครงการ');
   else if(r+1e-6<min.innerRadius)problems.push(`${min.projectRule?'ข้อกำหนดวัสดุ X ของโครงการ':'Table 3'}: รัศมีด้านในของวงเกลียว ${r.toFixed(3)} < ${min.innerRadius} mm; ต้องตรวจรัศมีดัดสามมิติ/ผู้ผลิต`);
   if(b.lengthMethod!=='bs8666')problems.push('รูป 77 ต้องเลือกวิธี BS8666 และยืนยัน A/B/C ก่อนตรวจผ่านขั้นต่ำ');
   if(!b.bsDimensionsConfirmed||b.outsideDiameter===undefined)problems.push('ข้อ 7.1: รอยืนยันผิวนอก/ซี่บั้งและมิติ A/B/C ของเกลียว');
   if(dimensions.some(d=>d.unit!=='turns'&&!multiple(d.value,5)))problems.push('Figure 2: A เส้นผ่านศูนย์กลาง/B ระยะเกลียวต้องเป็นมิติทีละ 5 mm; C เป็นจำนวนรอบ');
   if(geometry?.turnSeparation!==undefined&&geometry.turnSeparation+1e-6<ext)problems.push('ระยะจริงระหว่างรอบเกลียวน้อยกว่าขนาดผิวนอก ต้องตรวจ geometry/การผลิต; ไม่ใช้ค่า pitch เป็นระยะว่างโดยตรง');
   if(b.cutOverride>0)problems.push('ค่าความยาวตัดระบุเองรอตรวจ/รับรองจากแบบก่อนตรวจผ่านขั้นต่ำ');
   if(b.cutOverride>0&&!multiple(b.cutOverride,25))problems.push('ข้อ 7.1: ความยาวตัดระบุเองต้องเป็นจำนวนเท่าของ 25 mm');
  }
  notes.push('Code 77: A คือเส้นผ่านศูนย์กลางผิวนอกของวงเกลียว; B คือระยะตามแกนต่อรอบ; C คือจำนวนรอบ ไม่ใช่ mm และไม่มีมิติอิสระในรูป Table 1');
  if(geometry)notes.push(`Table 1: B ${geometry.B} / A/5 ${geometry.A/5} mm · ${geometry.exactRequired?'B > A/5 ใช้ความยาวเกลียวสามมิติจริง':'B ≤ A/5 ใช้สมการ Cπ(A - d) ตามเอกสาร'}; แสดงความยาวจริงแยกจากสมการ`);
  notes.push('รัศมีที่กรอกเป็นรัศมีวงแนวศูนย์กลาง ไม่ใช่รัศมี osculating ของเส้นเกลียว; ตรวจ Table 3 ด้วยรัศมีวงด้านในอย่างระมัดระวัง การผลิต/ขอ/ปลาย/ACI ยังรอตรวจ');
  notes.push('H01 คือเกลียวต่อเนื่องหนึ่งเส้น จุดแสดงผลไม่ใช่มุมดัดย่อย ไม่หักรัศมีทุกช่วง และไม่รวมคอร์ดเป็นความยาวตัด');
  return {active,problems:[...new Set(problems)],notes,min,hasBends:true,innerRadius:r,outsideDiameter:ext,dimensions,formula,formulaLength,oblique:undefined,semicircle:undefined,arc:undefined,helix:matched,rectLink:undefined,ovalLink:undefined,source:'BS 8666:2000 / Table 1 p.8; Table 3 p.11; clauses 5/7/8'};
 }
 if(b.shape==='arc'){
  const active=bsEnabled(spec),problems=arcErrors(b),notes:string[]=[],ext=b.outsideDiameter??b.diameter,innerRadius=b.radius-ext/2,geometry=arcGeometry(b),enabled=bsGeneration(spec)>=5&&b.shapeCode.trim()==='67',matched=enabled&&!geometry.errors.length;
  const supply=arcSupply(b.bsType,b.diameter,innerRadius),dimensions:BSDimension[]=matched?[{label:'A',value:geometry.length,free:false},{label:'R',value:innerRadius,free:false}]:[],formula=matched?'A (centreline arc length)':'',formulaLength=matched?geometry.length:undefined;
  if(active){
   if(!enabled)problems.push('รูปโค้งจริงรองรับ Code 67 ในชุดกฎขั้นต่ำรุ่น 5 เท่านั้น');
  if(b.mark.length>6)problems.push('ข้อ 5.5: Mark ยาวเกิน 6 ตัวอักษร');
   if(!b.bsType||b.bsType==='X')problems.push('ข้อ 4: รอการเทียบชนิด/เกรดเหล็กกับ BS หรือข้อกำหนดวัสดุ X ของโครงการ');
   if(ext<b.diameter)problems.push('ข้อ 7.1: ขนาดผิวนอกต้องไม่น้อยกว่า nominal diameter');
   if(supply.limit===undefined)problems.push('Table 5: ไม่มีชนิด/ขนาดนี้ในตาราง ต้องกำหนดข้อกำหนดโครงการ');
   if(b.lengthMethod!=='bs8666')problems.push('รูป 67 ต้องเลือกวิธี BS8666 และยืนยัน A/R ก่อนตรวจผ่านขั้นต่ำ');
   if(!b.bsDimensionsConfirmed||b.outsideDiameter===undefined)problems.push('ข้อ 7.1: รอยืนยันผิวนอก/ซี่บั้งและมิติ A/R ของส่วนโค้ง');
   if(dimensions.some(d=>!multiple(d.value,5)))problems.push('Figure 2: A/R ต้องเป็นมิติทีละ 5 mm');
   if(b.curve&&b.curve.sweepDegrees>=360-1e-8)problems.push('ส่วนโค้งปิดเต็มวงรอรายละเอียดการต่อ/ทาบและรหัสรูปที่เหมาะสม');
   if(b.cutOverride>0)problems.push('ค่าความยาวตัดระบุเองรอตรวจ/รับรองจากแบบก่อนตรวจผ่านขั้นต่ำ');
   if(b.cutOverride>0&&!multiple(b.cutOverride,25))problems.push('ข้อ 7.1: ความยาวตัดระบุเองต้องเป็นจำนวนเท่าของ 25 mm');
  }
  notes.push('Code 67: A คือความยาวส่วนโค้งแนวศูนย์กลาง ไม่ใช่คอร์ดหรือมิติผิวนอก; R คือรัศมีด้านในตามรูป Table 1');
  notes.push('ความยาวใช้ R ศูนย์กลาง × มุมกวาดเรเดียนโดยตรง; จุดตัวอย่างเพื่อแสดงภาพไม่ใช้รวมความยาวตัด และไม่ถือเป็นมุมดัดย่อย');
  if(supply.limit!==undefined)notes.push(`ข้อ 10 / Table 5: R ด้านใน ${innerRadius} mm / ขีดจำกัด ${supply.limit} mm / ${supply.method}; การจัดหาตรงไม่เปลี่ยนรูปโค้งที่ต้องวางจริง`);
  else notes.push('ข้อ 10 / Table 5: รอข้อกำหนดการจัดหาตามชนิดและขนาดเหล็ก');
  return {active,problems:[...new Set(problems)],notes,min:undefined,hasBends:true,innerRadius,outsideDiameter:ext,dimensions,formula,formulaLength,oblique:undefined,semicircle:undefined,arc:matched?{...geometry,supply,sweepDegrees:b.curve!.sweepDegrees}:undefined,helix:undefined,rectLink:undefined,ovalLink:undefined,source:'BS 8666:2000 / Table 1 p.8; clause 10 / Table 5 p.13'};
 }
 const active=bsEnabled(spec),problems:string[]=[],notes:string[]=[],ext=b.outsideDiameter??b.diameter,r=b.radius-ext/2,min=bsMinimum(b.bsType,b.diameter,spec,b.grade),legs=points.slice(1).map((p,i)=>length(minus(p,points[i]))),trims=points.map(()=>0),turns:number[]=[];
 const dirs=points.slice(1).map((p,i)=>{const v=minus(p,points[i]),n=length(v);return v.map(x=>x/(n||1)) as Vec3;});
 for(let i=1;i<dirs.length;i++){const a=Math.acos(Math.max(-1,Math.min(1,dot(dirs[i-1],dirs[i]))));turns.push(a);trims[i]=a<Math.PI-1e-5?b.radius*Math.tan(a/2):0;}
 const bends=turns.filter(a=>a>1e-5),normal=dirs.slice(1).map(v=>cross(dirs[0],v)).find(v=>length(v)>1e-5),planar=!normal||dirs.every(v=>Math.abs(dot(normal,v))<1e-5);
 const right=bends.every(a=>Math.abs(a-Math.PI/2)<1e-5),code=b.shapeCode.trim();let dimensions:BSDimension[]=[],formula='',formulaLength:number|undefined;
 const oblique=bsGeneration(spec)>=3?obliqueAssessment(code,points,ext,b.radius):undefined;
 const rectLink=bsGeneration(spec)>=7&&code==='51'?rectLinkAssessment(points,ext,b.radius,b.diameter):undefined;
 const ovalLink=bsGeneration(spec)>=8&&code==='33'?ovalLinkAssessment(points,ext,b.radius,b.diameter):undefined;
 const semicircle=bsGeneration(spec)>=4&&code==='13'?semicircleAssessment(points,ext,b.radius,b.diameter):undefined;
 if(code==='00'&&bends.length===0&&points.length>=2){dimensions=[{label:'A',value:legs.reduce((s,l)=>s+l,0),free:false}];formula='A';formulaLength=dimensions[0].value;}
 else if(['11','12'].includes(code)&&points.length===3&&right&&bends.length===1){dimensions=[{label:'A',value:legs[1]+ext/2,free:false},{label:'B',value:legs[0]+ext/2,free:true}];formula=code==='11'?'A + (B) - 0.5r - d':'A + (B) - 0.5R - d';formulaLength=dimensions[0].value+dimensions[1].value-.5*r-b.diameter;}
 else if(ovalLink){dimensions=ovalLink.dimensions;formula=ovalLink.formula;formulaLength=ovalLink.formulaLength;}
 else if(rectLink){dimensions=rectLink.dimensions;formula=rectLink.equalEnds?rectLink.formula:'';formulaLength=rectLink.formulaLength;}
 else if(semicircle){dimensions=semicircle.dimensions;formula=semicircle.formula;formulaLength=semicircle.formulaLength;}
 else if(code==='21'&&points.length===4&&right&&bends.length===2&&planar&&dot(dirs[0],dirs[2])<-.99999){dimensions=[{label:'A',value:legs[0]+ext/2,free:false},{label:'B',value:legs[1]+ext,free:false},{label:'C',value:legs[2]+ext/2,free:true}];formula='A + B + (C) - r - 2d';formulaLength=dimensions.reduce((n,a)=>n+a.value,0)-r-2*b.diameter;}
 // New adapters are gated by the immutable v2 policy; v1 snapshots retain their fallback/diagnostics.
 else if(sameRightAngleTopology(code,points,spec)){
  dimensions=legs.map((value,i)=>({label:'ABCDE'[i],value:value+(i===0||i===legs.length-1?ext/2:ext),free:i===legs.length-1}));
  formula=code==='31'?'A + B + C + (D) - 1.5r - 3d':'A + B + C + D + (E) - 2r - 4d';
  formulaLength=dimensions.reduce((n,a)=>n+a.value,0)-(code==='31'?1.5:2)*r-(code==='31'?3:4)*b.diameter;
 }
 else if(oblique){dimensions=oblique.dimensions;formula=oblique.formula;formulaLength=oblique.formulaLength;}
 if(active){
  if(!bsShapeCodes.includes(code))problems.push('ข้อ 8.2 / Table 1: ระบุ Shape code ของ BS 8666:2000');
  if(min?.projectRule)notes.push(`ข้อกำหนดโครงการวัสดุ X: ${min.projectRule.grade} Ø${b.diameter} / ${min.projectRule.reference} / ${min.projectRule.basis}; ไม่ใช่การเทียบเกรดกับ BS หรือรับรองกำลัง/ความเหนียว/ACI`);
  if(b.mark.length>6)problems.push('ข้อ 5.5: Mark ยาวเกิน 6 ตัวอักษร');
  if(!b.bsType||b.bsType==='X'&&!min)problems.push('ข้อ 4: รอการเทียบชนิด/เกรดเหล็กกับ BS หรือข้อกำหนดวัสดุ X ของโครงการ');
  if(b.outsideDiameter!==undefined&&b.outsideDiameter<b.diameter)problems.push('ข้อ 7.1: ขนาดผิวนอกต้องไม่น้อยกว่า nominal diameter');
  if(bends.length){
   if(!min)problems.push('Table 3: ไม่มีชนิด/ขนาดนี้ในตาราง ต้องกำหนดกฎโครงการ');
   else if(r+1e-6<min.innerRadius)problems.push(`${min.projectRule?'ข้อกำหนดวัสดุ X ของโครงการ':'Table 3'}: r ด้านใน ${r.toFixed(3)} < ${min.innerRadius} mm (R ศูนย์กลางขั้นต่ำ ${min.innerRadius+ext/2} mm)`);
   if(code==='11'&&min&&Math.abs(r-min.innerRadius)>1e-6)problems.push(min.projectRule?'Table 1: code 11 ใช้ r ขั้นต่ำวัสดุ X ของโครงการ; ระบุรัศมีพิเศษด้วย code 12':'Table 1: code 11 ใช้ r ขั้นต่ำของ Table 3; ระบุรัศมีพิเศษด้วย code 12');
   const endStraight=[legs[0]-trims[1],legs.at(-1)!-trims.at(-2)!],endMin=b.shape==='link'||rectLink||ovalLink?10*b.diameter:5*b.diameter;
   if(endStraight.some(n=>n+1e-6<endMin))problems.push(`Table 3 note 2: ช่วงตรงปลายต้อง ≥ ${endMin} mm`);
   for(let i=1;i<legs.length-1;i++)if(!semicircle&&!(ovalLink&&[1,3,5].includes(i))&&turns[i-1]>1e-5&&turns[i]>1e-5&&legs[i]-trims[i]-trims[i+1]+1e-6<4*b.diameter)problems.push(`ข้อ 8.10: ช่วง L${String(i+1).padStart(2,'0')} ระหว่างส่วนโค้งต้อง ≥ 4d = ${4*b.diameter} mm`);
  }
  if(bends.some(a=>a>Math.PI/2+1e-5)&&code!=='99')problems.push('ข้อ 8.7: รูปที่มีมุมภายในแหลมต้องใช้ code 99 และแสดงมิติครบ');
  if(!right)notes.push('ข้อ 8.6: ต้องแสดงพิกัดสำหรับช่วงดัดที่ไม่ใช่มุมฉาก');
  if(!planar)notes.push('ข้อ 8.8: bent in two planes — ต้องตรวจภาพและพิกัดประกอบ');
  if(b.lengthMethod==='bs8666'){
   if(formulaLength===undefined)problems.push(`สูตรอัตโนมัติรองรับ ${bsFormulaCodes(spec).replaceAll('/',' / ')} ที่ geometry ตรงรูปเท่านั้น; รูปอื่นใช้แนวศูนย์กลางพร้อมตรวจ code 99`);
   if(!b.bsDimensionsConfirmed||b.outsideDiameter===undefined)problems.push('ข้อ 7.1: รอยืนยันผิวนอก/ซี่บั้งและมิติ A/B ที่ได้จาก geometry');
   if(dimensions.some(a=>a.value<=0||!multiple(a.value,5)))problems.push('Figure 2: มิติดัด A/B/C ต้องเป็นค่าบวกทีละ 5 mm; แก้ geometry ให้ตรงแบบ');
   if(bends.length&&min){const ends=ovalLink?[dimensions[2]]:oblique?dimensions.filter(d=>oblique.endLabels.includes(d.label)):code==='21'||semicircle?[dimensions[0],dimensions[2]]:bsGeneration(spec)>=2&&['31','41','44'].includes(code)?[dimensions[0],dimensions.at(-1)]:dimensions;if(ends.some(a=>a&&a.value<min.endDimension))problems.push(`${min.projectRule?'ข้อกำหนดวัสดุ X ของโครงการ':'Table 3'}: มิติปลายต้อง ≥ ${min.endDimension} mm`);}
   if(semicircle){const [A,B,C]=dimensions.map(d=>d.value);if(A+1e-6<B/2+5*b.diameter||C+1e-6<B/2+5*b.diameter)problems.push('Table 1 code 13: A/C ต้อง ≥ B/2 + 5d');if(min&&B+1e-6<2*(min.innerRadius+b.diameter))problems.push('Table 1 code 13: B ต้อง ≥ 2(r ขั้นต่ำ + d)');}
   if(code==='12'&&dimensions.some(a=>a.value<r+6*b.diameter))problems.push('Table 1 code 12: A/B ต้อง ≥ R ด้านใน + 6d');
   if(code==='12'&&!multiple(r,5))problems.push('Figure 2: R ด้านในที่ระบุของ code 12 ต้องเป็นทีละ 5 mm');
  }else if(code!=='99'&&code!=='00')problems.push('ยังใช้ความยาวแนวศูนย์กลาง; ต้องตรวจสูตรมาตรฐาน/เปลี่ยนวิธีคำนวณก่อนตรวจผ่าน');
  if(ovalLink){
   const [A,B]=dimensions.map(d=>d.value);if(A+1e-6<12*b.diameter+30)problems.push('Table 1 code33: A ต้อง ≥ 12d + 30 mm');if(B+1e-6<2*(r+b.diameter))problems.push('Table 1 code33: B ต้อง ≥ 2(r ด้านใน + d)');
   problems.push(OVAL_CLOSURE_PENDING);
   notes.push('Code33: 2A + 3B + 17d ตาม Table 1 printed p7; C เป็นมิติอิสระและไม่อยู่ในสมการ ห้ามอนุมานว่าเปลี่ยน C แล้วความยาวจริง/การผลิตยังตรงสูตร');
   notes.push('แสดงแนวฉายสามครึ่งวงกลมด้วยส่วนโค้ง 90° คู่ L02/L04/L06 ตรง = 0 เป็นจุดต่อโค้ง; มุม P2/P6 และ P3/P7 ซ้ำในแนวฉาย รอรายละเอียดปิดปลาย/ระนาบจริง ไม่มีการใส่ระยะยกให้');
   notes.push('แอปใช้ปลายตรง 10d และ Table 3 เป็นขั้นต่ำอนุรักษ์สำหรับเริ่มต้น; Table 1 ยกเว้น radius rule ของรูป 33 ต้องตรวจวัสดุ/มาตรฐานโครงการและการผลิต ไม่ถือว่าการปิดปลายผ่าน');
   notes.push('Table 1 Note 2: ไม่จำลองการแบ่งโค้งใหญ่เป็นช่วงตรง; พักการตรวจผ่านเมื่อ R ศูนย์กลาง > 200 mm');
   if(b.radius>200+1e-6)problems.push('รอผู้ผลิตตรวจ Table 1 Note 2: Code33 R ศูนย์กลาง > 200 mm');
  }
  if(rectLink){if(!rectLink.equalEnds)problems.push('Table 1 code51: C และ D ต้องเท่ากัน มิฉะนั้นห้ามใช้สูตรที่ไม่รวม D');const [A,B,C,D]=dimensions.map(d=>d.value);if(C>Math.min(A,B)+1e-6||D>Math.min(A,B)+1e-6)problems.push('Table 1 code51: C/D ต้องไม่เกิน A หรือ B');if(min&&(C+1e-6<min.endDimension||D+1e-6<min.endDimension))problems.push(`Table 1 code51: C/D ต้อง ≥ Table 3 end dimension ${min.endDimension} mm`);problems.push(LINK_CLOSURE_PENDING);notes.push('Code51: วงปลอก A/B และปลาย C/(D) มุมฉากห้าจุด; สูตร 2(A+B+C) - 2.5r - 5d โดย r เป็นด้านใน และ C=D');notes.push('ใช้ 10d สำหรับช่วงตรงปลาย link และ 4d ระหว่าง bend; แนวฉายมีมุมปิดปลายซ้อนกัน ไม่ได้กำหนดระยะยก/ระนาบการปิดปลายจริง');}
  if(code==='99')problems.push(CODE99_HOLD);
  if(b.cutOverride>0&&!multiple(b.cutOverride,25))problems.push('ข้อ 7.1: ความยาวตัดระบุเองต้องเป็นจำนวนเท่าของ 25 mm');
  if(b.cutOverride>0)notes.push('ยาวตัดระบุเองใช้แทนสูตร ต้องตรวจความเหมาะสมจากแบบ');
  if(b.cutOverride>0)problems.push('ค่าความยาวตัดระบุเองรอตรวจ/รับรองจากแบบก่อนตรวจผ่านขั้นต่ำ');
  if(oblique){notes.push(oblique.exactRequired?'Table 1 Note 1: มีมุมดัดเกิน 45° ใช้ความยาวตรงถึงจุดสัมผัสรวมส่วนโค้งศูนย์กลางจริง แทนสมการโดยประมาณ':'Table 1 Note 1: สมการรูป 15/25/26/46 เป็นค่าโดยประมาณ; แสดงแนวศูนย์กลางจริงแยกกัน');notes.push('Table 1 Note 1: เมื่อมุมเข้าใกล้ 90° ควรพิจารณา Code 99 พร้อมมิติครบ');if(code==='25')notes.push('Table 1 code 25: ถ้า E เป็นมิติวิกฤต ให้ใช้ Code 99 และกำหนด A หรือ B เป็นมิติอิสระ');}
  if(semicircle){notes.push('Code 13: ส่วนโค้งครึ่งวงกลม 180° หนึ่งส่วน ใช้ส่วนโค้ง 90° สองส่วนที่มีศูนย์เดียวกัน; L02 ตรง = 0 เป็นจุดต่อส่วนโค้ง ไม่ใช่ช่วงตรงระหว่างสอง bend');notes.push('Table 1 code 13 ใช้ค่าสัมประสิทธิ์ 0.57/1.57 ตามไฟล์ แสดงความยาวแนวศูนย์กลางจริงแยกกัน');notes.push('Table 1 Note 2: โค้งใหญ่กว่า 200 mm อาจผลิตเป็นช่วงตรง ต้องตรวจวิธีผลิต; ระบบนี้ไม่จำลองการแบ่งโค้งเป็นช่วงตรง');if(b.radius>200+1e-6)problems.push('รอผู้ผลิตตรวจ Table 1 Note 2: ระบบพักการตรวจผ่านเมื่อ R ศูนย์กลาง > 200 mm ไม่ใช้รูปโค้งต่อเนื่องแทนการแบ่งช่วงที่ยังไม่ยืนยัน');}
 }
 return {active,problems:[...new Set(problems)],notes,min,hasBends:bends.length>0,innerRadius:bends.length?r:0,outsideDiameter:ext,dimensions,formula,formulaLength,oblique,semicircle,arc:undefined,helix:undefined,rectLink,ovalLink,source:`BS 8666:2000 / Table 1 p.${ovalLink?7:rectLink?8:oblique?oblique.sourcePage:bsGeneration(spec)>=2&&['31','41','44'].includes(code)?7:6}${oblique?'; Note 1 p.8':semicircle||ovalLink?'; Note 2 p.8':''}; Table 3 p.11; clauses 5/7/8`};
}

function sameRightAngleTopology(code:string,p:Vec3[],s:Spec){
 if(bsGeneration(s)<2||!['31','41','44'].includes(code)||p.length!==(code==='31'?5:6))return false;
 const legs=p.slice(1).map((v,i)=>minus(v,p[i])),lengths=legs.map(length);
 if(lengths.some(n=>n<.001))return false;
 const u=legs.map((v,i)=>v.map(n=>n/lengths[i]) as Vec3),normals=u.slice(1).map((v,i)=>cross(u[i],v));
 if(u.slice(1).some((v,i)=>Math.abs(dot(u[i],v))>1e-5))return false;
 if(u.some(v=>Math.abs(dot(normals[0],v))>1e-5))return false;
 if(code==='44')return dot(u[0],u[2])>.99999&&dot(u[2],u[4])>.99999&&dot(u[1],u[3])<-.99999;
 if(normals.some(n=>dot(n,normals[0])<.99999)||lengths[0]>=lengths[2])return false;
 if(code==='41'){
  if(lengths[4]>=lengths[2])return false;
  // Do not classify crossing/overlapping same-level tails as an open standard shape.
  if(Math.abs(lengths[1]-lengths[3])<.001&&lengths[0]+lengths[4]>=lengths[2])return false;
 }
 return true;
}
