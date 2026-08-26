from __future__ import annotations

import unittest

import numpy as np
from metrics import (
    aspect_metrics,
    finite_mae,
    observed_thinness,
    population_curve,
    trajectory_quantiles,
)
from optimize import two_cluster_threshold


def track(
    start: float = 0,
    end: float = 1,
    areas: tuple[int, ...] = (100, 50, 100),
) -> dict:
    times = np.linspace(start, end, len(areas))
    return {
        "start_time": start,
        "end_time": end,
        "points": [
            {
                "time": float(time),
                "area": area,
                "aspect": 2,
                "smoothed_x": float(time),
                "smoothed_y": float(time / 2),
            }
            for time, area in zip(times, areas)
        ],
    }


class MetricsTest(unittest.TestCase):
    def test_uniform_sizes_keep_a_finite_cluster_threshold(self) -> None:
        threshold, centers = two_cluster_threshold([0.04, 0.04])
        self.assertAlmostEqual(threshold, 0.04)
        np.testing.assert_allclose(centers, [0.04, 0.04])

    def test_population_is_normalized_by_intentional_tracks(self) -> None:
        values = population_curve(
            [track(0, 1), track(0.5, 1.5)], np.asarray([0, 0.5, 1, 1.5])
        )
        np.testing.assert_allclose(values, [0.5, 1, 1, 0.5])

    def test_thinness_uses_each_tracks_normal_area(self) -> None:
        metrics = observed_thinness([track(areas=(100, 20, 100))])
        self.assertAlmostEqual(metrics.occupancy_half, 1 / 3)
        self.assertAlmostEqual(metrics.occupancy_quarter, 1 / 3)

    def test_trajectory_quantiles_interpolate_tracks(self) -> None:
        values = trajectory_quantiles([track()], np.asarray([0.25]))
        np.testing.assert_allclose(values[0], [0.25, 0.25, 0.25, 0.125, 0.125, 0.125])

    def test_finite_mae_ignores_missing_checkpoints(self) -> None:
        self.assertAlmostEqual(
            finite_mae(np.asarray([1.0, np.nan]), np.asarray([0.5, 10.0])),
            0.5,
        )

    def test_aspect_guardrails_report_high_aspect_frequency(self) -> None:
        value = track()
        value["points"][0]["aspect"] = 7
        metrics = aspect_metrics([value])
        self.assertAlmostEqual(metrics.above_four, 1 / 3)
        self.assertAlmostEqual(metrics.above_six, 1 / 3)


if __name__ == "__main__":
    unittest.main()
