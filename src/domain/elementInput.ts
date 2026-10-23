import {z} from 'zod';
import type {Bar,Category,Member,Spec} from './model';
import {detailingFromSpec} from './specDetailing';
import {emptySiteWork,withSiteWork} from './siteWork';
import {REGION_LIMIT} from './placementContext';
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
const countLayer=z.object({count:z.number().int().min(0).max(200),diameter:dia}).strict();
/** 90° end bend: none, standard (hook90·d straight extension after the bend) or a user-defined leg length. */
const bendMode=z.enum(['none','standard','custom']);
/** BS 8666:2020 Table 5 shape codes that fit a straight bar run whose ends turn into the member thickness.
 * Ends: straight, 90° bend (leg) or 180° semicircular hook. 99 = hooks at both ends (non-standard, sketch). */
export type BarEnd='straight'|'bend'|'hook'|'return';
export const layerShapes=[
 {code:'00',label:'ตรง ไม่งอ',formula:'A',ends:['straight','straight']},
 {code:'11',label:'งอฉาก 90° ปลายเดียว (ตัว L)',formula:'A + (B) − 0.5r − d',ends:['bend','straight']},
 {code:'12',label:'งอ 90° ปลายเดียว รัศมีพิเศษ R',formula:'A + (B) − 0.43R − 1.2d',ends:['bend','straight']},
 {code:'13',label:'ขอครึ่งวงกลม 180° ปลายเดียว',formula:'A + 0.57B + (C) − 1.6d',ends:['hook','straight']},
 {code:'21',label:'งอฉาก 90° สองปลาย (ตัว U)',formula:'A + B + (C) − r − 2d',ends:['bend','bend']},
 {code:'22',label:'งอฉาก 90° + ขอ 180° อีกปลาย',formula:'A + B + 0.57C + (D) − 0.5r − 2.6d',ends:['bend','hook']},
 {code:'99',label:'ขอ 180° สองปลาย (นอกมาตรฐาน · Shape 99)',formula:'คำนวณตามแนวแกนเหล็ก',ends:['hook','hook']},
 {code:'41',label:'ตัว U ขาขึ้นเต็มความลึก + งอเข้าใน 15d สองปลาย (ฐานลึก)',formula:'A + B + C + D + (E) − 2r − 4d',ends:['return','return'],foundationOnly:true},
] as const satisfies readonly {code:string;label:string;formula:string;ends:readonly [BarEnd,BarEnd];foundationOnly?:boolean}[];
export const shapesFor=(category:string)=>layerShapes.filter(s=>!('foundationOnly' in s)||category==='Foundation');
export type LayerShape=typeof layerShapes[number]['code'];
const layerShape=z.enum(layerShapes.map(s=>s.code) as [LayerShape,...LayerShape[]]);
/** shape = BS 8666 shape code; leg = bend leg / hook straight extension (0 = standard); radius = inner R for code 12. */
const shaped={shape:layerShape,leg:mm,radius:mm};
const meshLayer=z.object({diameter:dia,spacing:mm,...shaped}).strict();
const optionalMesh=z.object({enabled:z.boolean(),diameter:dia,spacing:mm,...shaped}).strict();
const shapedCount=z.object({count:z.number().int().min(0).max(200),diameter:dia,...shaped}).strict();
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
 /** Lap length per bar diameter from the project spec (FTL table); missing sizes use lap × d. */
 lapTable:z.array(z.object({bar:dia,length:mm}).strict()).max(20).optional(),
 /** Spec the defaults were taken from (display only). */
 specRef:z.string().max(200).optional(),
 /** Beam top-bar extensions (× clear span) from the spec's typical beam details: end (discontinuous) / continuous support. */
 beam:z.object({topEnd:z.number().finite().min(0).max(2),topCont:z.number().finite().min(0).max(2),bottomZone:z.number().finite().min(0).max(2)}).strict().optional(),
}).strict();
/** Lap length for diameter d: project-spec table (exact size, else the next larger size) or lap × d. */
export function lapLength(det:Detailing,d:number){
 const t=det.lapTable?.filter(r=>r.bar>=d-1e-6).sort((a,b)=>a.bar-b.bar)[0];
 return t&&t.length>0?t.length:det.lap*d;
}
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
const level=z.number().finite().min(-1000).max(10000);
const foundationSchema=z.object({...base,category:z.literal('Foundation'),
 foundationType:z.enum(['spread','pile']),
 /** Plan shape. hex/oct: width × length bounding box with corner chamfer (0 = regular); L/U: arm thicknesses as for columns. */
 shape:z.enum(footingShapes),diameter:mm,chamfer:mm,armX:mm,armY:mm,
 width:mm,length:mm,thickness:mm,
 pile:pileSchema,
 excavation:z.object({depth:mm,workingSpace:mm,slope:z.number().finite().min(0).max(5)}).strict(),
 lean:z.object({thickness:mm,projection:mm}).strict(),
 cover:z.object({bottom:mm,top:mm,side:mm}).strict(),
 /** side = horizontal closed loops around the footing perimeter (face reinforcement), spaced up the depth. */
 /** sideBars = vertical face bars around the perimeter (outermost layer); ends straight or turned inward 90° (leg 0 = 15d). */
 rebar:z.object({bottomX:meshLayer,bottomY:meshLayer,topX:optionalMesh,topY:optionalMesh,side:z.object({enabled:z.boolean(),diameter:dia,spacing:mm}).strict(),
  sideBars:z.object({enabled:z.boolean(),diameter:dia,spacing:mm,top:z.enum(['straight','inward']),bottom:z.enum(['straight','inward']),leg:mm}).strict()}).strict(),
 /** Footing cast monolithic with the floor slab: top flush with the slab top; the slab (thickness) is a
  * reference region only (no slab concrete / bars); top bars extend `extend` mm beyond the footing into the slab. */
 slab:z.object({enabled:z.boolean(),thickness:mm,extend:mm}).strict(),
 column:footingColumnSchema,
 /** Reference levels (m): natural ground (NGL) and top of footing. Enabled = excavation depth is computed
  * from the levels down to the bottom of the lowest sub-base layer (lean, or sand under it). */
 /** Columns 2–10 on the same footing (C1 = `column`): own number and offsets; linked = same section,
  * bars and height as C1. All columns share C1's type (pedestal / starter). */
 extraColumns:z.array(footingColumnSchema.extend({linked:z.boolean()}).strict()).max(9),
 levels:z.object({enabled:z.boolean(),ground:level,top:level}).strict(),
 /** Sub-base under the footing: sand bed (projection per side from the footing edge), plastic sheet
  * (= lean area, or sand area without lean), compaction of the whole pit bottom. */
 subbase:z.object({sand:z.object({enabled:z.boolean(),thickness:mm,projection:mm}).strict(),sheet:z.object({enabled:z.boolean()}).strict(),compaction:z.object({enabled:z.boolean()}).strict()}).strict(),
}).strict();
export const DEFAULT_FOOTING_LEVELS={enabled:false,ground:0,top:-1.2};
export const DEFAULT_FOOTING_SUBBASE={sand:{enabled:false,thickness:100,projection:100},sheet:{enabled:false},compaction:{enabled:false}};
export type ExtraFootingColumn=FootingColumn&{linked:boolean};
/** Every column on the footing: C1 (`column`) then the extra ones resolved (linked → C1's section, bars and height
 * with its own number and offsets); empty when C1 is 'none'. */
export function footingColumns(i:FoundationInput):FootingColumn[]{
 if(i.column.type==='none')return [];
 return [i.column,...(i.extraColumns||[]).map(({linked,...c})=>linked?{...i.column,columnNo:c.columnNo,offsetX:c.offsetX,offsetY:c.offsetY}:{...c,type:i.column.type})];
}
/** Display name of column k (1-based numbering when unnamed). */
export const footingColumnName=(c:FootingColumn,k:number,many:boolean)=>`${c.type==='pedestal'?'เสาตอม่อ':'Starter'}${c.columnNo?` ${c.columnNo}`:many?` C${k+1}`:''}`;
/** Column centre layouts for n columns (offsets from the footing centre, mm) on a footing w × d. */
export const columnLayouts=[['row-x','แถวแนว X'],['row-y','แถวแนว Y'],['grid','ตาราง 2 แถว'],['triangle','สามเหลี่ยม (3)'],['corners','มุม (4)']] as const;
export function columnLayout(kind:typeof columnLayouts[number][0],n:number,w:number,d:number):[number,number][]{
 const even=(count:number,len:number)=>Array.from({length:count},(_,k)=>count===1?0:-len/2+len*k/(count-1));
 if(kind==='row-x')return even(n,w*.6).map(x=>[Math.round(x),0]);
 if(kind==='row-y')return even(n,d*.6).map(y=>[0,Math.round(y)]);
 if(kind==='triangle'&&n===3)return [[-Math.round(w*.25),-Math.round(d*.2)],[Math.round(w*.25),-Math.round(d*.2)],[0,Math.round(d*.25)]];
 if(kind==='corners'&&n===4)return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[Math.round(a*w*.25),Math.round(b*d*.25)]);
 const cols=Math.ceil(n/2),xs=even(cols,w*.6);return Array.from({length:n},(_,k)=>[Math.round(xs[k%cols]),Math.round(k<cols?-d*.2:d*.2)]);
}
/** Excavation slopes offered in the input (H : V per 1 vertical); 0 = vertical sides. */
export const slopePresets=[[0,'ตั้งตรง'],[1,'1:1'],[1.5,'1:1.5'],[2,'1:2']] as const;
/** Footing earthwork from the input: thicknesses under the footing, pit depth (levels or entered) and plan sizes. */
export function footingEarth(i:FoundationInput){
 const {w:X,d:Y}=footingExtent(i),sb=i.subbase,lean=i.lean.thickness,sand=sb.sand.enabled?sb.sand.thickness:0,below=lean+sand;
 const depth=i.levels.enabled?Math.max(0,Math.round((i.levels.ground-i.levels.top)*1000+i.thickness+below)):i.excavation.depth;
 const lx=X+2*i.lean.projection,ly=Y+2*i.lean.projection,sx=X+2*sb.sand.projection,sy=Y+2*sb.sand.projection;
 const bx=Math.max(lean>0?lx:0,sand>0?sx:0,X+2*i.excavation.workingSpace),by=Math.max(lean>0?ly:0,sand>0?sy:0,Y+2*i.excavation.workingSpace),grow=2*depth*i.excavation.slope;
 const sheet=sb.sheet.enabled?(lean>0?[lx,ly]:sand>0?[sx,sy]:[X,Y]):[0,0];
 return {X,Y,lean,sand,below,depth,lx,ly,sx,sy,bx,by,grow,sheet,
  /** levels (m) of the pit bottom and of the footing bottom */
  bottomLevel:i.levels.enabled?i.levels.top-(i.thickness+below)/1000:undefined};
}
export const DEFAULT_FOOTING_SLAB={enabled:false,thickness:150,extend:1000};
export const DEFAULT_FOOTING_SIDE={enabled:false,diameter:16,spacing:200};
export const DEFAULT_FOOTING_SIDE_BARS={enabled:false,diameter:16,spacing:200,top:'inward' as const,bottom:'straight' as const,leg:0};
/** Main-bar end condition at the column bottom / top joint.
 * none = stops at cover; lap = straight extension of `lap` beyond the joint;
 * crank = 1:6 crank inward by one bar diameter starting at the joint level (top of column
 * going up / bottom of column going down), then `lap` extension. lap 0 = detailing lap × d. */
const columnEnd=z.object({mode:z.enum(['none','lap','crank']),lap:mm}).strict();
export type ColumnEnd=z.infer<typeof columnEnd>;
/** Ties in three zones: lower (from the bottom), middle (`spacing`, remaining height), upper (to the top). Zone length 0 = no zone. */
const tieZone=z.object({length:mm,spacing:mm}).strict();
/** Set 2 (supplementary ties inside the perimeter hoop): pattern and spacing per zone, own diameter. */
export const tiePatterns=['none','auto','crossX','crossY','crossXY','crossAlt','diamond','diamondCross','diamondRect','rectX','rectY','rectXY','rectCross','octagon','overlapX','overlapY'] as const;
export type TiePattern=typeof tiePatterns[number];
export const tiePatternInfo:Record<TiePattern,{label:string;hint:string}>={
 none:{label:'ไม่มี (ปลอกรอบมุมอย่างเดียว)',hint:'ใช้เมื่อเหล็กกลางด้านทุกเส้นห่างจากเหล็กมุมไม่เกิน 150 mm (ระยะช่องว่าง)'},
 auto:{label:'อัตโนมัติ ACI 318 (150 mm)',hint:'เพิ่มเหล็กรัดขวางเฉพาะเหล็กที่ห่างจากเหล็กที่ถูกยึดเกิน 150 mm (ระยะช่องว่าง)'},
 crossX:{label:'เหล็กรัดขวาง แนว X',hint:'Cross tie ขอ 135° / 90° ยึดเหล็กกลางด้านซ้าย–ขวาทุกเส้น'},
 crossY:{label:'เหล็กรัดขวาง แนว Y',hint:'Cross tie ขอ 135° / 90° ยึดเหล็กกลางด้านล่าง–บนทุกเส้น'},
 crossXY:{label:'เหล็กรัดขวาง X + Y ทุกเส้น',hint:'Cross tie ทั้งสองแนว ยึดเหล็กกลางด้านทุกเส้น'},
 crossAlt:{label:'เหล็กรัดขวาง X + Y สลับเส้น',hint:'ยึดเหล็กกลางด้านเว้นเส้น (every alternate bar)'},
 diamond:{label:'ปลอกข้าวหลามตัด',hint:'ปลอกรัดเหล็กกึ่งกลางทั้ง 4 ด้าน · ต้องมีเหล็กกึ่งกลางทุกด้าน'},
 diamondCross:{label:'ข้าวหลามตัด + รัดขวาง',hint:'ข้าวหลามตัดรัดเหล็กกึ่งกลาง + Cross tie ที่เหล็กกลางด้านที่เหลือ'},
 rectX:{label:'ปลอกสี่เหลี่ยมใน แนว X',hint:'ปลอกยาวตามแนว X รัดเหล็กด้านซ้าย–ขวาเป็นคู่ · เส้นเศษใช้ Cross tie'},
 rectY:{label:'ปลอกสี่เหลี่ยมใน แนว Y',hint:'ปลอกยาวตามแนว Y รัดเหล็กด้านล่าง–บนเป็นคู่ · เส้นเศษใช้ Cross tie'},
 rectXY:{label:'ปลอกสี่เหลี่ยมใน X + Y (#)',hint:'ปลอกในทั้งสองแนวซ้อนกันเป็นรูป #'},
 octagon:{label:'ปลอกแปดเหลี่ยม',hint:'รัดเหล็กกลางด้านเส้นแรกและเส้นสุดท้ายของทุกด้าน'},
 diamondRect:{label:'ข้าวหลามตัด + ปลอกสี่เหลี่ยมใน',hint:'หน้าตัดพิเศษ: ข้าวหลามตัดรัดเหล็กกึ่งกลาง + ปลอกในรัดเหล็กกลางด้านที่เหลือเป็นคู่'},
 rectCross:{label:'ปลอกในแนวยาว + รัดขวางแนวสั้น',hint:'หน้าตัดพิเศษ (เสายาว/ผนัง): ปลอกในตามแนวยาวรัดเหล็กด้านสั้น + Cross tie ทุกแถวตามแนวสั้น'},
 overlapX:{label:'ปลอกซ้อนต่อเนื่อง แนว X',hint:'หน้าตัดพิเศษ (เสายาวแนว X): ปลอกเกือบจัตุรัสซ้อนกันต่อเนื่องตามแนว X + Cross tie แถวที่เหลือ'},
 overlapY:{label:'ปลอกซ้อนต่อเนื่อง แนว Y',hint:'หน้าตัดพิเศษ (เสายาวแนว Y): ปลอกเกือบจัตุรัสซ้อนกันต่อเนื่องตามแนว Y + Cross tie แถวที่เหลือ'},
};
const innerZone=z.object({pattern:z.enum(tiePatterns),spacing:mm}).strict();
export type TieZoneKey='lower'|'middle'|'upper';
export const tieZoneKeys:readonly (readonly [TieZoneKey,string])[]=[['lower','โซนล่าง'],['middle','โซนกลาง'],['upper','โซนบน']];
/** Column main bars. Rect: corner bundles (1–3 bars per corner) + bars per X face (bottom/top) and
 * per Y face (left/right), equal on opposite faces and evenly spaced. Circle: `count` × `diameter`. */
