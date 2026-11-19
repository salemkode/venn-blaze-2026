import type { Confirmation } from './confirm';

/** react-native-web's Alert does nothing, so browsers use their own dialog. */
export function confirmAction({ title, message, action, onConfirm }: Confirmation) {
  const text = `${title}\n\n${message}\n\nPress OK to ${action.toLowerCase()}.`;
  if (globalThis.confirm?.(text)) onConfirm();
}
