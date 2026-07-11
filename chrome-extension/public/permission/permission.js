function t(key, fallback) {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      const msg = chrome.i18n.getMessage(key);
      if (msg) return msg;
    }
  } catch (_) {
    /* preview / non-extension context */
  }
  return fallback;
}

function revealPage() {
  document.documentElement.style.visibility = 'visible';
}

function fitWindowToContent() {
  document.documentElement.style.height = 'auto';
  document.body.style.height = 'auto';

  // +2px guards against subpixel overflow that would flash a scrollbar
  const width = Math.ceil(document.body.scrollWidth) + 2;
  const height = Math.ceil(document.body.scrollHeight) + 2;

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'peerpane-permission-size', width, height }, '*');
    revealPage();
  }

  if (window !== window.top) return;

  const chromeW = Math.max(0, window.outerWidth - window.innerWidth);
  const chromeH = Math.max(0, window.outerHeight - window.innerHeight);
  const outerW = width + chromeW;
  const outerH = height + chromeH;

  const applySize = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.windows && typeof chrome.windows.getCurrent === 'function') {
        chrome.windows.getCurrent(win => {
          if (win && win.id != null && chrome.windows.update) {
            chrome.windows.update(win.id, { width: outerW, height: outerH }, () => revealPage());
            return;
          }
          window.resizeTo(outerW, outerH);
          revealPage();
        });
        return;
      }
      window.resizeTo(outerW, outerH);
    } catch (_) {
      /* some contexts block resize */
    }
    revealPage();
  };

  applySize();
}

document.addEventListener('DOMContentLoaded', () => {
  const titleEl = document.getElementById('title');
  const descriptionEl = document.getElementById('description');
  const requestButton = document.getElementById('requestPermission');
  const statusText = document.getElementById('status');

  titleEl.textContent = t('permissions_microphone_title', 'Enable Voice Input');
  descriptionEl.textContent = t(
    'permissions_microphone_description',
    'PeerPane needs microphone access to convert your speech to text.',
  );
  requestButton.textContent = t('permissions_microphone_grantButton', 'Grant Microphone Permission');

  const clearStatus = () => {
    statusText.textContent = '';
    statusText.className = '';
  };

  requestButton.addEventListener('click', async () => {
    clearStatus();
    fitWindowToContent();
    requestButton.disabled = true;
    requestButton.textContent = t('permissions_microphone_requesting', 'Requesting microphone permission…');
    fitWindowToContent();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      requestButton.textContent = t('permissions_microphone_grantedButton', 'Permission Granted');
      fitWindowToContent();

      window.setTimeout(() => {
        try {
          window.close();
        } catch (_) {
          /* preview may ignore close */
        }
      }, 800);
    } catch (error) {
      console.error('Permission denied or error:', error);
      requestButton.disabled = false;
      requestButton.textContent = t('permissions_microphone_grantButton', 'Grant Microphone Permission');

      let errorMessage = t('permissions_microphone_denied', 'Permission denied. ');
      if (error && error.name === 'NotAllowedError') {
        errorMessage += t(
          'permissions_microphone_allowHelp',
          'Please click “Allow” when prompted for microphone access.',
        );
      } else if (error && error.name === 'NotFoundError') {
        errorMessage += t('permissions_microphone_notFound', 'No microphone found. Please check your audio devices.');
      } else if (error && error.message) {
        errorMessage += error.message;
      }

      statusText.textContent = errorMessage;
      fitWindowToContent();
    }
  });

  const finishLayout = () => {
    requestAnimationFrame(() => requestAnimationFrame(fitWindowToContent));
  };

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions
      .query({ name: 'microphone' })
      .then(permissionStatus => {
        if (permissionStatus.state === 'granted') {
          clearStatus();
          requestButton.textContent = t('permissions_microphone_alreadyGrantedButton', 'Permission Already Granted');
          requestButton.disabled = true;
        }
        finishLayout();
      })
      .catch(() => finishLayout());
  } else {
    finishLayout();
  }

  window.addEventListener('load', finishLayout);

  // Failsafe: never leave the page invisible
  window.setTimeout(revealPage, 600);
});
