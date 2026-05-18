# Análisis Técnico: Detección de Balón en Módulo Fútbol

> Documento histórico de análisis técnico.
> La implementación de detección en vivo pudo cambiar después de este análisis por razones de rendimiento.
> Para estado vigente, consultar `DOCUMENTACION_CONFIG_REALTIME_BALON.md`.

## Resumen Ejecutivo
- Describe el enfoque heurístico de detección de balón analizado en ese momento.
- Útil para entender limitaciones de diseño y decisiones posteriores de optimización.
- No debe asumirse como descripción exacta del comportamiento actual sin verificar el código vigente.

## 1. Cómo funciona actualmente

### 1.1 Algoritmo general

El sistema usa una **heurística de detección de movimiento** (optical flow) simplificada:

```
Frame N → detectar pixeles que cambiaron → Frame N+1
                    ↓
        agrupar pixeles en blobs
                    ↓
        buscar blob más grande
                    ↓
        calcular centro de masas
                    ↓
        validar distancia a pies
                    ↓
        suavizar posición temporalmente
```

### 1.2 Pasos técnicos en detalle

| Paso | Qué hace | Código |
|------|----------|--------|
| 1. **Downscaling** | Reduce el vídeo a ~160px ancho para velocidad. Es 8–10x más rápido procesando menos datos. | `targetW = Math.max(120, Math.round(videoW * escala))` |
| 2. **Extracción de fotogramas** | Captura frame N actual y compara con frame N-1 (previous frame). | `estado.ctx.drawImage(video, 0, 0, targetW, targetH)` |
| 3. **Diferencia RGB** | Para cada píxel, calcula `|R_nuevo - R_viejo| + \|G_nuevo - G_viejo\| + \|B_nuevo - B_viejo\|` y promedia. Si supera **threshold=35**, ese píxel cuenta como "movimiento". | `const diff = (dr + dg + db) / 3; if (diff > threshold)` |
| 4. **Agrupación espacial** | Acumula coordenadas de todos los píxeles con movimiento. Calcula centro de masas. | `sumX += x; sumY += y; count += 1;` |
| 5. **Filtro de tamaño** | Rechaza si hay menos de **50 píxeles** con movimiento (ruido). | `if (count < minPixels) return estado.ultimaDeteccion;` |
| 6. **Radio estimado** | Asume forma circular: `radio = √(area / π)`. | `radio = Math.max(6, Math.sqrt(count / Math.PI))` |
| 7. **Validación espacial** | Rechaza detecciones > 65 % de la distancia diagonal desde los pies. | `if (dist > maxDist) return estado.ultimaDeteccion;` |
| 8. **Suavizado temporal** | Filtra exponencial simple: nueva_pos = 0.4 × posición_anterior + 0.6 × posición_actual. Evita saltos bruscos. | `cx = (ultimaDeteccion.x * (1 - alpha)) + (cx * alpha)` con `alpha = 0.6` |
| 9. **Throttle** | Procesa 1 de cada 2 frames para aligerar carga. | `if (estado.frameCount % 2 !== 0) return estado.ultimaDeteccion;` |

---

## 2. Limitaciones fundamentales (por diseño)

### 2.1 Solo detecta **movimiento**, no **identidad del balón**

**Problema:**
El algoritmo no sabe qué es un balón. Busca cualquier cosa que se mueva rápido.

**Falsos positivos típicos:**
- Movimiento de ropa del portero o muñecas del jugador
- Sombras cambiantes
- Reflejo de luz en piso mojado
- Pelo largo moviéndose
- Público de fondo borroso
- Cambios de iluminación

**Ejemplo teórico:**
```
Frame 1: jugador con camiseta negra, balón blanco
Frame 2: camiseta gira ligeramente → píxeles negros desaparecen
         balón se mueve 15 píxeles →  píxeles blancos desaparecen

Resultado: ambos son "movimiento", el algoritmo puede confundir cuál es cuál
(especialmente si la ropa ocupa más píxeles que el balón)
```

### 2.2 Depende de **diferencia cromática RGB**, no de **color específico**

**Problema:**
Un cambio de 35 unidades RGB en cualquier canal se considera "movimiento".
- Un balón blanco (255,255,255) sobre pasto verde es fácil de detectar por diferencia RGB.
- Un balón blanco en fondo blanco es **invisible** para este algoritmo.
- Un balón gris/marrón con poco contraste puede pasar desapercibido.

**Matriz de difícultad por fondo:**

