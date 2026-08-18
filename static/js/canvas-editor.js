let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");

let img = new Image();

// 当前上传图片在服务器上的文件名，用于 OCR 请求
let currentImageFilename = "";

// 图片整体调整状态。红框坐标始终基于当前 Canvas 坐标系，
// 调整只改变图片，不改变识别区域的位置。
let imageScale = 1;
let imageRotation = 0;
let imageFlipX = 1;
let imageFlipY = 1;
let imageTransformDirty = false;
let imageOffsetX = 0;
let imageOffsetY = 0;
let imageDragEnabled = false;
let imageDragging = false;
// 本次图片调整是否已经提示过“应用调整”
let imageAdjustHintShown = false;
let imageDragStartX = 0;
let imageDragStartY = 0;
let imageDragOriginalX = 0;
let imageDragOriginalY = 0;

// 模板工作模式：none=未开始，new=新建模板，existing=已有模板

// ===============================
// 状态
// ===============================

// 是否允许新建框选
let enableSelect = false;

// 图片是否已经上传
let imageLoaded = false;

// 已经保存的识别区域
let areas = [];

// 当前正在框选 / 编辑的蓝色区域
let tempArea = null;

// 当前正在编辑的已保存区域
let editingAreaId = null;

// 区域唯一编号
let nextAreaId = 1;

// 是否正在鼠标操作
let drawing = false;

// 蓝框编辑状态
let tempEditing = false;


// 鼠标操作模式
// select = 创建框
// edit = 编辑蓝框
let mouseMode = "select";


// 鼠标操作类型
// draw   = 新建
// move   = 移动
// resize = 缩放
let actionType = null;

// 当前操作的区域
let activeArea = null;

// 当前缩放的方向
let resizeHandle = null;

// 鼠标起始位置
let startX = 0;
let startY = 0;

// 操作开始时区域的状态
let originalArea = null;


// ===============================
// 上传图片
// ===============================

function handleUploadClick() {

    // 上传图片前必须先选择工作模式：新建模板或已有模板。
    if (typeof templateMode === "undefined" || templateMode === "none") {
        showMessage("请先点击“新建模板”或选择已有模板，再上传图片");
        return;
    }

    const fileInput = document.getElementById("imageUpload");
    if (fileInput) {
        fileInput.click();
    }
}


function uploadImage() {

    // onchange 再检查一次，避免用户通过其他方式触发文件选择时绕过前置条件。
    if (typeof templateMode === "undefined" || templateMode === "none") {
        showMessage("请先点击“新建模板”或选择已有模板，再上传图片");
        const fileInput = document.getElementById("imageUpload");
        if (fileInput) fileInput.value = "";
        return;
    }

    let fileInput =
        document.getElementById("imageUpload");

    let file =
        fileInput.files[0];

    if (!file) {

        showMessage("请选择文件并上传图片");

        return;
    }

    let formData =
        new FormData();

    formData.append(
        "image",
        file
    );

    fetch(
        "/upload",
        {
            method: "POST",
            body: formData
        }
    )
    .then(
        res => res.json()
    )
    .then(
        data => {

            if (data.success) {

                currentImageFilename = data.filename || file.name;

                loadImage(
                    data.url
                );

            }

        }
    )
    .catch(
        function () {

            showMessage("图片上传失败");

        }
    );
}


// ===============================
// 加载图片
// ===============================

function loadImage(url) {

    img.onload = function () {

        canvas.width = img.width;
        canvas.height = img.height;

        imageLoaded = true;

        // 重置状态
        enableSelect = false;

        // 上传新图片时，先清除上一张图片的识别区域
        areas = [];
        nextAreaId = 1;

        tempArea = null;

        editingAreaId = null;

        activeArea = null;

        actionType = null;

        resizeHandle = null;

        drawing = false;

        tempEditing = false;

        originalArea = null;

        resetImageTransformState();

        // 新图片第一次显示时，Canvas 就是图片原始尺寸。
        canvas.width = img.width;
        canvas.height = img.height;

        drawCanvas();
        renderAreaList();
        clearOCRResults();

        // 如果用户已经主动选择了已有模板，图片加载完成后自动套用模板。
        // 新建模板模式下不会自动套用旧模板。
        autoApplySelectedTemplate();

    };

    img.src = url;
}


// ===============================
// 获取鼠标在 canvas 中的真实坐标
// ===============================

function getMousePosition(e) {

    let rect =
        canvas.getBoundingClientRect();

    let scaleX =
        canvas.width / rect.width;

    let scaleY =
        canvas.height / rect.height;

    return {

        x:
            (e.clientX - rect.left)
            * scaleX,

        y:
            (e.clientY - rect.top)
            * scaleY
    };
}


