import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Pencil,Plus,Trash2,Maximize2} from 'lucide-react';
import {barSchema,blankBar,labels,type Bar,type Member,type Spec} from '../domain/model';
import {elementInputProblems,elementInputSchema,layerShapes,shapesFor,pilePositions,pileTypeLabels,tiePatternInfo,tiePatterns,type ElementInput} from '../domain/elementInput';
import {takeoff} from '../domain/engine';
import {solidQuantities} from '../domain/solids';
import {surfaceTriangles} from '../domain/prismGeometry';
import {placementViewBounds} from '../domain/placementContext';
import {bsEnabled} from '../domain/bs8666';
import {Field,number} from './EditorControls';

type Row=ReturnType<typeof takeoff>['rows'][number];
type Preview={member:Member;warnings:string[];errors:string[];q:ReturnType<typeof takeoff>};
/** Dialog field: number (mm), integer, bar diameter, select, checkbox, text or a section heading. */
type F={k:'num'|'int'|'dia'|'sel'|'chk'|'text'|'head';label:string;path?:string;opts?:[string|number,string][];min?:number;max?:number;signed?:boolean;after?:(draft:any)=>void};
/** Rebar layer (or pile group) of the structured input that the 3D items map to. */
type Def={key:string;label:string;present:boolean;match:(role:string)=>boolean;fields:(d:any)=>F[];remove?:(d:any)=>void;removeLabel?:string;adds?:[string,(d:any)=>void][]};
type Item={key:string;label:string;sub:string;rows:Row[];color:number;editable:boolean;removable:boolean};
type Editing={title:string;draft:any;fields:(d:any)=>F[];note?:string;info?:ReactNode;check?:(d:any)=>string[];commit:(d:any)=>boolean};
type Menu={key:string;x:number;y:number};

const DIAS=[6,9,10,12,16,20,25,28,32,36,40];
const PALETTE=[0x168674,0x2f6fb5,0x8e5bb5,0xc0563f,0x3f9a3a,0xb58a1f,0x1f9bb5,0xb53f7a,0x5a6b73,0x7a8f2a];
const hex=(n:number)=>`#${n.toString(16).padStart(6,'0')}`;
const getP=(o:any,p:string):any=>p.split('.').reduce((a,k)=>a?.[k],o);
const setP=(o:any,p:string,v:unknown)=>{const ks=p.split('.');let t=o;for(const k of ks.slice(0,-1))t=t[k];t[ks.at(-1)!]=v;};
const roleIs=(r:string)=>(role:string)=>role===r||role.startsWith(r+'-');
const bendOpts=(d:any):[string,string][]=>[['none','ไม่งอ (ปลายตรง)'],['standard',`ฉาก 90° มาตรฐาน (${d.detailing.hook90}d + r)`],['custom','กำหนดระยะขางอเอง']];
const spacingF=(p:string):F[]=>[{k:'dia',label:'ขนาดเหล็ก',path:`${p}.diameter`},{k:'num',label:'ระยะห่าง @ (mm)',path:`${p}.spacing`}];
const countF=(p:string):F[]=>[{k:'int',label:'จำนวน (เส้น)',path:`${p}.count`,max:200},{k:'dia',label:'ขนาดเหล็ก',path:`${p}.diameter`}];
const shapeF=(p:string)=>(d:any):F[]=>{const l=getP(d,p),info=layerShapes.find(s=>s.code===l.shape)||layerShapes[0];return [{k:'sel',label:'Shape code (BS 8666)',path:`${p}.shape`,opts:shapesFor(d.category).map(s=>[s.code,`${s.code} · ${s.label}`])},...(info.ends.some(e=>e!=='straight')?[{k:'num',label:'ขางอ / ส่วนตรงหลังขอ (mm, 0 = มาตรฐาน)',path:`${p}.leg`} as F]:[]),...(l.shape==='12'?[{k:'num',label:'รัศมีดัดใน R (mm, Shape 12)',path:`${p}.radius`} as F]:[])];};
const meshF=(p:string)=>(d:any):F[]=>[...spacingF(p),...shapeF(p)(d)];
const layersF:F={k:'sel',label:'จำนวนชั้นเหล็ก',path:'rebar.layers',opts:[[1,'1 ชั้น (กึ่งกลาง)'],[2,'2 ชั้น (สองผิว)']]};

