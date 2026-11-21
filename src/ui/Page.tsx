import { use } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView } from 'react-native';
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

export default function Page({
  children,
  top = false,
  onRefresh,
  refreshing = false,
}: {
  children: React.ReactNode;
  top?: boolean;
  /** Pull to refresh, when the screen has something to reload. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const offset = useKeyboardOffset();
  return (
    <SafeAreaView style={styles.root} edges={top ? ['top', 'left', 'right'] : ['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={offset}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
