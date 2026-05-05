import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// === Configuracion basica del overlay ===
const LIVE_POSE_COLOR = "#9c5cd4";
const LIVE_POSE_DOT = "#ffffff";
const BALL_COLOR = "#ffb347";
const BALL_STROKE = "#ffffff";
const BALL_ALPHA = 0.9;

const videoLive = document.getElementById("vista-camara");
const canvasLive = document.getElementById("canvas-esqueleto");
const ctxLive = canvasLive ? canvasLive.getContext("2d") : null;

const previewWrap = document.getElementById("preview-landmarks");
const previewVideo = document.getElementById("preview-video");
const previewCanvas = document.getElementById("preview-canvas");
const previewCtx = previewCanvas ? previewCanvas.getContext("2d") : null;

let poseLandmarker = null;
let landmarkerError = null;
let liveLoopActivo = false;
let previewLoopActivo = false;
let lastLiveTime = -1;
let lastPreviewTime = -1;
let previewUrl = null;

// Estado de la heuristica del balon (por flujo).
const ballStateLive = crearEstadoBalon();
const ballStatePreview = crearEstadoBalon();

function crearEstadoBalon() {
    return {
        offscreen: document.createElement("canvas"),
        ctx: null,
        prev: null,
        frameCount: 0,
        ultimaDeteccion: null,
        ancho: 0,
        alto: 0
    };
}

// Inicializa el landmarker de MediaPipe solo una vez.
async function initPoseLandmarker() {
    if (poseLandmarker) {
        return poseLandmarker;
    }
    if (landmarkerError) {
        return null;
    }

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    try {
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numPoses: 1
        });
    } catch (error) {
        landmarkerError = error;
        console.warn("No se pudo iniciar PoseLandmarker en futbol.", error);
        return null;
    }

    return poseLandmarker;
}

// Ajusta el tamano del canvas al frame real del video.
function syncCanvasToVideo(canvas, video) {
    if (!canvas || !video) {
        return false;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
        return false;
    }
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    return true;
}

// Dibuja el esqueleto y landmarks en el canvas indicado.
function drawPose(ctx, poseLandmarks) {
    if (!ctx || !poseLandmarks) {
        return;
    }
    const drawingUtils = new DrawingUtils(ctx);
    drawingUtils.drawConnectors(poseLandmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: LIVE_POSE_COLOR,
        lineWidth: 3
    });
    drawingUtils.drawLandmarks(poseLandmarks, {
        color: LIVE_POSE_DOT,
        radius: 2,
        lineWidth: 1
    });
}

// Obtiene un punto de referencia cerca de los pies para guiar la busqueda del balon.
function obtenerCentroPies(landmarks, ancho, alto) {
    if (!Array.isArray(landmarks) || landmarks.length < 33) {
        return null;
    }
    const pies = [landmarks[27], landmarks[28], landmarks[31], landmarks[32]].filter(Boolean);
    if (pies.length === 0) {
        return null;
    }
    let sumX = 0;
    let sumY = 0;
    pies.forEach((p) => {
        sumX += p.x * ancho;
        sumY += p.y * alto;
    });
    return {
        x: sumX / pies.length,
        y: sumY / pies.length
    };
}

