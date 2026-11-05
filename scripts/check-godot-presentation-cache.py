#!/usr/bin/env python3
"""Exercise an updated project whose class index predates Presentation2D."""

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1] / "godot")
    args = parser.parse_args()
    engine = shutil.which(args.godot) or str(Path(args.godot).resolve())
    project = args.project.resolve()
    cache = project / ".godot/global_script_class_cache.cfg"
    original = cache.read_text()
    # Leave every existing game class indexed, as on an installed project,
    # but remove the new helper's registration without touching its file.
    stale, count = re.subn(
        r'\{\s*"base":.*?\}',
        lambda m: "" if '"Presentation2D"' in m.group() else m.group(),
        original,
        flags=re.S,
    )
    assert count and '"Presentation2D"' not in stale
    # Removing an entry can leave an empty slot in the comma-separated array.
    stale = re.sub(r",\s*,", ",", stale)
    stale = re.sub(r"\[\s*,", "[", stale)
    stale = re.sub(r",\s*\]", "]", stale)
    with tempfile.TemporaryDirectory(prefix="rts-stale-classes-") as directory:
        root = Path(directory)
        shutil.copy2(project / "project.godot", root / "project.godot")
        shutil.copytree(project / "scripts", root / "scripts")
        (root / ".godot").mkdir()
        (root / ".godot/global_script_class_cache.cfg").write_text(stale)
        uid_cache = project / ".godot/uid_cache.bin"
        if uid_cache.exists():
            shutil.copy2(uid_cache, root / ".godot/uid_cache.bin")
        # Reuse immutable imported assets; keep the test's class index local.
        for path in project.iterdir():
            if path.name not in {"scripts", "project.godot", ".godot", "build"}:
                (root / path.name).symlink_to(path, target_is_directory=path.is_dir())
        (root / ".godot/imported").symlink_to(project / ".godot/imported", target_is_directory=True)
        for arguments in [
            ["--check-only", "--script", "res://scripts/main.gd"],
            ["--script", "res://tests/presentation_3d_test.gd"],
        ]:
            result = subprocess.run(
                [engine, "--headless", "--path", str(root), *arguments],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                timeout=240, env={**os.environ},
            )
            print(result.stdout, end="", flush=True)
            errors = [line for line in result.stdout.splitlines()
                      if re.search(r"SCRIPT ERROR|Parse Error|ERROR:", line)
                      and "still in use at exit" not in line]
            if result.returncode or errors:
                raise SystemExit("STALE_CLASS_CACHE failed")
            if "--check-only" not in arguments:
                assert "GODOT_PRESENTATION" in result.stdout
        print("STALE_CLASS_CACHE passed: parse and gameplay without helper registration")


if __name__ == "__main__":
    main()
