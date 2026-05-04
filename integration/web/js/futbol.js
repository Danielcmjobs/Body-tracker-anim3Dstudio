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
            mostrarToast('No se pudo acceder a la camara.', 'error');
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
            await procesarVideo(videoBlob);
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
    async function procesarVideo(videoBlob) {
        mostrarToast('Procesando video...', 'info');
        try {
            const resultado = await analizarGolpeo(videoBlob);
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
            await procesarVideo(archivo);
            if (labelVisual) {
                labelVisual.textContent = 'Subir video de la galeria';
                labelVisual.classList.remove('uploading');
            }
            inputArchivo.value = '';
        });
    }

    iniciarCamara();

    // Asegura que la camara se libere al salir.
    window.addEventListener('beforeunload', () => {
        detenerCamara();
    });
});
