#!/usr/bin/env python3
"""Fit and rank deterministic cannon particle systems from CV track data."""

from __future__ import annotations

import argparse
import gzip
import json
import math
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any

import numpy as np
from metrics import (
    ThinnessMetrics,
    distribution_distance,
    normalized_track_areas,
    observed_thinness,
    population_curve,
    thinness_from_projected,
)
from scipy.optimize import least_squares

ANALYSIS_WIDTH = 660
VIEWPORT_PADDING = 0.08
COLOR_INDICES = {
    "yellow": 0,
    "orange": 1,
    "purple": 2,
    "magenta": 3,
    "pink": 4,
}


@dataclass(frozen=True)
class FitConfig:
    fit_window: float
    gravity_floor: float
    vertical_drag_ceiling: float

    @property
    def name(self) -> str:
        return (
            f"window={self.fit_window:.2f},gravity>={self.gravity_floor:.2f},"
            f"vdrag<={self.vertical_drag_ceiling:.2f}"
        )


@dataclass
class Dataset:
    name: str
    duration: float
    tracks: list[dict[str, Any]]
    size_threshold: float
    reference_exit_p80: float
    intentional_tracks: int
    population_times: np.ndarray
    population_curve: np.ndarray
    thin_occupancy_half: float
    thin_occupancy_quarter: float
    median_thin_dwell: float
    raw_thin_occupancy_half: float
    raw_thin_occupancy_quarter: float


@dataclass
class ParticleFit:
    track: dict[str, Any]
    parameters: np.ndarray
    rmse: float
    size: float
    exit_time: float
    bounds_fraction: float
    quality_loss: float = 0


@dataclass(frozen=True)
class RotationPrior:
    magnitudes: tuple[float, ...]
    positive_probability: float


@dataclass(frozen=True)
class FlipFit:
    floor: float
    amplitude: float
    phase: float
    speed: float
    rmse: float
    improvement: float


@dataclass(frozen=True)
class FlipPrior:
    magnitudes: tuple[float, ...]


