from flask import Blueprint, jsonify, request

from services.template_service import delete_template, get_template, list_templates, save_template

bp = Blueprint("templates", __name__, url_prefix="/api/templates")


@bp.get("")
def templates():
    return jsonify({"success": True, "templates": list_templates()})


@bp.get("/<path:name>")
def template(name):
    data = get_template(name)
    if data is None:
        return jsonify({"success": False, "message": "模板不存在或模板文件损坏"}), 404
    return jsonify({"success": True, "template": data})


@bp.post("")
def create_or_update_template():
    data = request.get_json(silent=True) or {}
    try:
        name = str(data.get("name", "")).strip()
        areas = data.get("areas", [])
        image_width = float(data.get("image_width", 0))
        image_height = float(data.get("image_height", 0))
        result = save_template(name, areas, image_width, image_height)
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    except (TypeError, OverflowError):
        return jsonify({"success": False, "message": "图片尺寸无效"}), 400

    return jsonify({"success": True, "message": "模板保存成功", "template": result})


@bp.delete("/<path:name>")
def remove_template(name):
    if not delete_template(name):
        return jsonify({"success": False, "message": "删除模板失败或模板不存在"}), 404
    return jsonify({"success": True, "message": "模板删除成功"})
