import { app } from "../../scripts/app.js";

// CONSTANTS
const CONSTANTS = {
    NODE_NAME: "ImageComparePro",
    DEFAULT_NODE_SIZE: [532, 582],
    MIN_NODE_SIZE: [100, 100],
    PREVIEW_MARGIN: 10,
    TOP_OFFSET: 40,
    HANDLE_RADIUS: 15,
    SLIDER_LINE_COLOR: "rgb(83, 164, 244)",
    SLIDER_HANDLE_COLOR: "rgb(83, 164, 244)",
    LABEL_FONT: "bold 14px sans-serif",
    DIMENSION_FONT: "normal 10px sans-serif",
    SHADOW_OFFSET: 2,
    SLIDER_POS_THRESHOLD: 0.001
};

// tool functions
const ImageCompareUtils = {
    /**
     * @param {Image} imgA 
     * @param {Image} imgB 
     * @param {number} maxW 
     * @param {number} maxH 
     * @returns {Object}
     */
    fitContainUnified(imgA, imgB, maxW, maxH) {
        if (!maxW || !maxH) {
            return { x: 0, y: 0, w: 0, h: 0 };
        }

        let srcW, srcH;
        if (imgA) {
            srcW = imgA.width;
            srcH = imgA.height;
        } else if (imgB) {
            srcW = imgB.width;
            srcH = imgB.height;
        } else {
            return { x: 0, y: 0, w: 0, h: 0 };
        }

        const scale = Math.min(maxW / srcW, maxH / srcH);
        const width = Math.max(1, Math.floor(srcW * scale));
        const height = Math.max(1, Math.floor(srcH * scale));
        const x = Math.floor((maxW - width) / 2);
        const y = Math.floor((maxH - height) / 2);
        
        return { x, y, w: width, h: height };
    },

    /**
     * @param {string} message
     */
    log(message) {
        console.log(`[comfy.${CONSTANTS.NODE_NAME}] ${message}`);
    },

    /**
     * @param {string} message
     */
    warn(message) {
        console.warn(`[comfy.${CONSTANTS.NODE_NAME}] ${message}`);
    }
};

class ImageCompareProNode {
    constructor(node) {
        this.node = node;
        this.initNodeState();
        this.addBgColorWidget();
        this.bindEventHandlers();
    }

    initNodeState() {
        const node = this.node;
        
        if (!node.size || node.size[0] < CONSTANTS.MIN_NODE_SIZE[0] || node.size[1] < CONSTANTS.MIN_NODE_SIZE[1]) {
            node.size = CONSTANTS.DEFAULT_NODE_SIZE;
        }

        node.sliderPos = 0.5;
        node.dragging = false;
        node.hovered = false;
        node.bgColor = "#222";
        
        ImageCompareUtils.log(`Node created: ${node.title}`);
    }

    addBgColorWidget() {
        const node = this.node;
        const bgColorWidget = node.addWidget(
            "color",
            "bg_color",
            node.bgColor,
            (value) => {
                node.bgColor = value;
                node.setDirtyCanvas(true);
            }
        );
        bgColorWidget.value = node.bgColor;
    }

    /**
     * @returns {Object}
     */
    getDrawGeometry() {
        const node = this.node;
        return {
            drawX: CONSTANTS.PREVIEW_MARGIN,
            drawY: CONSTANTS.PREVIEW_MARGIN + CONSTANTS.TOP_OFFSET,
            drawW: node.size[0] - CONSTANTS.PREVIEW_MARGIN * 2,
            drawH: (node.size[1] - CONSTANTS.PREVIEW_MARGIN * 2) - CONSTANTS.TOP_OFFSET
        };
    }

    bindEventHandlers() {
        const node = this.node;

        node.onMouseDown = (_, pos) => this.handleMouseDown(pos);
        
        node.onMouseMove = (e, pos) => this.handleMouseMove(e, pos);
        
        node.onDrawForeground = (ctx) => this.handleDrawForeground(ctx);
        
        node.onExecuted = (output) => this.handleNodeExecuted(output);
    }

    /**
     * @param {Array} pos 
     * @returns {boolean}
     */
    handleMouseDown(pos) {
        const node = this.node;
        const { drawX, drawY, drawW, drawH } = this.getDrawGeometry();

        const relX = pos[0] - drawX;
        const relY = pos[1] - drawY;

        if (relX < 0 || relX > drawW || relY < 0 || relY > drawH) return false;

        const splitX = drawX + Math.floor(drawW * node.sliderPos);
        const handleY = drawY + Math.floor(drawH / 2);
        const dist = Math.hypot(pos[0] - splitX, pos[1] - handleY);

        node.dragging = true;
        if (dist < CONSTANTS.HANDLE_RADIUS) {
            return true;
        }
        
        node.sliderPos = Math.max(0, Math.min(1, relX / drawW));
        return true;
    }

