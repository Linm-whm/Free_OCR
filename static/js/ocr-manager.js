// ============================================================
// OCR 识别模块
// 一个区域保存后立即识别；模板套用后一次并行识别全部区域。
// ============================================================

const ocrResults = new Map();


function clearOCRResults() {
    ocrResults.clear();
    renderRecognitionList();
}


function removeOCRResult(id) {
    ocrResults.delete(id);
}


function setOCRPending(area) {
    ocrResults.set(area.id, {
        id: area.id,
        name: area.name,
        type: area.type,
        type_name: getTypeName(area.type),
        text: "",
        confidence: 0,
        pending: true,
        error: ""
    });
    renderRecognitionList();
}


function recognizeArea(area) {
    if (FreeOCRCanvas.isImageTransformDirty && FreeOCRCanvas.isImageTransformDirty()) {
        showMessage("请先应用图片调整，再进行OCR识别");
        return Promise.resolve();
    }

    const filename = FreeOCRCanvas.getImageFilename();

    if (!filename || !FreeOCRCanvas.isImageLoaded() || !area) {
        return Promise.resolve();
    }

    setOCRPending(area);

    return fetch("/api/ocr", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            filename: filename,
            areas: [area]
        })
    })
        .then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok || !data.success) {
                    throw new Error(data.message || "OCR识别失败");
                }
                return data;
            });
        })
        .then(function (data) {
            const result = data.results && data.results[0];
            if (result) {
                ocrResults.set(area.id, result);
                renderRecognitionList();
            }
            return result;
        })
        .catch(function (error) {
            ocrResults.set(area.id, {
                id: area.id,
                name: area.name,
                type: area.type,
                type_name: getTypeName(area.type),
                text: "",
                confidence: 0,
                pending: false,
                error: error.message || "OCR识别失败"
            });
            renderRecognitionList();
            return null;
        });
}


// 模板一次套用多个区域时，后端会并行识别所有区域。
function recognizeAllAreas(silent = false) {
    if (FreeOCRCanvas.isImageTransformDirty && FreeOCRCanvas.isImageTransformDirty()) {
        if (!silent) showMessage("请先应用图片调整，再进行OCR识别");
        return Promise.resolve([]);
    }

    const filename = FreeOCRCanvas.getImageFilename();
    const areas = FreeOCRCanvas.getAreas();

    if (!filename || !FreeOCRCanvas.isImageLoaded() || !areas.length) {
        return Promise.resolve([]);
    }

    areas.forEach(setOCRPending);
    renderRecognitionList();

    return fetch("/api/ocr", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            filename: filename,
            areas: areas.map(function (area) {
                return {
                    id: area.id,
                    name: area.name,
                    type: area.type,
                    x: area.x,
                    y: area.y,
                    width: area.width,
                    height: area.height
                };
            })
        })
    })
        .then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok || !data.success) {
                    throw new Error(data.message || "OCR识别失败");
                }
                return data;
            });
        })
        .then(function (data) {
            (data.results || []).forEach(function (result) {
                ocrResults.set(result.id, result);
            });
            renderRecognitionList();
            if (!silent) {
                showMessage("OCR识别完成");
            }
            return data.results || [];
        })
        .catch(function (error) {
            areas.forEach(function (area) {
                ocrResults.set(area.id, {
                    id: area.id,
                    name: area.name,
                    type: area.type,
                    type_name: getTypeName(area.type),
                    text: "",
                    confidence: 0,
                    pending: false,
                    error: error.message || "OCR识别失败"
                });
            });
            renderRecognitionList();
            if (!silent) {
                showMessage(error.message || "OCR识别失败");
            }
            return [];
        });
}


function renderRecognitionList() {
    const list = document.getElementById("recognitionList");
    if (!list) return;

    const areas = FreeOCRCanvas.getAreas();
    list.innerHTML = "";

    if (!areas.length) {
        list.innerHTML = "<p>暂无识别区域</p>";
        return;
    }

    areas.forEach(function (area, index) {
        const result = ocrResults.get(area.id);
        const item = document.createElement("div");
        item.className = "recognition-item";

        let resultText = "等待识别";
        let confidenceText = "—";
        let extra = "";

        if (result) {
            if (result.pending) {
                resultText = "正在识别...";
            } else if (result.error) {
                resultText = "识别失败";
                extra = '<div class="recognition-error">' + escapeHtml(result.error) + '</div>';
            } else {
                resultText = result.text || "未识别到内容";
                const confidence = Number(result.confidence || 0);
                confidenceText = confidence > 0
                    ? (confidence * 100).toFixed(1) + "%"
                    : "暂无";
            }
        }

        item.innerHTML = `
            <div class="recognition-title">
                ${index + 1}. ${escapeHtml(area.name || "未命名区域")}
            </div>
            <div class="recognition-info">
                识别类型：${escapeHtml(getTypeName(area.type))}
                <br>
                识别结果：<span class="recognition-text">${escapeHtml(resultText)}</span>
                <br>
                置信度：${escapeHtml(confidenceText)}
                ${extra}
            </div>
            <div class="recognition-buttons">
                <button onclick="editArea(${area.id})">
                    ${typeof editingAreaId !== "undefined" && editingAreaId === area.id ? "保存" : "编辑"}
                </button>
                <button onclick="deleteArea(${area.id})">删除</button>
            </div>
        `;

        list.appendChild(item);
    });
}


function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
