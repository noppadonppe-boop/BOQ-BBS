// S4b: AI help for the slab-floor import (docs/SLAB_FLOOR.md “AI help”). The gateway task `slabPlan` reads zoomed views of
// the chosen window (+ the page texts and pseudo-layers, + the rule proposal as a hint) and answers `aiFloorProposalSchema`
// (positions in view pixels, every item with confidence + evidence). Here: the schema, the conversion to a FloorProposal in
// floor mm, the merge with the rule result (AI fills / confirms; a value it reads differently is kept as an alternative, never
// written over the rule value silently), the project consent + send log, and the schedule (table) answer `aiScheduleSchema`.
import {z} from 'zod';
import {IMPORT_ROLES} from './slabFloorSchema';
import type {SlabFloor} from './slabFloorSchema';
import {sortGrids} from './slabFloor';
import type {P2} from './cadEntities';
import type {DiffItem,FloorProposal,LayerRoles,ProposalBeam,ProposalColumn,ProposalGrid,ProposalOpening,ProposalPanelMark} from './slabPlanImport';

// ---------------------------------------------------------------- consent + log (project fields)
/** Project switch “อนุญาตส่งแบบให้ AI” (default off, admin only). */
export const aiConsentSchema=z.object({enabled:z.boolean(),by:z.string().max(200),at:z.string().max(40)}).strict();
export type AiConsent=z.infer<typeof aiConsentSchema>;
/** One send to the AI (who, when, which file / page / window, provider, model, task). Last 200 kept on the project. */
export const aiSendLogEntrySchema=z.object({at:z.string().max(40),uid:z.string().max(128),email:z.string().max(200),task:z.enum(['slabPlan','slabSchedule']),
 attachmentId:z.string().max(80),fileName:z.string().max(250),page:z.number().int().min(1).max(9999),box:z.tuple([z.number(),z.number(),z.number(),z.number()]).optional(),
 views:z.number().int().min(0).max(20),provider:z.string().max(40),model:z.string().max(120),memberId:z.string().max(80).optional()}).strict();
export type AiSendLogEntry=z.infer<typeof aiSendLogEntrySchema>;
export const AI_LOG_KEEP=200;
export const aiAllowed=(p:{aiConsent?:AiConsent|null})=>p.aiConsent?.enabled===true;

// ---------------------------------------------------------------- the AI answer
const conf=z.number().finite().min(0).max(1);
const pos=z.object({view:z.number().int().min(0).max(20),x:z.number().finite(),y:z.number().finite()}).strict();
const box=z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]);
const evidence=z.object({view:z.number().int().min(0).max(20).optional(),box:box.optional(),quote:z.string().max(300).optional(),textIds:z.array(z.string().max(20)).max(20).optional()}).strict();
const size=z.number().finite().positive().max(5000).nullable().optional();
export const aiFloorProposalSchema=z.object({version:z.literal(1),task:z.literal('slabPlan'),
 layers:z.array(z.object({name:z.string().max(255),role:z.enum([...IMPORT_ROLES,'none']),confidence:conf,evidence:evidence.optional()}).strict()).max(200).default([]),
 grids:z.array(z.object({axis:z.enum(['X','Y']),label:z.string().trim().min(1).max(12),at:pos,confidence:conf,evidence}).strict()).max(60).default([]),
 beams:z.array(z.object({mark:z.string().trim().min(1).max(20),width:size,depth:size,a:pos,b:pos,confidence:conf,evidence}).strict()).max(200).default([]),
 columns:z.array(z.object({mark:z.string().max(20).nullable().optional(),at:pos,sx:size,sy:size,confidence:conf,evidence}).strict()).max(300).default([]),
 openings:z.array(z.object({label:z.string().max(40).nullable().optional(),shape:z.enum(['rect','circle']),a:pos,b:pos,confidence:conf,evidence}).strict()).max(40).default([]),
 panelMarks:z.array(z.object({mark:z.string().trim().min(1).max(12),thickness:size,at:pos,confidence:conf,evidence}).strict()).max(100).default([]),
 questions:z.array(z.object({id:z.string().max(40),text:z.string().max(300),about:z.string().max(60).optional()}).strict()).max(20).default([]),
 warnings:z.array(z.string().max(300)).max(30).default([])}).strict();
