// SEC1 — Firestore / Storage rules: role × action (docs/SECURITY_RULES.md). Runs on the separate demo emulators:
//   npm run test:rules
// Users: MasterAdmin, project roles admin / qs / detailer / checker / approver / viewer on p1, an approved outsider, a pending
// user, a signed-in user without a profile, an anonymous sign-in and no sign-in. Every “allowed” case has a “denied” twin.
import {afterAll,beforeAll,beforeEach,describe,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertFails,assertSucceeds,initializeTestEnvironment,type RulesTestContext,type RulesTestEnvironment} from '@firebase/rules-unit-testing';

const APP='my-boq-app',ROOT=`${APP}/root`;
let env:RulesTestEnvironment;
type U={uid:string;email:string;status?:string;roles?:string[];projects?:Record<string,string[]>};
const users:Record<string,U>={
 master:{uid:'u-master',email:'master@test.local',roles:['MasterAdmin'],projects:{}},
 admin:{uid:'u-admin',email:'admin@test.local',roles:['Staff'],projects:{p1:['admin']}},
 qs:{uid:'u-qs',email:'qs@test.local',roles:['Staff'],projects:{p1:['qs']}},
 detailer:{uid:'u-det',email:'det@test.local',roles:['Staff'],projects:{p1:['detailer']}},
 checker:{uid:'u-chk',email:'chk@test.local',roles:['Staff'],projects:{p1:['checker']}},
 approver:{uid:'u-apr',email:'apr@test.local',roles:['Staff'],projects:{p1:['approver']}},
 viewer:{uid:'u-view',email:'view@test.local',roles:['Staff'],projects:{p1:['viewer']}},
 outsider:{uid:'u-out',email:'out@test.local',roles:['Staff'],projects:{p2:['admin']}},
 globalAdmin:{uid:'u-gadm',email:'gadm@test.local',roles:['Admin'],projects:{}},
 pending:{uid:'u-pend',email:'pend@test.local',status:'pending',roles:['Staff'],projects:{p1:['admin']}},
};
const as=(k:keyof typeof users|'noProfile'|'anon'|'none'):RulesTestContext=>{
 if(k==='none')return env.unauthenticatedContext();
 if(k==='anon')return env.authenticatedContext('u-anon',{firebase:{sign_in_provider:'anonymous'}} as never);
 if(k==='noProfile')return env.authenticatedContext('u-new',{email:'new@test.local',firebase:{sign_in_provider:'password'}} as never);
 const u=users[k];return env.authenticatedContext(u.uid,{email:u.email,firebase:{sign_in_provider:'password'}} as never);
};
const db=(k:Parameters<typeof as>[0])=>as(k).firestore();
const st=(k:Parameters<typeof as>[0])=>as(k).storage();
const project=(id:string,over:Record<string,unknown>={})=>({id,code:id.toUpperCase(),name:id,location:'',owner:'',notes:'',acl:{'u-admin':'admin'},roleSets:{},version:3,createdAt:'2026-11-01',
 spec:{designCode:'ACI'},titleBlock:{company:'',drawnBy:'',checkedBy:'',drawingPrefix:''},...over});

beforeAll(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-boq-rules',
  firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8481},
  storage:{rules:readFileSync('storage.rules','utf8'),host:'127.0.0.1',port:9681}});
});
afterAll(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();await env.clearStorage();
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  for(const u of Object.values(users))await d.doc(`${ROOT}/users/${u.email}`).set({uid:u.uid,email:u.email,status:u.status||'approved',roles:u.roles,role:u.roles![0],assignedProjects:Object.keys(u.projects||{}),projectRoles:u.projects||{},profileVersion:1,firstName:'',lastName:''});
  await d.doc(`${ROOT}/appMeta/config`).set({firstUserRegistered:true,firstUid:'u-master',totalUsers:Object.keys(users).length});
  await d.doc('projects/p1').set(project('p1'));await d.doc('projects/p2').set(project('p2',{acl:{'u-out':'admin'}}));
  await d.doc('projects/p1/members/m1').set({id:'m1',code:'B1',version:1,bars:[],status:'Draft'});
  await d.doc('projects/p1/attachments/a1').set({id:'a1',name:'x.pdf',memberId:'m1'});
  for(const c2 of ['operations','accessEvents','revisionEvents','revisions','stockLedger','aiSendLog'])await d.doc(`projects/p1/${c2}/x1`).set({id:'x1',uid:'u-admin',actorUid:'u-admin'});
  await d.doc('projects/p1/specChangeJobs/j1').set({id:'j1',status:'Applying'});
  await d.doc(`${ROOT}/apiProviders/config`).set({version:1,activeProvider:'anthropic',providers:{anthropic:{model:'m',hasApiKey:true}}});
  await d.doc(`${ROOT}/apiProviderSecrets/anthropic`).set({apiKey:'sk-secret'});
  await d.doc(`${ROOT}/specProfiles/s1`).set({id:'s1',name:'Std'});
  await d.doc(`${ROOT}/directory/u-qs`).set({uid:'u-qs',email:'qs@test.local',status:'approved',profileVersion:1});
  await c.storage().ref('projects/p1/files/a1/x.pdf').put(new Uint8Array([1,2,3]),{contentType:'application/pdf'});
 });
});

