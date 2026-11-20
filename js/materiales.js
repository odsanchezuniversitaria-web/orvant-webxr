import * as THREE from 'three';
import { haloSobreMarmol } from './proyeccion.js';

// Los cálculos de luz y las muestras de vídeo comparten el espacio lineal de three.js.
const salida = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
export { salida };

// Luz que incide en un punto de la sala desde una pantalla grande. Los colores son
// los cinco promedios RGB lineales de la película. El ángulo sólido disminuye con
// la distancia y las caras iluminadas conservan la orientación de su superficie.
const luzPantalla = `
  uniform vec3 izquierda,derecha,centro,arriba,abajo;
  vec3 campoPantalla(vec3 w,vec3 n){
    float lado=smoothstep(-4.8,4.8,w.x);
    vec3 costados=mix(izquierda,derecha,lado);
    float altura=smoothstep(1.5,9.1,w.y);
    vec3 vertical=mix(abajo,arriba,altura);
    float lateral=smoothstep(2.,11.,abs(w.x));
    float bordeV=smoothstep(.7,3.6,abs(w.y-5.54));
    vec3 fuente=mix(centro,vertical,.58*bordeV);
    fuente=mix(fuente,costados,.19+.66*lateral);
    vec3 eje=vec3(clamp(w.x,-5.4,5.4),clamp(w.y,2.4,8.),-16.86)-w;
    float r2=dot(eje,eje), incidencia=max(0.,dot(n,eje*inversesqrt(max(r2,.01))));
    return fuente*(.31+.69*incidencia)/(1.+r2*.0095);
  }
`;

// Los ocho tramos por fila comparten dos distancias periódicas. Los índices se
// limitan a los emisores reales para no repetir puntos de luz más allá de las mesas.
const luzVelas = `
  void emisoresMesa(vec3 w,out vec3 candelabro,out vec3 votivo){
    float x=sign(w.x)*(abs(abs(w.x)-2.4)<abs(abs(w.x)-7.)?2.4:7.);
    float ic=clamp(floor((-w.z-3.10)/1.8+.5),0.,6.);
    float iv=clamp(floor((-w.z-1.93)/.60+.5),0.,22.);
    candelabro=vec3(x,1.10,-3.10-1.8*ic)-w;
    votivo=vec3(x+mix(.122,-.122,mod(iv,2.)),.812,-1.93-.60*iv)-w;
  }
  float iluminanciaVela(vec3 l,vec3 n,float radio2){
    float r2=max(dot(l,l),.0001);
    float lambert=max(0.,dot(n,l*inversesqrt(r2)));
    return (.21+.79*lambert)/(1.+r2/radio2);
  }
  vec3 velasEn(vec3 w,vec3 n){
    vec3 c,v;emisoresMesa(w,c,v);
    float banquete=.55*iluminanciaVela(c,n,.16)+.30*iluminanciaVela(v,n,.050);
    vec3 personal=vec3(.831,.709,-.151)-w;
    return vec3(1.,.49,.198)*(banquete+.30*iluminanciaVela(personal,n,.060));
  }
`;
export function azarEstable(semilla = 0x52d8c1) {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(1664525, estado) + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

// Ruido periódico. El atlas se puede repetir sin una junta en medio de un bloque.
function ruido(periodo, azar) {
  const nodos = Float32Array.from({ length: periodo * periodo }, azar);
  const muestra = (x, y) => nodos[((y % periodo + periodo) % periodo) * periodo + (x % periodo + periodo) % periodo];
  return (u, v) => {
    const x = u * periodo, y = v * periodo;
    const i = Math.floor(x), j = Math.floor(y);
    let a = x - i, b = y - j;
    a = a * a * (3 - 2 * a);
    b = b * b * (3 - 2 * b);
    const superior = muestra(i, j) * (1 - a) + muestra(i + 1, j) * a;
    const inferior = muestra(i, j + 1) * (1 - a) + muestra(i + 1, j + 1) * a;
    return superior * (1 - b) + inferior * b;
  };
}

function atlasPiedra() {
  const n = 512, azar = azarEstable(82), bajo = ruido(4, azar), medio = ruido(11, azar), fino = ruido(51, azar);
  const datos = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n, remolino = bajo(u, v), fractura = medio(u, v);
      const onda = 2 * Math.PI * (u - v + .85 * remolino + .14 * fractura);
      const veta = Math.exp(-Math.abs(Math.sin(onda)) * 33);
      const ramal = Math.exp(-Math.abs(Math.sin(onda * 2 + 1.15 * fractura)) * 45);
      const grano = fino(u, v) - .5, corte = Math.sin(v * 2 * Math.PI * 96 + fractura * 1.7);
      const base = 209 + 27 * (remolino - .5) + 19 * (fractura - .5) + 14 * grano + (azar() - .5) * 9;
      const tono = base - 16 * veta - 8 * ramal + corte * 2;
      const i = (y * n + x) * 4;
      datos[i] = tono; datos[i + 1] = tono - 5 - veta * 6; datos[i + 2] = tono - 10 - veta * 4; datos[i + 3] = 255;
    }
  }
  const mapa = new THREE.DataTexture(datos, n, n);
  mapa.wrapS = mapa.wrapT = THREE.RepeatWrapping;
  mapa.colorSpace = THREE.SRGBColorSpace;
  mapa.generateMipmaps = true;
  mapa.minFilter = THREE.LinearMipmapLinearFilter;
  mapa.magFilter = THREE.LinearFilter;
  mapa.anisotropy = 2;
  mapa.needsUpdate = true;
  return mapa;
}

