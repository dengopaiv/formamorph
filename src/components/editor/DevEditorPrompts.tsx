import { useState } from 'react';
import { CodeRenameDialog } from '@/components/editor/CodeRenameOffer';
import { ReplaceAllConfirm } from '@/components/editor/EditorFindBar';
import { ChangedElsewhereDialog } from '@/components/editor/ChangedElsewhereDialog';
import type { CodeRenamePlan } from '@/lib/statCodeRename';


const PLAN: CodeRenamePlan = {
  root: 'stats',
  oldName: 'Hunger',
  newName: 'Appetite',
  edits: [
    { home: { kind: 'stat', statId: 'dev-stamina' }, name: 'Stamina', scripts: {} },
    { home: { kind: 'stat', statId: 'dev-mood' }, name: 'Mood', scripts: {} },
  ],
  references: 3,
};

/** DEV: the questions an edit asks partway through, raised on canned text. Every answer closes it and writes nothing. */
export function DevEditorPrompts({ modal }: { modal: string | undefined }) {
  const [done, setDone] = useState(false);
  const close = () => setDone(true);
  if (done) return null;
  if (modal === 'codeRename') return <CodeRenameDialog open plan={PLAN} onApply={close} onSettle={close} />;
  if (modal === 'savedElsewhere' || modal === 'deletedElsewhere') {
    return <ChangedElsewhereDialog change={modal === 'savedElsewhere' ? 'saved' : 'deleted'} onLeave={close} onKeepMine={close} />;
  }
  if (modal === 'replaceAll') {
    return (
      <ReplaceAllConfirm
        open onOpenChange={(open) => { if (!open) close(); }}
        count={23} fields={9} skipped={0} missingChip="a chip" onConfirm={close}
      />
    );
  }
  return null;
}
