import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {PDFDocument,rgb} from 'pdf-lib';
const require=createRequire(import.meta.url);
const {buildAiDraft,buildSheetDraft,executeModelTool,blankMember,defaultSpec,aiToolCatalog,mergeSheetGroups,sheetGroupSchema}=require('../../functions/lib/model-tools.cjs');
const {openDrawing}=require('../../functions/drawing-source.js');
const {analyseSheet}=require('../../functions/sheet-analysis.js');
const sharp=createRequire(new URL('../../functions/package.json',import.meta.url))('sharp');
const box={id:'base',label:'ฐาน',shape:'box',role:'solid',stage:1,x:0,y:0,w:2000,d:3000,z0:0,height:500,formSides:true,formBottom:false,source:'Plan A-1 / Section A'};
const commands=[{name:'member_metadata',arguments:{code:'A-1',category:'Custom',description:'ฐาน',cover:40}},{name:'shape_set',arguments:{model:{version:1,confirmed:false,note:'test',parts:[box]}}}];
const group={code:'A-1',label:'ฐาน',regions:[{page:1,kind:'plan',label:'Plan',box:[0,0,.5,.5]},{page:1,kind:'section',label:'Section',box:[.5,.5,.5,.5]}],warnings:[]};
const detail={code:'A-1',summary:'ฐาน 2000 × 3000 × 500',dimensions:{x:2000,y:3000,z:500,excavationDepth:null},evidence:[{page:1,field:'x',quote:'2.00'}],missing:[],conflicts:[],warnings:[],commands};
const image=async()=>({buffer:await sharp({create:{width:400,height:300,channels:3,background:'white'}}).png().toBuffer(),mimeType:'image/png',filename:'sheet.png'});
test('commands create independent members with engine-derived quantities',()=>{
 const a=buildAiDraft('A-1',commands,defaultSpec).member,b=buildAiDraft('A-2',commands,defaultSpec).member;
 assert.notEqual(a.id,b.id);assert.equal(b.code,'A-2');assert.deepEqual([a.x,a.y,a.z],[2000,3000,500]);
 const r=executeModelTool(a,defaultSpec,'model_inspect',{});assert.equal(r.output.takeoff.concrete,3);assert.equal(a.status,'Draft');
});
test('unknown tools and missing shape dimensions cannot mutate a source member',()=>{
 const a=blankMember('Custom','A-1'),before=JSON.stringify(a);
 assert.throws(()=>executeModelTool(a,defaultSpec,'deleteProject',{}));
 assert.throws(()=>executeModelTool(a,defaultSpec,'shape_set',{model:{version:1,confirmed:false,note:'',parts:[{...box,w:null}]}}));
 assert.equal(JSON.stringify(a),before);
});
test('polygon and void geometry use the same concrete engine',()=>{
 const parts=[{...box,shape:'polygon',points:[[0,0],[2000,0],[2000,3000],[0,3000]]},{...box,id:'hole',role:'void',x:500,y:500,w:1000,d:1000}];delete parts[0].x;delete parts[0].y;delete parts[0].w;delete parts[0].d;
 const c=[{name:'shape_set',arguments:{model:{version:1,confirmed:false,note:'',parts}}}];
 const m=buildAiDraft('P',c,defaultSpec).member;
 assert.equal(executeModelTool(m,defaultSpec,'model_inspect',{}).output.takeoff.concrete,2.5);
});
test('mesh creation and drawing view are callable and remain drafts',()=>{
 const m=buildAiDraft('A',commands,defaultSpec).member;
 const r=executeModelTool(m,defaultSpec,'rebar_mesh',{z:50,diameter:16,grade:'SD40',spacing:200,cover:40,dirs:['X','Y'],leg:0,note:'DB16@200 B'});
 assert.ok(r.member.bars.length>=2);assert.ok(r.member.bars.every(b=>!b.placementConfirmed));
 assert.ok(executeModelTool(r.member,defaultSpec,'drawing_view',{axes:[0,1],normal:2,cut:250}).output.length>0);
 assert.throws(()=>executeModelTool(m,defaultSpec,'drawing_view',{axes:[0,0],normal:2,cut:0}));
});
test('grouping merges same codes across pages without mixing different codes',()=>{
 const result=mergeSheetGroups([group,{...group,code:'A-2'},{...group,regions:group.regions.map(r=>({...r,page:2}))}]);
 assert.equal(result.length,2);assert.equal(result[0].regions.length,4);assert.equal(result[1].regions.length,2);
 assert.throws(()=>sheetGroupSchema.parse({...group,regions:[{...group.regions[0],box:[.8,0,.5,.5]}]}));
});
test('image crops use original pixels without invented upscaling',async()=>{
 const source=await openDrawing(await image());try{const crop=await source.render(1,[.5,0,.5,1],2600),meta=await sharp(crop.buffer).metadata();assert.equal(meta.width,200);assert.equal(meta.height,300);await assert.rejects(()=>source.render(2));}finally{await source.close();}
});
test('PDF crops render vector source at high resolution and preserve orientation',async()=>{
 const pdf=await PDFDocument.create(),page=pdf.addPage([400,300]);page.drawRectangle({x:0,y:150,width:200,height:150,color:rgb(1,0,0)});
 const source=await openDrawing({buffer:Buffer.from(await pdf.save()),mimeType:'application/pdf'});
 try{const crop=await source.render(1,[0,0,.5,.5],1600),{data,info}=await sharp(crop.buffer).raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1600);assert.equal(info.height,1200);assert.equal(data[0],255);assert.equal(data[1],0);assert.equal(data[2],0);}finally{await source.close();}
});
test('inventory reads one actual rendered page and returns digest-bound groups',async()=>{
 const result=await analyseSheet({context:{task:'sheet-map',page:1},file:await image(),ask:async(files,prompt)=>{assert.equal(files.length,1);assert.match(prompt,/box/);return {groups:[group],warnings:[]};},progress:()=>{},signal:new AbortController().signal,spec:defaultSpec});
 assert.equal(result.groups[0].code,'A-1');assert.equal(result.sourceDigest.length,64);assert.match(result.preview,/^data:image\/png/);
});
test('detailed reading sends individual crops and advertises executable tool schemas',async()=>{
 const result=await analyseSheet({context:{task:'sheet-detail',group},file:await image(),ask:async(files,prompt)=>{assert.equal(files.length,2);assert.match(prompt,/shape_set/);assert.match(prompt,/rebar_mesh/);return detail;},progress:()=>{},signal:new AbortController().signal,spec:defaultSpec});
 assert.equal(result.executionError,'');assert.equal(result.result.code,'A-1');
});
test('changed source and cross-member/cross-page answers are rejected',async()=>{
 const base={file:await image(),progress:()=>{},signal:new AbortController().signal,spec:defaultSpec};
 await assert.rejects(()=>analyseSheet({...base,context:{task:'sheet-detail',group,sourceDigest:'old'},ask:async()=>detail}),/ไฟล์เปลี่ยน/);
 await assert.rejects(()=>analyseSheet({...base,context:{task:'sheet-detail',group},ask:async()=>({...detail,code:'A-2'})}),/รหัส/);
 await assert.rejects(()=>analyseSheet({...base,context:{task:'sheet-detail',group},ask:async()=>({...detail,evidence:[{page:2,field:'x',quote:'2.00'}]})}),/หน้า/);
});
test('bad commands get one repair attempt and missing dimensions remain missing',async()=>{
 let calls=0;const result=await analyseSheet({context:{task:'sheet-detail',group},file:await image(),ask:async()=>++calls===1?{...detail,commands:[{name:'invented',arguments:{}}]}:{...detail,commands:[],missing:['ไม่ทราบความหนา'],dimensions:{...detail.dimensions,z:null}},progress:()=>{},signal:new AbortController().signal,spec:defaultSpec});
 assert.equal(calls,2);assert.equal(result.result.dimensions.z,null);assert.equal(result.result.commands.length,0);
});
test('MCP stdio initialize, discovery, call, and export work end to end',async()=>{
 const requests=[{id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}},{method:'notifications/initialized'},{id:2,method:'tools/list'},{id:3,method:'tools/call',params:{name:'draft_open',arguments:{code:'MCP-1'}}},{id:4,method:'tools/call',params:{name:'shape_set',arguments:commands[1].arguments}},{id:5,method:'tools/call',params:{name:'draft_export',arguments:{}}}];
 const child=spawn(process.execPath,['dist/mcp/model-server.mjs'],{cwd:new URL('../../',import.meta.url),stdio:['pipe','pipe','pipe'],windowsHide:true});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(stderr)));});
 child.stdin.end(requests.map(r=>JSON.stringify({jsonrpc:'2.0',...r})).join('\n')+'\n');await done;
 const messages=stdout.trim().split('\n').map(s=>JSON.parse(s));assert.equal(messages.length,5);assert.equal(messages[0].result.protocolVersion,'2025-06-18');assert.ok(messages[1].result.tools.length>=19);
 const exported=JSON.parse(messages.at(-1).result.content[0].text);assert.equal(exported.member.x,2000);assert.equal(exported.member.code,'MCP-1');
});
test('invalid detail schema is repaired from the same source images',async()=>{
 let calls=0;
 const r=await analyseSheet({context:{task:'sheet-detail',group},file:await image(),ask:async(files,prompt)=>{
  calls++;assert.equal(files.length,2);
  if(calls===1)return {...detail,missing:[{field:'x',question:'wrong structure'}]};
  assert.match(prompt,/missing.0/);return detail;
 },progress:()=>{},signal:new AbortController().signal,spec:defaultSpec});
 assert.equal(calls,2);assert.equal(r.executionError,'');assert.equal(buildSheetDraft(r.result,'A-1',defaultSpec).member.x,2000);
});
test('repeated invalid detail gives actionable validation error instead of internal error',async()=>{
 let calls=0;const imageBuffer=await image();
 await assert.rejects(()=>analyseSheet({context:{task:'sheet-detail',group},file:imageBuffer,ask:async()=>{calls++;return {...detail,dimensions:{...detail.dimensions,x:'2000 mm'}};},progress:()=>{},signal:new AbortController().signal,spec:defaultSpec}),e=>e.code==='sheet-validation'&&/dimensions.x/.test(e.message));
 assert.equal(calls,2);
});
test('every exposed tool has a serializable object schema',()=>{for(const t of aiToolCatalog()){assert.equal(t.inputSchema.type,'object');assert.ok(t.description);assert.ok(JSON.stringify(t.inputSchema));}});
test('summary dimensions and unresolved questions gate model construction',()=>{
 assert.throws(()=>buildSheetDraft({...detail,dimensions:{...detail.dimensions,x:2200}},'A',defaultSpec),/ไม่ตรง/);
 assert.throws(()=>buildSheetDraft({...detail,missing:['ความหนาอ่านไม่ได้']},'A',defaultSpec),/ความหนา/);
 assert.throws(()=>buildSheetDraft({...detail,evidence:[]},'A',defaultSpec),/หลักฐาน/);
});
test('A3 sheet tool renders the real BBS layout',()=>{
 const m=buildAiDraft('A',commands,defaultSpec).member;
 const r=executeModelTool(m,defaultSpec,'drawing_sheet',{projectCode:'P',projectName:'Test',page:0});
 assert.equal(r.output.width,420);assert.equal(r.output.height,297);assert.ok(r.output.primitives.length>20);
});
