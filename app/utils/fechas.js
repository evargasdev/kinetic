// Devuelve la fecha en formato YYYY-MM-DD según la zona horaria del teléfono.
// No usar toISOString(): convierte a UTC y en México (UTC-6) a partir de las
// 6 p. m. devuelve el día siguiente.
export const fechaLocalISO = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
