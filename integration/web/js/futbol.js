// futbol.js — flujo de grabacion y resultados.

// Inicializa el flujo de grabacion cuando el DOM esta listo.
document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('vista-camara');
    const btnGrabar = document.getElementById('btn-grabar');
    const btnText = document.getElementById('btn-text');
    const indicador = document.getElementById('indicador-ia');
    const inputArchivo = document.getElementById('input-archivo-final');
    const labelVisual = document.getElementById('label-visual');

    let mediaRecorder = null;
    let chunks = [];
    let stream = null;
    let grabando = false;

    // Muestra un toast informativo temporal.
    function mostrarToast(mensaje, tipo = 'info', duracionMs = 2200) {
        const toast = document.getElementById('toast-aviso');
        if (!toast) {
            return;
        }
        toast.textContent = mensaje;
        toast.classList.remove('info', 'success', 'warn', 'error', 'show');
        toast.classList.add(tipo);
        // Dispara la animacion de entrada del toast.
        requestAnimationFrame(() => toast.classList.add('show'));
        // Oculta el toast tras el tiempo indicado.
        setTimeout(() => toast.classList.remove('show'), duracionMs);
    }

    // Solicita permisos y conecta el stream de la camara.
    async function iniciarCamara() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            mostrarToast('El navegador no soporta camara.', 'error');
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
            videoElement.srcObject = stream;
            if (indicador) {
                indicador.textContent = 'Motor listo';
                indicador.classList.add('ia-lista');
            }
        } catch (_e) {
            mostrarToast('No se pudo acceder a la camara. Verifica permisos y abre la pagina en https/localhost.', 'error');
        }
    }

    // Detiene el stream y libera recursos de video.
    function detenerCamara() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        videoElement.srcObject = null;
    }

    // Arranca la grabacion con MediaRecorder.
    function getUsuarioActivo() {
        const idUsuario = sessionStorage.getItem('idUser');
        if (!idUsuario) {
            return null;
        }
        return { idUsuario: Number(idUsuario) };
    }

    function getPreferenciaGuardarVideo() {
        const opcion = document.querySelector('input[name="guardar-video-tiempo-real"]:checked');
        return opcion ? opcion.value : 'no';
    }

    async function iniciarGrabacion() {
        if (typeof MediaRecorder === 'undefined') {
            mostrarToast('La grabacion no esta soportada en este navegador.', 'error');
            return;
        }
        if (!stream) {
            await iniciarCamara();
        }
        if (!stream) {
            return;
        }

        chunks = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
            ? 'video/webm; codecs=vp9'
            : 'video/webm';
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        // Acumula los fragmentos de video grabados.
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                chunks.push(event.data);
            }
        };
        // Procesa el video una vez finaliza la grabacion.
        mediaRecorder.onstop = async () => {
            const videoBlob = new Blob(chunks, { type: 'video/webm' });
            await procesarVideo(videoBlob, 'ia_vivo');
        };
        mediaRecorder.start();
        grabando = true;
        btnGrabar.classList.add('recording');
        btnText.textContent = 'Grabando...';
    }

    // Detiene la grabacion y actualiza la UI.
    function detenerGrabacion() {
        if (mediaRecorder && grabando) {
            mediaRecorder.stop();
        }
        grabando = false;
        btnGrabar.classList.remove('recording');
        btnText.textContent = 'Iniciar grabacion';
    }

    // Envia el video al backend y muestra los resultados.
    async function procesarVideo(videoBlob, metodoOrigen = 'video_galeria') {
        ultimoVideoBlob = videoBlob;
        mostrarToast('Procesando video...', 'info');
        try {
            const usuario = getUsuarioActivo();
            const guardarVideo = getPreferenciaGuardarVideo() === 'si';
            const guardarBd = Boolean(usuario);

            if (!usuario && guardarVideo) {
                mostrarToast('Selecciona un usuario para guardar el video.', 'warn');
            }

            const resultado = await analizarGolpeo(videoBlob, {
                idUsuario: usuario ? usuario.idUsuario : null,
                guardarBd: guardarBd,
                guardarVideoBd: guardarVideo && guardarBd,
                metodoOrigen: metodoOrigen
            });
            pintarResultados(resultado);
            mostrarToast('Analisis completado', 'success');
        } catch (error) {
            mostrarToast(error.message || 'Error al procesar el video.', 'error');
        }
    }

    // Vuelca las metricas calculadas en el panel.
    function pintarResultados(data) {
        setValor('data-pierna-apoyo', data.pierna_apoyo || '--');
        setValor('data-pierna-golpeo', data.pierna_golpeo || '--');
        setValor('data-angulo-cadera', formatearGrados(data.angulo_cadera_deg));
        setValor('data-angulo-rodilla', formatearGrados(data.angulo_rodilla_deg));
        setValor('data-angulo-tobillo', formatearGrados(data.angulo_tobillo_deg));
        setValor('data-estabilidad', formatearNumero(data.estabilidad_tronco));
        setValor('data-confianza', formatearNumero(data.confianza));
        setValor('data-velocidad-pie', formatearNumero(data.velocidad_pie_ms));
        setValor('data-frame-impacto', data.frame_impacto != null ? String(data.frame_impacto) : '--');
        setValor('data-asimetria', formatearNumero(data.asimetria_postura_pct));
        setValor('data-apoyo-score', formatearNumero(data.apoyo && data.apoyo.score));
        setValor('data-clasificacion', data.clasificacion || '--');

        pintarFases(data.fases);
        pintarAlertas(data.alertas, data.observaciones);
        pintarCurvas(data.curvas);
        pintarVelocidades(data.velocidades_articulares, data.curvas && data.curvas.timestamps_s);
        prepararAcciones(data, ultimoVideoBlob);

        // Analítica del jugador (solo si hay usuario activo)
        const usuario = getUsuarioActivo();
        if (usuario) {
            cargarAnaliticaUsuario(usuario.idUsuario).catch(() => {});
        }
    }

    function pintarFases(fases) {
        const panel = document.getElementById('panel-fases');
        const lista = document.getElementById('lista-fases');
        if (!panel || !lista) return;
        if (!Array.isArray(fases) || fases.length === 0) {
            panel.style.display = 'none';
            return;
        }
        lista.innerHTML = '';
        for (const f of fases) {
            const li = document.createElement('li');
            li.textContent = `${f.fase}: frame ${f.frame_inicio} → ${f.frame_fin}`;
            lista.appendChild(li);
        }
        panel.style.display = 'block';
    }

    function pintarAlertas(alertas, observaciones) {
        const panel = document.getElementById('panel-alertas');
        const listaA = document.getElementById('lista-alertas');
        const listaO = document.getElementById('lista-observaciones');
        if (!panel || !listaA || !listaO) return;

        listaA.innerHTML = '';
        listaO.innerHTML = '';

        const alertasArr = Array.isArray(alertas) ? alertas : [];
        const observArr = Array.isArray(observaciones) ? observaciones : [];

        for (const a of alertasArr) {
            const li = document.createElement('li');
            li.className = `alerta-item alerta-${a.severidad || 'media'}`;
            li.textContent = `[${a.severidad || 'media'}] ${a.mensaje}`;
            listaA.appendChild(li);
        }
        for (const o of observArr) {
            const li = document.createElement('li');
            li.textContent = o;
            listaO.appendChild(li);
        }
        panel.style.display = (alertasArr.length || observArr.length) ? 'block' : 'none';
    }

    let chartCurvas = null;
    function pintarCurvas(curvas) {
        const panel = document.getElementById('panel-curvas');
        const canvas = document.getElementById('grafico-curvas');
        if (!panel || !canvas || typeof Chart === 'undefined') return;
        if (!curvas || !curvas.timestamps_s || curvas.timestamps_s.length === 0) {
            panel.style.display = 'none';
            return;
        }
        if (chartCurvas) { chartCurvas.destroy(); chartCurvas = null; }
        chartCurvas = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: curvas.timestamps_s,
                datasets: [
                    { label: 'Cadera (°)', data: curvas.cadera_deg, borderColor: '#4CAF50', tension: 0.2, spanGaps: true },
                    { label: 'Rodilla (°)', data: curvas.rodilla_deg, borderColor: '#2196F3', tension: 0.2, spanGaps: true },
                    { label: 'Tobillo (°)', data: curvas.tobillo_deg, borderColor: '#FF9800', tension: 0.2, spanGaps: true },
                ]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: { title: { display: true, text: 'tiempo (s)' } },
                    y: { title: { display: true, text: 'ángulo (°)' } }
                }
            }
        });
        panel.style.display = 'block';
    }

    let chartVelocidades = null;
    function pintarVelocidades(vel, timestamps) {
        const panel = document.getElementById('panel-velocidades');
        const canvas = document.getElementById('grafico-velocidades');
        if (!panel || !canvas || typeof Chart === 'undefined' || !vel || !timestamps) return;

        if (chartVelocidades) { chartVelocidades.destroy(); chartVelocidades = null; }
        chartVelocidades = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    { label: 'Vel. cadera', data: vel.vel_cadera_deg_s, borderColor: '#4CAF50', tension: 0.2, spanGaps: true },
                    { label: 'Vel. rodilla', data: vel.vel_rodilla_deg_s, borderColor: '#2196F3', tension: 0.2, spanGaps: true },
                    { label: 'Vel. tobillo', data: vel.vel_tobillo_deg_s, borderColor: '#FF9800', tension: 0.2, spanGaps: true },
                ]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: { title: { display: true, text: 'tiempo (s)' } },
                    y: { title: { display: true, text: '°/s' } }
                }
            }
        });
        panel.style.display = 'block';
    }

    let ultimoVideoBlob = null;
    let ultimoResultado = null;

    function prepararAcciones(data, videoBlob) {
        const panel = document.getElementById('panel-acciones');
        const btn = document.getElementById('btn-video-anotado');
        if (!panel || !btn) return;
        ultimoResultado = data;
        if (!videoBlob) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = 'block';
        btn.disabled = false;
    }

    async function generarYMostrarVideoAnotado() {
        if (!ultimoVideoBlob || !ultimoResultado) {
            mostrarToast('Primero analiza un vídeo.', 'warn');
            return;
        }
        const btn = document.getElementById('btn-video-anotado');
        const player = document.getElementById('video-anotado-player');
        if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }
        try {
            const blob = await generarVideoAnotadoFutbol(ultimoVideoBlob, {
                frameImpacto: ultimoResultado.frame_impacto,
                piernaGolpeo: ultimoResultado.pierna_golpeo,
            });
            const url = URL.createObjectURL(blob);
            if (player) {
                player.src = url;
                player.style.display = 'block';
            }
            mostrarToast('Vídeo anotado listo.', 'success');
        } catch (e) {
            mostrarToast(e.message || 'Error generando vídeo anotado.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Generar vídeo anotado'; }
        }
    }

    let chartTendencia = null;
    async function cargarAnaliticaUsuario(idUsuario) {
        const panel = document.getElementById('panel-analitica');
        if (!panel) return;
        try {
            const [fatiga, tendencia, comparativa] = await Promise.all([
                obtenerFatigaUsuarioFutbol(idUsuario),
                obtenerTendenciaUsuarioFutbol(idUsuario),
                obtenerComparativaUsuarioFutbol(idUsuario, 4),
            ]);

            setValor('data-fatiga', fatiga.fatiga_significativa
                ? `Sí (-${formatearNumero(fatiga.caida_porcentual)}%)`
                : (fatiga.numero_golpeos ? 'No' : '--'));
            setValor('data-tendencia', tendencia.estado || '--');

            // Gráfico tendencia
            const canvas = document.getElementById('grafico-tendencia');
            if (canvas && typeof Chart !== 'undefined' && Array.isArray(tendencia.historial) && tendencia.historial.length) {
                if (chartTendencia) { chartTendencia.destroy(); chartTendencia = null; }
                chartTendencia = new Chart(canvas.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: tendencia.historial.map((p) => (p.fecha || '').slice(0, 10)),
                        datasets: [
                            { label: `Valor (${tendencia.unidad || ''})`, data: tendencia.historial.map((p) => p.valor), borderColor: '#2196F3', tension: 0.2 },
                            { label: 'Tendencia', data: tendencia.historial.map((p) => p.tendencia_valor), borderColor: '#FF5722', borderDash: [5, 5], tension: 0 },
                        ]
                    },
                    options: { responsive: true, animation: false }
                });
            }

            // Tabla comparativa
            const tbody = document.getElementById('tbody-comparativa');
            if (tbody) {
                tbody.innerHTML = '';
                const items = (comparativa && comparativa.golpeos) || [];
                items.forEach((g, i) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${i + 1}</td>
                        <td>${(g.fecha || '').slice(0, 16).replace('T', ' ')}</td>
                        <td>${formatearNumero(g.velocidad_pie_ms)}</td>
                        <td>${formatearGrados(g.angulo_cadera_deg)}</td>
                        <td>${formatearGrados(g.angulo_rodilla_deg)}</td>
                        <td>${formatearGrados(g.angulo_tobillo_deg)}</td>
                        <td>${formatearNumero(g.estabilidad_tronco)}</td>
                        <td>${g.clasificacion || '--'}</td>`;
                    tbody.appendChild(tr);
                });
            }

            panel.style.display = 'block';
        } catch (_e) {
            panel.style.display = 'none';
        }
    }

    // Escribe un valor en el elemento indicado.
    function setValor(id, valor) {
        const nodo = document.getElementById(id);
        if (nodo) {
            nodo.textContent = valor;
        }
    }

    // Formatea numeros con dos decimales o placeholder.
    function formatearNumero(valor) {
        if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
            return '--';
        }
        return Number(valor).toFixed(2);
    }

    // Formatea angulos en grados con un decimal.
    function formatearGrados(valor) {
        if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
            return '-- deg';
        }
        return `${Number(valor).toFixed(1)} deg`;
    }

    if (btnGrabar) {
        // Alterna entre iniciar y detener la grabacion.
        btnGrabar.addEventListener('click', async () => {
            if (!grabando) {
                await iniciarGrabacion();
            } else {
                detenerGrabacion();
            }
        });
    }

    if (inputArchivo) {
        // Envia un video de la galeria para analizar.
        inputArchivo.addEventListener('change', async (evento) => {
            const archivo = evento.target.files[0];
            if (!archivo) {
                return;
            }
            if (labelVisual) {
                labelVisual.textContent = 'Enviando al servidor...';
                labelVisual.classList.add('uploading');
            }
            await procesarVideo(archivo, 'video_galeria');
            if (labelVisual) {
                labelVisual.textContent = 'Subir video de la galeria';
                labelVisual.classList.remove('uploading');
            }
            inputArchivo.value = '';
        });
    }

    iniciarCamara();

    // Botón de vídeo anotado
    const btnVideoAnotado = document.getElementById('btn-video-anotado');
    if (btnVideoAnotado) {
        btnVideoAnotado.addEventListener('click', generarYMostrarVideoAnotado);
    }

    // Asegura que la camara se libere al salir.
    window.addEventListener('beforeunload', () => {
        detenerCamara();
    });
});
