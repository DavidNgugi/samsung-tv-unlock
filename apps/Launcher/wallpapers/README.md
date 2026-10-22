# Wallpapers (media not committed)

The picker reads `wallpapers.json` and plays the MP4s referenced there.

The actual `.mp4` / `.jpg` files are **not committed** — they are 88 MB of
scraped/downloaded live-wallpaper content, and redistributing it is not ours to do.
To populate them:

1. Drop your own clips in this folder as `<id>.mp4` (H.264, 1080p, 30 fps, muted),
   with a `<id>.jpg` thumbnail, where `<id>` matches `wallpapers.json`.
2. Or re-run the inventory scraper that produced `wallpapers.json`.

The app is designed to default to the **aurora** theme, so it works with zero
wallpapers present.
