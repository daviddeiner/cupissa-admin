import { createClient } from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({error:'Método inválido'},405);try{
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return json({error:'Sesión requerida'},401);
const {data:{user},error}=await db.auth.getUser(token);if(error||!user||user.email?.toLowerCase()!=='contacto@cupissa.com'||!user.email_confirmed_at)return json({error:'Solo el administrador puede crear asesores'},403);
const body=await req.json();
const alias=(phone:string)=>`asesor-${phone}@asesores.invalid`;
if(body.action==='migrar_login'){
 const {data:rows,error:readError}=await db.from('asesores').select('asesor_uid,telefono_asesor').not('asesor_uid','is',null);
 if(readError)return json({error:readError.message},400);
 let migrados=0;const errores:string[]=[];
 for(const row of rows||[]){const digits=String(row.telefono_asesor||'').replace(/\D/g,'');const p=digits.length===10?'57'+digits:digits;
 if(!/^57\d{10}$/.test(p)){errores.push('Teléfono inválido: '+row.asesor_uid);continue;}
 const {data:account,error:lookup}=await db.auth.admin.getUserById(row.asesor_uid);
 if(lookup||!account.user||account.user.app_metadata?.cupissa_asesor!==true){errores.push('Cuenta no verificada como asesor: '+row.asesor_uid);continue;}
 if(account.user.email===alias(p)&&account.user.email_confirmed_at)continue;
 if(account.user.email&&account.user.email!==alias(p)){errores.push('Cuenta con correo previo: '+row.asesor_uid);continue;}
 const {error:change}=await db.auth.admin.updateUserById(row.asesor_uid,{email:alias(p),email_confirm:true});
 if(change)errores.push(row.asesor_uid+': '+change.message);else migrados++;
 }
 return json({ok:errores.length===0,migrados,errores});
}
const nombre=String(body.nombre||'').trim();let phone=String(body.telefono||'').replace(/\D/g,'');if(phone.length===10)phone='57'+phone;const password=String(body.password||'');if(!nombre||nombre.length>160||!/^57\d{10}$/.test(phone)||password.length<8||password.length>128)return json({error:'Revisa nombre, teléfono y contraseña (8–128 caracteres)'},400);
const {data:created,error:authError}=await db.auth.admin.createUser({email:alias(phone),password,email_confirm:true,app_metadata:{cupissa_asesor:true}});if(authError||!created.user)return json({error:authError?.message||'No se creó la cuenta'},400);
const {error:insertError}=await db.from('asesores').insert({asesor_uid:created.user.id,nombre_asesor:nombre,telefono_asesor:'+'+phone,activo_asesor:true});if(insertError){const rollback=await db.auth.admin.deleteUser(created.user.id);return json({error:insertError.message+(rollback.error?' — cuenta Auth pendiente de eliminar manualmente':'')},422);}return json({ok:true});
}catch(e){return json({error:e instanceof Error?e.message:'Error inesperado'},500);}});
