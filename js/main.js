import * as THREE from 'three';
import { crearMundo } from './mundo.js';
import { crearProyeccion } from './proyeccion.js';
import { crearMuestreo, crearPanelMedidas } from './medidas.js';
import { leerMontaje, ambienteEn, tiempoFuente } from './sincronizar.js';
import { crearAcabado } from './acabado.js';
import { crearPerfume } from './perfume.js';

const $ = id => document.getElementById(id);
const video = $('comercial'), acceso = $('acceso'), entrar = $('entrar'), carga = $('carga');
const estado = $('estado'), ayuda = $('ayuda'), canvas = $('vista'), volver = $('volver');
const q = new URLSearchParams(location.search);
const archivos = { suave:'prueba_SBS_suave.mp4', media:'prueba_SBS_media.mp4', intensa:'prueba_SBS_intensa.mp4',
  final:'perfume_3D_SBS_3840x1080.mp4', hsbs:'prueba_SBS_hsbs.mp4', original:'perfume_original_2D.mp4' };
const sinTramos = [];
let candidato = q.get('video');
let nivel = Object.hasOwn(archivos, candidato) ? candidato : 'media';
let tramos = null, leyendoMontaje = false;
let pideNitido = q.get('modo') === 'nitido';
let debug = q.get('debug') === '1';
let renderer, scene, camara, mundo, proyeccion, negro, medidas, muestrear;
let acabado, perfume, bitsProfundidad;
let precalentamiento = null;
let sesion = null, referenciaBase = null, referenciaPendiente = false;
let admiteVR = false, comprobadoXR = false, activo = false, ocupado = false, disponible = false;
let inicio = null, previo = null, encendido = null, apagado = null, intentoPlay = 0;
let intentoHecho = false, falloVideo = false, avisoModo = '';
let botones = new WeakMap();
let yaw = 0, pitch = 0.07;
const suave = n => THREE.MathUtils.smoothstep(n,0,1);
const ahora = () => performance.now()/1000;

function actualizarEnlaceOriginal() {
  const url=new URL(location.href);
  url.searchParams.set('video','original');
  $('original').href=url.href;
}

function cargarPelicula() {
  disponible=false; falloVideo=false;
  carga.hidden=false; carga.removeAttribute('value');
  video.src='./video/'+archivos[nivel];
  if (nivel!=='original' && nivel!=='final' && !tramos?.length && !leyendoMontaje) {
    leyendoMontaje=true;
    leerMontaje().then(datos=>{ tramos=datos; }).finally(()=>{ leyendoMontaje=false; });
  }
  estadoAcceso();
}

if (nivel==='final') $('pelicula').add(new Option('Comercial completo · 3D','final'));
$('pelicula').value=nivel;
$('modo').value=pideNitido ? 'nitido' : 'proyeccion';
$('contador').checked=debug;
// Al cambiar una revisión ya vista, el nuevo documento libera las texturas y la sesión previas.
try {
  if (sessionStorage.getItem('orvant-abrir-opciones')) {
    $('opciones').open=true; sessionStorage.removeItem('orvant-abrir-opciones');
  }
} catch { /* El navegador puede bloquear el almacenamiento. */ }
actualizarEnlaceOriginal();
$('opciones').addEventListener('change',()=>{
  const siguiente=$('pelicula').value;
  const ruta=new URL(location.href);
  ruta.searchParams.set('video',siguiente); ruta.searchParams.set('modo',$('modo').value);
  if ($('contador').checked) ruta.searchParams.set('debug','1');
  else ruta.searchParams.delete('debug');
  if (renderer) {
    try { sessionStorage.setItem('orvant-abrir-opciones','1'); } catch { /* Opcional. */ }
    location.assign(ruta.href);
    return;
  }
  history.replaceState(null,'',ruta.href);
  actualizarEnlaceOriginal();
  candidato=siguiente; pideNitido=$('modo').value==='nitido'; debug=$('contador').checked;
  if (siguiente!==nivel) { nivel=siguiente; cargarPelicula(); }
});