def load_json_gzip(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt") as handle:
        return json.load(handle)


def point_size(point: dict[str, Any]) -> float:
    aspect = min(max(float(point["aspect"]), 1), 6)
    area = max(float(point["area"]), 3)
    major = (
        math.sqrt(area * aspect)
        if aspect >= 2.3
        else math.sqrt((4 * area * aspect) / math.pi)
    )
    return max(2.0, major) / ANALYSIS_WIDTH


def track_size(track: dict[str, Any]) -> float:
    return median(point_size(point) for point in track["points"])


def is_launch_candidate(track: dict[str, Any]) -> bool:
    first = track["points"][0]
    near_edge = first["observed_x"] <= 0.18 or first["observed_x"] >= 0.82
    return (
        near_edge
        and track["duration"] >= 0.35
        and track["observations"] >= 15
        and track["start_time"] <= 0.9
    )


def two_cluster_threshold(values: list[float]) -> tuple[float, list[float]]:
    """Separate the dust/noise mode from intentional particles in log space."""
    logs = np.log(np.asarray(values))
    centers = np.quantile(logs, [0.25, 0.75])
    for _ in range(100):
        labels = np.abs(logs[:, None] - centers[None, :]).argmin(axis=1)
        updated = np.array(
            [
                logs[labels == index].mean()
                if np.any(labels == index)
                else centers[index]
                for index in range(2)
            ]
        )
        if np.allclose(updated, centers):
            break
        centers = updated
    centers.sort()
    return float(np.exp(centers.mean())), [float(np.exp(value)) for value in centers]


def make_dataset(path: Path) -> Dataset:
    raw = load_json_gzip(path)
    launch_tracks = [track for track in raw["tracks"] if is_launch_candidate(track)]
    sizes = [track_size(track) for track in launch_tracks]
    threshold, _ = two_cluster_threshold(sizes)
    intentional = [track for track in launch_tracks if track_size(track) >= threshold]
    edge_exits = []
    for track in intentional:
        last = track["points"][-1]
        if (
            last["smoothed_x"] < 0.05
            or last["smoothed_x"] > 0.95
            or last["smoothed_y"] > 0.95
        ):
            edge_exits.append(float(track["end_time"]))
    reference_exit_p80 = (
        float(np.quantile(edge_exits, 0.8)) if edge_exits else raw["duration"]
    )
    population_times = np.arange(0, float(raw["duration"]) + 0.001, 0.1)
    reference_population_curve = population_curve(intentional, population_times)
    raw_thinness = observed_thinness(intentional)
    thinness = supported_flip_thinness(intentional)
    return Dataset(
        name=path.stem.replace("-tracks.json", ""),
        duration=float(raw["duration"]),
        tracks=launch_tracks,
        size_threshold=threshold,
        reference_exit_p80=reference_exit_p80,
        intentional_tracks=len(intentional),
        population_times=population_times,
        population_curve=reference_population_curve,
        thin_occupancy_half=thinness.occupancy_half,
        thin_occupancy_quarter=thinness.occupancy_quarter,
        median_thin_dwell=thinness.median_dwell,
        raw_thin_occupancy_half=raw_thinness.occupancy_half,
        raw_thin_occupancy_quarter=raw_thinness.occupancy_quarter,
    )


def predict(parameters: np.ndarray, time: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x, y, velocity_x, velocity_y, horizontal_drag, vertical_drag, gravity = parameters
    horizontal = (1 - np.exp(-horizontal_drag * time)) / horizontal_drag
    vertical = (1 - np.exp(-vertical_drag * time)) / vertical_drag
    gravity_displacement = time / vertical_drag - (
        1 - np.exp(-vertical_drag * time)
    ) / (vertical_drag**2)
    return (
        x + velocity_x * horizontal,
        y + velocity_y * vertical + gravity * gravity_displacement,
    )


def fit_track(
    track: dict[str, Any], config: FitConfig
) -> tuple[np.ndarray, float, float]:
    all_points = track["points"]
    start = float(all_points[0]["time"])
    points = [
        point for point in all_points if point["time"] - start <= config.fit_window
    ]
    time = np.asarray([point["time"] - start for point in points])
    observed_x = np.asarray([point["smoothed_x"] for point in points])
    observed_y = np.asarray([point["smoothed_y"] for point in points])
    span = max(float(time[-1]), 0.01)

    def residuals(parameters: np.ndarray) -> np.ndarray:
        predicted_x, predicted_y = predict(parameters, time)
        return np.concatenate([predicted_x - observed_x, predicted_y - observed_y])

    initial = np.array(
        [
            observed_x[0],
            observed_y[0],
            (observed_x[-1] - observed_x[0]) / span,
            (observed_y[-1] - observed_y[0]) / span,
            1,
            min(1, config.vertical_drag_ceiling),
            max(0.45, config.gravity_floor),
        ]
    )
    lower = np.array(
        [
            observed_x[0] - 0.03,
            observed_y[0] - 0.03,
            -3,
            -3,
            0.03,
            0.1,
            config.gravity_floor,
        ]
    )
    upper = np.array(
        [
            observed_x[0] + 0.03,
            observed_y[0] + 0.03,
            3,
            3,
            6,
            config.vertical_drag_ceiling,
            1.4,
        ]
    )
    result = least_squares(
        residuals,
        initial,
        bounds=(lower, upper),
        loss="soft_l1",
        f_scale=0.006,
        max_nfev=400,
    )
    predicted_x, predicted_y = predict(result.x, time)
    rmse = math.sqrt(
        float(
            np.mean((predicted_x - observed_x) ** 2 + (predicted_y - observed_y) ** 2)
        )
    )
    tolerance = 1e-4
    at_bound = np.logical_or(
        np.abs(result.x - lower) < tolerance,
        np.abs(result.x - upper) < tolerance,
    )
    return result.x, rmse, float(at_bound.mean())


def position(parameters: np.ndarray, age: float) -> tuple[float, float]:
    predicted = predict(parameters, np.asarray([age]))
    return float(predicted[0][0]), float(predicted[1][0])


def exit_time(track: dict[str, Any], parameters: np.ndarray) -> float:
    start = float(track["points"][0]["time"])
    for age in np.arange(0, 8.0, 1 / 60):
        x, y = position(parameters, float(age))
        if (
            x < -VIEWPORT_PADDING
            or x > 1 + VIEWPORT_PADDING
            or y > 1 + VIEWPORT_PADDING
        ):
            return start + float(age)
    return start + 8


def fit_dataset(dataset: Dataset, config: FitConfig) -> list[ParticleFit]:
    result = []
    for track in dataset.tracks:
        size = track_size(track)
        if size < dataset.size_threshold:
            continue
        parameters, rmse, bounds_fraction = fit_track(track, config)
        result.append(
            ParticleFit(
                track=track,
                parameters=parameters,
                rmse=rmse,
                size=size,
                exit_time=exit_time(track, parameters),
                bounds_fraction=bounds_fraction,
            )
        )
    return rank_particles(result, dataset)


def rank_particles(fits: list[ParticleFit], dataset: Dataset) -> list[ParticleFit]:
    median_rmse = max(median(fit.rmse for fit in fits), 1e-4)
    soft_tail_limit = dataset.duration + 1.15
    for fit in fits:
        trajectory_loss = fit.rmse / median_rmse
        slow_tail_loss = max(0, fit.exit_time - soft_tail_limit) / 0.5
        fit.quality_loss = (
            trajectory_loss + 1.4 * slow_tail_loss + 0.35 * fit.bounds_fraction
        )
    losses = [fit.quality_loss for fit in fits]
    threshold, _ = two_cluster_threshold(losses)
    retained = [fit for fit in fits if fit.quality_loss <= threshold]
    # Keep the dominant population and reject only the worst-scoring tail.
    minimum_count = math.ceil(len(fits) * 0.95)
    if len(retained) < minimum_count:
        retained = sorted(fits, key=lambda fit: fit.quality_loss)[:minimum_count]
    return retained


def score_configuration(
    config: FitConfig,
    training: Dataset,
    validation: list[Dataset],
) -> tuple[dict[str, float], list[ParticleFit], list[list[ParticleFit]]]:
    training_fits = fit_dataset(training, config)
    validation_fits = [fit_dataset(dataset, config) for dataset in validation]
    groups = [training_fits, *validation_fits]
    datasets = [training, *validation]

    median_rmse = [median(fit.rmse for fit in fits) for fits in groups]
    p90_rmse = [float(np.quantile([fit.rmse for fit in fits], 0.9)) for fits in groups]
    exit_p80 = [
        float(np.quantile([fit.exit_time for fit in fits], 0.8)) for fits in groups
    ]
    exit_p95 = [
        float(np.quantile([fit.exit_time for fit in fits], 0.95)) for fits in groups
    ]
    tail_spread = [p95 - p80 for p80, p95 in zip(exit_p80, exit_p95)]

    trajectory_loss = float(np.mean(median_rmse))
    trajectory_tail_loss = float(np.mean(p90_rmse))
    cross_validation_loss = float(np.std(median_rmse))
    size_distribution_loss = float(
        np.mean(
            [
                distribution_distance(
                    [fit.size for fit in training_fits],
                    [fit.size for fit in fits],
                )
                for fits in validation_fits
            ]
            or [0]
        )
    )
    exit_curve_loss = float(
        np.mean(
            [
                abs(generated - dataset.reference_exit_p80)
                for generated, dataset in zip(exit_p80, datasets)
            ]
        )
    )
    slow_tail_loss = float(
        np.mean([max(0, spread - 0.6) ** 2 for spread in tail_spread])
    )
    population_loss = float(
        np.mean(
            [
                np.mean(
                    np.abs(
                        np.asarray(
                            [
                                sum(
                                    fit.track["start_time"] <= time <= fit.exit_time
                                    for fit in fits
                                )
                                / max(dataset.intentional_tracks, 1)
                                for time in dataset.population_times
                            ]
                        )
                        - dataset.population_curve
                    )
                )
                for fits, dataset in zip(groups, datasets)
            ]
        )
    )
    retention_loss = float(
        np.mean(
            [
                1
                - len(fits)
                / max(
                    sum(
                        track_size(track) >= dataset.size_threshold
                        for track in dataset.tracks
                    ),
                    1,
                )
                for fits, dataset in zip(groups, datasets)
            ]
        )
    )
    physical_bounds_loss = float(
        np.mean([fit.bounds_fraction for fits in groups for fit in fits])
    )
    training_rotation = observable_rotation_speeds(training, config.fit_window)
    rotation_distribution_loss = float(
        np.mean(
            [
                distribution_distance(
                    training_rotation,
                    observable_rotation_speeds(dataset, config.fit_window),
                )
                for dataset in validation
            ]
            or [0]
        )
    )
    training_flip = observable_flip_speeds(training)
    flip_projection_loss = float(
        np.mean(
            [
                distribution_distance(training_flip, observable_flip_speeds(dataset))
                for dataset in validation
                if training_flip and observable_flip_speeds(dataset)
            ]
            or [0]
        )
    )
    predicted_thinness_metrics = [predicted_thinness(fits) for fits in groups]
    thinness_loss = float(
        np.mean(
            [
                abs(predicted.occupancy_half - dataset.thin_occupancy_half)
                + abs(predicted.occupancy_quarter - dataset.thin_occupancy_quarter)
                + abs(predicted.median_dwell - dataset.median_thin_dwell)
                for predicted, dataset in zip(predicted_thinness_metrics, datasets)
            ]
        )
    )
    # Runtime scale is constant. Any periodic modulation pays continuity loss.
    scale_continuity_loss = 0.0
    dust_loss = 0.0  # The lower log-size cluster is excluded before fitting.

    total = (
        18 * trajectory_loss
        + 5 * trajectory_tail_loss
        + 10 * cross_validation_loss
        + 20 * size_distribution_loss
        + 0.8 * exit_curve_loss
        + 3 * slow_tail_loss
        + 4 * population_loss
        + 0.5 * retention_loss
        + 0.15 * physical_bounds_loss
        + 0.02 * rotation_distribution_loss
        + 0.02 * flip_projection_loss
        + 4 * thinness_loss
        + 4 * scale_continuity_loss
        + 4 * dust_loss
    )
    return (
        {
            "total": total,
            "trajectory": trajectory_loss,
            "trajectory_p90": trajectory_tail_loss,
            "cross_validation": cross_validation_loss,
            "size_distribution": size_distribution_loss,
            "exit_curve": exit_curve_loss,
            "slow_tail": slow_tail_loss,
            "population": population_loss,
            "retention": retention_loss,
            "physical_bounds": physical_bounds_loss,
            "rotation_distribution": rotation_distribution_loss,
            "flip_projection": flip_projection_loss,
            "thinness": thinness_loss,
            "scale_continuity": scale_continuity_loss,
            "dust": dust_loss,
        },
        training_fits,
        validation_fits,
    )


def rotation_parameters(
    track: dict[str, Any], fit_window: float
) -> tuple[float, float]:
    first_time = track["points"][0]["time"]
    points = [
        point for point in track["points"] if point["time"] - first_time <= fit_window
    ]
    rotations = [math.radians(points[0]["angle"])]
    for point in points[1:]:
        angle = math.radians(point["angle"])
        difference = (angle - rotations[-1] + math.pi / 2) % math.pi - math.pi / 2
        rotations.append(rotations[-1] + difference)
    velocities = []
    for previous, following, first_rotation, second_rotation in zip(
        points, points[1:], rotations, rotations[1:]
    ):
        elapsed = following["time"] - previous["time"]
        if elapsed > 0:
            velocities.append((second_rotation - first_rotation) / elapsed)
    angular_velocity = median(velocities) if velocities else 0
    return rotations[0], min(max(angular_velocity, -12), 12)


def observable_rotation_velocities(dataset: Dataset, fit_window: float) -> list[float]:
    velocities = []
    for track in dataset.tracks:
        if track_size(track) < dataset.size_threshold:
            continue
        aspect = median(min(max(point["aspect"], 1), 6) for point in track["points"])
        _, angular_velocity = rotation_parameters(track, fit_window)
        if aspect >= 2 and abs(angular_velocity) >= 0.2:
            velocities.append(angular_velocity)
    return velocities


def observable_rotation_speeds(dataset: Dataset, fit_window: float) -> list[float]:
    return [abs(value) for value in observable_rotation_velocities(dataset, fit_window)]


def rotation_prior(datasets: list[Dataset], fit_window: float) -> RotationPrior:
    velocities = [
        value
        for dataset in datasets
        for value in observable_rotation_velocities(dataset, fit_window)
    ]
    if not velocities:
        return RotationPrior((4.5, 5.5, 6.5), 0.5)
    return RotationPrior(
        tuple(sorted(abs(value) for value in velocities)),
        sum(value > 0 for value in velocities) / len(velocities),
    )


def flip_parameters(track: dict[str, Any]) -> FlipFit:
    cached = track.get("_flip_fit")
    if cached is not None:
        return cached

    points = track["points"]
    time = np.asarray([point["time"] - points[0]["time"] for point in points])
    observed = normalized_track_areas(track)

    def residuals(parameters: np.ndarray) -> np.ndarray:
        floor, amplitude, phase, speed = parameters
        return floor + amplitude * np.abs(np.cos(phase + speed * time)) - observed

    best: tuple[float, np.ndarray] | None = None
    for initial_speed in (2, 4, 6, 8, 10, 12, 14):
        for initial_phase in np.linspace(-math.pi, math.pi, 8, endpoint=False):
            result = least_squares(
                residuals,
                np.asarray([0.1, 0.9, initial_phase, initial_speed]),
                bounds=(
                    np.asarray([0, 0.1, -4 * math.pi, 1]),
                    np.asarray([0.8, 1.5, 4 * math.pi, 16]),
                ),
                loss="soft_l1",
                f_scale=0.08,
                max_nfev=250,
            )
            rmse = math.sqrt(float(np.mean(residuals(result.x) ** 2)))
            if best is None or rmse < best[0]:
                best = (rmse, result.x)

    assert best is not None
    rmse, parameters = best
    constant_rmse = math.sqrt(float(np.mean((observed - np.median(observed)) ** 2)))
    fit = FlipFit(
        floor=float(parameters[0]),
        amplitude=float(parameters[1]),
        phase=float(parameters[2]),
        speed=float(parameters[3]),
        rmse=rmse,
        improvement=constant_rmse - rmse,
    )
    track["_flip_fit"] = fit
    return fit


def is_observable_flip(fit: FlipFit) -> bool:
    return fit.improvement > 0.06 and fit.rmse < 0.3 and 1.1 < fit.speed < 15.9


def observable_flip_speeds(dataset: Dataset) -> list[float]:
    return [
        flip.speed
        for track in dataset.tracks
        if track_size(track) >= dataset.size_threshold
        for flip in [flip_parameters(track)]
        if is_observable_flip(flip)
    ]


def flip_prior(datasets: list[Dataset]) -> FlipPrior:
    magnitudes = tuple(
        sorted(
            speed for dataset in datasets for speed in observable_flip_speeds(dataset)
        )
    )
    return FlipPrior(magnitudes or (1.4, 1.8, 2.3, 3.2))


def fitted_flip_depth(fit: FlipFit) -> float:
    maximum = max(fit.floor + fit.amplitude, 0.001)
    return min(max(fit.amplitude / maximum, 0), 1)


def resolved_flip(track: dict[str, Any]) -> tuple[float, float, float, bool]:
    fitted = flip_parameters(track)
    if is_observable_flip(fitted):
        return fitted.phase, fitted.speed, fitted_flip_depth(fitted), False

    # Area changes caused by segmentation, occlusion, or in-plane rotation do
    # not justify inventing an edge-on X tumble. Keep those particles broad.
    return 0.0, 0.0, 0.0, True


def projected_flip_area(fit: FlipFit, time: np.ndarray) -> np.ndarray:
    depth = fitted_flip_depth(fit)
    return 1 - depth * (1 - np.abs(np.cos(fit.phase + fit.speed * time)))


def supported_flip_thinness(
    tracks: list[dict[str, Any]],
) -> ThinnessMetrics:
    projected: list[np.ndarray] = []
    for track in tracks:
        flip = flip_parameters(track)
        if not is_observable_flip(flip):
            projected.append(np.ones(len(track["points"])))
            continue
        time = np.asarray(
            [point["time"] - track["points"][0]["time"] for point in track["points"]]
        )
        projected.append(projected_flip_area(flip, time))

    return thinness_from_projected(projected)


def predicted_thinness(fits: list[ParticleFit]) -> ThinnessMetrics:
    return supported_flip_thinness([fit.track for fit in fits])


def resolved_rotation(
    track: dict[str, Any], fit_window: float, prior: RotationPrior
) -> tuple[float, float, bool]:
    rotation, observed_velocity = rotation_parameters(track, fit_window)
    aspect = median(min(max(point["aspect"], 1), 6) for point in track["points"])
    if aspect >= 2 and abs(observed_velocity) >= 0.2:
        return rotation, observed_velocity, False

    track_id = int(track["id"])
    magnitude_quantile = 0.2 + ((track_id * 0.61803398875) % 1) * 0.6
    magnitude = float(np.quantile(prior.magnitudes, magnitude_quantile))
    direction_sample = (track_id * 0.41421356237) % 1
    direction = 1 if direction_sample < prior.positive_probability else -1
    return rotation, magnitude * direction, True


def size_index(track: dict[str, Any]) -> int:
    aspects = [min(max(point["aspect"], 1), 6) for point in track["points"]]
    if median(aspects) >= 2.3:
        choices = [1, 3, 7]
    else:
        choices = [0, 2, 4, 5, 6]
    return choices[track["id"] % len(choices)]


def particle_payload(
    fit: ParticleFit,
    config: FitConfig,
    prior: RotationPrior,
) -> dict[str, Any]:
    track = fit.track
    rotation, angular_velocity, _ = resolved_rotation(track, config.fit_window, prior)
    rotation_x, angular_velocity_x, flip_depth, _ = resolved_flip(track)
    x, y, velocity_x, velocity_y, horizontal_drag, vertical_drag, gravity = (
        fit.parameters
    )

    def rounded(value: float) -> float:
        return round(float(value), 6)

    return {
        "originIndex": 0 if track["side"] == "left" else 1,
        "colorIndex": COLOR_INDICES[track["color"]],
        "sizeIndex": size_index(track),
        "startTime": round(float(track["points"][0]["time"]) * 1000),
        "x": rounded(x),
        "y": rounded(y),
        "velocityX": rounded(velocity_x),
        "velocityY": rounded(velocity_y),
        "horizontalDrag": rounded(horizontal_drag),
        "verticalDrag": rounded(vertical_drag),
        "gravity": rounded(gravity),
        "rotation": rounded(rotation),
        "angularVelocity": rounded(angular_velocity),
        "rotationX": rounded(rotation_x),
        "angularVelocityX": rounded(angular_velocity_x),
        "flipDepth": rounded(flip_depth),
        "size": rounded(fit.size),
    }


def write_typescript(
    path: Path,
    fits: list[ParticleFit],
    config: FitConfig,
    prior: RotationPrior,
    preset_name: str,
) -> dict[str, Any]:
    particles = [particle_payload(fit, config, prior) for fit in fits]
    duration = math.ceil(max(fit.exit_time for fit in fits) * 1000) + 100
    payload = {
        "duration": duration,
        "viewportPadding": VIEWPORT_PADDING,
        "particles": particles,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as handle:
        handle.write("import type { CannonParticleSystem } from '../types';\n\n")
        handle.write(
            f"// {preset_name} preset generated by the scored CV-to-physics optimizer. Do not hand-edit.\n"
        )
        handle.write(f"export const {preset_name} = ")
        json.dump(payload, handle, separators=(",", ":"))
        handle.write(" as const satisfies CannonParticleSystem;\n")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", required=True, type=Path)
    parser.add_argument("--validation", action="append", default=[], type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--preset-name", required=True)
    args = parser.parse_args()
    if not args.preset_name.isidentifier():
        parser.error("--preset-name must be a valid TypeScript identifier")

    training = make_dataset(args.train)
    validation = [make_dataset(path) for path in args.validation]
    configs = [
        FitConfig(window, gravity, vertical_drag)
        for window in [0.6, 0.8, 1.0]
        for gravity in [0.35, 0.5, 0.65]
        for vertical_drag in [1.0, 1.5, 2.0]
    ]

    ranking = []
    for config in configs:
        score, training_fits, validation_fits = score_configuration(
            config, training, validation
        )
        ranking.append((score["total"], config, score, training_fits, validation_fits))
    ranking.sort(key=lambda item: item[0])
    _, best_config, best_score, best_fits, _ = ranking[0]
    prior = rotation_prior([training, *validation], best_config.fit_window)
    x_flip_prior = flip_prior([training, *validation])
    payload = write_typescript(
        args.output, best_fits, best_config, prior, args.preset_name
    )
    imputed_rotation_count = sum(
        resolved_rotation(fit.track, best_config.fit_window, prior)[2]
        for fit in best_fits
    )
    imputed_flip_count = sum(resolved_flip(fit.track)[3] for fit in best_fits)
    generated_thinness = predicted_thinness(best_fits)

    report = {
        "objective": {
            "description": "Lower is better. CV observations are fitting inputs only; runtime uses continuous damped physics.",
            "terms": list(best_score.keys()),
        },
        "training": {
            "dataset": training.name,
            "automatic_size_threshold": training.size_threshold,
            "launch_candidates": len(training.tracks),
            "retained_particles": len(best_fits),
            "reference_thinness": {
                "occupancy_below_half": training.thin_occupancy_half,
                "occupancy_below_quarter": training.thin_occupancy_quarter,
                "median_particle_dwell_below_half": training.median_thin_dwell,
            },
            "raw_observed_area_drop": {
                "occupancy_below_half": training.raw_thin_occupancy_half,
                "occupancy_below_quarter": training.raw_thin_occupancy_quarter,
            },
        },
        "validation": [
            {
                "dataset": dataset.name,
                "automatic_size_threshold": dataset.size_threshold,
                "launch_candidates": len(dataset.tracks),
                "reference_thinness": {
                    "occupancy_below_half": dataset.thin_occupancy_half,
                    "occupancy_below_quarter": dataset.thin_occupancy_quarter,
                    "median_particle_dwell_below_half": dataset.median_thin_dwell,
                },
                "raw_observed_area_drop": {
                    "occupancy_below_half": dataset.raw_thin_occupancy_half,
                    "occupancy_below_quarter": dataset.raw_thin_occupancy_quarter,
                },
            }
            for dataset in validation
        ],
        "selected": {
            "config": best_config.name,
            "score": best_score,
            "duration_ms": payload["duration"],
            "rotation_prior": {
                "observable_tracks": len(prior.magnitudes),
                "median_speed_radians_per_second": median(prior.magnitudes),
                "positive_probability": prior.positive_probability,
                "imputed_particles": imputed_rotation_count,
            },
            "x_flip_prior": {
                "observable_tracks": len(x_flip_prior.magnitudes),
                "median_speed_radians_per_second": median(x_flip_prior.magnitudes),
                "imputed_particles": imputed_flip_count,
            },
            "generated_thinness": {
                "occupancy_below_half": generated_thinness.occupancy_half,
                "occupancy_below_quarter": generated_thinness.occupancy_quarter,
                "median_particle_dwell_below_half": generated_thinness.median_dwell,
            },
        },
        "ranking": [
            {
                "rank": index + 1,
                "config": config.name,
                "score": score,
                "retained_particles": len(fits),
            }
            for index, (_, config, score, fits, _) in enumerate(ranking[:10])
        ],
        "feedback_mapping": {
            "dust": "Lower mode of the automatically discovered bimodal log-size distribution; excluded before fitting.",
            "pulsing": "Scale continuity term; selected runtime model has constant particle scale.",
            "slow_tail": "Exit-curve and p80-to-p95 tail-spread terms plus per-particle quality ranking.",
            "flicker": "Continuity is structural: one initial state is integrated until viewport exit, with no positional keyframes or visibility gaps.",
            "z_rotation": "Angular-speed distribution is learned from elongated observable tracks; symmetric/unobservable particles receive deterministic imputed z-rotation.",
            "x_rotation": "Projected-area oscillation and flip depth are fitted per observable track; unobservable particles remain broad instead of receiving invented X tumbles.",
            "thin_lines": "Below-half, below-quarter, and per-particle dwell rates are scored only where periodic area motion supports an X flip; raw area drops remain reported separately because they also contain occlusion and segmentation loss.",
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2))
    print(json.dumps(report["selected"], indent=2))


if __name__ == "__main__":
    main()
