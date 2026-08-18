import re


def normalize_text(text):
    if text is None:
        return ""
    text = str(text).strip()
    text = text.replace("\u3000", " ")
    text = text.replace("，", ",").replace("．", ".")
    text = text.replace("－", "-").replace("—", "-").replace("–", "-")
    return text


def filter_ocr_text(text, ocr_type):
    text = normalize_text(text)

    if ocr_type == "number":
        text = text.translate(str.maketrans({
            "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
            "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
        }))
        result = re.sub(r"[^0-9.\-]", "", text)
        result = re.sub(r"(?!^)-", "", result)
        if result.count(".") > 1:
            first_dot = result.find(".")
            result = result[:first_dot + 1] + result[first_dot + 1:].replace(".", "")
        return result

    patterns = {
        "chinese": r"[\u4e00-\u9fff]",
        "english": r"[A-Za-z]",
        "chinese_english": r"[\u4e00-\u9fffA-Za-z]",
        "chinese_number": r"[\u4e00-\u9fff0-9]",
        "english_number": r"[A-Za-z0-9]",
        "chinese_english_number": r"[\u4e00-\u9fffA-Za-z0-9]",
    }
    pattern = patterns.get(ocr_type)
    return "".join(re.findall(pattern, text)) if pattern else text


def type_name(ocr_type):
    return {
        "number": "纯数字",
        "chinese": "纯中文",
        "english": "纯英文",
        "chinese_english": "中英文混合",
        "chinese_number": "中文 + 数字",
        "english_number": "英文 + 数字",
        "chinese_english_number": "中英文 + 数字",
    }.get(ocr_type, "未知")
