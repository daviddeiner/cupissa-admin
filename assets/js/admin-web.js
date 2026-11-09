/* CUPISSA ADMIN | Módulo independiente para clientes_web y pedidos_web.
   No reemplaza ni modifica la gestión histórica de clientes, créditos o productos. */
(() => {
  const db = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cop = value => '$ ' + new Intl.NumberFormat('es-CO').format(Number(value || 0));
  const states = ['AGENDADO','EN FABRICACIÓN','EN DEPARTAMENTO DE DESPACHO','EN CAMINO','ENTREGADO','CANCELADO'];
  let webClients = [];
  let creditClients = [];
  let filteredWebClients = [];
  let webOrders = [];
  let filteredWebOrders = [];
  let maxOrdersPerDay = 20;
  // Los perfiles web de CUPISSA se guardan específicamente en public.clientes_web.
  let webClientsTable = 'clientes_web';
  const ADMIN_WEB_CHUNK = 20;
  let webClientVisible = ADMIN_WEB_CHUNK;
  let webOrderVisible = ADMIN_WEB_CHUNK;
  let webClientObserver = null;
  let webOrderObserver = null;
  function observeAdminList(sentinelId, kind) {
    const sentinel = $(sentinelId);
    if (!sentinel || !('IntersectionObserver' in window)) return;
    const key = kind === 'clients' ? 'webClientObserver' : 'webOrderObserver';
    if (kind === 'clients' && webClientObserver) webClientObserver.disconnect();
    if (kind === 'orders' && webOrderObserver) webOrderObserver.disconnect();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      if (kind === 'clients') {
        if (webClientVisible >= filteredWebClients.length) return;
        webClientVisible = Math.min(filteredWebClients.length, webClientVisible + ADMIN_WEB_CHUNK);
        renderWebClients();
      } else {
        if (webOrderVisible >= filteredWebOrders.length) return;
        webOrderVisible = Math.min(filteredWebOrders.length, webOrderVisible + ADMIN_WEB_CHUNK);
        renderWebOrders();
      }
    }, { rootMargin: '350px 0px' });
    observer.observe(sentinel);
    if (kind === 'clients') webClientObserver = observer; else webOrderObserver = observer;
  }


  async function resolveWebClientsTable() {
    // Verifica acceso y existencia de la tabla antes de utilizarla.
    const { error } = await db.from('clientes_web').select('id').limit(1);
    if (error) throw error;
    return webClientsTable;
  }

  function adminReady() { return localStorage.getItem('cupissa_admin_logged') === 'true' && !!db; }
  function renderLoadError(tbodyId, colspan, message) {
    const body = $(tbodyId); if (body) body.innerHTML = `<tr><td colspan="${colspan}" class="p-6 text-center text-rose-600">${esc(message)}</td></tr>`;
  }
  function clientName(client) { return [client?.nombres, client?.apellidos].filter(Boolean).join(' ') || 'Cliente sin nombre'; }

  async function loadWebAdminData() {
    if (!adminReady()) return;
    await loadWebClients();
    await loadWebOrders();
    await loadDailyCapacityConfig();
  }
  async function loadWebClients() {
    try {
      const tableName = await resolveWebClientsTable();
      const { data, error } = await db.from(tableName).select('*');
      if (error) throw error;
      webClients = (data || []).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      filteredWebClients = [...webClients]; webClientVisible = ADMIN_WEB_CHUNK; renderWebClients();
      try {
        const creditResult = await db.from('clientes').select('*').order('nombre', { ascending:true });
        if (creditResult.error) throw creditResult.error;
        creditClients = creditResult.data || [];
      } catch (creditError) {
        console.warn('No fue posible consultar clientes con crédito para el selector de pedidos:', creditError);
        creditClients = [];
      }
      populateOrderClientSelect();
    } catch (error) {
      console.error('No fue posible consultar la tabla de clientes web:', error);
      renderLoadError('web-clients-tbody',9,'No se pudieron cargar los clientes de public.clientes_web. Verifica que exista la tabla y que Supabase permita su lectura.');
    }
  }
  async function loadWebOrders() {
    try {
      const { data, error } = await db.from('pedidos_web').select('*').order('created_at', { ascending:false });
      if (error) throw error;
      webOrders = (data || []).map(order => { const orderKeys = [order.cliente_web_id, order.cliente_id].filter(v => v != null).map(String); const linked = webClients.find(c => [c.id, c.cliente_id].filter(v => v != null).some(value => orderKeys.includes(String(value)))); return {...order, _client:linked || null}; });
      ensureOrderFilterDefaults();
      filterWebOrders();
    } catch (error) {
      console.error('No fue posible consultar pedidos_web:', error);
      renderLoadError('web-orders-tbody',13,'No se pudieron cargar los pedidos. Verifica que exista pedidos_web y que Supabase permita la consulta.');
    }
  }
  function renderWebClients() {
    const body = $('web-clients-tbody'); if (!body) return;
    $('web-clients-total').textContent = webClients.length;
    if (!filteredWebClients.length) { body.innerHTML = '<tr><td colspan="9" class="p-7 text-center text-slate-400">No hay clientes web registrados.</td></tr>'; return; }
    body.innerHTML = filteredWebClients.slice(0, webClientVisible).map(c => `<tr class="hover:bg-slate-50">
      <td class="admin-web-table-cell font-bold">${esc(c.nombres)}</td>
      <td class="admin-web-table-cell">${esc(c.apellidos)}</td>
      <td class="admin-web-table-cell font-mono">${esc(c.cedula || '—')}</td>
      <td class="admin-web-table-cell font-mono">${esc(c.telefono)}</td>
      <td class="admin-web-table-cell">${esc(c.correo)}</td>
      <td class="admin-web-table-cell">${esc(c.direccion)}</td>
      <td class="admin-web-table-cell">${esc(c.barrio)}</td>
      <td class="admin-web-table-cell">${esc(c.ciudad)}</td>
      <td class="admin-web-table-cell"><div class="flex items-center gap-1">
        <button type="button" class="admin-web-button" onclick="viewWebClient('${esc(c.id)}')"><i class="fa-solid fa-pen mr-1"></i> Editar ficha</button>
        <button type="button" class="admin-web-delete" title="Eliminar cliente y sus pedidos asociados" aria-label="Eliminar cliente" onclick="deleteWebClient('${esc(c.id)}')"><i class="fa-solid fa-trash"></i></button>
      </div></td></tr>`).join('') + (webClientVisible < filteredWebClients.length ? `<tr id="web-clients-scroll-sentinel"><td colspan="9" class="p-3 text-center text-xs text-slate-400">Cargando más clientes al desplazarte…</td></tr>` : '');
    observeAdminList('web-clients-scroll-sentinel', 'clients');
  }
  function renderWebOrders() {
    const body = $('web-orders-tbody'); if (!body) return;
    if (!filteredWebOrders.length) { body.innerHTML = '<tr><td colspan="13" class="p-7 text-center text-slate-400">Todavía no hay pedidos web registrados.</td></tr>'; return; }
    body.innerHTML = filteredWebOrders.slice(0, webOrderVisible).map(o => {
      const items = Array.isArray(o.productos) ? o.productos : [];
      const orderImages = Array.isArray(o.imagenes) ? o.imagenes : [...new Set(items.flatMap(p => Array.isArray(p.imagenes) ? p.imagenes : (p.imagen_url ? [p.imagen_url] : [])))];
      const photoCount = orderImages.length;
      const rest = orderBalance(o);
      const statusOptions = states.map(s => `<option value="${s}" ${String(o.estado||'AGENDADO')===s?'selected':''}>${s}</option>`).join('');
      const type = o.tipo_pedido || o.tipo_servicio || (items.some(p => p.modalidad === 'ALQUILER') ? 'ALQUILER' : 'VENTA');
      return `<tr class="hover:bg-slate-50">
        <td class="admin-web-table-cell font-black text-pink-700">${esc(o.numero_pedido || o.codigo || 'CUP')}</td>
        <td class="admin-web-table-cell">${items.map(p=>esc(p.nombre||p.producto||'Producto')).join('<br>') || '—'}</td>
        <td class="admin-web-table-cell">${esc(type)}</td><td class="admin-web-table-cell">${esc(o.fecha_entrega)}</td>
        <td class="admin-web-table-cell font-bold">${esc(clientName(o._client) !== 'Cliente sin nombre' ? clientName(o._client) : (o.cliente_nombre || 'Cliente sin nombre'))}</td><td class="admin-web-table-cell">${esc(o.contacto || o.telefono || o._client?.telefono)}</td>
        <td class="admin-web-table-cell">${esc(o.ubicacion || [o.direccion,o.barrio,o.ciudad].filter(Boolean).join(', ') || o._client?.direccion)}</td>
        <td class="admin-web-table-cell font-bold">${cop(o.total)}</td><td class="admin-web-table-cell">${cop(o.domicilio_envio ?? o.envio)}</td>
        <td class="admin-web-table-cell">${cop(o.anticipo)}</td><td class="admin-web-table-cell font-black text-pink-700">${cop(rest)}</td>
        <td class="admin-web-table-cell"><button type="button" class="admin-web-button" onclick="viewWebOrder('${esc(o.id)}')"><i class="fa-regular fa-images mr-1"></i> Ver (${photoCount})</button></td>
        <td class="admin-web-table-cell"><div class="flex items-center gap-2"><select class="admin-web-status" aria-label="Cambiar estado de pedido" onchange="changeWebOrderStatus('${esc(o.id)}',this.value)">${statusOptions}</select><button type="button" class="admin-web-delete" title="Eliminar pedido" aria-label="Eliminar pedido" onclick="deleteWebOrder('${esc(o.id)}')"><i class="fa-solid fa-trash"></i></button></div></td>
      </tr>`;
    }).join('') + (webOrderVisible < filteredWebOrders.length ? `<tr id="web-orders-scroll-sentinel"><td colspan="13" class="p-3 text-center text-xs text-slate-400">Cargando más pedidos al desplazarte…</td></tr>` : '');
    observeAdminList('web-orders-scroll-sentinel', 'orders');
  }
  function filterWebClients() {
    const q = ($('web-client-search')?.value || '').trim().toLowerCase();
    webClientVisible = ADMIN_WEB_CHUNK;
    filteredWebClients = webClients.filter(c => [c.nombres,c.apellidos,c.cedula,c.telefono,c.correo,c.direccion,c.barrio,c.ciudad].some(v => String(v||'').toLowerCase().includes(q)));
    renderWebClients();
  }
  function bogotaDateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(value);
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function deliveryDateKey(order) {
    const raw = order?.fecha_entrega || order?.fecha_entrega_programada || order?.delivery_date || '';
    if (!raw) return '';
    const value = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value.slice(0, 10) : bogotaDateKey(date);
  }
  function normalizeOrderStatus(value) {
    return String(value || '').trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  }
  function orderBalance(order) {
    const total = Number(order?.total || 0);
    const shipping = Number(order?.domicilio_envio ?? order?.envio ?? order?.domicilio ?? 0);
    const advance = Number(order?.anticipo || 0);
    return Math.max(0, total + shipping - advance);
  }
  function ensureOrderFilterDefaults() {
    const month = $('web-order-month');
    if (month && !month.value) month.value = bogotaDateKey().slice(0, 7);
  }
  function renderOrdersDashboard() {
    const month = $('web-order-month')?.value || bogotaDateKey().slice(0, 7);
    const today = bogotaDateKey();
    const monthOrders = webOrders.filter(order => deliveryDateKey(order).slice(0, 7) === month);
    const nonCancelledMonthOrders = monthOrders.filter(order => normalizeOrderStatus(order.estado) !== 'CANCELADO');
    const pendingChargeMonthOrders = nonCancelledMonthOrders.filter(order => normalizeOrderStatus(order.estado) !== 'ENTREGADO');
    const count = (id, value) => { const node = $(id); if (node) node.textContent = String(value); };
    const money = value => '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits:0 }).format(Number(value || 0));
    count('orders-kpi-month-count', monthOrders.length);
    // Todos los indicadores de periodo se calculan exclusivamente con fecha_entrega.
    count('orders-kpi-today', webOrders.filter(order => deliveryDateKey(order) === today).length);
    count('orders-kpi-transit', webOrders.filter(order => normalizeOrderStatus(order.estado) === 'EN CAMINO').length);
    count('orders-kpi-delivered', monthOrders.filter(order => normalizeOrderStatus(order.estado) === 'ENTREGADO').length);
    // Las ventas suman solo el total de productos; el domicilio no se incluye.
    count('orders-kpi-sales', money(nonCancelledMonthOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)));
    // Los pedidos entregados ya no hacen parte del saldo pendiente por cobrar.
    count('orders-kpi-balance', money(pendingChargeMonthOrders.reduce((sum, order) => sum + orderBalance(order), 0)));
  }
  function filterWebOrders() {
    ensureOrderFilterDefaults();
    const q = ($('web-order-search')?.value || '').trim().toLowerCase();
    const month = $('web-order-month')?.value || '';
    const day = $('web-order-day')?.value || '';
    const state = normalizeOrderStatus($('web-order-status-filter')?.value || '');
    webOrderVisible = ADMIN_WEB_CHUNK;
    filteredWebOrders = webOrders.filter(order => {
      const date = deliveryDateKey(order);
      if (month && date.slice(0, 7) !== month) return false;
      if (day && date !== day) return false;
      if (state && normalizeOrderStatus(order.estado) !== state) return false;
      return !q || [order.numero_pedido,order.codigo,order.tipo_pedido,order.fecha_entrega,order.contacto,order.ubicacion,order.cliente_nombre,order._client?.nombres,order._client?.apellidos,order._client?.telefono]
        .some(value => String(value || '').toLowerCase().includes(q));
    });
    renderOrdersDashboard();
    renderWebOrders();
  }
  function clearWebOrderFilters() {
    const month = $('web-order-month'); if (month) month.value = bogotaDateKey().slice(0, 7);
    const day = $('web-order-day'); if (day) day.value = '';
    const state = $('web-order-status-filter'); if (state) state.value = '';
    const search = $('web-order-search'); if (search) search.value = '';
    filterWebOrders();
  }
  window.clearWebOrderFilters = clearWebOrderFilters;
  // Selector de clientes con búsqueda real, sin desplegable nativo.
  function populateOrderClientSelect(query = '') {
    const menu = $('web-order-client-results');
    if (!menu) return;
    const q = String(query || '').trim().toLocaleLowerCase('es');
    const digits = q.replace(/\D/g, '');
    const matches = client => !q || [clientName(client), client.nombre, client.telefono, client.correo, client.cedula]
      .some(value => String(value || '').toLocaleLowerCase('es').includes(q)) ||
      (digits.length >= 3 && String(client.telefono || '').replace(/\D/g, '').includes(digits));
    const hits = [...webClients.filter(matches).map(c => ({ id:`web:${c.id}`, name:clientName(c), phone:c.telefono, type:'WEB' })),
      ...creditClients.filter(matches).map(c => ({ id:`credit:${c.id}`, name:c.nombre || 'Cliente crédito', phone:c.telefono, type:'CRÉDITO' }))].slice(0, 30);
    menu.innerHTML = hits.map(c => `<button type="button" class="admin-web-client-option" data-client-value="${esc(c.id)}"><strong>${esc(c.name)}</strong><small>${esc(c.phone || 'Sin teléfono')} · ${c.type}</small></button>`).join('') +
      `<button type="button" class="admin-web-client-option admin-web-client-new" data-client-value="__new__">＋ Registrar cliente nuevo</button>` +
      (!hits.length ? '<div class="admin-web-client-empty">No se encontraron clientes. Puedes registrar uno nuevo.</div>' : '');
    menu.hidden = false;
    menu.querySelectorAll('[data-client-value]').forEach(button => button.addEventListener('click', () => {
      selectOrderClient(button.dataset.clientValue);
    }));
  }
  function selectOrderClient(value) {
    const selection = $('web-order-client');
    const search = $('web-order-client-search');
    const menu = $('web-order-client-results');
    const panel = $('web-new-client-panel');
    selection.value = value;
    const isNew = value === '__new__';
    panel.hidden = !isNew;
    panel.querySelectorAll('input').forEach(input => { input.disabled = !isNew; });
    $('web-new-client-nombres').required = isNew;
    $('web-new-client-phone').required = isNew;
    $('web-new-client-email').required = isNew;
    if (isNew) {
      search.value = '＋ Registrar cliente nuevo';
      $('web-order-contact').value = $('web-new-client-phone').value || '';
    } else {
      const client = value.startsWith('web:')
        ? webClients.find(c => String(c.id) === value.slice(4))
        : creditClients.find(c => String(c.id) === value.slice(7));
      if (client) {
        search.value = `${clientName(client) === 'Cliente sin nombre' ? client.nombre : clientName(client)} · ${client.telefono || ''}`;
        $('web-order-contact').value = client.telefono || '';
        $('web-order-location').value = [client.direccion, client.barrio, client.ciudad].filter(Boolean).join(', ');
      }
    }
    menu.hidden = true;
  }

  async function loadDailyCapacityConfig() {
    try {
      const { data, error } = await db.from('configuracion_pedidos_web').select('max_pedidos_diarios').eq('id', 1).maybeSingle();
      if (error) throw error;
      maxOrdersPerDay = Math.max(1, Number(data?.max_pedidos_diarios || 20));
      const input = $('max-orders-per-day');
      if (input) input.value = String(maxOrdersPerDay);
      const label = $('daily-capacity-current');
      if (label) label.textContent = `${maxOrdersPerDay} pedidos por día`;
      const note = $('daily-capacity-note');
      if (note) note.textContent = 'Cuando se complete este número de pedidos de venta para una fecha, el calendario dejará de ofrecerla.';
    } catch (error) {
      console.error('No fue posible cargar el límite diario:', error);
      const note = $('daily-capacity-note');
      if (note) note.textContent = 'La configuración de cupos aún no está disponible.';
    }
  }

  window.saveDailyCapacity = async function() {
    const input = $('max-orders-per-day');
    const button = $('save-daily-capacity');
    const value = Number(input?.value);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      alert('Escribe una cantidad entera entre 1 y 500.');
      return;
    }
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      const { data, error } = await db.from('configuracion_pedidos_web').update({ max_pedidos_diarios:value }).eq('id', 1).select('max_pedidos_diarios').single();
      if (error) throw error;
      maxOrdersPerDay = Number(data.max_pedidos_diarios);
      const label = $('daily-capacity-current');
      if (label) label.textContent = `${maxOrdersPerDay} pedidos por día`;
      const note = $('daily-capacity-note');
      if (note) note.textContent = 'Límite diario actualizado correctamente.';
      alert('Cantidad máxima de pedidos diarios actualizada.');
    } catch (error) {
      console.error('No fue posible guardar el límite diario:', error);
      alert('No fue posible guardar el límite. Verifica la actualización de CUPISSA en Supabase.');
    } finally {
      if (button) { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Guardar límite'; }
    }
  };

  window.deleteWebOrder = async function(id) {
    const order = webOrders.find(item => String(item.id) === String(id));
    const code = order?.numero_pedido || order?.codigo || 'este pedido';
    if (!(await cupissaConfirm(`¿Eliminar definitivamente ${code}? Esta acción no se puede deshacer.`))) return;
    try {
      const { error } = await db.from('pedidos_web').delete().eq('id', id);
      if (error) throw error;
      await loadWebOrders();
      alert('Pedido eliminado correctamente.');
    } catch (error) {
      console.error('No fue posible eliminar el pedido:', error);
      alert('No fue posible eliminar el pedido.');
    }
  };

  window.deleteWebClient = async function(id) {
    const client = webClients.find(item => String(item.id) === String(id));
    if (!client) return;
    const name = clientName(client);
    if (!(await cupissaConfirm(`¿Eliminar a ${name}? También se eliminarán los pedidos web asociados a este cliente. Esta acción no se puede deshacer.`))) return;
    try {
      const deleteOrdersFor = async (column, value) => {
        if (value == null || value === '') return;
        const { error } = await db.from('pedidos_web').delete().eq(column, value);
        if (error && !/PGRST204|column .* does not exist|Could not find .* column/i.test(error.message || '')) throw error;
      };
      await deleteOrdersFor('cliente_id', id);
      if (client.cliente_id && String(client.cliente_id) !== String(id)) await deleteOrdersFor('cliente_id', client.cliente_id);
      await deleteOrdersFor('cliente_web_id', id);
      const tableName = await resolveWebClientsTable();
      const { error } = await db.from(tableName).delete().eq('id', id);
      if (error) throw error;
      await loadWebAdminData();
      alert('Cliente eliminado correctamente.');
    } catch (error) {
      console.error('No fue posible eliminar el cliente:', error);
      alert('No fue posible eliminar el cliente.');
      await loadWebAdminData();
    }
  };

  // La pestaña se controla desde este módulo sin cambiar las funciones de Créditos ni Catálogo.
  window.switchTab = function(tab) {
    const map = { creditos:'tab-section-creditos', catalogo:'tab-section-catalogo', 'web-clientes':'tab-section-web-clientes', 'web-pedidos':'tab-section-web-pedidos' };
    Object.values(map).forEach(id => $(id)?.classList.add('hidden'));
    $(map[tab] || map.creditos)?.classList.remove('hidden');
    const buttons = ['creditos','catalogo','web-clientes','web-pedidos'];
    buttons.forEach(key => {
      ['','-mob'].forEach(suffix => {
        const btn = $(`tab-btn-${key}${suffix}`); if (!btn) return;
        btn.classList.remove('admin-web-active','bg-pink-50','fuchsia-text','border','border-pink-200');
        btn.classList.add('text-slate-600');
      });
    });
    const activeKey = buttons.includes(tab) ? tab : 'creditos';
    ['','-mob'].forEach(suffix => {
      const btn = $(`tab-btn-${activeKey}${suffix}`); if (btn) { btn.classList.add('admin-web-active'); btn.classList.remove('text-slate-600'); }
    });
    if (tab === 'web-clientes' || tab === 'web-pedidos') loadWebAdminData();
  };

  window.filterWebClients = filterWebClients;
  window.filterWebOrders = filterWebOrders;
  window.loadWebAdminData = loadWebAdminData;

  const clientCoreFields = new Set(['nombres','apellidos','cedula','telefono','correo','direccion','barrio','ciudad']);
  const clientProtectedFields = new Set(['id','created_at','updated_at','password','contrasena','auth_user_id']);
  function clientEditForm(client = {}, isNew = false) {
    const value = key => esc(client[key] ?? '');
    const id = isNew ? '' : esc(client.id);
    const extraFields = Object.entries(client || {}).filter(([key]) => !clientCoreFields.has(key) && !clientProtectedFields.has(key));
    const extraHtml = extraFields.length ? `
      <section class="rounded-xl border border-slate-100 p-3 space-y-3">
        <h4 class="text-[10px] font-black uppercase tracking-wide text-slate-600">Otros datos guardados en la ficha</h4>
        <div class="admin-web-client-edit-grid">
          ${extraFields.map(([key, val]) => {
            const label = esc(key.replaceAll('_',' '));
            const kind = val === null ? 'text' : Array.isArray(val) || (val && typeof val === 'object') ? 'json' : typeof val;
            if (kind === 'boolean') return `<label>${label}<span class="flex items-center gap-2 mt-2"><input type="checkbox" data-client-extra="${esc(key)}" data-kind="boolean" ${val ? 'checked' : ''}> <span class="normal-case font-semibold">Activo</span></span></label>`;
            if (kind === 'json') return `<label class="sm:col-span-2">${label}<textarea data-client-extra="${esc(key)}" data-kind="json" rows="3">${esc(JSON.stringify(val))}</textarea></label>`;
            const inputType = kind === 'number' ? 'number' : (/^\d{4}-\d{2}-\d{2}$/.test(String(val || '')) ? 'date' : 'text');
            return `<label>${label}<input data-client-extra="${esc(key)}" data-kind="${kind === 'number' ? 'number' : 'text'}" type="${inputType}" value="${value(key)}"></label>`;
          }).join('')}
        </div>
      </section>` : '';
    return `
      <form id="web-client-edit-form" onsubmit="saveWebClient(event,'${id}',${isNew ? 'true' : 'false'})" class="space-y-4">
        <div class="admin-web-client-edit-grid">
          <label>Nombres<input name="nombres" required value="${value('nombres')}" autocomplete="given-name"></label>
          <label>Apellidos<input name="apellidos" value="${value('apellidos')}" autocomplete="family-name"></label>
          <label>Cédula<input name="cedula" value="${value('cedula')}" inputmode="numeric" autocomplete="off"></label>
          <label>Teléfono<input name="telefono" value="${value('telefono')}" autocomplete="tel"></label>
          <label>Correo electrónico<input name="correo" type="email" value="${value('correo')}" autocomplete="email"></label>
          <label>Dirección<input name="direccion" value="${value('direccion')}" autocomplete="street-address"></label>
          <label>Barrio<input name="barrio" value="${value('barrio')}"></label>
          <label>Ciudad<input name="ciudad" value="${value('ciudad')}"></label>
        </div>
        ${extraHtml}
        ${isNew ? '' : `<div class="rounded-xl border border-slate-100 p-3"><label class="block text-[10px] font-black uppercase text-slate-600" for="web-client-password-input">Actualizar password en la tabla clientes</label><input id="web-client-password-input" name="new_password" type="password" autocomplete="new-password" placeholder="Dejar vacío para conservarlo" class="w-full mt-2 border border-slate-200 rounded-xl px-3 py-3 text-xs"></div>`}
        <div class="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onclick="closeAdminWebModal()" class="px-5 py-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">Cancelar</button>
          <button id="web-client-save" type="submit" class="px-5 py-3 rounded-xl fuchsia-btn text-xs font-black">${isNew ? 'Crear cliente' : 'Guardar cambios'}</button>
        </div>
      </form>`;
  }

  function normalizedPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }
  function clientReferenceSet(client) {
    return new Set([client?.id, client?.cliente_id, client?.id_cliente, client?.cliente_credito_id]
      .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
      .map(value => String(value)));
  }
  function orderBelongsToWebClient(order, client) {
    const clientRefs = clientReferenceSet(client);
    const orderRefs = [order?.cliente_web_id, order?.cliente_id, order?._client?.id, order?._client?.cliente_id]
      .filter(value => value !== undefined && value !== null).map(String);
    if (orderRefs.some(value => clientRefs.has(value))) return true;
    const clientPhone = normalizedPhone(client?.telefono);
    const orderPhone = normalizedPhone(order?.telefono || order?.contacto || order?._client?.telefono);
    return !!clientPhone && clientPhone.length >= 7 && clientPhone === orderPhone;
  }

  window.loadCreditClientOrderNotes = async function(creditClient) {
    const container = $('admin-client-web-order-notes');
    if (!container || !creditClient) return;
    container.innerHTML = '<div class="text-xs text-slate-400">Consultando notas de pedidos…</div>';
    try {
      const { data, error } = await db.from('pedidos_web').select('*').order('created_at', { ascending:false });
      if (error) throw error;
      const creditId = String(creditClient.id ?? '');
      const phone = normalizedPhone(creditClient.telefono);
      const linkedWebClients = webClients.filter(client => String(client.cliente_id ?? client.id_cliente ?? '') === creditId ||
        (!!phone && phone.length >= 7 && normalizedPhone(client.telefono) === phone));
      const references = new Set([creditId, ...linkedWebClients.map(client => String(client.id))].filter(Boolean));
      const notes = (data || []).filter(order => {
        if (!String(order.nota || '').trim()) return false;
        const orderReferences = [order.cliente_web_id, order.cliente_id].filter(value => value != null).map(String);
        if (orderReferences.some(value => references.has(value))) return true;
        const orderPhone = normalizedPhone(order.telefono || order.contacto);
        return !!phone && phone.length >= 7 && phone === orderPhone;
      });
      container.innerHTML = notes.length
        ? `<h4 class="text-xs font-black uppercase tracking-wide text-amber-800 mb-2">Notas de pedidos</h4>${notes.map(order => `<div class="py-2 border-b border-amber-100 last:border-0"><strong class="block text-[10px] text-slate-500">${esc(order.numero_pedido || order.codigo || 'Pedido')} · ${esc(order.fecha_entrega || order.created_at?.slice(0,10) || '')}</strong><p class="text-xs text-slate-700 mt-1 whitespace-pre-wrap">${esc(order.nota)}</p></div>`).join('')}`
        : '<p class="text-xs text-slate-500">Este cliente todavía no tiene notas registradas en sus pedidos.</p>';
    } catch (error) {
      console.error('No fue posible cargar las notas de pedidos del cliente:', error);
      container.innerHTML = '<p class="text-xs text-rose-600">No fue posible consultar las notas de sus pedidos.</p>';
    }
  };

  window.viewWebClient = async function(id) {
    const client = webClients.find(item => String(item.id) === String(id));
    if (!client) return;
    await loadWebOrders();
    const clientNotes = webOrders.filter(order => orderBelongsToWebClient(order, client) && String(order.nota || '').trim()).map(order => ({ order, nota:order.nota }));
    const notesHtml = clientNotes.length ? `<section class="rounded-xl border border-amber-200 bg-amber-50/60 p-3 mb-4"><h4 class="text-[10px] font-black uppercase tracking-wide text-amber-800 mb-2">Notas de pedidos</h4>${clientNotes.map(item=>`<div class="text-xs text-slate-700 py-1 border-b border-amber-100 last:border-0"><strong>${esc(item.order.numero_pedido || item.order.codigo || 'Pedido')}:</strong> ${esc(item.nota)}</div>`).join('')}</section>` : `<section class="rounded-xl border border-slate-100 p-3 mb-4 text-xs text-slate-400">Este cliente todavía no tiene notas en sus pedidos.</section>`;
    const metadata = `${notesHtml}<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4"><div class="rounded-xl bg-slate-50 p-3"><span class="block text-[9px] font-black uppercase text-slate-400">Identificador interno</span><strong class="block text-xs text-slate-800 mt-1 break-all">${esc(client.id)}</strong></div><div class="rounded-xl bg-slate-50 p-3"><span class="block text-[9px] font-black uppercase text-slate-400">Registro</span><strong class="block text-xs text-slate-800 mt-1">${esc(client.created_at ? new Date(client.created_at).toLocaleString('es-CO') : '—')}</strong></div></div>`;
    // La ficha y la cédula se guardan en clientes_web. El campo password se
    // actualiza por separado en la tabla histórica clientes, según el vínculo del cliente.
    showAdminWebModal('Ficha completa del cliente web', metadata + clientEditForm(client,false));
  };

  window.openCreateWebClient = function() {
    showAdminWebModal('Registrar cliente web', clientEditForm({},true));
  };

  async function updateLegacyClientPassword(webClient, newPassword) {
    if (!webClient) throw new Error('No se encontró la ficha del cliente web.');
    let legacyClientId = webClient.cliente_id || webClient.id_cliente || webClient.cliente_credito_id || null;

    // Verifica que el vínculo realmente corresponda a public.clientes.id antes de actualizar.
    if (legacyClientId) {
      const { data: linkedClient, error: linkedError } = await db.from('clientes')
        .select('id')
        .eq('id', legacyClientId)
        .maybeSingle();
      if (linkedError) throw new Error(`No se pudo verificar el vínculo con clientes: ${linkedError.message}`);
      if (!linkedClient) legacyClientId = null;
    }

    // Si la ficha no tiene un ID válido, relaciona por teléfono anterior y, si hace falta, por cédula anterior.
    if (!legacyClientId) {
      const phoneDigits = String(webClient._previousPhone || webClient.telefono || '').replace(/\D/g, '');
      if (phoneDigits) {
        const { data, error } = await db.from('clientes')
          .select('id, telefono, password');
        if (error) throw new Error(`No se pudo localizar el registro en clientes: ${error.message}`);
        const normalizePhone = value => {
          const digits = String(value || '').replace(/\D/g, '');
          return digits.length > 10 ? digits.slice(-10) : digits;
        };
        const wantedPhone = normalizePhone(phoneDigits);
        const matches = (data || []).filter(row => normalizePhone(row.telefono) === wantedPhone);
        if (matches.length === 1) legacyClientId = matches[0].id;
        else if (matches.length > 1 && (webClient._previousCedula || webClient.cedula)) {
          const oldCedula = String(webClient._previousCedula || webClient.cedula);
          const byOldIdentifier = matches.filter(row => String(row.password || '') === oldCedula);
          if (byOldIdentifier.length === 1) legacyClientId = byOldIdentifier[0].id;
          else throw new Error('Hay varios registros en clientes con ese teléfono. Se necesita el vínculo cliente_id en clientes_web para identificar cuál actualizar.');
        } else if (matches.length > 1) {
          throw new Error('Hay varios registros en clientes con ese teléfono. Se necesita el vínculo cliente_id en clientes_web para identificar cuál actualizar.');
        }
      }
    }

    // En los registros históricos, clientes.password se utilizaba también para
    // guardar la cédula. Se admite esa relación como respaldo si no hay teléfono.
    const previousCedula = webClient._previousCedula || webClient.cedula;
    if (!legacyClientId && previousCedula) {
      const { data, error } = await db.from('clientes')
        .select('id')
        .eq('password', String(previousCedula).trim())
        .limit(3);
      if (error) throw new Error(`No se pudo localizar el registro por cédula en clientes: ${error.message}`);
      const matches = data || [];
      if (matches.length === 1) legacyClientId = matches[0].id;
      else if (matches.length > 1) throw new Error('La cédula coincide con varios registros en clientes. Verifica el vínculo cliente_id.');
    }

    if (!legacyClientId) {
      throw new Error('No se encontró el registro correspondiente en la tabla clientes. Verifica que el teléfono coincida o que clientes_web tenga el campo cliente_id relacionado con clientes.id.');
    }

    const { data, error } = await db.from('clientes')
      .update({ password: newPassword })
      .eq('id', legacyClientId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`No se pudo actualizar clientes.password: ${error.message}`);
    if (!data) throw new Error('Supabase no actualizó ninguna fila de clientes. Revisa el vínculo y los permisos de actualización.');
    return data.id;
  }

  window.saveWebClient = async function(event, id, isNew) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('web-client-save');
    if (button) { button.disabled = true; button.textContent = 'Guardando...'; }
    const formData = new FormData(form);
    const payload = {
      nombres:String(formData.get('nombres') || '').trim(),
      apellidos:String(formData.get('apellidos') || '').trim(),
      cedula:String(formData.get('cedula') || '').trim() || null,
      telefono:String(formData.get('telefono') || '').trim(),
      correo:String(formData.get('correo') || '').trim(),
      direccion:String(formData.get('direccion') || '').trim(),
      barrio:String(formData.get('barrio') || '').trim(),
      ciudad:String(formData.get('ciudad') || '').trim()
    };
    const newPassword = String(formData.get('new_password') || '');
    const originalClient = !isNew ? webClients.find(item => String(item.id) === String(id)) : null;
    const originalEmail = String(originalClient?.correo || '').trim();
    const emailChanged = !!originalClient && payload.correo.toLowerCase() !== originalEmail.toLowerCase();
    let profileSaved = false;
    let passwordSaved = false;
    try {
      form.querySelectorAll('[data-client-extra]').forEach(field => {
        const key = field.dataset.clientExtra;
        const kind = field.dataset.kind;
        if (!key) return;
        if (kind === 'boolean') payload[key] = field.checked;
        else if (kind === 'number') payload[key] = field.value === '' ? null : Number(field.value);
        else if (kind === 'json') {
          try { payload[key] = JSON.parse(field.value || 'null'); }
          catch (_) { throw new Error(`El campo ${key.replaceAll('_',' ')} debe contener JSON válido.`); }
        } else payload[key] = field.value;
      });

      if (emailChanged) {
        if (!payload.correo) throw new Error('El correo no puede quedar vacío.');
        const { data: sessionData, error: sessionError } = await db.auth.getSession();
        const allowedEmail = String(window.CUPISSA_ADMIN_EMAIL || '').toLowerCase();
        if (sessionError || String(sessionData?.session?.user?.email || '').toLowerCase() !== allowedEmail) {
          throw new Error('Inicia sesión con la cuenta de administración para cambiar el correo de acceso.');
        }
      }

      const tableName = await resolveWebClientsTable();
      let savedWebClient = originalClient;
      let webClientId = id;
      if (isNew) {
        const { data, error } = await db.from(tableName).insert([payload]).select('*').maybeSingle();
        if (error) throw new Error(`No se pudo crear la ficha en ${tableName}: ${error.message}`);
        if (!data) throw new Error(`Supabase no devolvió la ficha creada en ${tableName}. Revisa los permisos de inserción y lectura.`);
        savedWebClient = data;
        webClientId = data.id;
      } else {
        // maybeSingle evita el error PostgREST "Cannot coerce the result to a single JSON object"
        // cuando RLS filtra la fila o la API no devuelve representación del UPDATE.
        const { data, error } = await db.from(tableName)
          .update(payload)
          .eq('id', id)
          .select('*')
          .maybeSingle();
        if (error) throw new Error(`No se pudo actualizar ${tableName}: ${error.message}`);
        if (!data) {
          throw new Error(`Supabase no devolvió la ficha ${id} después de actualizar ${tableName}. La fila no coincide o la política RLS no permite actualizar/leer ese registro.`);
        }
        savedWebClient = data;
      }
      profileSaved = true;

      // La contraseña solicitada se guarda directamente en public.clientes.password.
      // No invoca Edge Functions ni modifica Supabase Authentication.
      if (newPassword) {
        await updateLegacyClientPassword({ ...originalClient, ...savedWebClient, telefono:payload.telefono, cedula:payload.cedula, _previousCedula:originalClient?.cedula, _previousPhone:originalClient?.telefono }, newPassword);
        passwordSaved = true;
      }

      // Cambiar el correo de inicio de sesión sigue siendo una operación de Auth.
      // Solo se contacta la función segura si el correo realmente cambió.
      if (emailChanged) {
        const { data: secureUpdateData, error: secureUpdateError } = await db.functions.invoke('admin-update-web-client-password', {
          body: { clientId:webClientId, currentEmail:originalEmail, email:payload.correo }
        });
        if (secureUpdateError || (secureUpdateData && secureUpdateData.ok === false)) {
          const detail = secureUpdateError?.message || secureUpdateData?.error || 'No se pudo actualizar el correo de inicio de sesión.';
          if (originalEmail) await db.from(tableName).update({ correo:originalEmail }).eq('id',webClientId);
          throw new Error(`La ficha${passwordSaved ? ' y la contraseña en clientes.password' : ''} se guardaron, pero no se pudo cambiar el correo de acceso: ${detail}`);
        }
      }

      closeAdminWebModal();
      await loadWebClients();
      alert(isNew ? 'Cliente web creado correctamente.' : (newPassword && emailChanged ? 'Ficha, cédula y clientes.password actualizados. Correo de acceso actualizado.' : newPassword ? 'Ficha, cédula y contraseña guardadas en clientes.password.' : emailChanged ? 'Ficha y correo de acceso actualizados.' : 'Ficha del cliente actualizada.'));
    } catch (error) {
      console.error('No fue posible guardar la ficha del cliente:',error);
      const prefix = profileSaved && !passwordSaved && newPassword
        ? 'La ficha y la cédula en clientes_web sí se guardaron, pero '
        : '';
      alert(prefix + (error?.message || 'No fue posible guardar los cambios. Comprueba los permisos de las tablas clientes_web y clientes.'));
      if (button) { button.disabled = false; button.textContent = isNew ? 'Crear cliente' : 'Guardar cambios'; }
    }
  };

  function showAdminWebModal(title, content, footer = '') {
    const root = $('admin-web-modal-root'); if (!root) return;
    root.innerHTML = `<div class="admin-web-modal" id="admin-web-modal"><div class="admin-web-modal-card"><div class="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center gap-3"><h3 class="font-black text-slate-900 text-sm sm:text-base">${esc(title)}</h3><button type="button" onclick="closeAdminWebModal()" class="w-9 h-9 rounded-full bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button></div><div class="admin-web-modal-content">${content}</div>${footer?`<div class="p-4 border-t border-slate-100">${footer}</div>`:''}</div></div>`;
  }
  window.closeAdminWebModal = function() { const root=$('admin-web-modal-root'); if(root) root.innerHTML=''; };

  window.viewWebOrder = function(id) {
    const o = webOrders.find(item => String(item.id) === String(id)); if (!o) return;
    const c = o._client || {};
    const items = Array.isArray(o.productos) ? o.productos : [];
    const images = Array.isArray(o.imagenes) ? o.imagenes : [...new Set(items.flatMap(p => Array.isArray(p.imagenes) ? p.imagenes : (p.imagen_url ? [p.imagen_url] : [])))];
    const rest = orderBalance(o);
    const productsHtml = items.map((p,i)=>`<div class="p-3 rounded-xl border border-slate-100 flex gap-3">${p.imagen_url?`<img src="${esc(p.imagen_url)}" class="admin-web-order-image">`:''}<div class="min-w-0 flex-1"><strong class="text-xs text-slate-900">${i+1}. ${esc(p.nombre||p.producto||'Producto')}</strong><p class="text-[11px] text-slate-500 mt-1">Referencia: ${esc(p.referencia||'—')} · Talla: ${esc(p.talla||'—')} · Color: ${esc(p.color||'—')}</p><p class="text-[11px] text-slate-600 mt-1">Cantidad: ${esc(p.cantidad||1)} · Precio: ${cop(p.precio)}</p></div></div>`).join('') || '<p class="text-xs text-slate-400">Sin productos detallados.</p>';
    const imagesHtml = images.map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" class="admin-web-order-image"></a>`).join('');
    const orderType = o.tipo_pedido || o.tipo_servicio || (items.some(p => p.modalidad === 'ALQUILER') ? 'ALQUILER' : 'VENTA');
    const orderName = o.numero_pedido || o.codigo || '';
    showAdminWebModal(`Pedido ${orderName}`, `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">${[['Cliente',clientName(c) !== 'Cliente sin nombre' ? clientName(c) : o.cliente_nombre],['Teléfono',o.contacto||o.telefono||c.telefono],['Tipo',orderType],['Fecha de entrega',o.fecha_entrega],['Ubicación',o.ubicacion || [o.direccion,o.barrio,o.ciudad].filter(Boolean).join(', ')],['Estado',o.estado],['Total',cop(o.total)],['Domicilio / envío',cop(o.domicilio_envio ?? o.envio)],['Anticipo',cop(o.anticipo)],['Restante',cop(rest)]].map(([k,v])=>`<div class="bg-slate-50 rounded-xl p-3"><span class="block text-[9px] uppercase font-black text-slate-400">${esc(k)}</span><strong class="block text-xs text-slate-800 mt-1 break-words">${esc(v||'—')}</strong></div>`).join('')}</div><h4 class="text-xs font-black uppercase text-slate-700 mb-3">Productos y referencias</h4><div class="space-y-2">${productsHtml}</div><section class="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-3"><label for="web-order-note-input" class="block text-xs font-black uppercase text-slate-700 mb-2">Nota del pedido</label><textarea id="web-order-note-input" rows="3" class="admin-web-input w-full" placeholder="Escribe una nota para este pedido...">${esc(o.nota || '')}</textarea><button type="button" class="admin-web-button mt-2" onclick="saveWebOrderNote('${esc(o.id)}')"><i class="fa-solid fa-floppy-disk mr-1"></i> Guardar nota</button></section>${images.length?`<h4 class="text-xs font-black uppercase text-slate-700 mt-5 mb-3">Imágenes del pedido</h4><div class="flex flex-wrap gap-2">${imagesHtml}</div>`:''}`);
  };

  window.saveWebOrderNote = async function(id) {
    const order = webOrders.find(item => String(item.id) === String(id));
    const input = $('web-order-note-input');
    if (!order || !input) return;
    const nota = input.value.trim();
    try {
      const { error } = await db.from('pedidos_web').update({ nota }).eq('id', id);
      if (error) throw error;
      order.nota = nota;
      alert('Nota del pedido guardada correctamente.');
      await loadWebOrders();
      const activeCreditClientId = $('edit-client-id')?.value;
      const activeCreditClient = activeCreditClientId ? (creditClients.find(item => String(item.id) === String(activeCreditClientId))) : null;
      if (activeCreditClient && $('admin-client-web-order-notes') && !$('modal-edit-client')?.classList.contains('hidden')) {
        await window.loadCreditClientOrderNotes?.(activeCreditClient);
      }
    } catch (error) {
      console.error('No fue posible guardar la nota del pedido:', error);
      alert('No se pudo guardar la nota. Verifica que pedidos_web tenga la columna nota (TEXT).');
    }
  };

  function getCatalogProducts() {
    try { return typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []; }
    catch (_) { return []; }
  }
  function normalizeVariantList(items) {
    return (Array.isArray(items) ? items : []).map(item => typeof item === 'string'
      ? { nombre:item, incremento:0 }
      : { nombre:String(item?.nombre || ''), incremento:Number(item?.incremento || item?.adicional || 0), foto:item?.foto || item?.imagen || '' })
      .filter(item => item.nombre);
  }
  let orderProductRowCounter = 0;
  function addProductRow() {
    const container = $('web-order-products'); if (!container) return;
    const rowUid = `order-variant-${++orderProductRowCounter}`;
    const row = document.createElement('div'); row.className = 'admin-order-product-row admin-web-product-row';
    row.innerHTML = `
      <div class="wide admin-web-product-picker"><label class="admin-web-label">Seleccionar producto del catálogo</label><input class="admin-web-input" data-field="product_search" type="search" autocomplete="off" placeholder="Buscar producto por nombre..." aria-label="Buscar productos con fotografías" aria-expanded="false"><select class="hidden" tabindex="-1" aria-hidden="true" data-field="producto_id"><option value="">Selecciona un producto</option><option value="__custom__">Producto nuevo / personalizado</option></select><div class="admin-web-product-results" data-field="product_results" hidden></div><div class="admin-web-product-selected" data-field="product_selected" hidden></div><input class="admin-web-input mt-2 hidden" data-field="custom_name" placeholder="Nombre del producto nuevo"></div>
      <div><label class="admin-web-label">Precio unitario ($)</label><input class="admin-web-input" data-field="precio" type="number" min="0" step="1" value="0" required></div>
      <div><label class="admin-web-label">Cantidad</label><input class="admin-web-input" data-field="cantidad" type="number" min="1" step="1" value="1" required></div>
      <div><label class="admin-web-label">Talla / medida</label><input class="admin-web-input" data-field="talla" list="${rowUid}-sizes" placeholder="Elegir o escribir"></div>
      <div><label class="admin-web-label">Color</label><input class="admin-web-input" data-field="color" list="${rowUid}-colors" placeholder="Elegir o escribir"></div>
      <div><label class="admin-web-label">Accesorio / variante</label><input class="admin-web-input" data-field="accesorio" list="${rowUid}-accessories" placeholder="Opcional"></div>
      <div><label class="admin-web-label">Incremento manual ($)</label><input class="admin-web-input" data-field="incremento_manual" type="number" min="0" step="1" value="0"></div>
      <div class="wide"><label class="admin-web-label">Referencia (opcional)</label><input class="admin-web-input" data-field="referencia" placeholder="Referencia o detalle"></div>
      <div class="wide flex justify-end"><button type="button" class="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold" title="Quitar producto" onclick="this.closest('.admin-web-product-row').remove();recalculateWebOrderTotal()"><i class="fa-solid fa-trash mr-1"></i> Quitar</button></div>`;
    container.appendChild(row);

    const productSearch = row.querySelector('[data-field="product_search"]');
    const productSelect = row.querySelector('[data-field="producto_id"]');
    const customName = row.querySelector('[data-field="custom_name"]');
    const sizeInput = row.querySelector('[data-field="talla"]');
    const colorInput = row.querySelector('[data-field="color"]');
    const accessoryInput = row.querySelector('[data-field="accesorio"]');
    const priceInput = row.querySelector('[data-field="precio"]');
    const manualIncrementInput = row.querySelector('[data-field="incremento_manual"]');
    const datalistIds = {
      talla: sizeInput.getAttribute('list'), color: colorInput.getAttribute('list'), accesorio: accessoryInput.getAttribute('list')
    };
    Object.values(datalistIds).forEach(id => { const list = document.createElement('datalist'); list.id = id; row.appendChild(list); });

    // Selector personalizado: los <option> HTML no pueden contener fotografías.
    // Conservamos el select oculto para no alterar la lógica de variantes ni el guardado.
    const productResults = row.querySelector('[data-field="product_results"]');
    const productSelected = row.querySelector('[data-field="product_selected"]');
    const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const productPhoto = product => {
      const first = Array.isArray(product?.fotos) ? product.fotos[0] : null;
      const raw = typeof first === 'string' ? first : (first?.url || first?.foto || first?.imagen || product?.imagen_url || product?.imagen || '');
      return typeof raw === 'string' && /^(https?:\/\/|data:image\/|blob:)/i.test(raw) ? raw : '';
    };
    const thumb = product => {
      const photo = productPhoto(product);
      return photo ? `<img class="admin-web-product-thumb" loading="lazy" src="${esc(photo)}" alt="" onerror="this.replaceWith(document.createTextNode('Sin foto'))">` : '<span class="admin-web-product-no-photo"><i class="fa-regular fa-image"></i></span>';
    };
    const setProductSelection = (id, label) => {
      productSelect.innerHTML = `<option value="">Selecciona un producto</option><option value="${esc(id)}" selected>${esc(label)}</option>`;
      productSelect.value = String(id);
      productSelect.dispatchEvent(new Event('change'));
      productResults.hidden = true;
      productSearch.setAttribute('aria-expanded', 'false');
      if (id === '__custom__') {
        productSearch.value = 'Producto nuevo / personalizado';
        productSelected.hidden = true;
      } else {
        const product = getCatalogProducts().find(item => String(item.id) === String(id));
        productSearch.value = String(product?.nombre || label);
        productSelected.innerHTML = `<div class="admin-web-product-option">${thumb(product)}<span class="admin-web-product-option-text"><strong>${esc(product?.nombre || label)}</strong><small>${cop(product?.precio_detal)}</small></span><span class="admin-web-product-check"><i class="fa-solid fa-check"></i></span></div>`;
        productSelected.hidden = false;
      }
    };
    const renderProductResults = () => {
      const query = normalizeSearch(productSearch.value.trim());
      const catalog = getCatalogProducts();
      const matches = catalog.filter(item => !query || normalizeSearch(item.nombre).includes(query)).slice(0, 70);
      productResults.innerHTML = matches.map((product, idx) => `<button type="button" class="admin-web-product-option" data-product-result="${idx}">${thumb(product)}<span class="admin-web-product-option-text"><strong>${esc(product.nombre || 'Producto sin nombre')}</strong><small>${cop(product.precio_detal)}</small></span></button>`).join('') + `<button type="button" class="admin-web-product-option admin-web-product-custom" data-product-custom="1"><span class="admin-web-product-no-photo"><i class="fa-solid fa-plus"></i></span><span class="admin-web-product-option-text"><strong>Producto nuevo / personalizado</strong><small>Registrar manualmente</small></span></button>` + (!matches.length ? '<p class="admin-web-product-empty">No se encontraron productos del catálogo.</p>' : '');
      productResults.hidden = false;
      productSearch.setAttribute('aria-expanded', 'true');
      productResults.querySelectorAll('[data-product-result]').forEach(button => button.addEventListener('click', () => {
        const product = matches[Number(button.dataset.productResult)];
        if (product) setProductSelection(product.id, product.nombre || 'Producto');
      }));
      productResults.querySelector('[data-product-custom]')?.addEventListener('click', () => setProductSelection('__custom__', 'Producto nuevo / personalizado'));
    };
    productSearch.addEventListener('focus', renderProductResults);
    productSearch.addEventListener('input', () => {
      productSelect.value = '';
      productSelected.hidden = true;
      row.dataset.productName = '';
      renderProductResults();
    });
    productSearch.addEventListener('keydown', event => {
      if (event.key === 'Escape') { productResults.hidden = true; productSearch.setAttribute('aria-expanded', 'false'); }
      if (event.key === 'Enter' && !productResults.hidden) {
        event.preventDefault();
        productResults.querySelector('[data-product-result], [data-product-custom]')?.click();
      }
    });
    document.addEventListener('click', event => {
      if (!row.isConnected) return;
      if (!row.querySelector('.admin-web-product-picker')?.contains(event.target)) {
        productResults.hidden = true;
        productSearch.setAttribute('aria-expanded', 'false');
      }
    }, { signal: row._productPickerAbort?.signal });

    const chooseVariant = () => {
      const product = getCatalogProducts().find(item => String(item.id) === String(productSelect.value));
      if (!product) return;
      const sizeOptions = normalizeVariantList(product.tallas);
      const colorOptions = normalizeVariantList(product.colores);
      const accessoryOptions = normalizeVariantList(product.accesorios);
      const setList = (id, values) => {
        const list = row.querySelector(`#${CSS.escape(id)}`); if (!list) return;
        list.innerHTML = values.map(item => `<option value="${esc(item.nombre)}"></option>`).join('');
      };
      setList(datalistIds.talla, sizeOptions);
      setList(datalistIds.color, colorOptions);
      setList(datalistIds.accesorio, accessoryOptions);
      customName.classList.add('hidden');
      customName.value = product.nombre || '';
      row.dataset.productName = product.nombre || '';
      row.dataset.productRef = product.referencia || '';
      [sizeInput, colorInput, accessoryInput].forEach(input => input.value = '');
      manualIncrementInput.value = '0';
      updateProductLinePrice(product);
    };
    productSelect.addEventListener('change', () => {
      if (productSelect.value === '__custom__') {
        customName.classList.remove('hidden'); customName.value = ''; row.dataset.productName = ''; row.dataset.productRef = '';
        priceInput.value = '0'; productSelected.hidden = true;
      } else if (!productSelect.value) {
        customName.classList.add('hidden'); row.dataset.productName = ''; priceInput.value = '0';
      } else chooseVariant();
      recalculateWebOrderTotal();
    });
    function updateProductLinePrice(product) {
      if (product) {
        const variantMap = { talla:normalizeVariantList(product.tallas), color:normalizeVariantList(product.colores), accesorio:normalizeVariantList(product.accesorios) };
        const variantIncrement = Object.entries(variantMap).reduce((total, [key, list]) => {
          const input = row.querySelector(`[data-field="${key}"]`);
          const match = list.find(item => item.nombre.toLowerCase() === String(input?.value || '').trim().toLowerCase());
          return total + Number(match?.incremento || 0);
        }, 0);
        const manualIncrement = Math.max(0, Number(manualIncrementInput.value || 0));
        priceInput.value = String(Math.max(0, Number(product.precio_detal || 0) + variantIncrement + manualIncrement));
      }
      recalculateWebOrderTotal();
    }
    [sizeInput, colorInput, accessoryInput].forEach(input => input.addEventListener('change', () => {
      const product = getCatalogProducts().find(item => String(item.id) === String(productSelect.value));
      updateProductLinePrice(product);
    }));
    manualIncrementInput.addEventListener('input', () => {
      const product = getCatalogProducts().find(item => String(item.id) === String(productSelect.value));
      updateProductLinePrice(product);
    });
    customName.addEventListener('input', () => { row.dataset.productName = customName.value; });
    row.addEventListener('input', event => { if (event.target.matches('[data-field="precio"],[data-field="cantidad"]')) recalculateWebOrderTotal(); });
  }
  window.addWebOrderProductRow = addProductRow;
  window.recalculateWebOrderTotal = function () {
    const total = Array.from(document.querySelectorAll('#web-order-products .admin-web-product-row')).reduce((sum,row) => {
      const price = Number(row.querySelector('[data-field="precio"]')?.value || 0);
      const quantity = Math.max(1, Number(row.querySelector('[data-field="cantidad"]')?.value || 1));
      return sum + price * quantity;
    },0);
    const input = $('web-order-total'); if (input) input.value = String(total);
  };

  window.openNewWebOrder = function() {
    const content = `
      <form id="web-order-form" onsubmit="createWebOrder(event)" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2 admin-web-client-picker"><label class="admin-web-label">Cliente que agenda el pedido *</label><input id="web-order-client-search" type="search" class="admin-web-input" autocomplete="off" placeholder="Escribe el nombre o teléfono del cliente"><input id="web-order-client" type="hidden" value=""><div id="web-order-client-results" class="admin-web-client-results" hidden></div><p class="text-[10px] text-slate-500 mt-1">Busca y selecciona un cliente, o registra uno nuevo.</p></div>
          <div class="sm:col-span-2 admin-new-client-panel" id="web-new-client-panel" hidden>
            <input id="web-new-client-nombres" class="admin-web-input" placeholder="Nombres *" disabled>
            <input id="web-new-client-apellidos" class="admin-web-input" placeholder="Apellidos">
            <input id="web-new-client-cedula" class="admin-web-input" placeholder="Cédula">
            <input id="web-new-client-phone" class="admin-web-input" placeholder="Teléfono *" disabled>
            <input id="web-new-client-email" class="admin-web-input" type="email" placeholder="Correo electrónico *" disabled>
            <input id="web-new-client-address" class="admin-web-input" placeholder="Dirección">
            <input id="web-new-client-neighborhood" class="admin-web-input" placeholder="Barrio">
            <input id="web-new-client-city" class="admin-web-input" placeholder="Ciudad">
          </div>
          <div><label class="admin-web-label">Modalidad *</label><select id="web-order-type" class="admin-web-input" required><option value="VENTA">VENTA</option><option value="ALQUILER">ALQUILER</option></select></div>
          <div><label class="admin-web-label">Fecha de entrega *</label><input id="web-order-date" class="admin-web-input" type="date" required></div>
          <div><label class="admin-web-label">Contacto</label><input id="web-order-contact" class="admin-web-input" placeholder="Teléfono de contacto"></div>
          <div class="sm:col-span-2"><label class="admin-web-label">Ubicación / dirección de entrega</label><input id="web-order-location" class="admin-web-input" placeholder="Dirección, barrio, ciudad"></div>
        </div>
        <div class="rounded-2xl border border-slate-100 p-3 sm:p-4 space-y-3"><div class="flex items-center justify-between gap-2"><h4 class="font-black text-xs text-slate-800">Productos del pedido</h4><button type="button" onclick="addWebOrderProductRow()" class="admin-web-button"><i class="fa-solid fa-plus mr-1"></i> Añadir producto</button></div><div id="web-order-products" class="space-y-2"></div><p class="text-[10px] text-slate-400">Busca productos del catálogo y selecciona talla, color y accesorios. También puedes registrar un producto manual.</p></div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><label class="admin-web-label">Total productos ($) *</label><input id="web-order-total" class="admin-web-input" type="number" min="0" step="1" value="0" required></div><div><label class="admin-web-label">Domicilio / envío ($)</label><input id="web-order-shipping" class="admin-web-input" type="number" min="0" step="1" value="0"></div><div><label class="admin-web-label">Anticipo ($)</label><input id="web-order-advance" class="admin-web-input" type="number" min="0" step="1" value="0"></div></div>
        <div><label class="admin-web-label">Fotografías del pedido</label><input id="web-order-images" class="admin-web-input" type="file" accept="image/*" multiple><p class="text-[10px] text-slate-400 mt-1">Puedes adjuntar varias fotos. Se almacenan en el bucket pedidos-web de Supabase.</p></div>
        <div><label class="admin-web-label">Estado inicial</label><select id="web-order-state" class="admin-web-input">${states.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
        <div class="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onclick="closeAdminWebModal()" class="px-5 py-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">Cancelar</button><button id="web-order-save" type="submit" class="px-5 py-3 rounded-xl fuchsia-btn text-xs font-black">Guardar pedido</button></div>
      </form>`;
    showAdminWebModal('Registrar nuevo pedido', content);
    populateOrderClientSelect();
    $('web-new-client-panel').hidden = true;
    $('web-order-client-results').hidden = true;
    $('web-new-client-panel').querySelectorAll('input').forEach(input => { input.disabled = true; input.required = false; });
    addProductRow();
    $('web-order-client-search').addEventListener('input', event => {
      $('web-order-client').value = '';
      populateOrderClientSelect(event.target.value);
    });
    $('web-order-client-search').addEventListener('focus', event => populateOrderClientSelect(event.target.value));
    $('web-order-client-search').addEventListener('keydown', event => {
      if (event.key === 'Escape') $('web-order-client-results').hidden = true;
      if (event.key === 'Enter' && !$('web-order-client').value) {
        event.preventDefault();
        $('web-order-client-results').querySelector('[data-client-value]')?.click();
      }
    });
    $('web-new-client-phone').addEventListener('input', () => { $('web-order-contact').value = $('web-new-client-phone').value; });
    $('web-new-client-address').addEventListener('input', () => {
      $('web-order-location').value = [$('web-new-client-address').value,$('web-new-client-neighborhood').value,$('web-new-client-city').value].filter(Boolean).join(', ');
    });
    ['web-new-client-neighborhood','web-new-client-city'].forEach(id => $(id).addEventListener('input', () => {
      $('web-order-location').value = [$('web-new-client-address').value,$('web-new-client-neighborhood').value,$('web-new-client-city').value].filter(Boolean).join(', ');
    }));
  };

  async function uploadOrderImages(files) {
    const urls = [];
    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith('image/')) continue;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2,9)}.${ext}`;
      const { error } = await db.storage.from('pedidos-web').upload(path, file, { contentType:file.type, upsert:false });
      if (error) throw error;
      const { data } = db.storage.from('pedidos-web').getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  }
  window.createWebOrder = async function(event) {
    event.preventDefault();
    const button = $('web-order-save'); button.disabled = true; button.textContent = 'Guardando...';
    try {
      const customerChoice = $('web-order-client').value;
      let client = null;
      let clientId = null;
      if (!customerChoice) throw new Error('Busca y selecciona un cliente antes de guardar el pedido.');
      if (customerChoice === '__new__') {
        const payloadClient = {
          nombres:$('web-new-client-nombres').value.trim(),
          apellidos:$('web-new-client-apellidos').value.trim(),
          cedula:$('web-new-client-cedula').value.trim() || null,
          telefono:$('web-new-client-phone').value.trim(),
          correo:$('web-new-client-email').value.trim(),
          direccion:$('web-new-client-address').value.trim(),
          barrio:$('web-new-client-neighborhood').value.trim(),
          ciudad:$('web-new-client-city').value.trim()
        };
        if (!payloadClient.nombres || !payloadClient.telefono || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payloadClient.correo)) throw new Error('Completa nombre, teléfono y un correo válido para el nuevo cliente.');
        const existingWeb = webClients.find(c =>
          (c.telefono && c.telefono.replace(/\D/g, '').slice(-10) === payloadClient.telefono.replace(/\D/g, '').slice(-10)) ||
          (c.correo && c.correo.trim().toLowerCase() === payloadClient.correo.toLowerCase()));
        if (existingWeb) throw new Error('Este teléfono o correo ya pertenece a un cliente. Búscalo y selecciónalo para evitar duplicados.');
        const tableName = await resolveWebClientsTable();
        const { data, error } = await db.from(tableName).insert([payloadClient]).select('*').single();
        if (error) throw error;
        client = data; clientId = data.id;
        webClients.unshift(client);
      } else if (customerChoice.startsWith('web:')) {
        clientId = customerChoice.slice(4);
        client = webClients.find(c => String(c.id) === String(clientId));
      } else if (customerChoice.startsWith('credit:')) {
        const creditId = customerChoice.slice(7);
        const credit = creditClients.find(c => String(c.id) === String(creditId));
        if (credit) {
          client = webClients.find(c => String(c.cliente_id || '') === String(credit.id)) || null;
          if (!client) {
            const parts = String(credit.nombre || '').trim().split(/\s+/);
            const creditPayload = {
              nombres:parts.shift() || 'Cliente', apellidos:parts.join(' '), cedula:credit.cedula || null,
              telefono:credit.telefono || '', correo:credit.correo || '', direccion:credit.direccion || '',
              barrio:credit.barrio || '', ciudad:credit.ciudad || ''
            };
            const tableName = await resolveWebClientsTable();
            let created = await db.from(tableName).insert([{ ...creditPayload, cliente_id:credit.id }]).select('*').single();
            if (created.error && /cliente_id|column/i.test(created.error.message || '')) {
              created = await db.from(tableName).insert([creditPayload]).select('*').single();
            }
            if (created.error) throw created.error;
            client = created.data;
            webClients.unshift(client);
          }
          clientId = client.id;
        }
      }
      if (!client) throw new Error('Selecciona o registra un cliente válido.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(client.correo || '').trim())) {
        throw new Error('Este cliente no tiene un correo válido. Actualiza su ficha antes de agendar para poder enviar la confirmación.');
      }

      const products = Array.from(document.querySelectorAll('#web-order-products .admin-web-product-row')).map(row => {
        const val = key => row.querySelector(`[data-field="${key}"]`)?.value?.trim() || '';
        const selectedId = val('producto_id');
        const catalogProduct = selectedId && selectedId !== '__custom__' ? getCatalogProducts().find(p => String(p.id) === selectedId) : null;
        const customName = val('custom_name');
        const name = catalogProduct?.nombre || customName || row.dataset.productName || '';
        const accessories = val('accesorio');
        return {
          producto_id:catalogProduct?.id || null,
          nombre:name,
          precio:Number(val('precio')||0),
          cantidad:Number(val('cantidad')||1),
          referencia:val('referencia') || catalogProduct?.referencia || '',
          talla:val('talla'),
          color:val('color'),
          accesorio:accessories,
          incremento_manual:Number(val('incremento_manual') || 0),
          modalidad:$('web-order-type').value,
          ...(catalogProduct?.fotos?.length ? { imagen_url:catalogProduct.fotos[0] } : {})
        };
      }).filter(product => product.nombre);
      if (!products.length) throw new Error('Agrega al menos un producto al pedido.');
      const total = Number($('web-order-total').value||0);
      const shipping = Number($('web-order-shipping').value||0);
      const advance = Number($('web-order-advance').value||0);
      if (advance > total + shipping) throw new Error('El anticipo no puede superar el total más el envío.');
      const images = await uploadOrderImages($('web-order-images').files);
      const locationParts = $('web-order-location').value.trim().split(',').map(x => x.trim()).filter(Boolean);
      const clientFullName = [client.nombres,client.apellidos].filter(Boolean).join(' ') || client.nombre || 'Cliente';
      const payload = {
        cliente_id:clientId,
        tipo_pedido:$('web-order-type').value,
        fecha_entrega:$('web-order-date').value,
        cliente_nombre:clientFullName,
        telefono:$('web-order-contact').value.trim() || client.telefono || '',
        direccion:locationParts[0] || client.direccion || '',
        barrio:locationParts[1] || client.barrio || '',
        ciudad:locationParts[2] || client.ciudad || '',
        total, envio:shipping, anticipo:advance,
        productos:products.map((item,index) => ({ ...item, ...(index === 0 && images.length ? { imagenes:images } : {}) })),
        estado:$('web-order-state').value
      };
      const { data: savedOrder, error } = await db.from('pedidos_web').insert([payload]).select('*').single();
      if (error) throw error;
      // Solicitar el mismo correo del portal público usando el pedido ya guardado.
      // La solicitud se autentica con el JWT real (no con la clave anon ni con el correo remitente).
      let mailWarning = '';
      try {
        const { data: sessionResult, error: sessionError } = await db.auth.getSession();
        if (sessionError) throw sessionError;
        let session = sessionResult?.session;
        if (!session?.access_token) throw new Error('No hay sesión de administrador. Inicia sesión de nuevo.');
        // Fuerza una renovación cuando se aproxima el vencimiento del JWT.
        if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
          const renewed = await db.auth.refreshSession();
          if (renewed.error) throw renewed.error;
          session = renewed.data?.session;
        }
        if (!session?.access_token) throw new Error('No se pudo obtener un token de sesión válido.');
        const { data: emailResult, error: emailError } = await db.functions.invoke('cupissa-emails', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { action:'admin_order_confirmation', order_id:savedOrder.id, cliente_correo:String(client.correo || '').trim() }
        });
        if (emailError) {
          let detail = emailError.message || 'No se pudo enviar el correo.';
          try {
            const ctx = emailError.context;
            if (ctx && typeof ctx.clone === 'function') {
              const response = await ctx.clone().json();
              detail = response.detail || response.error || detail;
              if (response.code) detail = `${response.code}: ${detail}`;
            }
          } catch (_) { /* Respuesta no JSON: conservar error base */ }
          throw new Error(detail);
        }
        if (emailResult?.error) throw new Error(emailResult.detail || emailResult.error);
        if (emailResult?.ok === false) throw new Error(emailResult.error || 'No se confirmó el envío.');
        if (emailResult?.result?.skipped) throw new Error(emailResult.result.reason || 'El envío fue omitido.');
        if (emailResult?.result?.ok === false) throw new Error(emailResult.result.error || 'El proveedor no confirmó el envío.');
      } catch (emailError) {
        const reason = String(emailError?.message || emailError || 'Error desconocido').slice(0, 350);
        console.error('Pedido guardado, pero el correo no fue confirmado:', emailError);
        mailWarning = ` El pedido quedó registrado, pero el correo no se confirmó: ${reason}. No vuelvas a registrar el pedido.`;
      }
      closeAdminWebModal(); await loadWebOrders(); await loadWebClients();
      alert(mailWarning ? 'Pedido guardado.' + mailWarning : 'Pedido registrado y correo de confirmación enviado correctamente.');
    } catch (error) {
      console.error('Error creando pedido web:',error);
      alert(error?.message || 'No fue posible guardar el pedido.');
    } finally { if (button) { button.disabled = false; button.textContent = 'Guardar pedido'; } }
  };

  window.changeWebOrderStatus = async function(id, status) {
    if (!states.includes(status)) return;
    const { error } = await db.from('pedidos_web').update({ estado:status }).eq('id',id);
    if (error) { console.error(error); alert('No fue posible actualizar el estado del pedido.'); await loadWebOrders(); return; }
    const order = webOrders.find(o=>String(o.id)===String(id)); if(order) order.estado=status;
    filterWebOrders();
  };

})();
