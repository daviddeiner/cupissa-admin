/* CUPISSA | estado de conexión y sincronización sin cambiar formularios */
(()=>{
  const ADMIN=!!document.querySelector('#admin-login-screen');
  const ID='cupissa-offline-status';
  function online(){return navigator.onLine;}
  function render(){
    let bar=document.getElementById(ID);
    if(!bar){
      bar=document.createElement('div');bar.id=ID;bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');
      bar.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483000;max-width:560px;margin:auto;padding:12px 15px;border:1px solid #eed0df;border-radius:12px;background:#fff8fb;color:#34212c;box-shadow:0 5px 24px #0002;font:13px/1.45 system-ui,Arial,sans-serif;display:none';
      document.body.appendChild(bar);
    }
    if(online()&&!bar.dataset.pending){bar.style.display='none';return;}
    bar.style.display='block';
    bar.textContent=online()? 'CUPISSA: conexión recuperada. '+(bar.dataset.pending?'Hay cambios por sincronizar.':'Actualizando datos…') : ADMIN ? 'MODO SIN CONEXIÓN: puedes consultar datos previamente cargados. Los cambios compatibles que se hagan sin internet quedarán pendientes; pagos, créditos, entregas, archivos y nuevas altas requieren conexión.' : 'MODO SIN CONEXIÓN: puedes consultar las páginas y productos previamente cargados. Los pagos, compras, acceso a la cuenta y datos no descargados requieren internet.';
  }
  window.addEventListener('online',()=>{render();navigator.serviceWorker?.controller?.postMessage({type:'CUPISSA_SYNC_PENDING'});});
  window.addEventListener('offline',render);
  navigator.serviceWorker?.addEventListener('message',ev=>{
    const message=ev.data||{}; const bar=document.getElementById(ID);
    if(message.type==='CUPISSA_OFFLINE_QUEUED'&&bar){bar.dataset.pending='1';render();}
    if(message.type==='CUPISSA_SYNC_FINISHED'&&bar){bar.dataset.pending=String(message.remaining||'');render();if(!message.remaining&&navigator.onLine)bar.style.display='none';}
    if(message.type==='CUPISSA_SYNC_PROBLEM'&&bar){bar.dataset.pending='1';render();bar.textContent='CUPISSA: hay cambios pendientes sin sincronizar. Abre la página con internet e inicia sesión para revisarlos.';}
  });
  if('serviceWorker' in navigator){navigator.serviceWorker.ready.then(r=>{if(online())r.active?.postMessage({type:'CUPISSA_SYNC_PENDING'});}).catch(()=>{});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();
