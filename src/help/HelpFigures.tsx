import type {ReactNode} from 'react';
import type {FigureId} from './helpContent';

/* Help illustrations: small schematic SVGs (viewBox 320 × 180) styled by `.help-fig` classes in styles.css:
   c = concrete, b = bar, b2 = second bar set, l = outline, d = dimension, a = accent, t = text, ts = small text. */
const T=({x,y,children,s,a='middle'}:{x:number;y:number;children:ReactNode;s?:boolean;a?:'start'|'middle'|'end'})=><text x={x} y={y} className={s?'ts':'t'} textAnchor={a}>{children}</text>;
const Box=({x,y,w,h,label,tone=''}:{x:number;y:number;w:number;h:number;label:string;tone?:string})=><g><rect x={x} y={y} width={w} height={h} rx={6} className={`node ${tone}`}/><T x={x+w/2} y={y+h/2+4} s>{label}</T></g>;
const Arrow=({d}:{d:string})=><path d={d} className="d" markerEnd="url(#hf-arrow)"/>;
const Dot=({x,y,r=3.2,k='b'}:{x:number;y:number;r?:number;k?:string})=><circle cx={x} cy={y} r={r} className={`${k}f`}/>;
const Svg=({children,label}:{children:ReactNode;label:string})=><svg viewBox="0 0 320 180" className="help-fig" role="img" aria-label={label}>
 <defs><marker id="hf-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" className="af"/></marker></defs>{children}</svg>;

