import { FileUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function UploadSlotCard({
  questionKey,
  status,
  disabled = false,
}: {
  questionKey: string;
  status: "pending" | "uploaded" | "blank_placeholder" | "missing";
  disabled?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-4 shadow-none">
      <div>
        <p className="text-sm font-semibold text-[var(--ink)]">Question {questionKey}</p>
        <p className="text-sm text-[var(--muted)]">Status: {status.replace("_", " ")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={disabled}>
          <FileUp size={16} aria-hidden="true" />
          Upload PDF
        </Button>
        <Button type="button" variant="ghost" disabled={disabled}>
          <Square size={16} aria-hidden="true" />
          Submit blank
        </Button>
      </div>
    </Card>
  );
}
