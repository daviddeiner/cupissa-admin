/* CUPISSA ADMIN | Navegación protegida para celular, escritorio y modo instalado.
   El botón Atrás del navegador vuelve al inicio del panel y no abandona la aplicación. */
(() => {
  'use strict';
  const loginScreen = document.getElementById('admin-login-screen');
  let handlingBack = false;

  function isAdminOpen() {
    try {
      return localStorage.getItem('cupissa_admin_logged') === 'true' &&
        !!loginScreen && loginScreen.classList.contains('hidden');
    } catch (_) { return false; }
  }

  function installBackGuard() {
    if (!isAdminOpen()) return;
    if (history.state && history.state.cupissaAdminBackGuard === true) return;
    try {
      history.pushState({ ...(history.state || {}), cupissaAdminBackGuard:true }, '', location.href);
    } catch (error) {
      console.warn('No fue posible activar la navegación protegida del administrador:', error);
    }
  }

  function closeOpenAdminOverlays() {
    ['modal-edit-client','modal-new-client','modal-product-form','modal-cropper'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });
    try { window.closeAdminWebModal?.(); } catch (_) {}
  }

  function returnToAdminHome() {
    if (!isAdminOpen() || handlingBack) return;
    handlingBack = true;
    try {
      // Repone inmediatamente el estado para impedir que un segundo Atrás cierre la app.
      history.pushState({ ...(history.state || {}), cupissaAdminBackGuard:true }, '', location.href);
      closeOpenAdminOverlays();
      if (typeof window.switchTab === 'function') window.switchTab('clientes');
      if (typeof window.switchClientSubtab === 'function') window.switchClientSubtab('creditos');
      window.scrollTo({ top:0, left:0, behavior:'auto' });
    } catch (error) {
      console.warn('No fue posible regresar al inicio del administrador:', error);
    } finally {
      handlingBack = false;
    }
  }

  window.addEventListener('popstate', returnToAdminHome);
  window.addEventListener('pageshow', installBackGuard);
  window.addEventListener('load', installBackGuard);
  document.addEventListener('DOMContentLoaded', installBackGuard, { once:true });
  if (loginScreen && 'MutationObserver' in window) {
    const observer = new MutationObserver(installBackGuard);
    observer.observe(loginScreen, { attributes:true, attributeFilter:['class'] });
  }
  installBackGuard();
})();
