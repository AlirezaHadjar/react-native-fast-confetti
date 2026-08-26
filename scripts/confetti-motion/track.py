#!/usr/bin/env python3
"""Extract reusable confetti track datasets from screen recordings."""

from __future__ import annotations

import argparse
import gzip
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.signal import savgol_filter

ANALYSIS_WIDTH = 660
DEFAULT_DURATION = 3.5
PALETTE = {
    "yellow": "#F6D61B",
    "orange": "#EE6A10",
    "purple": "#6F1EE8",
    "magenta": "#B21FBA",
    "pink": "#DC1F5D",
}


def hex_to_bgr(value: str) -> list[int]:
    value = value.lstrip("#")
    return [int(value[4:6], 16), int(value[2:4], 16), int(value[0:2], 16)]


COLOR_NAMES = list(PALETTE)
COLOR_BGR = np.asarray([hex_to_bgr(PALETTE[name]) for name in COLOR_NAMES], np.uint8)
COLOR_LAB = cv2.cvtColor(COLOR_BGR.reshape(1, -1, 3), cv2.COLOR_BGR2LAB)[0].astype(
    np.float32
)


@dataclass
class Detection:
    frame: int
    time: float
    color: str
    x: float
    y: float
    width: int
    height: int
    area: int
    angle: float
    aspect: float
    fill: float
    lab: list[float]
    track_id: int | None = None


@dataclass
class Track:
    id: int
    color: str
    detections: list[Detection] = field(default_factory=list)
    missed: int = 0
    velocity: np.ndarray = field(default_factory=lambda: np.zeros(2, np.float32))

    @property
    def last(self) -> Detection:
        return self.detections[-1]

    def predict(self) -> np.ndarray:
        return np.asarray([self.last.x, self.last.y]) + self.velocity * (
            self.missed + 1
        )


@dataclass(frozen=True)
class VideoInfo:
    width: int
    height: int
    analysis_height: int
    fps: float
    duration: float


