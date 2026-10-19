import {sourceAnnotationSchema,type Attachment} from './model';
export type SourcePointer=NonNullable<Attachment['annotations']>[number];
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const overlap=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>a.x<b.x+b.w+4&&a.x+a.w+4>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
/** Layout affects source labels only. Pointer coordinates and quantities are never transformed. */
export function sourceLabelLayout(annotations:SourcePointer[],page:number,ratio:number){
 if(!Number.isFinite(ratio)||ratio<=0)throw Error('สัดส่วนหน้าแบบไม่ถูกต้อง');
 if(!Array.isArray(annotations)||annotations.length>500||annotations.some(a=>!sourceAnnotationSchema.safeParse(a).success))throw Error('ข้อมูลจุดชี้หรือตำแหน่งป้ายไม่ถูกต้อง');
 const width=1000,height=width*ratio,placed:{x:number;y:number;w:number;h:number}[]=[];
 const labels=annotations.map((a,index)=>({...a,index})).filter(a=>a.page===page).map(a=>{
  const chars=Array.from(a.mark),short=chars.length<=10,lines=short?[`#${String(a.index+1).padStart(3,'0')}  ${a.mark}`]:[`#${String(a.index+1).padStart(3,'0')}`,...Array.from({length:Math.ceil(chars.length/16)},(_,i)=>chars.slice(i*16,i*16+16).join(''))];
  const font=Math.min(16,height/(lines.length*1.4+2)),padding=Math.min(8,height/20),margin=Math.min(2,height/20),w=Math.min(width-4,Math.max(...lines.map(s=>Array.from(s).length))*font+padding*2),h=Math.min(height-margin*2,lines.length*font*1.4+padding*2),target={x:a.x*width,y:a.y*height};
  const rect=(x:number,y:number)=>({x:clamp(x-w/2,2,width-w-2),y:clamp(y-h/2,margin,height-h-margin),w,h});let box;
  if(a.label)box=rect(a.label.x*width,a.label.y*height);
  else{const candidates=[];for(const dx of [-1,1])for(const dy of [-1,0,1])for(const distance of [16,80])candidates.push(rect(target.x+dx*(w/2+distance),target.y+dy*(h/2+distance)));for(const x of [width/6,width/2,width*5/6])for(const y of [height/10,height*3/10,height/2,height*7/10,height*9/10])candidates.push(rect(x,y));box=candidates.sort((a,b)=>{const score=(r:typeof a)=>placed.filter(p=>overlap(r,p)).length*1e6+Math.hypot(r.x+r.w/2-target.x,r.y+r.h/2-target.y);return score(a)-score(b);})[0];}
  placed.push(box);const center={x:box.x+w/2,y:box.y+h/2};return {...a,box,center,target,lines,font,padding,manual:!!a.label};
 });
 const collisions=labels.filter((l,i)=>labels.some((other,j)=>i!==j&&overlap(l.box,other.box))).map(l=>l.index+1);
 return {width,height,labels,collisions};
}
export function boundedSourceLabel(annotations:SourcePointer[],index:number,position:{x:number;y:number},ratio:number){
 const a=annotations[index];if(!a)throw Error('ไม่พบจุดชี้ที่เลือก');const copy=annotations.map((a,i)=>i===index?{...a,label:position}:a),l=sourceLabelLayout(copy,a.page,ratio).labels.find(l=>l.index===index)!;return {x:l.center.x/1000,y:l.center.y/(1000*ratio)};
}
