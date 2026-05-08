// api_futbol.js — llamadas al backend de futbol.
// getFutbolBaseUrl() se carga desde js/config.js

// Valida que la altura sea un numero entre 0.50 y 2.50 m.
// Lanza Error con mensaje legible si no lo es.
function _validarAlturaObligatoria(alturaM) {
    const altura = Number(alturaM);
    if (alturaM === null || alturaM === undefined || alturaM === '' || Number.isNaN(altura)) {
        throw new Error('La altura es obligatoria. Indica un valor entre 0.50 y 2.50 metros.');
    }
    if (altura < 0.50 || altura > 2.50) {
        throw new Error('La altura debe estar entre 0.50 y 2.50 metros.');
    }
}

// Llama al backend y devuelve JSON con manejo de errores.
async function fetchJsonFutbol(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    let respuesta;
    try {
        respuesta = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error(`Timeout: sin respuesta del backend en ${timeoutMs}ms. Verifica que el servidor esté activo.`);
        }
        const origen = window.location.origin || 'origen desconocido';
        throw new Error(
            `No hay conexion con el backend (${getFutbolBaseUrl()}). ` +
            `Asegura que el backend este iniciado y que CORS permita ${origen}.`
        );
    }

    const raw = await respuesta.text();
    let payload = {};
    if (raw) {
        try {
            payload = JSON.parse(raw);
        } catch (_e) {
            payload = {};
        }
    }

    if (!respuesta.ok) {
        throw new Error(payload.error || payload.mensaje || `Error HTTP: ${respuesta.status}`);
    }

    return payload;
}

// Envia el video grabado al endpoint de analisis.
async function analizarGolpeo(videoBlob, opciones = {}) {
    const formData = new FormData();
    formData.append('video', videoBlob, 'golpeo.webm');

    const idUsuarioNum = Number(opciones.idUsuario);
    if (Number.isFinite(idUsuarioNum) && idUsuarioNum > 0) {
        formData.append('id_usuario', String(idUsuarioNum));
    }
    if (opciones.guardarBd) {
        formData.append('guardar_bd', 'true');
    }
    if (opciones.guardarVideoBd) {
        formData.append('guardar_video_bd', 'true');
    }
    if (opciones.metodoOrigen) {
        formData.append('metodo_origen', String(opciones.metodoOrigen));
    }
    if (opciones.incluirLandmarks) {
        formData.append('incluir_landmarks', 'true');
    }

    const url = `${getFutbolBaseUrl()}/api/futbol/analizar`;
    return fetchJsonFutbol(url, {
        method: 'POST',
        body: formData
    });
}

async function crearUsuarioFutbol(alias, nombreCompleto, alturaM, pesoKg) {
    _validarAlturaObligatoria(alturaM);
    const url = `${getFutbolBaseUrl()}/api/usuarios`;
    const body = {
        alias: alias,
        nombre_completo: nombreCompleto,
        altura_m: alturaM
    };
    if (pesoKg != null && pesoKg !== '') body.peso_kg = pesoKg;
    const payload = await fetchJsonFutbol(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    return payload.id_usuario;
}

async function actualizarUsuarioFutbol(idUsuario, alias, nombreCompleto, alturaM, pesoKg) {
    _validarAlturaObligatoria(alturaM);
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}`;
    const body = {
        alias: alias,
        nombre_completo: nombreCompleto,
        altura_m: alturaM
    };
    if (pesoKg != null && pesoKg !== '') body.peso_kg = pesoKg;
    await fetchJsonFutbol(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function eliminarUsuarioFutbol(idUsuario) {
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}`;
    await fetchJsonFutbol(url, { method: 'DELETE' });
}

async function obtenerUsuariosFutbol() {
    const url = `${getFutbolBaseUrl()}/api/usuarios`;
    return await fetchJsonFutbol(url);
}

