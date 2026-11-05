import {bbox,byView,grow,modelDim,ntsDim,pad,paperDim,viewTf,type Ctx,type DxfSheet} from './common';

/** Mode B · Model 1:1 + Layout: every view at true size (mm) in model space, the views of sheet k after those of sheet
 * k − 1 along X (never overlapping); one Layout tab per sheet (A3-01, A3-02 …) with the frame, tables, notes and title
 * block in paper space and one locked VIEWPORT per view frame (the box on the sheet, Sheet Composer) at the view's 1:n (view height = paper height × n).
 * Not-to-scale views (n = 0) stay in paper space. */
export function layoutB(c:Ctx,sheets:DxfSheet[]){
 let cursor=0;
 sheets.forEach((sh,k)=>{
  const lay=c.doc.newLayout(`${sh.size}-${pad(k+1)}`,sh.w,sh.h),groups=byView(sh.prims),paperTf={ax:0,ay:sh.h,sc:1};
  c.em.emit(lay.block,groups.get('')||[],paperTf,paperDim(c,1));
  let vp=2;
  for(const v of sh.views){const prims=groups.get(v.id);if(!prims?.length)continue;
   if(!v.n){c.em.emit(lay.block,prims,paperTf,ntsDim(c,1/v.s));c.warnings.push(`แผ่น ${k+1} · ${v.title}: ไม่ได้ใช้มาตราส่วน (NTS) · วางใน Paper space`);continue;}
   // the viewport is the view's frame on the sheet (Sheet Composer box); model spacing also clears anything drawn past it
   const fb=v.box,pb=bbox(prims)!,bb={x0:Math.min(fb.x,pb.x0),y0:Math.min(fb.y,pb.y0),x1:Math.max(fb.x+fb.w,pb.x1),y1:Math.max(fb.y+fb.h,pb.y1)};
   const base=viewTf(v,0,0),left=base.ax+bb.x0*base.sc,bottom=base.ay-bb.y1*base.sc,tf=viewTf(v,cursor-left,-bottom);
   c.em.emit(c.doc.model,prims,tf,modelDim(c,v.n));grow(c,tf,bb);
   const cx=fb.x+fb.w/2,cy=fb.y+fb.h/2;
   c.em.viewport(lay,vp++,[cx,sh.h-cy],[fb.w,fb.h],[tf.ax+cx*tf.sc,tf.ay-cy*tf.sc],fb.h*tf.sc);
   cursor+=(bb.x1-bb.x0)*tf.sc+Math.max(1000,(bb.x1-bb.x0)*tf.sc*.25);
  }
  cursor+=2000;
 });
}
