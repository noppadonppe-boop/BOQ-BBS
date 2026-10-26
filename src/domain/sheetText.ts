import type {Category} from './model';

/** Language of the A3 BBS sheet (project setting `titleBlock.sheetLanguage`, default Thai). */
export type SheetLang='th'|'en'|'zh';
export const sheetLangs:{id:SheetLang;label:string}[]=[{id:'th',label:'ไทย'},{id:'en',label:'English'},{id:'zh',label:'中文'}];
export const sheetLangOf=(p:{titleBlock?:{sheetLanguage?:string}}):SheetLang=>p.titleBlock?.sheetLanguage==='en'||p.titleBlock?.sheetLanguage==='zh'?p.titleBlock.sheetLanguage:'th';

type Text={
 category:Record<Category,string>;plan:string;planBottom:string;planTop:string;sectionX:(y:number)=>string;sectionY:(x:number)=>string;columnSection:(kind:'pedestal'|'starter',z:number)=>string;notes:string;legend:string;
 coverNames:Record<string,string>;nts:string;scaled:(size:string)=>string;cover:string;pedestal:string;bendRadius:(s:number,l:number,t:number)=>string;bendPerMark:string;
 hooks:(h90:number,h135:number,min:number,lap:string)=>string;lapSpec:(rows:string)=>string;rounding:(r:number,ed:string,steel:string)=>string;concrete:(mix:string)=>string;perTable:string;tie:string;
 pile:(n:number,size:number,len:number,cut:number,embed:number,inConcrete:boolean)=>string;stages:(n:number,list:string)=>string;sketched:string;coupler:(list:string,stagger:number)=>string;
 quantity:(n:number,where:string)=>string;noLocation:string;dashes:string;perPiece:(mark:string,count:number)=>string;
 cols:[string,string,string,string,string,string,string,string];noBars:string;totalWeight:(kg:string,n:number)=>string;
 boqHead:(n:number)=>[string,string,string,string];provisional:string;
 boq:{concrete:string;stage:(s:number)=>string;stageForm:(s:number)=>string;joint:string;formwork:string;excavation:string;backfill:string;lean:string;sand:string;sheet:string;compaction:string;pile:(size:number,len:number)=>string;pileLength:string;pileCut:(mm:number)=>string;steel:(bar:string,grade:string)=>string;steelTotal:string;piece:string};
 tb:{company:string;project:string;title:string;defaultTitle:(cat:string,code:string)=>string;client:string;contractor:string;sub:string;drawn:string;checked:string;approved:string;number:string;rev:string;date:string;size:string;sheet:string;status:string};
 unsaved:string;
};
const th:Text={
 category:{Foundation:'ฐานราก',Beam:'คาน',Column:'เสา',Slab:'พื้น',Wall:'ผนัง',Stair:'บันได',Lift:'ลิฟต์ / Core',Custom:'องค์ประกอบอื่น',UDitch:'รางระบายน้ำ U',VDitch:'รางระบายน้ำ V',Trench:'รางเคเบิล (Trench)',Manhole:'บ่อพัก',Pit:'บ่อ (Pit)',UGTank:'ถังเก็บน้ำใต้ดิน',AGTank:'ถังเก็บน้ำบนดิน',ConcretePaving:'ถนน / ลานคอนกรีต',AsphaltPaving:'ผิวทางแอสฟัลต์',RCPipe:'ท่อ ค.ส.ล.',PEPipe:'ท่อ PE',Room:'ห้อง / งานผิว',Opening:'ประตู-หน้าต่าง',MasonryWall:'ผนังก่อ',Roof:'หลังคา',Railing:'ราวกันตก / ราวบันได',Fixture:'สุขภัณฑ์ / ครุภัณฑ์',SteelAssembly:'Assembly เหล็กรูปพรรณ'},plan:'แปลน',planBottom:'แปลนเหล็กล่าง',planTop:'แปลนเหล็กบน',sectionX:y=>`รูปตัด X–X (Y = ${y})`,sectionY:x=>`รูปตัด Y–Y (X = ${x})`,columnSection:(k,z)=>k==='pedestal'?`รูปตัดเสาตอม่อ Z–Z (Z = ${z})`:`แปลนเหล็กเสาเริ่ม Starter (Z = ${z})`,notes:'หมายเหตุ',legend:'สัญลักษณ์ Mark',
 coverNames:{bottom:'ล่าง',top:'บน',side:'ข้าง',edge:'ขอบ',face:'ผิว'},nts:'มิติทั้งหมดเป็นมิลลิเมตร (mm) · ไม่ใช้วัดจากแบบ (NTS)',scaled:z=>`มิติทั้งหมดเป็นมิลลิเมตร (mm) · มาตราส่วนตามที่ระบุในแต่ละรูป เมื่อพิมพ์บนกระดาษ ${z} · ใช้ค่ามิติที่เขียนเป็นหลัก`,cover:'ระยะหุ้มคอนกรีต C (Covering)',coupler:(l,st)=>`ปลายบนเหล็กยืนต่อด้วย Coupler (ข้อต่อทางกล): ${l}${st?` · เหลื่อมทีละครึ่ง ${st} mm`:''} · กล่องที่ปลายเหล็กในรูปตัด = Coupler`,pedestal:'เสาตอม่อ',
 bendRadius:(s,l,t)=>`รัศมีดัดใน ${s}d (Ø ≤ 16) / ${l}d (Ø ≥ 20) · ปลอก ${t}d`,bendPerMark:'รัศมีดัดตามข้อมูลแต่ละ Mark',
 hooks:(a,b,min,lap)=>`เหล็กปลอก Ø6–Ø9 ขอ 135° = ${b}d ≥ ${min} mm · เหล็กปลอก Ø10 ขึ้นไป งอฉาก 90° = ${a}d · ทาบ ${lap}`,lapSpec:r=>`ตาม Spec (${r})`,
 concrete:mix=>`คอนกรีต ${mix}`,
 rounding:(r,ed,steel)=>`ยาวตัดปัดขึ้นทีละ ${r} mm${ed?` (${ed})`:''} · เหล็ก ${steel}`,perTable:'ตามตาราง',tie:'ปลอก',
 pile:(n,size,len,cut,embed,c)=>`เสาเข็ม ${n} ต้น ${size} mm ยาว ${len} m · ตัดหัวเข็ม ${cut} mm · ฝังใน${c?'คอนกรีต':'ฐาน'} ${embed} mm`,stages:(n,l)=>`เทคอนกรีต ${n} ขั้น: ${l}`,
 sketched:'เหล็กที่วาดบนรูปตัด: รัศมีดัดขั้นต่ำ BS 8666 (2d Ø ≤ 16 / 3.5d Ø ≥ 20) · ขอมาตรฐานตามตาราง Standard Hooks ของ Spec',
 quantity:(n,w)=>`จำนวนองค์ประกอบ ${n} ชิ้น: ${w}`,noLocation:'ไม่ระบุตำแหน่ง',dashes:'เส้นประสีส้ม = ช่วงเหล็กโผล่ (พื้นที่อ้างอิง ไม่คิดปริมาณ) · เส้นประสีน้ำตาล = แนวขุด / เสาเข็ม',
 perPiece:(m,c)=>`${m} · ${c} เส้น/ชิ้น`,cols:['Mark','ตำแหน่ง','Ø / เกรด','รูปดัด','ยาว/เส้น','ต่อชิ้น','รวมเส้น','น้ำหนัก kg'],
 noBars:'ยังไม่มีชุดเหล็ก · ใช้ข้อมูลพื้นฐานเพื่อสร้าง Bar cut list',totalWeight:(kg,n)=>`น้ำหนักเหล็กรวม ${kg} kg (${n} ชิ้น)`,
 boqHead:n=>['รายการ','หน่วย','ต่อ 1 ชิ้น',`รวม ${n} ชิ้น`],provisional:'ค่าพรีวิว · ยังไม่ยืนยันที่มาข้อมูลปริมาณ (Provisional)',
 boq:{concrete:'คอนกรีต',stage:s=>`  คอนกรีต Stage ${s}`,stageForm:s=>`  แบบหล่อ Stage ${s}`,joint:'รอยต่อการเทคอนกรีต (Construction joint)',formwork:'แบบหล่อ',excavation:'งานขุดดิน',backfill:'ถมดินกลับ',sand:'ทรายรองพื้น',sheet:'แผ่นพลาสติกรองพื้น',compaction:'บดอัดดิน',lean:'คอนกรีตหยาบ (Lean)',pile:(s,l)=>`เสาเข็ม ${s} mm × ${l} m`,pileLength:'ความยาวเสาเข็มรวม',pileCut:mm=>`ตัดหัวเข็ม (${mm} mm/ต้น)`,steel:(b,g)=>`เหล็ก ${b} (${g})`,steelTotal:'เหล็กรวม',piece:'ต้น'},
 tb:{company:'บริษัท / ผู้ออกแบบ',project:'โครงการ',title:'ชื่อแบบ',defaultTitle:(c,code)=>`แบบเหล็กเสริม ${c} ${code} · BBS & BOQ`,client:'Client',contractor:'Contractor',sub:'Sub Contract',drawn:'เขียนแบบ',checked:'ตรวจ',approved:'อนุมัติ',number:'เลขที่แบบ',rev:'Revision',date:'วันที่',size:'ขนาด / มาตราส่วน',sheet:'แผ่นที่',status:'สถานะ'},
 unsaved:'DRAFT · ยังไม่บันทึก',
};
const en:Text={
 category:{Foundation:'Foundation',Beam:'Beam',Column:'Column',Slab:'Slab',Wall:'Wall',Stair:'Stair',Lift:'Lift / core',Custom:'Other element',UDitch:'U-ditch',VDitch:'V-ditch',Trench:'Trench',Manhole:'Manhole',Pit:'Pit',UGTank:'Underground tank',AGTank:'Above-ground tank',ConcretePaving:'Concrete paving',AsphaltPaving:'Asphalt paving',RCPipe:'RC pipe laying',PEPipe:'PE pipe laying',Room:'Room finishes',Opening:'Door / window',MasonryWall:'Masonry wall',Roof:'Roof',Railing:'Railing / handrail',Fixture:'Fixture / furniture',SteelAssembly:'Steel assembly'},plan:'Plan',planBottom:'Plan · bottom bars',planTop:'Plan · top bars',sectionX:y=>`Section X–X (Y = ${y})`,sectionY:x=>`Section Y–Y (X = ${x})`,columnSection:(k,z)=>k==='pedestal'?`Pedestal section Z–Z (Z = ${z})`:`Starter bar layout (Z = ${z})`,notes:'Notes',legend:'Mark legend',
 coverNames:{bottom:'bottom',top:'top',side:'side',edge:'edge',face:'face'},nts:'All dimensions in millimetres (mm) · Do not scale (NTS)',scaled:z=>`All dimensions in millimetres (mm) · Scales as shown on each view when printed on ${z} · Written dimensions govern`,cover:'Concrete cover C',coupler:(l,st)=>`Main bar top ends with mechanical couplers: ${l}${st?` · 50 % staggered ${st} mm`:''} · box at the bar end in sections = coupler`,pedestal:'Pedestal',
 bendRadius:(s,l,t)=>`Inner bend radius ${s}d (Ø ≤ 16) / ${l}d (Ø ≥ 20) · links ${t}d`,bendPerMark:'Bend radius as per each Mark',
 hooks:(a,b,min,lap)=>`links Ø6–Ø9: 135° hook = ${b}d ≥ ${min} mm · links Ø10 and larger: 90° hook = ${a}d · lap ${lap}`,lapSpec:r=>`per Spec (${r})`,
 concrete:mix=>`Concrete ${mix}`,
 rounding:(r,ed,steel)=>`Cut lengths rounded up to ${r} mm${ed?` (${ed})`:''} · steel ${steel}`,perTable:'per schedule',tie:'links',
 pile:(n,size,len,cut,embed,c)=>`Piles ${n} nos ${size} mm, length ${len} m · pile head cut-off ${cut} mm · embedded in ${c?'concrete':'footing'} ${embed} mm`,stages:(n,l)=>`Concrete poured in ${n} stages: ${l}`,
 sketched:'Bars drawn on sections: minimum bend radius BS 8666 (2d Ø ≤ 16 / 3.5d Ø ≥ 20) · standard hooks per the Spec Standard Hooks table',
 quantity:(n,w)=>`Number of elements ${n} nos: ${w}`,noLocation:'location not specified',dashes:'Orange dashed = starter bar zone (reference area, not measured) · brown dashed = excavation line / piles',
 perPiece:(m,c)=>`${m} · ${c} bars/element`,cols:['Mark','Description','Ø / grade','Shape','Length/bar','Per elem.','Total bars','Weight kg'],
 noBars:'No bars yet · use the element input to create the bar cut list',totalWeight:(kg,n)=>`Total steel weight ${kg} kg (${n} nos)`,
 boqHead:n=>['Item','Unit','Per element',`Total ${n} nos`],provisional:'Preview values · quantity basis not yet confirmed (Provisional)',
 boq:{concrete:'Concrete',stage:s=>`  Concrete stage ${s}`,stageForm:s=>`  Formwork stage ${s}`,joint:'Construction joint',formwork:'Formwork',excavation:'Excavation',backfill:'Backfill',sand:'Sand bed',sheet:'Plastic sheet',compaction:'Compaction',lean:'Lean concrete',pile:(s,l)=>`Piles ${s} mm × ${l} m`,pileLength:'Total pile length',pileCut:mm=>`Pile head cut-off (${mm} mm/pile)`,steel:(b,g)=>`Steel ${b} (${g})`,steelTotal:'Total steel',piece:'nos'},
 tb:{company:'Company / Designer',project:'Project',title:'Drawing title',defaultTitle:(c,code)=>`Reinforcement detail ${c} ${code} · BBS & BOQ`,client:'Client',contractor:'Contractor',sub:'Sub Contract',drawn:'Drawn',checked:'Checked',approved:'Approved',number:'Drawing No.',rev:'Revision',date:'Date',size:'Size / Scale',sheet:'Sheet',status:'Status'},
 unsaved:'DRAFT · not saved',
};
const zh:Text={
 category:{Foundation:'基础',Beam:'梁',Column:'柱',Slab:'板',Wall:'墙',Stair:'楼梯',Lift:'电梯井',Custom:'其他构件',UDitch:'U型排水沟',VDitch:'V型排水沟',Trench:'电缆沟',Manhole:'检查井',Pit:'坑',UGTank:'地下水池',AGTank:'地上水池',ConcretePaving:'混凝土路面',AsphaltPaving:'沥青路面',RCPipe:'钢筋混凝土管',PEPipe:'PE管',Room:'房间装修',Opening:'门窗',MasonryWall:'砌体墙',Roof:'屋面',Railing:'栏杆扶手',Fixture:'洁具 / 家具',SteelAssembly:'钢结构构件'},plan:'平面图',planBottom:'底筋平面图',planTop:'面筋平面图',sectionX:y=>`剖面 X–X (Y = ${y})`,sectionY:x=>`剖面 Y–Y (X = ${x})`,columnSection:(k,z)=>k==='pedestal'?`短柱剖面 Z–Z (Z = ${z})`:`插筋平面布置 (Z = ${z})`,notes:'说明',legend:'钢筋编号图例',
 coverNames:{bottom:'底',top:'顶',side:'侧',edge:'边',face:'面'},nts:'所有尺寸单位为毫米 (mm) · 不按比例 (NTS)',scaled:z=>`所有尺寸单位为毫米 (mm) · 比例见各图 (${z} 纸打印) · 以标注尺寸为准`,cover:'混凝土保护层 C',coupler:(l,st)=>`纵筋顶端采用机械连接套筒 (Coupler): ${l}${st?` · 50 % 错开 ${st} mm`:''} · 剖面中钢筋端部方框 = 套筒`,pedestal:'短柱',
 bendRadius:(s,l,t)=>`内弯曲半径 ${s}d (Ø ≤ 16) / ${l}d (Ø ≥ 20) · 箍筋 ${t}d`,bendPerMark:'弯曲半径按各钢筋编号',
 hooks:(a,b,min,lap)=>`箍筋 Ø6–Ø9 135° 弯钩 = ${b}d ≥ ${min} mm · 箍筋 Ø10 及以上 90° 弯钩 = ${a}d · 搭接 ${lap}`,lapSpec:r=>`按规范 (${r})`,
 concrete:mix=>`混凝土 ${mix}`,
 rounding:(r,ed,steel)=>`下料长度按 ${r} mm 向上取整${ed?` (${ed})`:''} · 钢筋 ${steel}`,perTable:'按表',tie:'箍筋',
 pile:(n,size,len,cut,embed,c)=>`桩 ${n} 根 ${size} mm 长 ${len} m · 截桩头 ${cut} mm · 嵌入${c?'混凝土':'承台'} ${embed} mm`,stages:(n,l)=>`混凝土分 ${n} 次浇筑: ${l}`,
 sketched:'剖面上绘制的钢筋: 最小弯曲半径 BS 8666 (2d Ø ≤ 16 / 3.5d Ø ≥ 20) · 标准弯钩按规范标准弯钩表',
 quantity:(n,w)=>`构件数量 ${n} 件: ${w}`,noLocation:'未指定位置',dashes:'橙色虚线 = 插筋区段 (参考区域, 不计量) · 棕色虚线 = 开挖线 / 桩',
 perPiece:(m,c)=>`${m} · ${c} 根/件`,cols:['编号','位置','Ø / 等级','形状','单根长','每件','总根数','重量 kg'],
 noBars:'尚无钢筋 · 请用基本数据生成钢筋下料表',totalWeight:(kg,n)=>`钢筋总重 ${kg} kg (${n} 件)`,
 boqHead:n=>['项目','单位','每件',`合计 ${n} 件`],provisional:'预览值 · 工程量依据尚未确认 (Provisional)',
 boq:{concrete:'混凝土',stage:s=>`  混凝土 第 ${s} 次`,stageForm:s=>`  模板 第 ${s} 次`,joint:'施工缝',formwork:'模板',excavation:'土方开挖',backfill:'回填土',sand:'砂垫层',sheet:'塑料薄膜',compaction:'压实',lean:'垫层混凝土',pile:(s,l)=>`桩 ${s} mm × ${l} m`,pileLength:'桩总长',pileCut:mm=>`截桩头 (${mm} mm/根)`,steel:(b,g)=>`钢筋 ${b} (${g})`,steelTotal:'钢筋合计',piece:'根'},
 tb:{company:'公司 / 设计单位',project:'项目',title:'图名',defaultTitle:(c,code)=>`${c} ${code} 配筋图 · BBS & BOQ`,client:'业主',contractor:'总承包',sub:'分包',drawn:'制图',checked:'校对',approved:'审核',number:'图号',rev:'版次',date:'日期',size:'图幅 / 比例',sheet:'张次',status:'状态'},
 unsaved:'草稿 · 未保存',
};
export const sheetText:Record<SheetLang,Text>={th,en,zh};

