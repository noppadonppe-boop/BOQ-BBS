import {useEffect,useMemo,useState} from 'react';
import {WbsMigrationPanel} from './WbsMigrationPanel';
import {ArrowRightLeft,Box,Building2,Download,FileSpreadsheet,ChevronDown,ChevronUp,Copy,Layers,Plus,RotateCcw,Save,Trash2,Trees,Wand2} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import type {takeoff} from '../domain/engine';
import {command} from '../data/firebase';
import {resumeSpecChange} from '../data/specChanges';
import {linkedRows,wbsRenamePlan} from '../domain/wbsRename';
import {ifcRows,mergeWbsImport,type WbsImportRow} from '../domain/wbsImport';
import {exportWbsExcel} from '../data/wbsExcel';
import {Field,number} from './EditorControls';
import {atLocation,childKinds,copyRoot,defaultLevelPlan,emptyLocations,generateLevels,locationIssues,locationKindLabels,locationTree,locationUsage,moveNode,newLocationId,nextOrder,removeNode,suggestLocations,type LevelPlan,type LocationKind,type LocationNode,type Locations} from '../domain/locations';

type Tool=null|'levels'|'copy'|'suggest'|'rename'|'import';
type Takeoff=ReturnType<typeof takeoff>;
const prefix:Record<LocationKind,string>={building:'',external:'EXT',level:'L',zone:'Z',segment:'S',room:''};
function freeCode(l:Locations,parentId:string|null,kind:LocationKind){
 const used=new Set(l.nodes.filter(n=>n.parentId===parentId&&(parentId?n.kind===kind:true)).map(n=>n.code.toUpperCase()));
 // rooms: level number + running number (L2 → 201, 202 …)
 if(kind==='room'){const lv=l.nodes.find(n=>n.id===parentId)?.code.replace(/\D/g,'')||'';for(let i=1;;i++){const c=`${lv}${String(i).padStart(2,'0')}`;if(!used.has(c))return c;}}
 if(kind==='building'){for(let i=0;i<26*27;i++){const c=i<26?String.fromCharCode(65+i):String.fromCharCode(64+Math.floor(i/26))+String.fromCharCode(65+i%26);if(!used.has(c))return c;}}
 if(kind==='external'&&!used.has('EXT'))return 'EXT';
 for(let i=1;;i++)if(!used.has(prefix[kind]+i))return prefix[kind]+i;
}
const defaultName=(kind:LocationKind,code:string)=>kind==='building'?`อาคาร ${code}`:kind==='external'?'งานภายนอกอาคาร':kind==='level'?`ชั้น ${code.replace(/^L0*/,'')}`:kind==='zone'?`Zone ${code.replace(/^Z/,'')}`:kind==='room'?`ห้อง ${code}`:code;

