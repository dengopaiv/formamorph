import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The back control of a surface header, such as the World Editor's, on every layout. */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="shrink-0 border-transparent" onClick={onClick} aria-label="Back">
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}