describe('sign-in',()=>{
 it('no sign-in / anonymous / no profile / pending: no project data',async()=>{
  for(const k of ['none','anon','noProfile','pending'] as const){await assertFails(db(k).doc('projects/p1').get());await assertFails(db(k).doc('projects/p1/members/m1').get());}
  await assertFails(db('none').doc(`${ROOT}/users/admin@test.local`).get());
 });
});
describe('projects',()=>{
 it('members read their project, outsiders do not; list by id works for members',async()=>{
  for(const k of ['admin','qs','detailer','checker','approver','viewer','master'] as const){await assertSucceeds(db(k).doc('projects/p1').get());await assertSucceeds(db(k).collection('projects/p1/members').get());}
  await assertFails(db('outsider').doc('projects/p1').get());await assertFails(db('outsider').collection('projects/p1/members').get());
  const firebase=await import('firebase/compat/app');
  await assertSucceeds(db('qs').collection('projects').where(firebase.default.firestore.FieldPath.documentId(),'in',['p1']).get());
  await assertFails(db('qs').collection('projects').where(firebase.default.firestore.FieldPath.documentId(),'in',['p1','p2']).get());
  await assertSucceeds(db('master').collection('projects').get());await assertFails(db('qs').collection('projects').get());
 });
 it('project keys by role: version bump by any role (also viewer), spec admin / QS / approver, ACL / aiConsent admin only, no delete',async()=>{
  await assertSucceeds(db('viewer').doc('projects/p1').update({version:4,revisionCounter:2}));
  await assertFails(db('viewer').doc('projects/p1').update({version:2}));// never back
  await assertFails(db('viewer').doc('projects/p1').update({spec:{designCode:'EIT'}}));
  await assertSucceeds(db('qs').doc('projects/p1').update({spec:{designCode:'EIT'},version:4}));
  await assertSucceeds(db('approver').doc('projects/p1').update({spec:{designCode:'BS'},version:4}));
  await assertFails(db('qs').doc('projects/p1').update({acl:{'u-qs':'admin'},version:4}));
  await assertFails(db('qs').doc('projects/p1').update({aiConsent:{enabled:true,by:'qs',at:'t'}}));
  await assertFails(db('detailer').doc('projects/p1').update({locations:{version:1}}));
  await assertSucceeds(db('admin').doc('projects/p1').update({acl:{'u-admin':'admin','u-qs':'admin'},version:4}));
  await assertSucceeds(db('admin').doc('projects/p1').update({aiConsent:{enabled:true,by:'admin',at:'t'},version:5}));
  await assertFails(db('admin').doc('projects/p1').update({aiSendLog:[]}));
  await assertFails(db('admin').doc('projects/p1').update({unknownKey:1}));
  await assertFails(db('admin').doc('projects/p1').delete());await assertFails(db('master').doc('projects/p1').delete());
  await assertFails(db('outsider').doc('projects/p1').update({version:9}));
 });
 it('create a project: global admin with self as admin; others not',async()=>{
  const ok=db('globalAdmin'),b=ok.batch();
  b.set(ok.doc('projects/p3'),project('p3',{acl:{'u-gadm':'admin'},version:1}));
  b.update(ok.doc(`${ROOT}/users/gadm@test.local`),{assignedProjects:['p3'],projectRoles:{p3:['admin']},profileVersion:2,updatedAt:'t',accessChange:{projectId:'p3',operationId:'p3',kind:'CreateProject'}});
  await assertSucceeds(b.commit());
  const bad=db('qs'),b2=bad.batch();b2.set(bad.doc('projects/p4'),project('p4',{acl:{'u-qs':'admin'},version:1}));await assertFails(b2.commit());
  const sneaky=db('globalAdmin'),b3=sneaky.batch();// cannot grant itself an existing project
  b3.update(sneaky.doc(`${ROOT}/users/gadm@test.local`),{assignedProjects:['p1'],projectRoles:{p1:['admin']},profileVersion:2,updatedAt:'t',accessChange:{projectId:'p1',operationId:'x',kind:'CreateProject'}});await assertFails(b3.commit());
 });
});
describe('members by role',()=>{
 const m={id:'m1',code:'B1',version:2,bars:[{id:'b'}],status:'Draft'};
 it('admin / QS write and delete; detailer only the drawing; checker / approver only the review; viewer nothing',async()=>{
  await assertSucceeds(db('qs').doc('projects/p1/members/m1').set(m));await assertSucceeds(db('qs').doc('projects/p1/members/m9').set({...m,id:'m9'}));
  await assertSucceeds(db('admin').doc('projects/p1/members/m9').delete());
  await assertSucceeds(db('detailer').doc('projects/p1/members/m1').update({sheetLayout:{v:1},drawingEdits:{v:1},version:2}));
  await assertFails(db('detailer').doc('projects/p1/members/m1').update({bars:[{id:'x'}],version:2}));
  await assertSucceeds(db('checker').doc('projects/p1/members/m1').update({status:'Checked',review:{by:'chk'},version:2}));
  await assertFails(db('checker').doc('projects/p1/members/m1').update({code:'B9'}));
  await assertFails(db('viewer').doc('projects/p1/members/m1').update({version:2}));await assertFails(db('viewer').doc('projects/p1/members/m2').set(m));
  await assertFails(db('detailer').doc('projects/p1/members/m1').delete());await assertFails(db('outsider').doc('projects/p1/members/m1').get());
 });
 it('sources: admin / QS add and supersede, nobody deletes; spec-change jobs admin / QS',async()=>{
  await assertSucceeds(db('qs').doc('projects/p1/attachments/a2').set({id:'a2'}));await assertFails(db('viewer').doc('projects/p1/attachments/a3').set({id:'a3'}));
  await assertFails(db('master').doc('projects/p1/attachments/a1').delete());
  await assertSucceeds(db('qs').doc('projects/p1/specChangeJobs/j1').update({status:'Complete'}));await assertFails(db('checker').doc('projects/p1/specChangeJobs/j1').update({status:'Complete'}));
 });
});
describe('append-only records',()=>{
 it('operations / access events / revision events / revisions / stock ledger / AI log: create only, never edit or delete (also MasterAdmin)',async()=>{
  for(const c of ['operations','accessEvents','revisionEvents','revisions','stockLedger','aiSendLog'])for(const k of ['admin','master'] as const){
   await assertFails(db(k).doc(`projects/p1/${c}/x1`).update({id:'changed'}));await assertFails(db(k).doc(`projects/p1/${c}/x1`).delete());}
  await assertSucceeds(db('viewer').doc('projects/p1/operations/o2').set({id:'o2',uid:'u-view',action:'export'}));
  await assertFails(db('viewer').doc('projects/p1/operations/o3').set({id:'o3',uid:'u-admin'}));// not as someone else
  await assertSucceeds(db('admin').doc('projects/p1/accessEvents/e2').set({id:'e2',actorUid:'u-admin'}));await assertFails(db('qs').doc('projects/p1/accessEvents/e3').set({id:'e3',actorUid:'u-qs'}));
 });
 it('AI send log: by the sender, admin / QS / detailer, only while the project allows AI',async()=>{
  const e=(u:U)=>({id:'l2',uid:u.uid,email:u.email,task:'slabPlan',attachmentId:'a1',fileName:'x.pdf',page:1,views:7,provider:'anthropic',model:'m',at:'t'});
  await assertFails(db('qs').doc('projects/p1/aiSendLog/l2').set(e(users.qs)));// consent off
  await env.withSecurityRulesDisabled(c=>c.firestore().doc('projects/p1').update({aiConsent:{enabled:true,by:'admin',at:'t'}}));
  await assertSucceeds(db('qs').doc('projects/p1/aiSendLog/l2').set(e(users.qs)));
  await assertFails(db('qs').doc('projects/p1/aiSendLog/l3').set({...e(users.admin),id:'l3'}));// as someone else
  await assertFails(db('viewer').doc('projects/p1/aiSendLog/l4').set({...e(users.viewer),id:'l4'}));
  await assertFails(db('qs').doc('projects/p1/aiSendLog/l2').update({page:2}));
 });
});
describe('profiles, access, directory',()=>{
 it('own profile: optional fields only; never own roles / status / projects',async()=>{
  await assertSucceeds(db('qs').doc(`${ROOT}/users/qs@test.local`).update({firstName:'Q',profileVersion:2,updatedAt:'t'}));
  await assertFails(db('qs').doc(`${ROOT}/users/qs@test.local`).update({roles:['MasterAdmin']}));
  await assertFails(db('pending').doc(`${ROOT}/users/pend@test.local`).update({status:'approved'}));
  await assertFails(db('qs').doc(`${ROOT}/users/qs@test.local`).update({projectRoles:{p1:['admin']}}));
  await assertFails(db('qs').doc(`${ROOT}/users/admin@test.local`).get());await assertSucceeds(db('master').doc(`${ROOT}/users/admin@test.local`).get());
  await assertSucceeds(db('master').doc(`${ROOT}/users/pend@test.local`).update({status:'approved'}));
 });
 it('project admin: role of a user in that project only; QS cannot',async()=>{
  const grant=(pid:string)=>({assignedProjects:['p2',pid],projectRoles:{p2:['admin'],[pid]:['qs']},profileVersion:2,updatedAt:'t',accessChange:{projectId:pid,operationId:'op'}});
  await assertSucceeds(db('admin').doc(`${ROOT}/users/out@test.local`).update(grant('p1')));
  await assertFails(db('qs').doc(`${ROOT}/users/out@test.local`).update(grant('p1')));
  await assertFails(db('admin').doc(`${ROOT}/users/out@test.local`).update({...grant('p1'),roles:['MasterAdmin']}));
  await assertFails(db('admin').doc(`${ROOT}/users/out@test.local`).update({assignedProjects:[],projectRoles:{p1:['qs']},profileVersion:2,updatedAt:'t',accessChange:{projectId:'p1',operationId:'op'}}));// removes p2 too
 });
 it('registration: pending Staff for oneself; never approved / MasterAdmin when an account exists',async()=>{
  const n=db('noProfile'),b=n.batch(),me={uid:'u-new',email:'new@test.local',firstName:'',lastName:'',position:'',department:'',role:'Staff',roles:['Staff'],status:'pending',assignedProjects:[],projectRoles:{},profileVersion:1,photoURL:'',isFirstUser:false};
  b.set(n.doc(`${ROOT}/users/new@test.local`),me);b.set(n.doc(`${ROOT}/appMeta/config`),{firstUserRegistered:true,firstUid:'u-master',totalUsers:Object.keys(users).length+1},{merge:true});
  b.set(n.doc(`${ROOT}/directory/u-new`),{uid:'u-new',email:'new@test.local',firstName:'',lastName:'',status:'pending',profileVersion:1});b.set(n.doc(`${ROOT}/directoryEmails/new@test.local`),{uid:'u-new',email:'new@test.local'});
  await assertSucceeds(b.commit());
  const n2=env.authenticatedContext('u-new2',{email:'new2@test.local',firebase:{sign_in_provider:'password'}} as never).firestore();
  await assertFails(n2.doc(`${ROOT}/users/new2@test.local`).set({...me,uid:'u-new2',email:'new2@test.local',status:'approved',roles:['MasterAdmin'],role:'MasterAdmin',isFirstUser:true}));
  await assertFails(n2.doc(`${ROOT}/users/other@test.local`).set({...me,uid:'u-new2',email:'other@test.local'}));
 });
 it('first account of an empty workspace = the approved MasterAdmin',async()=>{
  await env.withSecurityRulesDisabled(c=>c.firestore().doc(`${ROOT}/appMeta/config`).delete());
  const n=db('noProfile'),b=n.batch();
  b.set(n.doc(`${ROOT}/users/new@test.local`),{uid:'u-new',email:'new@test.local',role:'MasterAdmin',roles:['MasterAdmin'],status:'approved',assignedProjects:[],projectRoles:{},profileVersion:1,isFirstUser:true});
  b.set(n.doc(`${ROOT}/appMeta/config`),{firstUserRegistered:true,firstUid:'u-new',totalUsers:1},{merge:true});await assertSucceeds(b.commit());
 });
 it('directory: approved users read; own entry follows the own status',async()=>{
  await assertSucceeds(db('viewer').doc(`${ROOT}/directory/u-qs`).get());await assertFails(db('pending').doc(`${ROOT}/directory/u-qs`).get());
  await assertFails(db('qs').doc(`${ROOT}/directory/u-qs`).set({uid:'u-qs',email:'qs@test.local',status:'pending',profileVersion:1}));
  await assertSucceeds(db('qs').doc(`${ROOT}/directory/u-qs`).set({uid:'u-qs',email:'qs@test.local',status:'approved',profileVersion:1}));
 });
});
describe('workspace settings and secrets',()=>{
 it('AI provider config: approved read (no secret in it), MasterAdmin writes; secrets: nobody reads, MasterAdmin writes',async()=>{
  await assertSucceeds(db('viewer').doc(`${ROOT}/apiProviders/config`).get());await assertFails(db('admin').doc(`${ROOT}/apiProviders/config`).set({version:1}));
  await assertSucceeds(db('master').doc(`${ROOT}/apiProviders/config`).set({version:1,activeProvider:null,providers:{}}));
  for(const k of ['master','admin','viewer','none'] as const)await assertFails(db(k).doc(`${ROOT}/apiProviderSecrets/anthropic`).get());
  await assertFails(db('master').collection(`${ROOT}/apiProviderSecrets`).get());
  await assertSucceeds(db('master').doc(`${ROOT}/apiProviderSecrets/openai`).set({apiKey:'sk-new'}));await assertSucceeds(db('master').doc(`${ROOT}/apiProviderSecrets/anthropic`).set({apiKey:''}));
  await assertFails(db('globalAdmin').doc(`${ROOT}/apiProviderSecrets/openai`).set({apiKey:'x'}));await assertFails(db('master').doc(`${ROOT}/apiProviderSecrets/anthropic`).delete());
 });
 it('General Spec profiles: approved read, global admins write; activity log create only',async()=>{
  await assertSucceeds(db('viewer').doc(`${ROOT}/specProfiles/s1`).get());await assertFails(db('qs').doc(`${ROOT}/specProfiles/s1`).set({id:'s1',name:'x'}));
  await assertSucceeds(db('globalAdmin').doc(`${ROOT}/specProfiles/s1`).set({id:'s1',name:'x'}));
  await assertSucceeds(db('qs').collection(`${ROOT}/activityLogs`).add({action:'LOGIN',uid:'u-qs'}));await assertFails(db('qs').collection(`${ROOT}/activityLogs`).add({action:'LOGIN',uid:'u-admin'}));
  await assertFails(db('qs').collection(`${ROOT}/activityLogs`).get());
 });
});
describe('Storage',()=>{
 const bytes=(n:number)=>new Uint8Array(n);
 it('members read project files; outsiders and anonymous do not',async()=>{
  await assertSucceeds(st('viewer').ref('projects/p1/files/a1/x.pdf').getMetadata());
  await assertFails(st('outsider').ref('projects/p1/files/a1/x.pdf').getMetadata());await assertFails(st('anon').ref('projects/p1/files/a1/x.pdf').getMetadata());
 });
 it('files written once by admin / QS (type / size); never overwritten or deleted',async()=>{
  await assertSucceeds(st('qs').ref('projects/p1/files/a2/y.pdf').put(bytes(10),{contentType:'application/pdf'}));
  await assertFails(st('viewer').ref('projects/p1/files/a3/y.pdf').put(bytes(10),{contentType:'application/pdf'}));
  await assertFails(st('qs').ref('projects/p1/files/a4/y.exe').put(bytes(10),{contentType:'application/x-msdownload'}));
  await assertFails(st('qs').ref('projects/p1/files/a1/x.pdf').put(bytes(10),{contentType:'application/pdf'}));// overwrite
  await assertFails(st('master').ref('projects/p1/files/a1/x.pdf').delete());
 });
 it('exports by any project role; logo admin only, image ≤ 2 MB; other paths closed',async()=>{
  await assertSucceeds(st('viewer').ref('projects/p1/exports/e1.xlsx').put(bytes(10),{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  await assertFails(st('outsider').ref('projects/p1/exports/e2.xlsx').put(bytes(10)));
  await assertSucceeds(st('admin').ref('projects/p1/branding/logo.png').put(bytes(10),{contentType:'image/png'}));
  await assertFails(st('qs').ref('projects/p1/branding/logo2.png').put(bytes(10),{contentType:'image/png'}));
  await assertFails(st('admin').ref('projects/p1/branding/logo3.png').put(bytes(3*1024*1024),{contentType:'image/png'}));
  await assertFails(st('master').ref('elsewhere/x.txt').put(bytes(10)));
  await assertSucceeds(st('qs').ref('projects/p1/spec-manifests/h.json').put(bytes(10),{contentType:'application/json'}));
  await assertFails(st('qs').ref('projects/p1/restore-manifests/h.json').put(bytes(10),{contentType:'application/json'}));
 });
});
