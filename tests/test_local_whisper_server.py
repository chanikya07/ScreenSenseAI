"""Unit tests for local_whisper_server.py.

The tests exercise the Flask routes (/health, /transcribe) and the
audio-related helper functions using mocks for the heavy ML model
and ffmpeg.
"""

import importlib
import io
import json
import os
import sys
import tempfile
import types
from unittest import mock

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Stub heavy optional deps before importing the server module.
# ---------------------------------------------------------------------------

_faster_whisper = types.ModuleType("faster_whisper")


class _FakeWhisperModel:
    """Lightweight stand-in for faster_whisper.WhisperModel."""

    def __init__(self, *_a, **_kw):
        pass

    def transcribe(self, audio, **kwargs):
        class _Seg:
            text = " hello world "
            start = 0.0
            end = 1.5

        class _Info:
            language = kwargs.get("language") or "en"

        return iter([_Seg()]), _Info()


_faster_whisper.WhisperModel = _FakeWhisperModel
sys.modules.setdefault("faster_whisper", _faster_whisper)

_imageio_ffmpeg = types.ModuleType("imageio_ffmpeg")
_imageio_ffmpeg.get_ffmpeg_exe = lambda: "ffmpeg"
sys.modules.setdefault("imageio_ffmpeg", _imageio_ffmpeg)

# Now import the module under test.
# We need to set the working directory appropriately.
SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

import local_whisper_server as server  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    """Create a Flask test client."""
    server.app.config["TESTING"] = True
    with server.app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_model():
    """Ensure each test starts without a loaded model."""
    server.model = None
    server.model_error = None
    yield
    server.model = None
    server.model_error = None


# ---------------------------------------------------------------------------
# /health endpoint
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert "model" in data
        assert "ffmpeg" in data

    def test_health_reports_model_not_loaded(self, client):
        resp = client.get("/health")
        data = resp.get_json()
        assert data["model_loaded"] is False

    def test_health_reports_model_loaded(self, client):
        server.model = _FakeWhisperModel()
        resp = client.get("/health")
        data = resp.get_json()
        assert data["model_loaded"] is True

    def test_health_reports_model_error(self, client):
        server.model_error = "Something broke"
        resp = client.get("/health")
        data = resp.get_json()
        assert data["model_error"] == "Something broke"


# ---------------------------------------------------------------------------
# /transcribe endpoint
# ---------------------------------------------------------------------------

