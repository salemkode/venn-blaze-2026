// Plain-language summary of a Venn's rules, each line with its weakness. The same text is
// shown before creating, before joining and on the Venn itself.
import { formatBch } from 'react-native-xo/core';
import { formatAssetAmount, MUSD, VENN_TEST_USD } from './asset';
import { voteNeed } from './budget';
import { BUDGET, ROLE, RULE, STOP } from './layout';
import { WEAKNESS, unitsToDays } from './presets';

export interface Seat {
  name: string;
  roles: number;
  budgetMode: number;
  budget: bigint;
  period: bigint;
  cap: bigint;
}

export interface Settings {
  membership: number;
  spending: number;
  recoveryRule: number;
  governance: number;
  payments: number;
  recoveryOn: boolean;
  helpersNeeded: number;
  waitUnits: number;
  stopRule: number;
  strongNeeded: number;
  strongWaitUnits: number;
}

export interface Line {
  text: string;
  weakness?: string;
}

const has = (roles: number, role: number) => (roles & role) === role;
const lower = (text: string) => text[0].toLowerCase() + text.slice(1);
const list = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const days = (period: bigint) => {
  const d = Number(period) / 86_400;
  return d === 1 ? 'day' : Number.isInteger(d) ? `${d} days` : `${Math.round(Number(period) / 3600)} hours`;
};

export const money = (amount: bigint, unit = 'BCH') =>
  `${unit === VENN_TEST_USD.symbol || unit === MUSD.symbol ? formatAssetAmount(amount) : unit === 'base units' ? amount.toString() : formatBch(amount)} ${unit}`;

export function roleNames(roles: number) {
  return [
    has(roles, ROLE.SPEND) && 'spends',
    has(roles, ROLE.VOTE) && 'votes',
    has(roles, ROLE.REQUIRED) && 'must sign',
    has(roles, ROLE.HELPER) && 'helps recover',
  ].filter(Boolean) as string[];
}

export function budgetText(seat: Seat, unit = 'BCH') {
  if (seat.budgetMode === BUDGET.NONE) return 'No budget: spends only through votes';
  const cap = seat.cap > 0n ? `, at most ${money(seat.cap, unit)} a payment` : '';
  return seat.budgetMode === BUDGET.REFILL
    ? `Up to ${money(seat.budget, unit)}, refilling over a ${days(seat.period)}${cap}`
    : `${money(seat.budget, unit)} every ${days(seat.period)}${cap}`;
}

const needs = (rule: number, voters: number) => {
  if (rule === RULE.LOCKED) return 'can never be made';
  const need = voteNeed(rule, voters)!;
  return rule === RULE.EVERYONE ? `need all ${voters} voters` : `need ${need} of ${voters} voters`;
};

const ruleText = (rule: number, voters: number) => {
  if (rule === RULE.LOCKED) return 'can never change';
  const need = voteNeed(rule, voters)!;
  return rule === RULE.EVERYONE ? `needs all ${voters} voters` : `needs ${need} of ${voters} voters`;
};

export function summarize(seats: Seat[], settings: Settings, unit = 'BCH'): Line[] {
  const voters = seats.filter(s => has(s.roles, ROLE.VOTE)).length;
  const spenders = seats.filter(s => has(s.roles, ROLE.SPEND));
  const required = seats.filter(s => has(s.roles, ROLE.REQUIRED));
  const helpers = seats.filter(s => has(s.roles, ROLE.HELPER));
  const lines: Line[] = [];

  if (spenders.length)
    for (const s of spenders)
      lines.push({
        text: `${s.name} can pay alone: ${lower(budgetText(s, unit))}.`,
        weakness: WEAKNESS.budget[s.budgetMode as 1 | 2],
      });
  else
    lines.push({
      text: 'Nobody can pay alone: every payment needs a vote.',
      weakness: 'Slow: nothing moves until enough people answer.',
    });

  lines.push({
    text: `Payments beyond a budget ${needs(settings.payments, voters)}${
      required.length ? `, always including ${list(required.map(s => s.name))}` : ''
    }.`,
    weakness:
      settings.payments === RULE.EVERYONE
        ? WEAKNESS.rule[RULE.EVERYONE]
        : 'Whoever controls enough votes can move everything.',
  });

  const changes: [string, number][] = [
    ['Adding or removing members', settings.membership],
    ['Changing budgets', settings.spending],
    ['Changing recovery', settings.recoveryRule],
    ['Changing these rules', settings.governance],
  ];
  for (const [what, rule] of changes)
    lines.push({ text: `${what} ${ruleText(rule, voters)}.`, weakness: WEAKNESS.rule[rule as 0 | 1 | 2] });

  if (!settings.recoveryOn) lines.push({ text: 'Recovery is off.', weakness: WEAKNESS.recoveryOff });
  else {
    const wait = unitsToDays(settings.waitUnits);
    lines.push({
      text: `If someone loses their phone, ${settings.helpersNeeded} of ${helpers.length} ${
        helpers.length === 1 ? 'helper' : 'helpers'
      } (${list(
        helpers.map(h => h.name),
      )}) can give their seat a new key after ${wait} day${wait === 1 ? '' : 's'}.`,
      weakness: 'Enough helpers working together can take over a seat after the wait.',
    });
    const stop =
      settings.stopRule === STOP.KEY
        ? 'The current key can stop a request during the wait.'
        : settings.stopRule === STOP.VOTERS
        ? 'A majority of voters can stop a request during the wait.'
        : `The current key can stop a normal request. A stronger request needs ${settings.strongNeeded} ${
            settings.strongNeeded === 1 ? 'helper' : 'helpers'
          } and ${unitsToDays(settings.strongWaitUnits)} ${
            unitsToDays(settings.strongWaitUnits) === 1 ? 'day' : 'days'
          }, and the current key cannot stop it.`;
    lines.push({ text: stop, weakness: WEAKNESS.stop[settings.stopRule as 1 | 2 | 3] });
  }
  lines.push({ text: 'A Venn cannot make anyone pay in, and money only leaves under these rules.' });
  return lines;
}
