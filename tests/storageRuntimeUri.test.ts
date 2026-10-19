import {it,expect} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),vendor=require.resolve('firebase-tools/lib/emulator/storage/rules/runtime.js');
const source=fs.readFileSync(vendor,'utf8');
const {encodeFirestoreFetchSource}=require('../tools/qa/storage-runtime-lines.cjs');
function load(code:string, expected:string){
 const module={exports:{} as any};
 const registry={EmulatorRegistry:{client:()=>({get:async(path:string)=>{
  const url=new URL('http://127.0.0.1:8751/v1/'+path);
  if(decodeURIComponent(url.pathname)!=='/v1/'+expected||url.search||url.hash)throw Error('Wrong document identity');
  return {body:{name:expected,fields:{uid:{stringValue:'QA-UID'}}}};
 }})}};
 const real=createRequire(vendor);
 const lookup=(name:string)=>name==='../../registry'?registry:name==='./types'?{DataLoadStatus:{OK:'OK',NOT_FOUND:'NOT_FOUND'}}:name==='../../types'?{Emulators:{FIRESTORE:'firestore'}}:name==='async-lock'?class{}:name.startsWith('node:')?real(name):{};
 vm.runInNewContext(code+'\nmodule.exports.qaFetch=fetchFirestoreDocument;',{module,exports:module.exports,require:lookup,encodeURIComponent,Buffer,process});
 return module.exports.qaFetch;
}
it.each(['member#tag@form.local','member?tag@form.local','member%tag@form.local'])('Reproduces the installed Storage rule lookup losing exact identity for %s',async email=>{
 const path='/databases/(default)/documents/my-boq-app/root/users/'+email,expected='projects/demo-qa'+path;
 expect((await load(source,expected)('demo-qa',{context:{path}})).status).toBe('NOT_FOUND');
 const actual=await load(encodeFirestoreFetchSource(source),expected)('demo-qa',{context:{path}});
 expect(actual.status).toBe('OK');expect(actual.result.name).toBe(expected);
});
it('Preserves ordinary project lookup and refuses unrecognized or repeated source layouts',async()=>{
 const path='/databases/(default)/documents/projects/P',expected='projects/demo-qa'+path;
 expect((await load(encodeFirestoreFetchSource(source),expected)('demo-qa',{context:{path}})).status).toBe('OK');
 expect(()=>encodeFirestoreFetchSource('unknown')).toThrow('Unsupported');expect(()=>encodeFirestoreFetchSource(source+source)).toThrow('Unsupported');
});
