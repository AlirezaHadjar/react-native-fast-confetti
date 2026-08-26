#!/usr/bin/env python3
"""One-command track, optimize, and optional rendered-video verification."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from optimize import make_dataset
from track import find_onsets, process_burst, video_info
from verify import verify

SCRIPT_DIR = Path(__file__).resolve().parent


def track_references(videos: list[Path], work_dir: Path, duration: float) -> list[Path]:
    outputs: list[Path] = []
    for video_index, video in enumerate(videos):
        info = video_info(video)
        onsets = find_onsets(video, info, duration, 4)
        for burst_index, onset in enumerate(onsets):
            output = work_dir / (
                f"reference-{video_index + 1}-burst-{burst_index + 1}-tracks.json.gz"
            )
            outputs.append(process_burst(video, output, onset, duration, info))
    return outputs


def optimization_order(paths: list[Path]) -> tuple[Path, list[Path]]:
    ranked = sorted(
        paths,
        key=lambda path: make_dataset(path).intentional_tracks,
        reverse=True,
    )
    return ranked[0], ranked[1:]


def optimize(
    training: Path,
    validation: list[Path],
    output: Path,
    report: Path,
    preset_name: str,
) -> None:
    command = [
        sys.executable,
        str(SCRIPT_DIR / "optimize.py"),
        "--train",
        str(training),
    ]
    for path in validation:
        command.extend(["--validation", str(path)])
    command.extend(
        [
            "--output",
            str(output),
            "--report",
            str(report),
            "--preset-name",
            preset_name,
        ]
    )
    subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-video", action="append", required=True, type=Path)
    parser.add_argument("--app-video", action="append", type=Path, default=[])
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--optimizer-report", required=True, type=Path)
    parser.add_argument("--preset-name", required=True)
    parser.add_argument("--verifier-report", type=Path)
    parser.add_argument("--duration", type=float, default=3.5)
    args = parser.parse_args()

    args.work_dir.mkdir(parents=True, exist_ok=True)
    tracks = track_references(args.reference_video, args.work_dir, args.duration)
    training, validation = optimization_order(tracks)
    optimize(
        training,
        validation,
        args.output,
        args.optimizer_report,
        args.preset_name,
    )

    verifier_report = None
    if args.app_video:
        if args.verifier_report is None:
            parser.error("--verifier-report is required with --app-video")
        verifier_report = verify(
            tracks,
            args.app_video,
            args.verifier_report,
            args.duration,
            None,
        )

    manifest = {
        "training": str(training),
        "validation": [str(path) for path in validation],
        "output": str(args.output),
        "preset_name": args.preset_name,
        "optimizer_report": str(args.optimizer_report),
        "verifier_report": str(args.verifier_report) if verifier_report else None,
        "verified": verifier_report["passed"] if verifier_report else None,
    }
    manifest_path = args.work_dir / "reconstruction-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))
    if verifier_report is not None and not verifier_report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