const columnMain=z.object({corner:z.object({diameter:dia,count:z.number().int().min(1).max(3)}).strict(),sideX:countLayer,sideY:countLayer,diameter:dia,count:z.number().int().min(0).max(200)}).strict();
/** Bars per X face / per Y face (excluding corners) for `n` bars spread proportionally on a w × d section. */
export function splitMainCount(n:number,w:number,d:number){const extra=Math.max(0,n-4),inX=Math.round(extra*w/((w+d)||1)/2)*2||0;return {x:inX/2,y:Math.ceil((extra-inX)/2)};}
const columnTie=z.object({diameter:dia,spacing:mm,lower:tieZone,upper:tieZone,
 inner:z.object({diameter:dia,lower:innerZone,middle:innerZone,upper:innerZone}).strict()}).strict();
const columnSchema=z.object({...base,category:z.literal('Column'),
 shape:z.enum(['rect','circle']),width:mm,depth:mm,diameter:mm,height:mm,
 cover:z.object({side:mm}).strict(),
 rebar:z.object({main:columnMain,tie:columnTie,bottom:columnEnd,top:columnEnd}).strict(),
}).strict();
/** Element cast on the ground (slab / beam on ground) or elevated (formed soffit). On ground: optional layers under
 * the concrete, top → bottom: lean concrete and plastic sheet, sand bed, compacted subgrade; projections per side. */
const groundSchema=z.object({support:z.enum(['elevated','ground']),
 lean:z.object({enabled:z.boolean(),thickness:mm,projection:mm}).strict(),sand:z.object({enabled:z.boolean(),thickness:mm,projection:mm}).strict(),
 sheet:z.object({enabled:z.boolean()}).strict(),compaction:z.object({enabled:z.boolean()}).strict()}).strict();
export type GroundInput=z.infer<typeof groundSchema>;
export const DEFAULT_GROUND:GroundInput={support:'elevated',lean:{enabled:false,thickness:50,projection:0},sand:{enabled:false,thickness:50,projection:0},sheet:{enabled:false},compaction:{enabled:false}};
/** Plan rectangles (mm) of the layers under an on-ground element of plan L × W (centred like the lean concrete). */
export function groundLayers(g:GroundInput,L:number,W:number){
 const on=g.support==='ground',lean=on&&g.lean.enabled&&g.lean.thickness>0,sand=on&&g.sand.enabled&&g.sand.thickness>0;
 const lx=L+2*g.lean.projection,ly=W+2*g.lean.projection,sx=L+2*g.sand.projection,sy=W+2*g.sand.projection;
 const bottom=sand?[sx,sy]:lean?[lx,ly]:[L,W];
 return {lean:lean?{x:lx,y:ly,thickness:g.lean.thickness}:{x:0,y:0,thickness:0},sand:sand?{x:sx,y:sy,thickness:g.sand.thickness}:{x:0,y:0,thickness:0},
  sheet:on&&g.sheet.enabled?(lean?{x:lx,y:ly}:{x:L,y:W}):{x:0,y:0},compaction:on&&g.compaction.enabled?{x:bottom[0],y:bottom[1]}:{x:0,y:0}};
}
/** One span of a beam group, grid to grid (cantilever: grid to tip). `top` = top of beam from the group datum
 * (mm, − = dropped). Stirrups: `endSpacing` over `endLength` from each support face, `spacing` between. */
const beamSpanSchema=z.object({mark:z.string().trim().min(1).max(32),kind:z.enum(['span','cantilever']),length:mm,width:mm,depth:mm,
 top:z.number().finite().min(-20000).max(20000),
 rebar:z.object({top:countLayer,bottom:countLayer,stirrup:z.object({diameter:dia,spacing:mm,endSpacing:mm,endLength:mm}).strict()}).strict()}).strict();
/** Grid line: label, support (column) width along the beam (0 = no column, e.g. on a girder / free end),
 * extra top bars over the support (count 0 = none). */
