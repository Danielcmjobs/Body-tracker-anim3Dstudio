/**
 * Sistema de configuración en tiempo real para detección de balón.
 * Permite cambiar parámetros mientras la app está en uso.
 */

import { actualizarConfiguracionEnVivo } from './futbol_landmarks.js';

// ============================================================
// ============================================================

let configGlobal = {
    ball_detector_mode: "heuristic",
    ball_detector_enabled: false,
    rgb_threshold: 35,
    motion_threshold: 12,
    frame_diff_threshold: 20,
    confidence_threshold: 0.5,
    iou_threshold: 0.5,
    search_distance: 150,
};

const API_CONFIG_URL = "https://localhost:5002/api/futbol/config";

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
            configGlobal = { ...configGlobal, ...cambios };
            mostrarEstadoActualizado();
            console.log("[ConfigPanel] Configuración actualizada en servidor:", cambios);
            
            // Notificar a futbol_landmarks.js que recargar configuración
            notificarCambiosAOverlay(configGlobal);
            return true;
        }
    } catch (error) {
        console.warn("[ConfigPanel] Error de red al enviar config:", error);
    }
    return false;
}

/**
 * Actualiza los controles UI según configGlobal.
 */
function actualizarUIDesdeConfig() {
    const selectMode = document.getElementById("config-mode");
    const inputRGB = document.getElementById("config-rgb-threshold");
    const inputMotion = document.getElementById("config-motion-threshold");
    const inputDist = document.getElementById("config-search-distance");
    const inputConf = document.getElementById("config-confidence");
    
    if (selectMode) selectMode.value = configGlobal.ball_detector_mode;
    if (inputRGB) {
        inputRGB.value = configGlobal.rgb_threshold;
        document.getElementById("config-rgb-value").textContent = configGlobal.rgb_threshold;
    }
    if (inputMotion) {
        inputMotion.value = configGlobal.motion_threshold;
        document.getElementById("config-motion-value").textContent = configGlobal.motion_threshold;
    }
    if (inputDist) {
        inputDist.value = configGlobal.search_distance;
        document.getElementById("config-distance-value").textContent = configGlobal.search_distance;
    }
    if (inputConf) {
        inputConf.value = configGlobal.confidence_threshold;
        document.getElementById("config-conf-value").textContent = configGlobal.confidence_threshold.toFixed(2);
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
    
    // Select modo
    const selectMode = document.getElementById("config-mode");
    if (selectMode) {
        selectMode.addEventListener("change", async (e) => {
            await enviarCambiosAlServidor({ ball_detector_mode: e.target.value });
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
