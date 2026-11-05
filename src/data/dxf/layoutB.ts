import {bbox,byView,grow,modelDim,ntsDim,pad,paperDim,viewTf,type Ctx,type DxfSheet} from './common';

/** Mode B · Model 1:1 + Layout: every view at true size (mm) in model space, the views of sheet k after those of sheet
 * k − 1 along X (never overlapping); one Layout tab per sheet (A3-01, A3-02 …) with the frame, tables, notes and title
 * block in paper space and one locked VIEWPORT per view at the view's 1:n (view height = paper height × n).
 * Not-to-scale views (n = 0) stay in paper space. */
export function layoutB(c:Ctx,sheets:DxfSheet[]){
 let cursor=0;
 sheets.forEach((sh,k)=>{
  const lay=c.doc.newLayout(`${sh.size}-${pad(k+1)}`,sh.w,sh.h),groups=byView(sh.prims),paperTf={ax:0,ay:sh.h,sc:1};
  c.em.emit(lay.block,groups.get('')||[],paperTf,paperDim(c,1));
  let vp=2;
  for(const v of sh.views){const prims=groups.get(v.id);if(!prims?.length)continue;
   if(!v.n){c.em.emit(lay.block,prims,paperTf,ntsDim(c,1/v.s));c.warnings.push(`แผ่น ${k+1} · ${v.title}: ไม่ได้ใช้มาตราส่วน (NTS) · วางใน Paper space`);continue;}
   const bb=bbox(prims)!,base=viewTf(v,0,0),left=base.ax+bb.x0*base.sc,bottom=base.ay-bb.y1*base.sc,tf=viewTf(v,cursor-left,-bottom);
   c.em.emit(c.doc.model,prims,tf,modelDim(c,v.n));grow(c,tf,bb);
   const p=1,cx=(bb.x0+bb.x1)/2,cy=(bb.y0+bb.y1)/2,w=bb.w+2*p,h=bb.h+2*p;
   c.em.viewport(lay,vp++,[cx,sh.h-cy],[w,h],[tf.ax+cx*tf.sc,tf.ay-cy*tf.sc],h*tf.sc);
   cursor+=bb.w*tf.sc+Math.max(1000,bb.w*tf.sc*.25);
  }
  cursor+=2000;
 });
}
