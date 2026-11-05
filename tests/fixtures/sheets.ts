// Sheet fixtures for the drawing / DXF tests (self-contained: tmp/ is not versioned).
// footing = pile cap, 2 pour stages, pedestal (+ split layout variant); column = 3-storey stack with couplers;
// beam = 4-span beam group from a beam template; custom = tagged shape-model assembly (sheet sets per Tag); steel = FS-AS-C21.
import {blankMember,currentStarterSpec,defaultSpec,type Member,type Project,type Spec} from '../../src/domain/model';
import {applyElementInput,beamGroupFrom,columnStackFrom,defaultElementInput,newBeamGrid,newBeamSpan,newColumnStorey,type BeamInput,type ColumnInput,type FoundationInput} from '../../src/domain/elementInput';
import {takeoff} from '../../src/domain/engine';
import {sheetPageCount,type SheetData} from '../../src/domain/bbsSheet';
import {CONFIG_BEAM_RULES,lapTables} from '../../src/domain/designCodes';
import {applyBeamTemplate,beamTemplateFromSchedule} from '../../src/domain/beamTemplates';
import {tagSheetSets} from '../../src/domain/tagSheets';
import {applyShapeModel} from '../../src/domain/shapeApply';
import type {PartPurpose,ShapeModel,ShapePart} from '../../src/domain/shapeModelSchema';
import {applyPartPresets,defaultPartRebar,detailingFor,guessPurpose} from '../../src/domain/partRebar';
import {withAutoTags} from '../../src/domain/partTags';
import {applySteelInput,defaultSteelInput} from '../../src/domain/steelInput';

const spec:Spec={...currentStarterSpec,designCode:'ACI',rounding:25} as Spec;
const project=(code:string,extra:Record<string,unknown>={})=>({id:'p',code,name:'Fixture ทดสอบ 测试',location:'',owner:'',notes:'',acl:{},version:1,createdAt:'',spec,titleBlock:{company:'FORM',drawnBy:'',checkedBy:'',drawingPrefix:'',...extra}}) as unknown as Project;
const sheet=(m:Member,p:Project,input?:unknown):SheetData=>{const q=takeoff(m,spec);return {member:m,rows:q.rows as SheetData['rows'],input:input as SheetData['input'],project:p,quantity:2,takeoff:q,status:'DRAFT / NOT FOR CONSTRUCTION',revision:'D1',date:'2026-11-05',provisional:false};};

