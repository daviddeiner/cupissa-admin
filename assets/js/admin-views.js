/* CUPISSA Studio | Módulo aislado de Vistas. Conserva las pestañas existentes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const previousSwitchTab = window.switchTab;
  if (typeof previousSwitchTab !== 'function') return;
  let refreshTimer = null;
  let pending = false;
  const formatter = new Intl.NumberFormat('es-CO');
  function showStatus(message, failed = false) {
    const status = $('cupissa-visitas-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('text-rose-600', failed);
    status.classList.toggle('text-slate-500', !failed);
  }
  async function loadViews() {
    if (pending || document.hidden || $('tab-section-vistas')?.classList.contains('hidden')) return;
    if (typeof supabaseClient === 'undefined' || !supabaseClient) { showStatus('Conexión de Supabase no disponible.', true); return; }
    pending = true;
    try {
      const { data, error } = await supabaseClient.rpc('cupissa_estadisticas_visitantes');
      if (error) throw error;
      const stats = Array.isArray(data) ? data[0] : data;
      if (!stats) throw new Error('No se recibieron datos de estadísticas.');
      $('cupissa-visitas-online').textContent = formatter.format(Number(stats.visitantes_ahora || 0));
      $('cupissa-visitas-total').textContent = formatter.format(Number(stats.total_visitas || 0));
      showStatus('Actualización automática cada 10 segundos · Última consulta: ' + new Date().toLocaleTimeString('es-CO'));
    } catch (error) {
      showStatus('No fue posible consultar las vistas. Comprueba que ejecutaste el SQL de estadísticas en Supabase. ' + (error.message || ''), true);
    } finally { pending = false; }
  }
  function start() {
    if (refreshTimer) clearInterval(refreshTimer);
    loadViews();
    refreshTimer = setInterval(loadViews, 10000);
  }
  function stop() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }
  window.switchTab = function(tab) {
    // La pestaña original sigue gestionando sus propios módulos y su estado.
    if (tab !== 'vistas') previousSwitchTab.call(this, tab);
    else previousSwitchTab.call(this, 'clientes');
    const show = tab === 'vistas';
    $('tab-section-vistas')?.classList.toggle('hidden', !show);
    if (show) {
      ['tab-section-clientes','tab-section-catalogo','tab-section-web-pedidos','tab-section-alquileres'].forEach(id => $(id)?.classList.add('hidden'));
      ['creditos','catalogo','web-pedidos','alquileres'].forEach(key => ['', '-mob'].forEach(suffix => {
        const button = $(`tab-btn-${key}${suffix}`);
        button?.classList.remove('bg-pink-50','fuchsia-text','border','border-pink-200');
        button?.classList.add('text-slate-600');
      }));
      start();
    } else stop();
    ['', '-mob'].forEach(suffix => {
      const button = $(`tab-btn-vistas${suffix}`);
      if (!button) return;
      button.classList.toggle('bg-pink-50', show);
      button.classList.toggle('fuchsia-text', show);
      button.classList.toggle('border-pink-200', show);
      button.classList.toggle('border', show);
      button.classList.toggle('text-slate-600', !show);
    });
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('tab-section-vistas')?.classList.contains('hidden')) loadViews();
  });
})();
