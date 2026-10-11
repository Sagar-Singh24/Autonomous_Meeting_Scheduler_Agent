from __future__ import annotations

from pathlib import Path


def transcribe(audio_path: str | Path) -> str:
    """
    Transcribe an audio file using OpenAI Whisper (local model).
    If the path points to a .txt file, return its contents directly
    (useful for testing with pre-written transcripts).
    """
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")

    if path.suffix.lower() == ".txt":
        return path.read_text(encoding="utf-8")

    import os, warnings
    import whisper  # lazy import — only needed when processing real audio

    # Ensure ffmpeg is findable even if not on system PATH
    ffmpeg_bin = r"C:\Users\Aser\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin"
    if ffmpeg_bin not in os.environ.get("PATH", ""):
        os.environ["PATH"] = ffmpeg_bin + os.pathsep + os.environ.get("PATH", "")

    model = whisper.load_model("base")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result = model.transcribe(str(path))
    return result["text"]
