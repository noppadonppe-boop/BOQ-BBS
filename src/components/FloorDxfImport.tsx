import {useEffect,useMemo,useRef,useState} from 'react';
import type {Attachment,Project} from '../domain/model';
import {IMPORT_ROLES,type FloorImportMap,type ImportRole,type SlabFloor} from '../domain/slabFloorSchema';
import {docToMm,insUnits,UNIT_MM,type CadDoc,type CadUnits,type P2} from '../domain/cadEntities';
import {applyProposal,defaultPicks,guessLayerRoles,proposalDiff,readFloorPlan,type DiffItem,type FloorProposal,type LayerRoles,type ProposalKind} from '../domain/slabPlanImport';
import {floorBeamRects} from '../domain/slabFloor';
import {loadUnderlay,type UnderlaySource} from '../data/underlaySource';
import {HelpButton} from './HelpCenter';

// S4a: “นำเข้าจาก DXF” — 3 steps: layer roles (guessed from the project's earlier imports, else the layer names) → units +
// window (one plan of a sheet) → review the proposal over the drawing (tick rows, diff with the current floor) → one commit.
export const roleLabel:Record<ImportRole,string>={grid:'กริด (เส้น)',gridLabel:'ชื่อกริด (วงกลม / ข้อความ)',beam:'คาน (เส้นขอบ)',column:'เสา',opening:'ช่องเปิด',slabMark:'ป้ายเบอร์พื้น',text:'ข้อความ (Mark / ขนาด)'};
const kindLabel:Record<ProposalKind,string>={grid:'กริด',beam:'คาน',column:'เสา',opening:'ช่องเปิด',panelMark:'เบอร์พื้น'};
const opLabel={add:'เพิ่ม',edit:'แก้',remove:'ลบ',same:'เหมือนเดิม'};
const kindColor:Record<ProposalKind,string>={grid:'#2563eb',beam:'#15803d',column:'#dc2626',opening:'#ea580c',panelMark:'#7e22ce'};
const ACI=['#000','#ff0000','#ffff00','#00ff00','#00ffff','#0000ff','#ff00ff','#1f2937','#808080','#c0c0c0'];
type Step=1|2|3;
/** client point → viewBox coordinates (letterboxed SVG safe) */
export function svgPoint(el:SVGSVGElement,e:{clientX:number;clientY:number}):[number,number]{const m=el.getScreenCTM();if(!m){const r=el.getBoundingClientRect(),vb=el.viewBox.baseVal;return [(e.clientX-r.left)*vb.width/r.width,(e.clientY-r.top)*vb.height/r.height];}const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return [q.x,q.y];}

