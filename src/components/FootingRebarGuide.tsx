import {footingFaceBars,layerShapes,type BarEnd,type FoundationInput} from '../domain/elementInput';

type Layer={diameter:number;spacing:number;shape:string};
const endsOf=(l:Layer):readonly BarEnd[]=>(layerShapes.find(s=>s.code===l.shape)||layerShapes[0]).ends;
const db=(l:{diameter:number;spacing:number})=>`DB${l.diameter}@${l.spacing}`;

/** Path of a bar drawn along a section: ends as the shape code says (v = −1 legs go up = bottom bars, +1 down = top bars).
 * `reach` = leg tip level of a Shape 41 return (just under the top mesh). */
function barPath(l:Layer,xa:number,xb:number,y:number,v:-1|1,leg:number,reach:number){
 const [a,b]=endsOf(l),ret=34,sw=v<0?0:1,h=9*v;
 const left=a==='bend'?`M${xa} ${y+v*leg} L${xa} ${y}`:a==='hook'?`M${xa+8} ${y+h} L${xa} ${y+h} A4.5 4.5 0 0 ${sw} ${xa} ${y}`:a==='return'?`M${xa+ret} ${reach} L${xa} ${reach} L${xa} ${y}`:`M${xa} ${y}`;
 const right=b==='bend'?`L${xb} ${y} L${xb} ${y+v*leg}`:b==='hook'?`L${xb} ${y} A4.5 4.5 0 0 ${sw} ${xb} ${y+h} L${xb-8} ${y+h}`:b==='return'?`L${xb} ${y} L${xb} ${reach} L${xb-ret} ${reach}`:`L${xb} ${y}`;
 return `${left} ${right}`;
}

/** Live guide beside the footing bar inputs: plan with the faces (which get vertical face bars, which are closed by the
 * Shape 41 U legs of the bottom bars) and sections X–X / Y–Y with every layer, so each input can be found in the drawing. */
