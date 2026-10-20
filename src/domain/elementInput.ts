import {z} from 'zod';
import type {Bar,Category,Member} from './model';
import type {DrawingExtraction} from './drawingExtraction';

// Structured element input. Both entry modes ("manual" and "drawing") end in this
// single per-category pattern; applyElementInput() converts it to the existing
// member geometry/earthwork fields and a generated, editable Bar cut list.
export const ELEMENT_INPUT_VERSION=2 as const;
export const inputCategories=['Foundation','Beam','Column','Slab','Wall'] as const;
export type InputCategory=typeof inputCategories[number];
export const supportsElementInput=(c:Category):c is InputCategory=>(inputCategories as readonly string[]).includes(c);

type V3=[number,number,number];
const mm=z.number().finite().min(0).max(200000);
const dia=z.number().finite().min(0).max(60);
const spacingLayer=z.object({diameter:dia,spacing:mm}).strict();
const optionalLayer=z.object({enabled:z.boolean(),diameter:dia,spacing:mm}).strict();
const countLayer=z.object({count:z.number().int().min(0).max(200),diameter:dia}).strict();
/** 90° end bend: none, standard (hook90·d straight extension after the bend) or a user-defined leg length. */
const bendMode=z.enum(['none','standard','custom']);
const meshLayer=z.object({diameter:dia,spacing:mm,bend:bendMode,leg:mm}).strict();
const optionalMesh=z.object({enabled:z.boolean(),diameter:dia,spacing:mm,bend:bendMode,leg:mm}).strict();
export const columnShapes=['rect','circle','L','U'] as const;
export type ColumnShape=typeof columnShapes[number];
/** Pedestal column (with concrete) or starter bars (bars only) on a footing.
 * L: armX = thickness of the arm along X, armY = thickness of the arm along Y.
 * U: armX = web thickness (along X), armY = flange thickness (along Y). */
const footingColumnSchema=z.object({
 type:z.enum(['none','pedestal','starter']),
 columnNo:z.string().trim().max(50),
 shape:z.enum(columnShapes),
 width:mm,depth:mm,diameter:mm,armX:mm,armY:mm,
 height:mm,projection:mm,cover:mm,
 // corner: bars per corner (bundle of 1–3); sideX/sideY: bars per face between the corners
 // (rect) or diameters for the edges along X/Y (L/U, placed at `spacing`); circle uses diameter/count.
 main:z.object({corner:z.object({diameter:dia,count:z.number().int().min(1).max(3)}).strict(),sideX:countLayer,sideY:countLayer,diameter:dia,count:z.number().int().min(0).max(200),spacing:mm}).strict(),
 tie:spacingLayer,
 embed:z.object({mode:z.enum(['standard','custom']),depth:mm}).strict(),
 bend:bendMode,leg:mm,
 /** Offset of the section bounding-box centre from the footing bounding-box centre. */
 offsetX:z.number().finite().min(-100000).max(100000),offsetY:z.number().finite().min(-100000).max(100000),
}).strict();
export const footingShapes=['rect','circle','hex','oct','L','U'] as const;
export type FootingShape=typeof footingShapes[number];
export const pileTypes=['square','round','spun','I'] as const;
const pileSchema=z.object({
 type:z.enum(pileTypes),size:mm,
 layout:z.enum(['standard','grid']),count:z.number().int().min(0).max(100),nx:z.number().int().min(1).max(20),ny:z.number().int().min(1).max(20),
 spacingX:mm,spacingY:mm,
 /** Ordered pile length (m), length cut from each pile head (mm), embedment of the head into the cap (mm). */
 length:z.number().finite().min(0).max(200),cutoff:mm,embed:mm,
 /** Offset of the pile-group centre from the footing bounding-box centre. */
 offsetX:z.number().finite().min(-100000).max(100000),offsetY:z.number().finite().min(-100000).max(100000),
}).strict();
export type PileInput=z.infer<typeof pileSchema>;
export type FootingColumn=z.infer<typeof footingColumnSchema>;

export const detailingSchema=z.object({
 mainGrade:z.string().trim().min(1).max(40),
 tieGrade:z.string().trim().min(1).max(40),
 bendSmall:z.number().finite().positive().max(20),
 bendLarge:z.number().finite().positive().max(20),
 tieBend:z.number().finite().positive().max(20),
 hook90:z.number().finite().min(0).max(60),
 hook135:z.number().finite().min(0).max(60),
 hook135Min:mm,
 lap:z.number().finite().min(0).max(120),
 stockLength:z.number().finite().positive().max(30000),
}).strict();
export type Detailing=z.infer<typeof detailingSchema>;
/** Preliminary detailing defaults: BS 8666:2000 Table 2 minimum former radius
 * (2d for d ≤ 16, 3.5d for d ≥ 20), ACI 318 standard hook extensions
 * (90° = 12d, 135° link = 6d ≥ 75 mm) and a 40d lap. Editable per member. */
export const DEFAULT_DETAILING:Detailing={mainGrade:'SD40',tieGrade:'SR24',bendSmall:2,bendLarge:3.5,tieBend:2,hook90:12,hook135:6,hook135Min:75,lap:40,stockLength:10000};

const base={
 version:z.literal(ELEMENT_INPUT_VERSION),
 mode:z.enum(['manual','drawing']),
 source:z.object({attachmentId:z.string().max(80),fileName:z.string().max(250),extractedAt:z.string().max(40)}).strict().optional(),
 detailing:detailingSchema,
 appliedAt:z.string().max(40).optional(),
};
const foundationSchema=z.object({...base,category:z.literal('Foundation'),
 foundationType:z.enum(['spread','pile']),
 /** Plan shape. hex/oct: width × length bounding box with corner chamfer (0 = regular); L/U: arm thicknesses as for columns. */
 shape:z.enum(footingShapes),diameter:mm,chamfer:mm,armX:mm,armY:mm,
 width:mm,length:mm,thickness:mm,
 pile:pileSchema,
 excavation:z.object({depth:mm,workingSpace:mm,slope:z.number().finite().min(0).max(5)}).strict(),
 lean:z.object({thickness:mm,projection:mm}).strict(),
 cover:z.object({bottom:mm,top:mm,side:mm}).strict(),
 rebar:z.object({bottomX:meshLayer,bottomY:meshLayer,topX:optionalMesh,topY:optionalMesh}).strict(),
 column:footingColumnSchema,
}).strict();
const columnSchema=z.object({...base,category:z.literal('Column'),
 shape:z.enum(['rect','circle']),width:mm,depth:mm,diameter:mm,height:mm,
 cover:z.object({side:mm}).strict(),
 rebar:z.object({main:countLayer,tie:spacingLayer,lap:z.boolean()}).strict(),
}).strict();
const beamSchema=z.object({...base,category:z.literal('Beam'),
 width:mm,depth:mm,length:mm,
 cover:z.object({top:mm,bottom:mm,side:mm}).strict(),
 rebar:z.object({top:countLayer,bottom:countLayer,stirrup:spacingLayer,endHook:z.boolean()}).strict(),
}).strict();
const slabSchema=z.object({...base,category:z.literal('Slab'),
 lengthX:mm,lengthY:mm,thickness:mm,
 cover:z.object({top:mm,bottom:mm,edge:mm}).strict(),
 rebar:z.object({bottomX:spacingLayer,bottomY:spacingLayer,topX:optionalLayer,topY:optionalLayer}).strict(),
}).strict();
const wallSchema=z.object({...base,category:z.literal('Wall'),
 length:mm,thickness:mm,height:mm,
 cover:z.object({face:mm,edge:mm}).strict(),
 rebar:z.object({layers:z.union([z.literal(1),z.literal(2)]),vertical:spacingLayer,horizontal:spacingLayer,lap:z.boolean()}).strict(),
}).strict();
const elementInputUnion=z.discriminatedUnion('category',[foundationSchema,columnSchema,beamSchema,slabSchema,wallSchema]);
export const elementInputSchema=z.preprocess(migrateElementInput,elementInputUnion);
export type ElementInput=z.infer<typeof elementInputUnion>;
export const DEFAULT_FOOTING_COLUMN:FootingColumn={type:'none',columnNo:'',shape:'rect',width:400,depth:400,diameter:400,armX:250,armY:250,height:600,projection:800,cover:40,main:{corner:{diameter:16,count:1},sideX:{diameter:16,count:1},sideY:{diameter:16,count:1},diameter:16,count:8,spacing:200},tie:{diameter:9,spacing:200},embed:{mode:'standard',depth:0},bend:'standard',leg:0,offsetX:0,offsetY:0};
export const DEFAULT_PILE:PileInput={type:'square',size:300,layout:'standard',count:4,nx:2,ny:2,spacingX:900,spacingY:900,length:12,cutoff:500,embed:75,offsetX:0,offsetY:0};
/** Version 1 stored input (pedestal box + single end-hook flag) → version 2. */
function migrateElementInput(raw:unknown):unknown{
 if(!raw||typeof raw!=='object')return raw;
 if((raw as any).version===1)return migrateV2Foundation(migrateV1(raw));
 return migrateV2Foundation(raw);
}
/** Early v2 foundation layouts: column main bars per face incl. corners; no plan shape / piles / column offset. */
function migrateV2Foundation(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Foundation')return raw;
 const old=raw.column?.main,needsMain=old&&!old.corner,needsShape=!('shape' in raw),needsOffset=raw.column&&!('offsetX' in raw.column),needsPileOffset=raw.pile&&!('offsetX' in raw.pile);
 if(!needsMain&&!needsShape&&!needsOffset&&!needsPileOffset)return raw;
 const v=structuredClone(raw);
 if(needsMain){const d=old.diameter??16;v.column.main={corner:{diameter:d,count:1},sideX:{diameter:d,count:Math.max(0,(old.countX??2)-2)},sideY:{diameter:d,count:Math.max(0,(old.countY??2)-2)},diameter:d,count:old.count??8,spacing:old.spacing??200};}
 if(needsOffset){v.column.offsetX=0;v.column.offsetY=0;}
 if(needsPileOffset){v.pile.offsetX=0;v.pile.offsetY=0;}
 if(needsShape)Object.assign(v,{foundationType:'spread',shape:'rect',diameter:v.width??2400,chamfer:0,armX:Math.round((v.length??2400)/3),armY:Math.round((v.width??2400)/3),pile:structuredClone(DEFAULT_PILE)});
 return v;
}
function migrateV1(raw:unknown):unknown{
 const v=structuredClone(raw) as any;v.version=ELEMENT_INPUT_VERSION;
 if(v.category!=='Foundation')return v;
 const r=v.rebar||{},hook=r.endHook?'standard':'none',mesh=(l:any,bend:string)=>({diameter:l?.diameter??12,spacing:l?.spacing??200,bend,leg:0}),opt=(l:any)=>({enabled:!!l?.enabled,...mesh(l,'none')});
 const p=v.pedestal||{},main=r.pedestalMain||{count:0,diameter:16},per=Math.max(2,Math.round((main.count||8)/4)+1);
 v.rebar={bottomX:mesh(r.bottomX,hook),bottomY:mesh(r.bottomY,hook),topX:opt(r.topX),topY:opt(r.topY)};
 v.column={...DEFAULT_FOOTING_COLUMN,...(p.width>0&&p.length>0&&p.height>0?{type:'pedestal',width:p.width,depth:p.length,height:p.height,projection:main.count>0?Math.round((v.detailing?.lap??40)*main.diameter):0,main:{...DEFAULT_FOOTING_COLUMN.main,corner:{diameter:main.diameter,count:1},sideX:{diameter:main.diameter,count:per-2},sideY:{diameter:main.diameter,count:per-2},diameter:main.diameter},tie:r.pedestalTie||DEFAULT_FOOTING_COLUMN.tie}:{})};
 delete v.pedestal;return v;
}
export type FoundationInput=z.infer<typeof foundationSchema>;
export type ColumnInput=z.infer<typeof columnSchema>;
export type BeamInput=z.infer<typeof beamSchema>;
export type SlabInput=z.infer<typeof slabSchema>;
export type WallInput=z.infer<typeof wallSchema>;