// Reflejos de la cantera a escala de las copas, de la plata y del filo dorado.
// Seis caras de 64 px. El reflejo horizontal claro reproduce las mesas y el cielo.
function entorno() {
  const n = 64;
  const direcciones = [(u,v) => [1,-v,-u], (u,v) => [-1,-v,u], (u,v) => [u,1,v],
    (u,v) => [u,-1,-v], (u,v) => [u,-v,1], (u,v) => [-u,-v,-1]];
  const caras = direcciones.map(direccion => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let [a,b,c] = direccion(2*(x+.5)/n-1, 2*(y+.5)/n-1);
      const largo = Math.hypot(a,b,c); a /= largo; b /= largo; c /= largo;
      const azimut = Math.atan2(c,a), franja = Math.exp(-Math.abs(b+.08)*7);
      const velas = Math.pow(Math.max(0,Math.cos(azimut*9+.6)),18) * Math.exp(-Math.abs(b+.04)*17);
      const cielo = Math.max(0,b);
      const i = (y*n+x)*4;
      img.data[i] = 6+26*franja+191*velas+3*cielo;
      img.data[i+1] = 5+16*franja+131*velas+5*cielo;
      img.data[i+2] = 7+10*franja+66*velas+9*cielo;
      img.data[i+3] = 255;
    }
    ctx.putImageData(img,0,0); return canvas;
  });
  const mapa = new THREE.CubeTexture(caras);
  mapa.colorSpace = THREE.SRGBColorSpace; mapa.needsUpdate = true;
  return mapa;
}

function petalos() {
  const n=128,datos=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const dx=(x+.5-n*.5)/(n*.5),dy=(y+.5-n*.5)/(n*.5);
    const r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
    let tono=.79+.12*(1.-r), limite=0;
    for(let j=0;j<4;j++){
      const lobulos=3+j,curva=.15+j*.215+.050*Math.sin(a*lobulos+j*1.37)+.035*Math.cos(a*(lobulos-1)-j*.72);
      const dist=r-curva;
      tono-=.26*Math.exp(-dist*dist/.0016);
      tono+=.18*Math.exp(-((dist+.050)**2)/.0009);
      limite=curva+.17;
    }
    tono+=.04*Math.sin(a*2.+r*5.);
    const i=(y*n+x)*4,canal=Math.round(255*Math.min(1,Math.max(.3,tono)));
    datos[i]=canal;datos[i+1]=canal;datos[i+2]=canal;datos[i+3]=Math.round(255*THREE.MathUtils.smoothstep(limite-r,0,.05));
  }
  const mapa=new THREE.DataTexture(datos,n,n);
  mapa.colorSpace=THREE.SRGBColorSpace;mapa.generateMipmaps=true;
  mapa.magFilter=THREE.LinearFilter;mapa.minFilter=THREE.LinearMipmapLinearFilter;mapa.needsUpdate=true;
  return mapa;
}

