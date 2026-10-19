import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
import {ShapeUtils,Vector2} from 'three';
import type {Vec3} from './model';
import {signedArea,type Point2} from './prismSchema';

// Boolean operations belong to displayed silhouettes/cuts only. Takeoff and
// cover continue to use analytic volume and the physical boundary mesh.
export function unionViewPolygons(faces:Point2[][]):MultiPolygon{
 const polygons=faces.filter(f=>f.length>=3&&Math.abs(signedArea(f))>1e-6).map(f=>[f] as Polygon);
 if(!polygons.length)return [];
 return polygonClipping.union(polygons[0],...polygons.slice(1));
}
export function clipProfile(outer:Point2[],holes:Point2[][],axis:number,lower:number,upper:number):MultiPolygon{
 if(upper-lower<=1e-8)return [];
 const other=1-axis,max=Math.max(...outer.map(v=>v[other]))+1,point=(u:number,v:number):Point2=>axis===0?[u,v]:[v,u];
 return polygonClipping.intersection([outer,...holes],[[point(lower,-1),point(upper,-1),point(upper,max),point(lower,max)]]);
}
export function polygonViewFaces(polygons:MultiPolygon,map:(v:Point2)=>Vec3):Vec3[][]{
 const faces:Vec3[][]=[];
 for(const polygon of polygons){
  const rings=polygon.map(r=>r.slice(0,-1)),points=rings.flat(),triangles=ShapeUtils.triangulateShape(rings[0].map(v=>new Vector2(...v)),rings.slice(1).map(r=>r.map(v=>new Vector2(...v))));
  for(const tri of triangles)faces.push(tri.map(i=>map(points[i])));
 }return faces;
}
// Stitch closed material-section contours from planar physical faces. Even/odd
// filling retains holes without depending on mesh winding or loop discovery.
export function sectionViewPolygons(segments:[Point2,Point2][],coplanar:Point2[][]):MultiPolygon{
 const key=(v:Point2)=>v.map(n=>Math.round(n*1e6)).join('/'),nodes=new Map<string,Point2>(),edges=new Map<string,[string,string]>(),adj=new Map<string,string[]>(),directions=new Map<string,number>();
 for(const [a,b] of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;nodes.set(ka,nodes.get(ka)||a);nodes.set(kb,nodes.get(kb)||b);const id=[ka,kb].sort().join('|');directions.set(id,(directions.get(id)||0)|(ka<kb?1:2));edges.set(id,[ka,kb]);}
 // At a tangent shared edge, the two outward faces induce opposite contour
 // directions: it encloses zero section area and must cancel. Coincident cap
 // triangulation edges with the same direction are retained only once.
 for(const [id,mask] of directions)if(mask===3)edges.delete(id);
 for(const [id,[a,b]] of edges){adj.set(a,[...(adj.get(a)||[]),id]);adj.set(b,[...(adj.get(b)||[]),id]);}
 const remaining=new Set(edges.keys()),rings:Point2[][]=[];
 while(remaining.size){
  const first=remaining.values().next().value!,[start,next]=edges.get(first)!,ring=[nodes.get(start)!];remaining.delete(first);let previous=start,current=next,closed=false;
  for(let budget=0;budget<=edges.size;budget++){
   if(current===start){closed=true;break;}ring.push(nodes.get(current)!);const choices=(adj.get(current)||[]).filter(id=>remaining.has(id));if(!choices.length)break;
   const incoming=nodes.get(previous)!,at=nodes.get(current)!,direction=[at[0]-incoming[0],at[1]-incoming[1]];
   choices.sort((x,y)=>{const turn=(id:string)=>{const e=edges.get(id)!,to=nodes.get(e[0]===current?e[1]:e[0])!,dx=to[0]-at[0],dy=to[1]-at[1];return (Math.atan2(direction[0]*dy-direction[1]*dx,direction[0]*dx+direction[1]*dy)+Math.PI*2)%(Math.PI*2);};return turn(x)-turn(y);});
   const id=choices[0],e=edges.get(id)!;remaining.delete(id);previous=current;current=e[0]===current?e[1]:e[0];
  }
  if(closed&&ring.length>=3&&Math.abs(signedArea(ring))>1e-6)rings.push(ring);
 }
 let polygons:MultiPolygon=[];for(const ring of rings)polygons=polygons.length?polygonClipping.xor(polygons,[ring]):[[[...ring,ring[0]]]];
 const flat=unionViewPolygons(coplanar);return polygons.length&&flat.length?polygonClipping.union(polygons,flat):polygons.length?polygons:flat;
}