/** Thai phrases used in generated bar descriptions (Mark notes) and view labels → [English, Chinese].
 * Longest phrases are replaced first; anything not listed stays as typed. */
const phrases:[string,string,string][]=[
 ['เหล็กแนวตั้งผิวข้าง','side-face vertical bars','侧面竖向筋'],['เหล็กรอบข้าง','perimeter loops','周边环筋'],['ตำแหน่งรอบฐาน','positions around footing','处 (沿基础四周)'],
 ['แนวตั้งรอบผิว','vertical around face','沿面竖向'],['เหล็กยืนต่อขึ้นเหนือรอยต่อ','main bars lapped above joint','纵筋接头以上搭接'],['เหล็กยืนต่อลงใต้รอยต่อ','main bars lapped below joint','纵筋接头以下搭接'],
 ['เหล็กยืนเริ่มที่ขอบล่างเสา','main bars start at column base','纵筋自柱底起'],['ระยะห่างจากฐาน','distance from footing','距基础'],['ระยะห่างปลอกชุดที่','link spacing set','箍筋间距 组'],
 ['ปลอกสี่เหลี่ยมใน','inner rectangular link','内矩形箍筋'],['ปลอกข้าวหลามตัด','diamond link','菱形箍筋'],['ปลอกแปดเหลี่ยม','octagonal link','八角形箍筋'],['ปลอกวงกลม','circular link','圆形箍筋'],
 ['ปลอกเกลียว','spiral','螺旋箍筋'],['ปลอกชุดที่','link set','箍筋组'],['ปลอกใน','inner link','内箍筋'],['ปลอกยาวตามแนว','long link along','沿向长箍筋'],['ปลอกแนวยาว','long link','长向箍筋'],
 ['เหล็กปลอกเสาตอม่อ','pedestal links','短柱箍筋'],['เหล็กปลอก','links','箍筋'],['เหล็กรัดขวาง','cross ties','拉筋'],['รัดขวางแนวสั้น','cross tie short direction','短向拉筋'],['รัดขวาง','cross tie','拉筋'],
 ['เหล็กเสาโผล่','column starter bars','柱插筋'],['เสาตอม่อ','pedestal','短柱'],['เหล็กยืน','main bars','纵筋'],['เหล็กแนวตั้ง','vertical bars','竖向筋'],['เหล็กแนวนอน','horizontal bars','水平筋'],
 ['เหล็กล่าง','bottom bars','底筋'],['เหล็กบน','top bars','顶筋'],['เหล็กมุม','corner bars','角筋'],['เหล็กกลางด้าน','middle face bars','中部侧筋'],['เหล็กด้าน','face bars','侧筋'],['เหล็กพื้น','slab bars','板筋'],['เหล็กผนัง','wall bars','墙筋'],
 ['ขนาดเหล็ก','bar size','钢筋规格'],['เส้นรอบวง','circumference','周长'],['เส้นผ่านศูนย์กลาง','diameter','直径'],['ขอครึ่งวงกลม','semicircular hook','半圆弯钩'],['งอฉาก','90° bend','直角弯'],['งอเข้าใน','bent inward','向内弯'],
 ['ระยะห่าง','spacing','间距'],['ระยะฝังในฐานของ','embedment in footing of','嵌入基础'],['ยื่นเข้าพื้น','into slab','伸入板'],['ฐานราก','footing','基础'],['ระดับดิน','ground level','地面标高'],
 ['ตำแหน่ง','positions','处'],['ความหนา','thickness','厚度'],['ความลึก','depth','深度'],['ความกว้าง','width','宽度'],['สองปลาย','both ends','两端'],['ปลายเดียว','one end','单端'],['อีกปลาย','other end','另一端'],
 ['ทุกเส้น','every bar','每根'],['สลับเส้น','alternate bars','隔根'],['ขาแนว','legs along','向肢'],['ตามแนว','along','沿'],['จำกัดถึง','limited to','限至'],['อัตโนมัติ','automatic','自动'],['อ้างอิง','reference','参考'],
 ['ทิศ','dir.','方向'],['ช่วง','span','跨度'],['ชั้น','layers','层'],['ด้าน','side','侧'],['ยาว','length','长'],['ทาบ','lap','搭接'],['ยึด','anchor','锚固'],['ปลอก','link','箍筋'],['ขอ','hook','弯钩'],['รูป','pattern','形式'],
 ['แปลน','plan','平面'],['เส้น','bars','根'],['ชิ้น','nos','件'],['ต้น','nos','根'],['เสา','column','柱'],['คาน','beam','梁'],['พื้น','slab','板'],['ผนัง','wall','墙'],['ล่าง','bottom','底'],['บน','top','顶'],['มุม','corner','角'],['และ','and','和'],
].sort((a,b)=>b[0].length-a[0].length) as [string,string,string][];
const thai=/[฀-๿]/;
/** Translates generated Thai phrases (bar descriptions, view labels); Thai sheets are returned unchanged. */
export function sheetPhrase(text:string,lang:SheetLang){
 if(lang==='th'||!thai.test(text))return text;
 const i=lang==='en'?1:2;let out=text;
 for(const p of phrases)if(out.includes(p[0]))out=out.split(p[0]).join(lang==='en'?` ${p[i]} `:p[i]);
 return out.replace(/ {2,}/g,' ').replace(/ ([,)])/g,'$1').replace(/\( /g,'(').trim();
}
