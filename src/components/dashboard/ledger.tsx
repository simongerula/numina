"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { Account, Movement } from "@/lib/types";
import { formatDate, formatPeriod, formatMoney } from "@/lib/format";
import { currentPeriod } from "@/lib/series";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
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

interface Draft {
  date: string;
  account_id: string;
  type: Movement["type"];
  amount: string; // dollars as typed
  note: string;
}

const TYPES = ["deposit", "withdraw", "adjustment"] as const;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function centsFromInput(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  const cents = Math.round(n * 100);
  return Math.abs(n * 100 - cents) > 1e-6 ? null : cents; // reject > 2dp
}

/** Excel-like inline-editable ledger: Period | Date | Account | Type | Amount | Note */
export function Ledger({ accounts, movements }: { accounts: Account[]; movements: Movement[] }) {
  const router = useRouter();
  const { hidden } = useBalancesHidden();

  const periods = useMemo(() => {
    const set = new Set(movements.map((m) => m.date.slice(0, 7)));
    set.add(currentPeriod());
    return Array.from(set).sort().reverse();
  }, [movements]);

  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  // New-row draft
  const [newDraft, setNewDraft] = useState<Draft>({
    date: today(),
    account_id: "",
    type: "deposit",
    amount: "",
    note: "",
  });

  // "Set new balance" helper for adjustments in the new row
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [newTotal, setNewTotal] = useState("");

  const selectedAccount = accounts.find((a) => a.id === newDraft.account_id);
  const newTotalCents = centsFromInput(newTotal);
  const computedAdjustment = selectedAccount && newTotalCents !== null ? newTotalCents - selectedAccount.balance : null;

  const visible = movements.filter(
    (m) =>
      (filterPeriod === "all" || m.date.startsWith(filterPeriod)) &&
      (filterAccount === "all" || m.account_id === filterAccount)
  );

  const startEdit = (m: Movement) => {
    const dollars = (Math.abs(m.amount_cents) / 100).toString();
    setEditingId(m.id);
    setDraft({
      date: m.date,
      account_id: m.account_id,
      type: m.type,
      amount: m.type === "adjustment" && m.amount_cents < 0 ? `-${dollars}` : dollars,
      note: m.note,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const commitMutation = async (init: RequestInit) => {
    setBusy(true);
    const res = await fetch("/api/movements" + (init.method === "PATCH" ? `/${editingId}` : ""), {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    setBusy(false);
    if (res.ok) {
      cancelEdit();
      router.refresh();
    }
  };

  const commitEdit = async () => {
    if (!draft || !editingId || busy) return;
    const cents = centsFromInput(draft.amount);
    if (cents === null || !draft.account_id) return;
    await commitMutation({
      method: "PATCH",
      body: JSON.stringify({
        account_id: draft.account_id,
        date: draft.date,
        type: draft.type,
        amount: cents,
        note: draft.note.trim(),
      }),
    });
  };

  const addRow = async () => {
    if (busy || !newDraft.account_id) return;
    const cents = centsFromInput(newDraft.amount);
    if (cents === null) return;
    setBusy(true);
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: newDraft.account_id,
        date: newDraft.date,
        type: newDraft.type,
        amount: cents,
        note: newDraft.note.trim(),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setNewDraft({ date: today(), account_id: newDraft.account_id, type: "deposit", amount: "", note: "" });
      router.refresh();
    }
  };

  const confirmAdjust = () => {
    if (!selectedAccount || newTotalCents === null) return;
    const diff = newTotalCents - selectedAccount.balance;
    if (diff === 0) {
      setNewTotal("");
      setAdjustOpen(false);
      return;
    }
    setNewDraft((d) => ({ ...d, type: "adjustment", amount: (diff / 100).toString() }));
    setNewTotal("");
    setAdjustOpen(false);
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/movements/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
  };

  const editingCell = (field: keyof Draft, extra?: (v: string) => string) =>
    ({
      value: draft?.[field] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setDraft((d) => (d ? { ...d, [field]: (extra ?? ((v: string) => v))(e.target.value) } : d)),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter") commitEdit();
        if (e.key === "Escape") cancelEdit();
      },
      "aria-label": field,
    }) as const;

  if (accounts.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-5 text-sm text-muted-foreground shadow-sm">
        Create an account first — then your ledger will appear here.
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:pr-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Ledger</h2>
        <div className="flex gap-2 sm:gap-3">
          <LedgerSelect
            variant="filter"
            aria-label="Filter by period"
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
          >
            <option value="all">All periods</option>
            {periods.map((p) => (
              <option key={p} value={p}>{formatPeriod(p)}</option>
            ))}
          </LedgerSelect>
          <LedgerSelect
            variant="filter"
            aria-label="Filter by account"
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </LedgerSelect>
        </div>
      </header>

      <div className="max-h-[465px] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="sticky top-0 z-10 bg-card px-5 py-2 font-medium">Period</th>
              <th className="sticky top-0 z-10 bg-card px-2 py-2 font-medium">Date</th>
              <th className="sticky top-0 z-10 bg-card px-2 py-2 font-medium">Account</th>
              <th className="sticky top-0 z-10 bg-card px-2 py-2 font-medium">Type</th>
              <th className="sticky top-0 z-10 bg-card px-2 py-2 text-right font-medium">Amount</th>
              <th className="sticky top-0 z-10 bg-card px-2 py-2 font-medium">Note</th>
              <th className="sticky top-0 z-10 w-10 bg-card px-2" aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {/* New entry row */}
            <tr className="border-b border-l-[3px] border-l-primary/70 bg-muted">
              <td className="sticky top-[36px] z-[5] whitespace-nowrap bg-muted px-5 py-2 text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold uppercase leading-none tracking-wide text-primary">
                    New
                  </span>
                  {formatPeriod(newDraft.date.slice(0, 7))}
                </span>
              </td>
              <LedgerCell editing className="sticky top-[36px] z-[5] bg-muted">
                <input
                  type="date"
                  value={newDraft.date}
                  onChange={(e) => setNewDraft((d) => ({ ...d, date: e.target.value }))}
                  className="w-32 bg-transparent text-sm outline-none"
                  aria-label="New date"
                />
              </LedgerCell>
              <LedgerCell editing className="sticky top-[36px] z-[5] bg-muted">
                <LedgerSelect
                  className="w-28"
                  value={newDraft.account_id}
                  onChange={(e) => setNewDraft((d) => ({ ...d, account_id: e.target.value }))}
                  aria-label="New account"
                >
                  <option value="">Select…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </LedgerSelect>
              </LedgerCell>
              <LedgerCell editing className="sticky top-[36px] z-[5] bg-muted">
                <LedgerSelect
                  className="w-24 capitalize"
                  value={newDraft.type}
                  disabled={!newDraft.account_id}
                  onChange={(e) => {
                    const type = e.target.value as Draft["type"];
                    if (type === "adjustment" && newDraft.account_id) {
                      setAdjustOpen(true);
                      setNewTotal("");
                    }
                    setNewDraft((d) => ({ ...d, type }));
                  }}
                  aria-label="New type"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">{t}</option>
                  ))}
                </LedgerSelect>
              </LedgerCell>
              <LedgerCell editing align="right" className="sticky top-[36px] z-[5] bg-muted">
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newDraft.amount}
                  onChange={(e) => setNewDraft((d) => ({ ...d, amount: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addRow();
                  }}
                  className="w-24 text-right tabular-nums outline-none"
                  aria-label="New amount"
                />
              </LedgerCell>
              <LedgerCell editing className="sticky top-[36px] z-[5] bg-muted">
                <input
                  placeholder="Note…"
                  value={newDraft.note}
                  onChange={(e) => setNewDraft((d) => ({ ...d, note: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addRow();
                    if (e.key === "Escape") setNewDraft({ date: today(), account_id: "", type: "deposit", amount: "", note: "" });
                  }}
                  maxLength={300}
                  className="w-40 outline-none"
                  aria-label="New note"
                />
              </LedgerCell>
              <td className="sticky top-[36px] z-[5] bg-muted px-2 py-1.5">
                <button
                  onClick={addRow}
                  disabled={busy || !newDraft.amount || !newDraft.account_id}
                  className={cn(
                    "rounded-md p-1 transition disabled:opacity-40",
                    newDraft.amount && newDraft.account_id
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  aria-label="Add movement"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </td>
            </tr>

            {visible.map((m) => {
              const editing = editingId === m.id;
              return (
                <tr key={m.id} className={cn("border-b", editing && "bg-accent/40")}>
                  <td className="px-5 py-1.5 text-muted-foreground tabular-nums">
                    {formatPeriod(m.date.slice(0, 7))}
                  </td>
                  {editing ? (
                    <>
                      <LedgerCell editing>
                        <input type="date" className="w-32 bg-transparent text-sm outline-none" {...editingCell("date")} />
                      </LedgerCell>
                      <LedgerCell editing>
                        <LedgerSelect className="w-28" {...editingCell("account_id")}>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </LedgerSelect>
                      </LedgerCell>
                      <LedgerCell editing>
                        <LedgerSelect className="w-24 capitalize" {...editingCell("type")}>
                          {TYPES.map((t) => (
                            <option key={t} value={t} className="capitalize">{t}</option>
                          ))}
                        </LedgerSelect>
                      </LedgerCell>
                      <LedgerCell editing align="right">
                        <AmountInput {...editingCell("amount")} autoFocus />
                      </LedgerCell>
                      <LedgerCell editing>
                        <input className="w-40 outline-none" maxLength={300} {...editingCell("note")} />
                      </LedgerCell>
                      <td className="px-2 py-1.5">
                        <button onClick={commitEdit} disabled={busy} className="rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-accent disabled:opacity-40">
                          Save
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <EditableTd onEdit={() => startEdit(m)}>{formatDate(m.date)}</EditableTd>
                      <EditableTd onEdit={() => startEdit(m)}>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.account_color }} />
                          {m.account_name}
                        </span>
                      </EditableTd>
                      <EditableTd onEdit={() => startEdit(m)} className="capitalize">{m.type}</EditableTd>
                      <EditableTd
                        onEdit={() => startEdit(m)}
                        className={cn(
                          "text-right tabular-nums",
                          m.amount_cents > 0 && "text-emerald-600",
                          m.amount_cents < 0 && "text-red-600"
                        )}
                      >
                        {formatMoney(m.amount_cents, hidden)}
                      </EditableTd>
                      <EditableTd onEdit={() => startEdit(m)} className="max-w-48 truncate text-muted-foreground">
                        {m.note || "—"}
                      </EditableTd>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => remove(m.id)}
                          disabled={busy}
                          className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-accent hover:text-destructive disabled:opacity-40"
                          aria-label={`Delete ${m.date} movement`}
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
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No movements match the filters. Add your first entry above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set new balance</DialogTitle>
            <DialogDescription>
              Enter the new total for {selectedAccount?.name ?? "the account"} and the adjustment will be calculated for
              you. Cancel to type a manual adjustment in the table instead.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmAdjust();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="adjust-new-total">New balance</Label>
              <Input
                id="adjust-new-total"
                inputMode="decimal"
                placeholder="0.00"
                value={newTotal}
                onChange={(e) => setNewTotal(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Current balance: {formatMoney(selectedAccount?.balance ?? 0, hidden)}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewTotal("");
                  setAdjustOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={computedAdjustment === null || computedAdjustment === 0}>
                Confirm
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * Select with a custom chevron. Native select arrows are pinned to the
 * element's edge, which visually crowds the card border; drawing our own
 * lets us control the spacing.
 */
function LedgerSelect({
  variant = "cell",
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { variant?: "filter" | "cell" }) {
  const isFilter = variant === "filter";
  return (
    <div
      className={cn(
        "relative inline-flex",
        isFilter && "h-9 rounded-md border border-input bg-background",
        className
      )}
    >
      <select
        {...props}
        className={cn(
          "h-full w-full appearance-none bg-transparent text-sm outline-none",
          isFilter ? "pl-3 pr-10" : "pl-0 pr-7",
          "disabled:cursor-not-allowed disabled:opacity-40",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
          isFilter ? "right-3" : "right-1"
        )}
      />
    </div>
  );
}

function LedgerCell({
  children,
  editing,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  editing?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn("px-2 py-1.5", editing && "focus-within:bg-background/60 focus-within:ring-1 focus-within:ring-ring/40", className)}
      style={{ textAlign: align === "right" ? "right" : "left" }}
    >
      {children}
    </td>
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
      className={cn(
        "cursor-pointer px-2 py-2 transition-colors hover:bg-accent/50",
        className
      )}
      title="Click to edit"
    >
      {children}
    </td>
  );
}

function AmountInput(props: React.ComponentProps<"input">) {
  return (
    <input
      inputMode="decimal"
      placeholder="0.00"
      className="w-24 text-right tabular-nums outline-none"
      {...props}
    />
  );
}