export function defaultElementInput(category:InputCategory,mode:'manual'|'drawing'='manual'):ElementInput{
 const common={version:ELEMENT_INPUT_VERSION,mode,detailing:{...DEFAULT_DETAILING}};
 switch(category){
  case 'Foundation':return {...common,category,foundationType:'spread',shape:'rect',diameter:2400,chamfer:0,armX:800,armY:800,width:2400,length:2400,thickness:600,pile:structuredClone(DEFAULT_PILE),excavation:{depth:1500,workingSpace:300,slope:0},lean:{thickness:50,projection:100},cover:{bottom:75,top:50,side:75},rebar:{bottomX:{diameter:16,spacing:150,bend:'standard',leg:0},bottomY:{diameter:16,spacing:150,bend:'standard',leg:0},topX:{enabled:false,diameter:12,spacing:200,bend:'none',leg:0},topY:{enabled:false,diameter:12,spacing:200,bend:'none',leg:0}},column:structuredClone(DEFAULT_FOOTING_COLUMN)};
  case 'Column':return {...common,category,shape:'rect',width:400,depth:400,diameter:400,height:3000,cover:{side:40},rebar:{main:{count:8,diameter:20},tie:{diameter:9,spacing:150},lap:true}};
  case 'Beam':return {...common,category,width:300,depth:600,length:6000,cover:{top:40,bottom:40,side:40},rebar:{top:{count:2,diameter:16},bottom:{count:3,diameter:16},stirrup:{diameter:9,spacing:150},endHook:true}};
  case 'Slab':return {...common,category,lengthX:6000,lengthY:4000,thickness:150,cover:{top:25,bottom:25,edge:25},rebar:{bottomX:{diameter:12,spacing:200},bottomY:{diameter:12,spacing:200},topX:{enabled:false,diameter:12,spacing:200},topY:{enabled:false,diameter:12,spacing:200}}};
  case 'Wall':return {...common,category,length:6000,thickness:200,height:3000,cover:{face:30,edge:30},rebar:{layers:2,vertical:{diameter:12,spacing:200},horizontal:{diameter:12,spacing:200},lap:true}};
 }
}

