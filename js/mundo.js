import * as THREE from 'three';
import { montarCampana } from './campana.js';
import { geometriaBlender, barandasBlender } from './modelo-blender.js';
import { azarEstable, crearMateriales, salida } from './materiales.js';
import { crearLlamas, crearLuzProyector } from './velas.js';
import { ramoDelComercial,detalleDePetalos } from './flores.js';

const FILAS=[-7,-2.4,2.4,7];
const lerp=THREE.MathUtils.lerp;

function mallaReticulas(){
  const pos=[],uv=[],col=[],idx=[];
  function parche(nx,ny,vertice){
    const base=pos.length/3;
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const [x,y,z,u,v,r,g,b]=vertice(i/nx,j/ny);
      pos.push(x,y,z);uv.push(u,v);col.push(r,g,b);
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const a=base+j*(nx+1)+i, b=a+1, c=b+nx+1, d=c-1;
      idx.push(a,b,d,b,c,d);
    }
  }
  function construir(){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    g.setIndex(idx);g.computeVertexNormals();return g;
  }
  return {parche,construir};
}

function cantera(grupo,mat) {
  function luzPiedra(x,y,z,nx,ny) {
    const noche=Math.max(0,ny)*.0016;
    return [.0041+noche*.80,.0035+noche,.0044+noche*1.35];
  }
  const roca=new THREE.Mesh(geometriaBlender('roca',luzPiedra),mat.muro);
  roca.name='Frentes y desprendimientos de mármol · modelo Blender';grupo.add(roca);
  const suelo=mallaReticulas();
  suelo.parche(41,33,(u,v)=>{
    const x=lerp(-22,22,u),z=lerp(16,-26,v);
    return [x,-.012,z,x*.11,z*.11,.005,.004,.0044];
  });
  const piso=new THREE.Mesh(suelo.construir(),mat.piso);piso.name='Piso de cantera con sombras de contacto';grupo.add(piso);
}

