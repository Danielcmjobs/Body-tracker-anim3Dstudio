function formatearFecha(fechaIso) {
    if (!fechaIso) {
        return 'Sin fecha';
    }
    const fecha = new Date(fechaIso);
    if (Number.isNaN(fecha.getTime())) {
        return 'Sin fecha';
    }
    return fecha.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatearNumero(valor, decimales = 1) {
    if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
        return '--';
    }
    return Number(valor).toFixed(decimales);
}

function crearControlesVideo(videoEl) {
    const controles = document.createElement('div');
    controles.className = 'video-controls-row';

    const btnPlayPause = document.createElement('button');
    btnPlayPause.type = 'button';
    btnPlayPause.className = 'sensor-btn ghost-btn video-mini-btn';
    btnPlayPause.textContent = 'Play/Pause';
    btnPlayPause.addEventListener('click', () => {
        if (videoEl.paused) {
            videoEl.play().catch(() => {
                // Ignorar bloqueo de autoplay.
            });
        } else {
            videoEl.pause();
        }
    });

    const btnBack = document.createElement('button');
    btnBack.type = 'button';
    btnBack.className = 'sensor-btn ghost-btn video-mini-btn';
    btnBack.textContent = '-10s';
    btnBack.addEventListener('click', () => {
        videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
    });

    const btnForward = document.createElement('button');
    btnForward.type = 'button';
    btnForward.className = 'sensor-btn ghost-btn video-mini-btn';
    btnForward.textContent = '+10s';
    btnForward.addEventListener('click', () => {
        const dur = Number.isFinite(videoEl.duration) ? videoEl.duration : videoEl.currentTime + 10;
        videoEl.currentTime = Math.min(dur, videoEl.currentTime + 10);
    });

    controles.append(btnBack, btnPlayPause, btnForward);
    return controles;
}

function crearCardVideo(video) {
    const card = document.createElement('article');
    card.className = 'video-card';

    const header = document.createElement('div');
    header.className = 'video-card-header';

    const titulo = document.createElement('h3');
    titulo.className = 'video-card-title';
    const nombreUsuario = video.alias || video.nombre || 'Usuario';
    titulo.textContent = `${nombreUsuario} · Golpeo`;

    const meta = document.createElement('p');
    meta.className = 'sensor-nota';
    const pierna = video.pierna_golpeo || '--';
    const rodilla = formatearNumero(video.angulo_rodilla_deg);
    meta.textContent = `${formatearFecha(video.fecha_golpeo)} · Pierna: ${pierna} · Ang. rodilla: ${rodilla} deg`;

    header.append(titulo, meta);

    const videoEl = document.createElement('video');
    videoEl.className = 'video-player';
    videoEl.controls = true;
    videoEl.preload = 'metadata';
    videoEl.src = `${getFutbolBaseUrl()}/api/videos/${video.id_golpeo}/stream`;

    const controles = crearControlesVideo(videoEl);

    card.append(header, videoEl, controles);
    return card;
}

function renderComparativas(comparativas) {
    const container = document.getElementById('comparativas-container');
    const empty = document.getElementById('comparativas-empty');
    if (!container || !empty) {
        return;
    }

    container.innerHTML = '';

    if (!comparativas || comparativas.length === 0) {
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';

    comparativas.forEach((grupo) => {
        const card = document.createElement('article');
        card.className = 'comparativa-card';

        const titulo = document.createElement('h3');
        titulo.className = 'comparativa-card-title';
        const nombreGrupo = grupo.alias || grupo.nombre || 'Usuario';
        titulo.textContent = `Comparativa · ${nombreGrupo}`;

        const meta = document.createElement('p');
        meta.className = 'sensor-nota';
        meta.textContent = `Inicio: ${formatearFecha(grupo.fecha_inicio)} · Fin: ${formatearFecha(grupo.fecha_fin)} · ${grupo.total_videos || 0} videos`;

        const videosWrap = document.createElement('div');
        videosWrap.className = 'comparativa-videos-grid';

        (grupo.videos || []).forEach((video) => {
            videosWrap.appendChild(crearCardVideo(video));
        });

        card.append(titulo, meta, videosWrap);
        container.appendChild(card);
    });
}

function renderIndividuales(individuales) {
    const container = document.getElementById('individuales-container');
    const empty = document.getElementById('individuales-empty');
    if (!container || !empty) {
        return;
    }

    container.innerHTML = '';

    if (!individuales || individuales.length === 0) {
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    individuales.forEach((video) => {
        container.appendChild(crearCardVideo(video));
    });
}

async function cargarUsuarios() {
    const select = document.getElementById('filtro-usuario');
    if (!select) {
        return;
    }

    select.innerHTML = '';

    const optionTodos = document.createElement('option');
    optionTodos.value = '';
    optionTodos.textContent = 'Todos los usuarios';
    select.appendChild(optionTodos);

    const payload = await fetchJsonFutbol(`${getFutbolBaseUrl()}/api/usuarios_futbol?paginado=1&limit=200&offset=0`);
    const usuarios = Array.isArray(payload) ? payload : (payload.usuarios || payload.items || []);

    usuarios
        .sort((a, b) => String(a.alias || '').localeCompare(String(b.alias || '')))
        .forEach((u) => {
            const opt = document.createElement('option');
            opt.value = String(u.id_usuario);
            const nombre = u.alias || u.nombre || 'Usuario';
            opt.textContent = `${nombre} (ID ${u.id_usuario})`;
            select.appendChild(opt);
        });
}

async function cargarBiblioteca() {
    const estado = document.getElementById('videos-estado');
    const usuario = document.getElementById('filtro-usuario')?.value || '';

    if (estado) {
        estado.textContent = 'Cargando biblioteca...';
    }

    const params = new URLSearchParams();
    if (usuario) params.set('id_usuario', usuario);

    const url = `${getFutbolBaseUrl()}/api/videos${params.toString() ? `?${params.toString()}` : ''}`;
    const payload = await fetchJsonFutbol(url);

    renderComparativas(payload.comparativas || []);
    renderIndividuales(payload.individuales || []);

    if (estado) {
        const total = Number(payload.totales?.videos || 0);
        estado.textContent = `${total} videos encontrados.`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const estado = document.getElementById('videos-estado');
    const btnRefrescar = document.getElementById('btn-refrescar-videos');

    try {
        await cargarUsuarios();
        await cargarBiblioteca();
    } catch (error) {
        if (estado) {
            estado.textContent = `Error: ${error.message}`;
            estado.style.color = '#ff6b6b';
        }
    }

    document.getElementById('filtro-usuario')?.addEventListener('change', () => {
        cargarBiblioteca().catch((error) => {
            if (estado) {
                estado.textContent = `Error: ${error.message}`;
                estado.style.color = '#ff6b6b';
            }
        });
    });

    btnRefrescar?.addEventListener('click', () => {
        cargarBiblioteca().catch((error) => {
            if (estado) {
                estado.textContent = `Error: ${error.message}`;
                estado.style.color = '#ff6b6b';
            }
        });
    });
});
