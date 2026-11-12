import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Expo acepta como máximo 100 mensajes por petición
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH_SIZE = 100

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const cronSecret = Deno.env.get('CRON_SECRET')

  // 1. Solo el cron/servidor puede disparar el envío masivo.
  //    La anon key es pública (va dentro de la app), así que no basta con un JWT válido:
  //    se exige la service role key o un secreto propio en la cabecera x-cron-secret.
  const authHeader = req.headers.get('Authorization') ?? ''
  const esServiceRole = authHeader === `Bearer ${serviceRoleKey}`
  const esCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret
  if (!esServiceRole && !esCron) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // 2. Usuarios activos con token de Expo registrado
  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select('push_token')
    .not('push_token', 'is', null)
    .or('activo.is.null,activo.eq.true') // neq(false) excluiría los NULL

  if (error) {
    return json({ error: error.message }, 500)
  }

  const tokens = [...new Set((usuarios ?? []).map((u: { push_token: string }) => u.push_token))]
    .filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'))

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title: '¡Es hora de moverte!',
    body: 'El sedentarismo no descansa, y nosotros tampoco. ¡Registra tu actividad de hoy en Kinetic!',
  }))

  // 3. Enviar a Expo en lotes
  const fallos: unknown[] = []
  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const lote = messages.slice(i, i + EXPO_BATCH_SIZE)
    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lote),
    })
    const expoData = await expoRes.json().catch(() => null)
    if (!expoRes.ok) {
      fallos.push({ lote: i / EXPO_BATCH_SIZE, status: expoRes.status, detalle: expoData })
    }
  }

  if (fallos.length > 0) {
    return json({ error: 'Fallo al enviar a Expo', enviados: messages.length, fallos }, 502)
  }

  return json({ success: true, enviados: messages.length })
})
