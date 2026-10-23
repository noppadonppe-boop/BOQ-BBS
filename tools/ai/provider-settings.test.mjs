import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

const definitions=['openai','anthropic'].map(id=>({id,name:id,models:[{id:id==='openai'?'gpt-5.6-luna':'claude-sonnet-5-5',thinking:[{setting:{kind:'none'},value:'none'}]}]}));
const initial=()=>({version:1,activeProvider:'anthropic',providers:Object.fromEntries(definitions.map(d=>[d.id,{model:d.models[0].id,thinking:{kind:'none'},hasApiKey:true}]))});
function harness(fail=false){
 const states=[];let index=0,stored=initial();const calls=[];
 const jsx=(type,props)=>({type,props});
 const exports={};
 const modules={
  react:{useEffect(){},useState(init){const i=index++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];}},
  'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
  'lucide-react':{},
  '../domain/apiProviders':{apiProviderDefinitions:definitions,defaultApiProvidersConfig:initial,thinkingKey:JSON.stringify},
  '../data/firebase':{command:async(name,_id,data)=>{calls.push(name);if(name==='saveApiProviders'){if(fail)throw Error('save failed');stored={...stored,...data.config};}return stored;}},
 };
 const code=transformSync(fs.readFileSync(new URL('../../src/components/ApiManagePanel.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code;
 const context={Error,exports,module:{exports},require:id=>{assert.ok(id in modules,id);return modules[id];}};
 vm.runInNewContext(code,context);
 const render=()=>{index=0;const tree=context.module.exports.ApiManagePanel({run:async f=>{try{await f();}catch{}}});states[2]=false;return tree;};
 render();
 return {render,calls,get stored(){return stored;}};
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)];}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Activate persists OpenAI immediately without a second Save click',async()=>{
 const h=harness();
 const button=nodes(h.render()).find(n=>n.type==='button'&&!n.props.disabled);
 assert.ok(button);button.props.onClick();await tick();
 assert.ok(h.calls.includes('saveApiProviders'));
 assert.equal(h.stored.activeProvider,'openai');
 assert.ok(nodes(h.render()).some(n=>n.type==='article'&&n.props.className.includes('active')&&nodes(n).some(x=>x.type==='h2'&&x.props.children==='openai')));
});

test('Failed activation keeps saved provider active and exposes the error',async()=>{
 const h=harness(true);
 nodes(h.render()).find(n=>n.type==='button'&&!n.props.disabled).props.onClick();await tick();
 assert.equal(h.stored.activeProvider,'anthropic');
 assert.ok(nodes(h.render()).some(n=>n.props?.role==='alert'&&n.props.children==='save failed'));
});
