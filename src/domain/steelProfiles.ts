// Steel profiles from their names as written in Tekla / drawings: H-150X150X7X10, C-150X65X20X3.2, [-150X75X6.5X10,
// L-50X50X5, PIPE-114.3X4.5, RHS-100X50X3.2, PL10*115, RB20. Section area (mm²) → kg/m with ρ = 7850 kg/m³, outer
// perimeter (mm) → paint area. Hot-rolled H / I sections add the root fillets (radius from JIS G 3192 / TIS 1227).
export const STEEL_DENSITY=7850;
export type ProfileKind='H'|'C'|'CH'|'L'|'PIPE'|'RHS'|'PL'|'RB';
export type Profile={kind:ProfileKind;name:string;area:number;perimeter:number;plate?:{t:number;w:number};depth:number;width:number};
export const profileKindLabels:Record<ProfileKind,string>={H:'เหล็กรูปพรรณ H / I',C:'เหล็กรูปพรรณขึ้นรูปเย็น (C)',CH:'เหล็กรางน้ำ',L:'เหล็กฉาก',PIPE:'ท่อเหล็กกลม',RHS:'ท่อเหล็กสี่เหลี่ยม',PL:'แผ่นเหล็ก',RB:'เหล็กเส้นกลม'};
// root radius r (mm) of common H sections, key = HxBxtwxtf
const radius:Record<string,number>={'100x50x5x7':8,'100x100x6x8':10,'125x60x6x8':8,'125x125x6.5x9':10,'148x100x6x9':11,'150x75x5x7':8,'150x150x7x10':11,'175x90x5x8':9,'175x175x7.5x11':12,
 '194x150x6x9':13,'198x99x4.5x7':11,'200x100x5.5x8':11,'200x200x8x12':13,'244x175x7x11':16,'248x124x5x8':12,'250x125x6x9':12,'250x250x9x14':16,'294x200x8x12':18,'298x149x5.5x8':13,'300x150x6.5x9':13,
 '300x300x10x15':18,'340x250x9x14':20,'346x174x6x9':14,'350x175x7x11':14,'350x350x12x19':20,'390x300x10x16':22,'396x199x7x11':16,'400x200x8x13':16,'400x400x13x21':22,'440x300x11x18':24,'446x199x8x12':18,
 '450x200x9x14':18,'482x300x11x15':26,'488x300x11x18':26,'496x199x9x14':20,'500x200x10x16':20,'582x300x12x17':28,'588x300x12x20':28,'596x199x10x15':22,'600x200x11x17':22,'700x300x13x24':28,'800x300x14x26':28,'900x300x16x28':28};
const n=(s:string)=>Number(s);
const fmt=(v:number[])=>v.map(x=>String(Number(x.toFixed(2)))).join('X');
/** Profile from its name (undefined = not understood). */
export function parseProfile(raw:string):Profile|undefined{
 const s=raw.trim().toUpperCase().replace(/\s+/g,'').replace(/[×*]/g,'X');
 const m=s.match(/^([A-Z□Ø\[]*?)-?(\d+(?:\.\d+)?(?:X\d+(?:\.\d+)?)*)$/);if(!m)return;
 const p=m[1],v=m[2].split('X').map(n);if(v.some(x=>!(x>0)))return;
 if((p===''||['H','I','WF','HW','HM','HN','HEA','HEB','IPE'].includes(p))&&v.length===4){const [H,B,tw,tf]=v,r=radius[fmt(v).toLowerCase()]||0;
  if(2*tf>=H||tw>=B)return;return {kind:'H',name:`H-${fmt(v)}`,area:2*B*tf+(H-2*tf)*tw+(4-Math.PI)*r*r,perimeter:2*H+4*B-2*tw,depth:H,width:B};}
 if(p==='C'&&v.length===4){const [H,B,C,t]=v;return {kind:'C',name:`C-${fmt(v)}`,area:t*(H+2*B+2*C-4*t),perimeter:2*(H+2*B+2*C),depth:H,width:B};}
 if(['[','U','CH','UPN','PFC'].includes(p)&&v.length===4){const [H,B,tw,tf]=v;return {kind:'CH',name:`[-${fmt(v)}`,area:2*B*tf+(H-2*tf)*tw,perimeter:2*H+4*B-2*tw,depth:H,width:B};}
 if(p==='L'&&(v.length===3||v.length===2)){const [A,B,t]=v.length===3?v:[v[0],v[0],v[1]];return {kind:'L',name:`L-${fmt([A,B,t])}`,area:t*(A+B-t),perimeter:2*(A+B),depth:A,width:B};}
 if(['PIPE','CHS','Ø','O','P'].includes(p)&&v.length===2){const [D,t]=v;if(2*t>D)return;return {kind:'PIPE',name:`PIPE-${fmt(v)}`,area:Math.PI*t*(D-t),perimeter:Math.PI*D,depth:D,width:D};}
 if(['RHS','SHS','BOX','□','TUBE'].includes(p)&&(v.length===3||v.length===2)){const [H,B,t]=v.length===3?v:[v[0],v[0],v[1]];return {kind:'RHS',name:`${H===B?'SHS':'RHS'}-${fmt([H,B,t])}`,area:2*t*(H+B-2*t),perimeter:2*(H+B),depth:H,width:B};}
 if(['PL','FB','FL','PLT'].includes(p)&&v.length===2){const [t,w]=v;return {kind:'PL',name:`PL${fmt([t])}*${fmt([w])}`,area:t*w,perimeter:2*(t+w),plate:{t,w},depth:w,width:t};}
 if(['RB','ROD','D','RD'].includes(p)&&v.length===1){const [d]=v;return {kind:'RB',name:`RB${fmt([d])}`,area:Math.PI*d*d/4,perimeter:Math.PI*d,depth:d,width:d};}
}
/** kg per metre of a profile. */
export const kgPerMetre=(p:Profile)=>p.area*STEEL_DENSITY/1e6;
/** Weight (kg) and paint area (m²) of one piece of length L (mm); plates paint both faces and the edges. */
export function pieceQuantities(p:Profile,L:number){
 const weight=p.area*L*STEEL_DENSITY/1e9;
 const paint=p.plate?(2*p.plate.w*L+2*p.plate.t*(p.plate.w+L))/1e6:p.perimeter*L/1e6;
 return {weight,paint};
}
