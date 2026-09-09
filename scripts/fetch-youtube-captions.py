"""Caption-only worker. No cookies, proxy, DRM workarounds, or video downloads."""
import argparse
import json
import pathlib
import re
import sys
import yt_dlp


class QuietLogger:
    def debug(self, _message):
        pass

    def warning(self, _message):
        pass

    def error(self, _message):
        pass  # Provider errors may include transient signed URLs.


def provider_error_code(error):
    # Classify without exposing provider URLs, tokens or response bodies.
    message = str(error).lower()
    if "not a bot" in message or "sign in to confirm" in message:
        return "provider_verification_required"
    if "429" in message or "too many requests" in message:
        return "provider_rate_limited"
    if "403" in message or "forbidden" in message:
        return "provider_access_denied"
    if "timed out" in message or "timeout" in message:
        return "provider_timeout"
    return "provider_caption_fetch_failed"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--channel-id", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", args.video_id):
        raise ValueError("invalid_video")
    if not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", args.channel_id):
        raise ValueError("invalid_channel")
    folder = pathlib.Path(args.output_dir).resolve(strict=True)
    options = {
        "skip_download": True, "noplaylist": True, "cachedir": False,
        "writesubtitles": True, "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-orig"], "subtitlesformat": "json3",
        "outtmpl": str(folder / "%(id)s.%(ext)s"),
        "quiet": True, "noprogress": True, "logger": QuietLogger(),
        "socket_timeout": 10, "retries": 0, "extractor_retries": 0,
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(f"https://www.youtube.com/watch?v={args.video_id}", download=False)
        if not info or info.get("id") != args.video_id or info.get("channel_id") != args.channel_id:
            raise ValueError("source_channel_mismatch")
        if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming", "post_live"):
            raise ValueError("live_source")
        if info.get("availability") not in (None, "public"):
            raise ValueError("nonpublic_source")
        language = "en" if info.get("subtitles", {}).get("en") else "en-orig"
        requested = info.get("requested_subtitles") or {}
        if language not in requested:
            print(json.dumps({"status": "unavailable", "code": "no_original_english_captions"}))
            return
        # Keep only manual English or original English ASR, never translations.
        info["requested_subtitles"] = {language: requested[language]}
        downloader.process_info(info)
        artifact = folder / f"{args.video_id}.{language}.json3"
        if not artifact.is_file() or artifact.stat().st_size > 4_000_000:
            raise ValueError("invalid_caption_artifact")
        print(json.dumps({"status": "downloaded", "filename": artifact.name,
                          "kind": "manual" if language == "en" else "automatic",
                          "channelId": args.channel_id, "videoId": args.video_id}))


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        print(json.dumps({"status": "failed", "code": str(error)}))
        sys.exit(1)
    except Exception as error:
        print(json.dumps({"status": "failed", "code": provider_error_code(error)}))
        sys.exit(1)
