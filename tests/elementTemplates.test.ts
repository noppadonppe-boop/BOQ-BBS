// T1 element templates end to end in the data layer: the real `saveTemplate` / `setTemplateDefault` / `proposeTemplate` /
// `decideProposal` / `migrateLegacyTemplates` and `saveMember` code against an in-memory Firestore stand-in (firebase/firestore
// mocked like tests/drawingSave.test.ts, plus tx.delete / nested paths), and the domain pieces (memberFromTemplate, spec
// differences, defaults, backup / restore, include options). Rules are checked separately by `npm run test:rules`.
import {beforeEach,describe,expect,it,vi} from 'vitest';
const store=new Map<string,unknown>();
const user={current:{uid:'u-qs',email:'qs@test.local',isAnonymous:false}};
vi.mock('../src/data/firebase',()=>({storage:{},db:{},emulator:true,command:async()=>({}),auth:{get currentUser(){return user.current;},authStateReady:async()=>{}}}));
vi.mock('firebase/storage',()=>({getBlob:async()=>new Blob(),ref:()=>({})}));
vi.mock('firebase/firestore',()=>{
 type Ref={path:string;id:string};type Cons={k:string;f?:string;op?:string;v?:unknown;n?:number;d?:string};
 const clone=<T,>(v:T):T=>v===undefined?v:JSON.parse(JSON.stringify(v));
 const ref=(segs:string[]):Ref=>{const path=segs.join('/');return {path,id:path.split('/').at(-1)!};};
 const snap=(r:Ref)=>({id:r.id,ref:r,exists:()=>store.has(r.path),data:()=>clone(store.get(r.path))});
 const field=(o:unknown,f:string)=>f.split('.').reduce<unknown>((a,k)=>a&&typeof a==='object'?(a as Record<string,unknown>)[k]:undefined,o);
 const list=(q:{c:Ref;cons:Cons[]}|Ref)=>{const c='c' in q?q.c:q,cons='cons' in q?q.cons:[];
  let docs=[...store.keys()].filter(k=>k.startsWith(c.path+'/')&&!k.slice(c.path.length+1).includes('/')).map(k=>snap(ref([k])));
  for(const w of cons.filter(x=>x.k==='where'))docs=docs.filter(d=>w.op==='=='?field(d.data(),w.f!)===w.v:true);
  const l=cons.find(x=>x.k==='limit');if(l)docs=docs.slice(0,l.n);return {docs,empty:!docs.length,size:docs.length};};
 return {
  doc:(_db:unknown,...segs:string[])=>ref(segs),collection:(_db:unknown,...segs:string[])=>ref(segs),
  query:(c:Ref,...cons:Cons[])=>({c,cons}),where:(f:string,op:string,v:unknown)=>({k:'where',f,op,v}),limit:(n:number)=>({k:'limit',n}),orderBy:(f:string,d='asc')=>({k:'order',f,d}),documentId:()=>'__id__',startAfter:()=>({k:'start'}),
  getDoc:async(r:Ref)=>snap(r),getDocs:async(q:{c:Ref;cons:Cons[]}|Ref)=>list(q),getDocsFromServer:async(q:{c:Ref;cons:Cons[]}|Ref)=>list(q),onSnapshot:()=>()=>{},
  runTransaction:async(_db:unknown,fn:(tx:unknown)=>Promise<unknown>)=>{const writes:(()=>void)[]=[];
   const tx={get:async(r:Ref)=>snap(r),set:(r:Ref,v:unknown)=>{writes.push(()=>store.set(r.path,clone(v)));return tx;},update:(r:Ref,v:Record<string,unknown>)=>{writes.push(()=>store.set(r.path,{...(store.get(r.path) as object),...clone(v)}));return tx;},delete:(r:Ref)=>{writes.push(()=>store.delete(r.path));return tx;}};
   const out=await fn(tx);writes.forEach(w=>w());return out;},
  Transaction:class{},serverTimestamp:()=>new Date().toISOString(),
 };
});
import {decideProposal,migrateLegacyTemplates,proposeTemplate,saveTemplate,setTemplateDefault} from '../src/data/elementTemplates';
import {directMember} from '../src/data/direct/members';
import {userDocPath} from '../src/domain/auth';
import {encodeStorage,decodeStorage} from '../src/domain/storageCodec';
import {applyElementInput,type FoundationInput} from '../src/domain/elementInput';
import {takeoff,validateMember} from '../src/domain/engine';
import {detailingFromSpec} from '../src/domain/specDetailing';
import {memberDrawingHash} from '../src/domain/drawingStatus';
import {categoryDefaults,centralTemplatesPath,elementTemplateSchema,memberFromTemplate,newerVersion,projectTemplatesPath,specDifferences,templateKey,templatePayload,templateProposalsPath,
 type ElementTemplate,type TemplateProposal} from '../src/domain/elementTemplates';
