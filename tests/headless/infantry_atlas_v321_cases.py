"""Deterministic temporary raster fixtures. Nothing generated here ships as game art."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from infantry_atlas_png import read_rgba, write_rgba

PACKER = ROOT / "scripts/build-infantry-atlas.py"
VALIDATOR = ROOT / "scripts/validate-infantry-atlas.py"
CONFIG = json.loads((ROOT / "graphics-lab/assets/sprites/unit-animation-config.json").read_text())


class AtlasCases(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="nrts-v321-atlas-")
        self.base = Path(self.tmp.name)
        self.source = self.base / "frames"
        self.output = self.base / "output"
        for side, prefix in (("france", "fr"), ("britain", "br")):
            folder = self.source / side
            folder.mkdir(parents=True)
            record = {
                "assetId": side + "-line-infantry-v321",
                "sourceType": "original",
                "author": "Synthetic regression test generator",
                "usageRights": "Original test-only graphics, not for production release",
                "sourceRef": "tests/headless/infantry_atlas_v321_cases.py",
                "reviewedForUse": True, "referenceFacing": "screen-right",
                "pivot": {"x": 48, "y": 78}, "feetAligned": True
            }
            (folder / "provenance.json").write_text(json.dumps(record))
            number = 0
            for state, props in CONFIG["states"].items():
                for i in range(1, props["frames"] + 1):
                    rgba = bytearray(96 * 96 * 4)
                    for y in range(30, 79):
                        for x in range(36, 60):
                            start = (y * 96 + x) * 4
                            rgba[start:start + 4] = bytes(
                                (70 if side == "france" else 171, number * 11 % 255, 136, 255))
                    # Different pixels, same lower foot/shadow line in every frame.
                    offset = ((12 + number) * 96 + (10 + number)) * 4
                    rgba[offset:offset + 4] = bytes((220, 130, 60, 255))
                    write_rgba(folder / f"{prefix}_line_{state}_{i:02d}.png", 96, 96, rgba)
                    number += 1

    def tearDown(self):
        self.tmp.cleanup()

    def pack(self, side="both"):
        return subprocess.run(
            [sys.executable, str(PACKER), "--source-root", str(self.source),
             "--out", str(self.output), "--side", side],
            capture_output=True, text=True, timeout=60)

    def check(self, side="both"):
        return subprocess.run(
            [sys.executable, str(VALIDATOR), "--input", str(self.output), "--side", side],
            capture_output=True, text=True, timeout=60)

    def test_build_and_validate_two_complete_atlases(self):
        p = self.pack()
        self.assertEqual(p.returncode, 0, p.stderr)
        test = self.check()
        self.assertEqual(test.returncode, 0, test.stderr)
        self.assertEqual([x["frames"] for x in json.loads(test.stdout)["validated"]], [17, 17])
        for side, prefix in (("france", "fr"), ("britain", "br")):
            folder = self.output / side
            stem = prefix + "_line_infantry_atlas"
            w, h, image = read_rgba(folder / (stem + ".png"))
            self.assertEqual((w, h, len(image)), (576, 288, 576 * 288 * 4))
            meta = json.loads((folder / (stem + ".json")).read_text())
            self.assertEqual(len(meta["frames"]), 17)
            self.assertEqual(
                {key: len(value) for key, value in meta["animations"].items()},
                {"idle": 2, "march": 6, "aim": 2, "fire": 3, "reload": 4})
            self.assertEqual(meta["frames"][prefix + "_line_idle_01"]["anchor"],
                             {"x": .5, "y": .8125})
            # The spare eighteenth slot is deliberately all transparent.
            alpha = [image[(y * w + x) * 4 + 3]
                     for y in range(192, 288) for x in range(480, 576)]
            self.assertTrue(all(value == 0 for value in alpha))

    def test_repeat_build_is_byte_identical(self):
        self.assertEqual(self.pack().returncode, 0)
        def digests():
            paths = []
            for side, prefix in (("france", "fr"), ("britain", "br")):
                folder = self.output / side
                for name in (prefix + "_line_infantry_atlas.png",
                             prefix + "_line_infantry_atlas.json",
                             "atlas-provenance.json"):
                    paths.append(hashlib.sha256((folder / name).read_bytes()).hexdigest())
            return paths
        before = digests()
        self.assertEqual(self.pack().returncode, 0)
        self.assertEqual(before, digests())

    def test_missing_british_frame_aborts_without_french_outputs(self):
        (self.source / "britain/br_line_fire_03.png").unlink()
        result = self.pack()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing frames", result.stderr)
        self.assertFalse((self.output / "france/fr_line_infantry_atlas.png").exists())

    def test_unreviewed_source_is_rejected(self):
        path = self.source / "france/provenance.json"
        data = json.loads(path.read_text())
        data["reviewedForUse"] = False
        path.write_text(json.dumps(data))
        result = self.pack("france")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("rights/art review", result.stderr)

    def test_duplicate_frames_are_rejected(self):
        folder = self.source / "britain"
        (folder / "br_line_march_02.png").write_bytes(
            (folder / "br_line_march_01.png").read_bytes())
        result = self.pack("britain")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("duplicate pixel-identical", result.stderr)

    def test_alpha_border_clipping_is_rejected(self):
        png = self.source / "france/fr_line_idle_01.png"
        w, h, original = read_rgba(png)
        rgba = bytearray(original)
        rgba[3] = 255
        write_rgba(png, w, h, rgba)
        result = self.pack("france")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("touches a frame border", result.stderr)

    def test_invalid_frame_size_is_rejected(self):
        png = self.source / "france/fr_line_idle_01.png"
        write_rgba(png, 48, 48, bytes(48 * 48 * 4))
        result = self.pack("france")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires exact", result.stderr)

    def test_validator_detects_mutated_atlas(self):
        self.assertEqual(self.pack("france").returncode, 0)
        atlas = self.output / "france/fr_line_infantry_atlas.png"
        broken = bytearray(atlas.read_bytes())
        broken[29] ^= 0x44
        atlas.write_bytes(broken)
        result = self.check("france")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("CRC mismatch", result.stderr)


if __name__ == "__main__":
    unittest.main()