export function layerDefs(input:ElementInput):Def[]{
 const optional=(key:string,label:string,p:string,role:string,fields:(d:any)=>F[]):Def=>({key,label,match:roleIs(role),present:!!getP(input,`${p}.enabled`),fields,remove:d=>setP(d,`${p}.enabled`,false),removeLabel:`ลบ${label}`,adds:[[`เพิ่ม${label}`,d=>setP(d,`${p}.enabled`,true)]]});
 switch(input.category){
  case 'Foundation':{
   const c=input.column;
   const colMainF=(d:any):F[]=>{const col=d.column;return [
    {k:'head',label:'หน้าตัดเสา'},{k:'sel',label:'ชนิด',path:'column.type',opts:[['pedestal','เสาตอม่อ (คอนกรีต + เหล็ก)'],['starter','Starter bar (เหล็กรอเสา)']]},{k:'text',label:'หมายเลขเสา',path:'column.columnNo',max:50},
    {k:'sel',label:'รูปร่างหน้าตัด',path:'column.shape',opts:[['rect','สี่เหลี่ยม'],['circle','วงกลม'],['L','ตัวแอล (L)'],['U','ตัวยู (U)']]},
    ...(col.shape==='circle'?[{k:'num',label:'เส้นผ่านศูนย์กลาง (mm)',path:'column.diameter'} as F]:[{k:'num',label:'กว้าง X (mm)',path:'column.width'} as F,{k:'num',label:'ลึก Y (mm)',path:'column.depth'} as F]),
    ...(col.shape==='L'||col.shape==='U'?[{k:'num',label:'ความหนาขาแนว X (mm)',path:'column.armX'} as F,{k:'num',label:'ความหนาขาแนว Y (mm)',path:'column.armY'} as F]:[]),
    ...(col.type==='pedestal'?[{k:'num',label:'ความสูงเสาตอม่อ (mm)',path:'column.height'} as F]:[]),
    {k:'num',label:'ระยะโผล่ของเหล็ก (mm)',path:'column.projection'},{k:'num',label:'Cover เสา (mm)',path:'column.cover'},
    {k:'num',label:'ระยะเยื้อง X จากกึ่งกลางฐาน (mm)',path:'column.offsetX',signed:true},{k:'num',label:'ระยะเยื้อง Y จากกึ่งกลางฐาน (mm)',path:'column.offsetY',signed:true},
    {k:'head',label:'เหล็กยืน'},
    ...(col.shape==='circle'?[{k:'dia',label:'ขนาดเหล็ก',path:'column.main.diameter'} as F,{k:'int',label:'จำนวน (เส้น)',path:'column.main.count',max:200} as F]
     :[{k:'dia',label:'ขนาดเหล็กมุม',path:'column.main.corner.diameter'} as F,{k:'int',label:'เหล็กต่อมุม (1–3)',path:'column.main.corner.count',min:1,max:3} as F,
      ...(col.shape==='rect'?[{k:'int',label:'เหล็กด้าน X ต่อด้าน',path:'column.main.sideX.count',max:200} as F,{k:'dia',label:'ขนาดเหล็กด้าน X',path:'column.main.sideX.diameter'} as F,{k:'int',label:'เหล็กด้าน Y ต่อด้าน',path:'column.main.sideY.count',max:200} as F,{k:'dia',label:'ขนาดเหล็กด้าน Y',path:'column.main.sideY.diameter'} as F]
       :[{k:'num',label:'ระยะห่างเหล็กด้านสูงสุด (mm)',path:'column.main.spacing'} as F,{k:'dia',label:'ขนาดเหล็กด้าน X',path:'column.main.sideX.diameter'} as F,{k:'dia',label:'ขนาดเหล็กด้าน Y',path:'column.main.sideY.diameter'} as F])]),
    {k:'head',label:'การฝัง / งอขอในฐาน'},{k:'sel',label:'ระยะฝัง',path:'column.embed.mode',opts:[['standard','วางบนตะแกรงล่าง'],['custom','กำหนดระยะฝังเอง']]},
    ...(col.embed.mode==='custom'?[{k:'num',label:'ระยะฝังจากผิวบนฐาน (mm)',path:'column.embed.depth'} as F]:[]),
    {k:'sel',label:'งอขอปลายในฐาน',path:'column.bend',opts:bendOpts(d)},...(col.bend==='custom'?[{k:'num',label:'ระยะขางอ (mm)',path:'column.leg'} as F]:[]),
   ];};
   const pileF=(d:any):F[]=>{const p=d.pile;return [
    {k:'sel',label:'ชนิดเสาเข็ม',path:'pile.type',opts:Object.entries(pileTypeLabels)},{k:'num',label:p.type==='square'||p.type==='I'?'ขนาดเข็ม (mm)':'เส้นผ่านศูนย์กลาง (mm)',path:'pile.size'},
    {k:'sel',label:'การจัดวาง',path:'pile.layout',opts:[['standard','ตามจำนวน (มาตรฐาน)'],['grid','ตาราง แถว × คอลัมน์']]},
    ...(p.layout==='standard'?[{k:'int',label:'จำนวนเสาเข็ม (ต้น)',path:'pile.count',max:100} as F]:[{k:'int',label:'จำนวนแนว X',path:'pile.nx',min:1,max:20} as F,{k:'int',label:'จำนวนแนว Y',path:'pile.ny',min:1,max:20} as F]),
    {k:'num',label:'ระยะห่างแนว X (mm)',path:'pile.spacingX'},...(p.layout==='grid'?[{k:'num',label:'ระยะห่างแนว Y (mm)',path:'pile.spacingY'} as F]:[]),
    {k:'num',label:'ความยาวเสาเข็ม (m)',path:'pile.length'},{k:'num',label:'ระยะตัดหัวเข็มต่อต้น (mm)',path:'pile.cutoff'},{k:'num',label:'ระยะฝังหัวเข็มในฐาน (mm)',path:'pile.embed'},
    {k:'num',label:'เยื้องกลุ่มเข็ม X (mm)',path:'pile.offsetX',signed:true},{k:'num',label:'เยื้องกลุ่มเข็ม Y (mm)',path:'pile.offsetY',signed:true},
   ];};
   return [
    {key:'bottomX',label:'เหล็กล่างทิศ X',present:true,match:roleIs('bottom-x'),fields:meshF('rebar.bottomX')},
    {key:'bottomY',label:'เหล็กล่างทิศ Y',present:true,match:roleIs('bottom-y'),fields:meshF('rebar.bottomY')},
    optional('topX','เหล็กบนทิศ X','rebar.topX','top-x',meshF('rebar.topX')),
    optional('topY','เหล็กบนทิศ Y','rebar.topY','top-y',meshF('rebar.topY')),
    optional('side','เหล็กรอบข้าง (LOOPS)','rebar.side','side-loop',()=>spacingF('rebar.side')),
    optional('sideBars','เหล็กแนวตั้งผิวข้าง','rebar.sideBars','side-vertical',()=>[...spacingF('rebar.sideBars'),{k:'sel',label:'ปลายบน',path:'rebar.sideBars.top',opts:[['inward','งอฉากเข้าใน'],['straight','ปลายตรง']]},{k:'sel',label:'ปลายล่าง',path:'rebar.sideBars.bottom',opts:[['straight','ปลายตรง'],['inward','งอฉากเข้าใน']]},{k:'num',label:'ระยะงอเข้าใน (mm, 0 = 15d)',path:'rebar.sideBars.leg'}]),
    {key:'colMain',label:c.type==='starter'?`Starter bar${c.columnNo?` ${c.columnNo}`:''}`:`เหล็กยืนเสาตอม่อ${c.columnNo?` ${c.columnNo}`:''}`,present:c.type!=='none',match:roleIs('column-main'),fields:colMainF,remove:d=>{d.column.type='none';},removeLabel:'ลบเสาตอม่อ / Starter bar ทั้งชุด',adds:[['เพิ่ม Starter bar',d=>{d.column.type='starter';}],['เพิ่มเสาตอม่อ',d=>{d.column.type='pedestal';}]]},
    {key:'colTie',label:'เหล็กปลอกเสาตอม่อ',present:c.type==='pedestal',match:roleIs('column-tie'),fields:()=>spacingF('column.tie')},
    {key:'pile',label:'เสาเข็ม',present:input.foundationType==='pile',match:()=>false,fields:pileF,remove:d=>{d.foundationType='spread';},removeLabel:'ลบเสาเข็ม (เปลี่ยนเป็นฐานแผ่)',adds:[['เพิ่มเสาเข็ม',d=>{d.foundationType='pile';}]]},
   ];}
  case 'Column':return [
   {key:'main',label:'เหล็กยืน',present:true,match:roleIs('main'),fields:(d:any)=>[...(d.shape==='circle'?countF('rebar.main'):[
    {k:'head',label:'เหล็กมุม (4 มุม)'} as F,{k:'dia',label:'ขนาดเหล็ก',path:'rebar.main.corner.diameter'} as F,{k:'sel',label:'จำนวนต่อมุม',path:'rebar.main.corner.count',opts:[[1,'1 เส้น'],[2,'2 เส้น (มัดคู่)'],[3,'3 เส้น (มัด 3)']]} as F,
    {k:'head',label:'เหล็กด้าน X (ล่าง/บน)'} as F,{k:'dia',label:'ขนาดเหล็ก',path:'rebar.main.sideX.diameter'} as F,{k:'int',label:'จำนวนต่อด้าน (ไม่รวมมุม)',path:'rebar.main.sideX.count',max:200} as F,
    {k:'head',label:'เหล็กด้าน Y (ซ้าย/ขวา)'} as F,{k:'dia',label:'ขนาดเหล็ก',path:'rebar.main.sideY.diameter'} as F,{k:'int',label:'จำนวนต่อด้าน (ไม่รวมมุม)',path:'rebar.main.sideY.count',max:200} as F]),...(['bottom','top'] as const).flatMap(end=>[
    {k:'head',label:end==='bottom'?'End condition ปลายล่าง':'End condition ปลายบน'} as F,
    {k:'sel',label:'ชนิด',path:`rebar.${end}.mode`,opts:[['none',end==='bottom'?'ไม่มี (เริ่มที่ขอบล่างเสา)':'ไม่มี (ตัดที่ cover)'],['lap','Lap splice length (ทาบตรง)'],['crank','Crank 1:6 + ทาบ']]} as F,
    ...(d.rebar[end].mode!=='none'?[{k:'num',label:`ระยะทาบ (mm, 0 = ${d.detailing.lap}d)`,path:`rebar.${end}.lap`} as F]:[])])]},
   {key:'tie',label:'เหล็กปลอกชุดที่ 1 (รอบมุม)',present:true,match:roleIs('tie'),fields:()=>[{k:'dia',label:'ขนาดเหล็ก',path:'rebar.tie.diameter'},
    {k:'num',label:'Upper · ความยาวโซนบน (mm)',path:'rebar.tie.upper.length'},{k:'num',label:'Upper · str @ (mm)',path:'rebar.tie.upper.spacing'},
    {k:'num',label:'Middle · str @ (mm)',path:'rebar.tie.spacing'},
    {k:'num',label:'Lower · ความยาวโซนล่าง (mm)',path:'rebar.tie.lower.length'},{k:'num',label:'Lower · str @ (mm)',path:'rebar.tie.lower.spacing'}]},
   {key:'tie2',label:'เหล็กปลอกชุดที่ 2 (ปลอกใน / รัดขวาง)',present:input.shape==='rect',match:roleIs('tie2'),fields:(d:any)=>[{k:'dia',label:'ขนาดเหล็ก',path:'rebar.tie.inner.diameter'},
    ...(['upper','middle','lower'] as const).flatMap(z=>[{k:'head',label:{upper:'Upper · โซนบน',middle:'Middle · โซนกลาง',lower:'Lower · โซนล่าง'}[z]} as F,
     {k:'sel',label:'รูปแบบ',path:`rebar.tie.inner.${z}.pattern`,opts:tiePatterns.map(p=>[p,tiePatternInfo[p].label])} as F,
     ...(d.rebar.tie.inner[z].pattern!=='none'?[{k:'num',label:'str @ (mm)',path:`rebar.tie.inner.${z}.spacing`} as F]:[])])]},
  ];
  case 'Beam':{
   const main=(key:'top'|'bottom',label:string):Def=>({key,label,present:input.rebar[key].count>0,match:roleIs(key),fields:(d:any)=>[...countF(`rebar.${key}`),...shapeF(`rebar.${key}`)(d)],remove:d=>setP(d,`rebar.${key}.count`,0),removeLabel:`ลบ${label}`,adds:[[`เพิ่ม${label}`,d=>setP(d,`rebar.${key}.count`,2)]]});
   return [main('top','เหล็กบน'),main('bottom','เหล็กล่าง'),{key:'stirrup',label:'เหล็กปลอก',present:true,match:roleIs('stirrup'),fields:()=>spacingF('rebar.stirrup')}];}
  case 'Slab':return [
   {key:'bottomX',label:'เหล็กล่างทิศ X',present:true,match:roleIs('bottom-x'),fields:meshF('rebar.bottomX')},
   {key:'bottomY',label:'เหล็กล่างทิศ Y',present:true,match:roleIs('bottom-y'),fields:meshF('rebar.bottomY')},
   optional('topX','เหล็กบนทิศ X','rebar.topX','top-x',meshF('rebar.topX')),
   optional('topY','เหล็กบนทิศ Y','rebar.topY','top-y',meshF('rebar.topY')),
  ];
  case 'Wall':return [
   {key:'vertical',label:'เหล็กแนวตั้ง',present:true,match:roleIs('vertical'),fields:(d:any)=>[...meshF('rebar.vertical')(d),{k:'chk',label:'รวมระยะทาบเหล็กแนวตั้ง',path:'rebar.lap'},layersF]},
   {key:'horizontal',label:'เหล็กแนวนอน',present:true,match:roleIs('horizontal'),fields:(d:any)=>[...meshF('rebar.horizontal')(d),layersF]},
  ];
 }
}

