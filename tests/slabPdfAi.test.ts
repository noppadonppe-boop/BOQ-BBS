// S4b part 2 (docs/SLAB_FLOOR.md “AI help”, docs/AI_DRAWING_ANALYSIS.md task slabPlan): AI answer schema + conversion of view
// pixels to floor mm, merge with the rule result (never written over silently: both readings shown), default ticks (AI-only
// rows only when confident, nothing from a scan), consent off = no gateway call, the send log, the project commands against an
// in-memory Firestore stand-in, and schedules (ruled tables in a PDF) → Slab / Beam Templates → the spec-change job.
import {describe,expect,it,vi} from 'vitest';
const store=new Map<string,unknown>();
const user={current:{uid:'u1',email:'u1@test.local',isAnonymous:false}};
vi.mock('../src/data/firebase',()=>({storage:{},db:{},emulator:true,command:async()=>({}),auth:{get currentUser(){return user.current;},authStateReady:async()=>{}}}));
vi.mock('firebase/storage',()=>({getBlob:async()=>new Blob(),ref:()=>({})}));
vi.mock('firebase/firestore',()=>{
 type Ref={path:string;id:string};
 const clone=<T,>(v:T):T=>v===undefined?v:JSON.parse(JSON.stringify(v));
 const ref=(segs:string[]):Ref=>{const path=segs.join('/');return {path,id:path.split('/').at(-1)!};};
 const snap=(r:Ref)=>({id:r.id,ref:r,exists:()=>store.has(r.path),data:()=>clone(store.get(r.path))});
 return {doc:(_db:unknown,...segs:string[])=>ref(segs),collection:(_db:unknown,...segs:string[])=>ref(segs),getDoc:async(r:Ref)=>snap(r),
  runTransaction:async(_db:unknown,fn:(tx:unknown)=>Promise<unknown>)=>{const writes:(()=>void)[]=[];
   const tx={get:async(r:Ref)=>snap(r),set:(r:Ref,v:unknown)=>{writes.push(()=>store.set(r.path,clone(v)));return tx;},update:(r:Ref,v:Record<string,unknown>)=>{writes.push(()=>store.set(r.path,{...(store.get(r.path) as object),...clone(v)}));return tx;}};
   const out=await fn(tx);writes.forEach(w=>w());return out;},Transaction:class{},serverTimestamp:()=>new Date().toISOString()};
});
import {docToFloor} from '../src/domain/cadEntities';
import {readFloorPlan,guessPdfRoles,proposalDiff,type FloorProposal} from '../src/domain/slabPlanImport';
import {aiDefaultPicks,aiFloorProposalSchema,aiToProposal,mergeProposals,parseAi,withAlternatives,type AiFloorProposal,type ViewFrame} from '../src/domain/aiSlabPlan';
import {beamTemplatesFromTable,readRuledTable,slabTemplatesFromTable,templateDiff} from '../src/domain/scheduleImport';
import {slabTemplatesSchema} from '../src/domain/slabWallTemplates';
import {beamTemplatesSchema} from '../src/domain/beamTemplates';
import {newSlabFloor} from '../src/domain/slabFloor';
import {requestSlabAI,type SlabAiIO,type SlabAiRequest} from '../src/data/aiSlabPlan';
import {importTemplatesViaSpecJob} from '../src/data/scheduleSpec';
import {setDirectAiConsent,logDirectAiSend} from '../src/data/direct/aiConsent';
import {userDocPath} from '../src/domain/auth';
import {encodeStorage,decodeStorage} from '../src/domain/storageCodec';
import {currentStarterSpec,type Project,type Role,type Spec} from '../src/domain/model';
import {BEAM_SCHEDULE,GX,GY,SCHEDULE_WIN,SLAB_SCHEDULE,XL,YL,scheduleTablesPdf,slabPlanPdf,PDF_ORIGIN_MM} from './fixtures/slabPlan';
import {PAGE_T,readPdf} from './fixtures/pdfRead';