import {restoredTemplateDefaults,restoredTemplateEntries,validateBackupStructure} from '../src/domain/restorePreflight';
import {buildRestorePlan} from '../src/domain/restorePlan';
import type {Member,Project,Role,SnapshotBundle,Spec} from '../src/domain/model';
import {footingData} from './fixtures/sheets';

const PID='p1',base=footingData(3000,2600);
const sourceProject:Project={...base.project,id:PID,code:'J-078',version:7};
const users={qs:{uid:'u-qs',email:'qs@test.local',role:'qs'},viewer:{uid:'u-view',email:'view@test.local',role:'viewer'},admin:{uid:'u-adm',email:'adm@test.local',role:'admin'},master:{uid:'u-master',email:'master@test.local',role:'MasterAdmin'}} as const;
type Who=keyof typeof users;
const as=(k:Who)=>{const u=users[k];user.current={uid:u.uid,email:u.email,isAnonymous:false};};
const read=<T,>(path:string)=>decodeStorage(store.get(path) as Record<string,unknown>) as T;
const projectDoc=()=>read<Project>(`projects/${PID}`);
function seed(){
 store.clear();
 for(const [k,u] of Object.entries(users))store.set(userDocPath(u.email),{uid:u.uid,email:u.email,firstName:k,lastName:'T',status:'approved',roles:k==='master'?['MasterAdmin']:['Staff'],assignedProjects:k==='master'?[]:[PID],projectRoles:k==='master'?{}:{[PID]:[u.role as Role]},profileVersion:1});
 store.set(`projects/${PID}`,encodeStorage({...sourceProject,acl:{}}));
 as('qs');
}
const payloadOf=(m:Member,spec:Spec=sourceProject.spec,include?:Parameters<typeof templatePayload>[1]['include'])=>templatePayload(m,{spec,...(include?{include}:{})});
const marks=(m:Member)=>takeoff(m,sourceProject.spec).rows.map(r=>`${r.mark}:${r.diameter}:${Math.round(r.cutLength)}:${r.count}`).sort();
const pick=(m:Member)=>{const q=takeoff(m,sourceProject.spec);return {concrete:q.concrete,formwork:q.formwork,rebar:Math.round(q.rebar*1000)/1000,bars:m.bars.length};};

