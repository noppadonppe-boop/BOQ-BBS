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
