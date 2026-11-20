import * as T from 'three';
import { cargarMano, articulaciones } from './manos.js';
import { crearAtomizador } from './atomizador.js';
import { cargarModeloPerfume } from './perfume-modelo.js';

const MESA=new T.Vector3(.585,.651,-.107);
const ORIENTACION_MESA=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-1.05);
const ESCRITORIO=Symbol('escritorio');
const XYZ=new T.Vector3(),Q=new T.Quaternion();

function entornoVidrio(){
  // Reflejos impresos por la mesa de mármol, el ventanal y los cirios. Este
  // entorno solo ilumina vidrio y manos, sin sumar luces al resto de la sala.
  const c=document.createElement('canvas');c.width=256;c.height=128;
  const g=c.getContext('2d'),fondo=g.createLinearGradient(0,0,0,128);
  for(const [v,color] of [[0,'#383a4c'],[.38,'#655853'],[.54,'#2c201c'],[1,'#4c3929']])fondo.addColorStop(v,color);
  g.fillStyle=fondo;g.fillRect(0,0,256,128);
  for(const [x,y,w,h,color] of [[25,34,20,40,'#dac6a3'],[94,50,5,34,'#e1a66c'],[151,29,15,37,'#b9beb6'],[207,48,6,40,'#ddaa6c']]){
    g.fillStyle=color;g.fillRect(x,y,w,h);
  }
  const textura=new T.CanvasTexture(c);textura.colorSpace=T.SRGBColorSpace;textura.mapping=T.EquirectangularReflectionMapping;
  return textura;
}

