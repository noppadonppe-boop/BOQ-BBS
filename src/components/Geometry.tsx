import {drawingSections,primaryAxes,sectionAxes,axisIndex,primaryTitle,sectionTitle,projectionCutLine} from '../domain/drawingViews';
import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {Member,Spec,Vec3} from '../domain/model';
import {schedule} from '../domain/engine';
import {projection,projectedFaces,sectionFaces,sectionTrace,primaryBarTrace,sectionY,boundaryEdges,viewExtents,viewDimension,contextProjectionFaces,contextSectionFaces,contextOpeningProjectionFaces,contextOpeningSectionFaces} from '../domain/projection';
import {boundsOf} from '../domain/solids';
import {hasPlacementContext} from '../domain/placementContext';
export function PlanView({member:m,spec,selected,onSelect,selectionKey=0}:{member:Member;spec:Spec;selected:string;onSelect:(s:string)=>void;selectionKey?:number}){
 const rows=useMemo(()=>schedule(m,spec),[m,spec]),pageSize=7,sections=drawingSections(m);
 const [sectionId,setSectionId]=useState(''),cut=sections.find(s=>s.id===sectionId)||sections[0];
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[focused,setFocused]=useState(selected),[view,setView]=useState<'both'|'plan'|'section'>('both');
 useEffect(()=>{setQuery('');setPage(0);setFocused(selected);setSectionId('');},[m.id]);
 // A selection from the BBS must reveal its leader even beyond the first group
 // or outside the current search. Browsing here never edits member data.
 useEffect(()=>{if(!selected)return;setFocused(selected);const index=rows.findIndex(r=>r.id===selected);if(index<0)return;const matches=rows.filter(r=>r.mark.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),filteredIndex=matches.findIndex(r=>r.id===selected);if(filteredIndex<0){setQuery('');setPage(Math.floor(index/pageSize));}else setPage(Math.floor(filteredIndex/pageSize));},[selected,selectionKey,m.id]);
 const matches=rows.filter(r=>r.mark.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),pages=Math.max(1,Math.ceil(matches.length/pageSize)),current=Math.min(page,pages-1),visible=matches.slice(current*pageSize,(current+1)*pageSize),slots=new Map(visible.map((r,i)=>[r.id,i])),depth=cut.position;
 const traced=useMemo(()=>rows.map(row=>{const traces=row.paths.map(path=>sectionTrace(path,depth,row.diameter,axisIndex(cut.axis)));return {row,lines:traces.flatMap(t=>t.lines),dots:traces.flatMap(t=>t.points)};}),[rows,m,depth,cut.axis]);
 const intersections=new Map(traced.map(t=>[t.row.id,!!(t.lines.length||t.dots.length)]));
 const choose=(id:string)=>{setFocused(id);onSelect(id);};
 const move=(next:number)=>{setPage(next);const first=matches[next*pageSize];if(first)choose(first.id);};
 return <div className="plan-browser" data-plan-browser>
  <div className="plan-controls">
   <label className="field"><span>ค้นหา Mark ในแบบ</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
   <div className="segmented" aria-label="เลือกมุมมองแบบ">{([['both','สองรูป'],['plan',m.drawingViews?.primaryPlane&&m.drawingViews.primaryPlane!=='XY'?'ภาพด้าน':'แปลน'],['section','รูปตัด']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={view===key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>)}</div>
  </div>
  {sections.length>1&&<label className="field plan-section-choice"><span>เลือกแนวรูปตัด</span><select value={cut.id} onChange={e=>setSectionId(e.target.value)}>{sections.map(s=><option key={s.id} value={s.id}>{sectionTitle(s)}</option>)}</select></label>}
  <div className="plan-pagination"><p role="status">{matches.length?`แสดงเส้นชี้ ${current*pageSize+1}–${current*pageSize+visible.length} จาก ${matches.length} Mark${query.trim()?` (ทั้งหมด ${rows.length})`:''}`:query.trim()?'ไม่พบ Mark ที่ค้นหา':'ยังไม่มีชุดเหล็ก'}</p><div className="actions"><button type="button" disabled={current===0} onClick={()=>move(current-1)}>ชุดก่อนหน้า</button><span>ชุด {current+1}/{pages}</span><button type="button" disabled={current>=pages-1} onClick={()=>move(current+1)}>ชุดถัดไป</button></div></div>
  <p className="muted plan-hint">เส้นเหล็กแสดงครบทุก Mark · เส้นชี้แสดงตามชุดที่เลือก · เลื่อนรูปในแนวนอนเพื่ออ่านชื่อเต็ม</p>
  <div className="plan-scroll" role="region" aria-label={`เลื่อนแบบ ${m.code}`} tabIndex={0}>
  <svg className={`plan plan-${view}`} viewBox={view==='both'?'0 0 1000 450':view==='plan'?'0 0 500 450':'500 0 500 450'} aria-label={`แปลนและรูปตัด ${m.code}`}>
  {([primaryAxes(m),sectionAxes(cut)] as [number,number][]).map((axes,k)=>{const p=projection(m,axes,{x:k*500,y:30,w:480,h:365}),faces=k===0?projectedFaces(m,axes):sectionFaces(m,cut),extents=viewExtents(m,faces,axes),datum=[0,0,0] as Vec3;datum[axes[0]]=extents[0].min;datum[axes[1]]=extents[1].min;return <g key={k}>
   <text x={k*500+25} y={25} className="draw-title">{k===0?primaryTitle(m):sectionTitle(cut)} / {m.code}</text>
   {(k===0?contextProjectionFaces(m,axes):contextSectionFaces(m,cut)).map((face,i)=><polygon key={'context'+i} points={face.map(v=>p.point(v).join(',')).join(' ')} fill="none" stroke="#ba9656" strokeDasharray="6 4"/>)}
   {faces.map((face,i)=><polygon key={i} points={face.map(v=>p.point(v).join(',')).join(' ')} fill="#edf1f0"/>)}
   {(k===0?contextOpeningProjectionFaces(m,axes):contextOpeningSectionFaces(m,cut)).map((face,i)=><polygon className="context-opening-outline" key={"contextHole"+i} points={face.map(v=>p.point(v).join(",")).join(" ")} fill="none" stroke="#ba654e" strokeDasharray="3 3"/>)}
   {boundaryEdges(faces).map((e,i)=>{const a=p.point(e.a),b=p.point(e.b);return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#a0afb2" strokeWidth=".8"/>;})}
   {k===0&&(()=>{const line=projectionCutLine(axes,cut,p);return line?<><line data-section-line x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]} stroke="#788d91" strokeDasharray="5 4"/><text x={line[0][0]-3} y={line[0][1]-6}>{cut.label}</text><text x={line[1][0]+3} y={line[1][1]-6}>{cut.label}</text></>:null;})()}
   {traced.map(({row,lines:sectionLines,dots:sectionDots})=>{const plan=primaryBarTrace(row.paths,axes),lines=k===0?plan.lines:sectionLines,dots=k===0?plan.points:sectionDots,anchor=dots[0]||lines[0]?.[Math.floor((lines[0]?.length||0)/2)],slot=slots.get(row.id),isSelected=row.id===focused;return <g key={row.id} data-mark-id={row.id} data-view={k===0?'plan':'section'} onClick={()=>{choose(row.id);const index=matches.findIndex(r=>r.id===row.id);if(index<0){setQuery('');setPage(Math.floor(rows.findIndex(r=>r.id===row.id)/pageSize));}else setPage(Math.floor(index/pageSize));}} className="bar-drawing">
    {lines.map((path,j)=><polyline key={j} points={path.map(v=>p.point(v).join(',')).join(' ')} fill="none" stroke={isSelected?'#dc8529':'#208875'} strokeWidth={isSelected?2.6:1.3} opacity={isSelected?1:slot===undefined?.22:.65}/>)}
    {dots.map((dot,j)=>{const at=p.point(dot);return <circle key={j} cx={at[0]} cy={at[1]} r={Math.max(1.5,row.diameter*p.scale/2)} fill={isSelected?'#dc8529':'#208875'} opacity={isSelected?1:slot===undefined?.22:.65}/>;})}
    {slot!==undefined&&(()=>{const lx=k*500+410,ly=65+slot*46;return <>
     {anchor&&(()=>{const target=p.point(anchor);return <g data-mark-leader><circle cx={target[0]} cy={target[1]} r="3" fill={isSelected?'#dc8529':'#208875'}/><path d={`M ${target} L ${lx-10},${ly-4} L ${lx},${ly-4}`} fill="none" stroke="#63787c" strokeWidth=".8"/></g>;})()}
     <foreignObject x={lx+3} y={ly-16} width="83" height="44"><div className={`plan-mark-label${row.mark.length>12?' long':''}${isSelected?' selected':''}${anchor?'':' no-intersection'}`} data-mark-label title={anchor?row.mark:`${row.mark} · ไม่ตัดผ่าน ${cut.label} ณ ${cut.axis}=${depth} mm`}>{row.mark}</div></foreignObject>
    </>;})()}
   </g>;})}
   <path d={`M ${p.point(datum)[0]},${p.y+p.h+14} h ${extents[0].span*p.scale}`} stroke="#91a2a6"/><text data-view-width x={p.point(datum)[0]+extents[0].span*p.scale/2} y={p.y+p.h+30} textAnchor="middle">{viewDimension(m,extents[0].span)} mm{m.prismGeometry&&m.prismGeometry.version!==1?' (กรอบภาพ)':''}</text>
   <text x={p.point(datum)[0]-8} y={p.point(datum)[1]-extents[1].span*p.scale/2} textAnchor="end">{viewDimension(m,extents[1].span)}{m.prismGeometry&&m.prismGeometry.version!==1?' (กรอบภาพ)':''}</text>
  </g>;})}
  {hasPlacementContext(m)&&<text x={view==='section'?525:25} y="422" fill="#9b773d">เส้นประทอง = พื้นที่รอยต่อ · ประแดง = ช่องเปิดอ้างอิง · ไม่คิด BOQ</text>}<text x={view==='section'?525:25} y="438" fill="#718185">มิติ mm · แนวศูนย์กลางเหล็ก · ชื่อสีเทา = ไม่ตัดผ่านรูปตัด {cut.label}</text>
 </svg></div>
 {visible.length>0&&<div className="plan-mark-list"><table><thead><tr><th>Mark ที่แสดงเส้นชี้</th><th>รูปตัด {cut.label} · {cut.axis}={depth} mm</th></tr></thead><tbody>{visible.map(row=><tr key={row.id} className={row.id===focused?'selected':''}><td><button type="button" className="text-button" aria-pressed={row.id===focused} onClick={()=>choose(row.id)}>{row.mark}</button></td><td>{intersections.get(row.id)?'ตัดผ่าน':'ไม่ตัดผ่านรูปตัดนี้'}</td></tr>)}</tbody></table></div>}
 </div>;
}
/** Bar shape thumbnail; `coupler` draws a coupler box at the coupled ends (top = higher Z end). */
export function Shape({path,coupler}:{path:Vec3[];coupler?:{top:boolean;bottom:boolean}}){
 if(path.length<2)return <span>—</span>;
 let axes:[number,number]=[0,2];const spans=[0,1,2].map(i=>Math.max(...path.map(p=>p[i]))-Math.min(...path.map(p=>p[i])));axes=spans.map((s,i)=>({s,i})).sort((a,b)=>b.s-a.s).slice(0,2).map(x=>x.i) as [number,number];
 const lo=axes.map(a=>Math.min(...path.map(p=>p[a]))),s=Math.min(75/(spans[axes[0]]||1),24/(spans[axes[1]]||1));
 const P=(p:Vec3)=>[8+(p[axes[0]]-lo[0])*s,29-(p[axes[1]]-lo[1])*s],firstHigh=path[0][2]>path.at(-1)![2];
 const ends=[...(coupler?.top?[firstHigh]:[]),...(coupler?.bottom?[!firstHigh]:[])].map(first=>{const [ex,ey]=P(first?path[0]:path.at(-1)!),[px,py]=P(first?path[1]:path.at(-2)!);return {ex,ey,ang:Math.atan2(ey-py,ex-px)*180/Math.PI};});
 return <svg width="90" height="34" viewBox="0 0 90 34"><polyline points={path.map(p=>P(p).join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.7"/>
  {ends.map((e,k)=><g key={k} transform={`translate(${e.ex} ${e.ey}) rotate(${e.ang})`}><title>Coupler</title><rect x={-4} y={-2.4} width={8} height={4.8} fill="#fff" stroke="currentColor" strokeWidth="1"/><line x1={0} x2={0} y1={-2.4} y2={2.4} stroke="currentColor" strokeWidth=".8"/></g>)}</svg>;
}
const LazyModel=lazy(()=>import('./ModelView'));
export function ModelView(props:{member:Member;spec:Spec;selected:string;onSelect:(id:string)=>void}){return <Suspense fallback={<div className="empty">กำลังเปิดมุมมอง 3D…</div>}><LazyModel {...props}/></Suspense>;}
