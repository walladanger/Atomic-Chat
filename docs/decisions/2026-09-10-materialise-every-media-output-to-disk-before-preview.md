---
date: 2026-09-10
title: "Materialise every media output to local disk before preview"
---

# 2026-09-10 — Materialise every media output to local disk before preview

- **Context:** A provider can return a result three ways: a URL, base64 bytes, or
  a path it already wrote. The v1 preview accepted an `https:` source directly.
  Verified rather than assumed: `tauri.conf.json` line 27 already restricts
  `img-src`, so a remote preview would have been refused by the CSP anyway — the
  passthrough was dead code that looked like a feature. The alternative on the
  table was widening `media-src` to `https:`.

- **Decision:** Every provider output is downloaded and written to a local file
  BEFORE anything points a preview at it. The CSP is left exactly as it is and
  `media-src` is NOT widened. `toPreviewSrc`'s `https:` branch was deleted.

- **Consequences:**
  - Privacy: the webview never fetches from a provider's host at render time, so
    a preview cannot leak that the user is viewing a result, and no third party
    sees a request carrying app identity.
  - Offline: a generation stays viewable once made. A URL-backed preview would
    break the moment the provider expired the link, which for hosted providers
    is often hours.
  - It is what makes the library possible at all — an entry pointing at a remote
    URL is a bookmark, not an asset.
  - Cost: disk. A provider that already wrote the file locally is ADOPTED where
    it lies rather than copied, so local generation does not pay twice.
  - Writes go through a `.partial` and are promoted only on success, so a
    crash mid-download cannot leave a truncated file the index calls valid.

- **Owner:** `team`

- **Links:** `web-app/src/services/media/assets.ts`; `containers/media/MediaPreview.tsx`;
  tracker Task 8, Task 11 Step 6, decision Q4.
