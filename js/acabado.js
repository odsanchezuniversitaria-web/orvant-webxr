import * as THREE from 'three';

// El mezclador lee el píxel ya dibujado en el mismo framebuffer del ojo.
// Csalida = velo * (1 - Cdestino) + gradacion * Cdestino.
// Una sola pasada, sin lectura desde CPU, texturas de la escena ni copias entre ojos.
// Exposición de presentación medida en los valores visibles de las superficies.
// La película se compone después, en renderOrder 40.
export const EXPOSICION_SALA = .70;
export function crearAcabado(scene, conVelo=true, exposicion=EXPOSICION_SALA) {
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0],3));
  const iluminacion = {value:new THREE.Color(0,0,0)};
  const material = new THREE.ShaderMaterial({
    uniforms:{iluminacion, gananciaVelo:{value:conVelo ? exposicion : 0}}, transparent:true, depthTest:false, depthWrite:false, toneMapped:false,
    blending:THREE.CustomBlending, blendEquation:THREE.AddEquation,
    blendSrc:THREE.OneMinusDstColorFactor, blendDst:THREE.ConstantColorFactor,
    blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor,
    vertexShader:`
      varying vec3 rayo;
      varying vec3 direccionFoco;
      varying vec3 direccionCopa;
      void main(){
        vec4 local = inverse(projectionMatrix)*vec4(position.xy,1.,1.);
        rayo = transpose(mat3(viewMatrix))*local.xyz;
        direccionFoco = normalize(vec3(0.,5.5375,-16.95)-cameraPosition);
        direccionCopa = normalize(vec3(.75,.84,-.24)-cameraPosition);
        gl_Position=vec4(position.xy,0.,1.);
      }`,
    fragmentShader:`
      uniform vec3 iluminacion;
      uniform float gananciaVelo;
      varying vec3 rayo;
      varying vec3 direccionFoco;
      varying vec3 direccionCopa;
      void main(){
        vec3 dir=normalize(rayo);
        float pantalla=max(dot(dir,direccionFoco),0.);
        pantalla*=pantalla; pantalla*=pantalla; pantalla*=pantalla;
        float copa=max(dot(dir,direccionCopa),0.);
        copa*=copa; copa*=copa; copa*=copa; copa*=copa;
        // Valores en la codificación de la pantalla. No se aplica otra transferencia sRGB.
        vec3 velo=iluminacion*(.001+.058*pantalla);
        velo+=vec3(.009,.003,.0008)*copa;
        gl_FragColor=vec4(velo*gananciaVelo,0.);
      }`
  });
  material.blendColor.setRGB(1, conVelo ? .987 : 1, conVelo ? .962 : 1).multiplyScalar(exposicion);
  const pasada = new THREE.Mesh(geometria,material);
  pasada.name='Acabado óptico · mezcla final del entorno por ojo';
  pasada.frustumCulled=false;
  pasada.renderOrder=30;
  scene.add(pasada);
  return (promedio, intensidad)=>{
    iluminacion.value.copy(promedio).multiplyScalar(intensidad);
  };
}
