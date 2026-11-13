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

  // También existen pedidos históricos vinculados a la tabla clientes.
  for (const id of identifiers) {
    const {data, error} = await db.from('clientes').select('id,nombre,correo').eq('id',id).maybeSingle();
    if (error) console.warn('[cupissa-pedido-entregado] clientes por id:',error.message);
    if (data && validEmail(data.correo))
      return {email:String(data.correo).trim(),name:String(data.nombre || name).trim()};
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


// CUPISSA | Notificación de entrega independiente.
async function authorizeDelivery(req: Request, orderId: string) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, code: 'AUTH_MISSING', reason: 'No llegó la sesión de usuario.' };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return { ok: false, code: 'AUTH_INVALID', reason: 'La sesión enviada no es válida o ha vencido.' };
  const allowedEmail = (env('CUPISSA_ADMIN_EMAIL') || 'contacto@cupissa.com').trim().toLowerCase();
  const signedInEmail = String(data.user.email || '').trim().toLowerCase();
  if (signedInEmail === allowedEmail && !!data.user.email_confirmed_at) {
    return {ok:true,code:'AUTHORIZED_ADMIN',reason:'Administrador autorizado'};
  }
  // El domiciliario solo puede notificar una entrega propia, ya confirmada con foto y firma.
  const {data:assignment,error:assignmentError} = await db.from('cupissa_domicilios')
    .select('domiciliario_id,entregado_en,foto_path,firma_path').eq('pedido_id',orderId).maybeSingle();
  if (assignmentError) return {ok:false,code:'ASSIGNMENT_ERROR',reason:assignmentError.message};
  if (assignment?.domiciliario_id === data.user.id && assignment.entregado_en && assignment.foto_path && assignment.firma_path) {
    const {data:courier} = await db.from('cupissa_domiciliarios').select('activo').eq('id',data.user.id).maybeSingle();
    if (courier?.activo) return {ok:true,code:'AUTHORIZED_COURIER',reason:'Domiciliario autorizado'};
  }
  return {ok:false,code:'FORBIDDEN',reason:'Solo el administrador o el domiciliario asignado pueden notificar esta entrega.'};
}



Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:cors});
  if (req.method !== 'POST') return Response.json({ok:false,error:'Método no permitido'}, {status:405,headers:cors});
  try {
    const body = await req.json();
    const orderId = String(body.order_id || '').trim();
    if (!orderId || orderId.length > 128) return Response.json({ok:false,error:'Pedido inválido'},{status:400,headers:cors});
    const allowed = await authorizeDelivery(req,orderId);
    if (!allowed.ok) return Response.json({ok:false,error:allowed.reason,code:allowed.code},{status:403,headers:cors});
    const {data:order,error} = await db.from('pedidos_web').select('*').eq('id',orderId).maybeSingle();
    if (error) throw error;
    if (!order) return Response.json({ok:false,error:'Pedido no encontrado'},{status:404,headers:cors});
    if (String(order.estado || '').trim().toUpperCase() !== 'ENTREGADO')
      return Response.json({ok:false,error:'El pedido todavía no está marcado ENTREGADO.'},{status:409,headers:cors});
    const {email,name} = await getOrderEmail('pedidos_web',order);
    if (!validEmail(email)) return Response.json({ok:true,skipped:true,reason:'Este pedido no tiene correo de cliente asociado.'},{headers:cors});
    const number = String(order.numero_pedido || order.codigo || order.id);
    const subject = `CUPISSA | ¡Tu pedido ${number} fue entregado!`;
    const html = emailLayout({
      preheader:`Tu pedido ${number} fue entregado`,
      title:'¡Tu pedido fue entregado!',
      greeting:`Hola ${name}, tu pedido ${number} ya figura como entregado. Gracias por elegir CUPISSA.`,
      content:`<p>Te invitamos a ingresar a tu perfil de CUPISSA para consultar tus pedidos, revisar su historial y administrar tu información.</p><p>Accede con tu correo electrónico y el método de inicio de sesión habilitado en la tienda.</p>`,
      buttonText:'IR A MI PERFIL',buttonUrl:ACCOUNT
    });
    const result = await deliver({
      to:email,subject,html,
      text:`Hola ${name}. Tu pedido ${number} fue entregado. Ingresa a tu perfil para consultar y administrar tus pedidos: ${ACCOUNT}`,
      idempotencyKey:`order-delivered:pedidos_web:${order.id}`
    });
    return Response.json({ok:true,result},{headers:cors});
  } catch (error) {
    console.error('[cupissa-pedido-entregado]',error);
    return Response.json({ok:false,error:'No se confirmó el correo de entrega',detail:String(error)},{status:500,headers:cors});
  }
});