function elementFields(d:any):F[]{
 const cover=(keys:[string,string][]):F[]=>[{k:'head',label:'ระยะหุ้มคอนกรีต Cover'},...keys.map(([k,l])=>({k:'num',label:`${l} (mm)`,path:`cover.${k}`}) as F)];
 switch(d.category as ElementInput['category']){
  case 'Foundation':return [
   {k:'sel',label:'ชนิดฐานราก',path:'foundationType',opts:[['spread','ฐานแผ่'],['pile','ฐานเสาเข็ม']]},
   {k:'sel',label:'รูปร่างแปลนฐาน',path:'shape',opts:[['rect','สี่เหลี่ยม'],['circle','กลม'],['hex','6 เหลี่ยม'],['oct','8 เหลี่ยม'],['L','ตัวแอล (L)'],['U','ตัวยู (U)']]},
   ...(d.shape==='circle'?[{k:'num',label:'เส้นผ่านศูนย์กลาง (mm)',path:'diameter'} as F]:[{k:'num',label:'กว้าง X (mm)',path:'width'} as F,{k:'num',label:'ยาว Y (mm)',path:'length'} as F]),
   ...(d.shape==='hex'||d.shape==='oct'?[{k:'num',label:'ระยะตัดมุม (mm, 0 = รูปปกติ)',path:'chamfer'} as F]:[]),
   ...(d.shape==='L'||d.shape==='U'?[{k:'num',label:'ความหนาขาแนว X (mm)',path:'armX'} as F,{k:'num',label:'ความหนาขาแนว Y (mm)',path:'armY'} as F]:[]),
   {k:'num',label:'ความหนาฐาน (mm)',path:'thickness'},
   ...cover([['bottom','ด้านล่าง'],['top','ด้านบน'],['side','ด้านข้าง']]),
   {k:'head',label:'หล่อรวมกับพื้น'},{k:'chk',label:'ฐานหล่อเป็นเนื้อเดียวกับพื้น (ไม่แสดงเหล็กพื้น)',path:'slab.enabled'},
   ...(d.slab?.enabled?[{k:'num',label:'ความหนาพื้น (mm)',path:'slab.thickness'} as F,{k:'num',label:'เหล็กบนยื่นเข้าพื้น (mm)',path:'slab.extend'} as F]:[]),
   {k:'head',label:'งานดิน / Lean concrete'},{k:'num',label:'ความลึกขุด (mm)',path:'excavation.depth'},{k:'num',label:'ระยะเผื่อทำงานต่อด้าน (mm)',path:'excavation.workingSpace'},{k:'num',label:'ความลาดผนังหลุม (H:V)',path:'excavation.slope'},{k:'num',label:'Lean หนา (mm)',path:'lean.thickness'},{k:'num',label:'Lean ยื่นจากขอบต่อด้าน (mm)',path:'lean.projection'},
  ];
  case 'Column':return [{k:'sel',label:'รูปร่างหน้าตัด',path:'shape',opts:[['rect','สี่เหลี่ยม'],['circle','วงกลม']]},...(d.shape==='rect'?[{k:'num',label:'กว้าง X (mm)',path:'width'} as F,{k:'num',label:'ลึก Y (mm)',path:'depth'} as F]:[{k:'num',label:'เส้นผ่านศูนย์กลาง (mm)',path:'diameter'} as F]),{k:'num',label:'ความสูงเสา (mm)',path:'height'},...cover([['side','รอบหน้าตัด']])];
  case 'Beam':return [{k:'num',label:'กว้าง b (mm)',path:'width'},{k:'num',label:'ลึก h (mm)',path:'depth'},{k:'num',label:'ความยาวคาน (mm)',path:'length'},...cover([['top','ด้านบน'],['bottom','ด้านล่าง'],['side','ด้านข้าง/ปลาย']])];
  case 'Slab':return [{k:'num',label:'ยาว X (mm)',path:'lengthX'},{k:'num',label:'กว้าง Y (mm)',path:'lengthY'},{k:'num',label:'ความหนาพื้น (mm)',path:'thickness'},...cover([['top','ด้านบน'],['bottom','ด้านล่าง'],['edge','ขอบพื้น']])];
  case 'Wall':return [{k:'num',label:'ความยาวผนัง (mm)',path:'length'},{k:'num',label:'ความหนาผนัง (mm)',path:'thickness'},{k:'num',label:'ความสูงผนัง (mm)',path:'height'},...cover([['face','ผิวผนัง'],['edge','ขอบ/บน-ล่าง']])];
 }
}
const detailingFields=():F[]=>[
 {k:'text',label:'เกรดเหล็กหลัก',path:'detailing.mainGrade',max:40},{k:'text',label:'เกรดเหล็กปลอก',path:'detailing.tieGrade',max:40},
 {k:'num',label:'รัศมีดัดใน Ø ≤ 16 (×d)',path:'detailing.bendSmall'},{k:'num',label:'รัศมีดัดใน Ø ≥ 20 (×d)',path:'detailing.bendLarge'},{k:'num',label:'รัศมีดัดในปลอก (×d)',path:'detailing.tieBend'},
 {k:'num',label:'ขอ 90° / ปลอกงอฉาก ส่วนตรงปลาย (×d)',path:'detailing.hook90'},{k:'num',label:'ขอปลอกวงกลม 135° ส่วนตรงปลาย (×d)',path:'detailing.hook135'},{k:'num',label:'ขอปลอกวงกลม 135° อย่างน้อย (mm)',path:'detailing.hook135Min'},
 {k:'num',label:'ระยะทาบ (×d)',path:'detailing.lap'},{k:'num',label:'ความยาวเหล็กเส้น (mm)',path:'detailing.stockLength'},
];
const SIMPLE_SHAPES=['straight','L','U','link'];
const barFields=(d:Bar):F[]=>{
 const simple=SIMPLE_SHAPES.includes(d.shape);
 return [
  {k:'text',label:'Mark',path:'mark',max:32},{k:'dia',label:'ขนาดเหล็ก',path:'diameter'},{k:'text',label:'เกรด',path:'grade',max:40},{k:'int',label:'จำนวนต่อชิ้น',path:'count',min:1,max:2000},
  ...(simple?[
   {k:'head',label:'รูปทรง / เหล็กงอขอ'} as F,
   {k:'sel',label:'รูปทรง',path:'shape',opts:[['straight','เหล็กตรง'],['L','งอขอปลายเดียว (L)'],['U','งอขอสองปลาย (U)'],['link','ปลอก (Link)']],after:(n:Bar)=>{if(n.lengthMethod!=='bs8666')return;const code=({straight:'00',L:'11',U:'21'} as Record<string,string>)[n.shape];if(code)n.shapeCode=code;else n.lengthMethod='centerline';}} as F,
   {k:'sel',label:'แนวเหล็ก',path:'axis',opts:[['X','X'],['Y','Y'],['Z','Z']]} as F,{k:'sel',label:'ตำแหน่งผิว',path:'face',opts:[['bottom','ล่าง'],['top','บน'],['side','ข้าง']]} as F,
   ...(d.shape!=='link'?[{k:'num',label:'ระยะร่นปลายต้น (mm)',path:'start'} as F,{k:'num',label:'ระยะร่นปลายท้าย (mm)',path:'end'} as F]:[]),
   ...(d.shape!=='straight'?[{k:'num',label:d.shape==='link'?'ขอปลอก (mm)':'ความยาวขอ / ขางอ (mm)',path:'tail'} as F]:[]),
   {k:'num',label:'รัศมีดัด (mm)',path:'radius'} as F,
   {k:'head',label:'การกระจายเหล็ก'} as F,{k:'num',label:'ตำแหน่งเริ่ม (mm, 0 = ตาม cover)',path:'distributionStart'} as F,{k:'num',label:'ตำแหน่งสิ้นสุด (mm, 0 = ตาม cover)',path:'distributionEnd'} as F,
  ]:[{k:'num',label:'รัศมีดัด (mm)',path:'radius'} as F]),
  {k:'head',label:'ความยาวตัด'},{k:'text',label:'Shape code',path:'shapeCode',max:40},{k:'num',label:'ยาวตัดกำหนดเอง (mm, 0 = คำนวณ)',path:'cutOverride'},{k:'text',label:'หมายเหตุ',path:'note',max:500},
 ];
};
function elementSummary(i:ElementInput){
 switch(i.category){
  case 'Foundation':return `${i.shape==='circle'?`Ø${i.diameter}`:`${i.width} × ${i.length}`} × ${i.thickness} mm · cover ${i.cover.bottom}/${i.cover.top}/${i.cover.side}`;
  case 'Column':return `${i.shape==='circle'?`Ø${i.diameter}`:`${i.width} × ${i.depth}`} · สูง ${i.height} mm · cover ${i.cover.side}`;
  case 'Beam':return `${i.width} × ${i.depth} · ยาว ${i.length} mm · cover ${i.cover.top}/${i.cover.bottom}/${i.cover.side}`;
  case 'Slab':return `${i.lengthX} × ${i.lengthY} · หนา ${i.thickness} mm · cover ${i.cover.top}/${i.cover.bottom}`;
  case 'Wall':return `ยาว ${i.length} · หนา ${i.thickness} · สูง ${i.height} mm · cover ${i.cover.face}`;
 }
}
const issues=(e:{issues:{path:PropertyKey[];message:string}[]})=>e.issues.map(i=>`${i.path.map(String).join('.')}: ${i.message}`).join('\n');

