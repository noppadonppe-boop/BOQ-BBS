import {useMemo} from 'react';
import {Plus,Trash2} from 'lucide-react';
import type {Member} from '../domain/model';
import {locIssues,locationTree,withLoc,type LocationNode,type LocationTree,type Locations,type OccurrenceLoc} from '../domain/locations';
import {NumInput} from './EditorControls';

type Occ=Member['occurrences'][number];
const live=(n:LocationNode,current?:string)=>!n.archived||n.id===current;
/** Moving to another building keeps the level / segment / zone of the same code. */
function rebase(tree:LocationTree,loc:OccurrenceLoc,building:string):OccurrenceLoc{
 if(!building)return {};
 const kids=tree.children(building),same=(id:string|undefined,kind:'level'|'zone'|'segment')=>{const c=id&&tree.byId.get(id)?.code;return c?kids.find(n=>n.kind===kind&&n.code===c&&!n.archived)?.id:undefined;};
 const level=same(loc.level,'level'),rc=loc.room&&tree.byId.get(loc.room)?.code,room=level&&rc?tree.children(level,'room').find(n=>n.code===rc&&!n.archived)?.id:undefined;
 return {building,level,segment:same(loc.segment,'segment'),zone:same(loc.zone,'zone'),room};
}
/** Building · level / segment · zone of one occurrence: WBS selects, or the old free text when the row is not linked. */
export function LocationCells({tree,o,onChange,disabled,as='td',index,textFallback=true}:{tree:LocationTree;o:Occ;onChange:(o:Occ)=>void;disabled?:boolean;as?:'td'|'field';index?:number;textFallback?:boolean}){
 const loc=o.loc||{},b=loc.building,kids=b?tree.children(b):[],issues=o.loc?locIssues(tree,o.loc):[],n=index===undefined?'':` ${index+1}`;
 const set=(next:OccurrenceLoc)=>onChange(withLoc(tree,o,next));
 const cell=(label:string,node:React.ReactNode,key:string)=>as==='td'?<td key={key}>{node}</td>:<label className="field" key={key}><span>{label}{n}</span>{node}</label>;
 const building=<select aria-label={`อาคาร${n}`} disabled={disabled} value={b||''} onChange={e=>set(rebase(tree,loc,e.target.value))}><option value="">— ไม่ผูก WBS —</option>{tree.roots.filter(r=>live(r,b)).map(r=><option key={r.id} value={r.id}>{r.code} {r.name}</option>)}</select>;
 // rooms of the chosen level: second select in the same cell (the columns stay building · level · zone)
 const rooms=loc.level?tree.children(loc.level,'room').filter(r=>live(r,loc.room)):[];
 const room=rooms.length>0&&<select aria-label={`ห้อง${n}`} disabled={disabled} value={loc.room||''} onChange={e=>set({...loc,room:e.target.value||undefined})}><option value="">— ทั้งชั้น —</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.code} {r.name}</option>)}</select>;
 const level=b?<><select aria-label={`ชั้น / ช่วง${n}`} disabled={disabled} value={loc.level?`l:${loc.level}`:loc.segment?`s:${loc.segment}`:''} onChange={e=>{const [t,id]=e.target.value.split(':');set({...loc,level:t==='l'?id:undefined,segment:t==='s'?id:undefined,room:undefined});}}><option value="">—</option>
  {kids.filter(k=>k.kind==='level'&&live(k,loc.level)).map(k=><option key={k.id} value={`l:${k.id}`}>{k.code} {k.name}</option>)}{kids.filter(k=>k.kind==='segment'&&live(k,loc.segment)).map(k=><option key={k.id} value={`s:${k.id}`}>{k.code} {k.name}</option>)}</select>{room}</>
  :<input aria-label={`ชั้น${n}`} disabled={disabled} maxLength={80} placeholder="ชั้น (ข้อความ)" value={o.floor} onChange={e=>onChange({...o,floor:e.target.value})}/>;
 const zone=b?<select aria-label={`โซน${n}`} disabled={disabled} value={loc.zone||''} onChange={e=>set({...loc,zone:e.target.value||undefined})}><option value="">—</option>
  {kids.filter(k=>k.kind==='zone'&&live(k,loc.zone)&&(!k.levels?.length||!loc.level||k.levels.includes(loc.level)||k.id===loc.zone)).map(k=><option key={k.id} value={k.id}>{k.code} {k.name}</option>)}</select>
  :<input aria-label={`Zone${n}`} disabled={disabled} maxLength={80} placeholder="Zone (ข้อความ)" value={o.zone} onChange={e=>onChange({...o,zone:e.target.value})}/>;
 const empty=(label:string)=><select aria-label={`${label}${n}`} disabled><option>—</option></select>;
 return <>{cell('อาคาร',<>{building}{issues.length>0&&<small className="warn-text block">{issues.join(' · ')}</small>}</>,'b')}{cell('ชั้น / ช่วง',b||textFallback?level:empty('ชั้น / ช่วง'),'l')}{cell('โซน',b||textFallback?zone:empty('โซน'),'z')}</>;
}
export const locationHeads=['อาคาร','ชั้น / ช่วง','โซน'];
/** New row: same place as the last row (WBS link or old text). */
export const nextOccurrence=(rows:Occ[]):Occ=>{const last=rows.at(-1);return {id:crypto.randomUUID(),zone:last?.zone||'',floor:last?.floor||'',grid:'',quantity:1,...(last?.loc?{loc:{...last.loc},building:last.building}:{})};};
/** Occurrence rows of one member: WBS columns when the project has a WBS tree, else the old Zone / ชั้น text. */
export function OccurrenceTable({locations,rows,onChange,disabled}:{locations?:Locations;rows:Occ[];onChange:(rows:Occ[])=>void;disabled?:boolean}){
 const tree=useMemo(()=>locationTree(locations),[locations]),wbs=tree.roots.length>0,put=(o:Occ)=>onChange(rows.map(n=>n.id===o.id?o:n));
 return <><div className="table-scroll"><table className="occurrence-table"><thead><tr>{(wbs?locationHeads:['Zone','ชั้น']).map(h=><th key={h}>{h}</th>)}<th>Grid</th><th className="num">จำนวน</th><th/></tr></thead><tbody>{rows.map(o=><tr key={o.id}>
  {wbs?<LocationCells tree={tree} o={o} onChange={put} disabled={disabled}/>:(['zone','floor'] as const).map(k=><td key={k}><input aria-label={k} disabled={disabled} maxLength={80} value={o[k]} onChange={e=>put({...o,[k]:e.target.value})}/></td>)}
  <td><input aria-label="grid" disabled={disabled} maxLength={80} value={o.grid} onChange={e=>put({...o,grid:e.target.value})}/></td>
  <td><NumInput aria-label="จำนวน" disabled={disabled} type="number" min={1} max={100000} value={o.quantity} onChange={e=>put({...o,quantity:Math.max(1,Math.min(100000,Math.trunc(Number(e.target.value)||1)))})}/></td>
  <td><button type="button" aria-label="ลบตำแหน่ง" disabled={disabled||rows.length===1} onClick={()=>onChange(rows.filter(n=>n.id!==o.id))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
  <button type="button" disabled={disabled||rows.length>=1000} onClick={()=>onChange([...rows,nextOccurrence(rows)])}><Plus size={14}/>เพิ่มตำแหน่ง</button></>;
}
