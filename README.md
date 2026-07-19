# AnalogLab — Op-Amps & Analog Electronics

An interactive, offline teaching lab for op-amp and analog-electronics circuits. Pick a circuit, change the component values, and watch the **schematic**, the **governing equation**, and three real **instruments** — an oscilloscope, a transfer-characteristic plot, and a Bode plot — update together in real time.

Built for university students who want the intuition *and* the numbers at once. Zero dependencies, single-page, installable, works with no internet.

## What's inside

Eleven circuits across five categories:

| Category | Circuits |
|---|---|
| **Basics** | Meet the op-amp (the two golden rules, open-loop gain, virtual short) |
| **Amplifiers** | Inverting · Non-inverting · Voltage follower (buffer) |
| **Math circuits** | Summing · Difference · Integrator · Differentiator |
| **Comparators** | Comparator · Schmitt trigger (hysteresis) |
| **Filters** | Active low-pass filter (with Bode plot) |

Each circuit gives you:

- a **live IEC schematic** with labelled nodes (virtual ground, feedback, V+/V−);
- the **equation** rewritten with your current values, plus derived quantities (gain in ×  and dB, bandwidth, cutoff frequency, trip points…);
- an **oscilloscope** with a proper CRT graticule, auto-ranged volts/div, both traces (amber = input, green = output) and dashed supply rails so you can *see* clipping;
- a **transfer characteristic** (Vout vs Vin) showing the gain slope, saturation, and — for the Schmitt trigger — the hysteresis loop;
- a **Bode plot** (magnitude in dB + phase in degrees, log-frequency) marking the −3 dB cutoff, for the amplifiers and the filter;
- a short **How it works** explanation and an **On the bench** note (real part numbers like TL072 / LM358 / LM393, and how to drive and measure the circuit with an Arduino).

## The physics is real, not decorative

Every graph is computed from the actual circuit behaviour, and the models were checked against theory before the UI was built:

- the **integrator** output amplitude matches `A/(ωR₁C)`; a square wave integrates to a triangle, a sine to a −cosine;
- the **differentiator** matches `R꜀C·ω·A`; a triangle differentiates to a square;
- the **active low-pass** is integrated as its first-order ODE `τ·dVo/dt + Vo = −(Rf/R₁)·Vin`, and its Bode magnitude lands exactly on `(Rf/R₁)/√(1+(f/fc)²)` — 0.707× gain at the cutoff;
- the **Schmitt** trip points are `±Vsat·R₁/(R₁+R₂)`;
- the **amplifier** Bode plots use a finite gain–bandwidth model, so you can watch bandwidth shrink as gain rises (gain ×10 → ~91 kHz, gain ×100 → ~9.9 kHz for a 1 MHz GBW part).


## Tech

Plain HTML/CSS/JS. Graphs are drawn on `<canvas>` (DPR-aware); schematics are inline SVG. No build step, no framework, no tracking. Type: Space Grotesk / IBM Plex Sans / IBM Plex Mono.
