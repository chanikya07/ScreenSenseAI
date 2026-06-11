// Shared constants used across multiple renderer windows.

const LANG_NAMES = {
  default: 'Default (Original)',
  en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', fr: 'French',
  de: 'German', es: 'Spanish', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  ar: 'Arabic', pt: 'Portuguese', ru: 'Russian', it: 'Italian', nl: 'Dutch',
  pl: 'Polish', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian'
};

const MODE_LABELS = {
  'live-captions': 'Live Captions',
  'scene-explain': 'Scene Explainer',
  'transcript': 'Transcript Notes',
  'summarizer': 'Summarizer',
  'face-analysis': 'Face Analyzer',
  'ai-authenticity': 'AI Fake Detector',
  'call-recording': 'Call Recording'
};

const MODE_ICONS = {
  'live-captions': '💬',
  'scene-explain': '🎬',
  'transcript': '📝',
  'summarizer': '✨',
  'face-analysis': '😊',
  'ai-authenticity': '🔍',
  'call-recording': 'REC'
};

const TRANSCRIPTION_MODELS = {
  openai: {
    transcription: 'whisper-1',
    vision: 'gpt-4o-mini',
    summary: 'gpt-4o-mini'
  },
  groq: {
    transcription: 'whisper-large-v3',
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
    summary: 'llama-3.3-70b-versatile'
  },
  ollama: {
    vision: 'llava',
    summary: 'llama3.2'
  }
};

const OLLAMA_CHAT_URL = 'http://localhost:11434/v1/chat/completions';
const OLLAMA_SUMMARY_MODEL = TRANSCRIPTION_MODELS.ollama.summary;