class TestTranscribeEndpoint:
    def test_options_returns_204(self, client):
        resp = client.options("/transcribe")
        assert resp.status_code == 204

    def test_missing_audio_returns_400(self, client):
        resp = client.post("/transcribe")
        assert resp.status_code == 400
        data = resp.get_json()
        assert "Missing audio" in data["error"]

    def test_transcribe_returns_skipped_for_short_audio(self, client):
        """Audio shorter than min_audio_seconds should be skipped."""
        # Produce a very short, silent audio array.
        short_samples = np.zeros(100, dtype=np.float32)
        raw_pcm = (short_samples * 32768).astype(np.int16).tobytes()

        with mock.patch.object(server, "ffmpeg_available", True), \
             mock.patch.object(server, "load_audio_with_local_ffmpeg", return_value=short_samples):
            data = {"audio": (io.BytesIO(b"fake"), "audio.webm")}
            resp = client.post("/transcribe", data=data, content_type="multipart/form-data")

        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get("skipped") is True
        assert body["text"] == ""

    def test_transcribe_success(self, client):
        """Valid audio produces a transcription result."""
        # 2 seconds of white noise
        audio_array = np.random.randn(32000).astype(np.float32) * 0.1

        with mock.patch.object(server, "ffmpeg_available", True), \
             mock.patch.object(server, "load_audio_with_local_ffmpeg", return_value=audio_array):
            data = {"audio": (io.BytesIO(b"fake-audio-data"), "audio.webm")}
            resp = client.post("/transcribe", data=data, content_type="multipart/form-data")

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["text"] == "hello world"
        assert len(body["segments"]) == 1
        assert body["segments"][0]["text"] == "hello world"

    def test_transcribe_no_ffmpeg_returns_500(self, client):
        with mock.patch.object(server, "ffmpeg_available", False):
            data = {"audio": (io.BytesIO(b"fake"), "audio.webm")}
            resp = client.post("/transcribe", data=data, content_type="multipart/form-data")

        assert resp.status_code == 500
        body = resp.get_json()
        assert "ffmpeg" in body["error"].lower()

    def test_transcribe_audio_decode_error_returns_skipped(self, client):
        """Audio decode failure returns a graceful skipped response."""
        with mock.patch.object(server, "ffmpeg_available", True), \
             mock.patch.object(server, "load_audio_with_local_ffmpeg",
                               side_effect=RuntimeError("Failed to load audio: bad data")):
            data = {"audio": (io.BytesIO(b"corrupt"), "audio.webm")}
            resp = client.post("/transcribe", data=data, content_type="multipart/form-data")

        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get("skipped") is True
        assert body["reason"] == "audio-decode"

    def test_transcribe_unexpected_error_returns_500(self, client):
        with mock.patch.object(server, "ffmpeg_available", True), \
             mock.patch.object(server, "load_audio_with_local_ffmpeg",
                               side_effect=ValueError("unexpected")):
            data = {"audio": (io.BytesIO(b"bad"), "audio.webm")}
            resp = client.post("/transcribe", data=data, content_type="multipart/form-data")

        assert resp.status_code == 500
        body = resp.get_json()
        assert "unexpected" in body["error"]


# ---------------------------------------------------------------------------
# CORS headers
# ---------------------------------------------------------------------------

class TestCORS:
    def test_cors_headers_present(self, client):
        resp = client.get("/health")
        assert resp.headers.get("Access-Control-Allow-Origin") == "*"
        assert "POST" in resp.headers.get("Access-Control-Allow-Methods", "")

    def test_cors_on_options(self, client):
        resp = client.options("/transcribe")
        assert resp.headers.get("Access-Control-Allow-Origin") == "*"


# ---------------------------------------------------------------------------
# get_model helper
# ---------------------------------------------------------------------------

class TestGetModel:
    def test_get_model_returns_model_instance(self):
        m = server.get_model()
        assert m is not None
        assert server.model is m

    def test_get_model_caches_model(self):
        m1 = server.get_model()
        m2 = server.get_model()
        assert m1 is m2

    def test_get_model_records_error(self):
        def bad_init(*a, **kw):
            raise RuntimeError("GPU not available")

        with mock.patch.object(server, "WhisperModel", bad_init):
            with pytest.raises(RuntimeError):
                server.get_model()
            assert server.model_error == "GPU not available"


# ---------------------------------------------------------------------------
# load_audio_with_local_ffmpeg
# ---------------------------------------------------------------------------

class TestLoadAudio:
    def test_load_audio_returns_float32_array(self, tmp_path):
        """When ffmpeg produces valid PCM output, we get a float32 numpy array."""
        pcm_data = np.array([0, 1000, -1000, 32767, -32768], dtype=np.int16).tobytes()
        fake_result = mock.Mock()
        fake_result.stdout = pcm_data
        fake_result.returncode = 0

        with mock.patch("subprocess.run", return_value=fake_result):
            result = server.load_audio_with_local_ffmpeg("/fake/audio.wav")

        assert result.dtype == np.float32
        assert len(result) == 5

    def test_load_audio_raises_on_ffmpeg_failure(self):
        import subprocess
        with mock.patch("subprocess.run",
                        side_effect=subprocess.CalledProcessError(1, "ffmpeg", stderr=b"error details")):
            with pytest.raises(RuntimeError, match="Failed to load audio"):
                server.load_audio_with_local_ffmpeg("/fake/audio.wav")
