import * as THREE from 'three';

/** Coupler sleeves (Ø 1.6d × 3d, centred on the bar end) at the coupled ends of a bar path in scene units (m, Y up). */
export function couplerMeshes(pts:THREE.Vector3[],d:number,ends:{top:boolean;bottom:boolean},material:THREE.Material):THREE.Mesh[]{
 if(pts.length<2)return [];
 const firstHigh=pts[0].y>pts.at(-1)!.y,out:THREE.Mesh[]=[];
 for(const first of [...(ends.top?[firstHigh]:[]),...(ends.bottom?[!firstHigh]:[])]){
  const e=first?pts[0]:pts.at(-1)!,p=first?pts[1]:pts.at(-2)!,dir=e.clone().sub(p).normalize();
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(d*.8/1000,d*.8/1000,d*3/1000,16),material);
  mesh.position.copy(e);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);out.push(mesh);
 }
 return out;
}

/** Translucent boxes (mm in, scene m out, Y up) for display-only context such as the columns of a beam group. */
export function contextBoxes(boxes:{origin:number[];size:number[]}[],color=0x9aa8ad):THREE.Mesh[]{
 return boxes.map(b=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(b.size[0]/1000,b.size[2]/1000,b.size[1]/1000),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.3,depthWrite:false}));
  mesh.position.set((b.origin[0]+b.size[0]/2)/1000,(b.origin[2]+b.size[2]/2)/1000,-(b.origin[1]+b.size[1]/2)/1000);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x6b7b80}));mesh.add(edges);return mesh;});
}