export type AiFloorProposal=z.infer<typeof aiFloorProposalSchema>;
/** Table rows read from a slab / beam schedule (task `slabPlan`, part `schedule`). */
export const aiScheduleSchema=z.object({version:z.literal(1),task:z.literal('slabSchedule'),kind:z.enum(['slab','beam']),header:z.array(z.string().max(80)).max(30),
 rows:z.array(z.array(z.string().max(120)).max(30)).max(300),confidence:conf,evidence:evidence.optional(),questions:z.array(z.object({id:z.string().max(40),text:z.string().max(300)}).strict()).max(20).default([]),
 warnings:z.array(z.string().max(300)).max(30).default([])}).strict();
export type AiSchedule=z.infer<typeof aiScheduleSchema>;
/** Parse a gateway answer; a wrong shape is rejected with the first problems in Thai. */
export function parseAi<T>(schema:z.ZodType<T>,raw:unknown,what:string):T{
 const r=schema.safeParse((raw as {result?:unknown})?.result??raw);
 if(!r.success)throw Error(`ผล AI (${what}) ไม่ตรงรูปแบบ: ${r.error.issues.slice(0,4).map(i=>`${i.path.join('.')||'(ทั้งหมด)'} ${i.message}`).join(' · ')}`);
 return r.data;
}

// ---------------------------------------------------------------- views → floor
/** A view sent to the AI: its window in source units (page points, y up) and its pixel size (y down). */
export type ViewFrame={label:string;box:[number,number,number,number];px:[number,number]};
export type Similarity={scale:number;rotation:number;tx:number;ty:number};
export function viewToSource(f:ViewFrame,x:number,y:number):P2{const [x0,y0,x1,y1]=f.box;return [x0+x/f.px[0]*(x1-x0),y1-y/f.px[1]*(y1-y0)];}
const sim=(t:Similarity,p:P2):P2=>{const c=Math.cos(t.rotation)*t.scale,s=Math.sin(t.rotation)*t.scale;return [c*p[0]-s*p[1]+t.tx,s*p[0]+c*p[1]+t.ty];};

export type Origin='rule'|'ai'|'both';
/** Extra fields the merge puts on proposal items (origin of the value; the other reading when rule and AI disagree). */
export type MergeInfo={origin?:Origin;alt?:{text:string;value:Record<string,unknown>}};

/** AI answer → FloorProposal in floor mm (`t` = page → floor before the origin; origin = the rule proposal's, else from the
 * grid labels of the current floor, else the first grids). `scanned` = no rule geometry: confidences × 0.7. */