    /**
     * @param {Event} e 
     * @param {Array} pos 
     */
    handleMouseMove(e, pos) {
        const node = this.node;
        const { drawX, drawY, drawW, drawH } = this.getDrawGeometry();

        const splitX = drawX + Math.floor(drawW * node.sliderPos);
        const handleY = drawY + Math.floor(drawH / 2);
        const dist = Math.hypot(pos[0] - splitX, pos[1] - handleY);
        node.hovered = dist < CONSTANTS.HANDLE_RADIUS;

        if (node.dragging && e && e.buttons !== undefined && e.buttons === 0) {
            node.dragging = false;
        }

        if (node.dragging) {
            const relX = Math.max(0, Math.min(drawW, pos[0] - drawX));
            const newSliderPos = relX / drawW;

            if (Math.abs(newSliderPos - node.sliderPos) > CONSTANTS.SLIDER_POS_THRESHOLD) {
                node.sliderPos = newSliderPos;
            }
        }
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     */
    handleDrawForeground(ctx) {
        const node = this.node;
        const { drawX, drawY, drawW, drawH } = this.getDrawGeometry();

        ctx.save();

        this.drawPreviewBackground(ctx, drawX, drawY, drawW, drawH);
        
        const unifiedRect = ImageCompareUtils.fitContainUnified(node.imgA, node.imgB, drawW, drawH);

        this.drawImageBWithClip(ctx, drawX, drawY, drawW, drawH, unifiedRect);
        
        this.drawImageAWithClip(ctx, drawX, drawY, drawW, drawH, unifiedRect);
        
        this.drawSlider(ctx, drawX, drawY, drawW, drawH);
        
        this.drawLabelsAndDimensions(ctx, drawX, drawY, drawW);

        ctx.restore();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} x 
     * @param {number} y 
     * @param {number} w 
     * @param {number} h 
     */
    drawPreviewBackground(ctx, x, y, w, h) {
        const node = this.node;
        ctx.fillStyle = node.bgColor || "#ffffff";
        ctx.fillRect(x, y, w, h);
    }

    /**
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} drawX 
     * @param {number} drawY 
     * @param {number} drawW 
     * @param {number} drawH 
     * @param {Object} rect 
     */
    drawImageBWithClip(ctx, drawX, drawY, drawW, drawH, rect) {
        const node = this.node;
        if (!node.imgB) return;

        const splitX = drawX + Math.floor(drawW * node.sliderPos);

        ctx.save();
        ctx.beginPath();
        ctx.rect(splitX, drawY, drawW - (splitX - drawX), drawH);
        ctx.clip();
        ctx.drawImage(node.imgB, drawX + rect.x, drawY + rect.y, rect.w, rect.h);
        ctx.restore();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} drawX 
     * @param {number} drawY 
     * @param {number} drawW 
     * @param {number} drawH 
     * @param {Object} rect 
     */
    drawImageAWithClip(ctx, drawX, drawY, drawW, drawH, rect) {
        const node = this.node;
        if (!node.imgA) return;

        const splitX = drawX + Math.floor(drawW * node.sliderPos);

        ctx.save();
        ctx.beginPath();
        ctx.rect(drawX, drawY, splitX - drawX, drawH);
        ctx.clip();
        ctx.drawImage(node.imgA, drawX + rect.x, drawY + rect.y, rect.w, rect.h);
        ctx.restore();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} drawX 
     * @param {number} drawY 
     * @param {number} drawW 
     * @param {number} drawH 
     */
    drawSlider(ctx, drawX, drawY, drawW, drawH) {
        const node = this.node;
        const splitX = drawX + Math.floor(drawW * node.sliderPos);

        ctx.strokeStyle = CONSTANTS.SLIDER_LINE_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(splitX, drawY);
        ctx.lineTo(splitX, drawY + drawH);
        ctx.stroke();

        const handleY = drawY + drawH / 2;
        if (node.hovered || node.dragging) {
            ctx.fillStyle = CONSTANTS.SLIDER_HANDLE_COLOR;
            ctx.beginPath();
            ctx.arc(splitX, handleY, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} drawX 
     * @param {number} drawY 
     * @param {number} drawW 
     */
    drawLabelsAndDimensions(ctx, drawX, drawY, drawW) {
        const node = this.node;
        
        ctx.fillStyle = "white";
        ctx.shadowColor = "black";
        ctx.shadowOffsetX = CONSTANTS.SHADOW_OFFSET;
        ctx.shadowOffsetY = CONSTANTS.SHADOW_OFFSET;

        ctx.font = CONSTANTS.LABEL_FONT;
        ctx.fillText("A", drawX + 8, drawY + 34);
        ctx.fillText("B", drawX + drawW - 20, drawY + 34);

        if (node.imgA && node.imgB) {
            ctx.font = CONSTANTS.DIMENSION_FONT;
            ctx.fillText(`${node.imgA.width}x${node.imgA.height}`, drawX + 8, drawY + 48);
            ctx.textAlign = "right";
            ctx.fillText(`${node.imgB.width}x${node.imgB.height}`, drawX + drawW - 10, drawY + 48);
            ctx.textAlign = "left";
        }
    }

    /**
     * @param {Object} output 
     */
    handleNodeExecuted(output) {
        const node = this.node;

        if (node.imgA) {
            node.imgA.onload = null;
            node.imgA.onerror = null;
            node.imgA.src = "";
        }
        if (node.imgB) {
            node.imgB.onload = null;
            node.imgB.onerror = null;
            node.imgB.src = "";
        }

        if (!output?.b64_a || !output?.b64_b) {
            ImageCompareUtils.warn("Missing image base64 data.");
            return;
        }

        node.imgA = new Image();
        node.imgB = new Image();

        node.imgA.crossOrigin = "anonymous";
        node.imgB.crossOrigin = "anonymous";

        node.imgA.onerror = () => ImageCompareUtils.warn("Failed to load image A");
        node.imgB.onerror = () => ImageCompareUtils.warn("Failed to load image B");

        const imgAData = Array.isArray(output.b64_a) ? output.b64_a.join("") : output.b64_a;
        const imgBData = Array.isArray(output.b64_b) ? output.b64_b.join("") : output.b64_b;

        node.imgA.onload = () => node.setDirtyCanvas(true);
        node.imgB.onload = () => node.setDirtyCanvas(true);
        node.imgA.src = `data:image/png;base64,${imgAData}`;
        node.imgB.src = `data:image/png;base64,${imgBData}`;
    }
}

app.registerExtension({
    name: `comfy.${CONSTANTS.NODE_NAME}`,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== CONSTANTS.NODE_NAME) return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function () {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            new ImageCompareProNode(this);
        };
    }
});