/** Required inputs for BOQ and cut list generation. Empty list = ready to apply. */
export function elementInputProblems(input:ElementInput):string[]{
 const p:string[]=[],need=(v:number,label:string)=>{if(!(v>0))p.push(`ระบุ${label}`);};
 const layer=(l:{diameter:number;spacing:number},label:string)=>{need(l.diameter,`ขนาดเหล็ก ${label}`);need(l.spacing,`ระยะห่าง ${label}`);};
 const fits=(span:number,c1:number,c2:number,label:string)=>{if(span>0&&c1+c2>=span)p.push(`ระยะหุ้มรวมเกิน${label}`);};
 if(!detailingSchema.safeParse(input.detailing).success)p.push('ตรวจค่ามาตรฐานงอขอ / ระยะทาบ');
 switch(input.category){
  case 'Foundation':{
   if(input.shape==='circle')need(input.diameter,'เส้นผ่านศูนย์กลางฐานราก');else{need(input.width,'ความกว้างฐานราก (X)');need(input.length,'ความยาวฐานราก (Y)');}
   if(input.shape==='L'||input.shape==='U'){need(input.armX,'ความหนาขาแนว X ของฐาน');need(input.armY,'ความหนาขาแนว Y ของฐาน');if(input.armY>=(input.shape==='U'?input.width/2:input.width)||input.armX>=input.length)p.push('ฐานราก: ความหนาขาต้องน้อยกว่าขนาดฐาน');}
   if((input.shape==='hex'||input.shape==='oct')&&input.chamfer>0&&(input.chamfer*2>=input.width||(input.shape==='oct'&&input.chamfer*2>=input.length)))p.push('ฐานราก: ระยะตัดมุมต้องน้อยกว่าครึ่งของขนาดฐาน');
   need(input.thickness,'ความหนาฐานราก');need(input.excavation.depth,'ความลึกงานขุด');
   need(input.cover.bottom,'cover ด้านล่าง');need(input.cover.top,'cover ด้านบน');need(input.cover.side,'cover ด้านข้าง');
   layer(input.rebar.bottomX,'เหล็กล่างทิศ X');layer(input.rebar.bottomY,'เหล็กล่างทิศ Y');
   if(input.rebar.topX.enabled)layer(input.rebar.topX,'เหล็กบนทิศ X');if(input.rebar.topY.enabled)layer(input.rebar.topY,'เหล็กบนทิศ Y');
   const ext=footingExtent(input);
   fits(input.thickness,input.cover.bottom,input.cover.top,'ความหนาฐานราก');fits(Math.min(ext.w,ext.d,...(input.shape==='L'||input.shape==='U'?[input.armX,input.armY]:[])),input.cover.side,input.cover.side,'ขนาดฐานราก');
   if(input.foundationType==='pile'){
    const pl=input.pile;need(pl.size,'ขนาดเสาเข็ม');need(pl.length,'ความยาวเสาเข็ม');
    if(pl.layout==='standard'&&pl.count<1)p.push('ระบุจำนวนเสาเข็ม');
    if((pl.layout==='grid'?pl.nx*pl.ny:pl.count)>1)need(pl.spacingX,'ระยะห่างเสาเข็ม');
    if(pl.layout==='grid'&&pl.ny>1)need(pl.spacingY,'ระยะห่างเสาเข็มแนว Y');
    if(pl.cutoff>pl.length*1000)p.push('ระยะตัดหัวเข็มยาวกว่าเสาเข็ม');
    if(pl.embed>=input.thickness)p.push('ระยะฝังหัวเข็มต้องน้อยกว่าความหนาฐาน');
    const outlineSafe=input.shape==='circle'||input.width>0&&input.length>0;
    if(outlineSafe&&pl.size>0){const room=inset(footingOutline(input),pl.size/2),out=pilePositions(input).filter(q=>!pointInPolygon(q,room)).length;if(out)p.push(`เสาเข็ม ${out} ต้นอยู่นอกขอบฐาน (รวมครึ่งขนาดเข็ม) ปรับระยะห่างหรือขนาดฐาน`);}
   }
   for(const [key,label] of [['bottomX','เหล็กล่างทิศ X'],['bottomY','เหล็กล่างทิศ Y'],['topX','เหล็กบนทิศ X'],['topY','เหล็กบนทิศ Y']] as const){const l=input.rebar[key];if((!('enabled' in l)||l.enabled)&&l.bend==='custom')need(l.leg,`ระยะขางอ ${label}`);}
   const col=input.column;
   if(col.type!=='none'){
    const kind=col.type==='pedestal'?'เสาตอม่อ':'Starter bar',{w,d}=columnExtent(col);
    if(col.shape==='circle')need(col.diameter,`เส้นผ่านศูนย์กลาง${kind}`);else{need(col.width,`ความกว้าง${kind} (X)`);need(col.depth,`ความลึก${kind} (Y)`);}
    if(col.shape==='L'||col.shape==='U'){need(col.armX,`ความหนาขาแนว X ของ${kind}`);need(col.armY,`ความหนาขาแนว Y ของ${kind}`);if(col.armY>=(col.shape==='U'?col.width/2:col.width)||col.armX>=col.depth)p.push(`${kind}: ความหนาขาต้องน้อยกว่าขนาดหน้าตัด`);}
    const fo=footingOutline(input),cx0=(ext.w-w)/2+col.offsetX,cy0=(ext.d-d)/2+col.offsetY;
    if(w>0&&d>0&&ext.w>0&&ext.d>0&&columnBoxes(col).some(b=>[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].some(([x,y])=>!pointInPolygon([cx0+x+(x===b.x0?1:-1),cy0+y+(y===b.y0?1:-1)],fo))))p.push(`${kind}อยู่นอกขอบฐานราก ตรวจขนาดหรือระยะเยื้อง`);
    need(col.cover,`cover ${kind}`);
    if(col.shape==='circle'){need(col.main.diameter,`ขนาดเหล็กยืน${kind}`);if(col.main.count<4)p.push(`${kind}: เหล็กยืนอย่างน้อย 4 เส้น`);}
    else{
     need(col.main.corner.diameter,`ขนาดเหล็กมุม${kind}`);
     if(col.shape==='rect'){if(col.main.sideX.count>0)need(col.main.sideX.diameter,`ขนาดเหล็กด้าน X ของ${kind}`);if(col.main.sideY.count>0)need(col.main.sideY.diameter,`ขนาดเหล็กด้าน Y ของ${kind}`);}
     else{need(col.main.spacing,`ระยะห่างเหล็กด้านสูงสุดของ${kind}`);need(col.main.sideX.diameter,`ขนาดเหล็กด้าน X ของ${kind}`);need(col.main.sideY.diameter,`ขนาดเหล็กด้าน Y ของ${kind}`);}
    }
    const inset=col.cover+(col.type==='pedestal'?col.tie.diameter:0)+maxMainDiameter(col)*(col.shape==='circle'?.5:col.main.corner.count>1?1.5:.5),thin=col.shape==='circle'?col.diameter/2:Math.min(...columnBoxes(col).map(b=>Math.min(b.x1-b.x0,b.y1-b.y0)))/2;
    if(thin>0&&inset>=thin)p.push(`${kind}: หน้าตัดเล็กเกินไปสำหรับ cover และเหล็ก`);
    if(col.type==='pedestal'){need(col.height,'ความสูงเสาตอม่อ');layer(col.tie,'เหล็กปลอกเสาตอม่อ');}else need(col.projection,'ระยะโผล่ของ Starter bar จากฐาน');
    if(col.embed.mode==='custom'){need(col.embed.depth,`ระยะฝังในฐานของ${kind}`);if(col.embed.depth>input.thickness-input.cover.bottom)p.push(`${kind}: ระยะฝังเกินความหนาฐานราก − cover ล่าง`);}
    if(col.bend==='custom')need(col.leg,`ระยะขางอในฐานของ${kind}`);
   }
   if(input.excavation.depth>0&&input.excavation.depth<input.thickness+input.lean.thickness)p.push('ความลึกงานขุดน้อยกว่าความหนาฐานราก + Lean');
   break;}
  case 'Column':{
   if(input.shape==='rect'){need(input.width,'ความกว้างเสา (X)');need(input.depth,'ความลึกเสา (Y)');fits(Math.min(input.width,input.depth),input.cover.side,input.cover.side,'หน้าตัดเสา');}
   else{need(input.diameter,'เส้นผ่านศูนย์กลางเสา');fits(input.diameter,input.cover.side,input.cover.side,'หน้าตัดเสา');}
   need(input.height,'ความสูงเสา');need(input.cover.side,'cover');
   need(input.rebar.main.diameter,'ขนาดเหล็กยืน');if(input.rebar.main.count<(input.shape==='rect'?4:6))p.push(`เหล็กยืนอย่างน้อย ${input.shape==='rect'?4:6} เส้น`);
   layer(input.rebar.tie,'เหล็กปลอก');break;}
  case 'Beam':{
   need(input.width,'ความกว้างคาน');need(input.depth,'ความลึกคาน');need(input.length,'ความยาวคาน');
   need(input.cover.top,'cover ด้านบน');need(input.cover.bottom,'cover ด้านล่าง');need(input.cover.side,'cover ด้านข้าง');
   fits(input.depth,input.cover.top,input.cover.bottom,'ความลึกคาน');fits(input.width,input.cover.side,input.cover.side,'ความกว้างคาน');
   if(input.rebar.top.count<1&&input.rebar.bottom.count<1)p.push('ระบุจำนวนเหล็กบนหรือเหล็กล่าง');
   if(input.rebar.top.count>0)need(input.rebar.top.diameter,'ขนาดเหล็กบน');if(input.rebar.bottom.count>0)need(input.rebar.bottom.diameter,'ขนาดเหล็กล่าง');
   layer(input.rebar.stirrup,'เหล็กปลอก');break;}
  case 'Slab':{
   need(input.lengthX,'ความยาวพื้น (X)');need(input.lengthY,'ความกว้างพื้น (Y)');need(input.thickness,'ความหนาพื้น');
   need(input.cover.top,'cover ด้านบน');need(input.cover.bottom,'cover ด้านล่าง');need(input.cover.edge,'cover ขอบ');
   fits(input.thickness,input.cover.top,input.cover.bottom,'ความหนาพื้น');
   layer(input.rebar.bottomX,'เหล็กล่างทิศ X');layer(input.rebar.bottomY,'เหล็กล่างทิศ Y');
   if(input.rebar.topX.enabled)layer(input.rebar.topX,'เหล็กบนทิศ X');if(input.rebar.topY.enabled)layer(input.rebar.topY,'เหล็กบนทิศ Y');break;}
  case 'Wall':{
   need(input.length,'ความยาวผนัง');need(input.thickness,'ความหนาผนัง');need(input.height,'ความสูงผนัง');
   need(input.cover.face,'cover ผิวผนัง');need(input.cover.edge,'cover ขอบ');
   fits(input.thickness,input.cover.face,input.cover.face,'ความหนาผนัง');
   layer(input.rebar.vertical,'เหล็กแนวตั้ง');layer(input.rebar.horizontal,'เหล็กแนวนอน');break;}
 }
 return p;
}

// ---------- bar generation helpers ----------
const roundUp=(v:number,step:number)=>Math.ceil((v-1e-6)/step)*step;
const radius=(d:number,det:Detailing,tie=false)=>(tie?det.tieBend:d<=16?det.bendSmall:det.bendLarge)*d+d/2;
/** Bar centres between lo and hi with spacing not exceeding `spacing`. */
function spread(lo:number,hi:number,spacing:number){
 const len=hi-lo;if(len<0||!(spacing>0))return null;
 const n=len<1e-6?1:Math.ceil(len/spacing-1e-9)+1;
 return {count:n,from:lo,to:n===1?lo:hi};
}
type GenBar={role:string;note:string;diameter:number;grade:string;count:number;points:V3[];axis:Bar['axis'];face:Bar['face'];radius:number;shapeCode:string;distributionAxis?:Bar['axis'];from?:number;to?:number;offsets?:V3[];turns?:number[];cut?:number};
const GEN_PREFIX='gen-';
export const isGeneratedBar=(b:Bar)=>b.id.startsWith(GEN_PREFIX);
const markPrefix:Record<InputCategory,string>={Foundation:'F',Beam:'B',Column:'C',Slab:'S',Wall:'W'};

/** Closed rectangular link in the plane of axes u/v at `at` on axis w, with two
 * 135° hooks bent diagonally into the core at the first corner. */
function link(u:number,v:number,w:number,u0:number,u1:number,v0:number,v1:number,at:number,ext:number,rad:number):V3[]{
 const p=(a:number,b:number):V3=>{const r:V3=[0,0,0];r[u]=a;r[v]=b;r[w]=at;return r;};
 // `ext` is the straight extension after the 135° bend; add the bend tangent length.
 const k=(ext+rad/Math.tan(Math.PI/8))/Math.SQRT2;
 return [p(u0+k,v0+k),p(u0,v0),p(u1,v0),p(u1,v1),p(u0,v1),p(u0,v0),p(u0+k,v0+k)];
}
/** n bar centres on a rectangle perimeter: four corners first, then the remainder
 * distributed along the sides proportionally to their length. */
function perimeter(n:number,x0:number,x1:number,y0:number,y1:number):[number,number][]{
 const pts:[number,number][]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
 let extra=n-4;if(extra<=0)return pts.slice(0,Math.max(0,n));
 const wx=x1-x0,wy=y1-y0,inX=Math.round(extra*wx/(wx+wy)/2)*2,inY=extra-inX;
 const side=(count:number,from:[number,number],to:[number,number])=>{for(let i=1;i<=count;i++){const t=i/(count+1);pts.push([from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t]);}};
 const xa=Math.ceil(inX/2),xb=inX-xa,ya=Math.ceil(inY/2),yb=inY-ya;
 side(xa,[x0,y0],[x1,y0]);side(xb,[x0,y1],[x1,y1]);side(ya,[x0,y0],[x0,y1]);side(yb,[x1,y0],[x1,y1]);
 return pts;
}
const offsetsFrom=(pts:[number,number][]):V3[]=>pts.map(p=>[p[0]-pts[0][0],p[1]-pts[0][1],0]);