const spec={...currentStarterSpec,designCode:'ACI',rounding:25} as Spec;
const pt=(mm:number)=>mm*72/25.4,PAGE:[number,number,number,number]=[0,0,1190.551,841.89];
const frame:ViewFrame={label:'ภาพรวม',box:PAGE,px:[2000,Math.round(2000*841.89/1190.551)]};
/** floor mm (A/1 = 0) → view-0 pixels of the whole page */
const px=(x:number,y:number)=>{const X=pt(PDF_ORIGIN_MM[0]+x/100),Y=pt(297-PDF_ORIGIN_MM[1]+y/100);return {view:0,x:X/PAGE[2]*frame.px[0],y:(PAGE[3]-Y)/PAGE[3]*frame.px[1]};};
const E={view:0,quote:'from the picture'};
/** what a model could answer for the fixture plan: agrees on most, reads beam 2 and column D/3 differently, adds one opening */
function sampleAi():AiFloorProposal{
 return parseAi(aiFloorProposalSchema,{version:1,task:'slabPlan',layers:[],
  grids:[...GX.map((x,k)=>({axis:'X',label:XL[k],at:px(x,0),confidence:0.95,evidence:E})),...GY.map((y,k)=>({axis:'Y',label:YL[k],at:px(0,y),confidence:0.95,evidence:E}))],
  beams:[{mark:'B1',width:300,depth:600,a:px(200,0),b:px(16300,0),confidence:0.9,evidence:E},{mark:'B5',width:350,depth:700,a:px(200,5000),b:px(16300,5000),confidence:0.9,evidence:E}],
  columns:[{mark:'C1',at:px(0,0),sx:400,sy:400,confidence:0.9,evidence:E},{at:px(16500,10000),sx:450,sy:450,confidence:0.9,evidence:E}],
  openings:[{label:'OP-2',shape:'rect',a:px(2000,6000),b:px(2600,6600),confidence:0.9,evidence:E}],
  panelMarks:[{mark:'S1',at:px(3000,2500),confidence:0.9,evidence:E}],questions:[{id:'q1',text:'คาน B5 ลึกเท่าไร'}],warnings:[]},'test');
}
async function ruleProposal():Promise<FloorProposal>{const d=await readPdf(slabPlanPdf());return readFloorPlan(docToFloor(d,PAGE_T),guessPdfRoles(d),{source:{kind:'pdf',attachmentId:'pdf1',page:1},floor:newSlabFloor(),round:5});}

describe('S4b AI answer → proposal, merge with the rules',()=>{
 it('schema: a valid answer passes, a wrong one is rejected with the problems named',()=>{
  expect(sampleAi().grids).toHaveLength(7);
  expect(()=>parseAi(aiFloorProposalSchema,{version:1,task:'slabPlan',grids:[{axis:'Z',label:'A',at:{view:0,x:1,y:1},confidence:2,evidence:{}}]},'แปลนพื้น')).toThrow(/ไม่ตรงรูปแบบ.*grids\.0\.axis/);
  expect(()=>parseAi(aiFloorProposalSchema,{task:'shape'},'แปลนพื้น')).toThrow(/ไม่ตรงรูปแบบ/);
  expect(parseAi(aiFloorProposalSchema,{result:{version:1,task:'slabPlan'}},'x').beams).toEqual([]);
  // the gateway envelope (provider / model / file / page) is accepted; anything else unknown is not
  expect(parseAi(aiFloorProposalSchema,{version:1,task:'slabPlan',provider:'anthropic',model:'m',attachmentId:'a',page:2},'x').grids).toEqual([]);
  expect(()=>parseAi(aiFloorProposalSchema,{version:1,task:'slabPlan',extra:1},'x')).toThrow(/extra/);
 });
 it('view pixels → floor mm through the page transform (grids within 1 mm of the drawing)',async()=>{
  const p=aiToProposal(sampleAi(),[frame],PAGE_T,{floor:newSlabFloor(),source:{kind:'ai',attachmentId:'pdf1',page:1},round:1});
  expect(p.grids.map(g=>[g.label,g.at])).toEqual([['A',0],['B',6000],['C',12000],['D',16500],['1',0],['2',5000],['3',10000]]);
  expect(p.beams.map(b=>`${b.along}${b.line} ${b.from}-${b.to} ${b.mark} ${b.width}x${b.depth}`)).toEqual(['X1 A-D B1 300x600','X2 A-D B5 350x700']);
  expect(p.columns.map(c=>`${c.x}/${c.y} ${c.sx}`)).toEqual(['A/1 400','D/3 450']);expect(p.openings[0]).toMatchObject({x:2000,y:6000,w:600,h:600});
  expect(p.grids.every(g=>g.confidence<=0.85)).toBe(true);
 },60000);
 it('merge: agreeing items = both; a different reading kept as the alternative (rule value used); AI-only rows added',async()=>{
  const rule=await ruleProposal(),ai=aiToProposal(sampleAi(),[frame],PAGE_T,{floor:newSlabFloor(),origin:rule.origin,source:rule.source,round:5}),m=mergeProposals(rule,ai);
  const g=m.grids.find(x=>x.label==='A') as any,b1=m.beams.find(x=>x.line==='1') as any,b2=m.beams.find(x=>x.line==='2') as any,c=m.columns.find(x=>x.x==='D'&&x.y==='3') as any,o2=m.openings.find(x=>x.label==='OP-2') as any;
  expect(g.origin).toBe('both');expect(g.alt).toBeUndefined();expect(b1.origin).toBe('both');expect(b1.alt).toBeUndefined();
  expect(b2).toMatchObject({mark:'B1',width:300,depth:600,origin:'both'});expect(b2.alt.text).toMatch(/B5 350×700/);
  expect(c).toMatchObject({sx:400,origin:'both'});expect(c.alt.text).toMatch(/450×450/);
  expect(m.beams.find(x=>x.line==='3')).toMatchObject({origin:'rule'});expect(o2.origin).toBe('ai');expect(o2.confidence).toBeLessThan(0.8);
  expect(m.openings.find(x=>x.label==='OP-1')).toMatchObject({origin:'rule'});
  // both readings in the review; the user switches one row to the AI value
  const d=proposalDiff(newSlabFloor(),m),row=d.find(x=>x.id===b2.id)!;expect(row.alt).toMatch(/B5/);expect(row.origin).toBe('both');
  expect(withAlternatives(m,new Set([b2.id])).beams.find(x=>x.line==='2')).toMatchObject({mark:'B5',width:350,depth:700});
  const picks=aiDefaultPicks(d,m);expect(picks.has(b2.id)).toBe(true);expect(picks.has(o2.id)).toBe(false);
  expect(aiDefaultPicks(d,m,true).size).toBe(0);// from a scan nothing is ticked in advance
  // rule unsure (no mark) → the AI fills it, the guess kept as the alternative
  const unsure={...rule,beams:rule.beams.map(x=>x.line==='1'?{...x,mark:'B?',confidence:0.5}:x)},m2=mergeProposals(unsure,ai);
  expect(m2.beams.find(x=>x.line==='1')).toMatchObject({mark:'B1'});expect((m2.beams.find(x=>x.line==='1') as any).alt.text).toMatch(/B\?/);
 },60000);
});

