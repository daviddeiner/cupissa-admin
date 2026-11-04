/* CUPISSA ADMIN | Módulo independiente para clientes_web y pedidos_web.
   No reemplaza ni modifica la gestión histórica de clientes, créditos o productos. */
(() => {
  const db = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cop = value => '$ ' + new Intl.NumberFormat('es-CO').format(Number(value || 0));
  const states = ['AGENDADO','EN FABRICACIÓN','EN DEPARTAMENTO DE DESPACHO','EN CAMINO','ENTREGADO','CANCELADO'];
  let webClients = [];
  let filteredWebClients = [];
  let webOrders = [];
  let filteredWebOrders = [];

  function adminReady() { return localStorage.getItem('cupissa_admin_logged') === 'true' && !!db; }
  function renderLoadError(tbodyId, colspan, message) {
    const body = $(tbodyId); if (body) body.innerHTML = `<tr><td colspan="${colspan}" class="p-6 text-center text-rose-600">${esc(message)}</td></tr>`;
  }
  function clientName(client) { return [client?.nombres, client?.apellidos].filter(Boolean).join(' ') || 'Cliente sin nombre'; }

  async function loadWebAdminData() {
    if (!adminReady()) return;
    await loadWebClients();
    await loadWebOrders();
  }
  async function loadWebClients() {
    try {
      const { data, error } = await db.from('clientes_web').select('*').order('created_at', { ascending:false });
      if (error) throw error;
      webClients = data || []; filteredWebClients = [...webClients]; renderWebClients();
      populateOrderClientSelect();
    } catch (error) {
      console.error('No fue posible consultar clientes_web:', error);
      renderLoadError('web-clients-tbody',8,'No se pudieron cargar los clientes. Verifica que exista clientes_web y que Supabase permita la consulta.');
    }
  }
  async function loadWebOrders() {
    try {
      const { data, error } = await db.from('pedidos_web').select('*').order('created_at', { ascending:false });
      if (error) throw error;
      webOrders = (data || []).map(order => ({...order, _client: webClients.find(c => String(c.id) === String(order.cliente_web_id)) || null}));
      filteredWebOrders = [...webOrders]; renderWebOrders();
    } catch (error) {
      console.error('No fue posible consultar pedidos_web:', error);
      renderLoadError('web-orders-tbody',13,'No se pudieron cargar los pedidos. Verifica que exista pedidos_web y que Supabase permita la consulta.');
    }
  }
  function renderWebClients() {
    const body = $('web-clients-tbody'); if (!body) return;
    $('web-clients-total').textContent = webClients.length;
    if (!filteredWebClients.length) { body.innerHTML = '<tr><td colspan="8" class="p-7 text-center text-slate-400">No hay clientes web registrados.</td></tr>'; return; }
    body.innerHTML = filteredWebClients.map(c => `<tr class="hover:bg-slate-50"><td class="admin-web-table-cell font-bold">${esc(c.nombres)}</td><td class="admin-web-table-cell">${esc(c.apellidos)}</td><td class="admin-web-table-cell font-mono">${esc(c.telefono)}</td><td class="admin-web-table-cell">${esc(c.correo)}</td><td class="admin-web-table-cell">${esc(c.direccion)}</td><td class="admin-web-table-cell">${esc(c.barrio)}</td><td class="admin-web-table-cell">${esc(c.ciudad)}</td><td class="admin-web-table-cell"><button type="button" class="admin-web-button" onclick="viewWebClient('${esc(c.id)}')">Ver ficha</button></td></tr>`).join('');
  }
  function renderWebOrders() {
    const body = $('web-orders-tbody'); if (!body) return;
    if (!filteredWebOrders.length) { body.innerHTML = '<tr><td colspan="13" class="p-7 text-center text-slate-400">Todavía no hay pedidos web registrados.</td></tr>'; return; }
    body.innerHTML = filteredWebOrders.map(o => {
      const items = Array.isArray(o.productos) ? o.productos : [];
      const photoCount = Array.isArray(o.imagenes) ? o.imagenes.length : 0;
      const rest = o.restante != null ? o.restante : Math.max(0, Number(o.total||0)+Number(o.domicilio_envio||0)-Number(o.anticipo||0));
      const statusOptions = states.map(s => `<option value="${s}" ${String(o.estado||'AGENDADO')===s?'selected':''}>${s}</option>`).join('');
      return `<tr class="hover:bg-slate-50">
        <td class="admin-web-table-cell font-black text-pink-700">${esc(o.numero_pedido || 'CUP')}</td>
        <td class="admin-web-table-cell">${items.map(p=>esc(p.nombre||p.producto||'Producto')).join('<br>') || '—'}</td>
        <td class="admin-web-table-cell">${esc(o.tipo_pedido)}</td><td class="admin-web-table-cell">${esc(o.fecha_entrega)}</td>
        <td class="admin-web-table-cell font-bold">${esc(clientName(o._client))}</td><td class="admin-web-table-cell">${esc(o.contacto || o._client?.telefono)}</td>
        <td class="admin-web-table-cell">${esc(o.ubicacion || o._client?.direccion)}</td>
        <td class="admin-web-table-cell font-bold">${cop(o.total)}</td><td class="admin-web-table-cell">${cop(o.domicilio_envio)}</td>
        <td class="admin-web-table-cell">${cop(o.anticipo)}</td><td class="admin-web-table-cell font-black text-pink-700">${cop(rest)}</td>
        <td class="admin-web-table-cell"><button type="button" class="admin-web-button" onclick="viewWebOrder('${esc(o.id)}')"><i class="fa-regular fa-images mr-1"></i> Ver (${photoCount})</button></td>
        <td class="admin-web-table-cell"><select class="admin-web-status" aria-label="Cambiar estado de pedido" onchange="changeWebOrderStatus('${esc(o.id)}',this.value)">${statusOptions}</select></td>
      </tr>`;
    }).join('');
  }
  function filterWebClients() {
    const q = ($('web-client-search')?.value || '').trim().toLowerCase();
    filteredWebClients = webClients.filter(c => [c.nombres,c.apellidos,c.telefono,c.correo,c.direccion,c.barrio,c.ciudad].some(v => String(v||'').toLowerCase().includes(q)));
    renderWebClients();
  }
  function filterWebOrders() {
    const q = ($('web-order-search')?.value || '').trim().toLowerCase();
    filteredWebOrders = webOrders.filter(o => [o.numero_pedido,o.tipo_pedido,o.fecha_entrega,o.contacto,o.ubicacion,o._client?.nombres,o._client?.apellidos,o._client?.telefono].some(v => String(v||'').toLowerCase().includes(q)));
    renderWebOrders();
  }
  function populateOrderClientSelect() {
    const select = $('web-order-client'); if (!select) return;
    select.innerHTML = '<option value="">Selecciona un cliente</option>' + webClients.map(c=>`<option value="${esc(c.id)}">${esc(clientName(c))} · ${esc(c.telefono)}</option>`).join('');
  }

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

  window.viewWebClient = function(id) {
    const c = webClients.find(item => String(item.id) === String(id)); if (!c) return;
    showAdminWebModal('Ficha de cliente', `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${[['Nombres',c.nombres],['Apellidos',c.apellidos],['Teléfono',c.telefono],['Correo',c.correo],['Dirección',c.direccion],['Barrio',c.barrio],['Ciudad',c.ciudad],['Registro',c.created_at ? new Date(c.created_at).toLocaleString('es-CO') : '—']].map(([k,v])=>`<div class="rounded-xl bg-slate-50 p-3"><span class="block text-[9px] font-black uppercase tracking-wider text-slate-400">${esc(k)}</span><strong class="block text-sm text-slate-800 mt-1 break-words">${esc(v || '—')}</strong></div>`).join('')}</div>`);
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
    const images = Array.isArray(o.imagenes) ? o.imagenes : [];
    const rest = o.restante != null ? o.restante : Math.max(0,Number(o.total||0)+Number(o.domicilio_envio||0)-Number(o.anticipo||0));
    const productsHtml = items.map((p,i)=>`<div class="p-3 rounded-xl border border-slate-100 flex gap-3">${p.imagen_url?`<img src="${esc(p.imagen_url)}" class="admin-web-order-image">`:''}<div class="min-w-0 flex-1"><strong class="text-xs text-slate-900">${i+1}. ${esc(p.nombre||p.producto||'Producto')}</strong><p class="text-[11px] text-slate-500 mt-1">Referencia: ${esc(p.referencia||'—')} · Talla: ${esc(p.talla||'—')} · Color: ${esc(p.color||'—')}</p><p class="text-[11px] text-slate-600 mt-1">Cantidad: ${esc(p.cantidad||1)} · Precio: ${cop(p.precio)}</p></div></div>`).join('') || '<p class="text-xs text-slate-400">Sin productos detallados.</p>';
    const imagesHtml = images.map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" class="admin-web-order-image"></a>`).join('');
    showAdminWebModal(`Pedido ${o.numero_pedido || ''}`, `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">${[['Cliente',clientName(c)],['Teléfono',o.contacto||c.telefono],['Tipo',o.tipo_pedido],['Fecha de entrega',o.fecha_entrega],['Ubicación',o.ubicacion],['Estado',o.estado],['Total',cop(o.total)],['Domicilio / envío',cop(o.domicilio_envio)],['Anticipo',cop(o.anticipo)],['Restante',cop(rest)]].map(([k,v])=>`<div class="bg-slate-50 rounded-xl p-3"><span class="block text-[9px] uppercase font-black text-slate-400">${esc(k)}</span><strong class="block text-xs text-slate-800 mt-1 break-words">${esc(v||'—')}</strong></div>`).join('')}</div><h4 class="text-xs font-black uppercase text-slate-700 mb-3">Productos y referencias</h4><div class="space-y-2">${productsHtml}</div>${images.length?`<h4 class="text-xs font-black uppercase text-slate-700 mt-5 mb-3">Imágenes del pedido</h4><div class="flex flex-wrap gap-2">${imagesHtml}</div>`:''}`);
  };

  function addProductRow() {
    const container = $('web-order-products'); if (!container) return;
    const row = document.createElement('div'); row.className = 'admin-web-product-row';
    row.innerHTML = `
      <div class="wide"><label class="admin-web-label">Producto</label><input class="admin-web-input" data-field="nombre" required placeholder="Nombre del producto"></div>
      <div><label class="admin-web-label">Precio unitario</label><input class="admin-web-input" data-field="precio" type="number" min="0" step="1" value="0" required></div>
      <div><label class="admin-web-label">Cantidad</label><input class="admin-web-input" data-field="cantidad" type="number" min="1" step="1" value="1" required></div>
      <div><label class="admin-web-label">Referencia</label><input class="admin-web-input" data-field="referencia" placeholder="Ref."></div>
      <div><label class="admin-web-label">Talla</label><input class="admin-web-input" data-field="talla" placeholder="Talla"></div>
      <div><label class="admin-web-label">Color</label><input class="admin-web-input" data-field="color" placeholder="Color"></div>
      <div class="flex items-end"><button type="button" class="w-full h-10 rounded-xl bg-rose-50 text-rose-600" title="Quitar producto" onclick="this.closest('.admin-web-product-row').remove()"><i class="fa-solid fa-trash"></i></button></div>`;
    container.appendChild(row);
  }
  window.addWebOrderProductRow = addProductRow;

  window.openNewWebOrder = function() {
    if (!webClients.length) { alert('Primero debe existir al menos un cliente registrado desde Perfil CUPISSA.'); switchTab('web-clientes'); return; }
    const content = `
      <form id="web-order-form" onsubmit="createWebOrder(event)" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label class="admin-web-label">Cliente *</label><select id="web-order-client" class="admin-web-input" required><option value="">Selecciona un cliente</option></select></div>
          <div><label class="admin-web-label">Modalidad *</label><select id="web-order-type" class="admin-web-input" required><option value="VENTA">VENTA</option><option value="ALQUILER">ALQUILER</option></select></div>
          <div><label class="admin-web-label">Fecha de entrega *</label><input id="web-order-date" class="admin-web-input" type="date" required></div>
          <div><label class="admin-web-label">Contacto</label><input id="web-order-contact" class="admin-web-input" placeholder="Teléfono de contacto"></div>
          <div class="sm:col-span-2"><label class="admin-web-label">Ubicación / dirección de entrega</label><input id="web-order-location" class="admin-web-input" placeholder="Dirección, barrio, ciudad"></div>
        </div>
        <div class="rounded-2xl border border-slate-100 p-3 sm:p-4 space-y-3"><div class="flex items-center justify-between gap-2"><h4 class="font-black text-xs text-slate-800">Productos del pedido</h4><button type="button" onclick="addWebOrderProductRow()" class="admin-web-button"><i class="fa-solid fa-plus mr-1"></i> Añadir producto</button></div><div id="web-order-products" class="space-y-2"></div></div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><label class="admin-web-label">Total productos ($) *</label><input id="web-order-total" class="admin-web-input" type="number" min="0" step="1" value="0" required></div><div><label class="admin-web-label">Domicilio / envío ($)</label><input id="web-order-shipping" class="admin-web-input" type="number" min="0" step="1" value="0"></div><div><label class="admin-web-label">Anticipo ($)</label><input id="web-order-advance" class="admin-web-input" type="number" min="0" step="1" value="0"></div></div>
        <div><label class="admin-web-label">Fotografías del pedido</label><input id="web-order-images" class="admin-web-input" type="file" accept="image/*" multiple><p class="text-[10px] text-slate-400 mt-1">Puedes adjuntar varias fotos. Se almacenan en el bucket pedidos-web de Supabase.</p></div>
        <div><label class="admin-web-label">Estado inicial</label><select id="web-order-state" class="admin-web-input">${states.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
        <div class="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onclick="closeAdminWebModal()" class="px-5 py-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">Cancelar</button><button id="web-order-save" type="submit" class="px-5 py-3 rounded-xl fuchsia-btn text-xs font-black">Guardar pedido</button></div>
      </form>`;
    showAdminWebModal('Registrar nuevo pedido', content);
    populateOrderClientSelect(); addProductRow();
    $('web-order-client').addEventListener('change', () => {
      const c = webClients.find(x => String(x.id) === $('web-order-client').value);
      if (!c) return;
      $('web-order-contact').value = c.telefono || '';
      $('web-order-location').value = [c.direccion,c.barrio,c.ciudad].filter(Boolean).join(', ');
    });
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
      const client = webClients.find(c => String(c.id) === $('web-order-client').value);
      if (!client) throw new Error('Selecciona un cliente válido.');
      const products = Array.from(document.querySelectorAll('#web-order-products .admin-web-product-row')).map(row => {
        const val = key => row.querySelector(`[data-field="${key}"]`)?.value?.trim() || '';
        return { nombre:val('nombre'), precio:Number(val('precio')||0), cantidad:Number(val('cantidad')||1), referencia:val('referencia'), talla:val('talla'), color:val('color') };
      }).filter(p=>p.nombre);
      if (!products.length) throw new Error('Agrega al menos un producto al pedido.');
      const total = Number($('web-order-total').value||0);
      const shipping = Number($('web-order-shipping').value||0);
      const advance = Number($('web-order-advance').value||0);
      if (advance > total + shipping) throw new Error('El anticipo no puede superar el total más el envío.');
      const images = await uploadOrderImages($('web-order-images').files);
      const payload = {
        cliente_web_id: client.id, cliente_id: client.cliente_id || null,
        tipo_pedido: $('web-order-type').value,
        fecha_entrega: $('web-order-date').value,
        contacto: $('web-order-contact').value.trim() || client.telefono || '',
        ubicacion: $('web-order-location').value.trim() || [client.direccion,client.barrio,client.ciudad].filter(Boolean).join(', '),
        total, domicilio_envio:shipping, anticipo:advance,
        productos:products, imagenes:images, estado:$('web-order-state').value
      };
      const { error } = await db.from('pedidos_web').insert([payload]);
      if (error) throw error;
      closeAdminWebModal(); await loadWebOrders(); alert('Pedido registrado correctamente.');
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
  };

})();
