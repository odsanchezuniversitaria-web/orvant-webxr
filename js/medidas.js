import * as THREE from 'three';

export const ORDEN_ZONAS = ['izquierda','centro','derecha','arriba','abajo'];

export function crearMuestreo() {
  const zonas = Object.fromEntries(ORDEN_ZONAS.map(nombre=>[nombre,new THREE.Color(0,0,0)]));
  zonas.promedio = new THREE.Color(0,0,0);
  zonas.pista = 'cargando';
  const lineal = Float32Array.from({length:256},(_,i)=>{
    const s=i/255;
    return s<=.04045 ? s/12.92 : ((s+.055)/1.055)**2.4;
  });
  let pista = null;
  fetch('./video/luz_pelicula.json').then(async respuesta=>{
    if (!respuesta.ok) throw Error('pista de luz ausente');
    const datos=await respuesta.json();
    const n=ORDEN_ZONAS.length*3;
    if (datos.formato!=='srgb8' || datos.zonas?.join()!==ORDEN_ZONAS.join() ||
        !Array.isArray(datos.muestras) || !datos.muestras.length ||
        !(datos.fps>0 && datos.step>=1) ||
        !datos.muestras.every(m=>Array.isArray(m)&&m.length===n&&m.every(v=>Number.isInteger(v)&&v>=0&&v<=255)))
      throw Error('pista de luz inválida');
    pista=datos;
    zonas.pista='5 zonas · pista local';
  }).catch(()=>{ zonas.pista='pista de luz no disponible'; });
  const objetivo = new THREE.Color();
  return (fuente, dt)=>{
    const pos=pista && Number.isFinite(fuente)
      ? THREE.MathUtils.clamp(fuente*pista.fps/pista.step,0,pista.muestras.length-1) : 0;
    const i=Math.floor(pos), f=pos-i;
    const a=pista?.muestras[i], b=pista?.muestras[Math.min(i+1,pista.muestras.length-1)];
    zonas.promedio.setRGB(0,0,0);
    for (let j=0;j<ORDEN_ZONAS.length;j++) {
      const k=j*3, color=zonas[ORDEN_ZONAS[j]];
      if (a && b && Number.isFinite(fuente)) {
        objetivo.setRGB(lineal[a[k]]*(1-f)+lineal[b[k]]*f,
          lineal[a[k+1]]*(1-f)+lineal[b[k+1]]*f, lineal[a[k+2]]*(1-f)+lineal[b[k+2]]*f);
      } else objetivo.setRGB(0,0,0);
      // Ganancia de los rebotes en una sala a oscuras. El pie de la curva
      // deja caer la luz con los negros sin encender el mármol entre planos.
      const l=objetivo.r*.2126+objetivo.g*.7152+objetivo.b*.0722;
      const ganancia=.24+.92*THREE.MathUtils.smoothstep(l,.012,.205);
      const luma=l*ganancia;
      const comprimida=luma>.40 ? .40+.12*(1-Math.exp(-(luma-.40)/.12)) : luma;
      if (l>.000001) {
        objetivo.setRGB(Math.max(0,l+(objetivo.r-l)*1.10),Math.max(0,l+(objetivo.g-l)*1.10),
          Math.max(0,l+(objetivo.b-l)*1.10)).multiplyScalar(comprimida/l);
      }
      const dr=objetivo.r-color.r, dg=objetivo.g-color.g, db=objetivo.b-color.b;
      const sube=.2126*dr+.7152*dg+.0722*db>0;
      const alfa=1-Math.exp(-dt/(sube ? .26 : .38));
      const pico=Math.max(Math.abs(dr),Math.abs(dg),Math.abs(db),1e-6);
      const paso=Math.min(alfa,dt*(sube ? .48 : .58)/pico);
      color.r+=dr*paso; color.g+=dg*paso; color.b+=db*paso;
      sumarPonderado(zonas.promedio,color,j===1 ? .36 : .16);
    }
    return zonas;
  };
}

function sumarPonderado(destino,color,peso) {
  destino.r+=color.r*peso; destino.g+=color.g*peso; destino.b+=color.b*peso;
}

export function crearPanelMedidas(scene) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 768;
  lienzo.height = 160;
  const ctx = lienzo.getContext('2d');
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map:textura, toneMapped:false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.65,0.344),material);
  panel.position.set(-2.3,1.12,-2.7);
  panel.lookAt(0,1.2,0);
  scene.add(panel);
  let anterior, desde, total, frames, framesTotal, resumen;
  function reiniciar() { anterior=0; desde=0; total=0; frames=0; framesTotal=0; resumen=''; }
  reiniciar();
  return {
    reiniciar,
    get resumen() { return resumen; },
    actualizar(ms, render, modo, sesion, video, bitsProfundidad, post, zonas, programas) {
      if (!anterior || ms-anterior > 1800 || sesion?.visibilityState === 'hidden') {
        anterior=desde=ms; frames=0; return;
      }
      total += ms-anterior; frames++; framesTotal++; anterior=ms;
      if (ms-desde < 1000) return;
      const fps = frames*1000/(ms-desde);
      const media = framesTotal*1000/total;
      const real = sesion ? 'Visor' : 'PC';
      const hz = sesion?.frameRate ? ' / '+sesion.frameRate+' Hz' : '';
      const saltos = video.getVideoPlaybackQuality?.().droppedVideoFrames ?? '—';
      resumen = real+' '+fps.toFixed(1)+' FPS'+hz+' · media '+media.toFixed(1);
      ctx.fillStyle='#211b15'; ctx.fillRect(0,0,768,160);
      ctx.font='29px sans-serif'; ctx.fillStyle='#f8eacb'; ctx.fillText(resumen,20,40);
      ctx.font='24px sans-serif'; ctx.fillText(render.calls+' llamadas · '+render.triangles.toLocaleString('es')+' triángulos · '+saltos+' cuadros de vídeo perdidos',20,88,730);
      ctx.fillText(modo+' · Z '+bitsProfundidad+' bits · acabado '+(post?'activo':'apagado'),20,135,730);
      // Esta lectura está disponible para QA local solo cuando ?debug=1.
      document.getElementById('vista').dataset.medidas = JSON.stringify({
        visor:!!sesion,fps:+fps.toFixed(2),hz:sesion?.frameRate??null,llamadas:render.calls,
        triangulos:render.triangles,videoPerdidos:saltos,modo,post,bitsProfundidad,programas,
        pista:zonas.pista,tiempoVideo:video.currentTime,
        izquierda:zonas.izquierda.toArray(),derecha:zonas.derecha.toArray()
      });
      textura.needsUpdate=true;
      desde=ms; frames=0;
    }
  };
}
