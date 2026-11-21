import * as T from 'three';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';

// El esqueleto plano de las mallas generic-hand de Meta usa nombres WebXR.
const dedos=['thumb','index-finger','middle-finger','ring-finger','pinky-finger'];
export const articulaciones=['wrist',...dedos.flatMap((dedo,i)=>
  (i===0?['metacarpal','phalanx-proximal','phalanx-distal','tip']:
    ['metacarpal','phalanx-proximal','phalanx-intermediate','phalanx-distal','tip']).map(k=>dedo+'-'+k))];
const cadenas=[[1,4],[6,9],[11,14],[16,19],[21,24]];
// Posiciones de contacto en metros respecto a la base del frasco. El índice
// llega desde el hombro al pulsador; los otros tres dedos rodean el vidrio.
const contacto=[
  [.073,.016,.095],
  [.056,.045,.060],[.049,.061,.037],[.032,.066,.025],[.023,.062,.024],
  [.063,.064,.047],[.043,.094,.004],[.024,.125,-.018],[.006,.127,-.003],[.001,.116,-.002],
  [.066,.052,.049],[.046,.075,.004],[.035,.076,-.027],[.009,.074,-.028],[-.006,.073,-.024],
  [.068,.040,.051],[.047,.056,.008],[.036,.055,-.023],[.013,.053,-.026],[-.004,.052,-.023],
  [.068,.030,.058],[.046,.037,.014],[.038,.034,-.012],[.020,.032,-.022],[.006,.031,-.023]
];
const ejeX=new T.Vector3(),ejeY=new T.Vector3(),ejeZ=new T.Vector3();
function basePalma(matriz,puntos){
  ejeY.subVectors(puntos[6],puntos[21]);
  if(ejeY.lengthSq()<1e-6)return false;
  ejeY.normalize();
  ejeZ.subVectors(puntos[0],puntos[11]);
  ejeX.crossVectors(ejeY,ejeZ);
  if(ejeX.lengthSq()<1e-6)return false;
  ejeX.normalize();
  ejeZ.crossVectors(ejeX,ejeY).normalize();
  matriz.makeBasis(ejeX,ejeY,ejeZ);
  return true;
}

