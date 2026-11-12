// Traducción EN -> ES con caché en memoria (compartida por toda la app).
// Nota: usa el endpoint no oficial de Google Translate; puede limitarse o
// dejar de funcionar sin aviso. Si falla, se devuelve el texto original.
const cache = new Map();

export const traducirAlEspanol = async (texto) => {
  if (!texto) return "";
  const key = texto.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key);

  try {
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(texto)}`
    );
    const data = await response.json();
    // La respuesta trae un fragmento por oración: se unen todos
    const traducido = (data?.[0] || []).map((frag) => frag?.[0] || "").join("") || texto;
    cache.set(key, traducido);
    return traducido;
  } catch (_error) {
    return texto;
  }
};
