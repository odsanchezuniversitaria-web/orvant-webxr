import * as THREE from 'three';

export const PANTALLA = Object.freeze({ ancho: 14, alto: 7.875, y: 5.5375, z: -16.86 });

// Óptica en metros de una sola abertura con radio constante y penumbra simétrica.
// El mármol modula la luz que recibe, nunca la silueta del fotograma.
const huellaOptica = `
  float huellaOptica(vec2 p){
    const float radio=.34;
    vec2 q=abs(p)-(vec2(7.,3.9375)-radio);
    return length(max(q,0.))+min(max(q.x,q.y),0.)-radio;
  }
`;

// Irradiancia sobre las caras reales del mármol. No usa un plano translúcido paralelo al muro.
export const haloSobreMarmol = `
  ${huellaOptica}
  vec3 haloSobreMarmol(vec3 p,float veta,vec3 izq,vec3 der,vec3 arriba,vec3 abajo){
    vec2 local=p.xy-vec2(0.,5.5375);
    vec2 q=abs(local)-vec2(7.,3.9375);
    float recta=max(q.x,q.y);
    if (p.z>=-13.5 || recta>6.5 || recta<-.64) return vec3(0.);
    float d=huellaOptica(local);
    float distancia=max(0.,d);
    float piel=smoothstep(-.60,-.04,d)*(1.-smoothstep(4.8,6.5,distancia));
    float frente=1.-smoothstep(-16.7,-13.5,p.z);
    float horizontal=smoothstep(-1.8,1.8,q.x-q.y);
    vec3 costado=mix(izq,der,smoothstep(-3.,3.,local.x));
    vec3 vertical=mix(abajo,arriba,smoothstep(-2.,2.,local.y));
    float dispersion=(.62*exp(-distancia*.51)+.38*exp(-distancia*1.9))*
                     mix(1.,.58,smoothstep(1.25,3.8,distancia));
    return mix(vertical,costado,horizontal)*dispersion*piel*frente*(.95+.10*veta);
  }
`;

const vertice = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmento = `
  uniform sampler2D pelicula;
  uniform sampler2D roca;
  uniform float ojo;
  uniform float fraccion;
  uniform vec2 texel;
  uniform float intensidad;
  uniform float negros;
  uniform vec2 fileteFuente;
  varying vec2 vUv;
  #include <common>
  ${huellaOptica}
  vec3 muestra(vec2 uv, vec2 d) {
    vec2 limite = texel * 0.5;
    float x0 = ojo*(1.0-fraccion);
    vec2 pos = clamp(uv+d, vec2(x0,0.)+limite, vec2(x0+fraccion,1.)-limite);
    return texture2D(pelicula, pos).rgb;
  }
  void main() {
    vec2 uv = vec2(vUv.x*fraccion+ojo*(1.0-fraccion), vUv.y);
    vec2 d = clamp(fwidth(uv)*0.25, texel*0.2, texel*2.0);
    vec3 srgb = (muestra(uv,d) + muestra(uv,-d) +
                 muestra(uv,vec2(-d.x,d.y)) + muestra(uv,vec2(d.x,-d.y))) * 0.25;
    // En dos planos con filete gris registrado, extender solo el margen mate.
    // Las coordenadas de toda la imagen activa se mantienen en su sitio.
    vec2 interior=clamp(vUv,fileteFuente,1.-fileteFuente);
    if(any(notEqual(interior,vUv))){
      float pico=max(max(srgb.r,srgb.g),srgb.b),fondo=min(min(srgb.r,srgb.g),srgb.b);
      float gris=(1.-smoothstep(.034,.082,pico-fondo))*(1.-smoothstep(.15,.23,pico));
      vec3 prolongacion=muestra(uv,(interior-vUv)*vec2(fraccion,1.));
      srgb=mix(srgb,prolongacion,gris);
    }
    float emision=mix(negros,1.,smoothstep(.015,.11,max(max(srgb.r,srgb.g),srgb.b)));
    vec2 r = vUv * 2.0 - 1.0;
    float centro = 1.0 - 0.12 * smoothstep(0.0,1.0,length(r));
    vec2 p=(vUv-.5)*vec2(14.,7.875);
    float piedra=dot(texture2D(roca,p*.174+vec2(.38,.48)).rgb,vec3(.21,.72,.07));
    srgb=(vec3(.018)+srgb*.982)*centro*mix(.971,1.,clamp(piedra*1.8,0.,1.));
    float distancia=huellaOptica(p);
    float penumbra=max(.12,1.4*fwidth(distancia));
    float borde=1.-smoothstep(-penumbra,0.,distancia);
    gl_FragColor = vec4(sRGBTransferEOTF(vec4(srgb,1.)).rgb, borde*intensidad*emision);
    #include <colorspace_fragment>
  }
`;

