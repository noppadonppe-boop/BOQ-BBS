import type {CivilCategory} from './civilInputSchema';
import type {Category,Member,Vec3} from './model';

export type ElementDefaultProfile={
  category:Category;
  dimensions:Vec3;
  cover:number;
  faces:Member['faces'];
  description:string;
  reinforcement:string;
  quantityBasis:string;
  notes:string[];
};

const profiles:Record<Category,ElementDefaultProfile>={
  Foundation:{
    category:'Foundation',dimensions:[2400,2400,600],cover:75,
    faces:[true,true,true,true,false,false],
    description:'ฐานรากคอนกรีตเสริมเหล็ก',
    reinforcement:'เหล็กเสริมฐานรากด้านล่างสองทิศทาง · ระบุ Ø / spacing / จำนวนจากแบบ',
    quantityBasis:'คอนกรีตฐานราก + Lean + Excavation',
    notes:['Pedestal เริ่มต้น 0 × 0 × 0 mm','Lean เริ่มต้น 2600 × 2600 × 100 mm','Excavation เริ่มต้น 3000 × 3000 × 1200 mm']
  },
  Beam:{
    category:'Beam',dimensions:[6000,300,600],cover:40,
    faces:[false,false,true,true,true,false],
    description:'คานคอนกรีตเสริมเหล็ก',
    reinforcement:'เหล็กหลักตามแนวคาน + เหล็กปลอก / เหล็กบน-ล่างตามแบบ',
    quantityBasis:'ความยาว × หน้าตัดคาน',
    notes:['ผิวแบบหล่อเริ่มต้น: Y− / Y+ / Z−','แบ่ง spacing เป็นช่วงเมื่อแบบระบุไม่เท่ากัน']
  },
  Column:{
    category:'Column',dimensions:[400,400,3200],cover:40,
    faces:[true,true,true,true,false,false],
    description:'เสาคอนกรีตเสริมเหล็ก',
    reinforcement:'เหล็กยืน + เหล็กปลอกล้อมรอบหน้าตัด',
    quantityBasis:'หน้าตัด × ความสูงเสา',
    notes:['หน้าตัดเริ่มต้น 400 × 400 mm','ตรวจ lap / starter / tie spacing จากแบบก่อนใช้']
  },
  Slab:{
    category:'Slab',dimensions:[6000,4000,150],cover:40,
    faces:[true,true,true,true,true,false],
    description:'พื้นคอนกรีตเสริมเหล็ก',
    reinforcement:'เหล็กเสริมพื้นบน/ล่างสองทิศทางตาม panel และ support',
    quantityBasis:'พื้นที่ × ความหนาพื้น',
    notes:['มิติเริ่มต้นเป็น panel 6000 × 4000 mm','ตรวจ opening / drop / band beam จากแบบ']
  },
  Wall:{
    category:'Wall',dimensions:[6000,200,3000],cover:40,
    faces:[true,true,true,true,false,false],
    description:'ผนังคอนกรีตเสริมเหล็ก',
    reinforcement:'เหล็กแนวตั้งและแนวนอนสองผิวตามแบบ',
    quantityBasis:'ความยาว × ความหนา × ความสูง',
    notes:['ความหนาเริ่มต้น 200 mm','ตรวจ boundary element / opening / joint จากแบบ']
  },
  Stair:{
    category:'Stair',dimensions:[4000,1200,1800],cover:20,
    faces:[false,false,true,true,true,false],
    description:'บันไดคอนกรีตเสริมเหล็ก (ท้องบันได + ชานพัก)',
    reinforcement:'เหล็กหลักตามแนวลาดท้องบันได เหล็กกระจาย และเหล็กชานพักตามแบบ',
    quantityBasis:'รูปทรงจากเครื่องมือรูปทรง / Prism (ท้องบันไดเอียง + ขั้นบันได)',
    notes:['X = ความยาวราบ, Y = ความกว้างบันได, Z = ความสูงที่ขึ้น','จำลองรูปทรงด้วยแท็บ “รูปทรง” หรือ Prism แล้ววาดเหล็กบนรูปตัด']
  },
  Lift:{
    category:'Lift',dimensions:[2400,2400,3500],cover:40,
    faces:[true,true,true,true,false,false],
    description:'ผนังปล่องลิฟต์ / Core wall และบ่อลิฟต์ (Pit)',
    reinforcement:'เหล็กแนวตั้งและแนวนอนสองผิว มุมผนัง และพื้นบ่อลิฟต์ตามแบบ',
    quantityBasis:'รูปทรงจากเครื่องมือรูปทรง (ผนังรอบ + ช่องว่างภายใน + พื้นบ่อ)',
    notes:['X × Y = ขนาดปล่องภายนอก, Z = ความสูงต่อช่วงเท','ใช้รูปทรงแบบ solid + void สำหรับช่องลิฟต์']
  },
  Custom:{
    category:'Custom',dimensions:[1000,1000,1000],cover:40,
    faces:[true,true,true,true,true,true],
    description:'องค์ประกอบคอนกรีตกำหนดเอง',
    reinforcement:'กำหนดรูปแบบเหล็กจากแบบต้นทาง',
    quantityBasis:'กล่องพื้นฐาน X × Y × Z',
    notes:['ใช้ Geometry editor เมื่อรูปทรงไม่ใช่กล่องพื้นฐาน']
  },
  ...civilProfiles(),
  // Architecture Work (phase 3a): quantity only, from the form “งานสถาปัตย์” (finish library of the spec)
  Room:{category:'Room',dimensions:[4000,4000,2700],cover:0,faces:[false,false,false,false,false,false],description:'ห้อง / พื้นที่ (ตารางงานผิว)',reinforcement:'ไม่มีเหล็กเสริม',quantityBasis:'พื้น / ฝ้า = พื้นที่ห้อง · ผนัง = เส้นรอบรูป × สูงฝ้า − ช่องเปิด · บัว = เส้นรอบรูป − ความกว้างประตู',notes:['X × Y = กว้าง × ยาว (หรือกรอกพื้นที่ / เส้นรอบรูปตามแบบ), Z = สูงฝ้า','วัสดุผิวเลือกจากคลังวัสดุผิวใน General Spec']},
  Opening:{category:'Opening',dimensions:[900,100,2000],cover:0,faces:[false,false,false,false,false,false],description:'ประตู / หน้าต่าง (ตาราง Door / Window)',reinforcement:'ไม่มีเหล็กเสริม',quantityBasis:'จำนวนชุด · พื้นที่ช่องเปิด · ความยาววงกบ ตามรายการของแบบ',notes:['รหัสสมาชิก = แบบประตู / หน้าต่าง (D1, W1 …) · ตำแหน่ง = ห้อง / ชั้น ใน WBS']},
  MasonryWall:{category:'MasonryWall',dimensions:[5000,100,3000],cover:0,faces:[false,false,false,false,false,false],description:'ผนังก่อ (ชนิดผนังตามแบบ)',reinforcement:'เสาเอ็น / ทับหลัง / คานเอ็น ค.ส.ล. (คิดเป็นความยาว)',quantityBasis:'ยาว × สูง − ช่องเปิด · เสาเอ็นที่ปลาย ทุกระยะ และข้างช่องเปิด · ทับหลัง = กว้างช่องเปิด + ระยะฝาก 2 ข้าง',notes:['X = ความยาวแนวผนัง, Y = ความหนา, Z = ความสูง','ชนิดผนัง (อิฐ / บล็อก + ฉาบ) เลือกจากคลังวัสดุผิว → ผนังก่อ']},
  Roof:{category:'Roof',dimensions:[10000,12000,1000],cover:0,faces:[false,false,false,false,false,false],description:'หลังคา (วัสดุมุง)',reinforcement:'ไม่มีเหล็กเสริม',quantityBasis:'พื้นที่แปลน / cos(มุมลาด) · ครอบสัน เชิงชาย ปั้นลม เป็นความยาว',notes:['วัสดุมุงเลือกจากคลังวัสดุผิว → หลังคา']},
};
// Civil Work (phase 2a): geometry from the parametric form “รูปทรงสำเร็จรูป”, bars with the free-form tools
function civilProfiles():Record<CivilCategory,ElementDefaultProfile>{
 const p=(category:CivilCategory,dimensions:Vec3,cover:number,faces:boolean[],description:string,reinforcement:string,quantityBasis:string,notes:string[]):ElementDefaultProfile=>({category,dimensions,cover,faces,description,reinforcement,quantityBasis,notes});
 const ditch=['X = ความยาว, Y = ความกว้างภายนอก, Z = ความสูงรวม','กรอกขนาดในแท็บ “รูปทรงสำเร็จรูป” แล้ววาดเหล็กบนรูปตัด'];
 return {
  UDitch:p('UDitch',[10000,700,650],50,[false,false,true,true,false,false],'รางระบายน้ำ U คอนกรีตเสริมเหล็ก (หล่อในที่)','เหล็กปลอก U ตามขวาง + เหล็กยาวตามแนวราง','หน้าตัด × ความยาว · BOQ เป็น m ได้',ditch),
  VDitch:p('VDitch',[10000,1400,600],40,[false,false,false,false,false,false],'รางระบายน้ำ V / คางหมู (คอนกรีตดาด)','ตะแกรงเหล็ก / Wire mesh ตามแบบ (ถ้ามี)','หน้าตัดดาด × ความยาว · BOQ เป็น m ได้',ditch),
  Trench:p('Trench',[10000,900,1070],50,[false,false,true,true,false,false],'Trench / รางเคเบิล พร้อมฝา','เหล็กปลอก U + เหล็กยาว · ฝาตามแบบ','หน้าตัด × ความยาว · BOQ เป็น m ได้',ditch),
  Manhole:p('Manhole',[1600,1600,1900],50,[true,true,true,true,false,false],'บ่อพัก (Manhole) คอนกรีตเสริมเหล็ก','ตะแกรงพื้นบ่อ · เหล็กผนังสองผิว · ฝา','พื้น + ผนัง + ฝา (หักช่องเปิด)',['ขนาดภายในตามแบบ · ช่องเปิดฝาเป็นช่องว่าง (void)']),
  Pit:p('Pit',[2200,2200,1750],50,[true,true,true,true,false,false],'บ่อ / Pit คอนกรีตเสริมเหล็ก','ตะแกรงพื้นบ่อ · เหล็กผนังสองผิว','พื้น + ผนัง (+ ฝาถ้ามี)',['งานดินขุด / คอนกรีตหยาบจากข้อมูลหน้างานของรูปทรง']),
  UGTank:p('UGTank',[4900,3900,3000],50,[true,true,true,true,false,false],'ถังเก็บน้ำใต้ดิน คอนกรีตเสริมเหล็ก (กันซึม)','ตะแกรงพื้น 2 ชั้น · ผนังสองผิว · พื้นบน','พื้น + ผนัง + พื้นบน (หักช่องเปิด)',['ตรวจ Mix คอนกรีตกันซึมใน General Spec']),
  AGTank:p('AGTank',[4900,3900,3000],50,[true,true,true,true,false,false],'ถังเก็บน้ำบนดิน คอนกรีตเสริมเหล็ก','ตะแกรงพื้น · ผนังสองผิว · พื้นบน','พื้น + ผนัง + พื้นบน (หักช่องเปิด)',['ไม่มีงานดินขุดเต็มความลึก (ขุดเฉพาะชั้นรองพื้น)']),
  ConcretePaving:p('ConcretePaving',[6000,4000,200],50,[true,true,true,true,false,false],'ถนน / ลานคอนกรีต (ต่อแผ่น)','ตะแกรงเหล็ก / Wire mesh · Dowel ที่รอยต่อ','กว้าง × ยาว × หนา · BOQ เป็น m² ได้',['1 สมาชิก = 1 แผ่น / ช่วงเท · จำนวน = จำนวนแผ่น']),
  RCPipe:p('RCPipe',[20000,720,720],0,[false,false,false,false,false,false],'งานวางท่อระบายน้ำ ค.ส.ล. (ท่อสำเร็จรูป)','ไม่มีเหล็กเสริม (ท่อสำเร็จรูปตามชั้นคุณภาพ)','ความยาว (m) · จำนวนท่อน · ขุดร่อง · ทรายรองท่อ · ถมกลับ',['X = ความยาวแนวท่อ · กรอกในแท็บ “รูปทรงสำเร็จรูป”','ถมกลับหักปริมาตรท่อและทรายรองท่อ']),
  PEPipe:p('PEPipe',[50000,200,200],0,[false,false,false,false,false,false],'งานวางท่อ PE / HDPE','ไม่มีเหล็กเสริม','ความยาว (m) · จำนวนท่อน · ขุดร่อง · ทรายรองท่อ · ถมกลับ',['ขนาดท่อ PE ใช้ขนาดผิวนอก (OD) ตามมาตรฐาน']),
  AsphaltPaving:p('AsphaltPaving',[20000,6000,300],0,[false,false,false,false,false,false],'ผิวทางแอสฟัลต์ (ปริมาณอย่างเดียว)','ไม่มีเหล็กเสริม','พื้นที่ × ชั้นวัสดุ (m² / m³) · ไม่มีคอนกรีต',['ชั้นวัสดุกำหนดในแท็บ “รูปทรงสำเร็จรูป” · ออกเป็นรายการใน BOQ']),
 };
}

export function elementDefaults(category:Category):ElementDefaultProfile{return profiles[category];}

