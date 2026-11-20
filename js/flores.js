import * as THREE from 'three';
import { azarEstable } from './materiales.js';

export function detalleDePetalos(){
  const textura=new THREE.TextureLoader().load(new URL('../texturas/petalos_brindis.png',import.meta.url).href);
  textura.colorSpace=THREE.SRGBColorSpace;
  return textura;
}

// Centro de la mesa del brindis (23,87 s) con las pequeñas flores de la bandeja (12,40 s).
// Los pétalos, tallos y hojas comparten una malla opaca instanciada para las cuatro mesas.
export function ramoDelComercial(simplificado=false) {
  const posiciones=[],colores=[],indices=[],uv=[];
  const azar=azarEstable(734), arriba=new THREE.Vector3(0,1,0), vuelta=2*Math.PI;
  const vector=(x,y,z)=>new THREE.Vector3(x,y,z);
  function punto(p,c,luz=1){
    const indice=posiciones.length/3;
    posiciones.push(p.x,p.y,p.z);colores.push(c.r*luz,c.g*luz,c.b*luz);
    uv.push(.75,.5);
    return indice;
  }
  function tallo(a,b,radio,tono){
    const direccion=new THREE.Vector3().subVectors(b,a).normalize();
    const lateral=vector(0,0,1).cross(direccion).normalize().multiplyScalar(radio);
    const otro=lateral.clone().cross(direccion);
    const base=posiciones.length/3;
    for(let i=0;i<3;i++){
      const ang=i*vuelta/3,orla=lateral.clone().multiplyScalar(Math.cos(ang)).addScaledVector(otro,Math.sin(ang));
      punto(a.clone().add(orla),tono,.76);punto(b.clone().addScaledVector(orla,.72),tono,.93);
    }
    for(let i=0;i<3;i++){
      const ini=base+2*i,fin=base+2*((i+1)%3);
      indices.push(ini,fin,ini+1,fin,fin+1,ini+1);
    }
  }
  function hoja(a,angulo,largo,ancho,caida,tono){
    const largoHoja=vector(Math.cos(angulo)*largo,caida,Math.sin(angulo)*largo);
    const borde=vector(-Math.sin(angulo)*ancho,.002,Math.cos(angulo)*ancho);
    const medio=a.clone().addScaledVector(largoHoja,.48);
    medio.y+=largo*.19;
    const b=posiciones.length/3;
    punto(a,tono,.68);punto(medio.clone().sub(borde),tono,.84);
    punto(medio.clone().addScaledVector(arriba,ancho*.3),tono,1.22);
    punto(medio.clone().add(borde),tono,.98);punto(a.clone().add(largoHoja),tono,.82);
    const distal=a.clone().addScaledVector(largoHoja,.76);
    distal.y+=largo*.086;
    punto(distal.clone().addScaledVector(borde,-.68),tono,.82);
    punto(distal.clone().addScaledVector(borde,.67),tono,.91);
    indices.push(b,b+2,b+1,b,b+3,b+2,b+1,b+2,b+5,b+5,b+2,b+4,b+2,b+3,b+6,b+2,b+6,b+4);
  }
  const verdes=[0x596443,0x6c7148,0x697348,0x4f6242].map(hex=>new THREE.Color(hex));
  const verdeTallo=new THREE.Color(0x788156),rama=new THREE.Color(0x8e7454);
  const rosaClara=[0xefab85,0xffbe94,0xffcb9f,0xffdab4].map(hex=>new THREE.Color(hex));
  const rosaMarfil=[0xf5d2aa,0xffdfbf,0xffebcd,0xffe1bb].map(hex=>new THREE.Color(hex));
  const rosaTinta=[0x9e2846,0xb53252,0xbd3c56,0x8c213e].map(hex=>new THREE.Color(hex));
  function roseta(centro,normal,radio,paleta){
    const giro=new THREE.Quaternion().setFromUnitVectors(arriba,normal.clone().normalize());
    const polar=(r,a,h)=>vector(Math.cos(a)*r,h,Math.sin(a)*r).multiplyScalar(radio).applyQuaternion(giro).add(centro);
    const primerVertice=posiciones.length/3;
    // Una corola cerrada conserva volumen desde abajo entre los pétalos. La superficie
    // recibe el dibujo de una rosa albaricoque del propio fotograma del brindis.
    const pie=punto(polar(0,0,-.49),paleta[0],.48);
    const cresta=punto(polar(0,0,.19),paleta[1],.89);
    const lados=simplificado?7:12,anillo=posiciones.length/3;
    for(let k=0;k<lados;k++){
      const a=vuelta*k/lados;
      punto(polar(.76,a,-.035+.075*Math.cos(3*a)),paleta[k%4],.86);
    }
    for(let k=0;k<lados;k++){
      const lado=anillo+k,otro=anillo+(k+1)%lados;
      indices.push(pie,lado,otro,cresta,otro,lado);
    }
    // Cada pétalo sube desde su base oscura, se ondula en el labio y se recoge hacia el centro.
    const capas=[
      {n:6,interior:.14,exterior:1,raiz:-.33,altura:.17},
      {n:5,interior:.07,exterior:.74,raiz:-.16,altura:.38},
      {n:4,interior:.025,exterior:.46,raiz:.00,altura:.52},
      {n:3,interior:.014,exterior:.235,raiz:.17,altura:.56}
    ];
    for(let j=0;j<capas.length;j++){
      if(simplificado && (j===1||j===3))continue;
      const capa=capas[j],fase=j*2.24+azar()*.3;
      for(let k=0;k<capa.n;k++){
        const a=fase+k*vuelta/capa.n,ancho=(Math.PI/capa.n)*1.29;
        const r=capa.exterior*(.91+.11*azar()),h=capa.altura+azar()*.13;
        const c=paleta[(k+j)%paleta.length],b=posiciones.length/3;
        if(simplificado){
          punto(polar(capa.interior,a,capa.raiz),c,.48);
          punto(polar(r*.82,a-ancho*.90,h-.15),c,.82);
          punto(polar(r,a,h+.07),c,1.06);
          punto(polar(r*.89,a+ancho*.72,h-.08),c,.91);
          indices.push(b,b+2,b+1,b,b+3,b+2);
          continue;
        }
        punto(polar(capa.interior,a-ancho*.39,capa.raiz),c,.41);
        punto(polar(capa.interior,a+ancho*.36,capa.raiz+.02),c,.57);
        punto(polar(r*.81,a-ancho*.94,h-.19),c,.78);
        punto(polar(r*.60,a,h-.22),c,.80);
        punto(polar(r*.83,a+ancho*.91,h-.21),c,.92);
        punto(polar(r*.91,a-ancho*.75,h-.036),c,.99);
        punto(polar(r,a+.05,h+.04),c,1.07);
        punto(polar(r*.91,a+ancho*.70,h-.058),c,.95);
        punto(polar(r*.98,a-ancho*.38,h+.027),c,1.04);
        punto(polar(r*.98,a+ancho*.38,h+.013),c,1.02);
        indices.push(b,b+1,b+3,b,b+3,b+2,b+1,b+4,b+3,b+2,b+3,b+5,
          b+3,b+8,b+5,b+3,b+6,b+8,b+3,b+4,b+6,b+4,b+9,b+6,b+4,b+7,b+9);
      }
    }
    const inversa=giro.clone().invert(),p=vector(0,0,0);
    for(let i=primerVertice;i<posiciones.length/3;i++){
      p.fromArray(posiciones,3*i).sub(centro).applyQuaternion(inversa);
      uv[2*i]=.248+.234*THREE.MathUtils.clamp(p.x/radio,-1.,1.);
      uv[2*i+1]=.502+.462*THREE.MathUtils.clamp(p.z/radio,-1.,1.);
    }
  }
  // Las flores inclinan la corola hacia las sillas, a diferentes alturas como en el plano.
  const flores=[
    [ .005,.300,-.010, .26,.95, .22,.056,rosaClara],
    [-.092,.235, .058,-.69,.45, .62,.051,rosaClara],
    [ .087,.229,-.074, .64,.50,-.71,.048,rosaMarfil],
    [ .088,.261, .061, .62,.36, .69,.044,rosaTinta],
    [-.091,.260,-.058,-.72,.44,-.57,.046,rosaTinta],
    [-.038,.184, .105,-.27,.26, .92,.040,rosaTinta],
    [ .016,.199,-.119, .10,.34,-.94,.039,rosaClara],
  ];
  for(const [x,y,z,nx,ny,nz,r,paleta] of flores){
    const fin=vector(x,y,z),base=vector(x*.19,.078,z*.19);
    tallo(base,fin,.0032,verdeTallo);
    roseta(fin,vector(nx,ny,nz),r,paleta);
    const a=Math.atan2(z,x);
    for(let i=0;i<2;i++){
      hoja(base.clone().lerp(fin,.46+i*.17),a+(i?1:-1)*.84,.077,.020,-.017,verdes[(i+Math.floor(azar()*4))%4]);
    }
  }
  const marfil=new THREE.Color(0xfff1d9),pistilo=new THREE.Color(0xddb65d);
  function florBlanca(centro,normal,r){
    const giro=new THREE.Quaternion().setFromUnitVectors(arriba,normal.clone().normalize());
    const borde=(a,radio,h)=>vector(Math.cos(a)*radio,h,Math.sin(a)*radio).multiplyScalar(r).applyQuaternion(giro).add(centro);
    const base=punto(centro,pistilo,.86),fase=azar()*vuelta;
    for(let i=0;i<5;i++){
      const a=fase+i*vuelta/5,k=posiciones.length/3;
      punto(borde(a-.42,.76,.15),marfil,.91);
      if(simplificado){
        punto(borde(a+.26,1,.25),marfil,1.01);
        indices.push(base,k+1,k);
        continue;
      }
      punto(borde(a-.20,.98,.22),marfil,1.04);
      punto(borde(a+.14,1.01,.26),marfil,1.03);
      punto(borde(a+.40,.74,.18),marfil,.98);
      indices.push(base,k+1,k,base,k+2,k+1,base,k+3,k+2);
    }
  }
  // Ramitas abiertas en dos orientaciones, con racimos de cinco pétalos y brotes de verde.
  for(let i=0;i<4;i++){
    const a=i*vuelta/4+.26,longitud=.117+.041*azar(),alto=.319+.071*azar();
    const base=vector(.018*Math.cos(a),.091,.018*Math.sin(a));
    const fin=vector(Math.cos(a)*longitud,alto,Math.sin(a)*longitud);
    tallo(base,fin,.0029,rama);
    for(let j=0;j<4;j++){
      const inicio=base.clone().lerp(fin,.51+j*.14),giro=a+(j%2?1:-1)*(.61+azar()*.44);
      const largo=.042-.005*j,punta=inicio.clone().add(vector(Math.cos(giro)*largo,.022+.01*azar(),Math.sin(giro)*largo));
      tallo(inicio,punta,.0019,rama);
      florBlanca(punta,vector(Math.cos(giro),.53,Math.sin(giro)),.010+.005*azar());
      if(j%2===0){
        hoja(inicio,giro+.66,.023,.0055,.011,verdeTallo);
        florBlanca(inicio.clone().lerp(punta,.64),vector(-Math.sin(giro),.84,Math.cos(giro)),.009);
      }
    }
    florBlanca(fin,vector(Math.cos(a),.75,Math.sin(a)),.011);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(posiciones,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colores,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
}
