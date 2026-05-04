// api_futbol.js — llamadas al backend de futbol.
// getFutbolBaseUrl() se carga desde js/config.js

async function fetchJsonFutbol(url, options = {}) {
    let respuesta;
    try {
        respuesta = await fetch(url, options);
    } catch (_error) {
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

async function analizarGolpeo(videoBlob) {
    const formData = new FormData();
    formData.append('video', videoBlob, 'golpeo.webm');

    const url = `${getFutbolBaseUrl()}/api/futbol/analizar`;
    return fetchJsonFutbol(url, {
        method: 'POST',
        body: formData
    });
}
