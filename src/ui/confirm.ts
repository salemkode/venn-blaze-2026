// Two-button confirmation before a risky step. confirm.web.ts gives browsers the same choice.
import { Alert } from 'react-native';

export interface Confirmation {
  title: string;
  message: string;
  cancel: string;
  action: string;
  destructive?: boolean;
  onConfirm(): unknown;
}

export function confirmAction({ title, message, cancel, action, destructive, onConfirm }: Confirmation) {
  Alert.alert(title, message, [
    { text: cancel, style: 'cancel' },
    {
      text: action,
      style: destructive ? 'destructive' : 'default',
      onPress: () => {
        onConfirm();
      },
    },
  ]);
}