async function obtenerUsuariosFutbolPaginados({ search = '', limit = 20, offset = 0 }) {
    const query = new URLSearchParams({
        paginado: '1',
        search,
        limit: String(limit),
        offset: String(offset)
    });
    const url = `${getFutbolBaseUrl()}/api/usuarios?${query.toString()}`;
    const payload = await fetchJsonFutbol(url);

    if (Array.isArray(payload)) {
        const items = payload
            .sort((a, b) => String(a.alias || '').localeCompare(String(b.alias || '')))
            .filter((u) => {
                if (!search) return true;
                const txt = `${u.alias || ''} ${u.nombre_completo || ''} ${u.altura_m || ''}`.toLowerCase();
                return txt.includes(search.toLowerCase());
            })
            .slice(offset, offset + limit);

        const filtradosTotal = payload.filter((u) => {
            if (!search) return true;
            const txt = `${u.alias || ''} ${u.nombre_completo || ''} ${u.altura_m || ''}`.toLowerCase();
            return txt.includes(search.toLowerCase());
        }).length;

        return {
            items,
            total: filtradosTotal,
            limit,
            offset,
            has_more: (offset + items.length) < filtradosTotal,
        };
    }

    return {
        items: Array.isArray(payload.items) ? payload.items : [],
        total: Number(payload.total || 0),
        limit: Number(payload.limit || limit),
        offset: Number(payload.offset || offset),
        has_more: Boolean(payload.has_more),
    };
}

// ── Endpoints avanzados (analítica del módulo futbol) ──

async function obtenerCurvasGolpeo(idGolpeo) {
    const url = `${getFutbolBaseUrl()}/api/golpeos/${idGolpeo}/curvas`;
    return fetchJsonFutbol(url);
}

async function obtenerLandmarksGolpeo(idGolpeo) {
    const url = `${getFutbolBaseUrl()}/api/golpeos/${idGolpeo}/landmarks`;
    return fetchJsonFutbol(url);
}

async function obtenerAlertasGolpeo(idGolpeo) {
    const url = `${getFutbolBaseUrl()}/api/golpeos/${idGolpeo}/alertas`;
    return fetchJsonFutbol(url);
}

async function obtenerFatigaUsuarioFutbol(idUsuario, metrica = 'velocidad_pie_ms') {
    const q = new URLSearchParams({ metrica });
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/fatiga?${q.toString()}`;
    return fetchJsonFutbol(url);
}

async function obtenerTendenciaUsuarioFutbol(idUsuario, metrica = 'velocidad_pie_ms', semanas = 4) {
    const q = new URLSearchParams({ metrica, semanas: String(semanas) });
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/tendencia?${q.toString()}`;
    return fetchJsonFutbol(url);
}

async function obtenerComparativaUsuarioFutbol(idUsuario, n = 4) {
    const q = new URLSearchParams({ n: String(n) });
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/comparativa?${q.toString()}`;
    return fetchJsonFutbol(url);
}

async function obtenerAlertasTendenciaFutbol(idUsuario) {
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/alertas_tendencia`;
    return fetchJsonFutbol(url);
}

async function obtenerAnaliticaAvanzadaFutbol(idUsuario, metrica = 'velocidad_pie_ms') {
    const q = new URLSearchParams({ metrica });
    const url = `${getFutbolBaseUrl()}/api/usuarios/${idUsuario}/analitica_avanzada?${q.toString()}`;
    return fetchJsonFutbol(url);
}

// Genera vídeo anotado y devuelve un Blob (mp4).
async function generarVideoAnotadoFutbol(videoBlob, opciones = {}) {
    const formData = new FormData();
    formData.append('video', videoBlob, 'golpeo.webm');
    if (opciones.frameImpacto != null) {
        formData.append('frame_impacto', String(opciones.frameImpacto));
    }
    if (opciones.piernaGolpeo) {
        formData.append('pierna_golpeo', String(opciones.piernaGolpeo));
    }

    const url = `${getFutbolBaseUrl()}/api/futbol/video-anotado`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);  // 60s para procesamiento de video
    
    try {
        const respuesta = await fetch(url, { 
            method: 'POST', 
            body: formData,
            signal: controller.signal 
        });
        clearTimeout(timeout);
        
        if (!respuesta.ok) {
            let mensaje = `Error HTTP ${respuesta.status}`;
            try {
                const data = await respuesta.json();
                mensaje = data.error || data.mensaje || mensaje;
            } catch (_e) { /* ignore */ }
            throw new Error(mensaje);
        }
        return await respuesta.blob();
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error('Timeout: generación de video anotado excedió 60s. Intenta con un video más corto.');
        }
        throw error;
    }
}