export function FootingRebarGuide({input}:{input:FoundationInput}){
 const r=input.rebar,fb=footingFaceBars(input),loops=r.side.enabled&&input.shape!=='circle',anyFace=fb.x||fb.y;
 const W=300,PX=20,ratio=input.shape==='rect'?input.length/Math.max(1,input.width):1,PH=Math.round(Math.min(220,Math.max(120,W*ratio)));
 const cov=8,lp=loops?5:0,fc=anyFace?5:0,inner=cov+lp+fc;
 // ---- plan
 const plan=(()=>{const x0=PX,y0=26,x1=PX+W,y1=y0+PH,nx=Math.max(3,Math.round((PH-2*inner)/20)),ny=Math.max(3,Math.round((W-2*inner)/20));
  const xs=Array.from({length:ny},(_,k)=>x0+inner+4+(W-2*inner-8)*k/(ny-1)),ys=Array.from({length:nx},(_,k)=>y0+inner+4+(PH-2*inner-8)*k/(nx-1));
  const dotsAlong=(ax:number,ay:number,bx:number,by:number,cls:string,key:string)=>{const len=Math.hypot(bx-ax,by-ay),n=Math.max(2,Math.round(len/16));
   return Array.from({length:n+1},(_,k)=><circle key={`${key}${k}`} className={cls} cx={ax+(bx-ax)*k/n} cy={ay+(by-ay)*k/n} r={2.3}/>);};
  const fo=cov+lp+2.5,state=(f:'x'|'y')=>fb[f]?'on':fb.closed[f]?'closed':'off';
  return <svg viewBox={`0 0 ${W+2*PX} ${PH+70}`} role="img" aria-label="แปลนฐาน: ผิวด้าน X / Y"><title>แปลนฐาน</title>
   <rect className="rg-concrete" x={x0} y={y0} width={W} height={PH}/>
   {/* faces parallel to X = top / bottom edges, parallel to Y = left / right edges */}
   <line className={`rg-edge ${state('x')}`} x1={x0} x2={x1} y1={y0} y2={y0}/><line className={`rg-edge ${state('x')}`} x1={x0} x2={x1} y1={y1} y2={y1}/>
   <line className={`rg-edge ${state('y')}`} x1={x0} x2={x0} y1={y0} y2={y1}/><line className={`rg-edge ${state('y')}`} x1={x1} x2={x1} y1={y0} y2={y1}/>
   {loops&&<rect className="rg-loop-line" x={x0+cov} y={y0+cov} width={W-2*cov} height={PH-2*cov}/>}
   {ys.map((y,k)=><line key={`bx${k}`} className="rg-bx" x1={x0+inner} x2={x1-inner} y1={y} y2={y}/>)}
   {xs.map((x,k)=><line key={`by${k}`} className="rg-by thin" x1={x} x2={x} y1={y0+inner} y2={y1-inner}/>)}
   {/* Shape 41: the U legs stand at the bar ends (dots) */}
   {r.bottomX.shape==='41'&&ys.flatMap((y,k)=>[<circle key={`ux${k}a`} className="rg-bx-dot" cx={x0+inner} cy={y} r={2.6}/>,<circle key={`ux${k}b`} className="rg-bx-dot" cx={x1-inner} cy={y} r={2.6}/>])}
   {r.bottomY.shape==='41'&&xs.flatMap((x,k)=>[<circle key={`uy${k}a`} className="rg-by-dot" cx={x} cy={y0+inner} r={2.6}/>,<circle key={`uy${k}b`} className="rg-by-dot" cx={x} cy={y1-inner} r={2.6}/>])}
   {fb.x&&<>{dotsAlong(x0+fo,y0+fo,x1-fo,y0+fo,'rg-face-dot','fxt')}{dotsAlong(x0+fo,y1-fo,x1-fo,y1-fo,'rg-face-dot','fxb')}</>}
   {fb.y&&<>{dotsAlong(x0+fo,y0+fo,x0+fo,y1-fo,'rg-face-dot','fyl')}{dotsAlong(x1-fo,y0+fo,x1-fo,y1-fo,'rg-face-dot','fyr')}</>}
   {/* section cuts */}
   <line className="rg-cut" x1={x0-12} x2={x1+12} y1={(y0+y1)/2} y2={(y0+y1)/2}/><text className="rg-cut-t" x={x0-14} y={(y0+y1)/2+4} textAnchor="end">X</text><text className="rg-cut-t" x={x1+14} y={(y0+y1)/2+4}>X</text>
   <line className="rg-cut" x1={(x0+x1)/2} x2={(x0+x1)/2} y1={y0-10} y2={y1+10}/><text className="rg-cut-t" x={(x0+x1)/2+5} y={y0-4}>Y</text><text className="rg-cut-t" x={(x0+x1)/2+5} y={y1+16}>Y</text>
   <text className={`rg-face-t ${state('x')}`} x={x0+4} y={y0-6}>ผิวด้าน X</text><text className={`rg-face-t ${state('x')}`} x={x0+4} y={y1+14}>ผิวด้าน X</text>
   <text className={`rg-face-t ${state('y')}`} transform={`translate(${x0-5} ${y1-4}) rotate(-90)`}>ผิวด้าน Y</text><text className={`rg-face-t ${state('y')}`} transform={`translate(${x1+12} ${y1-4}) rotate(-90)`}>ผิวด้าน Y</text>
   <g transform={`translate(${x0} ${y1+36})`}><line className="rg-axis" x1={0} x2={26} y1={0} y2={0}/><path className="rg-axis-h" d="M26 0 l-6 -3 v6z"/><text className="rg-small" x={30} y={4}>X</text>
    <line className="rg-axis" x1={0} x2={0} y1={0} y2={-18}/><path className="rg-axis-h" d="M0 -18 l-3 6 h6z"/><text className="rg-small" x={4} y={-12}>Y</text>
    <text className="rg-small" x={52} y={4}>แปลน{input.shape==='rect'?'':' (แบบย่อ)'} · ผิวด้าน X ขนานแนว X</text></g>
  </svg>;})();
 // ---- sections: dir x = cut along X (bottom X bars drawn as bars, end faces = faces parallel to Y)
 const section=(dir:'x'|'y')=>{const main=dir==='x'?r.bottomX:r.bottomY,cross=dir==='x'?r.bottomY:r.bottomX,top=dir==='x'?r.topX:r.topY,topCross=dir==='x'?r.topY:r.topX;
  const L=dir==='x'?input.width:input.length,SH=Math.round(Math.min(150,Math.max(70,W*input.thickness/Math.max(1,L)))),x0=PX,y0=12,x1=x0+W,y1=y0+SH;
  const face=dir==='x'?'y':'x',faceOn=fb[face],closed=fb.closed[face],sb=r.sideBars;
  // X bottom bars are the lowest layer: in section X–X the bar runs under the Y dots, in Y–Y over the X dots
  const yLow=y1-cov,yHigh=y1-cov-5,yMain=dir==='x'?yLow:yHigh,yCross=dir==='x'?yHigh:yLow;
  const topOn=top.enabled,topCrossOn=topCross.enabled,yTopMain=dir==='x'?y0+cov+5:y0+cov,yTopCross=dir==='x'?y0+cov:y0+cov+5,underTop=y0+cov+(topOn||topCrossOn?10:0)+2;
  const xa=x0+inner,xb=x1-inner,leg=Math.min(SH*.4,30),fx=[x0+cov+lp+2.5,x1-cov-lp-2.5];
  const n=Math.max(4,Math.round((xb-xa)/20)),dots=(y:number,cls:string,key:string)=>Array.from({length:n},(_,k)=><circle key={`${key}${k}`} className={cls} cx={xa+6+(xb-xa-12)*k/(n-1)} cy={y} r={2.2}/>);
  const nl=Math.max(2,Math.round((SH-2*cov)/22)),loopYs=loops?Array.from({length:nl},(_,k)=>y0+cov+6+(SH-2*cov-12)*k/(nl-1)):[];
  const fyb=sb.bottom==='inward'?y1-cov-12:y1-cov,fyt=sb.top==='inward'?underTop+2:y0+cov;
  const facePath=(x:number,s:1|-1)=>`${sb.bottom==='inward'?`M${x+s*28} ${fyb} L${x} ${fyb}`:`M${x} ${fyb}`} L${x} ${fyt}${sb.top==='inward'?` L${x+s*34} ${fyt}`:''}`;
  const tag=faceOn?closed?'warn':'on':closed?'closed':'off';
  return <svg viewBox={`0 0 ${W+2*PX} ${SH+50}`} role="img" aria-label={`รูปตัด ${dir.toUpperCase()}–${dir.toUpperCase()}`}><title>รูปตัด {dir.toUpperCase()}–{dir.toUpperCase()}</title>
   <rect className="rg-concrete" x={x0} y={y0} width={W} height={SH}/>
   {loopYs.flatMap((y,k)=>[<circle key={`l${k}a`} className="rg-loop" cx={x0+cov+2} cy={y} r={2.2}/>,<circle key={`l${k}b`} className="rg-loop" cx={x1-cov-2} cy={y} r={2.2}/>])}
   {faceOn&&<><path className="rg-face" d={facePath(fx[0],1)}/><path className="rg-face" d={facePath(fx[1],-1)}/></>}
   {dots(yCross,dir==='x'?'rg-by-dot':'rg-bx-dot','c')}
   <path className={dir==='x'?'rg-bx':'rg-by'} d={barPath(main,xa,xb,yMain,-1,leg,underTop)}/>
   {topCrossOn&&dots(yTopCross,'rg-top-dot','tc')}
   {topOn&&<path className="rg-top" d={barPath(top,xa,xb,yTopMain,1,Math.min(leg,SH*.3),y1-cov)}/>}
   <text className={`rg-face-t ${tag}`} x={x0} y={y1+15}>◀ ผิวด้าน {face.toUpperCase()}</text><text className={`rg-face-t ${tag}`} x={x1} y={y1+15} textAnchor="end">ผิวด้าน {face.toUpperCase()} ▶</text>
   <text className="rg-small" x={(x0+x1)/2} y={y1+32} textAnchor="middle">รูปตัด {dir.toUpperCase()}–{dir.toUpperCase()} · เหล็กล่าง {dir.toUpperCase()} Shape {main.shape} · {faceOn?`มีเหล็กแนวตั้งที่ผิว ${face.toUpperCase()}`:closed?`ขา U ปิดผิว ${face.toUpperCase()}`:`ไม่มีเหล็กแนวตั้งที่ผิว ${face.toUpperCase()}`}</text>
  </svg>;};
 // recommended face choice for the bottom shapes
 const cx=fb.closed.x,cy=fb.closed.y,rec=cx&&cy?'none':cy?'x':cx?'y':'both';
 const recs:[string,string,string][]=[['none','เหล็กล่าง X และ Y = Shape 41','ไม่ต้องใส่ (ขา U ปิดทุกผิว)'],['x','เหล็กล่าง X = 41 อย่างเดียว','ปิดผิว Y · ใส่เฉพาะผิวด้าน X'],['y','เหล็กล่าง Y = 41 อย่างเดียว','ปิดผิว X · ใส่เฉพาะผิวด้าน Y'],['both','ไม่มี Shape 41','ใส่ทั้งสองผิว (ถ้าแบบกำหนด)']];
 return <aside className="rebar-guide" aria-label="คู่มือการกรอกเหล็กเสริมฐานราก">
  <h5>ภาพประกอบการกรอกข้อมูล</h5>
  {plan}{section('x')}{section('y')}
  <ul className="rg-legend">
   <li><i className="sw bx"/>เหล็กล่างทิศ X · {db(r.bottomX)} · Shape {r.bottomX.shape}</li>
   <li><i className="sw by"/>เหล็กล่างทิศ Y · {db(r.bottomY)} · Shape {r.bottomY.shape}</li>
   {(r.topX.enabled||r.topY.enabled)&&<li><i className="sw top"/>เหล็กบน · {[r.topX.enabled&&`X ${db(r.topX)}`,r.topY.enabled&&`Y ${db(r.topY)}`].filter(Boolean).join(' · ')}</li>}
   {loops&&<li><i className="sw loop"/>LOOPS (ชั้นนอกสุด) · {db(r.side)}</li>}
   {r.sideBars.enabled&&<li><i className="sw face"/>เหล็กแนวตั้งผิวข้าง · {anyFace?[fb.x&&`ผิว X ${db(fb.xBar)}`,fb.y&&`ผิว Y ${db(fb.yBar)}`].filter(Boolean).join(' · '):'ไม่มีผิวที่ใส่'}</li>}
  </ul>
  <table className="rg-rec"><caption>เหล็กแนวตั้งผิวข้าง · แนะนำตาม Shape เหล็กล่าง</caption><tbody>
   {recs.map(([k,a,b])=><tr key={k} className={k===rec?'current':''}><td>{a}</td><td>{b}</td></tr>)}
  </tbody></table>
  <p className="muted rg-note">ลำดับชั้นจากผิวเข้าใน: LOOPS → เหล็กแนวตั้งผิวข้าง → ตะแกรง / ขา U · ขา U ของ Shape 41 ขึ้นที่ปลายเหล็ก (ผิวที่ตั้งฉากกับแนวเหล็ก) · เลือก “อัตโนมัติ” ให้ระบบปิดผิวนั้นเอง</p>
 </aside>;
}
