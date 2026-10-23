import type {Bar,Member} from './model';
import type {RebarNoteFace} from './shapeModelSchema';
import {shapeGeometry,multiArea} from './shapeGeometry';
import {loopBars,meshBars,verticalFaceBars} from './rebarSketch';

// Phase 3: drawing reinforcement notes → suggested bar sets. Notes are parsed by rules (no AI needed);
// AI-read notes (shape proposal) arrive with a meaning text that is only shown for review.
export type ParsedNote={text:string;diameter?:number;spacing?:number;count?:number;face?:'B'|'T'|'EF'|'NF'|'FF';loops:boolean;add:boolean;throughout:boolean;legD?:number};
/** Y32-150 (B) · DB16@200 · Y16-200 LOOPS · ADD Y20-150 · 4-DB20 · RB9@150 · 15d */
export function parseRebarNote(text:string):ParsedNote{
 const t=text.toUpperCase().replace(/\s+/g,' '),out:ParsedNote={text,loops:/LOOP/.test(t),add:/\bADD\b/.test(t),throughout:/THROUGH/.test(t)};
 const bar=t.match(/(?:(\d{1,3})\s*[-X×]\s*)?(?:Y|DB|RB|T|H|D|Ø|⌀)\s*(\d{1,2})(?:\s*(?:[-@]|C\/C|AT)\s*(\d{2,4}))?/);
 if(bar){out.diameter=Number(bar[2]);if(bar[3])out.spacing=Number(bar[3]);if(bar[1]&&!bar[3])out.count=Number(bar[1]);}
 const face=t.match(/\((B|T|EF|NF|FF|BOT|TOP|BTM)\)/)||t.match(/\b(BOTTOM|TOP|EACH FACE|E\.F\.)\b/);
 if(face){const f=face[1];out.face=/^(B|BOT|BTM|BOTTOM)$/.test(f)?'B':/^(T|TOP)$/.test(f)?'T':/EACH|EF|E\.F/.test(f)?'EF':f as ParsedNote['face'];}
 const leg=t.match(/(?:^|[^\w])(\d{1,2})\s*D\b/);if(leg&&!bar)out.legD=Number(leg[1]);
 return out;
}
export type NoteAction='bottom'|'top'|'loops'|'vertical'|'skip';
export type Suggestion={id:string;note:ParsedNote;action:NoteAction;diameter:number;spacing:number;dirs:('X'|'Y')[];leg:number;z:number;zTop:number;reason:string;manual?:string};
/** Main levels of a shape-model member: bottom of concrete and the top of the main body (largest plan areas). */
export function mainLevels(m:Member){
 const g=m.shapeModel?shapeGeometry(m.shapeModel):undefined;if(!g||!g.slabs.length)return {bottom:0,top:m.z};
 const areas=g.slabs.map(s=>multiArea(s.region)),max=Math.max(...areas);
 const top=Math.max(...g.slabs.filter((_,i)=>areas[i]>=.5*max).map(s=>s.z1));
 return {bottom:g.slabs[0].z0,top};
}
/** Placement read with the note (AI shape proposal): part, face and direction override the text rules. */
export type NoteHint={text:string;partId?:string;face?:RebarNoteFace;dir?:'X'|'Y'|'XY'|'V'};
const faceTag:Partial<Record<RebarNoteFace,string>>={B:'B',T:'T',EF:'EF'};
function withHint(p:ParsedNote,h?:NoteHint):ParsedNote{
 if(!h?.face)return p;
 if(h.face==='LOOP')return {...p,loops:true};
 if(h.face==='ADD')return {...p,add:true};
 if(h.face==='NOTE')return p.legD?p:{...p,diameter:undefined};
 return {...p,face:faceTag[h.face] as ParsedNote['face'],loops:false};
}
/** One suggestion per note (cover from the member; leg from a separate “15d” note when present). */
export function suggestFromNotes(m:Member,texts:string[],hints:NoteHint[]=[]):Suggestion[]{
 const hintOf=(t:string)=>hints.find(h=>h.text.trim()===t.trim());
 const parsed=texts.map(t=>withHint(parseRebarNote(t),hintOf(t))),legD=parsed.find(p=>p.legD)?.legD,main=mainLevels(m),c=m.cover;
 return parsed.map((p,i)=>{
  const h=hintOf(p.text),part=h?.partId?m.shapeModel?.parts.find(q=>q.id===h.partId&&q.role==='solid'):undefined;
  const bottom=part?part.z0:main.bottom,top=part?part.z0+part.height:main.top;
  const d=p.diameter||16,s=p.spacing||200,dirs:('X'|'Y')[]=h?.dir==='X'?['X']:h?.dir==='Y'?['Y']:['X','Y'];
  const base={id:`n${i}`,note:p,diameter:d,spacing:s,dirs,leg:0,z:bottom+c+d/2,zTop:top-c-d/2,reason:part?`${part.label} · `:''};
  const r=suggestOne(p,base,legD,top,c,d);return {...r,reason:`${base.reason}${r.reason}`};
 });
}
function suggestOne(p:ParsedNote,base:Omit<Suggestion,'action'>,legD:number|undefined,top:number,c:number,d:number):Suggestion{
 const bottom=base.z-c-d/2;
 if(p.legD&&!p.diameter)return {...base,action:'skip' as const,reason:`ระยะขางอ ${p.legD}d ใช้กับเหล็กล่าง/บน`};
 if(!p.diameter)return {...base,action:'skip' as const,reason:'อ่านขนาดเหล็กไม่ได้'};
 if(p.add)return {...base,action:'skip' as const,reason:'เหล็กเสริมเพิ่ม / ยื่นเข้าพื้น',manual:'วาดเองด้วยเครื่องมือวาดเหล็ก (ใช้พื้นที่อ้างอิงถ้ายื่นออกนอกคอนกรีต)'};
 if(p.loops)return {...base,action:'loops' as const,z:bottom+c+2*d+d/2,zTop:top-c-2*d-d/2,reason:'LOOPS = ปลอกแนวนอนรอบผิวข้าง'};
 if(p.face==='B')return {...base,action:'bottom' as const,leg:legD?legD*d:0,reason:`(B) = ตะแกรงล่าง${legD?` · ขางอขึ้น ${legD}d`:''}`};
 if(p.face==='T')return {...base,action:'top' as const,z:top-c-d/2,leg:legD?-legD*d:0,reason:`(T) = ตะแกรงบน${legD?` · ขางอลง ${legD}d`:''}`};
 if(p.face==='EF'||p.face==='NF'||p.face==='FF')return {...base,action:'vertical' as const,leg:legD?legD*d:0,reason:'เหล็กผิว (แนวตั้งรอบผิวข้าง)'};
 if(p.count&&!p.spacing)return {...base,action:'skip' as const,reason:`${p.count} เส้น · ระบุตำแหน่งไม่ได้`,manual:'วาดเองแบบเดี่ยว / จำนวนคงที่'};
 return {...base,action:'vertical' as const,leg:legD?legD*d:0,reason:'ไม่มี (B)/(T) · เสนอเป็นเหล็กแนวตั้งผิวข้าง (ตรวจกับแบบ)'};
}
/** Builds the bars of the chosen suggestions (bottom: X then Y stacked; top: X then Y below it). */
export function barsFromSuggestions(m:Member,list:Suggestion[],gradeOf:(d:number)=>string):Bar[]{
 let work=m;const out:Bar[]=[],push=(bars:Bar[])=>{out.push(...bars);work={...work,bars:[...work.bars,...bars]};};
 for(const s of list){const grade=gradeOf(s.diameter),note=s.note.text;
  if(s.action==='bottom'||s.action==='top'){let z=s.z;for(const dir of s.dirs){push(meshBars(work,{z,diameter:s.diameter,grade,spacing:s.spacing,cover:m.cover,dirs:[dir],leg:s.leg,note}));z+=s.action==='bottom'?s.diameter:-s.diameter;}}
  if(s.action==='loops')push(loopBars(work,{z:s.z,zTop:s.zTop,diameter:s.diameter,grade,spacing:s.spacing,cover:m.cover,lap:40*s.diameter,mark:nextFree(work),note}));
  if(s.action==='vertical')push(verticalFaceBars(work,{z0:s.z,z1:s.zTop,diameter:s.diameter,grade,spacing:s.spacing,cover:m.cover,leg:s.leg,mark:nextFree(work),note}));
 }
 return out;
}
const nextFree=(m:Member)=>{const used=new Set(m.bars.map(b=>b.mark));for(let i=1;i<1000;i++){const k=`C${String(i).padStart(2,'0')}`;if(!used.has(k))return k;}return 'C999';};
