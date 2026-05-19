"""
Servicio opcional de deteccion de balon por ML (offline, post-analisis).

No participa en la captura en vivo para no penalizar FPS del frontend.
Si no hay modelo configurado, devuelve estado deshabilitado sin romper flujo.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import cv2
import numpy as np

from config import (
    BALL_DETECTOR_CONF_THRESHOLD,
    BALL_DETECTOR_INPUT_SIZE,
    BALL_DETECTOR_IOU_THRESHOLD,
    BALL_DETECTOR_MAX_FRAMES,
    BALL_DETECTOR_MODEL_PATH,
    BALL_DETECTOR_MODE,
)
from services.settings_service import obtener_setting


@dataclass
class BallDetection:
    frame_idx: int
    timestamp_s: float
    x_px: float
    y_px: float
    w_px: float
    h_px: float
    conf: float


class BallDetectorService:
    """Detector de balon offline con backend OpenCV DNN (YOLO ONNX)."""

    COCO_SOCCER_BALL_CLASS_ID = 32

    def __init__(self) -> None:
        self.model_path = BALL_DETECTOR_MODEL_PATH
        self._net = None

    def _modo_actual(self) -> str:
        modo = obtener_setting("ball_detector_mode") or BALL_DETECTOR_MODE or "none"
        return str(modo).strip().lower()

    def _conf_threshold(self) -> float:
        try:
            return float(obtener_setting("confidence_threshold") or BALL_DETECTOR_CONF_THRESHOLD)
        except (TypeError, ValueError):
            return float(BALL_DETECTOR_CONF_THRESHOLD)

    def _iou_threshold(self) -> float:
        try:
            return float(obtener_setting("iou_threshold") or BALL_DETECTOR_IOU_THRESHOLD)
        except (TypeError, ValueError):
            return float(BALL_DETECTOR_IOU_THRESHOLD)

    def enabled(self) -> bool:
        if self._modo_actual() != "yolo_onnx":
            return False
        return bool(self.model_path and os.path.exists(self.model_path))

    def detectar_trayectoria(self, ruta_video: str) -> dict:
        modo = self._modo_actual()
        if not self.enabled():
            return {
                "enabled": False,
                "mode": modo,
                "status": "disabled",
                "reason": "Modelo no configurado o modo desactivado",
                "trayectoria": [],
            }

        if self._net is None:
            try:
                self._net = cv2.dnn.readNetFromONNX(self.model_path)
            except Exception as exc:
                return {
                    "enabled": False,
                    "mode": modo,
                    "status": "error",
                    "reason": f"No se pudo cargar modelo ONNX: {exc}",
                    "trayectoria": [],
                }

        cap = cv2.VideoCapture(ruta_video)
        if not cap.isOpened():
            return {
                "enabled": True,
                "mode": modo,
                "status": "error",
                "reason": "No se pudo abrir video para postproceso ML",
                "trayectoria": [],
            }

        # Respetar la rotación EXIF (igual que el navegador) para que las coords
        # del balón estén en el mismo sistema que el preview del frontend.
        try:
            cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
        except Exception:
            pass

        fps = cap.get(cv2.CAP_PROP_FPS)
        fps = fps if fps and fps > 0 else 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        detecciones: list[BallDetection] = []
        frame_idx = 0
        conf_th = self._conf_threshold()
        iou_th = self._iou_threshold()

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if frame_idx >= BALL_DETECTOR_MAX_FRAMES:
                    break

                # Dimensiones reales (post-rotación) del primer frame.
                if frame_idx == 0:
                    height, width = frame.shape[:2]

                det = self._detectar_en_frame(frame, frame_idx, fps, width, height, conf_th, iou_th)
                if det is not None:
                    detecciones.append(det)
                frame_idx += 1
        finally:
            cap.release()

        trayectoria = [
            {
                "frame_idx": d.frame_idx,
                "timestamp_s": round(d.timestamp_s, 4),
                "x_px": round(d.x_px, 2),
                "y_px": round(d.y_px, 2),
                "w_px": round(d.w_px, 2),
                "h_px": round(d.h_px, 2),
                "conf": round(d.conf, 4),
            }
            for d in detecciones
        ]

        return {
            "enabled": True,
            "mode": modo,
            "status": "ok",
            "frames_procesados": frame_idx,
            "detecciones": len(trayectoria),
            "trayectoria": trayectoria,
        }

    def _detectar_en_frame(
        self,
        frame: np.ndarray,
        frame_idx: int,
        fps: float,
        width: int,
        height: int,
        conf_th: float,
        iou_th: float,
    ) -> BallDetection | None:
        in_size = BALL_DETECTOR_INPUT_SIZE
        blob = cv2.dnn.blobFromImage(
            frame,
            scalefactor=1.0 / 255.0,
            size=(in_size, in_size),
            swapRB=True,
            crop=False,
        )
        self._net.setInput(blob)
        out = self._net.forward()

        boxes, scores = self._parse_yolo_output(out, width, height, conf_th)
        if not boxes:
            return None

        idxs = cv2.dnn.NMSBoxes(
            bboxes=boxes,
            scores=scores,
            score_threshold=conf_th,
            nms_threshold=iou_th,
        )
        if idxs is None or len(idxs) == 0:
            return None

        best_idx = int(np.array(idxs).reshape(-1)[0])
        x, y, w, h = boxes[best_idx]
        cx = x + (w / 2.0)
        cy = y + (h / 2.0)
        conf = float(scores[best_idx])

        return BallDetection(
            frame_idx=frame_idx,
            timestamp_s=(frame_idx / fps) if fps > 0 else 0.0,
            x_px=float(cx),
            y_px=float(cy),
            w_px=float(w),
            h_px=float(h),
            conf=conf,
        )

    def _parse_yolo_output(self, out: np.ndarray, width: int, height: int, conf_th: float) -> tuple[list[list[int]], list[float]]:
        """
        Intenta parsear formatos comunes de salida YOLO ONNX:
        - [1, N, 85]
        - [1, 84, N]
        """
        if out is None:
            return [], []

        arr = np.array(out)
        boxes: list[list[int]] = []
        scores: list[float] = []

        # Caso [1, N, 85]
        if arr.ndim == 3 and arr.shape[0] == 1 and arr.shape[2] >= 6:
            rows = arr[0]
            if rows.shape[1] >= 6:
                self._extract_from_rows(rows, width, height, boxes, scores, conf_th)

        # Caso [1, 84, N] (transpuesto)
        if not boxes and arr.ndim == 3 and arr.shape[0] == 1 and arr.shape[1] >= 6:
            rows = arr[0].T
            if rows.shape[1] >= 6:
                self._extract_from_rows(rows, width, height, boxes, scores, conf_th)

        return boxes, scores

    def _extract_from_rows(
        self,
        rows: np.ndarray,
        width: int,
        height: int,
        boxes: list[list[int]],
        scores: list[float],
        conf_th: float,
    ) -> None:
        in_size = float(BALL_DETECTOR_INPUT_SIZE)
        sx = width / in_size if in_size > 0 else 1.0
        sy = height / in_size if in_size > 0 else 1.0

        for row in rows:
            row = row.astype(float)
            if row.shape[0] < 6:
                continue

            # Formato habitual: cx, cy, w, h, obj_conf, class_probs...
            cx, cy, w, h = row[0], row[1], row[2], row[3]
            obj_conf = row[4]
            class_probs = row[5:]
            if class_probs.size == 0:
                continue

            # Prioriza clase COCO 32 (sports ball) si existe; si no, usa max.
            if class_probs.size > self.COCO_SOCCER_BALL_CLASS_ID:
                cls_score = class_probs[self.COCO_SOCCER_BALL_CLASS_ID]
            else:
                cls_score = float(np.max(class_probs))

            conf = float(obj_conf * cls_score)
            if conf < conf_th:
                continue

            x = int((cx - (w / 2.0)) * sx)
            y = int((cy - (h / 2.0)) * sy)
            bw = int(w * sx)
            bh = int(h * sy)
            if bw <= 1 or bh <= 1:
                continue

            boxes.append([x, y, bw, bh])
            scores.append(conf)

    # ───────────────────────────────────────────────────────────────────────────
    # Detector heuristico de trayectoria sin modelo ML.
    # Usa diferencia de frames + enmascarado del cuerpo a partir de los landmarks
    # ya extraidos por MediaPipe (no se duplica el coste de pose).
    # Devuelve la trayectoria del balon en coords NORMALIZADAS [0..1] para que el
    # frontend la dibuje sobre el video con cualquier resolucion.
    # ───────────────────────────────────────────────────────────────────────────
    # IDs de landmarks que se enmascaran (torso, brazos, cabeza, caderas, rodillas).
    # Los pies/tobillos (27, 28, 29, 30, 31, 32) se dejan libres porque el balon
    # esta justo a su lado en el momento del golpeo.
    _MASK_LANDMARK_IDS = list(range(0, 27))

    def detectar_trayectoria_heuristica(self, ruta_video: str, frames: list) -> dict:
        """
        Detecta la trayectoria del balon en un video ya analizado.
        `frames` es la lista de FramePose devuelta por VideoProcessor (con landmarks
        normalizados 0..1). Se usa para enmascarar el cuerpo.
        """
        cap = cv2.VideoCapture(ruta_video)
        if not cap.isOpened():
            return {
                "enabled": True,
                "mode": "heuristic",
                "status": "error",
                "reason": "No se pudo abrir el video",
                "trayectoria": [],
            }

        # Aplicar rotación EXIF (mismo sistema de coords que el preview del navegador).
        try:
            cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
        except Exception:
            pass

        fps = cap.get(cv2.CAP_PROP_FPS)
        fps = fps if fps and fps > 0 else 30.0

        # Las dimensiones reales se toman del primer frame leído (post-rotación EXIF).
        proc_w = 240
        proc_h = 0
        mask_radius = 0
        width = 0
        height = 0

        # Indexar landmarks por frame_idx para lookup O(1).
        landmarks_por_idx: dict[int, list[dict]] = {}
        for fp in frames or []:
            if getattr(fp, "landmarks", None):
                landmarks_por_idx[fp.frame_idx] = fp.landmarks

        trayectoria: list[dict] = []
        prev_gray = None
        idx = 0
        max_frames = BALL_DETECTOR_MAX_FRAMES

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if idx >= max_frames:
                    break

                if proc_h == 0:
                    height, width = frame.shape[:2]
                    if width <= 0 or height <= 0:
                        break
                    proc_h = max(90, int(round(height * proc_w / width)))
                    mask_radius = max(6, int(proc_w * 0.07))

                small = cv2.resize(frame, (proc_w, proc_h), interpolation=cv2.INTER_AREA)
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
                gray = cv2.GaussianBlur(gray, (5, 5), 0)

                if prev_gray is not None:
                    diff = cv2.absdiff(gray, prev_gray)
                    _, thresh = cv2.threshold(diff, 18, 255, cv2.THRESH_BINARY)

                    # Enmascarar el cuerpo segun los landmarks de MediaPipe.
                    lms = landmarks_por_idx.get(idx)
                    if lms:
                        for lid in self._MASK_LANDMARK_IDS:
                            if lid < len(lms):
                                lm = lms[lid]
                                if lm.get("visibility", 1.0) > 0.3:
                                    cx = int(lm.get("x", 0) * proc_w)
                                    cy = int(lm.get("y", 0) * proc_h)
                                    cv2.circle(thresh, (cx, cy), mask_radius, 0, -1)

                    # Componentes conectados → buscar el mejor candidato (compacto, no demasiado grande).
                    num, _labels, stats, centroids = cv2.connectedComponentsWithStats(thresh, connectivity=8)
                    mejor = None  # (area, cx, cy, r)
                    area_max = proc_w * proc_h * 0.04
                    for i in range(1, num):
                        area = int(stats[i, cv2.CC_STAT_AREA])
                        w_blob = int(stats[i, cv2.CC_STAT_WIDTH])
                        h_blob = int(stats[i, cv2.CC_STAT_HEIGHT])
                        if area < 10 or area > area_max:
                            continue
                        if w_blob <= 1 or h_blob <= 1:
                            continue
                        aspect = max(w_blob, h_blob) / max(1, min(w_blob, h_blob))
                        if aspect > 3.0:  # los balones son aprox redondos
                            continue
                        if mejor is None or area > mejor[0]:
                            cx_b, cy_b = centroids[i]
                            r_b = max(w_blob, h_blob) / 2.0
                            mejor = (area, float(cx_b), float(cy_b), float(r_b))

                    if mejor is not None:
                        _, cx_b, cy_b, r_b = mejor
                        trayectoria.append({
                            "frame_idx": idx,
                            "timestamp_s": round(idx / fps, 4),
                            "x_norm": round(cx_b / proc_w, 4),
                            "y_norm": round(cy_b / proc_h, 4),
                            "r_norm": round(r_b / proc_w, 4),
                        })

                prev_gray = gray
                idx += 1
        finally:
            cap.release()

        return {
            "enabled": True,
            "mode": "heuristic",
            "status": "ok",
            "frames_procesados": idx,
            "detecciones": len(trayectoria),
            "trayectoria": trayectoria,
        }