describe('1 · project template → new independent member',()=>{
 beforeEach(seed);
 it('qs saves a project template; a member made from it under another code equals the source (same spec), edits and saves like any member',async()=>{
  const t=await saveTemplate({level:'project',project:sourceProject,name:'ฐานรากเข็ม 4 ต้น',description:'F-02',category:'Foundation',payload:payloadOf(base.member),key:templateKey('Foundation',base.member.elementInput)});
  expect(t.version).toBe(1);expect(store.has(`${projectTemplatesPath(PID)}/${t.id}`)).toBe(true);expect(t.payload.sourceSpec?.engine).toBeTruthy();
  const m=memberFromTemplate(t,'F-05',projectDoc(),{occurrence:{quantity:6,zone:'Zone C',floor:'FDN'}});
  expect(m.code).toBe('F-05');expect(m.templateSource).toEqual({scope:'project',templateId:t.id,version:1,name:'ฐานรากเข็ม 4 ต้น',projectCode:'J-078'});
  expect(m.occurrences[0]).toMatchObject({quantity:6,zone:'Zone C',floor:'FDN'});
  expect(pick(m)).toEqual(pick(base.member));expect(marks(m)).toEqual(marks(base.member));
  expect(validateMember(m,sourceProject.spec)).toEqual([]);
  await directMember('saveMember',PID,{member:m},crypto.randomUUID());
  const saved=read<Member>(`projects/${PID}/members/${m.id}`);expect(saved.templateSource?.templateId).toBe(t.id);
  // edit size and bars like a normal member, save again
  const input={...(saved.elementInput as FoundationInput),width:3400};input.rebar={...input.rebar,bottomX:{...input.rebar.bottomX,diameter:20}};
  const edited={...applyElementInput(saved,input,{rounding:sourceProject.spec.rounding}).member,occurrences:saved.occurrences};
  expect(validateMember(edited,sourceProject.spec)).toEqual([]);
  await directMember('saveMember',PID,{member:edited},crypto.randomUUID());
  const again=read<Member>(`projects/${PID}/members/${m.id}`);expect((again.elementInput as FoundationInput).width).toBe(3400);expect(again.version).toBe(saved.version+1);
  expect(again.bars.some(b=>b.diameter===20)).toBe(true);
  // the template itself is untouched
  expect(read<ElementTemplate>(`${projectTemplatesPath(PID)}/${t.id}`).version).toBe(1);
 });
 it('viewer cannot save a project template; qs cannot write central templates',async()=>{
  as('viewer');await expect(saveTemplate({level:'project',project:sourceProject,name:'x',description:'',category:'Foundation',payload:payloadOf(base.member)})).rejects.toMatchObject({code:'permission-denied'});
  as('qs');await expect(saveTemplate({level:'central',project:sourceProject,name:'x',description:'',category:'Foundation',payload:payloadOf(base.member)})).rejects.toMatchObject({code:'permission-denied'});
  expect([...store.keys()].some(k=>k.includes('elementTemplates/'))).toBe(false);
 });
 it('templateSource is not part of the drawing status hash',()=>{
  const m={...base.member,templateSource:{scope:'project' as const,templateId:'t1',version:3,name:'x'}};expect(memberDrawingHash(m)).toBe(memberDrawingHash(base.member));
 });
});

describe('2 · target spec differs (ACI → BS)',()=>{
 it('warns with what differs, regenerates the input bars with the target spec',()=>{
  const p=payloadOf(base.member),t=elementTemplateSchema.parse({id:'t1',name:'F',description:'',category:'Foundation',scope:'project',projectId:PID,projectCode:'J-078',payload:p,version:1,createdAt:'a',updatedAt:'a',createdBy:'u',updatedBy:'u'});
  const target:Project={...sourceProject,id:'p2',code:'J-090',spec:{...sourceProject.spec,designCode:'BS'} as Spec};
  expect(specDifferences(t.payload.sourceSpec,sourceProject.spec)).toEqual([]);
  const diffs=specDifferences(t.payload.sourceSpec,target.spec);expect(diffs.join(' ')).toContain('Design code ACI → BS');
  const m=memberFromTemplate(t,'F-1',target),i=m.elementInput as FoundationInput,src=base.member.elementInput as FoundationInput;
  expect(i.detailing).toEqual(detailingFromSpec(target.spec,src.detailing,{category:'Foundation',mix:src.concreteMix}));
  const direct=applyElementInput({...m,bars:[]},{...i},{rounding:target.spec.rounding}).member;
  expect(m.bars.map(b=>[b.mark,b.diameter,JSON.stringify(b.points)])).toEqual(direct.bars.map(b=>[b.mark,b.diameter,JSON.stringify(b.points)]));
  expect(validateMember(m,target.spec)).toEqual([]);
 });
});

