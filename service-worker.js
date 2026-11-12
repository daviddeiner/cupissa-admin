/* CUPISSA | Offline progresivo seguro: no convierte pagos ni créditos en acciones locales. */
const VERSION='20261112-admin-1000-v2-admin';
const SHELL='cupissa-shell-'+VERSION;
const DATA='cupissa-data-'+VERSION;
const MEDIA='cupissa-media-'+VERSION;
const APP_SHELL=["./admin-icon-192.png", "./admin-icon-512.png", "./assets/css/admin-enhancements.css", "./assets/css/admin-modules.css", "./assets/css/admin-web.css", "./assets/js/00-config.js", "./assets/js/admin-core.js", "./assets/js/admin-dialogs.js", "./assets/js/admin-enhancements.js", "./assets/js/admin-navigation.js", "./assets/js/admin-products.js", "./assets/js/admin-rentals.js", "./assets/js/admin-views.js", "./assets/js/admin-web.js", "./assets/js/security-console-notice.js", "./favicon.png", "./index.html", "./logo.png", "./manifest.webmanifest", "./offline/estado.js", "./service-worker.js"];
const ORIGIN=self.location.origin;
const SUPABASE_HOST='lkdxtesgwqoizobxaawp.supabase.co';
const ADMIN=true;
const CDN_HOSTS=new Set(['cdn.tailwindcss.com','cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com','unpkg.com']);
const isApi=(url)=>url.hostname===SUPABASE_HOST;
const isPublicProduct=(url)=>url.pathname==='/rest/v1/productos';
const allowedRead=(url,request)=>{
 if(!isApi(url)||request.method!=='GET')return false;
 if(url.pathname.startsWith('/storage/v1/object/public/'))return true;
 if(url.pathname.startsWith('/auth/')||url.pathname.startsWith('/functions/')||url.pathname.startsWith('/rpc/'))return false;
 return ADMIN?url.pathname.startsWith('/rest/v1/'):isPublicProduct(url);
};
function cacheKey(request){return request;}
async function cachedNetwork(request,store,firstCache=false){
 const cache=await caches.open(store);
 const saved=await cache.match(cacheKey(request));
 if(firstCache&&saved){fetch(request).then(res=>{if(res.ok)cache.put(cacheKey(request),res.clone());}).catch(()=>{});return saved;}
 try {
  const response=await fetch(request);
  if(response.ok&&response.type!=='opaque'){
    try{await cache.put(cacheKey(request),response.clone());}catch(_){}
  }
  return response;
 }catch(err){if(saved)return saved;throw err;}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(SHELL);
 // Se descargan con concurrencia limitada, sin interrumpir la instalación por un archivo que falle.
 const queue=[...APP_SHELL]; const workers=Array.from({length:5},async()=>{
  while(queue.length){const path=queue.shift();try{const req=new Request(new URL(path,self.registration.scope));const response=await fetch(req);if(response.ok)await cache.put(req,response);}catch(_){}}
 });await Promise.all(workers);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys()){
  if((key.startsWith('cupissa-shell-')||key.startsWith('cupissa-data-')||key.startsWith('cupissa-media-'))&&![SHELL,DATA,MEDIA].includes(key))await caches.delete(key);
 }await self.clients.claim();
})()));
async function notify(type,extra={}){for(const client of await self.clients.matchAll({includeUncontrolled:true,type:'window'})){client.postMessage({type,...extra});}}
// Las ediciones locales no se marcan como confirmadas en Supabase: quedan en cola con aviso.
const DBNAME='cupissa-pending-operations-v1';
function dbOpen(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DBNAME,1);request.onupgradeneeded=()=>request.result.createObjectStore('operations',{keyPath:'id',autoIncrement:true});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function dbAll(){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('operations','readonly');const req=tx.objectStore('operations').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
async function dbPut(entry){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('operations','readwrite');tx.objectStore('operations').add(entry);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);});}
async function dbDelete(id){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('operations','readwrite');tx.objectStore('operations').delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);});}
function mayQueue(req,url,body){
 if(!ADMIN||req.method!=='PATCH'||!isApi(url)||!url.pathname.startsWith('/rest/v1/'))return false;
 const table=url.pathname.split('/').pop();
 if(!['productos','pedidos_web','clientes_web','configuracion_pedidos_web'].includes(table))return false;
 if(!url.searchParams.has('id'))return false;
 if(!body||body.length>350000||!req.headers.has('authorization'))return false;
 try{
  const changes=JSON.parse(body);if(!changes||typeof changes!=='object'||Array.isArray(changes))return false;
  const forbidden=['estado','status','entregado','pagado','saldo','cupo','credito','cuota','deuda','anticipo','total','valor'];
  if(Object.keys(changes).some(k=>forbidden.some(piece=>k.toLowerCase().includes(piece))))return false;
  // La edición de fotografías debe hacerse con conexión.
  if(Object.values(changes).some(v=>typeof v==='string'&&v.startsWith('data:image/')))return false;
  return true;
 }catch(_){return false;}
}
let syncing=false;
async function syncPending(){
 if(!ADMIN||syncing)return;syncing=true;
 try{
  const entries=await dbAll();let remaining=entries.length;
  for(const entry of entries){
   try{
    const headers=new Headers(entry.headers);
    const result=await fetch(entry.url,{method:entry.method,headers,body:entry.body});
    if(!result.ok){await notify('CUPISSA_SYNC_PROBLEM',{status:result.status});break;}
    await dbDelete(entry.id);remaining--;
   }catch(_){break;}
  }
  await notify('CUPISSA_SYNC_FINISHED',{remaining});
 }catch(_){await notify('CUPISSA_SYNC_PROBLEM');}finally{syncing=false;}
}
self.addEventListener('message',event=>{
 if(event.data?.type==='CUPISSA_SYNC_PENDING')event.waitUntil(syncPending());
 if(event.data?.type==='CUPISSA_SKIP_WAITING')self.skipWaiting();
 if(event.data?.type==='CUPISSA_ADMIN_LOGOUT')event.waitUntil((async()=>{await caches.delete(DATA);await caches.delete(MEDIA);})());
});
self.addEventListener('sync',event=>{if(event.tag==='cupissa-pending-edits')event.waitUntil(syncPending());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'){
  if(ADMIN&&request.method==='PATCH'&&isApi(url)&&url.pathname.startsWith('/rest/v1/')){
   event.respondWith((async()=>{
    // Priorizar siempre servidor. En caso de desconexión, solo encolar operaciones permitidas.
    try{return await fetch(request.clone());}catch(err){
     let body='';try{body=await request.clone().text();}catch(_){}
     if(!mayQueue(request,url,body))throw err;
     await dbPut({url:request.url,method:request.method,headers:[...request.headers],body,createdAt:Date.now()});
     await notify('CUPISSA_OFFLINE_QUEUED');
     try{await self.registration.sync?.register('cupissa-pending-edits');}catch(_){}
     // Supabase parsea respuestas con representación; no devolver datos falsos.
     return new Response('[]',{status:200,headers:{'content-type':'application/json','x-cupissa-offline-queued':'1'}});
    }
   })());
  }return;
 }
 if(allowedRead(url,request)){
  event.respondWith(cachedNetwork(request,url.pathname.includes('/storage/')?MEDIA:DATA).catch(()=>Response.error()));return;
 }
 if(CDN_HOSTS.has(url.hostname)){
  event.respondWith(cachedNetwork(request,MEDIA).catch(()=>Response.error()));return;
 }
 if(url.origin!==ORIGIN)return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{try{return await cachedNetwork(request,SHELL);}catch(_){const cache=await caches.open(SHELL);return await cache.match(request)||await cache.match(new URL('./index.html',self.registration.scope))||Response.error();}})());return;
 }
 // Recursos versionados: servir copia instantáneamente cuando existe y revalidar silenciosamente.
 event.respondWith(cachedNetwork(request,SHELL,['script','style','image','font'].includes(request.destination)).catch(()=>Response.error()));
});
