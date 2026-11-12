import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminAction = 'list' | 'update-role' | 'toggle-active' | 'delete-user';

const ROLES_VALIDOS = ['user', 'tester', 'admin'] as const;
type Rol = (typeof ROLES_VALIDOS)[number];

// Cabeceras CORS necesarias para permitir peticiones desde localhost y Expo Web
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

const error = (message: string, status: number) => jsonResponse({ error: message }, { status });

// listUsers() pagina (50 por defecto): se recorren todas las páginas para no perder correos.
async function obtenerEmails(adminClient: SupabaseClient): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error: authError } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (authError) throw authError;
    for (const u of data.users) {
      if (u.id && u.email) emailMap.set(u.id, u.email);
    }
    if (data.users.length < perPage) break;
  }
  return emailMap;
}

serve(async (req: Request) => {
  // Preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') return error('Method not allowed', 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return error('Unauthorized', 401);

    // Validar el JWT del usuario que hace la petición
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    if (userError || !userResult.user) return error('Unauthorized', 401);
    const callerId = userResult.user.id;

    // Verificar que sea administrador activo
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile, error: callerError } = await adminClient
      .from('usuarios')
      .select('rol, activo')
      .eq('usuario_id', callerId)
      .maybeSingle();

    if (callerError || callerProfile?.rol !== 'admin' || callerProfile?.activo === false) {
      return error('Forbidden', 403);
    }

    let body: Record<string, unknown> = {};
    try {
      const rawBody = await req.text();
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch (_e) {
      return error('Invalid JSON body', 400);
    }

    const action = body.action as AdminAction;
    const userId = typeof body.userId === 'string' ? body.userId : undefined;

    // Un admin no puede quitarse el rol, suspenderse ni borrarse a sí mismo
    // (evita quedarse sin ningún administrador por accidente).
    if (action !== 'list' && userId === callerId) {
      return error('No puedes modificar tu propia cuenta de administrador', 400);
    }

    // --- LISTAR USUARIOS ---
    if (action === 'list') {
      const search = typeof body.search === 'string' ? body.search.trim().toLowerCase() : '';
      const role = typeof body.role === 'string' ? body.role : 'all';

      const { data: usuariosData, error: usuariosError } = await adminClient
        .from('usuarios')
        .select('id, usuario_id, nombre, edad, peso_kg, altura_cm, nivel_experiencia, objetivo, foto_url, rol, activo')
        .order('nombre', { ascending: true });
      if (usuariosError) return error(usuariosError.message, 500);

      const emailMap = await obtenerEmails(adminClient);

      const users = (usuariosData ?? [])
        .map((item) => ({
          id: item.id,
          userId: item.usuario_id,
          nombre: item.nombre,
          email: emailMap.get(item.usuario_id) ?? null,
          role: item.rol ?? 'user',
          active: item.activo ?? true,
          edad: item.edad,
          peso_kg: item.peso_kg,
          altura_cm: item.altura_cm,
          nivel_experiencia: item.nivel_experiencia,
          objetivo: item.objetivo,
          foto_url: item.foto_url,
        }))
        .filter((item) => {
          const matchesSearch = !search || `${item.nombre ?? ''} ${item.email ?? ''}`.toLowerCase().includes(search);
          const matchesRole = role === 'all' || item.role === role;
          return matchesSearch && matchesRole;
        });

      return jsonResponse({ users });
    }

    // --- ACTUALIZAR ROL ---
    if (action === 'update-role') {
      const role = body.role as Rol;
      if (!userId || !ROLES_VALIDOS.includes(role)) return error('Missing or invalid parameters', 400);

      const { error: dbError } = await adminClient.from('usuarios').update({ rol: role }).eq('usuario_id', userId);
      if (dbError) return error(dbError.message, 500);
      return jsonResponse({ success: true });
    }

    // --- ACTIVAR / SUSPENDER ---
    if (action === 'toggle-active') {
      const active = body.active;
      if (!userId || typeof active !== 'boolean') return error('Missing parameters', 400);

      const { error: dbError } = await adminClient.from('usuarios').update({ activo: active }).eq('usuario_id', userId);
      if (dbError) return error(dbError.message, 500);
      // La app cierra la sesión del usuario suspendido al cargar su perfil (AuthContext)
      return jsonResponse({ success: true });
    }

    // --- ELIMINAR USUARIO ---
    if (action === 'delete-user') {
      if (!userId) return error('Missing parameters', 400);

      // Borra el usuario de Auth (el perfil se elimina si la FK tiene ON DELETE CASCADE)
      const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
      if (authError) return error(authError.message, 500);
      return jsonResponse({ success: true });
    }

    return error('Unknown action', 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error(message, 500);
  }
});