export function crearProyeccion(scene, video, mono, roca) {
  const textura = new THREE.VideoTexture(video);
  // El shader trabaja sobre muestras de vídeo codificadas y convierte una sola vez al final.
  textura.colorSpace = THREE.NoColorSpace;
  const texel = new THREE.Vector2(1/3840, 1/1080);
  video.addEventListener('loadedmetadata', () => texel.set(1/video.videoWidth, 1/video.videoHeight));
  if (video.videoWidth) texel.set(1/video.videoWidth, 1/video.videoHeight);
  const intensidad = { value: 0 };
  const negros={value:1},fileteFuente={value:new THREE.Vector2()};
  const geometria = new THREE.PlaneGeometry(PANTALLA.ancho, PANTALLA.alto);
  const planos = [0,1].map(ojo => {
    const material = new THREE.ShaderMaterial({
      uniforms: { pelicula: {value: textura}, roca:{value:roca || null}, ojo: {value: ojo}, fraccion: {value: mono?1:0.5}, texel: {value: texel}, intensidad, negros, fileteFuente },
      vertexShader: vertice, fragmentShader: fragmento,
      transparent: true, depthWrite: false, toneMapped: false
    });
    const plano = new THREE.Mesh(geometria, material);
    plano.position.set(0,PANTALLA.y,PANTALLA.z);
    plano.layers.set(ojo+1);
    plano.renderOrder = 40;
    scene.add(plano);
    return plano;
  });

  let media = null;
  let detalle = 'Proyección';
  let productoEnMano = false;
  let sesionMedia = null, capasMundo = [], aceptaOpacidad = false, solicitada = false;
  function componer(mostrar) {
    if (solicitada === mostrar) return;
    sesionMedia.updateRenderState({layers: mostrar ? [...capasMundo,media] : capasMundo});
    solicitada = mostrar;
  }
  function quitarMedia() {
    if (!media) return;
    try { componer(false); } catch { /* La sesión puede haber terminado. */ }
    try { media.destroy?.(); } catch { /* La sesión ya liberó la capa. */ }
    media = null;
    sesionMedia = null; capasMundo = []; solicitada = false; aceptaOpacidad = false;
  }

  function iniciarMedia(sesion, espacio) {
    try {
      const capas = sesion.renderState.layers;
      if (!globalThis.XRMediaBinding || !capas?.length) throw Error('capas de vídeo no disponibles');
      sesionMedia = sesion;
      capasMundo = Array.from(capas);
      media = new XRMediaBinding(sesion).createQuadLayer(video, {
        space: espacio, layout: mono ? 'mono' : 'stereo-left-right',
        transform: new XRRigidTransform({x:0,y:PANTALLA.y,z:PANTALLA.z}),
        width: PANTALLA.ancho, height: PANTALLA.alto
      });
      if ('opacity' in media) {
        try {
          media.opacity = 0.5;
          aceptaOpacidad = Math.abs(media.opacity-0.5)<0.01;
          if (aceptaOpacidad) media.opacity = intensidad.value;
        } catch { aceptaOpacidad = false; }
      }
      // Algunos visores admiten el vídeo nativo pero no el fundido de la capa.
      // En esos equipos, se inserta sobre el mundo solo durante la imagen estable.
      if (aceptaOpacidad) componer(true);
      detalle = 'Nítido · capa de vídeo';
    } catch (err) {
      quitarMedia();
      detalle = 'Proyección · ' + (err.message || 'capa no disponible');
    }
    return detalle;
  }

  return {
    configurarEspacio(sesion, espacio) {
      if (!media) iniciarMedia(sesion, espacio);
      else {
        try { media.space = espacio; }
        catch { quitarMedia(); detalle = 'Proyección · recentrado de la capa no disponible'; }
      }
    },
    cerrar() { quitarMedia(); detalle = 'Proyección'; },
    get modo() {
      if(media && productoEnMano)return 'Proyección · frasco en mano';
      return media && !aceptaOpacidad && intensidad.value>0 && intensidad.value<0.9999
        ? 'Nítido · transición en proyección' : detalle;
    },
    actualizar(valor,promedio,fuente=mono?video.currentTime:null,primerPlano=false) {
      intensidad.value = valor;
      productoEnMano=primerPlano;
      negros.value=promedio?THREE.MathUtils.smoothstep(.2126*promedio.r+.7152*promedio.g+.0722*promedio.b,.001,.013):1;
      const margen=fileteFuente.value;
      if(fuente>=292/30 && fuente<345/30)margen.set(.055,.012);
      else if(fuente>=746/30 && fuente<806/30)margen.set(.012,.030);
      else margen.set(0,0);
      let mostrarEnMuro = true;
      if (media) {
        try {
          if (aceptaOpacidad) media.opacity = valor;
          // La capa nativa no comparte el búfer de profundidad con la mano.
          // Al coger el frasco, el mismo fotograma SBS pasa a la malla del muro.
          componer(!primerPlano && (aceptaOpacidad || valor>=0.9999));
          // El cambio de composición queda activo en la siguiente imagen XR.
          // Nunca dibujar los dos núcleos en un mismo ojo durante el traspaso.
          mostrarEnMuro = !sesionMedia.renderState.layers?.includes(media);
        } catch {
          quitarMedia();
          detalle = 'Proyección · capa de vídeo no disponible';
        }
      }
      planos.forEach(plano => { plano.visible = mostrarEnMuro && valor > 0.001; });
    }
  };
}
