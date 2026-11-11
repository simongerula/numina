"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { BudgetCategory, BudgetCategoryKind, BudgetEntry, BudgetEntryKind } from "@/lib/types";
import { centsFromInput, formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { Button } from "@/components/ui/button";
import { CategoryManager } from "@/components/budgeting/category-manager";

const KIND_LABEL: Record<BudgetEntryKind, string> = {
  income: "Income",
  expense: "Expenses",
  other: "Other",
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Default add-row date: today inside the current month, else the 1st of the selected one. */
function defaultDate(period: string): string {
  return period === today().slice(0, 7) ? today() : `${period}-01`;
}

interface Draft {
  date: string;
  category_id: string;
  note: string;
  amount: string; // dollars as typed
}

/**
 * One budgeting table (income, expenses, or other): add-row on top,
 * click-to-edit rows, per-row delete. Income is free text (no category);
 * expense/other pick from their own category pool, managed in a dialog.
 */
export function BudgetTable({
  kind,
  period,
  entries,
  categories,
  archivedCategories,
}: {
  kind: BudgetEntryKind;
  period: string;
  entries: BudgetEntry[];
  categories: BudgetCategory[];
  archivedCategories: BudgetCategory[];
}) {
  const router = useRouter();
  const { hidden } = useBalancesHidden();
  const hasCategory = kind !== "income";

  const [catOpen, setCatOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const [newDraft, setNewDraft] = useState<Draft>({ date: defaultDate(period), category_id: "", note: "", amount: "" });

  const visible = useMemo(
    () => entries.filter((e) => e.kind === kind && e.date.startsWith(period)),
    [entries, kind, period]
  );

  const categoryFor = (e: BudgetEntry) =>
    categories.find((c) => c.id === e.category_id) ??
    (e.category_id
      ? { id: e.category_id, kind: kind as BudgetCategoryKind, name: e.category_name ?? "(archived)", color: e.category_color ?? "#94a3b8", sort_order: 0 }
      : null);

  // Editing an entry may reference a category not in the active pool
  // (archived since the entry was made) — keep it selectable for history edits.
  const pickerCategories = useMemo(() => {
    const used = new Set(
      entries.filter((e) => e.kind === kind).map((e) => e.category_id).filter(Boolean)
    );
    const extras = archivedCategories.filter((c) => used.has(c.id));
    return [...categories, ...extras];
  }, [categories, archivedCategories, entries, kind]);

  const startEdit = (e: BudgetEntry) => {
    setEditingId(e.id);
    setDraft({
      date: e.date,
      category_id: e.category_id ?? "",
      note: e.note,
      amount: (e.amount_cents / 100).toString(),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const body = (d: Draft) => ({
    kind,
    date: d.date,
    category_id: hasCategory ? d.category_id : null,
    amount: centsFromInput(d.amount),
    note: d.note.trim(),
  });

  const commitMutation = async (init: RequestInit, id?: string) => {
    setBusy(true);
    const res = await fetch("/api/budget/entries" + (id ? `/${id}` : ""), {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    setBusy(false);
    return res.ok;
  };

  const commitEdit = async () => {
    if (!draft || !editingId || busy) return;
    if (hasCategory && !draft.category_id) return;
    if (body(draft).amount === null) return;
    const ok = await commitMutation({ method: "PATCH", body: JSON.stringify(body(draft)) }, editingId);
    if (ok) {
      cancelEdit();
      router.refresh();
    }
  };

  const addRow = async () => {
    if (busy) return;
    if (hasCategory && !newDraft.category_id) return;
    if (body(newDraft).amount === null) return;
    const ok = await commitMutation({ method: "POST", body: JSON.stringify(body(newDraft)) });
    if (ok) {
      setNewDraft({ date: defaultDate(period), category_id: newDraft.category_id, note: "", amount: "" });
      router.refresh();
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/budget/entries/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
  };

  const editingCell = (field: keyof Draft) =>
    ({
      value: draft?.[field] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setDraft((d) => (d ? { ...d, [field]: e.target.value } : d)),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter") commitEdit();
        if (e.key === "Escape") cancelEdit();
      },
    }) as const;

  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{KIND_LABEL[kind]}</h2>
        {hasCategory && (
          <Button variant="ghost" size="sm" onClick={() => setCatOpen(true)}>
            <SlidersHorizontal /> Categories
          </Button>
        )}
      </header>

      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="sticky top-0 z-10 bg-card px-5 py-2 font-medium">Date</th>
              <th className="sticky top-0 z-10 bg-card px-2 py-2 font-medium">
                {hasCategory ? "Category" : "Description"}
              </th>
              <th className="sticky top-0 z-10 bg-card px-2 py-2 text-right font-medium">Amount</th>
              {hasCategory && <th className="sticky top-0 z-10 bg-card px-2 py-2 font-medium">Note</th>}
              <th className="sticky top-0 z-10 w-10 bg-card px-2" aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {/* New entry row */}
            <tr className="border-b border-l-[3px] border-l-primary/70 bg-muted">
              <td className="sticky top-[36px] z-[5] bg-muted px-5 py-2">
                <input
                  type="date"
                  value={newDraft.date}
                  onChange={(e) => setNewDraft((d) => ({ ...d, date: e.target.value }))}
                  className="w-32 bg-transparent text-sm outline-none"
                  aria-label={`New ${kind} date`}
                />
              </td>
              {hasCategory ? (
                <td className="sticky top-[36px] z-[5] bg-muted px-2 py-2">
                  <select
                    value={newDraft.category_id}
                    onChange={(e) => setNewDraft((d) => ({ ...d, category_id: e.target.value }))}
                    className="w-32 appearance-none bg-transparent text-sm outline-none disabled:opacity-40"
                    disabled={categories.length === 0}
                    aria-label={`New ${kind} category`}
                  >
                    <option value="">Select…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </td>
              ) : (
                <td className="sticky top-[36px] z-[5] bg-muted px-2 py-2">
                  <input
                    placeholder="Description…"
                    value={newDraft.note}
                    onChange={(e) => setNewDraft((d) => ({ ...d, note: e.target.value }))}
                    className="w-40 outline-none"
                    aria-label="New income description"
                  />
                </td>
              )}
              <td className="sticky top-[36px] z-[5] bg-muted px-2 py-2 text-right">
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newDraft.amount}
                  onChange={(e) => setNewDraft((d) => ({ ...d, amount: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addRow();
                  }}
                  className="w-24 text-right tabular-nums outline-none"
                  aria-label={`New ${kind} amount`}
                />
              </td>
              {hasCategory && (
                <td className="sticky top-[36px] z-[5] bg-muted px-2 py-2">
                  <input
                    placeholder="Note…"
                    value={newDraft.note}
                    onChange={(e) => setNewDraft((d) => ({ ...d, note: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addRow();
                      if (e.key === "Escape") setNewDraft({ date: defaultDate(period), category_id: "", note: "", amount: "" });
                    }}
                    maxLength={300}
                    className="w-40 outline-none"
                    aria-label={`New ${kind} note`}
                  />
                </td>
              )}
              <td className="sticky top-[36px] z-[5] bg-muted px-2 py-1.5">
                <button
                  onClick={addRow}
                  disabled={busy || !newDraft.amount || (hasCategory && !newDraft.category_id)}
                  className={cn(
                    "rounded-md p-1 transition disabled:opacity-40",
                    newDraft.amount && (!hasCategory || newDraft.category_id)
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  aria-label={`Add ${kind} entry`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </td>
            </tr>

            {visible.map((e) => {
              const editing = editingId === e.id;
              const category = categoryFor(e);
              return (
                <tr key={e.id} className={cn("border-b", editing && "bg-accent/40")}>
                  {editing ? (
                    <>
                      <EditableCell>
                        <input type="date" className="w-32 bg-transparent text-sm outline-none" {...editingCell("date")} />
                      </EditableCell>
                      <EditableCell>
                        {hasCategory ? (
                          <select
                            value={draft?.category_id ?? ""}
                            onChange={(ev) => setDraft((d) => (d ? { ...d, category_id: ev.target.value } : d))}
                            className="w-32 appearance-none bg-transparent text-sm outline-none"
                            aria-label="Edit category"
                          >
                            <option value="">Select…</option>
                            {pickerCategories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input className="w-40 outline-none" maxLength={300} {...editingCell("note")} autoFocus />
                        )}
                      </EditableCell>
                      <EditableCell align="right">
                        <input
                          inputMode="decimal"
                          className="w-24 text-right tabular-nums outline-none"
                          {...editingCell("amount")}
                          autoFocus={hasCategory}
                        />
                      </EditableCell>                      {hasCategory && (
                        <EditableCell>
                          <input className="w-40 outline-none" maxLength={300} {...editingCell("note")} />
                        </EditableCell>
                      )}
                      <td className="px-2 py-1.5">
                        <button
                          onClick={commitEdit}
                          disabled={busy}
                          className="rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-accent disabled:opacity-40"
                        >
                          Save
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <EditableTd onEdit={() => startEdit(e)}>{formatDate(e.date)}</EditableTd>
                      <EditableTd onEdit={() => startEdit(e)}>
                        {hasCategory ? (
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category?.color ?? "#94a3b8" }} />
                            {category?.name ?? "Uncategorized"}
                          </span>
                        ) : (
                          <span className="max-w-48 truncate">{e.note || "—"}</span>
                        )}
                      </EditableTd>
                      <EditableTd
                        onEdit={() => startEdit(e)}
                        className={cn(
                          "text-right tabular-nums",
                          kind === "income" && "text-emerald-600",
                          kind !== "income" && "text-red-600"
                        )}
                      >
                        {formatMoney(e.amount_cents, hidden)}
                      </EditableTd>
                      {hasCategory && (
                        <EditableTd onEdit={() => startEdit(e)} className="max-w-48 truncate text-muted-foreground">
                          {e.note || "—"}
                        </EditableTd>
                      )}
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => remove(e.id)}
                          disabled={busy}
                          className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-accent hover:text-destructive disabled:opacity-40"
                          aria-label={`Delete ${e.date} ${kind} entry`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}

            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={hasCategory ? 5 : 4}
                  className="px-5 py-10 text-center text-sm text-muted-foreground"
                >
                  Nothing {kind === "income" ? "earned" : "spent"} in {period}. Add an entry above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasCategory && (
        <CategoryManager
          kind={kind}
          categories={categories}
          archived={archivedCategories}
          open={catOpen}
          onOpenChange={setCatOpen}
        />
      )}
    </section>
  );
}

function EditableTd({
  children,
  onEdit,
  className,
}: {
  children: React.ReactNode;
  onEdit: () => void;
  className?: string;
}) {
  return (
    <td
      onClick={onEdit}
      className={cn("cursor-pointer px-2 py-2 transition-colors hover:bg-accent/50", className)}
      title="Click to edit"
    >
      {children}
    </td>
  );
}

function EditableCell({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn("px-2 py-1.5 focus-within:bg-background/60 focus-within:ring-1 focus-within:ring-ring/40", className)}
      style={{ textAlign: align === "right" ? "right" : "left" }}
    >
      {children}
    </td>
  );
}
