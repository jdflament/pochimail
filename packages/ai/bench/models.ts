// The shortlist benchmarked for ADR 0006 (verified on Hugging Face model cards, 2026-11-17).

export interface GenerativeModel {
  id: string;
  /** node-llama-cpp model URI: hf:<repo>:<quant>. */
  uri: string;
  license: string;
  approxParams: string;
}

export interface EmbeddingModel {
  id: string;
  /** Transformers.js model id (ONNX weights on the Hub). */
  hubId: string;
  dtype: "fp32" | "q8" | "q4";
  pooling: "mean" | "cls" | "last_token";
  /** Instruction prefix the model expects on every input text. */
  prefix: string;
  license: string;
  approxParams: string;
}

export const generativeModels: GenerativeModel[] = [
  {
    id: "qwen3.5-2b",
    uri: "hf:unsloth/Qwen3.5-2B-GGUF:Q4_K_M",
    license: "Apache-2.0",
    approxParams: "2B",
  },
  {
    id: "qwen3.5-4b",
    uri: "hf:unsloth/Qwen3.5-4B-GGUF:Q4_K_M",
    license: "Apache-2.0",
    approxParams: "4B",
  },
  {
    id: "gemma-4-e4b",
    uri: "hf:unsloth/gemma-4-E4B-it-GGUF:Q4_K_M",
    license: "Apache-2.0",
    approxParams: "4B effective",
  },
];

export const embeddingModels: EmbeddingModel[] = [
  {
    id: "multilingual-e5-small",
    hubId: "Xenova/multilingual-e5-small",
    dtype: "q8",
    pooling: "mean",
    prefix: "query: ",
    license: "MIT",
    approxParams: "118M",
  },
  {
    id: "granite-embedding-97m-multilingual-r2",
    hubId: "ibm-granite/granite-embedding-97m-multilingual-r2",
    dtype: "fp32",
    pooling: "cls",
    prefix: "",
    license: "Apache-2.0",
    approxParams: "97M",
  },
  {
    id: "qwen3-embedding-0.6b",
    hubId: "onnx-community/Qwen3-Embedding-0.6B-ONNX",
    dtype: "q8",
    pooling: "last_token",
    prefix: "",
    license: "Apache-2.0",
    approxParams: "600M",
  },
];
