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
        self.mode = (BALL_DETECTOR_MODE or "none").strip().lower()
        self.model_path = BALL_DETECTOR_MODEL_PATH
        self._net = None

    def enabled(self) -> bool:
        if self.mode != "yolo_onnx":
            return False
        return bool(self.model_path and os.path.exists(self.model_path))

    def detectar_trayectoria(self, ruta_video: str) -> dict:
        if not self.enabled():
            return {
                "enabled": False,
                "mode": self.mode,
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
                    "mode": self.mode,
                    "status": "error",
                    "reason": f"No se pudo cargar modelo ONNX: {exc}",
                    "trayectoria": [],
                }

        cap = cv2.VideoCapture(ruta_video)
        if not cap.isOpened():
            return {
                "enabled": True,
                "mode": self.mode,
                "status": "error",
                "reason": "No se pudo abrir video para postproceso ML",
                "trayectoria": [],
            }

        fps = cap.get(cv2.CAP_PROP_FPS)
        fps = fps if fps and fps > 0 else 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        detecciones: list[BallDetection] = []
        frame_idx = 0

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if frame_idx >= BALL_DETECTOR_MAX_FRAMES:
                    break

                det = self._detectar_en_frame(frame, frame_idx, fps, width, height)
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
            "mode": self.mode,
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

        boxes, scores = self._parse_yolo_output(out, width, height)
        if not boxes:
            return None

        idxs = cv2.dnn.NMSBoxes(
            bboxes=boxes,
            scores=scores,
            score_threshold=BALL_DETECTOR_CONF_THRESHOLD,
            nms_threshold=BALL_DETECTOR_IOU_THRESHOLD,
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

    def _parse_yolo_output(self, out: np.ndarray, width: int, height: int) -> tuple[list[list[int]], list[float]]:
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
                self._extract_from_rows(rows, width, height, boxes, scores)

        # Caso [1, 84, N] (transpuesto)
        if not boxes and arr.ndim == 3 and arr.shape[0] == 1 and arr.shape[1] >= 6:
            rows = arr[0].T
            if rows.shape[1] >= 6:
                self._extract_from_rows(rows, width, height, boxes, scores)

        return boxes, scores

    def _extract_from_rows(
        self,
        rows: np.ndarray,
        width: int,
        height: int,
        boxes: list[list[int]],
        scores: list[float],
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
            if conf < BALL_DETECTOR_CONF_THRESHOLD:
                continue

            x = int((cx - (w / 2.0)) * sx)
            y = int((cy - (h / 2.0)) * sy)
            bw = int(w * sx)
            bh = int(h * sy)
            if bw <= 1 or bh <= 1:
                continue

            boxes.append([x, y, bw, bh])
            scores.append(conf)
