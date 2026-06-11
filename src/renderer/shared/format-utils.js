// Shared formatting and text utility functions.

function formatTimestamp(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function normalizeTranscript(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function getOutputLanguageCode(settings) {
  const targetLanguage = settings?.preferredOutputLanguage || 'default';
  return targetLanguage === 'default' || targetLanguage === 'auto' ? '' : targetLanguage;
}

function getInputLanguageCode(settings) {
  const inputLanguage = settings?.preferredLanguage || 'auto';
  return inputLanguage === 'auto' || inputLanguage === 'default' ? '' : inputLanguage;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const out = String(reader.result || '');
      const idx = out.indexOf(',');
      resolve(idx >= 0 ? out.slice(idx + 1) : out);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
