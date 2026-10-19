import {it,expect} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {frameRuntimeSource}=require('../tools/qa/storage-runtime-lines.cjs');
const vendorFile=require.resolve('firebase-tools/lib/emulator/storage/rules/runtime.js');
const original=fs.readFileSync(vendorFile,'utf8');
function runtime(source:string){
 const child:any=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
 const logs:string[]=[],module={exports:{} as any};
 const real=createRequire(vendorFile);
 const load=(name:string)=>name==='cross-spawn'?{spawn:()=>child}:name==='fs-extra'?{existsSync:()=>true}:name==='../../downloadableEmulators'?{getDownloadDetails:()=>({downloadPath:'local-existing-test.jar'}),_getCommand:()=>({binary:'fake-test',args:[]})}:name==='../../emulatorLogger'?{EmulatorLogger:{forEmulator:()=>({log:(_level:string,s:string)=>logs.push(s)})}}:name==='../../types'?{Emulators:{STORAGE:'storage'}}:name==='async-lock'?class{}:name.startsWith('node:')?real(name):{};
 vm.runInNewContext(source,{require:load,module,exports:module.exports,Buffer,process,console:{log:(s:string)=>logs.push(s),warn:(s:string)=>logs.push(s)}});
 const r:any=new module.exports.StorageRulesRuntime();const ready=r.start(false);
 child.stdout.write('{"id":-1,"status":"ok"}\n');
 return {r,child,ready,logs};
}
it('Reproduces the installed vendor losing the exact two-response pattern seen in the local service log',async()=>{
 const t=runtime(original);await t.ready;const seen:any[]=[];t.r._requests[280]={handler:(v:any)=>seen.push(v)};t.r._requests[281]={handler:(v:any)=>seen.push(v)};
 const packet='{"result":{"permit":true},"id":280,"status":"ok"}\n{"context":{"path":"/databases/(default)/documents/test"},"action":"fetch_firestore_document","server_request_id":281}\n';
 t.child.stdout.write(packet);expect(seen).toEqual([]);expect(t.logs).toContain(packet.trim());t.child.emit('exit');
});
it('Frames coalesced permit and Firestore fetch responses without changing their content or routing IDs',async()=>{
 const t=runtime(frameRuntimeSource(original));await t.ready;const seen:any[]=[];
 for(const id of [280,281])t.r._requests[id]={handler:(v:any)=>seen.push(v)};
 const values=[{result:{permit:false},id:280,status:'ok'},{context:{path:'/databases/(default)/documents/test'},action:'fetch_firestore_document',server_request_id:281}];
 t.child.stdout.write(values.map(v=>JSON.stringify(v)).join('\n')+'\n');expect(seen).toEqual(values);expect(t.logs).toEqual([]);t.child.emit('exit');
});
it.each([1,2,8,17,28,37,45,60,73,90])('Reassembles fragmented UTF8/JSON at byte boundary %s and preserves deny decisions',async cut=>{
 const t=runtime(frameRuntimeSource(original));await t.ready;const seen:any[]=[];t.r._requests[4]={handler:(v:any)=>seen.push(v)};
 const response={id:4,status:'ok',result:{permit:false,note:'เหล็ก ∅ ไทย'}},bytes=Buffer.from(JSON.stringify(response)+'\r\n');
 t.child.stdout.write(bytes.subarray(0,cut));t.child.stdout.write(bytes.subarray(cut));expect(seen).toEqual([response]);expect(t.logs).toEqual([]);t.child.emit('exit');
});
it('Processes every interleaved message in a 200-response packet without inventing allowed results',async()=>{
 const t=runtime(frameRuntimeSource(original));await t.ready;const seen:any[]=[],values=Array.from({length:200},(_,id)=>({id,status:'ok',result:{permit:id%3===0}}));
 for(const v of values)t.r._requests[v.id]={handler:(r:any)=>seen.push(r)};
 t.child.stdout.write(values.map(v=>JSON.stringify(v)).join('\n')+'\n');expect(seen).toEqual(values);t.child.emit('exit');
});
it('Refuses unknown or duplicated listener layouts rather than adapting arbitrary code',()=>{
 expect(()=>frameRuntimeSource('different runtime')).toThrow('Unsupported');expect(()=>frameRuntimeSource(original+original)).toThrow('Unsupported');
});
