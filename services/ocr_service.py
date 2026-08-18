import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image, ImageOps

from config import OCR_MAX_WORKERS, UPLOAD_FOLDER
from utils.text_filter import filter_ocr_text, normalize_text, type_name

_ocr_thread_local = threading.local()
_executor = ThreadPoolExecutor(max_workers=OCR_MAX_WORKERS)


def _get_engine():
    engine = getattr(_ocr_thread_local, "engine", None)
    if engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
        except ImportError as exc:
            raise RuntimeError("未安装 RapidOCR，请先执行：pip install -r requirements.txt") from exc
        engine = RapidOCR()
        _ocr_thread_local.engine = engine
    return engine


def _crop(image_array, area):
    height, width = image_array.shape[:2]
    x = float(area.get("x", 0))
    y = float(area.get("y", 0))
    w = float(area.get("width", 0))
    h = float(area.get("height", 0))

    left = max(0, min(width - 1, int(round(x))))
    top = max(0, min(height - 1, int(round(y))))
    right = max(left + 1, min(width, int(round(x + w))))
    bottom = max(top + 1, min(height, int(round(y + h))))

    if right <= left or bottom <= top:
        raise ValueError("识别区域无效")

    crop = Image.fromarray(image_array[top:bottom, left:right]).convert("RGB")
    scale = 2
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.LANCZOS)
    crop = ImageOps.autocontrast(crop)
    return np.asarray(crop)


def recognize_one(image_array, area, order=1):
    name = str(area.get("name", f"区域{order}"))
    ocr_type = str(area.get("type", "number"))

    try:
        crop = _crop(image_array, area)
        result, _ = _get_engine()(crop)
        texts, scores = [], []

        if result:
            for line in result:
                if len(line) < 3:
                    continue
                text = normalize_text(line[1])
                try:
                    score = float(line[2])
                except (TypeError, ValueError):
                    score = 0.0
                if text:
                    texts.append(text)
                    scores.append(score)

        raw_text = "".join(texts)
        filtered = filter_ocr_text(raw_text, ocr_type)
        confidence = sum(scores) / len(scores) if scores else 0.0

        return {
            "id": area.get("id", order),
            "name": name,
            "type": ocr_type,
            "type_name": type_name(ocr_type),
            "text": filtered,
            "raw_text": raw_text,
            "confidence": round(confidence, 4),
            "error": "",
        }
    except Exception as exc:
        return {
            "id": area.get("id", order),
            "name": name,
            "type": ocr_type,
            "type_name": type_name(ocr_type),
            "text": "",
            "raw_text": "",
            "confidence": 0,
            "error": str(exc),
        }


def recognize_file(filename, areas):
    path = UPLOAD_FOLDER / filename
    if not path.is_file():
        raise FileNotFoundError("图片不存在，请重新上传")

    image = Image.open(path).convert("RGB")
    image_array = np.asarray(image)

    tasks = [(index, area) for index, area in enumerate(areas, start=1)]
    futures = [
        _executor.submit(recognize_one, image_array, area, index)
        for index, area in tasks
    ]
    results = [future.result() for future in futures]
    return results
