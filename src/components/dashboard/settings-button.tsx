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
import { CURRENCIES, useCurrency } from "@/hooks/useCurrency";

/**
 * App settings, kept device-local in localStorage (no server table). For now
 * the only preference is the display currency.
 */
export function SettingsButton() {
  const { currency, setCurrency } = useCurrency();

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

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
