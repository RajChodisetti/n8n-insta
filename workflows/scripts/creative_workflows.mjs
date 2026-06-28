import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_CREATIVE_WORKFLOW_ID = 'high_retention_story';

export const CREATIVE_WORKFLOW_DEFINITIONS = Object.freeze({
  high_retention_story: Object.freeze({
    id: 'high_retention_story',
    label: 'High-Retention Story',
    file: 'creative_workflows/high_retention_story.md',
    role: 'short-form retention strategist and story writer',
    summary: 'Prioritize an interruptive hook, tension, curiosity, concrete scenes, and payoff.',
  }),
  premium_documentary: Object.freeze({
    id: 'premium_documentary',
    label: 'Premium Documentary',
    file: 'creative_workflows/premium_documentary.md',
    role: 'premium documentary director and factual story editor',
    summary: 'Prioritize cinematic restraint, careful facts, emotional arc, and visual elegance.',
  }),
  sales_conversion: Object.freeze({
    id: 'sales_conversion',
    label: 'Sales / Conversion',
    file: 'creative_workflows/sales_conversion.md',
    role: 'conversion-focused video strategist and offer writer',
    summary: 'Prioritize audience pain, contrast, credibility, offer clarity, and a direct CTA.',
  }),
});

const FALLBACK_CARD = `# High-Retention Story

Role: You are a short-form retention strategist and story writer.

Hook strategy:
- Start with a sharp contradiction, curiosity gap, or painful truth.
- Make the first line understandable in under two seconds.
- Create a promise the final scene pays off.

Story structure:
- Hook -> tension -> concrete example -> useful insight -> payoff -> CTA.
- One idea per scene.
- Avoid generic motivational filler.
`;

export function creativeWorkflowOptions() {
  return Object.values(CREATIVE_WORKFLOW_DEFINITIONS).map((workflow) => ({
    id: workflow.id,
    label: workflow.label,
    role: workflow.role,
    summary: workflow.summary,
  }));
}

export function normalizeCreativeWorkflowId(value, { fallback = DEFAULT_CREATIVE_WORKFLOW_ID } = {}) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized && CREATIVE_WORKFLOW_DEFINITIONS[normalized]) {
    return normalized;
  }
  const fallbackId = String(fallback || DEFAULT_CREATIVE_WORKFLOW_ID).trim();
  return CREATIVE_WORKFLOW_DEFINITIONS[fallbackId] ? fallbackId : DEFAULT_CREATIVE_WORKFLOW_ID;
}

export function creativeWorkflowDefinition(value) {
  const id = normalizeCreativeWorkflowId(value);
  return CREATIVE_WORKFLOW_DEFINITIONS[id] || CREATIVE_WORKFLOW_DEFINITIONS[DEFAULT_CREATIVE_WORKFLOW_ID];
}

function resolvePromptsRootSync() {
  const candidates = [
    String(process.env.PROMPTS_ROOT || '').trim(),
    '/prompts',
    path.resolve(__dirname, '../../prompts'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {}
  }
  return path.resolve(__dirname, '../../prompts');
}

export function creativeWorkflowPromptData(value) {
  const workflow = creativeWorkflowDefinition(value);
  const promptRoot = resolvePromptsRootSync();
  let card = FALLBACK_CARD;
  try {
    card = fs.readFileSync(path.join(promptRoot, workflow.file), 'utf8').trim();
  } catch {}

  return {
    creative_workflow_id: workflow.id,
    creative_workflow_label: workflow.label,
    creative_workflow_role: workflow.role,
    creative_workflow_summary: workflow.summary,
    creative_workflow_prompt_card: card,
  };
}