/** Project menu “โครงสร้าง WBS / ตำแหน่ง”: buildings / external works → levels, zones, segments (`project.locations`). */
export function LocationsPage({project,members,totals,canEdit,busy,run}:{project:Project;members:Member[];totals:Takeoff[];canEdit:boolean;busy:boolean;run:(f:()=>Promise<unknown>,message?:string)=>void}){
 const [draft,setDraft]=useState<Locations>(project.locations||emptyLocations()),[dirty,setDirty]=useState(false),[sel,setSel]=useState(''),[tool,setTool]=useState<Tool>(null),[migrate,setMigrate]=useState(false),[incoming,setIncoming]=useState<{source:string;rows:WbsImportRow[];problems:string[]}|null>(null),[reading,setReading]=useState('');
 // Excel / IFC → preview in the detail pane; applying changes the draft only (saved with “บันทึก WBS”)
 const readFile=async(kind:'excel'|'ifc',file?:File)=>{if(!file)return;setReading(`กำลังอ่าน ${file.name}…`);try{const r=kind==='excel'?await (await import('../data/wbsExcel')).readWbsExcel(file):{rows:ifcRows(await (await import('../data/wbsIfc')).readIfcSpatial(file)),problems:[]};setIncoming({source:file.name,...r});setSel('');setTool('import');setReading('');}catch(e:any){setReading(`อ่าน ${file.name} ไม่ได้: ${e?.message||e}`);}};
 useEffect(()=>{if(!dirty)setDraft(project.locations||emptyLocations());},[project.locations,dirty]);
 const tree=useMemo(()=>locationTree(draft),[draft]),issues=useMemo(()=>locationIssues(draft),[draft]),node=tree.byId.get(sel),ro=!canEdit||busy;
 const edit=(next:Locations)=>{setDraft(next);setDirty(true);};
 const patch=(id:string,p:Partial<LocationNode>)=>edit({...draft,nodes:draft.nodes.map(n=>n.id===id?{...n,...p}:n)});
 const add=(kind:LocationKind,parentId:string|null)=>{const code=freeCode(draft,parentId,kind),n:LocationNode={id:newLocationId(),kind,parentId,code,name:defaultName(kind,code),order:nextOrder(draft,parentId,kind)};edit({...draft,nodes:[...draft.nodes,n]});setSel(n.id);setTool(null);};
 const save=()=>run(async()=>{await command('saveLocations',project.id,{locations:draft,version:project.version});setDirty(false);},'บันทึกโครงสร้าง WBS แล้ว');
 const linked=members.reduce((n,m)=>n+m.occurrences.filter(o=>o.loc).length,0),occurrences=members.reduce((n,m)=>n+m.occurrences.length,0);
 return <>
  <div className="heading"><div><div className="eyebrow">WORK BREAKDOWN STRUCTURE</div><h1>โครงสร้าง WBS / ตำแหน่ง</h1><p>อาคาร · งานภายนอก → ชั้น · โซน · ช่วง ใช้เป็นตำแหน่งของสมาชิก ตัวกรอง และรายงาน BOQ</p></div>
   <div className="actions">{dirty&&<span className="badge warning">ยังไม่บันทึก</span>}<button disabled={!dirty||busy} onClick={()=>{setDirty(false);setDraft(project.locations||emptyLocations());setSel('');}}><RotateCcw size={15}/>ยกเลิกการแก้ไข</button><button className="primary" disabled={ro||!dirty||issues.length>0} onClick={save}><Save size={15}/>บันทึก WBS</button></div></div>
  {!canEdit&&<p className="notice">ดูได้อย่างเดียว · แก้ไขได้เฉพาะผู้ดูแลโครงการ / QS</p>}
  {issues.length>0&&<div role="alert" className="notice danger">ตรวจพบ {issues.length} รายการ: {issues.slice(0,4).join(' · ')}{issues.length>4?' …':''}</div>}
  <div className="wbs-toolbar"><button disabled={ro} onClick={()=>add('building',null)}><Building2 size={15}/>เพิ่มอาคาร</button><button disabled={ro} onClick={()=>add('external',null)}><Trees size={15}/>เพิ่มงานภายนอก</button><button disabled={ro||!occurrences} title="สร้างผังจากชื่อ Zone / ชั้น ที่สมาชิกใช้อยู่" onClick={()=>{setSel('');setTool('suggest');}}><Wand2 size={15}/>สร้างจากข้อมูลเดิม</button><button disabled={ro||dirty||!occurrences||!project.locations?.nodes.length} title={dirty?'บันทึก WBS ก่อนย้ายข้อมูล':'จับคู่ Zone / ชั้นเดิมของสมาชิกกับ WBS'} onClick={()=>setMigrate(true)}><ArrowRightLeft size={15}/>ย้ายข้อมูลสมาชิกเข้า WBS</button>
   <label className={`button${ro?' disabled':''}`} title="แผ่นงาน WBS: อาคาร · ประเภท · รหัส · ชื่อ · ระดับ · Chainage"><FileSpreadsheet size={15}/>นำเข้า Excel<input hidden type="file" accept=".xlsx" disabled={ro} onChange={e=>{void readFile('excel',e.target.files?.[0]);e.target.value='';}}/></label>
   <button onClick={()=>void exportWbsExcel(draft,project.code)} title="ส่งออกโครงสร้างที่แสดงอยู่ · ใช้เป็นแบบฟอร์มนำเข้าได้"><Download size={15}/>ส่งออก Excel</button>
   <label className={`button${ro?' disabled':''}`} title="อ่าน IfcBuilding / IfcBuildingStorey (ชื่อ ระดับ GlobalId)"><Box size={15}/>ดึงจาก IFC<input hidden type="file" accept=".ifc" disabled={ro} onChange={e=>{void readFile('ifc',e.target.files?.[0]);e.target.value='';}}/></label></div>
  {reading&&<p role="status" className={`notice${reading.startsWith('อ่าน')?' danger':''}`}>{reading}</p>}
  {migrate&&!dirty&&<WbsMigrationPanel key={`${project.version}`} project={project} members={members} disabled={ro} run={run} onClose={()=>setMigrate(false)}/>}
  <div className="wbs-layout">
   <section className="panel wbs-tree" aria-label="ต้นไม้ WBS">
    {!tree.roots.length&&<p className="empty">ยังไม่มีโครงสร้าง · เพิ่มอาคาร / งานภายนอก หรือสร้างจากข้อมูลเดิม</p>}
    {tree.roots.map(r=><div className="wbs-root" key={r.id}>
     <button className={`wbs-node${sel===r.id?' active':''}${r.archived?' archived':''}`} onClick={()=>{setSel(r.id);setTool(null);}}>{r.kind==='building'?<Building2 size={15}/>:<Trees size={15}/>}<b>{r.code}</b><span>{r.name}</span></button>
     {childKinds(r.kind).map(k=>{const kids=tree.children(r.id,k);return kids.length>0&&<div className="wbs-group" key={k}><small>{locationKindLabels[k]} ({kids.length})</small><div className="wbs-chips">{kids.map(c=><button key={c.id} title={c.name} className={`wbs-chip${sel===c.id?' active':''}${c.archived?' archived':''}`} onClick={()=>{setSel(c.id);setTool(null);}}>{c.code}</button>)}</div></div>;})}
    </div>)}
   </section>
   <section className="panel padded wbs-detail">
    {tool==='import'&&incoming?<ImportTool key={incoming.source} draft={draft} incoming={incoming} disabled={ro} onApply={l=>{edit(l);setTool(null);setIncoming(null);}} onClose={()=>{setTool(null);setIncoming(null);}}/>
    :tool==='rename'&&node&&!dirty?<RenameTool key={node.id} project={project} members={members} node={node} run={run} onClose={()=>setTool(null)}/>
    :tool==='suggest'?<SuggestTool members={members} hasDraft={draft.nodes.length>0} disabled={ro} onApply={l=>{edit(l);setTool(null);setSel(l.nodes[0]?.id||'');}} onClose={()=>setTool(null)}/>
    :node?<NodeDetail key={node.id} node={node} draft={draft} tree={tree} disabled={ro} patch={p=>patch(node.id,p)} edit={edit} add={add} tool={tool} setTool={setTool} usage={locationUsage(tree,members,node).occurrences} linked={linkedRows(members,node.id)} onRename={!ro&&!dirty&&project.locations?.nodes.some(n=>n.id===node.id)?()=>setTool('rename'):undefined} onRemove={()=>{setSel(node.parentId||'');edit(removeNode(draft,node.id));}} onSelect={setSel}/>
    :<div className="empty"><h3>เลือกตำแหน่งจากต้นไม้</h3><p>อาคารแต่ละหลังมีชั้นและโซนของตัวเอง · ชั้นกับโซนเป็นสองมิติแยกกัน (ชั้น × โซน) · งานภายนอกใช้ช่วง / สาย เช่น ถนน 0+000–0+100</p><p>รหัส WBS = อาคาร-ชั้น-โซน เช่น <code>A-L2-Z1</code></p></div>}
   </section>
   <Summary tree={tree} node={node} members={members} totals={totals} linked={linked} occurrences={occurrences}/>
  </div>
 </>;
}