function estadoAcceso() {
  if (activo || ocupado || !comprobadoXR) return;
  const tiempo = Number.isFinite(video.duration) && video.duration > 0;
  let cargado = 0;
  if (tiempo && video.buffered.length) cargado = video.buffered.end(0)/video.duration;
  if (disponible || cargado) carga.value = cargado;
  if (falloVideo) {
    estado.textContent = 'El comercial «'+nivel+'» no está disponible en esta carpeta.';
    entrar.textContent = 'Ver la cantera';
    carga.hidden = true;
  } else {
    estado.textContent = disponible ? (nivel==='original' ? 'Comercial original en 2D · sala preparada.' : 'Comercial estéreo · '+nivel+'.') : 'Cargando el comercial…';
    entrar.textContent = 'Entrar';
  }
  entrar.disabled = !(disponible || falloVideo);
  $('original').hidden = !falloVideo || nivel==='original';
  ayuda.textContent = admiteVR ? 'El frasco está a tu derecha. Acerca la mano, mantén el botón lateral de agarre y pulsa el gatillo para pulverizar. Con seguimiento de manos, junta pulgar y medio para agarrar y toca la boquilla con el índice. Con la mano libre, el gatillo pausa la película.'
      : 'Arrastra para mirar. Usa Tomar ORVANT para probar el perfume y la barra espaciadora para pausar la película.';
  if (!window.isSecureContext) ayuda.textContent = 'Abre la dirección HTTPS del servidor para usar el visor.';
}

video.addEventListener('progress',estadoAcceso);
video.addEventListener('canplay', () => { disponible = true; falloVideo = false; estadoAcceso(); });
video.addEventListener('error', () => {
  if (!candidato && nivel==='media' && !activo) {
    nivel='original'; $('pelicula').value=nivel; cargarPelicula(); return;
  }
  falloVideo = true; disponible = false; estadoAcceso();
  if (activo) informar('El comercial se interrumpió. Comprueba el archivo y la conexión.');
});
video.addEventListener('ended', () => { apagado = ahora(); });
cargarPelicula();

async function comprobarXR() {
  try { admiteVR = !!(await navigator.xr?.isSessionSupported('immersive-vr')); }
  catch { admiteVR = false; }
  comprobadoXR = true;
  estadoAcceso();
}
comprobarXR();

function construir() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.xr.setFramebufferScaleFactor(1);
  renderer.xr.setFoveation(1);
  scene = new THREE.Scene();
  camara = new THREE.PerspectiveCamera(65, 1, 0.16, 95);
  camara.layers.enable(1);
  orientarPC();
  mundo = crearMundo(scene);
  perfume = crearPerfume(scene,camara,actualizarPerfumePC);
  proyeccion = crearProyeccion(scene,video,nivel==='original',mundo.piedraProyeccion);
  muestrear = crearMuestreo();
  acabado = crearAcabado(scene,q.get('post')!=='0');
  if (debug) medidas = crearPanelMedidas(scene);
  // El fundido inicial cubre ambos ojos después del acabado y de la proyección.
  const velo = new THREE.ShaderMaterial({
    uniforms:{alfa:{value:1}}, transparent:true, depthTest:false, depthWrite:false,
    vertexShader:'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:'uniform float alfa; void main(){gl_FragColor=vec4(0.0,0.0,0.0,alfa);}',
    toneMapped:false
  });
  negro = new THREE.Mesh(new THREE.PlaneGeometry(2,2),velo);
  negro.frustumCulled = false;
  negro.renderOrder = 10000;
  scene.add(negro);
  resize();
  renderer.setAnimationLoop(dibujar);
}

function orientarPC() {
  camara.position.set(0,1.20,0);
  camara.rotation.set(pitch,yaw,0,'YXZ');
}
function resize() {
  if (!renderer || renderer.xr.isPresenting) return;
  camara.aspect = innerWidth/Math.max(innerHeight,1);
  camara.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight,false);
}
window.addEventListener('resize',resize);
canvas.addEventListener('webglcontextrestored',()=>{ precalentamiento=null; });

function prepararProgramas() {
  if (precalentamiento) return precalentamiento;
  const inicioMs=performance.now();
  const paralela=renderer.extensions.has('KHR_parallel_shader_compile');
  // En r180 compileAsync recorre scene.traverse para los materiales, incluidos
  // los objetos invisibles y las dos superficies de vídeo. Las luces ya están montadas.
  precalentamiento=perfume.listo.then(()=>{
    if (paralela) return renderer.compileAsync(scene,camara);
    renderer.compile(scene,camara);
    // En drivers sin compilación paralela, leer LINK_STATUS sincroniza los enlaces
    // pendientes una vez, con la sala aún a oscuras y fuera del gesto de entrada.
    const gl=renderer.getContext();
    for (const programa of renderer.info.programs) {
      if (!gl.getProgramParameter(programa.program,gl.LINK_STATUS))
        throw Error('El controlador gráfico no pudo preparar un material de la sala.');
    }
  }).then(()=>{
    if (debug) canvas.dataset.preparacion=JSON.stringify({
      milisegundos:Math.round(performance.now()-inicioMs),
      programas:renderer.info.programs.length,
      compilacionParalela:paralela
    });
  }).catch(error=>{ precalentamiento=null; throw error; });
  return precalentamiento;
}

