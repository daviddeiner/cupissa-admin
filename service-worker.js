/* CUPISSA | PWA ONLINE. Sin caché offline de páginas, pedidos, productos ni credenciales. */
const ONLINE_VERSION='cupissa-online-20261112-v3';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key => /^(cupissa-shell-|cupissa-data-|cupissa-media-)/.test(key)).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='CUPISSA_SKIP_WAITING')self.skipWaiting();});
// No interceptamos fetch: la web utiliza la red y Supabase directamente.
