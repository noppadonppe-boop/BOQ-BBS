import type {BSDimension} from './bs8666';
import type {Vec3} from './model';
export function drawingDimensionText(row:{shapeCode:string;standard:{dimensions:BSDimension[]}},virtual:Vec3[]){
 const number=(n:number)=>Number(n.toFixed(3)).toString(),dimensions=row.standard.dimensions;
 if(dimensions.length)return `${row.shapeCode} / ${dimensions.map(d=>`${d.free?'('+d.label+')':d.label} ${number(d.value)}${d.unit==='turns'?' turns':''}`).join('; ')}`;
 const legs=virtual.slice(1).map((p,i)=>Math.hypot(...p.map((v,j)=>v-virtual[i][j])));
 return `${row.shapeCode||'Pending'} / virtual legs: ${legs.map(number).join(', ')} (reference)`;
}
export function drawingCutBasisText(rows:{lengthBasis:string}[],status:string){
 const kind=(basis:string)=>basis==='Manual override'?'Manual override / review required':basis.startsWith('BS 8666:2000')?basis.includes('exact')?'BS8666 exact centreline branch':basis.includes('approximate')?'BS8666 approximate Table1 branch':'BS8666 Table1 shape equations':basis.includes('fallback')?'Geometric fallback / BS pending':'Geometric centreline';
 const bases=[...new Set(rows.map(r=>kind(r.lengthBasis)))];
 return `Cut basis: ${bases.join(' + ')||'No rebar rows'}; captured cut after configured rounding. ${status==='Issued'?'Reprint under the recorded issue reference.':status==='Superseded'?'Historical reference only.':'Engineering/ACI release review required.'}`;
}