// ── Panel analítico de fútbol ──────────────────────────────────────────────

let _graficaTendenciaFutbol = null;
let _graficaCorrFutbol = null;
const CHART_BOX_HEIGHT_FUTBOL = 220;

function _fmtFutbol(val, decimales = 2) {
    const n = Number(val);
    return Number.isFinite(n) ? n.toFixed(decimales) : '--';
}

function _asignarTextoFutbol(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
}

function _fijarTamanoGraficasFutbol() {
    ['wrap-grafica-tendencia', 'wrap-grafica-corr-vel-estab'].forEach((wid) => {
        const w = document.getElementById(wid);
        if (!w) return;
        const h = `${CHART_BOX_HEIGHT_FUTBOL}px`;
        w.style.setProperty('height', h, 'important');
        w.style.setProperty('min-height', h, 'important');
        w.style.setProperty('max-height', h, 'important');
        w.style.setProperty('overflow', 'hidden', 'important');
        const c = w.querySelector('canvas');
        if (c) {
            c.style.setProperty('height', '100%', 'important');
            c.style.setProperty('max-height', '100%', 'important');
            c.style.setProperty('width', '100%', 'important');
        }
    });
}

function limpiarAnaliticaPanelFutbol(mensaje = 'Selecciona un usuario para ver su tendencia.') {
    _asignarTextoFutbol('analitica-estado', mensaje);
    _asignarTextoFutbol('metrica-pendiente-historial', '-- m/s/sem');
    _asignarTextoFutbol('metrica-r2', '--');
    _asignarTextoFutbol('metrica-prediccion', '-- m/s');
    _asignarTextoFutbol('metrica-estado', '--');
    _asignarTextoFutbol('metrica-pendiente-sesion', '-- m/s/golpeo');
    _asignarTextoFutbol('metrica-caida', '--%');
    _asignarTextoFutbol('sesiones-resumen', '--');
    _asignarTextoFutbol('correlaciones-resumen', '--');
    _asignarTextoFutbol('estancamiento-resumen', '--');
    _asignarTextoFutbol('prediccion-multi-resumen', '--');
    _asignarTextoFutbol('ranking-resumen', '--');

    const fa = document.getElementById('fatiga-alerta');
    if (fa) { fa.style.display = 'none'; fa.textContent = ''; }
    const at = document.getElementById('alertas-tendencia');
    if (at) { at.style.display = 'none'; at.textContent = ''; }

    if (_graficaTendenciaFutbol) { _graficaTendenciaFutbol.destroy(); _graficaTendenciaFutbol = null; }
    if (_graficaCorrFutbol) { _graficaCorrFutbol.destroy(); _graficaCorrFutbol = null; }

    const wCorr = document.getElementById('wrap-grafica-corr-vel-estab');
    const cCorr = document.getElementById('grafica-corr-vel-estab');
    const eCorr = document.getElementById('empty-grafica-corr-vel-estab');
    if (wCorr) wCorr.classList.add('is-empty');
    if (cCorr) cCorr.style.display = 'none';
    if (eCorr) { eCorr.textContent = 'No hay muestras suficientes para esta correlacion.'; eCorr.style.display = 'block'; }
}

