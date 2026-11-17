# 0006 — Local AI runtimes and model selection

Status: Proposed (research M0-11 folded in 2026-11-17; Accepted in M0-15 after maintainer approval) · Brief: §3 (all), §5.8, §9

## Decision
- **Layers**: rules → decision heads (embeddings + calibrated classifiers) → generative LLM, cheapest first; each decision stores reason + confidence; all output zod-validated.
- **Generative runtime**: `node-llama-cpp` (GGUF; Metal / CUDA / Vulkan / CPU), in the model-host utility process (ADR 0002), with **JSON-schema grammar-constrained decoding**.
- **Embeddings + heads**: Transformers.js on `onnxruntime-node` (tokenizers included), same process. Heads = logistic regression / small MLP over `[embedding ‖ sender features]`, **temperature-scaled** on a held-out set; shipped as small JSON/ONNX files.
- **Models** (picked from the M0-11 benchmarks, see "Research results"; all Apache-2.0 or MIT, redistribution allowed):
  - Generative T2 (≥ 16 GB): **Gemma 4 E4B-it**, Q4_K_M. Fallback: Qwen3.5-4B.
  - Generative T1 (8–16 GB): **Qwen3.5-2B**, Q4_K_M, for extraction/explanations only (classification stays on the heads, see results).
  - Embeddings: **multilingual-e5-small** (MIT) for the decision heads. Granite-97M-r2 and Qwen3-Embedding-0.6B did not beat it on this set and are slower.
- **Hardware tiers** (detected at first launch: RAM, GPU/VRAM, Apple Silicon):
  - T0: < 8 GB RAM or no usable GPU → rules + heads only, LLM features off, explained in plain words.
  - T1: 8–16 GB → small LLM (~1.7B).
  - T2: ≥ 16 GB + GPU/Apple Silicon → ~4B.
- **Speed**: classify per sender and per template cluster (normalized subject/body hash), minimum input first, content-hash cache, batched inference, bounded concurrency, power awareness (plugged/idle = full speed; battery/thermal = throttle; sleep = pause).
- **On-device learning**: corrections stored as labeled examples; kNN lookup over them overrides heads above a similarity threshold; heads re-fitted locally on idle. Preserved across model updates (examples are stored as text features + re-embedded on model change).
- **Distribution**: models downloaded on first launch from the host decided in P3, resumable, SHA-256 verified, listed in a **signed model manifest** (ADR to be extended in M8). Exact files, sizes and hashes: see "Model files and download hosts".
- **Eval**: fixture mailbox + labeled multilingual set; precision/recall per category and signal, emails/min per tier; CI fails on regression beyond tolerance.

## Consequences
Rules must carry the bulk on T0 machines; Autopilot only acts above the calibrated threshold, so T0 machines see fewer automatic actions (by design).

## Research results (M0-11, 2026-11-17)

### Verified versions (`npm view`, exact pins in `packages/ai/package.json`)
| Package | Version | Published |
|---|---|---|
| `node-llama-cpp` | 3.22.3 | 2026-11-05 |
| `@huggingface/transformers` (Transformers.js) | 4.3.2 | 2026-10-27 |
| `onnxruntime-node` | 1.31.1 (latest) | 2026-10-26 |

Transformers.js 4.3.2 pins its own `onnxruntime-node` **1.30.0** exactly; we do not install 1.31.1 directly (it would be a second 287 MB copy with no consumer). Revisit when Transformers.js bumps its pin.

