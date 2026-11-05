"use client";

import { Eye, EyeOff, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSignedMoney, formatMoney, formatPeriod } from "@/lib/format";
import { monthlyDelta, currentPeriod } from "@/lib/series";
import type { Account, Movement } from "@/lib/types";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

/** Balances + profits per account, with inline add/edit/delete. */
export function BalancesTable({ accounts, movements }: { accounts: Account[]; movements: Movement[] }) {
  const { hidden, toggle } = useBalancesHidden();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const period = currentPeriod();
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalDelta = accounts.reduce((s, a) => s + monthlyDelta(movements, a.id, period), 0);

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
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
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

      {accounts.length === 0 ? (
        <EmptyAccounts />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-5 py-2 text-right font-medium">Profit ({formatPeriod(period)})</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const delta = monthlyDelta(movements, account.id, period);
                const base = account.balance - delta;
                const pct = base !== 0 ? (delta / Math.abs(base)) * 100 : null;
                return (
                  <tr key={account.id} className="border-t">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: account.color }} />
                        {account.name}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {formatMoney(account.balance, hidden)}
                    </td>
                    <td
                      className={cn(
                        "px-5 py-3 text-right font-medium tabular-nums",
                        delta > 0 && "text-emerald-600",
                        delta < 0 && "text-red-600"
                      )}
                    >
                      {formatSignedMoney(delta, hidden)}
                      {pct !== null && !hidden && (
                        <span className={cn("ml-1 opacity-75", pct < 0 && "text-red-600")}>
                          ({pct >= 0 ? "+" : ""}
                          {pct.toFixed(2)}%)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t bg-muted/40 font-semibold">
                <td className="px-5 py-3">TOTAL</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMoney(totalBalance, hidden)}</td>
                <td
                  className={cn(
                    "px-5 py-3 text-right tabular-nums",
                    totalDelta > 0 && "text-emerald-600",
                    totalDelta < 0 && "text-red-600"
                  )}
                >
                  {formatSignedMoney(totalDelta, hidden)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
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