export function NodeDetail({node,draft,tree,disabled,patch,edit,add,tool,setTool,usage,linked=0,onRename,onRemove,onSelect}:{node:LocationNode;draft:Locations;tree:ReturnType<typeof locationTree>;disabled:boolean;patch:(p:Partial<LocationNode>)=>void;edit:(l:Locations)=>void;add:(k:LocationKind,parent:string|null)=>void;tool:Tool;setTool:(t:Tool)=>void;usage:number;linked?:number;onRename?:()=>void;onRemove:()=>void;onSelect:(id:string)=>void}){
 const parent=node.parentId?tree.byId.get(node.parentId):undefined,root=!parent,levels=parent?tree.children(parent.id,'level'):[];
 const kids=draft.nodes.filter(n=>n.parentId===node.id).length,rooms=node.kind==='level'?tree.children(node.id,'room'):[];
 return <>
  <div className="section-heading"><div><small className="eyebrow">{locationKindLabels[node.kind]}{parent?` · ${parent.code} ${parent.name}`:''}</small><h3>{parent?`${parent.code}-`:''}{node.code} <span className="muted">{node.name}</span></h3></div>
   <span className="actions"><button disabled={disabled} aria-label="เลื่อนขึ้น" onClick={()=>edit(moveNode(draft,node.id,-1))}><ChevronUp size={15}/></button><button disabled={disabled} aria-label="เลื่อนลง" onClick={()=>edit(moveNode(draft,node.id,1))}><ChevronDown size={15}/></button></span></div>
  <div className="form-grid">
   {linked>0&&<p className="muted full">มี {linked} แถวตำแหน่งผูกกับรายการนี้ · เปลี่ยนรหัสด้วยปุ่ม “เปลี่ยนรหัส…” เพื่ออัปเดตสมาชิกไปพร้อมกัน{!onRename?' (บันทึก WBS ก่อน)':''} <button type="button" disabled={!onRename} onClick={onRename}>เปลี่ยนรหัส…</button></p>}
   <Field label="รหัส (ใช้ในรหัส WBS)" disabled={disabled||linked>0} value={node.code} onChange={v=>patch({code:String(v).toUpperCase().replace(/\s+/g,'')})}/>
   <Field label="ชื่อ" disabled={disabled} value={node.name} onChange={v=>patch({name:v})}/>
   {node.kind==='level'&&<Field label="ระดับ SSL (m)" type="number" step="0.001" disabled={disabled} value={node.elevation===undefined?'':node.elevation/1000} onChange={v=>patch({elevation:Number.isFinite(v)?Math.round(v*1000):undefined})}/>}
   {node.kind==='segment'&&<><Field label="Chainage เริ่ม (m)" type="number" disabled={disabled} value={node.chainage?.from??''} onChange={v=>patch({chainage:{from:v||0,to:node.chainage?.to??0}})}/><Field label="Chainage สิ้นสุด (m)" type="number" disabled={disabled} value={node.chainage?.to??''} onChange={v=>patch({chainage:{from:node.chainage?.from??0,to:v||0}})}/></>}
   <label className="field full"><span>หมายเหตุ</span><input disabled={disabled} maxLength={500} value={node.note||''} onChange={e=>patch({note:e.target.value||undefined})}/></label>
   <label className="check full"><input type="checkbox" disabled={disabled} checked={!!node.archived} onChange={e=>patch({archived:e.target.checked||undefined})}/>เลิกใช้ (Archive) · ข้อมูลเดิมยังอ้างอิงได้ แต่ไม่ให้เลือกใหม่</label>
  </div>
  {node.kind==='zone'&&levels.length>0&&<fieldset className="wbs-levels"><legend>ใช้กับชั้น {node.levels?.length?`(${node.levels.length})`:'(ทุกชั้น)'}</legend>{levels.map(l=><label className="check" key={l.id}><input type="checkbox" disabled={disabled} checked={!!node.levels?.includes(l.id)} onChange={e=>{const next=e.target.checked?[...(node.levels||[]),l.id]:(node.levels||[]).filter(i=>i!==l.id);patch({levels:next.length?next:undefined});}}/>{l.code}</label>)}</fieldset>}
  {root&&<div className="actions wbs-actions">{childKinds(node.kind).map(k=><button key={k} disabled={disabled} onClick={()=>add(k,node.id)}><Plus size={14}/>{locationKindLabels[k]}</button>)}<button disabled={disabled} onClick={()=>setTool(tool==='levels'?null:'levels')}><Layers size={14}/>สร้างชั้นอัตโนมัติ</button><button disabled={disabled} onClick={()=>setTool(tool==='copy'?null:'copy')}><Copy size={14}/>คัดลอก{locationKindLabels[node.kind]}นี้</button></div>}
  {node.kind==='level'&&<div className="wbs-rooms"><small className="muted">ห้องในชั้นนี้ ({rooms.length}) · ใช้เป็นตำแหน่งของงานสถาปัตย์ (ตารางงานผิว / ประตู-หน้าต่าง)</small><div className="wbs-chips">{rooms.map(c=><button key={c.id} title={c.name} className={`wbs-chip${c.archived?' archived':''}`} onClick={()=>onSelect(c.id)}>{c.code}</button>)}</div><button disabled={disabled} onClick={()=>add('room',node.id)}><Plus size={14}/>ห้อง</button></div>}
  {root&&tool==='levels'&&<LevelTool root={node} draft={draft} tree={tree} onApply={l=>{edit(l);setTool(null);}}/>}
  {root&&tool==='copy'&&<CopyTool root={node} draft={draft} onApply={(l,id)=>{edit(l);setTool(null);onSelect(id);}}/>}
  <footer className="wbs-remove">{usage>0?<small className="muted">มีตำแหน่งสมาชิกอ้างอยู่ {usage} แถว · ลบไม่ได้ ใช้ “เลิกใช้” แทน</small>:<button className="danger-text" disabled={disabled} onClick={()=>{if(!kids||confirm(`ลบ ${node.code} พร้อมรายการข้างใน ${kids} รายการ?`))onRemove();}}><Trash2 size={14}/>ลบ{locationKindLabels[node.kind]}</button>}</footer>
 </>;
}