function footing(){
 const i=defaultElementInput('Foundation','manual',spec) as FoundationInput;
 i.foundationType='pile';i.width=3000;i.length=3000;i.thickness=1500;i.excavation.depth=2600;
 i.column.type='pedestal';i.column.width=600;i.column.depth=600;i.column.height=1000;i.column.columnNo='C1';
 i.pour={count:2,heights:[750],joints:[]};i.levels={...i.levels,enabled:true};
 return {m:applyElementInput(blankMember('Foundation','F1'),i,{rounding:25}).member,i};
}
function column(){
 let i=defaultElementInput('Column','manual',spec) as ColumnInput;i=columnStackFrom(i);
 const main={corner:{diameter:32,count:2},sideX:{diameter:32,count:6},sideY:{diameter:32,count:6},diameter:32,count:32,sideBundle:2};
 const tie={diameter:12,sets:5,pattern:'rectXY' as const,s1:200,s2:100};
 const s1={...newColumnStorey(i),name:'Footing–2nd',height:7000,beamDepth:1200,width:700,depth:700,main,tie};
 const s2={...newColumnStorey(i,s1,'2nd–Roof'),height:6000,beamDepth:1000};
 i={...i,stack:{...i.stack,storeys:[s1,s2]}} as ColumnInput;
 return {m:applyElementInput(blankMember('Column','C1a'),i,{rounding:25}).member,i};
}
function beam(){
 const t=beamTemplateFromSchedule({name:'2B3',width:600,depth:1000,sections:[
  {zone:'end',top:'7Y32+2Y32(EX)',stirrup:'Y16@100',legs:4,tie:'R9@600',side:'10Y25',bottom:'9Y32'},
  {zone:'mid',top:'7Y32',stirrup:'Y16@100',legs:4,tie:'R9@600',side:'10Y25',bottom:'9Y32'},
  {zone:'con',top:'7Y32+4Y32(EX)',stirrup:'Y16@100',legs:4,tie:'R9@600',side:'10Y25',bottom:'9Y32'}]});
 const base=beamGroupFrom(defaultElementInput('Beam') as BeamInput),s=newBeamSpan(base),L=[8000,8000,8000,8000];
 const i={...base,detailing:{...base.detailing,stockLength:12000,lapTable:lapTables['35-SD40'].map(r=>({bar:r.bar,length:r.ftlTension,top:r.ftlTop})),beam:{...CONFIG_BEAM_RULES,frame:'ordinary' as const}},
  spans:L.map(x=>applyBeamTemplate({...structuredClone(s),length:x},t)),grids:L.concat(0).map((_,k)=>newBeamGrid(String(k+1),800))} as BeamInput;
 return {m:applyElementInput({...blankMember('Beam','2B3'),version:1},i,{rounding:25}).member,i};
}
const box=(id:string,label:string,x:number,y:number,z0:number,w:number,d:number,h:number):ShapePart=>({id,label,role:'solid',stage:1,z0,height:h,formSides:true,formBottom:false,source:'',shape:'box',x,y,w,d});
function custom(){
 const det=detailingFor(spec),purposes:Record<string,PartPurpose>={p1:'footing',p2:'footing',p3:'wall',p4:'column',p5:'beam',p6:'slab'};
 const parts=[box('p1','ฐานล่าง',0,0,0,4000,3000,600),box('p2','ฐานบน (ขั้น)',800,500,600,2400,2000,500),box('p3','กำแพง',1000,1375,1100,2000,250,2500),
  box('p4','เสา',100,100,600,400,400,3000),box('p5','คาน',500,100,3100,3500,400,500),box('p6','พื้น',0,0,3600,4000,3000,200)].map(p=>({...p,rebar:defaultPartRebar(purposes[p.id],p,det)}));
 const sm:ShapeModel={version:1,parts,confirmed:true,note:''};
 const m=applyShapeModel({...blankMember('Custom','ASM-1'),cover:50,bars:[]},withAutoTags(sm,p=>guessPurpose(p,sm)));
 return applyPartPresets(m,spec).member;
}
export const steelMember=()=>{
 const c21=[['MP/94','H-150X150X7X10',3230,1,true],['BP/1001','PL15*250',250,1,false],['M/27','H-194X150X6X9',521,1,false],['M/95','H-148X100X6X9',2825,1,false],['PL/50','PL8*62',126,4,false]] as const;
 const i={...defaultSteelInput(),name:'Column C21',parts:c21.map(([mark,profile,length,count,main])=>({id:mark.replace('/','-'),mark,profile,grade:'SS400',count,length,main})),
  bolts:[{id:'b1',size:'M20',grade:'8.8',length:60,count:8,hole:22}],welds:[{id:'w1',type:'fillet' as const,size:4,length:500,count:4}]};
 return {member:applySteelInput({...blankMember('SteelAssembly' as Member['category'],'FS-AS-C21'),version:1},i),project:project('STL'),opts:{status:'DRAFT',date:'2026-11-05',revision:'D1'}};
};
export {defaultSpec};

/** Every sheet set of the fixtures: name → SheetData list (tag sheets expand into several sets). */
export function sheetFixtures():Record<string,SheetData[]>{
 const f=footing(),c=column(),b=beam(),cm=custom();
 return {
  footing:[sheet(f.m,project('J-001'),f.i)],
  footingSplit:[sheet(f.m,project('J-001',{sheetLayout:'split',viewsPerPage:0}),f.i)],
  column:[sheet(c.m,project('J-002'),c.i)],
  beam:[sheet(b.m,project('J-078'),b.i)],
  custom:tagSheetSets(sheet({...cm,drawingSetup:{number:'',revision:'',title:'',partSheets:'tag'}},project('J-003'))),
 };
}
export const pagesOf=(s:SheetData)=>Array.from({length:sheetPageCount(s)},(_,i)=>i);
