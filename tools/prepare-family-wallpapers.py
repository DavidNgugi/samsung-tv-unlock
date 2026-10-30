#!/usr/bin/env python3
"""Import user-owned family photos into a staged Clean Home package.

The source directory is deliberately outside the repository. The generated
16:9 composites and thumbnails are written only to the temporary launcher
staging directory used for packaging.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "photo"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--launcher", required=True, type=Path)
    args = parser.parse_args()

    source_dir = args.source.expanduser()
    if not source_dir.is_dir():
        print(f"family photos: {source_dir} (directory not found; skipped)")
        return 0

    try:
        subprocess.run(["ffmpeg", "-version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.CalledProcessError):
        print("family photos: ffmpeg is not installed; skipped")
        return 0

    wallpapers = args.launcher / "wallpapers"
    family_dir = wallpapers / "family"
    thumbs_dir = wallpapers / "thumbs"
    family_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    catalog_path = args.launcher / "wallpapers.json"
    catalog = json.loads(catalog_path.read_text())
    existing = {item.get("id") for item in catalog if isinstance(item, dict)}
    imported = 0

    for source in sorted(source_dir.iterdir()):
        if source.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        photo_slug = slug(source.stem)
        wallpaper_id = f"family-{photo_slug}"
        if wallpaper_id in existing:
            continue
        output = family_dir / f"{photo_slug}.jpg"
        thumb = thumbs_dir / f"{photo_slug}.jpg"
        filter_graph = (
            "[0:v]split=2[bg][fg];"
            "[bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
            "gblur=sigma=32,eq=brightness=-0.06:saturation=0.92,"
            "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill[back];"
            "[fg]scale=1680:980:force_original_aspect_ratio=decrease[front];"
            "[back][front]overlay=(W-w)/2:(H-h)/2,format=yuvj420p[out]"
        )
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-filter_complex", filter_graph, "-map", "[out]", "-frames:v", "1", "-q:v", "3", str(output),
        ], check=True)
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(output),
            "-vf", "scale=320:180:force_original_aspect_ratio=increase,crop=320:180,format=yuvj420p",
            "-frames:v", "1", "-q:v", "6", str(thumb),
        ], check=True)
        catalog.append({
            "id": wallpaper_id,
            "name": source.stem.replace("_", " "),
            "category": "family",
            "file": f"wallpapers/family/{output.name}",
            "thumb": f"wallpapers/thumbs/{thumb.name}",
            "still": True,
        })
        existing.add(wallpaper_id)
        imported += 1

    if imported:
        catalog_path.write_text(json.dumps(catalog, indent=1) + "\n")
    print(f"family photos: imported {imported} from {source_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