export function LevelTool({root,draft,tree,onApply}:{root:LocationNode;draft:Locations;tree:ReturnType<typeof locationTree>;onApply:(l:Locations)=>void}){
 const [plan,setPlan]=useState<LevelPlan>(defaultLevelPlan),set=(p:Partial<LevelPlan>)=>setPlan({...plan,...p});
 const have=new Set(tree.children(root.id,'level').map(n=>n.code.toUpperCase())),gen=generateLevels(plan,root.id,nextOrder(draft,root.id,'level')),fresh=gen.filter(n=>!have.has(n.code.toUpperCase()));
 return <div className="wbs-tool"><h4>สร้างชั้นอัตโนมัติ · {root.code}</h4><div className="form-grid">
  <label className="check"><input type="checkbox" checked={plan.foundation} onChange={e=>set({foundation:e.target.checked})}/>ฐานราก (FDN)</label>
  {plan.foundation&&<Field label="ระดับฐานราก (m)" type="number" step="0.001" value={plan.foundationElevation/1000} onChange={v=>set({foundationElevation:Math.round(v*1000)})}/>}
  <Field label="จำนวนชั้นใต้ดิน" type="number" value={plan.basements} onChange={v=>set({basements:Math.max(0,Math.min(10,Math.trunc(v)||0))})}/>
  <label className="check"><input type="checkbox" checked={plan.ground} onChange={e=>set({ground:e.target.checked})}/>ชั้นล่าง (GF)</label>
  <Field label="จำนวนชั้นเหนือชั้นล่าง" type="number" value={plan.floors} onChange={v=>set({floors:Math.max(0,Math.min(150,Math.trunc(v)||0))})}/>
  <label className="check"><input type="checkbox" checked={plan.roof} onChange={e=>set({roof:e.target.checked})}/>หลังคา (RF)</label>
  <Field label="ระดับชั้นล่าง (m)" type="number" step="0.001" value={plan.groundElevation/1000} onChange={v=>set({groundElevation:Math.round(v*1000)})}/>
  <Field label="ความสูงชั้น (m)" type="number" step="0.001" value={plan.storeyHeight/1000} onChange={v=>set({storeyHeight:Math.max(0,Math.round(v*1000))})}/>
  <label className="field"><span>รูปแบบรหัส</span><select value={plan.codeStyle} onChange={e=>set({codeStyle:e.target.value as LevelPlan['codeStyle']})}><option value="L1">L1, L2 …</option><option value="L01">L01, L02 …</option><option value="1F">1F, 2F …</option></select></label>
 </div>
 <p className="muted">{gen.map(n=>`${n.code} ${number((n.elevation||0)/1000,3)}`).join(' · ')||'—'}{gen.length>fresh.length?` · มีอยู่แล้ว ${gen.length-fresh.length} ชั้น (ข้าม)`:''}</p>
 <button className="primary" disabled={!fresh.length} onClick={()=>onApply({...draft,nodes:[...draft.nodes,...fresh]})}>เพิ่ม {fresh.length} ชั้น</button></div>;
}

