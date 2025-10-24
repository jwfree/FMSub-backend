// web/src/lib/subscriptionOptions.ts

export type SubOptionValue =
  | "once"
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | `every_${number}_days`
  | `every_${number}_weeks`
  | `every_${number}_months`;

export type SubOption = { value: SubOptionValue; label: string };

// Convert UI state -> canonical option array
export function buildOptionsFromUi(ui: {
  once: boolean;
  daily: boolean;
  weekly: boolean;
  biweekly: boolean;
  monthly: boolean;
  daysEnabled: boolean; days: number;
  weeksEnabled: boolean; weeks: number;
  monthsEnabled: boolean; months: number;
}): SubOption[] {
  const opts: SubOption[] = [];
  const push = (value: SubOptionValue, label: string) => opts.push({ value, label });

  if (ui.once)     push("once", "One time");
  if (ui.daily)    push("daily", "Daily");
  if (ui.weekly)   push("weekly", "Weekly");
  if (ui.biweekly) push("biweekly", "Every 2 weeks");
  if (ui.monthly)  push("monthly", "Monthly");

  if (ui.daysEnabled && ui.days > 0)     push(`every_${ui.days}_days`, `Every ${ui.days} days`);
  if (ui.weeksEnabled && ui.weeks > 0)   push(`every_${ui.weeks}_weeks`, `Every ${ui.weeks} weeks`);
  if (ui.monthsEnabled && ui.months > 0) push(`every_${ui.months}_months`, `Every ${ui.months} months`);

  return opts;
}

// Nice label for a canonical value (for ProductDetail fallback rendering)
export function labelFor(value: SubOptionValue): string {
  if (value === "once") return "One time";
  if (value === "daily") return "Daily";
  if (value === "weekly") return "Weekly";
  if (value === "biweekly") return "Every 2 weeks";
  if (value === "monthly") return "Monthly";
  const m = value.match(/^every_(\d+)_(days|weeks|months)$/);
  if (m) return `Every ${Number(m[1])} ${m[2]}`;
  return value;
}