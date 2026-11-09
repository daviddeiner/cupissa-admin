import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (name: string) => Deno.env.get(name) ?? '';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8',
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type Supa = ReturnType<typeof createClient>;

async function findByEmail(db: Supa, email: string) {
  const perPage = 200;
  for (let page = 1; page <= 500; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`AUTH_LOOKUP_FAILED: ${error.message}`);
    const found = data.users.find(user => normalize(user.email) === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
  throw new Error('AUTH_LOOKUP_LIMIT: No se pudo completar la búsqueda.');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const url = env('SUPABASE_URL');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const allowedEmail = normalize(env('CUPISSA_ADMIN_EMAIL'));
    if (!url || !serviceKey || !allowedEmail) {
      return reply({ ok: false, error: 'MISSING_CONFIG', detail: 'Revisa SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y CUPISSA_ADMIN_EMAIL.' }, 500);
    }

    const authorization = req.headers.get('authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) return reply({ ok: false, error: 'AUTH_MISSING', detail: 'No se recibió la sesión del administrador.' }, 401);

    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: verified, error: verificationError } = await db.auth.getUser(token);
    if (verificationError || !verified?.user) {
      return reply({ ok: false, error: 'AUTH_INVALID', detail: verificationError?.message || 'La sesión no es válida.' }, 401);
    }
    if (normalize(verified.user.email) !== allowedEmail) {
      return reply({ ok: false, error: 'ADMIN_NOT_ALLOWED', detail: 'El usuario autenticado no coincide con CUPISSA_ADMIN_EMAIL.' }, 403);
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return reply({ ok: false, error: 'INVALID_JSON' }, 400); }
    if (body.action !== 'sync_customer_auth') return reply({ ok: false, error: 'INVALID_ACTION' }, 400);

    const clienteId = String(body.cliente_web_id ?? '').trim();
    if (!clienteId || clienteId.length > 100) return reply({ ok: false, error: 'INVALID_CUSTOMER_ID' }, 400);

    const { data: customer, error: customerError } = await db.from('clientes_web')
      .select('id,nombres,apellidos,correo,telefono')
      .eq('id', clienteId).maybeSingle();
    if (customerError) return reply({ ok: false, error: 'CUSTOMER_LOOKUP_FAILED', detail: customerError.message }, 500);
    if (!customer) return reply({ ok: false, error: 'CUSTOMER_NOT_FOUND' }, 404);

    const email = normalize(customer.correo);
    if (!validEmail(email)) return reply({ ok: false, error: 'INVALID_EMAIL', detail: 'Revisa clientes_web.correo.' }, 422);

    let existing = await findByEmail(db, email);
    if (existing) return reply({ ok: true, created: false, existing: true, auth_user_id: existing.id, cliente_web_id: customer.id, email });

    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        tipo: 'cliente',
        origen: 'cupissa_admin',
        cliente_web_id: String(customer.id),
        nombre: [customer.nombres, customer.apellidos].filter(Boolean).join(' ').trim(),
        telefono: String(customer.telefono ?? ''),
      },
    });
    if (createError || !created?.user) {
      // Alta concurrente: consultar nuevamente para evitar duplicados.
      existing = await findByEmail(db, email);
      if (existing) return reply({ ok: true, created: false, existing: true, auth_user_id: existing.id, cliente_web_id: customer.id, email });
      return reply({ ok: false, error: 'AUTH_CREATE_FAILED', detail: createError?.message || 'No se devolvió un usuario.' }, 500);
    }

    return reply({ ok: true, created: true, existing: false, auth_user_id: created.user.id, cliente_web_id: customer.id, email });
  } catch (error) {
    console.error('[cupissa-clientes-auth]', error);
    return reply({ ok: false, error: 'INTERNAL_ERROR', detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