function CopyTool({root,draft,onApply}:{root:LocationNode;draft:Locations;onApply:(l:Locations,id:string)=>void}){
 const [code,setCode]=useState(()=>freeCode(draft,null,root.kind)),[name,setName]=useState(()=>defaultName(root.kind,freeCode(draft,null,root.kind)));
 const taken=draft.nodes.some(n=>!n.parentId&&n.code.toUpperCase()===code.trim().toUpperCase());
 return <div className="wbs-tool"><h4>คัดลอก {root.code} พร้อมชั้น / โซน / ช่วง</h4><div className="form-grid"><Field label="รหัสใหม่" value={code} onChange={v=>{const c=String(v).toUpperCase().replace(/\s+/g,'');setCode(c);if(root.kind==='building')setName(defaultName('building',c));}}/><Field label="ชื่อ" value={name} onChange={setName}/></div>
  {taken&&<p className="notice warning">รหัส {code} มีอยู่แล้ว</p>}
  <button className="primary" disabled={!code.trim()||taken} onClick={()=>{const next=copyRoot(draft,root.id,code.trim(),name.trim());onApply(next,next.nodes.find(n=>!n.parentId&&n.code===code.trim())!.id);}}>คัดลอก</button></div>;
}

export function SuggestTool({members,hasDraft,disabled,onApply,onClose}:{members:Member[];hasDraft:boolean;disabled:boolean;onApply:(l:Locations)=>void;onClose:()=>void}){
 const s=useMemo(()=>suggestLocations(members),[members]),tree=locationTree(s.locations),code=(id:string)=>tree.byId.get(id)?.code;
 return <div><div className="section-heading"><div><h3>สร้างจากข้อมูลเดิม</h3><p className="muted">อ่านชื่อ Zone / ชั้น ที่สมาชิกใช้อยู่ แล้วเสนอผังเป็นอาคารเดียว (MAIN) · แก้ชื่อ แยกอาคาร หรือรวมรายการได้หลังจากนี้ · ยังไม่เปลี่ยนข้อมูลสมาชิก</p></div><button onClick={onClose}>ปิด</button></div>
  <div className="wbs-suggest"><table><thead><tr><th>ชั้นเดิม</th><th>→ รหัส</th><th className="num">แถว</th></tr></thead><tbody>{s.floors.map(f=><tr key={f.label}><td>{f.label}</td><td>{code(f.nodeId)}{!f.guessed&&<small className="warn-text"> (เดาไม่ได้)</small>}</td><td className="num">{f.count}</td></tr>)}{!s.floors.length&&<tr><td colSpan={3} className="muted">ไม่มีชื่อชั้น</td></tr>}</tbody></table>
   <table><thead><tr><th>Zone เดิม</th><th>→ รหัส</th><th className="num">แถว</th></tr></thead><tbody>{s.zones.map(z=><tr key={z.label}><td>{z.label}</td><td>{code(z.nodeId)}</td><td className="num">{z.count}</td></tr>)}{!s.zones.length&&<tr><td colSpan={3} className="muted">ไม่มีชื่อ Zone</td></tr>}</tbody></table></div>
  <p className="notice warning">ค่า Zone “A” อาจหมายถึงอาคาร A · ถ้าใช่ ให้เปลี่ยนเป็นอาคารหลังจากสร้างผัง (ขั้นย้ายข้อมูลสมาชิกจะให้จับคู่อีกครั้ง)</p>
  <button className="primary" disabled={disabled||s.locations.nodes.length<2} onClick={()=>{if(!hasDraft||confirm('แทนที่โครงสร้าง WBS ที่แก้อยู่ด้วยผังนี้?'))onApply(s.locations);}}>ใช้ผังนี้</button></div>;
}

