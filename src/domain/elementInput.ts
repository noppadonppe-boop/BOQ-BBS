import {z} from 'zod';
import polygonClipping from 'polygon-clipping';
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
export const tiePatterns=['none','auto','crossX','crossY','crossXY','crossAlt','diamond','diamondCross','diamondRect','rectX','rectY','rectXY','rectCross','octagon','overlapX','overlapY','custom'] as const;
export type TiePattern=typeof tiePatterns[number];
const countLayer=z.object({count:z.number().int().min(0).max(200),diameter:dia}).strict();
const unit01=z.number().finite().min(0).max(1);
const step=z.number().int().min(-1).max(1);
/** Rect column section as drawn (column schedule): bar positions u (along X) / v (along Y) as fractions of the
 * bar-centre box (0 = outermost bar line), bundles of n bars touching along `dir` (steps −1/0/1 per axis, away from the
 * face), and the set-2 ties as closed rectangles around the bar centres u0..u1 × v0..v1. Overrides corner / side counts
 * and the tie pattern ('custom'). */
export const sectionLayoutSchema=z.object({
 bars:z.array(z.object({u:unit01,v:unit01,n:z.number().int().min(2).max(3).optional(),dir:z.tuple([step,step]).optional()}).strict()).min(1).max(200),
 ties:z.array(z.object({u0:unit01,v0:unit01,u1:unit01,v1:unit01}).strict()).max(40),
}).strict();
export type SectionLayout=z.infer<typeof sectionLayoutSchema>;
export const layoutBarCount=(l:SectionLayout)=>l.bars.reduce((n,b)=>n+(b.n||1),0);
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
 {code:'41',label:'ตัว U ขาขึ้นเต็มความลึก + งอเข้าใน Ldh สองปลาย (ฐานลึก)',formula:'A + B + C + D + (E) − 2r − 4d',ends:['return','return'],foundationOnly:true},
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
 main:z.object({corner:z.object({diameter:dia,count:z.number().int().min(1).max(3)}).strict(),sideX:countLayer,sideY:countLayer,diameter:dia,count:z.number().int().min(0).max(200),spacing:mm,
  /** rect: bar positions as drawn (overrides corner / side counts) */
  layout:sectionLayoutSchema.optional()}).strict(),
 /** pedestal ties: perimeter hoop + set-2 pattern (rect; 'custom' = ties of `main.layout`) at the same levels */
 tie:z.object({diameter:dia,spacing:mm,pattern:z.enum(tiePatterns).optional()}).strict(),
 embed:z.object({mode:z.enum(['standard','custom']),depth:mm}).strict(),
 bend:bendMode,leg:mm,
 /** Top end of the main bars: lap (plain end) or a mechanical coupler at the end (top + projection); stagger > 0 moves
  * every second bar up by that much (50 % per level). */
 splice:z.object({type:z.enum(['lap','coupler']),stagger:mm}).strict().default({type:'lap',stagger:0}),
 /** Offset of the section bounding-box centre from the footing bounding-box centre. */
 offsetX:z.number().finite().min(-100000).max(100000),offsetY:z.number().finite().min(-100000).max(100000),
}).strict();
export const footingShapes=['rect','circle','hex','oct','L','U'] as const;
export type FootingShape=typeof footingShapes[number];
export const pileTypes=['square','round','spun','I'] as const;
const pileSchema=z.object({
 type:z.enum(pileTypes),size:mm,
 layout:z.enum(['standard','grid','custom']),count:z.number().int().min(0).max(300),nx:z.number().int().min(1).max(20),ny:z.number().int().min(1).max(20),
 spacingX:mm,spacingY:mm,
 /** Ordered pile length (m), length cut from each pile head (mm), embedment of the head into the cap (mm). */
 length:z.number().finite().min(0).max(200),cutoff:mm,embed:mm,
 /** Offset of the pile-group centre from the footing bounding-box centre. */
 offsetX:z.number().finite().min(-100000).max(100000),offsetY:z.number().finite().min(-100000).max(100000),
 /** layout 'custom': pile centres (footing-local mm from the plan bounding-box corner) */
 positions:z.array(z.tuple([z.number().finite().min(-100000).max(100000),z.number().finite().min(-100000).max(100000)])).max(300).optional(),
}).strict();
/** Extra box on / cut from a footing (footing-local mm; z from the footing bottom). */
const footingBoxSchema=z.object({label:z.string().max(40),x0:z.number().finite().min(-100000).max(200000),y0:z.number().finite().min(-100000).max(200000),x1:z.number().finite().min(-100000).max(200000),y1:z.number().finite().min(-100000).max(200000),z0:mm,z1:mm,
 /** top bars of this block / lowered area when they differ from the footing top bars (both directions) */
 bars:z.object({diameter:dia,spacing:mm}).strict().optional(),
 /** upstand rib (blocks): `top.count` bars along the rib instead of the top mesh, inverted U links across it (legs down onto
  * the bottom mesh, feet `foot` mm turned outward) */
 rib:z.object({top:z.object({count:z.number().int().min(1).max(10),diameter:dia}).strict(),links:z.object({diameter:dia,spacing:mm,foot:mm}).strict().optional()}).strict().optional(),
 /** walls: vertical wall bars cast into the footing (both faces, from the bottom mesh up to the concrete top under the
  * wall + `lap`; 0 = lap length of the lap table) */
 dowels:z.object({diameter:dia,spacing:mm,lap:mm}).strict().optional()}).strict();
export type FootingBox=z.infer<typeof footingBoxSchema>;
export type PileInput=z.infer<typeof pileSchema>;
export type FootingColumn=z.infer<typeof footingColumnSchema>;

const frac2=z.number().finite().min(0).max(2);
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
 /** Lap length per bar diameter from the project spec (Class B = FTL table: `length` tension, `top` top bars with
  * more than 300 mm of concrete below); missing sizes use lap × d. `ldh` = development length of a standard 90° hook
  * (SHA column of the code table); absent = ACI 318 formula, see `hookDevLength()`. */
 lapTable:z.array(z.object({bar:dia,length:mm,top:mm.optional(),ldh:mm.optional()}).strict()).max(20).optional(),
 /** Spec the defaults were taken from (display only). */
 specRef:z.string().max(200).optional(),
 /** Beam top-bar extensions (× clear span) from the spec's typical beam details: end (discontinuous) / continuous support. */
 /** Steel grade per bar size from the project spec (e.g. Y12–Y20 SD40, Y25–Y32 SD50); overrides main / tie grade. */
 grades:z.array(z.object({bar:z.number().int().min(1).max(60),grade:z.string().trim().min(1).max(40)}).strict()).max(30).optional(),
 beam:z.object({topEnd:frac2,topCont:frac2,bottomZone:frac2,bottomEnd:frac2.optional(),bottomCont:frac2.optional(),stirrupZone:frac2.optional(),
  /** splices: ordinary frame or seismic special moment frame (no bottom laps within 2h of the face) */
  frame:z.enum(['ordinary','special']).optional()}).strict().optional(),
 /** Concrete mix of the member from the spec (display; f'c in ksc picks the lap table). */
 concrete:z.object({mix:z.string().max(24),name:z.string().max(80),fc:z.number().finite().min(0).max(2000)}).strict().optional(),
}).strict();
/** Lap length for diameter d: project-spec table (exact size, else the next larger size) or lap × d. */
/** Grade of a generated bar of diameter d: spec table (exact size, else the next larger size), else `fallback`. */
export function gradeFor(det:Detailing,d:number,fallback:string){
 const t=det.grades?.filter(r=>r.bar>=d-1e-6).sort((a,b)=>a.bar-b.bar)[0]||det.grades?.slice().sort((a,b)=>b.bar-a.bar)[0];
 return t?.grade||fallback;
}
export function lapLength(det:Detailing,d:number,top=false){
 const t=det.lapTable?.filter(r=>r.bar>=d-1e-6).sort((a,b)=>a.bar-b.bar)[0];
 return t&&top&&t.top&&t.top>0?t.top:t&&t.length>0?t.length:det.lap*d;
}
/** Ldh of a standard 90° hook in tension: spec table (SHA) if any, else ACI 318 0.24·fy/√f'c·db ≥ 8db, 150 mm
 * (f'c from the member concrete, 280 ksc when unset; fy by the bar grade), rounded up to 25 mm. */
export function hookDevLength(det:Detailing,d:number){
 const t=det.lapTable?.find(r=>Math.abs(r.bar-d)<1e-6);if(t?.ldh)return t.ldh;
 const g=gradeFor(det,d,det.mainGrade),fy=/SD50|500/.test(g)?5000:/SD30/.test(g)?3000:/SR24/.test(g)?2400:4000,fc=det.concrete?.fc||280;
 return Math.ceil(Math.max(.24*fy*.0981/Math.sqrt(fc*.0981)*d,8*d,150)/25)*25;
}
export type Detailing=z.infer<typeof detailingSchema>;
/** Preliminary detailing defaults: BS 8666:2000 Table 2 minimum former radius
 * (2d for d ≤ 16, 3.5d for d ≥ 20), ACI 318 standard hook extensions
 * (90° = 12d, 135° link = 6d ≥ 75 mm) and a 40d lap. Editable per member. */
export const DEFAULT_DETAILING:Detailing={mainGrade:'SD40',tieGrade:'SR24',bendSmall:2,bendLarge:3.5,tieBend:2,hook90:12,hook135:6,hook135Min:75,lap:40,stockLength:12000};

const base={
 version:z.literal(ELEMENT_INPUT_VERSION),
 mode:z.enum(['manual','drawing']),
 source:z.object({attachmentId:z.string().max(80),fileName:z.string().max(250),extractedAt:z.string().max(40)}).strict().optional(),
 detailing:detailingSchema,
 /** concrete mix id chosen for this member (missing = by member type in the spec) */
 concreteMix:z.string().max(24).optional(),
 appliedAt:z.string().max(40).optional(),
};
const level=z.number().finite().min(-1000).max(10000);
export const foundationSchema=z.object({...base,category:z.literal('Foundation'),
 foundationType:z.enum(['spread','pile']),
 /** Plan shape. hex/oct: width × length bounding box with corner chamfer (0 = regular); L/U: arm thicknesses as for columns. */
 shape:z.enum(footingShapes),diameter:mm,chamfer:mm,armX:mm,armY:mm,
 width:mm,length:mm,thickness:mm,
 pile:pileSchema,
 excavation:z.object({depth:mm,workingSpace:mm,slope:z.number().finite().min(0).max(5)}).strict(),
 lean:z.object({thickness:mm,projection:mm}).strict(),
 cover:z.object({bottom:mm,top:mm,side:mm}).strict(),
 /** side = horizontal closed loops around the footing perimeter (face reinforcement), spaced up the depth. */
 /** sideBars = vertical face bars around the perimeter (inside the side loops, outermost when there are none); ends straight or turned inward 90° (leg 0 = Ldh at the top, 15d at the bottom). */
 rebar:z.object({bottomX:meshLayer,bottomY:meshLayer,topX:optionalMesh,topY:optionalMesh,side:z.object({enabled:z.boolean(),diameter:dia,spacing:mm,
  /** pour stages that get loops (1 = first pour); empty = every stage */
  stages:z.array(z.number().int().min(1).max(6)).max(6),
  /** laps of each loop: pattern 1 / 2 / 3 = lap at the middle of the longest side / + the opposite side / every side;
   * custom = lap centres `at` (mm along the loop from the lower-left corner, counter-clockwise); lap length x = lap table,
   * standard hook (hook90·d) or `value`. No piece may be longer than 10 m (pattern 1 → 2 → 3). Absent = pattern 1. */
  laps:z.object({pattern:z.enum(['1','2','3','custom']),length:z.enum(['lap','hook','custom']),value:mm,at:z.array(mm).max(10)}).strict().optional()}).strict(),
  sideBars:z.object({enabled:z.boolean(),diameter:dia,spacing:mm,top:z.enum(['straight','inward']),bottom:z.enum(['straight','inward']),leg:mm,
   /** stop under the first construction joint (first pour only) instead of the footing top */
   toJoint:z.boolean().optional(),
   /** faces parallel to Y get their own size / spacing (the main values then apply to the faces parallel to X); absent = same all round */
   y:z.object({diameter:dia,spacing:mm}).strict().optional()}).strict(),
  /** closed links (STIRRUPS / HOOP) across a band of `width` (out-to-out, centred) running along `dir` (e.g. the strip over a pile row),
   * from the bottom cover up to under the top of the first pour stage */
  stirrups:z.object({enabled:z.boolean(),diameter:dia,spacing:mm,width:mm,dir:z.enum(['x','y']),
   /** the links are the bottom bars across the band (HOOP = bottom bars of that direction): that bottom layer is not placed
    * and the other bottom layer sits inside the links */
   replacesBottom:z.boolean().optional()}).strict().optional()}).strict(),
 /** Footing cast monolithic with the floor slab: top flush with the slab top; the slab (thickness) is a
  * reference region only (no slab concrete / bars); top bars extend `extend` mm beyond the footing into the slab. */
 slab:z.object({enabled:z.boolean(),thickness:mm,extend:mm}).strict(),
 column:footingColumnSchema,
 /** Reference levels (m): natural ground (NGL) and top of footing. Enabled = excavation depth is computed
  * from the levels down to the bottom of the lowest sub-base layer (lean, or sand under it). */
 /** Columns 2–10 on the same footing (C1 = `column`): own number and offsets; linked = same section,
  * bars and height as C1. All columns share C1's type (pedestal / starter). */
 extraColumns:z.array(footingColumnSchema.extend({linked:z.boolean()}).strict()).max(9),
 /** Project Foundation Template the input came from (display) */
 /** linked Foundation Template; stage1 = only the first pour stage of a 2-stage type (`templateFields`) */
 template:z.object({id:z.string().max(40),name:z.string().max(40),stage1:z.boolean().optional()}).strict().optional(),
 /** extra concrete boxes (raised parts, blocks of a later pour over part of the plan): own top mesh, loops and face bars */
 blocks:z.array(footingBoxSchema).max(80).optional(),
 /** lowered areas cut out of the footing top (z0 = top of that area, z1 = footing thickness): own top mesh */
 cuts:z.array(footingBoxSchema).max(20).optional(),
 /** RC walls standing on the footing (z0 = base, z1 = top shown): reference only (wall bars on the wall drawings) */
 walls:z.array(footingBoxSchema).max(30).optional(),
 /** embedded / extra BOQ items of the footing (e.g. anchor bolts): site-work items `gen-item-<k>`, rebuilt on apply */
 items:z.array(z.object({label:z.string().trim().min(1).max(120),unit:z.string().trim().min(1).max(12),quantity:z.number().finite().nonnegative().max(1e9),note:z.string().max(200).optional()}).strict()).max(10).optional(),
 /** ref = which face carries the given level: top of footing (`top`) or bottom of footing (`bottom`); the other follows
  * from the thickness. Levels in m, + above / − below the project datum. */
 levels:z.object({enabled:z.boolean(),ground:level,ref:z.enum(['top','bottom']),top:level,bottom:level}).strict(),
 /** Sub-base under the footing: sand bed (projection per side from the footing edge), plastic sheet
  * (= lean area, or sand area without lean), compaction of the whole pit bottom. */
 subbase:z.object({sand:z.object({enabled:z.boolean(),thickness:mm,projection:mm}).strict(),sheet:z.object({enabled:z.boolean()}).strict(),compaction:z.object({enabled:z.boolean()}).strict()}).strict(),
 /** Concrete pour stages: `count` stages from the footing bottom; `heights` = height of stages 1 … count−1 (mm),
  * the last stage takes the rest up to the top of the pedestals. */
 pour:z.object({count:z.number().int().min(1).max(6),heights:z.array(mm).max(5),
  /** bars at each construction joint k (between stage k+1 and k+2): a mesh at the top of the lower stage or the
   * bottom of the upper stage (`cover` from the joint), and vertical bars through the joint (embed `below` into the
   * lower stage, up to under the top layer of the upper stage; legs in multiples of d) */
  joints:z.array(z.object({
   mesh:z.object({enabled:z.boolean(),at:z.enum(['lower','upper']),cover:mm,
    /** bar ends: straight, standard 90° bend, or a 90° bend with leg `leg` (mm); lower-stage mesh bends down, upper-stage mesh up */
    end:z.enum(['straight','standard','custom']),leg:mm,x:z.object({diameter:dia,spacing:mm}).strict(),y:z.object({diameter:dia,spacing:mm}).strict()}).strict(),
   dowel:z.object({enabled:z.boolean(),diameter:dia,spacingX:mm,spacingY:mm,below:mm,shape:z.enum(['00','11','21','z']),topLeg:mm,bottomLeg:mm}).strict(),
  }).strict()).max(5)}).strict(),
}).strict();
export const DEFAULT_FOOTING_LEVELS={enabled:false,ground:0,ref:'top' as 'top'|'bottom',top:-1.2,bottom:-1.8};
export const DEFAULT_JOINT_REBAR={mesh:{enabled:false,at:'lower' as 'lower'|'upper',cover:50,end:'straight' as 'straight'|'standard'|'custom',leg:300,x:{diameter:16,spacing:250},y:{diameter:16,spacing:250}},
 dowel:{enabled:false,diameter:16,spacingX:500,spacingY:500,below:400,shape:'z' as '00'|'11'|'21'|'z',topLeg:15,bottomLeg:12}};
export const DEFAULT_FOOTING_POUR={count:1,heights:[] as number[],joints:[] as (typeof DEFAULT_JOINT_REBAR)[]};
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
/** Pour stages of a footing: total height (footing + highest pedestal) and each stage's bottom / top (mm from the
 * footing bottom); the last stage ends at the top. */
export function footingPour(i:FoundationInput){
 const ped=i.column.type==='pedestal',total=Math.max(i.thickness+(ped?Math.max(0,...footingColumns(i).map(c=>c.height)):0),...(i.blocks||[]).map(b=>b.z1));
 const n=Math.max(1,i.pour.count),hs=Array.from({length:n-1},(_,k)=>i.pour.heights[k]??0);let z=0;
 const stages=hs.map((h,k)=>{const z0=z;z+=h;return {stage:k+1,z0,z1:z,height:h};});
 stages.push({stage:n,z0:z,z1:total,height:total-z});
 return {total,stages,levels:stages.slice(0,-1).map(s=>s.z1)};
}
/** Levels (m) of the top and bottom of the footing from the chosen reference face. */
export function footingLevels(i:FoundationInput){
 const T=i.thickness/1000,top=i.levels.ref==='bottom'?i.levels.bottom+T:i.levels.top;return {top,bottom:top-T};
}
/** Joint bars of joint k (defaults when not set yet). */
export const jointRebar=(i:FoundationInput,k:number)=>i.pour.joints[k]??DEFAULT_JOINT_REBAR;
export function footingEarth(i:FoundationInput){
 const {w:X,d:Y}=footingExtent(i),sb=i.subbase,lean=i.lean.thickness,sand=sb.sand.enabled?sb.sand.thickness:0,below=lean+sand;
 const depth=i.levels.enabled?Math.max(0,Math.round((i.levels.ground-footingLevels(i).top)*1000+i.thickness+below)):i.excavation.depth;
 const lx=X+2*i.lean.projection,ly=Y+2*i.lean.projection,sx=X+2*sb.sand.projection,sy=Y+2*sb.sand.projection;
 const bx=Math.max(lean>0?lx:0,sand>0?sx:0,X+2*i.excavation.workingSpace),by=Math.max(lean>0?ly:0,sand>0?sy:0,Y+2*i.excavation.workingSpace),grow=2*depth*i.excavation.slope;
 const sheet=sb.sheet.enabled?(lean>0?[lx,ly]:sand>0?[sx,sy]:[X,Y]):[0,0];
 return {X,Y,lean,sand,below,depth,lx,ly,sx,sy,bx,by,grow,sheet,
  /** levels (m) of the pit bottom and of the footing bottom */
  bottomLevel:i.levels.enabled?footingLevels(i).bottom-below/1000:undefined};
}
export const DEFAULT_FOOTING_SLAB={enabled:false,thickness:150,extend:1000};
export const DEFAULT_FOOTING_SIDE={enabled:false,diameter:16,spacing:200,stages:[] as number[]};
export const DEFAULT_FOOTING_SIDE_BARS={enabled:false,diameter:16,spacing:200,top:'inward' as const,bottom:'straight' as const,leg:0};
/** Main-bar end condition at the column bottom / top joint.
 * none = stops at cover; lap = straight extension of `lap` beyond the joint;
 * crank = 1:6 crank inward by one bar diameter starting at the joint level (top of column
 * going up / bottom of column going down), then `lap` extension. lap 0 = detailing lap × d. */
/** coupler: the bar ends at a mechanical coupler `lap` mm above the joint (top: z = H + lap, bottom: z = lap); a top
 * coupler is counted in the BOQ, a bottom one belongs to the element below. */
const columnEnd=z.object({mode:z.enum(['none','lap','crank','coupler']),lap:mm}).strict();
export type ColumnEnd=z.infer<typeof columnEnd>;
/** Ties in three zones: lower (from the bottom), middle (`spacing`, remaining height), upper (to the top). Zone length 0 = no zone. */
const tieZone=z.object({length:mm,spacing:mm}).strict();
/** Set 2 (supplementary ties inside the perimeter hoop): pattern and spacing per zone, own diameter. */
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
 custom:{label:'ตามแบบ (ตารางหน้าตัดเสา)',hint:'ปลอกในตามรูปหน้าตัดในแบบ: ปลอกสี่เหลี่ยมรอบเหล็กตามตำแหน่งที่กำหนดใน Template'},
};
const innerZone=z.object({pattern:z.enum(tiePatterns),spacing:mm}).strict();
export type TieZoneKey='lower'|'middle'|'upper';
export const tieZoneKeys:readonly (readonly [TieZoneKey,string])[]=[['lower','โซนล่าง'],['middle','โซนกลาง'],['upper','โซนบน']];
/** Column main bars. Rect: corner bundles (1–3 bars per corner) + bars per X face (bottom/top) and
 * per Y face (left/right), equal on opposite faces and evenly spaced. Circle: `count` × `diameter`. */
const columnMain=z.object({corner:z.object({diameter:dia,count:z.number().int().min(1).max(3)}).strict(),sideX:countLayer,sideY:countLayer,diameter:dia,count:z.number().int().min(0).max(200),
 /** side bars in bundles of 2 (pairs side by side along the face): side counts are bars, positions = count / 2 */
 sideBundle:z.number().int().min(1).max(2).optional(),
 /** bar positions + set-2 ties as drawn (column schedule); overrides corner / side counts */
 layout:sectionLayoutSchema.optional()}).strict();
/** Bars per X face / per Y face (excluding corners) for `n` bars spread proportionally on a w × d section. */
export function splitMainCount(n:number,w:number,d:number){const extra=Math.max(0,n-4),inX=Math.round(extra*w/((w+d)||1)/2)*2||0;return {x:inX/2,y:Math.ceil((extra-inX)/2)};}
const columnTie=z.object({diameter:dia,spacing:mm,lower:tieZone,upper:tieZone,
 inner:z.object({diameter:dia,lower:innerZone,middle:innerZone,upper:innerZone}).strict()}).strict();
/** One storey of a column stack (column table row): floor-to-floor height, beam depth at its top (joint),
 * rectangular section, main bars, ties as on the drawings `nYd@S1(d@S2)`: n pieces per set (check), pattern of the
 * inner ties, S1 mid-height spacing, S2 end-zone spacing. */
const columnStoreySchema=z.object({name:z.string().trim().max(40),height:mm,beamDepth:mm,width:mm,depth:mm,main:columnMain,
 tie:z.object({diameter:dia,sets:z.number().int().min(0).max(30),pattern:z.enum(tiePatterns),s1:mm,s2:mm}).strict()}).strict();
export type ColumnStorey=z.infer<typeof columnStoreySchema>;
const columnStackSchema=z.object({storeys:z.array(columnStoreySchema).max(20),
 /** bars from the footing: embedment below the top of footing (to the bottom mesh), 12d hook outward */
 footing:z.object({enabled:z.boolean(),depth:mm}).strict(),
 /** top of the last storey: F.T.A (12d inward) or stop at cover */
 top:z.enum(['fta','none']),
 /** main bar joints in every storey: mechanical couplers (50 %, groups `stagger` apart) or laps */
 splice:z.object({type:z.enum(['coupler','lap']),stagger:mm}).strict(),
 /** tie end zones as divisors of the clear height (first storey on the footing / others); default H/3 · H/6 and H/6 · H/6 */
 zones:z.object({first:z.object({lower:z.number().min(1).max(20),upper:z.number().min(1).max(20)}).strict(),typical:z.object({lower:z.number().min(1).max(20),upper:z.number().min(1).max(20)}).strict()}).strict().optional()}).strict();
export const DEFAULT_COLUMN_STACK={storeys:[],footing:{enabled:true,depth:900},top:'fta' as const,splice:{type:'coupler' as const,stagger:1000}};
/** Column pour (single column): one stage, or two with a construction joint below the beam framing in at the top.
 * Levels in m: `bottom` = bottom of column (top = bottom + height); joint = top − `beam` (mode beam) or the level `joint`. */
