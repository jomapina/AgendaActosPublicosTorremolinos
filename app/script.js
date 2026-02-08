// --- NAMESPACE & CONFIG ---
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const csvUrl = isLocal
    ? 'https://corsproxy.io/?' + encodeURIComponent('https://docs.google.com/spreadsheets/d/e/2PACX-1vSU9NpgyN3RgNiPntHNLMDVmZNdfdop55kuW1ZLZQ8YqVGjawosab7uhZsaFuUcxdk_VOZ9NBd_qpiZ/pub?output=csv')
    : '/api/data';

const App = {
    config: {
        csvUrl: csvUrl,
        colors: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
    },

    // STATE
    state: {
        allEvents: [],
        globalFilteredEvents: [],
        agenda: {
            currentWeekStart: null,
            currentView: 'week', // week, month, list
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
            if (window.lucide) lucide.createIcons();

            // Set initial active states for buttons if needed
            App.agenda.render();
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
            else if (tabId === 'reports') App.reports.render();
            else if (tabId === 'incidents') App.incidents.render();
        }
    },

    data: {
        refresh: () => {
            const el = document.getElementById('lastUpdated');
            if (el) el.textContent = 'Cargando...';

            const sep = App.config.csvUrl.includes('?') ? '&' : '?';
            Papa.parse(App.config.csvUrl + sep + 't=' + Date.now(), {
                download: true, header: false,
                complete: (results) => {
                    App.data.process(results.data);
                    if (el) el.textContent = `Actualizado: ${new Date().toLocaleTimeString()}`;
                },
                error: (e) => {
                    console.error("CSV Error:", e);
                    if (el) el.textContent = 'Error de carga';
                    alert("Error al cargar datos. Comprueba la conexión.");
                }
            });
        },

        process: (rows) => {
            let raw = [];
            let colorIdx = 0;

            rows.forEach((row, idx) => {
                if (idx < 2) return;
                const dStr = row[9];
                if (!dStr || !dStr.includes('/')) return;

                const deleg = (row[0] || 'General').split(',')[0].trim();
                if (!App.state.delegationColors[deleg]) {
                    App.state.delegationColors[deleg] = App.config.colors[colorIdx % App.config.colors.length];
                    colorIdx++;
                }

                const [start, end] = App.helpers.parseDates(dStr, row[11], row[10], row[12]);
                const title = (row[4] || 'Sin Título').trim();
                const isAllDay = !row[11] || row[11].trim() === '';

                raw.push({
                    rawId: idx,
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
                    hasConflict: false // reset check
                });
            });

            App.state.allEvents = raw.sort((a, b) => a.start - b.start);

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
                if (f.dateStart && e.end < f.dateStart) return false;
                if (f.dateEnd && e.start > f.dateEnd) return false;

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

        // Navigation
        prevWeek: () => App.agenda.shiftDate(-1),
        nextWeek: () => App.agenda.shiftDate(1),
        shiftDate: (dir) => {
            const d = App.state.agenda.currentWeekStart;
            const mode = App.state.agenda.viewMode;

            if (mode === 'month') {
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
                'Eventos', App.config.colors
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
                'Eventos', [App.config.colors[0], '#cbd5e1']
            );

            // ==========================================
            // 4. PÚBLICO
            // ==========================================
            const totalAudience = evts.reduce((sum, e) => sum + (e.participants || 0), 0);
            const eventsWithAudience = evts.filter(e => e.participants > 0).length;
            setTxt('kpiTotalAudience', totalAudience.toLocaleString());
            setTxt('kpiAvgAudience', eventsWithAudience ? Math.round(totalAudience / eventsWithAudience) : 0);

            // Charts
            const byType = groupBy(evts, 'publicType');
            App.reports.renderChart('chartPublicType', 'pie', Object.keys(byType), Object.values(byType).map(v => v.length), 'Público', App.config.colors);

            const byAccess = groupBy(evts, 'access');
            App.reports.renderChart('chartAccessType', 'pie', Object.keys(byAccess), Object.values(byAccess).map(v => v.length), 'Acceso', App.config.colors);


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

        exportTechPdf: () => { alert("Función de exportación pendiente de actualización para nueva estructura."); }
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

        renderWeek: (data) => {
            const start = App.state.agenda.currentWeekStart;
            if (!start) return;
            const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
            const end = new Date(start); end.setDate(start.getDate() + 7);
            const events = data.filter(e => e.start < end && e.end > start);
            const grid = document.getElementById('weekGrid');
            if (!grid) return; grid.innerHTML = '';

            // Header (same as before) ...
            const header = document.createElement('div');
            header.style.cssText = 'display:grid; grid-template-columns:50px repeat(7, 1fr); border-bottom:1px solid #e2e8f0; position:sticky; top:0; background:white; z-index:10;';
            header.innerHTML = '<div></div>' + dates.map(d => `<div style="text-align:center; padding:8px; border-left:1px solid #f1f5f9; font-weight:600;"><div style="font-size:1.2rem; color:${App.helpers.isToday(d) ? 'var(--accent)' : 'inherit'}">${d.getDate()}</div><div style="font-size:0.75rem; color:#64748b; text-transform:uppercase;">${d.toLocaleDateString('es-ES', { weekday: 'short' })}</div></div>`).join('');
            grid.appendChild(header);

            // Body
            const body = document.createElement('div');
            body.style.cssText = 'display:grid; grid-template-columns:50px repeat(7, 1fr); position:relative; min-height:800px;';

            // Time Column
            let timeHtml = '<div style="background:#f8fafc;">' + Array.from({ length: 16 }, (_, i) => i + 8).map(h => `<div style="height:60px; border-bottom:1px solid #e2e8f0; text-align:right; padding-right:8px; font-size:0.75rem; color:#64748b; transform:translateY(-10px)">${h}:00</div>`).join('') + '</div>';

            // Days
            const colHtml = dates.map(d => {
                let dayEvts = events.filter(e => App.helpers.isSameDay(e.start, d) && !e.allDay);
                let allDayEvts = events.filter(e => App.helpers.isSameDay(e.start, d) && e.allDay);

                // Simple overlap detection for Week View:
                // Sort by start
                dayEvts.sort((a, b) => a.start - b.start);
                // Assign columns? For now, if simple, just overlap slightly or use width.
                // User requirement: "si hay 2, dos columnas".
                // Simple greedy:
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

                let html = `<div style="border-left:1px solid #f1f5f9; position:relative; background:white;">`;

                // All Day Header within Column
                if (allDayEvts.length > 0) {
                    html += `<div style="background:#f1f5f9; border-bottom:1px solid #ccc; padding:2px;">
                        ${allDayEvts.map(e => `<div onclick="App.ui.openDrawerId(${e.rawId})" style="cursor:pointer; font-size:0.7em; margin-bottom:1px; background:white; padding:1px; border-left:3px solid ${App.state.delegationColors[e.delegation]}">${e.title}</div>`).join('')}
                     </div>`;
                }

                // Grid lines
                for (let h = 8; h <= 23; h++) html += `<div style="height:60px; border-bottom:1px dashed #f1f5f9;"></div>`;

                dayEvts.forEach(e => {
                    if (e.start.getHours() < 8) return;
                    const top = (e.start.getHours() - 8) * 60 + e.start.getMinutes() + (allDayEvts.length > 0 ? 20 : 0); // Offset if all day? slightly complex. CSS Grid better but absolute ok.
                    // Actually, let's ignore offset for absolute time positioning.
                    const exactTop = (e.start.getHours() - 8) * 60 + e.start.getMinutes();

                    let height = (e.end - e.start) / 60000;
                    if (height < 25) height = 25;

                    const col = App.state.delegationColors[e.delegation] || '#94a3b8';
                    const left = e.lane * widthPct;

                    html += `<div onclick="App.ui.openDrawerId(${e.rawId})" 
                        style="position:absolute; top:${exactTop}px; height:${height}px; left:${left}%; width:${widthPct}%;
                        background:${col}20; border-left:3px solid ${col}; border-radius:3px; 
                        padding:2px 4px; font-size:0.75rem; overflow:hidden; cursor:pointer; z-index:5; box-shadow:0 1px 2px rgba(0,0,0,0.1); border:1px solid white;">
                        <strong style="color:${col}">${e.title}</strong>
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

        renderMonth: (data) => {
            const grid = document.getElementById('monthGrid');
            if (!grid) return;
            grid.innerHTML = '';

            const d = App.state.agenda.currentWeekStart || new Date();
            const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
            const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            const events = data.filter(e => e.start <= mEnd && e.end >= mStart);

            const lbl = document.getElementById('weekLabel'); // Shared label
            if (lbl && App.state.agenda.viewMode === 'month') {
                lbl.textContent = mStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
            }

            // Grid Setup
            let html = `<div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); grid-auto-rows:minmax(120px, auto); gap:1px; background:#e2e8f0; border:1px solid #e2e8f0;">`;

            // Headers
            const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
            days.forEach(day => html += `<div style="background:#f8fafc; font-weight:bold; text-align:center; padding:4px; font-size:0.8rem; text-transform:uppercase; color:#64748b;">${day}</div>`);

            // Empty slots
            let startDay = mStart.getDay() || 7;
            for (let i = 1; i < startDay; i++) html += `<div style="background:white;"></div>`;

            for (let i = 1; i <= mEnd.getDate(); i++) {
                const current = new Date(d.getFullYear(), d.getMonth(), i);
                const dayEvts = events.filter(e => App.helpers.isSameDay(e.start, current));
                const isToday = App.helpers.isToday(current);

                // Split events
                const allDayEvts = dayEvts.filter(e => e.allDay);
                const timedEvts = dayEvts.filter(e => !e.allDay).sort((a, b) => a.start - b.start);

                html += `<div style="background:white; padding:4px; min-height:100px; display:flex; flex-direction:column; gap:2px; position:relative;">
                    <!-- Date Number -->
                    <div style="text-align:right; font-weight:bold; color:${isToday ? 'white' : 'inherit'}; z-index:2;">
                        <span style="${isToday ? 'background:var(--primary); padding:2px 6px; border-radius:50%; font-size:0.8rem' : ''}">${i}</span>
                    </div>

                    <!-- All Day Section -->
                    <div style="display:flex; flex-direction:column; gap:1px; margin-bottom:2px;">
                        ${allDayEvts.map(e => `
                            <div onclick="App.ui.openDrawerId(${e.rawId})" 
                                style="cursor:pointer; font-size:0.7em; background:#f1f5f9; color:#475569; border-left:3px solid ${App.state.delegationColors[e.delegation]}; padding:1px 2px; white-space:nowrap; overflow:hidden;">
                                ${e.title}
                            </div>
                        `).join('')}
                    </div>

                    <!-- Timed Section (Columns) -->
                    <div style="flex:1; display:flex; flex-direction:row; align-items:stretch; gap:1px;">
                        ${timedEvts.map(e => `
                            <div onclick="App.ui.openDrawerId(${e.rawId})" 
                                 title="${e.title}"
                                 style="flex:1; cursor:pointer; font-size:0.7em; background:${App.state.delegationColors[e.delegation] || '#ccc'}44; color:#1e293b; 
                                 border-radius:2px; border:1px solid ${App.state.delegationColors[e.delegation] || '#ccc'}; 
                                 padding:2px; overflow:hidden; display:flex; flex-direction:column; justify-content:start;">
                                 <strong style="font-size:0.9em; display:block;">${e.start.getHours()}:${e.start.getMinutes().toString().padStart(2, '0')}</strong>
                                 <span style="line-height:1.1; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${e.title}</span>
                            </div>
                        `).join('')}
                    </div>
                 </div>`;
            }
            html += '</div>';
            grid.innerHTML = html;
        },

        renderList: (data) => {
            const c = document.getElementById('listContainer');
            if (!c) return;
            if (data.length === 0) {
                c.innerHTML = '<div style="padding:2rem; text-align:center; color:#94a3b8">No hay eventos para los filtros actuales.</div>';
                return;
            }

            // Sorting
            const sorted = [...data].sort((a, b) => a.start - b.start);

            c.innerHTML = sorted.map(e => {
                const time = e.allDay ? 'Todo el día' : `${e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                return `
                <div class="card" onclick='App.ui.openDrawerId(${e.rawId})' style="margin-bottom:8px; cursor:pointer; border-left:4px solid ${App.state.delegationColors[e.delegation] || '#ccc'}; padding:0.75rem 1rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:var(--primary)">${e.start.getDate()}</strong> <span style="font-size:0.8em; text-transform:uppercase">${e.start.toLocaleDateString('es-ES', { month: 'short' })}</span>
                            <span style="margin:0 8px; color:#ccc">|</span>
                            <span style="font-weight:600">${e.title}</span>
                        </div>
                        <span class="badge" style="font-size:0.8em">${time}</span>
                    </div>
                    <div style="margin-top:4px; font-size:0.85em; color:#64748b; display:flex; gap:12px;">
                        <span>📍 ${e.place}</span>
                        <span>👤 ${e.organizer}</span>
                        <span>${Object.keys(e.services).filter(k => e.services[k]).map(k => k === 'police' ? '👮' : k === 'stage' ? '🎪' : '🎤').join(' ')}</span>
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
            const e = App.state.allEvents.find(x => x.rawId === id);
            App.ui.openDrawer(e);
        },
        openDrawer: (e) => {
            const d = document.getElementById('drawerContent');
            if (!d) return;
            const labels = { police: '👮 Policía', stage: '🎪 Escenario', mega: '🎤 Megafonía' };
            d.innerHTML = `
                 <h2 style="margin-bottom:0.5rem">${e.title}</h2>
                 <div style="display:flex; gap:8px; margin-bottom:1rem">
                    <span class="chip-toggle active">${e.type}</span>
                    <span class="chip-toggle" style="background:${App.state.delegationColors[e.delegation]}33; color:${App.state.delegationColors[e.delegation]}">${e.delegation}</span>
                 </div>
                 <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.9rem">
                     <div>
                        <p class="text-muted">Lugar</p>
                        <p>📍 ${e.place}</p>
                     </div>
                     <div>
                        <p class="text-muted">Horario</p>
                        <p>📅 ${App.helpers.isSameDay(e.start, e.end) ? e.start.toLocaleDateString() : (e.start.toLocaleDateString() + ' - ' + e.end.toLocaleDateString())} <br> ${e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${e.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                     </div>
                     <div>
                        <p class="text-muted">Afluencia</p>
                        <p>👥 ${e.capacity} (Aforo) <br> 🎟️ ${e.participants} (Estimado)</p>
                     </div>
                     <div>
                        <p class="text-muted">Acceso</p>
                        <p>${e.access} (${e.publicType})</p>
                     </div>
                 </div>
                 <hr style="margin:1rem 0; border-top:1px solid #eee">
                 <h3 style="font-size:1rem; margin-bottom:0.5rem">Requerimientos</h3>
                 <div style="display:flex; flex-wrap:wrap; gap:8px;">
                     ${Object.keys(e.services).filter(k => e.services[k]).map(k => `<span class="chip-toggle active">${labels[k] || k}</span>`).join('')}
                     ${e.contracts ? '<span class="chip-toggle active">Contratos</span>' : ''}
                 </div>
                 <hr style="margin:1rem 0; border-top:1px solid #eee">
                 <div style="font-size:0.75rem; color:#94a3b8; background:#f8fafc; padding:8px; border-radius:4px;">
                    <strong>Datos Originales (Debug):</strong><br>
                    Inicio: "${e.debug.d1}" (Hora: "${e.debug.t1}")<br>
                    Fin: "${e.debug.d2}" (Hora: "${e.debug.t2}")
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
