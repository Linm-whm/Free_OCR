import hashlib
import json
from datetime import datetime

from config import TEMPLATE_FOLDER


def template_file(name: str):
    key = hashlib.sha256(name.encode("utf-8")).hexdigest()
    return TEMPLATE_FOLDER / f"{key}.json"


def list_templates():
    result = []
    for path in TEMPLATE_FOLDER.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            result.append({
                "name": data.get("name", "未命名模板"),
                "area_count": len(data.get("areas", [])),
                "updated_at": data.get("updated_at", ""),
            })
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(result, key=lambda item: item["name"])


def get_template(name: str):
    path = template_file(name)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_template(name: str, areas: list, image_width: float, image_height: float):
    if not name:
        raise ValueError("请输入模板名称")
    if not isinstance(areas, list) or not areas:
        raise ValueError("请至少保存一个识别区域")
    if image_width <= 0 or image_height <= 0:
        raise ValueError("图片尺寸必须大于 0")

    normalized_areas = []
    for index, area in enumerate(areas, start=1):
        try:
            x = float(area["x"])
            y = float(area["y"])
            width = float(area["width"])
            height = float(area["height"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"第 {index} 个区域坐标无效") from exc

        if width <= 0 or height <= 0:
            raise ValueError(f"第 {index} 个区域尺寸无效")

        normalized_areas.append({
            "id": int(area.get("id", index)),
            "name": str(area.get("name", "未命名区域")),
            "type": str(area.get("type", "number")),
            "x_ratio": x / image_width,
            "y_ratio": y / image_height,
            "width_ratio": width / image_width,
            "height_ratio": height / image_height,
        })

    data = {
        "name": name,
        "image_width": image_width,
        "image_height": image_height,
        "areas": normalized_areas,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    template_file(name).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return data


def delete_template(name: str):
    path = template_file(name)
    if not path.exists():
        return False
    try:
        path.unlink()
        return True
    except OSError:
        return False
