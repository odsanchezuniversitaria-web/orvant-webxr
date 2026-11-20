import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';

const recurso = new URL('../modelos/orvant.glb', import.meta.url);
let plantilla;

export async function cargarModeloPerfume() {
  // Las instancias comparten texturas y mallas, pero tienen pulsador y tapa independientes.
  plantilla ??= new GLTFLoader().loadAsync(recurso.href)
    .then(gltf => gltf.scene)
    .catch(error => { plantilla = undefined; throw error; });
  return (await plantilla).clone(true);
}
