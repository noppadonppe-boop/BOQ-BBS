import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({uid:'U',email:'ordinary@form.local',duringToken:false,duringFetch:false}));
vi.mock('../src/data/firebase',()=>({emulator:true,db:{app:{options:{projectId:'demo-test'}}},auth:{get currentUser(){return mock.uid?{uid:mock.uid,email:mock.email,isAnonymous:false,getIdToken:async()=>{if(mock.duringToken)mock.uid='OTHER';return 'TOKEN-ONLY-IN-MEMORY';}}:null;}}}));
vi.mock('../src/data/direct/common',()=>({must:(v:any,m:string,code:string)=>{if(!v)throw Object.assign(Error(m),{code});}}));
import {decodeDocumentValue,readProjectRecord,readOwnProfileRecord,readProjectPage,readProjectDirectoryPage} from '../src/data/projectReadback';
import {userDocPath} from '../src/domain/auth';
import {reconciledProject} from '../src/domain/projectReadback';
const doc=()=>({name:'projects/demo-test/databases/(default)/documents/projects/P/specChangeJobs/J',fields:{id:{stringValue:'J'},status:{stringValue:'Complete'},completed:{integerValue:'57'},total:{integerValue:'57'}}});
beforeEach(()=>{mock.uid='U';mock.email='ordinary@form.local';mock.duringToken=mock.duringFetch=false;vi.stubGlobal('fetch',vi.fn(async()=>{if(mock.duringFetch)mock.uid='OTHER';return {ok:true,status:200,json:async()=>doc()};}));});
it('Decodes typed metadata and preserves literal empty arrays/null/zero without unsafe integers',()=>{expect(decodeDocumentValue({mapValue:{fields:{a:{arrayValue:{}},b:{nullValue:null},c:{integerValue:'0'}}}})).toEqual({a:[],b:null,c:0});expect(()=>decodeDocumentValue({integerValue:'9007199254740993'})).toThrow();});
it('Uses only authenticated GET to the scoped Firebase document, never an admin token or data mutation',async()=>{expect(await readProjectRecord('P','specChangeJobs','J')).toMatchObject({completed:57});const [url,options]=vi.mocked(fetch).mock.calls[0];expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:/);expect(String(url)).toContain('/projects/P/specChangeJobs/J');expect(options?.method).toBe('GET');expect(options?.body).toBeUndefined();});
it('Rejects an account switch before dispatch and after response',async()=>{mock.duringToken=true;await expect(readProjectRecord('P','specChangeJobs','J')).rejects.toMatchObject({code:'aborted'});expect(fetch).not.toHaveBeenCalled();mock.uid='U';mock.duringToken=false;mock.duringFetch=true;await expect(readProjectRecord('P','specChangeJobs','J')).rejects.toMatchObject({code:'aborted'});});
it('Respects missing/denied documents and rejects foreign response identity',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:403})));await expect(readProjectRecord('P','specChangeJobs','J')).rejects.toMatchObject({code:'permission-denied'});vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:404})));expect(await readProjectRecord('P','specChangeJobs','J')).toBeUndefined();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({...doc(),name:'projects/FOREIGN/databases/(default)/documents/projects/Q/specChangeJobs/J'})})));await expect(readProjectRecord('P','specChangeJobs','J')).rejects.toThrow('ไม่ตรงโครงการ');});
it('Rejects traversal before obtaining or transmitting a token',async()=>{await expect(readProjectRecord('../P')).rejects.toMatchObject({code:'invalid-argument'});expect(fetch).not.toHaveBeenCalled();});
it.each(['member#tag@form.local','member?tag@form.local','member%tag@form.local','member+tag@form.local'])('Reads the exact own profile for reserved characters in %s',async email=>{
 mock.email=email;const name='projects/demo-test/databases/(default)/documents/'+userDocPath(email);
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({name,fields:{uid:{stringValue:'U'},email:{stringValue:email}}})})));
 expect(await readOwnProfileRecord()).toMatchObject({uid:'U',email});
 const url=new URL(String(vi.mocked(fetch).mock.calls[0][0]));expect(url.hash).toBe('');expect(url.search).toBe('');expect(decodeURIComponent(url.pathname)).toBe('/v1/'+name);
});
it('Keeps page tokens as a single query value on both scoped and directory pages',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({documents:[],nextPageToken:'NEXT'})})));
 const token='a/b+c==?pageSize=999&other=#%';await readProjectPage('P','members',token);await readProjectDirectoryPage(token);
 for(const [raw]of vi.mocked(fetch).mock.calls){const url=new URL(String(raw));expect(url.searchParams.get('pageToken')).toBe(token);expect(url.searchParams.get('pageSize')).toBe('50');expect(url.searchParams.get('orderBy')).toBe('__name__ ASC');expect(String(raw)).toContain('orderBy=__name__%20ASC');expect(url.searchParams.has('other')).toBe(false);expect(url.hash).toBe('');}
});
it('Still rejects foreign profile names and UIDs after path encoding',async()=>{
 mock.email='member#tag@form.local';const name='projects/demo-test/databases/(default)/documents/'+userDocPath(mock.email);
 for(const record of [{name:name.replace('member#tag','member'),fields:{uid:{stringValue:'U'}}},{name,fields:{uid:{stringValue:'OTHER'}}}]){
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>record})));
  await expect(readOwnProfileRecord()).rejects.toThrow('บัญชีตอบกลับไม่ตรง');
 }
});
it('Retains verified progress/terminal versions against delayed listener data without swallowing a genuine next job/version',()=>{const p=(version:number,status:string,completed=0,id='J')=>({id:'P',version,specChangeState:{id,status,completed,total:57}} as any),known=p(3,'Complete',57);expect(reconciledProject(p(2,'Applying',50),known)).toBe(known);const cancelled=p(2,'Cancelled',25);expect(reconciledProject(p(2,'Applying',25),cancelled)).toBe(cancelled);const step=p(2,'Applying',25);expect(reconciledProject(p(2,'Applying',0),step)).toBe(step);const next=p(4,'Applying',0,'NEXT');expect(reconciledProject(next,known)).toBe(next);});
