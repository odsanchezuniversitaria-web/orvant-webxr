import * as T from 'three';

// Cada pulsación conserva su origen y dirección en el mundo cuando la mano gira.
export function crearAtomizador(escena){
  const cantidad=6, porRafaga=95, posiciones=[],semillas=[],lotes=[];
  let semilla=8829;
  const azar=()=>{semilla=(1664525*semilla+1013904223)>>>0;return semilla/4294967296;};
  for(let i=0;i<cantidad*porRafaga;i++){
    posiciones.push(0,0,0);semillas.push(azar(),azar(),azar(),azar());
    lotes.push(Math.floor(i/porRafaga));
  }
  const geo=new T.InstancedBufferGeometry(),plano=new T.PlaneGeometry(1,1);
  geo.index=plano.index;geo.setAttribute('position',plano.attributes.position);geo.setAttribute('uv',plano.attributes.uv);
  geo.setAttribute('semilla',new T.InstancedBufferAttribute(new Float32Array(semillas),4));
  geo.setAttribute('lote',new T.InstancedBufferAttribute(new Float32Array(lotes),1));geo.instanceCount=lotes.length;
  const origenes=Array.from({length:cantidad},()=>new T.Vector3()),direcciones=origenes.map(()=>new T.Vector3());
  const inicios=new Float32Array(cantidad).fill(-100);
  const uniformes={origenes:{value:origenes},direcciones:{value:direcciones},inicios:{value:inicios},reloj:{value:0}};
  const mat=new T.ShaderMaterial({uniforms:uniformes,transparent:true,depthWrite:false,
    vertexShader:`attribute vec4 semilla;attribute float lote;uniform vec3 origenes[6],direcciones[6];
    uniform float inicios[6],reloj;varying vec2 q;varying float alfa,dorada;
    void main(){
      int i=int(lote+.5);float t=reloj-inicios[i]-semilla.x*.086; q=uv*2.-1.;
      float vida=.54+semilla.z*.56; alfa=0.;dorada=semilla.z;
      if(t<=0.||t>=vida){gl_Position=vec4(2.,2.,2.,1.);return;}
      vec3 f=direcciones[i],referencia=abs(f.y)>.88?vec3(1.,0.,0.):vec3(0.,1.,0.);
      vec3 lado=normalize(cross(f,referencia)),alto=cross(lado,f);
      float avance=(1.-exp(-t*3.4))*(.43+.72*semilla.w);
      float radio=sqrt(semilla.y)*avance*(.10+.16*t);
      float angulo=semilla.x*57.22+semilla.w*31.41;
      vec3 p=origenes[i]+f*avance+radio*(lado*cos(angulo)+alto*sin(angulo))+vec3(0.,t*t*.055,0.);
      vec4 v=viewMatrix*vec4(p,1.);float difusa=step(.63,semilla.w);
      float tam=mix(.003+.009*semilla.y,.050+.15*t,difusa);
      v.xy+=position.xy*tam;gl_Position=projectionMatrix*v;
      alfa=smoothstep(0.,.038,t)*(1.-smoothstep(vida*.45,vida,t))*mix(.75,.18,difusa);
    }`,
    fragmentShader:`varying vec2 q;varying float alfa,dorada;
    void main(){float r2=dot(q,q);float a=alfa*exp(-3.*r2)*(1.-smoothstep(.44,1.,r2));
      gl_FragColor=vec4(mix(vec3(.52,.39,.24),vec3(1.,.88,.65),dorada),a);
      #include <colorspace_fragment>
    }`
  });
  const malla=new T.Mesh(geo,mat);malla.renderOrder=58;malla.frustumCulled=false;malla.visible=false;
  malla.name='Perfume · bruma desde la boquilla';escena.add(malla);
  let indice=0, ultimo=-100, audio,ruido;
  function prepararAudio(){
    if(!window.AudioContext)return;
    try{
      if(!audio){
        audio=new AudioContext();
        ruido=audio.createBuffer(1,Math.ceil(audio.sampleRate*.16),audio.sampleRate);
        const canal=ruido.getChannelData(0);for(let i=0;i<canal.length;i++)canal[i]=azar()*2-1;
      }
      if(audio.state==='suspended')audio.resume().catch(()=>{});
    }catch{/* El gesto y la bruma también funcionan en silencio. */}
  }
  function emitir(t,origen,direccion,fuente){
    if(t-ultimo<.19)return false;
    ultimo=t;origenes[indice].copy(origen);direcciones[indice].copy(direccion).normalize();
    inicios[indice]=t;indice=(indice+1)%cantidad;malla.visible=true;
    if(audio?.state==='running'){
      const s=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain(),p=audio.currentTime;
      s.buffer=ruido;f.type='bandpass';f.frequency.setValueAtTime(4300,p);f.frequency.exponentialRampToValueAtTime(2300,p+.14);
      g.gain.setValueAtTime(.001,p);g.gain.linearRampToValueAtTime(.16,p+.018);g.gain.exponentialRampToValueAtTime(.001,p+.15);
      s.connect(f).connect(g).connect(audio.destination);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};s.start();
    }
    const actuador=fuente?.gamepad?.hapticActuators?.[0];
    try{actuador?.pulse?.(.25,42)?.catch?.(()=>{});}catch{/* Vibración opcional de Touch. */}
    return true;
  }
  return {prepararAudio,emitir,actualizar(t){uniformes.reloj.value=t;malla.visible=t-ultimo<1.21;},
    limpiar(){inicios.fill(-100);ultimo=-100;malla.visible=false;}};
}