const beamGridSchema=z.object({label:z.string().trim().max(20),support:mm,extraTop:countLayer}).strict();
export type BeamSpan=z.infer<typeof beamSpanSchema>;export type BeamGrid=z.infer<typeof beamGridSchema>;
const beamSchema=z.object({...base,category:z.literal('Beam'),
 width:mm,depth:mm,length:mm,
 cover:z.object({top:mm,bottom:mm,side:mm}).strict(),
 rebar:z.object({top:shapedCount,bottom:shapedCount,stirrup:spacingLayer}).strict(),
 /** single = one span (fields above); group = beam group along grid lines (`grids` = spans + 1), BBS for the whole group */
 layout:z.enum(['single','group']),
 grids:z.array(beamGridSchema).max(13),
 spans:z.array(beamSpanSchema).max(12),
 ground:groundSchema,
}).strict();
const slabSchema=z.object({...base,category:z.literal('Slab'),
 lengthX:mm,lengthY:mm,thickness:mm,
 /** slab on ground (sub-base layers, no soffit formwork) or elevated slab */
 ground:groundSchema,
 cover:z.object({top:mm,bottom:mm,edge:mm}).strict(),
 rebar:z.object({bottomX:meshLayer,bottomY:meshLayer,topX:optionalMesh,topY:optionalMesh}).strict(),
}).strict();
const wallSchema=z.object({...base,category:z.literal('Wall'),
 length:mm,thickness:mm,height:mm,
 cover:z.object({face:mm,edge:mm}).strict(),
 rebar:z.object({layers:z.union([z.literal(1),z.literal(2)]),vertical:meshLayer,horizontal:meshLayer,lap:z.boolean()}).strict(),
}).strict();
const elementInputUnion=z.discriminatedUnion('category',[foundationSchema,columnSchema,beamSchema,slabSchema,wallSchema]);
export const elementInputSchema=z.preprocess(migrateElementInput,elementInputUnion);
export type ElementInput=z.infer<typeof elementInputUnion>;
export const DEFAULT_FOOTING_COLUMN:FootingColumn={type:'none',columnNo:'',shape:'rect',width:400,depth:400,diameter:400,armX:250,armY:250,height:600,projection:800,cover:40,main:{corner:{diameter:16,count:1},sideX:{diameter:16,count:1},sideY:{diameter:16,count:1},diameter:16,count:8,spacing:200},tie:{diameter:9,spacing:200},embed:{mode:'standard',depth:0},bend:'standard',leg:0,offsetX:0,offsetY:0};
export const DEFAULT_PILE:PileInput={type:'square',size:300,layout:'standard',count:4,nx:2,ny:2,spacingX:900,spacingY:900,length:12,cutoff:500,embed:75,offsetX:0,offsetY:0};
/** Version 1 stored input (pedestal box + single end-hook flag) → version 2. */
function migrateElementInput(raw:unknown):unknown{
 if(!raw||typeof raw!=='object')return raw;
 if((raw as any).version===1)return migrateGround(migrateFootingSite(migrateFootingSlab(migrateShapes(migrateV2Column(migrateV2Foundation(migrateV1(raw)))))));
 return migrateGround(migrateFootingSite(migrateFootingSlab(migrateShapes(migrateV2Column(migrateV2Foundation(raw))))));
}
/** Slabs / beams saved before the on-ground option → elevated (same quantities); beams → single span. */
function migrateGround(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Slab'&&raw.category!=='Beam'||'ground' in raw)return raw;
 const v={...structuredClone(raw),ground:structuredClone(DEFAULT_GROUND)};
 if(raw.category==='Beam'){v.layout??='single';v.grids??=[];v.spans??=[];}
 return v;
}
/** Footings saved before reference levels / sub-base layers → levels off, no sand / sheet / compaction (same quantities). */
function migrateFootingSite(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Foundation'||'levels' in raw&&'subbase' in raw&&'extraColumns' in raw)return raw;
 const v=structuredClone(raw);v.levels??={...DEFAULT_FOOTING_LEVELS};v.subbase??=structuredClone(DEFAULT_FOOTING_SUBBASE);v.extraColumns??=[];return v;
}
/** Footings saved before the slab-cast option / side loops → both off (same bars). */
function migrateFootingSlab(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Foundation'||!raw.rebar||'slab' in raw&&'side' in raw.rebar&&'sideBars' in raw.rebar)return raw;
 const v=structuredClone(raw);v.slab??={...DEFAULT_FOOTING_SLAB};v.rebar.side??={...DEFAULT_FOOTING_SIDE};v.rebar.sideBars??={...DEFAULT_FOOTING_SIDE_BARS};return v;
}
/** Footing `bend` (none/standard/custom), beam `endHook` and unshaped slab/wall layers → BS 8666 shape codes (same bars). */
function migrateShapes(raw:any):unknown{
 if(raw?.version!==2||!raw.rebar)return raw;
 const keys=({Foundation:['bottomX','bottomY','topX','topY'],Slab:['bottomX','bottomY','topX','topY'],Beam:['top','bottom'],Wall:['vertical','horizontal']} as Record<string,string[]>)[raw.category];
 if(!keys||keys.every(k=>!raw.rebar[k]||'shape' in raw.rebar[k])&&!('endHook' in raw.rebar))return raw;
 const v=structuredClone(raw),hook=v.rebar.endHook;delete v.rebar.endHook;
 for(const k of keys){const l=v.rebar[k];if(!l||'shape' in l)continue;
  const shape=raw.category==='Beam'?(hook===false?'00':'21'):'bend' in l?(l.bend==='none'?'00':'21'):'00';
  v.rebar[k]={...l,shape,leg:'bend' in l&&l.bend==='custom'?l.leg??0:0,radius:0};delete v.rebar[k].bend;}
 return v;
}
/** Early v2 column: single `lap` flag and uniform tie spacing → end conditions and tie zones (same bars). */
function migrateV2Column(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Column'||!raw.rebar)return raw;
 let v=raw;
 if('top' in raw.rebar){
  // drop the former crank up/down choice (the crank now always starts at the joint level)
  if('crank' in (raw.rebar.top||{})||'crank' in (raw.rebar.bottom||{})){v=structuredClone(raw);for(const end of ['top','bottom'])if(v.rebar[end])delete v.rebar[end].crank;}
 }else{
  v=structuredClone(raw);const {lap,...rebar}=v.rebar,s=rebar.tie?.spacing??150;
  v.rebar={...rebar,tie:{diameter:rebar.tie?.diameter??9,spacing:s,lower:{length:0,spacing:s},upper:{length:0,spacing:s}},bottom:{mode:'none',lap:0},top:{mode:lap?'lap':'none',lap:0}};
 }
 // total main-bar count → corner + per-face counts (same distribution as before)
 const mn=v.rebar.main;
 if(mn&&!('corner' in mn)){if(v===raw)v=structuredClone(raw);const d=mn.diameter??20,s=splitMainCount(mn.count??8,v.width??400,v.depth??400);v.rebar.main={corner:{diameter:d,count:1},sideX:{diameter:d,count:s.x},sideY:{diameter:d,count:s.y},diameter:d,count:mn.count??8};}
 // ties without set 2 → no supplementary ties (same bars)
 const t=v.rebar.tie;
 if(t&&!('inner' in t)){if(v===raw)v=structuredClone(raw);const u=v.rebar.tie,z=(s:number|undefined)=>({pattern:'none',spacing:s??u.spacing??150});u.inner={diameter:u.diameter??9,lower:z(u.lower?.spacing),middle:z(u.spacing),upper:z(u.upper?.spacing)};}
 return v;
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

/** `spec` = project spec: detailing defaults (bends, laps, grade) follow the project's General Spec. */
export function defaultElementInput(category:InputCategory,mode:'manual'|'drawing'='manual',spec?:Spec):ElementInput{
 const common={version:ELEMENT_INPUT_VERSION,mode,detailing:spec?detailingFromSpec(spec,{...DEFAULT_DETAILING}):{...DEFAULT_DETAILING}};
 switch(category){
  case 'Foundation':return {...common,category,foundationType:'spread',shape:'rect',diameter:2400,chamfer:0,armX:800,armY:800,width:2400,length:2400,thickness:600,pile:structuredClone(DEFAULT_PILE),excavation:{depth:1500,workingSpace:300,slope:0},lean:{thickness:50,projection:100},cover:{bottom:75,top:50,side:75},rebar:{bottomX:{diameter:16,spacing:150,shape:'21',leg:0,radius:0},bottomY:{diameter:16,spacing:150,shape:'21',leg:0,radius:0},topX:{enabled:false,diameter:12,spacing:200,shape:'00',leg:0,radius:0},topY:{enabled:false,diameter:12,spacing:200,shape:'00',leg:0,radius:0},side:{...DEFAULT_FOOTING_SIDE},sideBars:{...DEFAULT_FOOTING_SIDE_BARS}},slab:{...DEFAULT_FOOTING_SLAB},column:structuredClone(DEFAULT_FOOTING_COLUMN),extraColumns:[],levels:{...DEFAULT_FOOTING_LEVELS},subbase:structuredClone(DEFAULT_FOOTING_SUBBASE)};
  case 'Column':return {...common,category,shape:'rect',width:400,depth:400,diameter:400,height:3000,cover:{side:40},rebar:{main:{corner:{diameter:20,count:1},sideX:{diameter:20,count:1},sideY:{diameter:20,count:1},diameter:20,count:8},tie:{diameter:9,spacing:150,lower:{length:600,spacing:100},upper:{length:600,spacing:100},inner:{diameter:9,lower:{pattern:'auto',spacing:100},middle:{pattern:'auto',spacing:150},upper:{pattern:'auto',spacing:100}}},bottom:{mode:'none',lap:0},top:{mode:'lap',lap:0}}};
  case 'Beam':return {...common,category,width:300,depth:600,length:6000,cover:{top:40,bottom:40,side:40},rebar:{top:{count:2,diameter:16,shape:'21',leg:0,radius:0},bottom:{count:3,diameter:16,shape:'21',leg:0,radius:0},stirrup:{diameter:9,spacing:150}},layout:'single',grids:[],spans:[],ground:structuredClone(DEFAULT_GROUND)};
  case 'Slab':return {...common,category,lengthX:6000,lengthY:4000,thickness:150,ground:structuredClone(DEFAULT_GROUND),cover:{top:25,bottom:25,edge:25},rebar:{bottomX:{diameter:12,spacing:200,shape:'00',leg:0,radius:0},bottomY:{diameter:12,spacing:200,shape:'00',leg:0,radius:0},topX:{enabled:false,diameter:12,spacing:200,shape:'00',leg:0,radius:0},topY:{enabled:false,diameter:12,spacing:200,shape:'00',leg:0,radius:0}}};
  case 'Wall':return {...common,category,length:6000,thickness:200,height:3000,cover:{face:30,edge:30},rebar:{layers:2,vertical:{diameter:12,spacing:200,shape:'00',leg:0,radius:0},horizontal:{diameter:12,spacing:200,shape:'00',leg:0,radius:0},lap:true}};
 }
}

const shapedLabels:Record<string,string>={bottomX:'เหล็กล่างทิศ X',bottomY:'เหล็กล่างทิศ Y',topX:'เหล็กบนทิศ X',topY:'เหล็กบนทิศ Y',top:'เหล็กบน',bottom:'เหล็กล่าง',vertical:'เหล็กแนวตั้ง',horizontal:'เหล็กแนวนอน'};
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
   const cols=footingColumns(input),many=cols.length>1;
   for(const [ci,col] of cols.entries()){
    const kind=many?footingColumnName(col,ci,true):col.type==='pedestal'?'เสาตอม่อ':'Starter bar',{w,d}=columnExtent(col);
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
   // columns must not overlap each other
   const ext2=footingExtent(input),rects=cols.map(c=>{const {w,d}=columnExtent(c),x0=(ext2.w-w)/2+c.offsetX,y0=(ext2.d-d)/2+c.offsetY;return columnBoxes(c).map(b=>({x0:x0+b.x0,x1:x0+b.x1,y0:y0+b.y0,y1:y0+b.y1}));});
   for(let a=0;a<rects.length;a++)for(let b=a+1;b<rects.length;b++)if(rects[a].some(r=>rects[b].some(q=>Math.min(r.x1,q.x1)-Math.max(r.x0,q.x0)>1&&Math.min(r.y1,q.y1)-Math.max(r.y0,q.y0)>1)))p.push(`${footingColumnName(cols[a],a,true)} และ ${footingColumnName(cols[b],b,true)} ซ้อนกัน · ปรับระยะเยื้อง`);
   if(input.rebar.side.enabled)layer(input.rebar.side,'เหล็กรอบข้าง (LOOPS)');
   if(input.rebar.sideBars.enabled){layer(input.rebar.sideBars,'เหล็กแนวตั้งผิวข้าง');if(input.shape==='circle')p.push('เหล็กแนวตั้งผิวข้าง: ฐานกลมยังไม่รองรับ');}
   if(input.slab.enabled){need(input.slab.thickness,'ความหนาพื้นที่หล่อรวมกับฐาน');if(input.shape!=='rect')p.push('ฐานหล่อรวมพื้น: รองรับแปลนสี่เหลี่ยมเท่านั้น');if(input.slab.thickness>=input.thickness)p.push('ความหนาพื้นต้องน้อยกว่าความหนาฐาน');}
   const earth=footingEarth(input);
   if(input.subbase.sand.enabled)need(input.subbase.sand.thickness,'ความหนาทรายรองพื้น');
   if(input.levels.enabled&&input.levels.top>input.levels.ground)p.push('ระดับหลังฐานรากสูงกว่าระดับดินเดิม · ตรวจระดับอ้างอิง');
   else if(earth.depth>0&&earth.depth<input.thickness+earth.below)p.push(`ความลึกงานขุดน้อยกว่าความหนาฐานราก + Lean${earth.sand?' + ทราย':''}`);
   break;}
  case 'Column':{
   if(input.shape==='rect'){need(input.width,'ความกว้างเสา (X)');need(input.depth,'ความลึกเสา (Y)');fits(Math.min(input.width,input.depth),input.cover.side,input.cover.side,'หน้าตัดเสา');}
   else{need(input.diameter,'เส้นผ่านศูนย์กลางเสา');fits(input.diameter,input.cover.side,input.cover.side,'หน้าตัดเสา');}
   need(input.height,'ความสูงเสา');need(input.cover.side,'cover');
   const mb=input.rebar.main;
   if(input.shape==='circle'){need(mb.diameter,'ขนาดเหล็กยืน');if(mb.count<6)p.push('เหล็กยืนอย่างน้อย 6 เส้น');}
   else{
    need(mb.corner.diameter,'ขนาดเหล็กมุม');if(mb.sideX.count>0)need(mb.sideX.diameter,'ขนาดเหล็กด้าน X');if(mb.sideY.count>0)need(mb.sideY.diameter,'ขนาดเหล็กด้าน Y');
    const dmax=columnMainMax(input),thin=Math.min(input.width,input.depth)/2-input.cover.side-input.rebar.tie.diameter-dmax*(mb.corner.count>1?1.5:.5);
    if(input.width>0&&input.depth>0&&thin<=0)p.push('หน้าตัดเสาเล็กเกินไปสำหรับ cover และเหล็ก');
    else if(input.width>0&&input.depth>0){const bars=columnInputBars(input),gap=Math.min(Infinity,...bars.flatMap((a,k)=>bars.slice(k+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y)-(a.d+b.d)/2)));if(gap<-.5)p.push('เหล็กยืนซ้อนกัน ลดจำนวนหรือขนาดเหล็ก');}
   }
   const t=input.rebar.tie;need(t.diameter,'ขนาดเหล็กปลอก');
   if(t.lower.length>0)need(t.lower.spacing,'ระยะห่างปลอกโซนล่าง');if(t.upper.length>0)need(t.upper.spacing,'ระยะห่างปลอกโซนบน');
   if(input.height-t.lower.length-t.upper.length>0)need(t.spacing,'ระยะห่างปลอกโซนกลาง');
   if(input.height>0&&t.lower.length+t.upper.length>input.height)p.push('ความยาวปลอกโซนล่าง + โซนบน เกินความสูงเสา');
   if(input.shape==='rect'){
    const used=tieZoneKeys.filter(([k])=>(k==='middle'||t[k].length>0)&&t.inner[k].pattern!=='none');
    if(used.length)need(t.inner.diameter,'ขนาดเหล็กปลอกชุดที่ 2');
    for(const [k,label] of used)need(t.inner[k].spacing,`ระยะห่างปลอกชุดที่ 2 ${label}`);
   }
   break;}
  case 'Beam':{
   need(input.cover.top,'cover ด้านบน');need(input.cover.bottom,'cover ด้านล่าง');need(input.cover.side,'cover ด้านข้าง');
   if(input.layout==='group'){
    const sp=input.spans,gr=input.grids;
    if(!sp.length){p.push('เพิ่มช่วงคานอย่างน้อย 1 ช่วง');break;}
    if(gr.length!==sp.length+1)p.push('จำนวนกริดต้องเท่ากับจำนวนช่วง + 1');
    sp.forEach((s,k)=>{const nm=`${s.mark} ช่วงที่ ${k+1}`;need(s.length,`${nm}: ความยาว`);need(s.width,`${nm}: ความกว้าง`);need(s.depth,`${nm}: ความลึก`);
     fits(s.depth,input.cover.top,input.cover.bottom,`${nm}: ความลึก`);fits(s.width,input.cover.side,input.cover.side,`${nm}: ความกว้าง`);
     if(s.rebar.top.count<1&&s.rebar.bottom.count<1)p.push(`${nm}: ระบุเหล็กบนหรือเหล็กล่าง`);
     if(s.rebar.top.count>0)need(s.rebar.top.diameter,`${nm}: ขนาดเหล็กบน`);if(s.rebar.bottom.count>0)need(s.rebar.bottom.diameter,`${nm}: ขนาดเหล็กล่าง`);
     need(s.rebar.stirrup.diameter,`${nm}: ขนาดเหล็กปลอก`);need(s.rebar.stirrup.spacing,`${nm}: ระยะปลอก`);
     if(s.kind==='cantilever'){if(k!==0&&k!==sp.length-1)p.push(`${nm}: ช่วงยื่นต้องเป็นช่วงแรกหรือช่วงสุดท้าย`);else if(sp.length===1)p.push(`${nm}: ช่วงยื่นต้องมีช่วงหลังยึด`);else{const tip=k===0?gr[0]:gr[k+1];if(tip&&tip.support>0)p.push(`${nm}: ปลายช่วงยื่นต้องไม่มีเสา (กว้างเสา 0)`);}}
     const sl=(gr[k]?.support||0)/2,sr=(gr[k+1]?.support||0)/2;if(s.length>0&&s.length-sl-sr<=100)p.push(`${nm}: ช่วงสุทธิระหว่างผิวเสาสั้นเกินไป`);});
    gr.forEach((g,k)=>{if(g.extraTop.count>0)need(g.extraTop.diameter,`กริด ${g.label||k+1}: ขนาดเหล็กเสริมบน`);});
    break;}
   need(input.width,'ความกว้างคาน');need(input.depth,'ความลึกคาน');need(input.length,'ความยาวคาน');
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
 // Shape code 12 is the 90° bend with a specified (non-standard) radius R
 for(const [key,l] of Object.entries(input.rebar) as [string,any][])if(l&&typeof l==='object'&&l.shape==='12'&&l.enabled!==false&&(l.count===undefined||l.count>0))need(l.radius,`รัศมีดัด R (Shape 12) ${shapedLabels[key]||key}`);
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

/** Closed rectangular link in the plane of axes u/v at `at` on axis w, closed at the
 * first corner with two 90° hooks wrapped around the corner bar. Each hook leg runs
 * along the adjacent side, one bar diameter `d` inside it so the ends do not coincide. */
function link(u:number,v:number,w:number,u0:number,u1:number,v0:number,v1:number,at:number,ext:number,rad:number,d:number):V3[]{
 const p=(a:number,b:number):V3=>{const r:V3=[0,0,0];r[u]=a;r[v]=b;r[w]=at;return r;};
 // `ext` is the straight extension after the 90° bend; add the bend tangent length.
 const k=Math.min(ext+rad,u1-u0,v1-v0);
 return [p(u0+d,v0+k),p(u0,v0),p(u1,v0),p(u1,v1),p(u0,v1),p(u0,v0),p(u0+k,v0+d)];
}
/** Closed polygonal link (CCW vertices, plan) closed at vertex 0 with two hooks bent along
 * the adjacent edges, one bar diameter `d` inside them. */
function polyLink(poly:Pt[],ext:number,rad:number,d:number):Pt[]{
 const p0=poly[0],p1=poly[1],pl=poly.at(-1)!,len=(a:Pt,b:Pt)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
 const dir=(a:Pt,b:Pt):Pt=>{const l=len(a,b)||1;return [(b[0]-a[0])/l,(b[1]-a[1])/l];};
 const e1=dir(p0,p1),e0=dir(p0,pl),turn=Math.PI-Math.acos(Math.max(-1,Math.min(1,e0[0]*e1[0]+e0[1]*e1[1])));
 const trim=rad*Math.tan(turn/2),k=Math.max(trim+1,Math.min(ext+trim,Math.min(len(p0,p1),len(p0,pl))-rad));
 return [[p0[0]+e0[0]*k+e0[1]*d,p0[1]+e0[1]*k-e0[0]*d],...poly,p0,[p0[0]+e1[0]*k-e1[1]*d,p0[1]+e1[1]*k+e1[0]*d]];
}
/** Intermediate bars of one face that need lateral support (ACI 318 25.7.2.3): every bar
 * farther than 150 mm clear from a supported bar; corners (lo / hi) are supported. */
function needSupport(list:number[],lo:number,hi:number,dm:number){
 const out:number[]=[],ok=(a:number,b:number)=>Math.abs(b-a)-dm<=150+1e-6;let last=lo;
 for(let k=0;k<list.length;k++){
  const p=list[k];if(ok(last,p))continue;
  if(k===list.length-1&&ok(p,hi))continue;
  if(k+1<list.length&&ok(p,list[k+1])){out.push(list[k+1]);last=list[k+1];k++;continue;}
  out.push(p);last=p;
 }
 return out;
}
export type TiePiece={kind:'cross'|'closed';pts:Pt[]};
/** Plan of one tie level of a rectangular column (local mm): main bars, the perimeter hoop
 * (set 1, 90° hooks around a corner bar) and the set-2 pieces of `pattern`. Cross ties have a
 * 135° hook at one end and a 90° hook at the other; closed inner ties have 90° hooks. */
export function columnTieLayout(i:ColumnInput,pattern:TiePattern,det:Detailing){
 const c=i.cover.side,dm=columnMainMax(i),dt=i.rebar.tie.diameter,di=i.rebar.tie.inner.diameter||dt,W=i.width,D=i.depth;
 const a=c+dt+i.rebar.main.corner.diameter/2,x0=a,x1=W-a,y0=a,y1=D-a,bars=columnInputBars(i);
 const pick=(kind:ColumnBarPos['kind'],low:boolean)=>bars.filter(b=>b.kind===kind&&(kind==='sideX'?b.y<D/2:b.x<W/2)===low).map(b=>kind==='sideX'?b.x:b.y).sort((p,q)=>p-q);
 const f={bottom:pick('sideX',true),top:pick('sideX',false),left:pick('sideY',true),right:pick('sideY',false)};
 const tc=c+dt/2,R=radius(di,det,true),rr=(dm+di)/2,ext90=det.hook90*di,ext135=Math.max(det.hook135*di,det.hook135Min);
 const hoop=link(0,1,2,tc,W-tc,tc,D-tc,0,det.hook90*dt,radius(dt,det,true),dt).map(p=>[p[0],p[1]] as Pt);
 const pieces:TiePiece[]=[],issues:string[]=[];
 const same=(p:number,q:number)=>Math.abs(p-q)<1,has=(l:number[],p:number)=>l.some(q=>same(p,q));
 const union=(l:number[],m:number[])=>[...l,...m.filter(p=>!has(l,p))].sort((p,q)=>p-q);
 // cross tie along X (axis 0, at y = pos) or Y (axis 1, at x = pos); hooks turn toward the core
 const cross=(axis:0|1,pos:number)=>{
  // ends reach the hoop line (0.5 mm inside it so the sampled hook arcs keep the cover)
  const e=(axis===0?W:D)-tc-.5,s=pos<=(axis===0?D:W)/2?1:-1,v=pos-s*R,k=(ext135+R*(1+Math.SQRT2))/Math.SQRT2,st=tc+.5-Math.SQRT2*R;
  const local:Pt[]=[[st+k,v+s*k],[st,v],[e,v],[e,v+s*(ext90+R)]];
  pieces.push({kind:'cross',pts:axis===0?local:local.map(([u,w])=>[w,u] as Pt)});
 };
 // supports the wanted bars that have a partner on the opposite face
 const crossAll=(axis:0|1,want:number[])=>{
  const [p,q]=axis===0?[f.left,f.right]:[f.bottom,f.top],ok=want.filter(v=>has(p,v)&&has(q,v));
  if(ok.length<want.length)issues.push(`เหล็กรัดขวางแนว ${axis===0?'X':'Y'}: เหล็ก ${want.length-ok.length} เส้นไม่มีเหล็กตรงข้าม (จำนวนเหล็กสองด้านไม่เท่ากัน)`);
  ok.forEach(v=>cross(axis,v));
 };
 const closed=(poly:Pt[])=>pieces.push({kind:'closed',pts:polyLink(inset(poly,-rr),ext90,R,di)});
 const lr=union(f.left,f.right),bt=union(f.bottom,f.top),mid=(l:number[])=>l.length%2?l[(l.length-1)/2]:undefined,alt=(l:number[])=>l.filter((_,k)=>k%2===1);
 const rect=(axis:0|1,p:number,q:number)=>closed(axis===0?[[x0,p],[x1,p],[x1,q],[x0,q]]:[[p,y0],[q,y0],[q,y1],[p,y1]]);
 const rects=(axis:0|1,skip:number[]=[])=>{
  const l=(axis===0?f.left:f.bottom).filter(v=>has(axis===0?f.right:f.top,v)&&!has(skip,v));
  for(let k=0;k+1<l.length;k+=2)rect(axis,l[k],l[k+1]);
  if(l.length%2)cross(axis,l.at(-1)!);
 };
 // chain of near-square hoops along `axis` overlapping by one bar row; rows not on a hoop leg get cross ties
 const overlap=(axis:0|1)=>{
  const cols=(axis===0?f.bottom:f.left).filter(v=>has(axis===0?f.top:f.right,v)),[lo,hi]=axis===0?[x0,x1]:[y0,y1],P=[lo,...cols,hi];
  const n=Math.max(2,Math.round((hi-lo)/((axis===0?y1-y0:x1-x0)||1)));
  if(cols.length<2){issues.push(`ต้องมีเหล็กกลางด้าน${axis===0?' X':' Y'} อย่างน้อย 2 เส้น`);return;}
  const near=(z:number)=>P.reduce((best,v,k)=>Math.abs(v-z)<Math.abs(P[best]-z)?k:best,0),legs:number[]=[];
  let prev=-1;
  for(let k=0;k<n;k++){
   const s=k===0?0:Math.max(prev-1,near(lo+(hi-lo)*k/n)),e=k===n-1?P.length-1:Math.min(P.length-1,Math.max(s+1,near(lo+(hi-lo)*(k+1)/n)+1));
   if(e<=s||e===prev)continue;
   const sq:Pt[]=axis===0?[[P[s],y0],[P[e],y0],[P[e],y1],[P[s],y1]]:[[x0,P[s]],[x1,P[s]],[x1,P[e]],[x0,P[e]]];closed(sq);legs.push(P[s],P[e]);prev=e;
   if(e===P.length-1)break;
  }
  crossAll(axis===0?1:0,cols.filter(v=>!has(legs,v)));
  const [p,q,a0,a1]=(axis===0?[f.left,f.right,y0,y1]:[f.bottom,f.top,x0,x1]) as [number[],number[],number,number];
  crossAll(axis,union(needSupport(p,a0,a1,dm),needSupport(q,a0,a1,dm)));
 };
 switch(pattern){
  case 'none':break;
  case 'auto':crossAll(0,union(needSupport(f.left,y0,y1,dm),needSupport(f.right,y0,y1,dm)));crossAll(1,union(needSupport(f.bottom,x0,x1,dm),needSupport(f.top,x0,x1,dm)));break;
  case 'crossX':crossAll(0,lr);break;
  case 'crossY':crossAll(1,bt);break;
  case 'crossXY':crossAll(0,lr);crossAll(1,bt);break;
  case 'crossAlt':crossAll(0,union(alt(f.left),alt(f.right)));crossAll(1,union(alt(f.bottom),alt(f.top)));break;
  case 'diamond':case 'diamondCross':case 'diamondRect':{
   const m=[mid(f.bottom),mid(f.right),mid(f.top),mid(f.left)];
   if(m.some(v=>v===undefined)){issues.push('ต้องมีเหล็กกึ่งกลางทุกด้าน (จำนวนเหล็กกลางด้านเป็นเลขคี่ทุกด้าน)');break;}
   const [mb,mr,mt,ml]=m as number[];closed([[mb,y0],[x1,mr],[mt,y1],[x0,ml]]);
   if(pattern==='diamondCross'){crossAll(0,lr.filter(v=>!same(v,ml)&&!same(v,mr)));crossAll(1,bt.filter(v=>!same(v,mb)&&!same(v,mt)));}
   if(pattern==='diamondRect'){rects(0,[ml,mr]);rects(1,[mb,mt]);}
   break;}
  case 'rectX':rects(0);break;
  case 'rectY':rects(1);break;
  case 'rectXY':rects(0);rects(1);break;
  case 'rectCross':{const long:0|1=W>=D?0:1;rects(long);crossAll(long===0?1:0,long===0?bt:lr);break;}
  case 'overlapX':overlap(0);break;
  case 'overlapY':overlap(1);break;
  case 'octagon':{
   if(!f.bottom.length||!f.top.length||!f.left.length||!f.right.length){issues.push('ต้องมีเหล็กกลางด้านทุกด้าน');break;}
   const raw:Pt[]=[[f.bottom[0],y0],[f.bottom.at(-1)!,y0],[x1,f.right[0]],[x1,f.right.at(-1)!],[f.top.at(-1)!,y1],[f.top[0],y1],[x0,f.left.at(-1)!],[x0,f.left[0]]];
   closed(raw.filter((p,k)=>{const q=raw[(k+1)%raw.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>=1;}));
   break;}
 }
 const note=!pieces.length&&!issues.length&&pattern!=='none'?(pattern==='auto'?'ไม่ต้องเพิ่ม: เหล็กทุกเส้นห่างจากเหล็กที่ถูกยึดไม่เกิน 150 mm':'ไม่มีเหล็กกลางด้านที่ใช้รูปแบบนี้ได้'):'';
 return {W,D,dm,dt,di,R,bars,hoop,hoopRadius:radius(dt,det,true),pieces,issues,note};
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
const signedArea=(p:Pt[])=>p.reduce((n,q,i)=>{const r=p[(i+1)%p.length];return n+q[0]*r[1]-r[0]*q[1];},0)/2;
const polygonArea=(p:Pt[])=>Math.abs(signedArea(p));
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
function columnBarPositions(col:FootingColumn,base:number,symmetric=false):ColumnBarPos[]{
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
  // symmetric: side bars keep the same clearance from both corner bundles so opposite faces line up
  const start=nc>=2?dc:0,end=nc>=3||symmetric&&nc>=2?dc:0,span=len-start-end;
  const n=col.shape==='rect'?side.count:Math.max(0,Math.ceil(Hypot(corner[i],corner[j])/m.spacing-1e-9)-1);
  for(let k=1;k<=n;k++){const t=start+span*k/(n+1);out.push({x:a[0]+e[0]*t,y:a[1]+e[1]*t,d:ds,kind:alongX?'sideX':'sideY'});}
 });
 return out;
}
const Hypot=(a:[number,number],b:[number,number])=>Math.hypot(b[0]-a[0],b[1]-a[1]);
/** Special column sections (typical large / wall-like columns): bars Y32 with 2-bar corner
 * bundles, ties Y12 @200 (@100 in the end zones) and the set-2 pattern used in the reference details. */
export const columnPresets=[
 {id:'700x700',label:'700 × 700 · 32-DB32 · ปลอก DB12@200 (@100) · ปลอกใน #',w:700,d:700,sx:6,sy:6,pattern:'rectXY'},
 {id:'800x800',label:'800 × 800 · 36-DB32 · ปลอก DB12@200 (@100) · ปลอกใน #',w:800,d:800,sx:7,sy:7,pattern:'rectXY'},
 {id:'2200x700',label:'2200 × 700 · 76-DB32 · ปลอก DB12@200 (@100) · ปลอกซ้อนต่อเนื่อง',w:2200,d:700,sx:27,sy:7,pattern:'overlapX'},
 {id:'2200x800',label:'2200 × 800 · 82-DB32 · ปลอก DB12@200 (@100) · ปลอกแนวยาว + รัดขวาง',w:2200,d:800,sx:29,sy:8,pattern:'rectCross'},
] as const satisfies readonly {id:string;label:string;w:number;d:number;sx:number;sy:number;pattern:TiePattern}[];
export function applyColumnPreset(i:ColumnInput,id:string):ColumnInput{
 const p=columnPresets.find(x=>x.id===id);if(!p)return i;
 const v=structuredClone(i),lo=Math.ceil(Math.max(p.w,p.d,v.height/6,450)/50)*50,zone=(s:number)=>({pattern:p.pattern as TiePattern,spacing:s});
 v.shape='rect';v.width=p.w;v.depth=p.d;
 v.rebar.main={corner:{diameter:32,count:2},sideX:{diameter:32,count:p.sx},sideY:{diameter:32,count:p.sy},diameter:32,count:8+2*(p.sx+p.sy)};
 v.rebar.tie={diameter:12,spacing:200,lower:{length:lo,spacing:100},upper:{length:lo,spacing:100},inner:{diameter:12,lower:zone(100),middle:zone(200),upper:zone(100)}};
 return v;
}
/** Largest main-bar diameter of a Column input. */
export function columnMainMax(i:ColumnInput){const m=i.rebar.main;return i.shape==='circle'?m.diameter:Math.max(m.corner.diameter,m.sideX.count>0?m.sideX.diameter:0,m.sideY.count>0?m.sideY.diameter:0);}
/** Main bar centres of a Column input (same rules as the footing pedestal: corner bundles,
 * side bars evenly spaced between them; circle = ring). */
export function columnInputBars(i:ColumnInput):ColumnBarPos[]{
 const dt=i.rebar.tie.diameter,col:FootingColumn={...DEFAULT_FOOTING_COLUMN,type:'pedestal',shape:i.shape,width:i.width,depth:i.depth,diameter:i.diameter,cover:i.cover.side,main:{...i.rebar.main,spacing:200},tie:{diameter:dt,spacing:i.rebar.tie.spacing}};
 return columnBarPositions(col,i.cover.side+dt,true);
}
/** Section outline and main bar centres for the input preview (local mm). */
export function columnSectionPreview(col:FootingColumn){
 const {w,d}=columnExtent(col),base=col.cover+(col.type==='pedestal'?col.tie.diameter:0),dm=maxMainDiameter(col);
 return {w,d,outline:col.shape==='circle'?undefined:outline(col),bars:w>2*base+dm&&d>2*base+dm?columnBarPositions(col,base):[]};
}
/** Leg length of a 90° end bend: standard = hook90·d straight extension + bend radius. */
const bendLeg=(mode:'none'|'standard'|'custom',leg:number,d:number,det:Detailing)=>mode==='none'?0:mode==='custom'?leg:det.hook90*d+radius(d,det);
type Shaped={diameter:number;shape:LayerShape;leg:number;radius:number};
type Pt2=[number,number];
const codeOfEnds:Record<string,string>={'straight+straight':'00','bend+straight':'11','hook+straight':'13','bend+bend':'21','bend+hook':'22','hook+hook':'99','return+return':'41'};
/** Standard leg of a 90° bend and standard straight extension after a 180° hook for bar size d. */
export function shapeDefaults(d:number,det:Detailing,radiusR=0){const rad=radiusR>0?radiusR+d/2:radius(d,det);return {bend:det.hook90*d+rad,hookTail:Math.max(5*d,90),hookOutside:2*rad+d,ret:15*d};}
/** BS 8666 end shapes for a straight run a→b (local axis u) at level w0. Bends/hooks turn toward `dir` in w and
 * must stay within `room` of w0 (centreline). Ends that do not fit fall back to straight and the shape code
 * follows the ends actually built (e.g. 21 → 11 / 00). */
function shapedEnds(l:Shaped,det:Detailing,dir:1|-1,room:number,note:string,warn:(s:string)=>void){
 const d=l.diameter,info=layerShapes.find(s=>s.code===l.shape)||layerShapes[0],special=l.shape==='12'&&l.radius>0;
 const rad=special?l.radius+d/2:radius(d,det),std=shapeDefaults(d,det,special?l.radius:0),hookH=2*rad;
 const bendWant=l.leg>0?l.leg:std.bend,hookTail=l.leg>0?l.leg:std.hookTail,ret=l.leg>0?l.leg:std.ret;
 let warned=false;const once=(s:string)=>{if(!warned)warn(s);warned=true;};
 // each end: h = rise toward `dir` (centreline), t = inward tail along the run at that height
 type End={kind:BarEnd;h:number;t:number};
 const straight:End={kind:'straight',h:0,t:0};
 const bend=(want:number):End=>{const leg=Math.min(want,room);if(leg<=rad*1.5){once(`${note}: ความหนาไม่พอสำหรับขางอ ใช้ปลายตรง`);return straight;}
  if(leg+.5<want)once(`${note}: ขางอถูกจำกัดเป็น ${Math.round(leg)} mm ตามความหนา − cover`);return {kind:'bend',h:leg,t:0};};
 const ends=info.ends.map((kind:BarEnd):End=>{
  if(kind==='bend')return bend(bendWant);
  if(kind==='hook'){if(hookH>room+1e-6){once(`${note}: ความหนาไม่พอสำหรับขอ 180° (ต้องการ ${Math.round(hookH+d)} mm) ใช้ปลายตรง`);return straight;}return {kind:'hook',h:hookH,t:rad+hookTail};}
  if(kind==='return'){if(room<2*rad+d||ret<=rad*1.5){once(`${note}: ความลึกไม่พอสำหรับตัว U งอเข้าใน ใช้ขางอ`);return bend(room);}return {kind:'return',h:room,t:ret};}
  return straight;
 });
 const key=ends.map(e=>e.kind).sort().join('+'),code=key==='bend+straight'&&special?'12':codeOfEnds[key]||'99',shaped=code!=='00';
 const minRun=2*d+ends.reduce((s,e)=>s+(e.kind==='bend'?1.5*rad:e.t>0?e.t+rad:0),0);
 const tip=(x:number,e:End,inward:1|-1,w0:number):Pt2[]=>e.t>0?[[x+inward*e.t,w0+dir*e.h],[x,w0+dir*e.h]]:e.h>0?[[x,w0+dir*e.h]]:[];
 const points=(a:number,b:number,w0:number):Pt2[]=>[...tip(a,ends[0],1,w0),[a,w0],[b,w0],...tip(b,ends[1],-1,w0).reverse()];
 // centreline length: polyline minus (2 − π/2)·r per 90° corner (hook / U return = two corners)
 const corners=ends.reduce((s,e)=>s+(e.kind==='bend'?1:e.t>0?2:0),0);
 const length=(ps:Pt2[])=>ps.slice(1).reduce((s,p,k)=>s+Math.hypot(p[0]-ps[k][0],p[1]-ps[k][1]),0)-corners*(2-Math.PI/2)*rad;
 const parts=ends.filter(e=>e.kind!=='straight').map(e=>e.kind==='bend'?`งอฉาก ${Math.round(e.h)} mm`:e.kind==='hook'?`ขอ 180° B ${Math.round(hookH+d)} mm`:`ขาสูง ${Math.round(e.h+d/2)} + งอเข้าใน ${Math.round(e.t+d/2)} mm`);
 return {code,radius:shaped?rad:0,minRun,points,length,suffix:shaped?` · Shape ${code} · ${[...new Set(parts)].join(' / ')}`:''};
}

/** Slab-cast option is active (rectangular footing deeper than the slab). */
export const footingSlabOn=(i:FoundationInput)=>i.slab.enabled&&i.shape==='rect'&&i.slab.thickness>0&&i.slab.thickness<i.thickness;
/** Reference slab around a slab-cast footing (4 strips, not quantified) so top bars may run into it. */
function footingSlabRegions(i:FoundationInput,X:number,Y:number){
 const T=i.thickness,ts=i.slab.thickness,E=i.slab.extend+300,z=T-ts,ref=`พื้นหล่อเป็นเนื้อเดียวกับฐาน หนา ${ts} mm · พื้นที่อ้างอิง ไม่คิดคอนกรีต/เหล็กพื้น`,c=i.cover.top;
 return [
  {id:'genslab-s',label:'พื้น (อ้างอิง) ด้าน Y−',origin:[-E,-E,z] as V3,size:[X+2*E,E,ts] as V3},{id:'genslab-n',label:'พื้น (อ้างอิง) ด้าน Y+',origin:[-E,Y,z] as V3,size:[X+2*E,E,ts] as V3},
  {id:'genslab-w',label:'พื้น (อ้างอิง) ด้าน X−',origin:[-E,0,z] as V3,size:[E,Y,ts] as V3},{id:'genslab-e',label:'พื้น (อ้างอิง) ด้าน X+',origin:[X,0,z] as V3,size:[E,Y,ts] as V3},
 ].map(r=>({...r,reference:ref,cover:c,openings:[]}));
}
function foundationBars(i:FoundationInput,det:Detailing,rounding:number,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],{thickness:T,cover:c,rebar:r}=i,g=det.mainGrade,{w:X,d:Y}=footingExtent(i),plan=footingOutline(i);
 // Bars run between the faces of the actual plan shape (cover + d/2 inside). Bars of equal
 // geometry are one Mark; non-rectangular shapes give one Mark per bar length.
 const topStack=(r.topX.enabled?r.topX.diameter:0)+(r.topY.enabled?r.topY.diameter:0),slabOn=footingSlabOn(i),ts=i.slab.thickness;
 // vertical face bars are the outermost layer: meshes and loops move inside them
 const vb=r.sideBars,sideIn=vb.enabled&&i.shape!=='circle'?vb.diameter:0;
 // below: bars of this layer stop under the other bottom layer's U returns (Shape 41 legs rise to just under the top mesh)
 const mesh=(role:string,note:string,l:Shaped&{spacing:number},runX:boolean,z:number,up:boolean,below=0)=>{
  const d=l.diameter,inner=inset(plan,c.side+sideIn+d/2),ai=runX?1:0,lo=Math.min(...inner.map(p=>p[ai])),hi=Math.max(...inner.map(p=>p[ai])),s=spread(lo,hi,l.spacing);
  if(!s){warn(`${note}: วางเหล็กไม่ได้`);return;}
  // slab-cast footing: top bars run on into the slab by `extend`; their bends/hooks must stay inside the slab thickness
  const ext=slabOn&&!up?c.side+sideIn+d/2+i.slab.extend:0;
  const room=up?(l.shape==='41'?T-c.top-topStack-below:T-c.top)-d/2-z:z-(slabOn?T-ts+c.top:c.bottom)-d/2;
  const sh=shapedEnds(l,det,up?1:-1,room,note,warn);
  const segs:{a:number;b:number;at:number}[]=[];
  for(let k=0;k<s.count;k++){const at=s.count===1?s.from:s.from+(s.to-s.from)*k/(s.count-1),pos=Math.min(hi-1e-3,Math.max(lo+1e-3,at));for(const [a,b] of lineIntervals(inner,runX?0:1,pos))if(b-a+2*ext>sh.minRun)segs.push({a:a-ext,b:b+ext,at});}
  if(ext)note+=` · ยื่นเข้าพื้น ${Math.round(i.slab.extend)} mm`;
  if(!segs.length){warn(`${note}: วางเหล็กไม่ได้ (ช่วงสั้นกว่ารูป Shape ${sh.code})`);return;}
  const pt=(along:number,at:number,zz:number):V3=>runX?[along,at,zz]:[at,along,zz];
  const shape=(sg:{a:number;b:number;at:number}):V3[]=>sh.points(sg.a,sg.b,z).map(([u,w])=>pt(u,sg.at,w));
  const base={diameter:d,grade:g,axis:(runX?'X':'Y') as Bar['axis'],face:(up?'bottom':'top') as Bar['face'],radius:sh.radius,shapeCode:sh.code},hookNote=sh.suffix;
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
 mesh('bottom-y','เหล็กล่าง · ทิศ Y',r.bottomY,false,zY,true,r.bottomX.shape==='41'?r.bottomX.diameter:0);
 if(r.topX.enabled)mesh('top-x','เหล็กบน · ทิศ X',r.topX,true,T-c.top-r.topX.diameter/2,false);
 if(r.topY.enabled)mesh('top-y','เหล็กบน · ทิศ Y',r.topY,false,T-c.top-(r.topX.enabled?r.topX.diameter:0)-r.topY.diameter/2,false);
 // Side face loops: horizontal closed loops just inside the bottom-bar legs, spaced from the bottom mesh to the top mesh
 if(r.side.enabled){
  const dl=r.side.diameter,legs=[r.bottomX,r.bottomY].some(l=>l.shape!=='00')?Math.max(r.bottomX.diameter,r.bottomY.diameter):0;
  const ring=inset(plan,c.side+sideIn+legs+dl/2),rad=radius(dl,det),sz=spread(c.bottom+r.bottomX.diameter+r.bottomY.diameter+dl/2,T-c.top-topStack-dl/2,r.side.spacing);
  if(i.shape==='circle')warn('เหล็กรอบข้าง (LOOPS): ฐานกลมยังไม่รองรับ ให้เพิ่มเองในแท็บ “แบบ & BBS”');
  else if(!sz)warn('เหล็กรอบข้าง (LOOPS): ความหนาฐานไม่พอ');
  else out.push({role:'side-loop',note:`เหล็กรอบข้าง (LOOPS) · ${sz.count} ชั้น @ ≤ ${r.side.spacing} mm`,diameter:dl,grade:g,count:sz.count,points:polyLink(ring,det.hook90*dl,rad,dl).map(([x,y])=>[x,y,sz.from] as V3),axis:'Z',face:'side',radius:rad,shapeCode:'99',distributionAxis:'Z',from:sz.from,to:sz.to});
 }
 // Vertical face bars on every face of the plan outline, ends straight or turned inward 90°.
 // One Mark: the template is copied to each position and turned to face inward (offsets + offsetTurns).
 if(sideIn){
  const dv=vb.diameter,rad=radius(dv,det),ret=vb.leg>0?vb.leg:15*dv,ring=inset(plan,c.side+dv/2),ccw=signedArea(ring)>0;
  const zb=vb.bottom==='inward'?c.bottom+r.bottomX.diameter+r.bottomY.diameter+dv/2:c.bottom+dv/2,zt=vb.top==='inward'?T-c.top-topStack-dv/2:T-c.top-dv/2;
  const pos:{p:Pt;n:Pt}[]=[];
  ring.forEach((a,k)=>{const b=ring[(k+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),s=spread(0,len,vb.spacing);if(!s||len<1)return;const u:Pt=[(b[0]-a[0])/len,(b[1]-a[1])/len],n:Pt=ccw?[-u[1],u[0]]:[u[1],-u[0]];
   for(let j=0;j<s.count-1;j++){const t=s.count===1?0:len*j/(s.count-1);pos.push({p:[a[0]+u[0]*t,a[1]+u[1]*t],n});}});
  const tooLong=ret>=Math.min(X,Y)/2-c.side;
  if(zt-zb<=2*rad)warn('เหล็กแนวตั้งผิวข้าง: ความหนาฐานไม่พอ');
  else if(!pos.length)warn('เหล็กแนวตั้งผิวข้าง: วางเหล็กไม่ได้');
  else{
   if(tooLong)warn('เหล็กแนวตั้งผิวข้าง: ระยะงอเข้าในยาวเกินครึ่งฐาน ใช้ปลายตรง');
   const inB=vb.bottom==='inward'&&!tooLong,inT=vb.top==='inward'&&!tooLong;
   const tpl=({p,n}:{p:Pt;n:Pt}):V3[]=>[...(inB?[[p[0]+n[0]*ret,p[1]+n[1]*ret,zb] as V3]:[]),[p[0],p[1],zb],[p[0],p[1],zt],...(inT?[[p[0]+n[0]*ret,p[1]+n[1]*ret,zt] as V3]:[])];
   const first=pos[0],points=tpl(first),pivot=points.at(-1)!,ang=(n:Pt)=>Math.atan2(n[1],n[0]);
   const turns=pos.map(q=>Math.round((ang(q.n)-ang(first.n))*180/Math.PI*1000)/1000);
   const offsets=pos.map(q=>{const last=tpl(q).at(-1)!;return [last[0]-pivot[0],last[1]-pivot[1],0] as V3;});
   const code=inB&&inT?'21':inB||inT?'11':'00',parts=[inB&&'ล่าง',inT&&'บน'].filter(Boolean).join('/');
   out.push({role:'side-vertical',note:`เหล็กแนวตั้งผิวข้าง @ ≤ ${vb.spacing} mm · ${pos.length} ตำแหน่งรอบฐาน${parts?` · งอเข้าใน ${Math.round(ret)} mm ที่ปลาย${parts}`:''}`,diameter:dv,grade:g,count:pos.length,points,axis:'Z',face:'side',radius:code==='00'?0:rad,shapeCode:code,offsets,turns});
  }
 }
 const cols=footingColumns(i),many=cols.length>1;
 for(const [ci,col] of cols.entries()){const sfx=ci?`-c${ci+1}`:'';
 const pedestal=col.type==='pedestal',name=many?footingColumnName(col,ci,true):col.columnNo?`${pedestal?'เสาตอม่อ':'Starter'} ${col.columnNo}`:pedestal?'เสาตอม่อ':'Starter bar';
 const {w,d:depth}=columnExtent(col),ox=(X-w)/2+col.offsetX,oy=(Y-depth)/2+col.offsetY,dt=pedestal?col.tie.diameter:0;
 const all=columnBarPositions(col,col.cover+dt).map(b=>({...b,x:ox+b.x,y:oy+b.y}));
 if(!all.length){warn(`${name}: ไม่มีตำแหน่งเหล็กยืน`);continue;}
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
  out.push({role:(groups.length>1?`column-main-${dm}`:'column-main')+sfx,note:`เหล็กยืน ${name} (${mix}) · ${parts.join(' · ')} mm`,diameter:dm,grade:g,count:pts.length,points:leg?[[x0+d0[0]*leg,y0+d0[1]*leg,zBend],[x0,y0,zBend],[x0,y0,zTop]]:[[x0,y0,zBend],[x0,y0,zTop]],axis:'Z',face:'side',radius:leg?rad:0,shapeCode:leg?'11':'00',offsets:offsetsFrom(pts),...(leg?{turns}:{})});
 }
 const minGap=Math.min(Infinity,...all.flatMap((a,i)=>all.slice(i+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y)-(a.d+b.d)/2)));
 if(minGap<-0.5)warn(`${name}: ตำแหน่งเหล็กยืนซ้อนกัน ลดจำนวนหรือขนาดเหล็ก`);
 if(pedestal){
  const ext=Math.max(det.hook135*dt,det.hook135Min),trad=radius(dt,det,true),tc=col.cover+dt/2,tz=spread(T+50,top-col.cover-dt/2,col.tie.spacing);
  if(!tz)warn(`${name}: ความสูงไม่พอสำหรับเหล็กปลอก`);
  else if(col.shape==='circle'){const Rt=col.diameter/2-tc,ctr=[ox+col.diameter/2,oy+col.diameter/2];out.push({role:'column-tie'+sfx,note:`ปลอกวงกลม${name} (ยาว = เส้นรอบวง + ขอ 2 × ${Math.round(ext)} mm)`,diameter:dt,grade:det.tieGrade,count:tz.count,points:Array.from({length:37},(_,k)=>[ctr[0]+Rt*Math.cos(2*Math.PI*k/36),ctr[1]+Rt*Math.sin(2*Math.PI*k/36),tz.from] as V3),axis:'Z',face:'side',radius:0,shapeCode:'99',distributionAxis:'Z',from:tz.from,to:tz.to,cut:roundUp(2*Math.PI*Rt+2*ext,rounding)});}
  else columnBoxes(col).forEach((b,k,all)=>{const full=col.shape==='L'||col.shape==='U'?(k===0?{...b}:{...b,y0:0}):b;out.push({role:`column-tie-${k+1}${sfx}`,note:`เหล็กปลอก${name}${all.length>1?` · ${k===0?'ขาแนว X':`ขาแนว Y${all.length>2?` ${k}`:''}`}`:''}`,diameter:dt,grade:det.tieGrade,count:tz.count,points:link(0,1,2,ox+full.x0+tc,ox+full.x1-tc,oy+full.y0+tc,oy+full.y1-tc,tz.from,det.hook90*dt,trad,dt),axis:'Z',face:'side',radius:trad,shapeCode:'99',distributionAxis:'Z',from:tz.from,to:tz.to});});
 }
 }
 return out;
}

