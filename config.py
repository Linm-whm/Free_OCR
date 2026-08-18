from pathlib import Path
import shutil

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_FOLDER = DATA_DIR / "uploads"
TEMPLATE_FOLDER = DATA_DIR / "templates"

OCR_MAX_WORKERS = 4

UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
TEMPLATE_FOLDER.mkdir(parents=True, exist_ok=True)

# 兼容旧版本目录：如果用户直接把 V5 覆盖到旧项目中，自动迁移旧模板/图片。
LEGACY_UPLOAD_FOLDER = BASE_DIR / "uploads"
LEGACY_TEMPLATE_FOLDER = BASE_DIR / "templates_data"

if LEGACY_TEMPLATE_FOLDER.exists():
    for path in LEGACY_TEMPLATE_FOLDER.glob("*.json"):
        target = TEMPLATE_FOLDER / path.name
        if not target.exists():
            shutil.copy2(path, target)

if LEGACY_UPLOAD_FOLDER.exists():
    for path in LEGACY_UPLOAD_FOLDER.iterdir():
        if path.is_file():
            target = UPLOAD_FOLDER / path.name
            if not target.exists():
                shutil.copy2(path, target)
