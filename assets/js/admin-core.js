const SUPABASE_URL = window.CUPISSA_SUPABASE_URL || '';
        const SUPABASE_ANON_KEY = window.CUPISSA_SUPABASE_ANON_KEY || '';
        let supabaseClient = null;
        function cupissaCreateSupabaseClient() {
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY || /PEGA_AQUI|YOUR_|CHANGE_ME/i.test(SUPABASE_ANON_KEY)) return null;
            if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') return null;
            try { return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
            catch (error) { console.error('No fue posible iniciar la conexión de Supabase:', error); return null; }
        }
        supabaseClient = cupissaCreateSupabaseClient();

        function cupissaIsSecretApiKey(value) {
            const key = String(value || '').trim();
            if (/^sb_secret_/i.test(key)) return true;
            const parts = key.split('.');
            if (parts.length === 3) {
                try {
                    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
                    const payload = JSON.parse(atob(padded));
                    return String(payload.role || '').toLowerCase() === 'service_role';
                } catch (_) { return false; }
            }
            return false;
        }

        window.openSupabaseConfig = function () {
            const panel = document.getElementById('admin-supabase-config-panel');
            if (panel) panel.classList.remove('hidden');
            const input = document.getElementById('admin-supabase-public-key');
            if (input) {
                try { input.value = localStorage.getItem('cupissa_supabase_public_key') || ''; } catch (_) { input.value = ''; }
                input.focus();
            }
        };
        window.closeSupabaseConfig = function () {
            document.getElementById('admin-supabase-config-panel')?.classList.add('hidden');
        };
        window.saveSupabasePublicKey = function (event) {
            event?.preventDefault();
            const input = document.getElementById('admin-supabase-public-key');
            const feedback = document.getElementById('admin-supabase-config-error');
            const key = String(input?.value || '').trim();
            const showError = message => { if (feedback) { feedback.textContent = message; feedback.classList.remove('hidden'); } };
            if (!key) return showError('Pega la clave pública publishable o anon de este proyecto.');
            if (cupissaIsSecretApiKey(key) || /^sb_secret_/i.test(key)) {
                return showError('Esa es una clave secreta o service_role. No se puede usar en el navegador. Copia la clave publishable o anon.');
            }
            if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) {
                return showError('El formato no coincide con una clave publishable (sb_publishable_) ni con la clave anon antigua (eyJ…).');
            }
            try {
                localStorage.setItem('cupissa_supabase_public_key', key);
                localStorage.removeItem('cupissa_admin_logged');
                window.location.reload();
            } catch (error) {
                showError('El navegador no permitió guardar la configuración.');
            }
        };

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
        let adminCreditRealtimeChannel = null;
        let adminCreditRealtimeTimer = null;
        let adminCreditPollTimer = null;

        function normalizeCreditStatus(value) {
            return String(value || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
        }

        function creditClientReference(credit) {
            const candidates = [credit?.cliente_id, credit?.clienteId, credit?.id_cliente, credit?.idCliente, credit?.cliente_uuid, credit?.customer_id, credit?.cliente];
            for (const candidate of candidates) {
                const value = candidate && typeof candidate === 'object'
                    ? (candidate.id ?? candidate.cliente_id ?? candidate.id_cliente)
                    : candidate;
                if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim().toLowerCase();
            }
            return '';
        }

        function isActiveCredit(credit) {
            const status = normalizeCreditStatus(credit?.estado ?? credit?.status);
            if (['PAGADO', 'PAGADA', 'CANCELADO', 'CANCELADA', 'CERRADO', 'CERRADA', 'FINALIZADO', 'FINALIZADA'].includes(status)) return false;
            const balanceValue = credit?.deuda_actual ?? credit?.saldo_pendiente ?? credit?.saldo ?? credit?.monto_total ?? 0;
            const balance = Number(balanceValue || 0);
            if (!Number.isFinite(balance) || balance <= 0) return false;
            return status === 'ACTIVO' || status === 'VIGENTE' || status === 'PENDIENTE' || (!status && balance > 0) || (status !== '' && !['INACTIVO', 'INACTIVA'].includes(status));
        }

        window.onload = async function() {
            try {
                if (!supabaseClient) {
                    document.getElementById('admin-supabase-config-notice')?.classList.remove('hidden');
                    return;
                }
                const { data } = await supabaseClient.auth.getSession();
                const session = data?.session;
                const allowedEmail = String(window.CUPISSA_ADMIN_EMAIL || '').toLowerCase();
                if (session?.user?.email?.toLowerCase() === allowedEmail) {
                    localStorage.setItem('cupissa_admin_logged', 'true');
                    document.getElementById('admin-login-screen').classList.add('hidden');
                    fetchAdminData();
                    fetchProductsData();
                    if (typeof loadWebAdminData === 'function') loadWebAdminData();
                } else {
                    localStorage.removeItem('cupissa_admin_logged');
                }
            } catch (error) {
                console.error('No fue posible verificar la sesión administrativa de Supabase:', error);
                localStorage.removeItem('cupissa_admin_logged');
                if (/invalid api key|invalid apikey|api key/i.test(String(error?.message || ''))) {
                    document.getElementById('admin-supabase-config-notice')?.classList.remove('hidden');
                    const errorBox = document.getElementById('admin-login-error');
                    if (errorBox) {
                        errorBox.querySelector('span').textContent = 'La clave pública guardada no es válida para este proyecto. Abre “Configurar conexión” y reemplázala por la clave publishable/anon de CUPISSA.';
                        errorBox.classList.remove('hidden');
                    }
                }
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

        async function handleAdminLogin(e) {
            e.preventDefault();
            const email = document.getElementById('admin-user-email').value.trim();
            const pass = document.getElementById('admin-user-pass').value;
            const errorBox = document.getElementById('admin-login-error');
            const allowedEmail = String(window.CUPISSA_ADMIN_EMAIL || '').toLowerCase();
            const submitButton = e.target.querySelector('button[type="submit"]');
            if (submitButton) { submitButton.disabled = true; submitButton.querySelector('span').textContent = 'Verificando...'; }
            errorBox.classList.add('hidden');
            try {
                if (!supabaseClient) {
                    document.getElementById('admin-supabase-config-notice')?.classList.remove('hidden');
                    throw new Error('Falta configurar la clave pública de Supabase. Pulsa “Configurar conexión” antes de iniciar sesión.');
                }
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password:pass });
                if (error) throw error;
                if (String(data?.user?.email || '').toLowerCase() !== allowedEmail) {
                    await supabaseClient.auth.signOut();
                    throw new Error('Este usuario no tiene permiso para administrar CUPISSA.');
                }
                localStorage.setItem('cupissa_admin_logged', 'true');
                document.getElementById('admin-login-screen').classList.add('hidden');
                fetchAdminData();
                fetchProductsData();
                if (typeof loadWebAdminData === 'function') loadWebAdminData();
            } catch (error) {
                console.error('Error de autenticación administrativa:', error);
                let message = error?.message || 'Usuario o contraseña incorrectos.';
                if (/invalid api key|invalid apikey|api key/i.test(message)) {
                    message = 'La clave pública de conexión de Supabase no corresponde a este proyecto o está incompleta. Pulsa “Configurar conexión” y pega la clave publishable/anon.';
                    document.getElementById('admin-supabase-config-notice')?.classList.remove('hidden');
                }
                errorBox.querySelector('span').textContent = message;
                errorBox.classList.remove('hidden');
            } finally {
                if (submitButton) { submitButton.disabled = false; submitButton.querySelector('span').textContent = 'Acceder al Panel'; }
            }
        }

        async function handleAdminLogout() {
            try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch (error) { console.warn('No fue posible cerrar la sesión remota:', error); }
            localStorage.removeItem('cupissa_admin_logged');
            document.getElementById('admin-login-screen').classList.remove('hidden');
        }

        function subscribeAdminCreditRealtime() {
            if (!supabaseClient?.channel || adminCreditRealtimeChannel) return;
            adminCreditRealtimeChannel = supabaseClient
                .channel('cupissa-admin-creditos-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'creditos' }, () => {
                    clearTimeout(adminCreditRealtimeTimer);
                    adminCreditRealtimeTimer = setTimeout(() => fetchAdminData(), 400);
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clientes' }, () => {
                    clearTimeout(adminCreditRealtimeTimer);
                    adminCreditRealtimeTimer = setTimeout(() => fetchAdminData(), 400);
                })
                .subscribe();
            if (!adminCreditPollTimer) adminCreditPollTimer = setInterval(() => {
                if (!document.hidden && document.getElementById('admin-login-screen')?.classList.contains('hidden')) fetchAdminData();
            }, 20000);
        }

        async function fetchAdminData() {
            subscribeAdminCreditRealtime();
            try {
                const { data: clientes, error: cliError } = await supabaseClient.from('clientes').select('*');
                if (cliError) throw cliError;

                const creditResult = await supabaseClient.from('creditos').select('*');
                const creditLoadWarning = document.getElementById('admin-credit-load-error');
                let creditRows = creditResult.data || [];
                if (creditResult.error) {
                    console.error('No fue posible leer la tabla creditos:', creditResult.error);
                    creditRows = [];
                    if (creditLoadWarning) {
                        creditLoadWarning.textContent = `Supabase no permitió leer la tabla creditos: ${creditResult.error.message}. Revisa el permiso de la tabla y las políticas RLS para el rol authenticated.`;
                        creditLoadWarning.classList.remove('hidden');
                    }
                } else if (creditLoadWarning) {
                    creditLoadWarning.classList.add('hidden');
                    creditLoadWarning.textContent = '';
                }

                const clientMap = new Map();
                (clientes || []).forEach(client => {
                    const key = String(client.id ?? '').trim().toLowerCase();
                    if (key) clientMap.set(key, { ...client, creditos: [] });
                });

                creditRows.forEach(credit => {
                    const clientRef = creditClientReference(credit);
                    const client = clientMap.get(clientRef);
                    if (client) client.creditos.push(credit);
                });

                allClients = Array.from(clientMap.values());
                filteredClients = [...allClients];
                currentClientsPage = 1;
                renderAdminTable();
            } catch (err) {
                console.error('Error al cargar los clientes desde Supabase:', err);
                allClients = [];
                filteredClients = [];
                renderAdminTable();
                const status = document.getElementById('admin-credit-load-error');
                if (status) {
                    status.textContent = `No se pudieron cargar los clientes: ${err?.message || 'Error de consulta'}`;
                    status.classList.remove('hidden');
                }
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
                    const creditosActivos = creditos.filter(isActiveCredit);
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
            const cupoTotal = parseFloat(document.getElementById('new-client-cupo').value) || 300000;
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
            const creditos = (client.creditos || []).filter(isActiveCredit);
            if (creditos.length === 0) {
                container.innerHTML = `<div class="p-4 bg-slate-50 text-slate-400 rounded-2xl text-center text-xs">Sin deudas activas.</div>`;
                return;
            }

            creditos.forEach((cred, idx) => {
                const totalCuotas = cred.numero_cuotas || 1;
                const valorCuota = cred.valor_cuota || Math.ceil((cred.monto_total || 0) / totalCuotas);
                const fechaBase = cred.proximo_vencimiento || new Date().toISOString().split('T')[0];
                const frecuencia = cred.frecuencia || 'Quincenal';
                const creditoEstado = normalizeCreditStatus(cred.estado || 'ACTIVO');

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
                                <tbody data-credit-installments="${cred.id}">
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
                // La tabla calculada es solo un respaldo cuando el crédito no tiene
                // registros de cuotas. Si existen registros reales, prevalecen.
                supabaseClient.from('cuotas_credito')
                    .select('numero_cuota,valor_cuota,monto_pagado,fecha_vencimiento,fecha_pago,estado')
                    .eq('credito_id', cred.id)
                    .order('numero_cuota', { ascending: true })
                    .then(({ data, error }) => {
                        if (error || !data?.length || !card.isConnected) return;
                        const tbody = card.querySelector('[data-credit-installments]');
                        if (!tbody) return;
                        tbody.replaceChildren();
                        const outstanding = data.filter(c =>
                            !['PAGADO', 'PAGADA', 'CANCELADO', 'CANCELADA'].includes(normalizeCreditStatus(c.estado))
                            && Number(c.monto_pagado || 0) < Number(c.valor_cuota || 0)
                        );
                        if (!outstanding.length) {
                            const row = tbody.insertRow();
                            const cell = row.insertCell(); cell.colSpan = 4;
                            cell.className = 'py-3 text-emerald-700 font-bold text-center';
                            cell.textContent = 'Sin cuotas pendientes';
                        }
                        outstanding.forEach(c => {
                            const row = tbody.insertRow();
                            [ `Cuota #${c.numero_cuota || '—'}`, c.fecha_vencimiento || '—',
                              formatCOP(Math.max(0, Number(c.valor_cuota || 0) - Number(c.monto_pagado || 0))),
                              'PENDIENTE' ].forEach((val, i) => {
                                const cell = row.insertCell();
                                cell.className = 'py-2 px-2 text-xs' + (i === 3 ? ' text-pink-600 font-bold' : '');
                                cell.textContent = val;
                              });
                        });
                    }).catch(err => console.warn('No se pudieron actualizar las cuotas:', err));
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
            if (!(await cupissaConfirm('¿Estás seguro de marcar esta deuda como PAGA?'))) return;
            try {
                const { data: updated, error } = await supabaseClient.from('creditos')
                    .update({ estado: 'PAGADO', deuda_actual: 0 })
                    .eq('id', creditoId).select('id');
                if (error) throw error;
                if (!updated?.length) throw new Error('No se actualizó ningún crédito. Revisa los permisos de Supabase.');
                // Registrar fecha y estado de las cuotas reales, no solo del crédito padre.
                const today = new Date().toLocaleDateString('en-CA');
                const { error: installmentError } = await supabaseClient.from('cuotas_credito')
                    .update({ estado: 'PAGADO', fecha_pago: today })
                    .eq('credito_id', creditoId).neq('estado', 'PAGADO');
                if (installmentError) {
                    console.warn('No se pudieron cerrar las cuotas relacionadas:', installmentError);
                    alert('La deuda quedó pagada, pero sus cuotas no pudieron actualizarse: ' + installmentError.message);
                } else {
                    alert('Deuda y cuotas marcadas como pagadas correctamente.');
                }
                closeEditModal();
                await fetchAdminData();
            } catch (error) {
                console.error('Error al marcar deuda como pagada:', error);
                alert('No se pudo registrar el pago: ' + (error?.message || 'Error desconocido'));
            }
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
            if (!(await cupissaConfirm('¿Estás totalmente seguro de eliminar este cliente? Se borrarán sus créditos y todos sus datos de forma permanente.'))) return;
            
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
            if (!clientId) return alert('Primero selecciona un cliente.');
            const input = await cupissaDebtForm();
            if (!input) return;
            const monto = Number(input.monto), cuotasTotal = Number(input.cuotas);
            if (!(monto > 0) || !(cuotasTotal >= 1) || !input.fecha) return alert('Completa los datos de la deuda.');
            try {
                const { data: cliente, error: clientError } = await supabaseClient.from('clientes').select('cupo_total,cupo_disponible').eq('id',clientId).single();
                if (clientError) throw clientError;
                const { error } = await supabaseClient.from('creditos').insert([{
                    cliente_id: clientId, monto_total:monto, deuda_actual:monto,
                    frecuencia:input.frecuencia.trim() || 'Quincenal', numero_cuotas:cuotasTotal,
                    valor_cuota:Math.ceil(monto / cuotasTotal), proximo_vencimiento:input.fecha, estado:'ACTIVO'
                }]);
                if (error) throw error;
                const disponible = Number(cliente.cupo_disponible ?? cliente.cupo_total ?? 0);
                const { error: cupoError } = await supabaseClient.from('clientes').update({cupo_disponible:disponible-monto}).eq('id',clientId);
                if (cupoError) throw cupoError;
                await fetchAdminData();closeEditModal();alert('Nueva deuda registrada correctamente.');
            } catch (error) { alert('No se pudo registrar la deuda: '+(error?.message || 'Error desconocido')); }
        }

        // ==================== CLASIFICACIÓN MÚLTIPLE DE PRODUCTOS ====================
        // Las columnas singulares originales se conservan por compatibilidad;
        // las nuevas columnas en plural almacenan todas las opciones seleccionadas.
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
            if (!values.length && legacyValue != null && String(legacyValue).trim()) values = [legacyValue];
            const unique = [];
            values.forEach(item => {
                const clean = String(item ?? '').trim();
                if (clean && !unique.some(existing => existing.toLocaleLowerCase('es-CO') === clean.toLocaleLowerCase('es-CO'))) unique.push(clean);
            });
            return unique;
        }

        function productMultiValuesFromRow(product, field) {
            return normalizeProductMultiValues(product?.[`${field}s`], product?.[field]);
        }

        function setProductMultiValues(field, values) {
            productMultiSelections[field] = normalizeProductMultiValues(values);
            const legacyInput = document.getElementById(`prod-${field}`);
            if (legacyInput) legacyInput.value = productMultiSelections[field][0] || '';
            const input = document.getElementById(`prod-${field}-input`);
            if (input) input.value = '';
            renderProductMultiField(field);
        }

        function renderProductMultiField(field) {
            const container = document.getElementById(`prod-${field}-tags`);
            const values = productMultiSelections[field] || [];
            const legacyInput = document.getElementById(`prod-${field}`);
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
            raw.split(/[;\n]+/).map(value => value.trim()).filter(Boolean).forEach(candidate => {
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

        function commitProductMultiInputs() {
            ['mundo', 'categoria', 'subcategoria', 'temporada'].forEach(field => {
                const input = document.getElementById(`prod-${field}-input`);
                if (input && input.value.trim()) addProductMultiValue(field);
            });
        }
        window.commitProductMultiInputs = commitProductMultiInputs;

        function resetProductMultiSelections() {
            ['mundo', 'categoria', 'subcategoria', 'temporada'].forEach(field => setProductMultiValues(field, []));
        }

        // ==================== PRODUCTOS SUPABASE Y SINCRONIZACIÓN ====================
        async function fetchProductsData(options = {}) {
            const preserveView = options?.preserveView === true;
            const savedWindowScroll = preserveView ? window.scrollY : 0;
            const savedCatalogScroll = preserveView ? (document.getElementById('tab-section-catalogo')?.scrollTop || 0) : 0;
            const status = document.getElementById('products-sync-status');
            let loadError = null;

            try {
                if (!supabaseClient) throw new Error('No hay una conexión activa con Supabase.');
                let queryResult = await supabaseClient
                    .from('productos')
                    .select('*')
                    .order('created_at', { ascending: true });
                if (queryResult.error) {
                    // Compatibilidad si created_at no está disponible: segunda consulta, igualmente a Supabase.
                    queryResult = await supabaseClient.from('productos').select('*');
                    if (queryResult.error) throw queryResult.error;
                }

                // Supabase es la única fuente de verdad: nunca mezclar caché o borradores locales.
                allProducts = Array.isArray(queryResult.data) ? queryResult.data : [];
                try { localStorage.removeItem('cupissa_cache_products'); } catch (_) {}
                if (status) status.classList.add('hidden');
            } catch (error) {
                loadError = error;
                console.error('Error al obtener productos desde Supabase:', error);
                // Ante un fallo de red/permisos no mostrar inventario antiguo ni registros locales.
                allProducts = [];
                try { localStorage.removeItem('cupissa_cache_products'); } catch (_) {}
                if (status) {
                    status.textContent = `No se pudieron consultar los productos en Supabase: ${error?.message || 'Error desconocido'}. El catálogo no mostrará datos locales ni desactualizados.`;
                    status.classList.remove('hidden');
                }
            }

            filteredProducts = [...allProducts];
            if (preserveView && typeof window.filterAdminProductsTable === 'function') {
                window.filterAdminProductsTable({ preserveView: true, revealCount: Number(options?.revealCount || 0) });
            } else {
                currentProductsPage = 1;
                renderProductsTable();
            }
            renderSugerenciasCampos();
            await loadFeaturedSeasonAdmin();

            if (preserveView) {
                requestAnimationFrame(() => {
                    window.scrollTo({ top: savedWindowScroll, behavior: 'auto' });
                    const catalog = document.getElementById('tab-section-catalogo');
                    if (catalog) catalog.scrollTop = savedCatalogScroll;
                });
            }
            return { products: allProducts, error: loadError };
        }
        // Exponer la recarga para sincronizar el catálogo al abrir la pestaña y al recibir cambios externos.
        window.fetchProductsData = fetchProductsData;

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
            status.textContent = 'Consultando los valores existentes de productos.temporadas...';

            try {
                const rows = [];
                const pageSize = 1000;
                let from = 0;
                while (true) {
                    const { data, error } = await supabaseClient
                        .from('productos')
                        .select('temporadas,temporada')
                        .order('temporada', { ascending: true })
                        .range(from, from + pageSize - 1);
                    if (error) throw error;
                    rows.push(...(data || []));
                    if (!data || data.length < pageSize) break;
                    from += pageSize;
                }

                const seasonValues = [];
                rows.forEach(row => {
                    const values = normalizeProductMultiValues(row.temporadas, row.temporada);
                    values.forEach(value => seasonValues.push(String(value).trim().toUpperCase()));
                });
                const seasons = [...new Set(seasonValues.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

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
                    ? `${seasons.length} temporada(s) encontrada(s) en productos.temporadas. Selecciona una y pulsa “Guardar selección”.`
                    : 'No hay temporadas asignadas a los productos.';
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
            fields.forEach(field => {
                const values = new Map();
                allProducts.forEach(product => productMultiValuesFromRow(product, field).forEach(value => {
                    const key = value.toLocaleLowerCase('es-CO');
                    if (!values.has(key)) values.set(key, value);
                }));
                const datalist = document.getElementById(`prod-${field}-options`);
                if (datalist) {
                    datalist.replaceChildren();
                    [...values.values()].sort((a, b) => a.localeCompare(b, 'es-CO')).forEach(value => {
                        const option = document.createElement('option');
                        option.value = value;
                        datalist.appendChild(option);
                    });
                }
                if (field === 'temporada') {
                    const seasonCount = document.getElementById('temporada-count-label');
                    if (seasonCount) seasonCount.textContent = `${values.size} temporada(s) disponibles. Puedes asignar varias.`;
                }
            });
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
            renderAccesoriosTags();
            window.cupissaRememberProductOptionPhotos?.();
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
            if (typeof window.cupissaSaveAccessoryTemplate === 'function') window.cupissaSaveAccessoryTemplate(tempAccesorios[tempAccesorios.length - 1]);
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
                window.cupissaAddProductOnlyPriceEditor?.(tag, 'accesorios', index, item.incremento);
                window.cupissaAddReplaceOptionButton?.(tag, 'accesorios', index);
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
                aspectRatio: NaN, // Recorte libre: conserva la proporción que el usuario seleccione.
                viewMode: 2,
                autoCropArea: 0.9,
                responsive: true,
            });
        }

        function confirmCropPhoto() {
            if (!currentCropper) return;

            const canvas = currentCropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });

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
            if (!container) return;
            container.innerHTML = '';
            tempBase64Photos.forEach((src, idx) => {
                const wrapper = document.createElement('div');
                wrapper.className = "relative group";
                wrapper.innerHTML = `
                    <img src="${src}" class="w-16 h-16 object-contain rounded-2xl border-2 fuchsia-border shadow-sm bg-slate-50">
                    <button type="button" onclick="removeTempPhoto(${idx})" class="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md hover:bg-red-700">×</button>
                `;
                container.appendChild(wrapper);
            });
            if (typeof window.setProductPublishPhotoCount === 'function') {
                window.setProductPublishPhotoCount(tempBase64Photos.length);
            }
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
            e.stopPropagation();
            const productForm = e.currentTarget || e.target || document.querySelector('#modal-product-form form');
            const editId = document.getElementById('prod-edit-id').value;
            let savedProductCount = 0;
            commitProductMultiInputs();
            const requiredFields = [
                ['prod-nombre', 'Escribe el título del producto.', 1],
                ['prod-mundo', 'Selecciona o escribe el mundo.', 1],
                ['prod-categoria', 'Selecciona o escribe la categoría.', 1],
                ['prod-temporada', 'Selecciona o escribe la temporada.', 1],
                ['prod-precio-detal', 'Indica el precio al detal.', 2],
                ['prod-porcentaje-anticipo', 'Indica el porcentaje de anticipo.', 2]
            ];
            for (const [fieldId, message, step] of requiredFields) {
                const field = document.getElementById(fieldId);
                if (!field || String(field.value ?? '').trim() === '') {
                    window.showProductStep?.(step);
                    alert(message);
                    field?.focus();
                    return;
                }
            }
            const selectedPublishMode = window.CUPISSA_PRODUCT_PUBLISH_MODE;
            const colorPhotoSources = (Array.isArray(tempColores) ? tempColores : []).map(color =>
                typeof color === 'string' ? '' : String(color?.foto || color?.imagen || color?.imagen_url || '').trim()
            );
            const sourcePhotoCount = new Set([
                ...(Array.isArray(tempBase64Photos) ? tempBase64Photos : []),
                ...colorPhotoSources
            ].filter(Boolean)).size;

            if (!editId && sourcePhotoCount === 0) {
                window.showProductStep?.(2);
                alert('Agrega al menos una foto del producto o asigna una foto a uno de sus colores.');
                document.getElementById('product-publish-modes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (!editId && sourcePhotoCount > 1 && !['single', 'gallery'].includes(selectedPublishMode)) {
                window.showProductStep?.(2);
                alert('Selecciona cómo deseas publicar las fotografías principales, incluidas las fotos de colores: por separado o juntas en una galería.');
                document.getElementById('product-publish-modes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            
            const submitBtn = productForm?.querySelector('button[type="submit"]');
            if (!submitBtn) {
                alert('No se encontró el botón de guardado del producto. Cierra y vuelve a abrir el formulario.');
                return;
            }
            const originalBtnHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i><span>Guardando...</span>`;

            // Deben vivir fuera del bloque try porque también se utilizan en catch.
            // Si Supabase rechaza el INSERT/UPDATE, el respaldo local necesita estos datos.
            let baseProductData = null;
            const defaultImage = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop';

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

                const uploadedColors = [];
                for (const color of tempColores) {
                    const normalizedColor = typeof color === 'string' ? { nombre: color, incremento: 0 } : { ...color };
                    let colorPhoto = normalizedColor.foto || normalizedColor.imagen || normalizedColor.imagen_url || '';
                    let colorPhotoOriginal = normalizedColor.foto_original || normalizedColor.original || colorPhoto;
                    if (colorPhoto.startsWith('data:')) colorPhoto = await uploadBase64ToStorage(colorPhoto);
                    if (colorPhotoOriginal.startsWith('data:')) colorPhotoOriginal = await uploadBase64ToStorage(colorPhotoOriginal);
                    uploadedColors.push({
                        nombre: String(normalizedColor.nombre || '').trim(),
                        incremento: Math.max(0, Number(normalizedColor.incremento || normalizedColor.adicional || 0)),
                        foto: colorPhoto,
                        foto_original: colorPhotoOriginal || colorPhoto
                    });
                }

                // Las opciones cargadas pueden reutilizarse al crear otros productos.
                uploadedAccessories.forEach((item, index) => { if (!tempAccesorios[index]?.__cupissaProductOnly) window.cupissaSaveAccessoryTemplate?.(item); });
                uploadedColors.forEach((item, index) => { if (!tempColores[index]?.__cupissaProductOnly) window.cupissaSaveColorTemplate?.(item); });

                // La galería principal se compone de las fotos generales y de las fotos asignadas a colores.
                // Cada entrada mantiene su original para la vista ampliada del catálogo.
                const galleryPhotoEntries = [];
                const seenGalleryPhotos = new Set();
                const addGalleryPhoto = (photo, original = photo) => {
                    const finalPhoto = String(photo || '').trim();
                    if (!finalPhoto || seenGalleryPhotos.has(finalPhoto)) return;
                    seenGalleryPhotos.add(finalPhoto);
                    galleryPhotoEntries.push({
                        photo: finalPhoto,
                        original: String(original || finalPhoto).trim() || finalPhoto
                    });
                };
                uploadedPhotos.forEach((photo, index) => {
                    addGalleryPhoto(photo, uploadedOriginals[index] || photo);
                });
                uploadedColors.forEach(color => {
                    if (color.foto) addGalleryPhoto(color.foto, color.foto_original || color.foto);
                });

                baseProductData = {
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
                    oculto: editId ? undefined : false,
                    personalizable: document.getElementById('chk-personalizable').checked,
                    al_por_mayor: document.getElementById('chk-al-por-mayor').checked,
                    venta: document.getElementById('chk-alquiler').checked ? false : document.getElementById('chk-venta').checked,
                    alquiler: document.getElementById('chk-alquiler').checked,
                    credito: document.getElementById('chk-credito').checked,
                    precio_alquiler: parseFloat(document.getElementById('prod-precio-alquiler').value) || 0,
                    valor_deposito: parseFloat(document.getElementById('prod-valor-deposito').value) || 0,
                    tallas: tempTallas,
                    colores: uploadedColors,
                    accesorios: uploadedAccessories
                };

                const allGalleryPhotos = galleryPhotoEntries.map(entry => entry.photo);
                const allGalleryOriginals = galleryPhotoEntries.map(entry => entry.original);

                if (editId) {
                    const singleData = {
                        ...baseProductData,
                        fotos: allGalleryPhotos.length > 0 ? allGalleryPhotos : [defaultImage],
                        fotos_originales: allGalleryOriginals.length > 0 ? allGalleryOriginals : [defaultImage]
                    };
                    const { error } = await supabaseClient.from('productos').update(singleData).eq('id', editId);
                    if (error) throw error;
                } else {
                    const photosCount = galleryPhotoEntries.length;
                    savedProductCount = photosCount > 1 ? photosCount : 1;

                    if (photosCount > 1) {
                        const productsToInsert = [];
                        const publishMode = selectedPublishMode;
                        for (let i = 0; i < photosCount; i++) {
                            const orderedEntries = [
                                galleryPhotoEntries[i],
                                ...galleryPhotoEntries.filter((_, photoIndex) => photoIndex !== i)
                            ];
                            const selectedEntries = publishMode === 'single'
                                ? [orderedEntries[0]]
                                : orderedEntries;
                            productsToInsert.push({
                                ...baseProductData,
                                fotos: selectedEntries.map(entry => entry.photo),
                                fotos_originales: selectedEntries.map(entry => entry.original)
                            });
                        }
                        const { error } = await supabaseClient.from('productos').insert(productsToInsert);
                        if (error) throw error;
                    } else {
                        const singleData = {
                            ...baseProductData,
                            fotos: allGalleryPhotos.length > 0 ? allGalleryPhotos : [defaultImage],
                            fotos_originales: allGalleryOriginals.length > 0 ? allGalleryOriginals : [defaultImage]
                        };
                        const { error } = await supabaseClient.from('productos').insert([singleData]);
                        if (error) throw error;
                    }
                }

                closeProductModal();
                await fetchProductsData({ preserveView: true, revealCount: savedProductCount });
                alert(editId ? '¡Producto actualizado exitosamente!' : '¡Producto(s) creado(s) exitosamente!');

            } catch (err) {
                console.error('Supabase no pudo guardar el producto:', err);
                // Se conserva una copia pendiente únicamente como respaldo; jamás se mezcla con el catálogo.
                if (baseProductData) {
                    const pendingDraft = {
                        ...baseProductData,
                        id: editId || null,
                        fotos: [...(Array.isArray(tempBase64Photos) ? tempBase64Photos : []), ...colorPhotoSources].filter(Boolean).length
                            ? [...new Set([...(Array.isArray(tempBase64Photos) ? tempBase64Photos : []), ...colorPhotoSources].filter(Boolean))]
                            : [defaultImage],
                        fotos_originales: [...new Set([...(Array.isArray(tempOriginalPhotos) ? tempOriginalPhotos : []), ...colorPhotoSources].filter(Boolean))].length
                            ? [...new Set([...(Array.isArray(tempOriginalPhotos) ? tempOriginalPhotos : []), ...colorPhotoSources].filter(Boolean))]
                            : [defaultImage],
                        pendiente_supabase: true,
                        guardado_local_en: new Date().toISOString()
                    };
                    try {
                        localStorage.setItem('cupissa_pending_product_draft', JSON.stringify(pendingDraft));
                    } catch (storageError) {
                        console.warn('El navegador no pudo conservar el borrador pendiente:', storageError);
                    }
                }
                // Mantener el formulario abierto permite corregir/reintentar sin crear un producto ficticio.
                alert(`Supabase no pudo guardar el producto: ${err?.message || 'Error desconocido'}. El formulario sigue abierto. El borrador local no aparecerá en el catálogo hasta guardarse correctamente en Supabase.`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
            }
        }

        // Exposición explícita para el formulario modular reconstruido por admin-enhancements.js.
        // Evita depender de la resolución implícita de funciones globales desde atributos HTML.
        window.handleSaveProduct = handleSaveProduct;

        async function deleteProduct(prodId) {
            if (!(await cupissaConfirm('¿Eliminar producto definitivamente de Supabase? Esta acción no se puede deshacer.'))) return;
            try {
                const { data, error } = await supabaseClient
                    .from('productos')
                    .delete()
                    .eq('id', prodId)
                    .select('id')
                    .maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('Supabase no confirmó la eliminación. El producto puede no existir o la política RLS puede impedir borrarlo.');
                await fetchProductsData({ preserveView: true });
            } catch (error) {
                console.error('No se pudo eliminar el producto de Supabase:', error);
                alert(`No se eliminó el producto en Supabase: ${error?.message || 'Error desconocido'}`);
                await fetchProductsData({ preserveView: true });
            }
        }

        window.deleteProduct = deleteProduct;

        function formatCOP(val) {
            return '$ ' + new Intl.NumberFormat('es-CO').format(val || 0);
        }
