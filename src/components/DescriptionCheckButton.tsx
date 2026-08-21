import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { ScanSearch, Loader2 } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { checkDescriptions } from '@/lib/descriptionCheck';
import { type BridgeKind } from '@/lib/bridgeDescription';
import { TOOLBAR_BTN } from '@/components/prompt/toolbarStyles';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

/**
 * Reads a subject's Player-Facing and AI-Facing descriptions against each other and reports where they
 * disagree — and only reports. Nothing here writes to either field.
 *
 * It exists because the two ✨ buttons draft each description from the other, with no field in that graph
 * that nothing writes into. The player-facing prompt withholds by design and the AI-facing one invents by
 * design, so drafting one from the other and back swaps the author's facts for a model's inferences. The
 * one finding an author cannot get by re-reading either text is whether that has already happened.
 *
 * Findings land in a dialog rather than a toast: a toast cannot be re-read, takes no focus, and times out
 * while it is still being listened to.
 */
const DescriptionCheckButton = ({ playerText, aiText, kind, subjectName }: {
  playerText: string | undefined;
  aiText: string | undefined;
  kind: BridgeKind;
  /** The subject's own name, for the dialog title — so a reader arriving at the results knows whose. */
  subjectName?: string;
}) => {
  const {
    activeEndpointUrl, activeApiToken, activeModelName, descCheckPrompt, descMaxTokens,
  } = useSettings();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [findings, setFindings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight check if the editor switches items (managers remount per id).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Both sides are needed to compare them: a subject with only one description written has nothing to
  // disagree with itself about yet.
  const player = playerText?.trim();
  const ai = aiText?.trim();
  const ready = !!player && !!ai;

  const run = async () => {
    if (!ready || loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const result = await checkDescriptions(player, ai, kind, {
        endpointUrl: activeEndpointUrl,
        apiToken: activeApiToken,
        modelName: activeModelName,
        template: descCheckPrompt,
        maxTokens: descMaxTokens.desccheck,
        signal: controller.signal,
      });
      setFindings(result);
      setOpen(true);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      toast.error('Failed to check the descriptions.');
    } finally {
      setLoading(false);
    }
  };

  // Said in the dialog's own description, so the count reaches a screen reader on open rather than being
  // left to be counted off the list.
  const summary = findings.length === 0
    ? 'The two descriptions agree.'
    : `${findings.length} ${findings.length === 1 ? 'thing' : 'things'} to look at. Nothing has been changed.`;

  const title = subjectName ? `Description check — ${subjectName}` : 'Description check';

  return (
    <>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={run}
        disabled={loading || !ready}
        title={
          loading ? 'Checking the descriptions…'
            : ready ? 'Check the two descriptions against each other'
              : 'Needs both a Player-Facing and an AI-Facing description'
        }
        aria-label="Check the two descriptions against each other"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          {findings.length > 0 && (
            <ul className="list-disc space-y-2 pl-5 text-body max-h-[50vh] overflow-y-auto">
              {findings.map((finding, i) => <li key={i}>{finding}</li>)}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DescriptionCheckButton;
