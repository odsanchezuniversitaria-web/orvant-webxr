import * as T from 'three';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';

// El esqueleto plano de las mallas generic-hand de Meta usa nombres WebXR.
const dedos=['thumb','index-finger','middle-finger','ring-finger','pinky-finger'];
export const articulaciones=['wrist',...dedos.flatMap((dedo,i)=>
  (i===0?['metacarpal','phalanx-proximal','phalanx-distal','tip']:
    ['metacarpal','phalanx-proximal','phalanx-intermediate','phalanx-distal','tip']).map(k=>dedo+'-'+k))];
const siguiente=[5,2,3,4,4,6,7,8,9,9,11,12,13,14,14,16,17,18,19,19,21,22,23,24,24];
// Posiciones de contacto en metros respecto a la base del frasco. El índice
// llega desde el hombro al pulsador; los otros tres dedos rodean el vidrio.
const contacto=[
  [.073,.016,.095],
  [.039,.061,.047],[.028,.078,.029],[.004,.076,.024],[-.011,.072,.023],
  [.063,.064,.047],[.043,.094,.004],[.030,.119,-.004],[.010,.119,-.003],[.001,.116,-.002],
  [.066,.052,.049],[.046,.075,.004],[.035,.076,-.027],[.009,.074,-.028],[-.006,.073,-.024],
  [.068,.040,.051],[.047,.056,.008],[.036,.055,-.023],[.013,.053,-.026],[-.004,.052,-.023],
  [.068,.030,.058],[.046,.037,.014],[.038,.034,-.012],[.020,.032,-.022],[.006,.031,-.023]
];
function basePalma(matriz,puntos){
  const ejeY=new T.Vector3().subVectors(puntos[6],puntos[21]).normalize();
  const ejeZ=new T.Vector3().subVectors(puntos[0],puntos[11]);
  const ejeX=new T.Vector3().crossVectors(ejeY,ejeZ).normalize();
  ejeZ.crossVectors(ejeX,ejeY).normalize();
  return matriz.makeBasis(ejeX,ejeY,ejeZ);
}
export async function cargarMano(lado,material){
  const url=new URL('../vendor/meta-hands/'+lado+'.glb',import.meta.url);
  const {scene:modelo}=await new GLTFLoader().loadAsync(url.href);
  modelo.name='Mano Meta '+lado;
  modelo.traverse(o=>{ if(o.isSkinnedMesh){o.material=material;o.frustumCulled=false;} });
  const huesos=articulaciones.map(k=>modelo.getObjectByName(k));
  const reposo=huesos.map(h=>h.position.clone()),rotaciones=huesos.map(h=>h.quaternion.clone());
  const s=lado==='right'?1:-1;
  const cerrado=contacto.map(([x,y,z])=>new T.Vector3(s*x,y,z));
  const basis=new T.Matrix4(), baseCerrada=new T.Matrix4();
  const alineacion=new T.Quaternion().setFromRotationMatrix(
    basePalma(baseCerrada,cerrado).multiply(basePalma(basis,reposo).invert()));
  const abierto=reposo.map(p=>p.clone().sub(reposo[0]).applyQuaternion(alineacion).add(cerrado[0]));
  const direcciones=abierto.map((p,i)=>new T.Vector3().subVectors(abierto[siguiente[i]],p).normalize());
  const rotBase=rotaciones.map(r=>alineacion.clone().multiply(r));
  const u=new T.Vector3(),correccion=new T.Quaternion();
  function mando(cierre,gatillo,sujeto){
    const fuerza=T.MathUtils.clamp(cierre,0,1);
    for(let i=0;i<huesos.length;i++){
      const indice=i>=5&&i<10;
      const peso=indice ? (sujeto?.82+.18*gatillo:.16+.84*gatillo) : .12+.88*fuerza;
      const p=huesos[i].position.copy(abierto[i]).lerp(cerrado[i],peso);
      if(sujeto&&i>=7&&i<=9)p.y+=.010*(1-gatillo)-.002*gatillo;
    }
    for(let i=0;i<huesos.length;i++){
      const hijo=siguiente[i], h=huesos[i];
      if(hijo===i){h.quaternion.copy(huesos[i-1].quaternion);continue;}
      u.subVectors(huesos[hijo].position,h.position).normalize();
      correccion.setFromUnitVectors(direcciones[i],u);
      h.quaternion.copy(correccion).multiply(rotBase[i]);
    }
  }
  function rastreada(frame,fuente,espacio,puntos){
    for(let i=0;i<huesos.length;i++){
      const art=fuente.hand.get(articulaciones[i]);
      const pose=art && frame.getJointPose(art,espacio);
      if(!pose)return false;
      const {position,orientation}=pose.transform;
      puntos[i].set(position.x,position.y,position.z);
      huesos[i].position.copy(puntos[i]);
      huesos[i].quaternion.set(orientation.x,orientation.y,orientation.z,orientation.w);
    }
    return true;
  }
  return {modelo,mando,rastreada};
}
