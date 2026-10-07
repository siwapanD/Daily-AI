import type { Category } from "../constants";

/** Known technologies for heuristic linking. Order matters: more specific names first. */
export const KNOWN_TECH: { name: string; re: RegExp; vendor: string | null; category: Category }[] = [
  { name: "Claude Code", re: /\bclaude[- ]code\b/i, vendor: "Anthropic", category: "CODING" },
  { name: "Codex", re: /\b(openai\/)?codex\b/i, vendor: "OpenAI", category: "CODING" },
  { name: "Gemini CLI", re: /\bgemini[- ]cli\b/i, vendor: "Google", category: "CODING" },
  { name: "GitHub Copilot", re: /\bcopilot\b/i, vendor: "GitHub", category: "CODING" },
  { name: "Cursor", re: /\bcursor\b(?! (position|pagination))/i, vendor: "Anysphere", category: "CODING" },
  { name: "Windsurf", re: /\bwindsurf\b/i, vendor: null, category: "CODING" },
  { name: "Aider", re: /\baider\b/i, vendor: null, category: "CODING" },
  { name: "Cline", re: /\bcline\b/i, vendor: null, category: "CODING" },
  { name: "Roo Code", re: /\broo[- ]?code\b/i, vendor: null, category: "CODING" },
  { name: "OpenCode", re: /\bopencode\b/i, vendor: null, category: "CODING" },
  { name: "MCP", re: /\b(mcp|model context protocol)\b/i, vendor: null, category: "MCP" },
  { name: "A2A", re: /\ba2a\b/i, vendor: "Google", category: "AGENT" },
  { name: "LiteLLM", re: /\blitellm\b/i, vendor: null, category: "AI_GATEWAY" },
  { name: "OpenRouter", re: /\bopenrouter\b/i, vendor: null, category: "AI_GATEWAY" },
  { name: "Claude", re: /\b(claude|opus|sonnet|haiku)\b/i, vendor: "Anthropic", category: "MODEL" },
  { name: "GPT", re: /\bgpt-?\d/i, vendor: "OpenAI", category: "MODEL" },
  { name: "Gemini", re: /\bgemini\b/i, vendor: "Google", category: "MODEL" },
  { name: "Llama", re: /\bllama\b/i, vendor: "Meta", category: "MODEL" },
  { name: "Mistral", re: /\b(mistral|codestral|devstral)\b/i, vendor: "Mistral", category: "MODEL" },
  { name: "DeepSeek", re: /\bdeepseek\b/i, vendor: "DeepSeek", category: "MODEL" },
  { name: "Qwen", re: /\bqwen\b/i, vendor: "Alibaba", category: "MODEL" },
  { name: "Kimi", re: /\bkimi\b/i, vendor: "Moonshot", category: "MODEL" },
  { name: "GLM", re: /\bglm-?\d/i, vendor: "Z.ai", category: "MODEL" },
];

export function detectTechnology(title: string, content = "") {
  return KNOWN_TECH.find((t) => t.re.test(title)) ?? KNOWN_TECH.find((t) => t.re.test(content.slice(0, 600))) ?? null;
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
}
