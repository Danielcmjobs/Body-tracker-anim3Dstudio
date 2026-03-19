document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('vista-camara');
    const btnGrabar = document.getElementById('btn-grabar');
    const btnText = document.getElementById('btn-text');
    
    let mediaRecorder;
    let fragmentosVideo = [];
    let estaGrabando = false;

    // 1. Solicitar acceso a la cámara trasera
    async function iniciarCamara() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment', // Fuerza la cámara trasera en móviles
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false // El audio no es necesario para el cálculo
            });
            
            videoElement.srcObject = stream;
            prepararGrabacion(stream);
            
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert('Es necesario dar permisos de cámara para medir el salto.');
        }
    }

    // 2. Configurar el motor de grabación
    function prepararGrabacion(stream) {
        // Usar formato compatible con la mayoría de navegadores móviles
        const opciones = { mimeType: 'video/webm;codecs=vp8' };
        
        try {
            mediaRecorder = new MediaRecorder(stream, opciones);
        } catch (e) {
            // Fallback para iOS Safari que requiere mp4
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
        }

        mediaRecorder.ondataavailable = (evento) => {
            if (evento.data.size > 0) {
                fragmentosVideo.push(evento.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Cuando se detiene, se empaqueta el vídeo en un archivo
            const blobVideo = new Blob(fragmentosVideo, { type: mediaRecorder.mimeType });
            fragmentosVideo = []; // Limpiar para el siguiente salto
            
            // Disparar un evento personalizado para que api_salto.js lo capture
            const eventoVideoListo = new CustomEvent('videoListo', { detail: blobVideo });
            document.dispatchEvent(eventoVideoListo);
        };
    }

    // 3. Control del botón de grabación
    btnGrabar.addEventListener('click', () => {
        if (!mediaRecorder) return;

        if (!estaGrabando) {
            // Empezar a grabar
            mediaRecorder.start();
            estaGrabando = true;
            btnGrabar.classList.add('recording');
            btnText.textContent = 'Detener';
        } else {
            // Parar la grabación
            mediaRecorder.stop();
            estaGrabando = false;
            btnGrabar.classList.remove('recording');
            btnText.textContent = 'Procesando...';
            btnGrabar.disabled = true; // Evitar multiples clics mientras procesa
        }
    });

    // Arrancar la cámara al cargar la página
    iniciarCamara();
});