from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from services.ocr_service import recognize_file

bp = Blueprint("ocr", __name__, url_prefix="/api/ocr")


def _validate_payload(data):
    filename = secure_filename(str(data.get("filename", "")).strip())
    areas = data.get("areas", [])
    if not filename:
        raise ValueError("没有指定图片")
    if not isinstance(areas, list) or not areas:
        raise ValueError("没有可识别的区域")
    return filename, areas


@bp.post("")
def recognize():
    try:
        filename, areas = _validate_payload(request.get_json(silent=True) or {})
        results = recognize_file(filename, areas)
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    except FileNotFoundError as exc:
        return jsonify({"success": False, "message": str(exc)}), 404
    except Exception as exc:
        return jsonify({"success": False, "message": f"OCR识别失败：{exc}"}), 500

    return jsonify({"success": True, "results": results})