// ===============================
// 判断点是否在区域内部
// ===============================

function isPointInsideArea(x, y, area) {

    return (

        x >= area.x &&

        x <= area.x + area.width &&

        y >= area.y &&

        y <= area.y + area.height

    );
}


// ===============================
// 获取缩放控制点
// ===============================

function getResizeHandle(x, y, area) {

    const size = 12;

    let handles = {

        nw: {
            x: area.x,
            y: area.y
        },

        n: {
            x: area.x + area.width / 2,
            y: area.y
        },

        ne: {
            x: area.x + area.width,
            y: area.y
        },

        e: {
            x: area.x + area.width,
            y: area.y + area.height / 2
        },

        se: {
            x: area.x + area.width,
            y: area.y + area.height
        },

        s: {
            x: area.x + area.width / 2,
            y: area.y + area.height
        },

        sw: {
            x: area.x,
            y: area.y + area.height
        },

        w: {
            x: area.x,
            y: area.y + area.height / 2
        }

    };


    for (let key in handles) {

        let handle =
            handles[key];

        if (

            Math.abs(
                x - handle.x
            ) <= size &&

            Math.abs(
                y - handle.y
            ) <= size

        ) {

            return key;

        }

    }

    return null;
}


// ===============================
// 鼠标按下
// ===============================

canvas.onmousedown = function (e) {

    // -------------------------------
    // 没有图片
    // -------------------------------

    if (!imageLoaded) {

        showMessage("请先上传图片");

        return;
    }

    if (imageDragEnabled) {
        const pos = getMousePosition(e);
        imageDragging = true;
        imageDragStartX = pos.x;
        imageDragStartY = pos.y;
        imageDragOriginalX = imageOffsetX;
        imageDragOriginalY = imageOffsetY;

        // 拖动图片也属于“图片调整”，第一次开始拖动时提示应用调整。
        if (!imageTransformDirty && !imageAdjustHintShown) {
            imageAdjustHintShown = true;
            showMessage("图片调整完成后，请点击 ✓ 应用调整，系统将重新识别框选区域内容");
        }

        imageTransformDirty = true;
        canvas.style.cursor = "grabbing";
        e.preventDefault();
        return;
    }


    let pos =
        getMousePosition(e);

    let x = pos.x;
    let y = pos.y;


    // ==================================================
    // 第一优先级：编辑中的蓝色区域
    // ==================================================

    if (

        editingAreaId !== null &&
        activeArea

    ) {

        let handle =
            getResizeHandle(
                x,
                y,
                activeArea
            );


        // 缩放
        if (handle) {

            drawing = true;

            actionType = "resize";

            resizeHandle = handle;

            startX = x;
            startY = y;

            originalArea = {

                x: activeArea.x,

                y: activeArea.y,

                width: activeArea.width,

                height: activeArea.height

            };

            return;
        }


        // 移动
        if (

            isPointInsideArea(
                x,
                y,
                activeArea
            )

        ) {

            drawing = true;

            actionType = "move";

            startX = x;
            startY = y;

            originalArea = {

                x: activeArea.x,

                y: activeArea.y,

                width: activeArea.width,

                height: activeArea.height

            };

            return;
        }


        // 点击蓝框外面
        return;
    }


    // ==================================================
    // 第二优先级：未保存蓝色区域
    // ==================================================

    if (tempArea) {

        let handle =
            getResizeHandle(
                x,
                y,
                tempArea
            );


        // -------------------------------
        // 操作蓝框四角/四边
        // -------------------------------

        if (handle) {

            drawing = true;

            actionType = "resize";

            resizeHandle = handle;

            activeArea = tempArea;

            startX = x;
            startY = y;

            originalArea = {

                x: tempArea.x,

                y: tempArea.y,

                width: tempArea.width,

                height: tempArea.height

            };

            return;
        }


        // -------------------------------
        // 点击蓝框内部 = 移动
        // -------------------------------

        if (

            isPointInsideArea(
                x,
                y,
                tempArea
            )

        ) {

            drawing = true;

            actionType = "move";

            activeArea = tempArea;

            startX = x;
            startY = y;

            originalArea = {

                x: tempArea.x,

                y: tempArea.y,

                width: tempArea.width,

                height: tempArea.height

            };

            return;
        }


        // -------------------------------
        // 已经有蓝框时
        // 点击其他位置什么都不做
        // -------------------------------

        return;
    }


    // ==================================================
    // 第三优先级：没有蓝框，才允许创建新框
    // ==================================================

    if (!enableSelect) {

        showMessage(
            "请先点击选择框选区域"
        );

        return;
    }


    // 开始新的框选

    drawing = true;

    actionType = "draw";

    startX = x;
    startY = y;

};