type Box={x0:number;y0:number;x1:number;y1:number};
export type Pt=[number,number];
/** Plan shape in local coordinates (origin = bounding-box corner). */
type ShapeSpec={shape:FootingShape;w:number;d:number;armX:number;armY:number;chamfer?:number};
function shapeBoxes(s:ShapeSpec):Box[]{
 const {w,d}=s;
 if(s.shape==='L')return [{x0:0,y0:0,x1:w,y1:s.armX},{x0:0,y0:s.armX,x1:s.armY,y1:d}];
 if(s.shape==='U')return [{x0:0,y0:0,x1:w,y1:s.armX},{x0:0,y0:s.armX,x1:s.armY,y1:d},{x0:w-s.armY,y0:s.armX,x1:w,y1:d}];
 return [{x0:0,y0:0,x1:w,y1:d}];
}
/** Corner chamfer of hexagon / octagon (0 = regular polygon). */
const chamferOf=(s:ShapeSpec)=>s.chamfer&&s.chamfer>0?s.chamfer:s.shape==='hex'?s.w/4:s.shape==='oct'?Math.min(s.w,s.d)/(2+Math.SQRT2):0;
/** Counter-clockwise outline; a circle is approximated with `segments` sides. */
function shapeOutline(s:ShapeSpec,segments=72):Pt[]{
 const {w,d}=s,a=s.armX,b=s.armY,c=chamferOf(s);
 switch(s.shape){
  case 'L':return [[0,0],[w,0],[w,a],[b,a],[b,d],[0,d]];
  case 'U':return [[0,0],[w,0],[w,d],[w-b,d],[w-b,a],[b,a],[b,d],[0,d]];
  case 'circle':return Array.from({length:segments},(_,k)=>[w/2+w/2*Math.cos(2*Math.PI*k/segments),d/2+d/2*Math.sin(2*Math.PI*k/segments)] as Pt);
  case 'hex':return [[c,0],[w-c,0],[w,d/2],[w-c,d],[c,d],[0,d/2]];
  case 'oct':return [[c,0],[w-c,0],[w,c],[w,d-c],[w-c,d],[c,d],[0,d-c],[0,c]];
  default:return [[0,0],[w,0],[w,d],[0,d]];
 }
}
const polygonArea=(p:Pt[])=>Math.abs(p.reduce((n,q,i)=>{const r=p[(i+1)%p.length];return n+q[0]*r[1]-r[0]*q[1];},0))/2;
const polygonPerimeter=(p:Pt[])=>p.reduce((n,q,i)=>n+Math.hypot(p[(i+1)%p.length][0]-q[0],p[(i+1)%p.length][1]-q[1]),0);
/** Mitred inward offset of a CCW polygon (convex and reflex corners). */
function inset(poly:Pt[],c:number):Pt[]{
 const n=(a:Pt,b:Pt):Pt=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [-dy/l,dx/l];};
 return poly.map((p,i)=>{const n1=n(poly[(i+poly.length-1)%poly.length],p),n2=n(p,poly[(i+1)%poly.length]),k=c/Math.max(.05,1+n1[0]*n2[0]+n1[1]*n2[1]);return [p[0]+(n1[0]+n2[0])*k,p[1]+(n1[1]+n2[1])*k];});
}
export function pointInPolygon(pt:Pt,poly:Pt[]){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>pt[1])!==(yj>pt[1])&&pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
/** Intervals of the line {other axis = pos} inside the polygon, along `axis` (0 = X, 1 = Y). */
export function lineIntervals(poly:Pt[],axis:0|1,pos:number):[number,number][]{
 const o=axis===0?1:0,hits:number[]=[];
 for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if((a[o]<=pos&&b[o]>pos)||(b[o]<=pos&&a[o]>pos))hits.push(a[axis]+(pos-a[o])*(b[axis]-a[axis])/(b[o]-a[o]));}
 hits.sort((x,y)=>x-y);const out:[number,number][]=[];for(let i=0;i+1<hits.length;i+=2)out.push([hits[i],hits[i+1]]);return out;
}
/** Bounding size of the column / starter-bar section. */
export function columnExtent(col:FootingColumn){return col.shape==='circle'?{w:col.diameter,d:col.diameter}:{w:col.width,d:col.depth};}
const columnSpec=(col:FootingColumn):ShapeSpec=>({shape:col.shape,...columnExtent(col),armX:col.armX,armY:col.armY});
/** Rectangular parts of the section in local coordinates (origin = bounding-box corner). */
export function columnBoxes(col:FootingColumn):Box[]{return shapeBoxes(columnSpec(col));}
/** Section area in mm². */
export function columnArea(col:FootingColumn){return col.shape==='circle'?Math.PI*col.diameter**2/4:columnBoxes(col).reduce((n,b)=>n+(b.x1-b.x0)*(b.y1-b.y0),0);}
function outline(col:FootingColumn):Pt[]{return shapeOutline(columnSpec(col));}
const footingSpec=(i:FoundationInput):ShapeSpec=>({shape:i.shape,w:i.shape==='circle'?i.diameter:i.width,d:i.shape==='circle'?i.diameter:i.length,armX:i.armX,armY:i.armY,chamfer:i.chamfer});
/** Footing plan: bounding size, outline (local mm), exact area (mm²) and perimeter (mm). */
export function footingExtent(i:FoundationInput){const s=footingSpec(i);return {w:s.w,d:s.d};}
export function footingOutline(i:FoundationInput,segments=72):Pt[]{return shapeOutline(footingSpec(i),segments);}
export function footingBoxes(i:FoundationInput):Box[]{return shapeBoxes(footingSpec(i));}
export function footingArea(i:FoundationInput){return i.shape==='circle'?Math.PI*i.diameter**2/4:polygonArea(footingOutline(i));}
export function footingPerimeter(i:FoundationInput){return i.shape==='circle'?Math.PI*i.diameter:polygonPerimeter(footingOutline(i));}
export const pileTypeLabels:Record<PileInput['type'],string>={square:'เข็มสี่เหลี่ยมตัน',round:'เข็มเจาะ (กลม)',spun:'เข็มกลมกลวง (Spun)',I:'เข็มรูปตัวไอ'};
/** Pile centres relative to the footing bounding-box corner (mm). */
export function pilePositions(i:FoundationInput):Pt[]{
 if(i.foundationType!=='pile')return [];
 const p=i.pile,{w,d}=footingExtent(i),cx=w/2+p.offsetX,cy=d/2+p.offsetY,s=p.spacingX,t=p.spacingY||p.spacingX,pts:Pt[]=[];
 const grid=(nx:number,ny:number,limit=nx*ny,skipCentre=false)=>{for(let r=0;r<ny;r++)for(let k=0;k<nx;k++){if(skipCentre&&r===(ny-1)/2&&k===(nx-1)/2)continue;if(pts.length<limit)pts.push([cx+(k-(nx-1)/2)*s,cy+(r-(ny-1)/2)*t]);}};
 if(p.layout==='grid'){grid(p.nx,p.ny);return pts;}
 switch(p.count){
  case 0:return [];
  case 1:return [[cx,cy]];
  case 2:return [[cx-s/2,cy],[cx+s/2,cy]];
  case 3:return [[cx-s/2,cy-s*Math.sqrt(3)/6],[cx+s/2,cy-s*Math.sqrt(3)/6],[cx,cy+s*Math.sqrt(3)/3]];
  case 5:{const a=s/Math.SQRT2;return [[cx-a,cy-a],[cx+a,cy-a],[cx,cy],[cx-a,cy+a],[cx+a,cy+a]];}
  case 7:return [[cx,cy],...Array.from({length:6},(_,k)=>[cx+s*Math.cos(Math.PI*k/3),cy+s*Math.sin(Math.PI*k/3)] as Pt)];
  case 8:grid(3,3,8,true);return pts;
  default:{const nx=p.count===4?2:p.count===6?3:Math.ceil(Math.sqrt(p.count)),ny=Math.ceil(p.count/nx);grid(nx,ny,p.count);return pts;}
 }
}
/** Pile and pile-cut quantities per footing (one member element). */
export function pileQuantities(i:FoundationInput){
 const n=pilePositions(i).length,p=i.pile;
 return {count:n,lengthEach:p.length,totalLength:n*p.length,cutCount:p.cutoff>0?n:0,cutLengthEach:p.cutoff/1000,totalCutLength:n*p.cutoff/1000,type:p.type,size:p.size};
}
const pileArea=(p:PileInput)=>p.type==='square'||p.type==='I'?p.size*p.size:Math.PI*p.size**2/4;
export type ColumnBarPos={x:number;y:number;d:number;kind:'corner'|'sideX'|'sideY'|'ring'};
/** Largest main-bar diameter of the section. */
export function maxMainDiameter(col:FootingColumn){const m=col.main;return col.shape==='circle'?m.diameter:Math.max(m.corner.diameter,col.shape!=='rect'||m.sideX.count>0?m.sideX.diameter:0,col.shape!=='rect'||m.sideY.count>0?m.sideY.diameter:0);}
/** Main bar centres (local coordinates). `base` = cover + tie diameter.
 * Corners carry bundles of 1–3 bars placed side by side along the two faces;
 * side bars sit between the corner bundles (rect: count per face, L/U: max spacing). */
function columnBarPositions(col:FootingColumn,base:number):ColumnBarPos[]{
 const m=col.main;
 if(col.shape==='circle'){const r=col.diameter/2-base-m.diameter/2,ctr=col.diameter/2;return Array.from({length:m.count},(_,k)=>({x:ctr+r*Math.cos(2*Math.PI*k/m.count),y:ctr+r*Math.sin(2*Math.PI*k/m.count),d:m.diameter,kind:'ring' as const}));}
 const shape=outline(col),dc=m.corner.diameter,nc=m.corner.count,corner=inset(shape,base+dc/2),out:ColumnBarPos[]=[];
 const unit=(a:[number,number],b:[number,number]):[number,number]=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [dx/l,dy/l];};
 corner.forEach((p,i)=>{
  const next=unit(p,corner[(i+1)%corner.length]),prev=unit(p,corner[(i+corner.length-1)%corner.length]);
  out.push({x:p[0],y:p[1],d:dc,kind:'corner'});
  if(nc>=2)out.push({x:p[0]+next[0]*dc,y:p[1]+next[1]*dc,d:dc,kind:'corner'});
  if(nc>=3)out.push({x:p[0]+prev[0]*dc,y:p[1]+prev[1]*dc,d:dc,kind:'corner'});
 });
 shape.forEach((_,i)=>{
  const j=(i+1)%shape.length,alongX=Math.abs(shape[j][1]-shape[i][1])<1e-6,side=alongX?m.sideX:m.sideY,ds=side.diameter;
  if(!(ds>0))return;
  const poly=inset(shape,base+ds/2),a=poly[i],b=poly[j],e=unit(a,b),len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const start=nc>=2?dc:0,end=nc>=3?dc:0,span=len-start-end;
  const n=col.shape==='rect'?side.count:Math.max(0,Math.ceil(Hypot(corner[i],corner[j])/m.spacing-1e-9)-1);
  for(let k=1;k<=n;k++){const t=start+span*k/(n+1);out.push({x:a[0]+e[0]*t,y:a[1]+e[1]*t,d:ds,kind:alongX?'sideX':'sideY'});}
 });
 return out;
}
const Hypot=(a:[number,number],b:[number,number])=>Math.hypot(b[0]-a[0],b[1]-a[1]);
/** Section outline and main bar centres for the input preview (local mm). */
export function columnSectionPreview(col:FootingColumn){
 const {w,d}=columnExtent(col),base=col.cover+(col.type==='pedestal'?col.tie.diameter:0),dm=maxMainDiameter(col);
 return {w,d,outline:col.shape==='circle'?undefined:outline(col),bars:w>2*base+dm&&d>2*base+dm?columnBarPositions(col,base):[]};
}
/** Leg length of a 90° end bend: standard = hook90·d straight extension + bend radius. */
const bendLeg=(mode:'none'|'standard'|'custom',leg:number,d:number,det:Detailing)=>mode==='none'?0:mode==='custom'?leg:det.hook90*d+radius(d,det);

