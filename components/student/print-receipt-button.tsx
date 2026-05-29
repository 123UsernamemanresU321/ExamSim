"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReceiptButton({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="primary"
      onClick={() => window.print()}
      className={className}
    >
      <Printer size={16} className="mr-2" />
      Print Official Transcript
    </Button>
  );
}
