import {blankMember,blankBar,currentStarterSpec,type Vec3} from '../src/domain/model';
import {BAR_PLACEMENT_POLICY} from '../src/domain/barPlacement';
import {CODE99_REVIEW_POLICY} from '../src/domain/code99ReviewSchema';
import {buildPlanarPath} from '../src/domain/planarPathBuilder';
export const reviewSpec={...currentStarterSpec,barPlacementPolicy:BAR_PLACEMENT_POLICY,code99ReviewPolicy:CODE99_REVIEW_POLICY};
export function reviewMembers(){return ['PLANAR','SPATIAL'].map(kind=>{const m={...blankMember('Custom','CODE99-'+kind+'-REVIEW'),x:2000,y:2000,z:1000,description:'Synthetic software acceptance workflow QA only / not construction approval'};
 const b=buildPlanarPath(m,{...blankBar(kind==='PLANAR'?'R1':'R2'),diameter:12,count:1},reviewSpec,{version:1,plane:'XY',basis:'outside',startAngle:0,outsideDiameter:12,innerRadius:24,reference:'Synthetic400/600/400 reference / not construction approval',legs:[{length:400,turn:0},{length:600,turn:90},{length:400,turn:-90}]},[200,200,300],300);
 m.bars=[{...b,grade:'BS460 QA',bsType:'T',freeDimensionLeg:3,...(kind==='SPATIAL'?{pathInput:undefined,points:[[0,0,0],[394,0,0],[394,288,0],[394,288,294]] as Vec3[]}:{})}];return m;});}