function _renderGraficaTendenciaFutbol(historial, metrica, unidad) {
    _fijarTamanoGraficasFutbol();
    const canvas = document.getElementById('grafica-tendencia');
    if (!canvas || !window.Chart || !Array.isArray(historial) || historial.length === 0) return;

    const labels = historial.map((p, idx) => {
        const f = new Date(p.fecha);
        return Number.isNaN(f.getTime()) ? `Golpeo ${idx + 1}` : f.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    });
    const reales = historial.map((p) => Number(p.valor ?? p.velocidad_pie_ms ?? 0));
    const tendencia = historial.map((p) => Number(p.tendencia_valor ?? p.tendencia_ms ?? 0));

    if (_graficaTendenciaFutbol) { _graficaTendenciaFutbol.destroy(); _graficaTendenciaFutbol = null; }

    _graficaTendenciaFutbol = new window.Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: metrica, data: reales, borderColor: '#59ffc7', backgroundColor: 'rgba(89,255,199,0.16)', pointRadius: 3, tension: 0.28, fill: true },
                { label: 'Tendencia', data: tendencia, borderColor: '#cb9cff', borderDash: [7, 5], pointRadius: 0, tension: 0, fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#e0e0e0', font: { size: 11 } } } },
            scales: {
                x: { ticks: { color: '#aaa', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
                y: { ticks: { color: '#aaa', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: unidad, color: '#888' } }
            }
        }
    });
}

function _renderGraficaCorrFutbol(datos) {
    _fijarTamanoGraficasFutbol();
    const canvas = document.getElementById('grafica-corr-vel-estab');
    const wCorr = document.getElementById('wrap-grafica-corr-vel-estab');
    const eCorr = document.getElementById('empty-grafica-corr-vel-estab');
    if (!canvas || !window.Chart) return;

    const puntos = datos?.correlaciones?.vel_estabilidad?.puntos || [];
    if (puntos.length < 3) {
        if (wCorr) wCorr.classList.add('is-empty');
        if (canvas) canvas.style.display = 'none';
        if (eCorr) eCorr.style.display = 'block';
        return;
    }

    if (wCorr) wCorr.classList.remove('is-empty');
    if (canvas) canvas.style.display = 'block';
    if (eCorr) eCorr.style.display = 'none';

    if (_graficaCorrFutbol) { _graficaCorrFutbol.destroy(); _graficaCorrFutbol = null; }

    _graficaCorrFutbol = new window.Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Vel. pie vs Estabilidad',
                data: puntos.map((p) => ({ x: Number(p.velocidad ?? p.x ?? 0), y: Number(p.estabilidad ?? p.y ?? 0) })),
                backgroundColor: 'rgba(89,255,199,0.55)',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#e0e0e0', font: { size: 11 } } } },
            scales: {
                x: { title: { display: true, text: 'Vel. pie (m/s)', color: '#888' }, ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                y: { title: { display: true, text: 'Estabilidad', color: '#888' }, ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } }
            }
        }
    });
}

function _actualizarPanelAnaliticaFutbol(tendencia, fatiga, alertas) {
    const pendiente = Number(tendencia.pendiente || tendencia.pendiente_ms_semana || 0);
    const r2 = Number(tendencia.r2 || 0);
    const prediccion = Number(tendencia.prediccion_4_semanas || 0);
    const pendienteSesion = Number(fatiga.pendiente || 0);
    const caida = Number(fatiga.caida_porcentual || 0);
    const unidad = tendencia.unidad || 'm/s';

    _asignarTextoFutbol('metrica-pendiente-historial', `${pendiente.toFixed(3)} ${unidad}/sem`);
    _asignarTextoFutbol('metrica-r2', r2.toFixed(3));
    _asignarTextoFutbol('metrica-prediccion', `${prediccion.toFixed(3)} ${unidad}`);
    _asignarTextoFutbol('metrica-estado', (tendencia.estado || '--').charAt(0).toUpperCase() + (tendencia.estado || '--').slice(1));
    _asignarTextoFutbol('metrica-pendiente-sesion', `${pendienteSesion.toFixed(3)} ${unidad}/golpeo`);
    _asignarTextoFutbol('metrica-caida', `${caida.toFixed(2)}% (${Number(fatiga.numero_golpeos || fatiga.numero_saltos || 0)} golpeos)`);

    const info = [`${Number(tendencia.numero_golpeos || tendencia.numero_saltos || 0)} golpeos en historial`];
    _asignarTextoFutbol('analitica-estado', info.join(' | '));

    const fa = document.getElementById('fatiga-alerta');
    if (fa) {
        if (Boolean(fatiga.fatiga_significativa)) {
            fa.style.display = 'block';
            fa.textContent = `Alerta de fatiga: caida de ${caida.toFixed(1)}% en la sesion actual.`;
        } else {
            fa.style.display = 'none';
        }
    }

    const at = document.getElementById('alertas-tendencia');
    if (at) {
        if (Array.isArray(alertas) && alertas.length > 0) {
            at.style.display = 'block';
            at.textContent = alertas.map((a) => `• ${a.mensaje}`).join(' ');
        } else {
            at.style.display = 'none';
        }
    }

    const metrica = document.getElementById('metrica-analitica')?.value || 'velocidad_pie_ms';
    _renderGraficaTendenciaFutbol(tendencia.historial || [], metrica, unidad);
}

