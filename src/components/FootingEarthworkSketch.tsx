import {columnExtent,footingColumns,footingEarth,footingLevels,type FoundationInput} from '../domain/elementInput';

const fmt=(m:number)=>`${m>0?'+':m<0?'−':'±'}${Math.abs(m).toFixed(3)}`;
/** Live section X–X of the footing pit: ground line, sloped / vertical sides, working space,
 * sand bed, lean concrete, footing and pedestal, with the reference levels when given. */
export function FootingEarthworkSketch({input}:{input:FoundationInput}){
 const e=footingEarth(input),T=input.thickness,peds=input.column.type==='pedestal'?footingColumns(input):[],ped=Math.max(0,...peds.map(c=>c.height));
 const half=(e.bx+e.grow)/2+Math.max(300,e.X*.12),W=2*half,fs=W/32,cx=0;
 // room above for the ground label, below for the two pit-bottom labels
 const top=Math.max(T+ped,e.depth-e.below)+Math.max(200,1.6*fs),bottom=-e.below-3.4*fs,H=top-bottom;
 // y up in drawing units (mm): footing bottom at 0, ground at depth − below
 const Y=(y:number)=>top-y,X=(x:number)=>x+half,ground=e.depth-e.below,pit=-e.below;
 const rect=(x0:number,x1:number,y0:number,y1:number,cls:string,key:string)=><rect key={key} className={cls} x={X(x0)} y={Y(y1)} width={x1-x0} height={y1-y0}/>;
 const label=(x:number,y:number,text:string,anchor:'start'|'end'|'middle'='start')=><text x={X(x)} y={Y(y)} fontSize={fs} textAnchor={anchor}>{text}</text>;
 const lv=input.levels.enabled;
 return <figure className="earthwork-sketch" aria-label="รูปตัดงานขุดฐานราก">
  <svg viewBox={`0 0 ${W} ${H}`} role="img"><title>รูปตัดงานขุดฐานราก</title>
   {e.depth>0&&<polygon className="pit" points={[[cx-e.bx/2,pit],[cx+e.bx/2,pit],[cx+(e.bx+e.grow)/2,ground],[cx-(e.bx+e.grow)/2,ground]].map(([x,y])=>`${X(x)},${Y(y)}`).join(' ')}/>}
   <line className="ground" x1={0} x2={W} y1={Y(ground)} y2={Y(ground)}/>
   {e.sand>0&&rect(-e.sx/2,e.sx/2,-e.below,-e.lean,'sand','sand')}
   {e.lean>0&&rect(-e.lx/2,e.lx/2,-e.lean,0,'lean','lean')}
   {input.subbase.sheet.enabled&&<line className="sheet" x1={X(-e.sheet[0]/2)} x2={X(e.sheet[0]/2)} y1={Y(-e.lean)} y2={Y(-e.lean)}/>}
   {rect(-e.X/2,e.X/2,0,T,'concrete','footing')}
   {peds.map((c,k)=>{const {w:cw}=columnExtent(c);return rect(-cw/2+c.offsetX,cw/2+c.offsetX,T,T+c.height,'concrete',`pedestal${k}`);})}
   {input.subbase.compaction.enabled&&e.depth>0&&<line className="compaction" x1={X(-e.bx/2)} x2={X(e.bx/2)} y1={Y(pit)+fs*.3} y2={Y(pit)+fs*.3}/>}
   {label(-half+fs*.4,ground+fs*.4,lv?`NGL ${fmt(input.levels.ground)}`:'ระดับดิน')}
   {e.depth>0&&label(-half+fs*.4,pit-fs*1.2,lv&&e.bottomLevel!==undefined?`ก้นขุด ${fmt(e.bottomLevel)}`:`ลึก ${Math.round(e.depth)} mm`)}
   {lv&&label(e.X/2+fs*.4,T+fs*.3,`T.O.F. ${fmt(footingLevels(input).top)}`)}
   {lv&&label(e.X/2+fs*.4,fs*.3,`B.O.F. ${fmt(footingLevels(input).bottom)}`)}
   {e.depth>0&&input.excavation.slope>0&&label(-(e.bx+e.grow*.5)/2-fs*.3,ground/2,`1:${input.excavation.slope}`,'end')}
   {e.depth>0&&label(0,pit-fs*2.4,`กว้างก้นหลุม ${Math.round(e.bx)} mm`,'middle')}
  </svg>
  <figcaption className="muted">รูปตัดตามแนว X · ความลึก {Math.round(e.depth)} mm{e.below?` (รวมใต้ฐาน ${Math.round(e.below)} mm)`:''} · ปากหลุม {Math.round(e.bx+e.grow)} mm</figcaption>
 </figure>;
}
