/** CUPISSA ADMIN | Módulo de catálogo y productos. */

// Cada producto puede pertenecer a varios valores de cada filtro.
var productMultiSelections = {
    mundo: [],
    categoria: [],
    subcategoria: [],
    temporada: []
};

function normalizeProductMultiValues(value, legacyValue = '') {
    let values = [];
    if (Array.isArray(value)) {
        values = value;
    } else if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            values = Array.isArray(parsed) ? parsed : [value];
        } catch (_) {
            values = [value];
        }
    }
    if (!values.length && legacyValue != null && String(legacyValue).trim()) {
        values = [legacyValue];
    }
    const unique = [];
    values.forEach(item => {
        const clean = String(item ?? '').trim();
        if (clean && !unique.some(existing => existing.toLocaleLowerCase('es-CO') === clean.toLocaleLowerCase('es-CO'))) {
            unique.push(clean);
        }
    });
    return unique;
}

function productMultiValuesFromRow(product, field) {
    const pluralField = `${field}s`;
    return normalizeProductMultiValues(product?.[pluralField], product?.[field]);
}

function setProductMultiValues(field, values) {
    const safeValues = normalizeProductMultiValues(values);
    productMultiSelections[field] = safeValues;
    const legacyInput = document.getElementById(`prod-${field}`);
    if (legacyInput) legacyInput.value = safeValues[0] || '';
    const input = document.getElementById(`prod-${field}-input`);
    if (input) input.value = '';
    renderProductMultiField(field);
}