function Summary({tree,node,members,totals,linked,occurrences}:{tree:ReturnType<typeof locationTree>;node?:LocationNode;members:Member[];totals:Takeoff[];linked:number;occurrences:number}){
 const sum=useMemo(()=>{if(!node)return null;let concrete=0,formwork=0,rebar=0,rows=0,qty=0,label=false;const ids=new Set<string>();
  members.forEach((m,i)=>{const q=totals[i];for(const o of m.occurrences){const hit=atLocation(tree,node,o);if(!hit)continue;if(hit==='label')label=true;rows++;qty+=o.quantity;ids.add(m.id);if(q){concrete+=q.concrete*o.quantity;formwork+=q.formwork*o.quantity;rebar+=q.rebar*o.quantity;}}});
  return {concrete,formwork,rebar,rows,qty,label,members:ids.size};},[tree,node,members,totals]);
 const count=(k:LocationKind)=>[...tree.byId.values()].filter(n=>n.kind===k).length;
 return <aside className="panel padded wbs-summary"><h3>สรุป</h3>
  {sum&&node?<><p className="muted">{node.parentId?`${tree.byId.get(node.parentId)?.code}-`:''}{node.code}</p><dl><dt>สมาชิก</dt><dd>{sum.members}</dd><dt>แถวตำแหน่ง / จำนวน</dt><dd>{sum.rows} / {sum.qty}</dd><dt>คอนกรีต</dt><dd>{number(sum.concrete)} m³</dd><dt>แบบหล่อ</dt><dd>{number(sum.formwork)} m²</dd><dt>เหล็ก (ที่กรอก)</dt><dd>{number(sum.rebar)} kg</dd></dl>{sum.label&&<p className="notice">นับจากชื่อ Zone / ชั้นเดิม (ยังไม่ได้ย้ายข้อมูลสมาชิกเข้า WBS)</p>}{tree.roots.length>1&&!sum.rows&&<p className="muted">หลายอาคาร: นับเฉพาะสมาชิกที่ย้ายเข้า WBS แล้ว</p>}</>
  :<dl><dt>อาคาร</dt><dd>{count('building')}</dd><dt>งานภายนอก</dt><dd>{count('external')}</dd><dt>ชั้น</dt><dd>{count('level')}</dd><dt>โซน</dt><dd>{count('zone')}</dd><dt>ช่วง / สาย</dt><dd>{count('segment')}</dd><dt>ห้อง</dt><dd>{count('room')}</dd><dt>แถวตำแหน่งที่ผูก WBS</dt><dd>{linked} / {occurrences}</dd></dl>}
 </aside>;
}

