// api_futbol.js — llamadas al backend de futbol.
// getFutbolBaseUrl() se carga desde js/config.js

// Llama al backend y devuelve JSON con manejo de errores.
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

// Envia el video grabado al endpoint de analisis.
async function analizarGolpeo(videoBlob, opciones = {}) {
    const formData = new FormData();
    formData.append('video', videoBlob, 'golpeo.webm');

    if (opciones.idUsuario) {
        formData.append('id_usuario', String(opciones.idUsuario));
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