describe('3 · project defaults',()=>{
 beforeEach(seed);
 it('“เพิ่มสมาชิก” of the category starts from the default template; “เริ่มจากค่าว่าง” keeps the old blank values',async()=>{
  const key=templateKey('Foundation',base.member.elementInput);expect(key).toMatch(/^Foundation:(spread|pile)$/);
  const t=await saveTemplate({level:'project',project:sourceProject,name:'F 3000',description:'',category:'Foundation',payload:payloadOf(base.member),key,setDefault:true});
  const p=projectDoc();expect(p.templateDefaults).toEqual({[key]:t.id});expect(p.version).toBe(8);
  const d=categoryDefaults(p.templateDefaults,'Foundation');expect(d).toEqual([{key,id:t.id}]);
  const fromDefault=memberFromTemplate(t,'F-9',p);expect((fromDefault.elementInput as FoundationInput).width).toBe(3000);
  const {defaultElementInput}=await import('../src/domain/elementInput');expect((defaultElementInput('Foundation','manual',p.spec) as FoundationInput).width).toBe(2400);
  // clear / set again by id, only templates of the project or central, category must match
  await setTemplateDefault(PID,key,null,p.version);expect(projectDoc().templateDefaults).toEqual({});
  await expect(setTemplateDefault(PID,'Beam',t.id,projectDoc().version)).rejects.toMatchObject({code:'invalid-argument'});
  await expect(setTemplateDefault(PID,key,'nope',projectDoc().version)).rejects.toMatchObject({code:'invalid-argument'});
  as('viewer');await expect(setTemplateDefault(PID,key,t.id,projectDoc().version)).rejects.toMatchObject({code:'permission-denied'});
 });
});

describe('4 · versions',()=>{
 beforeEach(seed);
 it('saving over = v2, versions/1 kept, members made from v1 unchanged (and told about v2)',async()=>{
  const t1=await saveTemplate({level:'project',project:sourceProject,name:'F',description:'one',category:'Foundation',payload:payloadOf(base.member)});
  const m1=memberFromTemplate(t1,'F-1',projectDoc());await directMember('saveMember',PID,{member:m1},crypto.randomUUID());
  const wider=footingData(3600,2600).member;
  const t2=await saveTemplate({level:'project',project:sourceProject,id:t1.id,version:1,name:'F',description:'two',category:'Foundation',payload:payloadOf(wider)});
  expect(t2.version).toBe(2);expect(t2.createdAt).toBe(t1.createdAt);
  const v1=read<ElementTemplate&{supersededAt:string}>(`${projectTemplatesPath(PID)}/${t1.id}/versions/1`);expect(v1.version).toBe(1);expect(v1.description).toBe('one');expect(v1.supersededAt).toBeTruthy();
  const stored=read<Member>(`projects/${PID}/members/${m1.id}`);expect((stored.elementInput as FoundationInput).width).toBe(3000);expect(stored.templateSource?.version).toBe(1);
  expect(newerVersion(stored.templateSource,[t2])).toBe(2);
  await expect(saveTemplate({level:'project',project:sourceProject,id:t1.id,version:1,name:'F',description:'stale',category:'Foundation',payload:payloadOf(wider)})).rejects.toMatchObject({code:'aborted'});
 });
});