/** Rename the code of a node that member rows are linked to: preview, then the resumable job (tree written on completion). */
export function RenameTool({project,members,node,run,onClose}:{project:Project;members:Member[];node:LocationNode;run:(f:()=>Promise<unknown>,message?:string)=>void;onClose:()=>void}){
 const [code,setCode]=useState(node.code),[note,setNote]=useState('เปลี่ยนรหัส WBS'),[pending,setPending]=useState<{key:string;requestId:string}|null>(null);
 const input={version:project.version,locationsVersion:project.locations?.version||0,nodeId:node.id,code:code.trim(),note:note.trim()};
 const preview=useMemo(()=>{try{return {plan:wbsRenamePlan(members,project.locations,input)};}catch(e:any){return {error:String(e?.issues?.[0]?.message||e.message||e)};}},[members,project,JSON.stringify(input)]);
 const start=()=>{const key=JSON.stringify(input),request=pending?.key===key?pending:{key,requestId:crypto.randomUUID()};setPending(request);
  run(async()=>{const state=await command('beginWbsRename',project.id,input,request.requestId);onClose();await resumeSpecChange(project.id,state.id,()=>{},false,'เปลี่ยนรหัส WBS');},'เปลี่ยนรหัส WBS และสมาชิกครบแล้ว');};
 return <div><div className="section-heading"><div><small className="eyebrow">เปลี่ยนรหัส WBS</small><h3>{locationKindLabels[node.kind]} {node.code} <span className="muted">{node.name}</span></h3></div><button onClick={onClose}>ปิด</button></div>
  <div className="form-grid"><Field label="รหัสใหม่" value={code} onChange={v=>setCode(String(v).toUpperCase().replace(/\s+/g,''))}/><label className="field"><span>เหตุผล / หมายเหตุ (บันทึกในประวัติ)</span><input maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label></div>
  {'error' in preview?<p role="alert" className="notice danger">{preview.error}</p>:<div className="notice"><b>ตัวอย่างผล:</b> {preview.plan!.path}{preview.plan!.from} → {preview.plan!.path}{preview.plan!.to} · {preview.plan!.memberCount} สมาชิก · {preview.plan!.rowCount} แถวตำแหน่ง{preview.plan!.relabelledCount?` · ชื่อ Zone / ชั้นเปลี่ยน → กลับเป็น Draft ${preview.plan!.relabelledCount} สมาชิก`:' · สถานะสมาชิกคงเดิม'} · ปริมาณ BOQ ไม่เปลี่ยน</div>}
  <p className="muted">แถวที่ชื่อ Zone / ชั้นยังเป็นชื่อเดิม (ย้ายข้อมูลแบบไม่เปลี่ยนชื่อ) คงชื่อเดิม · โครงสร้าง WBS เปลี่ยนเมื่องานเสร็จ ยกเลิกระหว่างทางแล้วคืนข้อมูลเดิมทั้งหมด</p>
  <footer className="actions"><button className="primary" disabled={'error' in preview||!note.trim()} onClick={start}>เริ่มเปลี่ยนรหัส</button></footer></div>;
}

