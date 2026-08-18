// Free_OCR 应用入口
// 具体功能分别由 canvas-editor.js、template-manager.js、ocr-manager.js 负责。
window.addEventListener("DOMContentLoaded", function () {
    setTemplateEditorVisible(false);
    updateTemplateActionButton();
    loadTemplateList();
});