describe('5 · proposals to the central library',()=>{
 beforeEach(seed);
 it('qs proposes → MasterAdmin approves → a new central template; another proposal as a new version; rejection with a reason is seen by the proposer',async()=>{
  const p=await proposeTemplate({project:sourceProject,name:'Central F',description:'',category:'Foundation',payload:payloadOf(base.member)});
  expect(p.status).toBe('pending');expect(p.uid).toBe('u-qs');
  as('qs');await expect(decideProposal({id:p.id,approve:true})).rejects.toMatchObject({code:'permission-denied'});
  as('master');const r=await decideProposal({id:p.id,approve:true});expect(r.status).toBe('approved');
  const c=read<ElementTemplate>(`${centralTemplatesPath}/${(r as {centralId:string}).centralId}`);expect(c.scope).toBe('workspace');expect(c.version).toBe(1);expect(c.origin).toMatchObject({proposalId:p.id,projectCode:'J-078'});
  expect(read<TemplateProposal>(`${templateProposalsPath}/${p.id}`)).toMatchObject({status:'approved',centralVersion:1,decidedBy:'u-master'});
  await expect(decideProposal({id:p.id,approve:false,reason:'x'})).rejects.toMatchObject({code:'aborted'});// once
  // a new version of that central template
  as('qs');const p2=await proposeTemplate({project:sourceProject,name:'Central F rev',description:'',category:'Foundation',payload:payloadOf(footingData(3600,2600).member),targetCentralId:c.id});
  as('master');await decideProposal({id:p2.id,approve:true});
  const c2=read<ElementTemplate>(`${centralTemplatesPath}/${c.id}`);expect(c2.version).toBe(2);expect(c2.name).toBe('Central F');expect(store.has(`${centralTemplatesPath}/${c.id}/versions/1`)).toBe(true);
  // rejection
  as('qs');const p3=await proposeTemplate({project:sourceProject,name:'Bad',description:'',category:'Foundation',payload:payloadOf(base.member)});
  as('master');await expect(decideProposal({id:p3.id,approve:false})).rejects.toMatchObject({code:'invalid-argument'});
  await decideProposal({id:p3.id,approve:false,reason:'ซ้ำกับ Central F'});
  expect(read<TemplateProposal>(`${templateProposalsPath}/${p3.id}`)).toMatchObject({status:'rejected',reason:'ซ้ำกับ Central F'});
  // central templates are usable everywhere: a member of another project from it carries scope central
  const m=memberFromTemplate(c2,'F-77',{...sourceProject,id:'p2',code:'J-090'});expect(m.templateSource).toMatchObject({scope:'central',version:2});
  // viewer cannot propose
  as('viewer');await expect(proposeTemplate({project:sourceProject,name:'v',description:'',category:'Foundation',payload:payloadOf(base.member)})).rejects.toMatchObject({code:'permission-denied'});
  // MasterAdmin publishes directly
  as('master');const direct=await saveTemplate({level:'central',project:sourceProject,name:'Direct',description:'',category:'Foundation',payload:payloadOf(base.member)});expect(direct.scope).toBe('workspace');
 });
});

describe('6 · migration of old project-scoped central templates',()=>{
 beforeEach(seed);
 it('moves every scope:project document into its project (same id), keeps central ones, deletes originals; a second run does nothing',async()=>{
  const p=payloadOf(base.member),doc=(id:string,scope:'project'|'workspace',pid?:string)=>elementTemplateSchema.parse({id,name:id,description:'',category:'Foundation',scope,...(pid?{projectId:pid,projectCode:pid.toUpperCase()}:{}),payload:p,version:2,createdAt:'a',updatedAt:'a',createdBy:'u',updatedBy:'u'});
  for(const t of [doc('old1','project',PID),doc('old2','project','p9'),doc('cen1','workspace')])store.set(`${centralTemplatesPath}/${t.id}`,encodeStorage(t));
  as('qs');await expect(migrateLegacyTemplates()).rejects.toMatchObject({code:'permission-denied'});
  as('master');expect(await migrateLegacyTemplates({dryRun:true})).toMatchObject({total:2,moved:2,deleted:0});expect(store.has(`${centralTemplatesPath}/old1`)).toBe(true);
  const r=await migrateLegacyTemplates();expect(r).toMatchObject({total:2,moved:2,skipped:0,deleted:2,keep:1});
  expect(read<ElementTemplate>(`${projectTemplatesPath(PID)}/old1`)).toMatchObject({id:'old1',scope:'project',version:2,projectId:PID});expect(store.has(`${projectTemplatesPath('p9')}/old2`)).toBe(true);
  expect(store.has(`${centralTemplatesPath}/old1`)).toBe(false);expect(store.has(`${centralTemplatesPath}/cen1`)).toBe(true);
  expect(await migrateLegacyTemplates()).toMatchObject({total:0,moved:0,deleted:0});
  // interrupted run (copy done, original still there) → no duplicate copy, original removed
  store.set(`${centralTemplatesPath}/old1`,encodeStorage(doc('old1','project',PID)));
  expect(await migrateLegacyTemplates()).toMatchObject({total:1,moved:0,skipped:1,deleted:1});
  expect([...store.keys()].filter(k=>k.endsWith('/old1')).length).toBe(1);
 });
});

