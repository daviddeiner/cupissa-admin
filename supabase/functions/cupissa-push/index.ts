import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// CUPISSA | Web Push para app PWA. Requiere SQL CONFIGURAR_NOTIFICACIONES_APP.
const env = (k:string) => Deno.env.get(k) || '';
const db = createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{
  auth:{persistSession:false,autoRefreshToken:false},
});
const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const reply = (value:unknown,status=200) => Response.json(value,{status,headers:cors});
const jwtFrom = (req:Request) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'').trim();
const validUrl = (value:unknown) => {
  try {
    const url = new URL(String(value || ''),'https://cupissa.com');
    if (url.protocol!=='https:') return null;
    return url.toString();
  } catch {return null;}
};
async function signedUser(req:Request) {
  const jwt = jwtFrom(req);
  if (!jwt) return null;
  const {data,error} = await db.auth.getUser(jwt);
  return error ? null : data.user;
}
async function isService(req:Request) {
  const key = jwtFrom(req);
  if (!key) return false;
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users?page=1&per_page=1`,{
    headers:{'Authorization':`Bearer ${key}`,'apikey':key},signal:AbortSignal.timeout(10000),cache:'no-store',
  }).catch(()=>null);
  return res?.ok === true;
}
async function keys() {
  const {data,error} = await db.from('cupissa_push_settings').select('*').eq('id',1).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const generated = webpush.generateVAPIDKeys();
  const {data:created,error:insertError} = await db.from('cupissa_push_settings')
    .upsert({id:1,vapid_public:generated.publicKey,vapid_private:generated.privateKey},{onConflict:'id',ignoreDuplicates:true})
    .select('*').maybeSingle();
  if (insertError) throw insertError;
  if (created) return created;
  const {data:existing,error:readError} = await db.from('cupissa_push_settings').select('*').eq('id',1).single();
  if (readError) throw readError;
  return existing;
}
type Notice = {title:string;body:string;url:string;tag?:string;imageUrl?:string};
async function sendToSubscribers(subs:Array<{endpoint:string;subscription:unknown}>,notice:Notice) {
  if (!subs.length) return {targets:0,sent:0,failed:0};
  const vapid = await keys();
  webpush.setVapidDetails('mailto:contacto@cupissa.com',vapid.vapid_public,vapid.vapid_private);
  let sent=0,failed=0;
  const payload = JSON.stringify({...notice,icon:notice.imageUrl || '/catalogo/assets/images/favicon.png',
    badge:'/catalogo/assets/images/favicon.png'});
  // Lotes reducidos para no saturar Supabase ni el servicio push.
  for(let offset=0;offset<subs.length;offset+=15) {
    const chunk = subs.slice(offset,offset+15);
    await Promise.all(chunk.map(async sub=>{
      try {await webpush.sendNotification(sub.subscription as any,payload,{TTL:86400});sent++;}
      catch(error) {
        failed++;
        const status = Number((error as {statusCode?:number}).statusCode || 0);
        if (status===404 || status===410) await db.from('cupissa_push_subscriptions').delete().eq('endpoint',sub.endpoint);
        else console.warn('[cupissa-push] Envío fallido:',status,String(error).slice(0,120));
      }
    }));
  }
  return {targets:subs.length,sent,failed};
}
async function activeForUser(userId:string) {
  const {data,error} = await db.from('cupissa_push_subscriptions').select('endpoint,subscription')
    .eq('user_id',userId).eq('active',true).limit(100);
  if (error) throw error;
  return data || [];
}
async function ownerForOrder(order:Record<string,unknown>) {
  const ids = [order.cliente_web_id,order.cliente_id].filter(v=>v!=null).map(String);
  for (const id of ids) {
    const {data} = await db.from('clientes_web').select('auth_user_id').eq('id',id).maybeSingle();
    if (data?.auth_user_id) return String(data.auth_user_id);
  }
  for (const id of ids) {
    const {data} = await db.from('clientes_web').select('auth_user_id').eq('cliente_id',id).limit(2);
    if (data?.length===1 && data[0].auth_user_id) return String(data[0].auth_user_id);
  }
  const phone = String(order.telefono || order.contacto || '').trim();
  if (phone) {
    const {data} = await db.from('clientes_web').select('auth_user_id').eq('telefono',phone).limit(2);
    if (data?.length===1 && data[0].auth_user_id) return String(data[0].auth_user_id);
  }
  return null;
}
async function processQueue() {
  const {data,error} = await db.from('cupissa_push_outbox').select('*').is('procesado_en',null).lt('intentos',5)
    .order('id',{ascending:true}).limit(75);
  if (error) throw error;
  const summary = {queued:data?.length || 0,sent:0,errors:0};
  for (const item of data || []) {
    const {data:claim,error:claimError} = await db.from('cupissa_push_outbox')
      .update({intentos:Number(item.intentos || 0)+1}).eq('id',item.id)
      .eq('intentos',Number(item.intentos || 0)).is('procesado_en',null)
      .select('id').maybeSingle();
    if (claimError || !claim) continue;
    try {
      const {data:order,error:orderError} = await db.from('pedidos_web').select('*').eq('id',item.pedido_id).maybeSingle();
      if (orderError) throw orderError;
      if (!order) {await db.from('cupissa_push_outbox').update({procesado_en:new Date().toISOString(),error:'Pedido eliminado'}).eq('id',item.id);continue;}
      const uid = await ownerForOrder(order);
      if (!uid) {await db.from('cupissa_push_outbox').update({procesado_en:new Date().toISOString(),error:'Cliente sin cuenta vinculada'}).eq('id',item.id);continue;}
      const subs = await activeForUser(uid);
      const number=String(order.numero_pedido || order.codigo || order.id);
      const outcome=await sendToSubscribers(subs,{
        title:'CUPISSA | Estado de tu pedido',
        body:`Tu pedido ${number} cambió a: ${item.estado}. Toca para consultar el detalle.`,
        url:'https://app.cupissa.com/catalogo/?seccion=perfil',tag:`pedido-${number}-${item.id}`,
      });
      await db.from('cupissa_push_outbox').update({procesado_en:new Date().toISOString(),error:outcome.failed?`${outcome.failed} dispositivos no recibieron el aviso`:null}).eq('id',item.id);
      summary.sent+=outcome.sent;
    } catch(e) {
      summary.errors++;
      await db.from('cupissa_push_outbox').update({error:String(e).slice(0,400)}).eq('id',item.id);
    }
  }
  return summary;
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return reply({ok:false,error:'Método no permitido'},405);
  try {
    const body = await req.json() as Record<string,unknown>;
    const action = String(body.action || '');
    if (action==='process') {
      if (!(await isService(req))) return reply({ok:false,error:'Credencial de servicio no autorizada'},401);
      return reply({ok:true,result:await processQueue()});
    }
    const user = await signedUser(req);
    if (!user) return reply({ok:false,error:'Inicia sesión'},401);
    const isAdmin = !!env('CUPISSA_ADMIN_EMAIL') &&
      String(user.email || '').trim().toLowerCase() === env('CUPISSA_ADMIN_EMAIL').trim().toLowerCase();
    if (action==='config') return reply({ok:true,vapidPublicKey:(await keys()).vapid_public});
    if (action==='subscribe') {
      const subscription=body.subscription as Record<string,unknown>;
      const endpoint=String(subscription?.endpoint || '');
      const auth = (subscription?.keys as Record<string,unknown>)?.auth;
      const p256dh = (subscription?.keys as Record<string,unknown>)?.p256dh;
      if (!endpoint.startsWith('https://') || !auth || !p256dh || endpoint.length>2048)
        return reply({ok:false,error:'Suscripción inválida'},400);
      const {error} = await db.from('cupissa_push_subscriptions').upsert({
        endpoint,user_id:user.id,subscription,active:true,updated_at:new Date().toISOString(),
      },{onConflict:'endpoint'});
      if(error) throw error;
      return reply({ok:true});
    }
    if (action==='unsubscribe') {
      const {error} = await db.from('cupissa_push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',String(body.endpoint || ''));
      if(error) throw error;
      return reply({ok:true});
    }
    if (action==='upload_image') {
      if (!isAdmin) return reply({ok:false,error:'Acceso exclusivo de administración'},403);
      const mime=String(body.mime || '');
      const types:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
      const extension=types[mime];
      const base64=String(body.fileBase64 || '');
      if(!extension || !base64 || base64.length>5_600_000)
        return reply({ok:false,error:'Imagen inválida o superior a 4 MB'},400);
      let bytes:Uint8Array;
      try {bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));}
      catch {return reply({ok:false,error:'No se pudo leer la imagen'},400);}
      if(bytes.length>4*1024*1024) return reply({ok:false,error:'Máximo 4 MB'},400);
      // Validar la firma real, además del MIME declarado.
      const png=bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4e && bytes[3]===0x47;
      const jpg=bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
      const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP';
      if (!(mime==='image/png'&&png || mime==='image/jpeg'&&jpg || mime==='image/webp'&&webp))
        return reply({ok:false,error:'El formato real del archivo no coincide con la imagen'},400);
      const bucket='cupissa-push-media';
      const {error:bucketError}=await db.storage.getBucket(bucket);
      if(bucketError) {
        const {error:createError}=await db.storage.createBucket(bucket,{
          public:true,fileSizeLimit:4*1024*1024,allowedMimeTypes:Object.keys(types),
        });
        if(createError && !String(createError.message).toLowerCase().includes('already exists')) throw createError;
      }
      const path=`campanas/${crypto.randomUUID()}.${extension}`;
      const {error:uploadError}=await db.storage.from(bucket).upload(path,bytes,{
        contentType:mime,cacheControl:'31536000',upsert:false,
      });
      if(uploadError) throw uploadError;
      const {data:link}=db.storage.from(bucket).getPublicUrl(path);
      return reply({ok:true,imageUrl:link.publicUrl});
    }
    if (action==='campaign') {
      if (!isAdmin)
        return reply({ok:false,error:'Acceso exclusivo de administración'},403);
      const title=String(body.title || '').trim().slice(0,90);
      const message=String(body.message || '').trim().slice(0,260);
      const url=validUrl(body.url);
      const imageUrl=body.imageUrl ? validUrl(body.imageUrl) : null;
      if(!title || !message || !url) return reply({ok:false,error:'Completa título, mensaje y un enlace HTTPS válido'},400);
      if(body.imageUrl && (!imageUrl || !imageUrl.includes('/storage/v1/object/public/cupissa-push-media/')))
        return reply({ok:false,error:'La imagen debe provenir de la carpeta privada de campañas CUPISSA'},400);
      const all:Array<{endpoint:string;subscription:unknown}>=[];
      for(let from=0;from<10000;from+=500) {
        const {data,error}=await db.from('cupissa_push_subscriptions').select('endpoint,subscription').eq('active',true).range(from,from+499);
        if(error) throw error;
        all.push(...(data || []));
        if((data || []).length<500) break;
      }
      const result=await sendToSubscribers(all,{title,body:message,url,imageUrl:imageUrl || undefined,
        tag:`cupissa-promo-${Date.now()}`});
      await db.from('cupissa_push_campaigns').insert({titulo:title,mensaje:message,enlace:url,enviado_por:user.email,
        destinatarios:result.targets,exitos:result.sent});
      return reply({ok:true,result});
    }
    return reply({ok:false,error:'Acción no reconocida'},400);
  } catch(error) {
    console.error('[cupissa-push]',error);
    return reply({ok:false,error:'No se pudo completar la operación',detail:String(error).slice(0,250)},500);
  }
});
