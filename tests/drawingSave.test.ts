// Drawing Edit end to end in the command layer: the real `saveMemberDrawing` / `saveMember` code (src/data/direct/members.ts,
// projectTransaction, role checks) against an in-memory Firestore stand-in (firebase/firestore mocked: doc / getDoc / getDocs
// with where · orderBy · limit / runTransaction). Checks: drawing-only saves keep the member status, roles admin / qs /
// detailer, other roles denied, version conflicts, detailer cannot save member data, saveMember still returns to Draft.
import {beforeEach,describe,expect,it,vi} from 'vitest';
const store=new Map<string,unknown>();
const user={current:{uid:'u1',email:'u1@test.local',isAnonymous:false}};
vi.mock('../src/data/firebase',()=>({storage:{},db:{},emulator:true,command:async()=>({}),auth:{get currentUser(){return user.current;},authStateReady:async()=>{}}}));
vi.mock('firebase/storage',()=>({getBlob:async()=>new Blob(),ref:()=>({})}));
vi.mock('firebase/firestore',()=>{
 type Ref={path:string;id:string};type Cons={k:string;f?:string;op?:string;v?:unknown;n?:number;d?:string};
 const clone=<T,>(v:T):T=>v===undefined?v:JSON.parse(JSON.stringify(v));
 const ref=(segs:string[]):Ref=>{const path=segs.join('/');return {path,id:path.split('/').at(-1)!};};
 const snap=(r:Ref)=>({id:r.id,ref:r,exists:()=>store.has(r.path),data:()=>clone(store.get(r.path))});
 const field=(o:unknown,f:string)=>f.split('.').reduce<unknown>((a,k)=>a&&typeof a==='object'?(a as Record<string,unknown>)[k]:undefined,o);
 return {
  doc:(_db:unknown,...segs:string[])=>ref(segs),collection:(_db:unknown,...segs:string[])=>ref(segs),
  query:(c:Ref,...cons:Cons[])=>({c,cons}),where:(f:string,op:string,v:unknown)=>({k:'where',f,op,v}),limit:(n:number)=>({k:'limit',n}),orderBy:(f:string,d='asc')=>({k:'order',f,d}),
  getDoc:async(r:Ref)=>snap(r),
  getDocs:async(q:{c:Ref;cons:Cons[]}|Ref)=>{const c='c' in q?q.c:q,cons='cons' in q?q.cons:[];
   let docs=[...store.keys()].filter(k=>k.startsWith(c.path+'/')&&!k.slice(c.path.length+1).includes('/')).map(k=>snap(ref([k])));
   for(const w of cons.filter(x=>x.k==='where'))docs=docs.filter(d=>w.op==='=='?field(d.data(),w.f!)===w.v:true);
   const o=cons.find(x=>x.k==='order');if(o)docs.sort((a,b)=>{const x=Number(field(a.data(),o.f!)??-Infinity),y=Number(field(b.data(),o.f!)??-Infinity);return o.d==='desc'?y-x:x-y;});
   const l=cons.find(x=>x.k==='limit');if(l)docs=docs.slice(0,l.n);return {docs,empty:!docs.length,size:docs.length};},
  runTransaction:async(_db:unknown,fn:(tx:unknown)=>Promise<unknown>)=>{const writes:(()=>void)[]=[];
   const tx={get:async(r:Ref)=>snap(r),set:(r:Ref,v:unknown)=>{writes.push(()=>store.set(r.path,clone(v)));return tx;},update:(r:Ref,v:Record<string,unknown>)=>{writes.push(()=>store.set(r.path,{...(store.get(r.path) as object),...clone(v)}));return tx;}};
   const out=await fn(tx);writes.forEach(w=>w());return out;},
  Transaction:class{},serverTimestamp:()=>new Date().toISOString(),
 };
});
import {directMember} from '../src/data/direct/members';
import {userDocPath} from '../src/domain/auth';
import {encodeStorage,decodeStorage} from '../src/domain/storageCodec';
import type {Member,Role} from '../src/domain/model';
import type {DrawingEdits} from '../src/domain/drawingEdits';
import {memberDrawingHash} from '../src/domain/drawingStatus';
import {footingData} from './fixtures/sheets';

