import { createClient } from 'npm:@supabase/supabase-js@2';

/** CUPISSA | Domicilios. Nunca publicar la SERVICE_ROLE_KEY en HTML/JS. */
const env = (name: string) => Deno.env.get(name) || '';
const url = env('SUPABASE_URL');
const anon = env('SUPABASE_ANON_KEY');
const service = env('SUPABASE_SERVICE_ROLE_KEY');
// Evita BOOT_ERROR si olvidaron los secrets; devuelve un diagnóstico HTTP claro.
// Estos valores de respaldo jamás reciben credenciales reales ni se usan para consultas.
const admin = createClient(url || 'https://invalid.invalid', service || 'missing-service-key',
  {auth:{persistSession:false,autoRefreshToken:false}});
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Cache-Control':'no-store'};
const out = (value: unknown, status=200) => Response.json(value,{status,headers});
class CupissaEdgeError extends Error {
  constructor(public readonly code: string, message: string, public readonly httpStatus=400) {
    super(message); this.name='CupissaEdgeError';
  }
}
const fail = (error:unknown,status=400,code='OPERATION_FAILED') =>
  out({ok:false,code,error:error instanceof Error?error.message:String(error)},status);
const digits = (value:unknown) => {
  let phone = String(value||'').replace(/\D/g,'');
  if(phone.startsWith('57') && phone.length===12) phone=phone.slice(2);
  return /^3\d{9}$/.test(phone)?phone:'';
};
const emailForPhone = (phone:string) => `repartidor-${phone}@domiciliarios.cupissa.com`;
const escapeHtml = (value:unknown) => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const text = (v:unknown) => String(v??'').trim();
const currency = (n:unknown) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
const validId = (x:unknown) => { const s=text(x); if(!/^[a-zA-Z0-9_-]{1,128}$/.test(s)) throw new Error('Identificador inválido.'); return s; };
const userClient = (token:string) => createClient(url, anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
const adminEmail = () => text(env('CUPISSA_ADMIN_EMAIL')||'contacto@cupissa.com').toLowerCase();
const names = (c:any) => [c?.nombres,c?.apellidos].filter(Boolean).join(' ').trim() || 'Cliente CUPISSA';

async function userFromRequest(req:Request) {
  const token = text((req.headers.get('authorization')||'').replace(/^Bearer\s+/i,''));
  if(!token) throw new CupissaEdgeError('AUTH_REQUIRED','Inicia sesión como administrador para continuar.',401);
  const {data,error} = await admin.auth.getUser(token);
  if(error||!data?.user) throw new CupissaEdgeError('AUTH_INVALID','La sesión del administrador es inválida o venció. Cierra sesión y vuelve a entrar.',401);
  return {user:data.user,token,scoped:userClient(token)};
}
async function getCourier(id:string) {
  const {data,error}=await admin.from('cupissa_domiciliarios').select('id,nombres,apellidos,telefono,activo').eq('id',id).maybeSingle();
  if(error) throw error;
  if(!data?.activo) throw new Error('Cuenta de domiciliario inactiva o inexistente.');
  return data;
}
async function deliveryUrls(delivery:any) {
  if(!delivery?.entregado_en || !delivery.foto_path || !delivery.firma_path) throw new Error('La entrega aún no tiene foto y firma confirmadas.');
  const [a,b] = await Promise.all([
    admin.storage.from('cupissa-entregas').createSignedUrl(delivery.foto_path,300),
    admin.storage.from('cupissa-entregas').createSignedUrl(delivery.firma_path,300)
  ]);
  if(a.error||b.error||!a.data?.signedUrl||!b.data?.signedUrl) throw new Error('No se pudieron generar los enlaces privados de la entrega.');
  return {foto_url:a.data.signedUrl,firma_url:b.data.signedUrl,entregado_en:delivery.entregado_en};
}
async function deliveryEmail(order:any) {
  const mailer=env('CUPISSA_MAILER_URL'),secret=env('CUPISSA_MAILER_SECRET');
  if(!mailer||!secret) return {ok:false,warning:'Mailer de CUPISSA no configurado'};
  const ids=[order.cliente_web_id,order.cliente_id].filter(Boolean).map(String);
  let c:any=null;
  for(const id of ids){
    const {data}=await admin.from('clientes_web').select('id,nombres,apellidos,correo').eq('id',id).maybeSingle();
    if(data?.correo){c=data;break;}
  }
  if(!c && ids.length) {
    for(const id of ids){
      const {data,error}=await admin.from('clientes_web').select('id,nombres,apellidos,correo').eq('cliente_id',id).limit(2);
      if(!error&&data?.length===1&&data[0].correo){c=data[0];break;}
    }
  }
  if(!c?.correo) return {ok:false,warning:'El pedido no tiene un correo de cliente verificado en clientes_web'};
  const id=text(order.numero_pedido||order.codigo||order.id);
  const body=`<div style="max-width:620px;margin:auto;padding:28px;font-family:Arial,sans-serif;background:#fff5fa;color:#29212a"><h1 style="color:#e6007e">¡Tu pedido fue entregado!</h1><p>Hola ${escapeHtml(names(c))}, el pedido <strong>${escapeHtml(id)}</strong> de CUPISSA figura como entregado.</p><p>Ingresa a tu perfil para consultar tus pedidos y visualizar la fotografía y firma de entrega.</p><p style="margin:30px 0"><a href="https://cupissa.com/perfil/" style="background:#e6007e;color:white;border-radius:12px;padding:15px 20px;text-decoration:none">VER MI PERFIL</a></p><p>Gracias por elegir CUPISSA.</p></div>`;
  const res=await fetch(mailer,{method:'POST',headers:{'content-type':'application/json','x-cupissa-mailer-secret':secret},body:JSON.stringify({to:c.correo,subject:`CUPISSA | Pedido ${id} entregado`,html:body,text:`Hola ${names(c)}, tu pedido ${id} fue entregado. Entra a https://cupissa.com/perfil/ para consultar tu comprobante.`,idempotencyKey:`order-delivered:pedidos_web:${order.id}`,fromName:'CUPISSA',secret})});
  if(!res.ok) return {ok:false,warning:`El mailer no confirmó el aviso (${res.status})`};
  const result=await res.json().catch(()=>({}));
  return result?.ok===true?{ok:true}:{ok:false,warning:'El servicio de correo no confirmó el envío'};
}
async function imagesFromPayload(photo:string,signature:string,uid:string,orderId:string) {
  const uploads:{path:string;data:Uint8Array;contentType:string}[]=[];
  for(const [kind,image] of [['foto',photo],['firma',signature]]) {
    const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(image||'');
    if(!match) throw new Error(`${kind}: solo se admiten fotografías JPG o PNG.`);
    if(match[2].length>4200000) throw new Error(`${kind}: supera el tamaño máximo permitido.`);
    const raw=atob(match[2]);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(bytes.length>3*1024*1024 || bytes.length<40) throw new Error(`${kind}: archivo inválido o demasiado grande.`);
    const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    const png=bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
    if((match[1]==='jpeg'&&!jpeg)||(match[1]==='png'&&!png)) throw new Error(`${kind}: el contenido no coincide con el formato.`);
    uploads.push({path:`${uid}/${orderId}/${crypto.randomUUID()}.${match[1]==='jpeg'?'jpg':'png'}`,data:bytes,contentType:`image/${match[1]}`});
  }
  const paths:string[]=[];
  try{
    for(const f of uploads){
      const {error}=await admin.storage.from('cupissa-entregas').upload(f.path,f.data,{contentType:f.contentType,upsert:false,cacheControl:'300'});
      if(error) throw error;
      paths.push(f.path);
    }
    return paths;
  }catch(error){ if(paths.length) await admin.storage.from('cupissa-entregas').remove(paths);throw error; }
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  if(req.method!=='POST') return fail('Método no admitido',405);
  try {
    if(!url || !anon || !service) return fail(
      'Configuración incompleta: revisa SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY en Supabase → Edge Functions → Secrets.',
      500, 'MISSING_SUPABASE_SECRETS');
    const body=await req.json();
    const action=text(body.action);
    const {user,token,scoped}=await userFromRequest(req);
    const isAdmin=text(user.email).toLowerCase()===adminEmail() && !!user.email_confirmed_at;
    if(action==='create_courier') {
      if(!isAdmin) throw new CupissaEdgeError('ADMIN_NOT_AUTHORIZED',
        `Solo la cuenta administrativa verificada puede crear domiciliarios. Correo autenticado: ${text(user.email)||'(sin correo)'}. Revisa CUPISSA_ADMIN_EMAIL en Secrets.`,403);
      const phone=digits(body.telefono);
      const first=text(body.nombres),last=text(body.apellidos),password=text(body.password);
      if(!phone) throw new CupissaEdgeError('INVALID_PHONE','Escribe un celular colombiano válido de 10 dígitos que empiece por 3.',422);
      if(first.length<2||last.length<2) throw new CupissaEdgeError('INVALID_NAME','Escribe nombres y apellidos de al menos 2 caracteres.',422);
      if(password.length<10) throw new CupissaEdgeError('INVALID_PASSWORD','La contraseña debe contener como mínimo 10 caracteres.',422);
      if(!url||!service) throw new CupissaEdgeError('MISSING_SECRETS','Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en los secretos de la Edge Function.',500);

      // Detectar ausencia de la tabla ANTES de crear la cuenta en Authentication.
      const {data:old,error:lookupError}=await admin.from('cupissa_domiciliarios')
        .select('id').eq('telefono',phone).maybeSingle();
      if(lookupError) throw new CupissaEdgeError('COURIERS_TABLE_ERROR',
        `No se pudo consultar cupissa_domiciliarios: ${lookupError.message}. Ejecuta el SQL de domicilios incluido en el ZIP del administrador.`,500);
      if(old) throw new CupissaEdgeError('PHONE_ALREADY_EXISTS','Este celular ya tiene un domiciliario registrado.',409);

      const syntheticEmail=emailForPhone(phone);
      const {data:created,error:createError}=await admin.auth.admin.createUser({
        email:syntheticEmail,password,email_confirm:true,
        app_metadata:{cupissa_role:'domiciliario'},
        user_metadata:{nombres:first,apellidos:last,telefono:phone}
      });
      if(createError||!created?.user){
        const detail=text(createError?.message||'No se recibió una cuenta nueva de Authentication.');
        if(/already registered|already been registered|already exists|duplicate|unique/i.test(detail))
          throw new CupissaEdgeError('AUTH_ACCOUNT_EXISTS',
            'Authentication ya tiene una cuenta para este celular, pero no aparece en cupissa_domiciliarios. Revisa esa cuenta en Authentication → Users antes de volver a crearla.',409);
        if(/database error creating new user|database error/i.test(detail))
          throw new CupissaEdgeError('AUTH_DATABASE_TRIGGER_ERROR',
            'Supabase Authentication rechazó el alta: '+detail+'. Comprueba en Database → Triggers si existe un disparador sobre auth.users que falle al crear usuarios.',500);
        throw new CupissaEdgeError('AUTH_CREATE_FAILED',`Authentication rechazó la cuenta: ${detail}`,500);
      }
      const {error:insertError}=await admin.from('cupissa_domiciliarios').insert({
        id:created.user.id,nombres:first,apellidos:last,telefono:phone
      });
      if(insertError){
        // No dejar cuentas huérfanas ante un error al insertar el perfil.
        const {error:rollbackError}=await admin.auth.admin.deleteUser(created.user.id);
        if(rollbackError) console.error('[cupissa-domicilios] No se pudo revertir el usuario:',created.user.id,rollbackError.message);
        throw new CupissaEdgeError('COURIER_INSERT_FAILED',
          `No se guardó el domiciliario en la tabla: ${insertError.message}. ${rollbackError?'Revisa Authentication → Users porque puede haber quedado una cuenta pendiente.':'La cuenta creada se revirtió.'}`,500);
      }
      return out({ok:true,domiciliario:{id:created.user.id,nombres:first,apellidos:last,telefono:phone}});
    }
    if(action==='courier_orders') {
      const courier=await getCourier(user.id);
      const {data:assignments,error}=await admin.from('cupissa_domicilios').select('pedido_id,asignado_en,entregado_en').eq('domiciliario_id',user.id).order('asignado_en',{ascending:false}).limit(150);
      if(error) throw error;
      const ids=(assignments||[]).map((a:any)=>a.pedido_id);
      if(!ids.length) return out({ok:true,courier,orders:[]});
      const {data:orders,error:orderError}=await admin.from('pedidos_web').select('*').in('id',ids);
      if(orderError) throw orderError;
      const clientsIds=[...new Set((orders||[]).flatMap((o:any)=>[o.cliente_web_id,o.cliente_id].filter(Boolean).map(String)))];
      let clients:any[]=[];
      if(clientsIds.length){const r=await admin.from('clientes_web').select('*').in('id',clientsIds.slice(0,150));if(!r.error) clients=r.data||[];}
      const rows=(orders||[]).map((o:any)=>{
        const a=(assignments||[]).find((d:any)=>String(d.pedido_id)===String(o.id));
        const c=clients.find((x:any)=>[o.cliente_web_id,o.cliente_id].filter(Boolean).map(String).includes(String(x.id)) || [o.cliente_web_id,o.cliente_id].filter(Boolean).map(String).includes(String(x.cliente_id)))||{};
        return {id:o.id,numero:o.numero_pedido||o.codigo||String(o.id),estado:o.estado,fecha_entrega:o.fecha_entrega,
          nombre_cliente:[c.nombres,c.apellidos].filter(Boolean).join(' ')||o.cliente_nombre||'Cliente CUPISSA',
          telefono:o.telefono||o.contacto||c.telefono||'',direccion:o.direccion||c.direccion||'',barrio:o.barrio||c.barrio||'',ciudad:o.ciudad||c.ciudad||'',
          ubicacion:o.ubicacion||'',nota:o.nota||'',productos:o.productos||[],imagenes:o.imagenes||[],
          total:o.total||0,envio:o.envio??o.domicilio_envio??o.domicilio??0,anticipo:o.anticipo||0,entregado_en:a?.entregado_en||null,
          asignado_en:a?.asignado_en||null};
      }).sort((a:any,b:any)=>String(a.entregado_en||'').localeCompare(String(b.entregado_en||''))||String(a.fecha_entrega||'').localeCompare(String(b.fecha_entrega||'')));
      return out({ok:true,courier,orders:rows});
    }
    if(action==='complete_delivery') {
      await getCourier(user.id);
      const orderId=validId(body.pedido_id);
      const {data:assignment,error:assignError}=await admin.from('cupissa_domicilios').select('*').eq('pedido_id',orderId).maybeSingle();
      if(assignError) throw assignError;
      if(!assignment||assignment.domiciliario_id!==user.id) return fail('Pedido no asignado a tu cuenta.',403);
      if(assignment.entregado_en) return fail('El pedido ya fue entregado.',409);
      const {data:order,error:orderError}=await admin.from('pedidos_web').select('*').eq('id',orderId).maybeSingle();
      if(orderError||!order) throw new Error('Pedido no encontrado.');
      if(text(order.estado).toUpperCase()!=='EN CAMINO') return fail('El pedido no está EN CAMINO.',409);
      const paths=await imagesFromPayload(body.foto,body.firma,user.id,orderId);
      const {data:success,error:rpcError}=await scoped.rpc('cupissa_domicilios_confirmar_entrega', {p_pedido_id:orderId,p_foto_path:paths[0],p_firma_path:paths[1]});
      if(rpcError||success!==true){ await admin.storage.from('cupissa-entregas').remove(paths);throw new Error(rpcError?.message||'No se confirmó la entrega.'); }
      let emailResult:any={ok:false,warning:'No se confirmó el correo de entrega'};
      try {emailResult=await deliveryEmail(order);}catch(error){console.error('[CUPISSA] correo de entrega:',error);emailResult={ok:false,warning:'Entrega registrada; no se pudo enviar el correo. Revisa el mailer.'};}
      return out({ok:true,entregado:true,correo:emailResult});
    }
    if(action==='view_delivery') {
      const orderId=validId(body.pedido_id);
      const {data:d,error}=await admin.from('cupissa_domicilios').select('pedido_id,domiciliario_id,foto_path,firma_path,entregado_en').eq('pedido_id',orderId).maybeSingle();
      if(error) throw error;
      if(!d?.entregado_en) return fail('Todavía no hay comprobante de entrega.',404);
      let authorized=isAdmin || d.domiciliario_id===user.id;
      if(!authorized){
        const {data:can,error:canError}=await scoped.rpc('cupissa_domicilios_cliente_autorizado',{p_pedido_id:orderId});
        if(canError) throw canError;
        authorized=can===true;
      }
      if(!authorized) return fail('No tienes acceso a esta entrega.',403);
      return out({ok:true,...(await deliveryUrls(d))});
    }
    return fail('Acción no reconocida.',400);
  }catch(error){
    console.error('[cupissa-domicilios]',error);
    if(error instanceof CupissaEdgeError) return fail(error,error.httpStatus,error.code);
    return fail(error,500,'UNEXPECTED_ERROR');
  }
});