type Props={member:Member;input:ElementInput;manualBars:Bar[];preview?:Preview;error?:string;problems:string[];qty:number;spec:Spec;readOnly:boolean;onInput:(next:ElementInput)=>void;onManualBars:(bars:Bar[])=>void;onApply:()=>void;onClose:()=>void};

export function Element3DModal({member,input,manualBars,preview,error,problems,qty,spec,readOnly,onInput,onManualBars,onApply,onClose}:Props){
 const [selected,setSelected]=useState('');
 const [menu,setMenu]=useState<Menu|null>(null);
 const [editing,setEditing]=useState<Editing|null>(null);
 const defs=useMemo(()=>layerDefs(input),[input]);
 const rows=preview?.q.rows||[];
 const keyOf=useMemo(()=>(barId:string)=>{if(!barId.startsWith('gen-'))return `manual:${barId}`;const role=barId.slice(4);return defs.find(d=>d.match(role))?.key||'other';},[defs]);
 const items=useMemo<Item[]>(()=>{
  const byKey=new Map<string,Row[]>();for(const r of rows){const k=keyOf(r.id);byKey.set(k,[...(byKey.get(k)||[]),r]);}
  const list:Omit<Item,'color'>[]=[{key:'element',label:`${labels[member.category]} (คอนกรีต)`,sub:elementSummary(input),rows:[],editable:true,removable:false}];
  for(const d of defs)if(d.present)list.push({key:d.key,label:d.label,sub:d.key==='pile'&&input.category==='Foundation'?`${pileTypeLabels[input.pile.type]} ${input.pile.size} mm · ${pilePositions(input).length} ต้น · ยาว ${input.pile.length} m`:'',rows:byKey.get(d.key)||[],editable:true,removable:!!d.remove});
  if(byKey.has('other'))list.push({key:'other',label:'เหล็กอื่น (สร้างอัตโนมัติ)',sub:'',rows:byKey.get('other')!,editable:false,removable:false});
  for(const b of manualBars)list.push({key:`manual:${b.id}`,label:`${b.mark} · เพิ่มเอง`,sub:b.note,rows:byKey.get(`manual:${b.id}`)||[],editable:true,removable:true});
  list.push({key:'detailing',label:'มาตรฐานงอขอ / ระยะทาบ',sub:`ขอ 90° = ${input.detailing.hook90}d · ปลอก 135° = ${input.detailing.hook135}d ≥ ${input.detailing.hook135Min} · ทาบ ${input.detailing.lap}d`,rows:[],editable:true,removable:false});
  let n=0;return list.map(it=>({...it,color:it.key==='element'||it.key==='detailing'?0xc8d2d1:it.key==='pile'?0x8f9ca1:PALETTE[n++%PALETTE.length]}));
 },[rows,keyOf,defs,input,manualBars,member.category]);
 const colorOf=useMemo(()=>{const map=new Map(items.map(i=>[i.key,i.color]));return (k:string)=>map.get(k)??0x5a6b73;},[items]);
 const itemOf=(k:string)=>items.find(i=>i.key===k);

 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;e.stopPropagation();if(menu)setMenu(null);else if(editing)setEditing(null);else onClose();};
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 },[menu,editing,onClose]);

 const rowsInfo=(list:Row[])=>list.length?<table className="e3d-rows"><thead><tr><th>Mark</th><th>Ø</th><th className="num">ต่อชิ้น</th><th className="num">ยาวตัด</th><th className="num">kg</th></tr></thead><tbody>{list.map(r=><tr key={r.id}><td>{r.mark}</td><td>{r.diameter<=9?'RB':'DB'}{r.diameter}</td><td className="num">{r.count}</td><td className="num">{number(r.cutLength,0)}</td><td className="num">{number(r.weight,2)}</td></tr>)}</tbody></table>:null;
 const commitInput=(d:any)=>{
  const parsed=elementInputSchema.safeParse(d);
  if(!parsed.success){alert(issues(parsed.error));return false;}
  const missing=elementInputProblems(parsed.data);
  if(missing.length&&!confirm(`ข้อมูลยังต้องตรวจ ${missing.length} รายการ:\n${missing.slice(0,8).join('\n')}\n\nอัปเดตต่อหรือไม่?`))return false;
  onInput(parsed.data);return true;
 };
 const checkInput=(d:any)=>{const r=elementInputSchema.safeParse(d);return r.success?elementInputProblems(r.data):[issues(r.error)];};
 const genNote='แก้ค่าตั้งต้นของชุดเหล็ก · หลังกด OK ระบบสร้าง Mark / ยาวตัดใหม่ และคำนวณ BOQ ใหม่';
 const openInputEdit=(key:string,draft:any=structuredClone(input),title?:string)=>{
  if(key==='element')return setEditing({title:title||`ขนาด${labels[member.category]} · ${member.code}`,draft,fields:elementFields,check:checkInput,commit:commitInput,note:'ขนาดคอนกรีตและ cover · เหล็กทุกชุดจะถูกจัดตำแหน่งใหม่ตามขนาดที่แก้'});
  if(key==='detailing')return setEditing({title:title||'มาตรฐานงอขอ / ระยะทาบ',draft,fields:detailingFields,check:checkInput,commit:commitInput,note:'ใช้กับเหล็กงอขอและปลอกที่สร้างอัตโนมัติทุกชุดของสมาชิกนี้'});
  const def=layerDefs(draft).find(d=>d.key===key);if(!def)return;
  setEditing({title:title||`${def.label} · ${member.code}`,draft,fields:def.fields,check:checkInput,commit:d=>{const ok=commitInput(d);if(ok)setSelected(key);return ok;},note:key==='pile'?'เสาเข็มคิดปริมาณงานเข็ม / ตัดหัวเข็ม และหักคอนกรีตหัวเข็มที่ฝังในฐาน':genNote,info:rowsInfo(itemOf(key)?.rows||[])});
 };
 const commitBar=(isNew:boolean)=>(d:Bar)=>{
  const v=barSchema.safeParse(d);if(!v.success){alert(issues(v.error));return false;}
  if(manualBars.some(b=>b.id!==d.id&&b.mark===v.data.mark)){alert(`Mark ${v.data.mark} ซ้ำกับชุดเหล็กอื่น`);return false;}
  const old=manualBars.find(b=>b.id===d.id),geo=(b:Bar)=>JSON.stringify([b.shape,b.axis,b.face,b.start,b.end,b.tail,b.radius,b.distributionStart,b.distributionEnd,b.diameter,b.count]);
  const bar=old&&geo(old)!==geo(v.data)?{...v.data,placementConfirmed:false,bsDimensionsConfirmed:false}:v.data;
  onManualBars(isNew?[...manualBars,bar]:manualBars.map(b=>b.id===bar.id?bar:b));setSelected(`manual:${bar.id}`);return true;
 };
 const openBarEdit=(bar:Bar,isNew=false)=>setEditing({title:isNew?`เพิ่มชุดเหล็กเอง · ${member.code}`:`ชุดเหล็ก ${bar.mark} · ${member.code}`,draft:structuredClone(bar),fields:barFields,commit:commitBar(isNew),note:SIMPLE_SHAPES.includes(bar.shape)?'เหล็กตรง / งอขอ L / U วางตามแนวเหล็กและผิวที่เลือก ห่างจากผิวตาม cover ของสมาชิก':'รูปทรงพิเศษ · แก้พิกัดหรือรูปทรงในแท็บ “แบบ & BBS”',info:rowsInfo(itemOf(`manual:${bar.id}`)?.rows||[])});
 const openEdit=(key:string)=>{
  if(!key||key==='other')return;
  if(key.startsWith('manual:')){const b=manualBars.find(x=>`manual:${x.id}`===key);if(b)openBarEdit(b);return;}
  openInputEdit(key);
 };
 const remove=(key:string)=>{
  if(readOnly)return;
  if(key.startsWith('manual:')){const b=manualBars.find(x=>`manual:${x.id}`===key);if(b&&confirm(`ลบชุดเหล็ก ${b.mark}?`)){onManualBars(manualBars.filter(x=>x.id!==b.id));setSelected('');}return;}
  const def=defs.find(d=>d.key===key);if(!def?.remove||!confirm(`${def.removeLabel}?`))return;
  const draft=structuredClone(input);def.remove(draft);if(commitInput(draft))setSelected('');
 };
 const newBar=()=>{
  const used=new Set([...manualBars.map(b=>b.mark),...rows.map(r=>r.mark)]);let n=0,mark='';do{n++;mark=`M${String(n).padStart(2,'0')}`;}while(used.has(mark));
  openBarEdit({...blankBar(mark),diameter:12,count:2,grade:input.detailing.mainGrade,...(bsEnabled(spec)?{shapeCode:'00',lengthMethod:'bs8666' as const}:{})},true);
 };
 const adders:[string,()=>void][]=[...defs.filter(d=>!d.present&&d.adds).flatMap(d=>d.adds!.map(([label,apply])=>[label,()=>{const draft=structuredClone(input);apply(draft);openInputEdit(d.key,draft,label);}] as [string,()=>void])),['เพิ่มชุดเหล็กเอง (กำหนดเอง)…',newBar]];
 const sel=itemOf(selected);
 const openMenu=(key:string,x:number,y:number)=>setMenu({key,x:Math.max(8,Math.min(x,innerWidth-270)),y:Math.max(8,Math.min(y,innerHeight-60-36*(adders.length+3)))});

 return createPortal(<div className="e3d-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section className="e3d-modal" role="dialog" aria-modal="true" aria-label={`3D Modal ${member.code}`}>
   <header className="e3d-header"><div><div className="eyebrow">3D MODAL · INTERACTIVE</div><h2>{member.code} · {labels[member.category]}</h2><p className="muted">ลากเพื่อหมุน · ล้อเมาส์ซูม · คลิกขวาลากเพื่อเลื่อน · คลิกเลือกรายการ · คลิกขวา → Edit เพื่อแก้ไข</p></div>
    <div className="actions"><button className="primary" disabled={readOnly||!preview||preview.errors.length>0} onClick={onApply} title="นำข้อมูลไปใช้กับสมาชิกและสร้าง Bar cut list (ยังต้องกดบันทึกสมาชิก)">ใช้ข้อมูลและสร้าง Bar cut list</button><button className="e3d-close" onClick={onClose} aria-label="ปิด 3D Modal">×</button></div></header>
   <div className="e3d-body">
    <div className="e3d-stage">
     {preview?<Viewer member={preview.member} rows={rows} input={input} keyOf={keyOf} colorOf={colorOf} labelOf={k=>itemOf(k)?.label||k} selected={selected} onPick={setSelected} onMenu={openMenu}/>
      :<div className="e3d-empty"><b>ยังแสดงโมเดล 3D ไม่ได้</b>{error&&<p>{error}</p>}{problems.length>0&&<p>ข้อมูลที่ยังขาด ({problems.length}): {problems.slice(0,6).join(' · ')}</p>}<button disabled={readOnly} onClick={()=>openEdit('element')}><Pencil size={14}/>แก้ขนาด{labels[member.category]}</button></div>}
     <div className="e3d-selbar">{sel?<><span className="swatch" style={{background:hex(sel.color)}}/><b>{sel.label}</b><button disabled={!sel.editable} onClick={()=>openEdit(sel.key)}><Pencil size={13}/>{readOnly?'ดูรายละเอียด':'Edit'}</button><button disabled={readOnly||!sel.removable} onClick={()=>remove(sel.key)}><Trash2 size={13}/>ลบ</button></>:<span className="muted">ยังไม่ได้เลือกรายการ</span>}<button disabled={readOnly} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();openMenu('',r.left,r.top-8-36*adders.length);}}><Plus size={13}/>เพิ่มเหล็ก</button></div>
    </div>
    <aside className="e3d-side">
     {preview&&<div className="e3d-kpis">{[['คอนกรีต',preview.q.concrete,'m³'],['แบบหล่อ',preview.q.formwork,'m²'],['เหล็กรวม',preview.q.rebar,'kg']].map(([l,v,u])=><div key={l as string}><small>{l}</small><strong>{number((v as number)*qty,u==='kg'?2:3)} <em>{u}</em></strong><span>ต่อชิ้น {number(v as number,u==='kg'?2:3)} × {qty}</span></div>)}</div>}
     <h3>รายการ <small className="muted">· คลิกขวาที่รายการหรือในโมเดลเพื่อ Edit</small></h3>
     <ul className="e3d-items">{items.map(it=><li key={it.key} className={selected===it.key?'active':''} tabIndex={0} onClick={()=>setSelected(it.key)} onDoubleClick={()=>openEdit(it.key)} onKeyDown={e=>{if(e.key==='Enter')openEdit(it.key);}} onContextMenu={e=>{e.preventDefault();setSelected(it.key);openMenu(it.key,e.clientX,e.clientY);}}>
      <div className="e3d-item-head"><span className="swatch" style={{background:hex(it.color)}}/><b>{it.label}</b>{it.rows.length>0&&<small>{number(it.rows.reduce((n,r)=>n+r.weight,0),2)} kg</small>}</div>
      {it.sub&&<small className="block muted">{it.sub}</small>}
      {it.rows.map(r=><small key={r.id} className="block e3d-row-line">{r.mark} · {r.diameter<=9?'RB':'DB'}{r.diameter} × {r.count} · ยาวตัด {number(r.cutLength,0)} mm{r.shapeCode?` · ${r.shapeCode}`:''}</small>)}
     </li>)}</ul>
     {preview&&preview.warnings.length>0&&<div className="notice warning">{preview.warnings.join('\n')}</div>}
     {preview&&preview.errors.length>0&&<div className="notice danger">{preview.errors.slice(0,6).join('\n')}</div>}
     <p className="muted">การแก้ไขใน 3D Modal อัปเดตฟอร์มและผลคำนวณในแท็บ “ข้อมูลพื้นฐาน & เหล็กเสริม” ทันที · กด “ใช้ข้อมูลและสร้าง Bar cut list” แล้วบันทึกสมาชิก</p>
    </aside>
   </div>
  </section>
  {menu&&<div className="e3d-menu-backdrop" onMouseDown={()=>setMenu(null)} onContextMenu={e=>{e.preventDefault();setMenu(null);}}>
   <div className="e3d-menu" style={{left:menu.x,top:menu.y}} onMouseDown={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()}>
    {menu.key&&itemOf(menu.key)&&<div className="e3d-menu-title">{itemOf(menu.key)!.label}</div>}
    {menu.key&&itemOf(menu.key)?.editable&&<button onClick={()=>{setMenu(null);openEdit(menu.key);}}><Pencil size={13}/>{readOnly?'ดูรายละเอียด…':'Edit (แก้ไข)…'}</button>}
    {menu.key&&itemOf(menu.key)?.removable&&<button className="danger-text" disabled={readOnly} onClick={()=>{setMenu(null);remove(menu.key);}}><Trash2 size={13}/>ลบ</button>}
    {!readOnly&&<>{menu.key&&<div className="e3d-menu-sep"/>}{adders.map(([label,run])=><button key={label} onClick={()=>{setMenu(null);run();}}><Plus size={13}/>{label}</button>)}</>}
   </div>
  </div>}
  {editing&&<EditDialog editing={editing} readOnly={readOnly} onClose={()=>setEditing(null)}/>}
 </div>,document.body);
}