const figures:Record<FigureId,()=>ReactNode>={
 'wall-run':()=><><rect x={40} y={30} width={150} height={110} className="c"/><rect x={52} y={42} width={126} height={86} className="node"/>
  <path d="M46 70 V36 H80" className="b"/><path d="M58 70 V48 H80" className="b"/><path d="M150 36 H184 V70" className="b"/><path d="M150 48 H172 V70" className="b"/>
  <rect x={95} y={128} width={40} height={12} className="node"/><T x={115} y={158} s>ประตู / ช่องเปิด</T><T x={60} y={24} s>มุม U-bar</T>
  {[214,240,266,292].map(x=><rect key={x} x={x} y={30} width={22} height={110} className="c"/>)}{[58,86,114].map(y=><line key={y} x1={214} x2={314} y1={y} y2={y} className="d dash"/>)}<T x={262} y={158} s>Elevation คลี่ · ช่วงเท</T></>,
 'wall-run-sheet':()=><><rect x={6} y={8} width={308} height={164} className="node"/>
  {[[12,14,180,56,'Elevation คลี่ · ผิวนอก'],[12,74,180,56,'Elevation คลี่ · ผิวใน'],[198,14,110,40,'มุม / T 1:20'],[198,58,54,70,'รูปตัด A–A'],[254,58,54,70,'ช่องเปิด'],[12,134,180,32,'รายละเอียดมาตรฐาน · Key plan'],[198,134,110,32,'Title block']].map(([x,y,w,h,t])=><g key={String(t)}><rect x={x as number} y={y as number} width={w as number} height={h as number} className="c"/><T x={(x as number)+(w as number)/2} y={(y as number)+(h as number)/2+3} s>{t}</T></g>)}</>,
 workflow:()=>{const s=['Spec','WBS','สมาชิก','ตรวจ BBS','BOQ','แบบ A3','ตัดเหล็ก'];return <>{s.map((l,i)=>{const x=8+(i%4)*78,y=i<4?30:110;return <Box key={l} x={i<4?x:8+((6-i)+0.5)*78} y={y} w={66} h={34} label={`${i+1}. ${l}`} tone={i===2?'hl':''}/>;})}
  <Arrow d="M74 47h10"/><Arrow d="M152 47h10"/><Arrow d="M230 47h10"/><Arrow d="M281 64 v20 q0 8 -8 8 h-10 v18"/><Arrow d="M203 127h-10"/><Arrow d="M125 127h-10"/>
  <T x={160} y={172} s>ส่งตรวจ → Checked → IFC ก่อนออกแบบและตัดเหล็ก</T></>;},
 'slab-floor-sheet':()=><><rect x={6} y={8} width={308} height={164} className="node"/>
  {[[12,14,118,74,'แปลนเหล็กล่าง 1:100'],[134,14,118,74,'แปลนเหล็กบน 1:100'],[256,14,52,18,'ตารางพื้น'],[256,34,52,20,'สัญลักษณ์'],[256,56,52,30,'Key plan'],[12,92,170,36,'รูปตัด X–X (ครอป)'],[12,130,170,36,'รูปตัด Y–Y (ครอป)'],[186,92,66,74,'D1 ช่องเปิด 1:20'],[256,88,52,78,'รายละเอียดมาตรฐาน']].map(([x,y,w,h,t],k)=><g key={k}><rect x={x as number} y={y as number} width={w as number} height={h as number} className={k===0||k===1?'node hl':'c'}/><T x={(x as number)+4} y={(y as number)+11} s>{t as string}</T></g>)}
  {[40,54,68].map(y=><line key={y} x1={22} x2={120} y1={y} y2={y} className="b2"/>)}{[36,62].map(y=><line key={y} x1={150} x2={236} y1={y} y2={y} className="b"/>)}</>,
 'slab-floor':()=><>{[30,130,230,290].map(x=><line key={x} x1={x} x2={x} y1={14} y2={166} className="d dash"/>)}{[24,96,156].map(y=><line key={y} y1={y} y2={y} x1={14} x2={306} className="d dash"/>)}
  {[[34,28,92,64],[134,28,92,64],[234,28,52,64],[34,100,92,52],[134,100,92,52],[234,100,52,52]].map(([x,y,w,h],k)=><rect key={k} x={x} y={y} width={w} height={h} className={k===4?'c sel':'c'}/>)}
  {[30,130,230,290].map(x=><rect key={x} x={x-4} y={20} width={8} height={140} className="l"/>)}{[24,96,156].map(y=><rect key={y} x={26} y={y-4} width={268} height={8} className="l"/>)}
  <rect x={160} y={114} width={30} height={22} className="l"/><path d="M160 114l30 22M190 114l-30 22" className="d"/>
  {[110,140].map(y=><line key={y} x1={150} x2={200} y1={y} y2={y} className="b2"/>)}{[156,194].map(x=><line key={x} x1={x} x2={x} y1={104} y2={146} className="b2"/>)}
  {[40,52,64,76].map(y=><line key={y} x1={108} x2={152} y1={y} y2={y} className="b"/>)}
  <T x={80} y={64}>S1</T><T x={180} y={64}>S1</T><T x={262} y={64}>S2</T><T x={80} y={130}>S1</T><T x={262} y={130}>S1</T>
  <T x={130} y={176} s>บนเสริมคร่อมคาน · ช่องเปิดตัดเหล็ก + เหล็กเสริมขอบ</T></>,
 status:()=><><Box x={10} y={60} w={80} h={40} label="Draft"/><Box x={120} y={60} w={80} h={40} label="Checked" tone="warn"/><Box x={230} y={60} w={80} h={40} label="IFC · R0" tone="ok"/>
  <Arrow d="M90 80h28"/><Arrow d="M200 80h28"/><T x={105} y={120} s>ส่งตรวจ</T><T x={215} y={120} s>อนุมัติ</T>
  <path d="M270 100 v34 h-220 v-32" className="d dash" markerEnd="url(#hf-arrow)"/><T x={160} y={154} s>แก้หลัง IFC → กลับ Draft → อนุมัติใหม่ได้ R1</T>
  <T x={50} y={52} s>QS</T><T x={160} y={52} s>Checker</T><T x={270} y={52} s>Approver</T></>,
 roles:()=><>{[['MasterAdmin','อนุมัติผู้ใช้ · API'],['ProjectAdmin','โครงการ · ทีม · Spec'],['QS','เขียนแบบ / BBS'],['Checker','ตรวจ'],['Approver','อนุมัติ IFC'],['Viewer','ดู / ส่งออก']].map(([n,d],i)=><g key={n}><Box x={10+(i%3)*102} y={i<3?24:100} w={94} h={52} label=""/><T x={57+(i%3)*102} y={(i<3?24:100)+22}>{n}</T><T x={57+(i%3)*102} y={(i<3?24:100)+39} s>{d}</T></g>)}</>,
 wbs:()=><><Box x={10} y={70} w={70} h={30} label="อาคาร A" tone="hl"/>{['L1','L2','L3'].map((l,i)=><g key={l}><Box x={115} y={22+i*52} w={60} h={26} label={`ชั้น ${l}`}/><path d={`M80 85 C98 85 98 ${35+i*52} 115 ${35+i*52}`} className="d"/></g>)}
  {['Z1','Z2'].map((z,i)=><g key={z}><Box x={210} y={62+i*36} w={52} h={24} label={`โซน ${z}`}/><path d={`M175 87 C192 87 192 ${74+i*36} 210 ${74+i*36}`} className="d"/></g>)}
  <T x={290} y={78} s>ห้อง</T><path d="M262 74 h14" className="d"/><T x={160} y={172} s>รหัส WBS = A-L2-Z1 · ใช้กรองรายงาน</T></>,
 'member-tabs':()=>{const t=['ข้อมูล','รูปทรง','ใส่เหล็ก','BOQ','แบบ A3','แบบต้นทาง'];return <>{t.map((l,i)=><g key={l}><rect x={6+i*52} y={18} width={50} height={22} rx={4} className={`node ${i===0?'hl':''}`}/><T x={31+i*52} y={33} s>{l}</T></g>)}
  <rect x={6} y={46} width={308} height={110} rx={6} className="node"/><rect x={16} y={58} width={130} height={86} className="c"/><path d="M26 132h110M26 70h110" className="b"/>{[0,1,2,3,4,5].map(i=><Dot key={i} x={30+i*20} y={132}/>)}
  {['ขนาด / ระดับ','Cover','เหล็กเสริม','ใช้ข้อมูล'].map((l,i)=><g key={l}><rect x={160} y={58+i*22} width={146} height={18} rx={3} className={`node ${i===3?'hl':''}`}/><T x={233} y={71+i*22} s>{l}</T></g>)}
  <T x={160} y={172} s>กรอก → ใช้ข้อมูล → เหล็ก gen-* ถูกสร้างใหม่</T></>;},
 footing:()=><><rect x={40} y={70} width={240} height={70} className="c"/><rect x={135} y={20} width={50} height={50} className="c2"/>
  <path d="M52 128 H268" className="b"/><path d="M52 82 H268" className="b"/>{[0,1,2,3,4,5,6,7,8].map(i=><g key={i}><Dot x={62+i*25} y={124}/><Dot x={62+i*25} y={86}/></g>)}
  <path d="M60 82 V128 M260 82 V128" className="b2"/><path d="M146 28 V122 h-14 M174 28 V122 h14" className="b"/>
  {[70,140,210,250].map(x=><rect key={x} x={x} y={140} width={14} height={30} className="pile"/>)}
  <T x={284} y={78} a="start" s>บน</T><T x={284} y={136} a="start" s>ล่าง</T><T x={20} y={106} a="start" s>U / Loop</T><T x={200} y={30} a="start" s>ตอม่อ / starter</T></>,
 pour:()=><><rect x={60} y={40} width={200} height={50} className="c2"/><rect x={60} y={90} width={200} height={60} className="c"/><path d="M50 90 H270" className="a dash"/>
  <path d="M72 96 H248 M72 84 H248" className="b"/>{[0,1,2,3,4].map(i=><path key={i} d={`M${90+i*35} 70 V112`} className="b2"/>)}
  <T x={276} y={68} a="start" s>ช่วงที่ 2</T><T x={276} y={124} a="start" s>ช่วงที่ 1</T><T x={276} y={94} a="start" s>C.J.</T><T x={160} y={172} s>ปริมาณแยกช่วง · ตะแกรงรอยต่อ + เหล็กผ่านรอยต่อ</T></>,
 'loop-laps':()=><>{[[1,40],[2,130],[3,220]].map(([n,x])=><g key={n}><rect x={x} y={40} width={70} height={90} className="c"/><rect x={x+8} y={48} width={54} height={74} className={`b ${n===1?'':'b-split'}`}/>
  {(n===1?[[x+8,85]]:n===2?[[x+8,85],[x+62,85]]:[[x+8,85],[x+62,70],[x+35,122]]).map(([a,b],i)=><circle key={i} cx={a} cy={b} r={5} className="lap"/>)}<T x={x+35} y={150} s>{`${n} จุดทาบ`}</T></g>)}
  <T x={160} y={172} s>ท่อนละ ≤ 10 m · ระยะทาบจากตาราง / hook90·d / กำหนดเอง</T></>,
 'face-bars':()=><><rect x={60} y={30} width={200} height={120} className="c"/>{[0,1,2,3].map(i=><path key={i} d={`M68 ${50+i*25} H252`} className="b2"/>)}
  {[0,1,2,3,4,5].map(i=><path key={i} d={`M${80+i*32} 142 V40 h${i<3?14:-14}`} className="b"/>)}
  <T x={270} y={44} a="start" s>Ldh เข้าใน</T><T x={270} y={142} a="start" s>15d</T><T x={30} y={92} s>Loop</T></>,
 column:()=><><rect x={120} y={10} width={80} height={160} className="c"/><path d="M134 10 V170 M186 10 V170" className="b"/>
  {[...Array(14)].map((_,i)=>{const y=16+i*11.5;return <path key={i} d={`M128 ${y} H192`} className={i<5||i>10?'b2':'b2 thin'}/>;})}
  <path d="M100 10 V63 M100 63 V117 M100 117 V170" className="d"/><T x={95} y={40} a="end" s>H/3 (ถี่)</T><T x={95} y={94} a="end" s>H/2</T><T x={95} y={146} a="end" s>H/6</T>
  <rect x={128} y={150} width={12} height={8} className="cpl"/><rect x={180} y={136} width={12} height={8} className="cpl"/><T x={212} y={146} a="start" s>coupler สลับระดับ</T></>,
 'beam-splice':()=><><rect x={10} y={40} width={300} height={60} className="c"/>{[40,160,280].map(x=><rect key={x} x={x-12} y={30} width={24} height={110} className="c2"/>)}
  <rect x={80} y={36} width={40} height={14} className="zone"/><rect x={200} y={36} width={40} height={14} className="zone"/><rect x={52} y={88} width={28} height={14} className="zone"/><rect x={172} y={88} width={28} height={14} className="zone"/>
  <path d="M14 48 H112 M88 52 H306" className="b"/><path d="M14 92 H76 M58 96 H306" className="b2"/><T x={100} y={24} s>ทาบบน: กลางช่วง</T><T x={100} y={124} s>ทาบล่าง: หน้าเสา–L/4</T><T x={230} y={162} s>ห้ามทาบในรอยต่อเสา-คาน</T></>,
 'shape-model':()=><><path d="M40 140 l60 -30 l120 0 l-60 30z" className="c"/><path d="M40 140 v20 h120 v-20 M160 160 l60 -30 v-20" className="l"/>
  <path d="M110 112 l20 -10 l40 0 l-20 10z M110 112 v-70 l20 -10 v70 M150 112 v-70 l20 -10 M110 42 h40 l20 -10 h-40z" className="c2"/>
  <ellipse cx={240} cy={60} rx={34} ry={12} className="c2"/><ellipse cx={240} cy={60} rx={16} ry={6} className="void"/>
  <T x={70} y={176} s>box (ฐาน)</T><T x={140} y={26} s>box (เสา)</T><T x={240} y={88} s>circle-ring / void</T></>,
 'rebar-window':()=><><rect x={6} y={6} width={308} height={20} rx={3} className="node"/><T x={160} y={20} s>ตารางชิ้นส่วน · Tag · focus</T>
  {[['แปลน',6,30],['X–X',110,30],['Y–Y',6,104],['3D',110,104]].map(([l,x,y])=><g key={l as string}><rect x={x as number} y={y as number} width={100} height={70} rx={3} className="node"/><T x={(x as number)+50} y={(y as number)+14} s>{l}</T><T x={(x as number)+92} y={(y as number)+14} s>⤢</T></g>)}
  <rect x={36} y={52} width={44} height={40} className="c"/><path d="M40 60h36M40 84h36" className="b"/><rect x={140} y={56} width={44} height={36} className="c"/><path d="M146 86h32" className="b"/>
  <rect x={216} y={30} width={98} height={144} rx={3} className="node"/><T x={265} y={44} s>ชุดเหล็ก</T>{['F1/01','F1/02','F1/03'].map((m,i)=><g key={m}><rect x={222} y={52+i*20} width={86} height={16} rx={2} className={`node ${i===1?'hl':''}`}/><T x={265} y={64+i*20} s>{m}</T></g>)}<T x={265} y={130} s>คลิกขวา = แก้</T></>,
 tags:()=><><rect x={30} y={100} width={130} height={50} className="c"/><rect x={70} y={40} width={40} height={60} className="c2"/><rect x={180} y={100} width={110} height={50} className="c"/>
  <T x={36} y={94} a="start" s>F1</T><T x={90} y={60} s>C1</T><T x={186} y={94} a="start" s>F2</T><path d="M40 140 H280" className="b2"/><T x={230} y={170} s>กลุ่ม G1 (F1+F2) → G1/01</T>
  <path d="M40 110 H150" className="b"/><T x={95} y={126} s>F1/01</T></>,
 hooks:()=>{const r=12,y=78,stop=y-r-2;
  const h90=(x:number)=><path d={`M${x} 150 V${y} A${r} ${r} 0 0 1 ${x+r} ${y-r} H${x+46}`} className="b"/>;
  const h135=(x:number)=>{const cx=x+r,ex=cx+r*Math.SQRT1_2,ey=y-r*Math.SQRT1_2;return <path d={`M${x} 150 V${y} A${r} ${r} 0 0 1 ${ex} ${ey} L${ex+30} ${ey+30}`} className="b"/>;};
  const h180=(x:number)=><path d={`M${x} 150 V${y} A${r} ${r} 0 0 1 ${x+2*r} ${y} V${y+26}`} className="b"/>;
  return <>{[[40,h90,'90° · 6db / 12db'],[140,h135,'135° · 10db'],[240,h180,'180° · max(4d, 65)']].map(([x,f,l])=><g key={l as string}>
   <path d={`M${(x as number)-16} ${stop} H${(x as number)+56}`} className="a dash"/>{(f as (x:number)=>ReactNode)(x as number)}<T x={(x as number)+20} y={170} s>{l as string}</T></g>)}
   <T x={160} y={40} s>เส้นหยุดเหล็กปลาย = ผิวนอกของส่วนโค้ง</T></>;},
 'bar-ends':()=><><rect x={40} y={50} width={240} height={80} className="c"/><path d="M56 50 V130 M264 50 V130" className="a dash"/>
  <path d="M30 116 H56" className="b"/><path d="M56 116 H240" className="b"/><path d="M240 116 h12 a8 8 0 0 0 8 -8 v-30" className="b"/>
  <path d="M30 104 H56" className="d"/><T x={42} y={98} s>ext +</T><T x={250} y={142} s>ext − / ขอ</T><T x={56} y={44} s>cover</T><T x={264} y={44} s>cover</T></>,
 'cover-faces':()=><><path d="M80 120 l60 -30 h120 l-60 30z" className="c"/><path d="M80 120 v40 h120 v-40 M200 160 l60 -30 v-40" className="l"/><path d="M200 120 v40 l60 -30 v-40z" className="sel"/>
  <T x={170} y={110} s>top</T><T x={140} y={145} s>y0</T><T x={232} y={140} s>x1 ✓</T><rect x={20} y={20} width={110} height={44} rx={5} className="node hl"/><T x={75} y={38} s>Cover x1</T><T x={75} y={54} s>75 mm ↵</T></>,
 'layout-rule':()=><>{[['ระยะ @200',34,6],['จำนวน 4',84,4],['เส้นเดียว',134,1]].map(([l,y,n])=><g key={l as string}><T x={60} y={(y as number)+4} s>{l}</T>
  <path d={`M110 ${y} H300`} className="l"/>{[...Array(n as number)].map((_,i)=><Dot key={i} x={(n as number)===1?205:116+i*(178/((n as number)-1))} y={y as number}/>)}</g>)}<T x={160} y={176} s>จำนวนไม่เกินที่ระยะรองรับ · สูงสุด 2,000 / Mark</T></>,
 snaps:()=><><rect x={40} y={30} width={240} height={120} className="c"/><rect x={56} y={46} width={208} height={88} className="a dash"/><Dot x={100} y={118} r={6}/><Dot x={113} y={118} r={6} k="a"/>
  <path d="M100 135 v12 M113 135 v12" className="d"/><T x={106} y={168} s>(d₁+d₂)/2</T><T x={270} y={60} a="end" s>เส้น cover</T><path d="M150 46 V134" className="b2"/><T x={180} y={90} a="start" s>ดูดที่ cover / ผิว</T></>,
 'sheet-a3':()=><><rect x={8} y={8} width={304} height={164} className="node"/><rect x={16} y={16} width={170} height={90} className="node"/><T x={100} y={60} s>แปลน / รูปตัด</T>
  <rect x={16} y={112} width={170} height={52} className="node"/><T x={100} y={140} s>ตาราง BBS</T><rect x={194} y={16} width={110} height={60} className="node"/><T x={249} y={48} s>หมายเหตุ</T>
  <rect x={194} y={82} width={110} height={44} className="node"/><T x={249} y={108} s>ตาราง BOQ</T><rect x={194} y={132} width={110} height={32} className="node hl"/><T x={249} y={152} s>Title block</T></>,
 'boq-chain':()=><><Box x={10} y={30} w={90} h={36} label="สมาชิก × ตำแหน่ง"/><Box x={10} y={100} w={90} h={36} label="งานหน้างาน"/><Box x={125} y={64} w={80} h={40} label="ปริมาณ" tone="hl"/>
  <Box x={230} y={20} w={80} h={30} label="อาคาร / ชั้น"/><Box x={230} y={70} w={80} h={30} label="ราคา"/><Box x={230} y={120} w={80} h={30} label="หมวด BOQ"/>
  <Arrow d="M100 48 L123 78"/><Arrow d="M100 118 L123 92"/><Arrow d="M205 78 L228 38"/><Arrow d="M205 84 H228"/><Arrow d="M205 92 L228 132"/></>,
 cutting:()=><>{[[4,3.6,3.2,1.2],[4.5,4.5,2.7,0.3],[6,5.6,0.4]].map((r,j)=><g key={j}><T x={30} y={48+j*40} s>{`12 m #${j+1}`}</T>{r.reduce<[number,ReactNode[]]>(([x,acc],v,i)=>{const w=v/12*220,last=i===r.length-1;acc.push(<g key={i}><rect x={56+x} y={34+j*40} width={w-2} height={22} className={last?'scrap':'cut'}/>{last?<T x={280} y={49+j*40} a="start" s>{`เศษ ${v}`}</T>:<T x={56+x+w/2} y={49+j*40} s>{v}</T>}</g>);return [x+w,acc];},[0,[]])[1]}</g>)}
  <T x={160} y={168} s>ใช้เศษในสต็อกก่อน · เศษสั้นเป็นของทิ้ง</T></>,
 ifc:()=><><Box x={10} y={70} w={70} h={40} label=".ifc" tone="hl"/><Box x={110} y={30} w={90} h={30} label="คอนกรีต"/><Box x={110} y={120} w={90} h={30} label="IfcReinforcingBar"/>
  <Box x={230} y={30} w={80} h={30} label="สมาชิก"/><Box x={230} y={120} w={80} h={30} label="Mark (รวมเท่ากัน)"/><Box x={230} y={75} w={80} h={30} label="WBS ชั้น"/>
  <Arrow d="M80 82 L108 48"/><Arrow d="M80 98 L108 132"/><Arrow d="M200 45 H228"/><Arrow d="M200 135 H228"/><Arrow d="M155 60 L228 88"/></>,
 'ai-read':()=><><Box x={8} y={70} w={66} h={40} label="อัปโหลด"/><Box x={88} y={70} w={66} h={40} label="AI อ่าน" tone="hl"/><Box x={168} y={70} w={66} h={40} label="ตรวจ / แก้" tone="warn"/><Box x={248} y={70} w={66} h={40} label="ใช้ข้อมูล" tone="ok"/>
  <Arrow d="M74 90h12"/><Arrow d="M154 90h12"/><Arrow d="M234 90h12"/><T x={160} y={140} s>ตรวจทุกค่าก่อนส่งตรวจ — AI อาจอ่านผิด</T></>,
 spec:()=><><Box x={10} y={70} w={90} h={40} label="General Spec" tone="hl"/>{['โครงการ A','โครงการ B'].map((p,i)=><g key={p}><Box x={130} y={40+i*60} w={80} h={34} label={p}/><Arrow d={`M100 90 L128 ${57+i*60}`}/><Box x={240} y={40+i*60} w={70} h={34} label="เหล็ก gen-*"/><Arrow d={`M210 ${57+i*60} H238`}/></g>)}<T x={160} y={170} s>บันทึก Profile → โครงการที่ผูกคำนวณใหม่</T></>,
 templates:()=><><rect x={10} y={20} width={300} height={140} className="node"/>{['ชนิด','L1–L3','L4–L6','L7–Roof'].map((h,i)=><T key={h} x={50+i*72} y={38} s>{h}</T>)}
  {['C1','C2','C3'].map((c,j)=><g key={c}><T x={50} y={70+j*34} s>{c}</T>{[0,1,2].map(i=><g key={i}><rect x={92+i*72} y={56+j*34} width={64} height={24} rx={3} className={`node ${j===0&&i===1?'hl':''}`}/><T x={124+i*72} y={72+j*34} s>{`${12-2*i}DB${25-3*i}`}</T></g>)}</g>)}</>,
 civil:()=><><path d="M20 60 v80 h80 v-80 h-12 v68 h-56 v-68z" className="c"/><path d="M28 64 v68 h64 v-68" className="b"/>
  <path d="M130 60 l35 75 l35 -75 h-12 l-23 52 l-23 -52z" className="c"/><path d="M140 62 l25 58 l25 -58" className="b"/>
  <rect x={225} y={90} width={85} height={30} className="c"/><path d="M231 108 h73" className="b"/><T x={60} y={162} s>ราง U</T><T x={165} y={162} s>ราง V</T><T x={268} y={140} s>ถนน</T></>,
 arch:()=><><rect x={40} y={30} width={240} height={120} className="node"/><path d="M40 30 h240 v120 h-240z" className="wall"/><rect x={120} y={144} width={40} height={12} className="sel"/><rect x={276} y={70} width={8} height={40} className="sel"/>
  <T x={160} y={90}>ห้อง 201</T><T x={160} y={108} s>พื้น · ผนัง · ฝ้า · บัว</T><T x={140} y={172} s>ประตู</T><T x={270} y={64} a="end" s>หน้าต่าง</T></>,
 steel:()=><><path d="M40 40 h40 v8 h-16 v84 h16 v8 h-40 v-8 h16 v-84 h-16z" className="c2"/><path d="M110 80 h170 v12 h-170z" className="c"/><rect x={100} y={70} width={10} height={32} className="sel"/>
  {[0,1].map(i=><circle key={i} cx={105} cy={78+i*16} r={3} className="af"/>)}<T x={60} y={162} s>เสา H</T><T x={195} y={72} s>คาน + เพลท + น็อต</T><T x={195} y={120} s>kg · m² สี · m เชื่อม</T></>,
};

export function HelpFigure({id,caption}:{id:FigureId;caption?:string}){
 const f=figures[id];if(!f)return null;
 return <figure className="help-figure"><Svg label={caption||id}>{f()}</Svg>{caption&&<figcaption>{caption}</figcaption>}</figure>;
}