export function crearPerfume(escena,camara,refrescar=()=>{}){
  const botella=new T.Group();botella.name='ORVANT interactivo';escena.add(botella);
  botella.position.copy(MESA);botella.quaternion.copy(ORIENTACION_MESA);
  const bruma=crearAtomizador(escena),mapa=entornoVidrio();
  const piel=new T.MeshStandardMaterial({color:0xb9a493,roughness:.71,metalness:0,envMap:mapa,envMapIntensity:1.05});
  const manos=new Map(),lados=new Map();
  const pistola=new T.Vector3(),direccion=new T.Vector3(),destino=new T.Vector3(),cursor=new T.Raycaster();
  const x=new T.Vector3(),y=new T.Vector3(),z=new T.Vector3(),matriz=new T.Matrix4();
  const inicioVuelta=new T.Vector3(),rotacionVuelta=new T.Quaternion();
  const rotacionPC=new T.Quaternion().setFromEuler(new T.Euler(-.08,-.13,-.07));
  let propietario=null,volviendo=false,inicioRetorno=0,t=0,numero=0,ultimo=-20;
  let cap,pulsador,basePulsador,boquilla,tapaMesa,disponible=false,selecciones=new WeakSet();
  const modeloListo=cargarModeloPerfume().then(modelo=>{
    botella.add(modelo);
    modelo.traverse(o=>{
      if(!o.isMesh)return;
      for(const m of (Array.isArray(o.material)?o.material:[o.material])){
        if(m.isMeshStandardMaterial){m.envMap=mapa;m.envMapIntensity=1.35;m.needsUpdate=true;}
      }
    });
    cap=modelo.getObjectByName('Cap');pulsador=modelo.getObjectByName('Actuator');boquilla=modelo.getObjectByName('NozzleOrigin');
    if(!cap||!pulsador||!boquilla)throw Error('Faltan el tapón o el atomizador del modelo ORVANT');
    basePulsador=pulsador.position.y;
    // El tapón queda en la mesa y vuelve al cuello al devolver el frasco.
    botella.updateWorldMatrix(true,true);
    tapaMesa=new T.Group();const copia=cap.clone();tapaMesa.add(copia);escena.add(tapaMesa);
    cap.matrixWorld.decompose(copia.position,copia.quaternion,copia.scale);
    const caja=new T.Box3().setFromObject(tapaMesa),centro=caja.getCenter(new T.Vector3());
    tapaMesa.position.set(.72-centro.x,.651-caja.min.y,-.083-centro.z);
    tapaMesa.visible=false;disponible=true;refrescar();
  }).catch(e=>{console.error('No se pudo cargar el frasco',e);});
  const manosListas=Promise.all(['left','right'].map(async lado=>{
    const mano=await cargarMano(lado,piel);
    escena.add(mano.modelo);mano.modelo.visible=false;lados.set(lado,mano);
  }));
  function adquirir(fuente){
    if(!disponible||propietario||volviendo)return false;
    propietario=fuente;cap.visible=false;tapaMesa.visible=true;
    refrescar();return true;
  }
  function soltar(){
    if(!propietario)return;
    propietario=null;volviendo=true;inicioRetorno=t;
    inicioVuelta.copy(botella.position);rotacionVuelta.copy(botella.quaternion);
    refrescar();
  }
  function devolver(){
    propietario=null;volviendo=false;botella.position.copy(MESA);botella.quaternion.copy(ORIENTACION_MESA);
    if(cap){cap.visible=true;tapaMesa.visible=false;pulsador.position.y=basePulsador;}
    refrescar();
  }
  function disparar(fuente){
    if(!disponible||propietario!==fuente)return false;
    boquilla.getWorldPosition(pistola);boquilla.getWorldQuaternion(Q);
    direccion.set(0,0,-1).applyQuaternion(Q);
    if(!bruma.emitir(t,pistola,direccion,fuente))return false;
    ultimo=t;numero++;refrescar();return true;
  }
  function cerca(centro,frame,fuente,espacio){
    destino.copy(MESA);destino.y+=.056;
    if(centro.distanceToSquared(destino)<.15**2)return true;
    // Una selección a distancia corta facilita el agarre con la mano contraria
    // desde la silla; no atrae objetos fuera del pasillo personal.
    if(!fuente.targetRaySpace || centro.distanceToSquared(destino)>1.08**2)return false;
    const pose=frame.getPose(fuente.targetRaySpace,espacio);
    if(!pose)return false;
    const {position,orientation}=pose.transform;
    cursor.ray.origin.set(position.x,position.y,position.z);
    Q.set(orientation.x,orientation.y,orientation.z,orientation.w);cursor.ray.direction.set(0,0,-1).applyQuaternion(Q);
    const distancia=cursor.ray.distanceToPoint(destino);
    return distancia<.061;
  }
  function estadoFuente(fuente){
    let estado=manos.get(fuente);
    if(!estado){
      estado={puntos:articulaciones.map(()=>new T.Vector3()),grupo:new T.Vector3(),rot:new T.Quaternion(),
        agarre:false,indice:false,ultimoSeguimiento:t};
      manos.set(fuente,estado);
    }
    return estado;
  }
  function posarProducto(pos,rot){
    botella.position.copy(pos);botella.quaternion.copy(rot);botella.updateWorldMatrix(true,true);
  }
  function actualizarFuente(frame,espacio,fuente,mano){
    const estado=estadoFuente(fuente),{puntos:p,grupo,rot}=estado;
    let agarre,indice;
    if(fuente.hand){
      mano.modelo.position.set(0,0,0);mano.modelo.quaternion.identity();
      if(!mano.rastreada(frame,fuente,espacio,p))return false;
      y.subVectors(p[6],p[21]).normalize();z.subVectors(p[0],p[11]);
      x.crossVectors(y,z).normalize();z.crossVectors(x,y).normalize();
      rot.setFromRotationMatrix(matriz.makeBasis(x,y,z));
      grupo.copy(p[11]).add(XYZ.set(fuente.handedness==='right'?-.046:.046,-.075,-.004).applyQuaternion(rot));
      agarre=p[4].distanceTo(p[14])<(estado.agarre?.053:.030);
      indice=false;
    }else{
      const pose=fuente.gripSpace&&frame.getPose(fuente.gripSpace,espacio);
      if(!pose)return false;
      const {position,orientation}=pose.transform;
      rot.set(orientation.x,orientation.y,orientation.z,orientation.w);
      grupo.set(position.x,position.y,position.z).add(XYZ.set(fuente.handedness==='right'?-.039:.039,-.051,-.013).applyQuaternion(rot));
      const valores=fuente.gamepad?.buttons, palanca=valores?.[1]?.value||0, gatillo=valores?.[0]?.value||0;
      agarre=palanca>(estado.agarre?.30:.57);
      indice=gatillo>(estado.indice?.30:.58);
      mano.modelo.position.copy(grupo);mano.modelo.quaternion.copy(rot);
      mano.mando(propietario===fuente?1:palanca,gatillo,propietario===fuente);
    }
    mano.modelo.visible=true;estado.ultimoSeguimiento=t;
    if(agarre&&!estado.agarre&&!propietario&&!volviendo){
      XYZ.copy(grupo);XYZ.y+=.052;
      if(cerca(XYZ,frame,fuente,espacio))adquirir(fuente);
    }
    if(propietario===fuente){
      if(!agarre)soltar();
      else{
        posarProducto(grupo,rot);
        if(fuente.hand){
          boquilla.getWorldPosition(destino);
          indice=p[9].distanceTo(destino)<(estado.indice?.044:.026);
        }
        if(indice&&!estado.indice)disparar(fuente);
      }
    }
    estado.agarre=agarre;estado.indice=indice;
    return true;
  }
  function actualizar(tiempo,frame,espacio){
    t=tiempo;
    for(const h of lados.values())h.modelo.visible=false;
    if(frame&&espacio){
      for(const fuente of frame.session.inputSources){
        const h=lados.get(fuente.handedness);if(h)actualizarFuente(frame,espacio,fuente,h);
      }
      for(const [fuente,estado] of manos){
        if(t-estado.ultimoSeguimiento>.28){
          if(propietario===fuente)soltar();
          manos.delete(fuente);
        }
      }
    }else if(propietario===ESCRITORIO){
      const pos=destino.set(.077,-.087,-.33).applyQuaternion(camara.quaternion).add(camara.position);
      rotacionVuelta.copy(camara.quaternion).multiply(rotacionPC);
      posarProducto(pos,rotacionVuelta);
      const h=lados.get('right');
      if(h){
        h.modelo.visible=true;h.modelo.position.copy(pos);h.modelo.quaternion.copy(rotacionVuelta);
        h.mando(1,Math.max(0,1-(t-ultimo)/.14),true);
      }
    }
    if(volviendo){
      const f=T.MathUtils.clamp((t-inicioRetorno)/.52,0,1),s=f*f*(3-2*f);
      botella.position.lerpVectors(inicioVuelta,MESA,s);botella.position.y+=.057*Math.sin(Math.PI*f);
      botella.quaternion.slerpQuaternions(rotacionVuelta,ORIENTACION_MESA,s);
      if(f>=1)devolver();
    }
    if(pulsador)pulsador.position.y=basePulsador-.002*Math.max(0,1-(t-ultimo)/.15);
    bruma.actualizar(t);
  }
  function limpiar(){
    devolver();bruma.limpiar();manos.clear();selecciones=new WeakSet();ultimo=-20;
    for(const h of lados.values())h.modelo.visible=false;
  }
  return {
    listo:Promise.all([modeloListo,manosListas]),actualizar,limpiar,prepararAudio:bruma.prepararAudio,
    tomarPC:()=>adquirir(ESCRITORIO), pulverizarPC:()=>disparar(ESCRITORIO), soltarPC:()=>{if(propietario===ESCRITORIO)soltar();},
    apuntaPC(ndc){cursor.setFromCamera(ndc,camara);return !propietario&&cursor.ray.distanceToPoint(destino.copy(MESA).add(XYZ.set(0,.06,0)))<.071;},
    inicioSeleccion(fuente){if(propietario===fuente){selecciones.add(fuente);if(!fuente.hand)disparar(fuente);}},
    consumeSeleccion(fuente){const curso=selecciones.has(fuente)||propietario===fuente;selecciones.delete(fuente);return curso;},
    get estado(){return {disponible,sujeto:propietario===ESCRITORIO?'escritorio':propietario?.handedness||'',volviendo,
      pulsos:numero,manos:lados.size,tapon:!!cap?.visible,direccion:direccion.toArray(),origen:pistola.toArray(),
      posicion:botella.position.toArray(),indice:manos.get(propietario)?.indice||false};}
  };
}
