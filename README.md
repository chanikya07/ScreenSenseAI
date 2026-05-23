# ScreenSense AI

A floating AI orb that lives on your desktop. Get live captions,
scene explanations, smart meeting notes, and AI-powered summaries
for anything on your screen — completely free.

## Download

Go to [Releases](../../releases) and download the installer for your OS:

| Platform | File |
|----------|------|
| Windows | `ScreenSense-AI-Setup-x.x.x.exe` |
| macOS | `ScreenSense-AI-x.x.x.dmg` |
| Linux | `ScreenSense-AI-x.x.x.AppImage` |

## Setup (5 minutes, completely free)

**Step 1 — Get a free Groq API key**
1. Go to https://console.groq.com
2. Sign up with Google or email (no credit card needed)
3. Click API Keys → Create API Key
4. Copy the key starting with `gsk_`

**Step 2 — Get a free Gemini API key**
1. Go to https://aistudio.google.com
2. Sign in with Google
3. Click "Get API key" → Create API key
4. Copy the key

**Step 3 — Configure the app**
1. Install and open ScreenSense AI
2. Click the floating orb → click the ⚙ Settings icon
3. Paste your Groq key in the Groq API Key field
4. Click Save Settings

That's it. No credit card. No monthly bill.

## Features

- **Live Captions** — real-time subtitles on any video, meeting, or call
- **Scene Explainer** — AI reads what's being taught, not just described
- **Transcript Notes** — full formatted notes exported as Markdown
- **Summarizer** — NotebookLM-style chapter breakdown at end of session
- **Face Analyzer** — detect expressions and emotional tone on screen
- **AI Fake Detector** — check if on-screen video looks AI-generated
- **Call Recording** — capture system audio and save as a file
- **Session Chat** — ask questions about what was just captured

## Local transcription (optional)

Live Captions use a local Whisper server that runs on your machine
for free. The app tries to start it automatically. If it fails:

```bash
pip install -r requirements-local-whisper.txt
python local_whisper_server.py
```

Or double-click `start-local-whisper.bat` on Windows.

## For developers

```bash
git clone https://github.com/YOUR_USERNAME/screensense-ai
cd screensense-ai
npm install
npm start
```

## License

MIT