def video_info(path: Path) -> VideoInfo:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open video: {path}")
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = float(capture.get(cv2.CAP_PROP_FPS)) or 30.0
    frames = float(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    capture.release()
    return VideoInfo(
        width=width,
        height=height,
        analysis_height=round(ANALYSIS_WIDTH * height / width),
        fps=min(max(source_fps, 24.0), 60.0),
        duration=frames / source_fps,
    )


def read_at(capture: cv2.VideoCapture, seconds: float, info: VideoInfo) -> np.ndarray:
    capture.set(cv2.CAP_PROP_POS_MSEC, max(seconds, 0) * 1000)
    ok, frame = capture.read()
    if not ok:
        raise RuntimeError(f"Could not read frame at {seconds:.3f}s")
    return cv2.resize(
        frame,
        (ANALYSIS_WIDTH, info.analysis_height),
        interpolation=cv2.INTER_AREA,
    )


def component_detections(
    frame: np.ndarray,
    baseline: np.ndarray,
    frame_index: int,
    time: float,
) -> list[Detection]:
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    delta = cv2.absdiff(frame, baseline).max(axis=2)
    distances = np.sqrt(
        np.sum((lab[:, :, None, :] - COLOR_LAB[None, None, :, :]) ** 2, axis=3)
    )
    nearest = np.argmin(distances, axis=2)
    common = (
        (np.min(distances, axis=2) < 54)
        & (hsv[:, :, 1] > 92)
        & (hsv[:, :, 2] > 80)
        & (delta > 20)
    )

    detections: list[Detection] = []
    kernel = np.ones((2, 2), np.uint8)
    for color_index, color_name in enumerate(COLOR_NAMES):
        mask = ((nearest == color_index) & common).astype(np.uint8) * 255
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
        for label in range(1, count):
            _, _, width, height, area = (int(value) for value in stats[label])
            if area < 3 or area > 420 or width > 54 or height > 54:
                continue
            component = (labels == label).astype(np.uint8) * 255
            contours, _ = cv2.findContours(
                component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            if not contours:
                continue
            rect_width, rect_height = cv2.minAreaRect(
                max(contours, key=cv2.contourArea)
            )[1]
            aspect = (
                max(rect_width, rect_height) / min(rect_width, rect_height)
                if min(rect_width, rect_height) > 0
                else max(width, height) / max(min(width, height), 1)
            )
            angle = float(cv2.minAreaRect(max(contours, key=cv2.contourArea))[2])
            cx, cy = (float(value) for value in centroids[label])
            detections.append(
                Detection(
                    frame=frame_index,
                    time=time,
                    color=color_name,
                    x=cx,
                    y=cy,
                    width=width,
                    height=height,
                    area=area,
                    angle=angle,
                    aspect=float(aspect),
                    fill=float(area / max(width * height, 1)),
                    lab=[float(value) for value in lab[labels == label].mean(axis=0)],
                )
            )
    return detections


def find_onsets(
    path: Path,
    info: VideoInfo,
    burst_duration: float,
    maximum: int,
) -> list[float]:
    capture = cv2.VideoCapture(str(path))
    onsets: list[float] = []
    # Ignore short recording/startup transitions, then require a bilateral
    # edge burst before refining backwards to the first visible particles.
    cursor = 0.35
    while cursor + 0.25 < info.duration and len(onsets) < maximum:
        consecutive = 0
        first_candidate = cursor
        found: float | None = None
        for timestamp in np.arange(cursor, info.duration - 1 / info.fps, 1 / 30):
            try:
                baseline = read_at(capture, max(cursor - 0.1, timestamp - 0.18), info)
                frame = read_at(capture, float(timestamp), info)
            except RuntimeError:
                break
            detections = component_detections(frame, baseline, 0, float(timestamp))
            left_count = sum(
                detection.x < ANALYSIS_WIDTH * 0.18 for detection in detections
            )
            right_count = sum(
                detection.x > ANALYSIS_WIDTH * 0.82 for detection in detections
            )
            if left_count >= 5 and right_count >= 5 and len(detections) <= 80:
                if consecutive == 0:
                    first_candidate = float(timestamp)
                consecutive += 1
                if consecutive >= 2:
                    found = first_candidate
                    break
            else:
                consecutive = 0
        if found is None:
            break
        refined, _ = refine_onset(path, info, first_candidate)
        onsets.append(refined)
        cursor = refined + burst_duration + 0.2
    capture.release()
    if not onsets:
        raise RuntimeError(
            "No edge-originating burst detected. Pass --onset with an approximate time."
        )
    return onsets


def refine_onset(
    path: Path, info: VideoInfo, approximate: float
) -> tuple[float, np.ndarray]:
    capture = cv2.VideoCapture(str(path))
    baseline = read_at(capture, approximate - 0.18, info)
    consecutive = 0
    first_candidate = approximate
    for timestamp in np.arange(max(0, approximate - 0.12), approximate + 0.14, 1 / 120):
        frame = read_at(capture, float(timestamp), info)
        detections = component_detections(frame, baseline, 0, float(timestamp))
        edge_count = sum(
            detection.x < ANALYSIS_WIDTH * 0.18 or detection.x > ANALYSIS_WIDTH * 0.82
            for detection in detections
        )
        if edge_count >= 2:
            if consecutive == 0:
                first_candidate = float(timestamp)
            consecutive += 1
            if consecutive >= 2:
                capture.release()
                return first_candidate, baseline
        else:
            consecutive = 0
    capture.release()
    return approximate, baseline


def assign_tracks(detections_by_frame: list[list[Detection]]) -> list[Track]:
    active: list[Track] = []
    finished: list[Track] = []
    next_id = 1
    for detections in detections_by_frame:
        matched_tracks: set[int] = set()
        matched_detections: set[int] = set()
        if active and detections:
            costs = np.full((len(active), len(detections)), 1e6, np.float32)
            for track_index, track in enumerate(active):
                for detection_index, detection in enumerate(detections):
                    distance = np.linalg.norm(
                        track.predict() - np.asarray([detection.x, detection.y])
                    )
                    if distance > 48 + track.missed * 16:
                        continue
                    costs[track_index, detection_index] = (
                        distance
                        + 4
                        * abs(math.log((detection.area + 1) / (track.last.area + 1)))
                        + 0.045
                        * np.linalg.norm(
                            np.asarray(detection.lab) - np.asarray(track.last.lab)
                        )
                        + (7 if detection.color != track.color else 0)
                    )
            rows, columns = linear_sum_assignment(costs)
            for track_index, detection_index in zip(rows, columns):
                if costs[track_index, detection_index] >= 1e5:
                    continue
                track = active[track_index]
                detection = detections[detection_index]
                displacement = np.asarray(
                    [detection.x - track.last.x, detection.y - track.last.y], np.float32
                ) / (track.missed + 1)
                track.velocity = 0.65 * track.velocity + 0.35 * displacement
                track.detections.append(detection)
                track.missed = 0
                detection.track_id = track.id
                matched_tracks.add(track_index)
                matched_detections.add(detection_index)

        for index, track in enumerate(active):
            if index not in matched_tracks:
                track.missed += 1
        finished.extend(track for track in active if track.missed > 10)
        active = [track for track in active if track.missed <= 10]
        for detection_index, detection in enumerate(detections):
            if detection_index in matched_detections:
                continue
            detection.track_id = next_id
            active.append(Track(next_id, detection.color, [detection]))
            next_id += 1
    return [*finished, *active]


def smooth_track(
    track: Track, onset: float, width: int, height: int
) -> dict[str, Any] | None:
    if len(track.detections) < 6:
        return None
    times = np.asarray([detection.time - onset for detection in track.detections])
    x = np.asarray([detection.x / width for detection in track.detections])
    y = np.asarray([detection.y / height for detection in track.detections])
    window = min(11, len(x) if len(x) % 2 else len(x) - 1)
    smooth_x = (
        savgol_filter(x, window, min(3, window - 2), mode="interp")
        if window >= 5
        else x
    )
    smooth_y = (
        savgol_filter(y, window, min(3, window - 2), mode="interp")
        if window >= 5
        else y
    )
    velocity_x = np.gradient(smooth_x, times)
    velocity_y = np.gradient(smooth_y, times)
    acceleration_x = np.gradient(velocity_x, times)
    acceleration_y = np.gradient(velocity_y, times)
    degree = min(3, len(times) - 1)
    coefficients_x = np.polyfit(times, smooth_x, degree)
    coefficients_y = np.polyfit(times, smooth_y, degree)
    rmse = float(
        np.sqrt(
            np.mean(
                (np.polyval(coefficients_x, times) - x) ** 2
                + (np.polyval(coefficients_y, times) - y) ** 2
            )
        )
    )
    points = []
    for index, detection in enumerate(track.detections):
        points.append(
            {
                "frame": detection.frame,
                "time": round(float(times[index]), 6),
                "observed_x": round(float(x[index]), 7),
                "observed_y": round(float(y[index]), 7),
                "smoothed_x": round(float(smooth_x[index]), 7),
                "smoothed_y": round(float(smooth_y[index]), 7),
                "velocity_x": round(float(velocity_x[index]), 7),
                "velocity_y": round(float(velocity_y[index]), 7),
                "acceleration_x": round(float(acceleration_x[index]), 7),
                "acceleration_y": round(float(acceleration_y[index]), 7),
                "area": detection.area,
                "angle": round(detection.angle, 3),
                "aspect": round(detection.aspect, 4),
                "fill": round(detection.fill, 4),
            }
        )
    first = track.detections[0]
    return {
        "id": track.id,
        "color": track.color,
        "side": "left" if first.x < width / 2 else "right",
        "start_time": round(float(times[0]), 6),
        "end_time": round(float(times[-1]), 6),
        "duration": round(float(times[-1] - times[0]), 6),
        "observations": len(points),
        "polynomial_x": [round(float(value), 9) for value in coefficients_x],
        "polynomial_y": [round(float(value), 9) for value in coefficients_y],
        "fit_rmse": round(rmse, 7),
        "points": points,
    }


def process_burst(
    path: Path,
    output: Path,
    approximate_onset: float,
    duration: float,
    info: VideoInfo,
) -> Path:
    onset, baseline = refine_onset(path, info, approximate_onset)
    capture = cv2.VideoCapture(str(path))
    detections_by_frame = []
    frame_count = min(
        round(duration * info.fps) + 1, round((info.duration - onset) * info.fps)
    )
    for frame_index in range(max(frame_count, 0)):
        timestamp = onset + frame_index / info.fps
        try:
            frame = read_at(capture, timestamp, info)
        except RuntimeError:
            break
        detections_by_frame.append(
            component_detections(frame, baseline, frame_index, timestamp)
        )
    capture.release()
    actual_duration = max(len(detections_by_frame) - 1, 0) / info.fps
    raw_tracks = assign_tracks(detections_by_frame)
    tracks = [
        smoothed
        for track in raw_tracks
        if (
            smoothed := smooth_track(track, onset, ANALYSIS_WIDTH, info.analysis_height)
        )
        is not None
    ]
    dataset = {
        "source": str(path),
        "nominal_fps": info.fps,
        "source_dimensions": [info.width, info.height],
        "analysis_dimensions": [ANALYSIS_WIDTH, info.analysis_height],
        "approximate_onset": approximate_onset,
        "detected_onset": round(onset, 6),
        "duration": actual_duration,
        "raw_detections": sum(len(frame) for frame in detections_by_frame),
        "tracks": tracks,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output, "wt") as handle:
        json.dump(dataset, handle, separators=(",", ":"))
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--name")
    parser.add_argument("--duration", type=float, default=DEFAULT_DURATION)
    parser.add_argument("--onset", type=float, action="append")
    parser.add_argument("--max-bursts", type=int, default=4)
    args = parser.parse_args()

    info = video_info(args.video)
    onsets = args.onset or find_onsets(args.video, info, args.duration, args.max_bursts)
    prefix = args.name or args.video.stem.replace(" ", "-").lower()
    outputs = [
        process_burst(
            args.video,
            args.output_dir / f"{prefix}-burst-{index + 1}-tracks.json.gz",
            onset,
            args.duration,
            info,
        )
        for index, onset in enumerate(onsets)
    ]
    print(json.dumps({"tracks": [str(path) for path in outputs]}, indent=2))


if __name__ == "__main__":
    main()
