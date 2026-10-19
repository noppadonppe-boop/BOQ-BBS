// Excel limits each SUM to 255 arguments. Compact adjacent source rows, then
// partition irregular groups so the same BBS rows can feed a readable summary.
export function excelRowRanges(rows:number[]){
 const sorted=[...new Set(rows)].sort((a,b)=>a-b);
 if(sorted.some(n=>!Number.isInteger(n)||n<1||n>1048576))throw Error('Excel source row out of bounds');
 const ranges:{first:number;last:number}[]=[];
 for(const row of sorted){const previous=ranges.at(-1);if(previous&&row===previous.last+1)previous.last=row;else ranges.push({first:row,last:row});}
 return ranges;
}
export function excelSumParts(rows:number[],column:string,sheet='BBS'){
 if(!/^[A-Z]{1,3}$/.test(column))throw Error('Invalid Excel column');
 const name="'"+sheet.replaceAll("'","''")+"'!",ranges=excelRowRanges(rows).map(r=>name+column+r.first+(r.last===r.first?'':':'+column+r.last));
 const parts:string[]=[];for(let i=0;i<ranges.length;i+=150)parts.push('SUM('+ranges.slice(i,i+150).join(',')+')');
 return parts;
}
// Manual print breaks are based on physical row heights, not record counts.
// Keep the last data row with its total rather than creating a total-only page.
export function excelPageBreaks(heights:number[],budget:number,totalHeight=28){
 if(!Number.isFinite(budget)||budget<=totalHeight||heights.some(h=>!Number.isFinite(h)||h<=0||h+totalHeight>budget))throw Error('ข้อความยาวเกินพื้นที่พิมพ์ Excel ให้แบ่งชุดหรือย่อข้อความ');
 const before:number[]=[];let used=0;
 heights.forEach((height,i)=>{const reserve=i===heights.length-1?totalHeight:0;if(used&&used+height+reserve>budget){before.push(i);used=0;}used+=height;});return before;
}