function columnBars(i:ColumnInput,det:Detailing,rounding:number,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],c=i.cover.side,H=i.height,dt=i.rebar.tie.diameter,{bottom:eb,top:et}=i.rebar;
 const ext=Math.max(det.hook135*dt,det.hook135Min),rect=i.shape==='rect',W=rect?i.width:i.diameter,Dp=rect?i.depth:i.diameter;
 // main bar centres and the inward crank direction of each bar (corner: diagonal, side: normal to its face, ring: radial)
 const all=columnInputBars(i),cx=W/2,cy=Dp/2,sg=(v:number)=>Math.sign(v)||1;
 const dirOf=(b:ColumnBarPos):Pt=>b.kind==='sideX'?[0,sg(cy-b.y)]:b.kind==='sideY'?[sg(cx-b.x),0]:b.kind==='corner'?[sg(cx-b.x)/Math.SQRT2,sg(cy-b.y)/Math.SQRT2]:(()=>{const l=Math.hypot(cx-b.x,cy-b.y)||1;return [(cx-b.x)/l,(cy-b.y)/l] as Pt;})();
 const sizes=[...new Set(all.map(b=>b.d))].sort((p,q)=>q-p),kinds:Record<ColumnBarPos['kind'],string>={corner:'มุม',sideX:'ด้าน X',sideY:'ด้าน Y',ring:'รอบวง'};
 for(const dm of sizes){
 const set=all.filter(b=>b.d===dm),pts=set.map(b=>[b.x,b.y] as Pt),dirs=set.map(dirOf),n=pts.length;
 const lapOf=(e:ColumnEnd)=>e.lap>0?e.lap:lapLength(det,dm),Lb=lapOf(eb),Lt=lapOf(et),off=dm,rise=6*off;
 const path=(p:[number,number],u:Pt):V3[]=>{
  const q:[number,number]=[p[0]+u[0]*off,p[1]+u[1]*off],P=(a:[number,number],z:number):V3=>[a[0],a[1],z];
  // crank slope starts exactly at the joint: bottom of column (z = 0) going down, top of column (z = H) going up
  // bottom 'none': bars start at the column bottom face (no end cover; they sit on the slab/footing below)
  const low=eb.mode==='none'?[P(p,0)]:eb.mode==='lap'?[P(p,-Lb)]:[P(q,-rise-Lb),P(q,-rise),P(p,0)];
  const high=et.mode==='none'?[P(p,H-c-dm/2)]:et.mode==='lap'?[P(p,H+Lt)]:[P(p,H),P(q,H+rise),P(q,H+rise+Lt)];
  return [...low,...high];
 };
 const endNote=(e:ColumnEnd,L:number)=>e.mode==='none'?(e===et?'ตัดที่ cover':'เริ่มที่ขอบล่างเสา'):e.mode==='lap'?`ทาบ ${Math.round(L)}`:`Crank 1:6 เริ่มที่ระดับ${e===et?'บน':'ล่าง'}เสา ยาวดัด ${Math.round(rise)} + ทาบ ${Math.round(L)}`;
 const mix=(Object.keys(kinds) as ColumnBarPos['kind'][]).map(k=>[k,set.filter(b=>b.kind===k).length] as const).filter(([,m])=>m>0).map(([k,m])=>`${kinds[k]} ${m}`).join(' · ');
 const mainNote=`เหล็กยืน ${n} เส้น (${mix}) · ล่าง: ${endNote(eb,Lb)} · บน: ${endNote(et,Lt)} mm`;
 const cranks=[eb,et].filter(e=>e.mode==='crank').length,plain=eb.mode==='none'&&et.mode==='none';
 const lengthOf=(ps:V3[])=>ps.slice(1).reduce((s,p,k)=>s+Math.hypot(p[0]-ps[k][0],p[1]-ps[k][1],p[2]-ps[k][2]),0);
 const points=path(pts[0],dirs[0]),a0=Math.atan2(dirs[0][1],dirs[0][0]);
 const turns=dirs.map(u=>{let t=(Math.atan2(u[1],u[0])-a0)*180/Math.PI;while(t>180)t-=360;while(t<=-180)t+=360;return Number(t.toFixed(4));});
 // offsetTurns rotate the template about its last point (which may be cranked off the bar axis);
 // compensate each offset so the rotated bar axis lands on its own centre.
 const pv=points.at(-1)!,d0=[pv[0]-pts[0][0],pv[1]-pts[0][1]];
 const offsets:V3[]=pts.map((p,k)=>{const t=turns[k]*Math.PI/180,c=Math.cos(t),s=Math.sin(t);return [p[0]-pts[0][0]-d0[0]+d0[0]*c-d0[1]*s,p[1]-pts[0][1]-d0[1]+d0[0]*s+d0[1]*c,0];});
 out.push({role:sizes.length>1?`main-${dm}`:'main',note:mainNote,diameter:dm,grade:det.mainGrade,count:pts.length,points,axis:'Z',face:'side',radius:0,shapeCode:cranks===0?'00':cranks===1?'26':'99',offsets,...(cranks?{turns}:{}),cut:plain?undefined:roundUp(lengthOf(points),rounding)});
 }
 // ties in lower / middle / upper zones
 // first tie 50 mm above the column bottom face; last tie as before below the top
 const t=i.rebar.tie,zA=50,zB=H-Math.max(50,c+dt/2);
 const b1=t.lower.length>0?Math.min(zB,t.lower.length):0,b2=t.upper.length>0?Math.max(zA,H-t.upper.length):0;
 const present:Record<TieZoneKey,boolean>={lower:b1>0,middle:true,upper:b2>0},zoned=b1>0||b2>0;
 const range=(key:TieZoneKey,s:number)=>{const r:[number,number]=key==='lower'?[zA,b1]:key==='upper'?[b2,zB]:[b1?b1+s:zA,b2?b2-s:zB];return r[0]<=r[1]?r:null;};
 const tc=c+dt/2,trad=radius(dt,det,true),Rt=W/2-c-dt/2,hoopSpacing:Record<TieZoneKey,number>={lower:t.lower.spacing,middle:t.spacing,upper:t.upper.spacing};
 // set 1: perimeter hoop around the corner bars
 for(const [key,zone] of tieZoneKeys){
  const s=hoopSpacing[key],r=present[key]?range(key,s):null,tz=r&&spread(r[0],r[1],s);
  if(!tz)continue;
  const note=`${rect?'เหล็กปลอก':`ปลอกเกลียว/วงกลม (ยาว = เส้นรอบวง + ขอ 2 × ${Math.round(ext)} mm)`}${zoned?` · ${zone} @${s}`:''}`,common={role:zoned?`tie-${key}`:'tie',note,diameter:dt,grade:det.tieGrade,count:tz.count,axis:'Z' as const,face:'side' as const,distributionAxis:'Z' as const,from:tz.from,to:tz.to};
  if(rect)out.push({...common,points:link(0,1,2,tc,W-tc,tc,Dp-tc,tz.from,det.hook90*dt,trad,dt),radius:trad,shapeCode:'99'});
  else out.push({...common,points:Array.from({length:37},(_,k)=>[W/2+Rt*Math.cos(2*Math.PI*k/36),W/2+Rt*Math.sin(2*Math.PI*k/36),tz.from] as V3),radius:0,shapeCode:'99',cut:roundUp(2*Math.PI*Rt+2*ext,rounding)});
 }
 // set 2: supplementary ties per zone, stacked just above the hoops of the same level
 const inner=t.inner,di=inner.diameter,lift=(dt+di)/2;
 for(const [key,zone] of tieZoneKeys){
  const z=inner[key];if(!present[key]||z.pattern==='none')continue;
  if(!rect){warn('เสากลม: ไม่รองรับเหล็กปลอกชุดที่ 2');break;}
  if(!(di>0)||!(z.spacing>0))continue;
  const lay=columnTieLayout(i,z.pattern,det),label=tiePatternInfo[z.pattern].label;
  lay.issues.forEach(s=>warn(`ปลอกชุดที่ 2 ${zone} (${label}): ${s}`));
  const r=range(key,z.spacing),tz=r&&spread(r[0]+lift,r[1]+lift,z.spacing);
  if(!lay.pieces.length||!tz)continue;
  const levels=Array.from({length:tz.count},(_,k)=>tz.count===1?tz.from:tz.from+(tz.to-tz.from)*k/(tz.count-1));
  // identical shapes (translation only) share one Mark
  const groups=new Map<string,{piece:TiePiece;at:Pt[]}>();
  for(const pc of lay.pieces){const o=pc.pts[0],sig=pc.kind+pc.pts.map(p=>`${Math.round((p[0]-o[0])*10)},${Math.round((p[1]-o[1])*10)}`).join(';'),g=groups.get(sig);if(g)g.at.push(o);else groups.set(sig,{piece:pc,at:[o]});}
  [...groups.values()].forEach(({piece,at},k)=>{
   const o=at[0],offsets=levels.flatMap(zz=>at.map(p=>[p[0]-o[0],p[1]-o[1],zz-levels[0]] as V3));
   if(offsets.length>2000){warn(`ปลอกชุดที่ 2 ${zone}: จำนวนชิ้นเกิน 2,000 ต่อ Mark เพิ่มระยะห่าง`);return;}
   const kind=piece.kind==='cross'?'เหล็กรัดขวาง ขอ 135°/90° (สลับปลายขอทุกชั้น)':'ปลอกใน งอฉาก 90°';
   out.push({role:`tie2-${key}-${k+1}`,note:`ปลอกชุดที่ 2 · ${label} · ${kind} · ${at.length} ตำแหน่ง × ${levels.length} ชั้น${zoned?` · ${zone}`:''} @${z.spacing}`,diameter:di,grade:det.tieGrade,count:offsets.length,points:piece.pts.map(p=>[p[0],p[1],levels[0]] as V3),axis:'Z',face:'side',radius:lay.R,shapeCode:'99',offsets});
  });
 }
 if(!rect)warn('เสากลม: คิดคอนกรีต/แบบหล่อด้วยรายการหักจากกล่อง D × D · ภาพ 3D แสดงเป็นกล่อง');
 if(!out.some(b=>b.role.startsWith('tie')))warn('เหล็กปลอก: วางไม่ได้ ตรวจความสูงและระยะห่าง');
 return out;
}
/** Reference regions (not in BOQ) above / below the column for main bars extending past the joints. */
type RegionV2=Extract<NonNullable<Member['placementContext']>,{version:2}>['regions'];
function columnRegions(i:ColumnInput,det:Detailing):RegionV2{
 const W=i.shape==='rect'?i.width:i.diameter,D=i.shape==='rect'?i.depth:i.diameter,dm=columnMainMax(i),c=i.cover.side;
 // the crank (6 × Ø) always lies outside the column, beyond the joint
 const reach=(e:ColumnEnd)=>e.mode==='none'?0:(e.lap>0?e.lap:lapLength(det,dm))+(e.mode==='crank'?6*dm:0);
 const out:RegionV2=[],top=reach(i.rebar.top),bottom=reach(i.rebar.bottom);
 if(top>0)out.push({id:'gencol-top',label:'เสาต้นบน (อ้างอิง)',origin:[0,0,i.height],size:[W,D,top+c+dm],reference:`เหล็กยืนต่อขึ้นเหนือรอยต่อ ${Math.round(top)} mm · พื้นที่อ้างอิง ไม่คิดปริมาณ`,cover:c,openings:[]});
 // always present: the column bottom face bears on the slab/footing below, so bars may start at it without end cover
 out.push({id:'gencol-bottom',label:'โครงสร้างใต้เสา (อ้างอิง)',origin:[0,0,-(bottom+c+dm)],size:[W,D,bottom+c+dm],reference:bottom>0?`เหล็กยืนต่อลงใต้รอยต่อ ${Math.round(bottom)} mm · พื้นที่อ้างอิง ไม่คิดปริมาณ`:'เหล็กยืนเริ่มที่ขอบล่างเสา (ไม่มี cover ปลาย) · พื้นที่อ้างอิง ไม่คิดปริมาณ',cover:c,openings:[]});
 return out;
}