| Fondo | Balón blanco | Balón de color | Riesgo |
|-------|--------------|-----------------|--------|
| Pasto verde (cancha) | ✅ Excelente | ✅ Bueno | Bajo |
| Cielo azul (grabación desde arriba) | ✅ Bueno | ⚠️ Medio | Medio |
| Fondo blanco/gris (gimnasio, cemento) | ❌ Invisible | ⚠️ Muy medio | **Alto** |
| Noche/iluminación artificial inconsistente | ❌ Pérdida de contraste | ❌ Crítico | **Muy alto** |
| Fondo con ropa de color similar al balón | ❌ Confusión | ❌ Confusión | **Crítico** |

### 2.3 **Umbral fijo** (35 RGB, 50 píxeles) no se adapta a condiciones

**Problema:**
- En vídeo de calidad 4K o smartphone moderno con mucho ruido: threshold=35 puede ser demasiado sensible → falsos positivos.
- En vídeo comprimido (MP4 YouTube-like): threshold=35 puede ser insuficiente → falsos negativos.
- 50 píxeles mínimos presume balón de ~8px de radio. En vídeo lejano (<1m de distancia a cámara) el balón ocupa 2–3 píxeles → **se ignora completamente**.

### 2.4 **Restricción de distancia a pies** (65 % de diagonal) es demasiado estricta

**Problema:**
El balón se busca solo cerca de los pies porque se asume que va a estar cerca del pie de golpeo.
Pero:
- En el seguimiento postimpacto (ball follow-through), el balón puede haber viajado **fuera del encuadre** o muy lejos (>5 metros). El algoritmo lo pierde.
- Si la cámara está **muy alejada** del jugador, el "65 % de distancia diagonal" puede ser una región muy pequeña.
- Si el balón está en el aire (tiro alto), puede estar verticalmente alejado de los pies.

---

## 3. Casos reales de fallo

### Caso 1: Balón estático o lento

**Escena:** Jugador se acerca al balón lentamente para hacer el tiro.

```
Frame 1: balón en posición X
Frame 2: balón en posición X (sin movimiento) o X+1 píxel (casi nada)

→ Diferencia RGB < 35 o count < 50 píxeles
→ Algoritmo retorna detección anterior o null
```

**Efecto:** Durante la aproximación, el balón "desaparece" de la visualización.

### Caso 2: Balón sobre fondo similar

**Escena:** Cancha de futsal con líneas blancas, balón blanco.

```
Frame 1: balón = (255, 255, 255) sobre línea blanca = (250, 250, 250)
Frame 2: balón se mueve 1 píxel

→ Diferencia RGB ≈ 5 (línea pasa de 250 a algo más oscuro)
→ La zona donde estaba el balón tiene "movimiento",
  pero también la ropa blanca del jugador se mueve
→ Confusión: ¿cuál es el balón?
```

**Efecto:** Se dibuja un círculo en la ropa, no en el balón.

### Caso 3: Balón sale del encuadre o muy rápido

**Escena:** Tiro potente, balón vuela rápido.

```
Frame 1: balón en X
Frame 2: balón en X + 100 píxeles (trayectoria muy rápida)

En canvas downscaled (~160px ancho):
→ Balón recorre ~6 píxeles en espacio reducido
→ Detección = { x: 240, y: 150 }
→ Distancia a pies = 300 píxeles
→ maxDist = 0.65 × √(160² + 120²) ≈ 130 píxeles
→ Rechaza: if (dist > maxDist) return ultimaDeteccion;
```

**Efecto:** El balón desaparece de la pantalla porque salió de la "zona válida" de búsqueda.

### Caso 4: Iluminación inconsistente

**Escena:** Exterior con nubes, o gimnasio con luces parpadeantes.

```
Frame 1: balón visto con cierta iluminación
Frame 2: cambio de iluminación global (nube pasa, luz parpadea)

→ Todos los píxeles del fotograma cambian ligeramente
→ count > 50 píxeles, pero esparcidos por toda la imagen
→ Centro de masas está en medio de la cancha, no en el balón
→ Validación espacial rechaza posición (muy lejos de pies)
```

**Efecto:** Falso positivo seguido de rechazo, posición "congela" en detección anterior.

### Caso 5: Jugador ocluye el balón

**Escena:** Balón pasa detrás del cuerpo o pierna del jugador.

```
Frame 1: balón visible, posición detectada
Frame 2: balón se mueve detrás de la pierna

→ Píxeles del balón están bloqueados por pierna opaca
→ No hay diferencia RGB en esa zona (la pierna era ya opaca)
→ Algoritmo no ve movimiento donde está el balón
→ Retorna detección anterior (posición vieja)
```

**Efecto:** Posición del balón queda congelada o en el lugar incorrecto durante oclusión.

---

## 4. Puntos de fallo concretos en el código