// ===============================
// 鼠标移动
// ===============================

canvas.onmousemove = function (e) {

    if (!imageLoaded) {

        return;
    }

    if (imageDragging) {
        const pos = getMousePosition(e);
        imageOffsetX = imageDragOriginalX + (pos.x - imageDragStartX);
        imageOffsetY = imageDragOriginalY + (pos.y - imageDragStartY);
        imageTransformDirty = true;
        drawCanvas();
        canvas.style.cursor = "grabbing";
        e.preventDefault();
        return;
    }


    let pos =
        getMousePosition(e);

    let nowX = pos.x;
    let nowY = pos.y;


    // ==================================================
    // 新建框
    // ==================================================

    if (

        drawing &&
        actionType === "draw"

    ) {

        drawCanvas();

        ctx.strokeStyle = "blue";

        ctx.lineWidth = 3;

        ctx.strokeRect(

            startX,
            startY,

            nowX - startX,
            nowY - startY

        );

        return;
    }


    // ==================================================
    // 移动
    // ==================================================

    if (

        drawing &&
        actionType === "move" &&
        activeArea &&
        originalArea

    ) {

        let dx =
            nowX - startX;

        let dy =
            nowY - startY;


        activeArea.x =
            originalArea.x + dx;

        activeArea.y =
            originalArea.y + dy;


        drawCanvas();

        return;
    }


    // ==================================================
    // 缩放
    // ==================================================

    if (

        drawing &&
        actionType === "resize" &&
        activeArea &&
        originalArea

    ) {

        resizeArea(

            activeArea,

            nowX,

            nowY

        );

        drawCanvas();

        return;
    }


    // ==================================================
    // 没有操作时改变鼠标样式
    // ==================================================

    updateCursor(
        nowX,
        nowY
    );

};


// ===============================
// 鼠标释放
// ===============================

canvas.onmouseup = function (e) {

    if (imageDragging) {
        imageDragging = false;
        imageTransformDirty = true;
        canvas.style.cursor = imageDragEnabled ? "grab" : "default";
        updateImageAdjustUI();
        e.preventDefault();
        return;
    }

    if (!drawing) {

        return;
    }


    // ==================================================
    // 重要：
    // 如果当前是在移动 / 缩放已有蓝框
    // 这里绝对不能重新创建 tempArea
    // ==================================================

    if (

        actionType === "move" ||
        actionType === "resize"

    ) {

        drawing = false;

        actionType = null;

        resizeHandle = null;

        originalArea = null;


        // 未保存蓝框
        if (

            editingAreaId === null &&
            activeArea === tempArea

        ) {

            tempArea =
                activeArea;

        }


        // 编辑已有区域
        if (

            editingAreaId !== null

        ) {

            // activeArea 保留
            // 等点击“保存区域”时再写回 areas

        }


        activeArea =
            editingAreaId !== null
                ? activeArea
                : null;


        drawCanvas();

        return;
    }


    // ==================================================
    // 只有 actionType === draw
    // 才能创建新的 tempArea
    // ==================================================

    if (
        actionType !== "draw"
    ) {

        drawing = false;

        actionType = null;

        return;
    }


    drawing = false;


    let rect =
        canvas.getBoundingClientRect();


    let scaleX =
        canvas.width / rect.width;


    let scaleY =
        canvas.height / rect.height;


    let endX =
        (e.clientX - rect.left)
        *
        scaleX;


    let endY =
        (e.clientY - rect.top)
        *
        scaleY;


    let width =
        Math.abs(
            endX - startX
        );


    let height =
        Math.abs(
            endY - startY
        );


    // 防止只是点击一下
    if (
        width < 5 ||
        height < 5
    ) {

        tempArea = null;

        activeArea = null;

        enableSelect = false;

        actionType = null;

        document.getElementById(
            "resetBtn"
        ).style.display = "none";

        drawCanvas();

        showMessage(
            "框选区域太小，请重新框选"
        );

        return;
    }


    // 创建临时框
    tempArea = {

        id:
            nextAreaId,

        x:
            Math.min(
                startX,
                endX
            ),

        y:
            Math.min(
                startY,
                endY
            ),

        width:
            width,

        height:
            height

    };


    nextAreaId++;


    // 当前框选完成
    enableSelect = false;

    activeArea = null;

    actionType = null;

    resizeHandle = null;

    originalArea = null;


    // 重新绘制
    drawCanvas();


    // 显示重新框选按钮
    document.getElementById(
        "resetBtn"
    ).style.display = "block";


    showMessage(
        "框选完成，请保存区域"
    );

};


// ===============================
// 鼠标离开 canvas
// ===============================