/** A new span / grid for a beam group (from the single-beam fields or the previous span). */
export function newBeamSpan(i:BeamInput,prev?:BeamSpan):BeamSpan{
 return prev?{...structuredClone(prev),kind:'span'}:{mark:'B1',kind:'span',length:i.length||6000,width:i.width||300,depth:i.depth||600,top:0,
  rebar:{top:{count:i.rebar.top.count||2,diameter:i.rebar.top.diameter||16},bottom:{count:i.rebar.bottom.count||3,diameter:i.rebar.bottom.diameter||16},
   stirrup:{diameter:i.rebar.stirrup.diameter||9,spacing:i.rebar.stirrup.spacing||200,endSpacing:Math.min(100,i.rebar.stirrup.spacing||150),endLength:Math.round(2*(i.depth||600))}}};
}
export const newBeamGrid=(label:string,support=300):BeamGrid=>({label,support,extraTop:{count:0,diameter:16}});
/** Beam group converted from the single-beam fields: one span between two 300 mm columns. */
export function beamGroupFrom(i:BeamInput):BeamInput{
 return {...i,layout:'group',spans:i.spans.length?i.spans:[newBeamSpan(i)],grids:i.grids.length?i.grids:[newBeamGrid('1'),newBeamGrid('2')]};
}
/** Positions along the beam group (x from the outer face of the first support), concrete per span between
 * support faces, levels from the lowest soffit (z = 0) and the column reference boxes. */
