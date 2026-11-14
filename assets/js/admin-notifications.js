/* CUPISSA Studio | Campañas push para la aplicación, con sesión administrativa. */
(() => {
  'use strict';
  const previousSwitch = window.switchTab;
  window.switchTab = function(tab) {
    if (tab !== 'notificaciones') {
      document.getElementById('tab-section-notificaciones')?.classList.add('hidden');
      ['tab-btn-notificaciones','tab-btn-notificaciones-mob'].forEach(id => {
        document.getElementById(id)?.classList.remove('bg-pink-50','fuchsia-text');
      });
      return previousSwitch?.(tab);
    }
    // Utilizar la navegación existente; cerrar todas las demás secciones.
    const other = ['tab-section-clientes','tab-section-creditos','tab-section-web-clientes',
      'tab-section-catalogo','tab-section-web-pedidos','tab-section-alquileres',
      'tab-section-domicilios','tab-section-vistas'];
    other.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('tab-section-notificaciones')?.classList.remove('hidden');
    ['creditos','catalogo','web-pedidos','alquileres','domicilios','vistas'].forEach(key => {
      ['','-mob'].forEach(suffix => document.getElementById(`tab-btn-${key}${suffix}`)?.classList.remove('bg-pink-50','fuchsia-text'));
    });
    ['tab-btn-notificaciones','tab-btn-notificaciones-mob'].forEach(id =>
      document.getElementById(id)?.classList.add('bg-pink-50','fuchsia-text'));
    document.getElementById('cupissa-admin-more-menu')?.classList.add('hidden');
    document.querySelectorAll('[data-app-tab]').forEach(btn=>btn.classList.toggle('is-active',false));
  };
  document.getElementById('cupissa-push-campaign-form')?.addEventListener('submit',async event => {
    event.preventDefault();
    const form=event.currentTarget;
    const btn=document.getElementById('cupissa-push-submit');
    const result=document.getElementById('cupissa-push-result');
    const values=new FormData(form);
    const title=String(values.get('title') || '').trim();
    const message=String(values.get('message') || '').trim();
    const url=String(values.get('url') || '').trim();
    if (!title || !message || !url) return;
    if (!window.confirm(`¿Enviar la notificación «${title}» a todos los dispositivos suscritos de CUPISSA?`)) return;
    btn.disabled=true;
    result.textContent='Enviando notificaciones…';
    try {
      const {data,error}=await supabaseClient.functions.invoke('cupissa-push',{
        body:{action:'campaign',title,message,url},
      });
      if(error || !data?.ok) throw new Error(data?.error || error?.message || 'Error desconocido');
      result.className='text-sm font-bold text-green-700';
      result.textContent=`Enviado a ${data.result.sent} dispositivos. Suscripciones: ${data.result.targets}. Fallidos: ${data.result.failed}.`;
    } catch(error) {
      console.error('[CUPISSA PUSH]',error);
      result.className='text-sm font-bold text-red-600';
      result.textContent='No fue posible enviar la notificación: '+String(error.message || error);
    } finally {btn.disabled=false;}
  });
})();