const PID='p1',base=footingData(2400,2400);
const edits:DrawingEdits={version:1,views:{plan:{over:{'mark:gen-bottom-x':{dx:4}},objs:[{id:'t1',kind:'text',at:[100,200],lines:['หมายเหตุ']}]}},revisions:[{rev:'A',date:'2026-11-05',desc:'แก้แบบ',by:'D'}]};
const layout={version:1,unplaced:[],sheets:[{id:'s1',views:[{view:'plan',x:30,y:30,w:170,h:120,n:'auto'}]}]};
const memberDoc=()=>decodeStorage(store.get(`projects/${PID}/members/${base.member.id}`)) as Member;
function seed(role:Role){
 store.clear();user.current={uid:'u1',email:'u1@test.local',isAnonymous:false};
 store.set(userDocPath('u1@test.local'),{uid:'u1',email:'u1@test.local',firstName:'T',lastName:'U',status:'approved',roles:['Staff'],assignedProjects:[PID],projectRoles:{[PID]:[role]},profileVersion:1});
 store.set(`projects/${PID}`,encodeStorage({...base.project,id:PID,version:7,acl:{u1:role}}));
 store.set(`projects/${PID}/members/${base.member.id}`,encodeStorage({...base.member,version:3,status:'Checked'}));
}
const drawSave=(data:Record<string,unknown>={})=>directMember('saveMemberDrawing',PID,{memberId:base.member.id,version:3,sheetLayout:layout,drawingEdits:edits,...data},crypto.randomUUID());

describe('saveMemberDrawing (drawing only)',()=>{
 beforeEach(()=>seed('detailer'));
 it('detailer: layout + edits saved, member stays Checked, versions bumped, other data untouched',async()=>{
  const r=await drawSave();expect(r).toEqual({version:4});
  const m=memberDoc();expect(m.status).toBe('Checked');expect(m.version).toBe(4);expect(m.drawingEdits).toEqual(edits);expect(m.sheetLayout).toEqual(layout);
  expect(m.bars).toEqual(base.member.bars);expect((decodeStorage(store.get(`projects/${PID}`)) as {version:number}).version).toBe(8);
 });
 it('null clears layout and edits',async()=>{await drawSave();await drawSave({version:4,sheetLayout:null,drawingEdits:null});const m=memberDoc();expect(m.sheetLayout).toBeUndefined();expect(m.drawingEdits).toBeUndefined();expect(m.status).toBe('Checked');});
 it('stale member version → aborted, nothing written',async()=>{await expect(drawSave({version:2})).rejects.toMatchObject({code:'aborted'});expect(memberDoc().drawingEdits).toBeUndefined();});
 it('invalid edits are rejected',async()=>{await expect(drawSave({drawingEdits:{version:1,views:{plan:{over:{bogus:{hidden:true}}}}}})).rejects.toBeTruthy();expect(memberDoc().version).toBe(3);});
 for(const role of ['admin','qs'] as Role[])it(`${role} may save the drawing`,async()=>{seed(role);await drawSave();expect(memberDoc().status).toBe('Checked');});
 for(const role of ['viewer','checker','approver'] as Role[])it(`${role} is denied`,async()=>{seed(role);await expect(drawSave()).rejects.toMatchObject({code:'permission-denied'});expect(memberDoc().version).toBe(3);});
});
describe('saveMember (member data) for comparison',()=>{
 it('detailer cannot save member data',async()=>{seed('detailer');await expect(directMember('saveMember',PID,{member:{...memberDoc(),drawingEdits:edits}},crypto.randomUUID())).rejects.toMatchObject({code:'permission-denied'});});
 it('qs saving the member returns it to Draft (the old rule, still used when sections change)',async()=>{seed('qs');
  await directMember('saveMember',PID,{member:{...memberDoc(),drawingEdits:edits}},crypto.randomUUID());const m=memberDoc();expect(m.status).toBe('Draft');expect(m.drawingEdits).toEqual(edits);});
 it('the drawing check hash taken before saving still matches the stored member (status stays “ตรงกับโมเดล”)',async()=>{
  for(const role of ['qs','detailer'] as Role[]){seed(role);const before=memberDoc(),hash=memberDrawingHash(before);
   if(role==='qs')await directMember('saveMember',PID,{member:{...before,drawingEdits:{...edits,check:{hash,at:'x'}}}},crypto.randomUUID());else await drawSave({drawingEdits:{...edits,check:{hash,at:'x'}}});
   expect(memberDrawingHash(memberDoc()),role).toBe(hash);}
 });
});