canvas.onmouseleave = function () {

    if (imageDragging) {
        imageDragging = false;
        canvas.style.cursor = imageDragEnabled ? "grab" : "default";
    }

    // 正在新建框时
    if (

        drawing &&
        actionType === "draw"

    ) {

        drawing = false;

        actionType = null;

        resizeHandle = null;

        originalArea = null;

        drawCanvas();

        return;
    }


    // 正在移动/缩放时
    // 不要把蓝框重新创建
    if (

        drawing &&
        (
            actionType === "move" ||
            actionType === "resize"
        )

    ) {

        drawing = false;

        actionType = null;

        resizeHandle = null;

        originalArea = null;

        drawCanvas();

    }

};


// ===============================
// 调整区域大小
// ===============================

function resizeArea(
    area,
    mouseX,
    mouseY
) {

    let minSize = 10;


    if (
        resizeHandle === "nw"
    ) {

        let right =
            originalArea.x +
            originalArea.width;

        let bottom =
            originalArea.y +
            originalArea.height;


        area.x =
            Math.min(
                mouseX,
                right - minSize
            );

        area.y =
            Math.min(
                mouseY,
                bottom - minSize
            );


        area.width =
            right - area.x;

        area.height =
            bottom - area.y;

    }


    else if (
        resizeHandle === "n"
    ) {

        let bottom =
            originalArea.y +
            originalArea.height;


        area.y =
            Math.min(
                mouseY,
                bottom - minSize
            );


        area.height =
            bottom - area.y;

    }


    else if (
        resizeHandle === "ne"
    ) {

        let bottom =
            originalArea.y +
            originalArea.height;


        area.y =
            Math.min(
                mouseY,
                bottom - minSize
            );


        area.width =
            Math.max(
                minSize,
                mouseX -
                originalArea.x
            );


        area.height =
            bottom - area.y;

    }


    else if (
        resizeHandle === "e"
    ) {

        area.width =
            Math.max(
                minSize,
                mouseX -
                originalArea.x
            );

    }


    else if (
        resizeHandle === "se"
    ) {

        area.width =
            Math.max(
                minSize,
                mouseX -
                originalArea.x
            );


        area.height =
            Math.max(
                minSize,
                mouseY -
                originalArea.y
            );

    }


    else if (
        resizeHandle === "s"
    ) {

        area.height =
            Math.max(
                minSize,
                mouseY -
                originalArea.y
            );

    }


    else if (
        resizeHandle === "sw"
    ) {

        let right =
            originalArea.x +
            originalArea.width;


        area.x =
            Math.min(
                mouseX,
                right - minSize
            );


        area.width =
            right - area.x;


        area.height =
            Math.max(
                minSize,
                mouseY -
                originalArea.y
            );

    }


    else if (
        resizeHandle === "w"
    ) {

        let right =
            originalArea.x +
            originalArea.width;


        area.x =
            Math.min(
                mouseX,
                right - minSize
            );


        area.width =
            right - area.x;

    }

}


// ===============================
// 更新鼠标样式
// ===============================

function updateCursor(x, y) {

    // 编辑中的蓝框
    if (

        editingAreaId !== null &&
        activeArea

    ) {

        let handle =
            getResizeHandle(
                x,
                y,
                activeArea
            );


        if (handle) {

            canvas.style.cursor =
                getResizeCursor(
                    handle
                );

            return;
        }


        if (

            isPointInsideArea(
                x,
                y,
                activeArea
            )

        ) {

            canvas.style.cursor =
                "move";

            return;
        }

    }


    // 未保存蓝框
    if (tempArea) {

        let handle =
            getResizeHandle(
                x,
                y,
                tempArea
            );


        if (handle) {

            canvas.style.cursor =
                getResizeCursor(
                    handle
                );

            return;
        }


        if (

            isPointInsideArea(
                x,
                y,
                tempArea
            )

        ) {

            canvas.style.cursor =
                "move";

            return;
        }

    }


    canvas.style.cursor =
        "default";

}


// ===============================
// 缩放鼠标样式
// ===============================

function getResizeCursor(handle) {

    const cursors = {

        nw: "nwse-resize",

        n: "ns-resize",

        ne: "nesw-resize",

        e: "ew-resize",

        se: "nwse-resize",

        s: "ns-resize",

        sw: "nesw-resize",

        w: "ew-resize"

    };

    return cursors[handle];

}


// ===============================
// 开始选择框选区域
// ===============================

