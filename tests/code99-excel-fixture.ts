import {blankMember,blankBar,currentStarterSpec,type Member,type Vec3} from '../src/domain/model';
import {BAR_PLACEMENT_POLICY} from '../src/domain/barPlacement';
import {buildPlanarPath} from '../src/domain/planarPathBuilder';
const spec={...currentStarterSpec,barPlacementPolicy:BAR_PLACEMENT_POLICY};
export function code99ExcelMembers():Member[]{
 return ['REGULAR','ACUTE','CHAIN','SPATIAL'].map(kind=>{
  const m={...blankMember('Custom','CODE99-'+kind+'-QA'),x:5000,y:5000,z:1000,description:'Synthetic geometry/printing QA only; no engineering or construction approval'};
  m.occurrences[0]={...m.occurrences[0],zone:'Synthetic QA',floor:'TEST',quantity:kind==='REGULAR'?2:1};
  const legs=kind==='CHAIN'?Array.from({length:8},(_,i)=>({length:400+i*30,turn:i?(i%2?135:-135):0})):kind==='ACUTE'?[{length:500,turn:0},{length:400,turn:135}]:[{length:300,turn:0},{length:450,turn:90},{length:350,turn:-90}];
  const input={version:1 as const,plane:'XY' as const,basis:kind==='CHAIN'?'support' as const:kind==='ACUTE'?'virtual' as const:'outside' as const,startAngle:0,outsideDiameter:12,innerRadius:24,reference:kind==='CHAIN'?'W'.repeat(500):'Synthetic input: no source convention, material or engineering approval',legs};
  let b=buildPlanarPath(m,{...blankBar(kind==='REGULAR'?'RG':kind==='ACUTE'?'AC':kind==='CHAIN'?'CH':'SP'),diameter:12,count:1},spec,input,[1600,700,300],300);
  if(kind==='SPATIAL')b={...b,pathInput:undefined,points:[[0,0,0],[400,0,0],[400,300,0],[400,300,300]] as Vec3[]};
  b.freeDimensionLeg=kind==='CHAIN'?8:2;m.bars=[b];return m;
 });
}
