import * as THREE from 'three';
import { azarEstable, salida } from './materiales.js';

// El polvo suspendido y los pliegues de luz comparten lote con las emisiones en vuelo.
// Cada emisión sigue dos tramos Bézier en metros del mundo, independientes de la mirada.
const TIPOS = ['umbral', 'ascua', 'sombra', 'bruma', 'galeria', 'frasco', 'tira', 'cera'];
export const BOQUILLA = [-3.64, 7.40, -16.80];
const av = ([x,y,z]) => new THREE.Vector3(x,y,z);
const tonos = {
  humo:[.74,.45,.22], oro:[.93,.49,.16], seda:[.90,.65,.43],
  champagne:[.93,.70,.38], marfil:[.94,.79,.56], sombra:[.58,.31,.15]
};

export function crearEstelas(grupo) {
  const azar = azarEstable(83127);
  const centros=[], ejes=[], medidas=[], claves=[], tintes=[];
  const controles=Array.from({length:5},()=>[]);
  function pieza(tipo, s, centro, eje, largo, ancho, alfa, forma, color) {
    centros.push(centro.x,centro.y,centro.z); ejes.push(eje.x,eje.y,eje.z);
    medidas.push(largo,ancho,alfa,azar()*6.283185);
    claves.push(TIPOS.indexOf(tipo),s,forma); tintes.push(...color);
  }
  function senda(puntos) {
    return new THREE.CatmullRomCurve3(puntos.map(av),false,'catmullrom',.38);
  }
  function entre(a,b) {return a+(b-a)*azar();}
  // Puntos de anchura acotada, en una sección tridimensional perpendicular a la senda.
  function muestra(curva,s,radio,aplanar=1) {
    const centro=curva.getPointAt(s), eje=curva.getTangentAt(s);
    const lado=new THREE.Vector3().crossVectors(eje,new THREE.Vector3(0,1,0)).normalize();
    const arriba=new THREE.Vector3().crossVectors(lado,eje).normalize();
    const a=azar()*Math.PI*2, r=radio*Math.sqrt(azar());
    centro.addScaledVector(arriba,Math.sin(a)*r*aplanar).addScaledVector(lado,Math.cos(a)*r);
    return [centro,eje];
  }
  function cinta(tipo,curva,total,radio,color,alfa,escala,aplanar=1) {
    for(let i=0;i<total;i++){
      const s=(i+azar())/total, amplitud=radio*(.62+.38*Math.sin(Math.PI*s));
      const [centro,eje]=muestra(curva,s,amplitud,aplanar);
      pieza(tipo,s,centro,eje,escala*entre(1.0,1.6),escala*entre(.34,.58),
            alfa*entre(.75,1),1,color);
    }
  }
  function motas(tipo,curva,total,radio,color,escala,alfa) {
    for(let i=0;i<total;i++){
      const s=(i+azar())/total;
      const [centro,eje]=muestra(curva,s,radio*(.18+.82*s));
      const d=escala*entre(.7,1.6);
      pieza(tipo,s,centro,eje,d*entre(1.2,2.05),d,alfa*entre(.55,1),0,color);
    }
  }

  // Imagen 1575: u≈.248, v≈.263 desde arriba. Tras el recorte SBS horizontal,
  // u≈.240. La salida apunta hacia la derecha y pasa por delante del margen del muro.
  const spray=senda([BOQUILLA,[-1.5,7.27,-16.75],[2.9,6.94,-16.50],[6.8,6.57,-15.44],
    [8.25,4.55,-11.25],[7.05,3.13,-8.40],[4.67,1.85,-6.15],[3.28,1.81,-5.50]]);
  for(let i=0;i<102;i++){
    const s=(i+azar())/102;
    const radio=.035+1.62*s;
    const [centro,eje]=muestra(spray,s,radio,.76);
    const ancho=(.16+1.67*s)*entre(.72,1.23);
    pieza('bruma',s,centro,eje,ancho*entre(1.9,3.05),ancho,
          entre(.034,.060),1,i%3?tonos.humo:tonos.marfil);
  }
  motas('bruma',spray,540,1.68,tonos.champagne,.055,.30);
  // Tres pliegues iluminados dentro del abanico, con volumen al girar la cabeza.
  for(let j=0;j<3;j++){
    const detalle=senda([BOQUILLA,[-.7,7.26+j*.06,-16.67],[3.8,6.9+j*.20,-16.20],
      [7.1,6.05+j*.22,-14.3],[7.68-j*.34,3.57+j*.29,-9.80],[3.41+j*.46,1.66+j*.34,-5.72+j*.18]]);
    cinta('bruma',detalle,19,.16,tonos.seda,.078,.42+j*.12);
  }
  // El frente de perfume se enrolla sobre la mesa derecha, a seis metros del asiento.
  for(let j=0;j<3;j++){
    for(let i=0;i<19;i++){
      const a=-.85+i/18*3.7+j*.36;
      const centro=av([3.96+Math.cos(a)*(.97+j*.24),2.00+Math.sin(a)*(.48+j*.16),-5.78-.44*j+.18*Math.sin(a*1.4)]);
      const eje=av([-Math.sin(a),.68*Math.cos(a),.10]).normalize();
      pieza('bruma',.83+.15*i/18,centro,eje,entre(.70,1.26),entre(.22,.50),.077,1,tonos.seda);
    }
  }

  for(const lado of [-1,1]){
    // Dos hojas de luz prolongan la apertura de las rejas en las paredes y en el piso.
    for(let j=0;j<5;j++){
      const x=lado*(2.15+j*.56), a=av([x,.20,-7.8-j*1.0]);
      const b=av([lado*(5.9+j*.94),6.4+j*.46,-11.7-j*.54]);
      const eje=b.clone().sub(a);
      pieza('umbral',j/5,a.lerp(b,.5),eje.clone().normalize(),eje.length()*1.18,
            1.08+j*.19,.14,2,tonos.champagne);
    }
    const galeria=senda([[lado*7.3,6.7,-15.9],[lado*6.6,5.1,-13.2],
      [lado*5.2,3.75,-10.3],[lado*3.05,2.35,-7.3]]);
    cinta('galeria',galeria,28,.27,tonos.seda,.091,1.62,.64);
    // Los reflejos de la bandeja se abren por debajo de la imagen en dos arcos poco altos.
    const bandeja=senda([[lado*1.40,1.62,-16.21],[lado*3.6,1.23,-12.9],
      [lado*4.00,1.44,-8.5],[lado*2.65,1.28,-5.0]]);
    cinta('frasco',bandeja,43,.19,tonos.oro,.099,.97,.57);
    motas('frasco',bandeja,58,.33,tonos.champagne,.040,.19);
    // El resplandor del brindis recorre ambos manteles y llega a los puestos más próximos.
    for(const x of [2.15,6.94]){
      const brindis=senda([[lado*x,1.00,-15.08],[lado*(x+.14),1.12,-10.40],
        [lado*(x-.14),1.15,-5.2],[lado*(x-.27),1.04,-2.08]]);
      cinta('ascua',brindis,35,.13,tonos.champagne,x<3?.16:.11,1.03,.57);
      motas('ascua',brindis,44,.25,tonos.marfil,.045,.20);
    }
    // Queda una franja de luz a cada lado de la puerta conforme se cierra en el comercial.
    for(let j=0;j<5;j++){
      const a=av([lado*(3.7+j*.83),.42,-8.15-j*.76]);
      const b=av([lado*(5.5+j*.85),7.48+j*.22,-13.6-j*.44]);
      const eje=b.clone().sub(a);
      pieza('sombra',j/5,a.lerp(b,.50),eje.clone().normalize(),eje.length()*1.23,
            1.40+j*.22,.138,2,tonos.sombra);
    }
  }
  // Ecos de la tira olfativa. El más cercano discurre por fuera de la etiqueta y del rostro.
  const tira=senda([[-5.10,1.64,-13.0],[-4.5,2.92,-10.5],[-2.9,2.27,-7.6],
    [-3.30,2.98,-6.04],[-2.86,3.30,-5.15]]);
  cinta('tira',tira,74,.31,tonos.seda,.112,1.37);
  motas('tira',tira,88,.53,tonos.marfil,.048,.22);
  // Centro de la llama en el original a 37,63 s: (166,264) en 768×432.
  // El reflejo sale por el mismo lado de la fuente y baja hasta la vajilla de la izquierda.
  const cera=senda([[-4.10,4.66,-16.80],[-5.3,4.57,-16.24],[-7.25,4.35,-15.6],
    [-6.40,2.43,-12.12],[-4.62,1.41,-8.9],[-2.02,1.20,-4.25]]);
  cinta('cera',cera,74,.24,tonos.champagne,.105,1.28,.63);
  motas('cera',cera,95,.36,tonos.marfil,.04,.20);

  // Centro y eje guardan los extremos de los vuelos. Los cinco controles intermedios
  // solo ocupan memoria desde aquí; las capas fijas usan sus coordenadas originales.
  for(const c of controles){
    c.length=centros.length;
    c.fill(0);
  }
  // Cuatro hitos sobre la curva: fuente en la toma, salida del marco, paso sobre la
  // mesa, llegada delante de la silla. Las tangentes compartidas unen los dos tramos.
  function vuelo(tipo,origen,despegue,relevo,llegada,aspecto){
    const {capas,polvo,radio,largo,ancho,alfa,color}=aspecto;
    const p=av(origen), salida=av(despegue), m=av(relevo), fin=av(llegada);
    const tangente=fin.clone().sub(salida).multiplyScalar(.20);
    const previo=m.clone().sub(tangente), siguiente=m.clone().add(tangente);
    const aterrizaje=fin.clone().addScaledVector(fin.clone().sub(m),-.35);
    aterrizaje.y+=tipo==='tira'||tipo==='bruma'?.22:0;
    // Una sección se abre al dejar el borde y vuelve a recogerse ante la silla.
    const puntos=[p,salida,previo,m,siguiente,aterrizaje,fin];
    for(let i=0;i<capas+polvo;i++){
      const capa=i<capas, serie=capa?i:i-capas, total=capa?capas:polvo;
      const demora=(serie+azar())/total*(tipo==='bruma'?.29:.35);
      const giro=entre(0,2*Math.PI),r=Math.sqrt(azar())*radio;
      const dx=Math.cos(giro)*r,dy=Math.sin(giro)*r;
      const desfase=entre(-.65,.65), lateral=entre(-.22,.22)*radio;
      const ajustados=puntos.map((pt,j)=>{
        const f=[0,.30,.72,1,.86,.73,.60][j];
        const v=pt.clone();v.x+=dx*f+lateral*Math.sin(j*1.09);v.y+=dy*f*(aspecto.aplanar??.8);
        v.z+=desfase*f*radio*.40;return v;
      });
      const escala=entre(.68,1.22);
      const forma=capa?(aspecto.hoja?5:4):3;
      const grosor=capa?ancho*escala:entre(.019,.043);
      pieza(tipo,demora,ajustados[0],ajustados[6],
        capa?largo*escala:grosor*entre(1.2,2.25),grosor,capa?alfa*entre(.72,1):entre(.19,.37),forma,color);
      for(let j=0;j<5;j++)controles[j].push(...ajustados[j+1].toArray());
    }
  }
  for(const l of [-1,1]){
    vuelo('umbral',[l*1.55,2.12,-16.8],[l*3.64,.57,-14.1],[l*2.42,.29,-7.4],[l*.82,.23,-2.13],
      {capas:16,polvo:19,radio:.42,largo:1.35,ancho:.22,alfa:.19,color:tonos.champagne,hoja:true,aplanar:.22});
    vuelo('galeria',[l*5.60,6.33,-16.8],[l*6.83,5.76,-14.3],[l*3.84,2.34,-7.0],[l*1.14,1.48,-2.24],
      {capas:15,polvo:25,radio:.47,largo:.86,ancho:.24,alfa:.105,color:tonos.marfil});
    vuelo('frasco',[l*1.25,2.91,-16.8],[l*3.84,2.10,-13.9],[l*3.03,1.18,-6.8],[l*.82,.97,-1.96],
      {capas:16,polvo:30,radio:.39,largo:.91,ancho:.19,alfa:.15,color:tonos.oro,aplanar:.43});
    vuelo('ascua',[l*3.03,4.52,-16.8],[l*2.84,2.18,-13.5],[l*2.18,1.23,-6.4],[l*.90,1.04,-1.90],
      {capas:18,polvo:39,radio:.40,largo:.90,ancho:.18,alfa:.17,color:tonos.champagne,aplanar:.46});
    vuelo('sombra',[l*1.44,2.10,-16.8],[l*4.15,.51,-13.1],[l*2.38,.28,-6.5],[l*.84,.25,-2.12],
      {capas:20,polvo:0,radio:.42,largo:1.47,ancho:.40,alfa:.29,color:[.028,.018,.020],hoja:true,aplanar:.30});
  }
  vuelo('tira',[-.89,5.63,-16.80],[-4.88,5.55,-14.8],[-3.12,2.57,-7.18],[-.78,1.41,-2.03],
    {capas:29,polvo:67,radio:.72,largo:.96,ancho:.36,alfa:.115,color:tonos.seda});
  vuelo('cera',[-4.10,4.66,-16.80],[-6.27,4.46,-15.8],[-3.61,1.72,-7.27],[-.88,1.11,-2.08],
    {capas:27,polvo:56,radio:.52,largo:.94,ancho:.30,alfa:.135,color:tonos.champagne,aplanar:.56});
  // La primera tangente respeta la dirección horizontal visible en el atomizador.
  vuelo('bruma',BOQUILLA,[6.67,7.23,-16.79],[4.88,3.07,-8.88],[.81,1.49,-2.04],
    {capas:52,polvo:154,radio:1.05,largo:1.04,ancho:.47,alfa:.104,color:tonos.seda});

  const base=new THREE.PlaneGeometry(1,1), geo=new THREE.InstancedBufferGeometry();
  geo.index=base.index; geo.setAttribute('position',base.attributes.position); geo.setAttribute('uv',base.attributes.uv);
  for(const [nombre,datos,n] of [['centro',centros,3],['eje',ejes,3],['medida',medidas,4],['clave',claves,3],['tinte',tintes,3]]){
    geo.setAttribute(nombre,new THREE.InstancedBufferAttribute(new Float32Array(datos),n));
  }
  for(let j=0;j<5;j++)geo.setAttribute('control'+j,new THREE.InstancedBufferAttribute(new Float32Array(controles[j]),3));
  geo.instanceCount=centros.length/3;
  const pesos={value:new Float32Array(TIPOS.length)}, progresos={value:new Float32Array(TIPOS.length)};
  const mat=new THREE.ShaderMaterial({
    // Mezcla de medios translúcidos: la contribución de un pliegue oculta una fracción
    // de los posteriores. Varias capas de niebla nunca suman hasta el blanco.
    uniforms:{pesos,progresos},transparent:true,depthWrite:false,premultipliedAlpha:true,
    blending:THREE.NormalBlending,
    vertexShader:`
      uniform float pesos[8],progresos[8];
      attribute vec3 centro,eje,clave,tinte; attribute vec4 medida;
      attribute vec3 control0,control1,control2,control3,control4;
      varying vec2 q; varying vec3 colorEco; varying float alfa,forma,fase;
      void main(){
        int tipo=int(clave.x+.5); float w=pesos[tipo], p=progresos[tipo], s=clave.y;
        q=uv*2.-1.; forma=clave.z; fase=medida.w; colorEco=tinte; alfa=0.;
        if(w<.0001){gl_Position=vec4(2.,2.,2.,1.);return;}
        vec3 c=centro, orientacion=eje; vec2 tam=medida.xy;
        float frente=smoothstep(s*.50-.12,s*.50+.18,p);
        if(forma>=3.){
          forma-=3.;
          float edad=(p-s)/(tipo==3?.455:.64);
          frente=smoothstep(0.,.095,edad)*(1.-smoothstep(.90,1.27,edad));
          if(frente<.002){gl_Position=vec4(2.,2.,2.,1.);return;}
          float u=clamp(edad,0.,1.);u=u*u*(3.-2.*u);
          vec3 a=centro,b=control0,d=control1,e=control2;
          if(u>=.5){a=control2;b=control3;d=control4;e=eje;}
          float h=clamp(u*2.-step(.5,u),0.,1.);
          vec3 ab=mix(a,b,h),bd=mix(b,d,h),de=mix(d,e,h);
          vec3 izquierda=mix(ab,bd,h),derecha=mix(bd,de,h);
          c=mix(izquierda,derecha,h);orientacion=derecha-izquierda;
          tam*=mix(.47,1.,smoothstep(.08,.81,u));
          if(tipo==3 && forma>.5)colorEco=vec3(.83,.69,.52);
        }else{
        if(tipo==0){c.x+=sign(c.x)*(.86*p-.23);frente=.80+.20*frente;}
        if(tipo==2){c.x-=sign(c.x)*(.59*p-.14);tam.y*=1.-.24*p;frente=1.;}
        if(tipo==1){frente=smoothstep(s*.57-.12,s*.57+.18,p);
          frente*=.40+.60*exp(-3.4*(s-1.05*p)*(s-1.05*p));}
        if(tipo==3){frente=smoothstep(s*.27-.10,s*.27+.14,p);
          frente*=1.-smoothstep(.31+.40*s,.51+.41*s,p);
          if(forma>.5)colorEco=mix(tinte,vec3(.81,.675,.50),.58);
          c.y+=s*(.23*p+.075*sin(fase+1.7*p));c.x+=s*.13*p;}
        if(tipo>=4){c.y+=.075*p*sin(fase);frente=.24+.76*frente;}
        }
        vec4 v=modelViewMatrix*vec4(c,1.);
        vec2 dir=(mat3(modelViewMatrix)*orientacion).xy;float n=length(dir);
        dir=n>.001?dir/n:vec2(1.,0.);vec2 perp=vec2(-dir.y,dir.x);
        // Suelo angular común a ambos ojos. Atenuar por área mantiene la energía de la mota.
        float angular=.0032*length(c-vec3(0.,1.2,0.));float ancho=max(angular,tam.y);
        float cobertura=min(1.,tam.y/ancho);tam.x=max(tam.x,ancho);tam.y=ancho;
        v.xy+=dir*(position.x*tam.x)+perp*(position.y*tam.y);
        gl_Position=projectionMatrix*v;alfa=medida.z*w*frente*cobertura;
      }`,
    fragmentShader:`
      varying vec2 q; varying vec3 colorEco; varying float alfa,forma,fase;
      void main(){
        vec2 uv=q;float perfil;
        if(forma<.5){float r=dot(uv,uv);
          perfil=exp(-2.8*r)*(1.-smoothstep(.58,1.,r));}
        else if(forma>1.5){perfil=exp(-3.4*uv.y*uv.y)*(1.-smoothstep(.32,1.,abs(uv.x)))
          *(1.-smoothstep(.64,1.,abs(uv.y)));}
        else {uv.y+=.21*sin(2.75*uv.x+fase)*(1.-uv.x*uv.x);
          float r=dot(uv,uv);perfil=exp(-2.4*r)*(1.-smoothstep(.58,1.0,r))
            *(.64+.36*cos(4.5*uv.y+2.3*uv.x+fase));}
        gl_FragColor=vec4(colorEco,alfa*perfil);
        ${salida}
        #include <premultiplied_alpha_fragment>
      }`
  });
  const objeto=new THREE.Mesh(geo,mat);
  objeto.name='Estelas de perfume y reflejos de la gala';
  objeto.userData.instancias=geo.instanceCount;
  objeto.renderOrder=54;objeto.frustumCulled=false;objeto.visible=false;grupo.add(objeto);
  return (ambiente={},luz=0)=>{
    let visible=false;
    for(let i=0;i<TIPOS.length;i++){
      const tipo=TIPOS[i];
      pesos.value[i]=Math.min(1,Math.max(0,(ambiente[tipo]||0)*luz));
      progresos.value[i]=ambiente.progreso?.[tipo]||0;
      visible ||= pesos.value[i]>.0001;
    }
    objeto.visible=visible;
  };
}
