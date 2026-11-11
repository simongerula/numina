"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { BudgetCategory, BudgetCategoryKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PALETTE = [
  "#4f46e5", "#10b981", "#f59e0b", "#8b5cf6", "#f97316", "#ec4899", "#06b6d4", "#84cc16",
];

/**
 * Add / archive / restore categories for one kind ("expense" or "other").
 * Categories arrive as server data; archiving keeps entry history.
 */
export function CategoryManager({
  kind,
  categories,
  archived,
  open,
  onOpenChange,
}: {
  kind: BudgetCategoryKind;
  categories: BudgetCategory[];
  archived: BudgetCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const trimmed = name.trim();
    if (busy || !trimmed) return;
    setBusy(true);
    const res = await fetch("/api/budget/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, name: trimmed, color }),
    });
    setBusy(false);
    if (res.ok) {
      setName("");
      router.refresh();
    }
  };

  const archive = async (id: string) => {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/budget/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  };

  const restore = async (id: string) => {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/budget/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{kind === "expense" ? "Expense" : "Other"} categories</DialogTitle>
          <DialogDescription>
            Add a category, or archive one you no longer use. Archived categories keep their history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`cat-name-${kind}`}>New category</Label>
            <Input
              id={`cat-name-${kind}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
                if (e.key === "Escape") onOpenChange(false);
              }}
              placeholder={kind === "expense" ? "Rent, power…" : "Coffee, clothes…"}
              maxLength={60}
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Use color ${c}`}
                  aria-pressed={color === c}
                  className={cn(
                    "size-6 rounded-full border-2 transition-transform",
                    color === c ? "scale-110 border-foreground" : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={add} disabled={busy || !name.trim()}>
              <Plus /> Add
            </Button>
          </div>

          <div className="space-y-1 border-t pt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Categories</p>
            {categories.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
            <ul className="space-y-1">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="truncate">{c.name}</span>
                  <button
                    onClick={() => archive(c.id)}
                    disabled={busy}
                    className="ml-auto rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-accent hover:text-destructive disabled:opacity-40"
                    aria-label={`Archive ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            {archived.length > 0 && (
              <ul className="mt-2 space-y-1 border-t pt-2">
                <p className="mb-1 text-xs text-muted-foreground">Archived</p>
                {archived.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full opacity-50" style={{ backgroundColor: c.color }} />
                    <span className="truncate">{c.name}</span>
                    <button
                      onClick={() => restore(c.id)}
                      disabled={busy}
                      className="ml-auto rounded-md p-1.5 transition hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label={`Restore ${c.name}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
