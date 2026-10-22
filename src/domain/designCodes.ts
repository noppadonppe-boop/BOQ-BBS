import {z} from 'zod';
// Design-code library shown in General Spec. Each project picks one code family
// (spec.designCode); the tables are reference data for detailing and are extended over time.

export const designCodeIds=['ACI','EIT','BS','Custom'] as const;
type BuiltinCodeId=typeof designCodeIds[number];
/** Built-in codes plus extra Custom codes added in a spec (`Custom-<id>`). */
export type DesignCodeId=BuiltinCodeId|`Custom${string}`;
const codeIdPattern=/^(ACI|EIT|BS|Custom(-[a-z0-9]{1,16})?)$/;
export const designCodeIdSchema=z.custom<DesignCodeId>(v=>typeof v==='string'&&codeIdPattern.test(v),'รหัสมาตรฐานไม่ถูกต้อง');
export const designCodes:Record<BuiltinCodeId,{label:string;sub:string;note:string}>={
 ACI:{label:'ACI Code',sub:'ACI 318',note:'American Concrete Institute · Building Code Requirements for Structural Concrete'},
 EIT:{label:'วสท. Code',sub:'มาตรฐาน วสท. (EIT)',note:'สมาคมวิศวกรรมสถานแห่งประเทศไทยฯ · มาตรฐานสำหรับอาคารคอนกรีตเสริมเหล็ก'},
 BS:{label:'BS Code',sub:'BS 8666 / BS 8110',note:'British Standard · การตัด/ดัดเหล็กเสริม (Scheduling, dimensioning, bending and cutting)'},
 Custom:{label:'Custom',sub:'สำเนา ACI Code · แก้ไขได้',note:'ข้อกำหนดเฉพาะ · เริ่มจากค่าตาราง ACI Code และแก้ไขค่าได้ทั้งหมด · ระบุเอกสารที่มาและรุ่นกฎเอง'},
};
/** Custom code entry stored in the spec: display name (e.g. the project it is made for) and note. */
export const customCodeSchema=z.object({id:z.custom<`Custom${string}`>(v=>typeof v==='string'&&/^Custom(-[a-z0-9]{1,16})?$/.test(v)),name:z.string().trim().min(1).max(80),note:z.string().max(500).default('')}).strict();
export type CustomCode=z.infer<typeof customCodeSchema>;
export const isCustomCode=(id:DesignCodeId)=>id.startsWith('Custom');
/** Codes whose hook / lap / beam tables are used and editable (Custom = copy of ACI). */
export const tableCode=(id:DesignCodeId|undefined)=>!!id&&id!=='BS';
type CodeSpec={designCode?:DesignCodeId;customCodes?:CustomCode[]};
/** Codes listed for a spec: ACI, วสท., BS, Custom, then the extra Custom codes it added. */
export function codeList(spec:CodeSpec):DesignCodeId[]{
 return [...designCodeIds,...(spec.customCodes||[]).map(c=>c.id).filter(id=>id!=='Custom')];
}
export function codeInfo(spec:CodeSpec,id:DesignCodeId){
 const own=spec.customCodes?.find(c=>c.id===id),base=id in designCodes?designCodes[id as BuiltinCodeId]:designCodes.Custom;
 return own?{label:own.name,sub:base.sub,note:own.note||base.note}:id in designCodes?base:{...base,label:id};
}

// ---------- Standard hooks (data: วสท.) ----------
/** Recommended end hooks, all grades: finished bend diameter D, 180° hook A/G and J, 90° hook A/G (mm). */
export const endHooks:{bar:number;D:number;a180:number;j180:number;a90:number}[]=[
 {bar:9,D:60,a180:130,j180:75,a90:155},{bar:12,D:75,a180:155,j180:100,a90:205},{bar:16,D:95,a180:180,j180:130,a90:255},
 {bar:20,D:115,a180:205,j180:155,a90:305},{bar:22,D:135,a180:255,j180:180,a90:355},{bar:25,D:155,a180:280,j180:205,a90:405},
 {bar:28,D:240,a180:380,j180:300,a90:485},{bar:32,D:275,a180:430,j180:335,a90:560},{bar:36,D:305,a180:485,j180:375,a90:610},
 {bar:43,D:465,a180:685,j180:555,a90:790},{bar:57,D:610,a180:915,j180:675,a90:1040},
];
/** Stirrup and tie hooks, all grades (mm): general use 90° / 135°, seismic use 135° (10db). */
export const stirrupHooks:{bar:number;D:number;a90:number;a135:number;h135:number;a135s:number;h135s:number}[]=[
 {bar:9,D:40,a90:100,a135:100,h135:65,a135s:130,h135s:90},{bar:12,D:50,a90:115,a135:115,h135:75,a135s:165,h135s:115},
 {bar:16,D:65,a90:155,a135:140,h135:95,a135s:205,h135s:140},{bar:20,D:115,a90:305,a135:205,h135:115,a135s:280,h135s:165},
 {bar:22,D:135,a90:355,a135:230,h135:135,a135s:320,h135s:200},{bar:25,D:155,a90:405,a135:270,h135:155,a135s:370,h135s:230},
];

