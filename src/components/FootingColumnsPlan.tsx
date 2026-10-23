import {useRef,useState} from 'react';
import {columnBoxes,columnExtent,footingColumnName,footingColumns,footingExtent,footingOutline,type FoundationInput} from '../domain/elementInput';

/** Plan of the footing with every column (C1 + extras). Drag a column to move it (snaps to 25 mm);
 * `onMove(k, offsetX, offsetY)` gets the new offset from the footing centre. */
export function FootingColumnsPlan({input,selected,onSelect,onMove,readOnly}:{input:FoundationInput;selected:number;onSelect:(k:number)=>void;onMove:(k:number,x:number,y:number)=>void;readOnly:boolean}){
 const svg=useRef<SVGSVGElement>(null),[drag,setDrag]=useState<{k:number;dx:number;dy:number}|null>(null);
 const {w:W,d:D}=footingExtent(input),cols=footingColumns(input),pad=Math.max(W,D)*.08,fs=Math.max(W,D)/26;
 // drawing y up: plan y=0 at the bottom edge
 const vb=`${-pad} ${-pad} ${W+2*pad} ${D+2*pad}`,Y=(y:number)=>D-y;
 const toPlan=(e:React.PointerEvent)=>{const s=svg.current!,pt=s.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(s.getScreenCTM()!.inverse());return [p.x,D-p.y];};
 const snap=(v:number)=>Math.round(v/25)*25;
 return <svg ref={svg} className="columns-plan" viewBox={vb} role="img" aria-label="แปลนฐานรากและตำแหน่งเสา"
  onPointerMove={e=>{if(!drag)return;const [x,y]=toPlan(e);onMove(drag.k,snap(x-drag.dx-W/2),snap(y-drag.dy-D/2));}}
  onPointerUp={()=>setDrag(null)} onPointerLeave={()=>setDrag(null)}>
  <polygon className="footing" points={footingOutline(input).map(([x,y])=>`${x},${Y(y)}`).join(' ')}/>
  <line className="axis" x1={W/2} x2={W/2} y1={-pad/2} y2={D+pad/2}/><line className="axis" x1={-pad/2} x2={W+pad/2} y1={D/2} y2={D/2}/>
  {cols.map((c,k)=>{const {w,d}=columnExtent(c),ox=(W-w)/2+c.offsetX,oy=(D-d)/2+c.offsetY,cls=`column${k===selected?' active':''}`;
   const down=(e:React.PointerEvent)=>{onSelect(k);if(readOnly)return;const [x,y]=toPlan(e);setDrag({k,dx:x-(ox+w/2),dy:y-(oy+d/2)});(e.target as Element).setPointerCapture?.(e.pointerId);};
   return <g key={k} onPointerDown={down} className={readOnly?'':'draggable'}>
    {c.shape==='circle'?<circle className={cls} cx={ox+w/2} cy={Y(oy+d/2)} r={w/2}/>:columnBoxes(c).map((b,i)=><rect key={i} className={cls} x={ox+b.x0} y={Y(oy+b.y1)} width={b.x1-b.x0} height={b.y1-b.y0}/>)}
    <text x={ox+w/2} y={Y(oy+d/2)+fs*.35} fontSize={fs} textAnchor="middle">{c.columnNo||`C${k+1}`}</text>
    {k===selected&&<text className="offset" x={ox+w/2} y={Y(oy)+fs*1.2} fontSize={fs*.8} textAnchor="middle">{`${c.offsetX}, ${c.offsetY}`}</text>}
   </g>;})}
  <text className="hint" x={-pad*.8} y={D+pad*.8} fontSize={fs*.75}>{cols.length>1?`${cols.length} ต้น · ${readOnly?'':'ลากเพื่อย้าย · '}ระยะเยื้อง X, Y จากกึ่งกลางฐาน (mm)`:footingColumnName(cols[0]||input.column,0,false)}</text>
 </svg>;
}
