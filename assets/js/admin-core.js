const SUPABASE_URL = 'https://lkdxtesgwqoizobxaawp.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZHh0ZXNnd3FvaXpvYnhhYXdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjA4MzE2MiwiZXhwIjoyMTA3NjU5MTYyfQ.sqawaZ_yaWD6fVeuqDKUZYR766ZBAO7lF_IGvF44x0k';
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let allClients = [];
        let filteredClients = [];
        let currentClientsPage = 1;
        const clientsPerPage = 5;

        let allProducts = [];
        let filteredProducts = [];
        let currentProductsPage = 1;
        const productsPerPage = 5;

        let tempTallas = [];
        let tempColores = [];
        let tempAccesorios = [];
        let tempAccesorioFoto = '';
        let tempBase64Photos = [];
        let tempOriginalPhotos = [];

        let pendingImageQueue = [];
        let currentCropper = null;

        window.onload = function() {
            const adminAuth = localStorage.getItem('cupissa_admin_logged');
            if (adminAuth === 'true') {
                document.getElementById('admin-login-screen').classList.add('hidden');
                fetchAdminData();
                fetchProductsData();
                if (typeof loadWebAdminData === 'function') loadWebAdminData();
            }
        };

        function switchTab(tab) {
            const secCred = document.getElementById('tab-section-creditos');
            const secCat = document.getElementById('tab-section-catalogo');
            const btnCred = document.getElementById('tab-btn-creditos');
            const btnCat = document.getElementById('tab-btn-catalogo');
            const btnCredMob = document.getElementById('tab-btn-creditos-mob');
            const btnCatMob = document.getElementById('tab-btn-catalogo-mob');

            if (tab === 'creditos') {
                secCred.classList.remove('hidden');
                secCat.classList.add('hidden');
                btnCred.className = "px-4 py-2 rounded-xl font-bold text-xs transition-all bg-pink-50 fuchsia-text border border-pink-200";
                btnCat.className = "px-4 py-2 rounded-xl font-bold text-xs transition-all text-slate-600 hover:bg-slate-100";
                if (btnCredMob && btnCatMob) {
                    btnCredMob.className = "flex-1 py-2 rounded-xl font-bold text-xs bg-pink-50 fuchsia-text";
                    btnCatMob.className = "flex-1 py-2 rounded-xl font-bold text-xs text-slate-600";
                }
            } else {
                secCred.classList.add('hidden');
                secCat.classList.remove('hidden');
                btnCat.className = "px-4 py-2 rounded-xl font-bold text-xs transition-all bg-pink-50 fuchsia-text border border-pink-200";
                btnCred.className = "px-4 py-2 rounded-xl font-bold text-xs transition-all text-slate-600 hover:bg-slate-100";
                if (btnCredMob && btnCatMob) {
                    btnCredMob.className = "flex-1 py-2 rounded-xl font-bold text-xs text-slate-600";
                    btnCatMob.className = "flex-1 py-2 rounded-xl font-bold text-xs bg-pink-50 fuchsia-text";
                }
            }
        }

        function handleAdminLogin(e) {
            e.preventDefault();
            const email = document.getElementById('admin-user-email').value.trim();
            const pass = document.getElementById('admin-user-pass').value.trim();
            if (email === 'contactocupissa@gmail.com' && pass === 'Deiner123.Cupissa') {
                localStorage.setItem('cupissa_admin_logged', 'true');
                document.getElementById('admin-login-screen').classList.add('hidden');
                fetchAdminData();
                fetchProductsData();
                if (typeof loadWebAdminData === 'function') loadWebAdminData();
            } else {
                document.getElementById('admin-login-error').classList.remove('hidden');
            }
        }

        function handleAdminLogout() {
            localStorage.removeItem('cupissa_admin_logged');
            document.getElementById('admin-login-screen').classList.add('hidden');
        }

        async function fetchAdminData() {
            try {
                const { data: clientes, error: cliError } = await supabaseClient.from('clientes').select('*');
                if (cliError) throw cliError;

                if (!clientes || clientes.length === 0) {
                    allClients = [];
                    filteredClients = [];
                    renderAdminTable();
                    return;
                }

                const { data: creditos, error: credError } = await supabaseClient.from('creditos').select('*');
                if (credError) console.warn("Error al cargar créditos:", credError);

                allClients = clientes.map(cli => {
                    const cliCreditos = (creditos || []).filter(c => {
                        const clienteRef = c.cliente_id || c.clienteId || c.id_cliente;
                        return clienteRef && String(clienteRef).trim() === String(cli.id).trim();
                    });

                    return {
                        ...cli,
                        creditos: cliCreditos
                    };
                });

                filteredClients = [...allClients];
                currentClientsPage = 1;
                renderAdminTable();
            } catch (err) {
                console.error("Error al cargar los datos de administración:", err);
                allClients = [];
                filteredClients = [...allClients];
                renderAdminTable();
            }
        }

        function renderAdminTable() {
            const tbody = document.getElementById('admin-tbody');
            document.getElementById('val-total-clients').innerText = allClients.length;
            tbody.innerHTML = '';

            const totalPages = Math.ceil(filteredClients.length / clientsPerPage) || 1;
            if (currentClientsPage > totalPages) currentClientsPage = totalPages;
            if (currentClientsPage < 1) currentClientsPage = 1;

            const startIdx = (currentClientsPage - 1) * clientsPerPage;
            const endIdx = startIdx + clientsPerPage;
            const clientsToShow = filteredClients.slice(startIdx, endIdx);

            if (clientsToShow.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">No se encontraron clientes.</td></tr>`;
            } else {
                clientsToShow.forEach(client => {
                    const creditos = client.creditos || [];
                    const creditosActivos = creditos.filter(c => c.estado === 'ACTIVO');
                    const deudaTotal = creditosActivos.reduce((acc, c) => acc + Number(c.deuda_actual || c.monto_total || 0), 0);

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="p-4 font-bold text-slate-900">${client.nombre}</td>
                        <td class="p-4 font-mono font-bold fuchsia-text">${client.telefono}</td>
                        <td class="p-4">${formatCOP(client.cupo_total || 0)}</td>
                        <td class="p-4 font-black fuchsia-text">${formatCOP(client.cupo_disponible || 0)}</td>
                        <td class="p-4 font-bold fuchsia-text">${formatCOP(deudaTotal)}</td>
                        <td class="p-4 font-bold">${creditosActivos.length} Activa(s)</td>
                        <td class="p-4 text-center">
                            <button onclick="openEditModal('${client.id}')" class="px-3 py-1.5 bg-pink-50 fuchsia-text border border-pink-200 rounded-xl font-bold">Administrar</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            document.getElementById('clients-pagination-info').innerText = `Mostrando ${filteredClients.length > 0 ? startIdx + 1 : 0} a ${Math.min(endIdx, filteredClients.length)} de ${filteredClients.length} clientes`;
            document.getElementById('btn-prev-clients').disabled = currentClientsPage === 1;
            document.getElementById('btn-next-clients').disabled = endIdx >= filteredClients.length;
        }

        function changeClientsPage(direction) {
            currentClientsPage += direction;
            renderAdminTable();
        }

        function filterAdminTable() {
            const query = document.getElementById('admin-search-input').value.trim().toLowerCase();
            filteredClients = allClients.filter(c => {
                const nombre = (c.nombre || '').toLowerCase();
                const telefono = (c.telefono || '').toLowerCase();
                return nombre.includes(query) || telefono.includes(query);
            });
            currentClientsPage = 1;
            renderAdminTable();
        }

        function openNewClientModal() {
            document.getElementById('new-client-fecha-inicio').value = new Date().toISOString().split('T')[0];
            document.getElementById('modal-new-client').classList.remove('hidden');
        }

        function closeNewClientModal() {
            document.getElementById('modal-new-client').classList.add('hidden');
        }

        async function handleCreateNewClient(e) {
            e.preventDefault();
            const nombre = document.getElementById('new-client-name').value.trim();
            const telefono = document.getElementById('new-client-phone').value.trim();
            const cedula = document.getElementById('new-client-cedula').value.trim();
            const cupoTotal = parseFloat(document.getElementById('new-client-cupo').value) || 0;
            const deudaInicial = parseFloat(document.getElementById('new-client-deuda').value) || 0;
            const fechaVencimiento = document.getElementById('new-client-fecha-inicio').value;
            const frecuencia = document.getElementById('new-client-frecuencia').value;
            const cuotasTotal = parseInt(document.getElementById('new-client-cuotas').value) || 1;

            const { data: existingClient, error: checkError } = await supabaseClient
                .from('clientes')
                .select('id, nombre, telefono, password')
                .or(`telefono.eq.${telefono},password.eq.${cedula}`);

            if (checkError) {
                console.error("Error al consultar duplicados de clientes:", checkError);
            }

            if (existingClient && existingClient.length > 0) {
                const matchPhone = existingClient.find(c => c.telefono === telefono);
                const matchCedula = existingClient.find(c => c.password === cedula);

                if (matchPhone && matchCedula) {
                    alert(`¡NO SE PUEDE REGISTRAR! Ya existe un cliente con el mismo Teléfono (${telefono}) y la misma Cédula (${cedula}).`);
                } else if (matchPhone) {
                    alert(`¡NO SE PUEDE REGISTRAR! El número de teléfono (${telefono}) ya está registrado a nombre de: ${matchPhone.nombre}.`);
                } else if (matchCedula) {
                    alert(`¡NO SE PUEDE REGISTRAR! La cédula (${cedula}) ya está registrada a nombre de: ${matchCedula.nombre}.`);
                }
                return;
            }

            const { data: newClient, error } = await supabaseClient
                .from('clientes')
                .insert([{ nombre, telefono, password: cedula, cupo_total: cupoTotal, cupo_disponible: cupoTotal - deudaInicial }])
                .select().single();

            if (error) {
                alert('Error al crear cliente: ' + error.message);
                return;
            }

            if (deudaInicial > 0) {
                const valorCuotaCalculado = Math.ceil(deudaInicial / cuotasTotal);
                await supabaseClient.from('creditos').insert([{
                    cliente_id: newClient.id,
                    monto_total: deudaInicial,
                    deuda_actual: deudaInicial,
                    frecuencia,
                    numero_cuotas: cuotasTotal,
                    valor_cuota: valorCuotaCalculado,
                    proximo_vencimiento: fechaVencimiento,
                    estado: 'ACTIVO'
                }]);
            }

            closeNewClientModal();
            fetchAdminData();
            alert('¡Cliente registrado exitosamente!');
        }

        function openEditModal(clientId) {
            const client = allClients.find(c => c.id === clientId);
            if (!client) return;

            document.getElementById('edit-client-id').value = client.id;
            document.getElementById('edit-client-name').value = client.nombre;
            document.getElementById('edit-client-phone').value = client.telefono;
            document.getElementById('edit-client-cupo').value = client.cupo_disponible || 0;

            renderAdminDebtsList(client);
            document.getElementById('modal-edit-client').classList.remove('hidden');
        }

        function closeEditModal() {
            document.getElementById('modal-edit-client').classList.add('hidden');
        }

        function renderAdminDebtsList(client) {
            const container = document.getElementById('admin-debts-container');
            container.innerHTML = '';
            const creditos = client.creditos || [];
            if (creditos.length === 0) {
                container.innerHTML = `<div class="p-4 bg-slate-50 text-slate-400 rounded-2xl text-center text-xs">Sin deudas activas.</div>`;
                return;
            }

            creditos.forEach((cred, idx) => {
                const totalCuotas = cred.numero_cuotas || 1;
                const valorCuota = cred.valor_cuota || Math.ceil((cred.monto_total || 0) / totalCuotas);
                const fechaBase = cred.proximo_vencimiento || new Date().toISOString().split('T')[0];
                const frecuencia = cred.frecuencia || 'Quincenal';
                const creditoEstado = cred.estado || 'ACTIVO';

                let tablaCuotasHTML = '';
                let fechaActualObj = new Date(fechaBase + 'T00:00:00');

                // LÓGICA DE CÁLCULO DE CUOTAS
                if (frecuencia === 'Quincenal') {
                    let d = fechaActualObj.getDate();
                    let m = fechaActualObj.getMonth();
                    let y = fechaActualObj.getFullYear();

                    let d1 = d <= 15 ? d : d - 15;
                    let d2 = d1 + 15;

                    let currentDate = new Date(y, m, d);
                    for (let i = 1; i <= totalCuotas; i++) {
                        const fechaStr = currentDate.toISOString().split('T')[0];
                        const esPagado = creditoEstado === 'PAGADO';

                        tablaCuotasHTML += `
                            <tr class="border-b border-slate-100">
                                <td class="py-2 px-2 font-bold fuchsia-text">Cuota #${i}</td>
                                <td class="py-2 px-2 font-mono">${fechaStr}</td>
                                <td class="py-2 px-2 font-bold">${formatCOP(valorCuota)}</td>
                                <td class="py-2 px-2">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${esPagado ? 'bg-emerald-100 text-emerald-700' : 'bg-pink-100 fuchsia-text'}">
                                        ${esPagado ? 'PAGADO' : 'PENDIENTE'}
                                    </span>
                                </td>
                            </tr>
                        `;

                        if (i === 1) {
                            if (currentDate.getDate() === d1) {
                                currentDate = new Date(y, m, d2);
                            } else {
                                m++;
                                if (m > 11) { m = 0; y++; }
                                currentDate = new Date(y, m, d1);
                            }
                        } else {
                            if (currentDate.getDate() === d1) {
                                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), d2);
                            } else {
                                let nm = currentDate.getMonth() + 1;
                                let ny = currentDate.getFullYear();
                                if (nm > 11) { nm = 0; ny++; }
                                currentDate = new Date(ny, nm, d1);
                            }
                        }
                    }
                } else {
                    for (let i = 1; i <= totalCuotas; i++) {
                        const fechaStr = fechaActualObj.toISOString().split('T')[0];
                        const esPagado = creditoEstado === 'PAGADO';

                        tablaCuotasHTML += `
                            <tr class="border-b border-slate-100">
                                <td class="py-2 px-2 font-bold fuchsia-text">Cuota #${i}</td>
                                <td class="py-2 px-2 font-mono">${fechaStr}</td>
                                <td class="py-2 px-2 font-bold">${formatCOP(valorCuota)}</td>
                                <td class="py-2 px-2">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${esPagado ? 'bg-emerald-100 text-emerald-700' : 'bg-pink-100 fuchsia-text'}">
                                        ${esPagado ? 'PAGADO' : 'PENDIENTE'}
                                    </span>
                                </td>
                            </tr>
                        `;

                        if (frecuencia === 'Diario') {
                            fechaActualObj.setDate(fechaActualObj.getDate() + 1);
                        } else if (frecuencia === 'Semanal') {
                            fechaActualObj.setDate(fechaActualObj.getDate() + 7);
                        } else if (frecuencia === 'Mensual') {
                            fechaActualObj.setMonth(fechaActualObj.getMonth() + 1);
                        }
                    }
                }

                const card = document.createElement('div');
                card.className = "bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs";
                card.innerHTML = `
                    <div class="flex justify-between items-center font-bold border-b border-slate-100 pb-2">
                        <span>Deuda #${idx+1} (${formatCOP(cred.monto_total)}) - Estado: <strong class="${creditoEstado === 'ACTIVO' ? 'text-pink-600' : 'text-emerald-600'}">${creditoEstado}</strong></span>
                        <span class="fuchsia-text">Saldo: ${formatCOP(cred.deuda_actual || cred.monto_total)}</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div>
                            <label class="block font-bold text-slate-500 uppercase mb-1 text-[10px]">Editar Frecuencia:</label>
                            <select id="edit-freq-${cred.id}" class="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold">
                                <option value="Quincenal" ${frecuencia === 'Quincenal' ? 'selected' : ''}>Quincenal</option>
                                <option value="Semanal" ${frecuencia === 'Semanal' ? 'selected' : ''}>Semanal</option>
                                <option value="Diario" ${frecuencia === 'Diario' ? 'selected' : ''}>Diario</option>
                                <option value="Mensual" ${frecuencia === 'Mensual' ? 'selected' : ''}>Mensual</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-500 uppercase mb-1 text-[10px]">Editar Fecha de Pago / Inicio:</label>
                            <input type="date" id="edit-date-${cred.id}" value="${fechaBase}" class="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold">
                        </div>
                        <div class="sm:col-span-2 flex justify-end">
                            <button onclick="updateCreditSchedule('${cred.id}')" class="px-3 py-1.5 fuchsia-btn rounded-lg font-bold text-[11px] shadow-sm">Guardar Frecuencia y Fecha</button>
                        </div>
                    </div>

                    <div class="space-y-1">
                        <span class="font-bold text-slate-700 uppercase block text-[11px]">Tabla de Cuotas Proyectadas (${totalCuotas} Cuotas - ${frecuencia}):</span>
                        <div class="max-h-48 overflow-y-auto custom-scrollbar border border-slate-100 rounded-xl p-2 bg-slate-50/50">
                            <table class="w-full text-left text-[11px]">
                                <thead>
                                    <tr class="text-slate-400 border-b border-slate-200">
                                        <th class="p-1.5">CUOTA</th>
                                        <th class="p-1.5">VENCIMIENTO</th>
                                        <th class="p-1.5">VALOR</th>
                                        <th class="p-1.5">ESTADO</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tablaCuotasHTML}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="flex justify-between items-center pt-2">
                        <span class="text-[11px] text-slate-400 font-medium">Frecuencia: ${frecuencia} | Inicio: ${fechaBase}</span>
                        ${creditoEstado === 'ACTIVO' ? `<button onclick="marcarDeudaComoPaga('${cred.id}')" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-bold">Marcar como Paga ✓</button>` : ''}
                    </div>
                `;
                container.appendChild(card);
            });
        }

        async function updateCreditSchedule(creditoId) {
            const nuevaFreq = document.getElementById(`edit-freq-${creditoId}`).value;
            const nuevaFecha = document.getElementById(`edit-date-${creditoId}`).value;

            if (!nuevaFecha) {
                alert('Por favor selecciona una fecha válida.');
                return;
            }

            const { error } = await supabaseClient
                .from('creditos')
                .update({ frecuencia: nuevaFreq, proximo_vencimiento: nuevaFecha })
                .eq('id', creditoId);

            if (error) {
                alert('Error al actualizar el crédito: ' + error.message);
                return;
            }

            const clientId = document.getElementById('edit-client-id').value;
            await fetchAdminData();
            openEditModal(clientId);
            alert('¡Fecha de pago y frecuencia actualizadas con éxito!');
        }

        async function marcarDeudaComoPaga(creditoId) {
            if (!confirm('¿Estás seguro de marcar esta deuda como PAGA?')) return;
            
            await supabaseClient.from('creditos').update({ estado: 'PAGADO', deuda_actual: 0 }).eq('id', creditoId);
            
            fetchAdminData();
            closeEditModal();
            alert('¡Deuda marcada como pagada con éxito!');
        }

        async function saveClientChanges() {
            const clientId = document.getElementById('edit-client-id').value;
            const nuevoCupo = parseFloat(document.getElementById('edit-client-cupo').value) || 0;
            await supabaseClient.from('clientes').update({ cupo_disponible: nuevoCupo }).eq('id', clientId);
            closeEditModal();
            fetchAdminData();
            alert('¡Actualizado con éxito!');
        }

        async function deleteClientComplete() {
            const id = document.getElementById('edit-client-id').value;
            if (!confirm('¿Estás totalmente seguro de eliminar este cliente? Se borrarán sus créditos y todos sus datos de forma permanente.')) return;
            
            try {
                await supabaseClient.from('creditos').delete().eq('cliente_id', id);
                await supabaseClient.from('clientes').delete().eq('id', id);
            } catch (e) {
                console.error("Error al eliminar en base de datos:", e);
            }

            closeEditModal();
            fetchAdminData();
            alert('El cliente ha sido eliminado completamente del sistema.');
        }

        async function openAddDebtPrompt() {
            const clientId = document.getElementById('edit-client-id').value;
            const monto = parseFloat(prompt('Monto de la nueva deuda ($):'));
            if (!monto) return;
            const cuotasTotal = parseInt(prompt('Número de cuotas:', '4')) || 4;
            const fechaVenc = prompt('Fecha de vencimiento (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
            const frecuencia = prompt('Frecuencia (Quincenal, Semanal, Diario, Mensual):', 'Quincenal') || 'Quincenal';

            const valorCuotaCalculado = Math.ceil(monto / cuotasTotal);
            await supabaseClient.from('creditos').insert([{
                cliente_id: clientId,
                monto_total: monto,
                deuda_actual: monto,
                frecuencia: frecuencia,
                numero_cuotas: cuotasTotal,
                valor_cuota: valorCuotaCalculado,
                proximo_vencimiento: fechaVenc,
                estado: 'ACTIVO'
            }]);

            fetchAdminData();
            closeEditModal();
            alert('¡Nueva deuda agregada exitosamente!');
        }

        // ==================== PRODUCTOS SUPABASE Y SINCRONIZACIÓN ====================
        async function fetchProductsData() {
            try {
                const { data, error } = await supabaseClient.from('productos').select('*').order('created_at', { ascending: true });
                if (error) {
                    const fallbackRes = await supabaseClient.from('productos').select('*');
                    if (fallbackRes.error) throw fallbackRes.error;
                    allProducts = fallbackRes.data || [];
                } else {
                    allProducts = data || [];
                }
                
                if (allProducts.length > 0) {
                    localStorage.setItem('cupissa_cache_products', JSON.stringify(allProducts));
                } else {
                    const cached = localStorage.getItem('cupissa_cache_products');
                    if (cached) allProducts = JSON.parse(cached);
                    else allProducts = JSON.parse(localStorage.getItem('cupissa_local_products') || '[]');
                }
            } catch (e) {
                console.error("Error al obtener productos:", e);
                const cached = localStorage.getItem('cupissa_cache_products');
                if (cached) allProducts = JSON.parse(cached);
                else allProducts = JSON.parse(localStorage.getItem('cupissa_local_products') || '[]');
            }
            filteredProducts = [...allProducts];
            currentProductsPage = 1;
            renderProductsTable();
            renderSugerenciasCampos();
            await loadFeaturedSeasonAdmin();
        }

        // Selector GLOBAL de temporada destacada. Lee siempre productos.temporada
        // desde Supabase; no depende de las sugerencias locales del formulario.
        async function loadFeaturedSeasonAdmin() {
            const select = document.getElementById('featured-season-admin-select');
            const status = document.getElementById('featured-season-admin-status');
            const current = document.getElementById('featured-season-admin-current');
            const saveButton = document.getElementById('featured-season-save-button');
            if (!select || !status) return;

            select.disabled = true;
            if (saveButton) saveButton.disabled = true;
            select.innerHTML = '<option value="">Cargando temporadas desde productos...</option>';
            status.textContent = 'Consultando los valores existentes de productos.temporada...';

            try {
                const rows = [];
                const pageSize = 1000;
                let from = 0;
                while (true) {
                    const { data, error } = await supabaseClient
                        .from('productos')
                        .select('temporada')
                        .not('temporada', 'is', null)
                        .order('temporada', { ascending: true })
                        .range(from, from + pageSize - 1);
                    if (error) throw error;
                    rows.push(...(data || []));
                    if (!data || data.length < pageSize) break;
                    from += pageSize;
                }

                const seasons = [...new Set(rows
                    .map(row => String(row.temporada || '').trim().toUpperCase())
                    .filter(Boolean))]
                    .sort((a, b) => a.localeCompare(b, 'es'));

                const { data: setting, error: settingError } = await supabaseClient
                    .from('configuracion_destacados_web')
                    .select('temporada_destacada')
                    .eq('id', 1)
                    .maybeSingle();
                if (settingError) throw settingError;

                const selected = String(setting?.temporada_destacada || '').trim().toUpperCase();
                select.innerHTML = '';

                const noneOption = document.createElement('option');
                noneOption.value = '';
                noneOption.textContent = 'NO MOSTRAR DESTACADOS';
                select.appendChild(noneOption);

                seasons.forEach(season => {
                    const option = document.createElement('option');
                    option.value = season;
                    option.textContent = season;
                    select.appendChild(option);
                });

                select.value = seasons.includes(selected) ? selected : '';
                select.disabled = seasons.length === 0;
                if (saveButton) saveButton.disabled = seasons.length === 0 && !selected;

                if (current) {
                    current.textContent = selected && seasons.includes(selected)
                        ? `ACTIVA: ${selected}`
                        : 'SIN TEMPORADA ACTIVA';
                }

                status.textContent = seasons.length
                    ? `${seasons.length} temporada(s) encontrada(s) directamente en productos.temporada. Selecciona una y pulsa “Guardar selección”.`
                    : 'No hay temporadas escritas en la columna productos.temporada.';
            } catch (error) {
                console.error('No fue posible cargar las temporadas destacadas:', error);
                select.innerHTML = '<option value="">No se pudieron cargar las temporadas</option>';
                select.disabled = true;
                if (saveButton) saveButton.disabled = true;
                if (current) current.textContent = 'REVISAR CONFIGURACIÓN';
                status.textContent = `No se pudo leer la temporada destacada. Ejecuta el SQL de configuración y verifica el acceso a productos.temporada. ${error?.message || ''}`;
            }
        }

        async function saveFeaturedSeasonFromAdmin() {
            const select = document.getElementById('featured-season-admin-select');
            const status = document.getElementById('featured-season-admin-status');
            const current = document.getElementById('featured-season-admin-current');
            const saveButton = document.getElementById('featured-season-save-button');
            if (!select || !status || !saveButton) return;

            const season = String(select.value || '').trim().toUpperCase();
            saveButton.disabled = true;
            status.textContent = 'Guardando la temporada destacada...';

            try {
                const { error } = await supabaseClient
                    .from('configuracion_destacados_web')
                    .upsert({
                        id: 1,
                        temporada_destacada: season || null,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });
                if (error) throw error;

                if (current) current.textContent = season ? `ACTIVA: ${season}` : 'SIN TEMPORADA ACTIVA';
                status.textContent = season
                    ? `Guardado. La página de clientes mostrará cinco productos de ${season} en DESTACADOS DE LA TEMPORADA.`
                    : 'Guardado. Los destacados de temporada quedaron desactivados.';
            } catch (error) {
                console.error('No fue posible guardar la temporada destacada:', error);
                status.textContent = `No se pudo guardar la selección. ${error?.message || ''}`;
            } finally {
                saveButton.disabled = false;
            }
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
                        <td class="p-3 font-bold uppercase fuchsia-text">${p.mundo}</td>
                        <td class="p-3">${p.categoria} / <span class="font-bold text-pink-600">${p.temporada}</span></td>
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
            const mundosSet = new Set();
            const categoriasSet = new Set();
            const subcategoriasSet = new Set();
            const temporadasSet = new Set();
            let seasonProducts = Array.isArray(allProducts) ? [...allProducts] : [];
            try {
                const cachedProducts = JSON.parse(localStorage.getItem('cupissa_cache_products') || '[]');
                if (Array.isArray(cachedProducts)) seasonProducts = [...seasonProducts, ...cachedProducts];
            } catch (_) {}

            allProducts.forEach(p => {
                if (p.mundo) mundosSet.add(String(p.mundo).trim().toUpperCase());
                if (p.categoria) categoriasSet.add(p.categoria);
                if (p.subcategoria) subcategoriasSet.add(p.subcategoria);
            });
            seasonProducts.forEach(p => {
                const season = String(p?.temporada || '').trim().toUpperCase();
                if (season) temporadasSet.add(season);
            });

            const sugMundo = document.getElementById('sugerencias-mundo');
            if (sugMundo) {
                sugMundo.innerHTML = '';
                mundosSet.forEach(mundo => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'px-2.5 py-1 bg-pink-50 hover:bg-pink-100 fuchsia-text rounded-lg text-[11px] font-bold border border-pink-200 transition-colors';
                    btn.innerText = mundo;
                    btn.onclick = () => { document.getElementById('prod-mundo').value = mundo; };
                    sugMundo.appendChild(btn);
                });
            }

            const sugCat = document.getElementById('sugerencias-categoria');
            if (sugCat) {
                sugCat.innerHTML = '';
                categoriasSet.forEach(cat => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold border border-indigo-200 transition-colors';
                    btn.innerText = cat;
                    btn.onclick = () => { document.getElementById('prod-categoria').value = cat; };
                    sugCat.appendChild(btn);
                });
            }

            const sugSubEl = document.getElementById('sugerencias-subcategoria');
            if (sugSubEl) {
                sugSubEl.innerHTML = '';
                subcategoriasSet.forEach(sub => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors';
                    btn.innerText = sub;
                    btn.onclick = () => { document.getElementById('prod-subcategoria').value = sub; };
                    sugSubEl.appendChild(btn);
                });
            }

            const tempSelect = document.getElementById('prod-temporada-existente');
            const seasonNames = [...temporadasSet].sort((a, b) => a.localeCompare(b, 'es'));
            const seasonCount = document.getElementById('temporada-count-label');
            if (seasonCount) seasonCount.textContent = seasonNames.length
                ? `${seasonNames.length} temporada(s) encontrada(s) en el catálogo de productos.`
                : 'Todavía no hay temporadas registradas en los productos existentes.';
            if (tempSelect) {
                const currentValue = document.getElementById('prod-temporada')?.value?.trim().toUpperCase() || '';
                tempSelect.innerHTML = '<option value="">ELIGE UNA TEMPORADA EXISTENTE</option>';
                if (!seasonNames.length) {
                    const emptyOption = document.createElement('option');
                    emptyOption.value = '';
                    emptyOption.textContent = 'No hay temporadas guardadas todavía';
                    emptyOption.disabled = true;
                    tempSelect.appendChild(emptyOption);
                }
                seasonNames.forEach(temp => {
                    const option = document.createElement('option');
                    option.value = temp;
                    option.textContent = temp;
                    tempSelect.appendChild(option);
                });
                tempSelect.value = seasonNames.includes(currentValue) ? currentValue : '';
                tempSelect.style.display = 'block';
                tempSelect.classList.add('w-full', 'min-h-[44px]');
            }

            const sugTempEl = document.getElementById('sugerencias-temporada');
            if (sugTempEl) {
                sugTempEl.innerHTML = '';
                temporadasSet.forEach(temp => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-[11px] font-bold border border-purple-200 transition-colors';
                    btn.innerText = temp;
                    btn.onclick = () => { document.getElementById('prod-temporada').value = temp; };
                    sugTempEl.appendChild(btn);
                });
            }
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
            tempAccesorios = [];
            tempAccesorioFoto = '';
            tempBase64Photos = [];
            tempOriginalPhotos = [];
            pendingImageQueue = [];
            document.getElementById('prod-nombre').value = '';
            document.getElementById('prod-descripcion').value = '';
            document.getElementById('prod-mundo').value = '';
            document.getElementById('prod-categoria').value = '';
            document.getElementById('prod-subcategoria').value = '';
            document.getElementById('prod-temporada').value = '';
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
            renderAccesoriosTags();
            renderAccesorioFotoPreview();
            renderPreviewPhotos();
            renderSugerenciasCampos();
            document.getElementById('inp-accesorio-foto').value = '';
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
            tempAccesorios = Array.isArray(prod.accesorios) ? prod.accesorios.map(item => ({ ...item })) : [];
            tempAccesorioFoto = '';
            tempBase64Photos = prod.fotos ? [...prod.fotos] : [];
            tempOriginalPhotos = prod.fotos_originales ? [...prod.fotos_originales] : [...tempBase64Photos];
            pendingImageQueue = [];

            checkTallasTemplateUI();
            renderTallasTags();
            renderColoresTags();
            renderAccesoriosTags();
            renderAccesorioFotoPreview();
            renderPreviewPhotos();
            renderSugerenciasCampos();
            document.getElementById('inp-accesorio-foto').value = '';
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

        function handleAccesorioFotoSelected(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            if (!file.type || !file.type.startsWith('image/')) {
                alert('Selecciona una imagen válida para el accesorio.');
                event.target.value = '';
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                alert('La foto del accesorio no puede superar 10 MB.');
                event.target.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function(loadEvent) {
                const image = new Image();
                image.onload = function() {
                    const maxSide = 1000;
                    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(image.width * ratio));
                    canvas.height = Math.max(1, Math.round(image.height * ratio));
                    const context = canvas.getContext('2d');
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    tempAccesorioFoto = canvas.toDataURL('image/jpeg', 0.84);
                    renderAccesorioFotoPreview();
                };
                image.onerror = function() {
                    alert('No fue posible leer la foto seleccionada.');
                    tempAccesorioFoto = '';
                    renderAccesorioFotoPreview();
                };
                image.src = String(loadEvent.target.result || '');
            };
            reader.onerror = function() {
                alert('No fue posible cargar la foto del accesorio.');
            };
            reader.readAsDataURL(file);
        }

        function renderAccesorioFotoPreview() {
            const preview = document.getElementById('accesorio-foto-preview');
            if (!preview) return;
            preview.innerHTML = '';
            if (!tempAccesorioFoto) {
                preview.classList.add('hidden');
                return;
            }
            const image = document.createElement('img');
            image.src = tempAccesorioFoto;
            image.alt = 'Vista previa del accesorio';
            image.className = 'w-16 h-16 object-cover rounded-xl border border-emerald-200';
            preview.appendChild(image);
            preview.classList.remove('hidden');
        }

        function addAccesorioToList() {
            const nameInput = document.getElementById('inp-accesorio-nombre');
            const incrementInput = document.getElementById('inp-accesorio-incremento');
            const name = nameInput.value.trim();
            const incremento = Math.max(0, parseFloat(incrementInput.value) || 0);
            if (!name) {
                alert('Escribe el nombre del accesorio.');
                return;
            }
            if (!tempAccesorioFoto) {
                alert('Selecciona una foto para el accesorio.');
                return;
            }
            const exists = tempAccesorios.some(item => String(item.nombre).trim().toUpperCase() === name.toUpperCase());
            if (exists) {
                alert('Ese accesorio ya está agregado.');
                return;
            }
            tempAccesorios.push({ nombre: name, incremento, foto: tempAccesorioFoto });
            nameInput.value = '';
            incrementInput.value = '';
            tempAccesorioFoto = '';
            const fileInput = document.getElementById('inp-accesorio-foto');
            if (fileInput) fileInput.value = '';
            renderAccesorioFotoPreview();
            renderAccesoriosTags();
        }

        function renderAccesoriosTags() {
            const container = document.getElementById('list-accesorios-tags');
            if (!container) return;
            container.innerHTML = '';
            tempAccesorios.forEach((item, index) => {
                const tag = document.createElement('div');
                tag.className = 'bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-2 flex items-center gap-2';

                if (item.foto || item.imagen) {
                    const image = document.createElement('img');
                    image.src = item.foto || item.imagen;
                    image.alt = `Foto de ${item.nombre || 'accesorio'}`;
                    image.className = 'w-12 h-12 object-cover rounded-lg border border-emerald-200 bg-white';
                    tag.appendChild(image);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'w-12 h-12 rounded-lg bg-white border border-dashed border-emerald-300 flex items-center justify-center text-emerald-500';
                    placeholder.innerHTML = '<i class="fa-solid fa-image"></i>';
                    tag.appendChild(placeholder);
                }

                const details = document.createElement('div');
                details.className = 'min-w-0';
                const title = document.createElement('div');
                title.className = 'font-black text-[11px]';
                title.textContent = String(item.nombre || 'Accesorio');
                const price = document.createElement('div');
                price.className = 'text-[10px] text-emerald-700 font-bold';
                price.textContent = `+${formatCOP(Number(item.incremento || 0))}`;
                details.append(title, price);
                tag.appendChild(details);

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.setAttribute('aria-label', 'Quitar accesorio');
                remove.className = 'ml-1 text-red-500 hover:text-red-700 font-bold text-lg';
                remove.textContent = '×';
                remove.addEventListener('click', () => {
                    tempAccesorios.splice(index, 1);
                    renderAccesoriosTags();
                });
                tag.appendChild(remove);
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
                aspectRatio: 1,
                viewMode: 2,
                autoCropArea: 0.9,
                responsive: true,
            });
        }

        function confirmCropPhoto() {
            if (!currentCropper) return;

            const canvas = currentCropper.croppedCanvas || currentCropper.getCroppedCanvas({
                width: 800,
                height: 800
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
                if (tempTallas.length > 0) {
                    saveCurrentTallasTemplate();
                }

                const uploadedPhotos = [];
                for (const fotoUrl of tempBase64Photos) {
                    const finalUrl = await uploadBase64ToStorage(fotoUrl);
                    uploadedPhotos.push(finalUrl);
                }

                const uploadedOriginals = [];
                for (const origUrl of tempOriginalPhotos) {
                    const finalUrl = await uploadBase64ToStorage(origUrl);
                    uploadedOriginals.push(finalUrl);
                }

                const uploadedAccessories = [];
                for (const accessory of tempAccesorios) {
                    let accessoryPhoto = accessory.foto || accessory.imagen || '';
                    if (accessoryPhoto.startsWith('data:')) {
                        accessoryPhoto = await uploadBase64ToStorage(accessoryPhoto);
                    }
                    uploadedAccessories.push({
                        nombre: String(accessory.nombre || '').trim(),
                        incremento: Math.max(0, Number(accessory.incremento || accessory.adicional || 0)),
                        foto: accessoryPhoto
                    });
                }

                const baseProductData = {
                    nombre: document.getElementById('prod-nombre').value.trim(),
                    descripcion: document.getElementById('prod-descripcion').value.trim(),
                    mundo: document.getElementById('prod-mundo').value.trim().toUpperCase(),
                    categoria: document.getElementById('prod-categoria').value.trim(),
                    subcategoria: document.getElementById('prod-subcategoria').value.trim(),
                    temporada: document.getElementById('prod-temporada').value.trim().toUpperCase(),
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
                    colores: tempColores,
                    accesorios: uploadedAccessories
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
                console.warn("Fallo en Supabase, guardando localmente:", err);
                if (editId) {
                    const idx = allProducts.findIndex(p => p.id == editId);
                    if (idx >= 0) {
                        allProducts[idx] = {
                            ...baseProductData,
                            id: editId,
                            fotos: tempBase64Photos.length > 0 ? tempBase64Photos : [defaultImage],
                            fotos_originales: tempOriginalPhotos.length > 0 ? tempOriginalPhotos : [defaultImage]
                        };
                    }
                } else {
                    const photosCount = tempBase64Photos.length;
                    if (photosCount > 1) {
                        for (let i = 0; i < photosCount; i++) {
                            const currentPhoto = tempBase64Photos[i];
                            const currentOrig = tempOriginalPhotos[i] || currentPhoto;
                            const otherPhotos = tempBase64Photos.filter((_, idx) => idx !== i);
                            const otherOrigs = tempOriginalPhotos.filter((_, idx) => idx !== i);

                            allProducts.push({
                                ...baseProductData,
                                id: 'loc_' + Date.now() + '_' + i,
                                fotos: [currentPhoto, ...otherPhotos],
                                fotos_originales: [currentOrig, ...otherOrigs]
                            });
                        }
                    } else {
                        allProducts.push({
                            ...baseProductData,
                            id: 'loc_' + Date.now(),
                            fotos: tempBase64Photos.length > 0 ? tempBase64Photos : [defaultImage],
                            fotos_originales: tempOriginalPhotos.length > 0 ? tempOriginalPhotos : [defaultImage]
                        });
                    }
                }
                localStorage.setItem('cupissa_local_products', JSON.stringify(allProducts));
                closeProductModal();
                fetchProductsData();
                alert('Guardado en modo local debido a una falla en Supabase.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
            }
        }

        async function deleteProduct(prodId) {
            if (!confirm('¿Eliminar producto?')) return;
            try {
                await supabaseClient.from('productos').delete().eq('id', prodId);
            } catch (e) {
                allProducts = allProducts.filter(p => p.id != prodId);
                localStorage.setItem('cupissa_local_products', JSON.stringify(allProducts));
            }
            fetchProductsData();
        }

        function formatCOP(val) {
            return '$ ' + new Intl.NumberFormat('es-CO').format(val || 0);
        }