describe('7 · backup / restore',()=>{
 it('project templates + templateDefaults travel with the backup and come back in the restored project',()=>{
  const p=payloadOf(base.member),t=elementTemplateSchema.parse({id:'t1',name:'F',description:'',category:'Foundation',scope:'project',projectId:PID,projectCode:'J-078',payload:p,version:3,createdAt:'a',updatedAt:'a',createdBy:'u',updatedBy:'u'});
  const project={...sourceProject,templateDefaults:{'Foundation:spread':'t1','Beam:group':'central-x'}};
  const bundle={schemaVersion:2,project,members:[base.member],attachments:[],stock:[],stockLedger:[],cutPlans:[],createdAt:'a',status:'Draft',version:7,historyIndex:[],elementTemplates:[t]} as unknown as SnapshotBundle;
  expect(()=>validateBackupStructure(bundle,[],[])).not.toThrow();
  const entries=restoredTemplateEntries(bundle,'p-new','NEW');expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({collection:'elementTemplates',id:'t1',data:{projectId:'p-new',projectCode:'NEW',version:3}});
  expect(restoredTemplateDefaults(bundle)).toEqual({templateDefaults:project.templateDefaults});
  const plan=buildRestorePlan(bundle,[],[],[],'job','2026-11-06T00:00:00Z');expect(plan.entries.some(e=>e.collection==='elementTemplates'&&e.id==='t1')).toBe(true);expect(plan.projectPatch.templateDefaults).toEqual(project.templateDefaults);
  expect(()=>validateBackupStructure({...bundle,elementTemplates:[{...t,scope:'workspace'}]} as unknown as SnapshotBundle,[],[])).toThrow(/Template/);
  // older backups without templates still restore
  const old={...bundle,elementTemplates:undefined,project:sourceProject} as unknown as SnapshotBundle;expect(restoredTemplateEntries(old,'p','P')).toEqual([]);expect(restoredTemplateDefaults(old)).toEqual({});
 });
});

describe('8 · include options',()=>{
 it('sheetLayout / drawingEdits come along only when chosen; own bars / BOQ items / generated bars follow their switches',()=>{
  const layout={version:1 as const,unplaced:[],sheets:[{id:'s1',views:[{view:'plan',x:30,y:30,w:170,h:120,n:'auto' as const}]}]};
  const edits={version:1 as const,views:{plan:{over:{'mark:gen-bottom-x':{dx:4}},objs:[]}},check:{hash:'h',at:'t'}};
  const own={...base.member.bars[0],id:'sk-own',mark:'X1'};
  const m={...base.member,sheetLayout:layout,drawingEdits:edits,bars:[...base.member.bars,own]} as unknown as Member;
  const all={generated:true,manual:true,siteItems:true,sheetLayout:true,drawingEdits:true},none={generated:false,manual:false,siteItems:false,sheetLayout:false,drawingEdits:false};
  const tpl=(include:typeof all)=>elementTemplateSchema.parse({id:'t',name:'t',description:'',category:'Foundation',scope:'project',payload:payloadOf(m,sourceProject.spec,include),version:1,createdAt:'a',updatedAt:'a',createdBy:'u',updatedBy:'u'});
  const withAll=memberFromTemplate(tpl(all),'A',sourceProject),withNone=memberFromTemplate(tpl(none),'B',sourceProject);
  expect(withAll.sheetLayout).toEqual(layout);expect(withAll.drawingEdits?.views).toEqual(edits.views);expect(withAll.drawingEdits?.check).toBeUndefined();
  expect(withAll.bars.some(b=>b.mark==='X1')).toBe(true);expect(withAll.bars.some(b=>b.id.startsWith('gen-'))).toBe(true);
  expect(withNone.sheetLayout).toBeUndefined();expect(withNone.drawingEdits).toBeUndefined();expect(withNone.bars).toEqual([]);
  expect(tpl(none).payload.sheetLayout).toBeUndefined();expect(tpl(none).payload.bars).toEqual([]);
  // old payloads (no include) = inputs + own bars + BOQ items, no drawing
  const legacy=elementTemplateSchema.parse({...tpl(all),payload:{...templatePayload(m),sheetLayout:undefined}});expect(memberFromTemplate(legacy,'C',sourceProject).sheetLayout).toBeUndefined();
 });
});