function startSelect() {

    // ===============================
    // 没有上传图片
    // ===============================
    if (!imageLoaded) {

        showMessage("请先上传图片");

        return;
    }


    // ===============================
    // 如果当前已经有一个未保存的蓝色框
    // ===============================
    if (tempArea) {

        showMessage(
            "当前已有框选区域，请先重新框选"
        );

        return;
    }


    // ===============================
    // 如果正在编辑已有区域
    // ===============================
    if (editingAreaId !== null) {

        showMessage(
            "当前正在编辑区域，请先完成编辑"
        );

        return;
    }


    // ===============================
    // 开始新的框选
    // ===============================
    enableSelect = true;

    document.getElementById(
        "resetBtn"
    ).style.display = "none";


    showMessage(
        "请在图片上框选区域"
    );
}


// ===============================
// 重新框选
// ===============================

function resetLastArea() {

    // 没有临时框
    if (!tempArea) {

        showMessage(
            "当前没有需要重新框选的区域"
        );

        return;
    }


    // 删除当前未保存的蓝框
    tempArea = null;

    activeArea = null;

    actionType = null;

    resizeHandle = null;

    originalArea = null;

    drawing = false;


    // 允许重新框选
    enableSelect = true;


    // 重新框选按钮隐藏
    document.getElementById(
        "resetBtn"
    ).style.display = "none";


    // 重新绘制
    drawCanvas();


    showMessage(
        "请重新框选区域"
    );

}


// ===============================
// 图片整体调整
// ===============================

function resetImageTransformState() {
    imageScale = 1;
    imageRotation = 0;
    imageFlipX = 1;
    imageFlipY = 1;
    imageOffsetX = 0;
    imageOffsetY = 0;
    imageDragging = false;
    imageDragEnabled = false;
    imageTransformDirty = false;
    imageAdjustHintShown = false;
    updateImageAdjustUI();
}

function updateImageAdjustUI() {
    const toolbar = document.getElementById("imageAdjustToolbar");
    const zoomValue = document.getElementById("imageZoomValue");
    const rotationValue = document.getElementById("imageRotationValue");
    const rotationSlider = document.getElementById("imageRotationSlider");
    const dragButton = document.getElementById("imageDragTool");

    if (toolbar) {
        toolbar.style.display = imageLoaded ? "flex" : "none";
    }

    if (dragButton) {
        dragButton.classList.toggle("active", imageDragEnabled);

        // 每次刷新工具栏时同步更新提示文字。
        // 应用调整/重置后拖动模式会被关闭，此时不能继续显示
        // “再次点击退出”的已启用提示。
        dragButton.title = imageDragEnabled
            ? "图片拖动模式：按住图片拖动，红框保持不变（再次点击退出）"
            : "图片拖动：点击后按住图片拖动";
        dragButton.setAttribute("aria-label", "图片拖动");
    }

    if (zoomValue) {
        zoomValue.textContent = Math.round(imageScale * 100) + "%";
    }

    if (rotationValue) {
        const signedRotation = imageRotation > 180
            ? imageRotation - 360
            : imageRotation;
        rotationValue.textContent = signedRotation.toFixed(1) + "°";
    }

    if (rotationSlider) {
        const signedRotation = imageRotation > 180
            ? imageRotation - 360
            : imageRotation;
        // 滑块用于细致旋转，范围为 -15° ~ +15°。
        // 如果进行了 90° 旋转，滑块回到中间，避免显示越界。
        rotationSlider.value =
            signedRotation >= -15 && signedRotation <= 15
                ? signedRotation
                : 0;
    }
}

function markImageTransformChanged() {
    // 第一次开始调整图片时提示一次，避免每次拖动/旋转都弹窗。
    if (!imageTransformDirty && !imageAdjustHintShown) {
        imageAdjustHintShown = true;
        showMessage("图片调整完成后，请点击 ✓ 应用调整，系统将重新识别框选区域内容");
    }

    imageTransformDirty = true;

    // 放大/旋转后，让 Canvas 的实际工作区域跟随变大的图片，
    // 避免图片超过原始 Canvas 尺寸后被裁掉。
    resizeCanvasForImageTransform();

    updateImageAdjustUI();
    drawCanvas();
}

function toggleImageDragMode() {
    if (!imageLoaded) {
        showMessage("请先上传图片");
        return;
    }

    imageDragEnabled = !imageDragEnabled;
    imageDragging = false;

    const button = document.getElementById("imageDragTool");
    if (button) {
        button.classList.toggle("active", imageDragEnabled);
        button.title = imageDragEnabled
            ? "图片拖动模式：按住图片拖动，红框保持不变（再次点击退出）"
            : "图片拖动：点击后按住图片拖动";
    }

    canvas.style.cursor = imageDragEnabled ? "grab" : "default";
}

function adjustImageZoom(delta) {
    if (!imageLoaded) {
        showMessage("请先上传图片");
        return;
    }

    imageScale = Math.max(0.3, Math.min(3, imageScale + delta));
    markImageTransformChanged();
}