// Ajusta los dedos una vez al cargar el GLB. Conserva las longitudes de cada
// falange mientras la yema alcanza el vidrio o el pulsador (FABRIK).
function ajustarDedo(pose,abierto,base,punta){
  const meta=pose[punta].clone(),delta=new T.Vector3();
  const largos=abierto.slice(base,punta).map((p,i)=>p.distanceTo(abierto[base+i+1]));
  for(let paso=0;paso<32;paso++){
    pose[punta].copy(meta);
    for(let i=punta-1;i>=base;i--){
      delta.subVectors(pose[i],pose[i+1]).setLength(largos[i-base]);
      pose[i].copy(pose[i+1]).add(delta);
    }
    pose[base].copy(abierto[base]);
    for(let i=base;i<punta;i++){
      delta.subVectors(pose[i+1],pose[i]).setLength(largos[i-base]);
      pose[i+1].copy(pose[i]).add(delta);
    }
    if(pose[punta].distanceToSquared(meta)<1e-10)break;
  }
}
export async function cargarMano(lado,material){
  const url=new URL('../vendor/meta-hands/'+lado+'.glb',import.meta.url);
  const {scene:modelo}=await new GLTFLoader().loadAsync(url.href);
  modelo.name='Mano Meta '+lado;
  modelo.traverse(o=>{
    if(o.isSkinnedMesh){
      o.material=material;o.frustumCulled=false;
      // La pantalla dibuja su propia capa translúcida. Una mano del primer
      // plano siempre compone después de esa capa; el vidrio conserva la profundidad.
      o.renderOrder=61;
    }
  });
  const huesos=articulaciones.map(k=>modelo.getObjectByName(k));
  const reposo=huesos.map(h=>h.position.clone()),rotaciones=huesos.map(h=>h.quaternion.clone());
  const atras= reposo[0].clone().sub(reposo[6].clone().lerp(reposo[21],.5)).normalize();
  modelo.traverse(o=>{
    if(!o.isSkinnedMesh)return;
    const pos=o.geometry.attributes.position,distancias=new Float32Array(pos.count),vertice=new T.Vector3();
    for(let i=0;i<pos.count;i++)distancias[i]=vertice.fromBufferAttribute(pos,i).sub(reposo[0]).dot(atras);
    o.geometry.setAttribute('terminacion',new T.BufferAttribute(distancias,1));
  });
  const s=lado==='right'?1:-1;
  const cerrado=contacto.map(([x,y,z])=>new T.Vector3(s*x,y,z));
  const basis=new T.Matrix4();
  basePalma(basis,cerrado);
  const palmaEnFrasco=new T.Quaternion().setFromRotationMatrix(basis);
  basePalma(basis,reposo);
  const alineacion=palmaEnFrasco.clone().multiply(new T.Quaternion().setFromRotationMatrix(basis).invert());
  const nudilloMedio=cerrado[11].clone();
  const abierto=reposo.map(p=>p.clone().sub(reposo[11]).applyQuaternion(alineacion).add(nudilloMedio));
  const rotBase=rotaciones.map(r=>alineacion.clone().multiply(r));
  const indiceAlto=cerrado.map(p=>p.clone());
  indiceAlto[7].y+=.004;indiceAlto[8].y+=.008;indiceAlto[9].y+=.010;
  ajustarDedo(indiceAlto,abierto,6,9);
  for(const [base,punta] of cadenas)ajustarDedo(cerrado,abierto,base,punta);
  const centroAgarre=new T.Vector3();
  for(const i of [11,14,16,19])centroAgarre.add(cerrado[i]);
  centroAgarre.multiplyScalar(.25);

  // WebXR sitúa -Z del gripSpace hacia el pulgar y +Y hacia el antebrazo.
  // En nuestra base anatómica esos ejes son +Y y +Z respectivamente.
  const inversaPalma=palmaEnFrasco.clone().invert();
  const frascoEnMando=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2).multiply(inversaPalma);
  const offset=new T.Vector3();
  function desdeMando(transform,grupo,rot){
    const {x,y,z,w}=transform.orientation;
    rot.set(x,y,z,w).multiply(frascoEnMando);
    grupo.copy(transform.position).sub(offset.copy(centroAgarre).applyQuaternion(rot));
  }
  function desdeArticulaciones(puntos,grupo,rot){
    if(!basePalma(basis,puntos))return false;
    rot.setFromRotationMatrix(basis).multiply(inversaPalma);
    grupo.copy(puntos[11]).sub(offset.copy(nudilloMedio).applyQuaternion(rot));
    return true;
  }

  const falanges=[],identidad=new T.Quaternion(),giro=new T.Quaternion(),accion=new T.Quaternion();
  for(const [base,punta] of cadenas){
    for(let i=base;i<punta;i++){
      const segmento=abierto[i+1].clone().sub(abierto[i]),dir=segmento.clone().normalize();
      const apuntar=p=>new T.Quaternion().setFromUnitVectors(dir,p[i+1].clone().sub(p[i]).normalize());
      falanges.push({i,segmento,flexion:apuntar(cerrado),alto:base===6?apuntar(indiceAlto):null,final:i+1===punta});
    }
  }
  function mando(cierre,gatillo){
    const fuerza=T.MathUtils.clamp(cierre,0,1),presion=T.MathUtils.clamp(gatillo,0,1);
    // La muñeca y el arco de nudillos siempre conservan la forma de la palma del GLB.
    for(let i=0;i<huesos.length;i++){
      huesos[i].position.copy(abierto[i]);huesos[i].quaternion.copy(rotBase[i]);
    }
    for(const {i,segmento,flexion,alto,final} of falanges){
      if(alto)accion.slerpQuaternions(alto,flexion,presion);
      const peso=alto ? .16+.84*Math.max(fuerza,presion) : .12+.88*fuerza;
      giro.slerpQuaternions(identidad,alto?accion:flexion,peso);
      huesos[i].quaternion.copy(giro).multiply(rotBase[i]);
      huesos[i+1].position.copy(segmento).applyQuaternion(giro).add(huesos[i].position);
      if(final)huesos[i+1].quaternion.copy(giro).multiply(rotBase[i+1]);
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
  return {modelo,mando,rastreada,desdeMando,desdeArticulaciones,centroAgarre};
}
