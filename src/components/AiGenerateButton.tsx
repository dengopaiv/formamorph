import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Sparkles, Loader2 } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { summarizeDescription } from '@/lib/summarize';
import { bridgeDescription, type BridgeKind } from '@/lib/bridgeDescription';
import { buildImagePrompt, type ImageSubjectKind } from '@/lib/imagePrompt';
import { TOOLBAR_BTN } from '@/components/prompt/toolbarStyles';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { overwriteWarning } from '@/lib/descriptionOverwrite';
import { Tip } from '@/components/ui/tooltip';

type GenerateMode = 'summary' | 'tags' | 'playerDesc' | 'aiDesc';

const NOUN: Record<GenerateMode, string> = {
  summary: 'summary',
  tags: 'image tags',
  playerDesc: 'player-facing description',
  aiDesc: 'AI-facing description',
};

const SOURCE_NOUN: Record<GenerateMode, string> = {
  summary: 'the description',
  tags: 'the description',
  playerDesc: 'the AI-facing description',
  aiDesc: 'the player-facing description',
};

/**
 * The field each mode writes into, named as its label reads in the editor — the wording an overwrite
 * warning is built from. `tags` is deliberately absent: an image-tag list is not prose, so a sentence
 * count says nothing useful about it, and it is not part of the description graph the warning guards.
 */
const TARGET_LABEL: Partial<Record<GenerateMode, string>> = {
  summary: 'AI-Facing Summary',
  playerDesc: 'Player-Facing Description',
  aiDesc: 'AI-Facing Description',
};

/**
 * Fills a text field from the connected LLM. `mode` picks the generator — 'summary' condenses the
 * AI-Facing Description, 'tags' writes booru image tags from a description, and 'playerDesc'/'aiDesc'
 * rewrite one description into the other. `source` is the text fed in; the result goes out through
 * `onChange`, so undo belongs to whatever field owns the value.
 */
const AiGenerateButton = ({ mode, source, onChange, kind, target }: {
  mode: GenerateMode;
  source: string | undefined;
  onChange: (v: string) => void;
  kind?: ImageSubjectKind; // tags/playerDesc/aiDesc: subject kind
  /** The destination field's current text. Supplied so a generation that would *replace* authored writing
   *  asks first — the two descriptions generate into each other, and a round trip through both silently
   *  swaps what the author wrote for what a model inferred. Absent or empty = nothing to lose, no dialog. */
  target?: string;
}) => {
  const {
    activeEndpointUrl, activeApiToken, activeModelName, imageTagPrompt,
    playerDescPrompt, aiDescPrompt, aiSummaryPrompt, descMaxTokens,
  } = useSettings();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight request if the editor switches items (managers remount per id).
  useEffect(() => () => abortRef.current?.abort(), []);

  const noun = NOUN[mode];

  const generate = async () => {
    const text = source?.trim();
    if (!text || loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const opts = { endpointUrl: activeEndpointUrl, apiToken: activeApiToken, modelName: activeModelName, signal: controller.signal };
      const bridgeKind: BridgeKind = kind === 'location' ? 'location' : 'character';
      const result = mode === 'tags'
        // The subject's name is deliberately not sent: models answer with it as a tag, and no image model
        // knows a person's name. An author who wants one in the tags can type it.
        ? await buildImagePrompt({ description: text, kind: kind ?? 'character' }, { ...opts, tagPrompt: imageTagPrompt })
        : mode === 'summary'
          ? await summarizeDescription(text, { ...opts, template: aiSummaryPrompt, maxTokens: descMaxTokens.aisummary })
          : await bridgeDescription(text, mode, bridgeKind, {
            ...opts,
            template: mode === 'playerDesc' ? playerDescPrompt : aiDescPrompt,
            maxTokens: mode === 'playerDesc' ? descMaxTokens.playerdesc : descMaxTokens.aidesc,
          });
      onChange(result);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      toast.error(`Failed to generate ${noun}.`);
    } finally {
      setLoading(false);
    }
  };

  // Null whenever the write cannot destroy anything — an empty target, or a mode with no prose target —
  // so the ordinary first draft is still one click and only a replacement is interrupted.
  const targetLabel = TARGET_LABEL[mode];
  const warning = targetLabel ? overwriteWarning(target, targetLabel) : null;

  return (
    <>
      <Tip tip={loading ? `Generating ${noun}…` : `Generate ${noun} from ${SOURCE_NOUN[mode]}`}>
        <button
          type="button"
          className={TOOLBAR_BTN}
          onClick={() => (warning ? setConfirming(true) : generate())}
          disabled={loading || !source?.trim()}
          aria-label={`Generate ${noun}`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </button>
      </Tip>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Replace the ${targetLabel}?`}
        description={warning ?? ''}
        confirmLabel="Replace"
        onConfirm={generate}
      />
    </>
  );
};

export default AiGenerateButton;