function informar(texto) {
  $('mensaje').textContent = texto;
  $('mensaje').hidden = false;
}
function actualizarPerfumePC(){
  const datos=perfume?.estado;
  const visible=activo&&!sesion&&datos?.disponible;
  $('perfume-pc').hidden=!visible;
  if(!visible)return;
  const tomado=datos.sujeto==='escritorio';
  $('tomar').hidden=tomado;$('tomar').disabled=datos.volviendo;
  $('pulverizar').hidden=$('dejar').hidden=!tomado;
}
$('tomar').addEventListener('click',()=>perfume?.tomarPC());
$('pulverizar').addEventListener('click',()=>perfume?.pulverizarPC());
$('dejar').addEventListener('click',()=>perfume?.soltarPC());
function empezar() {
  activo = true;
  inicio = previo = encendido = apagado = null;
  intentoHecho = false;
  botones = new WeakMap();
  medidas?.reiniciar();
  bitsProfundidad=null;
  acceso.hidden = true;
  volver.hidden = !!sesion;
  actualizarPerfumePC();
  $('mensaje').hidden = true;
  if (falloVideo && !sesion) informar('Vista de la cantera. El comercial seleccionado está pendiente.');
}

function terminar() {
  intentoPlay++;
  const lectura = medidas?.resumen;
  activo = false;
  perfume?.limpiar();actualizarPerfumePC();
  referenciaBase?.removeEventListener('reset',solicitarRecentrado);
  referenciaBase = null; referenciaPendiente = false; sesion = null;
  proyeccion?.cerrar();
  video.pause();
  if (disponible) video.currentTime = 0;
  acceso.hidden = false; volver.hidden = true; $('mensaje').hidden = true;
  orientarPC(); resize(); estadoAcceso();
  if (lectura) estado.textContent = lectura + ' · '+avisoModo;
}
volver.addEventListener('click',terminar);
function solicitarRecentrado() { referenciaPendiente=true; }

entrar.addEventListener('click',async () => {
  if (ocupado || activo) return;
  ocupado=true; entrar.disabled = true;
  let pedida;
  try {
    // Solicitar XR bajo el gesto, antes de esperar módulos, GPU o promesas de audio.
    if (admiteVR) {
      pedida = navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local'],optionalFeatures:['layers','hand-tracking']});
      pedida.catch(()=>{});
    }
    if (disponible) {
      video.play().catch(()=>{});
      video.pause();
    }
    construir();
    perfume.prepararAudio();
    if (pedida) {
      sesion = await pedida;
      sesion.addEventListener('end',terminar,{once:true});
      sesion.addEventListener('selectstart',ev=>perfume.inicioSeleccion(ev.inputSource));
      sesion.addEventListener('select',ev=>{if(!perfume.consumeSeleccion(ev.inputSource))alternar();});
      await renderer.xr.setSession(sesion);
      renderer.xr.setFoveation(1);
      referenciaBase = renderer.xr.getReferenceSpace();
      referenciaBase.addEventListener('reset',solicitarRecentrado);
      solicitarRecentrado();
      if (sesion.supportedFrameRates && Array.from(sesion.supportedFrameRates).includes(72)) {
        try { await sesion.updateTargetFrameRate(72); } catch { /* Conserva la frecuencia del visor. */ }
      }
    }
    estado.textContent='Preparando la iluminación de la sala…';
    const solicitada=sesion;
    await prepararProgramas();
    if (pedida && (!sesion || sesion!==solicitada)) return;
    empezar();
  } catch (error) {
    const pendiente = sesion || (pedida && await pedida.catch(()=>null));
    if (pendiente) await pendiente.end().catch(()=>{});
    estado.textContent = 'No se pudo abrir la sala. '+(error.message || error.name);
  } finally {
    ocupado=false; entrar.disabled = false;
  }
});

function centrar(frame) {
  const pose = frame.getViewerPose(referenciaBase);
  if (!pose) return;
  const {position:p, orientation:o} = pose.transform;
  const giro = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(o.x,o.y,o.z,o.w),'YXZ').y;
  const transform = new XRRigidTransform({x:p.x,y:p.y-1.2,z:p.z},
    {x:0,y:Math.sin(giro/2),z:0,w:Math.cos(giro/2)});
  const espacio = referenciaBase.getOffsetReferenceSpace(transform);
  renderer.xr.setReferenceSpace(espacio);
  if (pideNitido && disponible) proyeccion.configurarEspacio(sesion,espacio);
  avisoModo = proyeccion.modo;
  referenciaPendiente=false;
}