function foundationBars(i:FoundationInput,det:Detailing,rounding:number,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],{thickness:T,cover:c,rebar:r}=i,g=det.mainGrade,{w:X,d:Y}=footingExtent(i),plan=footingOutline(i);
 // Bars run between the faces of the actual plan shape (cover + d/2 inside). Bars of equal
 // geometry are one Mark; non-rectangular shapes give one Mark per bar length.
 const mesh=(role:string,note:string,l:{diameter:number;spacing:number;bend:'none'|'standard'|'custom';leg:number},runX:boolean,z:number,up:boolean)=>{
  const d=l.diameter,inner=inset(plan,c.side+d/2),ai=runX?1:0,lo=Math.min(...inner.map(p=>p[ai])),hi=Math.max(...inner.map(p=>p[ai])),s=spread(lo,hi,l.spacing);
  if(!s){warn(`${note}: วางเหล็กไม่ได้`);return;}
  const rad=radius(d,det),want=bendLeg(l.bend,l.leg,d,det);
  const legEnd=up?Math.min(z+want,T-c.top-d/2):Math.max(z-want,c.bottom+d/2),leg=Math.abs(legEnd-z),hooked=want>0&&leg>rad*1.5;
  if(want>0&&!hooked)warn(`${note}: ความหนาฐานไม่พอสำหรับขางอ ใช้เหล็กตรง`);
  else if(hooked&&leg+.5<want)warn(`${note}: ขางอถูกจำกัดเป็น ${Math.round(leg)} mm ตามความหนาฐาน − cover`);
  const segs:{a:number;b:number;at:number}[]=[];
  for(let k=0;k<s.count;k++){const at=s.count===1?s.from:s.from+(s.to-s.from)*k/(s.count-1),pos=Math.min(hi-1e-3,Math.max(lo+1e-3,at));for(const [a,b] of lineIntervals(inner,runX?0:1,pos))if(b-a>Math.max(2*d,hooked?3*rad:0))segs.push({a,b,at});}
  if(!segs.length){warn(`${note}: วางเหล็กไม่ได้`);return;}
  const pt=(along:number,at:number,zz:number):V3=>runX?[along,at,zz]:[at,along,zz];
  const shape=(sg:{a:number;b:number;at:number}):V3[]=>hooked?[pt(sg.a,sg.at,legEnd),pt(sg.a,sg.at,z),pt(sg.b,sg.at,z),pt(sg.b,sg.at,legEnd)]:[pt(sg.a,sg.at,z),pt(sg.b,sg.at,z)];
  const base={diameter:d,grade:g,axis:(runX?'X':'Y') as Bar['axis'],face:(up?'bottom':'top') as Bar['face'],radius:hooked?rad:0,shapeCode:hooked?'21':'00'},hookNote=hooked?` · งอฉาก ${Math.round(leg)} mm`:'';
  const uniform=segs.every(sg=>Math.abs(sg.a-segs[0].a)<.5&&Math.abs(sg.b-segs[0].b)<.5)&&new Set(segs.map(sg=>sg.at)).size===segs.length;
  if(uniform){out.push({...base,role,note:note+hookNote,count:segs.length,points:shape(segs[0]),distributionAxis:runX?'Y':'X',from:segs[0].at,to:segs.at(-1)!.at});return;}
  const groups=new Map<number,typeof segs>();for(const sg of segs){const key=Math.round(sg.b-sg.a);groups.set(key,[...(groups.get(key)||[]),sg]);}
  [...groups.entries()].sort((x,y)=>y[0]-x[0]).forEach(([len,list],k)=>{
   const first=list[0],off=list.map(sg=>{const du=sg.a-first.a,dv=sg.at-first.at;return (runX?[du,dv,0]:[dv,du,0]) as V3;}),fixed={...first,b:first.a+len};
   out.push({...base,role:`${role}-${k+1}`,note:`${note} · ช่วง ${len} mm${hookNote}`,count:list.length,points:shape(fixed),offsets:off});
  });
 };
 const zX=c.bottom+r.bottomX.diameter/2,zY=c.bottom+r.bottomX.diameter+r.bottomY.diameter/2;
 mesh('bottom-x','เหล็กล่าง · ทิศ X',r.bottomX,true,zX,true);
 mesh('bottom-y','เหล็กล่าง · ทิศ Y',r.bottomY,false,zY,true);
 if(r.topX.enabled)mesh('top-x','เหล็กบน · ทิศ X',r.topX,true,T-c.top-r.topX.diameter/2,false);
 if(r.topY.enabled)mesh('top-y','เหล็กบน · ทิศ Y',r.topY,false,T-c.top-(r.topX.enabled?r.topX.diameter:0)-r.topY.diameter/2,false);
 const col=i.column;if(col.type==='none')return out;
 const pedestal=col.type==='pedestal',name=col.columnNo?`${pedestal?'เสาตอม่อ':'Starter'} ${col.columnNo}`:pedestal?'เสาตอม่อ':'Starter bar';
 const {w,d:depth}=columnExtent(col),ox=(X-w)/2+col.offsetX,oy=(Y-depth)/2+col.offsetY,dt=pedestal?col.tie.diameter:0;
 const all=columnBarPositions(col,col.cover+dt).map(b=>({...b,x:ox+b.x,y:oy+b.y}));
 if(!all.length){warn(`${name}: ไม่มีตำแหน่งเหล็กยืน`);return out;}
 const meshTop=c.bottom+r.bottomX.diameter+r.bottomY.diameter,top=T+(pedestal?col.height:0);
 const groups=[...new Set(all.map(b=>b.d))].sort((a,b)=>b-a),kinds:Record<ColumnBarPos['kind'],string>={corner:'มุม',sideX:'ด้าน X',sideY:'ด้าน Y',ring:'รอบวง'};
 for(const dm of groups){
  const set=all.filter(b=>b.d===dm),pts=set.map(b=>[b.x,b.y] as [number,number]),rad=radius(dm,det),zMin=meshTop+dm/2;
  let zBend=col.embed.mode==='custom'?T-col.embed.depth:zMin;
  if(zBend<zMin){warn(`${name}: ระยะฝังลึกเกินตะแกรงเหล็กล่าง ใช้ระดับบนตะแกรงแทน`);zBend=zMin;}
  const zTop=col.projection>0?top+col.projection:top-col.cover-dm/2,want=bendLeg(col.bend,col.leg,dm,det);
  // Feet bend outward around the column centre: side bars perpendicular to their face,
  // corner bars diagonally, circular columns radially.
  const cx=ox+w/2,cy=oy+depth/2,dirOf=(b:ColumnBarPos):Pt=>{const dx=b.x-cx,dy=b.y-cy;if(b.kind==='sideX')return [0,Math.sign(dy)||1];if(b.kind==='sideY')return [Math.sign(dx)||1,0];if(b.kind==='corner')return [(Math.sign(dx)||1)/Math.SQRT2,(Math.sign(dy)||1)/Math.SQRT2];const l=Math.hypot(dx,dy)||1;return [dx/l,dy/l];};
  const room=inset(plan,c.side+dm/2),dirs=set.map(dirOf),fits=(len:number)=>set.every((b,k)=>pointInPolygon([b.x+dirs[k][0]*len,b.y+dirs[k][1]*len],room));
  let leg=want>rad*1.5?want:0;while(leg>0&&!fits(leg)){leg-=10;if(leg<=rad*1.5)leg=0;}
  if(want>0&&!leg)warn(`${name} DB${dm}: พื้นที่ฐานรากไม่พอสำหรับขางอ ใช้เหล็กตรง`);
  else if(leg&&leg<want-.5)warn(`${name} DB${dm}: ขางอถูกจำกัดเป็น ${Math.round(leg)} mm ให้อยู่ในฐานราก`);
  const [x0,y0]=pts[0],d0=dirs[0],a0=Math.atan2(d0[1],d0[0]),mix=(Object.keys(kinds) as ColumnBarPos['kind'][]).map(k=>[k,set.filter(b=>b.kind===k).length] as const).filter(([,n])=>n>0).map(([k,n])=>`${kinds[k]} ${n}`).join(' · ');
  const parts=[`ฝัง ${Math.round(T-zBend)}`,leg?`งอฉากออกรอบเสา ${Math.round(leg)}`:'ปลายตรง',col.projection>0?`โผล่ ${Math.round(col.projection)}`:''].filter(Boolean);
  const turns=dirs.map(dv=>{let t=(Math.atan2(dv[1],dv[0])-a0)*180/Math.PI;while(t>180)t-=360;while(t<=-180)t+=360;return Number(t.toFixed(4));});
  out.push({role:groups.length>1?`column-main-${dm}`:'column-main',note:`เหล็กยืน ${name} (${mix}) · ${parts.join(' · ')} mm`,diameter:dm,grade:g,count:pts.length,points:leg?[[x0+d0[0]*leg,y0+d0[1]*leg,zBend],[x0,y0,zBend],[x0,y0,zTop]]:[[x0,y0,zBend],[x0,y0,zTop]],axis:'Z',face:'side',radius:leg?rad:0,shapeCode:leg?'11':'00',offsets:offsetsFrom(pts),...(leg?{turns}:{})});
 }
 const minGap=Math.min(Infinity,...all.flatMap((a,i)=>all.slice(i+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y)-(a.d+b.d)/2)));
 if(minGap<-0.5)warn(`${name}: ตำแหน่งเหล็กยืนซ้อนกัน ลดจำนวนหรือขนาดเหล็ก`);
 if(pedestal){
  const ext=Math.max(det.hook135*dt,det.hook135Min),trad=radius(dt,det,true),tc=col.cover+dt/2,tz=spread(T+50,top-col.cover-dt/2,col.tie.spacing);
  if(!tz)warn(`${name}: ความสูงไม่พอสำหรับเหล็กปลอก`);
  else if(col.shape==='circle'){const Rt=col.diameter/2-tc,ctr=[ox+col.diameter/2,oy+col.diameter/2];out.push({role:'column-tie',note:`ปลอกวงกลม${name} (ยาว = เส้นรอบวง + ขอ 2 × ${Math.round(ext)} mm)`,diameter:dt,grade:det.tieGrade,count:tz.count,points:Array.from({length:37},(_,k)=>[ctr[0]+Rt*Math.cos(2*Math.PI*k/36),ctr[1]+Rt*Math.sin(2*Math.PI*k/36),tz.from] as V3),axis:'Z',face:'side',radius:0,shapeCode:'99',distributionAxis:'Z',from:tz.from,to:tz.to,cut:roundUp(2*Math.PI*Rt+2*ext,rounding)});}
  else columnBoxes(col).forEach((b,k,all)=>{const full=col.shape==='L'||col.shape==='U'?(k===0?{...b}:{...b,y0:0}):b;out.push({role:`column-tie-${k+1}`,note:`เหล็กปลอก${name}${all.length>1?` · ${k===0?'ขาแนว X':`ขาแนว Y${all.length>2?` ${k}`:''}`}`:''}`,diameter:dt,grade:det.tieGrade,count:tz.count,points:link(0,1,2,ox+full.x0+tc,ox+full.x1-tc,oy+full.y0+tc,oy+full.y1-tc,tz.from,ext,trad),axis:'Z',face:'side',radius:trad,shapeCode:'99',distributionAxis:'Z',from:tz.from,to:tz.to});});
 }
 return out;
}

