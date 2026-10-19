import {describe,it,expect,vi} from 'vitest';
import {defaultSpec,SnapshotBundle} from '../src/domain/model';
import {canonical} from '../src/domain/canonical';
vi.mock('../src/data/firebase',()=>({storage:{}}));
const storage=vi.hoisted(()=>({getBlob:vi.fn()}));
vi.mock('firebase/storage',()=>({ref:(_storage:unknown,path:string)=>({path}),getBlob:storage.getBlob}));
import {loadSnapshot,digestData} from '../src/data/snapshots';
const bundle:SnapshotBundle={schemaVersion:2,project:{id:'fixture',code:'TEST',name:'Legacy compatibility',location:'',owner:'',notes:'',acl:{},version:1,createdAt:'2026-10-11T00:00:00Z',spec:defaultSpec,titleBlock:{company:'',drawnBy:'',checkedBy:'',drawingPrefix:'TEST'}},members:[],attachments:[],stock:[],stockLedger:[],cutPlans:[],createdAt:'2026-10-11T00:00:00Z',status:'Draft',version:1};
describe('snapshot storage compatibility and integrity',()=>{
 it('opens an existing inline snapshot without requesting a file',async()=>{storage.getBlob.mockClear();expect(await loadSnapshot({bundle,digest:await digestData(bundle)})).toEqual(bundle);expect(storage.getBlob).not.toHaveBeenCalled();});
 it('rejects altered inline history',async()=>{const digest=await digestData(bundle);await expect(loadSnapshot({bundle:{...bundle,version:2},digest})).rejects.toThrow('checksum');});
 it('opens complete canonical JSON and rejects changed file bytes',async()=>{const digest=await digestData(bundle),bytes=canonical(bundle),snapshot={path:'projects/fixture/snapshots/'+digest+'.json',name:digest+'.json',sha256:digest,size:new Blob([bytes]).size,contentType:'application/json'};storage.getBlob.mockResolvedValueOnce(new Blob([bytes]));expect(await loadSnapshot({snapshot,digest})).toEqual(bundle);storage.getBlob.mockResolvedValueOnce(new Blob([bytes.replace('Legacy','legacy')]));await expect(loadSnapshot({snapshot,digest})).rejects.toThrow('checksum');});
 it('refuses an oversized reference before downloading',async()=>{storage.getBlob.mockClear();await expect(loadSnapshot({digest:'a'.repeat(64),snapshot:{path:'oversized',name:'large.json',sha256:'a'.repeat(64),size:20*1024*1024+1,contentType:'application/json'}})).rejects.toThrow('reference');expect(storage.getBlob).not.toHaveBeenCalled();});
});
