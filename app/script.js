// --- NAMESPACE & CONFIG ---
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwKqKdyjgRwMc5w4PdYmIcoAnrbqZvLtL6r5Sn9iCsKXoNm_QHwbXNPfa9F7Epfc9gmKw/exec"; // Integrated
// Force Proxy URL for both Local and Prod to ensure fresh data (Cache busting added in App.init)
const GOOGLE_CSV_RAW = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSU9NpgyN3RgNiPntHNLMDVmZNdfdop55kuW1ZLZQ8YqVGjawosab7uhZsaFuUcxdk_VOZ9NBd_qpiZ/pub?output=csv';
const PROXIES = [
    'https://api.allorigins.win/raw?url=', // Primary (Most robust)
    'https://thingproxy.freeboard.io/fetch/', // Backup 1
    'https://corsproxy.io/?' // Backup 2
];

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

const App = {
    config: {
        delegationColors: {
            'Educación': '#78C2AD',
            'Eventos': '#5D8AA8',
            'Políticas Sociales': '#C38D9E',
            'Deportes': '#E2725B',
            'Juventud': '#FFAB76',
            'Igualdad': '#A28089',
            'Cultura': '#87A96B',
            'Mayores': '#F0E68C',
            'Protocolo': '#C2B280',
            'Comercio': '#B2BEB5',
            'Participación Ciudadana': '#F4C2C2',
            'Medio Ambiente': '#679267',
            'General': '#e9ecef',
            'Vivero': '#e9ecef'
        },
        textColors: {
            'Educación': 'white',
            'Juventud': 'white',
            'Mayores': 'black',
            'Protocolo': 'black',
            'Comercio': 'black',
            'Participación Ciudadana': 'black',
            'General': 'black',
            'Vivero': 'black'
        },
        planning: JSON.parse(localStorage.getItem('agenda_planning_config') || '{"p0":28,"p1":24,"p2":9,"p3":2}')
    },

    // STATE
    state: {
        allEvents: [],
        globalFilteredEvents: [],
        agenda: {
            currentWeekStart: null,
            viewMode: 'month', // week, month, list
            quickFilters: { police: false, stage: false, mega: false },
        },
        incidents: [],
        delegationColors: {},
        currentDate: new Date(),

        // Global Filters (Tab 1)
        filters: {
            search: '',
            dateStart: null,
            dateEnd: null,
            delegations: [],
            types: [],
            places: [],
            organizers: [],
            access: [],
            publicTarget: [],
            bools: { police: false, stage: false, mega: false, collab: false, sponsor: false, muni: false, contract: false },
            nums: { capMin: 0, partMin: 0 }
        }
    },

    init: () => {
        try {
            App.state.agenda.currentWeekStart = App.helpers.getStartOfWeek(new Date());
            App.ui.initDateInputs();
            App.data.refresh();

            console.log("App v12.1 Loaded - Debug Mode"); // Version Check
            if (window.lucide) lucide.createIcons();

            // Set initial active states for buttons if needed
            App.agenda.setView(App.state.agenda.viewMode);
        } catch (e) {
            console.error("Critical Init Error:", e);
            alert("Error al iniciar: " + e.message);
        }
    },

    router: {
        navigate: (tabId) => {
            document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll(`.nav-item[onclick*="${tabId}"]`).forEach(b => b.classList.add('active'));

            if (tabId === 'calendar' || tabId === 'agenda') App.agenda.render();
            else if (tabId === 'planning') App.planning.render();
            else if (tabId === 'reports') App.reports.render();
            else if (tabId === 'incidents') App.incidents.render();
        }
    },

    data: {
        fetchCSV: async (url) => {
            const bust = `&t=${Date.now()}`;
            const target = url + bust;

            for (const proxy of PROXIES) {
                try {
                    const finalUrl = proxy + encodeURIComponent(target);
                    console.log(`Trying Proxy: ${proxy}`);
                    const response = await fetch(finalUrl);
                    if (!response.ok) throw new Error(`Status ${response.status}`);

                    const text = await response.text();

                    // VALIDATION: content must look like CSV
                    if (!text) throw new Error("Empty response");
                    if (text.trim().startsWith('<')) throw new Error("Response is HTML (Proxy Error Page)");
                    if (text.length < 100) throw new Error("Response too short to be valid CSV");

                    return text;
                } catch (e) {
                    console.warn(`Proxy ${proxy} failed:`, e);
                }
            }

            // 2. Hail Mary: Try Direct Google Fetch (Might work in some browsers/extensions)
            try {
                console.warn("All proxies failed. Trying direct Google fetch...");
                const response = await fetch(target);
                if (!response.ok) throw new Error(`Status ${response.status}`);
                return await response.text();
            } catch (e) {
                console.error("Direct fetch failed:", e);
            }

            throw new Error("Critical: Unable to load data from any source.");
        },

        refresh: () => {
            const el = document.getElementById('lastUpdated');
            if (el) el.textContent = 'Cargando...';

            App.data.fetchCSV(GOOGLE_CSV_RAW).then(csvText => {
                Papa.parse(csvText, {
                    header: false,
                    complete: (results) => {
                        App.data.process(results.data);
                        if (el) el.textContent = `Actualizado: ${new Date().toLocaleTimeString()}`;
                    },
                    error: (e) => { throw e; } // Forward to catch
                });
            }).catch(e => {
                console.error("CSV Fetch Error:", e);
                if (el) el.textContent = 'Error de conexión';
                alert("Error crítico: No se puede conectar con la hoja de cálculo. Intenta recargar.");
            });
        },

        saveToSheets: (id) => {
            console.log("DEBUG: Calling saveToSheets with ID:", id);
            // alert("DEBUG: Inicio Guardado para ID: " + id); 

            if (SCRIPT_URL === "PONER_AQUI_TU_URL") {
                console.warn("Save skipped: SCRIPT_URL not set.");
                return;
            }

            const evt = App.state.allEvents.find(e => e.rawId == id);
            if (!evt || !evt.uniqueId) {
                console.warn("Save skipped: Event not found or missing Unique ID.");
                alert("Error: Este evento no tiene ID único (Col AD). No se pueden guardar cambios.");
                return;
            }

            const cp = JSON.parse(localStorage.getItem('agenda_checkpoints') || '{}')[id] || {};
            const prod = JSON.parse(localStorage.getItem('agenda_production') || '{}')[id] || '';

            const payload = {
                action: 'update', // Maintain for potential future routing, though script doesn't use it yet
                id: evt.uniqueId,
                fase0: !!cp.p0,
                fase1: !!cp.p1,
                fase2: !!cp.p2,
                fase3: !!cp.p3,
                produccion: prod
            };

            console.log("Saving to Sheets...", payload);
            // alert(`Guardando cambios para ID: ${evt.uniqueId}...`); // Debug Feedback Disabled

            // Convert to Form Data (x-www-form-urlencoded) for GAS compatibility
            const formData = new URLSearchParams();
            formData.append('action', 'update');
            formData.append('id', evt.uniqueId);
            formData.append('fase0', !!cp.p0);
            formData.append('fase1', !!cp.p1);
            formData.append('fase2', !!cp.p2);
            formData.append('fase3', !!cp.p3);
            formData.append('produccion', prod);

            // Fire and forget (using mode: 'no-cors' requires opaque response)
            fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            }).then(() => {
                console.log("Save request sent (Opaque/No-CORS). Assuming success.");
            }).catch(e => {
                console.error("Sheet Connection Error:", e);
                // Keep error alert but less intrusive
            });
        },

        process: (rows) => {
            let raw = [];
            let colorIdx = 0;
            const overrides = JSON.parse(localStorage.getItem('agenda_overrides') || '{}');

            // Sync State Containers (Sheet is Master)
            const syncCheckpoints = {};
            const syncProduction = {};

            rows.forEach((row, idx) => {
                if (idx < 2) return;
                const dStr = row[9];
                if (!dStr || !dStr.includes('/')) return;

                const deleg = (row[0] || 'General').split(',')[0].trim();
                const delegKey = App.config.delegationColors[deleg] ? deleg : 'Eventos';

                // Unique ID from Col AD (Index 29)
                const uniqueId = (row[29] || '').trim();
                if (!uniqueId) return; // Skip invalid rows as per user request to avoid errors

                if (!App.state.delegationColors[deleg]) {
                    App.state.delegationColors[deleg] = App.config.delegationColors[delegKey];
                }

                // --- SYNC READ LOGIC ---
                // Map CSV Columns Y(24), Z(25), AA(26), AB(27), AC(28) to State
                const isTrue = (v) => String(v).toUpperCase() === 'TRUE';
                const p0 = isTrue(row[24]);
                const p1 = isTrue(row[25]);
                const p2 = isTrue(row[26]);
                const p3 = isTrue(row[27]);
                let prod = (row[28] || '').trim();
                // Default handling for Production
                if (prod === '') prod = 'Sin asignar';

                // Populate Sync Objects (Key: RawId/Index)
                syncCheckpoints[idx] = { p0, p1, p2, p3 };
                syncProduction[idx] = prod;
                // -----------------------

                const [start, end] = App.helpers.parseDates(dStr, row[11], row[10], row[12]);
                const title = (row[4] || 'Sin Título').trim();
                const isAllDay = !row[11] || row[11].trim() === '';

                // Apply Overrides (Code 04 Security Result)
                if (overrides[idx]) {
                    const o = overrides[idx];
                    if (o.start) start = new Date(o.start);
                    if (o.end) end = new Date(o.end);
                }

                raw.push({
                    rawId: idx, // Keep internal index for UI interactions
                    uniqueId: uniqueId, // External ID for syncing
                    allDay: isAllDay,
                    delegation: deleg,
                    organizer: (row[1] || '').trim(),
                    collab: App.helpers.checkBool(row[2]),
                    sponsor: App.helpers.checkBool(row[3]),
                    title: title,
                    type: (row[5] || 'General').trim(),
                    place: (row[6] || 'Por determinar').trim(),
                    start: start,
                    end: end,
                    participants: parseInt(row[13]) || 0,
                    capacity: parseInt(row[14]) || 0,
                    access: (row[15] || '').trim(),
                    publicType: (row[16] || '').trim(),
                    muniServices: App.helpers.checkBool(row[17]),
                    publicType: (row[16] || '').trim(),
                    muniServices: App.helpers.checkBool(row[17]),
                    contracts: App.helpers.checkBool(row[18]),
                    // Debug info to resolve data disputes
                    debug: {
                        d1: row[9],
                        d2: row[10],
                        t1: row[11],
                        t2: row[12]
                    },
                    services: {
                        mega: App.helpers.checkBool(row[19]),
                        stage: App.helpers.checkBool(row[20]),
                        police: App.helpers.checkBool(row[21])
                    },
                    expedient: (row[22] || '').trim(),
                    link: (row[23] || '').trim(),
                    hasConflict: false, // reset check
                    operationalDate: (start.getHours() < 6)
                        ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1)
                        : new Date(start.getFullYear(), start.getMonth(), start.getDate())
                });
            });

            App.state.allEvents = raw.sort((a, b) => a.start - b.start);

            // Commit Sync to LocalStorage (Sheet -> App)
            if (raw.length > 0) {
                localStorage.setItem('agenda_checkpoints', JSON.stringify(syncCheckpoints));
                localStorage.setItem('agenda_production', JSON.stringify(syncProduction));
            }

            // 1. Render data immediately (Priority for UX)
            App.filters.apply();

            // 2. Defer heavy calculations to unblock thread
            setTimeout(() => {
                App.filters.initUI();

                App.incidents.calculate();
                // If user is currently on incidents tab, re-render
                const active = document.querySelector('.view-container.active')?.id;
                if (active === 'tab-incidents') App.incidents.render();
            }, 50);
        }
    },

    filters: {
        initUI: () => {
            const evts = App.state.allEvents;
            const getOpts = (fn) => [...new Set(evts.map(fn).filter(Boolean))].sort();

            App.ui.createCheckboxList('Delegaciones', getOpts(e => e.delegation), 'delegations', 'filterContainerDelegation');
            App.ui.createCheckboxList('Tipos Evento', getOpts(e => e.type), 'types', 'filterContainerType');
            App.ui.createCheckboxList('Espacios', getOpts(e => e.place), 'places', 'filterContainerPlace');
            App.ui.createCheckboxList('Organiza', getOpts(e => e.organizer), 'organizers', 'filterContainerOrganizer');
            App.ui.createCheckboxList('Acceso', getOpts(e => e.access), 'access', 'filterContainerAccess');
            App.ui.createCheckboxList('Público', getOpts(e => e.publicType), 'publicTarget', 'filterContainerPublic');
        },

        apply: () => {
            const s = App.state;
            const input = (id) => document.getElementById(id);
            const check = (id) => input(id)?.checked;

            s.filters.search = input('globalSearch')?.value.toLowerCase() || '';
            s.filters.dateStart = input('globalDateStart')?.valueAsDate;
            s.filters.dateEnd = input('globalDateEnd')?.valueAsDate;
            s.filters.nums.capMin = parseInt(input('filterCapMin')?.value) || 0;
            s.filters.nums.partMin = parseInt(input('filterPartMin')?.value) || 0;

            const sb = s.filters.bools;
            sb.police = check('togglePolice');
            sb.stage = check('toggleStage');
            sb.mega = check('toggleMega');
            sb.collab = check('toggleCollab');
            sb.sponsor = check('toggleSponsor');
            sb.muni = check('toggleMuni');
            sb.contract = check('toggleContract');

            s.globalFilteredEvents = s.allEvents.filter(e => {
                const f = s.filters;
                if (f.search && !e.title.toLowerCase().includes(f.search) && !e.place.toLowerCase().includes(f.search)) return false;

                // Operational Date Filtering
                const opDate = e.operationalDate;
                // For date range, we check if the OPERATIONAL date falls within range
                if (f.dateStart && opDate < f.dateStart) return false;
                if (f.dateEnd && opDate > f.dateEnd) return false;

                if (f.delegations.length && !f.delegations.includes(e.delegation)) return false;
                if (f.types.length && !f.types.includes(e.type)) return false;
                if (f.places.length && !f.places.includes(e.place)) return false;
                if (f.organizers.length && !f.organizers.includes(e.organizer)) return false;
                if (f.access.length && !f.access.includes(e.access)) return false;
                if (f.publicTarget.length && !f.publicTarget.includes(e.publicType)) return false;

                if (f.bools.police && !e.services.police) return false;
                if (f.bools.stage && !e.services.stage) return false;
                if (f.bools.mega && !e.services.mega) return false;
                if (f.bools.collab && !e.collab) return false; // Fixed: was e.collab undefined? mapped correctly now
                if (f.bools.sponsor && !e.sponsor) return false;
                if (f.bools.muni && !e.muniServices) return false; // mapped as muniServices
                if (f.bools.contract && !e.contracts) return false; // mapped as contracts

                if (f.nums.capMin && e.capacity < f.nums.capMin) return false;
                if (f.nums.partMin && e.participants < f.nums.partMin) return false;

                return true;
            });

            App.ui.renderAll();
        },

        clear: () => {
            // 1. Reset State
            App.state.filters.delegations = [];
            App.state.filters.types = [];
            App.state.filters.places = [];
            App.state.filters.organizers = [];
            App.state.filters.access = [];
            App.state.filters.publicTarget = [];

            const b = App.state.filters.bools;
            Object.keys(b).forEach(k => b[k] = false);

            App.state.filters.nums.capMin = 0;
            App.state.filters.nums.partMin = 0;
            App.state.filters.search = '';
            App.state.filters.dateStart = null;
            App.state.filters.dateEnd = null;

            // 2. Reset UI Inputs
            document.querySelectorAll('.filter-scroll-area input[type="text"]').forEach(el => el.value = '');
            document.querySelectorAll('.filter-scroll-area input[type="number"]').forEach(el => el.value = '');
            document.querySelectorAll('.filter-scroll-area input[type="date"]').forEach(el => el.value = '');
            document.querySelectorAll('.filter-scroll-area input[type="checkbox"]').forEach(el => el.checked = false);

            // 3. Apply empty filters
            App.filters.apply();
        },

        toggleArray: (key, val) => {
            const list = App.state.filters[key];
            const i = list.indexOf(val);
            if (i > -1) list.splice(i, 1); else list.push(val);
            App.filters.apply();
        }
    },

    agenda: {
        applyLocalFilters: (baseData) => {
            const q = App.state.agenda.quickFilters;
            return baseData.filter(e => {
                if (q.police && !e.services.police) return false;
                if (q.stage && !e.services.stage) return false;
                if (q.mega && !e.services.mega) return false;
                return true;
            });
        },

        toggleQuick: (key) => {
            const q = App.state.agenda.quickFilters;
            q[key] = !q[key];
            App.agenda.render();
        },

        resetQuick: () => {
            App.state.agenda.quickFilters = { police: false, stage: false, mega: false };
            App.agenda.render();
        },

        updateEventDate: (rawId, field, inputEl) => {
            const code = prompt("Introduzca código de seguridad:");
            if (code !== '04') {
                alert("Código incorrecto.");
                App.ui.openDrawerId(rawId); // Revert/Reload
                return;
            }

            const e = App.state.allEvents.find(x => x.rawId == rawId);
            if (!e) return;

            const val = inputEl.value;
            let newStart = new Date(e.start);
            let newEnd = new Date(e.end);

            if (field === 'date') {
                const parts = val.split('-'); // YYYY-MM-DD
                // Set year/month/date for Start
                newStart.setFullYear(parts[0], parts[1] - 1, parts[2]);

                // Preserve duration for End
                const duration = e.end.getTime() - e.start.getTime();
                newEnd = new Date(newStart.getTime() + duration);
            }
            else if (field === 'start') {
                const parts = val.split(':');
                newStart.setHours(parts[0], parts[1]);

                // Preserve duration
                const duration = e.end.getTime() - e.start.getTime();
                newEnd = new Date(newStart.getTime() + duration);
            }
            else if (field === 'end') {
                const parts = val.split(':');
                newEnd.setHours(parts[0], parts[1]);
                // If end is before start, assume next day? Or just let it be (user error check later)
                if (newEnd < newStart) newEnd.setDate(newEnd.getDate() + 1);
            }

            const overrides = JSON.parse(localStorage.getItem('agenda_overrides') || '{}');
            overrides[rawId] = { start: newStart.toISOString(), end: newEnd.toISOString() };
            localStorage.setItem('agenda_overrides', JSON.stringify(overrides));

            App.data.refresh(); // Reload data to apply overrides
            setTimeout(() => App.ui.openDrawerId(rawId), 500); // Re-open drawer
        },

        // Navigation
        prevWeek: () => App.agenda.shiftDate(-1),
        nextWeek: () => App.agenda.shiftDate(1),
        shiftDate: (dir) => {
            const d = App.state.agenda.currentWeekStart;
            const mode = App.state.agenda.viewMode;

            if (mode === 'month') {
                d.setDate(1); // Reset to 1st to avoid skipping.
                d.setMonth(d.getMonth() + dir);
            } else {
                // Default: Week or List -> shift 7 days
                d.setDate(d.getDate() + (dir * 7));
            }

            App.state.agenda.currentWeekStart = new Date(d);
            App.agenda.render();
        },

        // View Control
        setView: (mode) => {
            App.state.agenda.viewMode = mode;

            // 1. Update Buttons
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active')); // Main Nav (if any)
            document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active')); // Pill Nav
            const btn = document.getElementById(`btnView${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
            if (btn) btn.classList.add('active');

            // 2. Update Toggle Containers
            const views = ['week', 'month', 'list'];
            views.forEach(v => {
                const el = document.getElementById(`view-${v}`);
                if (el) el.classList.toggle('active', v === mode);
            });

            App.agenda.render();
        },

        render: () => {
            const mode = App.state.agenda.viewMode || 'week';

            // 1. Filter Data (Local)
            const data = App.agenda.applyLocalFilters(App.state.globalFilteredEvents);

            // 2. Update Quick Filter UI Buttons
            const q = App.state.agenda.quickFilters;
            const toggle = (id, v) => document.getElementById(id)?.classList.toggle('active', v);
            toggle('chipPolice', q.police);
            toggle('chipStage', q.stage);
            toggle('chipMega', q.mega);

            // 3. Update Date Labels
            const d = App.state.agenda.currentWeekStart;
            const updateLabels = (text) => document.querySelectorAll('#weekLabel, #monthLabel').forEach(el => el.textContent = text);

            if (d) {
                if (mode === 'week') {
                    const end = new Date(d); end.setDate(d.getDate() + 6);
                    updateLabels(`${d.getDate()} ${d.toLocaleDateString('es-ES', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('es-ES', { month: 'short' })}`);
                } else if (mode === 'month') {
                    updateLabels(d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase());
                } else {
                    updateLabels('LISTADO DE EVENTOS');
                }
            }

            // 4. Render Actual View
            try {
                if (mode === 'week') App.ui.renderWeek(data);
                if (mode === 'month') App.ui.renderMonth(data);
                if (mode === 'list') App.ui.renderList(data);
            } catch (e) { console.error("Render View Error:", e); }
        },
    },

    incidents: {
        calculate: () => {
            App.state.incidents = [];
            const evts = App.state.allEvents;
            for (let i = 0; i < evts.length; i++) {
                const A = evts[i];
                for (let j = i + 1; j < evts.length; j++) {
                    const B = evts[j];
                    // Optimization: Events are sorted by start time.
                    // If B starts after A ends, no further events in the list can overlap A.
                    if (B.start >= A.end) break;

                    if (A.place === B.place && A.place !== 'Por determinar') {
                        // Check for exact duplicate (Data Error) vs Resource Conflict
                        let type = 'Ocupación';
                        let severity = 'high';

                        if (A.title === B.title) {
                            type = 'Duplicado';
                            severity = 'medium'; // Less critical, likely data error
                        }

                        App.state.incidents.push({ sev: severity, events: [A, B], label: type, place: A.place });
                        A.hasConflict = true; B.hasConflict = true;
                    }
                }
            }
        },
        render: () => {
            // Requirements C1 & C2: Aggregations consistent with filters
            const fIds = new Set(App.state.globalFilteredEvents.map(e => e.rawId));
            const distinctKeys = new Set();

            const visibleIncidents = App.state.incidents.filter(inc => {
                // 1. Must be currently visible in filters
                if (!fIds.has(inc.events[0].rawId) || !fIds.has(inc.events[1].rawId)) return false;

                // 2. Dedup: Avoid showing "Event A vs Event B" multiple times if it's just due to data duplication
                // Key: TitleA|TitleB|Date
                const key = `${inc.events[0].title}|${inc.events[1].title}|${inc.events[0].start.toDateString()}`;
                if (distinctKeys.has(key)) return false;

                distinctKeys.add(key);
                return true;
            });

            const container = document.getElementById('incidentsTableBody');
            if (container) {
                container.innerHTML = visibleIncidents.map(inc => `
                    <tr style="border-left:4px solid ${inc.sev === 'high' ? 'red' : 'orange'}">
                        <td><span class="chip-toggle active" style="background:${inc.sev === 'high' ? '#fee2e2' : '#ffedd5'}; color:${inc.sev === 'high' ? '#ef4444' : '#f97316'}">${inc.sev === 'high' ? 'GRAVE' : 'ALERTA'}</span></td>
                        <td>${inc.label}</td>
                        <td>
                            <div>
                                <b>${inc.events[0].title}</b> 
                                <span style="font-size:0.85em; color:#666">(${inc.events[0].start.toLocaleDateString()})</span>
                                ${(inc.events[0].end - inc.events[0].start) > 86400000 ? `<span style="color:red; font-size:0.75em; font-weight:bold; margin-left:4px">⚠️ ${(inc.events[0].end - inc.events[0].start) / 86400000 | 0} días</span>` : ''}
                            </div>
                            <div style="font-size:0.8rem; color:#94a3b8; text-align:center">⚡ choca con</div>
                            <div>
                                <b>${inc.events[1].title}</b> 
                                <span style="font-size:0.85em; color:#666">(${inc.events[1].start.toLocaleDateString()})</span>
                                ${(inc.events[1].end - inc.events[1].start) > 86400000 ? `<span style="color:red; font-size:0.75em; font-weight:bold; margin-left:4px">⚠️ ${(inc.events[1].end - inc.events[1].start) / 86400000 | 0} días</span>` : ''}
                            </div>
                        </td>
                        <td>${inc.events[0].start.toLocaleDateString()}</td>
                    </tr>
                 `).join('');
            }

            // Update Header Summaries
            const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
            setTxt('incHighCount', visibleIncidents.filter(i => i.sev === 'high').length);
            setTxt('incMedCount', visibleIncidents.filter(i => i.sev !== 'high').length);
        }
    },

    planning: {
        currentDate: new Date(),
        viewMode: 'month',

        updateConfig: () => {
            const code = prompt("Introduzca código de seguridad:");
            if (code !== '04') {
                alert("Código incorrecto.");
                App.planning.render(); // Revert inputs to current state
                return;
            }

            const getVal = (id) => parseInt(document.getElementById(id).value) || 0;
            App.config.planning = {
                p0: getVal('cfgP0'),
                p1: getVal('cfgP1'),
                p2: getVal('cfgP2'),
                p3: getVal('cfgP3')
            };
            localStorage.setItem('agenda_planning_config', JSON.stringify(App.config.planning));
            App.planning.render();
        },

        // 1. Generate Milestones from Events
        generateMilestones: () => {
            const milestones = [];
            const checkpoints = JSON.parse(localStorage.getItem('agenda_checkpoints') || '{}');
            const cfg = App.config.planning;

            // Use Global Filtered Events for Interconnectivity & Real-time filtering
            App.state.globalFilteredEvents.forEach(e => {
                const cp = checkpoints[e.rawId] || { p0: false, p1: false, p2: false, p3: false };

                // Phase 0: Apertura
                let d0 = new Date(e.start);
                d0.setDate(d0.getDate() - (cfg.p0 * 7));
                d0.setHours(9, 0, 0, 0);
                App.planning.addMilestone(milestones, e, d0, 'Fase 0: Ap. Expte', 'p0', cp.p0, true);

                // Phase 1: Contratación / Bases - Only if contracts
                if (e.contracts) {
                    let d1 = new Date(e.start);
                    d1.setDate(d1.getDate() - (cfg.p1 * 7));
                    d1.setHours(9, 0, 0, 0);
                    App.planning.addMilestone(milestones, e, d1, 'Fase 1: Contratación / Bases', 'p1', cp.p1, true);
                }

                // Phase 2: Técnica - Only if services
                const hasServices = Object.values(e.services).some(x => x);
                if (hasServices) {
                    let d2 = new Date(e.start);
                    d2.setDate(d2.getDate() - (cfg.p2 * 7));
                    d2.setHours(9, 0, 0, 0);
                    App.planning.addMilestone(milestones, e, d2, 'Fase 2: Técnica', 'p2', cp.p2, true);
                }

                // Phase 3: Resolución - Mandatory
                let d3 = new Date(e.start);
                d3.setDate(d3.getDate() - (cfg.p3 * 7));
                d3.setHours(9, 0, 0, 0);
                App.planning.addMilestone(milestones, e, d3, 'Fase 3: Resolución', 'p3', cp.p3, true);
            });

            return milestones;
        },

        addMilestone: (list, parentEvent, date, title, phaseKey, isCompleted, isRequired) => {
            // Business Day Logic:
            // Friday (5) -> Workday (No change)
            // Sat (6) -> Mon (+2)
            // Sun (0) -> Tue (+2)
            const day = date.getDay();
            if (day === 0) date.setDate(date.getDate() + 2);
            if (day === 6) date.setDate(date.getDate() + 2);

            // Create "Event-like" object for rendering
            list.push({
                rawId: parentEvent.rawId + '_' + phaseKey,
                parentId: parentEvent.rawId,
                title: `${title} - ${parentEvent.title}`, // [Phase] - [Event Title]
                start: date,
                end: new Date(date.getTime() + 3600000), // 1 hour
                delegation: parentEvent.delegation,
                place: 'Hito de Planificación',
                type: 'Hito',
                publicType: 'Interno',
                organizer: 'Interno',
                access: 'N/A',
                capacity: 0,
                participants: 0,
                services: {},
                contracts: false,
                operationalDate: date,
                isMilestone: true,
                phaseKey: phaseKey,
                isCompleted: isCompleted,
                isRequired: isRequired
            });
        },

        toggleCheckpoint: (eventId, phaseKey) => {
            const data = JSON.parse(localStorage.getItem('agenda_checkpoints') || '{}');
            if (!data[eventId]) data[eventId] = {};

            const currentState = !!data[eventId][phaseKey];
            const action = currentState ? 'desmarcar' : 'validar';

            const code = prompt(`Introduzca código de seguridad:`);
            if (code !== '80') {
                alert("Código incorrecto.");
                // Re-render drawer to revert UI state
                App.ui.openDrawerId(eventId);
                return;
            }

            data[eventId][phaseKey] = !currentState;
            localStorage.setItem('agenda_checkpoints', JSON.stringify(data));

            // Sync to Google Sheets check
            try {
                App.data.saveToSheets(eventId);
            } catch (e) { alert("Error llamando a Save: " + e.message); }

            // Re-render app to update dots in views
            App.agenda.render();
            if (App.state.activeTab === 'planning') App.planning.render();
            // Re-render drawer to show updated state (Last to avoid DOM issues)
            App.ui.openDrawerId(eventId);
        },
        setProduction: (eventId, val, selectEl) => {
            const prev = JSON.parse(localStorage.getItem('agenda_production') || '{}')[eventId] || 'Sin asignar';
            if (val === prev) return;

            const code = prompt(`Introduzca código de seguridad:`);
            if (code === '80') {
                const data = JSON.parse(localStorage.getItem('agenda_production') || '{}');
                data[eventId] = val;
                localStorage.setItem('agenda_production', JSON.stringify(data));

                // Sync to Google Sheets
                try { App.data.saveToSheets(eventId); } catch (e) { console.error(e); }

                // Immediate Update across views
                if (App.state.agenda.viewMode === 'month') App.ui.renderMonth(App.agenda.applyLocalFilters(App.state.globalFilteredEvents));
                if (App.state.activeTab === 'planning') App.planning.render();

                // Sync to Google Sheets (Already called at line 723)
                // App.data.saveToSheets(eventId); // REMOVED DUPLICATE

            } else {
                if (code !== null) alert("Código incorrecto.");
                selectEl.value = prev; // Revert
            }
        },

        getDotsHtml: (evt, style = '') => {
            // Allow dots for Milestones (Planning) and Parents (Agenda)
            const id = evt.parentId || evt.rawId;
            const cp = JSON.parse(localStorage.getItem('agenda_checkpoints') || '{}')[id] || {};
            const cfg = App.config.planning;

            const getDot = (phase, weeks, isRequired) => {
                if (!isRequired) return `<div style="width:0; height:0; overflow:hidden"></div>`; // Hidden

                const isChecked = cp[phase];
                let color = '#d1d5db'; // Gray (Pending)

                if (isChecked) {
                    color = '#22c55e'; // Green (Validated)
                } else {
                    let deadline = new Date(evt.start);
                    deadline.setDate(deadline.getDate() - (weeks * 7));
                    if (new Date() > deadline) color = '#ef4444'; // Red (Late)
                }

                return `<div style="width:8px; height:8px; border-radius:50%; background:${color}; border:1px solid rgba(0,0,0,0.1);" title="${phase === 'p0' ? 'Fase 0: Ap. Expte' :
                    phase === 'p1' ? 'Fase 1: Contratación / Bases' :
                        phase === 'p2' ? 'Fase 2: Técnica' :
                            'Fase 3: Resolución'
                    }"></div>`;
            };

            // Requirement Logic for Visibility
            const hasContracts = evt.contracts; // Phase 1
            // Phase 2: Muni Services OR Technical Services (Police/Stage/Mega)
            const hasServices = evt.muniServices || Object.values(evt.services).some(x => x);

            return `<div style="display:flex; gap:3px; position:absolute; bottom:5px; right:5px; z-index:10; ${style}">
                ${getDot('p0', cfg.p0, true)}
                ${getDot('p1', cfg.p1, hasContracts)}
                ${getDot('p2', cfg.p2, hasServices)}
                ${getDot('p3', cfg.p3, true)}
            </div>`;
        },

        // Navigation (Copied from Agenda but targeting planning state)
        shiftDate: (dir) => {
            const d = App.planning.currentDate;
            const mode = App.planning.viewMode;
            if (mode === 'month') {
                d.setDate(1); d.setMonth(d.getMonth() + dir);
            } else {
                d.setDate(d.getDate() + (dir * 7));
            }
            App.planning.currentDate = new Date(d);
            App.planning.render();
        },

        setView: (mode) => {
            App.planning.viewMode = mode;
            // Update UI Buttons
            document.querySelectorAll('#tab-planning .pill-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(`btnPlan${mode.charAt(0).toUpperCase() + mode.slice(1)}`).classList.add('active');

            // Show/Hide Containers
            ['week', 'month', 'list'].forEach(v => {
                document.getElementById(`plan-view-${v}`).classList.toggle('active', v === mode);
            });
            App.planning.render();
        },

        render: () => {
            const milestones = App.planning.generateMilestones();
            const mode = App.planning.viewMode;
            const d = App.planning.currentDate;
            const cfg = App.config.planning;

            // Sync Inputs
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            setVal('cfgP0', cfg.p0);
            setVal('cfgP1', cfg.p1);
            setVal('cfgP2', cfg.p2);
            setVal('cfgP3', cfg.p3);

            // Update Label
            const label = document.getElementById('planningLabel');
            if (label) {
                if (mode === 'month') label.textContent = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
                else if (mode === 'week') {
                    const start = App.helpers.getStartOfWeek(d);
                    const end = new Date(start); end.setDate(start.getDate() + 6);
                    label.textContent = `${start.getDate()} ${start.toLocaleDateString('es-ES', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('es-ES', { month: 'short' })}`;
                } else {
                    label.textContent = 'LISTADO DE HITOS';
                }
            }

            // Calculate View Start Date
            let viewStart;
            if (mode === 'month') {
                viewStart = new Date(d.getFullYear(), d.getMonth(), 1);
            } else {
                viewStart = App.helpers.getStartOfWeek(d);
            }

            // Render Views
            // Remove Week view support for Planning Tab
            if (mode === 'month') App.ui.renderMonth(milestones, 'planMonthGrid', viewStart);
            else App.ui.renderList(milestones, 'planListContainer'); // Default to List if not Month
        }
    },

    reports: {
        charts: {}, // Store chart instances

        render: () => {
            const evts = App.state.globalFilteredEvents;
            const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };

            // HELPER: Group By
            const groupBy = (arr, key) => arr.reduce((acc, obj) => { (acc[obj[key]] = acc[obj[key]] || []).push(obj); return acc; }, {});

            // ==========================================
            // 1. GENERALES
            // ==========================================
            // KPI 1: Total Eventos
            setTxt('kpiTotalEvents', evts.length);

            // KPI 2: Total Días Actividad
            const uniqueDays = new Set(evts.map(e => e.start.toDateString()));
            setTxt('kpiActiveDays', uniqueDays.size);

            // KPI 3: Total Horas
            const totalMinutes = evts.reduce((sum, e) => {
                let duration = (e.end - e.start) / 60000; // minutes
                if (e.allDay) duration = 8 * 60; // Configurable: 8h for All Day
                return sum + duration;
            }, 0);
            setTxt('kpiTotalHours', (totalMinutes / 60).toFixed(1));

            // KPI 4: Media Eventos/Día
            const avgEvt = uniqueDays.size ? (evts.length / uniqueDays.size).toFixed(1) : 0;
            setTxt('kpiAvgEvents', avgEvt);


            // ==========================================
            // 2. DELEGACIÓN
            // ==========================================
            // KPI 5 & 6 Data Prep
            const byDelegation = groupBy(evts, 'delegation');
            const delegationData = Object.keys(byDelegation).map(k => {
                const group = byDelegation[k];
                const hours = group.reduce((sum, e) => sum + (e.allDay ? 480 : (e.end - e.start) / 60000), 0) / 60;
                return { name: k, count: group.length, hours: hours.toFixed(1) };
            }).sort((a, b) => b.count - a.count);

            // Table Render
            const tBody = document.querySelector('#tableDelegationHours tbody');
            if (tBody) {
                tBody.innerHTML = delegationData.map(d => `<tr><td>${d.name}</td><td>${d.count}</td><td>${d.hours} h</td></tr>`).join('');
            }

            // Chart: Events by Delegation
            App.reports.renderChart('chartDelegationEvents', 'bar',
                delegationData.map(d => d.name),
                delegationData.map(d => d.count),
                'Eventos', delegationData.map(d => App.config.delegationColors[d.name] || App.config.delegationColors['General'])
            );

            // ==========================================
            // 3. ORGANIZACIÓN
            // ==========================================
            const byOrg = groupBy(evts, 'organizer'); // "Ayuntamiento" vs others
            let aytoCount = 0;
            let thirdCount = 0;
            Object.keys(byOrg).forEach(k => {
                if (k.toLowerCase().includes('ayuntamiento')) aytoCount += byOrg[k].length;
                else thirdCount += byOrg[k].length;
            });
            setTxt('kpiOrgAyto', aytoCount);
            setTxt('kpiOrgThird', thirdCount);

            setTxt('kpiCollab', evts.filter(e => e.collab).length);
            setTxt('kpiSponsor', evts.filter(e => e.sponsor).length);

            // Chart: Organizer Distribution
            App.reports.renderChart('chartOrganizer', 'doughnut',
                ['Ayuntamiento', 'Terceros'],
                [aytoCount, thirdCount],
                'Eventos', [App.config.delegationColors['Eventos'], '#cbd5e1']
            );

            // ==========================================
            // 4. PÚBLICO
            // ==========================================
            const totalAudience = evts.reduce((sum, e) => sum + (e.participants || 0), 0);
            const eventsWithAudience = evts.filter(e => e.participants > 0).length;
            setTxt('kpiTotalAudience', totalAudience.toLocaleString());
            setTxt('kpiAvgAudience', eventsWithAudience ? Math.round(totalAudience / eventsWithAudience) : 0);

            // Charts
            const palette = Object.values(App.config.delegationColors);
            const byType = groupBy(evts, 'publicType');
            App.reports.renderChart('chartPublicType', 'pie', Object.keys(byType), Object.values(byType).map(v => v.length), 'Público', palette);

            const byAccess = groupBy(evts, 'access');
            App.reports.renderChart('chartAccessType', 'pie', Object.keys(byAccess), Object.values(byAccess).map(v => v.length), 'Acceso', palette);


            // ==========================================
            // 5. ESPACIOS
            // ==========================================
            const byPlace = groupBy(evts, 'place');
            const placeData = Object.keys(byPlace).map(k => {
                const days = new Set(byPlace[k].map(e => e.start.toDateString())).size;
                return { place: k, events: byPlace[k].length, days: days };
            }).sort((a, b) => b.events - a.events).slice(0, 10); // Top 10

            const tPlaceBody = document.querySelector('#tableSpaces tbody');
            if (tPlaceBody) {
                tPlaceBody.innerHTML = placeData.map(d => `<tr><td>${d.place}</td><td>${d.events}</td><td>${d.days} días</td></tr>`).join('');
            }

            // ==========================================
            // 6. SERVICIOS
            // ==========================================
            const servStats = {
                police: { label: '👮 Policía', wd: 0, we: 0, count: 0 },
                stage: { label: '🎪 Escenario', wd: 0, we: 0, count: 0 },
                mega: { label: '🎤 Megafonía', wd: 0, we: 0, count: 0 }
            };

            evts.forEach(e => {
                const day = e.start.getDay();
                const isWeekend = (day === 0 || day === 6); // 0=Sun, 6=Sat

                // Duration Calculation
                let hours = (e.end - e.start) / 3600000;
                if (e.allDay) hours = 8;

                // Police
                if (e.services.police) {
                    servStats.police.count++;
                    if (isWeekend) servStats.police.we += hours; else servStats.police.wd += hours;
                }

                // Stage (Special Rule: 7h fixed)
                if (e.services.stage) {
                    servStats.stage.count++;
                    const stageHours = 7;
                    if (isWeekend) servStats.stage.we += stageHours; else servStats.stage.wd += stageHours;
                }

                // Megaphone
                if (e.services.mega) {
                    servStats.mega.count++;
                    if (isWeekend) servStats.mega.we += hours; else servStats.mega.wd += hours;
                }
            });

            const tServBody = document.querySelector('#tableServices tbody');
            if (tServBody) {
                tServBody.innerHTML = Object.values(servStats).map(s => {
                    const total = s.wd + s.we;
                    return `<tr>
                        <td>${s.label}</td>
                        <td style="text-align:center">${s.count}</td>
                        <td>${s.wd.toFixed(1)}</td>
                        <td>${s.we.toFixed(1)}</td>
                        <td><strong>${total.toFixed(1)}</strong></td>
                    </tr>`;
                }).join('');
            }

            // ==========================================
            // 7. TEMPORALIDAD
            // ==========================================
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const monthlyCounts = new Array(12).fill(0);
            evts.forEach(e => monthlyCounts[e.start.getMonth()]++);

            // Chart Month (Table)
            App.reports.renderTable('tableMonth', months, monthlyCounts);

            // Weekday Analysis
            const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const dayCounts = new Array(7).fill(0);
            evts.forEach(e => dayCounts[e.start.getDay()]++);

            // Reorder to start on Monday (Lun-Dom)
            const rotatedDays = [...days.slice(1), days[0]];
            const rotatedCounts = [...dayCounts.slice(1), dayCounts[0]];

            App.reports.renderTable('tableWeekday', rotatedDays, rotatedCounts);

            // ==========================================
            // 8. CONTROL
            // ==========================================
            setTxt('kpiNoTime', evts.filter(e => e.allDay).length);

            const incomplete = evts.filter(e => !e.participants || !e.publicType || !e.access || !e.organizer).length;
            setTxt('kpiIncomplete', incomplete);
        },

        renderTable: (id, labels, data) => {
            const tbody = document.querySelector(`#${id} tbody`);
            if (!tbody) return;
            const total = data.reduce((a, b) => a + b, 0);
            tbody.innerHTML = labels.map((l, i) => {
                const val = data[i];
                if (val === 0) return ''; // Optional: hide zero rows? Let's keep them if desired, or filter. User asked for data. Let's show all for temporal to see gaps, or maybe just non-zero? Standard is usually show all for "months".
                const pct = total > 0 ? Math.round((val / total) * 100) + '%' : '0%';
                return `<tr><td>${l}</td><td>${val}</td><td>${pct}</td></tr>`;
            }).join('');
        },

        renderChart: (id, type, labels, data, label, colors) => {
            const ctx = document.getElementById(id);
            if (!ctx) return;

            // Destroy existing
            if (App.reports.charts[id]) {
                App.reports.charts[id].destroy();
            }

            const total = data.reduce((a, b) => a + b, 0);

            App.reports.charts[id] = new Chart(ctx, {
                type: type,
                data: {
                    labels: labels,
                    datasets: [{
                        label: label,
                        data: data,
                        backgroundColor: colors,
                        borderColor: '#fff',
                        borderWidth: 1,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: type !== 'bar' && type !== 'line', position: 'right' },
                        title: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    let value = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
                                    let percentage = total > 0 ? Math.round((value / total) * 100) + '%' : '0%';
                                    return `${label}${value} (${percentage})`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: { display: type === 'bar' || type === 'line', beginAtZero: true }
                    }
                }
            });
        },


    },

    ui: {
        changeWeek: (dir) => App.agenda.shiftDate(dir * 7),
        changeMonth: (dir) => {
            const d = App.state.agenda.currentWeekStart;
            d.setMonth(d.getMonth() + dir);
            App.state.agenda.currentWeekStart = new Date(d);
            App.agenda.render();
        },

        initDateInputs: () => { },
        createCheckboxList: (title, items, key, domId) => {
            const c = document.getElementById(domId);
            if (!c) return;
            c.innerHTML = `<label style='font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase'>${title}</label>`;
            const d = document.createElement('div');
            d.innerHTML = items.map(i => `<label style='display:block; font-size:0.85rem;'><input type='checkbox' onchange='App.filters.toggleArray("${key}","${i}")'> ${i}</label>`).join('');
            d.style.maxHeight = '120px'; d.style.overflowY = 'auto';
            c.appendChild(d);
        },
        renderAll: () => {
            App.ui.renderPreviewTable();
            // Trigger active tab render
            const activeTab = document.querySelector('.view-container.active')?.id;
            if (activeTab === 'tab-agenda') App.agenda.render();
            if (activeTab === 'tab-incidents') App.incidents.render();
            if (activeTab === 'tab-reports') App.reports.render();
        },
        renderPreviewTable: () => {
            const t = document.getElementById('filtersTableBody');
            const c = document.getElementById('filtersBadgeCount');
            if (t) t.innerHTML = App.state.globalFilteredEvents.slice(0, 50).map(e => {
                const timeStr = (e.allDay) ? '<span class="badge" style="background:#eee">Todo el día</span>' :
                    `${e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${e.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

                return `
               <tr style="font-size:0.8rem">
                   <td class="nowrap">${e.start.toLocaleDateString()}</td>
                   <td class="nowrap">${timeStr}</td>
                   <td>
                       <div style="font-weight:600; color:#1e293b">${e.title}</div>
                       <div style="font-size:0.75em; color:#64748b">${e.type}</div>
                       <div style="font-size:0.75em; margin-top:2px">
                            ${e.collab ? '<span class="badge" style="border:1px solid #ccc">Colab</span>' : ''}
                            ${e.sponsor ? '<span class="badge" style="border:1px solid gold; background:#fffbeb">Patr</span>' : ''}
                       </div>
                   </td>

                   <td>
                       <span class="badge" style="background:${App.state.delegationColors[e.delegation] || '#eee'}44; color:${App.state.delegationColors[e.delegation] || '#666'}">${e.delegation}</span>
                   </td>
                   <td>
                       <div style="font-weight:600; color:#1e293b">${e.organizer}</div>
                   </td>
                   <td>${e.place}</td>
                   <td class="nowrap">
                       <div>👥 ${e.capacity}</div>
                       <div style="color:#64748b; font-size:0.9em">🎟️ ${e.participants}</div>
                   </td>
                   <td>
                       <div>${e.access}</div>
                       <div style="font-size:0.75em; color:#64748b">${e.publicType}</div>
                   </td>
                   <td style="font-size:1.1em; letter-spacing:2px">
                       ${e.services.police ? '👮' : '<span style="opacity:0.1">👮</span>'}
                       ${e.services.stage ? '🎪' : '<span style="opacity:0.1">🎪</span>'}
                       ${e.services.mega ? '🎤' : '<span style="opacity:0.1">🎤</span>'}
                       ${e.muniServices ? '🔧' : ''}
                       ${e.contracts ? '📄' : ''}
                   </td>
               </tr>`;
            }).join('');
            if (c) c.textContent = `${App.state.globalFilteredEvents.length} eventos`;
        },

        renderWeek: (data, containerId = 'weekGrid', startDate = App.state.agenda.currentWeekStart) => {
            const start = startDate;
            if (!start) return;
            const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
            const end = new Date(start); end.setDate(start.getDate() + 7); // Physical end date for query, but logic uses operational

            // Filter by logic: events whose operationalDate falls within this week
            const events = data.filter(e => {
                const opDate = e.operationalDate;
                return opDate >= start && opDate < end;
            });

            const grid = document.getElementById(containerId);
            if (!grid) return; grid.innerHTML = '';

            // Header
            const header = document.createElement('div');
            header.style.cssText = 'display:grid; grid-template-columns:50px repeat(7, 1fr); border-bottom:1px solid #e2e8f0; position:sticky; top:0; background:#e2e8f0; z-index:10;';
            header.innerHTML = '<div></div>' + dates.map(d => `<div style="text-align:center; padding:8px; border-left:1px solid #cbd5e1; font-weight:600;"><div style="font-size:1.2rem; color:${App.helpers.isToday(d) ? 'var(--accent)' : 'inherit'}">${d.getDate()}</div><div style="font-size:0.75rem; color:#64748b; text-transform:uppercase;">${d.toLocaleDateString('es-ES', { weekday: 'short' })}</div></div>`).join('');
            grid.appendChild(header);

            // Body
            const body = document.createElement('div');
            body.style.cssText = 'display:grid; grid-template-columns:50px repeat(7, 1fr); position:relative; min-height:1440px;'; // 24h * 60px

            // Time Column (06:00 to 05:00 next day)
            const hoursSequence = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
            let timeHtml = '<div style="background:#f8fafc;">' + hoursSequence.map(h => `<div style="height:60px; border-bottom:1px solid #e2e8f0; text-align:right; padding-right:8px; font-size:0.75rem; color:#64748b; transform:translateY(-10px)">${h}:00</div>`).join('') + '</div>';

            // Checkpoints Helper
            const getDotsHtml = App.planning.getDotsHtml;


            // Days
            const colHtml = dates.map(d => {
                let dayEvts = events.filter(e => App.helpers.isSameDay(e.operationalDate, d) && !e.allDay);
                let allDayEvts = events.filter(e => App.helpers.isSameDay(e.operationalDate, d) && e.allDay);

                // Sort by actual start time
                dayEvts.sort((a, b) => a.start - b.start);

                // Lane Logic
                const lanes = [];
                dayEvts.forEach(e => {
                    let placed = false;
                    for (let l = 0; l < lanes.length; l++) {
                        if (lanes[l] < e.start) { lanes[l] = e.end; e.lane = l; placed = true; break; }
                    }
                    if (!placed) { lanes.push(e.end); e.lane = lanes.length - 1; }
                });
                const totalLanes = lanes.length || 1;
                const widthPct = 100 / totalLanes;

                const isToday = App.helpers.isToday(d); // This checks calendar date. Might be slightly off for late night viewing, but acceptable.
                let html = `<div style="border-left:1px solid #f1f5f9; position:relative; background:${isToday ? '#f1f5f9' : 'white'};">`;

                // All Day Header
                if (allDayEvts.length > 0) {
                    html += `<div style="background:#f1f5f9; border-bottom:1px solid #ccc; padding:2px;">
                        ${allDayEvts.map(e => `<div onclick="App.ui.openDrawerId('${e.rawId}')" style="cursor:pointer; font-size:0.7em; margin-bottom:1px; background:white; padding:1px; border-left:3px solid ${App.state.delegationColors[e.delegation]}">
                            ${e.title}
                            ${getDotsHtml(e)}
                        </div>`).join('')}
                     </div>`;
                }

                // Grid lines (24 slots)
                for (let i = 0; i < 24; i++) html += `<div style="height:60px; border-bottom:1px dashed #f1f5f9;"></div>`;

                dayEvts.forEach(e => {
                    const h = e.start.getHours();
                    const m = e.start.getMinutes();

                    // Calculate visual offset from 06:00
                    // If h >= 6 (06:00 - 23:59) -> offset = h - 6
                    // If h < 6 (00:00 - 05:59) -> offset = h + 18
                    const hourOffset = (h >= 6) ? (h - 6) : (h + 18);
                    const exactTop = (hourOffset * 60) + m;

                    let height = (e.end - e.start) / 60000;
                    if (height < 25) height = 25;

                    const col = App.state.delegationColors[e.delegation] || '#94a3b8';
                    const left = e.lane * widthPct;

                    const duration = (e.end - e.start) / 3600000;
                    const durH = Math.floor(duration);
                    const durM = Math.round((duration % 1) * 60);
                    const durStr = `${durH}:${durM.toString().padStart(2, '0')}h`;

                    // Check if event text color override exists
                    const textCol = App.config.textColors[e.delegation] || 'white';

                    html += `<div onclick="App.ui.openDrawerId(${e.rawId})" 
                        style="position:absolute; top:${exactTop}px; height:${height}px; left:${left}%; width:${widthPct}%;
                        background:${col}; border:1px solid white; border-radius:3px; 
                        padding:2px 4px; font-size:0.75rem; overflow:hidden; cursor:pointer; z-index:5; box-shadow:0 1px 2px rgba(0,0,0,0.1); display:flex; flex-direction:column; gap:1px;">
                        
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; line-height:1.1;">
                            <strong style="color:${textCol}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.title}</strong>
                        </div>
                        
                        <div style="font-size:0.9em; color:${textCol}; opacity:0.9;">${durStr}</div>
                        <div style="font-size:0.9em; color:${textCol}; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ${e.place}</div>
                        ${getDotsHtml(e)}
                    </div>`;
                });
                html += '</div>';
                return html;
            }).join('');

            body.innerHTML = timeHtml + colHtml;
            grid.appendChild(body);

            const wl = document.getElementById('weekLabel');
            if (wl) wl.textContent = `${dates[0].toLocaleDateString()} - ${dates[6].toLocaleDateString()}`;
        },

        renderMonth: (data, containerId = 'monthGrid', startDate = App.state.agenda.currentWeekStart) => {
            const grid = document.getElementById(containerId);
            if (!grid) return;
            grid.innerHTML = '';

            const d = startDate || new Date();
            const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
            const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
            const events = data.filter(e => e.start <= mEnd && e.end >= mStart);

            const lbl = document.getElementById('weekLabel'); // Shared label
            if (lbl && App.state.agenda.viewMode === 'month') {
                lbl.textContent = mStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
            }

            // Grid Setup - Separate Header and Body to prevent header getting 120px height
            const headerStyle = `display:grid; grid-template-columns:repeat(7, 1fr); gap:1px; background:#e2e8f0; border:1px solid #e2e8f0; border-bottom:none; position:sticky; top:0; z-index:20;`;
            let headerHtml = `<div style="${headerStyle}">`;

            // Headers
            const days = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']; // Slightly longer names for "bigger" feel? Or just L, M... User said "put it bigger". Length OK.
            // Let's stick to L, M, X for consistency or expand if space permits. User liked Week View (3 letter).
            const daysShort = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

            daysShort.forEach((day, i) => {
                const border = i > 0 ? 'border-left:1px solid #cbd5e1;' : '';
                // Fixed height 40px as requested "bigger"
                headerHtml += `<div style="background:#e2e8f0; font-weight:600; text-align:center; padding:10px 4px; font-size:1rem; color:#475569; ${border}; display:flex; align-items:center; justify-content:center; height:40px; line-height:1;">${day}</div>`;
            });
            headerHtml += `</div>`;

            // Body Grid
            let bodyHtml = `<div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); grid-auto-rows:minmax(120px, auto); gap:1px; background:#e2e8f0; border:1px solid #e2e8f0; border-top:none;">`;

            // Empty slots
            let startDay = mStart.getDay() || 7;
            for (let i = 1; i < startDay; i++) bodyHtml += `<div style="background:#f8fafc;"></div>`;

            // Checkpoints Helper
            const getDotsHtml = App.planning.getDotsHtml;


            for (let i = 1; i <= mEnd.getDate(); i++) {
                const current = new Date(d.getFullYear(), d.getMonth(), i);
                const dayEvts = events.filter(e => App.helpers.isSameDay(e.operationalDate, current));
                const isToday = App.helpers.isToday(current);
                const bg = isToday ? '#f1f5f9' : 'white';

                // Split events
                const allDayEvts = dayEvts.filter(e => e.allDay);
                const timedEvts = dayEvts.filter(e => !e.allDay).sort((a, b) => a.start - b.start);

                bodyHtml += `<div style="background:${bg}; padding:4px; min-height:100px; display:flex; flex-direction:column; gap:2px; position:relative;">
                    <!-- Date Number -->
                    <div style="text-align:right; font-weight:bold; color:${isToday ? 'white' : 'inherit'}; z-index:2;">
                        <span style="${isToday ? 'background:var(--primary); padding:2px 6px; border-radius:50%; font-size:0.8rem' : ''}">${i}</span>
                    </div>

                    <!-- All Day Section -->
                    <div style="display:flex; flex-direction:column; gap:1px; margin-bottom:2px;">
                        ${allDayEvts.map(e => `
                            <div onclick="App.ui.openDrawerId('${e.rawId}')" 
                                style="cursor:pointer; font-size:0.7em; background:#f1f5f9; color:#475569; border-left:3px solid ${App.state.delegationColors[e.delegation]}; padding:1px 2px; white-space:nowrap; overflow:hidden;">
                                ${e.title}
                            </div>
                        `).join('')}
                    </div>

                    <!-- Timed Section -->
                    <div style="flex:1; display:flex; flex-direction:column; gap:1px;">
                        ${timedEvts.map(e => {
                    const duration = (e.end - e.start) / 3600000;
                    const h = Math.floor(duration);
                    const m = Math.round((duration % 1) * 60);
                    const durStr = `${h}:${m.toString().padStart(2, '0')}h`;

                    // Visual height hint
                    let heightClass = 'min-height:24px';
                    if (duration >= 2) heightClass = 'min-height:45px';
                    if (duration >= 4) heightClass = 'min-height:70px';

                    const prodName = JSON.parse(localStorage.getItem('agenda_production') || '{}')[e.rawId];
                    const startTime = e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    // PLANNING CARD (Milestone) - STRICT 3-LINE FORMAT
                    if (e.isMilestone) {
                        return `
                            <div onclick="App.ui.openDrawerId('${e.rawId}')" 
                                title="${e.title}"
                                style="cursor:pointer; font-size:0.75em; background:${App.state.delegationColors[e.delegation] || '#ccc'}; color:${App.config.textColors[e.delegation] || 'white'}; 
                                border-radius:4px; border:1px solid white; position:relative;
                                padding:4px; overflow:hidden; display:flex; flex-direction:column; justify-content:start; ${heightClass}; margin-bottom:1px; box-shadow:0 1px 2px rgba(0,0,0,0.1);">
                                
                                <!-- L1: Phase Name (e.g. Fase 0: Ap. Expte) -->
                                <div style="font-size:0.85em; opacity:0.9; margin-bottom:2px; font-weight:600;">${e.title.split(' - ')[0]}</div>
                                
                                <!-- L2: Event Title (e.g. Concierto X) -->
                                <div style="font-weight:700; font-size:0.95em; line-height:1.1; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.title.split(' - ')[1] || e.title}</div>
                                
                                <!-- L3: Production Name (e.g. Pablo) - Right aligned, no bold -->
                                <div style="font-size:0.85em; opacity:0.9; font-weight:400; text-align:right;">${prodName && prodName !== 'Sin asignar' ? prodName : ''}</div>

                                <!-- Dots: Bottom Right (Fixed) -->
                                <div style="position:absolute; bottom:3px; right:3px; display:flex; gap:3px;">
                                    ${getDotsHtml(e)}
                                </div>
                            </div>`;
                    }

                    // STANDARD CARD (Agenda)
                    return `
                            <div onclick="App.ui.openDrawerId('${e.rawId}')" 
                                title="${e.title} (${durStr})"
                                style="cursor:pointer; font-size:0.75em; background:${App.state.delegationColors[e.delegation] || '#ccc'}; color:${App.config.textColors[e.delegation] || 'white'}; 
                                border-radius:4px; border:1px solid white; position:relative;
                                padding:4px; overflow:hidden; display:flex; flex-direction:column; justify-content:start; ${heightClass}; margin-bottom:1px; box-shadow:0 1px 2px rgba(0,0,0,0.1);">
                                
                                <!-- L1: Time + Duration -->
                                <div style="display:flex; justify-content:space-between; align-items:baseline; font-size:0.85em; opacity:0.9; margin-bottom:2px; font-weight:400;">
                                     <span>${e.start.getHours().toString().padStart(2, '0')}:${e.start.getMinutes().toString().padStart(2, '0')}</span>
                                     <span>${durStr}</span>
                                </div>
                                
                                <!-- L2: Title -->
                                <div style="font-weight:700; font-size:0.95em; line-height:1.1; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.title}</div>
                                
                                <!-- L3: Production Name -->
                                <div style="font-size:0.85em; opacity:0.9; font-weight:400; text-align:right;">${prodName && prodName !== 'Sin asignar' ? prodName : ''}</div>

                                <!-- Dots: Bottom Right (Fixed) -->
                                <div style="position:absolute; bottom:3px; right:3px; display:flex; gap:3px;">
                                    ${!e.isMilestone ? getDotsHtml(e) : ''}
                                </div>
                            </div>`;
                }).join('')}
                    </div>
                </div>`;
            }
            bodyHtml += '</div>';

            grid.innerHTML = headerHtml + bodyHtml;
        },

        renderList: (data, containerId = 'listContainer') => {
            const c = document.getElementById(containerId);
            if (!c) return;
            if (data.length === 0) {
                c.innerHTML = '<div style="padding:2rem; text-align:center; color:#94a3b8">No hay eventos para los filtros actuales.</div>';
                return;
            }

            // Sorting
            const sorted = [...data].sort((a, b) => a.start - b.start);

            c.innerHTML = sorted.map(e => {
                const timeStr = e.allDay ? 'Todo el día' : `${e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${e.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} `;

                const durationMs = e.end - e.start;
                const h = Math.floor(durationMs / 3600000);
                const m = Math.round((durationMs % 3600000) / 60000);
                const durationStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} h`;

                // Checkpoints Helper
                const getDotsHtml = (e) => App.planning.getDotsHtml(e, 'margin-left:8px');


                return `
    <div class="card" onclick="App.ui.openDrawerId('${e.rawId}')" style="margin-bottom:8px; cursor:pointer; border-left:4px solid ${App.state.delegationColors[e.delegation] || '#ccc'}; padding:1rem;">
                    <!-- Header: Date, Time, Duration -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.85rem; color:#64748b;">
                        <div>
                            <span style="font-weight:700; color:var(--primary); margin-right:8px;">${e.start.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}</span>
                            <span>🕒 ${timeStr}</span>
                            ${!e.allDay ? `<span style="background:#f1f5f9; padding:1px 6px; border-radius:4px; margin-left:8px; font-size:0.75em;">⏱️ ${durationStr}</span>` : ''}
                        </div>
                        <span class="badge" style="background:${App.state.delegationColors[e.delegation] || '#eee'}44; color:${App.state.delegationColors[e.delegation] || '#666'}">${e.delegation}</span>
                        ${getDotsHtml(e)}
                    </div>

                    <!-- Title -->
                    <div style="font-size:1.1rem; font-weight:700; color:#1e293b; margin-bottom:8px;">${e.title}</div>

                    <!-- Details Grid -->
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:8px; font-size:0.9rem; color:#475569;">
                        <div>📍 <strong>Lugar:</strong> ${e.place}</div>
                        <div>👤 <strong>Organiza:</strong> ${e.organizer}</div>
                        <div>🏷️ <strong>Tipo:</strong> ${e.type} (${e.publicType})</div>
                        <div>🔑 <strong>Acceso:</strong> ${e.access}</div>
                        <div>👥 <strong>Aforo:</strong> ${e.capacity} | 🎟️ <strong>Estimado:</strong> ${e.participants}</div>
                    </div>

                    <!-- Footer: Services -->
                    <div style="margin-top:8px; padding-top:8px; border-top:1px solid #f1f5f9; display:flex; gap:12px; font-size:1.1rem;">
                        ${e.services.police ? '<span title="Policía">👮</span>' : ''}
                        ${e.services.stage ? '<span title="Escenario">🎪</span>' : ''}
                        ${e.services.mega ? '<span title="Megafonía">🎤</span>' : ''}
                    </div>
                </div>`;
            }).join('');
        },

        syncQuickFilters: () => {
            const q = App.state.agenda.quickFilters;
            const toggle = (id, v) => document.getElementById(id)?.classList.toggle('active', v);
            toggle('chipPolice', q.police);
            toggle('chipStage', q.stage);
            toggle('chipMega', q.mega);
        },

        openDrawerId: (id) => {
            // Handle Milestone IDs (e.g. "12_p0" -> "12")
            const parentId = String(id).split('_')[0];
            const e = App.state.allEvents.find(x => x.rawId == parentId);
            if (e) App.ui.openDrawer(e);
        },
        openDrawer: (e) => {
            const d = document.getElementById('drawerContent');
            if (!d) return;
            const labels = { police: '👮 Policía', stage: '🎪 Escenario', mega: '🎤 Megafonía' };
            const titleColor = App.config.delegationColors[e.delegation] || '#1e293b';

            // Checkpoints & Production
            const cp = JSON.parse(localStorage.getItem('agenda_checkpoints') || '{}')[e.rawId] || {};
            const prod = JSON.parse(localStorage.getItem('agenda_production') || '{}')[e.rawId] || 'Sin asignar';
            const cfg = App.config.planning;

            // Expedient Link
            const expHtml = e.link
                ? `<a href="${e.link}" target="_blank" style="color:var(--primary); text-decoration:underline; font-weight:bold;">${e.expedient || 'Ver Expediente'}</a>`
                : (e.expedient || '<span style="color:#ccc; font-style:italic;">Sin expediente</span>');

            d.innerHTML = `
                 <h2 class="drawer-title" style="color:${titleColor}">${e.title}</h2>
                 <div class="drawer-meta">
                    <span class="chip-toggle active">${e.type}</span>
                    <span class="chip-toggle" style="background:${App.state.delegationColors[e.delegation]}33; color:${App.state.delegationColors[e.delegation]}">${e.delegation}</span>
                 </div>
                 <div class="drawer-grid">
                     <div>
                        <p class="text-muted">Expediente</p>
                        <p>${expHtml}</p>
                     </div>
                     <div>
                        <p class="text-muted">Horario</p>
                        <p>📅 ${App.helpers.isSameDay(e.start, e.end) ? e.start.toLocaleDateString() : (e.start.toLocaleDateString() + ' - ' + e.end.toLocaleDateString())} <br> ${e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${e.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                     </div>
                     <div>
                        <p class="text-muted">Lugar</p>
                        <p>📍 ${e.place}</p>
                     </div>
                     <div>
                        <p class="text-muted">Afluencia</p>
                        <p>👥 ${e.capacity} (Aforo) <br> 🎟️ ${e.participants} (Estimado)</p>
                     </div>
                 </div>

                 <hr style="margin:1rem 0; border-top:1px solid #eee">
                 
                 <h3 class="drawer-section-title">Requerimientos</h3>
                 <div class="drawer-tags">
                     ${e.services.police ? `<span class="badge" style="background:#f1f5f9; color:black; border:none; font-weight:400; font-size:0.85rem;">👮 Policía</span>` : ''}
                     ${e.services.stage ? `<span class="badge" style="background:#f1f5f9; color:black; border:none; font-weight:400; font-size:0.85rem;">🎪 Escenario</span>` : ''}
                     ${e.services.mega ? `<span class="badge" style="background:#f1f5f9; color:black; border:none; font-weight:400; font-size:0.85rem;">🎤 Megafonía</span>` : ''}
                     ${e.muniServices ? `<span class="badge" style="background:#f1f5f9; color:black; border:none; font-weight:400; font-size:0.85rem;">🔧 Serv. Muni</span>` : ''}
                     ${e.contracts ? `<span class="badge" style="background:#f1f5f9; color:black; border:none; font-weight:400; font-size:0.85rem;">📄 Contratos</span>` : ''}
                 </div>
                 
                 <!-- Planning Checkpoints -->
                 <hr style="margin:1rem 0; border-top:1px solid #eee">
                 <h3 class="drawer-section-title">Hitos de Planificación</h3>
                 <div style="display:flex; flex-direction:column; gap:0.5rem; background:#f8fafc; padding:1rem; border-radius:8px;">
                    <!-- Phase 0: Always Visible -->
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" ${cp.p0 ? 'checked' : ''} onchange="App.planning.toggleCheckpoint('${e.rawId}','p0', this)"> <span style="font-size:0.9rem">Fase 0: Ap. Expte</span> <span style="font-size:0.8em; color:#64748b">(-${cfg.p0} sem)</span></label>
                    
                    <!-- Phase 1: Contracts -->
                    ${e.contracts ? `<label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" ${cp.p1 ? 'checked' : ''} onchange="App.planning.toggleCheckpoint('${e.rawId}','p1', this)"> <span style="font-size:0.9rem">Fase 1: Contratación / Bases</span> <span style="font-size:0.8em; color:#64748b">(-${cfg.p1} sem)</span></label>` : ''}
                    
                    <!-- Phase 2: Technical / Muni Services -->
                    ${(e.muniServices || Object.values(e.services).some(x => x)) ? `<label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" ${cp.p2 ? 'checked' : ''} onchange="App.planning.toggleCheckpoint('${e.rawId}','p2', this)"> <span style="font-size:0.9rem">Fase 2: Técnica</span> <span style="font-size:0.8em; color:#64748b">(-${cfg.p2} sem)</span></label>` : ''}
                    
                    <!-- Phase 3: Always Visible -->
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" ${cp.p3 ? 'checked' : ''} onchange="App.planning.toggleCheckpoint('${e.rawId}','p3', this)"> <span style="font-size:0.9rem">Fase 3: Resolución</span> <span style="font-size:0.8em; color:#64748b">(-${cfg.p3} sem)</span></label>
                 </div>

                 <!-- Production Assignment -->
                 <div style="margin-top:1rem; padding:0;">
                    <label style="display:block; font-size:0.85rem; margin-bottom:0.2rem; color:#64748b">Producción</label>
                    <select onchange="App.planning.setProduction('${e.rawId}', this.value, this)" style="width:auto; min-width:150px; padding:4px 8px; border-radius:4px; border:1px solid #e2e8f0; font-size:0.9rem; background:white; cursor:pointer;">
                        <option value="Sin asignar" ${prod === 'Sin asignar' ? 'selected' : ''}>Sin asignar</option>
                        <option value="Juanca" ${prod === 'Juanca' ? 'selected' : ''}>Juanca</option>
                        <option value="Camacho" ${prod === 'Camacho' ? 'selected' : ''}>Camacho</option>
                        <option value="Nacho" ${prod === 'Nacho' ? 'selected' : ''}>Nacho</option>
                        <option value="Pablo" ${prod === 'Pablo' ? 'selected' : ''}>Pablo</option>
                    </select>
                 </div>
             `;
            document.getElementById('drawerOverlay').classList.remove('hidden');
        },
        closeDrawer: () => document.getElementById('drawerOverlay').classList.add('hidden')
    },

    helpers: {
        getStartOfWeek: (d) => { const t = new Date(d); const day = t.getDay() || 7; if (day !== 1) t.setHours(-24 * (day - 1)); return t; },
        checkBool: (v) => (v || '').toUpperCase().includes('S'),
        isSameDay: (d1, d2) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear(),
        isToday: (d) => { const t = new Date(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); },
        parseDates: (dStr, tStr, d2Str, t2Str) => {
            const parseDate = (dateStr) => {
                if (!dateStr || typeof dateStr !== 'string') return null;
                const parts = dateStr.trim().split('/');
                if (parts.length !== 3) return null;

                let day = parseInt(parts[0]);
                let month = parseInt(parts[1]) - 1;
                let year = parseInt(parts[2]);

                // Fix: Handle 2-digit years (e.g. "26" -> 2026)
                // JS new Date(99, ...) -> 1999. We want 2000+.
                if (year < 100) year += 2000;

                return new Date(year, month, day);
            };

            // 1. Parse Start
            const start = parseDate(dStr) || new Date();
            let t1 = tStr ? tStr.trim().replace('.', ':') : null;

            if (t1 && t1.includes(':')) {
                const [h, m] = t1.split(':').map(Number);
                if (!isNaN(h)) start.setHours(h, m || 0, 0, 0);
            } else {
                start.setHours(0, 0, 0, 0); // All day start
            }

            // 2. Parse End
            let end;
            if (d2Str && d2Str.trim() !== '') {
                end = parseDate(d2Str);
            }
            // If no end date, or invalid, assume same day as start
            if (!end) end = new Date(start);

            let t2 = t2Str ? t2Str.trim().replace('.', ':') : null;

            if (t2 && t2.includes(':')) {
                const [h, m] = t2.split(':').map(Number);
                if (!isNaN(h)) end.setHours(h, m || 0, 0, 0);
            } else {
                // If no end time, default duration logic
                if (end.getTime() === start.getTime()) {
                    end.setHours(start.getHours() + 1);
                }
            }

            // Correction: End cannot be before Start
            if (end < start) end = new Date(start.getTime() + 3600000);

            return [start, end];
        }
    }
};

// Expose to window for inline onclicks
window.App = App;
document.addEventListener('DOMContentLoaded', App.init);
