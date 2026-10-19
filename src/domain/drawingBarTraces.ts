import type {Vec3} from './model';
import {axisIndex,type DrawingSection} from './drawingViews';
import {primaryBarTrace,sectionTrace} from './projection';
type DrawingRow={id:string;mark:string;diameter:number;paths:Vec3[][]};
// Every view contains the same physical Mark set. Pagination selects leaders
// and table rows only, so other reinforcement remains visible as context.
export function drawingBarTraces<T extends DrawingRow>(rows:T[],axes:[number,number],primary:boolean,cut:DrawingSection,offset:number,count:number){
 const selected=new Map(rows.slice(offset,offset+count).map((row,i)=>[row.id,i]));
 return rows.map(row=>{const traces=primary?undefined:row.paths.map(path=>sectionTrace(path,cut.position,row.diameter,axisIndex(cut.axis))),plan=primary?primaryBarTrace(row.paths,axes):undefined;
  const lines=plan?.lines||traces!.flatMap(t=>t.lines),dots=plan?.points||traces!.flatMap(t=>t.points),anchor=dots[0]||lines[0]?.[Math.floor(lines[0].length/2)];
  return {row,lines,dots,anchor,slot:selected.get(row.id)};
 }).sort((a,b)=>Number(a.slot!==undefined)-Number(b.slot!==undefined));
}
