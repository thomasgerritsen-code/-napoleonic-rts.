# System Chrome in CI

GitHub-hosted Ubuntu runners include Google Chrome. CI therefore runs Playwright against the preinstalled Chrome channel instead of downloading Playwright's bundled Chromium for every job.

- Local Playwright runs keep using the bundled Chromium project behavior.
- CI sets `CI_SYSTEM_CHROME=1`, which selects `channel: 'chrome'`.
- CI retains Playwright traces and screenshots on failure.
- CI video is disabled because the Playwright browser bundle also supplies the managed FFmpeg binary.
- Pull requests still use focused browser coverage; `main` still runs the complete release suite before GitHub Pages deployment.
