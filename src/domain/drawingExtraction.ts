import type {Category,Member} from './model';
import {elementDefaults} from './elementDefaults';

export type ExtractedDimension={
  axis:'x'|'y'|'z'|'cover'|'unknown';
  value:number;
  label:string;
  source:string;
};

export type ExtractedReinforcement={
  mark:string;
  diameter:number;
  spacing?:number;
  count?:number;
  grade?:string;
  axis?:'X'|'Y'|'Z';
  face?:'bottom'|'top'|'side';
  shapeCode?:string;
  source:string;
};

export type DrawingExtraction={
  attachmentId:string;
  fileName:string;
  extractedAt:string;
  pages:number;
  status:'Needs review'|'Applied';
  confidence:'High'|'Medium'|'Low';
  dimensions:ExtractedDimension[];
  reinforcement:ExtractedReinforcement[];
  textSample:string;
  warnings:string[];
};

export type ExtractionInput={attachmentId:string;fileName:string;pages:number;text:string;category:Category};

const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
const numberValue=(value:string)=>Number(value.replace(/,/g,''));
const validNumber=(value:number)=>Number.isFinite(value)&&value>0&&value<=200000;

function uniqueDimensions(rows:ExtractedDimension[]){
  const seen=new Set<string>();
  return rows.filter(row=>{const key=`${row.axis}:${row.value}`;if(seen.has(key))return false;seen.add(key);return true;});
}

function dimensions(text:string,category:Category):ExtractedDimension[]{
  const rows:ExtractedDimension[]=[];
  const add=(axis:ExtractedDimension['axis'],value:number,label:string,source:string)=>{if(validNumber(value))rows.push({axis,value,label,source});};
  const axisPatterns:[ExtractedDimension['axis'],RegExp,string][]=[
    ['x',/(?:\bL\b|length|ยาว)\s*(?:[:=]\s*|\s+)(\d[\d,]*(?:\.\d+)?)/ig,'X / length'],
    ['y',/(?:\bW\b|width|กว้าง)\s*(?:[:=]\s*|\s+)(\d[\d,]*(?:\.\d+)?)/ig,'Y / width'],
    ['z',/(?:\bH\b|height|สูง|thk|thickness|หนา)\s*(?:[:=]\s*|\s+)(\d[\d,]*(?:\.\d+)?)/ig,'Z / height or thickness'],
    ['cover',/(?:cover|คอนกรีตหุ้ม|หุ้มเหล็ก)\s*(?:[:=]\s*|\s+)(\d[\d,]*(?:\.\d+)?)/ig,'Cover']
  ];
  for(const [axis,pattern,label] of axisPatterns){for(const match of text.matchAll(pattern))add(axis,numberValue(match[1]),label,clean(match[0]));}
  // Common structural drawing notation: 2400 x 2400 x 600 / 600/300/600.
  const triplet=/(\d[\d,]{1,6})\s*[x×*]\s*(\d[\d,]{1,6})\s*[x×*]\s*(\d[\d,]{1,6})/i;
  const fallback=elementDefaults(category).dimensions;
  const first=text.match(triplet);
  if(first){const values=[first[1],first[2],first[3]].map(numberValue);(['x','y','z'] as const).forEach((axis,i)=>add(axis,values[i],`${axis.toUpperCase()} จากชุดมิติ`,clean(first[0])));}
  else{
    const slash=text.match(/(?:\bDIM\b|\bSIZE\b|ขนาด)?\s*(\d[\d,]{1,6})\s*[/\-]\s*(\d[\d,]{1,6})\s*[/\-]\s*(\d[\d,]{1,6})/i);
    if(slash){const values=[slash[1],slash[2],slash[3]].map(numberValue);(['x','y','z'] as const).forEach((axis,i)=>add(axis,values[i],`${axis.toUpperCase()} จากชุดมิติ`,clean(slash[0])));}
  }
  // Keep the default visible as context, but never report it as extracted data.
  if(!rows.length)void fallback;
  return uniqueDimensions(rows);
}

function reinforcement(text:string):ExtractedReinforcement[]{
  const rows:ExtractedReinforcement[]=[];
  const patterns=[
    /(?:(\d+)\s*[-x×]\s*)?(?:T|Y|DB|D|RB|Ø|⌀)\s*(\d{1,3})(?:\s*@\s*(\d{1,4}))?/ig,
    /(?:\bN\s*)?(\d{1,4})\s*[Ø⌀]\s*(\d{1,3})/ig
  ];
  let index=1;
  for(const pattern of patterns){for(const match of text.matchAll(pattern)){
    const first=numberValue(match[1]||'1'),diameter=numberValue(match[2]),spacing=match[3]?numberValue(match[3]):undefined;
    if(!validNumber(diameter)||diameter>100)continue;
    const context=clean(text.slice(Math.max(0,(match.index||0)-35),Math.min(text.length,(match.index||0)+match[0].length+35)));
    const upper=context.toUpperCase();
    const axis=upper.includes('H')||upper.includes('X')?'X':upper.includes('V')||upper.includes('Y')?'Y':undefined;
    const face=upper.includes('TOP')||upper.includes('บน')?'top':upper.includes('BOT')||upper.includes('ล่าง')?'bottom':undefined;
    const mark=`PDF-${String(index++).padStart(2,'0')}`;
    const duplicate=rows.some(row=>row.diameter===diameter&&row.spacing===spacing&&row.count===first);
    if(!duplicate)rows.push({mark,diameter,spacing,count:first,grade:upper.includes('SD40')?'SD40':undefined,axis,face,source:context});
  }}
  return rows.slice(0,100);
}

export function extractDrawingText(input:ExtractionInput):DrawingExtraction{
  const text=clean(input.text).slice(0,120000),dims=dimensions(text,input.category),bars=reinforcement(text),warnings:string[]=[];
  if(!text)warnings.push('PDF นี้ไม่มี text layer ที่อ่านได้ อาจเป็น PDF จากการสแกน ต้องตรวจด้วยภาพ/OCR');
  if(!dims.length)warnings.push('ยังไม่พบชุดมิติที่มีรูปแบบชัดเจน เช่น 2400 x 2400 x 600 หรือ L=6000');
  if(!bars.length)warnings.push('ยังไม่พบรูปแบบเหล็ก เช่น T16@200, Ø12 หรือ 4-Ø16');
  if(input.pages>1)warnings.push(`อ่าน text จากทั้ง ${input.pages} หน้าแล้ว แต่ผลลัพธ์ยังต้องจับคู่กับหน้า/Detail ที่ถูกต้อง`);
  return {attachmentId:input.attachmentId,fileName:input.fileName,extractedAt:new Date().toISOString(),pages:input.pages,status:'Needs review',confidence:dims.length&&bars.length?'Medium':dims.length||bars.length?'Low':'Low',dimensions:dims,reinforcement:bars,textSample:text.slice(0,2400),warnings};
}

export function extractionToMemberPatch(result:DrawingExtraction,member:Member){
  const next={x:member.x,y:member.y,z:member.z};
  for(const row of result.dimensions){if(row.axis==='x'||row.axis==='y'||row.axis==='z')next[row.axis]=row.value;}
  return {dimensions:next,hasDimensionChanges:next.x!==member.x||next.y!==member.y||next.z!==member.z};
}