export function beamGroupLayout(i:BeamInput){
 const sp=i.spans,gr=i.grids,gx=[0];sp.forEach((s,k)=>gx.push(gx[k]+s.length));
 const x0=(gr[0]?.support||0)/2,grid=gx.map(x=>x+x0),hi=Math.max(...sp.map(s=>s.top)),lo=Math.min(...sp.map(s=>s.top-s.depth)),W=Math.max(...sp.map(s=>s.width));
 const spans=sp.map((s,k)=>{const sl=(gr[k]?.support||0)/2,sr=(gr[k+1]?.support||0)/2,a=grid[k]+sl,b=grid[k+1]-sr;
  return {...s,k,a,b,clear:b-a,z0:s.top-s.depth-lo,z1:s.top-lo,y0:(W-s.width)/2,y1:(W+s.width)/2,label:`${s.mark} (${gr[k]?.label||'ปลาย'}–${gr[k+1]?.label||'ปลาย'})`};});
 const n=sp.length,L=grid[n]+(gr[n]?.support||0)/2;
 const columns=gr.flatMap((g,k)=>{if(!(g.support>0))return [];const adj=spans.filter(s=>s.k===k||s.k===k-1);if(!adj.length)return [];
  return [{k,label:g.label,x0:grid[k]-g.support/2,x1:grid[k]+g.support/2,z0:Math.min(...adj.map(s=>s.z0)),z1:Math.max(...adj.map(s=>s.z1))}];});
 return {grid,spans,columns,W,H:hi-lo,L,datum:-lo};
}
type GroupSpan=ReturnType<typeof beamGroupLayout>['spans'][number];
/** Beam group bars: bottom bars per span (into interior supports to the far face − 50, hooked into end supports),
 * continuous top bars merged across supports at the same level and size (hooked into end supports, bent down at
 * free ends), extra top bars over supports to topCont (continuous) / topEnd (end support) × clear span
 * (cantilever: whole cantilever + back span), stirrups with end zones. */