export function FloorDxfImport({floor,project,files,initialFile,saved,readOnly,onApply,onClose}:{floor:SlabFloor;project:Project;files:Attachment[];initialFile?:string;
 /** layer maps of the project's floors (this floor first) */ saved:FloorImportMap[];readOnly:boolean;onApply:(f:SlabFloor)=>void;onClose:()=>void}){
 const dxfFiles=files.filter(a=>a.contentType==='image/vnd.dxf');
 const [fileId,setFileId]=useState(initialFile&&dxfFiles.some(a=>a.id===initialFile)?initialFile:dxfFiles[0]?.id||''),[src,setSrc]=useState<UnderlaySource|null>(null),[err,setErr]=useState('');
 const [step,setStep]=useState<Step>(1),[roles,setRoles]=useState<LayerRoles>({}),[units,setUnits]=useState<CadUnits|''>(''),[win,setWin]=useState<[number,number,number,number]|undefined>();
 const [picks,setPicks]=useState<Set<string>>(new Set()),[useAsUnder,setUseAsUnder]=useState(true),[msg,setMsg]=useState('');
 const file=dxfFiles.find(a=>a.id===fileId);
 useEffect(()=>{if(!file)return;let live=true;setSrc(null);setErr('');setStep(1);
  loadUnderlay(file).then(s=>{if(!live)return;setSrc(s);if(s.doc){setRoles(guessLayerRoles(s.doc.layers,saved));setUnits(insUnits(s.doc.insunits)||'');setWin(undefined);}}).catch(e=>{if(live)setErr(e instanceof Error?e.message:String(e));});
  return ()=>{live=false;};},[file?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 const doc=src?.doc;
 const spec=project.spec;
 const proposal=useMemo<FloorProposal|null>(()=>{if(step!==3||!doc||!units||!file)return null;
  const beamSizes=Object.fromEntries((spec.beamTemplates||[]).map(t=>[t.name,{width:t.width,depth:t.depth}]));
  return readFloorPlan(docToMm(doc,units,win),roles,{source:{kind:'dxf',attachmentId:file.id},floor,slabMarks:(spec.slabTemplates||[]).map(t=>t.name),beamSizes});},[step,doc,units,win,roles,file,floor,spec]);
 const diff=useMemo(()=>proposal?proposalDiff(floor,proposal):[],[proposal,floor]);
 useEffect(()=>{setPicks(defaultPicks(diff));},[diff]);
 const setRole=(layer:string,r:ImportRole|'')=>setRoles(prev=>{const n:LayerRoles={};for(const k of IMPORT_ROLES){const l=(prev[k]||[]).filter(x=>x!==layer);if(l.length)n[k]=l;}if(r)(n[r]||=[]).push(layer);return n;});
 const roleOf=(layer:string)=>IMPORT_ROLES.find(r=>roles[r]?.includes(layer))||'';
 const apply=()=>{if(!proposal||!units||!file)return;
  const under=useAsUnder&&(!floor.underlay||floor.underlay.attachmentId===file.id)?{attachmentId:file.id,transform:{scale:UNIT_MM[units],rotation:0,tx:-proposal.origin[0],ty:-proposal.origin[1]},opacity:floor.underlay?.opacity??0.45,locked:floor.underlay?.locked??false,hidden:false}:undefined;
  const map:FloorImportMap={layers:Object.fromEntries(IMPORT_ROLES.flatMap(r=>roles[r]?.length?[[r,roles[r]]]:[])),units,at:new Date().toISOString()};
  const r=applyProposal(floor,proposal,picks,{slabTemplates:spec.slabTemplates,underlay:under,importMap:map});
  if(r.floor===floor){setMsg('ไม่ได้เลือกรายการใด · แปลนพื้นไม่เปลี่ยน');return;}
  onApply(r.floor);onClose();};
 const counts=useMemo(()=>doc?doc.layers.filter(l=>l.count>0):[],[doc]);
 return <div className="modal-shade" role="dialog" aria-modal="true" aria-label="นำเข้าแปลนพื้นจาก DXF"><section className="modal floor-import-dialog">
  <header><b>นำเข้าแปลนพื้นจาก DXF</b><span className="fi-steps">{([1,2,3] as Step[]).map(k=><span key={k} className={step===k?'on':step>k?'done':''}>{k}. {k===1?'จับคู่ layer':k===2?'หน่วยและพื้นที่':'ตรวจข้อเสนอ'}</span>)}</span>
   <HelpButton topic="slab-floor-trace"/><button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}>×</button></header>
  {!dxfFiles.length&&<p className="notice warning">ยังไม่มีไฟล์ DXF แนบในสมาชิกนี้หรือในโครงการ · แนบไฟล์ที่แท็บ “แบบต้นทาง” (DWG: Save As → DXF)</p>}
  {dxfFiles.length>0&&<label className="field inline"><span>ไฟล์ DXF</span><select value={fileId} onChange={e=>setFileId(e.target.value)}>{dxfFiles.map(a=><option key={a.id} value={a.id}>{a.name}{a.memberId?'':' (โครงการ)'}</option>)}</select></label>}
  {err&&<p className="notice warning">{err}</p>}
  {file&&!src&&!err&&<p className="muted">กำลังอ่านไฟล์…</p>}
  {doc&&step===1&&<>
   <p className="muted">เลือกว่า layer ไหนคืออะไร (เดาจากการนำเข้าครั้งก่อนของโครงการ แล้วจากชื่อ layer) · layer ที่ไม่เลือก = ไม่อ่าน</p>
   <div className="fi-layers"><table className="data-table"><thead><tr><th>Layer</th><th>จำนวน</th><th>สี</th><th>เป็น</th></tr></thead><tbody>
    {counts.map(l=><tr key={l.name}><td className="mono">{l.name}</td><td>{l.count.toLocaleString('en-US')}</td><td><span className="fi-swatch" style={{background:ACI[l.color]||'#9ca3af'}}/>{l.color}</td>
     <td><select aria-label={`บทบาทของ layer ${l.name}`} value={roleOf(l.name)} onChange={e=>setRole(l.name,e.target.value as ImportRole|'')}><option value="">— ไม่อ่าน —</option>{IMPORT_ROLES.map(r=><option key={r} value={r}>{roleLabel[r]}</option>)}</select></td></tr>)}</tbody></table></div>
   <footer className="actions"><button type="button" onClick={onClose}>ยกเลิก</button><button type="button" className="primary" disabled={!roles.grid?.length} title={roles.grid?.length?undefined:'เลือก layer ของกริดก่อน'} onClick={()=>setStep(2)}>ถัดไป</button></footer></>}
  {doc&&src.image&&step===2&&<>
   <div className="sf-two"><label className="field"><span>หน่วยในไฟล์ ($INSUNITS{doc.insunits?` = ${doc.insunits}`:' ไม่ระบุ'})</span><select value={units} onChange={e=>setUnits(e.target.value as CadUnits)}><option value="">— เลือกหน่วย —</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="inch">inch</option></select></label>
    <div className="field"><span>พื้นที่ที่นำเข้า</span><span>{win?<>กรอบที่ลาก <button type="button" onClick={()=>setWin(undefined)}>ทั้งไฟล์</button></>:'ทั้งไฟล์ (ลากกรอบบนภาพเพื่อเลือกแปลนเดียว)'}</span></div></div>
   <WindowPicker doc={doc} image={src.image} win={win} onWin={setWin}/>
   <footer className="actions"><button type="button" onClick={()=>setStep(1)}>ย้อนกลับ</button><button type="button" className="primary" disabled={!units} onClick={()=>setStep(3)}>อ่านแปลน</button></footer></>}
  {doc&&src.image&&step===3&&proposal&&units&&<>
   {proposal.warnings.length>0&&<ul className="notice warning">{proposal.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
   <div className="fi-review">
    <ProposalView floor={floor} p={proposal} diff={diff} picks={picks} image={src.image} unit={UNIT_MM[units]}/>
    <div className="fi-list">
     {(Object.keys(kindLabel) as ProposalKind[]).map(k=>{const rows=diff.filter(d=>d.kind===k);if(!rows.length)return null;const ids=rows.filter(r=>r.op!=='same').map(r=>r.id);
      return <details key={k} open><summary><span className="fi-dot" style={{background:kindColor[k]}}/>{kindLabel[k]} {rows.length} <small className="muted">· เพิ่ม {rows.filter(r=>r.op==='add').length} · แก้ {rows.filter(r=>r.op==='edit').length} · ลบ {rows.filter(r=>r.op==='remove').length}</small>
        {ids.length>0&&<label className="check"><input type="checkbox" checked={ids.every(i=>picks.has(i))} onChange={e=>setPicks(p=>{const n=new Set(p);for(const i of ids)if(e.target.checked)n.add(i);else n.delete(i);return n;})}/>ทั้งหมด</label>}</summary>
       <ul>{rows.map(r=><DiffRow key={r.id} r={r} on={picks.has(r.id)} onToggle={v=>setPicks(p=>{const n=new Set(p);if(v)n.add(r.id);else n.delete(r.id);return n;})}/>)}</ul></details>;})}
    </div>
   </div>
   <label className="check"><input type="checkbox" checked={useAsUnder} disabled={!!floor.underlay&&floor.underlay.attachmentId!==file?.id} onChange={e=>setUseAsUnder(e.target.checked)}/>ใช้ไฟล์นี้เป็นแบบพื้นหลัง (วางตรงกริดที่นำเข้า){floor.underlay&&floor.underlay.attachmentId!==file?.id?' · แปลนนี้มีแบบพื้นหลังไฟล์อื่นอยู่แล้ว':''}</label>
   {msg&&<p className="notice" role="status">{msg}</p>}
   <footer className="actions"><button type="button" onClick={()=>setStep(2)}>ย้อนกลับ</button><span className="muted">เลือก {[...picks].filter(i=>diff.some(d=>d.id===i&&d.op!=='same')).length} รายการ · ใช้แล้วย้อนกลับได้ 1 ครั้ง (ปุ่มย้อนกลับของแปลน)</span>
    <button type="button" className="primary" disabled={readOnly} onClick={apply}>ใช้กับแปลนพื้น</button></footer></>}
 </section></div>;
}
function DiffRow({r,on,onToggle}:{r:DiffItem;on:boolean;onToggle:(v:boolean)=>void}){
 return <li className={`fi-${r.op}`}><label className="check"><input type="checkbox" disabled={r.op==='same'} checked={r.op!=='same'&&on} onChange={e=>onToggle(e.target.checked)}/>
  <span className={`fi-op fi-op-${r.op}`}>{opLabel[r.op]}</span>{r.text}</label>{r.op!=='remove'&&<small className={`muted${r.confidence<0.7?' fi-low':''}`} title={r.evidence?.handles.length?`หลักฐาน: entity ${r.evidence.handles.slice(0,6).join(', ')}${r.evidence.text?` · “${r.evidence.text}”`:''}`:undefined}> {Math.round(r.confidence*100)}%</small>}</li>;
}
/** Drawing preview (source units, y up) with a drag rectangle → window. */
function WindowPicker({doc,image,win,onWin}:{doc:CadDoc;image:{href:string;box:[number,number,number,number]};win?:[number,number,number,number];onWin:(w:[number,number,number,number])=>void}){
 const b=image.box,W=900,H=520,s=Math.min(W/(b[2]-b[0]),H/(b[3]-b[1])),X=(x:number)=>(x-b[0])*s,Y=(y:number)=>H-(y-b[1])*s;
 const svg=useRef<SVGSVGElement>(null),[drag,setDrag]=useState<[P2,P2]|null>(null);
 const at=(e:{clientX:number;clientY:number}):P2=>{const [px,py]=svgPoint(svg.current!,e);return [b[0]+px/s,b[1]+(H-py)/s];};
 const box=drag?[Math.min(drag[0][0],drag[1][0]),Math.min(drag[0][1],drag[1][1]),Math.max(drag[0][0],drag[1][0]),Math.max(drag[0][1],drag[1][1])]:win;
 return <svg ref={svg} className="fi-window" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`ภาพไฟล์ DXF (${doc.ents.length.toLocaleString('en-US')} entity) · ลากกรอบเพื่อเลือกพื้นที่`}
  onPointerDown={e=>{(e.target as Element).setPointerCapture?.(e.pointerId);const p=at(e);setDrag([p,p]);}} onPointerMove={e=>{if(drag)setDrag([drag[0],at(e)]);}}
  onPointerUp={()=>{if(drag){const w:[number,number,number,number]=[Math.min(drag[0][0],drag[1][0]),Math.min(drag[0][1],drag[1][1]),Math.max(drag[0][0],drag[1][0]),Math.max(drag[0][1],drag[1][1])];if((w[2]-w[0])*s>10&&(w[3]-w[1])*s>10)onWin(w);}setDrag(null);}}>
  <rect x={0} y={0} width={W} height={H} fill="#fff"/>
  <image href={image.href} x={X(b[0])} y={Y(b[3])} width={(b[2]-b[0])*s} height={(b[3]-b[1])*s} preserveAspectRatio="none"/>
  {box&&<rect x={X(box[0])} y={Y(box[3])} width={(box[2]-box[0])*s} height={(box[3]-box[1])*s} className="fi-win"/>}
 </svg>;
}
/** Proposal over the drawing in floor coordinates: grids, beams, columns, openings, slab labels coloured by kind (unticked faded). */
function ProposalView({floor,p,diff,picks,image,unit}:{floor:SlabFloor;p:FloorProposal;diff:DiffItem[];picks:Set<string>;image:{href:string;box:[number,number,number,number]};unit:number}){
 const tmp:SlabFloor={...floor,gridsX:p.grids.filter(g=>g.axis==='X').map(g=>({label:g.label,at:g.at})),gridsY:p.grids.filter(g=>g.axis==='Y').map(g=>({label:g.label,at:g.at})),
  beams:p.beams.map(b=>({id:b.id,mark:b.mark,along:b.along,line:b.line,from:b.from,to:b.to,width:b.width,depth:b.depth,offset:b.offset}))};
 const xs=[...tmp.gridsX.map(g=>g.at),...floor.gridsX.map(g=>g.at)],ys=[...tmp.gridsY.map(g=>g.at),...floor.gridsY.map(g=>g.at)];
 const x0=Math.min(...xs)-2500,x1=Math.max(...xs)+2500,y0=Math.min(...ys)-2500,y1=Math.max(...ys)+2500,W=620,H=460,s=Math.min(W/(x1-x0),H/(y1-y0));
 const X=(x:number)=>(x-x0)*s,Y=(y:number)=>H-(y-y0)*s,on=(id:string)=>{const d=diff.find(x=>x.id===id);return !d||d.op==='same'||picks.has(id);};
 const ib=image.box.map((v,i)=>v*unit-p.origin[i%2]);
 const rects=floorBeamRects(tmp),gx=tmp.gridsX,gy=tmp.gridsY;
 return <svg className="fi-proposal" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ข้อเสนอจากไฟล์ DXF วางบนแบบ: กริด (น้ำเงิน) คาน (เขียว) เสา (แดง) ช่องเปิด (ส้ม) เบอร์พื้น (ม่วง)">
  <rect x={0} y={0} width={W} height={H} fill="#fff"/>
  <image href={image.href} x={X(ib[0])} y={Y(ib[3])} width={(ib[2]-ib[0])*s} height={(ib[3]-ib[1])*s} preserveAspectRatio="none" opacity={0.35}/>
  {p.grids.map(g=>{const o=on(g.id)?1:.25;return g.axis==='X'?<g key={g.id} opacity={o}><line x1={X(g.at)} x2={X(g.at)} y1={Y(y0+1200)} y2={Y(y1-1200)} stroke={kindColor.grid} strokeDasharray="8 3 2 3"/><text x={X(g.at)} y={Y(y0+600)} fill={kindColor.grid} className="fi-t">{g.label}</text></g>
   :<g key={g.id} opacity={o}><line y1={Y(g.at)} y2={Y(g.at)} x1={X(x0+1200)} x2={X(x1-1200)} stroke={kindColor.grid} strokeDasharray="8 3 2 3"/><text x={X(x0+600)} y={Y(g.at)+4} fill={kindColor.grid} className="fi-t">{g.label}</text></g>;})}
  {rects.map(r=><rect key={r.beam.id} x={X(r.x0)} y={Y(r.y1)} width={(r.x1-r.x0)*s} height={(r.y1-r.y0)*s} fill={kindColor.beam} fillOpacity={0.35} stroke={kindColor.beam} opacity={on(r.beam.id)?1:.25}><title>{`${r.beam.mark} ${r.beam.width}×${r.beam.depth}`}</title></rect>)}
  {p.columns.map(c=>{const cx=gx.find(g=>g.label===c.x)?.at,cy=gy.find(g=>g.label===c.y)?.at;if(cx===undefined||cy===undefined)return null;return <rect key={c.id} x={X(cx-c.sx/2)} y={Y(cy+c.sy/2)} width={c.sx*s} height={c.sy*s} fill={kindColor.column} opacity={on(c.id)?.85:.25}/>;})}
  {p.openings.map(o=><g key={o.id} opacity={on(o.id)?1:.25}><rect x={X(o.x)} y={Y(o.y+o.h)} width={o.w*s} height={o.h*s} fill="none" stroke={kindColor.opening} strokeWidth={2}/><path d={`M${X(o.x)} ${Y(o.y)}L${X(o.x+o.w)} ${Y(o.y+o.h)}M${X(o.x+o.w)} ${Y(o.y)}L${X(o.x)} ${Y(o.y+o.h)}`} stroke={kindColor.opening}/></g>)}
  {p.panelMarks.map(m=><text key={m.id} x={X(m.at[0])} y={Y(m.at[1])} fill={kindColor.panelMark} className="fi-t fi-mark" opacity={on(m.id)?1:.3}>{m.mark}{m.thickness?` t=${m.thickness}`:''}</text>)}
 </svg>;
}