// ---------- Steel grade by bar size (same default for every code; each spec may edit per code) ----------
export type GradeRow={bar:number;grade:string};
export const barGrades:GradeRow[]=[
 {bar:6,grade:'SR24'},{bar:9,grade:'SR24'},{bar:10,grade:'SD40'},{bar:12,grade:'SD40'},{bar:16,grade:'SD40'},
 {bar:20,grade:'SD40'},{bar:25,grade:'SD50'},{bar:28,grade:'SD50'},{bar:32,grade:'SD50'},{bar:36,grade:'SD50'},
];
export const gradeOptions=['SR24','SD30','SD40','SD50','B500B','B500C'] as const;
/** RB6 · DB16 or Y16 (round bars ≤ 9 mm, deformed bars otherwise). */
export const gradeBarLabel=(d:number)=>d<=9?`RB${d}`:`DB${d} or Y${d}`;

// ---------- Lap length for splices of bars (data: ACI 318) ----------
export type LapRow={bar:number;ftaTension:number;ftaTop:number;sha:number;fca:number;ftlTension:number;ftlTop:number;fcl:number};
export const lapConcrete=[28,35,45] as const;
export const lapGrades=['SD40','SD50'] as const;
const rows=(t:number[][]):LapRow[]=>t.map(([bar,ftaTension,ftaTop,sha,fca,ftlTension,ftlTop,fcl])=>({bar,ftaTension,ftaTop,sha,fca,ftlTension,ftlTop,fcl}));
/** Keyed `${fc}-${grade}` · bar sizes DB10–DB32 (mm). */
export const lapTables:Record<string,LapRow[]>={
 '28-SD40':rows([[10,375,500,200,225,500,650,325],[12,450,600,225,225,600,775,350],[16,600,800,300,300,800,1025,475],[20,750,975,375,375,975,1275,575],[25,1175,1525,475,475,1525,2000,725],[32,1500,1950,600,600,1950,2550,925]]),
 '28-SD50':rows([[10,475,625,250,250,625,800,400],[12,575,750,300,300,750,975,500],[16,775,1000,400,400,1000,1275,650],[20,950,1225,475,475,1225,1600,800],[25,1475,1925,600,600,1925,2500,1000],[32,1900,2450,775,775,2450,3200,1300]]),
 '35-SD40':rows([[10,325,425,175,225,425,550,325],[12,400,500,200,225,500,650,350],[16,525,675,275,275,675,875,475],[20,650,825,325,350,825,1075,575],[25,1000,1300,400,425,1300,1675,725],[32,1275,1650,525,550,1650,2150,925]]),
 '35-SD50':rows([[10,400,525,200,225,525,675,400],[12,500,625,250,275,625,825,500],[16,650,850,325,350,850,1100,650],[20,800,1050,400,450,1050,1350,800],[25,1250,1625,500,550,1625,2100,1000],[32,1600,2075,650,700,2075,2700,1300]]),
 '45-SD40':rows([[10,325,375,150,225,400,475,325],[12,350,450,175,225,450,575,350],[16,450,600,225,275,600,775,475],[20,575,750,300,350,750,950,575],[25,875,1150,350,425,1150,1475,725],[32,1125,1475,450,550,1475,1900,925]]),
 '45-SD50':rows([[10,375,475,200,225,475,600,400],[12,425,550,225,275,550,725,500],[16,575,750,300,350,750,950,650],[20,725,925,375,450,925,1200,800],[25,1100,1425,450,550,1425,1875,1000],[32,1425,1825,575,700,1825,2375,1300]]),
};
export const lapColumns:{key:keyof Omit<LapRow,'bar'>;group:string;label:string;abbr:string}[]=[
 {key:'ftaTension',group:'FULL TENSION ANCHORAGE (F.T.A.)',label:'TENSION REINF',abbr:'FTA'},
 {key:'ftaTop',group:'FULL TENSION ANCHORAGE (F.T.A.)',label:'TOP REINF',abbr:'FTA TOP'},
 {key:'sha',group:'STANDARD HOOK ANCHORAGE (S.H.A.)',label:'SHA',abbr:'SHA'},
 {key:'fca',group:'FULL COMPRESSION ANCHORAGE (F.C.A.)',label:'FCA',abbr:'FCA'},
 {key:'ftlTension',group:'FULL TENSION LAP (F.T.L.)',label:'FTL TENSION',abbr:'FTL'},
 {key:'ftlTop',group:'FULL TENSION LAP (F.T.L.)',label:'FTL TOP',abbr:'FTL TOP'},
 {key:'fcl',group:'FULL COMPRESSION LAP (F.C.L.)',label:'FCL',abbr:'FCL'},
];

