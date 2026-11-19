import { use } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { styles } from './styles';

/**
 * The native header sits above the screen's own frame, so the keyboard avoider must add its
 * height or the bottom of the page stays under the keyboard. Screens without a header get 0.
 */
export function useKeyboardOffset() {
  return use(HeaderHeightContext) ?? 0;
}

export default function Page({ children, top = false }: { children: React.ReactNode; top?: boolean }) {
  const offset = useKeyboardOffset();
  return (
    <SafeAreaView style={styles.root} edges={top ? ['top', 'left', 'right'] : ['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={offset}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
