export type HorizontalRule={left:number;right:number;y:number};
type Matrix=[number,number,number,number,number,number];
type Ops={save:number;restore:number;transform:number;constructPath:number;paintFormXObjectBegin:number;paintFormXObjectEnd:number;stroke:number;closeStroke:number;fillStroke:number;eoFillStroke:number;closeFillStroke:number;closeEOFillStroke:number};
const identity:Matrix=[1,0,0,1,0,0];
const multiply=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
/** Optional PDF.js5 stroked table rulings in the visible page frame. Unknown
 * path encodings/large pages fall back to text crops, never invented rules. */
export function pdfHorizontalRules(list:{fnArray:number[];argsArray:any[]},viewport:number[],ops:Ops,version:string):HorizontalRule[]{
 if(!version.startsWith('5.')||list.fnArray.length>100000||viewport.length!==6)return [];
 let matrix:Matrix=identity;const stack:Matrix[]=[],rules:HorizontalRule[]=[],strokeOps=new Set([ops.stroke,ops.closeStroke,ops.fillStroke,ops.eoFillStroke,ops.closeFillStroke,ops.closeEOFillStroke]);
 const point=(x:number,y:number)=>{const m=multiply(viewport as Matrix,matrix);return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];};
 const segment=(a:number[],b:number[])=>{if([...a,...b].every(Number.isFinite)&&Math.abs(a[1]-b[1])<.05&&Math.abs(a[0]-b[0])>20)rules.push({left:Math.min(a[0],b[0]),right:Math.max(a[0],b[0]),y:(a[1]+b[1])/2});};
 for(let i=0;i<list.fnArray.length;i++){const fn=list.fnArray[i],args=list.argsArray[i];
  if(fn===ops.save||fn===ops.paintFormXObjectBegin){stack.push([...matrix]);if(fn===ops.paintFormXObjectBegin&&args[0]?.length===6)matrix=multiply(matrix,args[0]);}
  else if(fn===ops.restore||fn===ops.paintFormXObjectEnd)matrix=stack.pop()||identity;
  else if(fn===ops.transform&&args?.length===6)matrix=multiply(matrix,args);
  else if(fn===ops.constructPath&&strokeOps.has(args?.[0])){
   const data=args?.[1]?.[0];if(!data||!(data instanceof Float32Array||data instanceof Float64Array||data instanceof Int32Array)||data.length>100000)continue;let at:number[]|undefined,start:number[]|undefined;
   for(let n=0;n<data.length;){const op=data[n++];if(op===0){at=point(data[n++],data[n++]);start=at;}else if(op===1){const next=point(data[n++],data[n++]);if(at)segment(at,next);at=next;}else if(op===2){n+=4;at=point(data[n++],data[n++]);}else if(op===3){n+=2;at=point(data[n++],data[n++]);}else if(op===4){if(at&&start)segment(at,start);at=start;}else break;}
  }
  if(rules.length>5000)return [];
 }
 return mergeHorizontalRules(rules);
}
export function mergeHorizontalRules(rules:HorizontalRule[]){
 const merged:HorizontalRule[]=[];
 for(const r of [...rules].sort((a,b)=>a.y-b.y||a.left-b.left)){
  const previous=merged.at(-1);if(previous&&Math.abs(previous.y-r.y)<.05&&r.left<=previous.right+.2)previous.right=Math.max(previous.right,r.right);else merged.push({...r});
 }return merged;
}
