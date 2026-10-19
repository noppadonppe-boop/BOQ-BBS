import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,admin,guard} from './auth-persistence-qa.mjs';
const ctx=JSON.parse(await fs.readFile('tmp/current-permissions-context.json','utf8')),b=await chromium.launch({headless:true}),m=await b.newPage(),v=await b.newPage(),cloud=[],errors=[];
try{
 for(const p of [m,v]){await guard(p,cloud,errors);await p.goto('http://127.0.0.1:5291/tests/context-harness.html');}
 await m.evaluate(async a=>(await import('/src/auth/authService.ts')).loginWithEmail(a.email,a.password),admin);
 await v.evaluate(async a=>(await import('/src/auth/authService.ts')).loginWithEmail(a.email,a.password),ctx.users[1]);
 await m.evaluate(async q=>{
  const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),d=await import('/src/domain/storageCodec.ts');const exists=await h.getDocFromServer(h.doc(f.db,'projects/constructor'));if(exists.exists())throw Error('Literal-key fixture already exists; never replace it');
  await f.command('createProject',undefined,{project:{code:'LITERAL-SCOPE-QA',name:'Literal project-role key QA'}},'constructor');
  const member=(await import('/src/domain/model.ts')).blankMember('Custom','LITERAL-QA');await f.command('saveMember','constructor',{member});
  const profile=d.decodeStorage((await h.getDocFromServer(h.doc(f.db,'my-boq-app/root/users/'+q.email))).data());
  await f.command('updateUserProfile',undefined,{profile:{email:q.email,profileVersion:profile.profileVersion,status:'approved',roles:['Admin'],assignedProjects:['constructor'],projectRoles:JSON.parse('{"constructor":["viewer"]}')}});
 },ctx.users[1]);
 const result=await v.evaluate(async()=>{
  const f=await import('/src/data/firebase.ts'),h=await import('/tests/direct-browser-harness.ts'),d=await import('/src/domain/storageCodec.ts'),a=await import('/src/domain/authAccess.ts');
  const profile=d.decodeStorage((await h.getDocFromServer(h.doc(f.db,'my-boq-app/root/users/'+f.auth.currentUser.email))).data()),project=d.decodeStorage((await h.getDocFromServer(h.doc(f.db,'projects/constructor'))).data()),docs=await h.getDocs(h.collection(f.db,'projects/constructor/members')),member=d.decodeStorage(docs.docs[0].data());
  let api;try{await f.command('saveMember','constructor',{member:{...member,description:'Denied scoped Viewer edit'}});api='allowed';}catch(e){api=e.code;}
  let raw;try{const batch=h.writeBatch(f.db);batch.update(h.doc(f.db,'projects/constructor'),{version:project.version+1});batch.update(docs.docs[0].ref,{description:'Denied consistent raw Viewer edit',version:member.version+1});await batch.commit();raw='allowed';}catch(e){raw=e.code;}
  return {hasOwnScope:Object.hasOwn(profile.projectRoles,'constructor'),effective:a.assignedRoles(profile,'constructor'),global:profile.roles,api,raw};
 });
 assert.equal(result.hasOwnScope,true);assert.deepEqual(result.global,['Admin']);assert.deepEqual(result.effective,['viewer']);assert.equal(result.api,'permission-denied');assert.equal(result.raw,'permission-denied');assert.deepEqual(cloud,[]);assert.deepEqual(errors,[]);
 await fs.writeFile('output/current-permissions-verification/literal-scope-results.json',JSON.stringify({status:'PASS',literalProjectKey:'constructor',ownSerializedScopeRetained:true,broaderGlobalAdminRoleDoesNotOverrideViewerScope:true,apiDenied:true,consistentRawBatchDenied:true,productionRequests:false,cloud,errors},null,2));console.log('PASS actual literal scope survives serialization; globalAdmin staysViewer inthatproject, API and consistent raw batch deny');
}finally{await b.close();}
