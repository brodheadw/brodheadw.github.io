# ManimGX visualization roadmap

ManimGX: https://github.com/academa-labs/manimgx

This atlas remains an interactive, browser-based 3D viewer. ManimGX is proposed as an **optional animation and video export layer**, not yet wired into the website.

## Suggested animation pipeline

1. Import DESI galaxies as 3D positions and sample for a legible fly-through.
2. Represent IceCube events as **sky directions/uncertainty cones**, not falsely assigned 3D distances.
3. Add Fermi sources as a separate directional sky layer.
4. Generate explanatory scenes with ManimGX (Python API, Rust/wgpu renderer), rendered to MP4 or browser WebGPU where supported.
5. Label any synthetic/example catalog data prominently.
6. Save animation parameters, source catalog IDs, and camera paths for reproducibility.

## Why two rendering engines?

The present canvas-based atlas supports user interaction, exploratory selection, and importing CSV data. ManimGX is suited to scripted, cinematic educational sequences with callouts, camera motion, text and equations.

## Example sequence

- Fly from the Local Group outward into the spectroscopic DESI cosmic web.
- Isolate a target dwarf galaxy.
- Show an IceCube event as a directional probability region from Earth rather than an object at the dwarf's distance.
- Overlay Fermi sky positions; annotate angular separation.
- Animate right-ascension scrambling to illustrate background trials, distinguishing exploratory p-values from calibrated discovery significances.

**Status**: design/integration notes only; no ManimGX renderer has been installed or deployed here.