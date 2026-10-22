import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

function harness(missing=[]){
 const group={code:'F-02',regions:[{page:1}],warnings:[]};
 const data={result:{code:'F-02',summary:'base',dimensions:{x:1000,y:1000,z:500},evidence:[],warnings:[],missing,conflicts:[],commands:[]},executionError:'',provider:'openai',model:'gpt-5.6-luna',sourceDigest:'digest'};
 const states=[],refs=[];let index=0,refIndex=0,reads=0;const saves=[];
 const jsx=(type,props)=>({type,props});
 const modules={
  react:{useState(init){const i=index++;if(!(i in states))states[i]=init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(init){const i=refIndex++;return refs[i]??(refs[i]={current:init});},useEffect(){},useMemo:f=>f()},
  'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
  '../domain/model':{memberSchema:{parse:v=>v}},
  '../domain/aiSheet':{buildSheetDraft:()=>({member:{id:'draft-1',code:'F-02',bars:[]}})},
  '../domain/aiModelTools':{aiToolCatalog:()=>[]},
  '../data/aiSheetAnalysis':{readSheetGroup:async()=>{reads++;return data;}},
  '../data/aiDrawingAnalysis':{aiDrawingAnalysisConfigured:()=>true},
  '../data/firebase':{command:async(name,pid,payload)=>{assert.equal(name,'saveMember');saves.push({pid,...payload});}},
  '../data/exports':{},'./Geometry':{},'../domain/engine':{},
 };
 const exports={},context={exports,module:{exports},Error,AbortController,require:id=>{assert.ok(id in modules,id);return modules[id];}};
 vm.runInNewContext(transformSync(fs.readFileSync(new URL('../../src/components/AiSheetPanel.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,context);
 const render=()=>{index=refIndex=0;return context.module.exports.AiSheetPanel({project:{id:'p',spec:{}},attachment:{id:'a',name:'drawing.pdf'},blocked:false});};
 render();states[0]=[{sourceDigest:'digest',page:1,pages:1,warnings:[]}];states[1]=[group];states[2]=['F-02'];
 return {render,saves,get reads(){return reads;}};
}
function nodes(t){if(!t||typeof t!=='object')return [];if(Array.isArray(t))return t.flatMap(nodes);return [t,...nodes(t.props?.children)];}
async function clickRead(h){const b=nodes(h.render()).find(n=>n.type==='button'&&Array.isArray(n.props.children)&&String(n.props.children[0]).startsWith('2.'));assert.ok(b);assert.equal(b.props.disabled,false);b.props.onClick();await new Promise(r=>setImmediate(r));}

test('Read detail creates a member directly and does not repeat a saved group',async()=>{
 const h=harness();await clickRead(h);
 assert.equal(h.saves.length,1);assert.equal(h.saves[0].member.code,'F-02');assert.equal(h.saves[0].member.drawingExtraction.attachmentId,'a');
 await clickRead(h);assert.equal(h.saves.length,1);assert.equal(h.reads,1);
});
test('Read detail with missing information remains a result without automatic persistence',async()=>{
 const h=harness(['ความหนายังอ่านไม่ได้']);await clickRead(h);assert.equal(h.reads,1);assert.equal(h.saves.length,0);
});
