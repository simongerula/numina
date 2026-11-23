"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Check, CheckCircle2, Pencil, RotateCcw, Target, Trash2 } from "lucide-react";
import type { Account, SavingsGoal } from "@/lib/types";
import {
  goalEtaMonths,
  goalProgress,
  goalRemainingCents,
  goalSavedCents,
  type MonthlyInflow,
} from "@/lib/goals";
import { centsFromInput, formatDate, formatMoney } from "@/lib/format";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { useCurrency } from "@/hooks/useCurrency";
import { useGoalsVisible } from "@/hooks/useGoalsVisible";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PALETTE = [
  "#4f46e5", "#10b981", "#f59e0b", "#8b5cf6", "#f97316", "#ec4899", "#06b6d4", "#84cc16",
];

/**
 * Savings-goal cards under the monthly change strip. Progress is derived live
 * from the linked accounts' balances, weighted by each allocation (A 100%,
 * B 20% …). Each goal is a full-width panel; multiple goals snap-scroll
 * horizontally with pagination dots. Completing one archives it (restorable
 * from the archived dialog), and archived goals can also be deleted for good.
 * The card is always shown — an empty state invites the first goal.
 */
export function SavingsGoals({
  goals,
  completedGoals,
  accounts,
  monthlyInflow,
}: {
  goals: SavingsGoal[];
  completedGoals: SavingsGoal[];
  accounts: Account[];
  monthlyInflow: MonthlyInflow[];
}) {
  const router = useRouter();
  const { visible } = useGoalsVisible();
  const [createOpen, setCreateOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavingsGoal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<SavingsGoal | null>(null);
  const [panel, setPanel] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Hidden from Settings → the whole card disappears (data still loads).
  if (!visible) return null;

  // One full-width panel per goal; the track snaps between them.
  const current = Math.min(Math.max(panel, 0), Math.max(goals.length - 1, 0));

  const goTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(goals.length - 1, index));
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    setPanel(next);
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    setPanel(Math.max(0, Math.min(goals.length - 1, index)));
  };

  const patchGoal = async (id: string, body: object) => {
    setBusyId(id);
    const res = await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (res.ok) router.refresh();
  };

  const deleteGoal = async (id: string) => {
    setBusy(true);
    const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setDeleteTarget(null);
      router.refresh();
    }
  };

  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide">Savings goals</h2>
          <p className="text-xs text-muted-foreground">
            How close each goal is, based on the accounts that fund it
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={archivedOpen} onOpenChange={setArchivedOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Archived goals"
                  aria-label="Archived goals"
                >
                  <ArchiveRestore className="h-4 w-4" />
                </Button>
              }
            />
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Archived goals</DialogTitle>
                <DialogDescription>
                  Restore a completed goal to bring it back, or delete it for good.
                </DialogDescription>
              </DialogHeader>
              {completedGoals.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  No archived goals.
                </p>
              ) : (
                <ul className="max-h-64 divide-y overflow-y-auto">
                  {completedGoals.map((goal) => (
                    <li key={goal.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: goal.color }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{goal.name}</span>
                          {goal.completed_at && (
                            <span className="block text-xs text-muted-foreground">
                              Completed {formatDate(goal.completed_at.slice(0, 10))}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => patchGoal(goal.id, { completed: false })}
                          disabled={busyId !== null}
                          title={`Restore ${goal.name}`}
                          aria-label={`Restore ${goal.name}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground/60 hover:text-destructive"
                          onClick={() => setDeleteTarget(goal)}
                          disabled={busyId !== null}
                          title={`Delete ${goal.name}`}
                          aria-label={`Delete ${goal.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger
              render={
                <Button size="sm" disabled={accounts.length === 0} title={accounts.length === 0 ? "Add an account first" : undefined}>
                  New goal
                </Button>
              }
            />
            <NewGoalDialog
              accounts={accounts}
              onCreated={() => {
                setCreateOpen(false);
                router.refresh();
              }}
            />
          </Dialog>
        </div>
      </header>

      {goals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <div className="rounded-full bg-muted p-3">
            <Target className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No savings goals yet</p>
            <p className="text-sm text-muted-foreground">
              {accounts.length === 0
                ? "Add an account to draw from first, then create a goal."
                : "Set a target and fund it from your accounts — progress tracks itself."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={trackRef}
            onScroll={handleScroll}
            className="flex snap-x snap-mandatory overflow-x-auto"
          >
            {goals.map((goal) => (
              <div
                key={goal.id}
                role="group"
                aria-label={goal.name}
                className="w-full shrink-0 snap-start p-5"
              >
                <GoalCard
                  goal={goal}
                  monthlyInflow={monthlyInflow}
                  onComplete={() => patchGoal(goal.id, { completed: true })}
                  onEdit={() => setEditTarget(goal)}
                  onDelete={() => setDeleteTarget(goal)}
                  disabled={busyId !== null}
                />
              </div>
            ))}
          </div>
          {goals.length > 1 && (
            <div className="flex justify-center gap-1.5 pb-4" aria-hidden>
              {goals.map((goal, i) => (
                <button
                  key={goal.id}
                  onClick={() => goTo(i)}
                  tabIndex={-1}
                  aria-label={`Show goal ${i + 1}: ${goal.name}`}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    current === i ? "w-4 bg-primary" : "w-2 bg-muted-foreground/40 hover:bg-muted-foreground"
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete goal?</DialogTitle>
            <DialogDescription>
              This permanently deletes {deleteTarget?.name ?? "this goal"}. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const target = deleteTarget;
                if (target) void deleteGoal(target.id);
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        {editTarget && (
          <EditGoalDialog
            goal={editTarget}
            onSaved={() => {
              setEditTarget(null);
              router.refresh();
            }}
          />
        )}
      </Dialog>
    </section>
  );
}

function GoalCard({
  goal,
  monthlyInflow,
  onComplete,
  onEdit,
  onDelete,
  disabled,
}: {
  goal: SavingsGoal;
  monthlyInflow: MonthlyInflow[];
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const { hidden } = useBalancesHidden();
  const { symbol } = useCurrency();

  const saved = goalSavedCents(goal);
  const progress = goalProgress(goal);
  const remaining = goalRemainingCents(goal);
  const months = goalEtaMonths(goal, monthlyInflow);
  const reached = remaining === 0;

  const eta =
    months === null
      ? null
      : months <= 1
        ? "~1 month to go"
        : months < 24
          ? `~${months} months to go`
          : `~${Math.round(months / 12)} years to go`;

  return (
    <article
      className="group/goal flex w-full flex-col gap-3 rounded-xl border bg-background p-4"
      style={{ borderLeft: `4px solid ${goal.color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h3 className="truncate font-medium" title={goal.name}>
            {goal.name}
          </h3>
        </div>
        <div className="-mt-1 -mr-1 flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/60 hover:text-foreground"
            onClick={onEdit}
            disabled={disabled}
            title={`Edit ${goal.name}`}
            aria-label={`Edit ${goal.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/60 hover:text-destructive"
            onClick={onDelete}
            disabled={disabled}
            title={`Delete ${goal.name}`}
            aria-label={`Delete ${goal.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <span className="inline-flex" title={reached ? undefined : "Reach 100% to mark complete"}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground/60 hover:text-emerald-600"
              onClick={onComplete}
              disabled={disabled || !reached}
              aria-label={
                reached ? `Mark ${goal.name} complete` : `${goal.name} is not at 100% yet`
              }
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          </span>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("font-semibold tabular-nums", reached && "text-emerald-600")}>
            {formatMoney(saved, hidden, symbol)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            of {formatMoney(goal.target_cents, hidden, symbol)}
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: goal.color }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          {reached ? (
            <span className="font-medium text-emerald-600">Goal reached</span>
          ) : eta ? (
            <span>{eta}</span>
          ) : (
            <span className="italic">No recent saving</span>
          )}
        </div>
      </div>

      <ul className="mt-auto space-y-1 border-t pt-3">
        {goal.allocations.map((a) => (
          <li key={a.account_id} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: a.account_color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {a.account_name}
              {a.account_archived ? " (hidden)" : ""}
            </span>
            <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
              {a.weight}%
            </span>
            <span className="w-20 shrink-0 text-right font-medium tabular-nums">
              {formatMoney(Math.round((a.balance_cents * a.weight) / 100), hidden, symbol)}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function NewGoalDialog({
  accounts,
  onCreated,
}: {
  accounts: Account[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const targetCents = centsFromInput(target);
  const allocations = Object.entries(weights)
    .map(([account_id, w]) => ({ account_id, weight: Number(w) }))
    .filter((a) => Number.isInteger(a.weight) && a.weight >= 1 && a.weight <= 100);
  const canSubmit =
    !submitting &&
    name.trim().length > 0 &&
    targetCents !== null &&
    targetCents > 0 &&
    allocations.length > 0;

  const toggle = (accountId: string) =>
    setWeights((w) => {
      if (w[accountId] === undefined) return { ...w, [accountId]: "100" };
      const next = { ...w };
      delete next[accountId];
      return next;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || targetCents === null) return;
    setSubmitting(true);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), target: targetCents, color, allocations }),
    });
    setSubmitting(false);
    if (res.ok) {
      setName("");
      setTarget("");
      setColor(PALETTE[0]);
      setWeights({});
      onCreated();
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>New savings goal</DialogTitle>
        <DialogDescription>
          Pick the accounts the goal draws from, and how much of each counts (100% is all of it).
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="goal-name">Name</Label>
          <Input
            id="goal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. New car, Holiday, Emergency fund..."
            maxLength={60}
            autoFocus
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="goal-target">Target amount</Label>
          <Input
            id="goal-target"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div className="space-y-2">
          <Label>Accounts the money comes from</Label>
          <div className="space-y-1.5">
            {accounts.map((a) => {
              const selected = weights[a.id] !== undefined;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5",
                    selected && "border-primary/40 bg-primary/5"
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={`Use ${a.name}`}
                    onClick={() => toggle(a.id)}
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input"
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </button>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: a.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                  <input
                    inputMode="numeric"
                    value={weights[a.id] ?? "100"}
                    disabled={!selected}
                    onChange={(e) =>
                      setWeights((w) => ({ ...w, [a.id]: e.target.value.replace(/[^\d]/g, "") }))
                    }
                    aria-label={`Percent of ${a.name}`}
                    className="w-12 rounded-md border border-input bg-transparent px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus-visible:border-ring disabled:opacity-30"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Each percentage is independent — 100% of one account and 20% of another is fine.
          </p>
        </div>

        <Button type="submit" disabled={!canSubmit} className="w-full">
          {submitting ? "Creating..." : "Create goal"}
        </Button>
      </form>
    </DialogContent>
  );
}

/** Shared color swatches for the create and edit dialogs. */
function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button
          type="button"
          key={c}
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn(
            "h-7 w-7 rounded-full border-2 transition",
            value === c ? "border-foreground scale-110" : "border-transparent"
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

/**
 * Edit an existing goal's name, target, or color. Account allocations are set
 * at creation and intentionally not editable here (PATCH doesn't accept them).
 */
function EditGoalDialog({ goal, onSaved }: { goal: SavingsGoal; onSaved: () => void }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState((goal.target_cents / 100).toString());
  const [color, setColor] = useState(goal.color);
  const [submitting, setSubmitting] = useState(false);

  const targetCents = centsFromInput(target);
  const canSubmit =
    !submitting && name.trim().length > 0 && targetCents !== null && targetCents > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || targetCents === null) return;
    setSubmitting(true);
    const res = await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), target: targetCents, color }),
    });
    setSubmitting(false);
    if (res.ok) onSaved();
  };

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Edit goal</DialogTitle>
        <DialogDescription>
          Update the name, target, or color. The accounts and their weights stay as they are.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-goal-name">Name</Label>
          <Input
            id="edit-goal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-goal-target">Target amount</Label>
          <Input
            id="edit-goal-target"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <Button type="submit" disabled={!canSubmit} className="w-full">
          {submitting ? "Saving..." : "Save changes"}
        </Button>
      </form>
    </DialogContent>
  );
}
