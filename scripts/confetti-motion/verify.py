#!/usr/bin/env python3
"""Score captured app recordings against tracked reference recordings."""

from __future__ import annotations

import argparse
import json
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from metrics import (
    AspectMetrics,
    ThinnessMetrics,
    aspect_metrics,
    finite_mae,
    finite_rmse,
    observed_thinness,
    population_curve,
    serializable_metrics,
    trajectory_quantiles,
)
from optimize import Dataset, make_dataset, track_size
from track import find_onsets, process_burst, video_info


@dataclass(frozen=True)
class Guardrail:
    value: float
    threshold: float
    weight: float

    @property
    def normalized(self) -> float:
        return self.value / max(self.threshold, 1e-6)

    @property
    def passed(self) -> bool:
        return self.normalized <= 1


def intentional_tracks(dataset: Dataset) -> list[dict]:
    return [
        track for track in dataset.tracks if track_size(track) >= dataset.size_threshold
    ]


def mean_curve(curves: list[np.ndarray]) -> np.ndarray:
    values = np.stack(curves)
    finite_count = np.sum(np.isfinite(values), axis=0)
    return np.divide(
        np.nansum(values, axis=0),
        finite_count,
        out=np.full(values.shape[1:], np.nan),
        where=finite_count > 0,
    )


def pairwise(
    values: list[np.ndarray], distance: Callable[[np.ndarray, np.ndarray], float]
) -> list[float]:
    return [
        distance(values[first], values[second])
        for first in range(len(values))
        for second in range(first + 1, len(values))
    ]


def adaptive_threshold(
    floor: float, variation: list[float], multiplier: float = 2.0
) -> float:
    return max(floor, multiplier * max(variation, default=0))


def mean_metrics(values: list[ThinnessMetrics | AspectMetrics]) -> dict[str, float]:
    serialized = [serializable_metrics(value) for value in values]
    return {
        key: float(np.mean([value[key] for value in serialized]))
        for key in serialized[0]
    }


def metric_distance(
    first: dict[str, float], second: dict[str, float], keys: list[str]
) -> float:
    return float(np.mean([abs(first[key] - second[key]) for key in keys]))


def exit_p80(tracks: list[dict]) -> float:
    exits = [
        float(track["end_time"])
        for track in tracks
        if (
            track["points"][-1]["smoothed_x"] < 0.05
            or track["points"][-1]["smoothed_x"] > 0.95
            or track["points"][-1]["smoothed_y"] > 0.95
        )
    ]
    return float(np.quantile(exits, 0.8)) if exits else 0.0


def track_app_video(
    video: Path, output: Path, duration: float, onset: float | None
) -> Path:
    info = video_info(video)
    approximate = onset
    if approximate is None:
        approximate = find_onsets(video, info, duration, 1)[0]
    return process_burst(video, output, approximate, duration, info)


