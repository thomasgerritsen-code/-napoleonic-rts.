"""Regression tests for v321 visual art inspector: warnings cannot mean approval."""
from __future__ import annotations
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from infantry_atlas_png import write_rgba

SCRIPT = ROOT / "scripts/review-infantry-art.py"
ORDER = {"idle": 2, "march": 6, "aim": 2, "fire": 3, "reload": 4}


class FrameReviewTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="rts-v321-art-review-")
        self.root = Path(self.directory.name)
        atlas_pixels = bytearray(576 * 288 * 4)
        frames = {}
        animations = {}
        index = 0
        for state, count in ORDER.items():
            names = []
            for pose in range(1, count + 1):
                name = f"br_line_{state}_{pose:02}"
                names.append(name)
                cx, cy = (index % 6) * 96, (index // 6) * 96
                frames[name] = {
                    "frame": {"x": cx, "y": cy, "w": 96, "h": 96},
                    "anchor": {"x": 0.5, "y": 0.8125}
                }
                # A consistent silhouette with a different dot for each pose.
                # march_02 deliberately has incomplete lower legs (QA warning).
                max_y = 60 if name.endswith("march_02") else 77
                for y in range(20, max_y + 1):
                    for x in range(34, 56):
                        offset = ((cy + y) * 576 + cx + x) * 4
                        atlas_pixels[offset:offset+4] = bytes((164, index*7 % 255, 85, 255))
                dot = ((cy + 12 + index) * 576 + cx + 12 + index) * 4
                atlas_pixels[dot:dot+4] = bytes((190, 165, 90, 255))
                index += 1
            animations[state] = names
        write_rgba(self.root / "atlas.png", 576, 288, atlas_pixels)
        (self.root / "atlas.json").write_text(json.dumps({
            "frames": frames,
            "animations": animations,
            "meta": {"size": {"w": 576, "h": 288}}
        }))

    def tearDown(self):
        self.directory.cleanup()

    def run_review(self):
        return subprocess.run([
            sys.executable, str(SCRIPT),
            "--atlas", str(self.root / "atlas.png"),
            "--metadata", str(self.root / "atlas.json"),
            "--html", str(self.root / "review.html"),
            "--json", str(self.root / "review.json")
        ], capture_output=True, text=True, timeout=30)

    def test_reports_missing_british_legs_without_automatically_approving_assets(self):
        p = self.run_review()
        self.assertEqual(p.returncode, 0, p.stderr)
        report = json.loads((self.root / "review.json").read_text())
        self.assertEqual(report["frameCount"], 17)
        self.assertEqual(report["status"], "VISUAL_REVIEW_REQUIRED")
        self.assertTrue(report["requiresManualReview"])
        flagged = {w["frame"]: w["issues"] for w in report["warnings"]}
        self.assertIn("br_line_march_02", flagged)
        self.assertTrue(any("voet" in item for item in flagged["br_line_march_02"]))
        self.assertEqual(len(report["frames"]), 17)
        self.assertTrue(report["sourceSha256"])

    def test_report_is_self_contained_and_previews_both_96_and_24_pixel_sizes(self):
        p = self.run_review()
        self.assertEqual(p.returncode, 0, p.stderr)
        source = (self.root / "review.html").read_text()
        self.assertIn("data:image/png;base64,", source)
        self.assertIn("24px", source)
        self.assertIn("ARTREVIEW VEREIST", source)
        self.assertIn("br_line_reload_04", source)
        self.assertNotIn("https://", source)

    def test_rejects_nonmatching_dimensions_or_missing_data(self):
        manifest = self.root / "atlas.json"
        metadata = json.loads(manifest.read_text())
        metadata["animations"]["reload"].pop()
        manifest.write_text(json.dumps(metadata))
        p = self.run_review()
        self.assertNotEqual(p.returncode, 0)
        self.assertIn("Need 2/6/2/3/4", p.stderr)
        self.assertFalse((self.root / "review.html").exists())


if __name__ == "__main__":
    unittest.main()
