/* CUPISSA Studio: tema y navegación persistentes, después de los módulos. */
(() => {
  'use strict';
  const themeKey = 'cupissa_admin_theme';
  const tabKey = 'cupissa_admin_last_tab';
  const subtabKey = 'cupissa_admin_last_client_subtab';
  const tabs = new Set(['clientes','catalogo','web-pedidos','alquileres','domicilios','vistas','notificaciones']);
  const $ = id => document.getElementById(id);
  function setTheme(dark) {
    document.documentElement.classList.toggle('admin-dark', dark);
    const button = $('admin-theme-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
      button.title = dark ? 'Activar modo claro' : 'Activar modo oscuro';
      button.innerHTML = dark ? '<i class="fa-solid fa-sun"></i><span>Claro</span>' : '<i class="fa-solid fa-moon"></i><span>Oscuro</span>';
    }
    try { localStorage.setItem(themeKey, dark ? 'dark' : 'light'); } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#0f172a' : '#ffffff';
  }
  const underlyingSwitch = window.switchTab;
  function syncNavigation(tab) {
    const active = tab === 'creditos' || tab === 'web-clientes' ? 'clientes' : tab;
    const mapped = { clientes:'creditos', catalogo:'catalogo', 'web-pedidos':'web-pedidos', alquileres:'alquileres', domicilios:'domicilios', vistas:'vistas', notificaciones:'notificaciones' };
    Object.entries(mapped).forEach(([section, key]) => {
      ['', '-mob'].forEach(suffix => {
        const button = $(`tab-btn-${key}${suffix}`);
        if (!button) return;
        const selected = active === section;
        button.classList.toggle('bg-pink-50', selected);
        button.classList.toggle('fuchsia-text', selected);
        button.classList.toggle('border', selected);
        button.classList.toggle('border-pink-200', selected);
        button.classList.toggle('text-slate-600', !selected);
        button.classList.toggle('admin-web-active', selected);
        button.setAttribute('aria-current', selected ? 'page' : 'false');
      });
    });
    document.querySelectorAll('[data-app-tab]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.appTab === active);
    });
    document.querySelectorAll('#cupissa-admin-more-menu button').forEach(button => {
      const target = button.getAttribute('onclick')?.match(/switchTab\('([^']+)'\)/)?.[1];
      button.classList.toggle('is-active', target === tab);
    });
  }
  window.switchTab = function(tab) {
    underlyingSwitch?.call(this, tab);
    const normalized = tab === 'creditos' || tab === 'web-clientes' ? 'clientes' : tab;
    if (tabs.has(normalized)) {
      try { localStorage.setItem(tabKey, normalized); } catch (_) {}
      syncNavigation(normalized);
    }
  };
  const underlyingSubtab = window.switchClientSubtab;
  if (underlyingSubtab) window.switchClientSubtab = function(subtab) {
    underlyingSubtab.call(this, subtab);
    try { localStorage.setItem(subtabKey, subtab === 'web' ? 'web' : 'creditos'); } catch (_) {}
  };
  document.addEventListener('DOMContentLoaded', () => {
    let dark = false, lastTab = 'clientes', subtab = 'creditos';
    try {
      dark = localStorage.getItem(themeKey) === 'dark';
      lastTab = localStorage.getItem(tabKey) || 'clientes';
      subtab = localStorage.getItem(subtabKey) || 'creditos';
    } catch (_) {}
    setTheme(dark);
    $('admin-theme-toggle')?.addEventListener('click', () => setTheme(!document.documentElement.classList.contains('admin-dark')));
    if (tabs.has(lastTab)) {
      window.switchTab(lastTab);
      if (lastTab === 'clientes' && subtab === 'web') window.switchClientSubtab?.('web');
    }
  });
})();
