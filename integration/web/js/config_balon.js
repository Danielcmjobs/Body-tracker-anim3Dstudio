/**
 * Sistema de configuración en tiempo real para detección de balón.
 * Permite cambiar parámetros mientras la app está en uso.
 */

// ============================================================
// ============================================================

let configGlobal = {
    ball_detector_mode: "heuristic",
    ball_detector_enabled: true,
    rgb_threshold: 35,
    motion_threshold: 12,
    frame_diff_threshold: 20,
    confidence_threshold: 0.5,
    iou_threshold: 0.5,
    search_distance: 150,
};

function resolverApiConfigUrl() {
    if (typeof getFutbolBaseUrl === "function") {
        return `${getFutbolBaseUrl()}/api/futbol/config`;
    }
    const proto = window.location.protocol === "https:" ? "https" : "http";
    const host = window.location.hostname || "localhost";
    return `${proto}://${host}:5002/api/futbol/config`;
}

const API_CONFIG_URL = resolverApiConfigUrl();

// ============================================================
// FUNCIONES DE CARGA/SINCRONIZACION
// ============================================================

/**
 * Carga la configuración actual del backend.
 */
async function cargarConfiguracionDelServidor() {
    try {
        const response = await fetch(API_CONFIG_URL, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });
        
        if (!response.ok) {
            console.warn("[ConfigPanel] Error al cargar configuración:", response.status);
            return false;
        }
        
        const datos = await response.json();
        if (datos.status === "success" && datos.settings) {
            configGlobal = { ...configGlobal, ...datos.settings };
            actualizarUIDesdeConfig();
            notificarCambiosAOverlay(configGlobal);
            console.log("[ConfigPanel] Configuración cargada del servidor:", configGlobal);
            return true;
        }
    } catch (error) {
        console.warn("[ConfigPanel] Error de red al cargar config:", error);
    }
    return false;
}

/**
 * Envía cambios de configuración al backend.
 */
async function enviarCambiosAlServidor(cambios) {
    try {
        const response = await fetch(API_CONFIG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cambios),
        });
        
        if (!response.ok) {
            console.warn("[ConfigPanel] Error al enviar configuración:", response.status);
            return false;
        }
        
        const datos = await response.json();
        if (datos.status === "success") {
            // Usar la respuesta autoritativa del servidor (puede haber coercionado valores)
            const settingsServidor = datos.settings && typeof datos.settings === "object"
                ? datos.settings
                : cambios;
            configGlobal = { ...configGlobal, ...settingsServidor };
            actualizarUIDesdeConfig();
            mostrarEstadoActualizado();
            console.log("[ConfigPanel] Configuración actualizada en servidor:", settingsServidor);

            // Notificar a futbol_landmarks.js que recargar configuración
            notificarCambiosAOverlay(configGlobal);
            return true;
        }
    } catch (error) {
        console.warn("[ConfigPanel] Error de red al enviar config:", error);
    }
    return false;
}

function notificarCambiosAOverlay(configActual) {
    if (typeof window.actualizarConfiguracionEnVivo === "function") {
        window.actualizarConfiguracionEnVivo(configActual);
        return;
    }
    console.warn("[ConfigPanel] actualizarConfiguracionEnVivo no disponible todavía.");
}

/**
 * Actualiza los controles UI según configGlobal.
 */
function actualizarUIDesdeConfig() {
    const inputRGB = document.getElementById("config-rgb-threshold");
    const inputMotion = document.getElementById("config-motion-threshold");
    const inputDist = document.getElementById("config-search-distance");
    const inputConf = document.getElementById("config-confidence");
    
    if (inputRGB) {
        inputRGB.value = configGlobal.rgb_threshold;
        const rgbValue = document.getElementById("config-rgb-value");
        if (rgbValue) rgbValue.textContent = String(configGlobal.rgb_threshold);
    }
    if (inputMotion) {
        inputMotion.value = configGlobal.motion_threshold;
        const motionValue = document.getElementById("config-motion-value");
        if (motionValue) motionValue.textContent = String(configGlobal.motion_threshold);
    }
    if (inputDist) {
        inputDist.value = configGlobal.search_distance;
        const distanceValue = document.getElementById("config-distance-value");
        if (distanceValue) distanceValue.textContent = String(configGlobal.search_distance);
    }
    if (inputConf) {
        inputConf.value = configGlobal.confidence_threshold;
        const confidenceValue = document.getElementById("config-conf-value");
        if (confidenceValue && Number.isFinite(Number(configGlobal.confidence_threshold))) {
            confidenceValue.textContent = Number(configGlobal.confidence_threshold).toFixed(2);
        }
    }
}

/**
 * Muestra el badge de "actualizado" por 2 segundos.
 */
function mostrarEstadoActualizado() {
    const statusDiv = document.getElementById("config-status");
    if (statusDiv) {
        statusDiv.style.display = "block";
        setTimeout(() => {
            statusDiv.style.display = "none";
        }, 2000);
    }
}

// ============================================================
// INICIALIZACION DE EVENTOS UI
// ============================================================

function inicializarPanelConfiguracion() {
    // Toggle panel
    const toggleBtn = document.getElementById("toggle-config-panel");
    const panelContent = document.getElementById("config-panel-content");
    
    if (toggleBtn && panelContent) {
        toggleBtn.addEventListener("click", () => {
            panelContent.style.display = panelContent.style.display === "none" ? "block" : "none";
        });
    }
    
    // Slider RGB
    const inputRGB = document.getElementById("config-rgb-threshold");
    if (inputRGB) {
        inputRGB.addEventListener("input", (e) => {
            document.getElementById("config-rgb-value").textContent = e.target.value;
        });
        inputRGB.addEventListener("change", async (e) => {
            await enviarCambiosAlServidor({ rgb_threshold: parseInt(e.target.value) });
        });
    }
    
    // Slider Motion
    const inputMotion = document.getElementById("config-motion-threshold");
    if (inputMotion) {
        inputMotion.addEventListener("input", (e) => {
            document.getElementById("config-motion-value").textContent = e.target.value;
        });
        inputMotion.addEventListener("change", async (e) => {
            await enviarCambiosAlServidor({ motion_threshold: parseInt(e.target.value) });
        });
    }
    
    // Slider Distance
    const inputDist = document.getElementById("config-search-distance");
    if (inputDist) {
        inputDist.addEventListener("input", (e) => {
            document.getElementById("config-distance-value").textContent = e.target.value;
        });
        inputDist.addEventListener("change", async (e) => {
            await enviarCambiosAlServidor({ search_distance: parseInt(e.target.value) });
        });
    }
    
    // Slider Confidence
    const inputConf = document.getElementById("config-confidence");
    if (inputConf) {
        inputConf.addEventListener("input", (e) => {
            document.getElementById("config-conf-value").textContent = parseFloat(e.target.value).toFixed(2);
        });
        inputConf.addEventListener("change", async (e) => {
            await enviarCambiosAlServidor({ confidence_threshold: parseFloat(e.target.value) });
        });
    }
}

// ============================================================
// EXPORTAR FUNCIONES PUBLICAS
// ============================================================

window.obtenerConfigBalon = () => configGlobal;

// ============================================================
// INICIALIZACION AL CARGAR
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
    inicializarPanelConfiguracion();
    await cargarConfiguracionDelServidor();
});