### Shortlist and licenses (checked on the Hugging Face model cards)
| Role | Model | License (upstream) | File size | Notes |
|---|---|---|---|---|
| Generative | **Gemma 4 E4B-it** (GGUF by `unsloth/gemma-4-E4B-it-GGUF`, upstream [google/gemma-4-E4B-it](https://huggingface.co/google/gemma-4-E4B-it)) | Apache-2.0, per the card's [license link](https://ai.google.dev/gemma/docs/gemma_4_license) (the page serves the Apache License 2.0 text) | 4,977,171,584 B | Gemma 3 used the restrictive Gemma terms, so it was dropped. |
| Generative | **Qwen3.5-4B** (`unsloth/Qwen3.5-4B-GGUF`, upstream [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)) | Apache-2.0 | 2,740,937,888 B | |
| Generative | **Qwen3.5-2B** (`unsloth/Qwen3.5-2B-GGUF`, upstream [Qwen/Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B)) | Apache-2.0 | 1,280,835,840 B | |
| Embedding | **multilingual-e5-small** (ONNX by `Xenova/multilingual-e5-small`, upstream [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)) | MIT | 118,308,185 B (`model_quantized.onnx`, q8) | 384-d, needs `query: ` prefix |
| Embedding | granite-embedding-97m-multilingual-r2 ([ibm-granite](https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2)) | Apache-2.0 | 390,004,608 B (`onnx/model.onnx`, fp32) | 384-d, CLS pooling |
| Embedding | Qwen3-Embedding-0.6B (ONNX by `onnx-community/Qwen3-Embedding-0.6B-ONNX`, upstream [Qwen/Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)) | Apache-2.0 | 613,527,631 B (`model_quantized.onnx`, q8) | 1024-d, last-token pooling |

Licenses are the `license` field of each upstream Hugging Face model card (none of these repos ships a separate LICENSE file); the GGUF/ONNX conversions inherit them.

Considered and not benchmarked: Phi-4-mini (MIT, 2025 model, superseded for FR/JA by the above), Qwen3-4B-Instruct-2507, SmolLM3-3B, Llama 3.2 (Llama community license), EmbeddingGemma 2 (Apache-2.0, multimodal ONNX export, larger), jina-embeddings-v5 (CC BY-NC, rejected), bge-m3 (568M, MIT, too heavy for a heads backbone).

### Benchmark protocol
`packages/ai/bench/` (run: `node packages/ai/bench/run.ts --task embed|llm|all`). 210 synthetic emails (7 categories × EN/FR/JA × 10, invented senders on `example.*` domains), fully deterministic. Embeddings: nearest-centroid head, 5-fold on all languages mixed, plus fit-on-English / test-on-FR+JA. Generative: zero-shot category (JSON-schema grammar, enum) and deadline extraction (`{"deadline": ISO|null}`), temperature 0, thinking disabled, validated with zod. Raw results are committed in `packages/ai/bench/results/`. Machine: Apple M2 Pro, 12 cores, 16 GB, macOS.

### Results
Embeddings (CPU, Transformers.js, one email at a time):
| Model | Accuracy (mixed) | Accuracy (EN→FR/JA) | emails/s | p50 ms |
|---|---|---|---|---|
| multilingual-e5-small | 1.000 | 1.000 | 185 | 5 |
| granite-97m-r2 | 0.976 | 0.986 | 78 | 11 |
| Qwen3-Embedding-0.6B | 0.976 | 0.986 | 20 | 47 |

Generative (Metal, all 210 emails; zero-shot, no heads, no few-shot):
| Model | Category accuracy (EN / FR / JA) | Date extraction (dated mails exact) | Emails/min (classify) | Decode tok/s | JSON valid |
|---|---|---|---|---|---|
| Gemma 4 E4B-it | 0.990 (1.00 / 1.00 / 0.97) | 100% | 140 | 39 | 100% |
| Qwen3.5-4B | 0.981 (1.00 / 0.99 / 0.96) | 100% | 66 | 46 | 100% |
| Qwen3.5-2B | 0.700 (0.70 / 0.73 / 0.67) | 100% | 101 | 94 | 100% |

CPU only (`gpu: false`, 42-email sample, same M2 Pro): Qwen3.5-2B 0.76 accuracy, 60 emails/min, 69 tok/s; Qwen3.5-4B 1.00 accuracy, 32 emails/min, 30 tok/s.

### Reading the numbers
- **Grammar-constrained JSON worked 100% of the time** on all three models and both tasks, so the "always parses, then zod" rule holds.
- **The synthetic set is easy and templated.** It proves the runtimes, multilingual support and relative speed, **not** real-world accuracy: e5-small scoring 1.000 means the set cannot separate embedders. M1/M3 must rebuild the eval on the fixture mailbox with realistic, noisy mail before any threshold is calibrated.
- **Null extraction is weak**: on mails without a deadline the models often invent one (null-correct: Gemma 91%, 2B 65%, Qwen 4B 52%). Prompts need a few-shot "no date" example and the zod layer should require the date to appear in the source text.
- **A 2B model is not a classifier**: 70% zero-shot. This confirms the layering: heads carry classification; T1's small LLM is for extraction/explanations/digests.
- **Gemma 4 E4B is the best T2 pick**: highest accuracy and more emails per minute than Qwen3.5-4B (140 vs 66) at equal quality, although raw decode speed is lower (39 vs 46 tok/s), and it is a 5 GB file (vs 2.7 GB) with a larger resident footprint; Qwen3.5-4B is the lighter fallback.
- Prompt-processing tok/s from the free-text probe is recorded in the JSON but is dominated by first-token overhead on short prompts: use emails/min instead.

### Model files and download hosts
Hashes are SHA-256 of the files downloaded during the benchmark (the e5 hash also equals the Hub's LFS oid). Pin these in the signed model manifest (M8).

| Model | Repo | File | Quant | Size (bytes) | SHA-256 |
|---|---|---|---|---|---|
| Gemma 4 E4B-it | `unsloth/gemma-4-E4B-it-GGUF` | `gemma-4-E4B-it-Q4_K_M.gguf` | Q4_K_M | 4977171584 | `85a896a047553e842f25297ee5b031d64ff30147d9c4af17b1e4b394cd1fab87` |
| Qwen3.5-4B | `unsloth/Qwen3.5-4B-GGUF` | `Qwen3.5-4B-Q4_K_M.gguf` | Q4_K_M | 2740937888 | `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4` |
| Qwen3.5-2B | `unsloth/Qwen3.5-2B-GGUF` | `Qwen3.5-2B-Q4_K_M.gguf` | Q4_K_M | 1280835840 | `74e5d53648a5496c150b80752c9ef6872571e01750f83923485b2b923d7c1348` |
| multilingual-e5-small | `Xenova/multilingual-e5-small` | `onnx/model_quantized.onnx` | q8 | 118308185 | `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193` |
| granite-embedding-97m-multilingual-r2 | `ibm-granite/granite-embedding-97m-multilingual-r2` | `onnx/model.onnx` | fp32 | 390004608 | `68e592b160673d30250824c1116bc6ab33f70efb22b97c9e1d7ce1e69c1c9d70` |
| Qwen3-Embedding-0.6B | `onnx-community/Qwen3-Embedding-0.6B-ONNX` | `onnx/model_quantized.onnx` | q8 | 613527631 | `87cd124e0ef1fd1f223ebc283efccbaeac386d0b08344701c46975d0657b591f` |

**Download hosts (proposed, needs maintainer approval, AGENTS §11):** `huggingface.co` (file URL, answers with a 302) and the CDN it redirects every one of these files to, `us.aws.cdn.hf.co` (observed 2026-11-17). Neither is in the network inventory yet; the CDN host may change, so the request filter should allow `*.hf.co` only if the maintainer accepts that, or the app should mirror models from a host it controls (plan P3). Only Granite and Qwen3-Embedding were not selected; the manifest lists just the picked files (Gemma 4 E4B, Qwen3.5-2B, Qwen3.5-4B fallback, e5-small).

### Decisions for M0-15
1. Approve (or replace) the model download hosts above, and add them to `docs/security/network.md` and the request filter.
2. Confirm the model picks, which change the Qwen3 / Phi-4-mini candidates in the first draft of this ADR.
3. Decide Gemma 4 E4B (5 GB) vs Qwen3.5-4B (2.7 GB) as the T2 default once x64 numbers exist.

### Not measured / open
- **x64 CPU**: no x64 machine was available. The script runs unchanged on any host (`--cpu-only`); numbers on a typical Intel/AMD laptop must be added (Apple-silicon CPU-only is a poor proxy: its NEON throughput far exceeds an AVX2 laptop). Needed before the T1/T2 RAM and speed thresholds are final.
- **Follow-up before the M3 thresholds**: x64 CPU numbers (above) must be collected before any M3 tier or latency threshold is set.
- Transformers.js vs raw `onnxruntime-node` was not compared (Transformers.js overhead at 5 ms/email for e5-small is negligible, so we keep it).
- Windows and Linux were not run.

### Packaging notes (electron-builder)
- `node-llama-cpp` ships prebuilt binaries as optional packages `@node-llama-cpp/{mac-arm64-metal, mac-x64, win-x64, win-arm64, linux-x64, linux-arm64, …-vulkan, …-cuda}` (mac-arm64-metal is 18 MB). No compile step and no postinstall needed, so `pnpm`'s `allowBuilds` marks `node-llama-cpp`, `onnxruntime-node` and `protobufjs` as `false` (pnpm 12 otherwise fails the install with `ERR_PNPM_IGNORED_BUILDS`). CUDA variants are optional extras, left out of v1 to keep the download small.
- `onnxruntime-node` bundles `bin/napi-v6/{darwin,linux,win32}` (85 / 68 / 133 MB unpacked); the build must keep only the target OS/arch folder. Expected, to be proven in M8 (not tested here): both native modules need `asarUnpack` (they `dlopen` from disk), and the macOS universal build needs the arm64 and x64 binaries of each package combined.
- Both live in the model-host utility process (ADR 0002), not the main process.
- **Downloader**: `node-llama-cpp`'s built-in downloader (`resolveModelFile`) stalled twice on multi-GB files here, leaving a pre-allocated `.ipull` placeholder that fails the GGUF magic check. M8's model downloader should be ours (HTTP range resume, SHA-256, size check before rename), not that one.
- **Runtime quirk**: with `budgets: { thoughtTokens: 0 }` on Qwen3.5, node-llama-cpp 3.22.3 returns the grammar-constrained object **without its opening `{`**; without the budget the response came back empty in a one-prompt probe. The bench restores the brace; production code must do the same or use a chat wrapper with thinking disabled, and a test must guard it.

