/**
 * transport_pro.js - BVC TranspoConnect PRO Fleet Command & Simulation Engine
 * Features:
 *  - Real-time Satellite Imagery & Uber Dark Mode
 *  - Live GPS & Road Polyline Simulation with Smooth Heading Rotation & Headlights
 *  - Passenger Drop Point Requests & Notifications with Drive Point Tracking
 *  - Missed-Bus Emergency Hop System (Nearby fleet discovery & emergency reservation)
 *  - 2D Bus Cabin Seating Visualizer & Driver Attendance Manifest
 *  - Admin Route Management (Add new routes, Delete dummy/existing buses, Reset demo fleet)
 *  - Web Audio Dispatch Chime for real-time alerts
 */

(function () {
    'use strict';

    // State Variables
    let proMap = null;
    let currentTileLayer = null;
    let busVehicles = {}; // { bus_no: { marker, polyline, busData, animIndex, simTimer } }
    let selectedBusNo = null;
    let fleetData = [];
    let activeRequests = [];
    let manifestData = {}; // { bus_no: [...] }
    let currentTab = 'stops'; // 'stops' | 'cabin' | 'passenger'
    let currentRoleMode = 'student'; // 'student' | 'driver' | 'admin'
    let simSpeedMultiplier = 1;
    let simRunning = true;
    let pollInterval = null;
    let simLoopInterval = null;
    let lastKnownReqCount = 0;

    // Upgraded Driver Trip & Navigation State (Driver Login Only)
    let driverTripActive = false;
    let driverTripStartTime = null;
    let driverTripElapsedSeconds = 0;
    let driverTripTimerInterval = null;
    let driverActiveStopIdx = 0;
    let smartRouteActive = false;
    let smartRoutePolyline = null;

    // Tile Layers (including Google Live Traffic)
    const TILE_LAYERS = {
        satellite: {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            opts: { attribution: '&copy; Esri World Imagery', maxZoom: 19 }
        },
        google_traffic: {
            url: 'https://mt1.google.com/vt/lyrs=m@221097413,traffic&x={x}&y={y}&z={z}',
            opts: { attribution: '&copy; Google Maps Live Traffic', maxZoom: 20 }
        },
        dark: {
            url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            opts: { attribution: '&copy; CartoDB Dark Matter', subdomains: 'abcd', maxZoom: 19 }
        },
        streets: {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            opts: { attribution: '&copy; OpenStreetMap', maxZoom: 19 }
        }
    };

    // Hands-Free Driver Speech Synthesizer
    function speakAnnouncement(text) {
        try {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(text);
                u.rate = 1.0;
                u.pitch = 1.0;
                window.speechSynthesis.speak(u);
            }
        } catch (e) {
            console.warn('Speech synthesis notice:', e);
        }
    }

    // Driver Trip Duration Timer Utilities
    function formatTripDuration(secs) {
        const h = Math.floor(secs / 3600).toString().padStart(2, '0');
        const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function startTripTimer(initialSecs = 0) {
        if (driverTripTimerInterval) clearInterval(driverTripTimerInterval);
        driverTripElapsedSeconds = initialSecs;
        const durEl = document.getElementById('drv-trip-duration');
        if (durEl) durEl.innerText = formatTripDuration(driverTripElapsedSeconds);
        driverTripTimerInterval = setInterval(() => {
            driverTripElapsedSeconds++;
            const el = document.getElementById('drv-trip-duration');
            if (el) el.innerText = formatTripDuration(driverTripElapsedSeconds);
        }, 1000);
    }

    function stopTripTimer() {
        if (driverTripTimerInterval) {
            clearInterval(driverTripTimerInterval);
            driverTripTimerInterval = null;
        }
    }

    function setTripBadgeState(state, customText) {
        const badge = document.getElementById('drv-trip-badge');
        const textEl = document.getElementById('drv-trip-badge-text');
        const startBtn = document.getElementById('btn-drv-start-trip');
        const startText = document.getElementById('btn-start-trip-text');
        if (!badge) return;

        badge.className = `tpro-trip-badge ${state}`;
        if (state === 'active') {
            if (textEl) textEl.innerText = customText || 'TRIP ACTIVE: LIVE ON ROAD';
            if (startBtn) startBtn.classList.add('active-trip');
            if (startText) startText.innerText = 'TRIP IN PROGRESS';
        } else if (state === 'paused') {
            if (textEl) textEl.innerText = customText || 'TRIP PAUSED (DEPOT / HALT)';
            if (startBtn) startBtn.classList.remove('active-trip');
            if (startText) startText.innerText = 'RESUME TRIP';
        } else if (state === 'emergency') {
            if (textEl) textEl.innerText = customText || '🚨 EMERGENCY SOS ACTIVE';
        } else {
            if (textEl) textEl.innerText = customText || 'TRIP STANDBY • READY TO DEPART';
            if (startBtn) startBtn.classList.remove('active-trip');
            if (startText) startText.innerText = 'START TRIP';
        }
    }

    // Synthesized Web Audio Dispatch Chime
    function playDispatchChime(isEmergency) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const now = ctx.currentTime;
            
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            if (isEmergency) {
                // High-priority urgent warble
                osc1.type = 'sawtooth';
                osc1.frequency.setValueAtTime(880, now);
                osc1.frequency.exponentialRampToValueAtTime(440, now + 0.15);
                osc1.frequency.exponentialRampToValueAtTime(880, now + 0.3);

                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

                osc1.start(now);
                osc1.stop(now + 0.5);
            } else {
                // Smooth professional Uber/Rapido dispatch double-chime
                osc1.type = 'sine';
                osc2.type = 'triangle';
                osc1.frequency.setValueAtTime(587.33, now); // D5
                osc1.frequency.setValueAtTime(880, now + 0.12); // A5

                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

                osc1.start(now);
                osc1.stop(now + 0.4);
            }
        } catch (e) {
            // Audio context blocked or unsupported
        }
    }

    // Helper: Safe Token & Auth headers
    function getAuthHeaders() {
        const h = { 'Content-Type': 'application/json' };
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.token) {
            h['X-Auth-Token'] = currentUser.token;
        } else {
            const tok = localStorage.getItem('token');
            if (tok) h['X-Auth-Token'] = tok;
        }
        return h;
    }

    // Initialize Map with Satellite as default for high-impact visual
    function initProMap() {
        const container = document.getElementById('bus-map');
        if (!container) return;
        if (proMap) {
            setTimeout(() => { try { proMap.invalidateSize(); } catch (e) {} }, 100);
            return;
        }

        // Defensive cleanup if another script touched the container
        if (container._leaflet_id) {
            try {
                if (window.busMap && typeof window.busMap.remove === 'function') {
                    window.busMap.remove();
                    window.busMap = null;
                }
            } catch (e) {
                console.warn('Map cleanup notice:', e);
            }
            container._leaflet_id = null;
        }

        proMap = L.map('bus-map', {
            zoomControl: false,
            attributionControl: false
        }).setView([16.5520, 81.9830], 12);
        window.busMap = proMap;

        L.control.zoom({ position: 'bottomright' }).addTo(proMap);

        // Set initial Satellite Tile Layer
        setMapLayer('satellite');

        // Odalarevu Campus Terminal Icon
        const campusIcon = L.divIcon({
            html: '<div style="font-size:26px;filter:drop-shadow(0 0 10px #ffd400);">🎓</div><div style="background:#111;color:#ffd400;font-size:10px;font-weight:800;padding:2px 6px;border-radius:10px;border:1px solid #ffd400;white-space:nowrap;margin-top:2px;">BVC CAMPUS</div>',
            className: 'tpro-campus-marker',
            iconSize: [40, 45],
            iconAnchor: [20, 20]
        });
        L.marker([16.5200, 82.0010], { icon: campusIcon })
            .addTo(proMap)
            .bindPopup('<b>BVC Engineering College, Odalarevu</b><br>Central Transit Terminal');

        setTimeout(() => { proMap.invalidateSize(); }, 350);
    }

    function setMapLayer(type) {
        if (!proMap) return;
        const config = TILE_LAYERS[type] || TILE_LAYERS.satellite;
        if (currentTileLayer) {
            proMap.removeLayer(currentTileLayer);
        }
        currentTileLayer = L.tileLayer(config.url, config.opts).addTo(proMap);

        document.querySelectorAll('.tpro-layer-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.layer === type);
        });
    }

    // Fetch details & sync UI
    async function fetchFleetDetails() {
        try {
            const res = await fetch('/api/bus/details', { headers: getAuthHeaders() });
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                fleetData = json.data;
                renderFleetStats();
                renderFleetSelector();
                renderAdminFleetChips();
                syncBusMarkers();
                
                // Select first bus if none selected
                if (!selectedBusNo && fleetData.length > 0) {
                    selectProBus(fleetData[0].bus_no);
                } else if (selectedBusNo) {
                    const current = fleetData.find(b => b.bus_no === selectedBusNo);
                    if (current) updateTelemetryHUD(current);
                }
            }
        } catch (e) {
            console.warn('Transport details load notice:', e);
        }
    }

    // Fetch Passenger Requests
    async function fetchActiveRequests() {
        try {
            const res = await fetch('/api/bus/requests', { headers: getAuthHeaders() });
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                activeRequests = json.data;
                
                // Audio chime if new request arrived
                if (activeRequests.length > lastKnownReqCount && lastKnownReqCount !== 0) {
                    const hasEmer = activeRequests.some(r => r.request_type === 'EMERGENCY_MISSED' && r.status === 'PENDING');
                    playDispatchChime(hasEmer);
                    if (typeof showToast === 'function') {
                        showToast(hasEmer ? '🚨 Urgent Emergency Missed-Bus Request Received!' : '🔔 New Drop/Pickup Passenger Request Received!');
                    }
                }
                lastKnownReqCount = activeRequests.length;

                renderDriverRequestStream();
                syncRequestMarkers();
            }
        } catch (e) {
            console.warn('Active requests fetch notice:', e);
        }
    }

    // Render Stats
    function renderFleetStats() {
        const active = fleetData.filter(b => b.status === 'ACTIVE').length;
        const stopped = fleetData.filter(b => b.status !== 'ACTIVE').length;
        const totalSeats = fleetData.reduce((acc, b) => acc + (b.total_seats || 50), 0);
        const filledSeats = fleetData.reduce((acc, b) => acc + (b.filled_seats || 0), 0);
        const pendRequests = activeRequests.filter(r => r.status === 'PENDING').length;

        const elAct = document.getElementById('tpro-stat-active');
        if (elAct) elAct.innerText = active;
        const elStop = document.getElementById('tpro-stat-stopped');
        if (elStop) elStop.innerText = stopped;
        const elOcc = document.getElementById('tpro-stat-occupancy');
        if (elOcc) elOcc.innerText = `${filledSeats}/${totalSeats}`;
        const elReq = document.getElementById('tpro-stat-requests');
        if (elReq) elReq.innerText = pendRequests;
    }

    // Render Selector
    function renderFleetSelector() {
        const sel = document.getElementById('tpro-bus-select');
        if (!sel) return;
        const prev = sel.value || selectedBusNo;
        sel.innerHTML = fleetData.map(b => {
            const isSel = b.bus_no === prev ? 'selected' : '';
            return `<option value="${b.bus_no}" ${isSel}>🚌 ${b.bus_no} [${b.filled_seats || 0}/${b.total_seats || 50} seats] - ${b.route.split('->')[0] || b.route}</option>`;
        }).join('');
    }

    // Render Admin Fleet Chips
    function renderAdminFleetChips() {
        const container = document.getElementById('tpro-fleet-chips');
        if (!container) return;
        container.innerHTML = fleetData.map(b => {
            const isSel = b.bus_no === selectedBusNo ? 'selected' : '';
            return `
                <div class="tpro-fleet-chip ${isSel}" onclick="window.BVC_TRANS.selectBus('${b.bus_no}')">
                    <div>
                        <div style="font-weight:800; font-size:13px; color:#ffd400;">🚌 ${b.bus_no}</div>
                        <div style="font-size:11px; color:rgba(255,255,255,0.7);">${b.driver_name} • ${b.filled_seats}/${b.total_seats}</div>
                    </div>
                    <button class="tpro-chip-delete-btn" title="Delete Bus ${b.bus_no}" onclick="event.stopPropagation(); window.BVC_TRANS.confirmDeleteBus('${b.bus_no}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }).join('') + `
            <button class="tpro-nav-btn" style="flex-shrink:0; background:rgba(67,233,123,0.2); border-color:#43e97b; color:#43e97b;" onclick="window.BVC_TRANS.openAddBusModal()">
                <i class="fas fa-plus-circle"></i> Add Route
            </button>
            <button class="tpro-nav-btn" style="flex-shrink:0; background:rgba(255,212,0,0.15); border-color:#ffd400; color:#ffd400;" onclick="window.BVC_TRANS.resetDemoFleet()">
                <i class="fas fa-sync-alt"></i> Reset Fleet
            </button>
        `;
    }

    // Select a Bus
    function selectProBus(busNo) {
        selectedBusNo = busNo;
        const b = fleetData.find(x => x.bus_no === busNo);
        if (!b) return;

        // Highlight selector
        const sel = document.getElementById('tpro-bus-select');
        if (sel) sel.value = busNo;

        // Update telemetry & HUD
        updateTelemetryHUD(b);
        renderTimelineStops(b);
        renderBusCabin(b);

        // Center Map on Bus or Origin
        if (proMap) {
            if (busVehicles[busNo] && busVehicles[busNo].marker) {
                proMap.setView(busVehicles[busNo].marker.getLatLng(), 14);
            } else if (b.latitude && b.longitude) {
                proMap.setView([b.latitude, b.longitude], 13);
            } else if (b.stops_data && b.stops_data.length > 0) {
                proMap.setView([b.stops_data[0].lat, b.stops_data[0].lng], 13);
            }
        }

        renderAdminFleetChips();
        fetchManifestForBus(busNo);
    }

    // Telemetry HUD updates with dynamic remaining ETA tracking
    function updateTelemetryHUD(b) {
        const spd = document.getElementById('tpro-hud-speed');
        if (spd) spd.innerText = b.speed || (b.status === 'ACTIVE' ? 45 : 0);

        const nextStopEl = document.getElementById('tpro-hud-next-stop-name');
        const nextMetaEl = document.getElementById('tpro-hud-next-stop-meta');

        const isAmalapuramRoute = (b.bus_no === 'BUS-02' || (b.route && b.route.toLowerCase().includes('amalapuram')));
        const totalDuration = isAmalapuramRoute ? 29 : (b.total_duration_mins || 45);
        const distKm = isAmalapuramRoute ? 21.5 : (b.total_distance_km || 35.0);

        const v = busVehicles[b.bus_no];
        let remainingMins = totalDuration;
        let nextStopName = 'BVC Odalarevu Campus';

        if (v && v.coords && v.coords.length > 1) {
            const ratio = v.waypointIndex / (v.coords.length - 1);
            remainingMins = Math.max(1, Math.round(totalDuration * (1 - ratio)));

            if (v.stops && v.stops.length > 0) {
                const stopIdx = Math.min(Math.floor(ratio * v.stops.length) + 1, v.stops.length - 1);
                nextStopName = v.stops[stopIdx].name;
            }
        } else if (b.stops_data && b.stops_data.length > 1) {
            nextStopName = b.stops_data[1].name;
            remainingMins = totalDuration;
        }

        if (nextStopEl) nextStopEl.innerText = nextStopName;
        if (nextMetaEl) {
            if (isAmalapuramRoute) {
                nextMetaEl.innerText = `Campus ETA: ${remainingMins} mins (Trip: 29 mins • 21.5 km) • ${b.filled_seats}/${b.total_seats} Boarded`;
            } else {
                nextMetaEl.innerText = `Campus ETA: ${remainingMins} mins (Trip: ${Math.round(totalDuration)} mins • ${distKm} km) • ${b.filled_seats}/${b.total_seats} Boarded`;
            }
        }

        const badge = document.getElementById('bus-status-badge');
        if (badge) {
            badge.innerText = `🚌 ${b.bus_no} [${b.status}] • ${b.data_source || 'SIMULATED GPS'}`;
            badge.style.color = b.status === 'ACTIVE' ? '#43e97b' : (b.status === 'EMERGENCY' ? '#ff4757' : '#ffd400');
        }

        const drvBusTag = document.getElementById('drv-cockpit-busno');
        if (drvBusTag) drvBusTag.innerText = b.bus_no;
        const drvStat = document.getElementById('drv-cockpit-status');
        if (drvStat) drvStat.innerText = b.status;

        // Driver Cockpit Telemetry Strip Updates (Driver View Only)
        const curSpd = b.speed || (b.status === 'ACTIVE' ? 45 : 0);
        const teleSpd = document.getElementById('drv-telemetry-speed');
        if (teleSpd) teleSpd.innerText = curSpd;

        const nextStopData = (b.stops_data || []).find(s => s.name && s.name.toLowerCase() === nextStopName.toLowerCase());
        const nextReqCount = nextStopData ? (nextStopData.request_count || 0) : 0;

        const teleNext = document.getElementById('drv-telemetry-next-stop');
        if (teleNext) teleNext.innerText = `${nextStopName} (${nextReqCount > 0 ? nextReqCount + ' waiting' : 'Scheduled'})`;

        const telePass = document.getElementById('drv-telemetry-passengers');
        if (telePass) telePass.innerText = `${b.filled_seats || 0} / ${b.total_seats || 50}`;

        const teleFree = document.getElementById('drv-telemetry-free');
        if (teleFree) teleFree.innerText = `(${b.free_seats !== undefined ? b.free_seats : Math.max(0, (b.total_seats || 50) - (b.filled_seats || 0))} Free)`;

        const remKm = v && v.coords && v.coords.length > 1
            ? Math.max(0.5, (distKm * (1 - (v.waypointIndex / (v.coords.length - 1))))).toFixed(1)
            : distKm;
        const teleDist = document.getElementById('drv-telemetry-dist-rem');
        if (teleDist) teleDist.innerText = remKm;

        // Turn-by-Turn Guidance HUD updates on Map
        const turnInstr = document.getElementById('tpro-turn-instruction');
        if (turnInstr && (!smartRouteActive || !turnInstr.innerText.includes('Smart Bypass'))) {
            turnInstr.innerText = `In 250m: Keep Left on NH216 towards ${nextStopName}`;
        }
        const turnNext = document.getElementById('tpro-turn-next-name');
        if (turnNext) turnNext.innerText = nextStopName;
        const turnReq = document.getElementById('tpro-turn-req-badge');
        if (turnReq) {
            turnReq.innerText = nextReqCount > 0 ? `${nextReqCount} Students Requesting Stop` : 'Regular Scheduled Stop';
            turnReq.style.color = nextReqCount > 0 ? '#ffd400' : '#43e97b';
        }

        if (currentRoleMode === 'driver') {
            renderDriverStopsMatrix(b);
        }

        // Update real-time passenger broadcast card (visible to all students, passengers, and admins)
        updatePassengerBroadcastCard(b);
    }

    // Generate Animated Road Simulation for a Bus strictly along REAL ROADWAY
    function syncBusMarkers() {
        if (!proMap) return;

        fleetData.forEach(b => {
            const bno = b.bus_no;
            const stops = b.stops_data && b.stops_data.length > 0 ? b.stops_data : [
                { name: 'Origin', lat: b.latitude || 16.5787, lng: b.longitude || 82.0061 },
                { name: 'Campus', lat: 16.5200, lng: 82.0010 }
            ];

            // Real roadway coordinates from OSRM (high-density road-following vertices)
            const roadCoords = (b.route_coords && b.route_coords.length > 1) 
                ? b.route_coords 
                : stops.map(s => [s.lat, s.lng]);

            if (!busVehicles[bno]) {
                // Create neon route polyline strictly following the real road curves
                const polyline = L.polyline(roadCoords, {
                    color: bno === 'BUS-01' ? '#ffd400' : (bno === 'BUS-02' ? '#38bdf8' : (bno === 'BUS-03' ? '#43e97b' : (bno === 'BUS-04' ? '#ff6b6b' : '#a855f7'))),
                    weight: 5,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round'
                }).addTo(proMap);

                // Create vehicle icon
                const vIcon = L.divIcon({
                    html: `
                        <div class="tpro-bus-marker-icon" id="marker-bus-${bno}">
                            <div class="tpro-pulse-ring"></div>
                            <div class="tpro-bus-pin">🚌</div>
                        </div>
                    `,
                    className: 'tpro-marker-wrapper',
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });

                const startPos = roadCoords[0];
                const marker = L.marker(startPos, { icon: vIcon }).addTo(proMap);
                marker.bindPopup(`
                    <div style="color:#111; font-family:sans-serif;">
                        <h4 style="margin:0 0 4px 0; color:#1e293b;">🚌 ${bno}</h4>
                        <b>Route:</b> ${b.route}<br>
                        <b>Driver:</b> ${b.driver_name} (${b.driver_phone || 'N/A'})<br>
                        <b>Seats:</b> ${b.filled_seats}/${b.total_seats} (${b.free_seats} Free)<br>
                        <b>Status:</b> <span style="font-weight:700; color:${b.status === 'ACTIVE' ? 'green' : 'orange'}">${b.status}</span>
                    </div>
                `);

                busVehicles[bno] = {
                    marker: marker,
                    polyline: polyline,
                    busData: b,
                    waypointIndex: 0,
                    progress: 0,
                    coords: roadCoords,
                    stops: stops
                };

                // Add scheduled REGULAR college stops and requested stops along route
                stops.forEach((s, i) => {
                    if (i === stops.length - 1) return; // skip campus terminal (already added)
                    const reqCount = s.request_count || 0;
                    const isDriver = (currentRoleMode === 'driver' || currentRoleMode === 'admin');
                    const reqTag = isDriver
                        ? (reqCount > 0 ? `<span class="tpro-stop-req-tag ${s.request_breakdown && s.request_breakdown.emergency ? 'urgent' : ''}">🙋 ${reqCount} req</span>` : `<span class="tpro-stop-req-tag" style="background:#0284c7;color:#fff;">Regular</span>`)
                        : '';
                    const stopIcon = L.divIcon({
                        html: `<div class="tpro-stop-pin">🚏 ${s.name} ${reqTag} <span style="color:#ffd400; font-size:10px;">(${s.time || ''})</span></div>`,
                        className: 'tpro-stop-wrapper',
                        iconAnchor: [10, 10]
                    });
                    L.marker([s.lat, s.lng], { icon: stopIcon })
                        .addTo(proMap)
                        .bindPopup(`
                            <div style="color:#111; min-width:210px;">
                                <b style="font-size:13px; color:#1e293b;">🚏 ${s.is_regular === false ? 'Requested Stop Point' : 'Regular Scheduled Stop'}</b><br>
                                <span style="font-size:13px; font-weight:700;">${s.name}</span><br>
                                Scheduled Time: <b>${s.time || '08:00 AM'}</b><br>
                                Regular Boarding: <b>${s.boarding || 0}</b> | Drop: <b>${s.drop || 0}</b><br>
                                ${reqCount > 0 ? `
                                    <div style="background:#fef3c7; border:1px solid #f59e0b; padding:6px 8px; border-radius:6px; margin:6px 0; font-size:11px;">
                                        <b style="color:#b45309;"><i class="fas fa-bell"></i> ${reqCount} Student Request(s):</b><br>
                                        ${(s.requests || []).map(r => `• <b>${r.student_name}</b> (${r.request_type}): <i>${r.notes || 'No note'}</i>`).join('<br>')}
                                    </div>
                                ` : '<div style="font-size:11px; color:#64748b; margin:4px 0;">Regular scheduled pass-through stop.</div>'}
                                <div style="display:flex; gap:6px; margin-top:8px;">
                                    <button style="flex:1; background:#4285f4; color:#fff; border:none; padding:5px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;" onclick="window.BVC_TRANS.openGoogleMapsForStop(${s.lat}, ${s.lng}, '${(s.name || '').replace(/'/g, "\\'")}')">
                                        🗺️ Google Nav
                                    </button>
                                    <button style="flex:1; background:#33ccff; color:#111; border:none; padding:5px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;" onclick="window.BVC_TRANS.openWazeForStop(${s.lat}, ${s.lng})">
                                        🚗 Waze
                                    </button>
                                </div>
                            </div>
                        `);
                });
            } else {
                // Update vehicle data reference and polyline with real road coordinates
                busVehicles[bno].busData = b;
                busVehicles[bno].coords = roadCoords;
                busVehicles[bno].stops = stops;
                if (busVehicles[bno].polyline) {
                    busVehicles[bno].polyline.setLatLngs(roadCoords);
                }
            }
        });

        // Filter request markers based on role
        syncRequestMarkers();
    }

    // Smooth Real-Roadway Simulation Engine
    function runSimulationStep() {
        if (!simRunning) return;

        Object.keys(busVehicles).forEach(bno => {
            const v = busVehicles[bno];
            if (!v || !v.coords || v.coords.length < 2) return;
            if (v.busData.status !== 'ACTIVE') return; // only animate active buses

            // Advance along real road vertices (~20-50m per vertex)
            // Lively energetic road speed (responsive, not slow or sleepy!)
            const stepSpeed = 0.65 * simSpeedMultiplier;
            v.progress += stepSpeed;

            while (v.progress >= 1.0) {
                v.progress -= 1.0;
                v.waypointIndex++;
                if (v.waypointIndex >= v.coords.length - 1) {
                    v.waypointIndex = 0; // seamlessly loop route
                }
            }

            const p1 = v.coords[v.waypointIndex];
            const p2 = v.coords[Math.min(v.waypointIndex + 1, v.coords.length - 1)];

            // Accurate roadway position interpolation
            const curLat = p1[0] + (p2[0] - p1[0]) * v.progress;
            const curLng = p1[1] + (p2[1] - p1[1]) * v.progress;

            v.marker.setLatLng([curLat, curLng]);

            // Calculate exact roadway forward heading angle
            const dLat = p2[0] - p1[0];
            const dLng = p2[1] - p1[1];
            if (Math.abs(dLat) > 0.0000001 || Math.abs(dLng) > 0.0000001) {
                const angle = Math.atan2(dLng, dLat) * 180 / Math.PI;
                const pinEl = document.getElementById(`marker-bus-${bno}`);
                if (pinEl) {
                    pinEl.style.transform = `rotate(${angle}deg)`;
                }
            }

            // Real-time speedometer HUD & dynamic live ETA countdown
            if (bno === selectedBusNo) {
                const spdEl = document.getElementById('tpro-hud-speed');
                if (spdEl) {
                    const jitter = Math.sin(Date.now() / 600) * 3;
                    const spd = Math.max(35, Math.round((v.busData.speed || 45) + jitter));
                    spdEl.innerText = spd;
                }
                updateTelemetryHUD(v.busData);
            }
        });
    }

    // Sync Passenger Raised Request Markers on Map (DRIVER ONLY)
    let requestMarkers = [];
    function syncRequestMarkers() {
        if (!proMap) return;
        requestMarkers.forEach(m => proMap.removeLayer(m));
        requestMarkers = [];

        // USER REQUIREMENT:
        // "The razor requests must be seen by driver only only the regular stops only seen by the passengers"
        const isDriver = (currentRoleMode === 'driver' || currentRoleMode === 'admin');
        if (!isDriver) {
            return; // Passengers ONLY see regular scheduled stops!
        }

        activeRequests.forEach(req => {
            if (req.status === 'COMPLETED' || req.status === 'DECLINED') return;
            const lat = req.lat || 16.5520;
            const lng = req.lng || 81.9830;

            let iconHtml = '';
            if (req.request_type === 'EMERGENCY_MISSED') {
                iconHtml = `<div class="tpro-emergency-pin">🚨 EMERGENCY HOP: ${req.student_name} (${req.stop_name})</div>`;
            } else if (req.request_type === 'DROP') {
                iconHtml = `<div class="tpro-drop-pin">📍 DROP POINT: ${req.student_name} (${req.stop_name})</div>`;
            } else {
                iconHtml = `<div class="tpro-stop-pin" style="background:#0284c7; border-color:#fff;">🙋‍♂️ PICKUP: ${req.student_name} (${req.stop_name})</div>`;
            }

            const rIcon = L.divIcon({
                html: iconHtml,
                className: 'tpro-req-marker',
                iconAnchor: [15, 15]
            });

            const m = L.marker([lat, lng], { icon: rIcon }).addTo(proMap);
            m.bindPopup(`
                <div style="color:#111;">
                    <h4 style="margin:0 0 4px 0; color:#b91c1c;">${req.request_type}</h4>
                    <b>Passenger:</b> ${req.student_name} (${req.student_reg})<br>
                    <b>Phone:</b> <a href="tel:${req.phone}">${req.phone}</a><br>
                    <b>Requested Drop/Pickup:</b> ${req.stop_name}<br>
                    <b>Notes:</b> ${req.notes || 'None'}<br>
                    <b>Status:</b> ${req.status}
                </div>
            `);
            requestMarkers.push(m);
        });
    }

    // Render Driver Request Stream
    function renderDriverRequestStream() {
        const container = document.getElementById('tpro-requests-stream');
        if (!container) return;

        if (activeRequests.length === 0) {
            container.innerHTML = `
                <div style="padding:15px; color:rgba(255,255,255,0.6); font-size:12px; text-align:center; width:100%;">
                    <i class="fas fa-check-circle" style="color:#10b981; font-size:16px;"></i> All passenger drop & pickup requests are cleared.
                </div>
            `;
            return;
        }

        container.innerHTML = activeRequests.map(r => {
            const isDrop = r.request_type === 'DROP';
            const isEmer = r.request_type === 'EMERGENCY_MISSED';
            const cardClass = isEmer ? 'emergency-req' : (isDrop ? 'drop-req' : 'pickup-req');
            const badgeClass = isEmer ? 'badge-emer' : (isDrop ? 'badge-drop' : 'badge-pick');
            const badgeLabel = isEmer ? '🚨 EMERGENCY MISSED-BUS' : (isDrop ? '📍 DROP REQUEST' : '🙋‍♂️ PICKUP REQUEST');

            return `
                <div class="tpro-request-card ${cardClass}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="tpro-req-badge ${badgeClass}">${badgeLabel}</span>
                        <span style="font-size:10px; color:rgba(255,255,255,0.6);">${r.request_time ? r.request_time.split(' ')[1] : 'Just now'}</span>
                    </div>
                    <div class="tpro-req-student">${r.student_name || 'Student'} (${r.student_reg})</div>
                    <div class="tpro-req-stop"><b>Target Stop:</b> ${r.stop_name}</div>
                    ${r.notes ? `<div class="tpro-req-notes">"${r.notes}"</div>` : ''}
                    <div style="font-size:11px; color:#ffd400;">Assigned Bus: <b>${r.bus_no}</b> • Status: <b>${r.status}</b></div>
                    <div class="tpro-req-actions">
                        ${r.status === 'PENDING' ? `
                            <button class="tpro-btn-sm tpro-btn-accept" onclick="window.BVC_TRANS.updateRequestStatus(${r.id}, 'ACCEPTED')">
                                <i class="fas fa-check"></i> Accept
                            </button>
                        ` : ''}
                        ${r.status === 'ACCEPTED' ? `
                            <button class="tpro-btn-sm tpro-btn-arrive" onclick="window.BVC_TRANS.updateRequestStatus(${r.id}, 'ARRIVED')">
                                <i class="fas fa-map-pin"></i> Reached Stop
                            </button>
                        ` : ''}
                        <button class="tpro-btn-sm tpro-btn-complete" onclick="window.BVC_TRANS.updateRequestStatus(${r.id}, 'COMPLETED')">
                            <i class="fas fa-user-check"></i> Complete
                        </button>
                        <button class="tpro-btn-sm tpro-btn-decline" onclick="window.BVC_TRANS.updateRequestStatus(${r.id}, 'DECLINED')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render Timeline Stops
    function renderTimelineStops(b) {
        const container = document.getElementById('tpro-timeline-container');
        if (!container) return;

        const stops = b.stops_data && b.stops_data.length > 0 ? b.stops_data : [
            { name: b.route.split('->')[0] || 'Origin', boarding: 15, drop: 0, time: '07:45 AM' },
            { name: 'Midway Junction', boarding: 8, drop: 1, time: '08:20 AM' },
            { name: 'BVC Odalarevu Campus', boarding: 0, drop: 23, time: '09:00 AM' }
        ];

        container.innerHTML = stops.map((s, idx) => {
            const isCompleted = idx === 0;
            const isCurrent = idx === 1;
            const stateClass = isCompleted ? 'completed' : (isCurrent ? 'current' : '');

            return `
                <div class="tpro-stop-item ${stateClass}">
                    <div class="tpro-stop-dot"></div>
                    <div class="tpro-stop-name">
                        <span>${s.name}</span>
                        <span style="color:#ffd400; font-size:11px;">${s.time || '08:00 AM'}</span>
                    </div>
                    <div class="tpro-stop-meta">
                        <span><i class="fas fa-user-plus" style="color:#10b981;"></i> ${s.boarding || 0} Boarding</span>
                        <span><i class="fas fa-user-minus" style="color:#f97316;"></i> ${s.drop || 0} Drop</span>
                        ${idx === stops.length - 1 ? '<span style="color:#ffd400; font-weight:700;">★ College Terminal</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Fetch Manifest for Bus
    async function fetchManifestForBus(busNo) {
        try {
            const res = await fetch(`/api/bus/manifest/${busNo}`, { headers: getAuthHeaders() });
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                manifestData[busNo] = json.data;
                const b = fleetData.find(x => x.bus_no === busNo);
                if (b) renderBusCabin(b);
            }
        } catch (e) {
            console.warn('Manifest load notice:', e);
        }
    }

    // Render 2D Bus Interior Cabin
    function renderBusCabin(b) {
        const container = document.getElementById('tpro-cabin-grid');
        if (!container) return;

        const totalSeats = b.total_seats || 50;
        const manifest = manifestData[b.bus_no] || [];

        // Build seat map from manifest
        const seatMap = {};
        manifest.forEach(p => {
            if (p.seat_no) seatMap[p.seat_no] = p;
        });

        let seatsHtml = '';
        for (let sno = 1; sno <= totalSeats; sno++) {
            const p = seatMap[sno];
            let seatClass = 'empty';
            let title = `Seat #${sno}: Available Vacant Slot`;

            if (p) {
                if (p.status === 'BOARDED') {
                    seatClass = 'occupied';
                    title = `Seat #${sno}: ${p.student_name} (${p.student_reg}) - BOARDED at ${p.stop_name}`;
                } else if (p.status === 'EXPECTED') {
                    seatClass = 'reserved';
                    title = `Seat #${sno}: ${p.student_name} (${p.student_reg}) - Reserved at ${p.stop_name}`;
                } else if (p.status === 'EMERGENCY') {
                    seatClass = 'emergency-seat';
                    title = `Seat #${sno}: 🚨 EMERGENCY HOP - ${p.student_name} (${p.student_reg})`;
                }
            }

            seatsHtml += `
                <div class="tpro-seat ${seatClass}" title="${title}" onclick="window.BVC_TRANS.onSeatClick('${b.bus_no}', ${sno})">
                    ${sno}
                </div>
            `;
        }
        container.innerHTML = seatsHtml;

        // Render Roster Checklist for Driver
        const rosterContainer = document.getElementById('tpro-driver-manifest-roster');
        if (rosterContainer) {
            if (manifest.length === 0) {
                rosterContainer.innerHTML = '<div style="font-size:12px; color:rgba(255,255,255,0.6); padding:10px;">No passengers mapped to this route.</div>';
            } else {
                rosterContainer.innerHTML = manifest.slice(0, 15).map(p => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:6px 10px; border-radius:8px; font-size:12px;">
                        <div>
                            <b>Seat #${p.seat_no || '--'}: ${p.student_name}</b> <small style="color:rgba(255,255,255,0.6);">(${p.student_reg})</small>
                            <div style="font-size:10px; color:#38bdf8;">Stop: ${p.stop_name}</div>
                        </div>
                        <div style="display:flex; gap:4px;">
                            <button class="tpro-btn-sm ${p.status === 'BOARDED' ? 'tpro-btn-accept' : 'tpro-btn-decline'}" style="padding:3px 8px;" onclick="window.BVC_TRANS.togglePassengerAttendance('${b.bus_no}', '${p.student_reg}', '${p.status === 'BOARDED' ? 'EXPECTED' : 'BOARDED'}')">
                                ${p.status === 'BOARDED' ? '✓ In Bus' : 'Board'}
                            </button>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    // Modal Helpers
    function openModal(html) {
        let m = document.getElementById('tpro-dynamic-modal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'tpro-dynamic-modal';
            m.className = 'tpro-modal-overlay';
            document.body.appendChild(m);
        }
        m.innerHTML = `<div class="tpro-modal-card">${html}</div>`;
        m.classList.remove('hidden');
    }

    function closeModal() {
        const m = document.getElementById('tpro-dynamic-modal');
        if (m) m.classList.add('hidden');
    }

    // Helper: Safely get logged-in user profile from memory or localStorage
    function getActiveUser() {
        if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
        try {
            const raw = localStorage.getItem('bvc_user');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return null;
    }

    // Render Driver Route Stops Matrix with Regular vs Requested Stops & Request Counters
    function renderDriverStopsMatrix(b) {
        const container = document.getElementById('tpro-stops-matrix-list');
        if (!container) return;
        const targetBus = b || fleetData.find(x => x.bus_no === selectedBusNo) || fleetData[0];
        if (!targetBus || !targetBus.stops_data || targetBus.stops_data.length === 0) {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.6); font-size:12px; padding:10px;">No stop data available for this route.</div>';
            return;
        }

        const stops = targetBus.stops_data;
        container.innerHTML = stops.map((s, idx) => {
            const isRegular = s.is_regular !== false;
            const reqCount = s.request_count || 0;
            const hasUrgent = s.request_breakdown && s.request_breakdown.emergency > 0;
            const isCurrent = (idx === driverActiveStopIdx);
            const isPassed = (idx < driverActiveStopIdx);

            let rowClass = 'tpro-matrix-row';
            if (isCurrent) rowClass += ' current-stop';
            if (reqCount > 0) rowClass += ' has-requests';

            let reqBadgeHtml = '';
            if (reqCount > 0) {
                const urgentClass = hasUrgent ? 'urgent' : 'active';
                reqBadgeHtml = `
                    <span class="tpro-matrix-req-badge ${urgentClass}" style="cursor:pointer;" onclick="window.BVC_TRANS.viewStopRequestsModal('${(s.name || '').replace(/'/g, "\\'")}')" title="Click to view requesting students">
                        <i class="fas fa-users"></i> ${reqCount} Request${reqCount > 1 ? 's' : ''} ${hasUrgent ? '🚨 SOS' : ''} <i class="fas fa-chevron-right" style="font-size:9px;"></i>
                    </span>
                `;
            } else {
                reqBadgeHtml = `<span class="tpro-matrix-req-badge zero"><i class="fas fa-check"></i> 0 Requests</span>`;
            }

            const typeBadgeHtml = isRegular
                ? '<span class="badge-regular-stop">🚏 Scheduled Regular Stop</span>'
                : '<span class="badge-requested-stop">📍 Requested Stop Point</span>';

            let actionHtml = '';
            if (isPassed) {
                actionHtml = `<span class="tpro-stop-done-badge"><i class="fas fa-check-circle"></i> Passed</span>`;
            } else if (isCurrent) {
                actionHtml = `
                    <button class="tpro-btn-matrix-arrive" onclick="window.BVC_TRANS.markStopReached('${(s.name || '').replace(/'/g, "\\'")}', ${idx})" title="Confirm bus arrived at this stop">
                        <i class="fas fa-map-pin"></i> Reached Stop
                    </button>
                `;
            } else {
                actionHtml = `
                    <button class="tpro-btn-matrix-arrive" style="background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.8); border-color:rgba(255,255,255,0.15);" onclick="window.BVC_TRANS.markStopReached('${(s.name || '').replace(/'/g, "\\'")}', ${idx})" title="Advance to this stop">
                        <i class="fas fa-arrow-right"></i> Arrive
                    </button>
                `;
            }

            return `
                <div class="${rowClass}">
                    <div class="tpro-matrix-stop-info" style="flex:1;">
                        <div class="tpro-matrix-stop-order">${idx + 1}</div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <b style="font-size:13px; color:#fff;">${s.name}</b>
                                ${typeBadgeHtml}
                                ${reqBadgeHtml}
                            </div>
                            <div style="font-size:11px; color:rgba(255,255,255,0.65); margin-top:3px; display:flex; align-items:center; gap:10px;">
                                <span><i class="far fa-clock" style="color:#ffd400;"></i> Scheduled: <b>${s.time || '08:00 AM'}</b></span>
                                <span>•</span>
                                <span>Regular: <span style="color:#43e97b;">+${s.boarding || 0} Board</span> | <span style="color:#f97316;">-${s.drop || 0} Drop</span></span>
                            </div>
                        </div>
                    </div>
                    <div class="tpro-matrix-actions">
                        <button class="tpro-btn-matrix-nav" onclick="window.BVC_TRANS.openGoogleMapsForStop(${s.lat}, ${s.lng}, '${(s.name || '').replace(/'/g, "\\'")}')" title="Google Maps Navigation to ${s.name}">
                            <i class="fab fa-google"></i> Nav
                        </button>
                        <button class="tpro-btn-matrix-nav" style="border-color:#33ccff; color:#33ccff;" onclick="window.BVC_TRANS.openWazeForStop(${s.lat}, ${s.lng})" title="Waze Traffic Navigation to ${s.name}">
                            <i class="fas fa-car-side"></i> Waze
                        </button>
                        ${actionHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Modal: View Requesting Students for a Specific Stop
    function viewStopRequestsModal(stopName) {
        const requests = activeRequests.filter(r => 
            (r.stop_name && r.stop_name.toLowerCase().includes(stopName.toLowerCase())) ||
            (stopName.toLowerCase().includes((r.stop_name || '').toLowerCase()))
        );

        if (requests.length === 0) {
            openModal(`
                <h3 style="margin:0 0 10px 0; color:#ffd400;"><i class="fas fa-users"></i> Requests for ${stopName}</h3>
                <p style="font-size:13px; color:rgba(255,255,255,0.7);">No active student requests are mapped to this stop.</p>
                <div style="text-align:right; margin-top:15px;">
                    <button class="btn-secondary" onclick="window.BVC_TRANS.closeModal()">Close</button>
                </div>
            `);
            return;
        }

        const cardsHtml = requests.map(r => `
            <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px 14px; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <b style="font-size:13px; color:#fff;">${r.student_name}</b> <small style="color:rgba(255,255,255,0.6);">(${r.student_reg})</small>
                        <div style="font-size:11px; color:#38bdf8; margin-top:2px;">Phone: <a href="tel:${r.phone}" style="color:#43e97b; font-weight:700; text-decoration:none;">📞 ${r.phone}</a></div>
                    </div>
                    <span class="tpro-req-badge ${r.request_type === 'EMERGENCY_MISSED' ? 'badge-emer' : (r.request_type === 'DROP' ? 'badge-drop' : 'badge-pick')}">${r.request_type}</span>
                </div>
                ${r.notes ? `<div style="font-size:11px; color:#fde047; margin:6px 0; font-style:italic;">"${r.notes}"</div>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                    <span style="font-size:11px; color:rgba(255,255,255,0.7);">Status: <b style="color:#ffd400;">${r.status}</b></span>
                    <div style="display:flex; gap:6px;">
                        ${r.status === 'PENDING' ? `
                            <button class="tpro-btn-sm tpro-btn-accept" onclick="window.BVC_TRANS.updateRequestStatus(${r.id}, 'ACCEPTED'); window.BVC_TRANS.closeModal();">Accept</button>
                        ` : ''}
                        <button class="tpro-btn-sm tpro-btn-arrive" onclick="window.BVC_TRANS.updateRequestStatus(${r.id}, 'ARRIVED'); window.BVC_TRANS.closeModal();">Reached</button>
                        <button class="tpro-btn-sm tpro-btn-complete" onclick="window.BVC_TRANS.updateRequestStatus(${r.id}, 'COMPLETED'); window.BVC_TRANS.closeModal();">Complete</button>
                    </div>
                </div>
            </div>
        `).join('');

        openModal(`
            <h3 style="margin:0 0 8px 0; color:#ffd400;"><i class="fas fa-users"></i> Student Requests at ${stopName}</h3>
            <p style="font-size:12px; color:rgba(255,255,255,0.7); margin-bottom:12px;">Total: <b>${requests.length}</b> passenger(s) requesting action at this location.</p>
            <div style="max-height:320px; overflow-y:auto;">${cardsHtml}</div>
            <div style="text-align:right; margin-top:15px;">
                <button class="btn-secondary" onclick="window.BVC_TRANS.closeModal()">Close</button>
            </div>
        `);
    }

    // Google Maps Universal Roadway Directions Navigation
    function openGoogleMapsNav() {
        const b = fleetData.find(x => x.bus_no === selectedBusNo) || fleetData[0];
        let curLat = 16.5787, curLng = 82.0061;
        if (busVehicles[selectedBusNo] && busVehicles[selectedBusNo].marker) {
            const pos = busVehicles[selectedBusNo].marker.getLatLng();
            curLat = pos.lat;
            curLng = pos.lng;
        } else if (b && b.latitude) {
            curLat = b.latitude;
            curLng = b.longitude;
        }

        const dest = '16.5200,82.0010'; // BVC Odalarevu Campus Terminal
        const origin = `${curLat},${curLng}`;

        let waypointsParam = '';
        if (b && b.stops_data && b.stops_data.length > 0) {
            const wps = b.stops_data.slice(driverActiveStopIdx, -1).map(s => `${s.lat},${s.lng}`);
            if (wps.length > 0) {
                waypointsParam = `&waypoints=${encodeURIComponent(wps.join('|'))}`;
            }
        }

        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypointsParam}&travelmode=driving`;
        window.open(gmapsUrl, '_blank');
        speakAnnouncement('Launching Google Maps turn-by-turn navigation with live traffic.');
        if (typeof showToast === 'function') {
            showToast('🗺️ Launched Google Maps full route navigation with live traffic directions.');
        }
    }

    function openGoogleMapsForStop(lat, lng, name) {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
        window.open(url, '_blank');
        speakAnnouncement(`Navigating to stop ${name} in Google Maps.`);
        if (typeof showToast === 'function') {
            showToast(`🗺️ Navigating to ${name} in Google Maps.`);
        }
    }

    function openWazeNav() {
        const url = 'https://waze.com/ul?ll=16.5200,82.0010&navigate=yes';
        window.open(url, '_blank');
        speakAnnouncement('Launching Waze Live Traffic navigation to BVC Campus.');
        if (typeof showToast === 'function') {
            showToast('🚗 Launched Waze Live Traffic navigation.');
        }
    }

    function openWazeForStop(lat, lng) {
        const url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
        window.open(url, '_blank');
        if (typeof showToast === 'function') {
            showToast('🚗 Opening Waze live navigation.');
        }
    }

    function openAppleMapsNav() {
        const url = 'https://maps.apple.com/?daddr=16.5200,82.0010&dirflg=d';
        window.open(url, '_blank');
        if (typeof showToast === 'function') {
            showToast('🍏 Opened Apple Maps driving directions.');
        }
    }

    function toggleSmartRoute() {
        smartRouteActive = !smartRouteActive;
        const btn = document.getElementById('btn-drv-smart-route');
        const txt = document.getElementById('smart-route-btn-text');

        if (smartRouteActive) {
            if (btn) btn.classList.add('active');
            if (txt) txt.innerText = 'Smart Route Active (Coastal Bypass)';

            const bypassCoords = [
                [16.5787, 82.0061],
                [16.5650, 82.0300],
                [16.5400, 82.0250],
                [16.5200, 82.0010]
            ];
            if (proMap) {
                if (smartRoutePolyline) proMap.removeLayer(smartRoutePolyline);
                smartRoutePolyline = L.polyline(bypassCoords, {
                    color: '#00f2fe',
                    weight: 6,
                    dashArray: '10, 10',
                    opacity: 0.95
                }).addTo(proMap);
            }

            const turnInstr = document.getElementById('tpro-turn-instruction');
            if (turnInstr) turnInstr.innerText = '⚡ SMART BYPASS ENGAGED: Diverting via Coastal Bypass - Saving ~12 mins';

            speakAnnouncement('Smart route active. Diverting via coastal bypass to avoid town traffic.');
            if (typeof showToast === 'function') {
                showToast('⚡ Smart Fastest Route Activated! Avoiding traffic bottlenecks via Coastal Highway Bypass.');
            }
        } else {
            if (btn) btn.classList.remove('active');
            if (txt) txt.innerText = 'Smart Fastest Route (Avoid Delays)';

            if (smartRoutePolyline && proMap) {
                proMap.removeLayer(smartRoutePolyline);
                smartRoutePolyline = null;
            }

            const turnInstr = document.getElementById('tpro-turn-instruction');
            if (turnInstr) turnInstr.innerText = 'In 250m: Keep Left on NH216 towards next scheduled stop';

            speakAnnouncement('Standard scheduled route resumed.');
            if (typeof showToast === 'function') {
                showToast('Standard scheduled route resumed.');
            }
        }
    }

    function readAloudRequests() {
        const b = fleetData.find(x => x.bus_no === selectedBusNo);
        const reqs = activeRequests.filter(r => (!b || r.bus_no === b.bus_no) && (r.status === 'PENDING' || r.status === 'ACCEPTED'));

        if (reqs.length === 0) {
            speakAnnouncement('Driver dispatch notice: All passenger drop and pickup requests are cleared. You are on scheduled route.');
            if (typeof showToast === 'function') showToast('📢 Voice Dispatch: All requests cleared.');
            return;
        }

        const summary = reqs.slice(0, 3).map(r => `${r.student_name} requesting ${r.request_type} at ${r.stop_name}`).join('. ');
        const speechText = `Attention Driver Raju. You have ${reqs.length} pending student requests. ${summary}. Drive safely.`;
        speakAnnouncement(speechText);
        if (typeof showToast === 'function') showToast(`📢 Voice Dispatch: Announced ${reqs.length} passenger requests.`);
    }

    // Driver Trip Operations: Start, Pause, End, SOS, Arrive
    async function startDriverTrip() {
        try {
            const bno = selectedBusNo || 'BUS-01';
            const res = await fetch('/api/bus/action', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ bus_no: bno, action: 'START' })
            });
            const json = await res.json();
            if (json.success) {
                driverTripActive = true;
                driverTripStartTime = Date.now();
                driverActiveStopIdx = 0;
                startTripTimer(0);
                setTripBadgeState('active', 'TRIP ACTIVE: LIVE ON ROAD');
                playDispatchChime(false);

                const hud = document.getElementById('tpro-driver-map-hud');
                if (hud) hud.style.display = 'flex';

                speakAnnouncement(`Trip started for ${bno}. Google traffic overlay and student stop monitoring active.`);
                if (typeof showToast === 'function') {
                    showToast(`🚀 Trip Started for ${bno}! Driver telemetry and road guidance activated.`);
                }
                fetchFleetDetails();
            } else {
                alert(json.message || 'Error starting trip');
            }
        } catch (e) {
            alert('Network error starting trip.');
        }
    }

    async function pauseDriverTrip() {
        try {
            const bno = selectedBusNo || 'BUS-01';
            const res = await fetch('/api/bus/action', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ bus_no: bno, action: 'PAUSE' })
            });
            const json = await res.json();
            if (json.success) {
                stopTripTimer();
                setTripBadgeState('paused', 'TRIP PAUSED (DEPOT / HALT)');
                speakAnnouncement('Trip paused at depot or transit halt.');
                if (typeof showToast === 'function') {
                    showToast('⏸️ Trip paused at depot / halt.');
                }
                fetchFleetDetails();
            }
        } catch (e) {
            alert('Error pausing trip');
        }
    }

    async function endDriverTrip() {
        if (!confirm('Are you sure you want to finish and complete this trip at BVC Odalarevu Campus?')) return;
        try {
            const bno = selectedBusNo || 'BUS-01';
            const res = await fetch('/api/bus/action', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ bus_no: bno, action: 'END' })
            });
            const json = await res.json();
            if (json.success) {
                driverTripActive = false;
                stopTripTimer();
                setTripBadgeState('standby', 'TRIP COMPLETED • STANDBY');
                speakAnnouncement('Trip successfully completed at BVC Odalarevu Campus terminal.');
                if (typeof showToast === 'function') {
                    showToast('🏁 Trip successfully completed! Attendance and trip duration recorded.');
                }
                const hud = document.getElementById('tpro-driver-map-hud');
                if (hud) hud.style.display = 'none';
                fetchFleetDetails();
            }
        } catch (e) {
            alert('Error ending trip');
        }
    }

    async function triggerDriverSos() {
        if (!confirm('Broadcast EMERGENCY SOS to campus administration and transport control?')) return;
        try {
            const bno = selectedBusNo || 'BUS-01';
            const res = await fetch('/api/bus/action', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ bus_no: bno, action: 'EMERGENCY' })
            });
            const json = await res.json();
            if (json.success) {
                setTripBadgeState('emergency', '🚨 EMERGENCY SOS ACTIVE');
                playDispatchChime(true);
                speakAnnouncement('Emergency SOS beacon broadcasted to campus dispatch and emergency response.');
                if (typeof showToast === 'function') {
                    showToast('🚨 EMERGENCY SOS BROADCASTED! Dispatchers alerted.');
                }
                fetchFleetDetails();
            }
        } catch (e) {
            alert('Error triggering SOS');
        }
    }

    function markNextStopArrived() {
        const b = fleetData.find(x => x.bus_no === selectedBusNo) || fleetData[0];
        if (!b || !b.stops_data || b.stops_data.length === 0) return;

        if (driverActiveStopIdx < b.stops_data.length - 1) {
            driverActiveStopIdx++;
            const s = b.stops_data[driverActiveStopIdx];
            markStopReached(s.name, driverActiveStopIdx);
        } else {
            speakAnnouncement('You have arrived at BVC Odalarevu Campus terminal. Final destination reached.');
            if (typeof showToast === 'function') showToast('🎓 Final Destination Reached: BVC Odalarevu Campus.');
        }
    }

    function markStopReached(stopName, idx) {
        if (typeof idx === 'number') {
            driverActiveStopIdx = idx;
        }
        const b = fleetData.find(x => x.bus_no === selectedBusNo) || fleetData[0];
        const s = b && b.stops_data ? b.stops_data[driverActiveStopIdx] : null;

        activeRequests.forEach(r => {
            if (r.stop_name && (r.stop_name.toLowerCase().includes(stopName.toLowerCase()) || stopName.toLowerCase().includes(r.stop_name.toLowerCase())) && r.status === 'PENDING') {
                window.BVC_TRANS.updateRequestStatus(r.id, 'ARRIVED');
            }
        });

        const reqCount = s ? (s.request_count || 0) : 0;
        speakAnnouncement(`Arrived at ${stopName}. ${reqCount > 0 ? reqCount + ' passenger requests waiting' : 'Regular scheduled stop'}.`);
        if (typeof showToast === 'function') {
            showToast(`🚏 Arrived at ${stopName} (${reqCount} student requests)`);
        }

        if (b) {
            updateTelemetryHUD(b);
            renderDriverStopsMatrix(b);
        }
    }

    // Render Real-Time Passenger Broadcast Card (Visible to all students, passengers, & admins)
    function updatePassengerBroadcastCard(b) {
        if (!b) return;

        const card = document.getElementById('tpro-passenger-driver-broadcast-card');
        const busNoEl = document.getElementById('pdc-bus-no');
        const drvNameEl = document.getElementById('pdc-driver-name');
        const phoneLink = document.getElementById('pdc-driver-phone-link');
        const routeEl = document.getElementById('pdc-route-name');
        const statusBadge = document.getElementById('pdc-status-badge');
        const statusText = document.getElementById('pdc-status-text');
        const noteEl = document.getElementById('pdc-driver-note');
        const updateTimeEl = document.getElementById('pdc-update-time');
        const occText = document.getElementById('pdc-occupancy-text');
        const occSub = document.getElementById('pdc-occupancy-sub');
        const nextStopEl = document.getElementById('pdc-next-stop-text');
        const nextEtaEl = document.getElementById('pdc-next-stop-eta');
        const acEl = document.getElementById('pdc-ac-status');
        const spdEl = document.getElementById('pdc-speed-status');

        if (busNoEl) busNoEl.innerText = b.bus_no;
        if (drvNameEl) drvNameEl.innerText = b.driver_name || 'Driver Raju';
        if (phoneLink) {
            const ph = b.driver_phone || '2222222222';
            phoneLink.href = `tel:${ph}`;
            phoneLink.innerHTML = `<i class="fas fa-phone-alt"></i> ${ph}`;
        }
        if (routeEl) routeEl.innerText = `Route: ${b.route}`;

        const isDelayed = (b.delay_minutes && b.delay_minutes > 0) || (b.status === 'DELAYED');
        if (card) {
            card.classList.toggle('is-delayed', isDelayed);
        }

        if (statusBadge && statusText) {
            if (b.status === 'EMERGENCY') {
                statusBadge.className = 'tpro-pdc-status-badge emergency';
                statusText.innerText = '🚨 EMERGENCY SOS';
            } else if (isDelayed) {
                statusBadge.className = 'tpro-pdc-status-badge delayed';
                statusText.innerText = `⚠️ DELAYED (+${b.delay_minutes || 10} MINS)`;
            } else if (b.status === 'ACTIVE') {
                statusBadge.className = 'tpro-pdc-status-badge on-time';
                statusText.innerText = '🟢 ON SCHEDULE • LIVE';
            } else if (b.status === 'PAUSED' || b.status === 'HALT' || b.status === 'DEPOT') {
                statusBadge.className = 'tpro-pdc-status-badge paused';
                statusText.innerText = '⏸️ DEPOT / TRANSIT HALT';
            } else {
                statusBadge.className = 'tpro-pdc-status-badge paused';
                statusText.innerText = `STANDBY • ${b.status || 'STOPPED'}`;
            }
        }

        if (noteEl) {
            if (b.driver_note && b.driver_note.trim()) {
                noteEl.innerText = `"${b.driver_note.trim()}"`;
            } else if (isDelayed) {
                noteEl.innerText = `"Bus delayed by ${b.delay_minutes || 10} mins due to ${b.delay_reason || 'heavy road traffic'}. Proceeding to next stop."`;
            } else if (b.status === 'ACTIVE') {
                noteEl.innerText = `"Trip started on schedule. All campus pickup points operational."`;
            } else {
                noteEl.innerText = `"Bus is stationed at starting depot. Departure scheduled shortly."`;
            }
        }

        if (updateTimeEl) {
            updateTimeEl.innerText = b.last_driver_update ? (b.last_driver_update.split(' ')[1] || 'Live Sync') : 'Live Sync';
        }

        const totalS = b.total_seats || 50;
        const filledS = b.filled_seats || 0;
        const freeS = Math.max(0, totalS - filledS);

        if (occText) {
            if (b.occupancy_status === 'BUS FULL' || freeS === 0) {
                occText.innerHTML = '<span style="color:#ef4444;">🔴 BUS FULL</span>';
            } else if (b.occupancy_status === 'LIMITED SEATS' || freeS <= 5) {
                occText.innerHTML = `<span style="color:#f59e0b;">🟡 ${freeS} Free</span>`;
            } else {
                occText.innerHTML = `<span style="color:#43e97b;">🟢 ${freeS} Free</span>`;
            }
        }
        if (occSub) occSub.innerText = `${filledS}/${totalS} Boarded`;

        if (nextStopEl) {
            const nextStopName = b.next_stop || (b.stops_data && b.stops_data.length > 1 ? b.stops_data[1].name : 'Campus Terminal');
            nextStopEl.innerText = nextStopName;
        }

        if (nextEtaEl) {
            const isAmalapuramRoute = (b.bus_no === 'BUS-02' || (b.route && b.route.toLowerCase().includes('amalapuram')));
            const dur = isAmalapuramRoute ? 29 : (b.total_duration_mins || 45);
            nextEtaEl.innerText = b.eta_time ? `ETA: ${b.eta_time}` : `ETA: ~${dur}m`;
        }

        if (acEl) acEl.innerText = b.ac_status || 'AC ACTIVE';
        if (spdEl) spdEl.innerText = `${b.speed || (b.status === 'ACTIVE' ? 45 : 0)} km/h`;
    }

    // Modal: Driver / Admin Trip Settings & Passenger Broadcast Manager
    function openDriverSettingsModal(busNo) {
        const user = getActiveUser();
        const userRole = (user && user.role) ? user.role : 'student';

        if (userRole !== 'driver' && userRole !== 'admin') {
            if (typeof showToast === 'function') {
                showToast('⛔ Access Restricted: Bus Trip Settings can be updated ONLY by Driver or Admin.');
            }
            return;
        }

        const bno = busNo || selectedBusNo || 'BUS-01';
        const b = fleetData.find(x => x.bus_no === bno) || fleetData[0];
        if (!b) return;

        const stops = b.stops_data || [];
        const stopsOptions = stops.map(s => {
            const isSel = (b.next_stop && b.next_stop === s.name) ? 'selected' : '';
            return `<option value="${s.name}" ${isSel}>${s.name}</option>`;
        }).join('');

        const modalHtml = `
            <div class="tpro-settings-modal">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">
                    <div>
                        <h3 style="margin:0; font-size:16px; color:#ffd400;"><i class="fas fa-sliders-h"></i> Live Trip Settings &amp; Passenger Broadcast</h3>
                        <small style="color:rgba(255,255,255,0.65);">Update status, delays, seats &amp; broadcast alerts directly to all passengers</small>
                    </div>
                    <span class="tpro-driver-bus-badge" style="font-size:12px; padding:4px 10px;">${b.bus_no}</span>
                </div>

                <!-- 1. Live Trip Status -->
                <div class="tpro-settings-field-group">
                    <label class="tpro-settings-label"><i class="fas fa-signal"></i> Trip Status:</label>
                    <div class="tpro-radio-pill-group" id="settings-status-group">
                        <button type="button" class="tpro-radio-pill ${b.status === 'ACTIVE' && (!b.delay_minutes || b.delay_minutes === 0) ? 'active' : ''}" data-val="ACTIVE" onclick="window.BVC_TRANS.selectSettingPill('settings-status-group', this)">🟢 On Schedule</button>
                        <button type="button" class="tpro-radio-pill ${(b.delay_minutes && b.delay_minutes > 0) || b.status === 'DELAYED' ? 'active' : ''}" data-val="DELAYED" onclick="window.BVC_TRANS.selectSettingPill('settings-status-group', this)">⚠️ Delayed</button>
                        <button type="button" class="tpro-radio-pill ${b.status === 'PAUSED' ? 'active' : ''}" data-val="PAUSED" onclick="window.BVC_TRANS.selectSettingPill('settings-status-group', this)">⏸️ Depot / Halt</button>
                        <button type="button" class="tpro-radio-pill ${b.status === 'COMPLETED' ? 'active' : ''}" data-val="COMPLETED" onclick="window.BVC_TRANS.selectSettingPill('settings-status-group', this)">🏁 Completed</button>
                        <button type="button" class="tpro-radio-pill ${b.status === 'EMERGENCY' ? 'active' : ''}" data-val="EMERGENCY" onclick="window.BVC_TRANS.selectSettingPill('settings-status-group', this)">🚨 SOS Emergency</button>
                    </div>
                </div>

                <!-- 2. Delay Adjustment (Minutes & Reason) -->
                <div class="tpro-settings-field-group" style="background:rgba(255,255,255,0.03); padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.07);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label class="tpro-settings-label"><i class="far fa-clock"></i> Delay Minutes:</label>
                        <span id="settings-delay-display" style="font-weight:800; color:#ffd400; font-size:13px;">${b.delay_minutes || 0} mins</span>
                    </div>
                    <div class="tpro-radio-pill-group" id="settings-delay-mins-group" style="margin:4px 0;">
                        <button type="button" class="tpro-radio-pill ${!b.delay_minutes || b.delay_minutes === 0 ? 'active' : ''}" data-mins="0" onclick="window.BVC_TRANS.setSettingDelay(0, this)">0m (On Time)</button>
                        <button type="button" class="tpro-radio-pill ${b.delay_minutes === 5 ? 'active' : ''}" data-mins="5" onclick="window.BVC_TRANS.setSettingDelay(5, this)">5m</button>
                        <button type="button" class="tpro-radio-pill ${b.delay_minutes === 10 ? 'active' : ''}" data-mins="10" onclick="window.BVC_TRANS.setSettingDelay(10, this)">10m</button>
                        <button type="button" class="tpro-radio-pill ${b.delay_minutes === 15 ? 'active' : ''}" data-mins="15" onclick="window.BVC_TRANS.setSettingDelay(15, this)">15m</button>
                        <button type="button" class="tpro-radio-pill ${b.delay_minutes === 20 ? 'active' : ''}" data-mins="20" onclick="window.BVC_TRANS.setSettingDelay(20, this)">20m</button>
                        <button type="button" class="tpro-radio-pill ${b.delay_minutes >= 30 ? 'active' : ''}" data-mins="30" onclick="window.BVC_TRANS.setSettingDelay(30, this)">30m+</button>
                    </div>
                    <input id="settings-delay-reason" class="input-field m-0" placeholder="Delay Reason (e.g. Heavy Highway Traffic, Diversion, Rain)" value="${b.delay_reason || ''}" style="margin-top:4px;">
                    <div class="tpro-preset-chips">
                        <span class="tpro-preset-chip" onclick="document.getElementById('settings-delay-reason').value = 'Heavy Traffic at Ravulapalem'">🚦 Heavy Traffic</span>
                        <span class="tpro-preset-chip" onclick="document.getElementById('settings-delay-reason').value = 'Highway Roadwork Diversion'">🚧 Roadwork Diversion</span>
                        <span class="tpro-preset-chip" onclick="document.getElementById('settings-delay-reason').value = 'Tire Puncture / Maintenance Halt'">🔧 Maintenance Halt</span>
                        <span class="tpro-preset-chip" onclick="document.getElementById('settings-delay-reason').value = 'Torrential Rain & Slow Movement'">🌧️ Torrential Rain</span>
                    </div>
                </div>

                <!-- 3. Seating Capacity & Boarded Count -->
                <div class="tpro-settings-field-group">
                    <label class="tpro-settings-label"><i class="fas fa-users"></i> Onboard Passenger Count &amp; Seating Status:</label>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button type="button" class="tpro-btn-sm" style="padding:6px 14px; font-size:14px; background:rgba(255,255,255,0.1); color:#fff;" onclick="window.BVC_TRANS.adjustSettingSeats(-1)">-1</button>
                        <input id="settings-filled-seats" type="number" class="input-field m-0" style="width:70px; text-align:center; font-weight:800; font-size:15px; color:#ffd400;" value="${b.filled_seats || 38}">
                        <button type="button" class="tpro-btn-sm" style="padding:6px 14px; font-size:14px; background:rgba(255,255,255,0.1); color:#fff;" onclick="window.BVC_TRANS.adjustSettingSeats(1)">+1</button>
                        <div class="tpro-radio-pill-group" id="settings-occ-group" style="flex:1;">
                            <button type="button" class="tpro-radio-pill ${b.occupancy_status !== 'LIMITED SEATS' && b.occupancy_status !== 'BUS FULL' ? 'active' : ''}" data-val="SEATS AVAILABLE" onclick="window.BVC_TRANS.selectSettingPill('settings-occ-group', this)">🟢 Available</button>
                            <button type="button" class="tpro-radio-pill ${b.occupancy_status === 'LIMITED SEATS' ? 'active' : ''}" data-val="LIMITED SEATS" onclick="window.BVC_TRANS.selectSettingPill('settings-occ-group', this)">🟡 Limited</button>
                            <button type="button" class="tpro-radio-pill ${b.occupancy_status === 'BUS FULL' ? 'active' : ''}" data-val="BUS FULL" onclick="window.BVC_TRANS.selectSettingPill('settings-occ-group', this)">🔴 Bus Full</button>
                        </div>
                    </div>
                </div>

                <!-- 4. Next Approaching Stop & AC Comfort -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div class="tpro-settings-field-group">
                        <label class="tpro-settings-label"><i class="fas fa-map-marker-alt"></i> Next Approaching Stop:</label>
                        <select id="settings-next-stop" class="input-field m-0">
                            ${stopsOptions || '<option value="Campus Terminal">Campus Terminal</option>'}
                        </select>
                    </div>
                    <div class="tpro-settings-field-group">
                        <label class="tpro-settings-label"><i class="fas fa-snowflake"></i> Cabin AC Status:</label>
                        <div class="tpro-radio-pill-group" id="settings-ac-group">
                            <button type="button" class="tpro-radio-pill ${b.ac_status !== 'AC NORMAL / OFF' ? 'active' : ''}" data-val="AC ON" onclick="window.BVC_TRANS.selectSettingPill('settings-ac-group', this)">❄️ AC Active</button>
                            <button type="button" class="tpro-radio-pill ${b.ac_status === 'AC NORMAL / OFF' ? 'active' : ''}" data-val="AC NORMAL / OFF" onclick="window.BVC_TRANS.selectSettingPill('settings-ac-group', this)">AC Normal</button>
                        </div>
                    </div>
                </div>

                <!-- 5. Live Broadcast Announcement to All Passengers -->
                <div class="tpro-settings-field-group">
                    <label class="tpro-settings-label"><i class="fas fa-bullhorn"></i> Live Driver Announcement to All Passengers:</label>
                    <textarea id="settings-driver-note" class="input-field m-0" rows="2" placeholder="Write a live message to all students &amp; passengers (e.g. Arriving at Peruru in 5 mins)...">${b.driver_note || ''}</textarea>
                    <div class="tpro-preset-chips">
                        <span class="tpro-preset-chip" onclick="document.getElementById('settings-driver-note').value = 'Approaching next stop in 5 mins. Please gather at the shelter.'">📢 5 mins arrival</span>
                        <span class="tpro-preset-chip" onclick="document.getElementById('settings-driver-note').value = 'Heavy highway traffic. Moving slowly, will reach soon.'">📢 Heavy traffic</span>
                        <span class="tpro-preset-chip" onclick="document.getElementById('settings-driver-note').value = 'Bus is full. Next scheduled bus is following 7 mins behind.'">📢 Bus is full</span>
                        <span class="tpro-preset-chip" onclick="document.getElementById('settings-driver-note').value = 'Trip on schedule. Arriving at BVC Odalarevu on time.'">📢 On schedule</span>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px; border-top:1px solid rgba(255,255,255,0.1); padding-top:12px;">
                    <button class="btn-secondary" onclick="window.BVC_TRANS.closeModal()">Cancel</button>
                    <button class="btn-primary" style="background:linear-gradient(135deg, #10b981, #059669); font-weight:800;" onclick="window.BVC_TRANS.submitDriverSettings('${b.bus_no}')">
                        <i class="fas fa-paper-plane"></i> Publish Settings to Passengers
                    </button>
                </div>
            </div>
        `;

        openModal(modalHtml);
    }

    function selectSettingPill(groupId, btn) {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.querySelectorAll('.tpro-radio-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    function setSettingDelay(mins, btn) {
        selectSettingPill('settings-delay-mins-group', btn);
        const disp = document.getElementById('settings-delay-display');
        if (disp) disp.innerText = `${mins} mins`;

        if (mins > 0) {
            const statusGroup = document.getElementById('settings-status-group');
            if (statusGroup) {
                const delayedBtn = statusGroup.querySelector('[data-val="DELAYED"]');
                if (delayedBtn) selectSettingPill('settings-status-group', delayedBtn);
            }
        } else {
            const statusGroup = document.getElementById('settings-status-group');
            if (statusGroup) {
                const activeBtn = statusGroup.querySelector('[data-val="ACTIVE"]');
                if (activeBtn) selectSettingPill('settings-status-group', activeBtn);
            }
        }
    }

    function adjustSettingSeats(delta) {
        const input = document.getElementById('settings-filled-seats');
        if (!input) return;
        let val = parseInt(input.value) || 0;
        val = Math.max(0, Math.min(60, val + delta));
        input.value = val;

        const occGroup = document.getElementById('settings-occ-group');
        if (occGroup) {
            if (val >= 50) {
                const fullBtn = occGroup.querySelector('[data-val="BUS FULL"]');
                if (fullBtn) selectSettingPill('settings-occ-group', fullBtn);
            } else if (val >= 45) {
                const limBtn = occGroup.querySelector('[data-val="LIMITED SEATS"]');
                if (limBtn) selectSettingPill('settings-occ-group', limBtn);
            } else {
                const availBtn = occGroup.querySelector('[data-val="SEATS AVAILABLE"]');
                if (availBtn) selectSettingPill('settings-occ-group', availBtn);
            }
        }
    }

    async function submitDriverSettings(busNo) {
        const statusPill = document.querySelector('#settings-status-group .tpro-radio-pill.active');
        const delayPill = document.querySelector('#settings-delay-mins-group .tpro-radio-pill.active');
        const occPill = document.querySelector('#settings-occ-group .tpro-radio-pill.active');
        const acPill = document.querySelector('#settings-ac-group .tpro-radio-pill.active');

        const status = statusPill ? statusPill.dataset.val : 'ACTIVE';
        const delayMins = delayPill ? parseInt(delayPill.dataset.mins) : 0;
        const delayReason = document.getElementById('settings-delay-reason').value;
        const filledSeats = parseInt(document.getElementById('settings-filled-seats').value) || 38;
        const occupancyStatus = occPill ? occPill.dataset.val : 'SEATS AVAILABLE';
        const nextStop = document.getElementById('settings-next-stop').value;
        const acStatus = acPill ? acPill.dataset.val : 'AC ON';
        const driverNote = document.getElementById('settings-driver-note').value;

        const payload = {
            bus_no: busNo,
            status: status,
            delay_minutes: delayMins,
            delay_reason: delayReason,
            filled_seats: filledSeats,
            occupancy_status: occupancyStatus,
            next_stop: nextStop,
            ac_status: acStatus,
            driver_note: driverNote
        };

        try {
            const res = await fetch('/api/bus/settings/update', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.success) {
                playDispatchChime(false);
                speakAnnouncement('Trip settings and passenger broadcast updated successfully.');
                if (typeof showToast === 'function') {
                    showToast('✅ Bus settings and live passenger broadcast updated successfully!');
                }
                closeModal();
                fetchFleetDetails();
            } else {
                alert(json.message || 'Error updating settings');
            }
        } catch (e) {
            alert('Network error updating bus settings.');
        }
    }

    // STRICT ROLE VISIBILITY ENFORCEMENT:
    // Driver Portal is available ONLY under Driver login (role === 'driver').
    // Students, faculty, and passengers see ONLY the live transit tracker with regular stops.
    function updateRoleVisibility() {
        const user = getActiveUser();
        const role = (user && user.role) ? user.role : 'student';

        const studentBtn = document.getElementById('tpro-student-mode-btn');
        const driverBtn = document.getElementById('tpro-driver-mode-btn');
        const adminBtn = document.getElementById('tpro-admin-mode-btn');
        const badge = document.getElementById('tpro-portal-mode-badge');
        const driverBar = document.getElementById('tpro-driver-cockpit-bar');
        const adminBar = document.getElementById('tpro-admin-bar');
        const mapHud = document.getElementById('tpro-driver-map-hud');

        if (role === 'driver') {
            // DRIVER LOGIN: Show Driver Dispatch Cockpit
            if (driverBtn) driverBtn.style.setProperty('display', 'inline-flex', 'important');
            if (studentBtn) studentBtn.style.setProperty('display', 'none', 'important');
            if (adminBtn) adminBtn.style.setProperty('display', 'none', 'important');
            if (badge) {
                badge.innerText = 'DRIVER DISPATCH COCKPIT (AUTHENTICATED)';
                badge.style.background = 'rgba(255, 212, 0, 0.2)';
                badge.style.color = '#ffd400';
            }
            if (driverBar) driverBar.style.setProperty('display', 'flex', 'important');
            if (mapHud) mapHud.style.setProperty('display', 'flex', 'important');

            // Populate Driver Profile Card
            const drvNameEl = document.getElementById('drv-profile-name');
            if (drvNameEl) drvNameEl.innerText = user.name || 'Driver Raju';
            const drvRegEl = document.getElementById('drv-profile-reg');
            if (drvRegEl) drvRegEl.innerText = user.reg_no || 'DRV001';
            const drvPhoneEl = document.getElementById('drv-profile-phone');
            if (drvPhoneEl) {
                const ph = user.phone || '2222222222';
                drvPhoneEl.innerText = ph;
                drvPhoneEl.href = `tel:${ph}`;
            }

            window.BVC_TRANS.switchRoleView('driver', true);

            // Auto-select driver's assigned bus (e.g. DRV002 -> BUS-02)
            let assignedBus = null;
            if (user && user.reg_no) {
                const numMatch = user.reg_no.match(/\d+/);
                if (numMatch) {
                    const padNum = String(parseInt(numMatch[0])).padStart(2, '0');
                    assignedBus = `BUS-${padNum}`;
                }
            }
            if (!assignedBus && user && user.name) {
                const bMatch = fleetData.find(b => b.driver_name && b.driver_name.toLowerCase().includes(user.name.toLowerCase()));
                if (bMatch) assignedBus = bMatch.bus_no;
            }
            if (assignedBus && (busVehicles[assignedBus] || fleetData.some(b => b.bus_no === assignedBus))) {
                selectProBus(assignedBus);
            }

            const activeBus = fleetData.find(x => x.bus_no === (assignedBus || selectedBusNo));
            if (activeBus) {
                const routeEl = document.getElementById('drv-cockpit-route');
                if (routeEl) routeEl.innerText = activeBus.route;
                renderDriverStopsMatrix(activeBus);

                if (activeBus.status === 'ACTIVE') {
                    driverTripActive = true;
                    setTripBadgeState('active', 'TRIP ACTIVE: LIVE ON ROAD');
                    if (!driverTripTimerInterval) {
                        startTripTimer(driverTripElapsedSeconds || 320);
                    }
                } else if (activeBus.status === 'EMERGENCY') {
                    setTripBadgeState('emergency', '🚨 EMERGENCY SOS ACTIVE');
                }
            }
        } else if (role === 'admin') {
            // ADMIN LOGIN: Allow Fleet Control & Live Tracker
            if (driverBtn) driverBtn.style.setProperty('display', 'none', 'important');
            if (studentBtn) studentBtn.style.setProperty('display', 'inline-flex', 'important');
            if (adminBtn) adminBtn.style.setProperty('display', 'inline-flex', 'important');
            if (driverBar) driverBar.style.setProperty('display', 'none', 'important');
            if (mapHud) mapHud.style.setProperty('display', 'none', 'important');
            stopTripTimer();

            if (badge) {
                badge.innerText = 'FLEET OPERATIONS COMMAND (ADMIN)';
                badge.style.background = 'rgba(67, 233, 123, 0.2)';
                badge.style.color = '#43e97b';
            }
            window.BVC_TRANS.switchRoleView('student', true);
        } else {
            // STUDENT / PASSENGER LOGIN: Driver portal is STRICTLY HIDDEN and inaccessible
            if (driverBtn) driverBtn.style.setProperty('display', 'none', 'important');
            if (adminBtn) adminBtn.style.setProperty('display', 'none', 'important');
            if (studentBtn) studentBtn.style.setProperty('display', 'inline-flex', 'important');
            if (driverBar) driverBar.style.setProperty('display', 'none', 'important');
            if (adminBar) adminBar.style.setProperty('display', 'none', 'important');
            if (mapHud) mapHud.style.setProperty('display', 'none', 'important');
            stopTripTimer();

            if (badge) {
                badge.innerText = 'PASSENGER LIVE TRANSIT TRACKER';
                badge.style.background = 'rgba(56, 189, 248, 0.2)';
                badge.style.color = '#38bdf8';
            }
            window.BVC_TRANS.switchRoleView('student', true);
        }
    }

    // Public API exposed via window.BVC_TRANS
    window.BVC_TRANS = {
        init: function () {
            initProMap();
            fetchFleetDetails();
            fetchActiveRequests();
            if (!pollInterval) {
                pollInterval = setInterval(() => {
                    fetchFleetDetails();
                    fetchActiveRequests();
                }, 4000);
            }
            if (!simLoopInterval) {
                simLoopInterval = setInterval(runSimulationStep, 40);
            }

            updateRoleVisibility();
        },

        updateRoleVisibility: updateRoleVisibility,

        selectBus: function (bno) {
            selectProBus(bno);
        },

        setLayer: function (layer) {
            setMapLayer(layer);
        },

        switchTab: function (tab) {
            currentTab = tab;
            document.querySelectorAll('.tpro-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tab);
            });
            const tabStops = document.getElementById('tpro-tab-pane-stops');
            const tabCabin = document.getElementById('tpro-tab-pane-cabin');
            const tabPass = document.getElementById('tpro-tab-pane-passenger');

            if (tabStops) tabStops.style.display = tab === 'stops' ? 'block' : 'none';
            if (tabCabin) tabCabin.style.display = tab === 'cabin' ? 'block' : 'none';
            if (tabPass) tabPass.style.display = tab === 'passenger' ? 'block' : 'none';
        },

        switchRoleView: function (role, internalAuth = false) {
            const user = getActiveUser();
            const userRole = (user && user.role) ? user.role : 'student';

            // STRICT AUTHORIZATION CHECK: Driver portal MUST ONLY be accessible in driver login!
            if (role === 'driver' && userRole !== 'driver') {
                if (typeof showToast === 'function') {
                    showToast('⛔ Access Restricted: Driver Cockpit is accessible ONLY under Driver Login.');
                }
                return;
            }

            if (role === 'admin' && userRole !== 'admin') {
                if (typeof showToast === 'function') {
                    showToast('⛔ Access Restricted: Fleet Admin controls require Admin authentication.');
                }
                return;
            }

            currentRoleMode = role;
            document.querySelectorAll('.tpro-role-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.role === role);
            });

            const adminBar = document.getElementById('tpro-admin-bar');
            const driverBar = document.getElementById('tpro-driver-cockpit-bar');

            // Strictly separate roles: Raised requests feed ONLY shown for driver or admin
            const isDriver = (role === 'driver');
            const isAdmin = (role === 'admin');

            if (adminBar) adminBar.style.display = isAdmin ? 'flex' : 'none';
            if (driverBar) driverBar.style.display = isDriver ? 'flex' : 'none';

            // Filter map markers: Driver sees requested drop points; Passenger sees ONLY regular stops
            syncRequestMarkers();

            if (typeof showToast === 'function' && !internalAuth) {
                const label = role === 'driver' ? 'Driver Cockpit (Raised Requests Queue)' : (role === 'admin' ? 'Fleet Control (Admin)' : 'Passenger Hub (Regular Stops)');
                showToast(`Switched Mode: ${label}`);
            }
        },

        setSimSpeed: function (mult) {
            simSpeedMultiplier = mult;
            document.querySelectorAll('.tpro-speed-btn').forEach(btn => {
                btn.classList.toggle('active', parseFloat(btn.dataset.speed) === mult);
            });
            if (typeof showToast === 'function') showToast(`Simulation Speed: ${mult}x`);
        },

        toggleSim: function () {
            simRunning = !simRunning;
            const btn = document.getElementById('tpro-sim-toggle-btn');
            if (btn) {
                btn.innerHTML = simRunning ? '<i class="fas fa-pause"></i> Pause' : '<i class="fas fa-play"></i> Run';
            }
        },

        restartSimulation: function () {
            Object.keys(busVehicles).forEach(k => {
                busVehicles[k].waypointIndex = 0;
                busVehicles[k].progress = 0;
            });
            simRunning = true;
            if (typeof showToast === 'function') showToast('Route simulation reset to starting terminus.');
        },

        centerOnBus: function () {
            if (selectedBusNo && busVehicles[selectedBusNo] && busVehicles[selectedBusNo].marker) {
                proMap.setView(busVehicles[selectedBusNo].marker.getLatLng(), 15);
            } else {
                proMap.setView([16.5200, 82.0010], 13);
            }
        },

        // Passenger Request Handlers
        submitPassengerRequest: async function (reqType) {
            if (!selectedBusNo) return alert('Please select a bus first.');
            const stop = document.getElementById('tpro-req-stop-input').value;
            const notes = document.getElementById('tpro-req-notes-input').value;

            if (!stop) return alert('Please specify the stop name or landmark.');

            const body = {
                bus_no: selectedBusNo,
                stop: stop,
                request_type: reqType,
                notes: notes,
                lat: 16.5520, // Region default
                lng: 81.9830
            };

            try {
                const res = await fetch('/api/bus/request', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(body)
                });
                const json = await res.json();
                if (json.success) {
                    playDispatchChime(reqType === 'EMERGENCY_MISSED');
                    if (typeof showToast === 'function') showToast(json.message);
                    fetchActiveRequests();
                    fetchFleetDetails();
                    document.getElementById('tpro-req-stop-input').value = '';
                    document.getElementById('tpro-req-notes-input').value = '';

                    const statusBox = document.getElementById('tpro-student-request-status-box');
                    const statusText = document.getElementById('tpro-student-request-status-text');
                    if (statusBox && statusText) {
                        statusText.innerHTML = `Your <b>${reqType}</b> request for <b>${stop}</b> has been dispatched directly to the Driver of <b>${selectedBusNo}</b>. Current status: <span style="color:#ffd400; font-weight:700;">PENDING</span> (Only your driver receives this dispatch in their cockpit).`;
                        statusBox.style.display = 'block';
                    }
                } else {
                    alert(json.message || 'Error raising request');
                }
            } catch (e) {
                alert('Network error submitting request.');
            }
        },

        // Trigger Emergency Missed Bus Hop
        triggerMissedBusEmergency: async function () {
            const stop = prompt('Emergency Missed-Bus Hop: Enter your current town/stop location (e.g. Ambajipeta, Ravulapalem, Peruru):');
            if (!stop) return;

            const notes = prompt('Enter your reason or urgency (e.g. Missed regular bus, urgent lab exam at 9 AM):') || 'Missed regular scheduled bus';

            const body = {
                bus_no: selectedBusNo || 'BUS-01',
                stop: stop,
                request_type: 'EMERGENCY_MISSED',
                notes: notes,
                lat: 16.5920,
                lng: 81.9320
            };

            try {
                const res = await fetch('/api/bus/request', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(body)
                });
                const json = await res.json();
                if (json.success) {
                    playDispatchChime(true);
                    if (typeof showToast === 'function') showToast('🚨 EMERGENCY HOP SENT! Driver notified with priority dispatch beacon.');
                    fetchActiveRequests();
                    fetchFleetDetails();
                } else {
                    alert(json.message || 'Could not trigger emergency request');
                }
            } catch (e) {
                alert('Network error triggering emergency hop.');
            }
        },

        // Driver Request Status update
        updateRequestStatus: async function (reqId, status) {
            try {
                const res = await fetch('/api/bus/request/status', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ request_id: reqId, status: status })
                });
                const json = await res.json();
                if (json.success) {
                    if (typeof showToast === 'function') showToast(json.message);
                    fetchActiveRequests();
                    fetchFleetDetails();
                }
            } catch (e) {
                alert('Error updating status');
            }
        },

        // Driver Attendance Toggle
        togglePassengerAttendance: async function (busNo, studentReg, newStatus) {
            try {
                const res = await fetch('/api/bus/attendance/mark', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ bus_no: busNo, student_reg: studentReg, status: newStatus })
                });
                const json = await res.json();
                if (json.success) {
                    if (typeof showToast === 'function') showToast(json.message);
                    fetchManifestForBus(busNo);
                    fetchFleetDetails();
                }
            } catch (e) {
                alert('Error marking attendance');
            }
        },

        // Seat Click Info
        onSeatClick: function (busNo, seatNo) {
            const manifest = manifestData[busNo] || [];
            const p = manifest.find(x => x.seat_no === seatNo);
            if (p) {
                alert(`💺 Seat #${seatNo} Details:\n\nPassenger: ${p.student_name}\nReg No: ${p.student_reg}\nPickup Stop: ${p.stop_name}\nStatus: ${p.status}`);
            } else {
                alert(`💺 Seat #${seatNo} is currently VACANT and available for boarding / emergency hops.`);
            }
        },

        // Admin: Add New Bus Modal
        openAddBusModal: function () {
            openModal(`
                <h3 style="margin:0 0 10px 0; color:#ffd400;"><i class="fas fa-plus-circle"></i> Add New Bus Route</h3>
                <p style="font-size:12px; color:rgba(255,255,255,0.7); margin-bottom:12px;">Create a new bus with custom driver, capacity, and route waypoints to Odalarevu campus.</p>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <input id="modal-bus-no" class="input-field m-0" placeholder="Bus Number (e.g. BUS-06)">
                    <input id="modal-bus-route" class="input-field m-0" placeholder="Route (e.g. Palakollu -> Razole -> Odalarevu)">
                    <input id="modal-bus-driver" class="input-field m-0" placeholder="Driver Full Name (e.g. Driver Krishna)">
                    <input id="modal-bus-phone" class="input-field m-0" placeholder="Driver Mobile (10 digits)">
                    <input id="modal-bus-seats" type="number" class="input-field m-0" placeholder="Total Seat Capacity (e.g. 50)" value="50">
                    <input id="modal-bus-stop1" class="input-field m-0" placeholder="Starting Stop Name (e.g. Palakollu RTC)">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:15px;">
                    <button class="btn-secondary" onclick="window.BVC_TRANS.closeModal()">Cancel</button>
                    <button class="btn-success" onclick="window.BVC_TRANS.submitAddBus()"><i class="fas fa-save"></i> Create Bus</button>
                </div>
            `);
        },

        submitAddBus: async function () {
            const bno = document.getElementById('modal-bus-no').value.trim();
            const route = document.getElementById('modal-bus-route').value.trim();
            const driver = document.getElementById('modal-bus-driver').value.trim();
            const phone = document.getElementById('modal-bus-phone').value.trim();
            const seats = parseInt(document.getElementById('modal-bus-seats').value.trim()) || 50;
            const stop1 = document.getElementById('modal-bus-stop1').value.trim() || 'Town Center';

            if (!bno || !route) return alert('Bus Number and Route are required.');

            const stops = [
                { name: stop1, lat: 16.5787, lng: 82.0061, boarding: 10, drop: 0, time: '07:45 AM' },
                { name: 'Allavaram Junction', lat: 16.5410, lng: 81.9680, boarding: 5, drop: 1, time: '08:30 AM' },
                { name: 'BVC Odalarevu Campus', lat: 16.5200, lng: 82.0010, boarding: 0, drop: 14, time: '09:00 AM' }
            ];

            try {
                const res = await fetch('/api/bus/admin/add', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        bus_no: bno,
                        route: route,
                        driver_name: driver || 'Driver',
                        driver_phone: phone,
                        total_seats: seats,
                        stops: stops
                    })
                });
                const json = await res.json();
                if (json.success) {
                    if (typeof showToast === 'function') showToast(json.message);
                    closeModal();
                    fetchFleetDetails();
                } else {
                    alert(json.message || 'Error adding bus');
                }
            } catch (e) {
                alert('Network error adding bus.');
            }
        },

        // Admin: Confirm Delete Bus
        confirmDeleteBus: function (busNo) {
            if (!confirm(`Are you sure you want to permanently DELETE bus ${busNo} and its routes?`)) return;

            fetch('/api/bus/admin/delete', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ bus_no: busNo })
            })
            .then(res => res.json())
            .then(json => {
                if (json.success) {
                    if (typeof showToast === 'function') showToast(json.message);
                    if (busVehicles[busNo]) {
                        if (busVehicles[busNo].marker) proMap.removeLayer(busVehicles[busNo].marker);
                        if (busVehicles[busNo].polyline) proMap.removeLayer(busVehicles[busNo].polyline);
                        delete busVehicles[busNo];
                    }
                    selectedBusNo = null;
                    fetchFleetDetails();
                } else {
                    alert(json.message || 'Could not delete bus');
                }
            })
            .catch(() => alert('Network error deleting bus.'));
        },

        // Admin: Reset Fleet
        resetDemoFleet: function () {
            if (!confirm('Reset fleet to all 5 default dummy buses with full routes, stops, and passenger attendance?')) return;
            fetch('/api/bus/admin/reset_dummy', {
                method: 'POST',
                headers: getAuthHeaders()
            })
            .then(res => res.json())
            .then(json => {
                if (json.success) {
                    if (typeof showToast === 'function') showToast('Default fleet reseeded successfully!');
                    location.reload();
                }
            });
        },

        closeModal: function () {
            closeModal();
        },

        // Driver Trip & Roadway Navigation API Handlers
        startDriverTrip: startDriverTrip,
        pauseDriverTrip: pauseDriverTrip,
        endDriverTrip: endDriverTrip,
        triggerDriverSos: triggerDriverSos,
        markNextStopArrived: markNextStopArrived,
        markStopReached: markStopReached,
        openGoogleMapsNav: openGoogleMapsNav,
        openGoogleMapsForStop: openGoogleMapsForStop,
        openWazeNav: openWazeNav,
        openWazeForStop: openWazeForStop,
        openAppleMapsNav: openAppleMapsNav,
        toggleSmartRoute: toggleSmartRoute,
        readAloudRequests: readAloudRequests,
        renderDriverStopsMatrix: renderDriverStopsMatrix,
        viewStopRequestsModal: viewStopRequestsModal,
        openDriverSettingsModal: openDriverSettingsModal,
        submitDriverSettings: submitDriverSettings,
        selectSettingPill: selectSettingPill,
        setSettingDelay: setSettingDelay,
        adjustSettingSeats: adjustSettingSeats,
        updatePassengerBroadcastCard: updatePassengerBroadcastCard
    };

    // Auto-hook into showSection('bus')
    const originalShowSection = window.showSection;
    if (typeof originalShowSection === 'function') {
        window.showSection = function (secId) {
            originalShowSection.apply(this, arguments);
            if (secId === 'bus') {
                setTimeout(() => {
                    window.BVC_TRANS.init();
                }, 250);
            }
        };
    }
})();
