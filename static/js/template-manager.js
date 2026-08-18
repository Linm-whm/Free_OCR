// ============================================================
// 模板管理模块
// ============================================================

let templateMode = "none";


function loadTemplateList(selectName = "") {
    fetch("/api/templates")
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data.success) {
                showMessage(data.message || "模板列表读取失败");
                return;
            }

            const select = document.getElementById("templateSelect");
            if (!select) return;

            select.innerHTML = '<option value="" disabled selected hidden>请选择模板</option>';

            data.templates.forEach(function (item) {
                const option = document.createElement("option");
                option.value = item.name;
                option.textContent = item.name + "（" + item.area_count + "个区域）";
                select.appendChild(option);
            });

            if (selectName) {
                select.value = selectName;
            }
            updateTemplateSelectColor();
        })
        .catch(function () {
            showMessage("模板列表读取失败");
        });
}


function updateTemplateSelectColor() {
    const select = document.getElementById("templateSelect");
    if (!select) return;
    select.classList.toggle("template-select-placeholder", select.value === "");
}


function templateSelectFocus() {
    const select = document.getElementById("templateSelect");
    if (select) select.classList.remove("template-select-placeholder");
}


function templateSelectBlur() {
    updateTemplateSelectColor();
}


function setTemplateEditorVisible(visible) {
    const input = document.getElementById("templateName");
    if (input) input.style.display = visible ? "block" : "none";
}


function updateTemplateActionButton() {
    const button = document.getElementById("templateActionBtn");
    if (!button) return;
    button.textContent = templateMode === "none" ? "新建模板" : "保存当前模板";
}


function handleTemplateAction() {
    if (templateMode === "none") {
        startNewTemplate();
    } else {
        saveTemplate();
    }
}


function startNewTemplate() {
    templateMode = "new";

    const select = document.getElementById("templateSelect");
    if (select) {
        select.value = "";
        updateTemplateSelectColor();
    }

    const input = document.getElementById("templateName");
    setTemplateEditorVisible(true);
    if (input) {
        input.value = "";
        input.focus();
    }

    FreeOCRCanvas.clearAreas();
    renderAreaList();
    clearOCRResults();
    updateTemplateActionButton();
    showMessage("已进入新建模板模式，请上传图片并创建识别区域");
}


function saveTemplate() {
    const input = document.getElementById("templateName");
    const name = input ? input.value.trim() : "";
    const areas = FreeOCRCanvas.getAreas();
    const canvas = FreeOCRCanvas.getCanvas();

    if (!name) {
        showMessage("请输入模板名称");
        if (input) input.focus();
        return;
    }

    if (!FreeOCRCanvas.isImageLoaded()) {
        showMessage("请先上传图片");
        return;
    }

    if (FreeOCRCanvas.isImageTransformDirty && FreeOCRCanvas.isImageTransformDirty()) {
        showMessage("请先点击“应用调整”，再保存模板");
        return;
    }

    if (FreeOCRCanvas.hasUncommittedArea()) {
        showMessage("请先保存当前识别区域，再保存模板");
        return;
    }

    if (!areas.length) {
        showMessage("请至少创建并保存一个识别区域");
        return;
    }

    fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: name,
            image_width: canvas.width,
            image_height: canvas.height,
            areas: areas
        })
    })
        .then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok || !data.success) {
                    throw new Error(data.message || "模板保存失败");
                }
                return data;
            });
        })
        .then(function () {
            // 保存完成后回到初始状态，不自动套用刚保存的模板。
            templateMode = "none";
            setTemplateEditorVisible(false);
            if (input) input.value = "";

            const select = document.getElementById("templateSelect");
            if (select) select.value = "";
            updateTemplateSelectColor();
            updateTemplateActionButton();
            loadTemplateList();
            showMessage("模板保存成功");
        })
        .catch(function (error) {
            showMessage(error.message || "模板保存失败");
        });
}


function loadSelectedTemplate() {
    const select = document.getElementById("templateSelect");
    const name = select ? select.value : "";

    if (!name) {
        templateMode = "none";
        setTemplateEditorVisible(false);
        updateTemplateActionButton();
        return;
    }

    templateMode = "existing";
    setTemplateEditorVisible(true);
    const input = document.getElementById("templateName");
    if (input) input.value = name;
    updateTemplateActionButton();

    if (!FreeOCRCanvas.isImageLoaded()) {
        showMessage("模板已选择，请上传图片");
        return;
    }

    applyTemplate(name);
}


function autoApplySelectedTemplate() {
    const select = document.getElementById("templateSelect");
    if (!select || !select.value || !FreeOCRCanvas.isImageLoaded() || templateMode === "new") {
        return;
    }

    templateMode = "existing";
    setTemplateEditorVisible(true);
    const input = document.getElementById("templateName");
    if (input) input.value = select.value;
    updateTemplateActionButton();
    applyTemplate(select.value, true);
}


function applyTemplate(name, silent = false) {
    fetch("/api/templates/" + encodeURIComponent(name))
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data.success) {
                showMessage(data.message || "模板读取失败");
                return;
            }

            const template = data.template;
            const templateAreas = Array.isArray(template.areas) ? template.areas : [];
            if (!templateAreas.length) {
                showMessage("模板中没有识别区域");
                return;
            }

            const canvas = FreeOCRCanvas.getCanvas();
            FreeOCRCanvas.setAreas(templateAreas.map(function (item, index) {
                return {
                    id: index + 1,
                    name: item.name || "未命名区域",
                    type: item.type || "number",
                    x: item.x_ratio * canvas.width,
                    y: item.y_ratio * canvas.height,
                    width: item.width_ratio * canvas.width,
                    height: item.height_ratio * canvas.height
                };
            }));
            FreeOCRCanvas.setNextAreaId(templateAreas.length + 1);
            FreeOCRCanvas.refresh();
            renderAreaList();

            templateMode = "existing";
            setTemplateEditorVisible(true);
            const input = document.getElementById("templateName");
            if (input) input.value = template.name || name;
            updateTemplateActionButton();

            // 模板套用后立即并行识别全部区域。
            recognizeAllAreas(true);

            if (!silent) showMessage("已套用模板：" + name + "，正在识别...");
        })
        .catch(function () {
            showMessage("模板读取失败");
        });
}


function deleteSelectedTemplate() {
    const select = document.getElementById("templateSelect");
    const name = select ? select.value : "";

    if (!name) {
        showMessage("请先选择模板");
        return;
    }

    if (!confirm("确定删除模板“" + name + "”吗？")) return;

    fetch("/api/templates/" + encodeURIComponent(name), { method: "DELETE" })
        .then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok || !data.success) {
                    throw new Error(data.message || "模板删除失败");
                }
                return data;
            });
        })
        .then(function () {
            templateMode = "none";
            setTemplateEditorVisible(false);
            const input = document.getElementById("templateName");
            if (input) input.value = "";
            const select = document.getElementById("templateSelect");
            if (select) select.value = "";
            updateTemplateSelectColor();
            updateTemplateActionButton();
            loadTemplateList();
            showMessage("模板已删除");
        })
        .catch(function (error) {
            showMessage(error.message || "模板删除失败");
        });
}
