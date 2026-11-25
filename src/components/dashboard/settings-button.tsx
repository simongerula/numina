"use client";

import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CURRENCIES, useCurrency } from "@/hooks/useCurrency";
import { useGoalsVisible } from "@/hooks/useGoalsVisible";

/**
 * App settings, kept device-local in localStorage (no server table): the
 * display currency and whether the savings goals card is shown.
 */
export function SettingsButton({ version }: { version: string }) {
  const { currency, setCurrency } = useCurrency();
  const { visible: goalsVisible, setVisible: setGoalsVisible } = useGoalsVisible();

  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="outline" size="icon-lg" aria-label="Settings" />}
      >
        <Settings />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Preferences live on this device only — nothing is sent anywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="settings-currency">Currency</Label>
          <Select value={currency} onValueChange={(code) => { if (code) setCurrency(code); }}>
            <SelectTrigger id="settings-currency" className="w-full">
              <SelectValue>
                {(value: string) => {
                  const c = CURRENCIES.find((x) => x.code === value);
                  return c ? `${c.code} · ${c.symbol}` : value;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} · {c.symbol} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="settings-goals">Savings goals</Label>
            <p className="text-xs text-muted-foreground">
              Show the savings goals card on the dashboard.
            </p>
          </div>
          <Switch
            id="settings-goals"
            checked={goalsVisible}
            onCheckedChange={setGoalsVisible}
            aria-label="Show savings goals card"
          />
        </div>

        <DialogFooter>
          <p className="mr-auto self-center text-xs text-muted-foreground">Version {version}</p>
          <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
