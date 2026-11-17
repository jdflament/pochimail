# 0006 — Local AI runtimes and model selection

Status: Proposed · Brief: §3 (all), §5.8, §9 · Research: M0-11 (benchmarks decide the final picks)

## Decision
- **Layers**: rules → decision heads (embeddings + calibrated classifiers) → generative LLM, cheapest first; each decision stores reason + confidence; all output zod-validated.
- **Generative runtime**: `node-llama-cpp` (GGUF; Metal / CUDA / Vulkan / CPU), in the model-host utility process (ADR 0002), with **JSON-schema grammar-constrained decoding**.
- **Embeddings + heads**: Transformers.js on `onnxruntime-node` (tokenizers included), same process. Heads = logistic regression / small MLP over `[embedding ‖ sender features]`, **temperature-scaled** on a held-out set; shipped as small JSON/ONNX files.
- **Candidate models** (license must allow redistribution; final choice from M0-11 benchmarks on EN/FR/JA):
  - Generative: Qwen3 family (Apache-2.0, strong FR/JA) at ~1.7B and ~4B, Q4_K_M; alternatives Phi-4-mini (MIT), Gemma 3 (Gemma terms — check redistribution).
  - Embeddings: multilingual-e5-small (MIT) baseline; compare newer small multilingual embedders.
- **Hardware tiers** (detected at first launch: RAM, GPU/VRAM, Apple Silicon):
  - T0: < 8 GB RAM or no usable GPU → rules + heads only, LLM features off, explained in plain words.
  - T1: 8–16 GB → small LLM (~1.7B).
  - T2: ≥ 16 GB + GPU/Apple Silicon → ~4B.
- **Speed**: classify per sender and per template cluster (normalized subject/body hash), minimum input first, content-hash cache, batched inference, bounded concurrency, power awareness (plugged/idle = full speed; battery/thermal = throttle; sleep = pause).
- **On-device learning**: corrections stored as labeled examples; kNN lookup over them overrides heads above a similarity threshold; heads re-fitted locally on idle. Preserved across model updates (examples are stored as text features + re-embedded on model change).
- **Distribution**: models downloaded on first launch from the host decided in P3, resumable, SHA-256 verified, listed in a **signed model manifest** (ADR to be extended in M8).
- **Eval**: fixture mailbox + labeled multilingual set; precision/recall per category and signal, emails/min per tier; CI fails on regression beyond tolerance.

## Consequences
Rules must carry the bulk on T0 machines; Autopilot only acts above the calibrated threshold, so T0 machines see fewer automatic actions (by design).

## To verify
Current best small multilingual instruction and embedding models (as of build time), licenses, GGUF availability; `node-llama-cpp` packaging with electron-builder per OS; Transformers.js Node performance vs raw onnxruntime-node.