function columnBars(i:ColumnInput,det:Detailing,rounding:number,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],c=i.cover.side,H=i.height,dm=i.rebar.main.diameter,dt=i.rebar.tie.diameter,n=i.rebar.main.count;
 const ext=Math.max(det.hook135*dt,det.hook135Min),lapLen=i.rebar.lap?det.lap*dm:0,z0=c+dm/2,z1=H-c-dm/2;
 const cut=i.rebar.lap?roundUp(H+lapLen,rounding):undefined;
 const mainNote=`เหล็กยืน ${n} เส้น${i.rebar.lap?` (ยาว H + ทาบ ${det.lap}d = ${Math.round(lapLen)} mm)`:''}`;
 const tz=spread(Math.max(50,c+dt/2),H-Math.max(50,c+dt/2),i.rebar.tie.spacing);
 if(i.shape==='rect'){
  const inset=c+dt+dm/2,pts=perimeter(n,inset,i.width-inset,inset,i.depth-inset);
  out.push({role:'main',note:mainNote,diameter:dm,grade:det.mainGrade,count:pts.length,points:[[pts[0][0],pts[0][1],z0],[pts[0][0],pts[0][1],z1]],axis:'Z',face:'side',radius:0,shapeCode:'00',offsets:offsetsFrom(pts),cut});
  const tc=c+dt/2;
  if(tz)out.push({role:'tie',note:'เหล็กปลอก',diameter:dt,grade:det.tieGrade,count:tz.count,points:link(0,1,2,tc,i.width-tc,tc,i.depth-tc,tz.from,ext,radius(dt,det,true)),axis:'Z',face:'side',radius:radius(dt,det,true),shapeCode:'99',distributionAxis:'Z',from:tz.from,to:tz.to});
 }else{
  const D=i.diameter,ctr=D/2,R=D/2-c-dt-dm/2,pts:[number,number][]=Array.from({length:n},(_,k)=>[ctr+R*Math.cos(2*Math.PI*k/n),ctr+R*Math.sin(2*Math.PI*k/n)]);
  out.push({role:'main',note:mainNote,diameter:dm,grade:det.mainGrade,count:n,points:[[pts[0][0],pts[0][1],z0],[pts[0][0],pts[0][1],z1]],axis:'Z',face:'side',radius:0,shapeCode:'00',offsets:offsetsFrom(pts),cut});
  const Rt=D/2-c-dt/2,hoop:V3[]=Array.from({length:37},(_,k)=>[ctr+Rt*Math.cos(2*Math.PI*k/36),ctr+Rt*Math.sin(2*Math.PI*k/36),tz?.from||0]);
  if(tz)out.push({role:'tie',note:`ปลอกเกลียว/วงกลม (ยาว = เส้นรอบวง + ขอ 2 × ${Math.round(ext)} mm)`,diameter:dt,grade:det.tieGrade,count:tz.count,points:hoop,axis:'Z',face:'side',radius:0,shapeCode:'99',distributionAxis:'Z',from:tz.from,to:tz.to,cut:roundUp(2*Math.PI*Rt+2*ext,rounding)});
  warn('เสากลม: คิดคอนกรีต/แบบหล่อด้วยรายการหักจากกล่อง D × D · ภาพ 3D แสดงเป็นกล่อง');
 }
 if(!tz)warn('เหล็กปลอก: วางไม่ได้ ตรวจความสูงและระยะห่าง');
 return out;
}

function beamBars(i:BeamInput,det:Detailing,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],{width:W,depth:Dp,length:L,cover:c,rebar:r}=i,dt=r.stirrup.diameter,ext=Math.max(det.hook135*dt,det.hook135Min);
 const main=(role:string,note:string,l:{count:number;diameter:number},top:boolean)=>{
  if(l.count<1)return;const d=l.diameter,z=top?Dp-c.top-dt-d/2:c.bottom+dt+d/2,lo=c.side+dt+d/2,hi=W-c.side-dt-d/2;
  if(hi<lo){warn(`${note}: ความกว้างคานไม่พอ`);return;}
  const from=l.count===1?(lo+hi)/2:lo,to=l.count===1?from:hi,rad=radius(d,det);
  const leg=det.hook90*d+rad,legEnd=top?Math.max(z-leg,c.bottom+dt+d/2):Math.min(z+leg,Dp-c.top-dt-d/2),hooked=r.endHook&&Math.abs(legEnd-z)>rad*1.5;
  if(r.endHook&&!hooked)warn(`${note}: ความลึกคานไม่พอสำหรับขอ 90° ใช้เหล็กตรง`);
  const a=c.side+d/2,b=L-c.side-d/2;
  out.push({role,note,diameter:d,grade:det.mainGrade,count:l.count,points:hooked?[[a,from,legEnd],[a,from,z],[b,from,z],[b,from,legEnd]]:[[a,from,z],[b,from,z]],axis:'X',face:top?'top':'bottom',radius:hooked?rad:0,shapeCode:hooked?'21':'00',distributionAxis:'Y',from,to});
 };
 main('top','เหล็กบน',r.top,true);
 main('bottom','เหล็กล่าง',r.bottom,false);
 const sx=spread(Math.max(50,c.side+dt/2),L-Math.max(50,c.side+dt/2),r.stirrup.spacing),tc=c.side+dt/2;
 if(sx)out.push({role:'stirrup',note:'เหล็กปลอก',diameter:dt,grade:det.tieGrade,count:sx.count,points:link(1,2,0,tc,W-tc,c.bottom+dt/2,Dp-c.top-dt/2,sx.from,ext,radius(dt,det,true)),axis:'X',face:'side',radius:radius(dt,det,true),shapeCode:'99',distributionAxis:'X',from:sx.from,to:sx.to});
 else warn('เหล็กปลอก: วางไม่ได้ ตรวจความยาวและระยะห่าง');
 return out;
}

function slabBars(i:SlabInput,det:Detailing,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],{lengthX:X,lengthY:Y,thickness:T,cover:c,rebar:r}=i;
 const mesh=(role:string,note:string,l:{diameter:number;spacing:number},runX:boolean,z:number)=>{
  const d=l.diameter,across=runX?Y:X,run=runX?X:Y,s=spread(c.edge+d/2,across-c.edge-d/2,l.spacing);if(!s){warn(`${note}: วางเหล็กไม่ได้`);return;}
  const a=c.edge+d/2,b=run-c.edge-d/2,pt=(along:number):V3=>runX?[along,s.from,z]:[s.from,along,z];
  out.push({role,note,diameter:d,grade:det.mainGrade,count:s.count,points:[pt(a),pt(b)],axis:runX?'X':'Y',face:z<T/2?'bottom':'top',radius:0,shapeCode:'00',distributionAxis:runX?'Y':'X',from:s.from,to:s.to});
 };
 mesh('bottom-x','เหล็กล่าง · ทิศ X',r.bottomX,true,c.bottom+r.bottomX.diameter/2);
 mesh('bottom-y','เหล็กล่าง · ทิศ Y',r.bottomY,false,c.bottom+r.bottomX.diameter+r.bottomY.diameter/2);
 if(r.topX.enabled)mesh('top-x','เหล็กบน · ทิศ X',r.topX,true,T-c.top-r.topX.diameter/2);
 if(r.topY.enabled)mesh('top-y','เหล็กบน · ทิศ Y',r.topY,false,T-c.top-(r.topX.enabled?r.topX.diameter:0)-r.topY.diameter/2);
 return out;
}