function EditDialog({editing,readOnly,onClose}:{editing:Editing;readOnly:boolean;onClose:()=>void}){
 const [draft,setDraft]=useState(editing.draft);
 const live=editing.check?.(draft)||[];
 const put=(f:F,value:unknown)=>{const next=structuredClone(draft);setP(next,f.path!,value);f.after?.(next);setDraft(next);};
 const field=(f:F)=>{
  if(f.k==='head')return <h4 key={`h:${f.label}`} className="e3d-head">{f.label}</h4>;
  const v=getP(draft,f.path!),key=f.path!;
  switch(f.k){
   case 'chk':return <label key={key} className="check e3d-check"><input type="checkbox" checked={!!v} onChange={e=>put(f,e.target.checked)}/>{f.label}</label>;
   case 'dia':return <label key={key} className="field"><span>{f.label}</span><select value={v} onChange={e=>put(f,Number(e.target.value))}>{[...new Set([...DIAS,v])].sort((a,b)=>a-b).map(x=><option key={x} value={x}>{x<=9?'RB':'DB'}{x}</option>)}</select></label>;
   case 'sel':return <label key={key} className="field"><span>{f.label}</span><select value={String(v)} onChange={e=>put(f,typeof f.opts![0][0]==='number'?Number(e.target.value):e.target.value)}>{f.opts!.map(([o,t])=><option key={String(o)} value={String(o)}>{t}</option>)}</select></label>;
   case 'text':return <Field key={key} label={f.label} value={v??''} onChange={x=>put(f,String(x).slice(0,f.max??500))}/>;
   case 'int':return <Field key={key} label={f.label} type="number" value={v} onChange={x=>put(f,Math.min(f.max??1e9,Math.max(f.min??0,Math.trunc(Number(x)||0))))}/>;
   default:return <Field key={key} label={f.label} type="number" value={v} onChange={x=>put(f,f.signed?Number(x)||0:Math.max(0,Number(x)||0))}/>;
  }
 };
 return <div className="e3d-dialog-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <form className="e3d-dialog" role="dialog" aria-modal="true" aria-label={editing.title} onSubmit={e=>{e.preventDefault();if(!readOnly&&editing.commit(draft))onClose();}}>
   <header><div><div className="eyebrow">DETAIL</div><h3>{editing.title}</h3></div><button type="button" onClick={onClose} aria-label="ปิด">×</button></header>
   {editing.note&&<p className="muted">{editing.note}</p>}
   <fieldset className="e3d-fields" disabled={readOnly}><div className="form-grid">{editing.fields(draft).map(field)}</div></fieldset>
   {editing.info&&<details className="e3d-info"><summary>รายการเหล็กปัจจุบัน (ก่อนแก้)</summary>{editing.info}</details>}
   {live.length>0&&<div className="notice warning"><b>ข้อมูลที่ต้องตรวจ ({live.length})</b>{'\n'}{live.slice(0,8).join('\n')}</div>}
   <footer className="actions"><button type="button" onClick={onClose}>{readOnly?'ปิด':'Cancel'}</button>{!readOnly&&<button className="primary" type="submit">OK</button>}</footer>
  </form>
 </div>;
}