describe('S4b consent, send log, gateway call',()=>{
 const base=(over:Partial<Project>={})=>({id:'p1',spec,version:3,...over}) as Project;
 const req=(project:Project):SlabAiRequest&{part:'plan'}=>({project,member:{id:'fl2'} as any,attachment:{id:'pdf1',name:'plan.pdf'} as any,page:1,box:PAGE,views:[{label:'v',mimeType:'image/jpeg',data:'AA=='}],frames:[frame],texts:[],layers:[],part:'plan',provider:{id:'anthropic',model:'m1'}});
 it('consent off → error, no log, no gateway call; on → logged first, then sent; a bad answer is rejected',async()=>{
  const calls:string[]=[],io:SlabAiIO={log:async e=>{calls.push(`log ${e.task} ${e.fileName} p${e.page} ${e.provider}/${e.model} ${e.views}`);},send:async(x,expect)=>{calls.push(`send ${expect} ${x.part}`);return {result:sampleAi()};}};
  await expect(requestSlabAI(req(base()),io)).rejects.toThrow(/ยังไม่อนุญาต/);expect(calls).toEqual([]);
  await expect(requestSlabAI(req(base({aiConsent:{enabled:false,by:'a',at:'t'}})),io)).rejects.toThrow();expect(calls).toEqual([]);
  const r=await requestSlabAI(req(base({aiConsent:{enabled:true,by:'a',at:'t'}})),io);
  expect(calls).toEqual(['log slabPlan plan.pdf p1 anthropic/m1 1','send slabPlan plan']);expect(r.grids).toHaveLength(7);
  const bad:SlabAiIO={log:async()=>{},send:async()=>({version:1,task:'slabPlan',beams:[{mark:''}]})};
  await expect(requestSlabAI(req(base({aiConsent:{enabled:true,by:'a',at:'t'}})),bad)).rejects.toThrow(/ไม่ตรงรูปแบบ/);
 });
 const seed=(role:Role,over:Partial<Project>={})=>{store.clear();
  store.set(userDocPath('u1@test.local'),{uid:'u1',email:'u1@test.local',firstName:'U',lastName:'1',status:'approved',roles:['Staff'],assignedProjects:['p1'],projectRoles:{p1:[role]},profileVersion:1});
  store.set('projects/p1',encodeStorage({...base(over),code:'P1',name:'P1',acl:{u1:role},titleBlock:{company:'',drawnBy:'',checkedBy:'',drawingPrefix:''}}));};
 const project=()=>decodeStorage(store.get('projects/p1')) as Project;
 it('setAiConsent: admin only (version + 1); logAiSend: refused while off, kept on the project when on (last 200, no version bump)',async()=>{
  seed('qs');await expect(setDirectAiConsent('p1',{enabled:true,version:3},'r1')).rejects.toThrow(/สิทธิ์/);
  await expect(logDirectAiSend('p1',{entry:{task:'slabPlan',attachmentId:'pdf1',fileName:'plan.pdf',page:1,views:7,provider:'anthropic',model:'m1'}},'r2')).rejects.toThrow(/ยังไม่อนุญาต/);
  seed('admin');await setDirectAiConsent('p1',{enabled:true,version:3},'r3');expect(project()).toMatchObject({aiConsent:{enabled:true,by:'u1@test.local'},version:4});
  for(let i=0;i<203;i++)await logDirectAiSend('p1',{entry:{task:'slabPlan',attachmentId:'pdf1',fileName:'plan.pdf',page:1,views:7,provider:'anthropic',model:'m1'}},`l${i}`);
  const p=project();expect(p.version).toBe(4);expect(p.aiSendLog).toHaveLength(200);expect(p.aiSendLog![0]).toMatchObject({uid:'u1',email:'u1@test.local',task:'slabPlan',fileName:'plan.pdf',provider:'anthropic'});
  await setDirectAiConsent('p1',{enabled:false,version:4},'r4');expect(project().aiConsent?.enabled).toBe(false);
 });
});

