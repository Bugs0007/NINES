import { definePack } from "../define";

export const LO = { start: { rank: 64, mods: "qv", n: 2000, qlora: false } };
export const LO_CHALLENGE = { start: { rank: 8, mods: "qv", n: 2000, qlora: false } };

const LORA_PAPER = { id: "lora-paper", title: "Hu et al. (2021), LoRA: low-rank adaptation of large language models", url: "https://arxiv.org/abs/2106.09685" };
const QLORA = { id: "qlora-paper", title: "Dettmers et al. (2023), QLoRA: efficient finetuning of quantized LLMs", url: "https://arxiv.org/abs/2305.14314" };
const PEFT = { id: "hf-peft", title: "Hugging Face PEFT docs: LoRA (rank, target modules and adapters)", url: "https://huggingface.co/docs/peft/conceptual_guides/lora" };

export default definePack({
  id: "lora",
  title: "LoRA Intuition",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "training job · CUDA out of memory", detail: "full fine-tune of a 7B model on a 24 GB card" },
    lines: [
      { speaker: "kabir", line: "I tried to fine-tune a seven-billion-parameter model on our one 24-gigabyte GPU and it ran out of memory before the first step." },
      { speaker: "meera", line: "You do not have to move every weight to teach a model a habit. Freeze it and train a thin layer of corrections beside it." },
    ],
  },
  predictions: [
    {
      id: "tiny",
      kind: "choice",
      prompt: "You adapt the query and value projections of all 32 layers of a 7B model at rank 8. About what share of the model's parameters are you training?",
      options: [
        { id: "50", label: "About 50%" },
        { id: "5", label: "About 5%" },
        { id: "006", label: "About 0.06%" },
      ],
      answer: "006",
      observe: "tiny-fraction",
      reveal: {
        text: "Each adapted matrix gets two thin matrices, 4,096 × 8 and 8 × 4,096: 65,536 parameters. Across 64 matrices that is 4.2 million, against 7 billion. You train a few megabytes of corrections, and the adapter file is about 8 MB, so one base model can serve many tasks.",
        derived: true,
        line: { speaker: "rao", line: "Most of what the model knows stays exactly where it is." },
      },
    },
    {
      id: "overfit",
      kind: "choice",
      prompt: "You have only 200 examples, so you make the adapter bigger to learn them well: rank 64 on all linear layers. Compared with a modest adapter on 2,000 examples, what happens to accuracy?",
      options: [
        { id: "better", label: "Better, more capacity learns more" },
        { id: "same", label: "About the same" },
        { id: "worse", label: "Much worse, about 55%: it memorises the 200 and little else" },
      ],
      answer: "worse",
      observe: "overfit",
      reveal: {
        text: "With 200 examples the adapter has 100 million parameters to fit them, far more than the data can constrain. It memorises, and accuracy falls to 55% in the lab, near the untrained model. Capacity helps only with enough data to use it; for small datasets keep the rank low.",
        derived: true,
        line: { speaker: "meera", line: "A bigger dial needs more data to turn it." },
      },
    },
  ],
  widget: { id: "lora-lab", config: LO },
  mechanism: [
    {
      id: "idea",
      text: "Full fine-tuning updates every weight, and with gradients and optimiser state a 7-billion-parameter model needs over 100 GB. LoRA freezes the model and learns a small change beside selected weight matrices, as the product of two thin matrices: 4,096 by r and r by 4,096, where r is the rank.",
      sourceIds: ["lora-paper"],
    },
    {
      id: "rank",
      scene: "rank",
      text: "The rank is the dial. A higher rank can express a richer change and adds more trainable parameters. Many tasks are learned well at ranks of 8 to 64, because the change needed is low-dimensional. Beyond that, returns diminish, and with little data a large adapter overfits. Choose the rank by measuring on held-out examples.",
      sourceIds: ["lora-paper", "hf-peft"],
    },
    {
      id: "targets",
      scene: "targets",
      text: "Choose where to put adapters. The original recipe adapted only the query and value projections of attention. Adapting all linear layers, including the MLP, gives more capacity at the same rank and often better results at three times the parameters. At inference the adapter can be merged into the weights, or swapped per task.",
      sourceIds: ["hf-peft", "lora-paper"],
    },
    {
      id: "qlora",
      scene: "qlora",
      text: "Memory is mostly the frozen base model. QLoRA stores it in 4-bit and trains the adapter in higher precision on top, cutting a 7B model from about 14 GB to 4 GB. A job that did not fit a consumer GPU now does. You pay a small quality loss from quantization and some training speed.",
      sourceIds: ["qlora-paper"],
    },
  ],
  challenges: [
    {
      id: "configure-adapter",
      title: "Configure the adapter",
      brief: "Fine-tune a 7B model on 2,000 examples to at least 88% accuracy within 12 GB of GPU memory.",
      line: { speaker: "rao", line: "It has to fit on the card that we have." },
      widget: { id: "lora-lab", config: LO_CHALLENGE },
      conditions: [
        { metric: "accuracy", op: ">=", value: 0.88, label: "Accuracy at least 88%" },
        { metric: "vramGB", op: "<=", value: 12, label: "At most 12 GB of GPU memory" },
      ],
      stars: [{ metric: "adapterMB", op: "<=", value: 60, label: "Adapter file at most 60 MB" }],
      hints: ["What dominates the memory?", "How do rank and the adapted layers together set capacity?", "Which setting gives the smallest adapter that clears 88%?"],
    },
  ],
  explainBack: {
    prompt: "Explain how LoRA works and what its main choices are.",
    rubric: [
      { id: "idea", criterion: "Freeze the base model and train two thin matrices beside chosen weights whose product is the update, so only a tiny fraction of parameters trains", keyIdea: "low-rank update beside frozen weights" },
      { id: "choices", criterion: "Rank sets capacity and adapter size; target modules (attention only or all linear layers) add capacity; more data is needed for more capacity", keyIdea: "rank and targets" },
      { id: "memory", criterion: "Memory is mostly the frozen base, so quantizing it (QLoRA) lets large models train on small GPUs", keyIdea: "QLoRA shrinks the base" },
    ],
    exemplar:
      "LoRA freezes the base model and trains two thin matrices beside chosen weights, whose product is the update, so only a tiny fraction of the parameters train and the adapter is a few megabytes. The rank sets capacity and adapter size, adapting all linear layers adds capacity, and a bigger adapter needs more data or it overfits. Memory is mostly the frozen base, so QLoRA stores it in 4-bit and lets a large model train on a small GPU.",
  },
  reviews: [
    {
      id: "lo-est",
      format: "estimate",
      scenario: "One adapted 4,096 × 4,096 matrix at rank 8 adds two thin matrices, 4,096 × 8 and 8 × 4,096. How many trainable parameters, versus the full matrix of about 16.8 million?",
      unit: "parameters",
      answer: 65536,
      acceptFactor: 1.05,
      breakdown: ["2 × 4,096 × 8 = 65,536", "0.4% of the 16.8 million in the full matrix"],
      explain: "The saving is the ratio of 2r to the matrix size. For r = 8 that is 0.4%.",
    },
    {
      id: "lo-pick",
      format: "pick-fix",
      scenario: "A fine-tuning job on a 7B model runs out of memory on a 24 GB GPU. Which change is most likely to fix it while keeping quality?",
      options: [
        { id: "a", label: "Use LoRA, and QLoRA if it still does not fit" },
        { id: "b", label: "Raise the learning rate" },
        { id: "c", label: "Train for fewer epochs" },
        { id: "d", label: "Use a larger batch" },
      ],
      answer: "a",
      explain: "The memory is optimiser state for every weight. Training a small adapter removes nearly all of it.",
    },
    {
      id: "lo-order",
      format: "order",
      scenario: "Order these by GPU memory to train in the lab, highest first.",
      items: [
        { id: "full", label: "Full fine-tune, 7B" },
        { id: "lora", label: "LoRA in 16-bit" },
        { id: "qlora", label: "QLoRA in 4-bit" },
      ],
      answer: ["full", "lora", "qlora"],
      explain: "About 112 GB, 17 GB and 7 GB.",
    },
    {
      id: "lo-graph",
      format: "predict-graph",
      scenario: "With 2,000 training examples, as the LoRA rank rises from 1 to 64, how does task accuracy change?",
      xLabel: "rank →",
      yLabel: "accuracy",
      options: [
        { id: "sat", label: "Rises steeply, then flattens", points: [58, 66, 74, 82, 87, 89, 90, 90] },
        { id: "linear", label: "Rises in a straight line", points: [58, 62, 66, 70, 74, 78, 82, 86] },
        { id: "peak", label: "Rises, then falls with overfitting", points: [58, 70, 82, 88, 85, 75, 65, 55] },
      ],
      answer: "sat",
      explain: "Capacity saturates: the task needs only so many dimensions of change. Overfitting only appears when data is small.",
    },
    {
      id: "lo-flaw",
      format: "spot-flaw",
      scenario: "A team has 150 labelled examples and trains a rank-128 adapter on all layers 'to give it plenty of room'. Tap the problem.",
      diagram: {
        nodes: [
          { id: "data", label: "150 examples", kind: "store", col: 0, row: 1 },
          { id: "adapter", label: "rank 128, all layers: 200M parameters", kind: "worker", col: 1, row: 1 },
          { id: "model", label: "tuned model", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "data", to: "adapter" },
          { from: "adapter", to: "model" },
        ],
      },
      answer: "data->adapter",
      explain: "A huge adapter on a handful of examples memorises them. Use a low rank and measure on held-out data.",
    },
    {
      id: "lo-explain",
      format: "explain",
      scenario: "In two sentences: why can a tiny adapter change a large model's behaviour?",
      rubric: [
        { id: "lowdim", criterion: "The change a task needs is low-dimensional: a few directions of adjustment, which a low-rank update can capture" },
        { id: "base", criterion: "The frozen base already holds the general capability, so the adapter only steers it" },
      ],
      exemplar: "The change a task needs is low-dimensional, a few directions of adjustment, which a low-rank update can capture. The frozen base already holds the general capability, so the adapter only needs to steer it.",
      explain: "A habit is a small change to a big skill.",
    },
  ],
  codex: {
    oneLiner: "Freeze the model, train two thin matrices beside chosen weights. Rank sets capacity; QLoRA shrinks the frozen base so big models train on small GPUs.",
    keyNumbers: [
      { label: "Rank 8, query and value, 32 layers (7B)", value: "4.2M trainable, 0.06%", sourceId: "lora-paper" },
      { label: "Full fine-tune vs QLoRA memory (lab)", value: "112 GB vs 7 GB", sourceId: "qlora-paper" },
    ],
    tradeoffs: [
      { choice: "Higher rank", gain: "More capacity", cost: "More parameters; overfits small data" },
      { choice: "Adapt all linear layers", gain: "Better quality at the same rank", cost: "About 3× the adapter size" },
      { choice: "QLoRA", gain: "Fits small GPUs", cost: "Slower; small quantization loss" },
    ],
    seenIn: ["Hugging Face PEFT and axolotl recipes.", "Per-customer adapters served on one base model."],
    interviewAngle: "Say: 'freeze the base, train a low-rank update, tune rank and target modules, QLoRA for memory, and check overfitting on held-out data'.",
    aws: [{ concept: "Adapter fine-tuning", service: "Amazon SageMaker with PEFT; Bedrock custom models" }],
    replay: { id: "lora-lab", config: LO, scene: "qlora" },
  },
  interview: [
    "How does LoRA work?",
    "What are rank and target modules?",
    "How does QLoRA let you fine-tune on a small GPU?",
  ],
  deeper: [
    {
      title: "Many adapters, one base",
      body: "Because adapters are small and the base stays frozen, one deployed base model can serve many adapters, one per customer or task, swapped per request. That is a different cost shape from many separate fine-tuned models, each needing its own deployment. Evaluate each adapter separately and version them like code.",
      sourceIds: ["hf-peft"],
    },
  ],
  honestPhysics: [
    "A 7-billion-parameter model with 32 layers and a hidden size of 4,096. Full fine-tuning needs about 16 bytes per parameter, 112 GB. LoRA at rank r adds 2 × 4,096 × r trainable parameters per adapted matrix.",
    "Task accuracy starts at 55% and rises toward 92% with adapter capacity (a saturating curve in rank times the number of adapted matrix types, with scale 12) and with data (saturating with scale 800 examples). Under 500 examples, a large adapter overfits and loses 8 points. Memory is the frozen weights (14 GB in 16-bit; 4 GB in 4-bit), 16 bytes per adapter parameter and about 3 GB of activations. Round figures.",
  ],
  sources: [LORA_PAPER, QLORA, PEFT],
  verify: [
    { id: "params", claim: "Rank 8 on query and value projections trains 4.2 million parameters", run: "lab", params: { model: "lora-lab", config: LO_CHALLENGE, values: {}, metric: "trainableParams" }, expect: { min: 4190000, max: 4200000 } },
    { id: "adapter", claim: "…an 8 MB adapter", run: "lab", params: { model: "lora-lab", config: LO_CHALLENGE, values: {}, metric: "adapterMB" }, expect: { min: 8.3, max: 8.5 } },
    { id: "vram-lora", claim: "LoRA in 16-bit needs 17 GB", run: "lab", params: { model: "lora-lab", config: LO_CHALLENGE, values: { qlora: false }, metric: "vramGB" }, expect: { min: 16.9, max: 17.3 } },
    { id: "vram-qlora", claim: "QLoRA brings it to 7.6 GB", run: "lab", params: { model: "lora-lab", config: LO_CHALLENGE, values: { qlora: true }, metric: "vramGB" }, expect: { min: 7, max: 8 } },
    { id: "overfit", claim: "Rank 64 on all layers with 200 examples drops to 55%", run: "lab", params: { model: "lora-lab", config: LO_CHALLENGE, values: { rank: 64, mods: "all", n: 200, qlora: true }, metric: "accuracy" }, expect: { min: 0.54, max: 0.56 } },
    { id: "small", claim: "Rank 8 on query and value is not enough: 71.5% accuracy", run: "lab", params: { model: "lora-lab", config: LO_CHALLENGE, values: { rank: 8, mods: "qv", n: 2000, qlora: true }, metric: "accuracy" }, expect: { max: 0.88 } },
    { id: "good", claim: "Rank 16 on all linear layers with QLoRA clears 88% in 7.4 GB", run: "lab", params: { model: "lora-lab", config: LO_CHALLENGE, values: { rank: 16, mods: "all", n: 2000, qlora: true }, metric: "accuracy" }, expect: { min: 0.88 } },
    { id: "good-size", claim: "…with a 50 MB adapter", run: "lab", params: { model: "lora-lab", config: LO_CHALLENGE, values: { rank: 16, mods: "all", n: 2000, qlora: true }, metric: "adapterMB" }, expect: { min: 49, max: 52 } },
  ],
});