export function aiToProposal(ai:AiFloorProposal,frames:ViewFrame[],t:Similarity,o:{floor:Pick<SlabFloor,'gridsX'|'gridsY'>;origin?:P2;source:FloorProposal['source'];round?:number;scanned?:boolean;
 beamSizes?:Record<string,{width:number;depth:number}>}):FloorProposal{
 const q=o.round&&o.round>0?o.round:1,rr=(v:number)=>(Math.round(v/q)*q)||0,k=o.scanned?0.7:0.85,cf=(c:number)=>Math.round(Math.min(c,1)*k*100)/100;
 const at=(p:{view:number;x:number;y:number}):P2=>{const f=frames[p.view]||frames[0];return sim(t,viewToSource(f,p.x,p.y));};
 const ev=(e:z.infer<typeof evidence>,where?:P2)=>({handles:(e.textIds||[]).map(id=>`ai:${id}`),...(where?{at:where}:{}),text:e.quote||'AI'});
 const warnings=[...ai.warnings.map(w=>`AI: ${w}`)];
 const raw=ai.grids.map(g=>({g,v:at(g.at)[g.axis==='X'?0:1]}));
 let origin=o.origin;
 if(!origin){const sh=(axis:'X'|'Y',cur:{label:string;at:number}[])=>{const list=raw.filter(r=>r.g.axis===axis),d=list.flatMap(r=>{const c=cur.find(x=>x.label===r.g.label);return c?[r.v-c.at]:[];}).sort((a,b)=>a-b);return d.length?d[d.length>>1]:list.length?Math.min(...list.map(r=>r.v)):0;};
  origin=[sh('X',o.floor.gridsX),sh('Y',o.floor.gridsY)];}
 const F=(p:P2):P2=>[p[0]-origin![0],p[1]-origin![1]];
 const grids:ProposalGrid[]=raw.map(({g,v})=>({id:`g:${g.axis}:${g.label}`,axis:g.axis,label:g.label,at:rr(v-origin![g.axis==='X'?0:1]),confidence:cf(g.confidence),evidence:ev(g.evidence),origin:'ai'} as ProposalGrid&MergeInfo));
 const gx=sortGrids(grids.filter(g=>g.axis==='X')),gy=sortGrids(grids.filter(g=>g.axis==='Y')),near=(list:{label:string;at:number}[],v:number,tol:number)=>{let b:{label:string;at:number}|undefined,d=tol;for(const g of list){const e=Math.abs(g.at-v);if(e<=d){d=e;b=g;}}return b;};
 const beams:ProposalBeam[]=[];
 for(const b of ai.beams){const A=F(at(b.a)),B=F(at(b.b)),along=Math.abs(B[0]-A[0])>=Math.abs(B[1]-A[1])?'X':'Y',c=along==='X'?(A[1]+B[1])/2:(A[0]+B[0])/2,u0=Math.min(along==='X'?A[0]:A[1],along==='X'?B[0]:B[1]),u1=Math.max(along==='X'?A[0]:A[1],along==='X'?B[0]:B[1]);
  const size=o.beamSizes?.[b.mark],width=b.width??size?.width??0,depth=b.depth??size?.depth??0,line=near(along==='X'?gy:gx,c,(width||300)/2+600),ra=near(along==='X'?gx:gy,u0,1500),rb=near(along==='X'?gx:gy,u1,1500);
  if(!line||!ra||!rb||ra===rb){warnings.push(`AI: คาน ${b.mark} ไม่อยู่บนกริด / ปลายไม่ถึงกริด: ข้าม`);continue;}
  if(!width||!depth)warnings.push(`AI: คาน ${b.mark} ไม่มีขนาดในแบบ: ${!width?'กว้าง 300':''}${!width&&!depth?' · ':''}${!depth?'ลึก 600':''} ตรวจก่อนใช้`);
  beams.push({id:`b:${along}:${line.label}:${ra.label}-${rb.label}`,mark:b.mark,along,line:line.label,from:ra.label,to:rb.label,width:width||300,depth:depth||600,offset:Math.round((c-line.at)/5)*5||0,confidence:cf(width&&depth?b.confidence:Math.min(b.confidence,0.5)),evidence:ev(b.evidence,[(A[0]+B[0])/2,(A[1]+B[1])/2]),origin:'ai'} as ProposalBeam&MergeInfo);}
 const columns:ProposalColumn[]=[];
 for(const c of ai.columns){const p=F(at(c.at)),x=near(gx,p[0],(c.sx||400)/2+300),y=near(gy,p[1],(c.sy||400)/2+300);if(!x||!y){warnings.push('AI: เสาไม่อยู่ที่จุดตัดกริด: ข้าม');continue;}
  if(columns.some(k=>k.x===x.label&&k.y===y.label))continue;
  columns.push({id:`c:${x.label}/${y.label}`,x:x.label,y:y.label,sx:c.sx||c.sy||400,sy:c.sy||c.sx||400,...(c.mark?{mark:c.mark}:{}),confidence:cf(c.sx?c.confidence:Math.min(c.confidence,0.5)),evidence:ev(c.evidence,p),origin:'ai'} as ProposalColumn&MergeInfo);}
 const openings:ProposalOpening[]=ai.openings.map((op,i)=>{const A=F(at(op.a)),B=F(at(op.b)),x0=Math.min(A[0],B[0]),y0=Math.min(A[1],B[1]),w=Math.abs(B[0]-A[0]),h=Math.abs(B[1]-A[1]);
  return {id:`o:${i+1}`,shape:op.shape,x:rr(x0),y:rr(y0),w:rr(op.shape==='circle'?Math.max(w,h):w),h:rr(op.shape==='circle'?Math.max(w,h):h),label:(op.label||`OP-${i+1}`).slice(0,40),confidence:cf(op.confidence),evidence:ev(op.evidence,[x0+w/2,y0+h/2]),origin:'ai'} as ProposalOpening&MergeInfo;});
 const panelMarks:ProposalPanelMark[]=ai.panelMarks.map((m,i)=>{const p=F(at(m.at));return {id:`m:${i+1}`,at:[rr(p[0]),rr(p[1])] as P2,mark:m.mark,...(m.thickness?{thickness:m.thickness}:{}),confidence:cf(m.confidence),evidence:ev(m.evidence,p),origin:'ai'} as ProposalPanelMark&MergeInfo;});
 return {grids,beams,columns,openings,panelMarks,warnings,source:o.source,origin:origin!};
}

