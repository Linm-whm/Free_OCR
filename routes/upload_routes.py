from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from config import UPLOAD_FOLDER

bp = Blueprint("upload", __name__)


@bp.post("/upload")
def upload():
    file = request.files.get("image")
    if not file or not file.filename:
        return jsonify({"success": False, "message": "没有选择图片"}), 400

    filename = secure_filename(file.filename)
    if not filename:
        return jsonify({"success": False, "message": "图片文件名无效"}), 400

    path = UPLOAD_FOLDER / filename
    file.save(path)
    return jsonify({"success": True, "url": f"/uploads/{filename}", "filename": filename})


@bp.get("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)
