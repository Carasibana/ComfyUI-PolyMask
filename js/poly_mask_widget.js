import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "poly.mask.node",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "PolyMaskNode") return;
        
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onNodeCreated) {
                onNodeCreated.apply(this, arguments);
            }
            
            const node = this;
            
            // Initialize state
            this.polygonPoints = [];
            this.loadedImage = null;
            this.imageOriginalSize = { width: 0, height: 0 };
            this.hoveredPointIndex = -1;
            this.hoveredLineIndex = -1;
            this.draggingPointIndex = -1;
            
            // Track the last calculated canvas size to report in computeSize
            this.currentCanvasHeight = 200;
            
            // Configuration - BLUE colors
            this.pointRadius = 10;
            this.pointHoverRadius = 14;
            this.pointColor = "#4488ff";
            this.pointBorderColor = "#0044aa";
            this.lineColor = "#4488ff";
            this.lineHoverColor = "#66aaff";
            this.lineWidth = 2;
            this.lineHoverWidth = 5;
            this.lineHitDistance = 8;
            this.fillColor = "rgba(255, 255, 255, 0.5)";
            
            // Find the polygon_points widget and hide it visually
            const polygonWidget = this.widgets.find(w => w.name === "polygon_points");
            if (polygonWidget) {
                this.polygonWidget = polygonWidget;
                
                // Load existing points
                if (polygonWidget.value && polygonWidget.value !== "[]") {
                    try {
                        this.polygonPoints = JSON.parse(polygonWidget.value);
                    } catch (e) {
                        this.polygonPoints = [];
                    }
                }
                
                // Hide the widget
                polygonWidget.computeSize = function() {
                    return [0, -4];
                };
                
                if (polygonWidget.inputEl) {
                    polygonWidget.inputEl.style.display = "none";
                }
            }
            
            // Find image widget
            const imageWidget = this.widgets.find(w => w.name === "image");
            
            // Create clear button
            this.addWidget("button", "Clear Points", null, () => {
                node.polygonPoints = [];
                node.updatePolygonData();
                node.renderCanvas();
            });
            
            // Create container for our canvas
            const container = document.createElement("div");
            container.style.display = "flex";
            container.style.flexDirection = "column";
            container.style.alignItems = "center";
            container.style.justifyContent = "flex-start";
            container.style.width = "100%";
            container.style.boxSizing = "border-box";
            container.style.overflow = "hidden";
            
            // Create canvas wrapper (for background)
            const canvasWrapper = document.createElement("div");
            canvasWrapper.style.background = "#1a1a1a";
            canvasWrapper.style.borderRadius = "8px";
            canvasWrapper.style.padding = "8px";
            canvasWrapper.style.display = "flex";
            canvasWrapper.style.flexDirection = "column";
            canvasWrapper.style.alignItems = "center";
            canvasWrapper.style.overflow = "hidden";
            container.appendChild(canvasWrapper);
            
            // Create canvas
            const canvas = document.createElement("canvas");
            canvas.width = 200;
            canvas.height = 200;
            canvas.style.display = "block";
            canvas.style.borderRadius = "4px";
            canvas.style.cursor = "crosshair";
            canvasWrapper.appendChild(canvas);
            
            // Create resolution label with background
            const resLabel = document.createElement("div");
            resLabel.style.color = "#ccc";
            resLabel.style.fontSize = "12px";
            resLabel.style.marginTop = "6px";
            resLabel.style.padding = "3px 10px";
            resLabel.style.background = "#333";
            resLabel.style.borderRadius = "4px";
            resLabel.style.fontFamily = "monospace";
            resLabel.style.whiteSpace = "nowrap";
            resLabel.style.display = "none";
            canvasWrapper.appendChild(resLabel);
            
            this.polyCanvas = canvas;
            this.polyContainer = container;
            this.canvasWrapper = canvasWrapper;
            this.resLabel = resLabel;
            
            // Add DOM widget
            const widget = this.addDOMWidget("polycanvas", "POLYCANVAS", container, {
                serialize: false,
            });
            
            // Store reference
            this.polyWidget = widget;
            
            // Widget computeSize - return the current canvas height
            widget.computeSize = function(width) {
                return [width, node.currentCanvasHeight + 50];
            };
            
            // Setup canvas events
            this.setupCanvasEvents();
            
            // Watch for image changes
            if (imageWidget) {
                const origCallback = imageWidget.callback;
                imageWidget.callback = function(value) {
                    if (origCallback) {
                        origCallback.apply(this, arguments);
                    }
                    node.loadImagePreview(value);
                };
                
                // Load initial image
                if (imageWidget.value) {
                    setTimeout(() => node.loadImagePreview(imageWidget.value), 150);
                }
            }
            
            // Disable ComfyUI's default image preview
            this.imgs = null;
            this.imageIndex = null;
            this.setSizeForImage = function() { return false; };
            this.onDrawBackground = function() {};
            
            // Handle node resize
            const origOnResize = this.onResize;
            this.onResize = function(size) {
                if (origOnResize) {
                    origOnResize.apply(this, arguments);
                }
                node.resizeCanvas();
                node.renderCanvas();
            };
            
            // Set a reasonable default size
            this.size[0] = Math.max(this.size[0], 280);
            this.size[1] = Math.max(this.size[1], 400);
            
            // Initial render
            setTimeout(() => {
                node.resizeCanvas();
                node.renderCanvas();
            }, 200);
        };
        
        // Load image preview
        nodeType.prototype.loadImagePreview = function(imageName) {
            if (!imageName) return;
            
            const node = this;
            const img = new Image();
            
            img.onload = function() {
                node.loadedImage = img;
                node.imageOriginalSize = { width: img.naturalWidth, height: img.naturalHeight };
                
                if (node.resLabel) {
                    node.resLabel.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
                    node.resLabel.style.display = "block";
                }
                
                node.resizeCanvas();
                node.renderCanvas();
            };
            
            img.onerror = function() {
                node.loadedImage = null;
                node.resizeCanvas();
                node.renderCanvas();
                if (node.resLabel) {
                    node.resLabel.style.display = "none";
                }
            };
            
            const params = new URLSearchParams({
                filename: imageName,
                type: "input",
                subfolder: ""
            });
            img.src = api.apiURL(`/view?${params.toString()}`);
        };
        
        // Resize canvas to fit within available node space
        nodeType.prototype.resizeCanvas = function() {
            const canvas = this.polyCanvas;
            const wrapper = this.canvasWrapper;
            if (!canvas || !wrapper) return;
            
            const HEADER_HEIGHT = 26;
            const WIDGETS_ABOVE = 95;
            const RES_LABEL_AREA = 40;
            const SIDE_PADDING = 30;
            
            const availableWidth = Math.max(80, this.size[0] - SIDE_PADDING);
            const availableHeight = Math.max(80, this.size[1] - HEADER_HEIGHT - WIDGETS_ABOVE - RES_LABEL_AREA);
            
            let canvasW, canvasH;
            
            if (this.loadedImage && this.imageOriginalSize.width > 0) {
                const imgAspect = this.imageOriginalSize.width / this.imageOriginalSize.height;
                
                canvasW = availableWidth;
                canvasH = canvasW / imgAspect;
                
                if (canvasH > availableHeight) {
                    canvasH = availableHeight;
                    canvasW = canvasH * imgAspect;
                }
                
                canvasW = Math.max(50, Math.floor(canvasW));
                canvasH = Math.max(50, Math.floor(canvasH));
            } else {
                canvasW = availableWidth;
                canvasH = Math.min(150, availableHeight);
            }
            
            canvas.width = canvasW;
            canvas.height = canvasH;
            canvas.style.width = canvasW + "px";
            canvas.style.height = canvasH + "px";
            
            this.currentCanvasHeight = canvasH;
            wrapper.style.width = (canvasW + 16) + "px";
        };
        
        // Calculate distance from point to line segment
        nodeType.prototype.pointToLineDistance = function(px, py, x1, y1, x2, y2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lengthSq = dx * dx + dy * dy;
            
            if (lengthSq === 0) {
                return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
            }
            
            let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
            
            const closestX = x1 + t * dx;
            const closestY = y1 + t * dy;
            
            return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
        };
        
        // Find line segment at canvas position
        nodeType.prototype.findLineAt = function(canvasX, canvasY) {
            if (this.polygonPoints.length < 2) return -1;
            
            const pts = this.polygonPoints.map(p => this.imageToCanvas(p.x, p.y));
            
            for (let i = 0; i < pts.length; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % pts.length];
                
                if (i === pts.length - 1 && pts.length < 3) continue;
                
                const distance = this.pointToLineDistance(canvasX, canvasY, p1.x, p1.y, p2.x, p2.y);
                
                if (distance <= this.lineHitDistance) {
                    return i;
                }
            }
            
            return -1;
        };
        
        // Setup canvas mouse events
        nodeType.prototype.setupCanvasEvents = function() {
            const node = this;
            const canvas = this.polyCanvas;
            
            canvas.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            
            canvas.addEventListener("pointerdown", (e) => {
                if (!node.loadedImage) return;
                
                e.preventDefault();
                e.stopPropagation();
                
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;
                
                const pointIdx = node.findPointAt(x, y);
                
                if (e.button === 2) {
                    if (pointIdx !== -1) {
                        node.polygonPoints.splice(pointIdx, 1);
                        node.hoveredPointIndex = -1;
                        node.hoveredLineIndex = -1;
                        node.updatePolygonData();
                        node.renderCanvas();
                    }
                } else if (e.button === 0) {
                    if (pointIdx !== -1) {
                        node.draggingPointIndex = pointIdx;
                        canvas.setPointerCapture(e.pointerId);
                    } else if (node.hoveredLineIndex !== -1) {
                        const imgCoords = node.canvasToImage(x, y);
                        const insertIndex = node.hoveredLineIndex + 1;
                        node.polygonPoints.splice(insertIndex, 0, { x: imgCoords.x, y: imgCoords.y });
                        node.hoveredLineIndex = -1;
                        node.updatePolygonData();
                        node.renderCanvas();
                    } else {
                        const imgCoords = node.canvasToImage(x, y);
                        node.polygonPoints.push({ x: imgCoords.x, y: imgCoords.y });
                        node.updatePolygonData();
                        node.renderCanvas();
                    }
                }
            });
            
            canvas.addEventListener("pointermove", (e) => {
                if (!node.loadedImage) return;
                
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;
                
                if (node.draggingPointIndex !== -1) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const imgCoords = node.canvasToImage(x, y);
                    imgCoords.x = Math.max(0, Math.min(node.imageOriginalSize.width, imgCoords.x));
                    imgCoords.y = Math.max(0, Math.min(node.imageOriginalSize.height, imgCoords.y));
                    
                    node.polygonPoints[node.draggingPointIndex] = imgCoords;
                    node.renderCanvas();
                } else {
                    const pointIdx = node.findPointAt(x, y);
                    
                    if (pointIdx !== -1) {
                        if (node.hoveredPointIndex !== pointIdx || node.hoveredLineIndex !== -1) {
                            node.hoveredPointIndex = pointIdx;
                            node.hoveredLineIndex = -1;
                            canvas.style.cursor = "pointer";
                            node.renderCanvas();
                        }
                    } else {
                        const lineIdx = node.findLineAt(x, y);
                        
                        if (lineIdx !== -1) {
                            if (node.hoveredLineIndex !== lineIdx || node.hoveredPointIndex !== -1) {
                                node.hoveredLineIndex = lineIdx;
                                node.hoveredPointIndex = -1;
                                canvas.style.cursor = "copy";
                                node.renderCanvas();
                            }
                        } else {
                            if (node.hoveredPointIndex !== -1 || node.hoveredLineIndex !== -1) {
                                node.hoveredPointIndex = -1;
                                node.hoveredLineIndex = -1;
                                canvas.style.cursor = "crosshair";
                                node.renderCanvas();
                            }
                        }
                    }
                }
            });
            
            canvas.addEventListener("pointerup", (e) => {
                if (node.draggingPointIndex !== -1) {
                    node.updatePolygonData();
                    node.draggingPointIndex = -1;
                    canvas.releasePointerCapture(e.pointerId);
                }
            });
            
            canvas.addEventListener("pointerleave", (e) => {
                if (node.hoveredPointIndex !== -1 || node.hoveredLineIndex !== -1) {
                    node.hoveredPointIndex = -1;
                    node.hoveredLineIndex = -1;
                    node.renderCanvas();
                }
            });
        };
        
        // Find point at canvas position
        nodeType.prototype.findPointAt = function(canvasX, canvasY) {
            const hitRadius = this.pointHoverRadius;
            
            for (let i = 0; i < this.polygonPoints.length; i++) {
                const p = this.polygonPoints[i];
                const cp = this.imageToCanvas(p.x, p.y);
                
                const dx = canvasX - cp.x;
                const dy = canvasY - cp.y;
                
                if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
                    return i;
                }
            }
            return -1;
        };
        
        // Convert image coords to canvas coords
        nodeType.prototype.imageToCanvas = function(imgX, imgY) {
            const canvas = this.polyCanvas;
            if (!canvas || !this.imageOriginalSize.width) return { x: 0, y: 0 };
            
            return {
                x: (imgX / this.imageOriginalSize.width) * canvas.width,
                y: (imgY / this.imageOriginalSize.height) * canvas.height
            };
        };
        
        // Convert canvas coords to image coords
        nodeType.prototype.canvasToImage = function(canvasX, canvasY) {
            const canvas = this.polyCanvas;
            if (!canvas || !this.imageOriginalSize.width) return { x: 0, y: 0 };
            
            return {
                x: (canvasX / canvas.width) * this.imageOriginalSize.width,
                y: (canvasY / canvas.height) * this.imageOriginalSize.height
            };
        };
        
        // Update polygon data in widget
        nodeType.prototype.updatePolygonData = function() {
            if (this.polygonWidget) {
                this.polygonWidget.value = JSON.stringify(this.polygonPoints);
            }
        };
        
        // Render canvas
        nodeType.prototype.renderCanvas = function() {
            const canvas = this.polyCanvas;
            if (!canvas) return;
            
            const ctx = canvas.getContext("2d");
            const w = canvas.width;
            const h = canvas.height;
            
            ctx.clearRect(0, 0, w, h);
            
            ctx.fillStyle = "#222";
            ctx.fillRect(0, 0, w, h);
            
            if (this.loadedImage) {
                try {
                    ctx.drawImage(this.loadedImage, 0, 0, w, h);
                } catch (e) {
                    return;
                }
            } else {
                ctx.fillStyle = "#555";
                ctx.font = "14px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("Upload an image", w / 2, h / 2);
                return;
            }
            
            if (this.polygonPoints.length > 0) {
                const pts = this.polygonPoints.map(p => this.imageToCanvas(p.x, p.y));
                
                if (pts.length >= 3) {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) {
                        ctx.lineTo(pts[i].x, pts[i].y);
                    }
                    ctx.closePath();
                    ctx.fillStyle = this.fillColor;
                    ctx.fill();
                }
                
                if (pts.length >= 2) {
                    for (let i = 0; i < pts.length; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        
                        if (i === pts.length - 1 && pts.length < 3) continue;
                        
                        const isHovered = (i === this.hoveredLineIndex);
                        
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = isHovered ? this.lineHoverColor : this.lineColor;
                        ctx.lineWidth = isHovered ? this.lineHoverWidth : this.lineWidth;
                        ctx.stroke();
                    }
                }
                
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i];
                    const hovered = i === this.hoveredPointIndex;
                    const dragging = i === this.draggingPointIndex;
                    const r = (hovered || dragging) ? this.pointHoverRadius : this.pointRadius;
                    
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    ctx.fillStyle = this.pointColor;
                    ctx.fill();
                    ctx.strokeStyle = this.pointBorderColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 14px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(String(i + 1), p.x, p.y);
                }
            }
        };
        
        // Serialization
        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(o) {
            if (onSerialize) onSerialize.apply(this, arguments);
            o.poly_points = this.polygonPoints;
        };
        
        // Deserialization
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(o) {
            if (onConfigure) onConfigure.apply(this, arguments);
            
            if (o.poly_points) {
                this.polygonPoints = o.poly_points;
                this.updatePolygonData();
            }
            
            const imageWidget = this.widgets?.find(w => w.name === "image");
            if (imageWidget?.value) {
                setTimeout(() => {
                    this.loadImagePreview(imageWidget.value);
                }, 200);
            }
        };
    }
});