function setImageRotationFromSlider(value) {
    if (!imageLoaded) {
        return;
    }

    const degrees = Number(value);
    if (!Number.isFinite(degrees)) {
        return;
    }

    // 滑块表示相对于当前图片方向的精细角度。
    // 这里直接设置绝对角度，拖动时不会累积误差。
    imageRotation = ((degrees % 360) + 360) % 360;

    // 负角度需要转换成 Canvas 使用的 0~359° 表示。
    if (degrees < 0) {
        imageRotation = 360 + degrees;
    }

    markImageTransformChanged();
}

function rotateImage(degrees) {
    if (!imageLoaded) {
        showMessage("请先上传图片");
        return;
    }

    imageRotation = (imageRotation + degrees) % 360;
    if (imageRotation < 0) imageRotation += 360;
    markImageTransformChanged();
}

function mirrorImageHorizontal() {
    if (!imageLoaded) {
        showMessage("请先上传图片");
        return;
    }

    imageFlipX *= -1;
    markImageTransformChanged();
}

function mirrorImageVertical() {
    if (!imageLoaded) {
        showMessage("请先上传图片");
        return;
    }

    imageFlipY *= -1;
    markImageTransformChanged();
}

function resetImageTransform() {
    if (!imageLoaded) return;

    resetImageTransformState();

    // 重置后恢复到上传图片的原始尺寸。
    canvas.width = img.width;
    canvas.height = img.height;

    drawCanvas();
}

// 根据当前缩放/旋转后的图片尺寸调整 Canvas。
// Canvas 至少保持原始图片尺寸；当图片放大或旋转后尺寸变大时，
// Canvas 同步扩大，这样图片不会因为超过原始 Canvas 而被裁掉。
// 识别区域坐标仍保持原来的坐标，不会跟着图片一起缩放。
function resizeCanvasForImageTransform() {
    if (!imageLoaded || !img.width || !img.height) {
        return;
    }

    const radians = imageRotation * Math.PI / 180;
    const absCos = Math.abs(Math.cos(radians));
    const absSin = Math.abs(Math.sin(radians));

    const scaledWidth = img.width * imageScale;
    const scaledHeight = img.height * imageScale;

    const transformedWidth =
        Math.ceil(scaledWidth * absCos + scaledHeight * absSin);

    const transformedHeight =
        Math.ceil(scaledWidth * absSin + scaledHeight * absCos);

    canvas.width = Math.max(img.width, transformedWidth);
    canvas.height = Math.max(img.height, transformedHeight);
}

function drawTransformedImage(targetCtx) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    targetCtx.save();

    targetCtx.fillStyle = "white";
    targetCtx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    targetCtx.translate(
        centerX + imageOffsetX,
        centerY + imageOffsetY
    );

    targetCtx.rotate(
        imageRotation * Math.PI / 180
    );

    targetCtx.scale(
        imageScale * imageFlipX,
        imageScale * imageFlipY
    );

    targetCtx.drawImage(
        img,
        -img.width / 2,
        -img.height / 2
    );

    targetCtx.restore();
}

// 将当前调整后的“纯图片”上传到服务器。Canvas 上的红框不会被上传。
function applyImageTransform() {
    if (!imageLoaded) {
        showMessage("请先上传图片");
        return;
    }

    if (!imageTransformDirty) {
        showMessage("图片没有需要应用的调整");
        return;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext("2d");
    drawTransformedImage(exportCtx);

    exportCanvas.toBlob(function (blob) {
        if (!blob) {
            showMessage("图片调整生成失败");
            return;
        }

        const formData = new FormData();
        const filename = "adjusted_" + Date.now() + ".png";
        formData.append("image", blob, filename);

        showMessage("正在应用图片调整...");

        fetch("/upload", {
            method: "POST",
            body: formData
        })
            .then(function (res) {
                return res.json();
            })
            .then(function (data) {
                if (!data.success) {
                    throw new Error(data.message || "图片调整保存失败");
                }

                currentImageFilename = data.filename || filename;
                imageTransformDirty = false;
                resetImageTransformState();

                img.onload = function () {
                    drawCanvas();
                    updateImageAdjustUI();

                    if (typeof recognizeAllAreas === "function" && areas.length) {
                        recognizeAllAreas(true);
                    }

                    showMessage("图片调整已应用，并已重新识别");
                };
                img.src = data.url;
            })
            .catch(function (error) {
                showMessage(error.message || "图片调整保存失败");
            });
    }, "image/png");
}


// ===============================
// 绘制 Canvas
// ===============================

function drawCanvas() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    // 图片：只对图片整体做缩放/旋转/镜像，识别区域坐标不跟着移动。
    if (imageLoaded) {
        drawTransformedImage(ctx);
    }


    // ==================================================
    // 绘制已经保存的红框
    // ==================================================

    areas.forEach(
        function (area, index) {

            // 正在编辑的区域不画红框
            if (

                editingAreaId !== null &&
                area.id === editingAreaId

            ) {

                return;
            }


            ctx.strokeStyle =
                "red";

            ctx.lineWidth =
                3;


            ctx.strokeRect(

                area.x,
                area.y,

                area.width,
                area.height

            );


            // 编号
            ctx.fillStyle =
                "red";

            ctx.font =
                "30px Arial";


            ctx.fillText(

                index + 1,

                area.x,
                area.y - 5

            );

        }
    );


    // ==================================================
    // 绘制蓝色区域
    // ==================================================

    let blueArea = null;


    if (

        editingAreaId !== null &&
        activeArea

    ) {

        blueArea =
            activeArea;

    }

    else if (tempArea) {

        blueArea =
            tempArea;

    }


    if (blueArea) {

        drawBlueArea(
            blueArea
        );

    }

}


