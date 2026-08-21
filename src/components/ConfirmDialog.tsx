import { type ReactNode } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog"
import { useClosingSnapshot } from "@/lib/useClosingSnapshot"

/**
 * Yes/no confirmation prompt wrapping the Radix `AlertDialog`. Works controlled (`open`/`onOpenChange`)
 * or trigger-driven (pass `children` as the trigger); both `onConfirm`/`onCancel` are optional.
 */
export function ConfirmDialog({
  title = "Are you sure?",
  description = "This action cannot be undone.",
  icon,
  onConfirm,
  onCancel,
  children,
  open,
  onOpenChange,
  confirmLabel = "Confirm",
}: {
  title?: ReactNode
  description?: ReactNode
  /** Icon beside the title, matching the menu item that opened this. */
  icon?: ReactNode
  onConfirm?: () => void
  onCancel?: () => void
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Wording on the action button. A verb naming what happens reads better than "Confirm" on a dialog
   *  that is not asking about deletion — and is what a screen reader announces on focus. */
  confirmLabel?: string
}) {
  const handleConfirm = () => {
    onConfirm?.()
  }

  const handleCancel = () => {
    onCancel?.()
  }

  // Hold the title/description shown while open so a controlled dialog keeps them through its fade-out, even
  // as the parent clears the state that drove them (e.g. `pendingDelete?.name` going undefined on close).
  const shown = useClosingSnapshot(open, { title, description, icon, confirmLabel })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={shown.icon ? "flex items-center gap-2" : undefined}>
            {shown.icon}{shown.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {shown.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>{shown.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
