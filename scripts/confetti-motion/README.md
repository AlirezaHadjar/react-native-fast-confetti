# Confetti motion reconstruction

This pipeline converts screen recordings into a deterministic, continuous
physics preset and verifies a captured app run against the source recordings.
Reference frames are offline fitting observations only; runtime animation never
replays positional keyframes.

## One-command workflow

```sh
uv run --with-requirements scripts/confetti-motion/requirements.txt \
  scripts/confetti-motion/reconstruct.py \
  --reference-video path/to/reference-1.mp4 \
  --reference-video path/to/reference-2.mov \
  --app-video .argent/recordings/current-app-run.mp4 \
  --work-dir .context/confetti-reconstruction/next \
  --output src/presets/recordingCannonParticleSystem.ts \
  --optimizer-report .context/confetti-reconstruction/next/optimizer.json \
  --verifier-report .context/confetti-reconstruction/next/verifier.json
```

The command automatically:

1. Detects edge-originating bursts in every reference recording.
2. Tracks colored particles through short gaps and writes compressed datasets.
3. Chooses the reference burst with the largest intentional-particle population
   for training and uses every other burst for cross-validation.
4. Ranks continuous damped-physics configurations and generates the TypeScript
   particle preset.
5. Tracks the real app capture and scores rendered population, trajectory,
   thinness, aspect ratio, exit timing, and intentional-particle count.

Verification passes only when the weighted score is at most `1` and no single
guardrail exceeds `1.5×` its adaptive threshold. Thresholds expand when the
reference recordings disagree, but never below conservative visual floors.

## Individual tools

Track a recording, optionally supplying an approximate onset if automatic burst
detection cannot distinguish the animation from the background:

```sh
uv run --with-requirements scripts/confetti-motion/requirements.txt \
  scripts/confetti-motion/track.py path/to/video.mp4 \
  --output-dir .context/confetti-reconstruction/run \
  --onset 0.55
```

Fit an existing set of tracks:

```sh
uv run --with-requirements scripts/confetti-motion/requirements.txt \
  scripts/confetti-motion/optimize.py \
  --train reference-burst-1-tracks.json.gz \
  --validation reference-burst-2-tracks.json.gz \
  --output src/presets/recordingCannonParticleSystem.ts \
  --report optimizer-report.json
```

Verify one or more app recordings independently:

```sh
uv run --with-requirements scripts/confetti-motion/requirements.txt \
  scripts/confetti-motion/verify.py \
  --reference reference-burst-1-tracks.json.gz \
  --reference reference-burst-2-tracks.json.gz \
  --app-video current-app-run.mp4 \
  --output verifier-report.json
```

Pass multiple `--app-video` values to include run-to-run variation. The verifier
returns a non-zero exit code when guardrails fail, making it suitable for CI or
an automated edit-capture-score loop.

## What the loss protects

- Physics trajectory median and tail error
- Cross-recording trajectory consistency
- Visible population curve and slow-exit tail
- Intentional-particle retention and automatic dust rejection
- Size and rotation-speed distributions
- X-flip depth supported by periodic projected-area evidence
- Below-half, below-quarter, and per-particle thin-state dwell rates
- Rendered trajectory, population, aspect ratio, thinness, and exit timing

Particles without reliable periodic area evidence do not receive invented
X-axis flips. Full-depth fitted flips still cross edge-on and mirror correctly.