// ---------- Beam reinforcement details (ACI 318 typical) ----------
/** Beam elevation parts from left to right: free cantilever end, support, clear span, continuation into the next span. */
export type BeamPart='cant'|'sup'|'span'|'next';
export type BeamCase={n:number;title:string;caseLabel?:string;parts:BeamPart[];
 /** End support anchorage (F.T.A.) at the first / last support when the beam stops there. */
 ftaLeft?:boolean;ftaRight?:boolean;
 /** Top-bar extension marks from each support face into the span (label, fraction of L). */
 top:{at:number;side:'left'|'right';label:string;frac:number}[]};
export const beamCases:BeamCase[]=[
 {n:1,title:'SIMPLE SPAN OR CANTILEVER SPAN',parts:['sup','span','sup','cant'],ftaLeft:true,top:[{at:0,side:'right',label:'0.25L',frac:.25},{at:1,side:'left',label:'0.3L',frac:.3}]},
 {n:2,title:'DISCONTINUOUS CANTILEVER SPAN',parts:['sup','cant'],ftaLeft:true,top:[]},
 {n:3,title:'SIMPLE SPAN W/ BOTH END CANTILEVER',parts:['cant','sup','span','sup','cant'],top:[{at:0,side:'right',label:'0.3L',frac:.3},{at:1,side:'left',label:'0.3L',frac:.3}]},
 {n:4,title:'END SPAN W/ONE END CONTINUOUS',caseLabel:'CASE I',parts:['next','sup','span','sup'],ftaRight:true,top:[{at:0,side:'right',label:'0.3L',frac:.3},{at:1,side:'left',label:'0.25L',frac:.25}]},
 {n:5,title:'END SPAN W/ONE END CONTINUOUS',caseLabel:'CASE II',parts:['sup','span','sup','next'],ftaLeft:true,top:[{at:0,side:'right',label:'0.3L',frac:.3},{at:1,side:'left',label:'MAX. 0.3L₁, 0.3L₂',frac:.3},{at:1,side:'right',label:'MAX. 0.3L₁, 0.3L₂',frac:.3}]},
 {n:6,title:'INTERNAL SPAN W/ BOTH END CONTINUOUS',parts:['next','sup','span','sup','next'],top:[{at:0,side:'right',label:'0.3L',frac:.3},{at:1,side:'left',label:'MAX. 0.3L₁, 0.3L₂',frac:.3},{at:1,side:'right',label:'MAX. 0.3L₁, 0.3L₂',frac:.3}]},
 {n:7,title:'SINGLE SIMPLE SPAN',parts:['sup','span','sup'],ftaLeft:true,ftaRight:true,top:[{at:0,side:'right',label:'0.3L',frac:.3},{at:1,side:'left',label:'0.3L',frac:.3}]},
 {n:10,title:'END CONTINUOUS SPAN W/ONE END CANTILEVER',caseLabel:'CASE I',parts:['next','sup','span','sup','cant'],top:[{at:0,side:'right',label:'0.3L',frac:.3},{at:1,side:'left',label:'0.3L',frac:.3}]},
 {n:11,title:'END CONTINUOUS SPAN W/ONE END CANTILEVER',caseLabel:'CASE II',parts:['cant','sup','span','sup','next'],top:[{at:0,side:'right',label:'0.3L',frac:.3},{at:1,side:'left',label:'0.3L',frac:.3}]},
];
/** Beam detailing fractions of the clear span L (top extension at discontinuous / continuous ends, bottom zone). */
export const DEFAULT_BEAM_RULES={topEnd:.25,topCont:.3,bottomZone:.125};