### 4.1 Fallo: Threshold fijo no adaptativo

```javascript
const threshold = 35;  // ← LÍNEA 167
```

**¿Por qué falla?**
- Vídeos comprimidos (H.264 YouTube, WhatsApp) tienen artefactos que crean "ruido" falso.
- Vídeos de alta calidad (RAW, ligeramente comprimido) detectan movimiento real pero con sensibilidad excesiva.
- No hay forma de saber si 35 es correcto sin probar empíricamente para cada condición de grabación.

**Mejora propuesta:**
```javascript
// Adaptativo basado en análisis del fotograma
const stdDev = calcularDesviacionEstandarCambios(prev, curr);
const threshold = Math.max(20, stdDev * 1.5);  // 1.5× la desviación estándar
```

### 4.2 Fallo: minPixels fijo, no proporcional a tamaño de balón

```javascript
const minPixels = 50;  // ← LÍNEA 168
```

**¿Por qué falla?**
- Balón a 2 metros: ocupa ~5 píxeles en canvas downscaled.
- Balón a 10 metros: ocupa ~1 píxel.
- minPixels=50 excluye todos excepto los balones muy cercanos.

**Mejora propuesta:**
```javascript
// Minimo inversamente proporcional a distancia estimada a cámara
const distEstimada = estimarDistanciaCamara(landmarks);  // basado en tamaño del cuerpo
const minPixels = Math.max(8, 50 / Math.pow(distEstimada / 2, 2));
```

### 4.3 Fallo: Restricción de distancia a pies demasiado severa

```javascript
const maxDist = Math.max(targetW, targetH) * 0.65;  // ← LÍNEA 221
if (dist > maxDist) return estado.ultimaDeteccion;
```

**¿Por qué falla?**
- En canvas downscaled de 160×120, maxDist = 104 píxeles.
- Un tiro potente desplaza el balón ~200 píxeles (fuera del canvas efectivo).
- El algoritmo pierde el balón tan pronto como sale del radio.

**Mejora propuesta:**
```javascript
// Permitir balón más lejos, con penalización de confianza
const maxDist = Math.max(targetW, targetH) * 1.2;  // extender a 120%
const confianza = 1.0 - (dist / maxDist);  // si está cerca, confianza = 1; si está lejos, <1
if (confianza < 0.1) return estado.ultimaDeteccion;  // solo rechaza si muy lejos
```

### 4.4 Fallo: Suavizado temporal enmascara balón rápido

```javascript
const alpha = 0.6;  // ← LÍNEA 228
cx = (estado.ultimaDeteccion.x * (1 - alpha)) + (cx * alpha);
```

**¿Por qué falla?**
- Para balón lento → suavizado es perfecto.
- Para balón rápido (tiro potente) → suavizado de 0.6 es demasiado fuerte.
  - Nueva posición se "arrastra" hacia la anterior.
  - Visualización muestra un arco suave, no la trayectoria real rápida.

**Mejora propuesta:**
```javascript
// Alpha adaptativo según velocidad
const velocidad = Math.hypot(cx - ultimaDeteccion.x, cy - ultimaDeteccion.y);
const alpha = Math.max(0.2, 0.6 - (velocidad / 50));  // menos suavizado si es rápido
```

### 4.5 Fallo: Throttle pierde frames rápidos

```javascript
if (estado.frameCount % 2 !== 0) return estado.ultimaDeteccion;  // Procesa 1 de cada 2
```

**¿Por qué falla?**
- Vídeo a 30 FPS: procesa fotogramas 1, 3, 5, 7... (30ms entre procesados).
- Balón se mueve 30ms × velocidad del balón.
- En un tiro a 20 m/s, el balón recorre 60 cm = 240 píxeles en vídeo real.
- En canvas downscaled, puede salir del encuadre efectivo entre procesados.

**Mejora propuesta:**
```javascript
// Procesar cada frame para movimiento rápido, throttle para movimiento lento
const velocidadPromedio = estado.ultimaDeteccion ? velocidadActual : 0;
const procesarCadaFrame = velocidadPromedio > 5;  // píxeles/frame
if (!procesarCadaFrame && estado.frameCount % 2 !== 0) return estado.ultimaDeteccion;
```

---

## 5. Soluciones posibles por complejidad

### 5.1 Solución simple (+ 0–2 horas)

**Cambiar umbral a valores adaptativos:**

