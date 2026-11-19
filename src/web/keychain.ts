// Browser stand-in for react-native-keychain. A browser has no secure enclave, so it never
// stores a recovery phrase: only the wallet list and WizardConnect pairings.
const PREFIX = 'venn.secure.';
export const ACCESSIBLE = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'browser' };

export async function getGenericPassword({ service }: { service: string }) {
  const raw = localStorage.getItem(PREFIX + service);
  return raw ? (JSON.parse(raw) as { username: string; password: string }) : false;
}

export async function setGenericPassword(username: string, password: string, { service }: { service: string }) {
  if (service !== 'venn.wallets' && !password.startsWith('wizardconnect:'))
    throw new Error('Recovery phrases are never stored in a browser. Connect a wallet instead.');
  localStorage.setItem(PREFIX + service, JSON.stringify({ username, password }));
  return true;
}

export async function resetGenericPassword({ service }: { service: string }) {
  localStorage.removeItem(PREFIX + service);
  return true;
}
