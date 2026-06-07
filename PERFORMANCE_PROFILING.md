# Performance Profiling

This document records the React Native Fast Confetti profiling workflow and the
latest iPhone results for the kitchen-sink `Single` screen. It is intentionally
kept in the repository instead of `.context` so the data can be committed.

## Valid Measurement Protocol

- Build the kitchen-sink app in `Release` configuration for a physical iPhone.
- Launch the app normally, without the Xcode debugger attached.
- Manually navigate the phone to the `Single` screen and select the engine being
  measured.
- Record with Xcode Instruments `Activity Monitor` for 30 seconds.
- Export the `activity-monitor-process-live` table from the trace.
- Compare `Physical Footprint`, `Real Mem`, `Real Private Mem`, and `% CPU`.

The iPhone Agent Device XCTest runner was not usable in this session because the
device had reached Apple's free developer profile app limit. Therefore, the
screen selection was manual and Instruments only attached to the already-running
`Confetti` process.

## Environment

- Date: 2026-06-07
- Device: Alireza's iPhone, iPhone 16 Pro Max
- iOS: 26.5 (23F77)
- Xcode Instruments: xctrace 16.0 (17E202)
- App: `Confetti`
- Bundle ID: `confetti.example`
- Screen: `Single`
- Texture: `Default`
- Vertical spacing: `Loose`
- Capture template: `Activity Monitor`
- Capture duration: 30 seconds

## Results

| Metric | Skia Single | WebGPU Single | WebGPU - Skia |
| --- | ---: | ---: | ---: |
| Avg CPU | 51.84% | 18.54% | -33.31% |
| P95 CPU | 53.51% | 22.14% | -31.37% |
| Max CPU | 55.57% | 23.42% | -32.15% |
| Physical footprint avg | 274.13 MiB | 311.15 MiB | +37.02 MiB |
| Physical footprint peak | 274.47 MiB | 317.97 MiB | +43.50 MiB |
| Physical footprint end-start | +0.69 MiB | -6.84 MiB | -7.53 MiB |
| Real memory avg | 251.78 MiB | 146.49 MiB | -105.29 MiB |
| Real memory peak | 252.13 MiB | 155.86 MiB | -96.27 MiB |
| Real private memory avg | 186.39 MiB | 71.06 MiB | -115.32 MiB |
| Real private memory peak | 190.48 MiB | 85.94 MiB | -104.55 MiB |

## Raw Run Summaries

### Skia Single

- Process ID: `12498`
- Samples: 31
- Duration: 31.246 seconds
- Avg CPU: 51.84%
- P95 CPU: 53.51%
- Max CPU: 55.57%
- Physical footprint: start 273.78 MiB, average 274.13 MiB, peak 274.47 MiB, end
  274.47 MiB
- Real memory: start 251.39 MiB, average 251.78 MiB, peak 252.13 MiB, end
  252.13 MiB
- Real private memory: start 186.09 MiB, average 186.39 MiB, peak 190.48 MiB,
  end 186.72 MiB

### WebGPU Single

- Process ID: `12501`
- Samples: 31
- Duration: 31.329 seconds
- Avg CPU: 18.54%
- P95 CPU: 22.14%
- Max CPU: 23.42%
- Physical footprint: start 314.11 MiB, average 311.15 MiB, peak 317.97 MiB, end
  307.28 MiB
- Real memory: start 136.91 MiB, average 146.49 MiB, peak 155.86 MiB, end
  155.86 MiB
- Real private memory: start 65.83 MiB, average 71.06 MiB, peak 85.94 MiB, end
  77.42 MiB

## Interpretation

WebGPU was substantially better on CPU for this run. Average CPU dropped from
51.84% to 18.54%, and P95 CPU dropped from 53.51% to 22.14%.

WebGPU had a higher physical footprint. That is plausible because the WebGPU path
loads and maintains GPU/native runtime state such as device/queue resources,
pipeline state, buffers, and related Metal-backed memory.

WebGPU had lower `Real Mem` and `Real Private Mem` in this run. Treat that as a
good sign, but not a complete leak verdict. For memory growth questions, compare
start, peak, and end over longer repeated runs.

## Invalid Or Non-Comparable Data

- Simulator RSS samples are not comparable with this physical-device Activity
  Monitor result.
- Any trace captured before confirming that the iPhone was on `Single` with the
  intended engine should not be used for Skia/WebGPU comparison.
- Activity Monitor traces may fail generic analyzer export, but the table can be
  exported directly with:

```bash
xcrun xctrace export \
  --input path/to/trace.trace \
  --xpath '//table[@schema="activity-monitor-process-live"]'
```