async function reproducir(reinicia=false) {
  if (!disponible || !activo) return;
  const token = ++intentoPlay;
  if (reinicia || video.ended) video.currentTime = 0;
  apagado = null;
  try {
    await video.play();
    if (token !== intentoPlay) return;
    if (reinicia || encendido === null) encendido = ahora();
  } catch (e) {
    if (e.name !== 'AbortError' && token === intentoPlay)
      informar('Pulsa el gatillo o la barra espaciadora para activar el audio y la reproducción.');
  }
}
function alternar() {
  if (!activo || inicio === null || ahora()-inicio < 3) return;
  if (video.paused) reproducir(video.ended);
  else { intentoPlay++; video.pause(); }
}
window.addEventListener('keydown',ev => {
  if(!activo||sesion||ev.repeat)return;
  if(ev.code==='Space'){ev.preventDefault();alternar();}
  if(ev.code==='KeyE'){ev.preventDefault();if(perfume.estado.sujeto)perfume.soltarPC();else perfume.tomarPC();}
  if(ev.code==='KeyF'){ev.preventDefault();perfume.pulverizarPC();}
});
let puntero=null, anteriorX=0, anteriorY=0, inicioX=0, inicioY=0;
canvas.addEventListener('pointerdown',ev => {
  if (!activo || sesion) return;
  puntero=ev.pointerId; inicioX=anteriorX=ev.clientX; inicioY=anteriorY=ev.clientY;
  canvas.setPointerCapture(puntero);
});
canvas.addEventListener('pointerup',ev=>{
  if(!activo||sesion||puntero!==ev.pointerId||Math.hypot(ev.clientX-inicioX,ev.clientY-inicioY)>5)return;
  if(perfume.estado.sujeto==='escritorio'){perfume.pulverizarPC();return;}
  const r=canvas.getBoundingClientRect(),ndc=new THREE.Vector2((ev.clientX-r.left)/r.width*2-1,1-(ev.clientY-r.top)/r.height*2);
  if(perfume.apuntaPC(ndc))perfume.tomarPC();
});
canvas.addEventListener('pointermove',ev => {
  if (ev.pointerId!==puntero || sesion) return;
  yaw -= (ev.clientX-anteriorX)*0.004;
  pitch = THREE.MathUtils.clamp(pitch-(ev.clientY-anteriorY)*0.004,-1.4,1.4);
  anteriorX=ev.clientX; anteriorY=ev.clientY; orientarPC();
});
canvas.addEventListener('lostpointercapture', () => { puntero=null; });
function controlesXR() {
  for (const fuente of sesion.inputSources) {
    const pad = fuente.gamepad;
    if (!pad || pad.mapping !== 'xr-standard') continue;
    const pulsado = !!pad.buttons[4]?.pressed; // A (derecha) o X (izquierda) en Touch.
    if (pulsado && !botones.get(fuente) && intentoHecho) reproducir(true);
    botones.set(fuente,pulsado);
  }
}

function dibujar(ms, frame) {
  if (!activo) return;
  const t = ms/1000;
  if (frame && referenciaPendiente) {
    centrar(frame);
    if (referenciaPendiente) return;
  }
  if (inicio === null) inicio=previo=t;
  const edad=t-inicio, dt=Math.min(Math.max(t-previo,0),0.25); previo=t;
  negro.material.uniforms.alfa.value = 1-suave(edad/2);
  negro.visible = edad<2;
  if (edad>=3 && !intentoHecho) {intentoHecho=true; reproducir();}
  if (sesion) controlesXR();
  let luz = encendido===null ? 0 : suave(t-encendido);
  if (apagado !== null) luz *= 1-suave(t-apagado);
  const montaje = nivel==='original' || nivel==='final' ? null : tramos || sinTramos;
  const fuente = tiempoFuente(video.currentTime,montaje);
  const epilogo = apagado!==null && video.ended ? Math.max(0,t-apagado) : 0;
  const ambiente = ambienteEn(video.currentTime,montaje,undefined,epilogo);
  const zonas=muestrear(fuente,dt);
  perfume.actualizar(t,frame,sesion?renderer.xr.getReferenceSpace():null);
  if(debug)canvas.dataset.perfume=JSON.stringify(perfume.estado);
  proyeccion.actualizar(luz,zonas.promedio,fuente);
  mundo.actualizar(t,zonas.promedio,luz,ambiente,zonas);
  acabado?.(zonas.promedio,luz);
  renderer.render(scene,camara);
  if (debug && bitsProfundidad===null) {
    const gl = renderer.getContext();
    bitsProfundidad = gl.getParameter(gl.DEPTH_BITS);
  }
  avisoModo = sesion ? proyeccion.modo : pideNitido ? 'Proyección · modo nítido disponible solo en visor' : 'Proyección';
  medidas?.actualizar(ms,renderer.info.render,avisoModo,sesion,video,bitsProfundidad,q.get('post')!=='0',zonas,renderer.info.programs.length);
}
