// Intervalos editoriales en segundos del comercial original. Los extremos son fundidos suaves.
export const CUES = Object.freeze([
  {tipo:'umbral', inicio:0.16, fin:59/30, pico:.98, rampaSeg:.48},
  {tipo:'galeria', inicio:9.86, fin:345/30, pico:.88, rampaSeg:.42},
  {tipo:'frasco', inicio:345/30, fin:401/30, pico:.94, rampaSeg:.42},
  {tipo:'tira', inicio:21.15, fin:687/30, pico:.92, rampaSeg:.40},
  {tipo:'ascua', inicio:687/30, fin:746/30, pico:.98, rampaSeg:.43},
  {tipo:'cera', inicio:1109/30, fin:1154/30, pico:.94, rampaSeg:.35},
  {tipo:'sombra', inicio:1456/30, fin:1515/30, pico:.94, rampaSeg:.51},
  {tipo:'bruma', inicio:52.36, fin:54.64, pico:1, rampaSeg:.23, cola:.94}
]);

export async function leerMontaje() {
  try {
    const r = await fetch('./video/tramos_prueba.json', {cache:'no-cache'});
    if (!r.ok) return [];
    const datos = await r.json();
    if (!Array.isArray(datos)) return [];
    return datos.filter(t=>[t.inicio_prueba,t.inicio_fuente,t.duracion].every(Number.isFinite) && t.duracion>0);
  } catch { return []; }
}

export function tiempoFuente(t, tramos) {
  if (!Number.isFinite(t)) return null;
  if (tramos === null) return t;
  const tramo = tramos.find(s=>t>=s.inicio_prueba && t<s.inicio_prueba+s.duracion);
  if(tramo) return tramo.inicio_fuente+t-tramo.inicio_prueba;
  // El último paquete AAC puede terminar unos milisegundos después del último cuadro.
  const ultimo=tramos[tramos.length-1];
  if(ultimo && Math.abs(t-(ultimo.inicio_prueba+ultimo.duracion))<=.036)
    return ultimo.inicio_fuente+ultimo.duracion;
  return null;
}

function rampa(t) {
  const u = Math.max(0, Math.min(1, t));
  return u*u*u*(u*(6*u-15)+10);
}

export function ambienteEn(t, tramos, cues=CUES, segundosTrasFinal=0) {
  const neutro={umbral:0, sombra:0, ascua:0, bruma:0, galeria:0, frasco:0, tira:0,cera:0};
  const pesos={...neutro,progreso:{...neutro}};
  let fuente=tiempoFuente(t,tramos);
  if (fuente === null) return pesos;
  if(fuente>=53.60) fuente+=Math.max(0,segundosTrasFinal);
  for (const {tipo,inicio,fin,pico,rampaSeg,cola} of cues) {
    if (fuente<=inicio || fuente>=fin) continue;
    const mezcla = Math.min(rampa((fuente-inicio)/rampaSeg),rampa((fin-fuente)/(cola||rampaSeg)));
    pesos[tipo] = Math.max(pesos[tipo],pico*mezcla);
    pesos.progreso[tipo] = (fuente-inicio)/(fin-inicio);
  }
  return pesos;
}