// ===============================
// 绘制蓝色可编辑区域
// ===============================

function drawBlueArea(area) {

    ctx.strokeStyle =
        "blue";

    ctx.lineWidth =
        3;


    ctx.strokeRect(

        area.x,
        area.y,

        area.width,
        area.height

    );


    // 四角 + 四边控制点
    let handles = [

        {
            x: area.x,
            y: area.y
        },

        {
            x:
                area.x +
                area.width / 2,

            y: area.y
        },

        {
            x:
                area.x +
                area.width,

            y: area.y
        },

        {
            x:
                area.x +
                area.width,

            y:
                area.y +
                area.height / 2
        },

        {
            x:
                area.x +
                area.width,

            y:
                area.y +
                area.height
        },

        {
            x:
                area.x +
                area.width / 2,

            y:
                area.y +
                area.height
        },

        {
            x: area.x,

            y:
                area.y +
                area.height
        },

        {
            x: area.x,

            y:
                area.y +
                area.height / 2
        }

    ];


    ctx.fillStyle =
        "white";

    ctx.strokeStyle =
        "blue";

    ctx.lineWidth =
        2;


    handles.forEach(
        function (handle) {

            ctx.beginPath();

            ctx.rect(

                handle.x - 5,
                handle.y - 5,

                10,
                10

            );

            ctx.fill();

            ctx.stroke();

        }
    );

}


// ===============================
// 保存当前区域
// ===============================

function saveCurrentArea() {

    if (imageTransformDirty) {
        showMessage("请先点击“应用调整”，再保存识别区域");
        return;
    }

    let name =
        document
            .getElementById(
                "areaName"
            )
            .value
            .trim();


    let type =
        document
            .getElementById(
                "areaType"
            )
            .value;


    // ==================================================
    // 编辑已有区域
    // ==================================================

    if (

        editingAreaId !== null &&
        activeArea

    ) {

        if (!name) {

            showMessage(
                "请输入区域名称"
            );

            return;
        }


        let area =
            areas.find(
                function (item) {

                    return (
                        item.id ===
                        editingAreaId
                    );

                }
            );


        if (area) {

            area.name =
                name;

            area.type =
                type;

            area.x =
                activeArea.x;

            area.y =
                activeArea.y;

            area.width =
                activeArea.width;

            area.height =
                activeArea.height;

        }


        // 结束编辑
        editingAreaId = null;

        activeArea = null;

        drawing = false;

        actionType = null;

        resizeHandle = null;

        originalArea = null;

        tempEditing = false;


        // 确保不会残留蓝框
        tempArea = null;


        // 清空名称
        document
            .getElementById(
                "areaName"
            )
            .value = "";


        drawCanvas();
        renderAreaList();

        showMessage("区域信息修改成功，正在重新识别...");
        if (typeof recognizeArea === "function" && area) {
            recognizeArea(area);
        }

        return;
    }


    // ==================================================
    // 新建区域
    // ==================================================

    if (!tempArea) {

        showMessage(
            "请先框选区域"
        );

        return;
    }


    if (!name) {

        showMessage(
            "请输入区域名称"
        );

        return;
    }


    let area = {

        id:
            tempArea.id,

        name:
            name,

        type:
            type,

        x:
            tempArea.x,

        y:
            tempArea.y,

        width:
            tempArea.width,

        height:
            tempArea.height

    };


    areas.push(
        area
    );


    // 清除临时区域
    tempArea = null;

    activeArea = null;

    enableSelect = false;

    drawing = false;

    actionType = null;

    resizeHandle = null;

    originalArea = null;

    tempEditing = false;


    // 名称恢复为空
    document
        .getElementById(
            "areaName"
        )
        .value = "";


    // 隐藏重新框选
    document.getElementById(
        "resetBtn"
    ).style.display = "none";


    drawCanvas();

    renderAreaList();

    showMessage("区域保存成功，正在识别...");
    if (typeof recognizeArea === "function") {
        recognizeArea(area);
    }

}


