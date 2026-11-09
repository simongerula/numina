"use client";

import type { Account, Movement } from "@/lib/types";
import { monthlyBalanceChanges } from "@/lib/series";
import { formatSignedMoney } from "@/lib/format";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { cn } from "@/lib/utils";

const MONTHS_TO_SHOW = 6;

/**
 * One-row strip above the ledger: net total-balance change for each of the
 * last six months, e.g. Jan +$500 | Feb -$20 | Mar — (no activity).
 */
export function MonthlyChangeRow({
  accounts,
  movements,
}: {
  accounts: Account[];
  movements: Movement[];
}) {
  const { hidden } = useBalancesHidden();
  const months = monthlyBalanceChanges(accounts, movements, MONTHS_TO_SHOW);

  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <header className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Monthly balance change
        </h2>
        <p className="text-xs text-muted-foreground">
          Net change across active accounts, last six months
        </p>
      </header>
      <div className="grid grid-cols-3 divide-x divide-border sm:grid-cols-6">
        {months.map((m, i) => (
          <div key={m.period} className={cn("px-5 py-4", i >= 3 && "border-t sm:border-t-0")}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {m.label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-sm font-semibold tabular-nums",
                m.cents > 0 && "text-emerald-600",
                m.cents < 0 && "text-red-600",
                m.cents === 0 && "text-muted-foreground"
              )}
            >
              {m.cents === 0 ? "—" : formatSignedMoney(m.cents, hidden)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
