import { createClient } from 'npm:@supabase/supabase-js@2';

// CUPISSA — correos de entrega del día. Programado a las 7:00 a. m. Bogotá.
const env = (key: string) => Deno.env.get(key) || '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: {persistSession:false,autoRefreshToken:false},
});
const COLOR = '#e6007e', BG = '#fff5fa';
const HOME = 'https://cupissa.com/', ACCOUNT = 'https://cupissa.com/perfil/';
const LOGO = 'https://cupissa.com/catalogo/assets/images/logo.png';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
const validEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const nowBogota = () => {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const value = (type:string) => parts.find(part=>part.type===type)?.value || '';
  return {date:`${value('year')}-${value('month')}-${value('day')}`,hour:Number(value('hour'))};
};
const normalizeState = (v:unknown) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]/g,' ').trim().toUpperCase();
const excluded = (v:unknown) => ['ENTREGADO','CANCELADO'].includes(normalizeState(v));
const prettyDate = (day:string) => new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));

// Mismo encabezado, colores, borde, logo, botón y pie que cupissa-emails.
function emailLayout(name:string,number:string,date:string) {
  const message = 'Tu pedido tiene fecha de entrega para hoy. Durante el transcurso del día nos comunicaremos contigo para coordinar la entrega. Por favor, mantente pendiente de tu celular y de nuestros mensajes para poder recibirlo.';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoy llega tu pedido | CUPISSA</title></head><body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:#29212a">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Hoy es el día de entrega de tu pedido CUPISSA.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG}"><tr><td align="center" style="padding:25px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;border:1px solid #f8d9e9">
  <tr><td align="center" style="padding:28px 20px;border-bottom:4px solid ${COLOR}"><a href="${HOME}"><img src="${LOGO}" alt="CUPISSA" width="190" style="max-width:75%;height:auto;border:0"></a><p style="color:#9b6682;font-size:10px;font-weight:bold;letter-spacing:3px">MODA · ESTILO · EXPERIENCIAS</p></td></tr>
  <tr><td style="padding:30px 28px 18px"><h1 style="font-size:24px;color:#29212a">¡Hoy llega tu pedido!</h1><p style="line-height:1.7;color:#514650">Hola ${esc(name)},</p><div style="font-size:14px;line-height:1.7;color:#514650"><p>${esc(message)}</p><div style="background:${BG};border:1px solid #f5d2e5;border-radius:14px;padding:18px;margin:20px 0"><p><b>Pedido:</b> ${esc(number)}</p><p><b>Fecha de entrega:</b> ${esc(prettyDate(date))}</p></div><p>¡Gracias por elegir CUPISSA!</p></div><table role="presentation" width="100%" style="margin:25px 0"><tr><td align="center"><a href="${ACCOUNT}" style="background:${COLOR};color:#fff;text-decoration:none;display:inline-block;padding:15px 25px;border-radius:10px;font-weight:700">CONSULTAR MI PEDIDO</a></td></tr></table></td></tr>
  <tr><td align="center" style="padding:22px;background:${BG};border-top:1px solid #f8d9e9;font-size:12px"><p style="color:${COLOR};font-weight:bold">Gracias por elegir CUPISSA</p><p>Atención: <a href="mailto:contacto@cupissa.com" style="color:${COLOR}">contacto@cupissa.com</a></p><p>Ventas: <a href="mailto:ventas@cupissa.com" style="color:${COLOR}">ventas@cupissa.com</a> | Cartera: <a href="mailto:cartera@cupissa.com" style="color:${COLOR}">cartera@cupissa.com</a></p><p style="font-size:10px;color:#a99da5">Este mensaje fue generado automáticamente por CUPISSA.</p><a href="${HOME}" style="color:${COLOR}">www.cupissa.com</a></td></tr>
  </table></td></tr></table></body></html>`;
}

type Order = Record<string,unknown>;
async function getRecipient(order:Order) {
  let email = String(order.correo_cliente || order.email || '').trim();
  let name = String(order.cliente_nombre || order.nombre_cliente || 'Cliente CUPISSA').trim();
  const accept = (c:Order|null) => {
    if (!c || !validEmail(c.correo)) return false;
    email = String(c.correo).trim();
    name = [c.nombres,c.apellidos].filter(Boolean).join(' ').trim() || String(c.nombre || name);
    return true;
  };
  const ids = [...new Set([order.cliente_web_id,order.cliente_id].filter(v=>v!=null).map(String))];
  for (const id of ids) {
    const {data,error} = await db.from('clientes_web').select('id,nombres,apellidos,correo').eq('id',id).maybeSingle();
    if (!error && accept(data)) return {email,name};
  }
  for (const id of ids) {
    const {data,error} = await db.from('clientes_web').select('id,nombres,apellidos,correo').eq('cliente_id',id).limit(2);
    if (!error && data?.length===1 && accept(data[0])) return {email,name};
  }
  for (const id of ids) {
    const {data,error} = await db.from('clientes').select('id,nombre,correo').eq('id',id).maybeSingle();
    if (!error && data && validEmail(data.correo)) return {email:String(data.correo),name:String(data.nombre || name)};
  }
  const phone = String(order.telefono || order.contacto || '').trim();
  if (phone) {
    const {data,error} = await db.from('clientes_web').select('id,nombres,apellidos,correo').eq('telefono',phone).limit(2);
    if (!error && data?.length===1 && accept(data[0])) return {email,name};
  }
  return {email:validEmail(email)?email:'',name};
}

async function send(to:string,subject:string,html:string,text:string,idempotencyKey:string) {
  const url = env('CUPISSA_MAILER_URL'), secret = env('CUPISSA_MAILER_SECRET');
  if (!url || !secret) throw new Error('Faltan CUPISSA_MAILER_URL y CUPISSA_MAILER_SECRET.');
  const response = await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-cupissa-mailer-secret':secret},
    body:JSON.stringify({to,subject,html,text,idempotencyKey,fromName:'CUPISSA',secret})});
  const raw = await response.text();
  if (!response.ok) throw new Error(`Mailer HTTP ${response.status}: ${raw.slice(0,200)}`);
  let payload:Record<string,unknown>;
  try {payload=JSON.parse(raw);} catch {throw new Error('El mailer devolvió una respuesta inválida.');}
  if (payload.ok !== true) throw new Error(String(payload.error || 'El mailer no confirmó el envío.'));
}

async function processToday(date:string) {
  const result = {date,scanned:0,sent:0,skipped:0,duplicates:0,errors:[] as string[]};
  let offset = 0;
  while (true) {
    const {data,error} = await db.from('pedidos_web').select('*').eq('fecha_entrega',date).order('id',{ascending:true}).range(offset,offset+499);
    if (error) throw error;
    const orders = data || [];
    for (const order of orders) {
      result.scanned++;
      if (excluded(order.estado)) {result.skipped++;continue;}
      const id = String(order.id);
      const {email,name} = await getRecipient(order);
      if (!validEmail(email)) {result.skipped++;console.warn('Sin correo válido:',id);continue;}
      const {data:claimed,error:claimError} = await db.rpc('cupissa_reservar_aviso_entrega',{
        p_pedido_id:id,p_fecha_entrega:date,p_correo:email,
      });
      if (claimError) {result.errors.push(`${id}: ${claimError.message}`);continue;}
      if (!claimed) {result.duplicates++;continue;}
      try {
        const {data:current,error:verifyError} = await db.from('pedidos_web').select('estado,fecha_entrega').eq('id',id).maybeSingle();
        if (verifyError) throw verifyError;
        if (!current || excluded(current.estado) || String(current.fecha_entrega).slice(0,10)!==date) {
          await db.from('cupissa_avisos_entrega').delete().eq('pedido_id',id).eq('fecha_entrega',date);
          result.skipped++;continue;
        }
        const number = String(order.numero_pedido || order.codigo || id);
        await send(email,`CUPISSA | ¡Tu pedido ${number} llega hoy!`,emailLayout(name,number,date),
          `Hola ${name}. Hoy ${prettyDate(date)} es la fecha de entrega de tu pedido ${number}. Durante el transcurso del día nos comunicaremos contigo para coordinar la entrega. Por favor, mantente pendiente de tu celular. Gracias por elegir CUPISSA.`,
          `order-delivery-today:pedidos_web:${id}:${date}`);
        const {error:savedError} = await db.from('cupissa_avisos_entrega').update({estado:'enviado',enviado_en:new Date().toISOString(),detalle_error:null}).eq('pedido_id',id).eq('fecha_entrega',date);
        if (savedError) throw savedError;
        result.sent++;
      } catch (err) {
        await db.from('cupissa_avisos_entrega').update({estado:'fallido',detalle_error:String(err).slice(0,500)}).eq('pedido_id',id).eq('fecha_entrega',date);
        result.errors.push(`${id}: ${String(err)}`);
      }
    }
    offset += orders.length;
    if (orders.length < 500) break;
  }
  return result;
}

// Validar la clave contra Supabase Auth, igual que los flujos protegidos de
// cupissa-emails. No dependemos de comparar cadenas de distintos secretos.
// El endpoint /auth/v1/admin/users solo permite credenciales service_role.
async function authorizeServiceCall(req: Request) {
  const authorization = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'').trim();
  const candidate = authorization || String(req.headers.get('apikey') || '').trim();
  if (!candidate || !env('SUPABASE_URL')) return false;
  try {
    const response = await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users?page=1&per_page=1`, {
      method:'GET',
      headers:{'Authorization':`Bearer ${candidate}`,'apikey':candidate},
      signal:AbortSignal.timeout(10000),
      cache:'no-store',
    });
    if (!response.ok) console.warn('[cupissa-recordatorio-entrega] Auth rechazó credenciales de servicio:',response.status);
    return response.ok;
  } catch (error) {
    console.error('[cupissa-recordatorio-entrega] No se pudo validar la credencial:',String(error));
    return false;
  }
}

Deno.serve(async req => {
  if (req.method!=='POST') return Response.json({ok:false,error:'Método no permitido'},{status:405});
  if (!(await authorizeServiceCall(req)))
    return Response.json({ok:false,error:'No autorizado: Supabase Auth no validó la credencial de servicio'},{status:401});
  try {
    const body = await req.json().catch(()=>({})) as {mode?:string};
    const {date,hour} = nowBogota();
    if (body.mode!=='now' && hour!==7)
      return Response.json({ok:true,skipped:true,reason:'Fuera de las 7:00 a. m. (Bogotá)',date});
    const result = await processToday(date);
    console.info('Avisos CUPISSA:',result);
    return Response.json({ok:result.errors.length===0,result},{status:result.errors.length?207:200});
  } catch (err) {
    console.error('Avisos CUPISSA:',err);
    return Response.json({ok:false,error:String(err)},{status:500});
  }
});
