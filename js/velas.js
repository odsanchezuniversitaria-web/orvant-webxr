import * as THREE from 'three';
import { azarEstable, salida } from './materiales.js';
import { crearEstelas } from './estelas.js';

// Una malla para todas las velas. La fase depende de su posición en el mundo.
export function crearLlamas(grupo, puntos) {
  const tiempo={value:0}, ascua={value:0}, recorrido={value:0};
  const mat=new THREE.ShaderMaterial({
    uniforms:{tiempo,ascua,recorrido}, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`uniform float tiempo,ascua,recorrido; varying vec2 p; varying float brillo;
      void main(){
        vec3 centro=instanceMatrix[3].xyz;float escala=length(instanceMatrix[0].xyz);
        float fase=dot(centro,vec3(1.31,.77,1.13));
        float f=.64*sin(tiempo*1.23+fase)+.36*sin(tiempo*2.02+fase*1.17);
        float eje=-15.+13.*smoothstep(0.,.72,recorrido);
        float pulso=ascua*(.21+.79*exp(-.16*(centro.z-eje)*(centro.z-eje)));
        float minimo=.009*length(centro-vec3(0.,1.2,0.)), estable=max(escala,minimo);
        float area=escala/estable;brillo=(.95+f*.034)*(1.+.38*pulso)*area*area;
        escala=estable*(1.+.08*pulso);p=uv*2.-1.;vec4 v=viewMatrix*modelMatrix*vec4(centro,1.);
        v.xy+=vec2(position.x*escala+.0015*f*max(0.,p.y),position.y*escala*(1.+f*.027));
        gl_Position=projectionMatrix*v;}`,
    fragmentShader:`varying vec2 p; varying float brillo;
      void main(){
        float halo=max(0.,exp(-4.*length(p))-.022);
        vec2 u=vec2(p.x*(1.+max(p.y,0.)*1.8),(p.y-.08)*.59);
        vec2 filtro=max(fwidth(u),vec2(.002)), sigma=vec2(.115,.13);
        vec2 s=sqrt(sigma*sigma+filtro*filtro*.12);
        float mecha=exp(-.5*dot(u/s,u/s))*(sigma.x*sigma.y)/(s.x*s.y);
        vec3 c=(vec3(.33,.116,.030)*halo+vec3(.94,.53,.19)*mecha)*brillo;
        gl_FragColor=vec4(c,1.); ${salida} }`
  });
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),mat,puntos.length);
  const tr=new THREE.Object3D();
  puntos.forEach(([x,y,z,s],i)=>{tr.position.set(x,y,z);tr.scale.setScalar(s);tr.updateMatrix();mesh.setMatrixAt(i,tr.matrix);});
  mesh.name='Llamas y halos de las velas';mesh.frustumCulled=false;mesh.renderOrder=3;grupo.add(mesh);
  return (t,a=0,p=0)=>{tiempo.value=t;ascua.value=a;recorrido.value=p;};
}

export function crearLuzProyector(grupo) {
  const uniforms={t:{value:0},colorHaz:{value:new THREE.Color()},intensidad:{value:0}};
  const p=new THREE.BufferGeometry(), lente=[0,2.6,5.72], z=-16.865;
  const esquinas=[[-7,1.6,z],[7,1.6,z],[7,9.475,z],[-7,9.475,z]], pos=[],fac=[];
  for(let i=0;i<4;i++){pos.push(...lente,...esquinas[i],...esquinas[(i+1)%4]);fac.push(0,1,1);}
  p.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));p.setAttribute('distancia',new THREE.Float32BufferAttribute(fac,1));
  const haz=new THREE.Mesh(p,new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute float distancia;varying float d;void main(){d=distancia;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 colorHaz;uniform float intensidad;varying float d;void main(){
      gl_FragColor=vec4(mix(vec3(.52,.39,.23),colorHaz,.56),intensidad*.023*(1.-d)*(1.-d)); ${salida} }`}));
  haz.name='Haz tenue del proyector';haz.material.forceSinglePass=true;grupo.add(haz);
  const polvoGeo=new THREE.BufferGeometry(),polvo=[],semillas=[],azar=azarEstable(4100);
  for(let i=0;i<300;i++){
    const d=.08+.91*Math.sqrt(azar());polvo.push((azar()-.5)*13.8*d,2.6+(1.6+7.875*azar()-2.6)*d,5.72+(z-5.72)*d);
    semillas.push(azar()*Math.PI*2);
  }
  polvoGeo.setAttribute('position',new THREE.Float32BufferAttribute(polvo,3));polvoGeo.setAttribute('fase',new THREE.Float32BufferAttribute(semillas,1));
  const polvoObj=new THREE.Points(polvoGeo,new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float t;attribute float fase;varying float f;void main(){
      vec3 p=position;p.xy+=vec2(.055*sin(.15*t+fase),.045*sin(.19*t+fase*2.));vec4 v=modelViewMatrix*vec4(p,1.);
      gl_Position=projectionMatrix*v;gl_PointSize=clamp(15./max(2.,length(p-vec3(0.,1.2,0.))),3.6,6.);
      f=.52+.09*sin(t*.28+fase);}`,
    fragmentShader:`uniform vec3 colorHaz;uniform float intensidad;varying float f;void main(){
      float a=1.-smoothstep(.02,.5,length(gl_PointCoord-.5));
      gl_FragColor=vec4(mix(vec3(.8,.68,.4),colorHaz,.4),a*f*intensidad*.115); ${salida} }`}));
  polvoObj.name='Polvo en el haz';grupo.add(polvoObj);
  const estelas=crearEstelas(grupo);
  return (t,c,a,bruma=0,avance=0,ambiente)=>{
    const luma=.2126*c.r+.7152*c.g+.0722*c.b;
    uniforms.t.value=t;uniforms.colorHaz.value.copy(c);uniforms.intensidad.value=a*Math.min(1,2.8*luma);
    estelas(ambiente??{bruma,progreso:{bruma:avance}},a);
    haz.visible=polvoObj.visible=uniforms.intensidad.value>.0001;
  };
}
