import { supabase } from '../app/subapaseClient';

/**
 * SERVICIOS PARA LA APLICACIÓN KINETIC
 * Conecta el frontend con funciones de Postgres expuestas por Supabase (RPC).
 *
 * Solo se exponen funciones que existen en la base de datos real (verificado con
 * `supabase gen types --linked`). Nota: supabase.rpc() solo puede llamar FUNCIONES;
 * los PROCEDIMIENTOS (CREATE PROCEDURE ... COMMIT) no son accesibles vía PostgREST.
 */
export const kineticService = {
  /**
   * Obtiene el total de sesiones completadas por un usuario.
   * @param {string} userId - El ID (UUID) del usuario.
   * @returns {Promise<number>} Número de sesiones.
   */
  async getTotalSesiones(userId) {
    const { data, error } = await supabase.rpc('fn_total_sesiones_usuario', {
      p_usuario_id: userId,
    });

    if (error) {
      console.error("Error en fn_total_sesiones_usuario:", error.message);
      throw error;
    }
    return data;
  },
};
