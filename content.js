let doodleActive = false;
let doodleCanvas = null;
let ctx = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let isPreviewingShape = false;
let previewImageData = null;
const history = [];
const pageUrl = window.location.href;
const storageKey = `doodles_${btoa(pageUrl)}`;

// Tool settings
let currentTool = 'pen';
let brushStyle = 'solid';
let fillColor = null;
let brushColor = '#667eea';
let brushSize = 3;
let highlighterOpacity = 0.3;

console.log('Enhanced Doodle content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);
  try {
    if (request.action === 'toggleDoodleMode') {
      toggleDoodleMode();
      sendResponse({ success: true });
      return true;
    } else if (request.action === 'checkDoodleMode') {
      sendResponse({ active: doodleActive });
      return true;
    }
  } catch (error) {
    console.error('Error in message handler:', error);
    sendResponse({ success: false, error: error.message });
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSavedDoodles);
} else {
  loadSavedDoodles();
}

function toggleDoodleMode() {
  if (doodleActive) {
    disableDoodle();
  } else {
    enableDoodle();
  }
}

function enableDoodle() {
  if (doodleActive) return;

  try {
    doodleActive = true;

    let existingCanvas = document.getElementById('doodle-canvas-overlay');
    if (existingCanvas) {
      doodleCanvas = existingCanvas;
      ctx = doodleCanvas.getContext('2d');
      doodleCanvas.style.pointerEvents = 'auto';
    } else {
      const maxWidth = Math.min(document.documentElement.scrollWidth, 4000);
      const maxHeight = Math.min(document.documentElement.scrollHeight, 4000);

      doodleCanvas = document.createElement('canvas');
      doodleCanvas.id = 'doodle-canvas-overlay';
      doodleCanvas.width = maxWidth;
      doodleCanvas.height = maxHeight;
      doodleCanvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        z-index: 999998;
        cursor: crosshair;
        background: transparent;
        pointer-events: auto;
      `;

      if (document.body) {
        document.body.style.position = 'relative';
        document.body.appendChild(doodleCanvas);
      }

      ctx = doodleCanvas.getContext('2d', { willReadFrequently: true });
      loadSavedDoodles();
    }

    saveState();

    doodleCanvas.addEventListener('mousedown', handleMouseDown);
    doodleCanvas.addEventListener('mousemove', handleMouseMove);
    doodleCanvas.addEventListener('mouseup', handleMouseUp);
    doodleCanvas.addEventListener('mouseleave', handleMouseLeave);

    doodleCanvas.addEventListener('touchstart', handleTouchStart);
    doodleCanvas.addEventListener('touchmove', handleTouchMove);
    doodleCanvas.addEventListener('touchend', handleTouchEnd);

    document.addEventListener('keydown', handleKeyDown);

    createDoodleUI();
  } catch (error) {
    console.error('Error enabling doodle:', error);
    doodleActive = false;
  }
}

function disableDoodle() {
  if (!doodleActive) return;

  try {
    doodleActive = false;

    if (doodleCanvas) {
      saveDoodlesToStorage();
      doodleCanvas.style.pointerEvents = 'none';
    }

    const ui = document.getElementById('doodle-ui');
    if (ui) ui.remove();

    const textBoxContainer = document.getElementById('doodle-textbox-container');
    if (textBoxContainer) textBoxContainer.remove();

    document.removeEventListener('keydown', handleKeyDown);
  } catch (error) {
    console.error('Error disabling doodle:', error);
  }
}

function saveState() {
  if (doodleCanvas && ctx) {
    try {
      if (history.length > 20) {
        history.shift();
      }
      history.push(doodleCanvas.toDataURL('image/webp', 0.8));
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }
}

function saveDoodlesToStorage() {
  if (doodleCanvas && ctx) {
    try {
      const doodleData = doodleCanvas.toDataURL('image/webp', 0.7);
      const estimatedSize = doodleData.length;
      if (estimatedSize > 5000000) {
        console.warn('Doodles too large to save');
        return;
      }
      localStorage.setItem(storageKey, doodleData);
    } catch (error) {
      console.error('Error saving doodles:', error);
    }
  }
}

function loadSavedDoodles() {
  try {
    const savedDoodles = localStorage.getItem(storageKey);
    if (savedDoodles && doodleCanvas && ctx) {
      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0);
          saveState();
        } catch (error) {
          console.error('Error drawing saved doodles:', error);
        }
      };
      img.onerror = () => {
        localStorage.removeItem(storageKey);
      };
      img.src = savedDoodles;
    }
  } catch (error) {
    console.error('Error loading doodles:', error);
  }
}

function applyBrushStyle(ctx) {
  if (brushStyle === 'dotted') {
    ctx.setLineDash([5, 5]);
  } else if (brushStyle === 'dashed') {
    ctx.setLineDash([10, 5]);
  } else {
    ctx.setLineDash([]);
  }
}

function drawLine(fromX, fromY, toX, toY) {
  if (!ctx || !doodleCanvas) return;

  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 1;

  applyBrushStyle(ctx);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawRectangle(fromX, fromY, toX, toY, preview = false) {
  if (!ctx) return;

  const width = toX - fromX;
  const height = toY - fromY;

  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize;
  ctx.setLineDash([]);
  
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(fromX, fromY, width, height);
  }

  ctx.strokeRect(fromX, fromY, width, height);
}

function drawCircle(fromX, fromY, toX, toY) {
  if (!ctx) return;

  const radius = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));

  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize;
  ctx.setLineDash([]);

  if (fillColor) {
    ctx.fillStyle = fillColor;
  }

  ctx.beginPath();
  ctx.arc(fromX, fromY, radius, 0, 2 * Math.PI);

  if (fillColor) {
    ctx.fill();
  }
  ctx.stroke();
}

function drawArrow(fromX, fromY, toX, toY) {
  if (!ctx) return;

  const headlen = 15;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = brushColor;
  ctx.fillStyle = brushColor;
  ctx.lineWidth = brushSize;
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawHighlight(fromX, fromY, toX, toY) {
  if (!ctx) return;

  ctx.globalAlpha = highlighterOpacity;
  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize * 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.globalAlpha = 1;
}

function erase(fromX, fromY, toX, toY) {
  if (!ctx) return;
  const size = brushSize * 2;
  ctx.clearRect(fromX - size / 2, fromY - size / 2, size, size);
  ctx.clearRect(toX - size / 2, toY - size / 2, size, size);
}

function handleMouseDown(e) {
  if (!doodleActive || !doodleCanvas) return;

  lastX = e.clientX + window.scrollX;
  lastY = e.clientY + window.scrollY;

  if (currentTool === 'text') {
    createTextBox(lastX, lastY);
  } else if (['rectangle', 'circle', 'line', 'arrow'].includes(currentTool)) {
    isDrawing = true;
    previewImageData = ctx.getImageData(0, 0, doodleCanvas.width, doodleCanvas.height);
  } else {
    isDrawing = true;
  }
}

function handleMouseMove(e) {
  if (!isDrawing || !doodleCanvas || currentTool === 'text') return;

  const currentX = e.clientX + window.scrollX;
  const currentY = e.clientY + window.scrollY;

  if (currentX < doodleCanvas.width && currentY < doodleCanvas.height) {
    if (currentTool === 'pen') {
      drawLine(lastX, lastY, currentX, currentY);
      lastX = currentX;
      lastY = currentY;
    } else if (currentTool === 'eraser') {
      erase(lastX, lastY, currentX, currentY);
      lastX = currentX;
      lastY = currentY;
    } else if (currentTool === 'highlighter') {
      drawHighlight(lastX, lastY, currentX, currentY);
      lastX = currentX;
      lastY = currentY;
    } else if (['rectangle', 'circle', 'line', 'arrow'].includes(currentTool)) {
      if (previewImageData) {
        ctx.putImageData(previewImageData, 0, 0);
      }

      if (currentTool === 'rectangle') {
        drawRectangle(lastX, lastY, currentX, currentY, true);
      } else if (currentTool === 'circle') {
        drawCircle(lastX, lastY, currentX, currentY);
      } else if (currentTool === 'line') {
        drawLine(lastX, lastY, currentX, currentY);
      } else if (currentTool === 'arrow') {
        drawArrow(lastX, lastY, currentX, currentY);
      }
    }
  }
}

function handleMouseUp() {
  if (!isDrawing || !doodleCanvas) return;

  isDrawing = false;
  previewImageData = null;
  saveState();

  clearTimeout(window.doodleSaveTimeout);
  window.doodleSaveTimeout = setTimeout(() => {
    saveDoodlesToStorage();
  }, 500);
}

function handleMouseLeave() {
  if (isDrawing) {
    isDrawing = false;
    previewImageData = null;
    saveState();
    clearTimeout(window.doodleSaveTimeout);
    window.doodleSaveTimeout = setTimeout(() => {
      saveDoodlesToStorage();
    }, 1000);
  }
}

function handleTouchStart(e) {
  if (!doodleActive) return;
  const touch = e.touches[0];
  lastX = touch.clientX + window.scrollX;
  lastY = touch.clientY + window.scrollY;
  isDrawing = true;
}

function handleTouchMove(e) {
  if (!isDrawing || !doodleCanvas) return;
  e.preventDefault();

  const touch = e.touches[0];
  const currentX = touch.clientX + window.scrollX;
  const currentY = touch.clientY + window.scrollY;

  if (currentX < doodleCanvas.width && currentY < doodleCanvas.height) {
    if (currentTool === 'pen') {
      drawLine(lastX, lastY, currentX, currentY);
      lastX = currentX;
      lastY = currentY;
    } else if (currentTool === 'eraser') {
      erase(lastX, lastY, currentX, currentY);
      lastX = currentX;
      lastY = currentY;
    } else if (currentTool === 'highlighter') {
      drawHighlight(lastX, lastY, currentX, currentY);
      lastX = currentX;
      lastY = currentY;
    }
  }
}

function handleTouchEnd() {
  if (isDrawing) {
    isDrawing = false;
    saveState();
    clearTimeout(window.doodleSaveTimeout);
    window.doodleSaveTimeout = setTimeout(() => {
      saveDoodlesToStorage();
    }, 1000);
  }
}

function handleKeyDown(e) {
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    undo();
  } else if (e.key === 'Escape') {
    disableDoodle();
  }
}

function undo() {
  if (history.length > 1) {
    history.pop();
    const imageData = new Image();
    imageData.onload = () => {
      if (ctx && doodleCanvas) {
        ctx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
        ctx.drawImage(imageData, 0, 0);
        clearTimeout(window.doodleSaveTimeout);
        window.doodleSaveTimeout = setTimeout(() => {
          saveDoodlesToStorage();
        }, 500);
      }
    };
    imageData.onerror = () => {
      console.error('Error loading undo image');
    };
    imageData.src = history[history.length - 1];
  }
}

function createTextBox(x, y) {
  const container = document.getElementById('doodle-textbox-container') || (() => {
    const div = document.createElement('div');
    div.id = 'doodle-textbox-container';
    document.body.appendChild(div);
    return div;
  })();

  const textBox = document.createElement('div');
  textBox.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    background: white;
    border: 2px solid ${brushColor};
    border-radius: 8px;
    padding: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10000000;
    min-width: 200px;
  `;

  const input = document.createElement('textarea');
  input.placeholder = 'Enter text...';
  input.style.cssText = `
    width: 100%;
    min-height: 80px;
    border: none;
    outline: none;
    resize: both;
    font-family: Arial, sans-serif;
    font-size: 14px;
    color: #333;
  `;

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 10px;';

  const addBtn = document.createElement('button');
  addBtn.textContent = '✓ Add';
  addBtn.style.cssText = `
    flex: 1;
    padding: 8px;
    background: ${brushColor};
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '✕ Cancel';
  cancelBtn.style.cssText = `
    flex: 1;
    padding: 8px;
    background: #ddd;
    color: #333;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  `;

  const fontSizeControl = document.createElement('div');
  fontSizeControl.style.cssText = 'margin-top: 10px; display: flex; align-items: center; gap: 8px;';
  fontSizeControl.innerHTML = `
    <label style="font-size: 12px; color: #666;">Font Size:</label>
    <input type="range" min="8" max="48" value="16" style="width: 100%; cursor: pointer;">
  `;

  const fontSizeInput = fontSizeControl.querySelector('input');
  fontSizeInput.addEventListener('input', (e) => {
    input.style.fontSize = e.target.value + 'px';
  });

  addBtn.addEventListener('click', () => {
    if (input.value.trim()) {
      ctx.fillStyle = brushColor;
      ctx.font = `${parseInt(input.style.fontSize) || 16}px Arial`;
      ctx.fillText(input.value, x, y);
      saveState();
      saveDoodlesToStorage();
    }
    textBox.remove();
  });

  cancelBtn.addEventListener('click', () => {
    textBox.remove();
  });

  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      addBtn.click();
    }
  });

  buttonContainer.appendChild(addBtn);
  buttonContainer.appendChild(cancelBtn);

  textBox.appendChild(input);
  textBox.appendChild(fontSizeControl);
  textBox.appendChild(buttonContainer);
  container.appendChild(textBox);

  input.focus();
}

function addImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = doodleCanvas.width * 0.3;
        const scale = maxWidth / img.width;
        ctx.drawImage(img, 50, 50, img.width * scale, img.height * scale);
        saveState();
        saveDoodlesToStorage();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function downloadWebsiteWithDoodles() {
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    z-index: 99999999;
    text-align: center;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  `;
  statusDiv.innerHTML = `
    <div style="font-size: 16px; font-weight: 600; color: #667eea; margin-bottom: 10px;">
      Capturing Website...
    </div>
    <div style="font-size: 12px; color: #666;">
      This may take a moment. Please don't interact with the page.
    </div>
  `;
  document.body.appendChild(statusDiv);

  setTimeout(() => {
    try {
      const currentScrollX = window.scrollX;
      const currentScrollY = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollWidth = document.documentElement.scrollWidth;
      const maxWidth = Math.min(scrollWidth, 3000);
      const maxHeight = Math.min(scrollHeight, 6000);

      window.scrollTo(0, 0);

      setTimeout(() => {
        try {
          if (typeof html2canvas !== 'undefined') {
            html2canvas(document.documentElement, {
              allowTaint: true,
              useCORS: true,
              backgroundColor: null,
              scale: 1,
              width: maxWidth,
              height: maxHeight,
              windowHeight: scrollHeight,
              windowWidth: scrollWidth
            }).then((websiteCanvas) => {
              const finalCanvas = document.createElement('canvas');
              finalCanvas.width = websiteCanvas.width;
              finalCanvas.height = websiteCanvas.height;
              const finalCtx = finalCanvas.getContext('2d');

              finalCtx.drawImage(websiteCanvas, 0, 0);

              if (doodleCanvas) {
                finalCtx.drawImage(doodleCanvas, 0, 0);
              }

              const link = document.createElement('a');
              link.href = finalCanvas.toDataURL('image/png');
              link.download = `website-with-doodles-${Date.now()}.png`;
              link.click();

              window.scrollTo(currentScrollX, currentScrollY);
              statusDiv.remove();
            }).catch((error) => {
              console.error('html2canvas failed:', error);
              captureWebsiteManual(maxWidth, maxHeight, currentScrollX, currentScrollY, statusDiv);
            });
          } else {
            captureWebsiteManual(maxWidth, maxHeight, currentScrollX, currentScrollY, statusDiv);
          }
        } catch (error) {
          console.error('Error during capture:', error);
          captureWebsiteManual(maxWidth, maxHeight, currentScrollX, currentScrollY, statusDiv);
        }
      }, 500);
    } catch (error) {
      console.error('Error in downloadWebsiteWithDoodles:', error);
      statusDiv.innerHTML = `
        <div style="font-size: 16px; font-weight: 600; color: #f5576c;">
          Error: ${error.message}
        </div>
      `;
      setTimeout(() => statusDiv.remove(), 4000);
    }
  }, 100);
}

function captureWebsiteManual(width, height, scrollX, scrollY, statusDiv) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (doodleCanvas) {
      ctx.drawImage(doodleCanvas, 0, 0);
    }

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `website-with-doodles-${Date.now()}.png`;
    link.click();

    window.scrollTo(scrollX, scrollY);
    statusDiv.remove();
  } catch (error) {
    console.error('Manual capture failed:', error);
    if (doodleCanvas) {
      const link = document.createElement('a');
      link.href = doodleCanvas.toDataURL('image/png');
      link.download = `doodles-only-${Date.now()}.png`;
      link.click();
    }
    statusDiv.remove();
  }
}

function createDoodleUI() {
  const ui = document.createElement('div');
  ui.id = 'doodle-ui';
  ui.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999999;
    background: rgba(255, 255, 255, 0.97);
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    max-height: 90vh;
    overflow-y: auto;
    width: 260px;
  `;

  ui.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="text-align: center; font-weight: 500; color: #5f6368; font-size: 14px; letter-spacing: 0.25px;">
         Doodle Studio
      </div>

      <div style="height: 1px; background: #dadce0;"></div>

      <!-- Drawing Tools -->
      <div style="background: #ffffff; padding: 10px; border-radius: 8px; border: 1px solid #dadce0;">
        <div style="font-size: 11px; font-weight: 500; color: #5f6368; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.8px;">Drawing Tools</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button class="tool-btn" data-tool="pen" title="Draw freehand" style="padding: 8px; background: white; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #5f6368; transition: all 0.2s;">✏️ Pen</button>
          <button class="tool-btn" data-tool="highlighter" title="Highlight text" style="padding: 8px; background: white; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #5f6368; transition: all 0.2s;">🖍️ Highlight</button>
          <button class="tool-btn" data-tool="line" title="Draw straight line" style="padding: 8px; background: white; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #5f6368; transition: all 0.2s;">📏 Line</button>
          <button class="tool-btn" data-tool="arrow" title="Draw arrow" style="padding: 8px; background: white; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #5f6368; transition: all 0.2s;">➜ Arrow</button>
          <button class="tool-btn" data-tool="rectangle" title="Draw rectangle" style="padding: 8px; background: white; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #5f6368; transition: all 0.2s;">▭ Box</button>
          <button class="tool-btn" data-tool="circle" title="Draw circle" style="padding: 8px; background: white; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #5f6368; transition: all 0.2s;">● Circle</button>
          <button class="tool-btn" data-tool="text" title="Add text" style="padding: 8px; background: white; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #5f6368; transition: all 0.2s;">📝 Text</button>
          <button class="tool-btn" data-tool="eraser" title="Erase" style="padding: 8px; background: white; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #5f6368; transition: all 0.2s;">🧹 Eraser</button>
        </div>
      </div>

      <!-- Colors & Style -->
      <div style="background: #ffffff; padding: 10px; border-radius: 8px; border: 1px solid #dadce0;">
        <div style="font-size: 11px; font-weight: 500; color: #5f6368; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.8px;">Colors & Style</div>
        
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div style="flex: 1;">
            <label style="font-size: 10px; font-weight: 500; color: #5f6368; display: block; margin-bottom: 4px;">Stroke</label>
            <input type="color" id="doodle-color" value="#4285F4" style="width: 100%; height: 36px; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer;">
          </div>
          <div style="flex: 1;">
            <label style="font-size: 10px; font-weight: 500; color: #5f6368; display: block; margin-bottom: 4px;">Fill</label>
            <input type="color" id="doodle-fill" value="#4285F4" style="width: 100%; height: 36px; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer;">
          </div>
        </div>

        <label style="font-size: 10px; color: #5f6368; display: flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" id="doodle-fill-toggle"> Use fill
        </label>

        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
          <label style="font-size: 10px; font-weight: 500; color: #5f6368;">Style:</label>
          <select id="doodle-brush-style" style="padding: 6px; border: 1px solid #dadce0; border-radius: 4px; background: white; color: #5f6368; cursor: pointer; font-size: 12px;">
            <option value="solid">━ Solid</option>
            <option value="dotted">⠿ Dotted</option>
            <option value="dashed">╌ Dashed</option>
          </select>
        </div>
      </div>

      <!-- Size Controls -->
      <div style="background: #ffffff; padding: 10px; border-radius: 8px; border: 1px solid #dadce0;">
        <div style="font-size: 11px; font-weight: 500; color: #5f6368; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.8px;">Size & Opacity</div>
        
        <div style="margin-bottom: 8px;">
          <label style="font-size: 10px; font-weight: 500; color: #5f6368; display: block; margin-bottom: 4px;">Brush Size: <span id="doodle-size-value">3</span>px</label>
          <input type="range" id="doodle-size" min="1" max="50" value="3" style="width: 100%; height: 6px; border-radius: 3px; background: #dadce0; outline: none; -webkit-appearance: none; appearance: none; cursor: pointer;">
        </div>

        <div>
          <label style="font-size: 10px; font-weight: 500; color: #5f6368; display: block; margin-bottom: 4px;">Highlight Opacity: <span id="doodle-opacity-value">30</span>%</label>
          <input type="range" id="doodle-opacity" min="10" max="100" value="30" step="10" style="width: 100%; height: 6px; border-radius: 3px; background: #dadce0; outline: none; -webkit-appearance: none; appearance: none; cursor: pointer;">
        </div>
      </div>

      <div style="height: 1px; background: #dadce0; margin: 8px 0;"></div>

      <!-- Action Buttons -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button id="doodle-add-image" style="
          padding: 10px;
          background: white;
          color: #5f6368;
          border: 1px solid #dadce0;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15);
        ">
           Add Image
        </button>

        <div style="display: flex; gap: 8px;">
          <button id="doodle-undo" style="
            flex: 1;
            padding: 10px;
            background: white;
            color: #5f6368;
            border: 1px solid #dadce0;
            border-radius: 4px;
            font-weight: 500;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
            box-shadow: 0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15);
          ">
            ↶ Undo
          </button>

          <button id="doodle-clear" style="
            flex: 1;
            padding: 10px;
            background: #EA4335;
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: 500;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
            box-shadow: 0 1px 2px 0 rgba(234, 67, 53, 0.3), 0 1px 3px 1px rgba(234, 67, 53, 0.15);
          ">
             Clear
          </button>
        </div>

        <button id="doodle-download" style="
          padding: 10px;
          background: #4285F4;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px 0 rgba(66, 133, 244, 0.3), 0 1px 3px 1px rgba(66, 133, 244, 0.15);
        ">
            Download Doodles
        </button>

        <button id="doodle-download-website" style="
          padding: 10px;
          background: #4285F4;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px 0 rgba(66, 133, 244, 0.3), 0 1px 3px 1px rgba(66, 133, 244, 0.15);
        ">
           Screenshot
        </button>

        <button id="doodle-close" style="
          padding: 10px;
          background: white;
          color: #5f6368;
          border: 1px solid #dadce0;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
          font-size: 13px;
          letter-spacing: 0.25px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15);
        ">
          Close (ESC)
        </button>
      </div>

      <div style="font-size: 10px; color: #80868b; margin-top: 8px; text-align: center; line-height: 1.4;">
        💡 Tip: Ctrl+Z to undo, ESC to close
      </div>
    </div>
  `;

  document.body.appendChild(ui);

  // Tool button event listeners
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tool-btn').forEach(b => {
        b.style.borderColor = '#ddd';
        b.style.color = '#333';
      });
      e.target.style.borderColor = '#667eea';
      e.target.style.color = '#667eea';
      currentTool = e.target.dataset.tool;
    });

    if (btn.dataset.tool === 'pen') {
      btn.style.borderColor = '#667eea';
      btn.style.color = '#667eea';
    }
  });

  // Color and style controls
  document.getElementById('doodle-color').addEventListener('change', (e) => {
    brushColor = e.target.value;
  });

  document.getElementById('doodle-fill').addEventListener('change', (e) => {
    fillColor = e.target.value;
  });

  document.getElementById('doodle-fill-toggle').addEventListener('change', (e) => {
    fillColor = e.target.checked ? document.getElementById('doodle-fill').value : null;
  });

  document.getElementById('doodle-brush-style').addEventListener('change', (e) => {
    brushStyle = e.target.value;
  });

  document.getElementById('doodle-size').addEventListener('input', (e) => {
    brushSize = e.target.value;
    document.getElementById('doodle-size-value').textContent = e.target.value;
  });

  document.getElementById('doodle-opacity').addEventListener('input', (e) => {
    highlighterOpacity = e.target.value / 100;
    document.getElementById('doodle-opacity-value').textContent = e.target.value;
  });

  // Action buttons
  document.getElementById('doodle-add-image').addEventListener('click', addImage);
  document.getElementById('doodle-undo').addEventListener('click', undo);

  document.getElementById('doodle-clear').addEventListener('click', () => {
    if (ctx && doodleCanvas) {
      ctx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
      history.length = 0;
      saveState();
      saveDoodlesToStorage();
    }
  });

  document.getElementById('doodle-download').addEventListener('click', () => {
    if (doodleCanvas) {
      const link = document.createElement('a');
      link.href = doodleCanvas.toDataURL('image/png');
      link.download = `webpage-doodles-${Date.now()}.png`;
      link.click();
    }
  });

  document.getElementById('doodle-download-website').addEventListener('click', downloadWebsiteWithDoodles);
  document.getElementById('doodle-close').addEventListener('click', disableDoodle);

  // Button hover effects
  const buttons = ui.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.15)';
    });
    btn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '';
    });
  });
}