function beamGroupBars(i:BeamInput,det:Detailing,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],{spans,grid,columns}=beamGroupLayout(i),c=i.cover,gr=i.grids,rules=det.beam||{topEnd:.25,topCont:.3,bottomZone:.125},g=det.mainGrade;
 const col=(k:number)=>columns.find(q=>q.k===k);
 const zTop=(s:GroupSpan,d:number)=>s.z1-c.top-s.rebar.stirrup.diameter-d/2,zBot=(s:GroupSpan,d:number)=>s.z0+c.bottom+s.rebar.stirrup.diameter+d/2;
 const across=(s:GroupSpan,d:number)=>({lo:s.y0+c.side+s.rebar.stirrup.diameter+d/2,hi:s.y1-c.side-s.rebar.stirrup.diameter-d/2});
 const hookLeg=(d:number)=>det.hook90*d+radius(d,det);
 /** run end at grid k anchored in the column: its far face − cover; without a column the concrete end − cover */
 const anchorX=(k:number,dir:-1|1,d:number,s:GroupSpan)=>{const q=col(k);return q?(dir<0?q.x0+c.side+d/2:q.x1-c.side-d/2):dir<0?s.a+c.side+d/2:s.b-c.side-d/2;};
 const down=(s:GroupSpan,z:number,d:number)=>-Math.max(0,Math.min(hookLeg(d),z-(s.z0+c.bottom+s.rebar.stirrup.diameter+d)));
 const run=(x0:number,x1:number,z:number,h0:number,h1:number):[number,number][]=>[...(h0?[[x0,z+h0] as [number,number]]:[]),[x0,z],[x1,z],...(h1?[[x1,z+h1] as [number,number]]:[])];
 const push=(role:string,note:string,d:number,count:number,pts:[number,number][],face:Bar['face'],lo:number,hi:number,hooks:number)=>{
  const from=count===1?(lo+hi)/2:lo,to=count===1?from:hi;
  out.push({role,note,diameter:d,grade:g,count,points:pts.map(([x,z])=>[Number(x.toFixed(3)),from,Number(z.toFixed(3))] as V3),axis:'X',face,radius:hooks?radius(d,det):0,shapeCode:hooks===0?'00':hooks===1?'11':'21',distributionAxis:'Y',from,to});
 };
 // ---- bottom bars, one set per span
 for(const s of spans){const b=s.rebar.bottom,d=b.diameter;if(b.count<1||!d)continue;
  const z=zBot(s,d),{lo,hi}=across(s,d);if(hi<lo){warn(`${s.label} เหล็กล่าง: คานแคบเกินไป`);continue;}
  const end=(side:'a'|'b')=>{const k=side==='a'?s.k:s.k+1,other=side==='a'?spans[s.k-1]:spans[s.k+1],q=col(k),dir=side==='a'?-1:1;
   if(!q)return {x:anchorX(k,dir,d,s),hook:0};
   if(other&&other.kind!=='cantilever'&&s.kind!=='cantilever'&&Math.abs(other.z0-s.z0)<25)return {x:dir<0?q.x0+50:q.x1-50,hook:0};
   return {x:anchorX(k,dir,d,s),hook:Math.max(0,Math.min(hookLeg(d),s.z1-c.top-s.rebar.stirrup.diameter-d-z))};};
  const A=end('a'),B=end('b');
  push(`s${s.k+1}-bottom`,`${s.label} · เหล็กล่าง${s.kind==='cantilever'?' (ช่วงยื่น)':''}`,d,b.count,run(A.x,B.x,z,A.hook,B.hook),'bottom',lo,hi,(A.hook?1:0)+(B.hook?1:0));
 }
 // ---- continuous top bars: merge neighbouring spans of the same size, count and top level
 let k=0;
 while(k<spans.length){const s=spans[k],t=s.rebar.top,d=t.diameter;if(t.count<1||!d){k++;continue;}
  let e=k;while(e+1<spans.length&&spans[e+1].rebar.top.count===t.count&&spans[e+1].rebar.top.diameter===d&&Math.abs(spans[e+1].z1-s.z1)<25)e++;
  const parts=spans.slice(k,e+1),last=spans[e],z=zTop(s,d),lo=Math.max(...parts.map(p=>across(p,d).lo)),hi=Math.min(...parts.map(p=>across(p,d).hi));
  const A={x:anchorX(s.k,-1,d,s),hook:down(s,z,d)},B={x:anchorX(last.k+1,1,d,last),hook:down(last,z,d)};
  if(B.x-A.x>det.stockLength)warn(`${parts.map(p=>p.mark).join(', ')} เหล็กบนต่อเนื่อง: ยาว ${Math.round(B.x-A.x)} mm เกินเหล็กเส้น ${det.stockLength} mm ต้องต่อทาบ (ต่อบริเวณกลางช่วง)`);
  const marks=[...new Set(parts.map(p=>p.mark))].join(' / ');
  push(`top-${k+1}${e>k?`-${e+1}`:''}`,`${parts.length>1?`${marks} (${gr[s.k]?.label||'ปลาย'}–${gr[last.k+1]?.label||'ปลาย'})`:s.label} · เหล็กบนต่อเนื่อง`,d,t.count,run(A.x,B.x,z,A.hook,B.hook),'top',lo,hi,(A.hook?1:0)+(B.hook?1:0));
  k=e+1;}
 // ---- extra top bars over the supports
 gr.forEach((gd,gk)=>{const x=gd.extraTop,d=x.diameter;if(x.count<1||!d)return;
  const L0=spans[gk-1],R0=spans[gk];if(!L0&&!R0)return;
  // top of beam changes at this support: one bar per side, each anchored in the column
  const split=!!L0&&!!R0&&Math.abs(L0.z1-R0.z1)>=25;
  for(const [L,R,tag] of (split?[[L0,undefined,'-l'],[undefined,R0,'-r']]:[[L0,R0,'']]) as [GroupSpan|undefined,GroupSpan|undefined,string][]){
  const ref=(L&&R?(L.z1>=R.z1?L:R):(L||R))!,main=ref.rebar.top,z0=zTop(ref,main.diameter||d),{lo,hi}=across(ref,d),q=col(gk);
  // between the continuous bars when they leave room, else a second layer under them
  let z=z0,from=lo,to=hi;
  if(main.count>=2&&x.count<=main.count-1){const gap=(hi-lo)/(main.count-1);from=lo+gap/2;to=from+gap*(x.count-1);}
  else if(main.count>0)z=z0-(main.diameter||d)/2-Math.max(25,d)-d/2;
  const faceL=q?q.x0:grid[gk],faceR=q?q.x1:grid[gk],both=!!L&&!!R&&L.kind!=='cantilever'&&R.kind!=='cantilever';
  // extension into a span: continuous support → topCont × the longer clear span; end support → topEnd × clear span
  const reach=(s:GroupSpan,other?:GroupSpan)=>other?.kind==='cantilever'?Math.max(other.clear,rules.topCont*s.clear):both?rules.topCont*Math.max(L!.clear,R!.clear):rules.topEnd*s.clear;
  let a:number,ha=0,b:number,hb=0;
  if(!L){a=anchorX(gk,-1,d,R!);ha=down(R!,z,d);}else if(L.kind==='cantilever'){a=L.a+c.side+d/2;ha=down(L,z,d);}else a=faceL-reach(L,R);
  if(!R){b=anchorX(gk,1,d,L!);hb=down(L!,z,d);}else if(R.kind==='cantilever'){b=R.b-c.side-d/2;hb=down(R,z,d);}else b=faceR+reach(R,L);
  const f=x.count===1?(from+to)/2:from,t=x.count===1?f:to;
  out.push({role:`g${gk+1}-extra-top${tag}`,note:`เหล็กเสริมบนที่กริด ${gd.label||gk+1} (${[L?.mark,R?.mark].filter(Boolean).join(' / ')}) · ยื่นจากผิวเสา ${L?Math.round(faceL-a):0} / ${R?Math.round(b-faceR):0} mm`,diameter:d,grade:g,count:x.count,
   points:run(a,b,z,ha,hb).map(([px,pz])=>[Number(px.toFixed(3)),f,Number(pz.toFixed(3))] as V3),axis:'X',face:'top',radius:ha||hb?radius(d,det):0,shapeCode:ha&&hb?'21':ha||hb?'11':'00',distributionAxis:'Y',from:f,to:t});
 }});
 // ---- stirrups per span: close spacing over `endLength` from each support face (cantilever: support side only)
 for(const s of spans){const st=s.rebar.stirrup,dt=st.diameter;if(!dt||!(st.spacing>0))continue;
  const tc=c.side+dt/2,rad=radius(dt,det,true),x0=s.a+50,x1=s.b-50,ez=st.endSpacing>0&&st.endLength>0?Math.min(st.endLength,(x1-x0)/2):0;
  const tipA=s.kind==='cantilever'&&!(gr[s.k]?.support>0)&&s.k===0,tipB=s.kind==='cantilever'&&!tipA;
  const zones:[string,number,number,number][]=!ez?[['m',x0,x1,st.spacing]]:[
   ...(tipA?[]:[['a',x0,x0+ez,st.endSpacing] as [string,number,number,number]]),
   ['m',tipA?x0:x0+ez+st.spacing,tipB?x1:x1-ez-st.spacing,st.spacing],
   ...(tipB?[]:[['b',x1-ez,x1,st.endSpacing] as [string,number,number,number]])];
  for(const [zn,a,b,sp] of zones){if(b<a-1e-6)continue;const sx=spread(a,b,sp);if(!sx)continue;
   out.push({role:`s${s.k+1}-stirrup-${zn}`,note:`${s.label} · เหล็กปลอก${zn==='m'?'ช่วงกลาง':'ช่วงปลาย'} @${sp}`,diameter:dt,grade:det.tieGrade,count:sx.count,points:link(1,2,0,s.y0+tc,s.y1-tc,s.z0+c.bottom+dt/2,s.z1-c.top-dt/2,sx.from,det.hook90*dt,rad,dt),axis:'X',face:'side',radius:rad,shapeCode:'99',distributionAxis:'X',from:sx.from,to:sx.to});}
 }
 return out;
}
function beamBars(i:BeamInput,det:Detailing,warn:(s:string)=>void):GenBar[]{
 if(i.layout==='group')return beamGroupBars(i,det,warn);
 const out:GenBar[]=[],{width:W,depth:Dp,length:L,cover:c,rebar:r}=i,dt=r.stirrup.diameter;
 const main=(role:string,note:string,l:Shaped&{count:number},top:boolean)=>{
  if(l.count<1)return;const d=l.diameter,z=top?Dp-c.top-dt-d/2:c.bottom+dt+d/2,lo=c.side+dt+d/2,hi=W-c.side-dt-d/2;
  if(hi<lo){warn(`${note}: ความกว้างคานไม่พอ`);return;}
  const from=l.count===1?(lo+hi)/2:lo,to=l.count===1?from:hi,a=c.side+d/2,b=L-c.side-d/2;
  let sh=shapedEnds(l,det,top?-1:1,top?z-(c.bottom+dt+d/2):Dp-c.top-dt-d/2-z,note,warn);
  if(b-a<=sh.minRun){warn(`${note}: คานสั้นเกินไปสำหรับ Shape ${sh.code} ใช้เหล็กตรง`);sh=shapedEnds({...l,shape:'00'},det,1,0,note,warn);}
  out.push({role,note:note+sh.suffix,diameter:d,grade:det.mainGrade,count:l.count,points:sh.points(a,b,z).map(([u,w])=>[u,from,w] as V3),axis:'X',face:top?'top':'bottom',radius:sh.radius,shapeCode:sh.code,distributionAxis:'Y',from,to});
 };
 main('top','เหล็กบน',r.top,true);
 main('bottom','เหล็กล่าง',r.bottom,false);
 const sx=spread(Math.max(50,c.side+dt/2),L-Math.max(50,c.side+dt/2),r.stirrup.spacing),tc=c.side+dt/2;
 if(sx)out.push({role:'stirrup',note:'เหล็กปลอก',diameter:dt,grade:det.tieGrade,count:sx.count,points:link(1,2,0,tc,W-tc,c.bottom+dt/2,Dp-c.top-dt/2,sx.from,det.hook90*dt,radius(dt,det,true),dt),axis:'X',face:'side',radius:radius(dt,det,true),shapeCode:'99',distributionAxis:'X',from:sx.from,to:sx.to});
 else warn('เหล็กปลอก: วางไม่ได้ ตรวจความยาวและระยะห่าง');
 return out;
}