export function crearMateriales() {
  const piedra = atlasPiedra(), reflejo = entorno();
  // Marble Cliff 04, Amal Kumar, Poly Haven, CC0. La copia local conserva el mapa difuso original de 1024 px.
  // https://polyhaven.com/a/marble_cliff_04
  const vetaReal=new THREE.TextureLoader().load(new URL('../texturas/marble_cliff_04_diff_1k.jpg',import.meta.url).href);
  vetaReal.wrapS=vetaReal.wrapT=THREE.RepeatWrapping;vetaReal.colorSpace=THREE.SRGBColorSpace;vetaReal.anisotropy=2;
  const uniforms = { rebote: { value: new THREE.Color(0,0,0) }, piedra: { value: piedra },
    rocaReal:{value:vetaReal},umbral:{value:0}, sombra:{value:0}, abrir:{value:0}, ascua:{value:0}, recorrido:{value:0} };
  for(const nombre of ['izquierda','derecha','arriba','abajo','centro'])uniforms[nombre]={value:new THREE.Color(0,0,0)};
  const vertPiedra = `
    varying vec3 pos; varying vec2 tex; varying vec3 luz;
    void main(){ pos=position; tex=uv; luz=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
  `;
  const muro = new THREE.ShaderMaterial({uniforms,vertexColors:true,vertexShader:`
    attribute float acabado;attribute float oclusion;
    varying vec3 pos;varying vec2 tex;varying vec3 luz;varying vec3 normalRoca;varying vec2 superficie;
    void main(){pos=position;tex=uv;luz=color;normalRoca=normal;superficie=vec2(acabado,oclusion);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,fragmentShader:`
    uniform sampler2D piedra;uniform sampler2D rocaReal;uniform float umbral;uniform float abrir;uniform float sombra;
    ${luzPantalla}
    varying vec3 pos;varying vec2 tex;varying vec3 luz;varying vec3 normalRoca;varying vec2 superficie;
    ${haloSobreMarmol}
    void main(){
      float m=superficie.x, ao=superficie.y;
      vec3 n=normalize(normalRoca);
      vec3 polvo=texture2D(piedra,tex*2.7+vec2(.08,.22)).rgb;
      vec3 escama=texture2D(rocaReal,tex*.87+vec2(.23,.11)).rgb;
      vec3 estrato=texture2D(rocaReal,vec2(tex.x*1.67+.43,tex.y*1.45+.26)).rgb;
      vec3 veteado=mix(escama,estrato,.22);
      float placa=1.-step(.5,m),cuna=step(3.5,m);
      vec3 corte=vec3(.78,.75,.70)*(.64+.48*dot(polvo,vec3(.25,.56,.19)));
      float impurezas=dot(veteado,vec3(.24,.60,.16))-.49;
      corte+=vec3(.26,.24,.22)*impurezas;
      float pn=1.-smoothstep(-13.6,-12.3,pos.z);
      float posterior=smoothstep(9.9,11.1,pos.z);
      float lateral=1.-pn-posterior;lateral=clamp(lateral,0.,1.);
      float rotura=max(0.,(17.+pos.z)*pn+(12.-pos.z)*posterior+(14.-abs(pos.x))*lateral);
      float rasgo=smoothstep(.11,1.05,rotura)*placa;
      float pulido=(1.-smoothstep(6.8,8.2,abs(pos.x)))*pn;
      corte=mix(corte,veteado*vec3(1.41,1.44,1.45),mix(.36,.13,pulido));
      vec3 roca=mix(veteado*vec3(1.26,1.30,1.35),corte,placa*(1.-rasgo));
      roca*=1.+rasgo*.15;
      roca=mix(roca,vec3(.79,.77,.74)*(.64+.58*dot(estrato,vec3(.24,.60,.16))),cuna*.79);
      if(m>1.5&&m<2.5)roca*=.69;
      float frontal=1.-smoothstep(-17.1,-12.5,pos.z);
      float periferia=smoothstep(6.75,10.8,abs(pos.x));
      vec3 ambiente=luz*mix(vec3(1.),vec3(.32,.44,.67),sombra*periferia);
      vec3 zona=mix(izquierda,derecha,smoothstep(-1.5,1.5,pos.x));
      // El movimiento de la reja redistribuye la propia luz de la película.
      float eje=abs(pos.x)-(7.50+5.5*abrir+.10*pos.y);
      float cruzar=exp(-eje*eje*.50)*frontal*periferia;
      ambiente+=zona*umbral*cruzar*.42;
      // Rebote lejano de cuatro hileras de velas bajo la roca. Se extingue en altura.
      float distanciaMesa=max(abs(pos.x)-7.,0.);
      float fila=smoothstep(-17.,-13.,pos.z)*(1.-smoothstep(-2.2,.4,pos.z));
      ambiente+=vec3(.038,.016,.005)*fila*exp(-.38*distanciaMesa-.55*max(pos.y-.85,0.));
      vec2 fuera=max(abs(pos.xy-vec2(0.,5.5375))-vec2(7.,3.9375),0.);
      float separacion2=dot(fuera,fuera);
      float caidaLateral=1./(1.+.032*separacion2);
      vec3 rebotada=campoPantalla(pos,n)*(.33+.15*periferia)*caidaLateral;
      vec3 halo=haloSobreMarmol(pos,dot(estrato,vec3(.21,.72,.07)),izquierda,derecha,arriba,abajo);
      vec3 col=roca*(ambiente+rebotada+halo)*ao;
      col=mix(col,vec3(.004,.005,.010),1.-exp(-.000027*dot(pos,pos)));
      gl_FragColor=vec4(col,1.); ${salida}
    }` });
  const piso = new THREE.ShaderMaterial({uniforms,vertexColors:true,vertexShader:vertPiedra,fragmentShader:`
    uniform sampler2D piedra;uniform sampler2D rocaReal;uniform float sombra; varying vec2 tex; varying vec3 luz; varying vec3 pos;
    ${luzPantalla}
    ${luzVelas}
    void main(){
      float d=min(abs(abs(pos.x)-2.4),abs(abs(pos.x)-7.));
      float largo=smoothstep(0.,.65, min(-1.22-pos.z,pos.z+15.85));
      float oclusion=1.-.75*exp(-d*d*1.15)*largo;
      float silla=abs(d-.92), fila=mod(-pos.z-2.2+.45,.9)-.45;
      float pieX=silla-.204,pieZ=abs(fila)-.213;
      oclusion*=1.-.36*exp(-silla*silla*7.3-fila*fila*11.8)*largo;
      oclusion*=1.-.65*exp(-pieX*pieX*175.-pieZ*pieZ*189.)*largo;
      oclusion*=1.-.53*exp(-dot(pos.xz,pos.xz)*3.);
      vec2 aux=pos.xz-vec2(.75,-.20);oclusion*=1.-.58*exp(-dot(aux,aux)*17.);
      float grano=dot(texture2D(rocaReal,tex*7.3+vec2(.41,.79)).rgb,vec3(.21,.72,.07));
      vec3 arena=mix(vec3(.68,.62,.54),texture2D(piedra,tex*2.15).rgb,.25)*(.86+.21*grano);
      vec3 arribaSuelo=vec3(0.,1.,0.);
      vec3 col=arena*(luz*(1.-.30*sombra)+velasEn(pos,arribaSuelo)*.71+
          campoPantalla(pos,arribaSuelo)*.74)*oclusion;
      gl_FragColor=vec4(col,1.); ${salida}
    }`});

  function estandar(opciones={}) {
    const mat=new THREE.MeshStandardMaterial({roughness:.85,envMap:reflejo,envMapIntensity:.65,...opciones});
    mat.onBeforeCompile = shader => {
      for(const zona of ['izquierda','derecha','arriba','abajo','centro']) shader.uniforms[zona]=uniforms[zona];
      Object.assign(shader.uniforms,{uAscua:uniforms.ascua,uAvance:uniforms.recorrido,uPenumbra:uniforms.sombra});
      shader.vertexShader='varying vec3 posicionCantera;\n'+shader.vertexShader.replace('#include <project_vertex>',`
        #include <project_vertex>
        vec4 localCantera=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          localCantera=instanceMatrix*localCantera;
        #endif
        posicionCantera=(modelMatrix*localCantera).xyz;
      `);
      shader.fragmentShader=luzPantalla+luzVelas+'varying vec3 posicionCantera;uniform float uAscua,uAvance,uPenumbra;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`
        #include <lights_fragment_end>
        vec3 w=posicionCantera;
        float enMesa=smoothstep(-.1,.4,min(-1.45-w.z,w.z+15.52));
        vec3 nw=inverseTransformDirection(normal,viewMatrix);
        vec3 velas=velasEn(w,nw);
        float distEco=w.z-mix(-15.4,-1.0,smoothstep(0.,.81,uAvance));
        vec3 regional=campoPantalla(w,nw);
        vec3 brindar=(velas*.50+regional*.72)*exp(-distEco*distEco*.26)*uAscua*enMesa;
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*(velas*(1.-uPenumbra*.16)+regional*.84+brindar);
      `);
    };
    return mat;
  }
  // Luz rasante por posición de los candelabros. En un faldón importa
  // la orientación de cada pliegue; en el nogal pulido se lee el filo especular.
  function materialBanquete(tipo){
    const madera=tipo==='silla';
    const v=`
      ${madera?'attribute float acabado;':''}
      varying vec3 w,local,n,base; varying float pieza;
      void main(){
        local=position;w=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
        n=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
        base=color;
        #ifdef USE_INSTANCING_COLOR
          base*=instanceColor;
        #endif
        pieza=${madera?'acabado':'0.'};
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
      }`;
    const f=`
      uniform sampler2D piedra;uniform float sombra,ascua,recorrido;
      ${luzPantalla}
      ${luzVelas}
      varying vec3 w,local,n,base; varying float pieza;
      void main(){
        vec3 N=normalize(n);if(!gl_FrontFacing)N=-N;
        vec3 V=normalize(cameraPosition-w);
        vec3 candelabro,votivo;emisoresMesa(w,candelabro,votivo);
        float r2=dot(candelabro,candelabro);
        vec3 L=candelabro*inversesqrt(max(.0001,r2)),H=normalize(L+V);
        float ndv=abs(dot(N,V));
        float alto=smoothstep(.12,.76,w.y);
        float zona=1./(1.+r2/.14);
        vec3 regio=campoPantalla(w,N);
        vec3 ilumVela=vec3(1.,.49,.20)*(.55*iluminanciaVela(candelabro,N,.16)+.30*iluminanciaVela(votivo,N,.05));
        float zEco=w.z-mix(-15.2,-.4,smoothstep(0.,.82,recorrido));
        float eco=ascua*exp(-zEco*zEco*.32);
        float lados=.25+.75*max(0.,dot(N,normalize(vec3(sign(w.x)*.54,.72,-.50))));
        vec3 colorFinal;
        ${tipo==='lino'?`
          // Tejido iridiscente de muy baja amplitud. La trama se apaga antes de que submuestree.
          vec2 uvT=vec2(local.z+local.x*.63,local.y+local.x*.84);
          vec2 h=uvT*vec2(159.,133.);
          float vis=1.-smoothstep(.14,.52,max(fwidth(h.x),fwidth(h.y)));
          float seda=1.+.024*(cos(h.x*6.283)+sin(h.y*6.283))*.5*vis;
          float hilo=(w.y-.712)/.039,franja=exp(-hilo*hilo);
          float pliegue=.66+.34*max(0.,dot(N,normalize(vec3(sign(w.x)*.72,.38,-.66))));
          float oclusion=mix(.29,1.,alto)*mix(pliegue,1.,max(0.,N.y));
          float faldon=1.-max(0.,N.y);
          float luzPliegue=.55+.45*cos(local.z*7.6-(.75-w.y)*1.4);
          vec3 ambiente=(vec3(.005,.004,.004)*(.35+.53*lados+.25*max(0.,N.y))+regio*.78)*oclusion*(1.-.22*sombra);
          vec3 foco=ilumVela*(.75+.25*luzPliegue*faldon);
          // Sobrehilado ancho y mate en el canto de la caída, visible a escala del visor.
          float orillo=franja*.16*(.25+max(0.,dot(N,normalize(vec3(-.3,.67,.49)))));
          float lustre=pow(max(0.,dot(N,H)),12.)*.12*zona;
          colorFinal=base*vec3(.92,.89,.84)*(ambiente+foco+(regio*.63+foco*.46)*eco)*seda+
                     vec3(1.,.68,.41)*lustre+(regio+foco)*orillo;
        `:`
          float lona=1.-step(.4,abs(pieza-6.)),laton=step(6.5,pieza);
          vec2 gr=vec2(local.y*.43+local.x*.41,local.z*6.+local.x*4.5);
          float fibra=texture2D(piedra,gr).g;
          float veta=mix(.64+.43*fibra,1.,lona+laton);
          float oclusion=.45+.55*smoothstep(.05,.73,w.y);
          vec3 ambiente=(vec3(.007,.006,.006)*(.29+.83*lados)+regio*.82)*oclusion*(1.-.20*sombra);
          vec3 foco=ilumVela;
          float reflejo=pow(max(0.,dot(N,H)),mix(11.,38.,laton))*(.10+.38*laton)*zona;
          float canto=pow(1.-ndv,3.)*(.043+.046*laton)*lados;
          colorFinal=base*(ambiente+foco+(regio*.52+foco*.42)*eco)*veta+vec3(.91,.64,.39)*reflejo+(regio+foco)*canto;
        `}
        gl_FragColor=vec4(colorFinal,1.);${salida}
      }`;
    return new THREE.ShaderMaterial({uniforms,vertexColors:true,side:THREE.DoubleSide,vertexShader:v,fragmentShader:f});
  }
  const nogal = estandar({color:0xffffff,roughness:.64});
  const tela = estandar({color:0xffffff,roughness:1});
  const silla = materialBanquete('silla');
  const metal = estandar({color:0xffffff,metalness:.65,roughness:.32,envMapIntensity:1.25});
  const porcelana = estandar({vertexColors:true,roughness:.28,metalness:.15});
  const flor = estandar({map:petalos(),alphaTest:.43,roughness:.94,side:THREE.DoubleSide});
  const follaje = estandar({side:THREE.DoubleSide,roughness:.76});
  const botanica = estandar({vertexColors:true,side:THREE.DoubleSide,roughness:.91});
  const mantel = materialBanquete('lino');
  // Baños de luz y pliegues en el lino se precalculan en el color de los vértices.
  const vidrio = new THREE.ShaderMaterial({uniforms:{...uniforms,entorno:{value:reflejo}},transparent:true,depthWrite:false,
    vertexShader:`varying vec3 w; varying vec3 n;
      void main(){ vec4 p=instanceMatrix*vec4(position,1.); w=(modelMatrix*p).xyz;
        n=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*vec4(w,1.); }`,
    fragmentShader:`uniform samplerCube entorno; uniform float ascua; uniform float recorrido; varying vec3 w; varying vec3 n;
      ${luzPantalla}
      void main(){ vec3 v=normalize(cameraPosition-w), norm=normalize(n);
        float f=pow(1.-abs(dot(v,norm)),2.2); vec3 r=textureCube(entorno,reflect(-v,norm)).rgb;
        float d=w.z-mix(-15.,-.23,smoothstep(0.,.81,recorrido));
        float eco=ascua*exp(-d*d*.44)*smoothstep(.1,.60,abs(w.x))*(1.-smoothstep(7.3,8.,abs(w.x)));
        float ribete=pow(1.-abs(dot(v,norm)),1.3);
        vec3 regional=campoPantalla(w,norm);
        vec3 radiancia=vec3(.022,.010,.004)+r*1.1+regional*(.40+2.2*ribete);
        gl_FragColor=vec4(radiancia+eco*(.25+ribete)*(r+regional+vec3(.22,.09,.018)),.09+.66*f+.11*eco); ${salida} }`});
  const mesaMarmol = estandar({map:piedra,color:0xe9d4b9,metalness:.08,roughness:.44});
  const liquido = estandar({color:0xe7bc76,metalness:.18,roughness:.16,transparent:true,opacity:.64,depthWrite:false});
  return {uniforms,muro,piso,nogal,tela,silla,metal,porcelana,flor,follaje,botanica,mantel,vidrio,mesaMarmol,liquido};
}
