// The official contract list. The same file is published in the repository.
import list from '../../contracts/registry.json';

export interface OfficialContract {
  name: string;
  version: number;
  sha256: string;
  /** The VennMoney template this contract keeps its money in. */
  money?: string;
  options: string[];
  weaknesses: string[];
}

export const OFFICIAL: OfficialContract[] = list;

export const officialFor = (sha256: string): OfficialContract | undefined =>
  OFFICIAL.find(c => c.sha256 === sha256);