// Heuristica simple de deteccion de balon basada en diferencia de frames (movimiento).
// - Usa un canvas reducido para rapidez.
// - Busca la nube de pixeles con mayor movimiento.
// - Ajusta la posicion con suavizado temporal.
function detectarBalon(video, landmarks, estado, salidaAncho, salidaAlto) {
    if (!video || !estado) {
        return null;
    }

    const scaleBase = 160;
    const videoW = video.videoWidth || 0;
    const videoH = video.videoHeight || 0;
    if (!videoW || !videoH) {
        return null;
    }

    const escala = scaleBase / videoW;
    const targetW = Math.max(120, Math.round(videoW * escala));
    const targetH = Math.max(90, Math.round(videoH * escala));

    if (estado.ancho !== targetW || estado.alto !== targetH) {
        estado.offscreen.width = targetW;
        estado.offscreen.height = targetH;
        estado.ancho = targetW;
        estado.alto = targetH;
        estado.ctx = estado.offscreen.getContext("2d", { willReadFrequently: true });
        estado.prev = null;
        estado.ultimaDeteccion = null;
    }

    if (!estado.ctx) {
        return null;
    }

    // Throttle: procesa 1 de cada 2 frames para aligerar.
    estado.frameCount += 1;
    if (estado.frameCount % 2 !== 0) {
        return estado.ultimaDeteccion;
    }

    estado.ctx.drawImage(video, 0, 0, targetW, targetH);
    const curr = estado.ctx.getImageData(0, 0, targetW, targetH);

    if (!estado.prev) {
        estado.prev = curr;
        return null;
    }

    const data = curr.data;
    const prev = estado.prev.data;
    const threshold = 35;
    const minPixels = 50;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let minX = targetW;
    let minY = targetH;
    let maxX = 0;
    let maxY = 0;

    for (let i = 0; i < data.length; i += 4) {
        const dr = Math.abs(data[i] - prev[i]);
        const dg = Math.abs(data[i + 1] - prev[i + 1]);
        const db = Math.abs(data[i + 2] - prev[i + 2]);
        const diff = (dr + dg + db) / 3;

        if (diff > threshold) {
            const idx = i / 4;
            const x = idx % targetW;
            const y = Math.floor(idx / targetW);
            sumX += x;
            sumY += y;
            count += 1;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    estado.prev = curr;

    if (count < minPixels) {
        return estado.ultimaDeteccion;
    }

    let cx = sumX / count;
    let cy = sumY / count;
    let radio = Math.max(6, Math.sqrt(count / Math.PI));

    const pies = obtenerCentroPies(landmarks, targetW, targetH);
    if (pies) {
        const dist = Math.hypot(cx - pies.x, cy - pies.y);
        const maxDist = Math.max(targetW, targetH) * 0.65;
        if (dist > maxDist) {
            return estado.ultimaDeteccion;
        }
    }

    // Suavizado basico para evitar saltos bruscos.
    if (estado.ultimaDeteccion) {
        const alpha = 0.6;
        cx = (estado.ultimaDeteccion.x * (1 - alpha)) + (cx * alpha);
        cy = (estado.ultimaDeteccion.y * (1 - alpha)) + (cy * alpha);
        radio = (estado.ultimaDeteccion.r * (1 - alpha)) + (radio * alpha);
    }

    estado.ultimaDeteccion = {
        x: (cx / targetW) * salidaAncho,
        y: (cy / targetH) * salidaAlto,
        r: (radio / targetW) * salidaAncho
    };

    return estado.ultimaDeteccion;
}

function drawBall(ctx, balon) {
    if (!ctx || !balon) {
        return;
    }
    ctx.save();
    ctx.globalAlpha = BALL_ALPHA;
    ctx.beginPath();
    ctx.arc(balon.x, balon.y, balon.r, 0, Math.PI * 2);
    ctx.fillStyle = BALL_COLOR;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = BALL_STROKE;
    ctx.stroke();
    ctx.restore();
}

// Loop de render en vivo (camara).
async function renderLiveLoop() {
    if (!liveLoopActivo || !videoLive || !ctxLive) {
        return;
    }

    if (!syncCanvasToVideo(canvasLive, videoLive)) {
        requestAnimationFrame(renderLiveLoop);
        return;
    }

    if (videoLive.readyState >= 2 && lastLiveTime !== videoLive.currentTime) {
        lastLiveTime = videoLive.currentTime;
        const landmarker = await initPoseLandmarker();
        if (!landmarker) {
            requestAnimationFrame(renderLiveLoop);
            return;
        }
        const results = landmarker.detectForVideo(videoLive, performance.now());

        ctxLive.clearRect(0, 0, canvasLive.width, canvasLive.height);
        const pose = results.landmarks && results.landmarks[0];
        if (pose) {
            drawPose(ctxLive, pose);
        }

        const balon = detectarBalon(videoLive, pose, ballStateLive, canvasLive.width, canvasLive.height);
        if (balon) {
            drawBall(ctxLive, balon);
        }
    }

    requestAnimationFrame(renderLiveLoop);
}

// Loop de render para la previsualizacion de video analizado.
async function renderPreviewLoop() {
    if (!previewLoopActivo || !previewVideo || !previewCtx || !previewCanvas) {
        return;
    }

    if (!syncCanvasToVideo(previewCanvas, previewVideo)) {
        requestAnimationFrame(renderPreviewLoop);
        return;
    }

    if (previewVideo.readyState >= 2 && !previewVideo.paused && lastPreviewTime !== previewVideo.currentTime) {
        lastPreviewTime = previewVideo.currentTime;
        const landmarker = await initPoseLandmarker();
        if (!landmarker) {
            requestAnimationFrame(renderPreviewLoop);
            return;
        }
        const results = landmarker.detectForVideo(previewVideo, performance.now());

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        const pose = results.landmarks && results.landmarks[0];
        if (pose) {
            drawPose(previewCtx, pose);
        }

        const balon = detectarBalon(previewVideo, pose, ballStatePreview, previewCanvas.width, previewCanvas.height);
        if (balon) {
            drawBall(previewCtx, balon);
        }
    }

    requestAnimationFrame(renderPreviewLoop);
}

function iniciarLiveOverlay() {
    if (liveLoopActivo) {
        return;
    }
    liveLoopActivo = true;
    renderLiveLoop();
}

function iniciarPreviewOverlay() {
    if (previewLoopActivo) {
        return;
    }
    previewLoopActivo = true;
    renderPreviewLoop();
}

function mostrarPreview(videoBlob) {
    if (!previewVideo || !previewWrap) {
        return;
    }

    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
    }
    previewUrl = URL.createObjectURL(videoBlob);
    previewVideo.src = previewUrl;
    previewVideo.play().catch(() => {
        // El navegador puede bloquear autoplay; el usuario puede dar play manual.
    });
    previewWrap.style.display = "block";
    iniciarPreviewOverlay();
}

// API publica para futbol.js
window.futbolLandmarksPreview = {
    setVideoBlob: (videoBlob) => {
        if (videoBlob) {
            mostrarPreview(videoBlob);
        }
    }
};

// Arranca el overlay en vivo cuando el stream esta disponible.
if (videoLive) {
    videoLive.addEventListener("loadeddata", () => {
        iniciarLiveOverlay();
    });
}
