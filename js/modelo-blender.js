import * as THREE from 'three';
import modelo from '../modelos/cantera-orv1.js';

function bytes(cadena) {
  return Uint8Array.from(atob(cadena), c => c.charCodeAt(0));
}

const barniz = [0x775038, 0xe3d1ac, 0xcca767].map(h => new THREE.Color(h));

// ORV1 conserva los índices, las normales por cara y los grados de oclusión de Blender.
// La cuantización espacial es un milímetro y las transformaciones mantienen la escala métrica.
export function geometriaBlender(tipo, iluminar) {
  const datos = modelo[tipo];
  if (modelo.version !== 1 || !datos) throw new Error('Modelo local de cantera incompatible');
  const buffer=bytes(datos.v), vista=new DataView(buffer.buffer), n=datos.vertices;
  const pos=new Float32Array(n*3), norm=new Float32Array(n*3), color=new Float32Array(n*3);
  const veta=new Float32Array(n*2), acabado=new Float32Array(n), occlusion=new Float32Array(n);
  for(let i=0;i<n;i++){
    const p=i*12, k=i*3;
    for(let j=0;j<3;j++){pos[k+j]=vista.getInt16(p+j*2,true)/1000;norm[k+j]=vista.getInt8(p+6+j)/127;}
    const x=pos[k],y=pos[k+1],z=pos[k+2],nx=norm[k],ny=norm[k+1],nz=norm[k+2];
    const pieza=vista.getUint8(p+9);
    acabado[i]=pieza;occlusion[i]=vista.getUint8(p+10)/255;
    if(tipo==='silla'){
      const c=barniz[pieza-5]||barniz[0];color[k]=c.r;color[k+1]=c.g;color[k+2]=c.b;
    } else {
      const luz=iluminar(x,y,z,nx,ny,nz);color.set(luz,k);
    }
    // El frente central usa exactamente la misma proyección UV a ambos lados de cada triángulo.
    const horizontal=Math.abs(ny)>.74;
    const lateral=(!horizontal&&Math.abs(nx)>Math.abs(nz));
    veta[i*2]=(horizontal?x:lateral?z:x)/13.7;
    veta[i*2+1]=(horizontal?z:y)/12.15;
  }
  const g=new THREE.BufferGeometry(), indices=bytes(datos.i);
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.BufferAttribute(norm,3));
  g.setAttribute('color',new THREE.BufferAttribute(color,3));
  g.setAttribute('uv',new THREE.BufferAttribute(veta,2));
  g.setAttribute('acabado',new THREE.BufferAttribute(acabado,1));
  g.setAttribute('oclusion',new THREE.BufferAttribute(occlusion,1));
  if(indices.byteLength!==datos.triangulos*6||buffer.byteLength!==n*12)throw new Error('Malla local incompleta');
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices.buffer),1));
  g.computeBoundingSphere();return g;
}

export const barandasBlender=modelo.barandas;
