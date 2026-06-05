from flask import Flask, jsonify, request
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import traceback

import numpy as np
from faster_whisper import WhisperModel

try:
    import imageio_ffmpeg
except Exception:
    imageio_ffmpeg = None


def find_ffmpeg_path():
    if getattr(sys, 'frozen', False):
        script_dir = os.path.dirname(sys.executable)
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))

    candidates = []
    if os.name == 'nt':
        candidates.extend([
            os.path.join(script_dir, 'ffmpeg.exe'),
            os.path.join(script_dir, 'ffmpeg', 'bin', 'ffmpeg.exe')
        ])
    else:
        candidates.extend([
            os.path.join(script_dir, 'ffmpeg'),
            os.path.join(script_dir, 'ffmpeg', 'bin', 'ffmpeg')
        ])

    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate

    ffmpeg_binary = shutil.which("ffmpeg")
    if ffmpeg_binary:
        return ffmpeg_binary

    if imageio_ffmpeg is not None:
        try:
            return imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            return None

    return None


app = Flask(__name__)
model = None
model_error = None
model_lock = threading.Lock()
model_name = os.environ.get("WHISPER_MODEL", "tiny")
model_device = os.environ.get("WHISPER_DEVICE", "auto")
model_compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
min_audio_seconds = float(os.environ.get("WHISPER_MIN_AUDIO_SECONDS", "0.9"))
min_audio_rms = float(os.environ.get("WHISPER_MIN_AUDIO_RMS", "0.003"))
sample_rate = 16000
ffmpeg_path = find_ffmpeg_path()
ffmpeg_available = bool(ffmpeg_path)


def load_audio_with_local_ffmpeg(file, sr=sample_rate):
    cmd = [
        ffmpeg_path or "ffmpeg",
        "-nostdin",
        "-threads",
        "0",
        "-i",
        file,
        "-f",
        "s16le",
        "-ac",
        "1",
        "-acodec",
        "pcm_s16le",
        "-ar",
        str(sr),
        "-",
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, check=True).stdout
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Failed to load audio: {exc.stderr.decode(errors='replace')}") from exc

    return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0


def get_model():
    global model, model_error
    if model is not None:
        return model

    with model_lock:
        if model is not None:
            return model
        try:
            model_error = None
            model = WhisperModel(model_name, device=model_device, compute_type=model_compute_type)
            return model
        except Exception as exc:
            model_error = str(exc)
            raise


def preload_model():
    try:
        get_model()
    except Exception as exc:
        print(f"Failed to load Whisper model: {exc}", flush=True)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/transcribe", methods=["POST", "OPTIONS"])
def transcribe():
    if request.method == "OPTIONS":
        return ("", 204)

    if not ffmpeg_available:
        return jsonify({"error": "ffmpeg was not found. Run: pip install -r requirements-local-whisper.txt"}), 500

    audio = request.files.get("audio")
    if audio is None:
        return jsonify({"error": "Missing audio upload."}), 400

    language = request.form.get("language") or "en"
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            audio.save(temp_file.name)
            temp_path = temp_file.name

        audio_array = load_audio_with_local_ffmpeg(temp_path)
        duration_seconds = len(audio_array) / sample_rate
        rms = float(np.sqrt(np.mean(np.square(audio_array)))) if len(audio_array) else 0.0
        if duration_seconds < min_audio_seconds or rms < min_audio_rms:
            return jsonify(
                {
                    "text": "",
                    "language": language,
                    "segments": [],
                    "skipped": True,
                    "reason": "too-short-or-silent",
                    "duration": duration_seconds,
                    "rms": rms,
                }
            )

        segments_iter, info = get_model().transcribe(
            audio_array,
            language=language or None,
            beam_size=1,
            temperature=0,
            condition_on_previous_text=False,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
            vad_filter=False,
        )

        transcript_segments = list(segments_iter)
        segments = [
            {
                "text": segment.text.strip(),
                "start": segment.start,
                "end": segment.end,
                "language": info.language or "",
            }
            for segment in transcript_segments
            if segment.text.strip()
        ]
        text = " ".join(segment["text"] for segment in segments).strip()

        return jsonify(
            {
                "text": text,
                "language": info.language or "",
                "segments": segments,
            }
        )
    except RuntimeError as exc:
        message = str(exc)
        if "Failed to load audio" in message or "cannot reshape tensor of 0 elements" in message:
            return jsonify({"text": "", "language": "", "segments": [], "skipped": True, "reason": "audio-decode"}), 200
        print(traceback.format_exc(), flush=True)
        return jsonify({"error": message}), 500
    except Exception as exc:
        print(traceback.format_exc(), flush=True)
        return jsonify({"error": str(exc)}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "ok": True,
            "ffmpeg": ffmpeg_available,
            "ffmpeg_path": ffmpeg_path,
            "model": model_name,
            "device": model_device,
            "compute_type": model_compute_type,
            "model_loaded": model is not None,
            "model_error": model_error,
            "min_audio_seconds": min_audio_seconds,
            "min_audio_rms": min_audio_rms,
        }
    )


if __name__ == "__main__":
    threading.Thread(target=preload_model, daemon=True).start()
    app.run(host="127.0.0.1", port=5001)