// ===============================
// 显示识别结果列表
// ===============================

function renderAreaList() {
    if (typeof renderRecognitionList === "function") {
        renderRecognitionList();
    }
}


// ===============================
// 识别类型中文名称
// ===============================

function getTypeName(type) {

    const typeNames = {

        number:
            "纯数字",

        chinese:
            "纯中文",

        english:
            "纯英文",

        chinese_english:
            "中英文混合",

        chinese_number:
            "中文 + 数字",

        english_number:
            "英文 + 数字",

        chinese_english_number:
            "中英文 + 数字"

    };


    return (

        typeNames[type] ||
        "未知"

    );

}


// ===============================
// 删除区域
// ===============================

function deleteArea(id) {

    // 如果删除的是当前正在编辑的区域
    if (
        editingAreaId === id
    ) {

        editingAreaId = null;

        activeArea = null;

        drawing = false;

        actionType = null;

        resizeHandle = null;

        originalArea = null;

    }


    let index =
        areas.findIndex(
            function (area) {

                return (
                    area.id === id
                );

            }
        );


    if (
        index === -1
    ) {

        return;
    }


    areas.splice(
        index,
        1
    );

    if (typeof removeOCRResult === "function") {
        removeOCRResult(id);
    }

    drawCanvas();
    renderAreaList();


    showMessage(
        "区域已删除"
    );

}


// ===============================
// 编辑区域
// ===============================

function editArea(id) {

    // 当前区域已经处于编辑状态时，右侧按钮就是“保存”。
    // 此时必须真正执行保存逻辑，而不是再次进入编辑状态。
    if (editingAreaId === id) {
        saveCurrentArea();
        return;
    }

    let area =
        areas.find(
            function (item) {

                return (
                    item.id === id
                );

            }
        );


    if (!area) {

        return;
    }


    // 记录编辑对象
    editingAreaId =
        id;


    // 创建一个副本
    // 不直接修改原来的红框
    activeArea = {

        x:
            area.x,

        y:
            area.y,

        width:
            area.width,

        height:
            area.height

    };


    // 填充表单
    document
        .getElementById(
            "areaName"
        )
        .value =
        area.name;


    document
        .getElementById(
            "areaType"
        )
        .value =
        area.type;


    // 进入编辑状态
    enableSelect = false;

    tempArea = null;

    drawing = false;

    actionType = null;

    resizeHandle = null;

    originalArea = null;

    tempEditing = true;


    // 隐藏重新框选
    document.getElementById(
        "resetBtn"
    ).style.display = "none";


    drawCanvas();

    // 进入编辑状态后，右侧当前区域的“编辑”按钮立即变成“保存”。
    if (typeof renderAreaList === "function") {
        renderAreaList();
    }

    showMessage(
        "已进入编辑状态，可以拖动或调整蓝框；完成后可直接点击右侧“保存”"
    );

}



// ===============================
// 对外提供给模板/OCR模块的接口
// ===============================
window.FreeOCRCanvas = {
    getCanvas: function () { return canvas; },
    isImageLoaded: function () { return imageLoaded; },
    getImageFilename: function () { return currentImageFilename; },
    getAreas: function () { return areas; },
    setAreas: function (value) { areas = Array.isArray(value) ? value : []; },
    setNextAreaId: function (value) { nextAreaId = value; },
    clearAreas: function () {
        areas = [];
        nextAreaId = 1;
        tempArea = null;
        editingAreaId = null;
        activeArea = null;
        drawing = false;
        actionType = null;
        resizeHandle = null;
        originalArea = null;
        tempEditing = false;
        enableSelect = false;
        drawCanvas();
    },
    refresh: function () { drawCanvas(); },
    renderAreaList: function () { renderAreaList(); },
    isImageTransformDirty: function () { return imageTransformDirty; },
    hasUncommittedArea: function () {
        return !!tempArea || editingAreaId !== null || activeArea !== null || tempEditing;
    }
};

// ===============================
// 提示
// ===============================

function showMessage(text) {

    let box =
        document.getElementById(
            "message"
        );


    box.innerHTML =
        text;


    box.style.display =
        "block";


    setTimeout(
        function () {

            box.style.display =
                "none";

        },
        2000
    );

}
