import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "poly.mask.node.multi",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "PolyMaskNodeMulti") return;
        
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onNodeCreated) {
                onNodeCreated.apply(this, arguments);
            }
            
            const node = this;
            
            // Initialize multi-polygon state - always 6 polygons with mode
            this.polygons = [];
            for (let i = 0; i < 6; i++) {
                this.polygons.push({ points: [], mode: "add" });
            }
            this.activePolygonIndex = 0;
            this.loadedImage = null;
            this.imageOriginalSize = { width: 0, height: 0 };
            this.hoveredPointIndex = -1;
            this.hoveredPointPolygon = -1;
            this.hoveredLineIndex = -1;
            this.draggingPointIndex = -1;
            this.draggingPointPolygon = -1;
            this.currentCanvasHeight = 200;
            
            // Configuration
            this.pointRadius = 10;
            this.pointHoverRadius = 14;
            this.lineWidth = 2;
            this.lineHoverWidth = 5;
            this.lineHitDistance = 8;
            this.inactiveOpacity = 0.4;
            
            // Color schemes for each polygon (additive = bright, subtractive = dark)
            this.polygonColors = [
                { 
                    line: "#4488ff", lineHover: "#66aaff", fill: "rgba(68, 136, 255, 0.5)", point: "#4488ff", border: "#0044aa", name: "Blue",
                    lineSub: "#224488", lineHoverSub: "#336699", fillSub: "rgba(34, 68, 136, 0.5)", pointSub: "#224488", borderSub: "#001144"
                },
                { 
                    line: "#ff4444", lineHover: "#ff6666", fill: "rgba(255, 68, 68, 0.5)", point: "#ff4444", border: "#aa0000", name: "Red",
                    lineSub: "#882222", lineHoverSub: "#993333", fillSub: "rgba(136, 34, 34, 0.5)", pointSub: "#882222", borderSub: "#440000"
                },
                { 
                    line: "#44dd44", lineHover: "#66ff66", fill: "rgba(68, 221, 68, 0.5)", point: "#44dd44", border: "#00aa00", name: "Green",
                    lineSub: "#226622", lineHoverSub: "#338833", fillSub: "rgba(34, 102, 34, 0.5)", pointSub: "#226622", borderSub: "#004400"
                },
                { 
                    line: "#dddd44", lineHover: "#ffff66", fill: "rgba(221, 221, 68, 0.5)", point: "#dddd44", border: "#aaaa00", name: "Yellow",
                    lineSub: "#666622", lineHoverSub: "#888833", fillSub: "rgba(102, 102, 34, 0.5)", pointSub: "#666622", borderSub: "#444400"
                },
                { 
                    line: "#dd44dd", lineHover: "#ff66ff", fill: "rgba(221, 68, 221, 0.5)", point: "#dd44dd", border: "#aa00aa", name: "Magenta",
                    lineSub: "#662266", lineHoverSub: "#883388", fillSub: "rgba(102, 34, 102, 0.5)", pointSub: "#662266", borderSub: "#440044"
                },
                { 
                    line: "#44dddd", lineHover: "#66ffff", fill: "rgba(68, 221, 221, 0.5)", point: "#44dddd", border: "#00aaaa", name: "Cyan",
                    lineSub: "#226666", lineHoverSub: "#338888", fillSub: "rgba(34, 102, 102, 0.5)", pointSub: "#226666", borderSub: "#004444"
                },
            ];
            
            // Find and hide polygon_data widget
            const polygonDataWidget = this.widgets.find(w => w.name === "polygon_data");
            if (polygonDataWidget) {
                this.polygonDataWidget = polygonDataWidget;
                
                if (polygonDataWidget.value && polygonDataWidget.value !== "[]") {
                    try {
                        const data = JSON.parse(polygonDataWidget.value);
                        if (Array.isArray(data)) {
                            for (let i = 0; i < Math.min(data.length, 6); i++) {
                                if (data[i] && data[i].points) {
                                    this.polygons[i].points = data[i].points;
                                }
                                if (data[i] && data[i].mode) {
                                    this.polygons[i].mode = data[i].mode;
                                }
                            }
                        }
                    } catch (e) {}
                }
                
                polygonDataWidget.computeSize = function() {
                    return [0, -4];
                };
                if (polygonDataWidget.inputEl) {
                    polygonDataWidget.inputEl.style.display = "none";
                }
            }
            
            // Find image widget
            const imageWidget = this.widgets.find(w => w.name === "image");
            
            // Create polygon selector buttons container with two rows
            const selectorContainer = document.createElement("div");
            selectorContainer.style.display = "flex";
            selectorContainer.style.flexDirection = "column";
            selectorContainer.style.gap = "4px";
            selectorContainer.style.justifyContent = "center";
            selectorContainer.style.padding = "4px";
            
            // Additive row
            const addRow = document.createElement("div");
            addRow.style.display = "flex";
            addRow.style.gap = "4px";
            addRow.style.justifyContent = "center";
            addRow.style.alignItems = "center";
            
            // Additive label
            const addLabel = document.createElement("span");
            addLabel.textContent = "+";
            addLabel.style.color = "#8f8";
            addLabel.style.fontWeight = "bold";
            addLabel.style.fontSize = "18px";
            addLabel.style.width = "20px";
            addLabel.style.textAlign = "center";
            addRow.appendChild(addLabel);
            
            // Subtractive row
            const subRow = document.createElement("div");
            subRow.style.display = "flex";
            subRow.style.gap = "4px";
            subRow.style.justifyContent = "center";
            subRow.style.alignItems = "center";
            
            // Subtractive label
            const subLabel = document.createElement("span");
            subLabel.textContent = "−";
            subLabel.style.color = "#f88";
            subLabel.style.fontWeight = "bold";
            subLabel.style.fontSize = "18px";
            subLabel.style.width = "20px";
            subLabel.style.textAlign = "center";
            subRow.appendChild(subLabel);
            
            this.polygonButtonsAdd = [];
            this.polygonButtonsSub = [];
            
            for (let i = 0; i < 6; i++) {
                const colorIdx = i;
                
                // Additive button
                const btnAdd = document.createElement("button");
                btnAdd.textContent = String(i + 1);
                btnAdd.style.width = "32px";
                btnAdd.style.height = "28px";
                btnAdd.style.border = "2px solid " + this.polygonColors[i].border;
                btnAdd.style.borderRadius = "4px";
                btnAdd.style.backgroundColor = this.polygonColors[i].point;
                btnAdd.style.color = "#fff";
                btnAdd.style.fontWeight = "bold";
                btnAdd.style.fontSize = "14px";
                btnAdd.style.cursor = "pointer";
                btnAdd.style.transition = "transform 0.1s, box-shadow 0.1s";
                
                btnAdd.addEventListener("click", () => {
                    node.activePolygonIndex = colorIdx;
                    node.polygons[colorIdx].mode = "add";
                    node.hoveredLineIndex = -1;
                    node.updateButtonStyles();
                    node.updatePolygonData();
                    node.renderCanvas();
                });
                
                btnAdd.addEventListener("mouseenter", () => {
                    btnAdd.style.transform = "scale(1.1)";
                });
                
                btnAdd.addEventListener("mouseleave", () => {
                    if (!(node.activePolygonIndex === colorIdx && node.polygons[colorIdx].mode === "add")) {
                        btnAdd.style.transform = "scale(1)";
                    }
                });
                
                addRow.appendChild(btnAdd);
                this.polygonButtonsAdd.push(btnAdd);
                
                // Subtractive button
                const btnSub = document.createElement("button");
                btnSub.textContent = String(i + 1);
                btnSub.style.width = "32px";
                btnSub.style.height = "28px";
                btnSub.style.border = "2px solid " + this.polygonColors[i].borderSub;
                btnSub.style.borderRadius = "4px";
                btnSub.style.backgroundColor = this.polygonColors[i].pointSub;
                btnSub.style.color = "#fff";
                btnSub.style.fontWeight = "bold";
                btnSub.style.fontSize = "14px";
                btnSub.style.cursor = "pointer";
                btnSub.style.transition = "transform 0.1s, box-shadow 0.1s";
                
                btnSub.addEventListener("click", () => {
                    node.activePolygonIndex = colorIdx;
                    node.polygons[colorIdx].mode = "subtract";
                    node.hoveredLineIndex = -1;
                    node.updateButtonStyles();
                    node.updatePolygonData();
                    node.renderCanvas();
                });
                
                btnSub.addEventListener("mouseenter", () => {
                    btnSub.style.transform = "scale(1.1)";
                });
                
                btnSub.addEventListener("mouseleave", () => {
                    if (!(node.activePolygonIndex === colorIdx && node.polygons[colorIdx].mode === "subtract")) {
                        btnSub.style.transform = "scale(1)";
                    }
                });
                
                subRow.appendChild(btnSub);
                this.polygonButtonsSub.push(btnSub);
            }
            
            selectorContainer.appendChild(addRow);
            selectorContainer.appendChild(subRow);
            
            // Add selector as DOM widget
            const selectorWidget = this.addDOMWidget("polygon_selector", "POLYGON_SELECTOR", selectorContainer, {
                serialize: false,
            });
            selectorWidget.computeSize = function() {
                return [200, 70];
            };
            
            // Add Clear Active button
            this.addWidget("button", "Clear Active", null, () => {
                node.polygons[node.activePolygonIndex].points = [];
                node.updatePolygonData();
                node.renderCanvas();
            });
            
            // Add Clear All button
            this.addWidget("button", "Clear All", null, () => {
                for (let i = 0; i < 6; i++) {
                    node.polygons[i].points = [];
                }
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
            
            // Create canvas wrapper
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
            
            // Create resolution label
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
            const widget = this.addDOMWidget("polycanvas_multi", "POLYCANVAS_MULTI", container, {
                serialize: false,
            });
            
            this.polyWidget = widget;
            
            widget.computeSize = function(width) {
                return [width, node.currentCanvasHeight + 50];
            };
            
            // Setup canvas events
            this.setupCanvasEvents();
            
            // Watch for image changes
            if (imageWidget) {
                const origCallback = imageWidget.callback;
                imageWidget.callback = function(value) {
                    if (origCallback) origCallback.apply(this, arguments);
                    node.loadImagePreview(value);
                };
                
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
                if (origOnResize) origOnResize.apply(this, arguments);
                node.resizeCanvas();
                node.renderCanvas();
            };
            
            // Set initial size
            this.size[0] = Math.max(this.size[0], 280);
            this.size[1] = Math.max(this.size[1], 500);
            
            // Initial render
            setTimeout(() => {
                node.updateButtonStyles();
                node.resizeCanvas();
                node.renderCanvas();
            }, 200);
        };
        
        // Update button styles to show active state and mode
        nodeType.prototype.updateButtonStyles = function() {
            for (let i = 0; i < 6; i++) {
                const btnAdd = this.polygonButtonsAdd[i];
                const btnSub = this.polygonButtonsSub[i];
                const isActive = (i === this.activePolygonIndex);
                const hasPoints = this.polygons[i].points.length > 0;
                const mode = this.polygons[i].mode || "add";
                
                // Reset both buttons first
                btnAdd.style.boxShadow = "none";
                btnAdd.style.transform = "scale(1)";
                btnSub.style.boxShadow = "none";
                btnSub.style.transform = "scale(1)";
                
                if (isActive) {
                    if (mode === "add") {
                        btnAdd.style.boxShadow = "0 0 8px 2px " + this.polygonColors[i].line;
                        btnAdd.style.transform = "scale(1.1)";
                    } else {
                        btnSub.style.boxShadow = "0 0 8px 2px " + this.polygonColors[i].lineSub;
                        btnSub.style.transform = "scale(1.1)";
                    }
                }
                
                // Show which mode each polygon is in via opacity
                if (hasPoints) {
                    if (mode === "add") {
                        btnAdd.style.opacity = "1";
                        btnSub.style.opacity = "0.3";
                    } else {
                        btnAdd.style.opacity = "0.3";
                        btnSub.style.opacity = "1";
                    }
                } else {
                    // Empty polygons - dim both unless active
                    btnAdd.style.opacity = isActive && mode === "add" ? "1" : "0.5";
                    btnSub.style.opacity = isActive && mode === "subtract" ? "1" : "0.5";
                }
            }
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
                if (node.resLabel) node.resLabel.style.display = "none";
            };
            
            const params = new URLSearchParams({
                filename: imageName,
                type: "input",
                subfolder: ""
            });
            img.src = api.apiURL(`/view?${params.toString()}`);
        };
        
        // Resize canvas
        nodeType.prototype.resizeCanvas = function() {
            const canvas = this.polyCanvas;
            const wrapper = this.canvasWrapper;
            if (!canvas || !wrapper) return;
            
            const HEADER_HEIGHT = 26;
            const WIDGETS_ABOVE = 210;
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
        
        // Point to line distance
        nodeType.prototype.pointToLineDistance = function(px, py, x1, y1, x2, y2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lengthSq = dx * dx + dy * dy;
            
            if (lengthSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
            
            let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
            const closestX = x1 + t * dx;
            const closestY = y1 + t * dy;
            
            return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
        };
        
        // Find line at position (only in active polygon)
        nodeType.prototype.findLineAt = function(canvasX, canvasY) {
            const points = this.polygons[this.activePolygonIndex].points;
            if (points.length < 2) return -1;
            
            const pts = points.map(p => this.imageToCanvas(p.x, p.y));
            
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
        
        // Find point at position (in any polygon)
        nodeType.prototype.findPointAt = function(canvasX, canvasY) {
            const hitRadius = this.pointHoverRadius;
            
            // Check active polygon first
            const activePoints = this.polygons[this.activePolygonIndex].points;
            for (let i = 0; i < activePoints.length; i++) {
                const p = activePoints[i];
                const cp = this.imageToCanvas(p.x, p.y);
                const dx = canvasX - cp.x;
                const dy = canvasY - cp.y;
                
                if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
                    return { polygonIndex: this.activePolygonIndex, pointIndex: i };
                }
            }
            
            // Check other polygons
            for (let polyIdx = 0; polyIdx < 6; polyIdx++) {
                if (polyIdx === this.activePolygonIndex) continue;
                
                const points = this.polygons[polyIdx].points;
                for (let i = 0; i < points.length; i++) {
                    const p = points[i];
                    const cp = this.imageToCanvas(p.x, p.y);
                    const dx = canvasX - cp.x;
                    const dy = canvasY - cp.y;
                    
                    if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
                        return { polygonIndex: polyIdx, pointIndex: i };
                    }
                }
            }
            
            return null;
        };
        
        // Setup canvas events
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
                
                const pointHit = node.findPointAt(x, y);
                
                if (e.button === 2) {
                    // Right click - delete point from any polygon
                    if (pointHit) {
                        node.polygons[pointHit.polygonIndex].points.splice(pointHit.pointIndex, 1);
                        node.hoveredPointIndex = -1;
                        node.hoveredPointPolygon = -1;
                        node.hoveredLineIndex = -1;
                        node.updatePolygonData();
                        node.updateButtonStyles();
                        node.renderCanvas();
                    }
                } else if (e.button === 0) {
                    if (pointHit) {
                        // Start drag on any polygon's point
                        node.draggingPointIndex = pointHit.pointIndex;
                        node.draggingPointPolygon = pointHit.polygonIndex;
                        canvas.setPointerCapture(e.pointerId);
                    } else if (node.hoveredLineIndex !== -1) {
                        // Insert point on active polygon's line
                        const imgCoords = node.canvasToImage(x, y);
                        const insertIndex = node.hoveredLineIndex + 1;
                        node.polygons[node.activePolygonIndex].points.splice(insertIndex, 0, { x: imgCoords.x, y: imgCoords.y });
                        node.hoveredLineIndex = -1;
                        node.updatePolygonData();
                        node.updateButtonStyles();
                        node.renderCanvas();
                    } else {
                        // Add point to active polygon
                        const imgCoords = node.canvasToImage(x, y);
                        node.polygons[node.activePolygonIndex].points.push({ x: imgCoords.x, y: imgCoords.y });
                        node.updatePolygonData();
                        node.updateButtonStyles();
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
                    
                    node.polygons[node.draggingPointPolygon].points[node.draggingPointIndex] = imgCoords;
                    node.renderCanvas();
                } else {
                    const pointHit = node.findPointAt(x, y);
                    
                    if (pointHit) {
                        if (node.hoveredPointIndex !== pointHit.pointIndex || 
                            node.hoveredPointPolygon !== pointHit.polygonIndex || 
                            node.hoveredLineIndex !== -1) {
                            node.hoveredPointIndex = pointHit.pointIndex;
                            node.hoveredPointPolygon = pointHit.polygonIndex;
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
                                node.hoveredPointPolygon = -1;
                                canvas.style.cursor = "copy";
                                node.renderCanvas();
                            }
                        } else {
                            if (node.hoveredPointIndex !== -1 || node.hoveredLineIndex !== -1) {
                                node.hoveredPointIndex = -1;
                                node.hoveredPointPolygon = -1;
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
                    node.draggingPointPolygon = -1;
                    canvas.releasePointerCapture(e.pointerId);
                }
            });
            
            canvas.addEventListener("pointerleave", (e) => {
                if (node.hoveredPointIndex !== -1 || node.hoveredLineIndex !== -1) {
                    node.hoveredPointIndex = -1;
                    node.hoveredPointPolygon = -1;
                    node.hoveredLineIndex = -1;
                    node.renderCanvas();
                }
            });
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
            if (this.polygonDataWidget) {
                // Save all 6 polygons with mode
                const dataToSave = [];
                for (let i = 0; i < 6; i++) {
                    dataToSave.push({ 
                        points: this.polygons[i].points,
                        mode: this.polygons[i].mode || "add"
                    });
                }
                this.polygonDataWidget.value = JSON.stringify(dataToSave);
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
            
            // Draw inactive polygons first (only those with points)
            for (let polyIdx = 0; polyIdx < 6; polyIdx++) {
                if (polyIdx === this.activePolygonIndex) continue;
                if (this.polygons[polyIdx].points.length > 0) {
                    this.renderPolygon(ctx, polyIdx, false);
                }
            }
            
            // Draw active polygon on top
            if (this.polygons[this.activePolygonIndex].points.length > 0) {
                this.renderPolygon(ctx, this.activePolygonIndex, true);
            }
        };
        
        // Render a single polygon
        nodeType.prototype.renderPolygon = function(ctx, polygonIndex, isActive) {
            const points = this.polygons[polygonIndex].points;
            if (points.length === 0) return;
            
            const colorSet = this.polygonColors[polygonIndex];
            const mode = this.polygons[polygonIndex].mode || "add";
            const isSubtractive = mode === "subtract";
            
            // Choose colors based on mode
            const colors = {
                line: isSubtractive ? colorSet.lineSub : colorSet.line,
                lineHover: isSubtractive ? colorSet.lineHoverSub : colorSet.lineHover,
                fill: isSubtractive ? colorSet.fillSub : colorSet.fill,
                point: isSubtractive ? colorSet.pointSub : colorSet.point,
                border: isSubtractive ? colorSet.borderSub : colorSet.border
            };
            
            const pts = points.map(p => this.imageToCanvas(p.x, p.y));
            const opacity = isActive ? 1.0 : this.inactiveOpacity;
            
            ctx.save();
            ctx.globalAlpha = opacity;
            
            // Fill (only if 3+ points)
            if (pts.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(pts[i].x, pts[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = colors.fill;
                ctx.fill();
            }
            
            // Lines (if 2+ points)
            if (pts.length >= 2) {
                for (let i = 0; i < pts.length; i++) {
                    const p1 = pts[i];
                    const p2 = pts[(i + 1) % pts.length];
                    
                    if (i === pts.length - 1 && pts.length < 3) continue;
                    
                    const isHovered = isActive && (i === this.hoveredLineIndex);
                    
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = isHovered ? colors.lineHover : colors.line;
                    ctx.lineWidth = isHovered ? this.lineHoverWidth : this.lineWidth;
                    
                    // Dashed lines for subtractive polygons
                    if (isSubtractive) {
                        ctx.setLineDash([6, 4]);
                    } else {
                        ctx.setLineDash([]);
                    }
                    
                    ctx.stroke();
                }
            }
            
            // Reset line dash for points
            ctx.setLineDash([]);
            
            // Points
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                const isThisHovered = (this.hoveredPointPolygon === polygonIndex && this.hoveredPointIndex === i);
                const isThisDragging = (this.draggingPointPolygon === polygonIndex && this.draggingPointIndex === i);
                const r = (isThisHovered || isThisDragging) ? this.pointHoverRadius : this.pointRadius;
                
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fillStyle = colors.point;
                ctx.fill();
                ctx.strokeStyle = colors.border;
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Use black text for subtractive (darker backgrounds)
                ctx.fillStyle = isSubtractive ? "#ccc" : "#fff";
                ctx.font = "bold 14px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(i + 1), p.x, p.y);
            }
            
            ctx.restore();
        };
        
        // Serialization
        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(o) {
            if (onSerialize) onSerialize.apply(this, arguments);
            o.multi_polygons = this.polygons;
            o.multi_activeIndex = this.activePolygonIndex;
        };
        
        // Deserialization
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(o) {
            if (onConfigure) onConfigure.apply(this, arguments);
            
            if (o.multi_polygons) {
                for (let i = 0; i < Math.min(o.multi_polygons.length, 6); i++) {
                    this.polygons[i] = o.multi_polygons[i];
                    // Ensure mode exists
                    if (!this.polygons[i].mode) {
                        this.polygons[i].mode = "add";
                    }
                }
            }
            
            if (o.multi_activeIndex !== undefined) {
                this.activePolygonIndex = o.multi_activeIndex;
            }
            
            this.updatePolygonData();
            
            setTimeout(() => {
                this.updateButtonStyles();
            }, 100);
            
            const imageWidget = this.widgets?.find(w => w.name === "image");
            if (imageWidget?.value) {
                setTimeout(() => {
                    this.loadImagePreview(imageWidget.value);
                }, 200);
            }
        };
    }
});