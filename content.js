let doodleActive = false;
let doodleCanvas = null;
let ctx = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
const history = [];
const pageUrl = window.location.href;
const storageKey = `doodles_${btoa(pageUrl)}`; 

console.log('Doodler content script loaded');

// Listen for messages from popup
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

// Load doodles when page is ready
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

    // Check if doodle canvas already exists
    let existingCanvas = document.getElementById('doodle-canvas-overlay');
    if (existingCanvas) {
      doodleCanvas = existingCanvas;
      ctx = doodleCanvas.getContext('2d');
      doodleCanvas.style.pointerEvents = 'auto';
    } else {
      // Create optimized canvas with max dimensions
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

      // Append to body
      if (document.body) {
        document.body.style.position = 'relative';
        document.body.appendChild(doodleCanvas);
      }

      ctx = doodleCanvas.getContext('2d', { willReadFrequently: false });

      // Load saved doodles if they exist
      loadSavedDoodles();
    }

    // Save initial state
    saveState();

    // Draw events
    doodleCanvas.addEventListener('mousedown', handleMouseDown);
    doodleCanvas.addEventListener('mousemove', handleMouseMove);
    doodleCanvas.addEventListener('mouseup', handleMouseUp);
    doodleCanvas.addEventListener('mouseleave', handleMouseLeave);

    // Touch events for mobile
    doodleCanvas.addEventListener('touchstart', handleTouchStart);
    doodleCanvas.addEventListener('touchmove', handleTouchMove);
    doodleCanvas.addEventListener('touchend', handleTouchEnd);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);

    // Add UI overlay with controls
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

    // Save doodles to localStorage before closing
    if (doodleCanvas) {
      saveDoodlesToStorage();
      doodleCanvas.style.pointerEvents = 'none';
    }

    const ui = document.getElementById('doodle-ui');
    if (ui) ui.remove();

    document.removeEventListener('keydown', handleKeyDown);

    // Keep canvas in DOM so doodles remain visible
  } catch (error) {
    console.error('Error disabling doodle:', error);
  }
}

function saveState() {
  if (doodleCanvas && ctx) {
    try {
      // Limit history to last 10 states to save memory
      if (history.length > 10) {
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
      // Use webp format with compression for smaller file size
      const doodleData = doodleCanvas.toDataURL('image/webp', 0.7);
      
      // Check if data is too large for localStorage
      const estimatedSize = doodleData.length;
      if (estimatedSize > 5000000) { // 5MB limit
        console.warn('Doodles too large to save, keeping in current session only');
        return;
      }
      
      localStorage.setItem(storageKey, doodleData);
      console.log('Doodles saved to storage');
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
        console.error('Error loading saved doodles image');
        localStorage.removeItem(storageKey);
      };
      img.src = savedDoodles;
    }
  } catch (error) {
    console.error('Error loading doodles:', error);
  }
}

function drawLine(fromX, fromY, toX, toY) {
  if (!ctx || !doodleCanvas) return;

  ctx.strokeStyle = getBrushColor();
  ctx.lineWidth = getBrushSize();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

function handleMouseDown(e) {
  if (!doodleActive || !doodleCanvas) return;
  isDrawing = true;
  lastX = e.clientX + window.scrollX;
  lastY = e.clientY + window.scrollY;
}

function handleMouseMove(e) {
  if (!isDrawing || !doodleCanvas) return;

  const currentX = e.clientX + window.scrollX;
  const currentY = e.clientY + window.scrollY;

  // Clamp to canvas size
  if (currentX < doodleCanvas.width && currentY < doodleCanvas.height) {
    drawLine(lastX, lastY, currentX, currentY);
    lastX = currentX;
    lastY = currentY;
  }
}

function handleMouseUp() {
  if (isDrawing) {
    isDrawing = false;
    saveState();
    // Debounce saving to storage
    clearTimeout(window.doodleSaveTimeout);
    window.doodleSaveTimeout = setTimeout(() => {
      saveDoodlesToStorage();
    }, 1000);
  }
}

function handleMouseLeave() {
  if (isDrawing) {
    isDrawing = false;
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
    drawLine(lastX, lastY, currentX, currentY);
    lastX = currentX;
    lastY = currentY;
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

function getBrushColor() {
  const colorInput = document.getElementById('doodle-color');
  return colorInput ? colorInput.value : '#667eea';
}

function getBrushSize() {
  const sizeInput = document.getElementById('doodle-size');
  return sizeInput ? sizeInput.value : 3;
}

function createDoodleUI() {
  const ui = document.createElement('div');
  ui.id = 'doodle-ui';
  ui.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999999;
    background: rgba(255, 255, 255, 0.95);
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  `;

  ui.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px; min-width: 200px;">
      <div style="text-align: center; font-weight: 600; color: #667eea; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
        Doodle Tools
      </div>

      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 11px; font-weight: 600; color: #667eea; text-transform: uppercase; letter-spacing: 0.5px;">
          Brush Color
        </label>
        <input type="color" id="doodle-color" value="#667eea" style="
          width: 100%;
          height: 40px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.2s;
        ">
      </div>

      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 11px; font-weight: 600; color: #667eea; text-transform: uppercase; letter-spacing: 0.5px;">
          Brush Size: <span id="doodle-size-value">3</span>px
        </label>
        <input type="range" id="doodle-size" min="1" max="50" value="3" style="
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right, #667eea, #764ba2);
          outline: none;
          -webkit-appearance: none;
          appearance: none;
        ">
      </div>

      <div style="height: 1px; background: linear-gradient(to right, transparent, #667eea, transparent); margin: 8px 0;"></div>

      <button id="doodle-undo" style="
        padding: 10px;
        background: white;
        color: #667eea;
        border: 2px solid #667eea;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">
        Undo (Ctrl+Z)
      </button>

      <button id="doodle-clear" style="
        padding: 10px;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 15px rgba(245, 87, 108, 0.3);
      ">
        Clear All
      </button>

      <button id="doodle-download" style="
        padding: 10px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      ">
        Download Doodles
      </button>

      <button id="doodle-close" style="
        padding: 10px;
        background: white;
        color: #667eea;
        border: 2px solid #667eea;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">
        Close (ESC)
      </button>
    </div>
  `;

  document.body.appendChild(ui);

  // Add event listeners to buttons
  document.getElementById('doodle-size').addEventListener('input', (e) => {
    document.getElementById('doodle-size-value').textContent = e.target.value;
  });

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

  document.getElementById('doodle-close').addEventListener('click', disableDoodle);

  // Add hover effects
  const buttons = ui.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
    });
    btn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
    });
  });
}