// ---------- Per-project values ----------
// Each project keeps its own copy of the tables it changed (spec.codeData[code]); anything not
// stored falls back to the library defaults above. Editing one project never touches another.
const n=z.number().finite().min(0).max(100000);
const endHookRow=z.object({bar:n,D:n,a180:n,j180:n,a90:n}).strict();
const stirrupHookRow=z.object({bar:n,D:n,a90:n,a135:n,h135:n,a135s:n,h135s:n}).strict();
const lapRow=z.object({bar:n,ftaTension:n,ftaTop:n,sha:n,fca:n,ftlTension:n,ftlTop:n,fcl:n}).strict();
const frac=z.number().finite().min(0).max(2);
export const codeDataSchema=z.object({
 endHooks:z.array(endHookRow).max(30).optional(),
 stirrupHooks:z.array(stirrupHookRow).max(30).optional(),
 lap:z.record(z.string().regex(/^\d{2}-SD\d{2}$/),z.array(lapRow).max(20)).optional(),
 beam:z.object({topEnd:frac,topCont:frac,bottomZone:frac}).strict().optional(),
 /** Steel grade per bar size (Dia. mm → grade). */
 grades:z.array(z.object({bar:z.number().int().min(1).max(60),grade:z.string().trim().min(1).max(20)}).strict()).max(30).optional(),
 /** Additional provisions added to this code (free text items: topic, value, details). */
 provisions:z.array(z.object({id:z.string().regex(/^[a-z0-9-]{1,40}$/),title:z.string().max(200),value:z.string().max(200).default(''),detail:z.string().max(4000).default('')}).strict()).max(200).optional(),
}).strict();
export type CodeData=z.infer<typeof codeDataSchema>;
export type Provision=NonNullable<CodeData['provisions']>[number];
export const projectCodeDataSchema=z.partialRecord(designCodeIdSchema,codeDataSchema);
export type ProjectCodeData=z.infer<typeof projectCodeDataSchema>;
/** Table keys of a code's own data (provisions are listed separately). */
export const tableOverrides=(d:CodeData)=>Object.keys(d).filter(k=>k!=='provisions');
/** Values used by one project for one code: its own overrides, else the library defaults. */
export function codeValues(data:ProjectCodeData|undefined,code:DesignCodeId|undefined){
 const d=(code&&data?.[code])||{};
 return {endHooks:d.endHooks||endHooks,stirrupHooks:d.stirrupHooks||stirrupHooks,lap:{...lapTables,...d.lap},beam:d.beam||DEFAULT_BEAM_RULES,provisions:d.provisions||[],grades:d.grades||barGrades,
  custom:{endHooks:!!d.endHooks,stirrupHooks:!!d.stirrupHooks,lap:Object.keys(d.lap||{}),beam:!!d.beam,grades:!!d.grades}};
}
export type CodeValues=ReturnType<typeof codeValues>;

export const beamNotes=[
 'F.T.A. (TYP) = ระยะฝังยึดรับแรงดึงเต็มที่ ใช้ค่าจากตาราง Lap Length (FTA / FTA TOP)',
 'STANDARD HOOK = ขอมาตรฐานที่ปลายยื่น ใช้ค่าจากตาราง Standard Hooks',
 'เหล็กบนเสริมพิเศษยื่นจากผิวที่รองรับ 0.25L (ปลายไม่ต่อเนื่อง) / 0.3L (ปลายต่อเนื่อง) · ช่วงต่อเนื่องที่ต่างกันใช้ MAX(0.3L₁, 0.3L₂)',
 'ระยะ 0.125L วัดจากผิวที่รองรับ ตามรูปมาตรฐาน · NOTE ③ = ตำแหน่งต่อทาบเหล็ก (Lap splice) ใช้ระยะ FTL จากตาราง',
 'L = ระยะช่วงคานสุทธิ (Clear span) · L₁, L₂ = ช่วงคานสุทธิของช่วงที่ต่อเนื่องกัน',
 'หน้าตัดคาน: ระยะหุ้มถึงเหล็กปลอก 40 mm · เพิ่ม DB12@300 c/c ด้านข้างเมื่อ H > 900 mm · เหล็ก RB6 ระยะเท่าปลอกหลัก',
];
