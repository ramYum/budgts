/**
 * What Crystal says on Home (web src/components/crystal-perch.tsx, native
 * mobile/components/crystal/crystal-perch.tsx): shared copy, so the two apps
 * can never say different things. Pure; the rate arrives computed (the
 * dashboard's own figure) and is printed by the caller's own formatter.
 */

export type CrystalSay = { hello: string; lines: string[] };

/** Her lines: a hello, then the month's note first, then a short rotation
 * (one per tap). Copy only; the rate is the dashboard's own figure. */
export function crystalLines(name: string, savingsRate: number | null, formatRate: (rate: number) => string): CrystalSay {
  const hello = name && name.length <= 8 ? `Hi, ${name}!` : "Hi there!";
  if (savingsRate === null) return { hello, lines: ["No income yet", "Add income +", "Chirp chirp!"] };
  if (savingsRate < 0) return { hello, lines: ["Spent > earned", "Let's regroup", "We got this!"] };
  return { hello, lines: [`${formatRate(savingsRate)} saved!`, "Chirp chirp!", "Keep it up!", "Proud of you!"] };
}

/** Her lines of encouragement while she roams, to the month's mood: getting
 * started, regrouping after an overspent month, or keeping a saving month
 * going. Short enough for her bubble (it wraps to two lines on a phone). */
export function crystalCheers(savingsRate: number | null): string[] {
  if (savingsRate === null)
    return ["Add income to begin!", "Every dollar has a job!", "Let's plan together!", "Small steps add up!", "You've got this!"];
  if (savingsRate < 0)
    return ["Tomorrow's a fresh start", "Small cuts add up!", "We can turn it around!", "One step at a time!", "You've got this!"];
  return [
    "You've got this!",
    "Future you says thanks!",
    "Small steps add up!",
    "Every dollar has a job!",
    "Consistency wins!",
    "Keep that streak going!",
  ];
}