function _actualizarPanelAvanzadoFutbol(avanzada) {
    const sesiones = avanzada?.comparativa_sesiones?.sesiones || [];
    if (sesiones.length >= 2) {
        const a = sesiones[0];
        const b = sesiones[1];
        const delta = Number(b.media || 0) - Number(a.media || 0);
        const u = avanzada?.comparativa_sesiones?.unidad || '';
        _asignarTextoFutbol('sesiones-resumen',
            `Sesion 1: ${_fmtFutbol(a.media)} ${u}\nSesion 2: ${_fmtFutbol(b.media)} ${u}\nVariacion: ${delta >= 0 ? '+' : ''}${_fmtFutbol(delta)} ${u}`
        );
    } else {
        _asignarTextoFutbol('sesiones-resumen', 'No hay sesiones suficientes.');
    }

    const corr = avanzada?.correlaciones || {};
    _asignarTextoFutbol('correlaciones-resumen',
        `r vel-estabilidad: ${_fmtFutbol(corr.vel_estabilidad?.corr ?? corr.corr_vel_estabilidad, 3)}\nr cadera-estabilidad: ${_fmtFutbol(corr.cadera_estabilidad?.corr ?? corr.corr_cadera_estabilidad, 3)}`
    );

    const em = avanzada?.estancamiento_mejora || {};
    if (em.suficientes_datos) {
        let estado = 'estable';
        if (em.mejora_significativa) estado = 'mejora significativa';
        if (em.empeora_significativa) estado = 'caida significativa';
        if (em.estancado) estado = 'estancamiento';
        _asignarTextoFutbol('estancamiento-resumen', `Estado: ${estado}\nDelta: ${_fmtFutbol(em.delta)}\nDelta %: ${_fmtFutbol(em.delta_pct)}%`);
    } else {
        _asignarTextoFutbol('estancamiento-resumen', em.mensaje || 'No hay datos suficientes.');
    }

    const pm = avanzada?.prediccion_multivariable || {};
    if (pm.suficientes_datos) {
        _asignarTextoFutbol('prediccion-multi-resumen',
            `Prediccion 4 semanas: ${_fmtFutbol(pm.prediccion_4_semanas)} m/s\nR2: ${_fmtFutbol(pm.r2, 3)}\nMuestras: ${Number(pm.muestras || 0)}`
        );
    } else {
        _asignarTextoFutbol('prediccion-multi-resumen', pm.mensaje || 'No hay datos suficientes.');
    }

    const top = avanzada?.rankings?.top_sesiones || [];
    if (top.length > 0) {
        const primeros = top.slice(0, 3).map((t, i) => `${i + 1}. ${t.alias || 'Usuario'} - ${_fmtFutbol(t.media_velocidad_pie_ms)} m/s`);
        _asignarTextoFutbol('ranking-resumen', primeros.join('\n'));
    } else {
        _asignarTextoFutbol('ranking-resumen', 'No hay ranking disponible.');
    }

    _renderGraficaCorrFutbol(avanzada);
}

function getFutbolMetricaAnalitica() {
    return document.getElementById('metrica-analitica')?.value || 'velocidad_pie_ms';
}

