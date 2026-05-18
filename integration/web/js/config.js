/**
 * config.js — Constantes y utilidades compartidas por todos los módulos JS.
 *
 * Centraliza puertos y URLs del backend para no repetirlos en cada script.
 */

const BACKEND_SALTO_PORT = 5001;
const BACKEND_SENSOR_PORT = 5000;
const BACKEND_FUTBOL_PORT = 5002;
const BACKEND_PROTOCOL = 'https';

function getCurrentHost() {
    const host = (window.location.hostname || '').trim();
    return host || 'localhost';
}

function getCurrentProtocol() {
    // Unificar entornos: siempre HTTPS para evitar mixed-content y errores de camara.
    return BACKEND_PROTOCOL;
}

function getBackendBaseUrl() {
    return `${getCurrentProtocol()}://${getCurrentHost()}:${BACKEND_SALTO_PORT}`;
}

function getSensorBaseUrl() {
    return `${getCurrentProtocol()}://${getCurrentHost()}:${BACKEND_SENSOR_PORT}`;
}

function getFutbolBaseUrl() {
    return `${getCurrentProtocol()}://${getCurrentHost()}:${BACKEND_FUTBOL_PORT}`;
}

// Configuracion funcional del frontend.
// `usarMLBalon` activa el refinado offline en backend (si hay modelo configurado).
window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.futbol = Object.assign(
    {
        usarMLBalon: false
    },
    window.APP_CONFIG.futbol || {}
);
