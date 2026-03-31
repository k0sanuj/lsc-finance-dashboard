"use client";

import { updateDeliverableItemStatusAction } from "../commercial-goals/actions";
import { FormButton } from "../documents/form-button";

type Props = {
  itemId: string;
  currentStatus: string;
  returnPath: string;
};

function nextStatus(current: string): string | null {
  if (current === "pending") return "in_progress";
  if (current === "in_progress") return "completed";
  return null;
}

function nextLabel(current: string): string {
  if (current === "pending") return "Start";
  if (current === "in_progress") return "Complete";
  return "";
}

export function DeliverableStatusUpdater({ itemId, currentStatus, returnPath }: Props) {
  const next = nextStatus(currentStatus);
  if (!next) return null;

  return (
    <form action={updateDeliverableItemStatusAction} className="inline-actions">
      <input name="itemId" type="hidden" value={itemId} />
      <input name="newStatus" type="hidden" value={next} />
      <input name="returnPath" type="hidden" value={returnPath} />
      <FormButton
        label={nextLabel(currentStatus)}
        pendingLabel="Updating..."
        variant="secondary"
      />
    </form>
  );
}
