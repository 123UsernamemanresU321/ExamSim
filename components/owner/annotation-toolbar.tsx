"use client";

import { ArrowUpRight, Check, Circle, Eraser, Highlighter, MousePointer2, Pencil, Redo2, RotateCcw, Save, Square, StickyNote, Type, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnnotationTool } from "@/lib/annotation-model";

const tools: { value: AnnotationTool; label: string; icon: typeof MousePointer2 }[] = [
  { value: "select", label: "Select", icon: MousePointer2 },
  { value: "pen", label: "Pen", icon: Pencil },
  { value: "highlighter", label: "Highlighter", icon: Highlighter },
  { value: "text", label: "Text", icon: Type },
  { value: "tick", label: "Tick", icon: Check },
  { value: "cross", label: "Cross", icon: X },
  { value: "question", label: "Question", icon: StickyNote },
  { value: "rectangle", label: "Rectangle", icon: Square },
  { value: "circle", label: "Circle", icon: Circle },
  { value: "arrow", label: "Arrow", icon: ArrowUpRight },
  { value: "comment", label: "Comment pin", icon: StickyNote },
  { value: "eraser", label: "Eraser", icon: Eraser },
];

export function AnnotationToolbar({
  selectedTool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onGenerate,
  onRelease,
  saveDisabled,
}: {
  selectedTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onGenerate: () => void;
  onRelease: () => void;
  saveDisabled?: boolean;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      {tools.map((item) => {
        const Icon = item.icon;
        const active = selectedTool === item.value;
        return (
          <Button
            key={item.value}
            type="button"
            variant={active ? "primary" : "secondary"}
            className={cn("h-9 px-3 text-xs", active && "!text-white")}
            onClick={() => onToolChange(item.value)}
            title={item.label}
            aria-label={item.label}
          >
            <Icon size={15} />
            <span className="hidden xl:inline">{item.label}</span>
          </Button>
        );
      })}
      <div className="mx-1 h-8 w-px bg-slate-200" />
      <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={onUndo} disabled={!canUndo} title="Undo">
        <Undo2 size={15} />
      </Button>
      <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={onRedo} disabled={!canRedo} title="Redo">
        <Redo2 size={15} />
      </Button>
      <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={onSave} disabled={saveDisabled}>
        <Save size={15} /> Save
      </Button>
      <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={onGenerate}>
        <RotateCcw size={15} /> Generate PDF
      </Button>
      <Button type="button" className="h-9 px-3 text-xs !text-white" onClick={onRelease}>
        Release
      </Button>
    </div>
  );
}
