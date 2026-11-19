import { router } from 'expo-router';

const routes = [
  { name: 'network', path: '/(wallet)/network' },
  { name: 'recovery', path: '/(wallet)/recovery' },
  { name: 'receive', path: '/(wallet)/receive' },
  { name: 'send', path: '/(wallet)/send' },
  { name: 'wallets', path: '/(wallet)/wallets' },
  { name: 'connect', path: '/(wallet)/connect' },
  { name: 'create', path: '/(wallet)/create' },
  { name: 'join', path: '/(wallet)/join' },
  { name: 'plan', path: '/(wallet)/plan' },
  { name: 'fees', path: '/(wallet)/fees' },
  { name: 'key', path: '/(wallet)/key' },
  { name: 'transaction', path: '/(wallet)/transaction' },
  { name: 'venn', path: '/(wallet)/venn' },
  { name: 'circle', path: '/(wallet)/circle' },
  { name: 'approve', path: '/(wallet)/approve' },
] as const;

export function open(name: string, params: Record<string, string> = {}) {
  const target = routes.find(route => route.name === name);
  if (!target) throw new Error('Unknown destination.');
  router.push({ pathname: target.path, params });
}
export const close = () => router.dismissTo('/(tabs)');