def verify(
    references: list[Path],
    app_videos: list[Path],
    output: Path,
    duration: float | None,
    app_onset: float | None,
) -> dict:
    reference_datasets = [make_dataset(path) for path in references]
    comparison_duration = duration or min(
        dataset.duration for dataset in reference_datasets
    )
    times = np.arange(0, comparison_duration + 0.001, 0.1)
    reference_tracks = [intentional_tracks(dataset) for dataset in reference_datasets]

    with tempfile.TemporaryDirectory(prefix="confetti-verifier-") as temporary:
        temporary_path = Path(temporary)
        app_paths = [
            track_app_video(
                video,
                temporary_path / f"app-{index + 1}-tracks.json.gz",
                comparison_duration,
                app_onset,
            )
            for index, video in enumerate(app_videos)
        ]
        app_datasets = [make_dataset(path) for path in app_paths]
        app_tracks = [intentional_tracks(dataset) for dataset in app_datasets]

    reference_population = [
        population_curve(tracks, times) for tracks in reference_tracks
    ]
    app_population = [population_curve(tracks, times) for tracks in app_tracks]
    target_population = mean_curve(reference_population)
    population_mae = float(
        np.mean([finite_mae(target_population, value) for value in app_population])
    )
    population_rmse = float(
        np.mean([finite_rmse(target_population, value) for value in app_population])
    )

    reference_trajectory = [
        trajectory_quantiles(tracks, times) for tracks in reference_tracks
    ]
    app_trajectory = [trajectory_quantiles(tracks, times) for tracks in app_tracks]
    target_trajectory = mean_curve(reference_trajectory)
    trajectory_mae = float(
        np.mean([finite_mae(target_trajectory, value) for value in app_trajectory])
    )

    reference_thinness_values = [
        observed_thinness(tracks) for tracks in reference_tracks
    ]
    app_thinness_values = [observed_thinness(tracks) for tracks in app_tracks]
    reference_thinness = mean_metrics(reference_thinness_values)
    app_thinness = mean_metrics(app_thinness_values)
    thinness_error = metric_distance(
        reference_thinness,
        app_thinness,
        ["occupancy_half", "occupancy_quarter", "median_dwell"],
    )

    reference_aspect_values = [aspect_metrics(tracks) for tracks in reference_tracks]
    app_aspect_values = [aspect_metrics(tracks) for tracks in app_tracks]
    reference_aspect = mean_metrics(reference_aspect_values)
    app_aspect = mean_metrics(app_aspect_values)
    aspect_error = metric_distance(
        reference_aspect, app_aspect, ["above_four", "above_six", "above_eight"]
    )

    reference_exits = [exit_p80(tracks) for tracks in reference_tracks]
    app_exits = [exit_p80(tracks) for tracks in app_tracks]
    exit_error = abs(float(np.mean(reference_exits)) - float(np.mean(app_exits)))
    reference_count = float(np.mean([len(tracks) for tracks in reference_tracks]))
    app_count = float(np.mean([len(tracks) for tracks in app_tracks]))
    count_error = abs(app_count / max(reference_count, 1) - 1)

    thinness_dicts = [
        serializable_metrics(value) for value in reference_thinness_values
    ]
    aspect_dicts = [serializable_metrics(value) for value in reference_aspect_values]
    guardrails = {
        "population_mae": Guardrail(
            population_mae,
            adaptive_threshold(0.18, pairwise(reference_population, finite_mae)),
            0.28,
        ),
        "trajectory_mae": Guardrail(
            trajectory_mae,
            adaptive_threshold(0.08, pairwise(reference_trajectory, finite_mae)),
            0.28,
        ),
        "thinness_error": Guardrail(
            thinness_error,
            adaptive_threshold(
                0.08,
                [
                    metric_distance(
                        thinness_dicts[first],
                        thinness_dicts[second],
                        list(thinness_dicts[0]),
                    )
                    for first in range(len(thinness_dicts))
                    for second in range(first + 1, len(thinness_dicts))
                ],
            ),
            0.16,
        ),
        "aspect_error": Guardrail(
            aspect_error,
            adaptive_threshold(
                0.08,
                [
                    metric_distance(
                        aspect_dicts[first],
                        aspect_dicts[second],
                        ["above_four", "above_six", "above_eight"],
                    )
                    for first in range(len(aspect_dicts))
                    for second in range(first + 1, len(aspect_dicts))
                ],
            ),
            0.10,
        ),
        "exit_p80_error_seconds": Guardrail(
            exit_error,
            adaptive_threshold(
                0.6,
                [
                    abs(reference_exits[first] - reference_exits[second])
                    for first in range(len(reference_exits))
                    for second in range(first + 1, len(reference_exits))
                ],
            ),
            0.10,
        ),
        "intentional_count_ratio_error": Guardrail(count_error, 0.30, 0.08),
    }
    score = sum(value.weight * value.normalized for value in guardrails.values())
    passed = score <= 1 and all(
        value.normalized <= 1.5 for value in guardrails.values()
    )
    report = {
        "passed": passed,
        "score": score,
        "rule": "Weighted score <= 1 and no individual guardrail > 1.5x its adaptive threshold.",
        "guardrails": {
            name: {
                "value": value.value,
                "threshold": value.threshold,
                "normalized": value.normalized,
                "weight": value.weight,
                "passed": value.passed,
            }
            for name, value in guardrails.items()
        },
        "diagnostics": {
            "population_rmse": population_rmse,
            "reference_intentional_particles": reference_count,
            "app_intentional_particles": app_count,
            "reference_thinness": reference_thinness,
            "app_thinness": app_thinness,
            "reference_aspect": reference_aspect,
            "app_aspect": app_aspect,
            "checkpoints_seconds": times.tolist(),
        },
        "inputs": {
            "references": [str(path) for path in references],
            "app_videos": [str(path) for path in app_videos],
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2))
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", action="append", required=True, type=Path)
    parser.add_argument("--app-video", action="append", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--duration", type=float)
    parser.add_argument("--app-onset", type=float)
    parser.add_argument("--no-fail", action="store_true")
    args = parser.parse_args()
    report = verify(
        args.reference,
        args.app_video,
        args.output,
        args.duration,
        args.app_onset,
    )
    print(json.dumps(report, indent=2))
    if not report["passed"] and not args.no_fail:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