function wallBars(i:WallInput,det:Detailing,rounding:number,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],{length:L,thickness:t,height:H,cover:c,rebar:r}=i,dv=r.vertical.diameter,dh=r.horizontal.diameter;
 const faces=r.layers===2?[{tag:'ผิว 1',yv:c.face+dv/2,yh:c.face+dv+dh/2},{tag:'ผิว 2',yv:t-c.face-dv/2,yh:t-c.face-dv-dh/2}]:[{tag:'กึ่งกลาง',yv:t/2,yh:t/2+(dv+dh)/2}];
 if(r.layers===1&&t/2+(dv+dh)/2+dh/2>t-c.face)warn('ผนังชั้นเดียว: ความหนาไม่พอสำหรับเหล็กสองทิศ');
 const lapLen=r.lap?det.lap*dv:0,cut=r.lap?roundUp(H+lapLen,rounding):undefined;
 const sx=spread(c.edge+dv/2,L-c.edge-dv/2,r.vertical.spacing),sz=spread(c.edge+dh/2,H-c.edge-dh/2,r.horizontal.spacing);
 faces.forEach((f,k)=>{
  if(sx)out.push({role:`vertical-${k+1}`,note:`เหล็กแนวตั้ง · ${f.tag}${r.lap?` (ยาว H + ทาบ ${det.lap}d)`:''}`,diameter:dv,grade:det.mainGrade,count:sx.count,points:[[sx.from,f.yv,c.edge+dv/2],[sx.from,f.yv,H-c.edge-dv/2]],axis:'Z',face:'side',radius:0,shapeCode:'00',distributionAxis:'X',from:sx.from,to:sx.to,cut});
  if(sz)out.push({role:`horizontal-${k+1}`,note:`เหล็กแนวนอน · ${f.tag}`,diameter:dh,grade:det.mainGrade,count:sz.count,points:[[c.edge+dh/2,f.yh,sz.from],[L-c.edge-dh/2,f.yh,sz.from]],axis:'X',face:'side',radius:0,shapeCode:'00',distributionAxis:'Z',from:sz.from,to:sz.to});
 });
 if(!sx||!sz)warn('เหล็กผนัง: วางไม่ได้ ตรวจมิติและระยะห่าง');
 return out;
}

const AUTO='[auto] ';
export type AppliedElement={member:Member;warnings:string[];generated:Bar[]};
/** Converts the structured input to the existing member pattern. Manual bars and
 * manual deductions are kept; previously generated bars/deductions are replaced. */
export function applyElementInput(m:Member,input:ElementInput,opts:{rounding?:number;withBars?:boolean}={}):AppliedElement{
 const rounding=opts.rounding&&opts.rounding>0?opts.rounding:25,warnings:string[]=[],warn=(s:string)=>warnings.push(s),det=input.detailing;
 const deductions=m.deductions.filter(d=>!d.reason.startsWith(AUTO));
 const {geometry:_g,prismGeometry:_p,beamAssembly:_b,...plain}=m;
 let next:Member={...plain,elementInput:{...input,appliedAt:new Date().toISOString()}};
 let gen:GenBar[]=[];
 switch(input.category){
  case 'Foundation':{
   const {w:X,d:Y}=footingExtent(input),A=footingArea(input),P=footingPerimeter(input);
   const lx=X+2*input.lean.projection,ly=Y+2*input.lean.projection,bx=Math.max(lx,X+2*input.excavation.workingSpace),by=Math.max(ly,Y+2*input.excavation.workingSpace),grow=2*input.excavation.depth*input.excavation.slope;
   const col=input.column,T=input.thickness,ped=col.type==='pedestal',H=ped?col.height:0,{w,d}=columnExtent(col),ox=(X-w)/2+col.offsetX,oy=(Y-d)/2+col.offsetY;
   const buriedPed=Math.max(0,Math.min(H,input.excavation.depth-input.lean.thickness-T)),buried=(A*T+(ped?columnArea(col)*buriedPed:0))/1e9;
   const footingFaces=[true,true,true,true,false,false],sideFaces=[true,true,true,true,false,false];
   const auto:Member['deductions']=[];
   // Hexagon / octagon / circle: bounding box concrete minus the cut-off corners (exact area and perimeter).
   if(!['rect','L','U'].includes(input.shape))auto.push({reason:`${AUTO}ฐานราก${({circle:'กลม',hex:'6 เหลี่ยม',oct:'8 เหลี่ยม'} as Record<string,string>)[input.shape]} (หักจากกล่อง ${Math.round(X)} × ${Math.round(Y)})`,volume:(X*Y-A)*T/1e9,formwork:(2*X+2*Y-P)*T/1e6});
   if(ped&&col.shape==='circle')auto.push({reason:`${AUTO}เสาตอม่อกลม Ø${w} (หักจากกล่อง ${w} × ${w})`,volume:(w*w-Math.PI*w*w/4)*H/1e9,formwork:(4*w-Math.PI*w)*H/1e6});
   const piles=pilePositions(input);
   if(piles.length&&input.pile.embed>0)auto.push({reason:`${AUTO}หัวเข็มฝังในฐาน ${piles.length} ต้น × ${input.pile.embed} mm`,volume:piles.length*pileArea(input.pile)*input.pile.embed/1e9,formwork:0});
   if(input.shape!=='rect'&&(input.lean.thickness>0||input.excavation.depth>0))warn('Lean concrete และงานขุดคิดเป็นกรอบสี่เหลี่ยมคลุมแปลนฐาน (ระยะยื่น/ระยะเผื่อทำงานรอบกรอบ)');
   if(piles.length&&input.cover.bottom<input.pile.embed+25)warn(`cover ล่าง ${input.cover.bottom} mm ควรมากกว่าระยะฝังหัวเข็ม ${input.pile.embed} mm เพื่อให้ตะแกรงล่างอยู่เหนือหัวเข็ม`);
   const geometryRoute=input.shape==='L'||input.shape==='U'||ped&&(col.shape==='L'||col.shape==='U');
   let shape:Partial<Member>={z:T,pedestal:ped?{x:w,y:d,z:H}:{x:0,y:0,z:0}};
   if(geometryRoute)shape={z:T+H,pedestal:{x:0,y:0,z:0},geometry:{solids:[...footingBoxes(input).map((b,k)=>({id:`footing${k+1}`,label:`ฐานราก ${k+1}`,origin:[b.x0,b.y0,0] as V3,size:[b.x1-b.x0,b.y1-b.y0,T] as V3,faces:footingFaces})),...(ped?columnBoxes(col).map((b,k)=>({id:`pedestal${k+1}`,label:`เสาตอม่อ ${k+1}`,origin:[ox+b.x0,oy+b.y0,T] as V3,size:[b.x1-b.x0,b.y1-b.y0,H] as V3,faces:sideFaces})):[])],voids:[]}};
   else if(ped&&(Math.abs(col.offsetX)>.5||Math.abs(col.offsetY)>.5))shape={z:T+H,pedestal:{x:0,y:0,z:0},geometry:{solids:[{id:'footing1',label:'ฐานราก',origin:[0,0,0],size:[X,Y,T],faces:footingFaces},{id:'pedestal',label:'เสาตอม่อ',origin:[ox,oy,T],size:[w,d,H],faces:sideFaces}],voids:[]}};
   shape={...shape,deductions:[...deductions,...auto]};
   // Bars projecting above the concrete sit in placement-only reference regions (not in BOQ).
   const keep=(m.placementContext?.regions||[]).filter(r=>!r.id.startsWith('gencol')).map(r=>({...r,openings:'openings' in r?r.openings:[]}));
   const regions=col.type!=='none'&&col.projection>0?(col.shape==='circle'?[{x0:0,y0:0,x1:w,y1:d}]:columnBoxes(col)).map((b,k)=>({id:`gencol${k+1}`,label:`${col.columnNo||'เสา'} (อ้างอิง)`.slice(0,80),origin:[ox+b.x0,oy+b.y0,T+H] as V3,size:[b.x1-b.x0,b.y1-b.y0,col.projection+col.cover+maxMainDiameter(col)] as V3,reference:`เหล็กเสาโผล่${ped?'เหนือตอม่อ':'จากฐาน'} ${col.projection} mm · พื้นที่อ้างอิง ไม่คิดปริมาณ`,cover:col.cover,openings:[]})):[];
   const context=[...keep,...regions].slice(0,6),firstBar=col.type!=='none'?columnSectionPreview(col).bars[0]:undefined;
   // Default section A-A passes through the first row of column bars so they appear in the section view.
   if(!m.drawingViews)shape={...shape,sectionY:firstBar?Number((oy+firstBar.y).toFixed(1)):Y/2};
   const {placementContext:_c,...rest}=next;
   next={...rest,...(context.length?{placementContext:{version:2 as const,regions:context}}:{}),x:X,y:Y,cover:Math.min(input.cover.bottom,input.cover.top,input.cover.side,...(col.type!=='none'?[col.cover]:[])),faces:footingFaces,lean:{x:input.lean.thickness>0?lx:0,y:input.lean.thickness>0?ly:0,thickness:input.lean.thickness},excavation:{bottomX:bx,bottomY:by,topX:bx+grow,topY:by+grow,depth:input.excavation.depth,buriedConcrete:buried},...shape} as Member;
   gen=foundationBars(input,det,rounding,warn);break;}
  case 'Column':{
   const rect=input.shape==='rect',D=input.diameter,H=input.height;
   next={...next,x:rect?input.width:D,y:rect?input.depth:D,z:H,cover:input.cover.side,faces:[true,true,true,true,false,false],pedestal:{x:0,y:0,z:0},deductions:rect?deductions:[...deductions,{reason:`${AUTO}หน้าตัดวงกลม Ø${D} (แปลงจากกล่อง ${D} × ${D})`,volume:(D*D-Math.PI*D*D/4)*H/1e9,formwork:(4*D-Math.PI*D)*H/1e6}]};
   gen=columnBars(input,det,rounding,warn);break;}
  case 'Beam':next={...next,x:input.length,y:input.width,z:input.depth,cover:Math.min(input.cover.top,input.cover.bottom,input.cover.side),faces:[false,false,true,true,true,false],pedestal:{x:0,y:0,z:0},deductions};gen=beamBars(input,det,warn);break;
  case 'Slab':next={...next,x:input.lengthX,y:input.lengthY,z:input.thickness,cover:Math.min(input.cover.top,input.cover.bottom,input.cover.edge),faces:[true,true,true,true,true,false],pedestal:{x:0,y:0,z:0},deductions};gen=slabBars(input,det,warn);break;
  case 'Wall':next={...next,x:input.length,y:input.thickness,z:input.height,cover:Math.min(input.cover.face,input.cover.edge),faces:[true,true,true,true,false,false],pedestal:{x:0,y:0,z:0},deductions};gen=wallBars(input,det,rounding,warn);break;
 }
 if(m.category!=='Foundation')next={...next,excavation:{bottomX:0,bottomY:0,topX:0,topY:0,depth:0,buriedConcrete:0},lean:{x:0,y:0,thickness:0}};
 if(opts.withBars===false)return {member:next,warnings,generated:[]};
 const manual=m.bars.filter(b=>!isGeneratedBar(b)),used=new Set(manual.map(b=>b.mark)),prefix=markPrefix[input.category];
 let n=0;const nextMark=()=>{let mark='';do{n++;mark=`${prefix}${String(n).padStart(2,'0')}`;}while(used.has(mark));used.add(mark);return mark;};
 const generated:Bar[]=gen.filter(g=>g.count>0&&g.diameter>0).map(g=>{
  const cut=g.cut&&g.cut>0?g.cut:0;
  if(cut>det.stockLength)warn(`${g.note}: ยาวตัด ${cut} mm เกินเหล็กเส้น ${det.stockLength} mm ต้องต่อทาบ`);
  return {id:`${GEN_PREFIX}${g.role}`,mark:nextMark(),diameter:g.diameter,grade:g.grade,count:g.count,axis:g.axis,face:g.face,shape:'polyline',shapeCode:g.shapeCode,start:0,end:0,tail:0,radius:Number(g.radius.toFixed(3)),distributionStart:g.offsets?0:g.from||0,distributionEnd:g.offsets?0:g.to||0,points:g.points.map(p=>p.map(v=>Number(v.toFixed(3))) as V3),cutOverride:cut,placementConfirmed:false,note:g.note.slice(0,500),...(['00','11','21'].includes(g.shapeCode)&&!cut?{lengthMethod:'bs8666' as const}:{}),...(g.distributionAxis&&!g.offsets?{distributionAxis:g.distributionAxis}:{}),...(g.offsets?{offsets:g.offsets.map(o=>o.map(v=>Number(v.toFixed(3))) as V3)}:{}),...(g.offsets&&g.turns&&g.turns.some(t=>t!==0)?{offsetTurns:g.turns}:{})};
 });
 return {member:{...next,bars:[...generated,...manual]},warnings,generated};
}

