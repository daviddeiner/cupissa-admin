import { createClient } from 'npm:@supabase/supabase-js@2';

// CUPISSA: alta segura en Supabase Auth a partir de un cliente_web existente.
// La clave service_role NUNCA debe colocarse en los archivos JS del navegador.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,x-client-info,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
const json = (body: Record<string,unknown>, status = 200) =>
  Response.json(body, { status, headers: cors });
const env = (k: string) => Deno.env.get(k) || '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error:'Método no permitido' }, 405);
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'').trim();
    if (!token) return json({ error:'Falta la sesión del administrador.' }, 401);
    const { data: identity, error: authError } = await admin.auth.getUser(token);
    if (authError || !identity.user) return json({ error:'Sesión inválida.' }, 401);
    const allowed = env('CUPISSA_ADMIN_EMAIL').trim().toLowerCase();
    if (!allowed || identity.user.email?.trim().toLowerCase() !== allowed)
      return json({ error:'No autorizado para registrar usuarios.' }, 403);

    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'sync_customer_auth') return json({ error:'Acción no permitida.' }, 400);
    const id = String(body?.cliente_web_id || '').trim();
    if (!id || id.length > 100) return json({ error:'Falta el ID del cliente web.' }, 400);
    // Leer correo exclusivamente de la base de datos; no confiar en emails enviados por el navegador.
    const { data: customer, error: dbError } = await admin.from('clientes_web')
      .select('id,nombres,apellidos,correo').eq('id', id).maybeSingle();
    if (dbError) throw dbError;
    if (!customer) return json({ error:'Cliente no encontrado en clientes_web.' }, 404);
    const email = String(customer.correo || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ error:'El correo de clientes_web no tiene formato válido.' }, 422);
    const fullName = [customer.nombres,customer.apellidos].filter(Boolean).join(' ').trim();

    // Solo se genera una invitación, nunca una contraseña conocida por el administrador.
    const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nombre:fullName, cliente_web_id:String(customer.id) },
      redirectTo: 'https://cupissa.com/perfil/',
    });
    if (invitationError) {
      // Si ya existe, lo verificamos con Auth antes de considerarlo sincronizado.
      const reason = invitationError.message || 'Error de invitación';
      if (/already|registered|exists|duplicate/i.test(reason)) {
        for (let page = 1; page <= 20; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw error;
          const found = data.users.find(u => u.email?.trim().toLowerCase() === email);
          if (found) return json({ ok:true, existing:true, auth_user_id:found.id, email });
          if (data.users.length < 1000) break;
        }
      }
      return json({ error:'No se pudo crear la cuenta o enviar la invitación.', detail:reason }, 502);
    }
    return json({ ok:true, existing:false, invited:true, auth_user_id:invitation.user?.id, email });
  } catch (e) {
    console.error('[cupissa-clientes-auth]', e);
    return json({ error:'Error registrando cliente en Authentication.', detail:String(e) }, 500);
  }
});
