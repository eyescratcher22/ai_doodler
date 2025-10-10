// Get the toggle button
const toggleDoodleBtn = document.getElementById('toggleDoodle');

// Listen for clicks on the toggle button
toggleDoodleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // First, inject the content script
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content.js']
    }, () => {
      // After injection, send the message
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleDoodleMode' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Error:', chrome.runtime.lastError);
        } else if (response && response.success) {
          updateButtonState();
          setTimeout(() => {
            window.close();
          }, 300);
        }
      });
    });
  });
});

// Update button state based on whether doodle is active
function updateButtonState() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'checkDoodleMode' }, (response) => {
      if (chrome.runtime.lastError) {
        toggleDoodleBtn.textContent = 'Enable Doodle Mode';
        toggleDoodleBtn.classList.remove('active');
      } else if (response && response.active) {
        toggleDoodleBtn.textContent = 'Disable Doodle Mode';
        toggleDoodleBtn.classList.add('active');
      } else {
        toggleDoodleBtn.textContent = 'Enable Doodle Mode';
        toggleDoodleBtn.classList.remove('active');
      }
    });
  });
}

// Check initial state when popup opens
updateButtonState();