import * as THREE from 'three';

// Láminas sobre papel mate, copas de cera y cantos de latón. Un único lote
// opaco para los dos soportes; las mechas se dibujan con las velas de la cena.
export function montarCampana(grupo, luz) {
  const atlas = new THREE.TextureLoader().load('./texturas/diptico_orvant.jpg');
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const uniforme = { estampa:{value:atlas}, izquierda:luz.izquierda,
    derecha:luz.derecha, abajo:luz.abajo };
  const material = new THREE.ShaderMaterial({
    uniforms:uniforme, vertexColors:true,
    vertexShader:`
      attribute float superficie;
      attribute vec3 puntoA, puntoB;
      varying vec3 w, n, base, mechaA, mechaB;
      varying vec2 tex;
      varying float tipo;
      void main(){
        w=position; n=normal; base=color; tex=uv; tipo=superficie;
        mechaA=puntoA; mechaB=puntoB;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      uniform sampler2D estampa; uniform vec3 izquierda,derecha,abajo;
      varying vec3 w,n,base,mechaA,mechaB;
      varying vec2 tex; varying float tipo;
      vec2 vela(vec3 punto,vec3 N,vec3 V){
        vec3 d=punto-w; float r2=max(dot(d,d),.0001); vec3 L=d*inversesqrt(r2);
        float coseno=max(0.,dot(N,L)), flujo=.20/(.21+r2);
        return vec2(flujo*(.37+.63*coseno),flujo*coseno*pow(max(0.,dot(N,normalize(V+L))),24.));
      }
      void main(){
        vec3 N=normalize(n), V=normalize(cameraPosition-w);
        vec2 fuego=vela(mechaA,N,V)+vela(mechaB,N,V);
        vec3 reflejo=mix(mix(izquierda,derecha,smoothstep(-3.,3.,w.x)),abajo,.22);
        vec3 irradiancia=fuego.x*vec3(1.,.55,.25)+reflejo*.52;
        vec3 albedo=tipo>.5 && tipo<1.5 ? texture2D(estampa,tex).rgb : base;
        float metal=step(1.5,tipo);
        vec3 col=albedo*irradiancia+metal*vec3(.85,.53,.20)*fuego.y*.63;
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`
  });
  const posiciones=[], normales=[], colores=[], uvs=[], tipos=[], lucesA=[], lucesB=[], indices=[];
  const mechas=[];
  const caja=new THREE.BoxGeometry(), plano=new THREE.PlaneGeometry();
  const cilindro=new THREE.CylinderGeometry(.5,.5,1,14);
  const soportes=[[-4.65,-6.95], [4.68,-6.20]];
  const vector=new THREE.Vector3(), transformacion=new THREE.Matrix4();
  for(const [lado,[x,z]] of soportes.entries()){
    const base=new THREE.Object3D();
    base.position.set(x,0,z);
    base.rotation.y=Math.atan2(-x,-z);
    base.updateMatrix();
    const punto=(x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(base.matrix);
    const repisa=.84;
    const velas=[[-.43,repisa+.31,.31,.085], [.43,repisa+.21,.31,.072]];
    const [a,b]=velas.map(([x,y,z])=>punto(x,y,z));
    function pieza(geo,pos,escala,tinta,tipo=0) {
      const local=new THREE.Matrix4().makeScale(...escala).setPosition(...pos);
      transformacion.multiplyMatrices(base.matrix,local);
      const normalMatriz=new THREE.Matrix3().getNormalMatrix(transformacion);
      const c=new THREE.Color(tinta), offset=posiciones.length/3;
      const {position,normal,uv}=geo.attributes;
      for(let i=0;i<position.count;i++){
        vector.fromBufferAttribute(position,i).applyMatrix4(transformacion);
        posiciones.push(vector.x,vector.y,vector.z);
        vector.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatriz);
        normales.push(vector.x,vector.y,vector.z);
        colores.push(c.r,c.g,c.b); tipos.push(tipo);
        // Dejar dos texeles de sangre en la medianera del atlas.
        uvs.push((lado+.003+.994*uv.getX(i))*.5,uv.getY(i));
        lucesA.push(a.x,a.y,a.z); lucesB.push(b.x,b.y,b.z);
      }
      for(const i of geo.index.array) indices.push(offset+i);
    }
    // El borde bajo queda por encima de la línea hacia los centros de mesa,
    // de modo que se vea también el vidrio de la base desde la silla.
    const ancho=1.30, alto=1.95, y=2.00, laton=0xb79358;
    pieza(caja,[0,.045,-.01],[.95,.09,.63],0x524740);
    pieza(caja,[0,.55,-.04],[.108,.95,.112],laton,2);
    pieza(caja,[0,repisa,-.025],[.97,.045,.074],laton,2);
    pieza(caja,[0,y,0],[ancho+.058,alto+.06,.094],0x3d322b);
    for(const s of [-1,1]){
      pieza(caja,[s*(ancho+.014)/2,y,.055],[.023,alto+.044,.025],laton,2);
      pieza(caja,[0,y+s*(alto+.016)/2,.055],[ancho+.03,.026,.025],laton,2);
    }
    pieza(plano,[0,y,.056],[ancho,alto,1],0xffffff,1);
    for(const [vx,vy,vz,diametro] of velas){
      pieza(caja,[vx,repisa,.17],[.148,.025,.38],laton,2);
      pieza(cilindro,[vx,repisa+.032,vz],[diametro+.029,.053,diametro+.029],laton,2);
      pieza(cilindro,[vx,(vy+repisa+.04)/2,vz],[diametro,vy-repisa-.04,diametro],0xe2c296);
      const llama=punto(vx,vy+.015,vz);
      mechas.push([llama.x,llama.y,llama.z,.116]);
    }
  }
  const geo=new THREE.BufferGeometry();
  for(const [nombre,datos,tamano] of [['position',posiciones,3],['normal',normales,3],['color',colores,3],
    ['uv',uvs,2],['superficie',tipos,1],['puntoA',lucesA,3],['puntoB',lucesB,3]]){
    geo.setAttribute(nombre,new THREE.Float32BufferAttribute(datos,tamano));
  }
  geo.setIndex(indices); geo.computeBoundingSphere();
  const paneles=new THREE.Mesh(geo,material);
  paneles.name='Díptico de campaña · CREED ORVANT';
  grupo.add(paneles);
  return mechas;
}