/** Preview of an Excel / IFC import merged into the draft: added / updated / unchanged rows and problems. */
export function ImportTool({draft,incoming,disabled,onApply,onClose}:{draft:Locations;incoming:{source:string;rows:WbsImportRow[];problems:string[]};disabled:boolean;onApply:(l:Locations)=>void;onClose:()=>void}){
 const m=useMemo(()=>mergeWbsImport(draft,incoming.rows),[draft,incoming]),blocking=locationIssues(m.locations),warnings=[...incoming.problems,...m.problems.filter(p=>!blocking.includes(p))];
 const tag={add:['เพิ่ม','success'],update:['อัปเดต','warning'],same:['คงเดิม','']} as const;
 return <div><div className="section-heading"><div><small className="eyebrow">นำเข้า WBS</small><h3>{incoming.source}</h3><p className="muted">จับคู่ด้วย IFC GlobalId แล้วจึงรหัส · รายการที่ตรงกันคงรหัสภายใน (สมาชิกที่ผูกไว้ไม่หลุด) · ไม่ลบรายการเดิม · ใช้แล้วต้องกด “บันทึก WBS”</p></div><button onClick={onClose}>ปิด</button></div>
  <p className="notice">เพิ่ม {m.added} · อัปเดต {m.updated} · คงเดิม {m.actions.length-m.added-m.updated} รายการ</p>
  {warnings.length>0&&<div className="notice warning"><b>ข้ามบางแถว:</b><ul>{warnings.slice(0,12).map(w=><li key={w}>{w}</li>)}</ul>{warnings.length>12&&<small>… อีก {warnings.length-12} รายการ</small>}</div>}
  {blocking.length>0&&<p role="alert" className="notice danger">ใช้ไม่ได้: {blocking.slice(0,4).join(' · ')}</p>}
  <div className="table-scroll wbs-import"><table><thead><tr><th>ผล</th><th>ตำแหน่ง</th><th>ประเภท</th><th>ชื่อ</th><th className="num">ระดับ (m)</th><th>เปลี่ยน</th></tr></thead><tbody>{m.actions.map((a,i)=><tr key={i}><td><span className={`badge ${tag[a.action][1]}`}>{tag[a.action][0]}</span></td><td><code>{a.path}</code></td><td>{locationKindLabels[a.row.kind]}</td><td>{a.row.name}</td><td className="num">{a.row.elevation===undefined?'':number(a.row.elevation/1000,3)}</td><td><small>{a.changes.join(' · ')}</small></td></tr>)}</tbody></table></div>
  <footer className="actions"><button className="primary" disabled={disabled||blocking.length>0||!(m.added+m.updated)} onClick={()=>onApply(m.locations)}>ใช้กับ WBS (ยังไม่บันทึก)</button></footer></div>;
}