function slabBars(i:SlabInput,det:Detailing,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],{lengthX:X,lengthY:Y,thickness:T,cover:c,rebar:r}=i;
 const mesh=(role:string,note:string,l:Shaped&{spacing:number},runX:boolean,z:number)=>{
  const d=l.diameter,across=runX?Y:X,run=runX?X:Y,s=spread(c.edge+d/2,across-c.edge-d/2,l.spacing);if(!s){warn(`${note}: วางเหล็กไม่ได้`);return;}
  const up=z<T/2,a=c.edge+d/2,b=run-c.edge-d/2,pt=(along:number,zz:number):V3=>runX?[along,s.from,zz]:[s.from,along,zz];
  let sh=shapedEnds(l,det,up?1:-1,up?T-c.top-d/2-z:z-c.bottom-d/2,note,warn);
  if(b-a<=sh.minRun){warn(`${note}: ช่วงพื้นสั้นเกินไปสำหรับ Shape ${sh.code} ใช้เหล็กตรง`);sh=shapedEnds({...l,shape:'00'},det,1,0,note,warn);}
  out.push({role,note:note+sh.suffix,diameter:d,grade:det.mainGrade,count:s.count,points:sh.points(a,b,z).map(([u,w])=>pt(u,w)),axis:runX?'X':'Y',face:up?'bottom':'top',radius:sh.radius,shapeCode:sh.code,distributionAxis:runX?'Y':'X',from:s.from,to:s.to});
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
 const lapLen=r.lap?lapLength(det,dv):0;
 const sx=spread(c.edge+dv/2,L-c.edge-dv/2,r.vertical.spacing),sz=spread(c.edge+dh/2,H-c.edge-dh/2,r.horizontal.spacing);
 // bends/hooks turn across the wall toward the opposite face (single layer: toward face 2)
 const ends=(l:Shaped,note:string,y:number,span:number,second:boolean)=>{const d=l.diameter,dir=second?-1:1,room=second?y-c.face-d/2:t-c.face-d/2-y;let sh=shapedEnds(l,det,dir,room,note,warn);if(span<=sh.minRun){warn(`${note}: ช่วงสั้นเกินไปสำหรับ Shape ${sh.code} ใช้เหล็กตรง`);sh=shapedEnds({...l,shape:'00'},det,1,0,note,warn);}return sh;};
 faces.forEach((f,k)=>{
  const second=r.layers===2&&k===1;
  if(sx){const a=c.edge+dv/2,b=H-c.edge-dv/2,note=`เหล็กแนวตั้ง · ${f.tag}`,sh=ends(r.vertical,note,f.yv,b-a,second),pts=sh.points(a,b,f.yv);
   out.push({role:`vertical-${k+1}`,note:`${note}${sh.suffix}${r.lap?` (ยาว H + ทาบ ${Math.round(lapLen)} mm)`:''}`,diameter:dv,grade:det.mainGrade,count:sx.count,points:pts.map(([u,w])=>[sx.from,w,u] as V3),axis:'Z',face:'side',radius:sh.radius,shapeCode:sh.code,distributionAxis:'X',from:sx.from,to:sx.to,cut:r.lap?roundUp(sh.length(pts)+(H-(b-a))+lapLen,rounding):undefined});}
  if(sz){const a=c.edge+dh/2,b=L-c.edge-dh/2,note=`เหล็กแนวนอน · ${f.tag}`,sh=ends(r.horizontal,note,f.yh,b-a,second);
   out.push({role:`horizontal-${k+1}`,note:note+sh.suffix,diameter:dh,grade:det.mainGrade,count:sz.count,points:sh.points(a,b,f.yh).map(([u,w])=>[u,w,sz.from] as V3),axis:'X',face:'side',radius:sh.radius,shapeCode:sh.code,distributionAxis:'Z',from:sz.from,to:sz.to});}
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
   const earth=footingEarth(input),{lx,ly,bx,by,grow,depth}=earth;
   const col=input.column,T=input.thickness,ped=col.type==='pedestal',H=ped?col.height:0,{w,d}=columnExtent(col),ox=(X-w)/2+col.offsetX,oy=(Y-d)/2+col.offsetY;
   // every column on the footing (C1 + extras): plan box origin and height
   const cols=footingColumns(input),many=cols.length>1,colBox=(c:FootingColumn)=>{const e=columnExtent(c);return {w:e.w,d:e.d,ox:(X-e.w)/2+c.offsetX,oy:(Y-e.d)/2+c.offsetY,h:ped?c.height:0};},Hmax=Math.max(H,...cols.map(c=>colBox(c).h));
   const buried=(A*T+(ped?cols.reduce((n,c)=>n+columnArea(c)*Math.max(0,Math.min(c.height,depth-earth.below-T)),0):0))/1e9;
   const footingFaces=[true,true,true,true,false,false],sideFaces=[true,true,true,true,false,false];
   const auto:Member['deductions']=[];
   // Hexagon / octagon / circle: bounding box concrete minus the cut-off corners (exact area and perimeter).
   if(!['rect','L','U'].includes(input.shape))auto.push({reason:`${AUTO}ฐานราก${({circle:'กลม',hex:'6 เหลี่ยม',oct:'8 เหลี่ยม'} as Record<string,string>)[input.shape]} (หักจากกล่อง ${Math.round(X)} × ${Math.round(Y)})`,volume:(X*Y-A)*T/1e9,formwork:(2*X+2*Y-P)*T/1e6});
   if(ped)cols.forEach((c,ci)=>{if(c.shape!=='circle')return;const b=colBox(c);auto.push({reason:`${AUTO}เสาตอม่อกลม${many?` ${footingColumnName(c,ci,true).replace('เสาตอม่อ ','')}`:''} Ø${b.w} (หักจากกล่อง ${b.w} × ${b.w})`,volume:(b.w*b.w-Math.PI*b.w*b.w/4)*b.h/1e9,formwork:(4*b.w-Math.PI*b.w)*b.h/1e6});});
   const piles=pilePositions(input);
   if(piles.length&&input.pile.embed>0)auto.push({reason:`${AUTO}หัวเข็มฝังในฐาน ${piles.length} ต้น × ${input.pile.embed} mm`,volume:piles.length*pileArea(input.pile)*input.pile.embed/1e9,formwork:0});
   if(input.shape!=='rect'&&(input.lean.thickness>0||earth.sand>0||depth>0))warn('Lean concrete ทราย และงานขุดคิดเป็นกรอบสี่เหลี่ยมคลุมแปลนฐาน (ระยะยื่น/ระยะเผื่อทำงานรอบกรอบ)');
   const slabOn=footingSlabOn(input);
   if(slabOn)auto.push({reason:`${AUTO}ผิวข้างฐานช่วงความหนาพื้น ${input.slab.thickness} mm (หล่อรวมกับพื้น ไม่ใช้แบบหล่อ)`,volume:0,formwork:P*input.slab.thickness/1e6});
   if(input.slab.enabled&&!slabOn)warn('ฐานหล่อรวมพื้น: ใช้ได้กับแปลนสี่เหลี่ยมและพื้นบางกว่าฐาน · ยังไม่สร้างพื้นอ้างอิงและไม่ยื่นเหล็กบน');
   if(piles.length&&input.cover.bottom<input.pile.embed+25)warn(`cover ล่าง ${input.cover.bottom} mm ควรมากกว่าระยะฝังหัวเข็ม ${input.pile.embed} mm เพื่อให้ตะแกรงล่างอยู่เหนือหัวเข็ม`);
   const geometryRoute=input.shape==='L'||input.shape==='U'||ped&&(many||col.shape==='L'||col.shape==='U');
   let shape:Partial<Member>={z:T,pedestal:ped?{x:w,y:d,z:H}:{x:0,y:0,z:0}};
   if(geometryRoute)shape={z:T+Hmax,pedestal:{x:0,y:0,z:0},geometry:{solids:[...footingBoxes(input).map((b,k)=>({id:`footing${k+1}`,label:`ฐานราก ${k+1}`,origin:[b.x0,b.y0,0] as V3,size:[b.x1-b.x0,b.y1-b.y0,T] as V3,faces:footingFaces})),...(ped?cols.flatMap((c,ci)=>{const cb=colBox(c);return columnBoxes(c).map((b,k)=>({id:ci?`pedestal-c${ci+1}-${k+1}`:`pedestal${k+1}`,label:`${many?footingColumnName(c,ci,true):'เสาตอม่อ'} ${k+1}`.slice(0,80),origin:[cb.ox+b.x0,cb.oy+b.y0,T] as V3,size:[b.x1-b.x0,b.y1-b.y0,cb.h] as V3,faces:sideFaces}));}):[])],voids:[]}};
   else if(ped&&(Math.abs(col.offsetX)>.5||Math.abs(col.offsetY)>.5))shape={z:T+H,pedestal:{x:0,y:0,z:0},geometry:{solids:[{id:'footing1',label:'ฐานราก',origin:[0,0,0],size:[X,Y,T],faces:footingFaces},{id:'pedestal',label:'เสาตอม่อ',origin:[ox,oy,T],size:[w,d,H],faces:sideFaces}],voids:[]}};
   shape={...shape,deductions:[...deductions,...auto]};
   // Bars projecting above the concrete sit in placement-only reference regions (not in BOQ).
   const keep=(m.placementContext?.regions||[]).filter(r=>!r.id.startsWith('gencol')&&!r.id.startsWith('genslab')).map(r=>({...r,openings:'openings' in r?r.openings:[]}));
   const regions=cols.filter(c=>c.projection>0).flatMap(c=>{const ci=cols.indexOf(c),cb=colBox(c);return (c.shape==='circle'?[{x0:0,y0:0,x1:cb.w,y1:cb.d}]:columnBoxes(c)).map((b,k)=>({id:ci?`gencol-c${ci+1}-${k+1}`:`gencol${k+1}`,label:`${c.columnNo||(many?`C${ci+1}`:'เสา')} (อ้างอิง)`.slice(0,80),origin:[cb.ox+b.x0,cb.oy+b.y0,T+cb.h] as V3,size:[b.x1-b.x0,b.y1-b.y0,c.projection+c.cover+maxMainDiameter(c)] as V3,reference:`เหล็กเสาโผล่${ped?'เหนือตอม่อ':'จากฐาน'} ${c.projection} mm · พื้นที่อ้างอิง ไม่คิดปริมาณ`,cover:c.cover,openings:[]}));});
   const slabRegions=slabOn?footingSlabRegions(input,X,Y):[],all=[...keep,...regions,...slabRegions];
   if(all.length>REGION_LIMIT)warn(`พื้นที่อ้างอิงเกิน ${REGION_LIMIT} รายการ (พื้น ${slabRegions.length} + เสา ${regions.length} + กำหนดเอง ${keep.length}) · ตัดพื้นที่กำหนดเองบางส่วนออก`);
   const context=all.length>REGION_LIMIT?[...keep.slice(0,Math.max(0,REGION_LIMIT-regions.length-slabRegions.length)),...regions,...slabRegions].slice(0,REGION_LIMIT):all,firstBar=col.type!=='none'?columnSectionPreview(col).bars[0]:undefined;
   // Default section A-A passes through the first row of column bars so they appear in the section view.
   if(!m.drawingViews)shape={...shape,sectionY:firstBar?Number((oy+firstBar.y).toFixed(1)):Y/2};
   const {placementContext:_c,...rest}=next;
   next={...rest,...(context.length?{placementContext:{version:2 as const,regions:context}}:{}),x:X,y:Y,cover:Math.min(input.cover.bottom,input.cover.top,input.cover.side,...cols.map(c=>c.cover)),faces:footingFaces,lean:{x:input.lean.thickness>0?lx:0,y:input.lean.thickness>0?ly:0,thickness:input.lean.thickness},excavation:{bottomX:bx,bottomY:by,topX:bx+grow,topY:by+grow,depth,buriedConcrete:buried},...shape} as Member;
   next=withSiteWork(next,{...(m.siteWork||emptySiteWork()),sand:{x:earth.sand>0?earth.sx:0,y:earth.sand>0?earth.sy:0,thickness:earth.sand},sheet:{x:earth.sheet[0],y:earth.sheet[1]},compaction:input.subbase.compaction.enabled&&depth>0?{x:bx,y:by}:{x:0,y:0}});
   gen=foundationBars(input,det,rounding,warn);break;}
  case 'Column':{
   const rect=input.shape==='rect',D=input.diameter,H=input.height;
   const pc=m.placementContext,keep:RegionV2=(pc?.version===2?pc.regions:(pc?.regions||[]).map(r=>({...r,openings:[]}))).filter(r=>!r.id.startsWith('gencol'));
   const context=[...keep,...columnRegions(input,det)].slice(0,6),{placementContext:_c,...rest}=next;
   next={...rest,...(context.length?{placementContext:{version:2 as const,regions:context}}:{}),x:rect?input.width:D,y:rect?input.depth:D,z:H,cover:input.cover.side,faces:[true,true,true,true,false,false],pedestal:{x:0,y:0,z:0},deductions:rect?deductions:[...deductions,{reason:`${AUTO}หน้าตัดวงกลม Ø${D} (แปลงจากกล่อง ${D} × ${D})`,volume:(D*D-Math.PI*D*D/4)*H/1e9,formwork:(4*D-Math.PI*D)*H/1e6}]};
   gen=columnBars(input,det,rounding,warn);break;}
  case 'Beam':{
   const onGround=input.ground.support==='ground';
   if(input.layout==='group'&&input.spans.length){
    // beam group: one concrete box per span between support faces; supporting columns are reference regions
    const lay=beamGroupLayout(input),last=lay.spans.length-1;
    const solids=lay.spans.map(sp=>({id:`span${sp.k+1}`,label:sp.label.slice(0,80),origin:[sp.a,sp.y0,sp.z0] as V3,size:[Math.max(1,sp.clear),sp.y1-sp.y0,sp.z1-sp.z0] as V3,
     faces:[sp.k===0&&!(input.grids[0]?.support>0),sp.k===last&&!(input.grids[last+1]?.support>0),true,true,!onGround,false]}));
    const keep=(m.placementContext?.regions||[]).filter(r=>!r.id.startsWith('genbcol')).map(r=>({...r,openings:'openings' in r?r.openings:[]}));
    const cols=lay.columns.map(q=>({id:`genbcol${q.k+1}`,label:`เสา ${q.label||q.k+1} (อ้างอิง)`.slice(0,80),origin:[q.x0,0,q.z0] as V3,size:[q.x1-q.x0,lay.W,Math.max(1,q.z1-q.z0)] as V3,reference:'เสาที่รองรับคาน · ระยะฝัง/งอเหล็กคาน · พื้นที่อ้างอิง ไม่คิดปริมาณ',cover:input.cover.side,openings:[]}));
    const context=[...keep.slice(0,Math.max(0,REGION_LIMIT-cols.length)),...cols].slice(0,REGION_LIMIT);
    if(keep.length+cols.length>REGION_LIMIT)warn(`พื้นที่อ้างอิงเกิน ${REGION_LIMIT} รายการ · ตัดพื้นที่กำหนดเองบางส่วนออก`);
    const {placementContext:_c,...rest}=next;
    next={...rest,...(context.length?{placementContext:{version:2 as const,regions:context}}:{}),x:Math.max(...lay.spans.map(sp=>sp.b)),y:lay.W,z:lay.H,cover:Math.min(input.cover.top,input.cover.bottom,input.cover.side),faces:[false,false,true,true,!onGround,false],pedestal:{x:0,y:0,z:0},deductions,geometry:{solids,voids:[]}} as Member;
   }else next={...next,x:input.length,y:input.width,z:input.depth,cover:Math.min(input.cover.top,input.cover.bottom,input.cover.side),faces:[false,false,true,true,!onGround,false],pedestal:{x:0,y:0,z:0},deductions};
   gen=beamBars(input,det,warn);break;}
  case 'Slab':next={...next,x:input.lengthX,y:input.lengthY,z:input.thickness,cover:Math.min(input.cover.top,input.cover.bottom,input.cover.edge),faces:[true,true,true,true,true,false],pedestal:{x:0,y:0,z:0},deductions};gen=slabBars(input,det,warn);break;
  case 'Wall':next={...next,x:input.length,y:input.thickness,z:input.height,cover:Math.min(input.cover.face,input.cover.edge),faces:[true,true,true,true,false,false],pedestal:{x:0,y:0,z:0},deductions};gen=wallBars(input,det,rounding,warn);break;
 }
 if(m.category!=='Foundation')next={...next,excavation:{bottomX:0,bottomY:0,topX:0,topY:0,depth:0,buriedConcrete:0},lean:{x:0,y:0,thickness:0}};
 if(m.category!=='Foundation')next=withSiteWork(next,m.siteWork&&{...emptySiteWork(),items:m.siteWork.items});
 // slab on ground: lean concrete / sand / sheet / compaction under the slab, no soffit formwork
 if(input.category==='Slab'&&input.ground.support==='ground'){const g=groundLayers(input.ground,input.lengthX,input.lengthY);
  next=withSiteWork({...next,lean:g.lean,faces:[true,true,true,true,false,false]},{...(m.siteWork||emptySiteWork()),sand:g.sand,sheet:g.sheet,compaction:g.compaction});}
 // beam on ground: layers along the whole beam (group: outer face to outer face of the end supports)
 if(input.category==='Beam'&&input.ground.support==='ground'){const lay=input.layout==='group'&&input.spans.length?beamGroupLayout(input):undefined,g=groundLayers(input.ground,lay?lay.L:input.length,lay?lay.W:input.width);
  next=withSiteWork({...next,lean:g.lean},{...(m.siteWork||emptySiteWork()),sand:g.sand,sheet:g.sheet,compaction:g.compaction});}
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
   if(main){
    set('rebar.main.count',main.count,'จำนวนเหล็กยืน');set('rebar.main.diameter',main.diameter,'ขนาดเหล็กยืน');
    const s=splitMainCount(main.count??0,next.width,next.depth);
    for(const k of ['corner','sideX','sideY'])next.rebar.main[k].diameter=main.diameter;
    next.rebar.main.corner.count=1;next.rebar.main.sideX.count=s.x;next.rebar.main.sideY.count=s.y;
   }
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
