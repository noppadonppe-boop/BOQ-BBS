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
  Custom:{
    category:'Custom',dimensions:[1000,1000,1000],cover:40,
    faces:[true,true,true,true,true,true],
    description:'องค์ประกอบคอนกรีตกำหนดเอง',
    reinforcement:'กำหนดรูปแบบเหล็กจากแบบต้นทาง',
    quantityBasis:'กล่องพื้นฐาน X × Y × Z',
    notes:['ใช้ Geometry editor เมื่อรูปทรงไม่ใช่กล่องพื้นฐาน']
  }
};

export function elementDefaults(category:Category):ElementDefaultProfile{return profiles[category];}

