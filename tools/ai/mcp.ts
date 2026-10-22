import {createInterface} from 'node:readline';
import {aiToolCatalog,executeModelTool} from '../../src/domain/aiModelTools';
import {blankMember,defaultSpec,specSchema,memberSchema,type Member} from '../../src/domain/model';
// Each stdio client owns one isolated draft. tools/call never writes Firestore.
let member:Member|undefined,spec=defaultSpec,initialized=false;
const extra=[
 {name:'draft_open',description:'Start or load an isolated app draft. Export with draft_export and import it in the app.',inputSchema:{type:'object',properties:{code:{type:'string'},member:{type:'object'},spec:{type:'object'}},additionalProperties:false}},
 {name:'draft_export',description:'Return the current member JSON for the app. No database write.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
];
const send=(id:unknown,result:unknown)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
const fail=(id:unknown,code:number,message:string)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code,message}})+'\n');
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 let r:any;try{r=JSON.parse(line);}catch{fail(null,-32700,'Invalid JSON');continue;}
 if(!r||r.jsonrpc!=='2.0'||typeof r.method!=='string'){fail(r?.id??null,-32600,'Invalid request');continue;}
 if(r.id===undefined)continue;
 if(r.method==='initialize'){initialized=true;send(r.id,{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'boq-bbs-model',version:'1.0.0'},instructions:'Model one drawing code per draft. Use only resolved dimensions. Tool arguments use mm except pile length in m. draft_export returns app member JSON; import it in the app to save. No approval/issue tools.'});continue;}
 if(r.method==='ping'){send(r.id,{});continue;}
 if(!initialized){fail(r.id,-32000,'Initialize first');continue;}
 if(r.method==='tools/list'){send(r.id,{tools:[...extra,...aiToolCatalog()]});continue;}
 if(r.method!=='tools/call'){fail(r.id,-32601,'Method not found');continue;}
 try{
  const {name,arguments:a={}}=r.params||{};let output:unknown;
  if(name==='draft_open'){const nextSpec=a.spec?specSchema.parse(a.spec):defaultSpec;const next=a.member?memberSchema.parse(a.member):blankMember('Custom',String(a.code||'Draft'));member=next;spec=nextSpec;output={member};}
  else {if(!member)throw Error('Call draft_open first');if(name==='draft_export')output={member,spec};else{const result=executeModelTool(member,spec,name,a);member=result.member;output={member,...(result.output!==undefined?{output:result.output}:{})};}}
  send(r.id,{content:[{type:'text',text:JSON.stringify(output)}],isError:false});
 }catch(e){send(r.id,{content:[{type:'text',text:e instanceof Error?e.message:String(e)}],isError:true});}
}
