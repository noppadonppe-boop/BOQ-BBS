import type {Vec3} from './model';
import {segmentFaceDistance,segmentFaceGap,surfacesNear,type Surface} from './solids';
import {surfaceTriangles} from './prismGeometry';
export const FLAT_END_COVER_POLICY='rebar-flat-ends-1.0';
export function polylineCoverSagitta(points:Vec3[],radius:number){let sagitta=0;for(let i=1;i<points.length-1;i++){const a=points[i].map((n,j)=>n-points[i-1][j]),b=points[i+1].map((n,j)=>n-points[i][j]),la=Math.hypot(...a),lb=Math.hypot(...b);if(la&&lb){const turn=Math.acos(Math.max(-1,Math.min(1,a.reduce((s,n,j)=>s+n*b[j],0)/(la*lb))));sagitta=Math.max(sagitta,radius*(1-Math.cos(turn/24)));}}return sagitta;}
type V=Vec3;
const add=(a:V,b:V):V=>a.map((v,i)=>v+b[i]) as V;
const sub=(a:V,b:V):V=>a.map((v,i)=>v-b[i]) as V;
const mul=(a:V,n:number):V=>a.map(v=>v*n) as V;
const dot=(a:V,b:V)=>a.reduce((n,v,i)=>n+v*b[i],0);
const norm=(a:V)=>Math.hypot(...a);
type Piece={a:V;b:V;t:V;radius:number;flatStart:boolean;flatEnd:boolean};
function support(p:Piece,w:V):V{
 const axial=dot(w,p.t),length=norm(w);if(length<1e-14)return p.a;
 const end=axial>=0?p.b:p.a,flat=axial>=0?p.flatEnd:p.flatStart,radial=flat?sub(w,mul(p.t,axial)):w,size=norm(radial);
 return size>1e-14?add(end,mul(radial,p.radius/size)):end;
}
function solve(matrix:number[][],rhs:number[]){
 const a=matrix.map((r,i)=>[...r,rhs[i]]),n=rhs.length,scale=Math.max(1,...matrix.flat().map(Math.abs));
 for(let k=0;k<n;k++){let row=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[row][k]))row=i;if(Math.abs(a[row][k])<scale*1e-15)return null;[a[k],a[row]]=[a[row],a[k]];const divisor=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=divisor;for(let i=0;i<n;i++)if(i!==k){const f=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=f*a[k][j];}}
 return a.map(r=>r[n]);
}
// Enumerating simplex faces also handles collinear/coplanar GJK support points.
function closest(points:V[]){let best={value:Infinity,point:points[0],active:[points[0]]};
 for(let mask=1;mask<(1<<points.length);mask++){const subset=points.filter((_,i)=>mask&(1<<i));if(subset.length>4)continue;const edges=subset.slice(1).map(p=>sub(p,subset[0])),u=edges.length?solve(edges.map(a=>edges.map(b=>dot(a,b))),edges.map(a=>-dot(a,subset[0]))):[];if(u===null)continue;const weights=[1-u.reduce((n,v)=>n+v,0),...u];if(weights.some(w=>w< -1e-10))continue;const point=subset.reduce((p,v,i)=>add(p,mul(v,weights[i])),[0,0,0] as V),value=dot(point,point);if(value<best.value)best={value,point,active:subset.filter((_,i)=>weights[i]>1e-12)};}
 return best;
}
function touchesTriangle(piece:Piece,triangle:V[],cover:number):boolean{
 const origin=triangle[0],local:Piece={...piece,a:sub(piece.a,origin),b:sub(piece.b,origin)},face=triangle.map(p=>sub(p,origin));
 const minkowski=(w:V):V=>{const opposite=mul(w,-1),vertex=face.reduce((a,b)=>dot(a,opposite)>dot(b,opposite)?a:b),size=norm(w);return sub(support(local,w),size>0?add(vertex,mul(opposite,cover/size)):vertex);};
 let simplex=[minkowski([1,0,0])],c=closest(simplex);
 for(let i=0;i<96;i++){if(c.value<1e-16)return true;const w=minkowski(mul(c.point,-1)),gap=c.value-dot(c.point,w);if(gap<=1e-12*Math.max(1,c.value))return false;if(c.active.some(p=>norm(sub(p,w))<1e-10))return false;simplex=[...c.active,w];c=closest(simplex);}
 // An unresolved numerical case cannot relax the legacy check.
 return true;
}
export function flatEndPathClearance(path:V[],surfaces:Surface[],cover:(s:Surface)=>number,radius:number){
 const open=path.length>=2&&norm(sub(path[0],path.at(-1)!))>.0001;
 surfaces=surfacesNear(path,surfaces,s=>cover(s)+radius);
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],delta=sub(b,a),length=norm(delta);if(length<.000001)continue;
  const piece:Piece={a,b,t:mul(delta,1/length),radius,flatStart:open&&i===1&&length>=radius+.0001,flatEnd:open&&i===path.length-1&&length>=radius+.0001};
  for(const s of surfaces){const required=cover(s),effective=Math.max(0,required-.0001);
   if(segmentFaceGap(a,b,s)>=required+radius||segmentFaceDistance(a,b,s)>=required+radius-.0001)continue;
   if(!piece.flatStart&&!piece.flatEnd)return false;
   const n=s.normal||(Array.from({length:3},(_,j)=>j===s.axis?(s.positive?1:-1):0) as V),unit=mul(n,1/norm(n)),o=s.vertices?.[0]||s.origin,max=dot(sub(support(piece,unit),o),unit),min=dot(sub(support(piece,mul(unit,-1)),o),unit);
   if(max<=-effective||min>=effective)continue;
   if(surfaceTriangles(s).some(t=>touchesTriangle(piece,t as V[],effective)))return false;
  }
 }
 return true;
}