/** Prefills the structured input from a saved drawing analysis (AI or PDF text).
 * Returns the updated input and the list of field labels taken from the drawing. */
export function inputFromExtraction(input:ElementInput,e:DrawingExtraction):{input:ElementInput;filled:string[]}{
 const f=e.fields||{},dims:Record<string,number|undefined>={x:f.x,y:f.y,z:f.z,cover:f.cover};
 for(const d of e.dimensions)if(d.axis!=='unknown'&&dims[d.axis]===undefined)dims[d.axis]=d.value;
 const filled:string[]=[],next=structuredClone(input) as any,set=(path:string,v:number|undefined,label:string)=>{if(v===undefined||!Number.isFinite(v)||v<=0)return;const keys=path.split('.');let o=next;for(const k of keys.slice(0,-1))o=o[k];o[keys.at(-1)!]=v;filled.push(label);};
 const rows=e.reinforcement.filter(r=>r.diameter>0),spaced=rows.filter(r=>r.spacing),counted=rows.filter(r=>!r.spacing&&r.count&&r.count>1);
 const pick=(list:typeof rows,pred:(r:typeof rows[number])=>boolean)=>list.find(pred);
 switch(input.category){
  case 'Foundation':{
   set('width',dims.x,'กว้าง X');set('length',dims.y,'ยาว Y');set('thickness',dims.z,'หนา');set('cover.bottom',dims.cover,'cover ล่าง');set('cover.side',dims.cover,'cover ข้าง');
   if(f.pedestal?.x&&f.pedestal?.y){next.column.type='pedestal';next.column.shape='rect';}
   set('column.width',f.pedestal?.x,'ตอม่อ กว้าง');set('column.depth',f.pedestal?.y,'ตอม่อ ยาว');set('column.height',f.pedestal?.z,'ตอม่อ สูง');
   set('lean.thickness',f.lean?.thickness,'Lean หนา');set('excavation.depth',f.excavation?.depth,'ความลึกขุด');
   const bottom=spaced.filter(r=>r.face!=='top'),top=spaced.filter(r=>r.face==='top');
   const bx=pick(bottom,r=>r.axis==='X')||bottom[0],by=pick(bottom,r=>r.axis==='Y'&&r!==bx)||bottom.find(r=>r!==bx);
   if(bx){set('rebar.bottomX.diameter',bx.diameter,'เหล็กล่าง X');set('rebar.bottomX.spacing',bx.spacing,'ระยะเหล็กล่าง X');}
   if(by){set('rebar.bottomY.diameter',by.diameter,'เหล็กล่าง Y');set('rebar.bottomY.spacing',by.spacing,'ระยะเหล็กล่าง Y');}
   const tx=pick(top,r=>r.axis!=='Y')||top[0],ty=top.find(r=>r!==tx);
   if(tx){next.rebar.topX.enabled=true;set('rebar.topX.diameter',tx.diameter,'เหล็กบน X');set('rebar.topX.spacing',tx.spacing,'ระยะเหล็กบน X');}
   if(ty){next.rebar.topY.enabled=true;set('rebar.topY.diameter',ty.diameter,'เหล็กบน Y');set('rebar.topY.spacing',ty.spacing,'ระยะเหล็กบน Y');}
   break;}
  case 'Column':{
   set('width',dims.x,'กว้าง X');set('depth',dims.y,'ลึก Y');set('height',dims.z,'สูง');set('cover.side',dims.cover,'cover');
   const main=counted.sort((a,b)=>b.diameter-a.diameter)[0],tie=spaced[0];
   if(main){set('rebar.main.count',main.count,'จำนวนเหล็กยืน');set('rebar.main.diameter',main.diameter,'ขนาดเหล็กยืน');}
   if(tie){set('rebar.tie.diameter',tie.diameter,'ขนาดปลอก');set('rebar.tie.spacing',tie.spacing,'ระยะปลอก');}
   break;}
  case 'Beam':{
   set('length',dims.x,'ยาว');set('width',dims.y,'กว้าง');set('depth',dims.z,'ลึก');set('cover.top',dims.cover,'cover บน');set('cover.bottom',dims.cover,'cover ล่าง');set('cover.side',dims.cover,'cover ข้าง');
   const top=pick(counted,r=>r.face==='top'),bottom=pick(counted,r=>r.face==='bottom')||counted.find(r=>r!==top),st=spaced[0];
   if(top){set('rebar.top.count',top.count,'จำนวนเหล็กบน');set('rebar.top.diameter',top.diameter,'ขนาดเหล็กบน');}
   if(bottom){set('rebar.bottom.count',bottom.count,'จำนวนเหล็กล่าง');set('rebar.bottom.diameter',bottom.diameter,'ขนาดเหล็กล่าง');}
   if(st){set('rebar.stirrup.diameter',st.diameter,'ขนาดปลอก');set('rebar.stirrup.spacing',st.spacing,'ระยะปลอก');}
   break;}
  case 'Slab':{
   set('lengthX',dims.x,'ยาว X');set('lengthY',dims.y,'กว้าง Y');set('thickness',dims.z,'หนา');set('cover.bottom',dims.cover,'cover ล่าง');set('cover.top',dims.cover,'cover บน');
   const bottom=spaced.filter(r=>r.face!=='top'),bx=pick(bottom,r=>r.axis==='X')||bottom[0],by=pick(bottom,r=>r.axis==='Y'&&r!==bx)||bottom.find(r=>r!==bx);
   if(bx){set('rebar.bottomX.diameter',bx.diameter,'เหล็กล่าง X');set('rebar.bottomX.spacing',bx.spacing,'ระยะเหล็กล่าง X');}
   if(by){set('rebar.bottomY.diameter',by.diameter,'เหล็กล่าง Y');set('rebar.bottomY.spacing',by.spacing,'ระยะเหล็กล่าง Y');}
   break;}
  case 'Wall':{
   set('length',dims.x,'ยาว');set('thickness',dims.y,'หนา');set('height',dims.z,'สูง');set('cover.face',dims.cover,'cover ผิว');
   const v=pick(spaced,r=>r.axis==='Y'||r.axis==='Z')||spaced[0],h=pick(spaced,r=>r.axis==='X'&&r!==v)||spaced.find(r=>r!==v);
   if(v){set('rebar.vertical.diameter',v.diameter,'เหล็กแนวตั้ง');set('rebar.vertical.spacing',v.spacing,'ระยะเหล็กแนวตั้ง');}
   if(h){set('rebar.horizontal.diameter',h.diameter,'เหล็กแนวนอน');set('rebar.horizontal.spacing',h.spacing,'ระยะเหล็กแนวนอน');}
   break;}
 }
 next.mode='drawing';next.source={attachmentId:e.attachmentId,fileName:e.fileName.slice(0,250),extractedAt:e.extractedAt.slice(0,40)};
 return {input:next as ElementInput,filled};
}