class PolyCurve extends THREE.Curve<THREE.Vector3>{
 pts:THREE.Vector3[];
 constructor(pts:THREE.Vector3[]){super();this.pts=pts;}
 getPoint(t:number,target=new THREE.Vector3()){const p=this.pts,n=t*(p.length-1),i=Math.min(p.length-2,Math.floor(n));return target.copy(p[i]).lerp(p[i+1],n-i);}
}
const SELECT=0xe69432,HOVER=0x37b39a,BODY=0xc8d2d1;

const AXES:[string,number,[number,number,number]][]=[['X',0xd23c3c,[1,0,0]],['Y',0x2e9e4f,[0,0,-1]],['Z',0x2f6fb5,[0,1,0]]];
/** X / Y / Z arrows (red / green / blue) with labels; drawn on top of the model. */
function axisTriad(len:number){
 const g=new THREE.Group();
 for(const [name,color,dir] of AXES){
  const d=new THREE.Vector3(...dir),arrow=new THREE.ArrowHelper(d,new THREE.Vector3(),len,color,len*.22,len*.11);
  arrow.traverse(o=>{const m=(o as THREE.Mesh).material as THREE.Material|undefined;if(m){m.depthTest=false;m.transparent=true;}o.renderOrder=10;});g.add(arrow);
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d')!;x.font='bold 44px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle=`#${color.toString(16).padStart(6,'0')}`;x.fillText(name,32,34);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true}));s.scale.setScalar(len*.32);s.position.copy(d.multiplyScalar(len*1.2));s.renderOrder=11;g.add(s);
 }
 return g;
}

