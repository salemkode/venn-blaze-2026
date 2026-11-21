// Who can stop a recovery request, worked out from the Venn's rules exactly as the v2 contract
// enforces them, so the app can refuse plans where a request on a seat could never be stopped
// and warn before anyone signs one.
//
// Contract facts (contracts/VennVault.cash):
// - stop rule 1 (KEY): the seat's current key can stop any request on it.
// - stop rule 2 (VOTERS): only a majority of voters can stop it (recoveryCancelByVote); the seat's
//   own card is frozen while the request waits, so its key never counts toward that majority.
// - stop rule 3 (BOTH): the current key can stop a normal request; a strong request can only be
//   stopped by a majority of voters.
// - While a request waits, the seat's card cannot spend or sign votes.
import { STOP } from './layout';

export const majorityOf = (voters: number) => Math.floor(voters / 2) + 1;

/** Whether the voters other than the target seat can ever reach a majority to stop a request. */
export const othersCanOutvote = (voters: number, targetVotes: boolean) =>
  (targetVotes ? voters - 1 : voters) >= majorityOf(voters);

export interface StopFacts {
  /** The seat's own key can stop this request. */
  key: boolean;
  /** A majority of the other voters can stop it. */
  voters: boolean;
}

/** Who can stop a request on a seat, for a normal (`strong` false) or strong request. */
export function whoCanStop(stopRule: number, voters: number, targetVotes: boolean, strong = false): StopFacts {
  const key = stopRule === STOP.KEY || (stopRule === STOP.BOTH && !strong);
  const byVote = (stopRule === STOP.VOTERS || stopRule === STOP.BOTH) && othersCanOutvote(voters, targetVotes);
  return { key, voters: byVote };
}

/**
 * Why these recovery settings let a request on a voter's seat go unstopped, or '' when every
 * request can be stopped by the seat's key or by the other voters.
 */
export function unstoppableReason(settings: { recoveryOn: boolean; stopRule: number }, voters: number): string {
  if (!settings.recoveryOn || settings.stopRule === STOP.KEY) return '';
  if (othersCanOutvote(voters, true)) return '';
  const what = settings.stopRule === STOP.VOTERS ? 'a request' : 'a stronger request';
  return `With ${voters} ${voters === 1 ? 'voter' : 'voters'}, nobody could stop ${what} on a voter’s seat: the seat’s own key may not, and the other voters can never be a majority. Choose “Their key” for who can stop a request.`;
}

/** The stop rule a new plan should start with: the seat's own key unless the voters can outvote. */
export const defaultStopRule = (voters: number): 1 | 2 => (othersCanOutvote(voters, true) ? STOP.VOTERS : STOP.KEY);

/** Plain words for the review of a recovery request, before anyone signs it. */
export function freezeWarning(name: string, hours: number, stop: StopFacts): { text: string; danger: boolean } {
  const freeze = `While this request waits (about ${hours} hours), ${name}’s seat cannot spend or vote, and any vote that needs ${name} is blocked until it completes or is stopped.`;
  if (stop.key && stop.voters)
    return { text: `${freeze} ${name}’s own key or a majority of the other voters can stop it.`, danger: false };
  if (stop.key) return { text: `${freeze} ${name}’s own key can stop it.`, danger: false };
  if (stop.voters) return { text: `${freeze} Only a majority of the other voters can stop it; ${name}’s key cannot.`, danger: true };
  return {
    text: `${freeze} Nobody can stop it: under this Venn’s rules ${name}’s key cannot, and there are not enough other voters. Only ask for this if ${name} really lost their phone.`,
    danger: true,
  };
}
