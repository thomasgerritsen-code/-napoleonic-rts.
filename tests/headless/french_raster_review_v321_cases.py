"""Validate the first French 17-frame raster asset without claiming visual approval."""
from __future__ import annotations
import hashlib
import json
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"scripts"))
from infantry_atlas_png import read_rgba, alpha_bounds

BASE=ROOT/"graphics-lab/assets/sprites/infantry/france"
IMG=BASE/"fr_line_infantry_atlas.png"
META=BASE/"fr_line_infantry_atlas.json"
PROV=BASE/"atlas-provenance.json"
CFG=ROOT/"graphics-lab/assets/sprites/unit-animation-config.json"

class FrenchRasterReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg=json.loads(CFG.read_text())
        cls.meta=json.loads(META.read_text())
        cls.prov=json.loads(PROV.read_text())
        cls.width,cls.height,cls.pixels=read_rgba(IMG)

    def test_dimensions_and_approval_pending(self):
        self.assertEqual((self.width,self.height),(576,288))
        self.assertEqual(self.prov["assetId"],"france-line-infantry-v321")
        self.assertEqual(self.prov["reviewedForUse"],False)
        self.assertIn("DRAFT",self.prov["reviewStatus"])

    def test_required_states_have_all_seventeen_frames(self):
        expected={}
        for state, item in self.cfg["states"].items():
            expected[state]=[f"fr_line_{state}_{i:02d}"
                             for i in range(1,item["frames"]+1)]
        self.assertEqual(self.meta["animations"],expected)
        self.assertEqual(len(self.meta["frames"]),17)
        self.assertEqual(len(self.prov["frameRecords"]),17)
        self.assertEqual(self.meta["meta"]["size"],{"w":576,"h":288})
        self.assertEqual(self.meta["meta"]["image"],"fr_line_infantry_atlas.png")
        self.assertEqual(self.prov["atlasSha256"],hashlib.sha256(IMG.read_bytes()).hexdigest())

    def test_each_frame_unclipped_nonempty_distinct_and_anchored(self):
        digests=[]
        records=self.prov["frameRecords"]
        for i,(key,meta) in enumerate(self.meta["frames"].items()):
            x=(i%6)*96;y=(i//6)*96
            self.assertEqual(meta["frame"],{"x":x,"y":y,"w":96,"h":96})
            self.assertEqual(meta["anchor"],{"x":.5,"y":.8125})
            pixels=b"".join(self.pixels[((y+j)*576+x)*4:((y+j)*576+x+96)*4] for j in range(96))
            bounds=alpha_bounds(pixels,96,96)
            self.assertIsNotNone(bounds)
            self.assertGreater(bounds[0],0)
            self.assertGreater(bounds[1],0)
            self.assertLess(bounds[2],95)
            self.assertLess(bounds[3],95)
            self.assertEqual(bounds[3],77)
            digest=hashlib.sha256(pixels).hexdigest()
            digests.append(digest)
            self.assertEqual(records[i]["frame"],key)
            self.assertEqual(records[i]["sha256"],digest)
        self.assertEqual(len(set(digests)),17)

    def test_unused_last_cell_is_transparent(self):
        x,y=5*96,2*96
        pixels=b"".join(self.pixels[((y+j)*576+x)*4:((y+j)*576+x+96)*4] for j in range(96))
        self.assertTrue(all(v==0 for v in pixels))

if __name__=="__main__":
    unittest.main()