function renderProductMultiField(field) {
    const container = document.getElementById(`prod-${field}-tags`);
    const legacyInput = document.getElementById(`prod-${field}`);
    const values = productMultiSelections[field] || [];
    if (legacyInput) legacyInput.value = values[0] || '';
    if (!container) return;
    container.replaceChildren();
    values.forEach((value, index) => {
        const tag = document.createElement('span');
        tag.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-800 text-[11px] font-bold';
        const label = document.createElement('span');
        label.textContent = value;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'w-4 h-4 rounded-full bg-white text-pink-700 hover:bg-pink-100 font-black leading-none';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Quitar ${value}`);
        remove.addEventListener('click', () => {
            productMultiSelections[field].splice(index, 1);
            renderProductMultiField(field);
        });
        tag.append(label, remove);
        container.appendChild(tag);
    });
}

function addProductMultiValue(field) {
    if (!Object.prototype.hasOwnProperty.call(productMultiSelections, field)) return;
    const input = document.getElementById(`prod-${field}-input`);
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    const candidates = raw.split(/[;\n]+/).map(value => value.trim()).filter(Boolean);
    candidates.forEach(candidate => {
        const value = (field === 'mundo' || field === 'temporada') ? candidate.toLocaleUpperCase('es-CO') : candidate;
        if (!productMultiSelections[field].some(existing => existing.toLocaleLowerCase('es-CO') === value.toLocaleLowerCase('es-CO'))) {
            productMultiSelections[field].push(value);
        }
    });
    input.value = '';
    renderProductMultiField(field);
}

function handleProductMultiInputKey(event, field) {
    if (event.key === 'Enter' || event.key === ';') {
        event.preventDefault();
        addProductMultiValue(field);
    }
}

function resetProductMultiSelections() {
    ['mundo', 'categoria', 'subcategoria', 'temporada'].forEach(field => setProductMultiValues(field, []));
}
        // ==================== PRODUCTOS SUPABASE Y SINCRONIZACIÓN ====================
        async function fetchProductsData() {
            try {
                const { data, error } = await supabaseClient.from('productos').select('*').order('created_at', { ascending: true });
                if (error) throw error;
                allProducts = Array.isArray(data) ? data : [];
                try { localStorage.removeItem('cupissa_cache_products'); } catch (_) {}
            } catch (e) {
                console.error("Error al obtener productos desde Supabase:", e);
                allProducts = [];
            }
            filteredProducts = [...allProducts];
            currentProductsPage = 1;
            renderProductsTable();
            renderSugerenciasCampos();
        }

        function renderProductsTable() {
            const tbody = document.getElementById('products-tbody');
            const totalProdEl = document.getElementById('val-total-products');
            if (totalProdEl) totalProdEl.innerText = allProducts.length;
            tbody.innerHTML = '';

            const totalPages = Math.ceil(filteredProducts.length / productsPerPage) || 1;
            if (currentProductsPage > totalPages) currentProductsPage = totalPages;
            if (currentProductsPage < 1) currentProductsPage = 1;

            const startIdx = (currentProductsPage - 1) * productsPerPage;
            const endIdx = startIdx + productsPerPage;
            const productsToShow = filteredProducts.slice(startIdx, endIdx);

            if (productsToShow.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">No se encontraron productos con ese nombre.</td></tr>`;
            } else {
                productsToShow.forEach(p => {
                    const foto = p.fotos && p.fotos.length > 0 ? p.fotos[0] : '';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="p-3"><img src="${foto}" class="w-10 h-10 object-cover rounded-xl border"></td>
                        <td class="p-3 font-bold">${p.nombre}</td>
                        <td class="p-3 font-bold uppercase fuchsia-text">${productMultiValuesFromRow(p, 'mundo').join(' · ') || '—'}</td>
                        <td class="p-3">${productMultiValuesFromRow(p, 'categoria').join(' · ') || '—'} / <span class="font-bold text-pink-600">${productMultiValuesFromRow(p, 'temporada').join(' · ') || '—'}</span></td>
                        <td class="p-3 font-black">${formatCOP(p.precio_detal)}</td>
                        <td class="p-3">${formatCOP(p.precio_mayorista)}</td>
                        <td class="p-3 font-bold fuchsia-text">${p.porcentaje_anticipo}%</td>
                        <td class="p-3 text-center space-x-1">
                            <button onclick="openEditProductModal('${p.id}')" class="p-2 bg-pink-50 fuchsia-text rounded-xl font-bold hover:bg-pink-100 transition-colors" title="Editar Producto"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="deleteProduct('${p.id}')" class="p-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors" title="Eliminar Producto"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            document.getElementById('products-pagination-info').innerText = `Mostrando ${filteredProducts.length > 0 ? startIdx + 1 : 0} a ${Math.min(endIdx, filteredProducts.length)} de ${filteredProducts.length} productos`;
            document.getElementById('btn-prev-products').disabled = currentProductsPage === 1;
            document.getElementById('btn-next-products').disabled = endIdx >= filteredProducts.length;
        }

        function changeProductsPage(direction) {
            currentProductsPage += direction;
            renderProductsTable();
        }

        function filterAdminProductsTable() {
            const query = document.getElementById('admin-search-product-input').value.trim().toLowerCase();
            filteredProducts = allProducts.filter(p => {
                const nombre = (p.nombre || '').toLowerCase();
                return nombre.includes(query);
            });
            currentProductsPage = 1;
            renderProductsTable();
        }

        function renderSugerenciasCampos() {
            const fields = ['mundo', 'categoria', 'subcategoria', 'temporada'];
            const pluralOptions = {
                mundo: 'mundos',
                categoria: 'categorias',
                subcategoria: 'subcategorias',
                temporada: 'temporadas'
            };
            fields.forEach(field => {
                const values = new Map();
                allProducts.forEach(product => {
                    productMultiValuesFromRow(product, field).forEach(value => {
                        const key = value.toLocaleLowerCase('es-CO');
                        if (!values.has(key)) values.set(key, value);
                    });
                });
                const datalist = document.getElementById(`prod-${field}-options`);
                if (datalist) {
                    datalist.replaceChildren();
                    [...values.values()].sort((a, b) => a.localeCompare(b, 'es-CO')).forEach(value => {
                        const option = document.createElement('option');
                        option.value = value;
                        datalist.appendChild(option);
                    });
                }
                const countLabel = field === 'temporada' ? document.getElementById('temporada-count-label') : null;
                if (countLabel) countLabel.textContent = `${values.size} temporadas disponibles. Puedes asignar varias.`;
            });
            // Mantiene los tags visibles cuando se vuelve a actualizar la lista de productos.
            fields.forEach(renderProductMultiField);
        }

        // ==================== GESTIÓN INTELIGENTE DE PLANTILLAS DE TALLAS ====================
        function checkTallasTemplateUI() {
            const savedTemplates = JSON.parse(localStorage.getItem('cupissa_saved_tallas_templates') || '[]');
            const section = document.getElementById('saved-tallas-templates-section');
            const container = document.getElementById('saved-tallas-templates-container');
            container.innerHTML = '';

            if (savedTemplates && savedTemplates.length > 0) {
                section.classList.remove('hidden');
                savedTemplates.forEach((template, index) => {
                    if (!template || template.length === 0) return;
                    const primeraTalla = template[0].nombre || '';
                    const count = template.length;
                    
                    const btnWrapper = document.createElement('div');
                    btnWrapper.className = "flex items-center bg-white border border-indigo-200 rounded-xl overflow-hidden shadow-sm hover:border-indigo-400 transition-all";
                    
                    const loadBtn = document.createElement('button');
                    loadBtn.type = 'button';
                    loadBtn.className = "px-3 py-1.5 text-xs font-bold text-indigo-900 flex items-center space-x-1.5 hover:bg-indigo-50";
                    loadBtn.innerHTML = `<i class="fa-solid fa-clone text-[10px] text-indigo-600"></i><span>${primeraTalla}... (${count} tallas)</span>`;
                    loadBtn.onclick = () => loadSpecificTallasTemplate(index);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.className = "px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition-colors border-l border-indigo-100";
                    deleteBtn.title = "Eliminar esta plantilla de tallas";
                    deleteBtn.innerHTML = "×";
                    deleteBtn.onclick = () => deleteSpecificTallasTemplate(index);

                    btnWrapper.appendChild(loadBtn);
                    btnWrapper.appendChild(deleteBtn);
                    container.appendChild(btnWrapper);
                });
            } else {
                section.classList.add('hidden');
            }
        }

        function saveCurrentTallasTemplate() {
            if (!tempTallas || tempTallas.length === 0) return;
            let savedTemplates = JSON.parse(localStorage.getItem('cupissa_saved_tallas_templates') || '[]');
            
            const currentStr = JSON.stringify(tempTallas);
            const exists = savedTemplates.some(t => JSON.stringify(t) === currentStr);
            
            if (!exists) {
                savedTemplates.push([...tempTallas]);
                localStorage.setItem('cupissa_saved_tallas_templates', JSON.stringify(savedTemplates));
            }
        }

        function loadSpecificTallasTemplate(index) {
            const savedTemplates = JSON.parse(localStorage.getItem('cupissa_saved_tallas_templates') || '[]');
            const template = savedTemplates[index];
            if (!template) return;

            template.forEach(item => {
                if (!tempTallas.some(t => t.nombre.toUpperCase() === item.nombre.toUpperCase())) {
                    tempTallas.push({ nombre: item.nombre, incremento: item.incremento || 0 });
                }
            });
            renderTallasTags();
        }

        function deleteSpecificTallasTemplate(index) {
            let savedTemplates = JSON.parse(localStorage.getItem('cupissa_saved_tallas_templates') || '[]');
            savedTemplates.splice(index, 1);
            localStorage.setItem('cupissa_saved_tallas_templates', JSON.stringify(savedTemplates));
            checkTallasTemplateUI();
        }

        function openProductModal() {
            document.getElementById('prod-edit-id').value = '';
            document.getElementById('product-modal-title').innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i><span>Configuración Inteligente de Producto Web</span>`;
            tempTallas = [];
            tempColores = [];
            tempBase64Photos = [];
            tempOriginalPhotos = [];
            pendingImageQueue = [];
            document.getElementById('prod-nombre').value = '';
            document.getElementById('prod-descripcion').value = '';
            document.getElementById('prod-mundo').value = '';
            document.getElementById('prod-categoria').value = '';
            document.getElementById('prod-subcategoria').value = '';
            document.getElementById('prod-temporada').value = '';
            resetProductMultiSelections();
            document.getElementById('prod-precio-detal').value = '0';
            document.getElementById('prod-precio-mayorista').value = '0';
            document.getElementById('prod-cant-min-mayorista').value = '6';
            document.getElementById('prod-porcentaje-anticipo').value = '20';
            document.getElementById('prod-dias-preparacion').value = '3';
            
            document.getElementById('chk-personalizable').checked = false;
            document.getElementById('chk-al-por-mayor').checked = false;
            document.getElementById('chk-venta').checked = true;
            document.getElementById('chk-alquiler').checked = false;
            document.getElementById('chk-credito').checked = false;

            document.getElementById('prod-precio-alquiler').value = '0';
            document.getElementById('prod-valor-deposito').value = '0';
            toggleAlquilerFields();
            checkTallasTemplateUI();
            renderTallasTags();
            renderColoresTags();
            renderPreviewPhotos();
            renderSugerenciasCampos();
            document.getElementById('prod-files-input').value = '';
            document.getElementById('modal-product-form').classList.remove('hidden');
        }

        function openEditProductModal(prodId) {
            const prod = allProducts.find(p => p.id == prodId);
            if (!prod) return;

            document.getElementById('prod-edit-id').value = prod.id;
            document.getElementById('product-modal-title').innerHTML = `<i class="fa-solid fa-pen-to-square"></i><span>Editar Producto: ${prod.nombre}</span>`;
            
            document.getElementById('prod-nombre').value = prod.nombre || '';
            document.getElementById('prod-descripcion').value = prod.descripcion || '';
            document.getElementById('prod-mundo').value = prod.mundo || '';
            document.getElementById('prod-categoria').value = prod.categoria || '';
            document.getElementById('prod-subcategoria').value = prod.subcategoria || '';
            document.getElementById('prod-temporada').value = prod.temporada || '';
            setProductMultiValues('mundo', productMultiValuesFromRow(prod, 'mundo'));
            setProductMultiValues('categoria', productMultiValuesFromRow(prod, 'categoria'));
            setProductMultiValues('subcategoria', productMultiValuesFromRow(prod, 'subcategoria'));
            setProductMultiValues('temporada', productMultiValuesFromRow(prod, 'temporada'));
            document.getElementById('prod-precio-detal').value = prod.precio_detal || 0;
            document.getElementById('prod-precio-mayorista').value = prod.precio_mayorista || 0;
            document.getElementById('prod-cant-min-mayorista').value = prod.cant_min_mayorista || 6;
            document.getElementById('prod-porcentaje-anticipo').value = prod.porcentaje_anticipo || 20;
            document.getElementById('prod-dias-preparacion').value = prod.dias_preparacion || 3;

            document.getElementById('chk-personalizable').checked = !!prod.personalizable;
            document.getElementById('chk-al-por-mayor').checked = !!prod.al_por_mayor;
            document.getElementById('chk-venta').checked = !!prod.venta;
            document.getElementById('chk-alquiler').checked = !!prod.alquiler;
            document.getElementById('chk-credito').checked = !!prod.credito;

            document.getElementById('prod-precio-alquiler').value = prod.precio_alquiler || 0;
            document.getElementById('prod-valor-deposito').value = prod.valor_deposito || 0;
            toggleAlquilerFields();

            tempTallas = prod.tallas ? [...prod.tallas] : [];
            tempColores = prod.colores ? [...prod.colores] : [];
            tempBase64Photos = prod.fotos ? [...prod.fotos] : [];
            tempOriginalPhotos = [...tempBase64Photos];
            pendingImageQueue = [];

            checkTallasTemplateUI();
            renderTallasTags();
            renderColoresTags();
            renderPreviewPhotos();
            renderSugerenciasCampos();
            document.getElementById('prod-files-input').value = '';
            document.getElementById('modal-product-form').classList.remove('hidden');
        }

        function closeProductModal() {
            document.getElementById('modal-product-form').classList.add('hidden');
        }

        function toggleAlquilerFields() {
            const chk = document.getElementById('chk-alquiler').checked;
            const wrap = document.getElementById('wrapper-alquiler-extra');
            if (chk) wrap.classList.remove('hidden');
            else wrap.classList.add('hidden');
        }

        function addTallaToList() {
            const name = document.getElementById('inp-talla-nombre').value.trim();
            const inc = parseFloat(document.getElementById('inp-talla-incremento').value) || 0;
            if (!name) return;
            tempTallas.push({ nombre: name, incremento: inc });
            document.getElementById('inp-talla-nombre').value = '';
            document.getElementById('inp-talla-incremento').value = '';
            renderTallasTags();
        }

        function renderTallasTags() {
            const container = document.getElementById('list-tallas-tags');
            container.innerHTML = '';
            tempTallas.forEach((t, i) => {
                const tag = document.createElement('span');
                tag.className = "bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-xl text-[11px] flex items-center space-x-1.5 shadow-sm";
                tag.innerHTML = `<span>${t.nombre} (+${formatCOP(t.incremento)})</span><button type="button" onclick="tempTallas.splice(${i},1);renderTallasTags()" class="ml-1 text-red-500 hover:text-red-700 font-bold text-sm">×</button>`;
                container.appendChild(tag);
            });
        }

        function addColorToList() {
            const name = document.getElementById('inp-color-nombre').value.trim();
            const inc = parseFloat(document.getElementById('inp-color-incremento').value) || 0;
            if (!name) return;
            tempColores.push({ nombre: name, incremento: inc });
            document.getElementById('inp-color-nombre').value = '';
            document.getElementById('inp-color-incremento').value = '';
            renderColoresTags();
        }

        function renderColoresTags() {
            const container = document.getElementById('list-colores-tags');
            container.innerHTML = '';
            tempColores.forEach((c, i) => {
                const tag = document.createElement('span');
                tag.className = "bg-pink-100 fuchsia-text font-bold px-2 py-1 rounded-xl text-[11px] flex items-center space-x-1";
                tag.innerHTML = `<span>${c.nombre} (+${formatCOP(c.incremento)})</span><button type="button" onclick="tempColores.splice(${i},1);renderColoresTags()" class="ml-1 text-red-500 hover:text-red-700 font-bold">×</button>`;
                container.appendChild(tag);
            });
        }

        function handleImageFilesSelected(e) {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            pendingImageQueue = [];
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    const originalBase64 = evt.target.result;
                    pendingImageQueue.push({ original: originalBase64 });
                    if (pendingImageQueue.length === 1 && !currentCropper) {
                        startNextCrop();
                    }
                };
                reader.readAsDataURL(file);
            });
            e.target.value = '';
        }

        function startNextCrop() {
            if (pendingImageQueue.length === 0) return;
            const item = pendingImageQueue[0];
            
            document.getElementById('cropper-counter').innerText = `Recortando foto (Faltan ${pendingImageQueue.length})`;
            const imgElement = document.getElementById('image-to-crop');
            imgElement.src = item.original;

            document.getElementById('modal-cropper').classList.remove('hidden');

            if (currentCropper) {
                currentCropper.destroy();
            }

            currentCropper = new Cropper(imgElement, {
                aspectRatio: NaN,
                viewMode: 2,
                autoCropArea: 0.9,
                responsive: true,
            });
        }

        function confirmCropPhoto() {
            if (!currentCropper) return;

            const canvas = currentCropper.croppedCanvas || currentCropper.getCroppedCanvas({
                maxWidth: 1600,
                maxHeight: 1600,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            if (canvas) {
                const croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);
                tempBase64Photos.push(croppedBase64);
                tempOriginalPhotos.push(pendingImageQueue[0].original);
                renderPreviewPhotos();
            }

            pendingImageQueue.shift();
            closeCropperModal();

            if (pendingImageQueue.length > 0) {
                setTimeout(startNextCrop, 300);
            }
        }

        function skipCurrentPhotoCrop() {
            if (pendingImageQueue.length > 0) {
                tempBase64Photos.push(pendingImageQueue[0].original);
                tempOriginalPhotos.push(pendingImageQueue[0].original);
                renderPreviewPhotos();
                pendingImageQueue.shift();
            }
            closeCropperModal();

            if (pendingImageQueue.length > 0) {
                setTimeout(startNextCrop, 300);
            }
        }

        function closeCropperModal() {
            if (currentCropper) {
                currentCropper.destroy();
                currentCropper = null;
            }
            document.getElementById('modal-cropper').classList.add('hidden');
        }

        function renderPreviewPhotos() {
            const container = document.getElementById('files-preview-container');
            container.innerHTML = '';
            tempBase64Photos.forEach((src, idx) => {
                const wrapper = document.createElement('div');
                wrapper.className = "relative group";
                wrapper.innerHTML = `
                    <img src="${src}" class="w-16 h-16 object-cover rounded-2xl border-2 fuchsia-border shadow-sm">
                    <button type="button" onclick="removeTempPhoto(${idx})" class="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md hover:bg-red-700">×</button>
                `;
                container.appendChild(wrapper);
            });
        }

        function removeTempPhoto(index) {
            tempBase64Photos.splice(index, 1);
            tempOriginalPhotos.splice(index, 1);
            renderPreviewPhotos();
        }

        async function uploadBase64ToStorage(dataUrl) {
            if (!dataUrl || !dataUrl.startsWith('data:')) {
                return dataUrl;
            }
            try {
                const blob = dataURLtoBlob(dataUrl);
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.jpg`;
                const filePath = `products/${fileName}`;

                const { data, error } = await supabaseClient.storage
                    .from('productos-cupissa')
                    .upload(filePath, blob, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (error) throw error;

                const { data: publicData } = supabaseClient.storage
                    .from('productos-cupissa')
                    .getPublicUrl(filePath);

                return publicData.publicUrl;
            } catch (err) {
                console.error("Error al subir imagen a Supabase Storage:", err);
                return dataUrl;
            }
        }

        function dataURLtoBlob(dataurl) {
            let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
            while(n--){
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], {type:mime});
        }

        async function handleSaveProduct(e) {
            e.preventDefault();
            const editId = document.getElementById('prod-edit-id').value;
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalBtnHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i><span>Guardando...</span>`;

            try {
                // Por compatibilidad se mantienen los campos singulares históricos,
                // pero las nuevas columnas de arreglos guardan todas las selecciones.
                ['mundo', 'categoria', 'temporada'].forEach(field => {
                    const entry = document.getElementById(`prod-${field}-input`);
                    if (entry && entry.value.trim()) addProductMultiValue(field);
                });
                const missingRequiredFilters = ['mundo', 'categoria', 'temporada']
                    .filter(field => !(productMultiSelections[field] || []).length);
                if (missingRequiredFilters.length) {
                    throw new Error('Selecciona al menos un mundo, una categoría y una temporada.');
                }

                if (tempTallas.length > 0) {
                    saveCurrentTallasTemplate();
                }

                const uploadedPhotos = [];
                for (const fotoUrl of tempBase64Photos) {
                    const finalUrl = await uploadBase64ToStorage(fotoUrl);
                    uploadedPhotos.push(finalUrl);
                }

                // La versión recortada por el administrador es la única imagen pública.
                // No se suben ni se exponen los archivos originales.
                const uploadedOriginals = [...uploadedPhotos];

                const baseProductData = {
                    nombre: document.getElementById('prod-nombre').value.trim(),
                    descripcion: document.getElementById('prod-descripcion').value.trim(),
                    mundo: productMultiSelections.mundo[0] || '',
                    mundos: [...productMultiSelections.mundo],
                    categoria: productMultiSelections.categoria[0] || '',
                    categorias: [...productMultiSelections.categoria],
                    subcategoria: productMultiSelections.subcategoria[0] || null,
                    subcategorias: [...productMultiSelections.subcategoria],
                    temporada: productMultiSelections.temporada[0] || '',
                    temporadas: [...productMultiSelections.temporada],
                    precio_detal: parseFloat(document.getElementById('prod-precio-detal').value) || 0,
                    precio_mayorista: parseFloat(document.getElementById('prod-precio-mayorista').value) || 0,
                    cant_min_mayorista: parseInt(document.getElementById('prod-cant-min-mayorista').value) || 6,
                    porcentaje_anticipo: parseFloat(document.getElementById('prod-porcentaje-anticipo').value) || 20,
                    dias_preparacion: parseInt(document.getElementById('prod-dias-preparacion').value) || 3,
                    personalizable: document.getElementById('chk-personalizable').checked,
                    al_por_mayor: document.getElementById('chk-al-por-mayor').checked,
                    venta: document.getElementById('chk-alquiler').checked ? false : document.getElementById('chk-venta').checked,
                    alquiler: document.getElementById('chk-alquiler').checked,
                    credito: document.getElementById('chk-credito').checked,
                    precio_alquiler: parseFloat(document.getElementById('prod-precio-alquiler').value) || 0,
                    valor_deposito: parseFloat(document.getElementById('prod-valor-deposito').value) || 0,
                    tallas: tempTallas,
                    colores: tempColores
                };

                const defaultImage = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop';

                if (editId) {
                    const singleData = {
                        ...baseProductData,
                        fotos: uploadedPhotos.length > 0 ? uploadedPhotos : [defaultImage],
                        fotos_originales: uploadedOriginals.length > 0 ? uploadedOriginals : (uploadedPhotos.length > 0 ? uploadedPhotos : [defaultImage])
                    };
                    const { error } = await supabaseClient.from('productos').update(singleData).eq('id', editId);
                    if (error) throw error;
                } else {
                    const photosCount = uploadedPhotos.length;
                    
                    if (photosCount > 1) {
                        const productsToInsert = [];
                        for (let i = 0; i < photosCount; i++) {
                            const currentPhoto = uploadedPhotos[i];
                            const currentOrig = uploadedOriginals[i] || currentPhoto;
                            
                            const otherPhotos = uploadedPhotos.filter((_, idx) => idx !== i);
                            const otherOrigs = uploadedOriginals.filter((_, idx) => idx !== i);

                            productsToInsert.push({
                                ...baseProductData,
                                fotos: [currentPhoto, ...otherPhotos],
                                fotos_originales: [currentOrig, ...otherOrigs]
                            });
                        }
                        const { error } = await supabaseClient.from('productos').insert(productsToInsert);
                        if (error) throw error;
                    } else {
                        const singleData = {
                            ...baseProductData,
                            fotos: uploadedPhotos.length > 0 ? uploadedPhotos : [defaultImage],
                            fotos_originales: uploadedOriginals.length > 0 ? uploadedOriginals : (uploadedPhotos.length > 0 ? uploadedPhotos : [defaultImage])
                        };
                        const { error } = await supabaseClient.from('productos').insert([singleData]);
                        if (error) throw error;
                    }
                }

                closeProductModal();
                fetchProductsData();
                alert(editId ? '¡Producto actualizado exitosamente!' : '¡Producto(s) creado(s) exitosamente!');

            } catch (err) {
                console.error("Supabase no pudo guardar el producto:", err);
                try {
                    const draft = {
                        ...baseProductData,
                        id: editId || null,
                        fotos: tempBase64Photos.length > 0 ? tempBase64Photos : [defaultImage],
                        fotos_originales: tempOriginalPhotos.length > 0 ? tempOriginalPhotos : [defaultImage],
                        pendiente_supabase: true,
                        guardado_local_en: new Date().toISOString()
                    };
                    localStorage.setItem('cupissa_pending_product_draft', JSON.stringify(draft));
                } catch (storageError) {
                    console.warn('No fue posible conservar el borrador pendiente:', storageError);
                }
                alert(`Supabase no pudo guardar el producto: ${err?.message || 'Error desconocido'}. El producto no aparecerá en el catálogo hasta guardarse correctamente en Supabase.`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
            }
        }

        async function deleteProduct(prodId) {
            if (!confirm('¿Eliminar producto definitivamente de Supabase? Esta acción no se puede deshacer.')) return;
            try {
                const { data, error } = await supabaseClient.from('productos').delete().eq('id', prodId).select('id').maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('Supabase no confirmó la eliminación.');
            } catch (error) {
                alert(`No se eliminó el producto en Supabase: ${error?.message || 'Error desconocido'}`);
            }
            await fetchProductsData();
        }

        function formatCOP(val) {
            return '$ ' + new Intl.NumberFormat('es-CO').format(val || 0);
        }