const lvl=z.number().finite().min(-1000).max(1000);
const columnPourSchema=z.object({stages:z.union([z.literal(1),z.literal(2)]),bottom:lvl,mode:z.enum(['beam','level']),beam:mm,joint:lvl}).strict();
export const DEFAULT_COLUMN_POUR={stages:1 as 1|2,bottom:0,mode:'beam' as 'beam'|'level',beam:600,joint:2.4};
const columnSchema=z.object({...base,category:z.literal('Column'),
 shape:z.enum(['rect','circle']),width:mm,depth:mm,diameter:mm,height:mm,
 cover:z.object({side:mm}).strict(),
 rebar:z.object({main:columnMain,tie:columnTie,bottom:columnEnd,top:columnEnd}).strict(),
 /** single = one storey (fields above); stack = one column mark over several storeys (column table) */
 layout:z.enum(['single','stack']),
 stack:columnStackSchema,
 pour:columnPourSchema.default({...DEFAULT_COLUMN_POUR}),
 /** Project Column Template the section came from (row −1 = whole table → stack); linked = re-applied when the spec changes */
 template:z.object({id:z.string().max(40),name:z.string().max(40),row:z.number().int().min(-1).max(19),beam:mm,linked:z.boolean()}).strict().optional(),
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
/** Sections of a beam mark, as in the beam details: END = at a discontinuous support, MID = mid-span, CON = at a
 * continuous support, CANT = cantilever span. Main bars run through all sections; EX = extra bars of that section. */
export const beamZones=['end','mid','con','cant'] as const;
export type BeamZone=typeof beamZones[number];
const zoneBars=z.object({top:countLayer,bottom:countLayer}).strict();
export const beamRebarSchema=z.object({top:countLayer,bottom:countLayer,
 ex:z.object({end:zoneBars,mid:zoneBars,con:zoneBars,cant:zoneBars}).strict(),
 /** stirrups: legs (2 = one closed link, 4 = outer + inner link …) and spacing per section */
 stirrup:z.object({diameter:dia,legs:z.number().int().min(2).max(8),spacing:z.object({end:mm,mid:mm,con:mm,cant:mm}).strict()}).strict(),
 /** side face bars: count per face (between top and bottom bars), cross ties across the width */
 side:z.object({count:z.number().int().min(0).max(20),diameter:dia,tie:spacingLayer}).strict()}).strict();
export type BeamRebar=z.infer<typeof beamRebarSchema>;
/** One span of a beam group, grid to grid (cantilever: grid to tip). `top` = top of beam from the group datum
 * (mm, − = dropped). Sections END / MID / CON / CANT are chosen by the span's position. */
const beamSpanSchema=z.object({mark:z.string().trim().min(1).max(32),kind:z.enum(['span','cantilever']),length:mm,width:mm,depth:mm,
 top:z.number().finite().min(-20000).max(20000),rebar:beamRebarSchema,
 /** Project Beam Template the span follows (spec.beamTemplates id; re-applied when the spec changes) */
 template:z.string().max(40).optional()}).strict();
/** Grid line: label, support (column) width along the beam (0 = no column, e.g. on a girder / free end), column size
 * across the beam `supportY` (0 = same as `support`), extra top bars over the support (count 0 = none). */
const beamGridSchema=z.object({label:z.string().trim().max(20),support:mm,supportY:mm.default(0),extraTop:countLayer}).strict();
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
export const elementInputUnion=z.discriminatedUnion('category',[foundationSchema,columnSchema,beamSchema,slabSchema,wallSchema]);
export const elementInputSchema=z.preprocess(migrateElementInput,elementInputUnion);
export type ElementInput=z.infer<typeof elementInputUnion>;
export const DEFAULT_FOOTING_COLUMN:FootingColumn={type:'none',columnNo:'',shape:'rect',width:400,depth:400,diameter:400,armX:250,armY:250,height:600,projection:800,cover:40,main:{corner:{diameter:16,count:1},sideX:{diameter:16,count:1},sideY:{diameter:16,count:1},diameter:16,count:8,spacing:200},tie:{diameter:9,spacing:200},embed:{mode:'standard',depth:0},bend:'standard',leg:0,splice:{type:'lap',stagger:0},offsetX:0,offsetY:0};
export const DEFAULT_PILE:PileInput={type:'square',size:300,layout:'standard',count:4,nx:2,ny:2,spacingX:900,spacingY:900,length:12,cutoff:500,embed:75,offsetX:0,offsetY:0};
/** Version 1 stored input (pedestal box + single end-hook flag) → version 2. */
function migrateElementInput(raw:unknown):unknown{
 if(!raw||typeof raw!=='object')return raw;
 if((raw as any).version===1)return migrateFootingPour(migrateColumnStack(migrateBeamSpans(migrateGround(migrateFootingSite(migrateFootingSlab(migrateShapes(migrateV2Column(migrateV2Foundation(migrateV1(raw))))))))));
 return migrateFootingPour(migrateColumnStack(migrateBeamSpans(migrateGround(migrateFootingSite(migrateFootingSlab(migrateShapes(migrateV2Column(migrateV2Foundation(raw)))))))));
}
/** Slabs / beams saved before the on-ground option → elevated (same quantities); beams → single span. */
function migrateGround(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Slab'&&raw.category!=='Beam'||'ground' in raw)return raw;
 const v={...structuredClone(raw),ground:structuredClone(DEFAULT_GROUND)};
 if(raw.category==='Beam'){v.layout??='single';v.grids??=[];v.spans??=[];}
 return v;
}
/** Beam-group spans saved before sections END / MID / CON / CANT → no extras, same stirrup spacings, no side bars. */
function migrateBeamSpans(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Beam'||!Array.isArray(raw.spans)||raw.spans.every((s:any)=>s?.rebar?.ex))return raw;
 const v=structuredClone(raw),none={count:0,diameter:16},zone=()=>({top:{...none},bottom:{...none}});
 v.spans=v.spans.map((s:any)=>{if(s?.rebar?.ex)return s;const st=s.rebar?.stirrup||{},end=st.endSpacing>0?st.endSpacing:st.spacing??200;
  return {...s,rebar:{top:s.rebar?.top??{...none},bottom:s.rebar?.bottom??{...none},ex:{end:zone(),mid:zone(),con:zone(),cant:zone()},
   stirrup:{diameter:st.diameter??9,legs:2,spacing:{end,mid:st.spacing??200,con:end,cant:end}},side:{count:0,diameter:12,tie:{diameter:9,spacing:600}}}};});
 return v;
}
/** Columns saved before the column stack → single storey (same bars). */
function migrateColumnStack(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Column'||'layout' in raw&&'stack' in raw)return raw;
 return {...structuredClone(raw),layout:raw.layout??'single',stack:raw.stack??structuredClone(DEFAULT_COLUMN_STACK)};
}
/** Footings saved before reference levels / sub-base layers → levels off, no sand / sheet / compaction (same quantities). */
function migrateFootingSite(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Foundation'||'levels' in raw&&'subbase' in raw&&'extraColumns' in raw)return raw;
 const v=structuredClone(raw);v.levels??={...DEFAULT_FOOTING_LEVELS};v.subbase??=structuredClone(DEFAULT_FOOTING_SUBBASE);v.extraColumns??=[];return v;
}
/** Footings saved before pour stages / joint bars / the level reference → one pour, no joint bars, level given at the top. */
function migrateFootingPour(raw:any):unknown{
 if(raw?.version!==2||raw.category!=='Foundation'||'pour' in raw&&'joints' in raw.pour&&raw.pour.joints.every((j:any)=>'end' in (j?.mesh||{}))&&(!raw.rebar?.side||'stages' in raw.rebar.side)&&(!raw.levels||'ref' in raw.levels))return raw;
 const v=structuredClone(raw);v.pour??=structuredClone(DEFAULT_FOOTING_POUR);if(v.rebar?.side&&!('stages' in v.rebar.side))v.rebar.side={...v.rebar.side,stages:[]};v.pour.joints??=[];for(const j of v.pour.joints)if(j?.mesh&&!('end' in j.mesh))j.mesh={...j.mesh,end:'straight',leg:300};
 if(v.levels&&!('ref' in v.levels))v.levels={...v.levels,ref:'top',bottom:Number(((v.levels.top??0)-(v.thickness??0)/1000).toFixed(3))};
 return v;
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
/** Column pour levels: joint height `z` (mm from the column bottom), levels (m) and whether two stages apply. */
export function columnPour(i:ColumnInput){
 const p=i.pour??DEFAULT_COLUMN_POUR,H=i.height,z=p.mode==='beam'?H-p.beam:(p.joint-p.bottom)*1000;
 return {on:p.stages===2&&z>0&&z<H,z,bottom:p.bottom,joint:p.bottom+z/1000,top:p.bottom+H/1000};
}
export type BeamInput=z.infer<typeof beamSchema>;
export type SlabInput=z.infer<typeof slabSchema>;
export type WallInput=z.infer<typeof wallSchema>;

/** `spec` = project spec: detailing defaults (bends, laps, grade) follow the project's General Spec. */
export function defaultElementInput(category:InputCategory,mode:'manual'|'drawing'='manual',spec?:Spec):ElementInput{
 const common={version:ELEMENT_INPUT_VERSION,mode,detailing:spec?detailingFromSpec(spec,{...DEFAULT_DETAILING},{category}):{...DEFAULT_DETAILING}};
 switch(category){
  case 'Foundation':return {...common,category,foundationType:'spread',shape:'rect',diameter:2400,chamfer:0,armX:800,armY:800,width:2400,length:2400,thickness:600,pile:structuredClone(DEFAULT_PILE),excavation:{depth:1500,workingSpace:300,slope:0},lean:{thickness:50,projection:100},cover:{bottom:75,top:50,side:75},rebar:{bottomX:{diameter:16,spacing:150,shape:'21',leg:0,radius:0},bottomY:{diameter:16,spacing:150,shape:'21',leg:0,radius:0},topX:{enabled:false,diameter:12,spacing:200,shape:'00',leg:0,radius:0},topY:{enabled:false,diameter:12,spacing:200,shape:'00',leg:0,radius:0},side:{...DEFAULT_FOOTING_SIDE},sideBars:{...DEFAULT_FOOTING_SIDE_BARS}},slab:{...DEFAULT_FOOTING_SLAB},column:structuredClone(DEFAULT_FOOTING_COLUMN),extraColumns:[],levels:{...DEFAULT_FOOTING_LEVELS},subbase:structuredClone(DEFAULT_FOOTING_SUBBASE),pour:structuredClone(DEFAULT_FOOTING_POUR)};
  case 'Column':return {...common,category,shape:'rect',width:400,depth:400,diameter:400,height:3000,cover:{side:40},rebar:{main:{corner:{diameter:20,count:1},sideX:{diameter:20,count:1},sideY:{diameter:20,count:1},diameter:20,count:8},tie:{diameter:9,spacing:150,lower:{length:600,spacing:100},upper:{length:600,spacing:100},inner:{diameter:9,lower:{pattern:'auto',spacing:100},middle:{pattern:'auto',spacing:150},upper:{pattern:'auto',spacing:100}}},bottom:{mode:'none',lap:0},top:{mode:'lap',lap:0}},layout:'single',stack:structuredClone(DEFAULT_COLUMN_STACK),pour:{...DEFAULT_COLUMN_POUR}};
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
   need(input.thickness,'ความหนาฐานราก');if(!input.levels.enabled)need(input.excavation.depth,'ความลึกงานขุด');
   need(input.cover.bottom,'cover ด้านล่าง');need(input.cover.top,'cover ด้านบน');need(input.cover.side,'cover ด้านข้าง');
   layer(input.rebar.bottomX,'เหล็กล่างทิศ X');layer(input.rebar.bottomY,'เหล็กล่างทิศ Y');
   if(input.rebar.topX.enabled)layer(input.rebar.topX,'เหล็กบนทิศ X');if(input.rebar.topY.enabled)layer(input.rebar.topY,'เหล็กบนทิศ Y');
   const ext=footingExtent(input);
   fits(input.thickness,input.cover.bottom,input.cover.top,'ความหนาฐานราก');fits(Math.min(ext.w,ext.d,...(input.shape==='L'||input.shape==='U'?[input.armX,input.armY]:[])),input.cover.side,input.cover.side,'ขนาดฐานราก');
   if(input.foundationType==='pile'){
    const pl=input.pile;need(pl.size,'ขนาดเสาเข็ม');need(pl.length,'ความยาวเสาเข็ม');
    if(pl.layout==='standard'&&pl.count<1)p.push('ระบุจำนวนเสาเข็ม');
    if(pl.layout==='custom'&&!(pl.positions||[]).length)p.push('ระบุตำแหน่งเสาเข็ม (กำหนดเอง)');
    if(pl.layout!=='custom'&&(pl.layout==='grid'?pl.nx*pl.ny:pl.count)>1)need(pl.spacingX,'ระยะห่างเสาเข็ม');
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
   if(input.rebar.sideBars.enabled){const sb=input.rebar.sideBars;layer(sb,sb.y?'เหล็กแนวตั้งผิวข้าง ผิวด้าน X':'เหล็กแนวตั้งผิวข้าง');if(sb.y)layer(sb.y,'เหล็กแนวตั้งผิวข้าง ผิวด้าน Y');if(input.shape==='circle')p.push('เหล็กแนวตั้งผิวข้าง: ฐานกลมยังไม่รองรับ');}
   for(const [list,kind] of [[input.blocks||[],'ส่วนเพิ่ม'],[input.cuts||[],'ส่วนลดระดับ']] as const)list.forEach((b,k)=>{const nm=`${kind} ${b.label||k+1}`;if(b.x1<=b.x0||b.y1<=b.y0||b.z1<=b.z0)p.push(`${nm}: ขนาดต้องมากกว่า 0 (x1 > x0, y1 > y0, z1 > z0)`);else if(b.x0<-.5||b.y0<-.5||b.x1>ext.w+.5||b.y1>ext.d+.5)p.push(`${nm}: อยู่นอกแปลนฐาน`);if(kind==='ส่วนลดระดับ'&&(b.z1<input.thickness-.5||b.z0<0))p.push(`${nm}: ต้องตัดจากผิวบนฐาน (z1 = ความหนาฐาน ${input.thickness}, z0 ≥ 0 · z0 = 0 = ไม่มีคอนกรีต เช่น มุมที่ตัดออกของแปลนรูปตัว L)`);});
   if(footingOpenings(input).length&&footingArea(input)<1)p.push('ส่วนที่ตัดออกทั้งความหนาคลุมแปลนฐานทั้งหมด');
   if(input.slab.enabled){need(input.slab.thickness,'ความหนาพื้นที่หล่อรวมกับฐาน');if(input.shape!=='rect')p.push('ฐานหล่อรวมพื้น: รองรับแปลนสี่เหลี่ยมเท่านั้น');if(input.slab.thickness>=input.thickness)p.push('ความหนาพื้นต้องน้อยกว่าความหนาฐาน');}
   const earth=footingEarth(input);
   if(input.subbase.sand.enabled)need(input.subbase.sand.thickness,'ความหนาทรายรองพื้น');
   if(input.pour.count>1){const pr=footingPour(input);pr.stages.slice(0,-1).forEach(s=>need(s.height,`ความสูงการเท Stage ${s.stage}`));
    if(pr.stages.at(-1)!.height<=0)p.push(`ความสูงการเท Stage 1–${input.pour.count-1} รวม ${Math.round(pr.stages.at(-1)!.z0)} mm ต้องน้อยกว่าความสูงฐาน + ตอม่อ ${Math.round(pr.total)} mm`);}
   // with levels the top of footing may sit above NGL (e.g. level with the floor slab); a typed depth must clear the footing
   if(!input.levels.enabled&&earth.depth>0&&earth.depth<input.thickness+earth.below)p.push(`ความลึกงานขุดน้อยกว่าความหนาฐานราก + Lean${earth.sand?' + ทราย':''}`);
   break;}
  case 'Column':{
   if(input.layout==='stack'){
    const S=input.stack.storeys;need(input.cover.side,'cover');if(!S.length){p.push('เพิ่มชั้นของเสาอย่างน้อย 1 ชั้น');break;}
    if(input.stack.footing.enabled)need(input.stack.footing.depth,'ระยะฝังในฐานราก');if(input.stack.splice.type==='coupler')need(input.stack.splice.stagger,'ระยะเหลื่อม Coupler');
    S.forEach((s,k)=>{const nm=s.name||`ชั้น ${k+1}`;need(s.width,`${nm}: กว้าง X`);need(s.depth,`${nm}: ลึก Y`);need(s.height,`${nm}: ความสูงชั้น`);
     if(s.beamDepth>=s.height)p.push(`${nm}: ความลึกคานต้องน้อยกว่าความสูงชั้น`);fits(Math.min(s.width,s.depth),input.cover.side,input.cover.side,`${nm}: หน้าตัด`);
     need(s.main.corner.diameter,`${nm}: ขนาดเหล็กมุม`);need(s.tie.diameter,`${nm}: ขนาดปลอก`);need(s.tie.s1,`${nm}: ระยะปลอก S1`);need(s.tie.s2,`${nm}: ระยะปลอก S2`);
     if(k>0){const b=S[k-1];if(s.width>b.width||s.depth>b.depth)p.push(`${nm}: หน้าตัดใหญ่กว่าชั้นล่าง · เหล็กฝังลงเสาชั้นล่างวางไม่ได้ ตรวจแบบ`);}});
    break;}
   if(input.shape==='rect'){need(input.width,'ความกว้างเสา (X)');need(input.depth,'ความลึกเสา (Y)');fits(Math.min(input.width,input.depth),input.cover.side,input.cover.side,'หน้าตัดเสา');}
   else{need(input.diameter,'เส้นผ่านศูนย์กลางเสา');fits(input.diameter,input.cover.side,input.cover.side,'หน้าตัดเสา');}
   need(input.height,'ความสูงเสา');need(input.cover.side,'cover');
   if(input.pour?.stages===2&&input.height>0&&!columnPour(input).on)p.push('ระดับรอยต่อการเท (Stage 1 / 2) ต้องอยู่ระหว่างระดับล่างและระดับบนของเสา');
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
     need(s.rebar.stirrup.diameter,`${nm}: ขนาดเหล็กปลอก`);
     const zs:BeamZone[]=s.kind==='cantilever'?['cant']:[k>0?'con':'end','mid',k<sp.length-1?'con':'end'];
     for(const z of zs){need(s.rebar.stirrup.spacing[z],`${nm}: ระยะปลอก ${z.toUpperCase()}`);for(const l of ['top','bottom'] as const)if(s.rebar.ex[z][l].count>0)need(s.rebar.ex[z][l].diameter,`${nm}: ขนาดเหล็กเสริม ${l==='top'?'บน':'ล่าง'} ${z.toUpperCase()}`);}
     if(s.rebar.side.count>0)need(s.rebar.side.diameter,`${nm}: ขนาดเหล็กข้าง`);
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

/** Standard hook of every stirrup / tie (closed link, hoop): Ø ≤ 9 mm → 135° hook with
 * extension hook135·d ≥ hook135Min; Ø ≥ 10 mm → 90° hook with extension hook90·d. */
export const tieHook=(d:number,det:Detailing)=>d<10?{angle:135 as const,ext:Math.max(det.hook135*d,det.hook135Min)}:{angle:90 as const,ext:det.hook90*d};
export const tieHookLabel=(d:number,det:Detailing)=>{const h=tieHook(d,det);return h.angle===135?`ขอ 135° (${Math.round(h.ext)} mm)`:`งอฉาก 90° (${Math.round(h.ext)} mm)`;};
/** Closed rectangular link in the plane of axes u/v at `at` on axis w, closed at the
 * first corner with the standard hooks of `tieHook` wrapped around the corner bar: 90° hook
 * legs run along the adjacent sides, one bar diameter `d` inside them; 135° hook tails run
 * diagonally into the core, `d` apart so the ends do not coincide. */
function link(u:number,v:number,w:number,u0:number,u1:number,v0:number,v1:number,at:number,det:Detailing,rad:number,d:number):V3[]{
 const p=(a:number,b:number):V3=>{const r:V3=[0,0,0];r[u]=a;r[v]=b;r[w]=at;return r;};
 const {angle,ext}=tieHook(d,det);
 if(angle===135){
  // straight extension + tangent of the 135° bend (r·tan 67.5°), along the 45° diagonal
  const t=Math.min((ext+rad*(1+Math.SQRT2))/Math.SQRT2,(u1-u0)/2,(v1-v0)/2),q=d/(2*Math.SQRT2);
  return [p(u0+t+q,v0+t-q),p(u0,v0),p(u1,v0),p(u1,v1),p(u0,v1),p(u0,v0),p(u0+t-q,v0+t+q)];
 }
 // `ext` is the straight extension after the 90° bend; add the bend tangent length.
 const k=Math.min(ext+rad,u1-u0,v1-v0);
 return [p(u0+d,v0+k),p(u0,v0),p(u1,v0),p(u1,v1),p(u0,v1),p(u0,v0),p(u0+k,v0+d)];
}
/** Closed polygonal link (plan) closed at vertex 0 with two hooks: 90° hooks bent along the
 * adjacent edges, one bar diameter `d` inside them; 135° hooks turned into the core, `d` apart. */
function polyLink(poly:Pt[],ext:number,rad:number,d:number,angle:90|135=90):Pt[]{
 const p0=poly[0],p1=poly[1],pl=poly.at(-1)!,len=(a:Pt,b:Pt)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
 const dir=(a:Pt,b:Pt):Pt=>{const l=len(a,b)||1;return [(b[0]-a[0])/l,(b[1]-a[1])/l];};
 const e1=dir(p0,p1),e0=dir(p0,pl);
 if(angle===135){
  // turn 135° toward the inside (left of travel for CCW, right for CW)
  const s=signedArea(poly)>=0?1:-1,c=Math.cos(3*Math.PI/4),sn=s*Math.sin(3*Math.PI/4),rot=(a:Pt,k:number):Pt=>[a[0]*c-k*a[1]*sn,k*a[0]*sn+a[1]*c];
  const L=Math.min(ext+rad*(1+Math.SQRT2),len(p0,p1),len(p0,pl)),te=rot([-e0[0],-e0[1]],1),ts=rot(e1,-1),n:Pt=[-te[1]*d/2,te[0]*d/2];
  return [[p0[0]-ts[0]*L+n[0],p0[1]-ts[1]*L+n[1]],...poly,p0,[p0[0]+te[0]*L-n[0],p0[1]+te[1]*L-n[1]]];
 }
 const turn=Math.PI-Math.acos(Math.max(-1,Math.min(1,e0[0]*e1[0]+e0[1]*e1[1])));
 const trim=rad*Math.tan(turn/2),k=Math.max(trim+1,Math.min(ext+trim,Math.min(len(p0,p1),len(p0,pl))-rad));
 return [[p0[0]+e0[0]*k+e0[1]*d,p0[1]+e0[1]*k-e0[0]*d],...poly,p0,[p0[0]+e1[0]*k-e1[1]*d,p0[1]+e1[1]*k+e1[0]*d]];
}
/** Longest loop piece (stock limit for side loops) */
export const LOOP_MAX_LENGTH=10000;
type LoopLaps=NonNullable<FoundationInput['rebar']['side']['laps']>;
export const loopLapLength=(det:Detailing,d:number,laps?:LoopLaps)=>laps?.length==='hook'?det.hook90*d:laps?.length==='custom'&&laps.value>0?laps.value:lapLength(det,d);
/** ring counter-clockwise, starting at the lower-left vertex (custom lap positions are measured from there) */
function loopRing(ring:Pt[]){const r=signedArea(ring)<0?[...ring].reverse():ring,k=r.reduce((b,p,j)=>p[0]+p[1]<r[b][0]+r[b][1]-1e-6?j:b,0);return [...r.slice(k),...r.slice(0,k)];}
/** Lapped pieces of one horizontal loop: lap centres by pattern (each lap kept inside one side, clear of the bends),
 * piece k runs from lap k to lap k+1 plus half a lap at both ends. Pattern 1 / 2 pieces longer than the limit move on
 * to the next pattern. */
function loopPieces(ring0:Pt[],laps:LoopLaps|undefined,det:Detailing,d:number){
 const ring=loopRing(ring0),x=loopLapLength(det,d,laps),m=radius(d,det)+d,max=Math.min(LOOP_MAX_LENGTH,det.stockLength||LOOP_MAX_LENGTH);
 let s=0;const E=ring.map((a,k)=>{const b=ring[(k+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),e={a,b,len,s0:s};s+=len;return e;}),P=s;
 const at=(t:number):Pt=>{const u=((t%P)+P)%P,e=E.find(q=>u>=q.s0&&u<=q.s0+q.len)||E[0],f=e.len?(u-e.s0)/e.len:0;return [e.a[0]+(e.b[0]-e.a[0])*f,e.a[1]+(e.b[1]-e.a[1])*f];};
 const ok=E.filter(q=>q.len>=x+2*m),mid=(q:typeof E[number])=>q.s0+q.len/2,longest=E.reduce((a,b)=>b.len>a.len?b:a);
 // nearest point to t where the whole lap lies on one side, clear of the bends
 const fit=(t:number)=>{const u=((t%P)+P)%P;if(!ok.length){const e=E.find(q=>u>=q.s0&&u<q.s0+q.len)||E[0];return mid(e);}
  let best=u,bd=Infinity;for(const q of ok)for(const w of [-P,0,P]){const v=Math.min(Math.max(u,q.s0+w+x/2+m),q.s0+w+q.len-x/2-m),dd=Math.abs(v-u);if(dd<bd){bd=dd;best=((v%P)+P)%P;}}return best;};
 const centres=(p:LoopLaps['pattern'])=>{const c0=mid(longest),raw=p==='1'?[c0]:p==='2'?[c0,fit(c0+P/2)]:p==='3'?(ok.length?ok.map(mid):[c0]):(laps?.at.length?laps.at.map(fit):[c0]);
  const out:number[]=[];for(const c of [...raw].sort((a,b)=>a-b))if(!out.length||c-out.at(-1)!>=x+2*m&&P+out[0]-c>=x+2*m)out.push(c);return out;};
 const build=(p:LoopLaps['pattern'])=>piecesOf(centres(p));
 function piecesOf(c:number[]){return c.map((a,k)=>{const lo=a-x/2,hi=(k+1<c.length?c[k+1]:c[0]+P)+x/2,pts:Pt[]=[at(lo)];
  const vs=[0,1,2].flatMap(w=>E.map(e=>e.s0+w*P)).filter(v=>v>lo+1e-6&&v<hi-1e-6).sort((p,q)=>p-q);for(const v of vs)pts.push(at(v));pts.push(at(hi));return {pts,len:hi-lo};});}
 let pattern=laps?.pattern||'1',pieces=build(pattern),upgraded=false;
 while((pattern==='1'||pattern==='2')&&pieces.some(q=>q.len>max)){pattern=pattern==='1'?'2':'3';pieces=build(pattern);upgraded=true;}
 // pattern 3 still too long (large footings): extra laps evenly between the laps of each long piece
 if(pattern!=='custom'&&pieces.some(q=>q.len>max)){let c=centres(pattern);
  for(let it=0;it<6&&pieces.some(q=>q.len>max);it++){const add:number[]=[];c.forEach((a,k)=>{const gap=(k+1<c.length?c[k+1]:c[0]+P)-a,n=Math.ceil((gap+x)/(max-2*m))-1;for(let j=1;j<=n;j++)add.push(fit(a+gap*j/(n+1)));});
   const all=[...c,...add].sort((p,q)=>p-q),next:number[]=[];for(const v of all)if(!next.length||v-next.at(-1)!>=x+2*m&&P+next[0]-v>=x+2*m)next.push(v);
   if(next.length===c.length)break;c=next;pieces=piecesOf(c);upgraded=true;}}
 return {pieces,pattern,x,P,max,upgraded,tooLong:pieces.some(q=>q.len>max)};
}
/** Side loop of a footing: perimeter of the loop centreline, lap length and the longest piece allowed (UI: pattern 1 is
 * not allowed when the perimeter + lap exceeds it). */
export function footingLoopInfo(i:FoundationInput){
 const d=i.rebar.side.diameter,ring=inset(footingOutline(i),i.cover.side+d/2),x=loopLapLength(i.detailing,d,i.rebar.side.laps),max=Math.min(LOOP_MAX_LENGTH,i.detailing.stockLength||LOOP_MAX_LENGTH);
 let P=0;ring.forEach((a,k)=>{const b=ring[(k+1)%ring.length];P+=Math.hypot(b[0]-a[0],b[1]-a[1]);});
 return {perimeter:P,lap:x,max,singleOk:P+x<=max};
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
 // bundled side bars (pairs closer than 1.6 d) are one tie position at the pair centre
 const pick=(kind:ColumnBarPos['kind'],low:boolean)=>bars.filter(b=>b.kind===kind&&(kind==='sideX'?b.y<D/2:b.x<W/2)===low).map(b=>kind==='sideX'?b.x:b.y).sort((p,q)=>p-q)
  .reduce<number[][]>((g,v)=>{const last=g.at(-1);if(last&&v-last.at(-1)!<1.6*dm)last.push(v);else g.push([v]);return g;},[]).map(g=>g.reduce((a,b)=>a+b,0)/g.length);
 const f={bottom:pick('sideX',true),top:pick('sideX',false),left:pick('sideY',true),right:pick('sideY',false)};
 const tc=c+dt/2,R=radius(di,det,true),rr=(dm+di)/2,ext90=det.hook90*di,ext135=Math.max(det.hook135*di,det.hook135Min);
 const hoop=link(0,1,2,tc,W-tc,tc,D-tc,0,det,radius(dt,det,true),dt).map(p=>[p[0],p[1]] as Pt);
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
 const closed=(poly:Pt[])=>pieces.push({kind:'closed',pts:polyLink(inset(poly,-rr),tieHook(di,det).ext,R,di,tieHook(di,det).angle)});
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
  case 'custom':{
   const l=i.rebar.main.layout;
   if(!l){issues.push('ไม่มีรูปหน้าตัดตามแบบ (เลือกจากตารางหน้าตัดเสา)');break;}
   const b=layoutBox(W,D,c+dt,i.rebar.main.corner.diameter);
   for(const t of l.ties){const p=b.X(t.u0),q=b.X(t.u1),r=b.Y(t.v0),s=b.Y(t.v1);closed([[p,r],[q,r],[q,s],[p,s]]);}
   break;}
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
/** Column / starter section outline in local coordinates (origin = bounding-box corner). */
export function columnOutline(col:FootingColumn):Pt[]{return shapeOutline(columnSpec(col));}
const outline=columnOutline;
const footingSpec=(i:FoundationInput):ShapeSpec=>({shape:i.shape,w:i.shape==='circle'?i.diameter:i.width,d:i.shape==='circle'?i.diameter:i.length,armX:i.armX,armY:i.armY,chamfer:i.chamfer});
/** Footing plan: bounding size, outline (local mm), exact area (mm²) and perimeter (mm). */
export function footingExtent(i:FoundationInput){const s=footingSpec(i);return {w:s.w,d:s.d};}
/** Top of the concrete at a plan point of a rect footing: footing top, lowered by a cut, raised by a block standing there. */
export function footingTopAt(i:FoundationInput,x:number,y:number){
 if(i.shape!=='rect')return i.thickness;
 const T=i.thickness,inBox=(b:FootingBox)=>x>=b.x0-1&&x<=b.x1+1&&y>=b.y0-1&&y<=b.y1+1;let t=T;
 for(const b of i.cuts||[])if(b.z1>=T-1&&b.z0>0&&inBox(b))t=Math.min(t,b.z0);
 // blocks stack: keep raising while a block stands on the current top
 for(let n=0,up=true;up&&n<10;n++){up=false;for(const b of i.blocks||[])if(inBox(b)&&b.z0<=t+1&&b.z1>t){t=b.z1;up=true;}}
 return t;
}
/** Full-depth cuts of a rect footing (z0 at the bottom, z1 at the top): no concrete there, e.g. the notch of an L-shaped plan. */
export function footingOpenings(i:FoundationInput):FootingBox[]{return i.shape==='rect'?(i.cuts||[]).filter(b=>b.z0<=.5&&b.z1>=i.thickness-1&&b.x1>b.x0&&b.y1>b.y0):[];}
export function footingOutline(i:FoundationInput,segments=72):Pt[]{
 const base=shapeOutline(footingSpec(i),segments),open=footingOpenings(i);
 if(!open.length)return base;
 // rect minus the openings: the largest remaining part (bars, loops, face bars and areas follow it)
 const ring=(p:Pt[]):[number,number][][]=>[[...p,p[0]]],box=(b:FootingBox):[number,number][][]=>ring([[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]]);
 const mp=polygonClipping.difference(ring(base),...open.map(box)),outer=mp.map(pg=>pg[0].slice(0,-1) as Pt[]).sort((p,q)=>Math.abs(signedArea(q))-Math.abs(signedArea(p)))[0];
 return outer?(signedArea(outer)<0?[...outer].reverse():outer):base;
}
export function footingBoxes(i:FoundationInput):Box[]{return shapeBoxes(footingSpec(i));}
export function footingArea(i:FoundationInput){return i.shape==='circle'?Math.PI*i.diameter**2/4:polygonArea(footingOutline(i));}
export function footingPerimeter(i:FoundationInput){return i.shape==='circle'?Math.PI*i.diameter:polygonPerimeter(footingOutline(i));}
export const pileTypeLabels:Record<PileInput['type'],string>={square:'เข็มสี่เหลี่ยมตัน',round:'เข็มเจาะ (กลม)',spun:'เข็มกลมกลวง (Spun)',I:'เข็มรูปตัวไอ'};
/** Pile centres relative to the footing bounding-box corner (mm). */
export function pilePositions(i:FoundationInput):Pt[]{
 if(i.foundationType!=='pile')return [];
 const p=i.pile,{w,d}=footingExtent(i),cx=w/2+p.offsetX,cy=d/2+p.offsetY,s=p.spacingX,t=p.spacingY||p.spacingX,pts:Pt[]=[];
 const grid=(nx:number,ny:number,limit=nx*ny,skipCentre=false)=>{for(let r=0;r<ny;r++)for(let k=0;k<nx;k++){if(skipCentre&&r===(ny-1)/2&&k===(nx-1)/2)continue;if(pts.length<limit)pts.push([cx+(k-(nx-1)/2)*s,cy+(r-(ny-1)/2)*t]);}};
 if(p.layout==='custom')return (p.positions||[]).map(q=>[q[0],q[1]] as Pt);
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
export type ColumnBarPos={x:number;y:number;d:number;kind:'corner'|'sideX'|'sideY'|'ring'|'inner'};
/** Largest main-bar diameter of the section. */
export function maxMainDiameter(col:FootingColumn){const m=col.main;return col.shape==='circle'?m.diameter:Math.max(m.corner.diameter,col.shape!=='rect'||m.sideX.count>0?m.sideX.diameter:0,col.shape!=='rect'||m.sideY.count>0?m.sideY.diameter:0);}
/** Main bar centres (local coordinates). `base` = cover + tie diameter.
 * Corners carry bundles of 1–3 bars placed side by side along the two faces;
 * side bars sit between the corner bundles (rect: count per face, L/U: max spacing). */
function columnBarPositions(col:FootingColumn,base:number,symmetric=false):ColumnBarPos[]{
 const m=col.main;
 if(col.shape==='circle'){const r=col.diameter/2-base-m.diameter/2,ctr=col.diameter/2;return Array.from({length:m.count},(_,k)=>({x:ctr+r*Math.cos(2*Math.PI*k/m.count),y:ctr+r*Math.sin(2*Math.PI*k/m.count),d:m.diameter,kind:'ring' as const}));}
 if(col.shape==='rect'&&m.layout)return layoutBarPositions(m.layout,col.width,col.depth,base,m.corner.diameter);
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
  // bundled side bars (rect): n / 2 positions, each a pair side by side along the face
  const nb=col.shape==='rect'&&(m as {sideBundle?:number}).sideBundle===2?2:1,np=Math.ceil(n/nb);
  for(let k=1;k<=np;k++){const t=start+span*k/(np+1),pair=nb===2&&(k*2<=n);
   for(const dt of pair?[-ds/2,ds/2]:[0])out.push({x:a[0]+e[0]*(t+dt),y:a[1]+e[1]*(t+dt),d:ds,kind:alongX?'sideX':'sideY'});}
 });
 return out;
}
const Hypot=(a:[number,number],b:[number,number])=>Math.hypot(b[0]-a[0],b[1]-a[1]);
/** Bar-centre box of a drawn layout: outermost bar lines at cover + tie + d/2. */
function layoutBox(W:number,D:number,base:number,d:number){const a=base+d/2;return {x0:a,x1:W-a,y0:a,y1:D-a,X:(u:number)=>a+u*(W-2*a),Y:(v:number)=>a+v*(D-2*a)};}
/** Bars of a drawn section layout: primary bar at (u, v), bundle partners d apart along `dir` (diagonal: d / √2 per axis). */
function layoutBarPositions(l:SectionLayout,W:number,D:number,base:number,d:number):ColumnBarPos[]{
 const b=layoutBox(W,D,base,d),e=1,out:ColumnBarPos[]=[];
 const kindOf=(x:number,y:number):ColumnBarPos['kind']=>{const sx=x<b.x0+e||x>b.x1-e,sy=y<b.y0+e||y>b.y1-e;return sx&&sy?'corner':sy?'sideX':sx?'sideY':'inner';};
 for(const p of l.bars){
  const x=b.X(p.u),y=b.Y(p.v),[du,dv]=p.dir||[0,0],len=Math.hypot(du,dv)||1;
  for(let k=0;k<(p.n||1);k++){const px=x+du/len*d*k,py=y+dv/len*d*k;out.push({x:px,y:py,d,kind:kindOf(px,py)});}
 }
 // drawn bars closer than touching (schematic bar size): push the inner one of each pair away to touch
 const edge=(q:ColumnBarPos)=>Math.min(q.x-b.x0,b.x1-q.x,q.y-b.y0,b.y1-q.y);
 for(let it=0;it<4;it++)for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
  const p=out[i],q=out[j],dx=q.x-p.x,dy=q.y-p.y,g=Math.hypot(dx,dy);if(g>=d-.01||g<1e-6)continue;
  const [m,s]=edge(p)>edge(q)?[p,-1]:[q,1];m.x+=s*dx/g*(d-g);m.y+=s*dy/g*(d-g);m.kind=kindOf(m.x,m.y);
 }
 return out;
}
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
/** Column input with the rect section of a footing pedestal (for its set-2 tie layout). */
function pedestalAsColumn(col:FootingColumn):ColumnInput{
 const v=defaultElementInput('Column') as ColumnInput,dt=col.tie.diameter,{spacing:_,...main}=col.main;
 return {...v,shape:'rect',width:col.width,depth:col.depth,cover:{side:col.cover},rebar:{...v.rebar,main:{...v.rebar.main,...main},tie:{...v.rebar.tie,diameter:dt,spacing:col.tie.spacing,inner:{...v.rebar.tie.inner,diameter:dt}}}};
}
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
export function shapeDefaults(d:number,det:Detailing,radiusR=0){const rad=radiusR>0?radiusR+d/2:radius(d,det);return {bend:det.hook90*d+rad,hookTail:Math.max(5*d,90),hookOutside:2*rad+d,ret:hookDevLength(det,d)};}
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
 // first pour with a mesh at its top (joint 1, lower stage): face bars set to the first pour stop under that mesh
 const J1=footingPour(i).levels[0],jm1=J1!==undefined?jointRebar(i,0).mesh:undefined,firstTop=J1!==undefined&&J1<T-c.top-topStack?J1-(jm1?.enabled&&jm1.at==='lower'?jm1.cover+jm1.x.diameter+jm1.y.diameter:50):undefined;
 // side loops are the outermost layer (bar face at the side cover), vertical face bars inside them
 const vb=r.sideBars,loopIn=r.side.enabled&&i.shape!=='circle'?r.side.diameter:0,vIn=vb.enabled&&i.shape!=='circle'?Math.max(vb.diameter,vb.y?.diameter||0):0,sideIn=loopIn+vIn;
 // extra boxes (rect footings): blocks = raised parts / later-pour blocks, cuts = lowered top areas; each gets its own top mesh
 const blocks=i.shape==='rect'?i.blocks||[]:[],cuts=i.shape==='rect'?(i.cuts||[]).filter(b=>b.z1>=T-1&&b.z0>0):[];
 const merge=(iv:[number,number][])=>{const o:[number,number][]=[];for(const v of [...iv].sort((p,q)=>p[0]-q[0])){const l=o.at(-1);if(l&&v[0]<=l[1]+1e-6)l[1]=Math.max(l[1],v[1]);else o.push([v[0],v[1]]);}return o;};
 const rectSpan=(rs:FootingBox[],runX:boolean,pos:number)=>merge(rs.filter(b=>runX?b.y0<pos&&pos<b.y1:b.x0<pos&&pos<b.x1).map(b=>(runX?[b.x0,b.x1]:[b.y0,b.y1]) as [number,number]));
 const minus=(iv:[number,number][],cut:[number,number][])=>iv.flatMap(([a,b])=>{let parts:[number,number][]=[[a,b]];for(const [p,q] of cut)parts=parts.flatMap(([u,v]):[number,number][]=>q<=u||p>=v?[[u,v]]:[...(p>u?[[u,p] as [number,number]]:[]),...(q<v?[[q,v] as [number,number]]:[])]);return parts;});
 const within=(iv:[number,number][],keep:[number,number][])=>iv.flatMap(([a,b])=>keep.map(([p,q])=>[Math.max(a,p),Math.min(b,q)] as [number,number]).filter(([u,v])=>v>u));
 const inBox=(b:FootingBox,x:number,y:number)=>x>=b.x0-1&&x<=b.x1+1&&y>=b.y0-1&&y<=b.y1+1;
 /** top of the concrete at a plan point: footing top, lowered by a cut, raised by a block standing there */
 const topAt=(x:number,y:number)=>footingTopAt(i,x,y);
 const blockGroups:{z0:number;z1:number;rects:FootingBox[]}[]=[];
 // one group = blocks of the same height that touch (separate pieces get their own top mesh and loops)
 const touch=(a:FootingBox,b:FootingBox)=>{const ox=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),oy=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);return ox>=-.5&&oy>=-.5&&(ox>.5||oy>.5);};
 for(const b of blocks){const same=blockGroups.filter(x=>Math.abs(x.z0-b.z0)<.5&&Math.abs(x.z1-b.z1)<.5&&x.rects.some(r=>touch(r,b)));
  if(!same.length)blockGroups.push({z0:b.z0,z1:b.z1,rects:[b]});
  else{same[0].rects.push(b);for(const o of same.slice(1)){same[0].rects.push(...o.rects);blockGroups.splice(blockGroups.indexOf(o),1);}}}
 const outlineOf=(rects:FootingBox[],remove:FootingBox[]=[]):Pt[]=>{const box=(b:FootingBox):[number,number][][]=>[[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1],[b.x0,b.y0]]];
  let mp=polygonClipping.union(box(rects[0]),...rects.slice(1).map(box));if(remove.length)mp=polygonClipping.difference(mp,...remove.map(box));
  const outer=mp.map(pg=>pg[0].slice(0,-1) as Pt[]).sort((p,q)=>Math.abs(signedArea(q))-Math.abs(signedArea(p)))[0];return outer&&signedArea(outer)<0?[...outer].reverse():outer||[];};
 // below: bars of this layer stop under the other bottom layer's U returns (Shape 41 legs rise to just under the top mesh)
 // area: only = bars inside these boxes (block / cut top; bars shorter than max(300, 20d) are left out, e.g. across a
 // narrow rib), minus = bars stop short of these boxes (top mesh around cuts)
 const mesh=(role:string,note:string,l:Shaped&{spacing:number},runX:boolean,z:number,up:boolean,below=0,own?:{room:number},area?:{only?:FootingBox[];minus?:FootingBox[]})=>{
  const d=l.diameter,inner=inset(plan,c.side+sideIn+d/2),ai=runX?1:0,covA=c.side+d/2;
  let lo=Math.min(...inner.map(p=>p[ai])),hi=Math.max(...inner.map(p=>p[ai]));
  if(area?.only){lo=Math.max(lo,Math.min(...area.only.map(b=>runX?b.y0:b.x0))+covA+.01);hi=Math.min(hi,Math.max(...area.only.map(b=>runX?b.y1:b.x1))-covA-.01);}
  // several boxes (cut / block group): bars spaced per band of equal extent across the distribution, so each part keeps its
  // own end bars at the cover (no bar left against a re-entrant step face) and bars run on through parts of the same level
  const bands:[number,number][]=[];
  if(area?.only&&area.only.length>1){const E=[...new Set(area.only.flatMap(b=>runX?[b.y0,b.y1]:[b.x0,b.x1]))].sort((p,q)=>p-q);let last='';
   for(let j=0;j+1<E.length;j++){const key=JSON.stringify(rectSpan(area.only,runX,(E[j]+E[j+1])/2));if(key==='[]'){last='';continue;}
    if(key===last&&bands.at(-1)![1]===E[j])bands.at(-1)![1]=E[j+1];else bands.push([E[j],E[j+1]]);last=key;}}
  else bands.push([lo-covA-.01,hi+covA+.01]);
  const ats=bands.flatMap(([p,q])=>{const a=Math.max(lo,p+covA+.01),b=Math.min(hi,q-covA-.01),sp=b>a?spread(a,b,l.spacing):undefined;
   return sp?Array.from({length:sp.count},(_,k)=>sp.count===1?sp.from:sp.from+(sp.to-sp.from)*k/(sp.count-1)):[];});
  if(!ats.length){warn(`${note}: วางเหล็กไม่ได้`);return;}
  // slab-cast footing: top bars run on into the slab by `extend`; their bends/hooks must stay inside the slab thickness
  const ext=slabOn&&!up&&!own&&!area?c.side+sideIn+d/2+i.slab.extend:0;
  const room=own?own.room:up?(l.shape==='41'?T-c.top-topStack-below:T-c.top)-d/2-z:z-(slabOn?T-ts+c.top:c.bottom)-d/2;
  const sh=shapedEnds(l,det,up?1:-1,room,note,warn);
  // steps in the top (lowered areas): bars of a lowered area run on into the higher concrete by the lap length; bars of the
  // footing top turn down at the step face past the lower top bars (12d below them)
  const L=lapLength(det,d),floorZ=c.bottom+r.bottomX.diameter+r.bottomY.diameter,steps=!up&&!!area&&i.shape==='rect'&&cuts.length>0;
  const segs:{a:number;b:number;at:number;la:number;lb:number}[]=[];let into=false;
  for(const at of ats){const pos=Math.min(hi-1e-3,Math.max(lo+1e-3,at)),full=lineIntervals(inner,runX?0:1,pos);let iv=full;if(area?.minus){const cut=area.minus,at=(v:number)=>rectSpan(cut,runX,v).map(([p,q])=>[p-covA,q+covA] as [number,number]);iv=minus(iv,merge([...at(pos),...at(pos-covA+.5),...at(pos+covA-.5)]));}if(area?.only){const only=area.only,at=(v:number)=>rectSpan(only,runX,v).map(([p,q])=>[p+covA,q-covA] as [number,number]);iv=within(within(within(iv,at(pos)),at(pos-covA+.5)),at(pos+covA-.5));}
   const topAt=(u:number)=>footingTopAt(i,runX?u:pos,runX?pos:u),leg=(t:number)=>Math.max(0,Math.min(z-(t-c.top-d/2)+12*d,z-floorZ-d));
   for(let [a,b] of iv){let la=0,lb=0;
    if(steps){const [A,B]=full.find(([p,q])=>p<=(a+b)/2&&(a+b)/2<=q)||[a,b];
     const end=(e:number,dir:-1|1,lim:number):[number,number]=>{if(Math.abs(e-lim)<=1)return [e,0];const t=topAt(e+dir*(covA+5)),own=topAt(e);
      if(area?.only?.every(q=>cuts.includes(q))&&t>own+1){into=true;return [dir<0?Math.max(lim,e-L):Math.min(lim,e+L),0];}
      if(area?.minus&&sh.code==='00'&&t<own-1)return [e,leg(t)];return [e,0];};
     [a,la]=end(a,-1,A);[b,lb]=end(b,1,B);}
    if(b-a+2*ext>sh.minRun&&(!area?.only||b-a>=Math.max(300,20*d)))segs.push({a:a-ext,b:b+ext,at,la:Math.round(la),lb:Math.round(lb)});}}
  if(ext)note+=` · ยื่นเข้าพื้น ${Math.round(i.slab.extend)} mm`;
  if(into)note+=` · ยื่นเลยขั้นเข้าส่วนที่สูงกว่า ${Math.round(L)} mm`;
  if(!segs.length){warn(`${note}: วางเหล็กไม่ได้ (ช่วงสั้นกว่ารูป Shape ${sh.code})`);return;}
  const pt=(along:number,at:number,zz:number):V3=>runX?[along,at,zz]:[at,along,zz];
  const shape=(sg:{a:number;b:number;at:number;la:number;lb:number}):V3[]=>sg.la||sg.lb?[...(sg.la?[pt(sg.a,sg.at,z-sg.la)]:[]),pt(sg.a,sg.at,z),pt(sg.b,sg.at,z),...(sg.lb?[pt(sg.b,sg.at,z-sg.lb)]:[])]:sh.points(sg.a,sg.b,z).map(([u,w])=>pt(u,sg.at,w));
  const base={diameter:d,grade:g,axis:(runX?'X':'Y') as Bar['axis'],face:(up?'bottom':'top') as Bar['face'],radius:sh.radius,shapeCode:sh.code},hookNote=sh.suffix;
  const legged=(sg:{la:number;lb:number})=>sg.la||sg.lb?{radius:radius(d,det),shapeCode:sg.la&&sg.lb?'21':'11'}:{};
  const stepNote=(sg:{la:number;lb:number})=>sg.la||sg.lb?` · งอลงที่ขั้นระดับ ${Math.max(sg.la,sg.lb)} mm`:'';
  const uniform=segs.every(sg=>Math.abs(sg.a-segs[0].a)<.5&&Math.abs(sg.b-segs[0].b)<.5&&sg.la===segs[0].la&&sg.lb===segs[0].lb)&&new Set(segs.map(sg=>sg.at)).size===segs.length;
  if(uniform){out.push({...base,...legged(segs[0]),role,note:note+hookNote+stepNote(segs[0]),count:segs.length,points:shape(segs[0]),distributionAxis:runX?'Y':'X',from:segs[0].at,to:segs.at(-1)!.at});return;}
  const groups=new Map<string,typeof segs>();for(const sg of segs){const key=`${Math.round(sg.b-sg.a)}|${sg.la}|${sg.lb}`;groups.set(key,[...(groups.get(key)||[]),sg]);}
  [...groups.entries()].sort((x,y)=>parseInt(y[0])-parseInt(x[0])).forEach(([key,list],k)=>{const len=parseInt(key);
   const first=list[0],off=list.map(sg=>{const du=sg.a-first.a,dv=sg.at-first.at;return (runX?[du,dv,0]:[dv,du,0]) as V3;}),fixed={...first,b:first.a+len};
   out.push({...base,...legged(first),role:`${role}-${k+1}`,note:`${note} · ช่วง ${len} mm${hookNote}${stepNote(first)}`,count:list.length,points:shape(fixed),offsets:off});
  });
 };
 // stirrups that are the bottom bars across their band (HOOP): that layer is not placed, the other one sits inside the links
 const hoop=r.stirrups?.enabled&&r.stirrups.replacesBottom&&i.shape==='rect'?r.stirrups:undefined,hoopUnder=hoop?hoop.diameter:0;
 if(!hoop||hoop.dir!=='y'){const zX=c.bottom+(hoop?hoopUnder:0)+r.bottomX.diameter/2;mesh('bottom-x','เหล็กล่าง · ทิศ X',r.bottomX,true,zX,true);}
 if(!hoop||hoop.dir!=='x'){const zY=c.bottom+(hoop?hoopUnder:r.bottomX.diameter)+r.bottomY.diameter/2;mesh('bottom-y','เหล็กล่าง · ทิศ Y',r.bottomY,false,zY,true,!hoop&&r.bottomX.shape==='41'?r.bottomX.diameter:0);}
 const around=cuts.length?{minus:cuts}:undefined;
 if(r.topX.enabled)mesh('top-x','เหล็กบน · ทิศ X',r.topX,true,T-c.top-r.topX.diameter/2,false,0,undefined,around);
 if(r.topY.enabled)mesh('top-y','เหล็กบน · ทิศ Y',r.topY,false,T-c.top-(r.topX.enabled?r.topX.diameter:0)-r.topY.diameter/2,false,0,undefined,around);
 // lowered areas and blocks: a top mesh of their own (bars as the footing top mesh)
 // lowered areas of the same top level (and own bars) that touch are one area: their bars run on through the joint
 const cutGroups:{z:number;rects:FootingBox[];names:string[]}[]=[];
 cuts.forEach((b,k)=>{const touch=(q:FootingBox)=>q.x0<=b.x1+1&&b.x0<=q.x1+1&&q.y0<=b.y1+1&&b.y0<=q.y1+1,key=JSON.stringify(b.bars||null);
  const same=cutGroups.filter(gr=>Math.abs(gr.z-b.z0)<1&&JSON.stringify(gr.rects[0].bars||null)===key&&gr.rects.some(touch));
  if(!same.length){cutGroups.push({z:b.z0,rects:[b],names:[b.label||String(k+1)]});return;}
  same[0].rects.push(b);same[0].names.push(b.label||String(k+1));for(const o of same.slice(1)){same[0].rects.push(...o.rects);same[0].names.push(...o.names);cutGroups.splice(cutGroups.indexOf(o),1);}});
 const tops=[...cutGroups.map((gr,k)=>({z:gr.z,floor:0,rects:gr.rects,name:`ส่วนลดระดับ ${gr.names.join(' + ')}`,tag:`cut${k+1}`})),
  ...blockGroups.map((gr,k)=>({z:gr.z1,floor:gr.z0,rects:gr.rects,name:gr.rects.map((b,n)=>b.label||`ส่วนเพิ่ม ${n+1}`).filter((v,n,a)=>a.indexOf(v)===n).join(' + '),tag:`blk${k+1}`}))];
 for(const t of tops){if(t.rects.some(b=>b.rib))continue;const dx=r.topX.enabled?r.topX.diameter:0,room=(zz:number)=>({room:Math.max(0,zz-t.floor-c.bottom)});
  // own bars of the box (first box of a block group) replace size / spacing, shape as the footing top bars
  const own=t.rects.find(b=>b.bars)?.bars,lx=own?{...r.topX,...own}:r.topX,ly=own?{...r.topY,...own}:r.topY,dxo=own?own.diameter:dx;
  if(r.topX.enabled){const zz=t.z-c.top-dxo/2;mesh(`top-x-${t.tag}`,`เหล็กบน ${t.name} · ทิศ X`,lx,true,zz,false,0,room(zz),{only:t.rects});}
  if(r.topY.enabled){const zz=t.z-c.top-dxo-ly.diameter/2;mesh(`top-y-${t.tag}`,`เหล็กบน ${t.name} · ทิศ Y`,ly,false,zz,false,0,room(zz),{only:t.rects});}}
 // upstand ribs: n top bars along the rib inside inverted U links (legs down onto the bottom mesh, feet turned outward);
 // ribs of equal size and bars share one Mark (offsets)
 const ribs=blocks.filter(b=>b.rib);
 if(ribs.length){const floorZ=c.bottom+r.bottomX.diameter+r.bottomY.diameter,same=new Map<string,FootingBox[]>(),MAX=2000;
  for(const b of ribs){const key=JSON.stringify([Math.round(b.x1-b.x0),Math.round(b.y1-b.y0),Math.round(b.z0),Math.round(b.z1),b.rib]);same.set(key,[...(same.get(key)||[]),b]);}
  [...same.values()].forEach((list,k)=>{const b=list[0],rb=b.rib!,runX=b.x1-b.x0>=b.y1-b.y0,du=rb.links?.diameter??0,name=list.length>1?`${list.length} แนว`:b.label||`ครีบ ${k+1}`;
   const [l0,l1,n0,n1]=runX?[b.x0,b.x1,b.y0,b.y1]:[b.y0,b.y1,b.x0,b.x1],pt=(along:number,across:number,z:number):V3=>runX?[along,across,z]:[across,along,z];
   const shift=(q:FootingBox,along:number,across:number):V3=>{const [u,v]=runX?[along,across]:[across,along];return [q.x0-b.x0+u,q.y0-b.y0+v,0];};
   const chunks=<T,>(a:T[])=>Array.from({length:Math.ceil(a.length/MAX)},(_,j)=>a.slice(j*MAX,(j+1)*MAX));
   const dt=rb.top.diameter,n=rb.top.count,zt=b.z1-c.top-du-dt/2,a0=n0+c.side+du+dt/2,a1=n1-c.side-du-dt/2;
   if(n>1&&a1-a0<dt*(n-1))warn(`เหล็กบนครีบ ${name}: ${n}Y${dt} ไม่พอที่ในความกว้าง ${Math.round(n1-n0)} mm`);
   else{const across=n===1?[(n0+n1)/2]:Array.from({length:n},(_,j)=>a0+(a1-a0)*j/(n-1)),offs=list.flatMap(q=>across.map(v=>shift(q,0,v-across[0])));
    out.push({role:`rib${k+1}-top`,note:`เหล็กบนครีบ ${name} · ${n}Y${dt} ต่อครีบ · ยาวตลอดครีบ`,diameter:dt,grade:g,count:offs.length,points:[pt(l0+c.side+dt/2,across[0],zt),pt(l1-c.side-dt/2,across[0],zt)],axis:runX?'X':'Y',face:'top',radius:0,shapeCode:'00',...(offs.length>1?{offsets:offs}:{})});}
   // face bars (r.side) along both faces inside the links, from above the rib foot up to under the top bars
   if(r.side.enabled){const dl=r.side.diameter,sz=spread(b.z0+50+dl/2,zt-dt/2-dl/2-25,r.side.spacing),f0=n0+c.side+du+dl/2,f1=n1-c.side-du-dl/2;
    if(!sz||f1-f0<dl)warn(`เหล็กข้างครีบ ${name}: วางไม่ได้`);
    else{const zs=Array.from({length:sz.count},(_,j)=>sz.count===1?sz.from:sz.from+(sz.to-sz.from)*j/(sz.count-1)),offs=list.flatMap(q=>[f0,f1].flatMap(v=>zs.map(z=>{const o=shift(q,0,v-f0);return [o[0],o[1],z-zs[0]] as V3;})));
     out.push({role:`rib${k+1}-face`,note:`เหล็กข้างครีบ ${name} · 2 ข้าง × ${sz.count} ชั้น @ ≤ ${r.side.spacing} mm ต่อครีบ`,diameter:dl,grade:g,count:offs.length,points:[pt(l0+c.side+dl/2,f0,zs[0]),pt(l1-c.side-dl/2,f0,zs[0])],axis:runX?'X':'Y',face:'side',radius:0,shapeCode:'00',offsets:offs});}}
   if(rb.links){const d=du,rad=radius(d,det),zTop=b.z1-c.top-d/2,zBot=floorZ+d/2,f=rb.links.foot,u0=n0+c.side+d/2,u1=n1-c.side-d/2;
    const sp=spread(l0+c.side+d/2+50,l1-c.side-d/2-50,rb.links.spacing);
    if(!sp||u1-u0<=2*rad||zTop-zBot<=4*d){warn(`เหล็กตั้งรูปตัว U ครีบ ${name}: วางไม่ได้ ตรวจขนาดครีบ`);return;}
    if(f>0&&(u0-f<c.side||u1+f>(runX?Y:X)-c.side))warn(`เหล็กตั้งรูปตัว U ครีบ ${name}: ขางอ ${f} mm ยื่นเกินผิวฐาน`);
    const at=Array.from({length:sp.count},(_,j)=>sp.count===1?sp.from:sp.from+(sp.to-sp.from)*j/(sp.count-1)),offs=list.flatMap(q=>at.map(t=>shift(q,t-at[0],0)));
    const points=[...(f>0?[pt(at[0],u0-f,zBot)]:[]),pt(at[0],u0,zBot),pt(at[0],u0,zTop),pt(at[0],u1,zTop),pt(at[0],u1,zBot),...(f>0?[pt(at[0],u1+f,zBot)]:[])];
    chunks(offs).forEach((o,j,all)=>out.push({role:`rib${k+1}-link${all.length>1?`-${j+1}`:''}`,note:`เหล็กตั้งรูปตัว U ครีบ ${name} @ ${rb.links!.spacing} mm (${sp.count} ตัวต่อครีบ) · ขาลงถึงตะแกรงล่าง${f>0?` งอออก ${Math.round(f)} mm`:''}`,
     diameter:d,grade:g,count:o.length,axis:runX?'Y':'X',face:'side',radius:rad,shapeCode:'99',points:points.map(p=>[p[0]+o[0][0],p[1]+o[0][1],p[2]] as V3),offsets:o.map(v=>[v[0]-o[0][0],v[1]-o[0][1],0] as V3)}));
   }});
 }
 // wall bars cast into the footing: both faces along the wall, from the bottom mesh up to the concrete top under the wall + lap
 (i.shape==='rect'?i.walls||[]:[]).forEach((b,k)=>{const dw=b.dowels;if(!dw)return;
  const d=dw.diameter,runX=b.x1-b.x0>=b.y1-b.y0,[l0,l1,n0,n1]=runX?[b.x0,b.x1,b.y0,b.y1]:[b.y0,b.y1,b.x0,b.x1],name=b.label||`ผนัง ${k+1}`;
  const zBot=c.bottom+r.bottomX.diameter+r.bottomY.diameter+d/2,lap=dw.lap||lapLength(det,d),zTop=Math.min(footingTopAt(i,(b.x0+b.x1)/2,(b.y0+b.y1)/2)+lap,b.z1-c.top-d/2);
  const sp=spread(l0+c.side+d/2,l1-c.side-d/2,dw.spacing),f0=n0+c.side+d/2,f1=n1-c.side-d/2;
  if(!sp||f1-f0<d||zTop-zBot<=10*d){warn(`เหล็กผนังฝังในฐาน ${name}: วางไม่ได้ ตรวจขนาด / ความสูงผนัง`);return;}
  const at=Array.from({length:sp.count},(_,j)=>sp.count===1?sp.from:sp.from+(sp.to-sp.from)*j/(sp.count-1)),pt=(along:number,across:number,z:number):V3=>runX?[along,across,z]:[across,along,z];
  const offs=[f0,f1].flatMap(v=>at.map(t=>{const [u,w]=runX?[t-at[0],v-f0]:[v-f0,t-at[0]];return [u,w,0] as V3;}));
  out.push({role:`wall${k+1}-dowel`,note:`เหล็กผนังฝังในฐาน ${name} · 2 ผิว Y${d}@${dw.spacing} · จากตะแกรงล่างถึงผิวฐาน + ระยะทาบ ${Math.round(lap)} mm`,diameter:d,grade:g,count:offs.length,
   points:[pt(at[0],f0,zBot),pt(at[0],f0,zTop)],axis:'Z',face:'side',radius:0,shapeCode:'00',offsets:offs});
 });
 // ---- construction joints between pour stages (inside the footing thickness): joint mesh and vertical bars through the joint
 const pour=footingPour(i);
 pour.levels.forEach((J,k)=>{
  const jr=jointRebar(i,k),tag=`รอยต่อการเท ${k+1} (Stage ${k+1}/${k+2} ที่ +${Math.round(J)})`;
  if(!jr.mesh.enabled&&!jr.dowel.enabled)return;
  if(J>=T-c.top-topStack-1){warn(`${tag}: อยู่เหนือตะแกรงบนของฐาน · ไม่ใส่เหล็กที่รอยต่อนี้`);return;}
  const ms=jr.mesh,flat=(l:{diameter:number;spacing:number})=>({...l,shape:ms.end==='straight'?'00':'21',leg:ms.end==='custom'?ms.leg:0,radius:0}) as Shaped&{spacing:number};
  if(ms.enabled){const dx=ms.x.diameter,dy=ms.y.diameter,lower=ms.at==='lower',sgn=lower?-1:1;
   const zx=J+sgn*(ms.cover+dx/2),zy=J+sgn*(ms.cover+dx+dy/2),where=lower?'ผิวบน Stage ล่าง':'ผิวล่าง Stage บน';
   if(Math.min(zx,zy)<c.bottom+r.bottomX.diameter+r.bottomY.diameter||Math.max(zx,zy)>T-c.top-topStack)warn(`${tag}: ตะแกรงที่รอยต่อชนตะแกรงล่าง/บนของฐาน ตรวจระยะ`);
   // bends stay in the mesh's own stage: lower-stage mesh down to above the bottom mesh, upper-stage mesh up to under
   // the top mesh (or under the next joint)
   const floor=c.bottom+r.bottomX.diameter+r.bottomY.diameter,next=pour.levels[k+1],ceil=next!==undefined&&next<T-c.top-topStack?next-50:T-c.top-topStack;
   const room=(z:number,d:number)=>({room:lower?z-floor-d:ceil-z-d});
   mesh(`joint${k+1}-x`,`ตะแกรงรอยต่อการเท ${k+1} · ${where} · ทิศ X`,flat(ms.x),true,zx,!lower,0,room(zx,dx));
   mesh(`joint${k+1}-y`,`ตะแกรงรอยต่อการเท ${k+1} · ${where} · ทิศ Y`,flat(ms.y),false,zy,!lower,0,room(zy,dy));}
  const dw=jr.dowel;
  if(dw.enabled){const d=dw.diameter,rad=radius(d,det),meshAbove=ms.enabled&&ms.at==='upper'?ms.cover+ms.x.diameter+ms.y.diameter:0;
   // top: under the top mesh of the footing, or under the next joint (and its mesh) when more stages follow
   const next=pour.levels[k+1],nj=next!==undefined?jointRebar(i,k+1):undefined;
   const zt=next!==undefined&&next<T-c.top-topStack?next-(nj!.mesh.enabled&&nj!.mesh.at==='lower'?nj!.mesh.cover+nj!.mesh.x.diameter+nj!.mesh.y.diameter:50)-d/2:T-c.top-topStack-d/2;
   const meshBelow=c.bottom+r.bottomX.diameter+r.bottomY.diameter+d/2,zb=Math.max(meshBelow,J-dw.below);
   if(zb>J-dw.below+.5)warn(`${tag}: เหล็กแนวตั้งฝังลง Stage ล่างได้ ${Math.round(J-zb)} mm (ถึงตะแกรงล่าง)`);
   if(zt<=J+meshAbove+d){warn(`${tag}: ไม่มีที่ว่างเหนือรอยต่อสำหรับเหล็กแนวตั้ง`);return;}
   const top=dw.shape==='11'||dw.shape==='21'||dw.shape==='z'?dw.topLeg*d:0,bot=dw.shape==='21'||dw.shape==='z'?dw.bottomLeg*d:0;
   // grid inside the side bars / loops, skipping the column footprints (their own bars run there)
   const inner=inset(plan,c.side+sideIn+100+d/2),room=inset(plan,c.side+sideIn+d/2),lo=(ax:0|1)=>Math.min(...inner.map(q=>q[ax])),hi=(ax:0|1)=>Math.max(...inner.map(q=>q[ax]));
   const sy=spread(lo(1),hi(1),dw.spacingY),boxes=footingColumns(i).map(cl=>{const e=columnExtent(cl),x0=(X-e.w)/2+cl.offsetX,y0=(Y-e.d)/2+cl.offsetY;return [x0-50,y0-50,x0+e.w+50,y0+e.d+50];});
   const pts:{x:number;y:number;s:1|-1}[]=[];
   if(sy)for(let n=0;n<sy.count;n++){const y=sy.count===1?sy.from:sy.from+(sy.to-sy.from)*n/(sy.count-1);
    const cl=lineIntervals(room,0,y);
    for(const [a0,b0] of lineIntervals(inner,0,y)){
     // legs turn inward (toward the middle of the run); a Z bar's lower leg points outward, so keep it inside the cover
     const [A,B]=cl.find(([p,q])=>p<=a0+1e-6&&q>=b0-1e-6)??[a0,b0],out=dw.shape==='z'?bot:0,a=Math.max(a0,A+out),b=Math.min(b0,B-out),sx=spread(a,b,dw.spacingX);if(!sx)continue;
     for(let m2=0;m2<sx.count;m2++){const x=sx.count===1?sx.from:sx.from+(sx.to-sx.from)*m2/(sx.count-1);
      if(boxes.some(([x0,y0,x1,y1])=>x>x0&&x<x1&&y>y0&&y<y1))continue;
      // legs point +X; near the X+ face they turn back (−X) so they stay inside the concrete
      pts.push({x,y,s:x<=(A+B)/2?1:-1});}}}
   if(!pts.length){warn(`${tag}: วางเหล็กแนวตั้งไม่ได้`);return;}
   if(top+bot>=Math.min(X,Y)/2)warn(`${tag}: ขางอเหล็กแนวตั้งยาวเกินครึ่งฐาน ตรวจ`);
   const tpl=(p:{x:number;y:number;s:1|-1}):V3[]=>[...(bot?[[p.x+(dw.shape==='z'?-1:1)*p.s*bot,p.y,zb] as V3]:[]),[p.x,p.y,zb],[p.x,p.y,zt],...(top?[[p.x+p.s*top,p.y,zt] as V3]:[])];
   const p0=pts[0],points=tpl(p0),pv=points.at(-1)!,d0=[pv[0]-p0.x,pv[1]-p0.y];
   const turns=pts.map(p=>p.s===p0.s?0:180),offsets:V3[]=pts.map((p,n)=>{const t=turns[n]*Math.PI/180,cs=Math.cos(t),sn=Math.sin(t);return [p.x-p0.x-d0[0]+d0[0]*cs-d0[1]*sn,p.y-p0.y-d0[1]+d0[0]*sn+d0[1]*cs,0];});
   const code=dw.shape==='z'?'99':dw.shape,what=dw.shape==='z'?`รูปตัว Z ขาบน ${dw.topLeg}d ขาล่าง ${dw.bottomLeg}d`:dw.shape==='21'?`งอสองปลาย ขาบน ${dw.topLeg}d ขาล่าง ${dw.bottomLeg}d`:dw.shape==='11'?`งอปลายบน ${dw.topLeg}d`:'ตรง';
   out.push({role:`joint${k+1}-dowel`,note:`เหล็กแนวตั้งทะลุรอยต่อการเท ${k+1} (V.D.B) @ ${dw.spacingX} × ${dw.spacingY} mm · ฝังลง Stage ล่าง ${Math.round(J-zb)} · ขึ้นถึง +${Math.round(zt)} · ${what}`,
    diameter:d,grade:g,count:pts.length,points,axis:'Z',face:'side',radius:code==='00'?0:rad,shapeCode:code,offsets,...(turns.some(t=>t)?{turns}:{})});}
 });
 // Side face loops: horizontal loops, outermost (bar face at the side cover), spaced from the bottom mesh to the top mesh;
 // each loop = lapped pieces (`loopPieces`: lap pattern 1 / 2 / 3 / custom, no piece over 10 m)
 if(r.side.enabled){
  const dl=r.side.diameter,ring=inset(plan,c.side+dl/2),rad=radius(dl,det),zLo=c.bottom+r.bottomX.diameter+r.bottomY.diameter+dl/2,zHi=T-c.top-topStack-dl/2;
  // only in the chosen pour stages (contiguous stages = one run); 50 mm clear of each construction joint
  const pr=footingPour(i),sel=pr.stages.length>1&&r.side.stages.length>0&&pr.stages.some(st=>!r.side.stages.includes(st.stage)),runs:{lo:number;hi:number;name:string}[]=[];
  if(!sel)runs.push({lo:zLo,hi:zHi,name:''});
  else for(const st of pr.stages){if(!r.side.stages.includes(st.stage)||st.z0>=zHi)continue;
   const prev=runs.at(-1),hi=Math.min(zHi,st.stage<pr.stages.length?st.z1-50-dl/2:st.z1);
   if(prev&&r.side.stages.includes(st.stage-1)){prev.hi=hi;prev.name=`${prev.name.split('–')[0]}–${st.stage}`;}
   else runs.push({lo:Math.max(zLo,st.stage>1?st.z0+50+dl/2:st.z0),hi,name:`${st.stage}`});}
  if(i.shape==='circle')warn('เหล็กรอบข้าง (LOOPS): ฐานกลมยังไม่รองรับ ให้เพิ่มเองในแท็บ “แบบ & BBS”');
  else{
   // above the lowest cut top the loops run around the plan without the lowered areas
   const cutTop=cuts.length?Math.min(...cuts.map(b=>b.z0))-c.top-topStack:Infinity,cutRing=cuts.length?inset(outlineOf([{label:'',x0:0,y0:0,x1:X,y1:Y,z0:0,z1:T}],[...cuts,...footingOpenings(i)]),c.side+dl/2):ring;
   const lapWarn=new Set<string>();
   const pushLoop=(role:string,note:string,rg:Pt[],count:number,from:number,to:number,name:string)=>{const lp=loopPieces(rg,r.side.laps,det,dl),n=lp.pieces.length,mx=lp.max/1000;
    if(lp.upgraded&&r.side.laps)lapWarn.add(`เหล็กรอบข้าง (LOOPS): ยาวเกิน ${mx} ม. เพิ่มจุดทาบอัตโนมัติ (ดูจำนวนจุดทาบใน BBS)`);
    if(lp.tooLong)lapWarn.add(`เหล็กรอบข้าง (LOOPS)${name}: มีท่อนยาวเกิน ${mx} ม. เพิ่มจุดทาบ`);
    lp.pieces.forEach((q,k)=>{const b=q.pts.length-2;out.push({role:n>1?`${role}-p${k+1}`:role,note:`${note} · ทาบ ${n} จุด (${lp.pattern==='custom'?'กำหนดเอง':`รูปแบบ ${lp.pattern}`}) ระยะทาบ ${Math.round(lp.x)} mm${n>1?` · ท่อน ${k+1}/${n}`:''}`,diameter:dl,grade:g,count,
     points:q.pts.map(([x,y])=>[x,y,from] as V3),axis:'Z',face:'side',radius:b>0?rad:0,shapeCode:b<=0?'00':b===1?'11':b===2?'21':'99',distributionAxis:'Z',from,to});});};
   runs.forEach((run,n)=>{const sz=run.hi>run.lo?spread(run.lo,run.hi,r.side.spacing):undefined;
    if(!sz){warn(`เหล็กรอบข้าง (LOOPS)${sel?` Stage ${run.name}`:''}: ความสูงไม่พอ`);return;}
    const zs=Array.from({length:sz.count},(_,k)=>sz.count===1?sz.from:sz.from+(sz.to-sz.from)*k/(sz.count-1)),parts:[number[],Pt[],string][]=[[zs.filter(z=>z<=cutTop),ring,''],[zs.filter(z=>z>cutTop),cutRing,' · เหนือส่วนลดระดับ']];
    parts.forEach(([lv,rg,what],h)=>{if(!lv.length||rg.length<3)return;
     pushLoop(`${n?`side-loop-${n+1}`:'side-loop'}${h?'-up':''}`,`เหล็กรอบข้าง (LOOPS)${sel?` · Stage ${run.name}`:''}${what} · ${lv.length} ชั้น @ ≤ ${r.side.spacing} mm`,rg,lv.length,lv[0],lv.at(-1)!,`${sel?` Stage ${run.name}`:''}${what}`);});});
   // blocks: loops around each block outline over its height
   // a block enclosed by concrete at least as high (e.g. a lower pit floor inside a raised ring) has no free face: no loops
   const enclosed=(gr:{z1:number;rects:FootingBox[]})=>{const ol=outlineOf(gr.rects),ccw=signedArea(ol)>0;
    return ol.every((a,k)=>{const b=ol[(k+1)%ol.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1)return true;const u=[(b[0]-a[0])/len,(b[1]-a[1])/len],n=ccw?[u[1],-u[0]]:[-u[1],u[0]];
     for(let t=Math.min(100,len/2);t<len;t+=200){const x=a[0]+u[0]*t+n[0]*50,y=a[1]+u[1]*t+n[1]*50;if(x<0||y<0||x>X||y>Y||footingTopAt(i,x,y)<gr.z1-1)return false;}return true;});};
   // (ribs: straight face bars instead, see above)
   blockGroups.forEach((gr,k)=>{if(enclosed(gr)||gr.rects.some(b=>b.rib))return;const rg=inset(outlineOf(gr.rects),c.side+dl/2),sz=spread(gr.z0+50+dl/2,gr.z1-c.top-topStack-dl/2,r.side.spacing);
    if(rg.length<3||!sz){warn(`เหล็กรอบข้าง (LOOPS) ส่วนเพิ่ม ${k+1}: ความสูงไม่พอ`);return;}
    const nm=gr.rects.map(b=>b.label).filter(Boolean).join(' + ')||`ส่วนเพิ่ม ${k+1}`;
    pushLoop(`side-loop-blk${k+1}`,`เหล็กรอบข้าง (LOOPS) ${nm} · ${sz.count} ชั้น @ ≤ ${r.side.spacing} mm`,rg,sz.count,sz.from,sz.to,` ${nm}`);});
   lapWarn.forEach(warn);
  }
 }
 // Stirrups (closed links) across a band centred on the footing, e.g. the beam strip over a pile row
 const sr=r.stirrups;
 if(sr?.enabled&&sr.diameter>0&&sr.spacing>0){
  if(i.shape!=='rect')warn('เหล็กปลอก (STIRRUPS) ในฐาน: รองรับเฉพาะฐานสี่เหลี่ยม');
  else{const d=sr.diameter,rad=radius(d,det),alongX=sr.dir==='x',L=alongX?X:Y,Wd=alongX?Y:X,J=footingPour(i).levels[0];
   const half=Math.min(sr.width,Wd-2*(c.side+sideIn))/2-d/2,mid=Wd/2,z0=c.bottom+d/2,z1=(J!==undefined&&J<T?J:T-c.top)-(J!==undefined&&J<T?50:0)-d/2;
   const s=spread(c.side+sideIn+d/2+50,L-c.side-sideIn-d/2-50,sr.spacing);
   if(half<=2*d||z1-z0<=4*d||!s)warn('เหล็กปลอก (STIRRUPS) ในฐาน: วางไม่ได้ ตรวจความกว้าง/ความสูง');
   else{const pts=link(alongX?1:0,2,alongX?0:1,mid-half,mid+half,z0,z1,s.from,det,rad,d);
    out.push({role:'stirrup',note:`${sr.replacesBottom?'เหล็กล่าง ทิศ '+(alongX?'Y':'X')+' แบบปลอก (HOOP)':'เหล็กปลอก (STIRRUPS) ในฐาน'} · กว้าง ${Math.round(sr.width)} mm (นอก-นอก) แนว ${alongX?'X':'Y'} · สูง ${Math.round(z1-z0+d)} mm @ ${sr.spacing} mm`,diameter:d,grade:g,count:s.count,points:pts,axis:alongX?'Y':'X',face:'side',radius:rad,shapeCode:'99',distributionAxis:alongX?'X':'Y',from:s.from,to:s.to});}}
 }
 // Vertical face bars on every face of the plan outline, ends straight or turned inward 90°.
 // One Mark: the template is copied to each position and turned to face inward (offsets + offsetTurns).
 // vb.y = own size / spacing on the faces parallel to Y (the main values then apply to the faces parallel to X).
 if(vIn){
  const dmax=Math.max(vb.diameter,vb.y?.diameter||0),ring=inset(plan,c.side+loopIn+dmax/2),ccw=signedArea(ring)>0;
  const faces:{l:{diameter:number;spacing:number};on:(u:Pt)=>boolean;tag:string;name:string}[]=vb.y
   ?[{l:vb,on:u=>Math.abs(u[0])>=Math.abs(u[1]),tag:'',name:' ผิวด้าน X'},{l:vb.y,on:u=>Math.abs(u[0])<Math.abs(u[1]),tag:'-y',name:' ผิวด้าน Y'}]
   :[{l:vb,on:()=>true,tag:'',name:''}];
  faces.forEach(({l,on,tag,name})=>{
  // leg 0: top return = Ldh (anchorage into the slab / top of the footing), bottom return = 15d
  const dv=l.diameter,rad=radius(dv,det),retT=vb.leg>0?vb.leg:hookDevLength(det,dv),retB=vb.leg>0?vb.leg:15*dv,out0=(dmax-dv)/2;
  const zb=vb.bottom==='inward'?c.bottom+r.bottomX.diameter+r.bottomY.diameter+dv/2:c.bottom+dv/2,zt=vb.toJoint&&firstTop!==undefined?firstTop-dv/2:vb.top==='inward'?T-c.top-topStack-dv/2:T-c.top-dv/2;
  const pos:{p:Pt;n:Pt}[]=[];
  // a thinner bar keeps its face at the same distance from the concrete face (the ring is set by the larger bar)
  ring.forEach((a,k)=>{const b=ring[(k+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),s=spread(0,len,l.spacing);if(!s||len<1)return;const u:Pt=[(b[0]-a[0])/len,(b[1]-a[1])/len],n:Pt=ccw?[-u[1],u[0]]:[u[1],-u[0]];
   if(!on(u))return;
   for(let j=0;j<s.count-1;j++){const t=s.count===1?0:len*j/(s.count-1);pos.push({p:[a[0]+u[0]*t-n[0]*out0,a[1]+u[1]*t-n[1]*out0],n});}});
  const tooLong=Math.max(vb.top==='inward'?retT:0,vb.bottom==='inward'?retB:0)>=Math.min(X,Y)/2-c.side;
  if(zt-zb<=2*rad)warn(`เหล็กแนวตั้งผิวข้าง${name}: ความหนาฐานไม่พอ`);
  else if(!pos.length)warn(`เหล็กแนวตั้งผิวข้าง${name}: วางเหล็กไม่ได้`);
  else{
   if(tooLong)warn(`เหล็กแนวตั้งผิวข้าง${name}: ระยะงอเข้าในยาวเกินครึ่งฐาน ใช้ปลายตรง`);
   const inB=vb.bottom==='inward'&&!tooLong,inT=vb.top==='inward'&&!tooLong;
   // the top follows the concrete at each position (lowered areas / blocks on the edge): one Mark per height
   // lowest concrete top within cover of the bar along the face and where its top hook ends (a bar beside a step, or under a
   // part too narrow for the hook, stops under the lower top)
   const topOf=(q:{p:Pt;n:Pt})=>{const k=c.side+loopIn+dv,u:Pt=[-q.n[1],q.n[0]],r2=inT?retT+c.side:0,t=Math.min(topAt(q.p[0],q.p[1]),topAt(q.p[0]+u[0]*k,q.p[1]+u[1]*k),topAt(q.p[0]-u[0]*k,q.p[1]-u[1]*k),topAt(q.p[0]+q.n[0]*r2,q.p[1]+q.n[1]*r2));return Math.abs(t-T)<.5?zt:t-c.top-(inT?topStack:0)-dv/2;};
   const heights=[...new Set(pos.map(q=>Math.round(topOf(q))))].sort((a,b)=>b-a);
   heights.forEach((h,hk)=>{const grp=pos.filter(q=>Math.round(topOf(q))===h),zt=topOf(grp[0]);if(zt-zb<=2*rad)return;
   const tpl=({p,n}:{p:Pt;n:Pt}):V3[]=>[...(inB?[[p[0]+n[0]*retB,p[1]+n[1]*retB,zb] as V3]:[]),[p[0],p[1],zb],[p[0],p[1],zt],...(inT?[[p[0]+n[0]*retT,p[1]+n[1]*retT,zt] as V3]:[])];
   const pos2=grp,first=pos2[0],points=tpl(first),pivot=points.at(-1)!,ang=(n:Pt)=>Math.atan2(n[1],n[0]);
   const turns=pos2.map(q=>Math.round((ang(q.n)-ang(first.n))*180/Math.PI*1000)/1000);
   const offsets=pos2.map(q=>{const last=tpl(q).at(-1)!;return [last[0]-pivot[0],last[1]-pivot[1],0] as V3;});
   const code=inB&&inT?'21':inB||inT?'11':'00',parts=[inB&&'ล่าง',inT&&'บน'].filter(Boolean).join('/');
   out.push({role:`side-vertical${tag}${hk?`-${hk+1}`:''}`,note:`เหล็กแนวตั้งผิวข้าง${name} @ ≤ ${l.spacing} mm · ${pos2.length} ตำแหน่ง${heights.length>1?` (สูงถึง +${Math.round(zt)})`:name?'':' รอบฐาน'}${inT?` · ปลายบนงอเข้าใน Ldh ${Math.round(retT)} mm`:''}${inB?` · ปลายล่างงอเข้าใน ${Math.round(retB)} mm`:''}`,diameter:dv,grade:g,count:pos2.length,points,axis:'Z',face:'side',radius:code==='00'?0:rad,shapeCode:code,offsets,turns});});
  }});
 }
 const cols=footingColumns(i),many=cols.length>1;
 for(const [ci,col] of cols.entries()){const sfx=ci?`-c${ci+1}`:'';
 const pedestal=col.type==='pedestal',name=many?footingColumnName(col,ci,true):col.columnNo?`${pedestal?'เสาตอม่อ':'Starter'} ${col.columnNo}`:pedestal?'เสาตอม่อ':'Starter bar';
 const {w,d:depth}=columnExtent(col),ox=(X-w)/2+col.offsetX,oy=(Y-depth)/2+col.offsetY,dt=pedestal?col.tie.diameter:0;
 const tp=pedestal&&col.shape==='rect'?col.tie.pattern??'none':'none';
 // with set-2 ties the bars sit where the column tie layout puts them (symmetric spacing)
 const all=columnBarPositions(col,col.cover+dt,tp!=='none').map(b=>({...b,x:ox+b.x,y:oy+b.y}));
 if(!all.length){warn(`${name}: ไม่มีตำแหน่งเหล็กยืน`);continue;}
 const meshTop=c.bottom+r.bottomX.diameter+r.bottomY.diameter,top=topAt(ox+w/2,oy+depth/2)+(pedestal?col.height:0);
 const groups=[...new Set(all.map(b=>b.d))].sort((a,b)=>b-a),kinds:Record<ColumnBarPos['kind'],string>={corner:'มุม',sideX:'ด้าน X',sideY:'ด้าน Y',ring:'รอบวง',inner:'ใน'};
 for(const dm of groups){
  const set=all.filter(b=>b.d===dm),pts=set.map(b=>[b.x,b.y] as [number,number]),rad=radius(dm,det),zMin=meshTop+dm/2;
  let zBend=col.embed.mode==='custom'?T-col.embed.depth:zMin;
  if(zBend<zMin){warn(`${name}: ระยะฝังลึกเกินตะแกรงเหล็กล่าง ใช้ระดับบนตะแกรงแทน`);zBend=zMin;}
  const cpl=col.splice?.type==='coupler',stag=cpl&&set.length>1?Math.max(0,col.splice.stagger):0;
  // coupler: the bar ends at the coupler (top + projection, 0 = at the concrete surface)
  const zTop=cpl?top+Math.max(0,col.projection):col.projection>0?top+col.projection:top-col.cover-dm/2,want=bendLeg(col.bend,col.leg,dm,det);
  // Feet bend outward around the column centre: side bars perpendicular to their face,
  // corner bars diagonally, circular columns radially.
  const cx=ox+w/2,cy=oy+depth/2,dirOf=(b:ColumnBarPos):Pt=>{const dx=b.x-cx,dy=b.y-cy;if(b.kind==='sideX')return [0,Math.sign(dy)||1];if(b.kind==='sideY')return [Math.sign(dx)||1,0];if(b.kind==='corner')return [(Math.sign(dx)||1)/Math.SQRT2,(Math.sign(dy)||1)/Math.SQRT2];const l=Math.hypot(dx,dy)||1;return [dx/l,dy/l];};
  const room=inset(plan,c.side+dm/2),dirs=set.map(dirOf),fits=(len:number)=>set.every((b,k)=>pointInPolygon([b.x+dirs[k][0]*len,b.y+dirs[k][1]*len],room));
  let leg=want>rad*1.5?want:0;while(leg>0&&!fits(leg)){leg-=10;if(leg<=rad*1.5)leg=0;}
  if(want>0&&!leg)warn(`${name} DB${dm}: พื้นที่ฐานรากไม่พอสำหรับขางอ ใช้เหล็กตรง`);
  else if(leg&&leg<want-.5)warn(`${name} DB${dm}: ขางอถูกจำกัดเป็น ${Math.round(leg)} mm ให้อยู่ในฐานราก`);
  // staggered couplers: every second bar (around the section) ends `stag` higher, as its own Mark
  const sets=stag?[set.map((_,k)=>k).filter(k=>k%2===0),set.map((_,k)=>k).filter(k=>k%2===1)]:[set.map((_,k)=>k)];
  sets.forEach((ix,si)=>{
   const sub=ix.map(k=>set[k]),sp=ix.map(k=>pts[k]),sd=ix.map(k=>dirs[k]),zT=zTop+si*stag;
   const [x0,y0]=sp[0],d0=sd[0],a0=Math.atan2(d0[1],d0[0]),mix=(Object.keys(kinds) as ColumnBarPos['kind'][]).map(k=>[k,sub.filter(b=>b.kind===k).length] as const).filter(([,n])=>n>0).map(([k,n])=>`${kinds[k]} ${n}`).join(' · ');
   const proj=zT-top,parts=[`ฝัง ${Math.round(T-zBend)}`,leg?`งอฉากออกรอบเสา ${Math.round(leg)}`:'ปลายตรง',cpl?`Coupler ที่ปลายบน ${proj>0?`โผล่ ${Math.round(proj)}`:'ที่ผิวคอนกรีต'}${stag?` (เหลื่อม ${Math.round(stag)} · ชุด ${si+1}/2)`:''}`:col.projection>0?`โผล่ ${Math.round(col.projection)}`:''].filter(Boolean);
   const turns=sd.map(dv=>{let t=(Math.atan2(dv[1],dv[0])-a0)*180/Math.PI;while(t>180)t-=360;while(t<=-180)t+=360;return Number(t.toFixed(4));});
   out.push({role:(groups.length>1?`column-main-${dm}`:'column-main')+(si?'-cpl2':'')+sfx,note:`เหล็กยืน ${name} (${mix}) · ${parts.join(' · ')} mm`,diameter:dm,grade:g,count:sp.length,points:leg?[[x0+d0[0]*leg,y0+d0[1]*leg,zBend],[x0,y0,zBend],[x0,y0,zT]]:[[x0,y0,zBend],[x0,y0,zT]],axis:'Z',face:'side',radius:leg?rad:0,shapeCode:leg?'11':'00',offsets:offsetsFrom(sp),...(leg?{turns}:{})});
  });
 }
 const minGap=Math.min(Infinity,...all.flatMap((a,i)=>all.slice(i+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y)-(a.d+b.d)/2)));
 if(minGap<-0.5)warn(`${name}: ตำแหน่งเหล็กยืนซ้อนกัน ลดจำนวนหรือขนาดเหล็ก`);
 if(pedestal){
  const ext=tieHook(dt,det).ext,trad=radius(dt,det,true),tc=col.cover+dt/2,tz=spread(T+50,top-col.cover-dt/2,col.tie.spacing);
  if(!tz)warn(`${name}: ความสูงไม่พอสำหรับเหล็กปลอก`);
  else if(col.shape==='circle'){const Rt=col.diameter/2-tc,ctr=[ox+col.diameter/2,oy+col.diameter/2];out.push({role:'column-tie'+sfx,note:`ปลอกวงกลม${name} (ยาว = เส้นรอบวง + ขอ ${tieHook(dt,det).angle}° 2 × ${Math.round(ext)} mm)`,diameter:dt,grade:det.tieGrade,count:tz.count,points:Array.from({length:37},(_,k)=>[ctr[0]+Rt*Math.cos(2*Math.PI*k/36),ctr[1]+Rt*Math.sin(2*Math.PI*k/36),tz.from] as V3),axis:'Z',face:'side',radius:0,shapeCode:'99',distributionAxis:'Z',from:tz.from,to:tz.to,cut:roundUp(2*Math.PI*Rt+2*ext,rounding)});}
  else columnBoxes(col).forEach((b,k,all)=>{const full=col.shape==='L'||col.shape==='U'?(k===0?{...b}:{...b,y0:0}):b;out.push({role:`column-tie-${k+1}${sfx}`,note:`เหล็กปลอก${name}${all.length>1?` · ${k===0?'ขาแนว X':`ขาแนว Y${all.length>2?` ${k}`:''}`}`:''}`,diameter:dt,grade:det.tieGrade,count:tz.count,points:link(0,1,2,ox+full.x0+tc,ox+full.x1-tc,oy+full.y0+tc,oy+full.y1-tc,tz.from,det,trad,dt),axis:'Z',face:'side',radius:trad,shapeCode:'99',distributionAxis:'Z',from:tz.from,to:tz.to});});
  // set 2: supplementary ties of the pattern, just above each hoop (below it at the top level)
  if(tz&&tp!=='none'){
   const lay=columnTieLayout(pedestalAsColumn(col),tp,det),label=tiePatternInfo[tp].label;
   lay.issues.forEach(s=>warn(`${name} ปลอกชุดที่ 2 (${label}): ${s}`));
   const levels=Array.from({length:tz.count},(_,k)=>{const zz=tz.count===1?tz.from:tz.from+(tz.to-tz.from)*k/(tz.count-1);return zz+dt<=top-col.cover-dt/2+1e-6?zz+dt:zz-dt;});
   const groups=new Map<string,{piece:TiePiece;at:Pt[]}>();
   for(const pc of lay.pieces){const o=pc.pts[0],sig=pc.kind+pc.pts.map(p=>`${Math.round((p[0]-o[0])*10)},${Math.round((p[1]-o[1])*10)}`).join(';'),g=groups.get(sig);if(g)g.at.push(o);else groups.set(sig,{piece:pc,at:[o]});}
   [...groups.values()].forEach(({piece,at},k)=>{
    const o=at[0],offsets=levels.flatMap(zz=>at.map(p=>[p[0]-o[0],p[1]-o[1],zz-levels[0]] as V3));
    const kind=piece.kind==='cross'?'เหล็กรัดขวาง ขอ 135°/90°':`ปลอกใน ${tieHookLabel(dt,det)}`;
    out.push({role:`column-tie-in${k+1}${sfx}`,note:`ปลอกชุดที่ 2 ${name} · ${label} · ${kind} · ${at.length} ตำแหน่ง × ${levels.length} ชั้น @${col.tie.spacing}`,diameter:dt,grade:det.tieGrade,count:offsets.length,points:piece.pts.map(p=>[ox+p[0],oy+p[1],levels[0]] as V3),axis:'Z',face:'side',radius:lay.R,shapeCode:'99',offsets});
   });
  }
 }
 }
 return out;
}

/** A storey of a column stack copied from the single-column fields (or the storey below). */
export function newColumnStorey(i:ColumnInput,prev?:ColumnStorey,name?:string):ColumnStorey{
 if(prev)return {...structuredClone(prev),name:name??prev.name};
 const t=i.rebar.tie,inner=t.inner.middle.pattern;
 return {name:name??'1st',height:i.height||4000,beamDepth:600,width:i.width||400,depth:i.depth||400,main:structuredClone(i.rebar.main),
  tie:{diameter:t.diameter,sets:1,pattern:inner,s1:t.spacing,s2:t.lower.spacing||t.spacing}};
}
export function columnStackFrom(i:ColumnInput):ColumnInput{
 return {...i,layout:'stack',shape:'rect',stack:i.stack.storeys.length?i.stack:{...i.stack,storeys:[newColumnStorey(i)]}};
}
/** Storey bases (z from the top of footing / first floor), clear heights and tie zones:
 * first storey on a footing: S2 over H/3, S1 over H/2, S2 over H/6; other storeys H/6 · 2H/3 · H/6 (S2 · S1 · S2) unless `stack.zones` says otherwise;
 * the top S2 zone continues through the beam depth (joint). */
export function columnStackLayout(i:ColumnInput){
 const S=i.stack.storeys,W=Math.max(...S.map(s=>s.width)),D=Math.max(...S.map(s=>s.depth));let z=0;
 const zr=i.stack.zones??{first:{lower:3,upper:6},typical:{lower:6,upper:6}};
 const storeys=S.map((s,k)=>{const z0=z;z+=s.height;const clear=Math.max(1,s.height-s.beamDepth),first=k===0&&i.stack.footing.enabled,r=first?zr.first:zr.typical;
  return {...s,k,z0,z1:z,clear,ox:(W-s.width)/2,oy:(D-s.depth)/2,lower:clear/r.lower,upper:clear/r.upper+s.beamDepth,first};});
 return {storeys,W,D,H:z};
}
/** Column stack bars: ties per storey (existing column generator, zones by H), main bars over runs of storeys with the
 * same bars (sections equal or stepping in < 75 mm per face → crank 1:6 below the floor): bottom into the footing with a
 * 12d hook (or dowelled into the column below where the run breaks), top with F.T.A (12d inward) at the last storey or below a section change; joints in every storey by
 * mechanical couplers (two groups `stagger` apart, 50 %) or laps. Returns the bars and the coupler count per size. */
function columnStackBars(i:ColumnInput,det:Detailing,rounding:number,warn:(s:string)=>void):{bars:GenBar[];couplers:Map<number,number>}{
 const out:GenBar[]=[],couplers=new Map<number,number>(),lay=columnStackLayout(i),S=lay.storeys,c=i.cover.side,st=i.stack;
 const asCol=(s:typeof S[number]):ColumnInput=>({...i,layout:'single',shape:'rect',width:s.width,depth:s.depth,height:s.height,
  rebar:{main:s.main,tie:{diameter:s.tie.diameter,spacing:s.tie.s1,lower:{length:Math.round(s.lower),spacing:s.tie.s2},upper:{length:Math.round(s.upper),spacing:s.tie.s2},
   inner:{diameter:s.tie.diameter,lower:{pattern:s.tie.pattern,spacing:s.tie.s2},middle:{pattern:s.tie.pattern,spacing:s.tie.s1},upper:{pattern:s.tie.pattern,spacing:s.tie.s2}}},
   bottom:{mode:'none',lap:0},top:{mode:'none',lap:0}}});
 const shift=(b:GenBar,s:typeof S[number]):GenBar=>({...b,points:b.points.map(([x,y,z])=>[x+s.ox,y+s.oy,z+s.z0] as V3),
  ...(b.distributionAxis==='Z'&&b.from!==undefined?{from:b.from+s.z0,to:(b.to??b.from)+s.z0}:{})});
 // ---- ties of every storey (set 1 hoop + set 2 pattern), from the single-column generator
 for(const s of S){
  const tb=columnBars(asCol(s),det,rounding,warn).filter(b=>!b.role.startsWith('main'));
  for(const b of tb)out.push({...shift(b,s),role:`s${s.k+1}-${b.role}`,note:`${s.name} · ${b.note}`});
  // pieces per tie set (as `n` in nYd@S1(d@S2)): hoop + set-2 pieces at one level of the middle zone
  const hoops=tb.find(b=>b.role==='tie-middle'||b.role==='tie')?.count||1,pieces=1+tb.filter(b=>b.role.startsWith('tie2-middle')).reduce((n,b)=>n+b.count,0)/hoops;
  if(s.tie.sets>0&&pieces!==s.tie.sets)warn(`${s.name}: ปลอกต่อชุดในแบบ ${s.tie.sets} ชิ้น · รูปแบบที่เลือกให้ ${pieces} ชิ้น · ตรวจรูปแบบปลอกใน`);
 }
 // ties inside the footing: hoops ≤ @500 below the top of footing
 if(st.footing.enabled&&st.footing.depth>250){const s=S[0],dt=s.tie.diameter,tc=c+dt/2,tz=spread(-(st.footing.depth-150),-100,500);
  // below z = 0: positions as offsets (distribution ranges start at 0)
  if(tz){const step=tz.count>1?(tz.to-tz.from)/(tz.count-1):0;out.push({role:'footing-tie',note:`เหล็กปลอกในฐานราก @≤500`,diameter:dt,grade:det.tieGrade,count:tz.count,points:link(0,1,2,s.ox+tc,s.ox+s.width-tc,s.oy+tc,s.oy+s.depth-tc,tz.from,det,radius(dt,det,true),dt),axis:'Z',face:'side',radius:radius(dt,det,true),shapeCode:'99',offsets:Array.from({length:tz.count},(_,j)=>[0,0,j*step] as V3)});}}
 // ---- main bars over runs of storeys with the same bars: equal sections, or a section stepping in by less than
 // 75 mm per face (ACI offset bars: cranked 1:6 just below the floor); larger steps stop the run (hook + dowels)
 const crankable=(p:ColumnStorey,q:ColumnStorey)=>JSON.stringify(p.main)===JSON.stringify(q.main)&&q.width<=p.width&&q.depth<=p.depth&&p.width-q.width<150&&p.depth-q.depth<150;
 const cx=lay.W/2,cy=lay.D/2,sg=(v:number)=>Math.sign(v)||1;
 const inward=(b:ColumnBarPos):Pt=>b.kind==='sideX'?[0,sg(cy-b.y)]:b.kind==='sideY'?[sg(cx-b.x),0]:[sg(cx-b.x)/Math.SQRT2,sg(cy-b.y)/Math.SQRT2];
 const lengthOf=(ps:V3[])=>ps.slice(1).reduce((s,p,q)=>s+Math.hypot(p[0]-ps[q][0],p[1]-ps[q][1],p[2]-ps[q][2]),0);
 let k=0;
 while(k<S.length){let e=k;while(e+1<S.length&&crankable(S[e],S[e+1]))e++;
  const s0=S[k],sN=S[e],run=S.slice(k,e+1),posAt=run.map(s=>columnInputBars(asCol(s)).map(b=>({...b,x:b.x+s.ox,y:b.y+s.oy})));
  const changeBelow=k>0,changeAbove=e<S.length-1,runName=e>k?`${s0.name||`ชั้น ${k+1}`} ถึง ${sN.name||`ชั้น ${e+1}`}`:s0.name||`ชั้น ${k+1}`;
  if(changeBelow)warn(`${s0.name}: หน้าตัด / เหล็กยืนเปลี่ยนจากชั้นล่าง (ร่นเกิน 75 mm ต่อด้าน หรือเหล็กไม่เท่าเดิม) · เหล็กชั้นล่างงอปิดที่หัวเสา · เหล็กชั้นนี้ฝังลงเสาชั้นล่าง ตรวจกับแบบ`);
  // storey of the run at level z, bar j there
  const at=(z:number)=>{let t=0;while(t+1<run.length&&run[t+1].z0<=z)t++;return t;};
  for(const dm of [...new Set(posAt[0].map(p=>p.d))].sort((a,b)=>b-a)){
   // hook legs: 12d + r, limited to the room across the section (side bars hook toward the opposite face)
   const idx=posAt[0].map((_,j)=>j).filter(j=>posAt[0][j].d===dm),lap=lapLength(det,dm);
   const room=Math.min(...run.map(s=>Math.min(s.width,s.depth)-2*(c+s.tie.diameter)))-1.5*dm,leg=Math.max(0,Math.min(det.hook90*dm+radius(dm,det),room));
   if(leg<det.hook90*dm+radius(dm,det)-.5)warn(`${runName} DB${dm}: ขางอที่หัวเสาถูกจำกัดเป็น ${Math.round(leg)} mm ให้อยู่ในหน้าตัด`);
   const zBot=k===0?(st.footing.enabled?-(st.footing.depth-75-dm/2):0):S[k].z0-lap;
   const zTop=sN.z1-c-sN.tie.diameter-dm/2,hookBot=k===0&&st.footing.enabled,hookTop=st.top==='fta'||changeAbove;
   // bar j from a to b: bottom hook outward (−u), crank 1:6 below each floor where the bar moves in, top hook inward (+u)
   const path=(j:number,a:number,b:number,hb:boolean,ht:boolean)=>{
    const t0=at(a),t1=at(b),u=inward(posAt[0][j]),p0=posAt[t0][j],p1=posAt[t1][j],pts:V3[]=[],cranks:string[]=[];
    if(hb)pts.push([p0.x-u[0]*leg,p0.y-u[1]*leg,a]);
    pts.push([p0.x,p0.y,a]);
    for(let t=t0+1;t<=t1;t++){const p=posAt[t-1][j],q=posAt[t][j],off=Math.hypot(q.x-p.x,q.y-p.y),z=run[t].z0;if(off<.5)continue;
     pts.push([p.x,p.y,Math.max(a+1,z-6*off)],[q.x,q.y,z]);cranks.push(`${run[t].name||`ชั้น ${k+t+1}`} ${Math.round(off)}×${Math.round(6*off)}`);}
    pts.push([p1.x,p1.y,b]);
    if(ht)pts.push([p1.x+u[0]*leg,p1.y+u[1]*leg,b]);
    return {pts,start:p0,cranks};
   };
   const ang=(j:number)=>{const u=inward(posAt[0][j]);return Math.atan2(u[1],u[0]);};
   for(const grp of [0,1]){const bars=idx.filter((_,n)=>n%2===grp);if(!bars.length)continue;
    // joint levels: one per storey of the run, just above the lower tie zone; group B `stagger` higher
    const joints=run.map(s=>s.z0+Math.round(s.lower/50)*50+50+(grp?st.splice.stagger:0)).filter(z=>z>zBot+500&&z<zTop-500);
    const cuts=[zBot,...joints,zTop],lapLen=st.splice.type==='lap'?lap:0;
    for(let j=0;j<cuts.length-1;j++){
     const a=cuts[j],b=cuts[j+1]+(j<cuts.length-2?lapLen:0),firstP=j===0,lastP=j===cuts.length-2,hb=firstP&&hookBot,ht=lastP&&hookTop;
     // bars of the same shape (in their own inward frame) share one Mark: template + offsets + turns about its last point
     const paths=new Map(bars.map(q=>[q,path(q,a,b,hb,ht)])),groups=new Map<string,number[]>();
     for(const q of bars){const {pts,start}=paths.get(q)!,r=-ang(q),cs=Math.cos(r),sn=Math.sin(r);
      const key=JSON.stringify(pts.map(p=>{const dx=p[0]-start.x,dy=p[1]-start.y;return [Math.round(dx*cs-dy*sn),Math.round(dx*sn+dy*cs),Math.round(p[2])];}));
      groups.set(key,[...(groups.get(key)||[]),q]);}
     let g=0;
     for(const G of groups.values()){g++;
      const {pts,start:p0,cranks}=paths.get(G[0])!,a0=ang(G[0]);
      const turns=G.map(q=>{let t=(ang(q)-a0)*180/Math.PI;while(t>180)t-=360;while(t<=-180)t+=360;return Number(t.toFixed(4));});
      const pv=pts.at(-1)!,d0=[pv[0]-p0.x,pv[1]-p0.y],offsets:V3[]=G.map((q,n)=>{const p=paths.get(q)!.start,t=turns[n]*Math.PI/180,cs=Math.cos(t),sn=Math.sin(t);return [p.x-p0.x-d0[0]+d0[0]*cs-d0[1]*sn,p.y-p0.y-d0[1]+d0[0]*sn+d0[1]*cs,0];});
      const hooks=(hb?1:0)+(ht?1:0),bent=hooks+cranks.length,what=[firstP?(hb?'ฝังในฐานราก งอ 12d':changeBelow?`ฝังลงเสาชั้นล่าง ${Math.round(lap)}`:'เริ่มที่ฐานเสา'):(st.splice.type==='coupler'?'Coupler':`ทาบ ${Math.round(lap)}`),lastP?(ht?(changeAbove?'งอปิดหัวเสา (หน้าตัดเปลี่ยน)':'F.T.A งอ 12d'):'ตัดที่ cover'):(st.splice.type==='coupler'?'Coupler':'ทาบ')];
      out.push({role:`main-${runName.replace(/[^a-zA-Z0-9]/g,'')||k}-${dm}-${grp?'b':'a'}-${j+1}${groups.size>1?`-${g}`:''}`,note:`${runName} · เหล็กยืน ${G.length} เส้น กลุ่ม ${grp?'B':'A'} ท่อน ${j+1}/${cuts.length-1} · ล่าง: ${what[0]} · บน: ${what[1]}${cranks.length?` · Crank 1:6 ใต้ระดับ ${cranks.join(', ')} mm`:''}`,
       diameter:dm,grade:det.mainGrade,count:G.length,points:pts.map(p=>p.map(v=>Number(v.toFixed(3))) as V3),axis:'Z',face:'side',radius:bent?radius(dm,det):0,shapeCode:bent===0?'00':hooks===1&&!cranks.length?'11':'99',
       offsets,...(bent?{turns}:{}),...(hooks===2||cranks.length&&hooks?{cut:roundUp(lengthOf(pts),rounding)}:{})});
     }
    }
    if(st.splice.type==='coupler')couplers.set(dm,(couplers.get(dm)||0)+bars.length*Math.max(0,cuts.length-2));
   }
  }
  k=e+1;}
 return {bars:out,couplers};
}
function columnBars(i:ColumnInput,det:Detailing,rounding:number,warn:(s:string)=>void):GenBar[]{
 const out:GenBar[]=[],c=i.cover.side,H=i.height,dt=i.rebar.tie.diameter,{bottom:eb,top:et}=i.rebar;
 const ext=tieHook(dt,det).ext,rect=i.shape==='rect',W=rect?i.width:i.diameter,Dp=rect?i.depth:i.diameter;
 // main bar centres and the inward crank direction of each bar (corner: diagonal, side: normal to its face, ring: radial)
 const all=columnInputBars(i),cx=W/2,cy=Dp/2,sg=(v:number)=>Math.sign(v)||1;
 const dirOf=(b:ColumnBarPos):Pt=>b.kind==='sideX'?[0,sg(cy-b.y)]:b.kind==='sideY'?[sg(cx-b.x),0]:b.kind==='corner'?[sg(cx-b.x)/Math.SQRT2,sg(cy-b.y)/Math.SQRT2]:(()=>{const l=Math.hypot(cx-b.x,cy-b.y)||1;return [(cx-b.x)/l,(cy-b.y)/l] as Pt;})();
 const sizes=[...new Set(all.map(b=>b.d))].sort((p,q)=>q-p),kinds:Record<ColumnBarPos['kind'],string>={corner:'มุม',sideX:'ด้าน X',sideY:'ด้าน Y',ring:'รอบวง',inner:'ใน'};
 for(const dm of sizes){
 const set=all.filter(b=>b.d===dm),pts=set.map(b=>[b.x,b.y] as Pt),dirs=set.map(dirOf),n=pts.length;
 const lapOf=(e:ColumnEnd)=>e.lap>0?e.lap:lapLength(det,dm),Lb=lapOf(eb),Lt=lapOf(et),off=dm,rise=6*off;
 const path=(p:[number,number],u:Pt):V3[]=>{
  const q:[number,number]=[p[0]+u[0]*off,p[1]+u[1]*off],P=(a:[number,number],z:number):V3=>[a[0],a[1],z];
  // crank slope starts exactly at the joint: bottom of column (z = 0) going down, top of column (z = H) going up
  // bottom 'none': bars start at the column bottom face (no end cover; they sit on the slab/footing below)
  const low=eb.mode==='none'?[P(p,0)]:eb.mode==='coupler'?[P(p,Math.max(0,eb.lap))]:eb.mode==='lap'?[P(p,-Lb)]:[P(q,-rise-Lb),P(q,-rise),P(p,0)];
  const high=et.mode==='none'?[P(p,H-c-dm/2)]:et.mode==='coupler'?[P(p,H+Math.max(0,et.lap))]:et.mode==='lap'?[P(p,H+Lt)]:[P(p,H),P(q,H+rise),P(q,H+rise+Lt)];
  return [...low,...high];
 };
 const endNote=(e:ColumnEnd,L:number)=>e.mode==='none'?(e===et?'ตัดที่ cover':'เริ่มที่ขอบล่างเสา'):e.mode==='coupler'?`Coupler ${e.lap>0?`เหนือรอยต่อ ${Math.round(e.lap)}`:'ที่รอยต่อ'}`:e.mode==='lap'?`ทาบ ${Math.round(L)}`:`Crank 1:6 เริ่มที่ระดับ${e===et?'บน':'ล่าง'}เสา ยาวดัด ${Math.round(rise)} + ทาบ ${Math.round(L)}`;
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
  const note=`${rect?`เหล็กปลอก ${tieHookLabel(dt,det)}`:`ปลอกเกลียว/วงกลม (ยาว = เส้นรอบวง + ขอ ${tieHook(dt,det).angle}° 2 × ${Math.round(ext)} mm)`}${zoned?` · ${zone} @${s}`:''}`,common={role:zoned?`tie-${key}`:'tie',note,diameter:dt,grade:det.tieGrade,count:tz.count,axis:'Z' as const,face:'side' as const,distributionAxis:'Z' as const,from:tz.from,to:tz.to};
  if(rect)out.push({...common,points:link(0,1,2,tc,W-tc,tc,Dp-tc,tz.from,det,trad,dt),radius:trad,shapeCode:'99'});
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
  // top level: below the hoop instead of above it when stacking above would cut into the top cover
  const r=range(key,z.spacing),topOk=H-c-di/2,tz=r&&spread(r[0]+lift,r[1]+lift<=topOk+1e-6?r[1]+lift:r[1]-lift,z.spacing);
  if(!lay.pieces.length||!tz)continue;
  const levels=Array.from({length:tz.count},(_,k)=>tz.count===1?tz.from:tz.from+(tz.to-tz.from)*k/(tz.count-1));
  // identical shapes (translation only) share one Mark
  const groups=new Map<string,{piece:TiePiece;at:Pt[]}>();
  for(const pc of lay.pieces){const o=pc.pts[0],sig=pc.kind+pc.pts.map(p=>`${Math.round((p[0]-o[0])*10)},${Math.round((p[1]-o[1])*10)}`).join(';'),g=groups.get(sig);if(g)g.at.push(o);else groups.set(sig,{piece:pc,at:[o]});}
  [...groups.values()].forEach(({piece,at},k)=>{
   const o=at[0],offsets=levels.flatMap(zz=>at.map(p=>[p[0]-o[0],p[1]-o[1],zz-levels[0]] as V3));
   if(offsets.length>2000){warn(`ปลอกชุดที่ 2 ${zone}: จำนวนชิ้นเกิน 2,000 ต่อ Mark เพิ่มระยะห่าง`);return;}
   const kind=piece.kind==='cross'?'เหล็กรัดขวาง ขอ 135°/90° (สลับปลายขอทุกชั้น)':`ปลอกใน ${tieHookLabel(di,det)}`;
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
 const reach=(e:ColumnEnd)=>e.mode==='none'?0:e.mode==='coupler'?(e===i.rebar.top?Math.max(0,e.lap):0):(e.lap>0?e.lap:lapLength(det,dm))+(e.mode==='crank'?6*dm:0);
 const out:RegionV2=[],top=reach(i.rebar.top),bottom=reach(i.rebar.bottom);
 if(top>0)out.push({id:'gencol-top',label:'เสาต้นบน (อ้างอิง)',origin:[0,0,i.height],size:[W,D,top+c+dm],reference:`เหล็กยืนต่อขึ้นเหนือรอยต่อ ${Math.round(top)} mm · พื้นที่อ้างอิง ไม่คิดปริมาณ`,cover:c,openings:[]});
 // always present: the column bottom face bears on the slab/footing below, so bars may start at it without end cover
 out.push({id:'gencol-bottom',label:'โครงสร้างใต้เสา (อ้างอิง)',origin:[0,0,-(bottom+c+dm)],size:[W,D,bottom+c+dm],reference:bottom>0?`เหล็กยืนต่อลงใต้รอยต่อ ${Math.round(bottom)} mm · พื้นที่อ้างอิง ไม่คิดปริมาณ`:'เหล็กยืนเริ่มที่ขอบล่างเสา (ไม่มี cover ปลาย) · พื้นที่อ้างอิง ไม่คิดปริมาณ',cover:c,openings:[]});
 return out;
}

const noBars=()=>({count:0,diameter:16});
/** Beam rebar of one mark: main bars, no extras, one stirrup size at `spacing` everywhere, no side bars. */
export function plainBeamRebar(top={count:2,diameter:16},bottom={count:3,diameter:16},stirrup={diameter:9,spacing:200}):BeamRebar{
 const zone=()=>({top:noBars(),bottom:noBars()});
 return {top,bottom,ex:{end:zone(),mid:zone(),con:zone(),cant:zone()},stirrup:{diameter:stirrup.diameter,legs:2,spacing:{end:stirrup.spacing,mid:stirrup.spacing,con:stirrup.spacing,cant:stirrup.spacing}},side:{count:0,diameter:12,tie:{diameter:9,spacing:600}}};
}
/** A new span / grid for a beam group (from the single-beam fields or the previous span). */
export function newBeamSpan(i:BeamInput,prev?:BeamSpan):BeamSpan{
 return prev?{...structuredClone(prev),kind:'span'}:{mark:'B1',kind:'span',length:i.length||6000,width:i.width||300,depth:i.depth||600,top:0,
  rebar:plainBeamRebar({count:i.rebar.top.count||2,diameter:i.rebar.top.diameter||16},{count:i.rebar.bottom.count||3,diameter:i.rebar.bottom.diameter||16},{diameter:i.rebar.stirrup.diameter||9,spacing:i.rebar.stirrup.spacing||200})};
}
export const newBeamGrid=(label:string,support=300,supportY=0):BeamGrid=>({label,support,supportY,extraTop:{count:0,diameter:16}});
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
  // section at each end: CANT for a cantilever, CON where the beam continues past the support, END otherwise
  const zoneA:BeamZone=s.kind==='cantilever'?'cant':k>0?'con':'end',zoneB:BeamZone=s.kind==='cantilever'?'cant':k<sp.length-1?'con':'end';
  return {...s,k,a,b,clear:b-a,z0:s.top-s.depth-lo,z1:s.top-lo,y0:(W-s.width)/2,y1:(W+s.width)/2,zoneA,zoneB,label:`${s.mark} (${gr[k]?.label||'ปลาย'}–${gr[k+1]?.label||'ปลาย'})`};});
 const n=sp.length,L=grid[n]+(gr[n]?.support||0)/2;
 const columns=gr.flatMap((g,k)=>{if(!(g.support>0))return [];const adj=spans.filter(s=>s.k===k||s.k===k-1);if(!adj.length)return [];
  const sy=g.supportY>0?g.supportY:g.support;
  return [{k,label:g.label,x0:grid[k]-g.support/2,x1:grid[k]+g.support/2,y0:(W-sy)/2,y1:(W+sy)/2,z0:Math.min(...adj.map(s=>s.z0)),z1:Math.max(...adj.map(s=>s.z1))}];});
 return {grid,spans,columns,W,H:hi-lo,L,datum:-lo};
}
type GroupSpan=ReturnType<typeof beamGroupLayout>['spans'][number];
/** Columns of a beam group for the 3D views (display only): the support box with a stub below / above the beam. */
export function beamColumnBoxes(input:unknown):{label:string;origin:V3;size:V3}[]{
 const i=input as ElementInput|undefined;if(i?.category!=='Beam'||i.layout!=='group'||!i.spans?.length)return [];
 const lay=beamGroupLayout(i),below=1500,above=500;
 return lay.columns.map(q=>({label:q.label,origin:[q.x0,q.y0,q.z0-below] as V3,size:[q.x1-q.x0,q.y1-q.y0,q.z1-q.z0+below+above] as V3}));
}
export const beamZoneLabels:Record<BeamZone,string>={end:'END',mid:'MID',con:'CON',cant:'CANT'};
/** Beam group bars (rules from the spec's typical beam details, all × clear span from the support face):
 * - main top / bottom bars continuous along spans (and cantilevers) of equal size and level: the count all spans share
 *   runs through, extra bars of heavier spans run on their own; hooked into end supports / level changes, bent at
 *   cantilever tips (top down, bottom up);
 * - EX top / bottom bars of the END / CON / CANT sections over each support: end support topEnd · L (hooked into the
 *   column), continuous support topCont · La both sides (La = longer adjacent span), cantilever: the whole cantilever +
 *   max(topCont · La, cantilever length) into the back span; EX bars of the MID section from bottomEnd / bottomCont · L;
 * - stirrups: END / CON spacing over stirrupZone · L from each support face, MID between, CANT over a cantilever;
 *   2 legs = one closed link, 4 / 6 / 8 legs = outer link + inner links;
 * - side face bars per face between the main bars, ties across the width at alternate levels;
 * - bars longer than the stock length are split with laps (top in the middle third of a span, bottom over / within
 *   L/4 of the supports), the lap centre as far along as the stock length allows. */
/** One bar run of a beam group that needed laps (splice report / checks). */
export type SpliceLap={x:number;lap:number;status:'ok'|'wide'|'outside'};
export type SpliceRun={role:string;note:string;face:Bar['face'];diameter:number;count:number;x0:number;x1:number;h0:number;h1:number;lap:number;lapKind:'FTL'|'FTL TOP';
 zones:[number,number][];wide:[number,number][];sets:{set:string;count:number;pieces:{a:number;b:number;length:number;role:string}[];laps:SpliceLap[]}[];roles:string[]};
function beamGroupBars(i:BeamInput,det:Detailing,warn:(s:string)=>void,splices?:SpliceRun[]):GenBar[]{
 const out:GenBar[]=[],{spans,grid,columns}=beamGroupLayout(i),c=i.cover,gr=i.grids,g=det.mainGrade;
 const rules={topEnd:.25,topCont:.3,bottomEnd:.125,bottomCont:.1,stirrupZone:.25,...det.beam};
 const col=(k:number)=>columns.find(q=>q.k===k);
 const dt=(s:GroupSpan)=>s.rebar.stirrup.diameter;
 const zTop=(s:GroupSpan,d:number)=>s.z1-c.top-dt(s)-d/2,zBot=(s:GroupSpan,d:number)=>s.z0+c.bottom+dt(s)+d/2;
 const across=(s:GroupSpan,d:number)=>({lo:s.y0+c.side+dt(s)+d/2,hi:s.y1-c.side-dt(s)-d/2});
 const hookLeg=(d:number)=>det.hook90*d+radius(d,det);
 /** run end at grid k anchored in the column: its far face − cover; without a column the concrete end − cover */
 const anchorX=(k:number,dir:-1|1,d:number,s:GroupSpan)=>{const q=col(k);return q?(dir<0?q.x0+c.side+d/2:q.x1-c.side-d/2):dir<0?s.a+c.side+d/2:s.b-c.side-d/2;};
 const down=(s:GroupSpan,z:number,d:number)=>-Math.max(0,Math.min(hookLeg(d),z-(s.z0+c.bottom+dt(s)+d)));
 const up=(s:GroupSpan,z:number,d:number)=>Math.max(0,Math.min(hookLeg(d),s.z1-c.top-dt(s)-d-z));
 /** bar run [x0, x1] at level z with end legs h0 / h1 (+ up, − down), split into stock lengths with Class B laps that
  * lie wholly inside the splice `zones` (farthest feasible point first, so pieces are as long as possible); `wide` =
  * fallback zones (bottom bars: up to L/3, warned). Runs with laps and ≥ 2 bars are split in sets A / B (alternate bars)
  * whose laps are ≥ 1 lap length apart (≤ 50 % of the bars spliced at a section). `top` = top bars (FTL TOP). */
 const emit=(role:string,note:string,d:number,count:number,x0:number,x1:number,z:number,h0:number,h1:number,face:Bar['face'],from:number,to:number,zones:[number,number][],opt:{wide?:[number,number][];top?:boolean;stagger?:boolean}={})=>{
  if(count<1||!d||x1-x0<1)return;
  const lap=lapLength(det,d,!!opt.top);
  // lap centres on a 25 mm grid, chosen for the whole run at once (fewest penalties, then fewest laps): main zone 1,
  // fallback zone 4, within 1 lap of the other set's laps +10 (not staggered), outside every zone 50 (+ distance), in a joint never
  const split=(avoid:number[])=>{const pieces:[number,number,number,number][]=[],laps:SpliceLap[]=[];
   if(x1-x0+Math.abs(h0)+Math.abs(h1)<=det.stockLength+1e-6){pieces.push([x0,x1,h0,h1]);return {pieces,laps};}
   const inside=(zs:[number,number][]|undefined,c:number)=>!!zs?.some(([lo,hi])=>c-lap/2>=lo-1e-6&&c+lap/2<=hi+1e-6);
   const cs:{c:number;cost:number;status:SpliceLap['status']}[]=[];
   for(let c=Math.ceil((x0+lap*1.5)/25)*25;c<=x1-lap;c+=25){
    if(columns.some(q=>c+lap/2>q.x0+1e-6&&c-lap/2<q.x1-1e-6))continue;
    const main=inside(zones,c),wide=!main&&inside(opt.wide,c),near=avoid.some(x=>Math.abs(x-c)<lap-1e-6);
    // outside every zone: as close to a zone as possible
    const off=main||wide?0:Math.min(...[...zones,...(opt.wide||[])].map(([lo,hi])=>Math.max(0,lo-(c-lap/2),c+lap/2-hi)),1e6);
    cs.push({c,cost:(main?1:wide?4:50+off/100)+(near?10:0)-c*1e-9,status:main?'ok':wide?'wide':'outside'});}
   // best[k]: cheapest way to start a piece at lap k (k = -1: the run start)
   const startOf=(k:number)=>k<0?x0:cs[k].c-lap/2,legOf=(k:number)=>k<0?Math.abs(h0):0;
   const best=cs.map(()=>Infinity),prev=cs.map(()=>-2);
   for(let k=0;k<cs.length;k++)for(let j=k-1;j>=-1;j--){const s0=startOf(j);if(cs[k].c+lap/2-s0+legOf(j)>det.stockLength+1e-6){if(j>=0&&cs[k].c-cs[j].c>det.stockLength)break;continue;}
    if(cs[k].c-s0<lap*1.5-1e-6)continue;const v=(j<0?0:best[j])+cs[k].cost;if(v<best[k]-1e-9){best[k]=v;prev[k]=j;}}
   let end=-2,top=Infinity;
   if(x1-x0+Math.abs(h0)+Math.abs(h1)<=det.stockLength+1e-6){end=-1;top=0;}
   cs.forEach((x,k)=>{if(best[k]<top-1e-9&&x1-startOf(k)+Math.abs(h1)<=det.stockLength+1e-6){top=best[k];end=k;}});
   if(end===-2){warn(`${note}: ต่อทาบไม่ได้ภายในเหล็กเส้น ${det.stockLength} mm`);pieces.push([x0,x1,h0,h1]);return {pieces,laps};}
   const path:number[]=[];for(let k=end;k>=0;k=prev[k])path.unshift(k);
   let s0=x0,l0=h0;for(const k of path){const {c,status}=cs[k];laps.push({x:c,lap,status});pieces.push([s0,c+lap/2,l0,0]);s0=c-lap/2;l0=0;}
   pieces.push([s0,x1,l0,h1]);return {pieces,laps};};
  const A=split([]),staggered=opt.stagger!==false&&count>=2&&A.laps.length>0;
  const B=staggered?split(A.laps.map(l=>l.x)):undefined;
  const nA=staggered?Math.ceil(count/2):count,nB=count-nA,gap=count>1?(to-from)/(count-1):0;
  const sets:{tag:string;n:number;f:number;t:number;r:ReturnType<typeof split>}[]=staggered?[{tag:'a',n:nA,f:from,t:from+2*gap*(nA-1),r:A},{tag:'b',n:nB,f:from+gap,t:from+gap+2*gap*(nB-1),r:B!}]:[{tag:'',n:count,f:count===1?(from+to)/2:from,t:count===1?(from+to)/2:to,r:A}];
  // pieces of the same length and end legs (any set) share one Mark: one bar placed by offsets at every copy
  const pieceRole=new Map<string,string>(),key=(p:[number,number,number,number])=>`${Math.round(p[1]-p[0])}|${Math.round(p[2])}|${Math.round(p[3])}`;
  const groups=new Map<string,{set:typeof sets[number];j:number;p:[number,number,number,number]}[]>();
  for(const st of sets)st.r.pieces.forEach((p,j)=>{if(st.r.pieces.length<2)return;const k=key(p);groups.set(k,[...(groups.get(k)||[]),{set:st,j,p}]);});
  const shared=[...groups.values()].filter(gp=>gp.length>1);
  const ysOf=(st:typeof sets[number])=>Array.from({length:st.n},(_,i)=>st.n>1?st.f+(st.t-st.f)*i/(st.n-1):st.f);
  const ptsOf=([a,b,ha,hb]:[number,number,number,number],y:number)=>[...(ha?[[a,y,z+ha] as V3]:[]),[a,y,z],[b,y,z],...(hb?[[b,y,z+hb] as V3]:[])].map(p=>p.map(v=>Number(v.toFixed(3))) as V3);
  const shapeOf=(ha:number,hb:number)=>{const hooks=(ha?1:0)+(hb?1:0);return {radius:hooks?radius(d,det):0,shapeCode:hooks===0?'00':hooks===1?'11':'21'};};
  shared.forEach((gp,k)=>{const r=`${role}-m${k+1}`,[a0,,ha,hb]=gp[0].p,y0=ysOf(gp[0].set)[0],offsets:V3[]=[];
   for(const x of gp){pieceRole.set(`${x.set.tag}|${x.j}`,r);for(const y of ysOf(x.set))offsets.push([Number((x.p[0]-a0).toFixed(3)),Number((y-y0).toFixed(3)),0]);}
   const where=gp.map(x=>`${x.set.tag?x.set.tag.toUpperCase():''}${x.j+1}/${x.set.r.pieces.length}`).join(', ');
   out.push({role:r,note:`${note} · ท่อนยาวเท่ากัน ${gp.length} ท่อน (ชุด/ท่อน ${where}) (ทาบ ${Math.round(lap)})`,diameter:d,grade:g,count:offsets.length,points:ptsOf(gp[0].p,y0),axis:'X',face,...shapeOf(ha,hb),offsets});});
  for(const st of sets){const P=st.r.pieces,base=st.tag?`${role}-${st.tag}`:role,setNote=st.tag?` · ชุด ${st.tag.toUpperCase()} ${st.n} เส้น (ต่อสลับ)`:'';
   P.forEach((p,j)=>{if(pieceRole.has(`${st.tag}|${j}`))return;const r=P.length>1?`${base}-p${j+1}`:base;pieceRole.set(`${st.tag}|${j}`,r);
    out.push({role:r,note:`${note}${setNote}${P.length>1?` · ท่อน ${j+1}/${P.length} (ทาบ ${Math.round(lap)})`:''}`,diameter:d,grade:g,count:st.n,points:ptsOf(p,st.f),axis:'X',face,...shapeOf(p[2],p[3]),distributionAxis:'Y',from:st.f,to:st.t});});
   for(const l of st.r.laps)if(l.status!=='ok')warn(`${note}${setNote}: ต่อทาบที่ ${Math.round(l.x)} ${l.status==='wide'?(face==='top'?'นอก 1/3 กลางช่วง · ขยายเป็นครึ่งกลางช่วง (ห่างผิวเสา ≥ L/4)':'นอกโซนหลัก · ขยายโซนเหล็กล่างถึง L/3'):`นอกช่วงที่อนุญาต (โซนสั้นกว่าระยะทาบ หรือเหล็กเส้น ${det.stockLength} mm ไปไม่ถึง) · ต่อใกล้โซนที่สุด`}`);}
  const together=B?B.laps.filter(y=>A.laps.some(x=>Math.abs(x.x-y.x)<lap-1e-6)).length:0;
  if(together)warn(`${note}: ต่อชุด A / B ห่างกันไม่ถึง 1 ระยะทาบ ${together} จุด (ต่อเกิน 50% ที่หน้าตัดเดียว · Class B ตาม ACI 318 25.5.2)`);
  if(splices&&A.laps.length)splices.push({role,note,face,diameter:d,count,x0,x1,h0,h1,lap,lapKind:opt.top?'FTL TOP':'FTL',zones,wide:opt.wide||[],sets:sets.map(st=>({set:st.tag.toUpperCase(),count:st.n,pieces:st.r.pieces.map(([a,b,ha,hb],j)=>({a,b,length:b-a+Math.abs(ha)+Math.abs(hb),role:pieceRole.get(`${st.tag}|${j}`)!})),laps:st.r.laps})),roles:[...new Set(pieceRole.values())]});
 };
 /** extra bars sit between the main bars when they leave room, else in a second layer (dz toward the core) */
 const placeEx=(main:{count:number;diameter:number},ex:{count:number;diameter:number},lo:number,hi:number,z:number,inward:1|-1)=>{
  if(main.count>=2&&ex.count<=main.count-1){const gap=(hi-lo)/(main.count-1),f=lo+gap/2;return {z,from:f,to:f+gap*(ex.count-1)};}
  return {z:main.count>0?z+inward*((main.diameter||ex.diameter)/2+Math.max(25,ex.diameter)+ex.diameter/2):z,from:lo,to:hi};
 };
 // splice zones (whole lap inside, never in a beam-column joint): top bars in the middle third of a span; bottom / side
 // bars from the support face to L/4 (special moment frame: from 2h, ACI 318 18.6.3.3); fallback (warned): top bars the
 // middle half (no laps within L/4 of a face), bottom bars up to L/3
 const special=rules.frame==='special';
 const midSplices=(list:GroupSpan[],f=1/3):[number,number][]=>list.filter(s=>s.kind!=='cantilever').map(s=>[s.a+f*s.clear,s.b-f*s.clear]);
 const nearSupports=(s:GroupSpan,f=.25):[number,number][]=>{if(s.kind==='cantilever')return [];const o=special?2*s.depth:0;
  return ([[s.a+o,s.a+f*s.clear],[s.b-f*s.clear,s.b-o]] as [number,number][]).filter(([lo,hi])=>hi>lo);};

 // ---- main top / bottom bars, continuous through the beam: neighbouring spans (cantilevers too) with the same bar size
 // and level form a chain. The bars every span of a stretch has run through it as one bar (laps: top in
 // the middle third of a span, bottom over / near the supports); the extra main bars of heavier spans are runs of their
 // own: top into the lighter span by the continuous-support cut-off (topCont · La), bottom to the far column face − 50.
 const mainBars=(layer:'top'|'bottom')=>{
  const top=layer==='top',lvl=(s:GroupSpan)=>top?s.z1:s.z0,cnt=(j:number)=>spans[j].rebar[layer].count;
  const joins=(x:GroupSpan,y:GroupSpan)=>{const p=x.rebar[layer],q=y.rebar[layer];return p.count>0&&q.count>0&&p.diameter===q.diameter&&Math.abs(lvl(x)-lvl(y))<25;};
  const run=(k:number,e:number,a:number,b:number,n:number,base:number)=>{
   const A=spans[a],B=spans[b],parts=spans.slice(a,b+1),d=A.rebar[layer].diameter;
   const lo=Math.max(...parts.map(p=>across(p,d).lo)),hi=Math.min(...parts.map(p=>across(p,d).hi));
   if(hi<lo){warn(`${A.label} เหล็ก${top?'บน':'ล่าง'}: คานแคบเกินไป`);return;}
   const z0=top?zTop(A,d):zBot(A,d),p=base>0?placeEx({count:base,diameter:d},{count:n,diameter:d},lo,hi,z0,top?-1:1):{z:z0,from:lo,to:hi},z=p.z;
   const end=(s:GroupSpan,side:'a'|'b')=>{const g=side==='a'?s.k:s.k+1,dir=side==='a'?-1:1,q=col(g),other=spans[side==='a'?s.k-1:s.k+1],inside=side==='a'?s.k>k:s.k<e;
    if(inside){ // the neighbour in the chain has fewer bars: extra bars continue past the support
     if(top){const La=Math.max(s.clear,other.clear),f=q?(dir<0?q.x0:q.x1):grid[g];return {x:f+dir*rules.topCont*La,hook:0};}
     return {x:q?(dir<0?q.x0+50:q.x1-50):dir<0?s.a:s.b,hook:0};}
    if(top)return {x:anchorX(g,dir,d,s),hook:down(s,z,d)};
    // cantilever tip: bent up like the top bars are bent down (Beam Configuration)
    if(!q)return {x:anchorX(g,dir,d,s),hook:s.kind==='cantilever'&&!other?up(s,z,d):0};
    if(other&&other.kind!=='cantilever'&&s.kind!=='cantilever'&&Math.abs(other.z0-s.z0)<25)return {x:dir<0?q.x0+50:q.x1-50,hook:0};
    return {x:anchorX(g,dir,d,s),hook:up(s,z,d)};};
   const L=end(A,'a'),R=end(B,'b');
   const zones:[number,number][]=top?midSplices(parts):parts.flatMap(x=>nearSupports(x)),wide=top?midSplices(parts,1/4):parts.flatMap(x=>nearSupports(x,1/3));
   const topCast=top&&parts.some(x=>z-x.z0>300);
   const marks=[...new Set(parts.map(x=>x.mark))].join(' / ');
   const what=`${parts.length>1?`${marks} (${gr[A.k]?.label||'ปลาย'}–${gr[B.k+1]?.label||'ปลาย'})`:A.label} · เหล็ก${top?'บน':'ล่าง'}${!top&&A.kind==='cantilever'?' (ช่วงยื่น)':''}${base>0?` เพิ่ม ${n} เส้น (เฉพาะช่วงนี้)`:parts.length>1?' ต่อเนื่อง':''}`;
   emit(`${layer}-${a+1}${b>a?`-${b+1}`:''}${base>0?`-x${base}`:''}`,what,d,n,L.x,R.x,z,L.hook,R.hook,top?'top':'bottom',p.from,p.to,zones,{wide,top:topCast});
  };
  // spans a..b of the chain k..e: bars above `base` that all of them have, then the stretches that have more
  const stack=(k:number,e:number,a:number,b:number,base:number)=>{
   const n=Math.min(...spans.slice(a,b+1).map(s=>s.rebar[layer].count))-base;if(n>0)run(k,e,a,b,n,base);
   for(let j=a;j<=b;j++){if(cnt(j)<=base+n)continue;let q=j;while(q<b&&cnt(q+1)>base+n)q++;stack(k,e,j,q,base+n);j=q;}
  };
  let k=0;
  while(k<spans.length){const t=spans[k].rebar[layer];if(t.count<1||!t.diameter){k++;continue;}
   let e=k;while(e+1<spans.length&&joins(spans[e],spans[e+1]))e++;
   stack(k,e,k,e,0);k=e+1;}
 };
 mainBars('bottom');mainBars('top');
 // ---- EX bars over the supports (top and bottom), from the END / CON / CANT sections of the adjacent spans
 gr.forEach((gd,gk)=>{
  const L0=spans[gk-1],R0=spans[gk];if(!L0&&!R0)return;
  for(const layer of ['top','bottom'] as const){
   // level change at this support: one bar per side, each anchored in the column
   const split=!!L0&&!!R0&&Math.abs(layer==='top'?L0.z1-R0.z1:L0.z0-R0.z0)>=25;
   for(const [L,R,tag] of (split?[[L0,undefined,'-l'],[undefined,R0,'-r']]:[[L0,R0,'']]) as [GroupSpan|undefined,GroupSpan|undefined,string][]){
    const exL=L?.rebar.ex[L.zoneB][layer],exR=R?.rebar.ex[R.zoneA][layer];
    // through bar: the larger of the two sections' extras (they should match on the drawings)
    const area=(x?:{count:number;diameter:number})=>x?x.count*x.diameter**2:0,x=area(exL)>=area(exR)?exL!:exR!;
    if(!x||x.count<1||!x.diameter)continue;
    if(exL&&exR&&area(exL)!==area(exR)&&exL.count>0&&exR.count>0)warn(`กริด ${gd.label||gk+1}: เหล็กเสริม${layer==='top'?'บน':'ล่าง'} ${L?.mark} (${exL.count}Ø${exL.diameter}) ≠ ${R?.mark} (${exR.count}Ø${exR.diameter}) · ใช้ ${x.count}Ø${x.diameter}`);
    const d=x.diameter,ref=(L&&R?(layer==='top'?(L.z1>=R.z1?L:R):(L.z0<=R.z0?L:R)):(L||R))!,main=ref.rebar[layer],{lo,hi}=across(ref,d);
    const p=placeEx(main,x,lo,hi,layer==='top'?zTop(ref,main.diameter||d):zBot(ref,main.diameter||d),layer==='top'?-1:1),z=p.z,q=col(gk);
    const bend=(s:GroupSpan)=>layer==='top'?down(s,z,d):up(s,z,d);
    const faceL=q?q.x0:grid[gk],faceR=q?q.x1:grid[gk],both=!!L&&!!R&&L.kind!=='cantilever'&&R.kind!=='cantilever';
    const reach=(s:GroupSpan,other?:GroupSpan)=>other?.kind==='cantilever'?Math.max(other.clear,rules.topCont*s.clear):both?rules.topCont*Math.max(L!.clear,R!.clear):rules.topEnd*s.clear;
    let a:number,ha=0,b:number,hb=0;
    if(!L){a=anchorX(gk,-1,d,R!);ha=bend(R!);}else if(L.kind==='cantilever'){a=L.a+c.side+d/2;ha=layer==='top'?bend(L):0;}else a=faceL-reach(L,R);
    if(!R){b=anchorX(gk,1,d,L!);hb=bend(L!);}else if(R.kind==='cantilever'){b=R.b-c.side-d/2;hb=layer==='top'?bend(R):0;}else b=faceR+reach(R,L);
    const sec=[L&&`${L.mark} ${beamZoneLabels[L.zoneB]}`,R&&`${R.mark} ${beamZoneLabels[R.zoneA]}`].filter(Boolean).join(' / ');
    emit(`g${gk+1}-ex-${layer}${tag}`,`เหล็กเสริม${layer==='top'?'บน':'ล่าง'} (EX) กริด ${gd.label||gk+1} · ${sec} · ยื่นจากผิวเสา ${L?Math.round(faceL-a):0} / ${R?Math.round(b-faceR):0}`,d,x.count,a,b,z,ha,hb,layer==='top'?'top':'bottom',p.from,p.to,[],{top:layer==='top'});
   }
  }
 });
 // ---- EX bars of the MID section
 for(const s of spans){if(s.kind==='cantilever')continue;
  for(const layer of ['top','bottom'] as const){const x=s.rebar.ex.mid[layer],d=x.diameter;if(x.count<1||!d)continue;
   const main=s.rebar[layer],{lo,hi}=across(s,d),p=placeEx(main,x,lo,hi,layer==='top'?zTop(s,main.diameter||d):zBot(s,main.diameter||d),layer==='top'?-1:1);
   const fa=layer==='bottom'?(s.zoneA==='end'?rules.bottomEnd:rules.bottomCont):.25,fb=layer==='bottom'?(s.zoneB==='end'?rules.bottomEnd:rules.bottomCont):.25;
   emit(`s${s.k+1}-ex-mid-${layer}`,`${s.label} · เหล็กเสริม${layer==='top'?'บน':'ล่าง'} (EX) MID · ${Math.round(fa*s.clear)} / ${Math.round(fb*s.clear)} จากผิวเสา`,d,x.count,s.a+fa*s.clear,s.b-fb*s.clear,p.z,0,0,layer==='top'?'top':'bottom',p.from,p.to,[],{top:layer==='top'});}
 }
 // ---- stirrups: END / CON spacing near the supports, MID between, CANT over a cantilever; multi-leg = outer + inner links
 for(const s of spans){const st=s.rebar.stirrup,d=st.diameter;if(!d)continue;
  const rad=radius(d,det,true),x0=s.a+50,x1=s.b-50,zl=s.z0+c.bottom+d/2,zh=s.z1-c.top-d/2,yl=s.y0+c.side+d/2,yh=s.y1-c.side-d/2;
  const zLen=rules.stirrupZone*s.clear,zones:[string,number,number,number][]=s.kind==='cantilever'?[['cant',x0,x1,st.spacing.cant]]:[
   ['a',x0,Math.min(x1,s.a+zLen),st.spacing[s.zoneA]],['m',s.a+zLen+st.spacing.mid,s.b-zLen-st.spacing.mid,st.spacing.mid],['b',Math.max(x0,s.b-zLen),x1,st.spacing[s.zoneB]]];
  const legs=Math.max(2,st.legs-st.legs%2),pos=Array.from({length:legs},(_,j)=>yl+(yh-yl)*j/(legs-1));
  const links:[string,number,number][]=[['',yl,yh],...Array.from({length:legs/2-1},(_,j)=>[`-i${j+1}`,pos[2*j+1],pos[2*j+2]] as [string,number,number])];
  for(const [zn,a,b,sp] of zones){if(!(sp>0)||b<a-1e-6)continue;const sx=spread(a,b,sp);if(!sx)continue;
   const name=zn==='cant'?'CANT':zn==='m'?'MID':beamZoneLabels[zn==='a'?s.zoneA:s.zoneB];
   for(const [tag,ya,yb] of links)out.push({role:`s${s.k+1}-stirrup-${zn}${tag}`,note:`${s.label} · เหล็กปลอก${tag?' ใน':''} ${name} @${sp} · ${tieHookLabel(d,det)}${legs>2?` · ${legs} ขา`:''}`,diameter:d,grade:det.tieGrade,count:sx.count,
    points:link(1,2,0,ya,yb,zl,zh,sx.from,det,rad,d),axis:'X',face:'side',radius:rad,shapeCode:'99',distributionAxis:'X',from:sx.from,to:sx.to});}
 }
 // ---- side face bars and cross ties
 for(const s of spans){const sd=s.rebar.side;if(sd.count<1||!sd.diameter)continue;
  const d=sd.diameter,zb=zBot(s,s.rebar.bottom.diameter||d),zt=zTop(s,s.rebar.top.diameter||d),y0=s.y0+c.side+dt(s)+d/2,y1=s.y1-c.side-dt(s)-d/2;
  const end=(side:'a'|'b')=>{const k=side==='a'?s.k:s.k+1,q=col(k),dir=side==='a'?-1:1,other=side==='a'?spans[s.k-1]:spans[s.k+1];return q&&other?(dir<0?q.x0+50:q.x1-50):anchorX(k,dir,d,s);};
  for(let j=1;j<=sd.count;j++){const z=zb+(zt-zb)*j/(sd.count+1);
   emit(`s${s.k+1}-side-${j}`,`${s.label} · เหล็กข้าง แถว ${j}/${sd.count} (2 ด้าน)`,d,2,end('a'),end('b'),z,0,0,'side',y0,y1,nearSupports(s),{wide:nearSupports(s,1/3),stagger:false});
   const tie=sd.tie;if(j%2===1&&tie.diameter&&tie.spacing>0){const tx=spread(s.a+50,s.b-50,tie.spacing),hk=Math.max(det.hook135*tie.diameter,det.hook135Min);
    if(tx)out.push({role:`s${s.k+1}-tie-${j}`,note:`${s.label} · เหล็กยึดเหล็กข้าง แถว ${j} @${tie.spacing}`,diameter:tie.diameter,grade:det.tieGrade,count:tx.count,
     points:[[tx.from,y0-d/2-tie.diameter/2,z-hk],[tx.from,y0-d/2-tie.diameter/2,z],[tx.from,y1+d/2+tie.diameter/2,z],[tx.from,y1+d/2+tie.diameter/2,z-hk]].map(p=>p.map(v=>Number(v.toFixed(3))) as V3),
     axis:'Y',face:'side',radius:radius(tie.diameter,det,true),shapeCode:'21',distributionAxis:'X',from:tx.from,to:tx.to});}}
 }
 return out;
}
export type SpliceCheck={key:'stock'|'zone'|'joint'|'lap'|'stagger'|'sum'|'stirrup';state:'ok'|'warn'|'fail';text:string};
export type SpliceReportRow=SpliceRun&{checks:SpliceCheck[]};
/** Bar runs of a beam group that are spliced, with the checks: pieces ≤ stock length, laps wholly in the allowed zone
 * (wide = bottom zone widened to L/3), no lap in a beam-column joint, Class B lap length from the spec table, ≤ 50 % of the
 * bars spliced at a section (sets A / B ≥ 1 lap apart), pieces − laps = run length; special moment frame: stirrup
 * spacing over a lap ≤ min(d/4, 100). */
export function beamSpliceReport(i:BeamInput):SpliceReportRow[]{
 if(i.layout!=='group'||!i.spans.length)return [];
 const det=i.detailing,runs:SpliceRun[]=[];beamGroupBars(i,det,()=>{},runs);
 const {spans,columns}=beamGroupLayout(i),rules={stirrupZone:.25,...det.beam},special=rules.frame==='special',stock=det.stockLength,mm=(v:number)=>Math.round(v).toLocaleString('en-US');
 return runs.map(r=>{const laps=r.sets.flatMap(st=>st.laps.map(l=>({...l,set:st.set}))),checks:SpliceCheck[]=[];
  const long=r.sets.flatMap(st=>st.pieces).filter(p=>p.length>stock+1);
  checks.push({key:'stock',state:long.length?'fail':'ok',text:long.length?`ท่อนยาว ${long.map(p=>mm(p.length)).join(', ')} เกินเหล็กเส้น ${mm(stock)}`:`ทุกท่อน ≤ ${mm(stock)} (ยาวสุด ${mm(Math.max(...r.sets.flatMap(st=>st.pieces.map(p=>p.length))))})`});
  const out=laps.filter(l=>l.status==='outside'),wide=laps.filter(l=>l.status==='wide');
  checks.push({key:'zone',state:out.length?'fail':wide.length?'warn':'ok',text:out.length?`ต่อนอกช่วงที่อนุญาต ${out.length} จุด`:wide.length?`${r.face==='top'?'ขยายเป็นครึ่งกลางช่วง (ห่างผิวเสา ≥ L/4)':'ขยายโซนถึง L/3'} ${wide.length} จุด · ผู้ออกแบบยืนยัน`:r.face==='top'?'ต่อใน 1/3 กลางช่วง':special?'ต่อในช่วง 2h ถึง L/4 จากผิวเสา':'ต่อในช่วงผิวเสาถึง L/4'});
  const inJoint=laps.filter(l=>columns.some(q=>l.x+l.lap/2>q.x0+1&&l.x-l.lap/2<q.x1-1));
  checks.push({key:'joint',state:inJoint.length?'fail':'ok',text:inJoint.length?`ต่อในจุดต่อเสา-คาน ${inJoint.length} จุด`:'ไม่ต่อในจุดต่อเสา-คาน'});
  checks.push({key:'lap',state:'ok',text:`Class B ${r.lapKind} = ${mm(r.lap)} (DB${r.diameter})`});
  if(r.sets.length>1){const [a,b]=r.sets,near=a.laps.filter(x=>b.laps.some(y=>Math.abs(x.x-y.x)<r.lap-1));
   checks.push({key:'stagger',state:near.length?'warn':'ok',text:near.length?`ชุด A / B ต่อใกล้กันน้อยกว่า 1 ระยะทาบ ${near.length} จุด (ต่อเกิน 50% ที่หน้าตัดเดียว · Class B ยอมให้ตาม ACI 318 25.5.2)`:`ชุด A ${a.count} / ชุด B ${b.count} เส้น ต่อห่างกัน ≥ ${mm(r.lap)}`});}
  else if(r.count>1)checks.push({key:'stagger',state:'warn',text:`ต่อทั้ง ${r.count} เส้นที่ตำแหน่งเดียวกัน`});
  const sumOk=r.sets.every(st=>Math.abs(st.pieces.reduce((t,p)=>t+p.b-p.a,0)-st.laps.reduce((t,l)=>t+l.lap,0)-(r.x1-r.x0))<1);
  checks.push({key:'sum',state:sumOk?'ok':'fail',text:sumOk?`ผลรวมท่อน − ระยะทาบ = ${mm(r.x1-r.x0)}`:'ผลรวมท่อนไม่เท่าความยาวแนวเหล็ก'});
  if(special&&r.face!=='side'){const bad=laps.flatMap(l=>{const s=spans.find(x=>l.x>=x.a&&l.x<=x.b);if(!s)return [];
    const st=s.rebar.stirrup,zl=rules.stirrupZone*s.clear,sp=s.kind==='cantilever'?st.spacing.cant:l.x-s.a<=zl?st.spacing[s.zoneA]:s.b-l.x<=zl?st.spacing[s.zoneB]:st.spacing.mid;
    const dEff=s.depth-(r.face==='top'?i.cover.bottom:i.cover.top)-st.diameter-r.diameter/2,lim=Math.min(dEff/4,100);return sp>lim+1e-6?[`${s.mark} @${sp} > ${mm(lim)}`]:[];});
   checks.push({key:'stirrup',state:bad.length?'warn':'ok',text:bad.length?`ปลอกช่วงต่อทาบต้อง ≤ min(d/4, 100): ${[...new Set(bad)].join(', ')}`:'ปลอกช่วงต่อทาบ ≤ min(d/4, 100)'});}
  return {...r,checks};});
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
 if(sx)out.push({role:'stirrup',note:'เหล็กปลอก',diameter:dt,grade:det.tieGrade,count:sx.count,points:link(1,2,0,tc,W-tc,c.bottom+dt/2,Dp-c.top-dt/2,sx.from,det,radius(dt,det,true),dt),axis:'X',face:'side',radius:radius(dt,det,true),shapeCode:'99',distributionAxis:'X',from:sx.from,to:sx.to});
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

/** Ends of a generated bar that carry a mechanical coupler (footing starter / pedestal bars, single columns). */
export function barCouplerEnds(input:unknown,id:string):{top:boolean;bottom:boolean}{
 const i=input as ElementInput|undefined,no={top:false,bottom:false};
 if(i?.category==='Foundation'){if(!/column-main/.test(id))return no;const n=id.match(/-c(\d+)$/),col=footingColumns(i)[n?Number(n[1])-1:0];return {top:col?.type!=='none'&&col?.splice?.type==='coupler',bottom:false};}
 if(i?.category==='Column'&&i.layout!=='stack'&&/^gen-main(-\d+)?$/.test(id))return {top:i.rebar?.top?.mode==='coupler',bottom:i.rebar?.bottom?.mode==='coupler'};
 return no;
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
   // concrete below NGL only: the footing up to the ground line (top of footing may be above NGL), then pedestals;
   // stored as ≥ 1e-9 because the legacy earthwork basis reads 0 as "use the net concrete"
   const inGround=Math.max(0,Math.min(T,depth-earth.below));
   if(input.levels.enabled&&inGround<T)warn(`หลังฐานรากสูงกว่าระดับดินเดิม ${Math.round(T-inGround)} mm · งานขุดลึก ${Math.round(depth)} mm · ส่วนเหนือดินไม่หักออกจากดินถมกลับ`);
   const buried=(A*inGround+(ped?cols.reduce((n,c)=>n+columnArea(c)*Math.max(0,Math.min(c.height,depth-earth.below-T)),0):0))/1e9;
   const footingFaces=[true,true,true,true,false,false],sideFaces=[true,true,true,true,false,false];
   const auto:Member['deductions']=[];
   // Hexagon / octagon / circle: bounding box concrete minus the cut-off corners (exact area and perimeter).
   if(!['rect','L','U'].includes(input.shape))auto.push({reason:`${AUTO}ฐานราก${({circle:'กลม',hex:'6 เหลี่ยม',oct:'8 เหลี่ยม'} as Record<string,string>)[input.shape]} (หักจากกล่อง ${Math.round(X)} × ${Math.round(Y)})`,volume:(X*Y-A)*T/1e9,formwork:(2*X+2*Y-P)*T/1e6,zRange:[0,T]});
   if(ped)cols.forEach((c,ci)=>{if(c.shape!=='circle')return;const b=colBox(c);auto.push({reason:`${AUTO}เสาตอม่อกลม${many?` ${footingColumnName(c,ci,true).replace('เสาตอม่อ ','')}`:''} Ø${b.w} (หักจากกล่อง ${b.w} × ${b.w})`,volume:(b.w*b.w-Math.PI*b.w*b.w/4)*b.h/1e9,formwork:(4*b.w-Math.PI*b.w)*b.h/1e6,zRange:[T,T+b.h]});});
   const piles=pilePositions(input);
   if(piles.length&&input.pile.embed>0)auto.push({reason:`${AUTO}หัวเข็มฝังในฐาน ${piles.length} ต้น × ${input.pile.embed} mm`,volume:piles.length*pileArea(input.pile)*input.pile.embed/1e9,formwork:0,zRange:[0,input.pile.embed]});
   if(input.shape!=='rect'&&(input.lean.thickness>0||earth.sand>0||depth>0))warn('Lean concrete ทราย และงานขุดคิดเป็นกรอบสี่เหลี่ยมคลุมแปลนฐาน (ระยะยื่น/ระยะเผื่อทำงานรอบกรอบ)');
   const slabOn=footingSlabOn(input);
   if(slabOn)auto.push({reason:`${AUTO}ผิวข้างฐานช่วงความหนาพื้น ${input.slab.thickness} mm (หล่อรวมกับพื้น ไม่ใช้แบบหล่อ)`,volume:0,formwork:P*input.slab.thickness/1e6,zRange:[T-input.slab.thickness,T]});
   if(input.slab.enabled&&!slabOn)warn('ฐานหล่อรวมพื้น: ใช้ได้กับแปลนสี่เหลี่ยมและพื้นบางกว่าฐาน · ยังไม่สร้างพื้นอ้างอิงและไม่ยื่นเหล็กบน');
   if(piles.length&&input.cover.bottom<input.pile.embed+25)warn(`cover ล่าง ${input.cover.bottom} mm ควรมากกว่าระยะฝังหัวเข็ม ${input.pile.embed} mm เพื่อให้ตะแกรงล่างอยู่เหนือหัวเข็ม`);
   const blocks=input.blocks||[],cuts=input.cuts||[],boxOf=(b:FootingBox,k:number,kind:string)=>({id:`${kind}${k+1}`,label:(b.label||`${kind==='block'?'ส่วนเพิ่ม':'ส่วนลดระดับ'} ${k+1}`).slice(0,80),origin:[b.x0,b.y0,b.z0] as V3,size:[b.x1-b.x0,b.y1-b.y0,b.z1-b.z0] as V3,faces:sideFaces});
   const geometryRoute=blocks.length>0||cuts.length>0||input.shape==='L'||input.shape==='U'||ped&&(many||col.shape==='L'||col.shape==='U');
   let shape:Partial<Member>={z:T,pedestal:ped?{x:w,y:d,z:H}:{x:0,y:0,z:0}};
   if(geometryRoute)shape={z:Math.max(T+Hmax,...blocks.map(b=>b.z1)),pedestal:{x:0,y:0,z:0},geometry:{solids:[...blocks.map((b,k)=>boxOf(b,k,'block')),...footingBoxes(input).map((b,k)=>({id:`footing${k+1}`,label:`ฐานราก ${k+1}`,origin:[b.x0,b.y0,0] as V3,size:[b.x1-b.x0,b.y1-b.y0,T] as V3,faces:footingFaces})),...(ped?cols.flatMap((c,ci)=>{const cb=colBox(c);return columnBoxes(c).map((b,k)=>({id:ci?`pedestal-c${ci+1}-${k+1}`:`pedestal${k+1}`,label:`${many?footingColumnName(c,ci,true):'เสาตอม่อ'} ${k+1}`.slice(0,80),origin:[cb.ox+b.x0,cb.oy+b.y0,T] as V3,size:[b.x1-b.x0,b.y1-b.y0,cb.h] as V3,faces:sideFaces}));}):[])],voids:cuts.map((b,k)=>boxOf(b,k,'cut'))}};
   else if(ped&&(Math.abs(col.offsetX)>.5||Math.abs(col.offsetY)>.5))shape={z:T+H,pedestal:{x:0,y:0,z:0},geometry:{solids:[{id:'footing1',label:'ฐานราก',origin:[0,0,0],size:[X,Y,T],faces:footingFaces},{id:'pedestal',label:'เสาตอม่อ',origin:[ox,oy,T],size:[w,d,H],faces:sideFaces}],voids:[]}};
   shape={...shape,deductions:[...deductions,...auto]};
   // Bars projecting above the concrete sit in placement-only reference regions (not in BOQ).
   const keep=(m.placementContext?.regions||[]).filter(r=>!r.id.startsWith('gencol')&&!r.id.startsWith('genslab')&&!r.id.startsWith('genwall')).map(r=>({...r,openings:'openings' in r?r.openings:[]}));
   const regions=cols.filter(c=>c.projection>0).flatMap(c=>{const ci=cols.indexOf(c),cb=colBox(c);return (c.shape==='circle'?[{x0:0,y0:0,x1:cb.w,y1:cb.d}]:columnBoxes(c)).map((b,k)=>({id:ci?`gencol-c${ci+1}-${k+1}`:`gencol${k+1}`,label:`${c.columnNo||(many?`C${ci+1}`:'เสา')} (อ้างอิง)`.slice(0,80),origin:[cb.ox+b.x0,cb.oy+b.y0,footingTopAt(input,cb.ox+cb.w/2,cb.oy+cb.d/2)+cb.h] as V3,size:[b.x1-b.x0,b.y1-b.y0,c.projection+c.cover+maxMainDiameter(c)] as V3,reference:`เหล็กเสาโผล่${ped?'เหนือตอม่อ':'จากฐาน'} ${c.projection} mm · พื้นที่อ้างอิง ไม่คิดปริมาณ`,cover:c.cover,openings:[]}));});
   const wallRegions=(input.walls||[]).filter(b=>b.x1>b.x0&&b.y1>b.y0&&b.z1>b.z0).map((b,k)=>({id:`genwall${k+1}`,label:`${b.label||`ผนัง ${k+1}`} (อ้างอิง)`.slice(0,80),origin:[b.x0,b.y0,b.z0] as V3,size:[b.x1-b.x0,b.y1-b.y0,b.z1-b.z0] as V3,reference:'ผนัง RC บนฐาน · พื้นที่อ้างอิง ไม่คิดปริมาณ (เหล็กผนังตามแบบผนัง)',cover:input.cover.side,openings:[]}));
   const slabRegions=slabOn?footingSlabRegions(input,X,Y):[],all=[...keep,...regions,...wallRegions,...slabRegions];
   if(all.length>REGION_LIMIT)warn(`พื้นที่อ้างอิงเกิน ${REGION_LIMIT} รายการ (พื้น ${slabRegions.length} + เสา ${regions.length} + กำหนดเอง ${keep.length}) · ตัดพื้นที่กำหนดเองบางส่วนออก`);
   const context=all.length>REGION_LIMIT?[...keep.slice(0,Math.max(0,REGION_LIMIT-regions.length-wallRegions.length-slabRegions.length)),...regions,...wallRegions,...slabRegions].slice(0,REGION_LIMIT):all,firstBar=col.type!=='none'?columnSectionPreview(col).bars[0]:undefined;
   // Default section A-A passes through the first row of column bars so they appear in the section view.
   if(!m.drawingViews)shape={...shape,sectionY:firstBar?Number((oy+firstBar.y).toFixed(1)):Y/2};
   const {placementContext:_c,...rest}=next;
   next={...rest,...(context.length?{placementContext:{version:2 as const,regions:context}}:{}),x:X,y:Y,cover:Math.min(input.cover.bottom,input.cover.top,input.cover.side,...cols.map(c=>c.cover)),faces:footingFaces,lean:{x:input.lean.thickness>0?lx:0,y:input.lean.thickness>0?ly:0,thickness:input.lean.thickness},excavation:{bottomX:bx,bottomY:by,topX:bx+grow,topY:by+grow,depth,buriedConcrete:buried>0?buried:1e-9},...shape} as Member;
   // generated BOQ items: one coupler per starter / pedestal main bar with a coupler top end (rebuilt on every apply)
   const cpl=new Map<number,number>();
   for(const c of cols)if(c.type!=='none'&&c.splice?.type==='coupler')for(const b of columnBarPositions(c,c.cover+(c.type==='pedestal'?c.tie.diameter:0)))cpl.set(b.d,(cpl.get(b.d)||0)+1);
   const siteItems=[...(m.siteWork?.items||[]).filter(it=>!it.id.startsWith('gen-')),...[...cpl].sort((p,q)=>q[0]-p[0]).map(([d,n])=>({id:`gen-coupler-${d}`,label:`ข้อต่อเหล็กแบบกลไก (Coupler) ${d<=9?'RB':'DB'}${d}`,unit:'ตัว',quantity:n})),
    ...(input.items||[]).map((it,k)=>({...it,id:`gen-item-${k+1}`}))];
   next=withSiteWork(next,{...(m.siteWork||emptySiteWork()),items:siteItems,sand:{x:earth.sand>0?earth.sx:0,y:earth.sand>0?earth.sy:0,thickness:earth.sand},sheet:{x:earth.sheet[0],y:earth.sheet[1]},compaction:input.subbase.compaction.enabled&&depth>0?{x:bx,y:by}:{x:0,y:0}});
   // pour stages: levels between stages (quantities per stage from the geometry, see pourStageQuantities)
   {const pr=footingPour(input),{pourStages:_p,...r2}=next;next=pr.levels.length&&pr.stages.every(s=>s.height>0)?{...r2,pourStages:{levels:pr.levels}}:r2 as Member;}
   gen=foundationBars(input,det,rounding,warn);break;}
  case 'Column':{
   // generated BOQ items (couplers) are rebuilt on every apply; user items stay
   const userItems=(next.siteWork?.items||[]).filter(it=>!it.id.startsWith('gen-'));
   {const {pourStages:_p,...r}=next;next=r as Member;}
   next=withSiteWork(next,next.siteWork||userItems.length?{...(next.siteWork||emptySiteWork()),items:userItems}:undefined);
   if(input.layout==='stack'&&input.stack.storeys.length){
    // column stack: one concrete box per storey (floor to floor, centred), footing below as a reference region
    const lay=columnStackLayout(input),st=input.stack,r=columnStackBars(input,det,rounding,warn),s0=lay.storeys[0];
    const solids=lay.storeys.map(sx=>({id:`storey${sx.k+1}`,label:(sx.name||`ชั้น ${sx.k+1}`).slice(0,80),origin:[sx.ox,sx.oy,sx.z0] as V3,size:[sx.width,sx.depth,Math.max(1,sx.height)] as V3,faces:[true,true,true,true,false,false]}));
    const pc=m.placementContext,keep=(pc?.version===2?pc.regions:(pc?.regions||[]).map(x=>({...x,openings:[]}))).filter(x=>!x.id.startsWith('gen'));
    const reach=Math.max(...s0.main.corner.diameter?[s0.main.corner.diameter]:[32],s0.main.sideX.diameter,s0.main.sideY.diameter)*(det.hook90+4)+150;
    const foot=st.footing.enabled&&st.footing.depth>0?[{id:'genstk-footing',label:'ฐานราก (อ้างอิง)',origin:[s0.ox-reach,s0.oy-reach,-st.footing.depth] as V3,size:[s0.width+2*reach,s0.depth+2*reach,st.footing.depth] as V3,reference:'ฐานรากใต้เสา · ระยะฝัง/งอ 12d ของเหล็กยืน · พื้นที่อ้างอิง ไม่คิดปริมาณ',cover:input.cover.side,openings:[]}]:[];
    // floor / beam cast around the column where the section steps in: the lower storey's top ring is not a free face
    const floors=lay.storeys.slice(1).filter((sx,j)=>sx.width<lay.storeys[j].width||sx.depth<lay.storeys[j].depth).map(sx=>{const b=lay.storeys[sx.k-1];
     return {id:`genstk-floor${sx.k}`,label:`พื้น/คาน ${b.name||sx.k} (อ้างอิง)`.slice(0,80),origin:[b.ox,b.oy,sx.z0] as V3,size:[b.width,b.depth,Math.max(100,Math.min(b.beamDepth||300,sx.height/2))] as V3,reference:'พื้น / คานที่หล่อรอบเสาที่ระดับเปลี่ยนหน้าตัด · พื้นที่อ้างอิง ไม่คิดปริมาณ',cover:input.cover.side,openings:[]};});
    const context=[...keep,...foot,...floors].slice(0,REGION_LIMIT),{placementContext:_c,...rest}=next;
    next={...rest,...(context.length?{placementContext:{version:2 as const,regions:context}}:{}),x:lay.W,y:lay.D,z:lay.H,cover:input.cover.side,faces:[true,true,true,true,false,false],pedestal:{x:0,y:0,z:0},deductions,geometry:{solids,voids:[]}} as Member;
    gen=r.bars;
    const cp=[...r.couplers].filter(([,n])=>n>0).sort((a,b)=>b[0]-a[0]).map(([d,n])=>({id:`gen-coupler-${d}`,label:`ข้อต่อเหล็กแบบกลไก (Coupler) ${d<=9?'RB':'DB'}${d}`,unit:'ตัว',quantity:n}));
    if(cp.length)next=withSiteWork(next,{...(next.siteWork||emptySiteWork()),items:[...userItems,...cp]});
    break;}
   const rect=input.shape==='rect',D=input.diameter,H=input.height;
   const pc=m.placementContext,keep:RegionV2=(pc?.version===2?pc.regions:(pc?.regions||[]).map(r=>({...r,openings:[]}))).filter(r=>!r.id.startsWith('gencol'));
   const context=[...keep,...columnRegions(input,det)].slice(0,6),{placementContext:_c,...rest}=next;
   next={...rest,...(context.length?{placementContext:{version:2 as const,regions:context}}:{}),x:rect?input.width:D,y:rect?input.depth:D,z:H,cover:input.cover.side,faces:[true,true,true,true,false,false],pedestal:{x:0,y:0,z:0},deductions:rect?deductions:[...deductions,{reason:`${AUTO}หน้าตัดวงกลม Ø${D} (แปลงจากกล่อง ${D} × ${D})`,volume:(D*D-Math.PI*D*D/4)*H/1e9,formwork:(4*D-Math.PI*D)*H/1e6}]};
   // two pour stages: construction joint below the beam framing in (quantities per stage from the box cells)
   {const cp=columnPour(input);if(cp.on)next={...next,pourStages:{levels:[cp.z]}};}
   gen=columnBars(input,det,rounding,warn);
   // top couplers: one per main bar (a bottom coupler is counted with the element below)
   if(input.rebar.top.mode==='coupler'){const n=new Map<number,number>();for(const b of columnInputBars(input))n.set(b.d,(n.get(b.d)||0)+1);
    const cp=[...n].sort((a,b)=>b[0]-a[0]).map(([d,q])=>({id:`gen-coupler-${d}`,label:`ข้อต่อเหล็กแบบกลไก (Coupler) ${d<=9?'RB':'DB'}${d}`,unit:'ตัว',quantity:q}));
    next=withSiteWork(next,{...(next.siteWork||emptySiteWork()),items:[...userItems,...cp]});}
   break;}
  case 'Beam':{
   const onGround=input.ground.support==='ground';
   if(input.layout==='group'&&input.spans.length){
    // beam group: one concrete box per span between support faces; supporting columns are reference regions
    const lay=beamGroupLayout(input),last=lay.spans.length-1;
    const solids=lay.spans.map(sp=>({id:`span${sp.k+1}`,label:sp.label.slice(0,80),origin:[sp.a,sp.y0,sp.z0] as V3,size:[Math.max(1,sp.clear),sp.y1-sp.y0,sp.z1-sp.z0] as V3,
     faces:[sp.k===0&&!(input.grids[0]?.support>0),sp.k===last&&!(input.grids[last+1]?.support>0),true,true,!onGround,false]}));
    const keep=(m.placementContext?.regions||[]).filter(r=>!r.id.startsWith('genbcol')).map(r=>({...r,openings:'openings' in r?r.openings:[]}));
    const cols=lay.columns.map(q=>({id:`genbcol${q.k+1}`,label:`เสา ${q.label||q.k+1} (อ้างอิง)`.slice(0,80),origin:[q.x0,Math.min(0,q.y0),q.z0] as V3,size:[q.x1-q.x0,Math.max(lay.W,q.y1-q.y0),Math.max(1,q.z1-q.z0)] as V3,reference:'เสาที่รองรับคาน · ระยะฝัง/งอเหล็กคาน · พื้นที่อ้างอิง ไม่คิดปริมาณ',cover:input.cover.side,openings:[]}));
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
 if(m.category!=='Foundation')next=withSiteWork(next,next.siteWork&&{...emptySiteWork(),items:next.siteWork.items});
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
  return {id:`${GEN_PREFIX}${g.role}`,mark:nextMark(),diameter:g.diameter,grade:gradeFor(det,g.diameter,g.grade),count:g.count,axis:g.axis,face:g.face,shape:'polyline',shapeCode:g.shapeCode,start:0,end:0,tail:0,radius:Number(g.radius.toFixed(3)),distributionStart:g.offsets?0:g.from||0,distributionEnd:g.offsets?0:g.to||0,points:g.points.map(p=>p.map(v=>Number(v.toFixed(3))) as V3),cutOverride:cut,placementConfirmed:false,note:g.note.slice(0,500),...(['00','11','21'].includes(g.shapeCode)&&!cut?{lengthMethod:'bs8666' as const}:{}),...(g.distributionAxis&&!g.offsets?{distributionAxis:g.distributionAxis}:{}),...(g.offsets?{offsets:g.offsets.map(o=>o.map(v=>Number(v.toFixed(3))) as V3)}:{}),...(g.offsets&&g.turns&&g.turns.some(t=>t!==0)?{offsetTurns:g.turns}:{})};
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
    next.rebar.main.corner.count=1;next.rebar.main.sideX.count=s.x;next.rebar.main.sideY.count=s.y;delete next.rebar.main.layout;
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