describe('S4b schedules → templates → spec-change job',()=>{
 it('ruled slab / beam tables (vector PDF) → rows, Slab / Beam Templates, diff, spec through the job',async()=>{
  const d=await readPdf(scheduleTablesPdf()),I={scale:1,rotation:0,tx:0,ty:0};
  const slab=readRuledTable(docToFloor(d,I,SCHEDULE_WIN.slab))!,beam=readRuledTable(docToFloor(d,I,SCHEDULE_WIN.beam))!;
  expect([slab.header,...slab.rows]).toEqual(SLAB_SCHEDULE);expect([beam.header,...beam.rows]).toEqual(BEAM_SCHEDULE);
  const s=slabTemplatesFromTable(slab,'S-101');expect(s.warnings).toEqual([]);
  expect(s.templates.map(t=>[t.name,t.thickness,t.support])).toEqual([['S1',150,'elevated'],['S2',120,'elevated'],['SG1',200,'ground']]);
  expect(s.templates[0].rebar).toMatchObject({shortBottom:{diameter:12,spacing:200},longBottom:{diameter:12,spacing:200},shortTop:{spacing:0},topExtra:{diameter:12,spacing:200,length:{mode:'ratio',n:4}}});
  expect(s.templates[1].rebar).toMatchObject({longBottom:{diameter:10,spacing:250},topExtra:{diameter:12,spacing:200,length:{mode:'fixed',value:1000,from:'face'}}});
  expect(slabTemplatesSchema.safeParse(s.templates).success).toBe(true);
  expect(s.templates[2].rebar).toMatchObject({shortTop:{diameter:12,spacing:300},longTop:{diameter:12,spacing:300}});expect(s.templates[2].rebar.topExtra).toBeUndefined();
  const b=beamTemplatesFromTable(beam,'S-201');expect(b.templates.map(t=>[t.name,t.width,t.depth,t.sections[0].top,t.sections[0].stirrup])).toEqual([['B1',300,600,'3DB20','RB9@150'],['B2',250,500,'2DB16','RB9@200']]);
  expect(b.templates[0].rebar.top.count).toBe(3);
  expect(beamTemplatesSchema.safeParse(b.templates).success).toBe(true);
  // against a spec that already has S1 (other bars) and an unrelated S9
  const cur={...spec,slabTemplates:[{...s.templates[0],id:'old1',group:'L2',rebar:{...s.templates[0].rebar,shortBottom:{diameter:16,spacing:200}}},{...s.templates[2],id:'s9',name:'S9'}]} as Spec;
  expect(templateDiff(cur,'slab',s.templates).map(r=>[r.name,r.op])).toEqual([['S1','edit'],['S2','add'],['SG1','add']]);
  const job=vi.fn(async(_pid:string,_spec:Spec,_v:number)=>({id:'job1',status:'Complete',completed:0,total:0}));
  await importTemplatesViaSpecJob({id:'p1',version:7,spec:cur} as Project,'slab',s.templates,new Set(['S1','S2']),()=>{},job as any);
  expect(job).toHaveBeenCalledTimes(1);const [pid,next,v]=job.mock.calls[0];expect([pid,v]).toEqual(['p1',7]);
  expect(next.slabTemplates!.map(t=>[t.name,t.id])).toEqual([['S9','s9'],['S1','old1'],['S2','sl-S2']]);
  expect(next.slabTemplates!.find(t=>t.name==='S1')).toMatchObject({group:'L2',rebar:{shortBottom:{diameter:12}}});
  await expect(importTemplatesViaSpecJob({id:'p1',version:7,spec:cur} as Project,'slab',s.templates,new Set(),()=>{},job as any)).rejects.toThrow();
 },60000);
});
