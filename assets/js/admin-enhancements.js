/* CUPISSA ADMIN - mejoras incrementales.
   Este módulo extiende la interfaz actual sin sustituir los módulos de créditos,
   catálogo, clientes web ni pedidos que ya están en producción. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));
  const isHidden = product => product?.oculto === true || product?.oculto === 'true';

  // ---------------------------------------------------------------------------
  // Una sola pestaña superior para clientes, con dos espacios de gestión.
  // ---------------------------------------------------------------------------
  let activeClientSubtab = 'creditos';

  function setupClientWorkspace() {
    const credits = $('tab-section-creditos');
    const webClients = $('tab-section-web-clientes');
    if (!credits || !webClients || $('tab-section-clientes')) return;

    const workspace = document.createElement('div');
    workspace.id = 'tab-section-clientes';
    workspace.className = 'space-y-4';
    credits.parentNode.insertBefore(workspace, credits);

    const subnav = document.createElement('div');
    subnav.className = 'admin-client-subtabs';
    subnav.innerHTML = `
      <button type="button" class="admin-client-subtab is-active" data-client-subtab="creditos" onclick="switchClientSubtab('creditos')">
        <i class="fa-solid fa-credit-card mr-1.5"></i> Clientes con crédito
      </button>
      <button type="button" class="admin-client-subtab" data-client-subtab="web" onclick="switchClientSubtab('web')">
        <i class="fa-solid fa-globe mr-1.5"></i> Clientes web
      </button>`;
    workspace.append(subnav, credits, webClients);
    credits.classList.remove('hidden');
    webClients.classList.add('hidden');

    // Se retira la antigua entrada duplicada; la página interior controla ambas listas.
    ['tab-btn-web-clientes', 'tab-btn-web-clientes-mob'].forEach(id => $(id)?.classList.add('hidden'));
  }

  window.switchClientSubtab = function (subtab) {
    activeClientSubtab = subtab === 'web' ? 'web' : 'creditos';
    $('tab-section-creditos')?.classList.toggle('hidden', activeClientSubtab !== 'creditos');
    $('tab-section-web-clientes')?.classList.toggle('hidden', activeClientSubtab !== 'web');
    document.querySelectorAll('[data-client-subtab]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.clientSubtab === activeClientSubtab);
    });
    if (activeClientSubtab === 'web' && typeof window.loadWebAdminData === 'function') {
      window.loadWebAdminData();
    }
  };

  window.switchTab = function (tab) {
    setupClientWorkspace();
    const normalized = tab === 'creditos' || tab === 'web-clientes' || tab === 'clientes' ? 'clientes'
      : tab === 'catalogo' ? 'catalogo'
      : tab === 'web-pedidos' ? 'web-pedidos' : 'clientes';
    ['tab-section-clientes', 'tab-section-catalogo', 'tab-section-web-pedidos'].forEach(id => {
      $(id)?.classList.add('hidden');
    });
    const activeSection = normalized === 'clientes' ? 'tab-section-clientes'
      : normalized === 'catalogo' ? 'tab-section-catalogo' : 'tab-section-web-pedidos';
    $(activeSection)?.classList.remove('hidden');

    if (tab === 'web-clientes') window.switchClientSubtab('web');
    else if (tab === 'creditos') window.switchClientSubtab('creditos');
    else if (normalized === 'clientes' && !$('tab-section-web-clientes')?.classList.contains('hidden')) {
      window.switchClientSubtab('web');
    }

    const activeButton = normalized === 'clientes' ? 'creditos' : normalized;
    ['creditos', 'catalogo', 'web-pedidos'].forEach(key => {
      ['', '-mob'].forEach(suffix => {
        const button = $(`tab-btn-${key}${suffix}`);
        if (!button) return;
        button.classList.remove('bg-pink-50', 'fuchsia-text', 'border', 'border-pink-200');
        button.classList.add('text-slate-600');
        if (key === activeButton) {
          button.classList.add('bg-pink-50', 'fuchsia-text', 'border', 'border-pink-200');
          button.classList.remove('text-slate-600');
        }
      });
    });
    if (normalized === 'web-pedidos' && typeof window.loadWebAdminData === 'function') {
      window.loadWebAdminData();
    }
  };

  // ---------------------------------------------------------------------------
  // Catálogo: listado continuo, buscador fijo y acciones editar/ocultar.
  // ---------------------------------------------------------------------------
  let productFilter = 'all';
  let productsVisibleCount = 32;
  const productsPageChunk = 32;
  let productsObserver = null;

  function installProductFilters() {
    const panel = $('admin-product-search-panel');
    if (!panel || $('admin-product-filters')) return;
    const filterBar = document.createElement('div');
    filterBar.id = 'admin-product-filters';
    filterBar.className = 'admin-product-filters';
    filterBar.innerHTML = `
      <button type="button" data-filter="all" class="admin-product-filter is-active">Todos</button>
      <button type="button" data-filter="visible" class="admin-product-filter">Publicados</button>
      <button type="button" data-filter="hidden" class="admin-product-filter">Ocultos</button>`;
    filterBar.addEventListener('click', event => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      productFilter = button.dataset.filter;
      filterBar.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('is-active', item === button));
      window.filterAdminProductsTable();
    });
    panel.appendChild(filterBar);
  }

  function createProductRow(product) {
    const row = document.createElement('article');
    row.className = `admin-product-row${isHidden(product) ? ' is-hidden' : ''}`;
    const imageUrl = Array.isArray(product.fotos) && product.fotos.length ? product.fotos[0] : '';
    const image = document.createElement('img');
    image.className = 'admin-product-thumb';
    image.alt = product.nombre || 'Producto CUPISSA';
    image.loading = 'lazy';
    if (imageUrl) image.src = imageUrl;
    else image.src = 'favicon.png';

    const main = document.createElement('div');
    main.className = 'admin-product-main';
    const name = document.createElement('div');
    name.className = 'admin-product-name';
    name.textContent = product.nombre || 'Producto sin título';
    const meta = document.createElement('div');
    meta.className = 'admin-product-meta';
    meta.textContent = [product.mundo, product.categoria, product.subcategoria, product.temporada]
      .filter(Boolean).join(' · ') || 'Sin clasificación';
    const price = document.createElement('div');
    price.className = 'admin-product-price';
    const formatter = value => '$ ' + new Intl.NumberFormat('es-CO').format(Number(value || 0));
    price.textContent = `${formatter(product.precio_detal)} · ${Array.isArray(product.fotos) ? product.fotos.length : 0} foto(s)`;
    main.append(name, meta, price);

    const actions = document.createElement('div');
    actions.className = 'admin-product-actions';
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'admin-icon-action';
    edit.title = 'Editar producto'; edit.setAttribute('aria-label', 'Editar producto');
    edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
    edit.addEventListener('click', () => window.openEditProductModal(product.id));
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = `admin-icon-action${isHidden(product) ? ' is-hidden' : ''}`;
    visibility.title = isHidden(product) ? 'Volver a publicar' : 'Ocultar producto';
    visibility.setAttribute('aria-label', visibility.title);
    visibility.innerHTML = isHidden(product) ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    visibility.addEventListener('click', () => window.toggleProductVisibility(product.id));
    actions.append(edit, visibility);
    row.append(image, main, actions);
    return row;
  }

  function renderProductsInfinite() {
    const list = $('products-list');
    if (!list) return;
    const total = Array.isArray(filteredProducts) ? filteredProducts.length : 0;
    const visible = filteredProducts.slice(0, productsVisibleCount);
    list.innerHTML = '';
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'p-8 text-center text-slate-400 text-xs';
      empty.textContent = 'No hay productos que coincidan con la búsqueda.';
      list.appendChild(empty);
    } else {
      visible.forEach(product => list.appendChild(createProductRow(product)));
    }
    const summary = `${Math.min(visible.length, total)} de ${total} producto(s)`;
    const count = $('product-list-count');
    if (count) count.textContent = summary;
    const oldCount = $('val-total-products');
    if (oldCount) oldCount.textContent = String(total);
    const sentinel = $('products-scroll-sentinel');
    if (sentinel) sentinel.textContent = visible.length < total ? 'Desplázate para ver más productos' : 'Has llegado al final del catálogo';
  }

  window.renderProductsTable = renderProductsInfinite;
  window.filterAdminProductsTable = function (options = {}) {
    const previousVisibleCount = productsVisibleCount;
    const query = ($('admin-search-product-input')?.value || '').trim().toLocaleLowerCase('es');
    const products = Array.isArray(allProducts) ? allProducts : [];
    filteredProducts = products.filter(product => {
      const matchesQuery = [product.nombre, product.mundo, product.categoria, product.subcategoria, product.temporada]
        .some(value => String(value || '').toLocaleLowerCase('es').includes(query));
      const matchesFilter = productFilter === 'all'
        || (productFilter === 'hidden' && isHidden(product))
        || (productFilter === 'visible' && !isHidden(product));
      return matchesQuery && matchesFilter;
    });
    if (options.preserveView) {
      productsVisibleCount = Math.min(filteredProducts.length, Math.max(productsPageChunk, previousVisibleCount + Math.max(0, Number(options.revealCount || 0))));
    } else {
      productsVisibleCount = productsPageChunk;
    }
    renderProductsInfinite();
  };

  window.toggleProductVisibility = async function (id) {
    const product = (Array.isArray(allProducts) ? allProducts : []).find(item => String(item.id) === String(id));
    if (!product) return;
    const nextHidden = !isHidden(product);
    const action = nextHidden ? 'ocultar' : 'volver a publicar';
    if (!confirm(`¿Deseas ${action} “${product.nombre || 'este producto'}”? No se eliminará del catálogo.`)) return;
    try {
      const { error } = await supabaseClient.from('productos').update({ oculto: nextHidden }).eq('id', id);
      if (error) throw error;
      product.oculto = nextHidden;
      localStorage.setItem('cupissa_cache_products', JSON.stringify(allProducts));
      window.filterAdminProductsTable();
    } catch (error) {
      console.error('No se pudo cambiar la visibilidad del producto:', error);
      const missingColumn = /oculto|column/i.test(error?.message || '');
      alert(missingColumn
        ? 'Falta crear la columna productos.oculto en Supabase. Dejé preparado el SQL dentro de la carpeta supabase/migrations.'
        : (error?.message || 'No fue posible cambiar la visibilidad del producto.'));
    }
  };

  function setupInfiniteScroll() {
    const sentinel = $('products-scroll-sentinel');
    if (!sentinel || !('IntersectionObserver' in window)) return;
    if (productsObserver) productsObserver.disconnect();
    productsObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      if (productsVisibleCount >= filteredProducts.length) return;
      productsVisibleCount = Math.min(filteredProducts.length, productsVisibleCount + productsPageChunk);
      renderProductsInfinite();
    }, { rootMargin: '500px 0px' });
    productsObserver.observe(sentinel);
  }

  // ---------------------------------------------------------------------------
  // Formulario de producto por fases. Los campos existentes se conservan.
  // ---------------------------------------------------------------------------
  let wizardStep = 1;
  let colorPhoto = '';
  // La elección se exige cuando se cargan dos o más fotografías.
  let publishMode = null;

  function setPublishMode(mode) {
    const panel = $('product-publish-modes');
    const photoCount = Number(panel?.dataset.photoCount || 0);
    if ((mode === 'single' || mode === 'gallery') && photoCount < 2) {
      alert('Selecciona al menos dos fotografías para elegir la modalidad de publicación.');
      return null;
    }
    publishMode = mode === 'single' || mode === 'gallery' ? mode : null;
    window.CUPISSA_PRODUCT_PUBLISH_MODE = publishMode;
    document.querySelectorAll('#product-publish-modes [data-publish-mode]').forEach(button => {
      const active = button.dataset.publishMode === publishMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      const radio = button.querySelector('input[type=radio]');
      if (radio) radio.checked = active;
    });
    return publishMode;
  }
  window.setProductPublishMode = setPublishMode;

  function updateProductPublishModeVisibility() {
    const panel = $('product-publish-modes');
    if (!panel) return;
    const photoCount = Math.max(0, Number(panel.dataset.photoCount || 0));
    const isEditingExistingProduct = !!$('prod-edit-id')?.value;
    // La selección queda visible desde que se abre el formulario. Solo se oculta
    // al editar un producto existente, y se habilita cuando hay dos o más fotos.
    panel.classList.toggle('hidden', isEditingExistingProduct);
    const countLabel = panel.querySelector('[data-publish-count]');
    if (countLabel) {
      countLabel.textContent = photoCount < 2
        ? 'Selecciona al menos 2 fotos para habilitar las opciones.'
        : `${photoCount} fotografías seleccionadas. Elige una modalidad antes de guardar.`;
    }
    panel.querySelectorAll('[data-publish-mode]').forEach(button => {
      const disabled = photoCount < 2 || isEditingExistingProduct;
      button.disabled = disabled;
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    });
    if (photoCount < 2) setPublishMode(null);
  }
  window.updateProductPublishModeVisibility = updateProductPublishModeVisibility;
  window.setProductPublishPhotoCount = function(count) {
    const panel = $('product-publish-modes');
    if (!panel) return;
    panel.dataset.photoCount = String(Math.max(0, Number(count) || 0));
    updateProductPublishModeVisibility();
  };

  function showWizardStep(step) {
    wizardStep = step === 2 ? 2 : 1;
    $('product-step-1')?.toggleAttribute('hidden', wizardStep !== 1);
    $('product-step-2')?.toggleAttribute('hidden', wizardStep !== 2);
    $('product-stepper')?.querySelectorAll('[data-step-indicator]').forEach(item => {
      item.classList.toggle('is-active', Number(item.dataset.stepIndicator) === wizardStep);
    });
    $('product-step-back')?.classList.toggle('hidden', wizardStep === 1);
    $('product-step-next')?.classList.toggle('hidden', wizardStep === 2);
    $('product-step-save')?.classList.toggle('hidden', wizardStep !== 2);
    const modal = $('modal-product-form')?.querySelector(':scope > div');
    if (modal) modal.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateBasicProductStep() {
    const required = [
      ['prod-nombre', 'Escribe el título del producto.'],
      ['prod-mundo', 'Selecciona o escribe el mundo.'],
      ['prod-categoria', 'Selecciona o escribe la categoría.'],
      ['prod-temporada', 'Selecciona o escribe la temporada.']
    ];
    for (const [id, message] of required) {
      const field = $(id);
      if (!field || !String(field.value || '').trim()) {
        alert(message);
        field?.focus();
        return false;
      }
    }
    const editId = $('prod-edit-id')?.value;
    if (!editId && (!Array.isArray(tempBase64Photos) || !tempBase64Photos.length)) {
      alert('Agrega al menos una fotografía del producto. Puedes arrastrarla, seleccionarla o pegarla desde el portapapeles.');
      $('prod-files-input')?.focus();
      return false;
    }
    if (!editId && tempBase64Photos.length > 1 && !['single','gallery'].includes(window.CUPISSA_PRODUCT_PUBLISH_MODE)) {
      alert('Antes de continuar, selecciona una modalidad de publicación debajo de las fotografías.');
      $('product-publish-modes')?.scrollIntoView({ behavior:'smooth', block:'center' });
      return false;
    }
    return true;
  }

  function buildProductWizard() {
    const modal = $('modal-product-form');
    const form = modal?.querySelector('form');
    if (!form || $('product-stepper')) return;
    const direct = Array.from(form.children);
    // querySelector no incluye al propio elemento. El bloque de alquiler usa
    // #wrapper-alquiler-extra en el nodo raíz; si no se reconoce aquí, se elimina
    // al reconstruir el formulario y abrir/editar el producto falla por campos nulos.
    const blockFor = selector => direct.find(element => element.matches?.(selector) || element.querySelector?.(selector));
    const basicInfo = blockFor('#prod-nombre');
    const description = blockFor('#prod-descripcion');
    const classification = blockFor('#prod-categoria');
    const prices = blockFor('#prod-precio-detal');
    const preparation = blockFor('#prod-dias-preparacion');
    const flags = blockFor('#chk-personalizable');
    const rental = blockFor('#wrapper-alquiler-extra');
    const sizes = blockFor('#inp-talla-nombre');
    const colors = blockFor('#inp-color-nombre');
    const accessories = blockFor('#inp-accesorio-nombre');
    const photos = blockFor('#prod-files-input');
    const oldActions = direct.find(element => element.querySelector?.('button[type="submit"]'));
    if (![basicInfo, description, classification, prices, sizes, colors, accessories, photos, oldActions].every(Boolean)) return;

    const stepper = document.createElement('div');
    stepper.id = 'product-stepper';
    stepper.className = 'admin-stepper';
    stepper.innerHTML = `
      <div class="admin-step-indicator is-active" data-step-indicator="1"><span class="admin-step-number">1</span><span><strong class="admin-step-title">Información del producto</strong><small class="admin-step-caption">Nombre, fotos y clasificación</small></span></div>
      <div class="admin-step-indicator" data-step-indicator="2"><span class="admin-step-number">2</span><span><strong class="admin-step-title">Precios y variaciones</strong><small class="admin-step-caption">Tallas, colores y accesorios</small></span></div>`;
    const step1 = document.createElement('section');
    step1.id = 'product-step-1'; step1.className = 'admin-step-pane';
    const step2 = document.createElement('section');
    step2.id = 'product-step-2'; step2.className = 'admin-step-pane';
    [basicInfo, description, classification, photos].forEach(element => step1.appendChild(element));
    [prices, preparation, flags, rental, sizes, colors, accessories].filter(Boolean).forEach(element => step2.appendChild(element));

    const modePanel = $('product-publish-modes') || document.createElement('div');
    modePanel.id = 'product-publish-modes';
    modePanel.className = 'product-publish-mode-panel';
    if (!modePanel.querySelector('[data-publish-mode="single"]')) modePanel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 mt-3">
        <p class="text-[11px] font-black uppercase tracking-wide text-slate-700">¿Cómo deseas publicar estas fotografías?</p>
        <span data-publish-count class="text-[10px] font-semibold text-slate-500"></span>
      </div>
      <div class="admin-publish-modes">
        <button type="button" data-publish-mode="single" aria-pressed="false" class="admin-publish-mode">
          <span class="admin-publish-radio" aria-hidden="true"></span>
          <strong><i class="fa-solid fa-images mr-1"></i> PUBLICAR PRODUCTOS POR SEPARADO</strong>
          <small>Una foto por producto. Crea una publicación por cada foto; todos los productos conservan los mismos datos, precios y variaciones, pero cada uno guarda únicamente su propia fotografía.</small>
        </button>
        <button type="button" data-publish-mode="gallery" aria-pressed="false" class="admin-publish-mode">
          <span class="admin-publish-radio" aria-hidden="true"></span>
          <strong><i class="fa-solid fa-layer-group mr-1"></i> PUBLICAR PRODUCTOS JUNTOS</strong>
          <small>Crea una publicación por cada foto como portada. Cada publicación tendrá su propio perfil y contendrá todas las fotos en su galería.</small>
        </button>
      </div>
      <p class="text-[10px] font-semibold text-slate-600 mt-2">Debes seleccionar una de las dos opciones para continuar.</p>`;
    if (!modePanel.dataset.eventsReady) {
      modePanel.addEventListener('click', event => {
        const option = event.target.closest('[data-publish-mode]');
        if (option && !option.disabled) setPublishMode(option.dataset.publishMode);
      });
      modePanel.dataset.eventsReady = 'true';
    }
    const fileInput = $('prod-files-input');
    const photoPanel = fileInput?.closest('.border');
    if (photoPanel) {
      photoPanel.classList.add('product-photo-dropzone');
      const label = photoPanel.querySelector('label');
      if (label) label.textContent = 'FOTOGRAFÍAS DEL PRODUCTO (PUEDES SELECCIONAR VARIAS)';
      const hint = photoPanel.querySelector('p');
      if (hint) hint.textContent = 'Arrastra imágenes aquí, selecciónalas o pégalas desde el portapapeles. Puedes recortar cada foto antes de guardar.';
      const previewContainer = $('files-preview-container');
      if (modePanel.parentNode !== photoPanel) {
        if (previewContainer?.parentNode === photoPanel) photoPanel.insertBefore(modePanel, previewContainer.nextSibling);
        else photoPanel.appendChild(modePanel);
      } else if (previewContainer?.parentNode === photoPanel && modePanel.previousElementSibling !== previewContainer) {
        photoPanel.insertBefore(modePanel, previewContainer.nextSibling);
      }
      const pasteHelp = document.createElement('p');
      pasteHelp.className = 'text-[10px] text-slate-400 mt-2';
      pasteHelp.innerHTML = '<i class="fa-regular fa-paste mr-1"></i> También puedes copiar una imagen y pegarla aquí con Ctrl + V.';
      photoPanel.appendChild(pasteHelp);
    }

    // El formulario de colores ahora admite su propia fotografía.
    const colorPhotoArea = document.createElement('div');
    colorPhotoArea.id = 'prod-color-photo-area';
    colorPhotoArea.className = 'admin-image-dropzone grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end rounded-xl p-2';
    colorPhotoArea.innerHTML = `
      <label class="block text-[10px] font-black uppercase text-slate-600">Foto de referencia del color
        <input id="prod-color-file" type="file" accept="image/*" class="mt-1 w-full bg-white border border-slate-200 rounded-xl p-2 text-[10px]">
      </label>
      <div id="prod-color-photo-preview" class="hidden"></div>`;
    const accessoryLabel = $('inp-accesorio-foto')?.closest('label');
    if (accessoryLabel) { accessoryLabel.id = 'prod-accessory-photo-area'; accessoryLabel.classList.add('admin-image-dropzone','rounded-xl','p-2'); }
    const colorChildren = Array.from(colors.children);
    const colorInputRow = colorChildren.find(element => element.querySelector?.('#inp-color-nombre'));
    if (colorInputRow) colors.insertBefore(colorPhotoArea, colorInputRow.nextSibling);

    const actions = document.createElement('div');
    actions.className = 'admin-step-actions';
    actions.innerHTML = `
      <button type="button" onclick="closeProductModal()" class="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold">Cancelar</button>
      <div class="flex items-center gap-2">
        <button id="product-step-back" type="button" class="hidden px-5 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold" onclick="showProductStep(1)">Atrás</button>
        <button id="product-step-next" type="button" class="px-6 py-3 fuchsia-btn rounded-xl font-bold shadow-md" onclick="goToProductStep2()">Continuar <i class="fa-solid fa-arrow-right ml-1"></i></button>
        <button id="product-step-save" type="submit" class="hidden px-6 py-3 fuchsia-btn rounded-xl font-bold shadow-md"><i class="fa-solid fa-check mr-1"></i> Guardar producto(s)</button>
      </div>`;

    form.replaceChildren(...Array.from(form.children).filter(node => node.id === 'prod-edit-id'));
    form.append(stepper, step1, step2, actions);

    // El formulario está dividido en fases y algunos campos requeridos quedan dentro
    // de un panel oculto. Desactivamos la validación HTML nativa para que no bloquee
    // el submit sin mostrar una acción visible; la validación se realiza en el flujo JS.
    form.noValidate = true;
    form.removeAttribute('onsubmit');
    if (!form.dataset.cupissaProductSubmitReady) {
      form.addEventListener('submit', event => {
        event.preventDefault();
        const submitHandler = window.handleSaveProduct;
        if (typeof submitHandler !== 'function') {
          alert('No se pudo iniciar el guardado del producto. Recarga CUPISSA ADMIN y vuelve a intentarlo.');
          console.error('CUPISSA: window.handleSaveProduct no está disponible.');
          return;
        }
        Promise.resolve(submitHandler(event)).catch(error => {
          console.error('Error inesperado al guardar el producto:', error);
          alert(`No se pudo guardar el producto: ${error?.message || 'Error inesperado.'}`);
        });
      });
      form.dataset.cupissaProductSubmitReady = 'true';
    }

    window.showProductStep = showWizardStep;
    window.goToProductStep2 = function () { if (validateBasicProductStep()) showWizardStep(2); };
    $('prod-color-file')?.addEventListener('change', event => window.handleColorFotoSelected(event));
    setPublishMode(null);
    window.setProductPublishPhotoCount?.(0);
    showWizardStep(1);
  }

  const baseOpenProduct = window.openProductModal;
  if (typeof baseOpenProduct === 'function') {
    window.openProductModal = function (...args) {
      baseOpenProduct.apply(this, args);
      colorPhoto = '';
      setPublishMode(null);
      window.setProductPublishPhotoCount?.(0);
      // En un producto nuevo el selector siempre debe verse; queda deshabilitado
      // hasta que se carguen al menos dos fotografías.
      $('product-publish-modes')?.classList.remove('hidden');
      window.updateProductPublishModeVisibility?.();
      window.renderColorFotoPreview();
      showWizardStep(1);
    };
  }
  const baseEditProduct = window.openEditProductModal;
  if (typeof baseEditProduct === 'function') {
    window.openEditProductModal = function (...args) {
      baseEditProduct.apply(this, args);
      colorPhoto = '';
      $('product-publish-modes')?.classList.add('hidden');
      window.renderColorFotoPreview();
      showWizardStep(1);
    };
  }

  // ---------------------------------------------------------------------------
  // Recorte de fotos: producto, color y accesorio con el mismo editor.
  // ---------------------------------------------------------------------------
  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`No se pudo leer ${file.name || 'la imagen'}.`));
      reader.readAsDataURL(file);
    });
  }

  async function enqueueImageFiles(files, target = 'product') {
    const imageFiles = Array.from(files || []).filter(file => file?.type?.startsWith('image/'));
    if (!imageFiles.length) return;
    const oversized = imageFiles.filter(file => file.size > 15 * 1024 * 1024);
    if (oversized.length) {
      alert('Cada imagen debe pesar máximo 15 MB.');
    }
    const allowed = imageFiles.filter(file => file.size <= 15 * 1024 * 1024);
    try {
      const dataUrls = await Promise.all(allowed.map(readImageFile));
      dataUrls.forEach(original => pendingImageQueue.push({ original, target }));
      if (pendingImageQueue.length && !currentCropper) startQueuedImageCrop();
    } catch (error) {
      alert(error.message || 'No fue posible cargar la imagen.');
    }
  }

  function startQueuedImageCrop() {
    if (!pendingImageQueue.length) return;
    const item = pendingImageQueue[0];
    const image = $('image-to-crop');
    if (!image || typeof window.Cropper !== 'function') {
      alert('El editor de imágenes no está disponible.');
      pendingImageQueue.length = 0;
      return;
    }
    $('cropper-counter').textContent = `${pendingImageQueue.length} imagen(es) pendiente(s)`;
    if (currentCropper) { currentCropper.destroy(); currentCropper = null; }
    image.onload = () => {
      currentCropper = new Cropper(image, { aspectRatio: 1, viewMode: 2, autoCropArea: .92, responsive: true, background: false });
    };
    image.onerror = () => {
      alert('No fue posible abrir esta fotografía.');
      pendingImageQueue.shift();
      if (pendingImageQueue.length) startQueuedImageCrop();
      else $('modal-cropper')?.classList.add('hidden');
    };
    $('modal-cropper')?.classList.remove('hidden');
    image.src = item.original;
  }

  function closeCurrentCropper() {
    if (currentCropper) { currentCropper.destroy(); currentCropper = null; }
    $('modal-cropper')?.classList.add('hidden');
  }

  function applyCroppedImage(cropped, original, queueItem) {
    const target = queueItem?.target || 'product';
    if (target === 'product') {
      tempBase64Photos.push(cropped);
      tempOriginalPhotos.push(original);
      window.renderPreviewPhotos();
    } else if (target === 'product-edit') {
      const index = Number(queueItem.index);
      tempBase64Photos[index] = cropped;
      tempOriginalPhotos[index] = original;
      window.renderPreviewPhotos();
    } else if (target === 'accessory') {
      tempAccesorioFoto = cropped;
      window.renderAccesorioFotoPreview();
    } else if (target === 'color') {
      colorPhoto = cropped;
      window.renderColorFotoPreview();
    }
  }

  function finishQueuedCrop(skip = false) {
    if (!pendingImageQueue.length) { closeCurrentCropper(); return; }
    const item = pendingImageQueue[0];
    let result = item.original;
    if (!skip && currentCropper) {
      const canvas = currentCropper.getCroppedCanvas({ width: 1000, height: 1000, imageSmoothingQuality: 'high' });
      if (canvas) result = canvas.toDataURL('image/jpeg', .9);
    }
    pendingImageQueue.shift();
    applyCroppedImage(result, item.original, item);
    closeCurrentCropper();
    if (pendingImageQueue.length) window.setTimeout(startQueuedImageCrop, 180);
  }

  window.handleImageFilesSelected = function (event) {
    enqueueImageFiles(event?.target?.files, 'product');
    if (event?.target) event.target.value = '';
  };
  window.handleAccesorioFotoSelected = function (event) {
    enqueueImageFiles(event?.target?.files, 'accessory');
    if (event?.target) event.target.value = '';
  };
  window.handleColorFotoSelected = function (event) {
    enqueueImageFiles(event?.target?.files, 'color');
    if (event?.target) event.target.value = '';
  };
  window.confirmCropPhoto = () => finishQueuedCrop(false);
  window.skipCurrentPhotoCrop = () => finishQueuedCrop(true);

  window.renderColorFotoPreview = function () {
    const preview = $('prod-color-photo-preview');
    if (!preview) return;
    preview.innerHTML = '';
    if (!colorPhoto) { preview.classList.add('hidden'); return; }
    const image = document.createElement('img');
    image.src = colorPhoto; image.alt = 'Foto del color';
    image.className = 'w-14 h-14 object-cover rounded-xl border border-slate-200';
    preview.appendChild(image); preview.classList.remove('hidden');
  };

  window.renderAccesorioFotoPreview = function () {
    const preview = $('accesorio-foto-preview');
    if (!preview) return;
    preview.innerHTML = '';
    if (!tempAccesorioFoto) { preview.classList.add('hidden'); return; }
    const image = document.createElement('img');
    image.src = tempAccesorioFoto; image.alt = 'Vista previa del accesorio';
    image.className = 'w-16 h-16 object-cover rounded-xl border border-emerald-200';
    preview.appendChild(image); preview.classList.remove('hidden');
  };

  window.addColorToList = function () {
    const nameInput = $('inp-color-nombre');
    const incrementInput = $('inp-color-incremento');
    const name = nameInput?.value.trim();
    if (!name) return;
    const exists = tempColores.some(item => String(typeof item === 'string' ? item : item.nombre).trim().toUpperCase() === name.toUpperCase());
    if (exists) { alert('Ese color ya está agregado.'); return; }
    tempColores.push({ nombre: name, incremento: Math.max(0, Number(incrementInput?.value || 0)), foto: colorPhoto });
    if (nameInput) nameInput.value = '';
    if (incrementInput) incrementInput.value = '';
    colorPhoto = '';
    if ($('prod-color-file')) $('prod-color-file').value = '';
    window.renderColorFotoPreview();
    window.renderColoresTags();
  };

  window.renderColoresTags = function () {
    const container = $('list-colores-tags');
    if (!container) return;
    container.innerHTML = '';
    tempColores.forEach((item, index) => {
      const color = typeof item === 'string' ? { nombre: item, incremento: 0 } : item;
      const tag = document.createElement('div');
      tag.className = 'admin-image-option text-[11px]';
      if (color.foto) {
        const image = document.createElement('img'); image.src = color.foto; image.alt = `Color ${color.nombre}`; tag.appendChild(image);
      }
      const text = document.createElement('span');
      text.className = 'font-bold text-slate-700';
      text.textContent = `${color.nombre} (+${new Intl.NumberFormat('es-CO').format(Number(color.incremento || 0))})`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'ml-1 text-rose-600 font-black'; remove.textContent = '×';
      remove.addEventListener('click', () => { tempColores.splice(index, 1); window.renderColoresTags(); });
      tag.append(text, remove); container.appendChild(tag);
    });
  };

  window.renderPreviewPhotos = function () {
    const container = $('files-preview-container');
    if (!container) return;
    container.innerHTML = '';
    tempBase64Photos.forEach((src, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'admin-photo-preview';
      const image = document.createElement('img'); image.src = src; image.alt = `Foto ${index + 1} del producto`;
      image.className = 'w-20 h-20 object-cover rounded-xl border border-slate-200';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-5 h-5 text-[10px] font-black';
      remove.textContent = '×'; remove.title = 'Quitar fotografía'; remove.addEventListener('click', () => window.removeTempPhoto(index));
      wrapper.append(image, remove);
      if (String(tempOriginalPhotos[index] || '').startsWith('data:')) {
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'admin-photo-edit'; edit.textContent = 'Recortar';
        edit.addEventListener('click', () => {
          pendingImageQueue.push({ original: tempOriginalPhotos[index], target: 'product-edit', index });
          if (!currentCropper) startQueuedImageCrop();
        });
        wrapper.appendChild(edit);
      }
      container.appendChild(wrapper);
    });
    // Mantiene visible la selección de modalidad apenas existen 2 o más fotos.
    // tempBase64Photos es el arreglo real que se llena al terminar cada recorte.
    if (typeof window.setProductPublishPhotoCount === 'function') {
      window.setProductPublishPhotoCount(tempBase64Photos.length);
    }
  };

  // Drag & drop y portapapeles para las imágenes principales.
  function setupImageDropAndPaste() {
    const zones = [
      { input:$('prod-files-input'), target:'product', zone:$('prod-files-input')?.closest('.product-photo-dropzone') },
      { input:$('prod-color-file'), target:'color', zone:$('prod-color-photo-area') },
      { input:$('inp-accesorio-foto'), target:'accessory', zone:$('prod-accessory-photo-area') }
    ];
    zones.forEach(({ input, target, zone }) => {
      if (!input || !zone || zone.dataset.dropReady) return;
      zone.dataset.dropReady = 'true';
      zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('is-dragging'); });
      zone.addEventListener('dragleave', event => { if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-dragging'); });
      zone.addEventListener('drop', event => {
        event.preventDefault(); zone.classList.remove('is-dragging');
        enqueueImageFiles(event.dataTransfer?.files, target);
      });
    });
    window.addEventListener('paste', event => {
      if ($('modal-product-form')?.classList.contains('hidden')) return;
      const files = Array.from(event.clipboardData?.items || []).filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile()).filter(Boolean);
      if (!files.length) return;
      const active = document.activeElement;
      let target = 'product';
      if (active?.id === 'prod-color-file' || $('prod-color-photo-area')?.contains(active)) target = 'color';
      else if (active?.id === 'inp-accesorio-foto' || $('prod-accessory-photo-area')?.contains(active)) target = 'accessory';
      event.preventDefault();
      enqueueImageFiles(files, target);
    });
  }

  // ---------------------------------------------------------------------------
  // Instalación PWA: la acción instala ADMIN en la pantalla de inicio.
  // ---------------------------------------------------------------------------
  let installPrompt = null;
  function setupInstallButton() {
    const button = $('install-admin-app');
    if (!button || button.dataset.ready) return;
    button.dataset.ready = 'true';
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault(); installPrompt = event;
      button.classList.add('is-installable');
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      button.innerHTML = '<i class="fa-solid fa-check"></i><span>ADMIN instalada</span>';
    });
    button.addEventListener('click', async () => {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice.catch(() => null);
        installPrompt = null;
        return;
      }
      const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      if (isStandalone) { alert('ADMIN ya está instalada en este dispositivo.'); return; }
      alert(isAppleMobile
        ? 'Para instalar ADMIN: abre el menú Compartir de Safari y selecciona “Añadir a pantalla de inicio”.'
        : 'ADMIN se instala desde el menú de instalación del navegador. Abre el menú del navegador y selecciona “Instalar aplicación” o “Añadir a pantalla de inicio”.');
    });
  }

  // ---------------------------------------------------------------------------
  // Inicio de mejoras tras cargar la estructura existente.
  // ---------------------------------------------------------------------------
  function initEnhancements() {
    setupClientWorkspace();
    installProductFilters();
    buildProductWizard();
    setupImageDropAndPaste();
    setupInstallButton();
    setupInfiniteScroll();
    if ($('tab-section-creditos')) window.switchTab('clientes');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEnhancements, { once: true });
  else initEnhancements();
})();