/** Rule + AI: items found by both keep the rule value (origin `both`, confidence = the higher); a different AI reading is kept
 * as `alt` (both shown in the review, the rule value used unless the user picks the AI one); items only the AI found are
 * added (origin `ai`); rule-only items stay. Grids ±50 mm, beams by line (mark / size / ±50 offset), columns by crossing,
 * openings by overlap, slab labels within 1,500 mm. */
export function mergeProposals(rule:FloorProposal|null,ai:FloorProposal):FloorProposal{
 if(!rule)return ai;
 const tag=<T extends object>(x:T,o:Origin,extra:Partial<MergeInfo>={}):T=>({...x,origin:o,...extra});
 const grids=rule.grids.map(g=>{const a=ai.grids.find(x=>x.axis===g.axis&&x.label===g.label);if(!a)return tag(g,'rule');
  return Math.abs(a.at-g.at)<=50?tag({...g,confidence:Math.max(g.confidence,a.confidence)},'both'):tag(g,'both',{alt:{text:`AI อ่านตำแหน่ง ${Math.round(a.at).toLocaleString('en-US')}`,value:{at:a.at}}});});
 for(const a of ai.grids)if(!rule.grids.some(g=>g.axis===a.axis&&g.label===a.label))grids.push(tag(a,'ai'));
 const bk=(b:ProposalBeam)=>`${b.along}|${b.line}`;
 const beams=rule.beams.map(b=>{const a=ai.beams.find(x=>bk(x)===bk(b));if(!a)return tag(b,'rule');
  const same=a.mark.toUpperCase()===b.mark.toUpperCase()&&Math.abs(a.width-b.width)<=10&&Math.abs(a.depth-b.depth)<=10&&Math.abs(a.offset-b.offset)<=50&&a.from===b.from&&a.to===b.to;
  // AI only fills what the rules guessed (mark "B?", depth with low confidence)
  if(!same&&(b.mark==='B?'||b.confidence<0.6)&&a.from===b.from&&a.to===b.to)return tag({...b,mark:b.mark==='B?'?a.mark:b.mark,depth:b.confidence<0.6?a.depth:b.depth,confidence:Math.max(b.confidence,Math.min(a.confidence,0.8))},'both',{alt:{text:`ค่าจากกฎ: ${b.mark} ${b.width}×${b.depth}`,value:{mark:b.mark,depth:b.depth}}});
  return same?tag({...b,confidence:Math.max(b.confidence,a.confidence)},'both'):tag(b,'both',{alt:{text:`AI อ่าน ${a.mark} ${a.width}×${a.depth}${a.offset?` เยื้อง ${a.offset}`:''} (${a.from}–${a.to})`,value:{mark:a.mark,width:a.width,depth:a.depth,offset:a.offset,from:a.from,to:a.to}}});});
 for(const a of ai.beams)if(!rule.beams.some(b=>bk(b)===bk(a)))beams.push(tag(a,'ai'));
 const columns=rule.columns.map(c=>{const a=ai.columns.find(x=>x.x===c.x&&x.y===c.y);if(!a)return tag(c,'rule');
  return Math.abs(a.sx-c.sx)<=10&&Math.abs(a.sy-c.sy)<=10?tag({...c,...(c.mark||!a.mark?{}:{mark:a.mark}),confidence:Math.max(c.confidence,a.confidence)},'both'):tag(c,'both',{alt:{text:`AI อ่าน ${a.sx}×${a.sy}`,value:{sx:a.sx,sy:a.sy}}});});
 for(const a of ai.columns)if(!rule.columns.some(c=>c.x===a.x&&c.y===a.y))columns.push(tag(a,'ai'));
 const ov=(a:ProposalOpening,b:ProposalOpening)=>{const i=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return i/Math.max(1,Math.min(a.w*a.h,b.w*b.h));};
 const usedO=new Set<ProposalOpening>();
 const openings=rule.openings.map(o=>{const a=ai.openings.find(x=>!usedO.has(x)&&ov(o,x)>0.5);if(!a)return tag(o,'rule');usedO.add(a);
  const same=['x','y','w','h'].every(k=>Math.abs((a as never)[k]-(o as never)[k])<=100);
  return same?tag({...o,confidence:Math.max(o.confidence,a.confidence)},'both'):tag(o,'both',{alt:{text:`AI อ่าน ${a.w}×${a.h} ที่ (${a.x}, ${a.y})`,value:{x:a.x,y:a.y,w:a.w,h:a.h}}});});
 let n=rule.openings.length;for(const a of ai.openings)if(!usedO.has(a))openings.push(tag({...a,id:`o:${++n}`},'ai'));
 const usedM=new Set<ProposalPanelMark>();
 const panelMarks=rule.panelMarks.map(m=>{const a=ai.panelMarks.find(x=>!usedM.has(x)&&Math.hypot(x.at[0]-m.at[0],x.at[1]-m.at[1])<=1500);if(!a)return tag(m,'rule');usedM.add(a);
  return a.mark.toUpperCase()===m.mark.toUpperCase()?tag({...m,confidence:Math.max(m.confidence,a.confidence)},'both'):tag(m,'both',{alt:{text:`AI อ่าน ${a.mark}`,value:{mark:a.mark,...(a.thickness?{thickness:a.thickness}:{})}}});});
 let k=rule.panelMarks.length;for(const a of ai.panelMarks)if(!usedM.has(a))panelMarks.push(tag({...a,id:`m:${++k}`},'ai'));
 return {grids,beams,columns,openings,panelMarks,warnings:[...rule.warnings,...ai.warnings],source:{...rule.source},origin:rule.origin};
}
/** The proposal with the AI reading used for the rows the user switched to it. */
export function withAlternatives(p:FloorProposal,useAi:Set<string>):FloorProposal{
 const sw=<T extends {id:string}>(list:T[])=>list.map(x=>{const a=(x as T&MergeInfo).alt;return a&&useAi.has(x.id)?{...x,...a.value}:x;});
 return {...p,grids:sw(p.grids),beams:sw(p.beams),columns:sw(p.columns),openings:sw(p.openings),panelMarks:sw(p.panelMarks)};
}
/** Default ticks with AI rows: AI-only rows only when confident (≥ 0.8); from a scan (`manual`) nothing is ticked. */
export function aiDefaultPicks(diff:DiffItem[],p:FloorProposal,manual=false):Set<string>{
 if(manual)return new Set();
 const items=new Map<string,{origin?:Origin;confidence:number}>([...p.grids,...p.beams,...p.columns,...p.openings,...p.panelMarks].map(x=>[x.id,x as {origin?:Origin;confidence:number}]));
 return new Set(diff.filter(d=>(d.op==='add'||d.op==='edit')&&(()=>{const it=items.get(d.id);return !it||it.origin!=='ai'||it.confidence>=0.8;})()).map(d=>d.id));
}
/** Layer roles the AI gave (only roles of layers that exist; `none` drops nothing the user mapped). */
export function aiLayerRoles(ai:AiFloorProposal,layers:string[],current:LayerRoles):LayerRoles{
 const out:LayerRoles={};for(const r of IMPORT_ROLES)if(current[r]?.length)out[r]=[...current[r]!];
 const mapped=new Set(Object.values(out).flat());
 for(const l of ai.layers)if(l.role!=='none'&&layers.includes(l.name)&&!mapped.has(l.name)&&l.confidence>=0.5){(out[l.role]||=[]).push(l.name);mapped.add(l.name);}
 return out;
}