```javascript
// En lugar de threshold=35 fijo:
const datosPixeles = [];
for (let i = 0; i < data.length; i += 4) {
    const dr = Math.abs(data[i] - prev[i]);
    const dg = Math.abs(data[i + 1] - prev[i + 1]);
    const db = Math.abs(data[i + 2] - prev[i + 2]);
    const diff = (dr + dg + db) / 3;
    datosPixeles.push(diff);
}
const promedio = datosPixeles.reduce((a, b) => a + b, 0) / datosPixeles.length;
const threshold = promedio * 1.2;  // umbral es 20% sobre el promedio
```

**Ventaja:** Reduce falsos positivos por iluminación global.  
**Desventaja:** No soluciona confusión con ropa, oclusión, balón estático.

### 5.2 Solución media (+ 4–6 horas)

**Añadir detección de color + forma:**

```javascript
// 1. Detectar píxeles "blancos" (o color del balón específico)
function esColorBalon(r, g, b) {
    const luminancia = 0.299*r + 0.587*g + 0.114*b;
    const saturacion = Math.max(r, g, b) - Math.min(r, g, b);
    
    // Balón blanco: luminancia alta, saturación baja
    if (luminancia > 200 && saturacion < 50) return true;
    
    // Balón naranja/amarillo: luminancia media-alta, saturacion alta
    if (r > 200 && g > 100 && b < 100) return true;
    
    return false;
}

// 2. En el loop, acumular solo píxeles de color de balón
if (diff > threshold && esColorBalon(data[i], data[i+1], data[i+2])) {
    // Solo cuenta si es movimiento + es color de balón
}

// 3. Validar forma circular (contorno)
const esCircular = validarFormaCircular(cluster);
if (!esCircular) continue;  // Rechaza blobs no circulares (ropa)
```

**Ventaja:** Distingue balón de ropa; reduce falsos positivos significativamente.  
**Desventaja:** Requiere calibración por tipo de balón; falla si balón y fondo tienen color muy similar.

### 5.3 Solución compleja (+ 12–20 horas)

**Machine Learning (modelo YOLO o SSD):**

```javascript
// Usar modelo preentrenado de detección de objetos
const modelo = await tf.loadGraphModel('https://...ballon-detector-model.json');
const prediccion = await modelo.predict(canvasFrameNormalized);
const [{x, y, ancho, alto, confianza}] = prediccion;
```

**Ventaja:** Robustez máxima; entiende contexto ("esto es un balón aunque no se mueva").  
**Desventaja:** Overhead computacional alto (puede ralentizar análisis en tiempo real); requiere entrenar o encontrar modelo público; latencia adicional.

---

## 6. Diagnóstico para depuración

Si el sistema falla a la hora de detectar el balón:

### Checklist diagnóstico

1. **¿El balón es visible en el vídeo?**
   - Abre el archivo en cualquier reproductor.
   - ¿Se ve claramente? → Continúa.
   - ¿Es muy pequeño o muy borroso? → Acerca la cámara, mejora iluminación.

2. **¿Hay contraste entre balón y fondo?**
   - Extrae un frame con herramienta `ffmpeg`.
   - Analiza píxeles del balón vs píxeles del fondo.
   - ¿Diferencia RGB > 40? → Debería funcionar. ¿< 20? → Problema de contraste.

3. **¿El balón se mueve en el vídeo?**
   - ¿Está estático durante 2–3 segundos antes del tiro? → El algoritmo lo pierde.
   - Solución: grabación debe capturar el golpe desde el momento previo donde el balón ya se mueve.

4. **¿La distancia a cámara es razonable?**
   - Si el balón ocupa < 3 píxeles en pantalla full-HD (1080p) → Es probable que falle.
   - Solución: acerca la cámara o usa zoom.

5. **Añade logs de depuración:**

```javascript
// Modifica detectarBalon() para loguear:
console.log(`Frame ${estado.frameCount}:`, {
    count,
    threshold,
    minPixels,
    dist,
    maxDist,
    confianza: dist < maxDist ? "OK" : "RECHAZADO",
    cx, cy, radio
});
```

---

## 7. Recomendación inmediata

Para usuarios que reportan balón no detectado:

1. **Validar condiciones de grabación:**
   - Grabación a 30+ FPS con resolución ≥ 1080p.
   - Iluminación uniforme (no parpadeante).
   - Contraste visible entre balón y fondo (no balón blanco sobre fondo blanco).

2. **Implementar fallback visual:**
   - Si el algoritmo pierde el balón durante > 5 frames, mostrar "⚠️ Balón perdido" en pantalla.
   - Permitir al usuario marcar manualmente posición del balón (ajuste manual).

3. **Roadmap corto:**
   - Implementar umbral adaptativo (solución simple, 2h).
   - Añadir detección de color + forma (solución media, 6h).
   - Evaluar si se justifica ML (solución compleja, depende de prioridad).