function cielo(grupo){
  const c=new THREE.Mesh(new THREE.SphereGeometry(83,22,10),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:{h:{value:new THREE.Color(0x0b1530)},cenit:{value:new THREE.Color(0x020308)}},
    vertexShader:'varying float altura;void main(){altura=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying float altura;uniform vec3 h;uniform vec3 cenit;void main(){gl_FragColor=vec4(mix(h,cenit,smoothstep(0.,.93,altura)),1.); ${salida} }`}));
  c.name='Cielo de la cantera';c.renderOrder=-10;grupo.add(c);
  const azar=azarEstable(909),p=[],b=[];
  for(let i=0;i<400;i++){
    const y=.09+.91*azar(),a=azar()*2*Math.PI,r=Math.sqrt(1-y*y);
    p.push(79*r*Math.cos(a),79*y,79*r*Math.sin(a));b.push(.13+.57*azar()**2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('brillo',new THREE.Float32BufferAttribute(b,1));
  const estrellas=new THREE.Points(g,new THREE.ShaderMaterial({depthWrite:false,transparent:true,
    vertexShader:'attribute float brillo;varying float b;void main(){b=brillo;gl_PointSize=1.+b;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying float b;void main(){gl_FragColor=vec4(.66,.65,.60,b*(1.-smoothstep(.07,.5,length(gl_PointCoord-.5))));${salida}}`}));
  estrellas.name='Estrellas';estrellas.renderOrder=-9;grupo.add(estrellas);
}

// Una malla instanciada por combinación de silueta y material en toda la cantera.
function taller(grupo){
  const lotes=new Map(), objeto=new THREE.Object3D(),color=new THREE.Color(),arriba=new THREE.Vector3(0,1,0);
  function incorporar(nombre,geo,mat,hex){
    if(!lotes.has(nombre))lotes.set(nombre,{geo,mat,matrices:[],colores:[]});
    const lote=lotes.get(nombre);objeto.updateMatrix();lote.matrices.push(objeto.matrix.clone());
    lote.colores.push(color.set(hex).clone());
  }
  function pieza(nombre,geo,mat,hex,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
    objeto.position.set(x,y,z);objeto.scale.set(sx,sy,sz);objeto.rotation.set(rx,ry,rz);
    incorporar(nombre,geo,mat,hex);
  }
  function varilla(nombre,geo,mat,hex,a,b,ancho,grueso=ancho){
    const inicio=new THREE.Vector3(...a),fin=new THREE.Vector3(...b);
    objeto.position.copy(inicio).lerp(fin,.5);fin.sub(inicio);
    objeto.scale.set(ancho,fin.length(),grueso);objeto.quaternion.setFromUnitVectors(arriba,fin.normalize());
    incorporar(nombre,geo,mat,hex);
  }
  function montar(){
    for(const [nombre,{geo,mat,matrices,colores}] of lotes){
      const mesh=new THREE.InstancedMesh(geo,mat,matrices.length);mesh.name=nombre;
      matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,colores[i]);});
      mesh.computeBoundingSphere();grupo.add(mesh);
    }
  }
  return {pieza,varilla,montar};
}

function perfil(anillos,lados){
  const g=new THREE.LatheGeometry(anillos.map(([r,y])=>new THREE.Vector2(r,y)),lados);
  const tonos=anillos.map(a=>new THREE.Color(a[2]??0xffffff)), colores=[];
  for(let i=0;i<g.attributes.position.count;i++){const c=tonos[i%anillos.length];colores.push(c.r,c.g,c.b);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(colores,3));return g;
}

function mantel(){
  const tela=mallaReticulas();
  function vert(x,y,z,sombra){
    const punto=1-.13*Math.exp(-(((z+6.78)/.13)**2));
    const tinte=sombra*punto;
    return [x,y,z,x*.7,z*.7,tinte,tinte*.989,tinte*.973];
  }
  tela.parche(6,35,(u,v)=>vert((u-.5)*1.074,.75+.002*Math.sin(Math.PI*u),(.5-v)*13.974,1));
  for(const signo of [-1,1]){
    tela.parche(82,4,(u,v)=>{
      const z=(.5-u)*14, onda=.58*Math.cos(z*7.6-v*.94)+.29*Math.sin(z*12.2+.72+v*.70)+.13*Math.cos(z*19.1-v);
      const remate=Math.min(1,(7-Math.abs(z))*8);
      const x=signo*(.537+.014*Math.min(1.,v*5.)+remate*v*(.033+onda*.072));
      return vert(x,.75-v*(.672+remate*.036*Math.sin(z*5.6)),z,.75+.25*onda*v);
    });
    tela.parche(12,2,(u,v)=>{
      const x=(u-.5)*1.1,onda=Math.cos(x*17)*.75+Math.sin(x*29)*.25;
      const remate=Math.min(1,(.55-Math.abs(x))*12);
      return vert(x,.75-v*(.672+remate*.020*onda),signo*(6.987+.013*Math.min(1.,v*5.)+v*remate*(.02+onda*.043)),.79+.17*onda*v);
    });
  }
  return tela.construir();
}

function mobiliario(grupo,m,mechasCampana=[]){
  const {pieza,varilla,montar}=taller(grupo),azar=azarEstable(407),llamas=[...mechasCampana];
  const caja=new THREE.BoxGeometry(1,1,1), cilindro=new THREE.CylinderGeometry(.5,.5,1,10);
  const cajaNogal=(hex,...t)=>pieza('Carpintería de nogal',caja,m.nogal,hex,...t);
  const cajaMetal=(hex,...t)=>pieza('Herrajes, barandas y cubiertos',caja,m.metal,hex,...t);
  const cajaTela=(hex,...t)=>pieza('Lonas y terciopelo',caja,m.tela,hex,...t);
  const metal=(hex,...t)=>pieza('Torneados de plata, latón y hierro',cilindro,m.metal,hex,...t);
  const liston=(a,b,t,g)=>varilla('Carpintería de nogal',caja,m.nogal,0x63432f,a,b,t,g);
  const metalFino=(a,b,t,g)=>varilla('Herrajes, barandas y cubiertos',caja,m.metal,0xc5b4a1,a,b,t,g);
  const cilindroCera=new THREE.CylinderGeometry(.5,.5,1,7);
  const cera=(...t)=>pieza('Cera marfil',cilindroCera,m.tela,0xf6e2b9,...t);
  const geoMantel=mantel(),ramo=ramoDelComercial(),ramoLejano=ramoDelComercial(true);
  m.botanica.map=detalleDePetalos();
  const terciopelo=mallaReticulas();
  terciopelo.parche(4,24,(u,v)=>{
    const z=(.5-v)*13.90,tono=[.52,.83,1,.83,.52][Math.round(u*4)];
    return [(u-.5)*.255,.758+.003*Math.sin(v*24)*Math.sin(u*Math.PI),z,u,v,tono,tono*.90,tono*.93];
  });
  const camino=terciopelo.construir();
  const paño=mallaReticulas();
  paño.parche(3,2,(u,v)=>{
    const alto=.003+.013*(1.-Math.abs(u*2-1))+.005*(1-v)*Math.sin(3*u);
    return [(u-.5)*.082,alto,(.5-v)*.161,u,v,.88+.12*u,.85+.11*u,.78+.11*u];
  });
  const servilleta=paño.construir();
  m.mantel.side=THREE.DoubleSide;
  const plato=perfil([[.151,.015,0xa4793f],[.148,.019,0xe4b861],[.135,.018,0xfff6e2],[.087,.008,0xf0e8d8],[.001,.008,0xf8f1e1]],12);
  const copa=perfil([[.001,0],[.035,.003],[.006,.008],[.004,.082],[.027,.092],[.039,.127],[.033,.161]],9);
  const coupe=perfil([[.001,0],[.045,.002],[.044,.006],[.006,.009],[.004,.09],[.016,.10],[.051,.109],[.066,.127],[.070,.145],[.067,.15]],16);
  const votivo=perfil([[.034,.002],[.037,.007],[.043,.076],[.043,.079]],9);
  const florero=perfil([[.001,.002],[.054,.002],[.064,.006],[.062,.010],
    [.027,.016],[.020,.034],[.024,.042],[.040,.047],[.061,.063],
    [.071,.087],[.069,.103],[.065,.109],[.070,.113],[.069,.118],[.061,.117]],14);
  const floreroLejano=perfil([[.055,.003],[.061,.009],[.020,.029],[.027,.045],
    [.060,.064],[.072,.089],[.067,.108],[.071,.117]],8);
  const centroFloral=(x,y,z,escala,angulo)=>{
    const lejos=Math.hypot(x,z)>7.2;
    const copa='Copas de plata de los centros florales';
    pieza(lejos?copa+' · segundo plano':copa,lejos?floreroLejano:florero,m.metal,0xd4c4ae,x,y,z,escala,escala,escala,0,angulo);
    const nombre='Rosas albaricoque y borgoña con ramas de flores blancas';
    pieza(lejos?nombre+' · segundo plano':nombre,lejos?ramoLejano:ramo,m.botanica,0xffffff,x,y,z,escala,escala,escala,0,angulo);
  };
  function vela(x,superficie,z,alta=false){
    if(alta){
      cera(x,superficie+.064,z,.021,.128,.021);
      llamas.push([x,superficie+.138,z,.125]);
    }else{
      pieza('Votivos de cristal',votivo,m.vidrio,0xffffff,x,superficie,z);
      cera(x,superficie+.019,z,.057,.037,.057);
      llamas.push([x,superficie+.059,z,.11]);
    }
  }
  function candelabro(x,z){
    metal(0xc5b9a8,x,.769,z,.091,.028,.091);metal(0xdfd2bc,x,.864,z,.021,.177,.021);
    for(const s of [-1,1]){
      metalFino([x,.862,z],[x,.902,z+s*.094],.012,.013);
      metalFino([x,.902,z+s*.094],[x,.95,z+s*.103],.012,.013);
      metal(0xd0c2af,x,.954,z+s*.103,.04,.019,.04);vela(x,.959,z+s*.103,true);
    }
    metal(0xcab89f,x,.957,z,.043,.017,.043);vela(x,.964,z,true);
  }
  const sillaCantera=geometriaBlender('silla');
  function silla(x,z,signo){
    pieza('Sillas de director · nogal y lona de Blender',sillaCantera,m.silla,0xffffff,x,0,z,1,1,1,0,signo===1?0:Math.PI);
  }
  function puesto(x,z,s){
    const cx=x+s*.316;
    pieza('Porcelana con filete de oro',plato,m.porcelana,0xffffff,cx,.752,z);
    const borgona=Math.round((-z-2.2)/.9)%3===0;
    pieza('Servilletas de lino y borgoña',servilleta,m.mantel,borgona?0x82434e:0xf4e6ce,cx,.774,z,1,1,1,0,s*.52);
    pieza('Copas de mesa',copa,m.vidrio,0xffffff,x+s*.18,.752,z-.192);
    // Dos siluetas especulares legibles a distancia, con punta de cuchillo y pala de tenedor.
    cajaMetal(0xdeceb7,cx,.766,z+s*.178,.187,.006,.015);
    cajaMetal(0xece0c9,cx-s*.121,.767,z+s*.178,.066,.007,.020);
    cajaMetal(0xdeceb7,cx,.766,z-s*.176,.160,.006,.013);
    cajaMetal(0xe5d9c4,cx-s*.106,.766,z-s*.176,.055,.006,.023);
    silla(x+s*.92,z,s);
  }
  for(const x of FILAS){
    pieza('Manteles de lino hasta el piso',geoMantel,m.mantel,0xffffff,x,0,-8.5);
    pieza('Caminos de terciopelo granate',camino,m.mantel,0x814052,x,0,-8.5);
    for(let j=0;j<15;j++){const z=-2.2-.9*j;puesto(x,z,-1);puesto(x,z,1);}
    for(let j=0;j<8;j++){
      centroFloral(x,.763,-2.20-1.8*j,.94+.15*azar(),azar()*Math.PI*2);
    }
    for(let j=0;j<7;j++)candelabro(x,-3.10-1.8*j);
    for(let j=0;j<23;j++)vela(x+(j%2?-.122:.122),.753,-1.93-.60*j);
  }
  // Silla del visitante. La altura virtual de ojos se aplica en el espacio de referencia XR.
  cajaTela(0x611e2a,0,.454,.085,.58,.108,.51);cajaTela(0x531b28,0,.713,.31,.55,.46,.075,-.09);
  for(const s of [-1,1]){
    cajaNogal(0x5c3a29,s*.301,.605,.06,.055,.051,.50);
    liston([s*.242,.015,-.156],[s*.264,.594,-.146],.044,.048);
    liston([s*.249,.015,.299],[s*.264,.91,.343],.043,.048);
  }
  pieza('Mesa auxiliar de mármol',new THREE.CylinderGeometry(.5,.5,1,40),m.mesaMarmol,0xffffff,.75,.635,-.20,.55,.030,.55);
  metal(0x806447,.75,.321,-.20,.042,.593,.042);metal(0x70543a,.75,.027,-.20,.34,.052,.34);
  vela(.831,.65,-.151);pieza('Coupe de champagne',coupe,m.vidrio,0xffffff,.655,.65,-.244);
  centroFloral(.853,.650,-.350,.47,1.18);
  pieza('Champagne en la copa',perfil([[.007,.10],[.051,.11],[.061,.123],[.001,.123]],20),m.liquido,0xffffff,.655,.65,-.244);
  // Los puntos de anclaje vienen del mismo banco de mármol que sostiene cada tramo.
  for(const linea of barandasBlender){
    for(const [x,y,z] of linea)cajaMetal(0x392e28,x,y+.40,z,.055,1.00,.055);
    for(const h of [.48,.91]) for(let i=1;i<linea.length;i++){
      const [x,y,z]=linea[i-1],[a,b,c]=linea[i];
      varilla('Herrajes, barandas y cubiertos',caja,m.metal,0x392e28,[x,y+h,z],[a,b+h,c],.058,.053);
    }
  }
  // Gabinete de proyección y lente, apuntada al muro frontal.
  cajaMetal(0x282320,0,.066,6,.48,.12,.48);metal(0x2a2725,0,1.26,6,.06,2.38,.06);
  cajaMetal(0x342e29,0,2.545,6,.48,.235,.48);metal(0x4d4337,0,2.6,5.745,.118,.086,.118,Math.PI/2);
  metal(0xe3c09a,0,2.60,5.695,.087,.016,.087,Math.PI/2);
  for(let i=0;i<5;i++)cajaMetal(0x141312,.244,2.51+i*.021,6,.007,.008,.228);
  montar();return crearLlamas(grupo,llamas);
}

function medir(grupo){
  let llamadas=0,triangulos=0,puntos=0,instancias=0;
  grupo.traverse(obj=>{
    if(!obj.geometry)return;
    const n=obj.isInstancedMesh?obj.count:obj.geometry.isInstancedBufferGeometry?obj.geometry.instanceCount:1;
    const vertices=obj.geometry.index?.count??obj.geometry.attributes.position.count;
    const material=obj.material;
    const pasadas=material.side===THREE.DoubleSide&&material.transparent&&!material.forceSinglePass?2:1;
    llamadas+=pasadas;instancias+=n;
    if(obj.isPoints)puntos+=vertices*n;else triangulos+=n*vertices/3*pasadas;
  });
  return {porOjo:{llamadas,triangulos,puntos,instancias},estereo:{llamadas:llamadas*2,triangulos:triangulos*2,puntos:puntos*2}};
}

export function crearMundo(escena){
  const grupo=new THREE.Group();grupo.name='La Cantera ORVANT';escena.add(grupo);
  const mats=crearMateriales();
  const mechasCampana=montarCampana(grupo,mats.uniforms);
  cielo(grupo);cantera(grupo,mats);
  const velas=mobiliario(grupo,mats,mechasCampana),proyector=crearLuzProyector(grupo);
  const hemisferica=new THREE.HemisphereLight(0x8294bd,0x76604c,.038);
  const rebote=new THREE.PointLight(0xffffff,0,26,2);rebote.position.set(0,5.2,-16.3);
  const votivo=new THREE.PointLight(0xffbc78,.095,2.6,2);votivo.position.set(.831,.79,-.151);
  grupo.add(hemisferica,rebote,votivo);
  const apagado=new THREE.Color(0,0,0);
  function actualizar(tiempo,color=apagado,intensidad=0,ambiente={},zonas={}){
    const a=THREE.MathUtils.clamp(intensidad,0,1);
    const umbral=THREE.MathUtils.clamp(ambiente?.umbral||0,0,1), sombra=THREE.MathUtils.clamp(ambiente?.sombra||0,0,1);
    const ascua=THREE.MathUtils.clamp(ambiente?.ascua||0,0,1);
    rebote.color.copy(color);rebote.intensity=a*16; mats.uniforms.rebote.value.copy(color).multiplyScalar(a);
    for(const zona of ['izquierda','derecha','arriba','abajo','centro']){
      mats.uniforms[zona].value.copy(zonas?.[zona]||color).multiplyScalar(a);
    }
    const avance=ambiente?.progreso||{};
    mats.uniforms.umbral.value=umbral*a;mats.uniforms.sombra.value=sombra*a;
    mats.uniforms.abrir.value=avance.umbral||0;mats.uniforms.ascua.value=ascua*a;mats.uniforms.recorrido.value=avance.ascua||0;
    votivo.intensity=(.095+.0027*Math.sin(tiempo*1.21)+.0014*Math.sin(tiempo*2.07))*(1+.21*ascua*a);
    velas(tiempo,ascua*a,avance.ascua||0);proyector(tiempo,color,a,(ambiente?.bruma||0)*a,avance.bruma||0,ambiente);
  }
  actualizar(0);
  return {actualizar,presupuesto:()=>medir(grupo),piedraProyeccion:mats.uniforms.rocaReal.value};
}
