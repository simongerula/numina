"use client";

import { ArchiveRestore, Eye, EyeOff, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSignedMoney, formatMoney } from "@/lib/format";
import { totalProfit } from "@/lib/series";
import type { Account, Movement } from "@/lib/types";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
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
import { cn } from "@/lib/utils";

const PALETTE = [
  "#4f46e5", "#10b981", "#f59e0b", "#8b5cf6", "#f97316", "#ec4899", "#06b6d4", "#84cc16",
];

/**
 * Truncated account name with a full-name tooltip, but only when the text
 * is actually clipped (scrollWidth > clientWidth), re-checked on resize.
 */
function AccountName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);

  return (
    <span ref={ref} className="truncate" title={truncated ? name : undefined}>
      {name}
    </span>
  );
}

/** Balances + profits per account, with inline add/edit/hide (never hard-delete). */
export function BalancesTable({
  accounts,
  hiddenAccounts,
  movements,
}: {
  accounts: Account[];
  hiddenAccounts: Account[];
  movements: Movement[];
}) {
  const { hidden, toggle } = useBalancesHidden();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unarchiveOpen, setUnarchiveOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const router = useRouter();

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalDelta = accounts.reduce((s, a) => s + totalProfit(movements, a.id), 0);

  /** Archive is a soft-hide: the account disappears from the dashboard but keeps its movements. */
  const setArchived = useCallback(
    async (account: Account, archived: boolean) => {
      if (busyId) return;
      setBusyId(account.id);
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      setBusyId(null);
      if (res.ok) router.refresh();
    },
    [busyId, router]
  );
  /** Kept as thin aliases so the call sites read clearly. */
  const hideAccount = useCallback((account: Account) => setArchived(account, true), [setArchived]);
  const restoreAccount = useCallback((account: Account) => setArchived(account, false), [setArchived]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      setSubmitting(true);
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      setSubmitting(false);
      if (res.ok) {
        setName("");
        setDialogOpen(false);
        router.refresh();
      }
    },
    [name, color, router]
  );

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Balances &amp; Profits</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggle}
            aria-label={hidden ? "Show balances" : "Hide balances"}
          >
            {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Dialog open={unarchiveOpen} onOpenChange={setUnarchiveOpen}>
            <DialogTrigger render={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Un-archive accounts"
                aria-label="Un-archive accounts"
              >
                <ArchiveRestore className="h-4 w-4" />
              </Button>
            } />
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Archived accounts</DialogTitle>
                <DialogDescription>
                  Restore an account to bring it back to the dashboard. Its movements never went away.
                </DialogDescription>
              </DialogHeader>
              {hiddenAccounts.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  No archived accounts.
                </p>
              ) : (
                <ul className="max-h-64 divide-y overflow-y-auto">
                  {hiddenAccounts.map((account) => (
                    <li key={account.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
                        <AccountName name={account.name} />
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatMoney(account.balance, hidden)}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => restoreAccount(account)}
                        disabled={busyId !== null}
                        title={`Un-archive ${account.name}`}
                        aria-label={`Un-archive ${account.name}`}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button size="sm">Add account</Button>} />
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>New account</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="account-name">Name</Label>
                  <Input
                    id="account-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Bank, Wallet, Cash…"
                    maxLength={60}
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE.map((c) => (
                      <button
                        type="button"
                        key={c}
                        aria-label={c}
                        onClick={() => setColor(c)}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition",
                          color === c ? "border-foreground scale-110" : "border-transparent"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <Button type="submit" disabled={submitting || !name.trim()} className="w-full">
                  {submitting ? "Creating…" : "Create account"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/*
        Account list: takes whatever height the card has left (the card is
        stretched to match the chart next to it) and scrolls when it overflows.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {accounts.length === 0 ? (
          <div className="flex min-h-full items-center justify-center">
            <EmptyAccounts />
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-[28%]" />
              <col className="w-[28%]" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="sticky top-0 z-10 bg-card px-5 py-2 font-medium">Account</th>
                <th className="sticky top-0 z-10 bg-card px-3 py-2 text-right font-medium">Balance</th>
                <th className="sticky top-0 z-10 bg-card px-3 py-2 text-right font-medium">Profit</th>
                <th className="sticky top-0 z-10 bg-card px-2 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const delta = totalProfit(movements, account.id);
                return (
                  <tr key={account.id} className="group border-t">
                    <td className="px-5 py-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
                        <AccountName name={account.name} />
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {formatMoney(account.balance, hidden)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 text-right font-medium tabular-nums",
                        delta > 0 && "text-emerald-600",
                        delta < 0 && "text-red-600"
                      )}
                    >
                      {formatSignedMoney(delta, hidden)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() => setArchiveTarget(account)}
                        disabled={busyId !== null}
                        title={`Archive ${account.name}`}
                        aria-label={`Archive ${account.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Fixed footer: TOTAL always sits at the bottom of the card. */}
      <div className="border-t">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[28%]" />
            <col className="w-[28%]" />
            <col className="w-10" />
          </colgroup>
          <tbody>
            <tr className="bg-muted font-semibold">
              <td className="px-5 py-3">TOTAL</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatMoney(totalBalance, hidden)}</td>
              <td
                className={cn(
                  "px-3 py-3 text-right tabular-nums",
                  totalDelta > 0 && "text-emerald-600",
                  totalDelta < 0 && "text-red-600"
                )}
              >
                {formatSignedMoney(totalDelta, hidden)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive account?</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive {archiveTarget?.name ?? "this account"}? This will hide the account but
              movements are still visible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => {
                const target = archiveTarget;
                setArchiveTarget(null);
                if (target) void hideAccount(target);
              }}
            >
              Archive
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EmptyAccounts() {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <Wallet className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">No accounts yet</p>
        <p className="text-sm text-muted-foreground">
          &quot;Add account&quot; to track your balances and profits.
        </p>
      </div>
    </div>
  );
}
