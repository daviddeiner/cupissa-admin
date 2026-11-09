import { createClient } from 'npm:@supabase/supabase-js@2';

// CUPISSA — confirmaciones de pedidos y recordatorios de crédito.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cupissa-hook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const env = (key: string) => Deno.env.get(key) || '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const COLOR = '#e6007e';
const BG = '#fff5fa';
const HOME = 'https://cupissa.com/';
const ACCOUNT = 'https://cupissa.com/perfil/';
const PORTAL = 'https://cupissa.com/portal-pagos/';
const LOGO = 'https://cupissa.com/catalogo/assets/images/logo.png';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c] || c));
const money = (value: unknown) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value || 0));
const validEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const todayBogota = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

async function deliver(message: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) {
  const mailerUrl = env('CUPISSA_MAILER_URL');
  const mailerSecret = env('CUPISSA_MAILER_SECRET');
  if (!mailerUrl || !mailerSecret) throw new Error('Falta configurar el servicio de correo CUPISSA.');
  const res = await fetch(mailerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cupissa-mailer-secret': mailerSecret },
    body: JSON.stringify({ ...message, fromName: 'CUPISSA', secret: mailerSecret }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Mailer rechazó el envío (${res.status}): ${raw.slice(0, 300)}`);
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { throw new Error('El servicio de correo devolvió una respuesta inválida.'); }
  if (data.ok !== true) throw new Error(`Mailer no confirmó el envío: ${String(data.error || 'error desconocido')}`);
  return data;
}

async function getOrderEmail(source: 'pedidos' | 'pedidos_web', record: Record<string, unknown>) {
  // Los pedidos_web del administrador guardan cliente_id, no correo_cliente.
  // Resolver contra clientes_web evita marcar un correo válido como ausente.
  let email = String(record.correo_cliente || '').trim();
  let name = String(record.nombre_cliente || record.cliente_nombre || 'Cliente CUPISSA').trim();
  if (source !== 'pedidos_web') return { email, name };

  const identifiers = [...new Set([record.cliente_web_id, record.cliente_id]
    .filter(value => value !== undefined && value !== null && String(value).trim())
    .map(value => String(value)))];

  const useClient = (client: Record<string, unknown> | null) => {
    if (!client || !validEmail(client.correo)) return false;
    email = String(client.correo).trim();
    name = [client.nombres, client.apellidos].filter(Boolean).join(' ').trim() || name;
    return true;
  };

  for (const id of identifiers) {
    const { data, error } = await db.from('clientes_web')
      .select('id,nombres,apellidos,correo').eq('id', id).maybeSingle();
    if (error) console.warn('[cupissa-emails] clientes_web por id:', error.message);
    if (useClient(data)) return { email, name };
  }

  // Vinculación heredada: clientes_web.cliente_id apunta a clientes.id.
  for (const id of identifiers) {
    const { data, error } = await db.from('clientes_web')
      .select('id,nombres,apellidos,correo').eq('cliente_id', id).limit(2);
    if (error) {
      // Algunas instalaciones no tienen columna cliente_id.
      console.warn('[cupissa-emails] vínculo heredado:', error.message);
    } else if (data?.length === 1 && useClient(data[0])) {
      return { email, name };
    }
  }

  // Última alternativa para registros históricos sin identificador coincidente:
  // usar teléfono solo si identifica a una única ficha web.
  const phone = String(record.telefono || record.contacto || '').replace(/\D/g, '');
  if (phone.length >= 7) {
    const { data, error } = await db.from('clientes_web')
      .select('id,nombres,apellidos,correo').eq('telefono', String(record.telefono || record.contacto || '').trim()).limit(2);
    if (!error && data?.length === 1 && useClient(data[0])) return { email, name };
  }

  // Solo en solicitudes del administrador autenticado se admite este respaldo.
  // No se escribe en la tabla ni cambia el correo comercial.
  const adminEmail = String(record._admin_email_verified || '').trim();
  if (validEmail(adminEmail)) return { email: adminEmail, name };

  if (validEmail(email)) return { email, name };
  return { email: '', name };
}

function emailLayout(p: { preheader: string; title: string; greeting: string; content: string; buttonText?: string; buttonUrl?: string }) {
  const button = p.buttonText && p.buttonUrl ? `<table role="presentation" width="100%" style="margin:25px 0"><tr><td align="center"><a href="${esc(p.buttonUrl)}" style="background:${COLOR};color:#fff;text-decoration:none;display:inline-block;padding:15px 25px;border-radius:10px;font-weight:700">${esc(p.buttonText)}</a></td></tr></table>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title></head><body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:#29212a">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(p.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG}"><tr><td align="center" style="padding:25px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;border:1px solid #f8d9e9">
  <tr><td align="center" style="padding:28px 20px;border-bottom:4px solid ${COLOR}"><a href="${HOME}"><img src="${LOGO}" alt="CUPISSA" width="190" style="max-width:75%;height:auto;border:0"></a><p style="color:#9b6682;font-size:10px;font-weight:bold;letter-spacing:3px">MODA · ESTILO · EXPERIENCIAS</p></td></tr>
  <tr><td style="padding:30px 28px 18px"><h1 style="font-size:24px;color:#29212a">${esc(p.title)}</h1><p style="line-height:1.7;color:#514650">${esc(p.greeting)}</p><div style="font-size:14px;line-height:1.7;color:#514650">${p.content}</div>${button}</td></tr>
  <tr><td align="center" style="padding:22px;background:${BG};border-top:1px solid #f8d9e9;font-size:12px"><p style="color:${COLOR};font-weight:bold">Gracias por elegir CUPISSA</p><p>Atención: <a href="mailto:contacto@cupissa.com" style="color:${COLOR}">contacto@cupissa.com</a></p><p>Ventas: <a href="mailto:ventas@cupissa.com" style="color:${COLOR}">ventas@cupissa.com</a> | Cartera: <a href="mailto:cartera@cupissa.com" style="color:${COLOR}">cartera@cupissa.com</a></p><p style="font-size:10px;color:#a99da5">Este mensaje fue generado automáticamente por CUPISSA.</p><a href="${HOME}" style="color:${COLOR}">www.cupissa.com</a></td></tr>
  </table></td></tr></table></body></html>`;
}

type Line = Record<string, unknown>;
function parseOrderLines(input: unknown): Line[] {
  let value = input;
  // 'productos' can be JSON, an array or a plain description.
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Line[];
  if (value && typeof value === 'object') return [value as Line];
  return [];
}
function renderOrderDetail(input: unknown) {
  const lines = parseOrderLines(input);
  if (!lines.length) {
    const description = typeof input === 'string' ? input.trim() : '';
    return description ? { html: `<p style="white-space:pre-wrap">${esc(description)}</p>`, text: description } : { html: '', text: '' };
  }
  const html = lines.map((item, idx) => {
    const quantity = Number(item.cantidad || 1);
    const unitPrice = Number(item.precio_unitario ?? item.precio ?? 0);
    const lineTotal = Number(item.total ?? quantity * unitPrice);
    const fields: Array<[string, unknown]> = [
      ['Modalidad', item.modalidad], ['Cantidad', quantity], ['Talla', item.talla],
      ['Color', item.color], ['Accesorio', item.accesorio], ['Personalización / referencia', item.referencia],
    ];
    const details = fields.filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([label, value]) => `<tr><td style="padding:3px 8px 3px 0;color:#766b73">${esc(label)}</td><td style="padding:3px 0">${esc(value)}</td></tr>`).join('');
    return `<div style="border:1px solid #f1e5ec;border-radius:12px;padding:14px;margin-bottom:12px;background:#fafafa"><p style="margin:0 0 8px;font-weight:bold;color:#29212a">${idx + 1}. ${esc(item.nombre || 'Producto CUPISSA')}</p><table role="presentation" style="font-size:13px">${details}</table><p style="margin:10px 0 0"><b>Precio unitario:</b> ${esc(money(unitPrice))} &nbsp; <b>Subtotal:</b> <span style="color:${COLOR};font-weight:bold">${esc(money(lineTotal))}</span></p></div>`;
  }).join('');
  const text = lines.map((item, idx) => `${idx + 1}. ${String(item.nombre || 'Producto CUPISSA')} — Cantidad: ${item.cantidad || 1}; Talla: ${item.talla || 'No aplica'}; Color: ${item.color || 'No aplica'}; Personalización: ${item.referencia || 'Ninguna'}; Subtotal: ${money(item.total || 0)}`).join('\n');
  return { html, text };
}

async function sendOrderConfirmation(payload: Record<string, unknown>) {
  const source = payload.source === 'pedidos' ? 'pedidos' : 'pedidos_web';
  const record = (payload.record && typeof payload.record === 'object' ? payload.record : {}) as Record<string, unknown>;
  const { email, name } = await getOrderEmail(source, record);
  if (!validEmail(email)) return { ok: true, skipped: true, reason: 'El pedido no tiene un correo válido asociado.' };
  const number = String(record.numero_pedido || record.id || '—');
  const date = String(record.fecha_entrega || record.fecha_pedido || record.created_at || 'Por confirmar');
  const total = source === 'pedidos' ? record.total_pedido : record.total;
  const advance = source === 'pedidos' ? record.valor_anticipo : record.anticipo;
  const shipping = Number(record.envio ?? record.domicilio_envio ?? record.domicilio ?? 0);
  const remaining = Math.max(0, Number(total || 0) + shipping - Number(advance || 0));
  const description = source === 'pedidos' ? record.descripcion : record.productos;
  const detail = renderOrderDetail(description);
  const subject = `CUPISSA | Confirmación de pedido ${number}`;
  const html = emailLayout({
    preheader: `Confirmación de tu pedido ${number}`,
    title: '¡Tu pedido está registrado!',
    greeting: `Hola ${name}, recibimos tu pedido y quedó registrado correctamente en CUPISSA.`,
    content: `<div style="background:${BG};border:1px solid #f5d2e5;border-radius:14px;padding:18px;margin:20px 0"><p><b>Número de pedido:</b> ${esc(number)}</p><p><b>Fecha:</b> ${esc(date)}</p><p><b>Estado:</b> ${esc(record.estado || 'Registrado')}</p></div>${detail.html ? `<h3 style="font-size:16px;color:#29212a">Detalle del pedido</h3>${detail.html}` : ''}<div style="margin-top:20px;border-top:1px solid #f1e5ec;padding-top:15px"><p><b>Total del pedido:</b> <span style="color:${COLOR};font-weight:bold">${esc(money(total))}</span></p><p><b>Domicilio / envío:</b> ${esc(money(shipping))}</p><p><b>Anticipo registrado:</b> −${esc(money(advance))}</p><p><b>Restante por pagar:</b> <span style="color:${COLOR};font-weight:bold">${esc(money(remaining))}</span></p></div><p>Si tienes alguna inquietud, nuestro equipo está disponible para ayudarte.</p>`,
    buttonText: 'CONSULTAR MI CUENTA', buttonUrl: ACCOUNT,
  });
  return await deliver({ to: email, subject, html,
    text: `Hola ${name}. Tu pedido ${number} fue registrado en CUPISSA.\nFecha: ${date}.\n${detail.text}\nProductos: ${money(total)}. Envío: ${money(shipping)}. Anticipo: ${money(advance)}. Restante: ${money(remaining)}.`,
    idempotencyKey: `order:${source}:${String(record.id || number)}`,
  });
}

async function sendCreditReminders() {
  const today = todayBogota();
  const { data, error } = await db.from('creditos').select(`id,cliente_id,deuda_actual,valor_cuota,proximo_vencimiento,estado,clientes!inner(id,nombre,correo,telefono)`).eq('estado', 'ACTIVO').gt('deuda_actual', 0);
  if (error) throw error;
  const results = { scanned: data?.length || 0, sent: 0, skipped: 0, errors: [] as string[] };
  for (const credit of data || []) {
    const due = String(credit.proximo_vencimiento || '');
    if (!due) { results.skipped++; continue; }
    const days = dayDiff(today, due);
    let kind = '';
    if (days === 3) kind = 'before_3_days';
    else if (days === 0) kind = 'due_today';
    else if (days <= -1 && (Math.abs(days) - 1) % 7 === 0) kind = `overdue_day_${Math.abs(days)}`;
    else { results.skipped++; continue; }
    const client = Array.isArray(credit.clientes) ? credit.clientes[0] : credit.clientes;
    const email = String(client?.correo || '').trim();
    if (!validEmail(email)) { results.skipped++; continue; }
    const name = String(client?.nombre || 'Cliente CUPISSA');
    const overdue = days < 0;
    const subject = overdue ? `CUPISSA | Recordatorio de cuota vencida - Crédito ${credit.id}` : days === 0 ? 'CUPISSA | Tu cuota vence hoy' : 'CUPISSA | Tu cuota vence en 3 días';
    const message = overdue ? `Tu cuota tiene ${Math.abs(days)} día(s) de vencida. Te invitamos a ponerte al día.` : days === 0 ? 'Te recordamos que tu cuota de Crédito CUPISSA vence hoy.' : 'Te recordamos que tu próxima cuota de Crédito CUPISSA vence dentro de 3 días.';
    const html = emailLayout({
      preheader: message,
      title: overdue ? 'Tu cuota está pendiente' : days === 0 ? 'Tu cuota vence hoy' : 'Tu cuota vence en 3 días',
      greeting: `Hola ${name}, queremos mantenerte al día con tu Crédito CUPISSA.`,
      content: `<p>${esc(message)}</p><div style="background:${BG};border:1px solid #f5d2e5;border-radius:14px;padding:18px"><p><b>Fecha de vencimiento:</b> ${esc(due)}</p><p><b>Valor de la cuota:</b> <span style="color:${COLOR};font-weight:bold">${esc(money(credit.valor_cuota))}</span></p><p><b>Saldo actual del crédito:</b> ${esc(money(credit.deuda_actual))}</p></div><p>Si ya realizaste el pago, no necesitas realizar otro. Tu cuenta se actualizará cuando el pago quede aplicado.</p><p>Si necesitas ayuda, escribe a <a href="mailto:cartera@cupissa.com" style="color:${COLOR}">cartera@cupissa.com</a>.</p>`,
      buttonText: 'IR AL PORTAL DE PAGOS', buttonUrl: PORTAL,
    });
    try {
      await deliver({ to: email, subject, html,
        text: `Hola ${name}. ${message} Vencimiento: ${due}. Valor cuota: ${money(credit.valor_cuota)}. Saldo: ${money(credit.deuda_actual)}.`,
        idempotencyKey: `credit:${credit.id}:${due}:${kind}` });
      results.sent++;
    } catch (e) { results.errors.push(`${credit.id}: ${String(e)}`); }
  }
  return results;
}

// Los correos administrativos se solicitan con la sesión Supabase Auth del
// administrador; las credenciales del mailer nunca se exponen al frontend.
async function authorizeAdmin(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, code: 'AUTH_MISSING', reason: 'No llegó la sesión del administrador.' };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return { ok: false, code: 'AUTH_INVALID', reason: 'La sesión enviada no es válida o ha vencido.' };
  const allowedEmail = env('CUPISSA_ADMIN_EMAIL').trim().toLowerCase();
  if (!allowedEmail) return { ok: false, code: 'ADMIN_NOT_CONFIGURED', reason: 'Falta CUPISSA_ADMIN_EMAIL en Secrets.' };
  const signedInEmail = String(data.user.email || '').trim().toLowerCase();
  if (signedInEmail !== allowedEmail) {
    console.error('[cupissa-emails] Admin no autorizado: correo de sesión no coincide con el secreto configurado.');
    return { ok: false, code: 'ADMIN_EMAIL_MISMATCH', reason: 'El correo de la sesión no coincide con CUPISSA_ADMIN_EMAIL.' };
  }
  return { ok: true, code: 'AUTHORIZED', reason: 'Autorizado' };
}


// Alta silenciosa: crea un registro Auth sin contraseña, invitación ni correo.
// La titularidad del email se verifica después mediante el acceso público real.
async function syncCustomerAuth(clienteId: string) {
  if (!clienteId || clienteId.length > 100) {
    return { ok: false, code: 'INVALID_CUSTOMER_ID', detail: 'Identificador inválido.' };
  }
  const { data: customer, error: lookupError } = await db.from('clientes_web')
    .select('id,nombres,apellidos,correo,telefono').eq('id', clienteId).maybeSingle();
  if (lookupError) throw new Error('CUSTOMER_LOOKUP: ' + lookupError.message);
  if (!customer) return { ok:false, code:'CUSTOMER_NOT_FOUND', detail:'No existe en clientes_web.' };
  const email = String(customer.correo || '').trim().toLowerCase();
  if (!validEmail(email)) return { ok:false, code:'INVALID_EMAIL', detail:'El correo de clientes_web no es válido.' };
  const perPage = 200;
  const lookup = async () => {
    for (let page = 1; page <= 500; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error('AUTH_LOOKUP: ' + error.message);
      const matching = data.users.find(user => String(user.email || '').trim().toLowerCase() === email);
      if (matching) return matching;
      if (data.users.length < perPage) return null;
    }
    throw new Error('AUTH_LOOKUP_LIMIT');
  };
  const existing = await lookup();
  if (existing) return { ok:true, created:false, existing:true, auth_user_id:existing.id, cliente_web_id:customer.id, email };
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    email_confirm:false,
    user_metadata: {
      tipo:'cliente', origen:'cupissa_admin', cliente_web_id:String(customer.id),
      nombres:String(customer.nombres || ''), apellidos:String(customer.apellidos || ''),
      telefono:String(customer.telefono || '')
    }
  });
  if (createError || !created?.user) {
    // Una solicitud simultánea puede haber creado la cuenta.
    const concurrent = await lookup();
    if (concurrent) return { ok:true, created:false, existing:true, auth_user_id:concurrent.id, cliente_web_id:customer.id, email };
    return { ok:false, code:'AUTH_CREATE_FAILED', detail:createError?.message || 'No se devolvió un usuario.' };
  }
  return { ok:true, created:true, existing:false, auth_user_id:created.user.id, cliente_web_id:customer.id, email };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Método no permitido' }, { status: 405, headers: cors });
  try {
    const body = await req.json();
    let result;
    if (body.action === 'sync_customer_auth') {
      const admin = await authorizeAdmin(req);
      if (!admin.ok) return Response.json({ ok:false, error:admin.reason, code:admin.code }, { status:403, headers:cors });
      const clienteId = String(body.cliente_web_id || '').trim();
      result = await syncCustomerAuth(clienteId);
      if (!result.ok) return Response.json(result, { status:422, headers:cors });
    } else if (body.action === 'admin_order_confirmation') {
      const admin = await authorizeAdmin(req);
      if (!admin.ok) return Response.json({ error: admin.reason, code: admin.code }, { status: 403, headers: cors });
      const orderId = String(body.order_id || '').trim();
      if (!orderId || orderId.length > 128) return Response.json({ error: 'Identificador de pedido inválido.' }, { status: 400, headers: cors });
      const { data: order, error: lookupError } = await db.from('pedidos_web').select('*').eq('id', orderId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!order) return Response.json({ error: 'Pedido no encontrado.' }, { status: 404, headers: cors });
      // El administrador ya validó el correo en clientes_web antes de guardar.
      // Respaldar la resolución cuando el esquema de pedidos no almacene el correo.
      const fallbackEmail = String(body.cliente_correo || '').trim();
      result = await sendOrderConfirmation({
        source:'pedidos_web',
        record:{ ...order, _admin_email_verified: validEmail(fallbackEmail) ? fallbackEmail : '' }
      });
      if (result?.skipped) return Response.json({
        ok:false, code:'CUSTOMER_EMAIL_NOT_RESOLVED',
        error:'No se encontró el correo del cliente en clientes_web para este pedido.',
        result
      }, { status:422, headers:cors });
    } else {
      // Se preserva sin cambios el mecanismo interno de la web y recordatorios.
      if (!env('CUPISSA_EMAIL_HOOK_SECRET') || req.headers.get('x-cupissa-hook-secret') !== env('CUPISSA_EMAIL_HOOK_SECRET')) {
        return Response.json({ error: 'No autorizado' }, { status: 401, headers: cors });
      }
      if (body.action === 'daily_credit_reminders') result = await sendCreditReminders();
      else if (body.action === 'order_confirmation') result = await sendOrderConfirmation(body);
      else return Response.json({ error: 'Acción no reconocida' }, { status: 400, headers: cors });
    }
    return Response.json({ ok: true, result }, { headers: cors });
  } catch (error) {
    console.error('[cupissa-emails]', error);
    return Response.json({ error: 'No fue posible completar el envío', detail: String(error) }, { status: 500, headers: cors });
  }
});
