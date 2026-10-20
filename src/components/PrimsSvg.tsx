import type {Prim} from '../domain/drawingPrims';

/** Draws renderer-agnostic primitives as SVG elements. `hover` dims other bar Marks. */
export function PrimsSvg({prims,hover}:{prims:Prim[];hover?:string}){
 return <>{prims.map((p,i)=>{
  const op=hover&&p.group&&p.group!==hover?.18:undefined;
  if(p.t==='text')return <text key={i} x={p.x} y={p.y} fontSize={p.size} fill={p.color||'#253b42'} textAnchor={p.anchor||'start'} fontWeight={p.bold?600:undefined} opacity={op} {...(p.halo?{stroke:'#fff',strokeWidth:p.size*.3,paintOrder:'stroke'}:{})}>{p.text}</text>;
  if(p.t==='image')return <image key={i} href={p.src} x={p.x} y={p.y} width={p.w} height={p.h} preserveAspectRatio="xMidYMid meet"/>;
  const stroke={stroke:p.stroke||'none',strokeWidth:p.width,strokeDasharray:p.dash?.join(' '),opacity:op};
  if(p.t==='line')return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} strokeLinecap={p.cap} {...stroke}/>;
  if(p.t==='rect')return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill||'none'} {...stroke}/>;
  if(p.t==='poly')return p.closed===false?<polyline key={i} points={p.pts.map(q=>q.join(',')).join(' ')} fill={p.fill||'none'} {...stroke}/>:<polygon key={i} points={p.pts.map(q=>q.join(',')).join(' ')} fill={p.fill||'none'} {...stroke}/>;
  if(p.t==='circle')return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill||'none'} {...stroke}/>;
  return <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={p.fill||'none'} {...stroke}/>;
 })}</>;
}