function Viewer({member,rows,input,keyOf,colorOf,labelOf,selected,onPick,onMenu}:{member:Member;rows:Row[];input:ElementInput;keyOf:(id:string)=>string;colorOf:(k:string)=>number;labelOf:(k:string)=>string;selected:string;onPick:(k:string)=>void;onMenu:(k:string,x:number,y:number)=>void}){
 const host=useRef<HTMLDivElement>(null),api=useRef<{view:(a:string)=>void;paint:(sel:string,hov:string)=>void}|null>(null),cam=useRef<{pos:THREE.Vector3;target:THREE.Vector3}|null>(null);
 const [hover,setHover]=useState(''),[error,setError]=useState('');
 const cb=useRef({onPick,onMenu,selected,hover});cb.current={onPick,onMenu,selected,hover};
 useEffect(()=>{
  const el=host.current;if(!el)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setError('เครื่องนี้เปิด WebGL ไม่ได้');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));el.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#f4f7f6');
  scene.add(new THREE.AmbientLight(0xffffff,1.6));const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(4,8,5);scene.add(sun);
  const P=(p:readonly number[])=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
  const vb=placementViewBounds(member),center=P(vb.min.map((n,i)=>(n+vb.max[i])/2)),extent=Math.max(...vb.size)/1000||1;
  const camera=new THREE.PerspectiveCamera(38,1,.01,1000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  const view=(a:string)=>{const v=a==='X'?new THREE.Vector3(1,0,0):a==='Y'?new THREE.Vector3(0,0,-1):a==='Z'?new THREE.Vector3(.0001,1,0):new THREE.Vector3(1,.8,1);controls.target.copy(center);camera.position.copy(center).add(v.normalize().multiplyScalar(extent*2.3));controls.update();};
  if(cam.current){camera.position.copy(cam.current.pos);controls.target.copy(cam.current.target);controls.update();}else view('ISO');
  const verts:number[]=[];for(const s of solidQuantities(member).surfaces)for(const t of surfaceTriangles(s))for(const p of t)verts.push(p[0]/1000,p[2]/1000,-p[1]/1000);
  const bodyGeo=new THREE.BufferGeometry();bodyGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));bodyGeo.computeVertexNormals();
  const bodyMat=new THREE.MeshBasicMaterial({color:BODY,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}),body=new THREE.Mesh(bodyGeo,bodyMat);scene.add(body);
  const edgeMat=new THREE.LineBasicMaterial({color:0x8fa3a8});scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo),edgeMat));
  const mats=new Map<string,THREE.MeshLambertMaterial>(),mat=(k:string)=>{let m=mats.get(k);if(!m){m=new THREE.MeshLambertMaterial({color:colorOf(k),...(k==='pile'?{transparent:true,opacity:.55}:{})});mats.set(k,m);}return m;};
  const pickables:THREE.Mesh[]=[];
  for(const r of rows){const k=keyOf(r.id);for(const path of r.paths){const pts=path.map(P);if(pts.length<2)continue;const mesh=new THREE.Mesh(new THREE.TubeGeometry(new PolyCurve(pts),Math.max(2,(pts.length-1)*2),Math.max(r.diameter,4)/2000,6,false),mat(k));mesh.userData.key=k;scene.add(mesh);pickables.push(mesh);}}
  if(input.category==='Foundation'&&input.foundationType==='pile'){
   const pl=input.pile,len=Math.min(Math.max(pl.length*1000-pl.cutoff,500),2500),square=pl.type==='square'||pl.type==='I';
   for(const [x,y] of pilePositions(input)){const g=square?new THREE.BoxGeometry(pl.size/1000,len/1000,pl.size/1000):new THREE.CylinderGeometry(pl.size/2000,pl.size/2000,len/1000,28);const mesh=new THREE.Mesh(g,mat('pile'));mesh.position.copy(P([x,y,pl.embed-len/2]));mesh.userData.key='pile';scene.add(mesh);pickables.push(mesh);}
  }
  // Axis triads (model X → three x, model Y → three −z, model Z → three y): one at the member origin, one as a corner gizmo
  const origin=axisTriad(extent*.2);origin.position.copy(P([0,0,0]));scene.add(origin);
  const gScene=new THREE.Scene(),gCamera=new THREE.OrthographicCamera(-1.7,1.7,1.7,-1.7,.1,10);gScene.add(axisTriad(1.1));
  const paint=(sel:string,hov:string)=>{
   for(const [k,m] of mats){m.color.setHex(k===sel?SELECT:k===hov?HOVER:colorOf(k));m.emissive.setHex(k===sel?0x4a2a00:0);}
   bodyMat.color.setHex(sel==='element'?0xf0b46a:hov==='element'?0xa9d8cc:BODY);bodyMat.opacity=sel==='element'?.34:hov==='element'?.24:.18;edgeMat.color.setHex(sel==='element'?0xd4802a:0x8fa3a8);
  };
  api.current={view,paint};paint(cb.current.selected,cb.current.hover);
  const ray=new THREE.Raycaster(),pick=(e:MouseEvent)=>{const b=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),camera);const hit=ray.intersectObjects(pickables,false)[0];return hit?String(hit.object.userData.key):ray.intersectObject(body,false).length?'element':'';};
  let down={x:0,y:0},hovered='',frameHover=0;
  const still=(e:MouseEvent)=>Math.hypot(e.clientX-down.x,e.clientY-down.y)<5;
  const onDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
  const onClick=(e:MouseEvent)=>{if(still(e))cb.current.onPick(pick(e));};
  const onContext=(e:MouseEvent)=>{e.preventDefault();if(!still(e))return;const k=pick(e);cb.current.onPick(k);cb.current.onMenu(k,e.clientX,e.clientY);};
  const onMove=(e:PointerEvent)=>{if(e.buttons||frameHover)return;frameHover=requestAnimationFrame(()=>{frameHover=0;const k=pick(e);if(k!==hovered){hovered=k;setHover(k);renderer.domElement.style.cursor=k?'pointer':'grab';}});};
  const onLeave=()=>{hovered='';setHover('');};
  const c=renderer.domElement;c.addEventListener('pointerdown',onDown);c.addEventListener('click',onClick);c.addEventListener('contextmenu',onContext);c.addEventListener('pointermove',onMove);c.addEventListener('pointerleave',onLeave);
  const resize=()=>{const w=el.clientWidth||600,h=el.clientHeight||480;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(el);resize();
  renderer.autoClear=false;
  const GIZMO=104,size=new THREE.Vector2();
  let frame=0;const render=()=>{
   controls.update();renderer.getSize(size);renderer.setViewport(0,0,size.x,size.y);renderer.setScissorTest(false);renderer.clear();renderer.render(scene,camera);
   // corner gizmo follows the view direction of the main camera
   gCamera.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(4);gCamera.up.copy(camera.up);gCamera.lookAt(0,0,0);
   renderer.setScissorTest(true);renderer.setViewport(8,8,GIZMO,GIZMO);renderer.setScissor(8,8,GIZMO,GIZMO);renderer.clearDepth();renderer.render(gScene,gCamera);renderer.setScissorTest(false);
   frame=requestAnimationFrame(render);};render();
  return ()=>{
   cam.current={pos:camera.position.clone(),target:controls.target.clone()};
   cancelAnimationFrame(frame);cancelAnimationFrame(frameHover);ro.disconnect();controls.dispose();
   c.removeEventListener('pointerdown',onDown);c.removeEventListener('click',onClick);c.removeEventListener('contextmenu',onContext);c.removeEventListener('pointermove',onMove);c.removeEventListener('pointerleave',onLeave);
   for(const s of [scene,gScene])s.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Sprite){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{(m as THREE.SpriteMaterial).map?.dispose();m.dispose();});}});
   renderer.dispose();c.remove();api.current=null;
  };
 },[member,rows,input,keyOf,colorOf]);
 useEffect(()=>{api.current?.paint(selected,hover);},[selected,hover]);
 const hoverLabel=hover&&hover!==selected?hover:'';
 return <div className="e3d-viewer">
  <div className="e3d-tools">{['ISO','X','Y','Z'].map(a=><button key={a} onClick={()=>api.current?.view(a)}>{a}</button>)}<button onClick={()=>{cam.current=null;api.current?.view('ISO');}} title="จัดมุมมองให้พอดี"><Maximize2 size={13}/></button></div>
  {hoverLabel&&<div className="e3d-hover">{labelOf(hoverLabel)} · คลิกขวาเพื่อ Edit</div>}
  {error&&<p className="notice">{error}</p>}
  <div ref={host} className="e3d-canvas"/>
 </div>;
}
