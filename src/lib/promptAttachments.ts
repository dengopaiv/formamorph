import type { AIRequestType } from '@/types';

/** Per-request Include Attachments flags a preset may carry. Nothing sends attachments any more; the flags stay as
 *  preset data, so a preset that has them still loads and shares unchanged. */
export type PromptAttachmentsMap = Partial<Record<AIRequestType, boolean>>;

/** The prompts a stored flag may name: the ones whose turn pass sends the player action. */
export const ATTACHMENT_PROMPTS: ReadonlySet<AIRequestType> = new Set<AIRequestType>([
  'narration', 'thinking', 'director', 'character', 'storyboard',
  'choices', 'statUpdates', 'locationChange', 'entityLocation', 'timePassed', 'summary',
]);

/** Keeps only boolean flags for prompts a flag may name. */
export function sanitizePromptAttachments(raw: unknown): PromptAttachmentsMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: PromptAttachmentsMap = {};
  for (const [kind, flag] of Object.entries(raw as Record<string, unknown>)) {
    if (ATTACHMENT_PROMPTS.has(kind as AIRequestType) && typeof flag === 'boolean') out[kind as AIRequestType] = flag;
  }
  return Object.keys(out).length ? out : undefined;
}
