"""Shared motion metrics used by fitting and rendered-video verification."""

from __future__ import annotations

import gzip
import json
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

Track = dict[str, Any]


@dataclass(frozen=True)
class ThinnessMetrics:
    occupancy_half: float
    occupancy_quarter: float
    median_dwell: float


@dataclass(frozen=True)
class AspectMetrics:
    above_four: float
    above_six: float
    above_eight: float
    median: float


def load_dataset(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt") as handle:
        return json.load(handle)


def normalized_track_areas(track: Track) -> np.ndarray:
    area = np.asarray([float(point["area"]) for point in track["points"]])
    normalization = max(float(np.quantile(area, 0.9)), 1)
    return np.clip(area / normalization, 0, 1.5)


def thinness_from_projected(projected: Iterable[np.ndarray]) -> ThinnessMetrics:
    values = list(projected)
    combined = np.concatenate(values) if values else np.ones(1)
    return ThinnessMetrics(
        occupancy_half=float(np.mean(combined < 0.5)),
        occupancy_quarter=float(np.mean(combined < 0.25)),
        median_dwell=float(
            np.median([np.mean(value < 0.5) for value in values] or [0])
        ),
    )


def observed_thinness(tracks: Iterable[Track]) -> ThinnessMetrics:
    return thinness_from_projected(normalized_track_areas(track) for track in tracks)


def aspect_metrics(tracks: Iterable[Track]) -> AspectMetrics:
    aspects = np.asarray(
        [
            min(max(float(point["aspect"]), 1), 20)
            for track in tracks
            for point in track["points"]
        ]
        or [1]
    )
    return AspectMetrics(
        above_four=float(np.mean(aspects > 4)),
        above_six=float(np.mean(aspects > 6)),
        above_eight=float(np.mean(aspects > 8)),
        median=float(np.median(aspects)),
    )


def distribution_distance(first: Iterable[float], second: Iterable[float]) -> float:
    first_values = list(first)
    second_values = list(second)
    if not first_values or not second_values:
        return 0.0
    quantiles = np.linspace(0, 1, 51)
    return float(
        np.mean(
            np.abs(
                np.quantile(first_values, quantiles)
                - np.quantile(second_values, quantiles)
            )
        )
    )


def population_curve(tracks: Iterable[Track], times: np.ndarray) -> np.ndarray:
    values = list(tracks)
    denominator = max(len(values), 1)
    return np.asarray(
        [
            sum(track["start_time"] <= time <= track["end_time"] for track in values)
            / denominator
            for time in times
        ]
    )


def trajectory_quantiles(tracks: Iterable[Track], times: np.ndarray) -> np.ndarray:
    values = list(tracks)
    rows: list[list[float]] = []
    for time in times:
        positions: list[tuple[float, float]] = []
        for track in values:
            if not track["start_time"] <= time <= track["end_time"]:
                continue
            points = track["points"]
            point_times = np.asarray([float(point["time"]) for point in points])
            positions.append(
                (
                    float(
                        np.interp(
                            time,
                            point_times,
                            [float(point["smoothed_x"]) for point in points],
                        )
                    ),
                    float(
                        np.interp(
                            time,
                            point_times,
                            [float(point["smoothed_y"]) for point in points],
                        )
                    ),
                )
            )
        if not positions:
            rows.append([np.nan] * 6)
            continue
        x, y = np.asarray(positions).T
        rows.append(
            [
                *np.quantile(x, [0.1, 0.5, 0.9]).tolist(),
                *np.quantile(y, [0.1, 0.5, 0.9]).tolist(),
            ]
        )
    return np.asarray(rows)


def finite_mae(first: np.ndarray, second: np.ndarray) -> float:
    finite = np.isfinite(first) & np.isfinite(second)
    return (
        float(np.mean(np.abs(first[finite] - second[finite]))) if finite.any() else 1.0
    )


def finite_rmse(first: np.ndarray, second: np.ndarray) -> float:
    finite = np.isfinite(first) & np.isfinite(second)
    return (
        float(np.sqrt(np.mean((first[finite] - second[finite]) ** 2)))
        if finite.any()
        else 1.0
    )


def serializable_metrics(value: object) -> dict[str, float]:
    return {key: float(metric) for key, metric in asdict(value).items()}
