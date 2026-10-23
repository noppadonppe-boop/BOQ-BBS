import {categories,type Member,type Project} from './model';
import {composeDrawingNumber,drawingNumberKey,drawingRevText,type DrawingSetup} from './drawingStandard';
import {canonical} from './canonical';

/** Drawing setup with the number recomposed from the project prefix / suffix and the member run / rev. */
export function numberedSetup(p:Pick<Project,'code'|'titleBlock'>,s:DrawingSetup|undefined,run:number,rev=s?.rev??0):DrawingSetup{
 const number=composeDrawingNumber(p,run,rev);
 return {title:'',...s,run,rev,number,revision:drawingRevText(rev),numberKey:drawingNumberKey(number)};
}
export const nextDrawingRun=(members:Member[])=>Math.max(0,...members.map(m=>m.drawingSetup?.run||0))+1;

/** Members whose drawing setup changes: runs kept, members without a number get the next run (by category, code),
 * numbers recomposed for the current prefix / suffix. Manual numbers (no run) stay as typed. Throws on duplicates. */
export function planDrawingNumbers(p:Pick<Project,'code'|'titleBlock'>,members:Member[]){
 let next=nextDrawingRun(members);
 const order=[...members].sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category)||a.code.localeCompare(b.code,undefined,{numeric:true}));
 const final=new Map<string,DrawingSetup|undefined>(),changes:{member:Member;setup:DrawingSetup}[]=[];
 for(const m of order){
  const s=m.drawingSetup;
  if(s?.number&&!s.run){final.set(m.id,s);continue;}
  const setup=numberedSetup(p,s,s?.run||next++);
  final.set(m.id,setup);if(canonical(setup)!==canonical(s||null))changes.push({member:m,setup});
 }
 checkDrawingNumbers(members.map(m=>({...m,drawingSetup:final.get(m.id)})));
 return changes;
}
/** Run numbers and drawing numbers must be unique within the project. */
export function checkDrawingNumbers(members:Pick<Member,'code'|'drawingSetup'>[]){
 const runs=new Map<number,string>(),keys=new Map<string,string>();
 for(const m of members){const s=m.drawingSetup;if(!s)continue;
  if(s.run){if(runs.has(s.run))throw Error(`Run no. ${String(s.run).padStart(4,'0')} ซ้ำ: ${runs.get(s.run)} / ${m.code}`);runs.set(s.run,m.code);}
  const key=drawingNumberKey(s.number);if(key){if(keys.has(key))throw Error(`เลขแบบ BBS ซ้ำ: ${s.number} (${keys.get(key)} / ${m.code})`);keys.set(key,m.code);}}
}
