import {contextSolids,contextOpenings,placementViewBounds,hasPlacementContext} from '../domain/placementContext';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Member,Spec} from '../domain/model';
import {schedule} from '../domain/engine';
import {barCouplerEnds} from '../domain/elementInput';
import {couplerMeshes} from './coupler3d';
import {boundsOf,solidQuantities} from '../domain/solids';
import {surfaceTriangles} from '../domain/prismGeometry';
export default function ModelView({member:m,spec,selected,onSelect}:{member:Member;spec:Spec;selected:string;onSelect:(id:string)=>void}){
 const el=useRef<HTMLDivElement>(null),view=useRef<(axis:string)=>void>(()=>{}),[error,setError]=useState('');
 useEffect(()=>{
  if(!el.current)return;const host=el.current;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setError('เครื่องนี้เปิด WebGL ไม่ได้ ใช้มุมมอง 2D ได้');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#f5f7f6');
  const viewport=placementViewBounds(m),d=viewport.size.map(n=>n/1000),center=new THREE.Vector3((viewport.min[0]+viewport.max[0])/2000,(viewport.min[2]+viewport.max[2])/2000,-(viewport.min[1]+viewport.max[1])/2000),extent=Math.max(...d),camera=new THREE.PerspectiveCamera(38,1,.01,1000);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.enableDamping=true;
  const place=(axis:string)=>{const v=axis==='X'?new THREE.Vector3(1,0,0):axis==='Y'?new THREE.Vector3(0,0,-1):axis==='Z'?new THREE.Vector3(.0001,1,0):new THREE.Vector3(1,.8,1);camera.position.copy(center).add(v.normalize().multiplyScalar(extent*2.3));controls.update();};view.current=place;place('ISO');
  const vertices:number[]=[];for(const surface of solidQuantities(m).surfaces)for(const triangle of surfaceTriangles(surface))for(const p of triangle)vertices.push(p[0]/1000,p[2]/1000,-p[1]/1000);
  const bodyGeometry=new THREE.BufferGeometry();bodyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));bodyGeometry.computeVertexNormals();
  scene.add(new THREE.Mesh(bodyGeometry,new THREE.MeshBasicMaterial({color:0xc8d2d1,transparent:true,opacity:.17,depthWrite:false,side:THREE.DoubleSide})));
  scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeometry),new THREE.LineBasicMaterial({color:0x9aacb1})));
  // shape-model piles (reference only): heads embedded into the concrete, shown down to ~2.5 m
  const sp=m.shapeModel?.piles;if(sp)for(const [x,y] of sp.positions){const len=Math.min(Math.max(sp.length*1000-sp.cutoff,500),2500)/1000,g=sp.type==='square'?new THREE.BoxGeometry(sp.size/1000,len,sp.size/1000):new THREE.CylinderGeometry(sp.size/2000,sp.size/2000,len,28),pile=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xb39a7c,transparent:true,opacity:.45}));pile.position.set(x/1000,(sp.embed/1000)-len/2,-y/1000);scene.add(pile);}
  const holeIds=new Set(contextOpenings(m).map(h=>h.id)); for(const r of [...contextSolids(m),...contextOpenings(m)]){const g=new THREE.BoxGeometry(r.size[0]/1000,r.size[2]/1000,r.size[1]/1000),e=new THREE.EdgesGeometry(g),outline=new THREE.LineSegments(e,new THREE.LineDashedMaterial({color:holeIds.has(r.id)?0xba654e:0xba9656,dashSize:.08,gapSize:.05}));outline.position.set((r.origin[0]+r.size[0]/2)/1000,(r.origin[2]+r.size[2]/2)/1000,-(r.origin[1]+r.size[1]/2)/1000);outline.computeLineDistances();scene.add(outline);g.dispose();}
  const meshes:THREE.Object3D[]=[];
  for(const bar of schedule(m,spec)){for(const path of bar.paths){const pts=path.map(p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000));if(pts.length<2)continue;
   class PolyCurve extends THREE.Curve<THREE.Vector3>{constructor(){super();}getPoint(t:number){const n=t*(pts.length-1),i=Math.min(pts.length-2,Math.floor(n));return pts[i].clone().lerp(pts[i+1],n-i);}}
   const g=new THREE.TubeGeometry(new PolyCurve(),Math.max(2,pts.length*2),bar.diameter/2000,5,false),mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:bar.id===selected?0xe69432:0x168674}));mesh.userData.id=bar.id;scene.add(mesh);meshes.push(mesh);
   for(const c of couplerMeshes(pts,bar.diameter,barCouplerEnds(m.elementInput,bar.id),new THREE.MeshBasicMaterial({color:0x5b6b70}))){c.userData.id=bar.id;scene.add(c);meshes.push(c);}
  }}
  const ray=new THREE.Raycaster();const click=(ev:MouseEvent)=>{const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((ev.clientX-r.left)/r.width*2-1,-(ev.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(meshes)[0];if(hit)onSelect(hit.object.userData.id);};renderer.domElement.addEventListener('click',click);
  const resize=()=>{renderer.setSize(host.clientWidth,420);camera.aspect=host.clientWidth/420;camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(host);resize();
  let frame:number;const render=()=>{controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(render);};render();
  return ()=>{cancelAnimationFrame(frame);ro.disconnect();controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});renderer.dispose();renderer.domElement.remove();};
 },[m,spec,selected]);
 return <div><div className="view-tools">{['ISO','X','Y','Z'].map(a=><button key={a} onClick={()=>view.current(a)}>{a}</button>)}<span>ลากเพื่อหมุน · ล้อเมาส์เพื่อซูม · คลิกเหล็กเลือก Mark</span></div>{hasPlacementContext(m)&&<p className="muted model-context-legend">เส้นประทอง = พื้นที่รอยต่อ · ประแดง = ช่องเปิดอ้างอิง · ไม่คิดคอนกรีต/แบบหล่อ BOQ</p>}{error&&<p className="notice">{error}</p>}<div ref={el} className="model-canvas"/></div>;
}
