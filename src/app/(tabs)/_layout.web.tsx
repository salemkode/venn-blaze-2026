import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { CreditCard, Settings, Users, type LucideIcon } from 'lucide-react-native';
import { colors } from '../../ui/theme';

/**
 * Web: NativeTabs has no bottom bar on the web; it floats a text-only bar over the top of every
 * screen, on the screen titles. The web gets the iPhone's floating bottom bar instead: icon over
 * label, with a grey pill behind the selected tab, built on Expo Router's headless tabs.
 */
// Full group paths: the app also has a root index (the entry screen), so a bare '/' is ambiguous.
const TABS: { name: string; href: '/(tabs)' | '/(tabs)/venns' | '/(tabs)/settings'; label: string; icon: LucideIcon }[] = [
  { name: 'index', href: '/(tabs)', label: 'Wallet', icon: CreditCard },
  { name: 'venns', href: '/(tabs)/venns', label: 'Venns', icon: Users },
  { name: 'settings', href: '/(tabs)/settings', label: 'Settings', icon: Settings },
];

function TabButton({ isFocused, label, icon: Icon, ref, ...props }: TabTriggerSlotProps & { label: string; icon: LucideIcon }) {
  // The trigger's ref is typed for Expo Router's own View; it is the same host view at runtime.
  return (
    <Pressable ref={ref as never} {...props} accessibilityRole="tab" accessibilityState={{ selected: Boolean(isFocused) }} style={styles.tab}>
      <View style={[styles.item, isFocused && styles.itemOn]}>
        <Icon size={22} color={isFocused ? colors.ink : colors.muted} strokeWidth={1.8} />
        <Text style={[styles.label, { color: isFocused ? colors.ink : colors.muted }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export default function WebTabs() {
  return (
    // TabList must be a direct child of Tabs: Tabs finds its triggers by scanning its children.
    <Tabs style={styles.root}>
      {/* Long pages scroll inside the slot instead of pushing the tab bar off the screen. */}
      <TabSlot style={styles.slot} />
      <TabList accessibilityRole="tablist" style={styles.bar}>
        {TABS.map(tab => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton label={tab.label} icon={tab.icon} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  slot: { flexShrink: 1, minHeight: 0 },
  bar: {
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 18,
    flexDirection: 'row',
    padding: 5,
    gap: 2,
    borderRadius: 32,
    backgroundColor: colors.paper,
    boxShadow: '0 6px 24px rgba(11, 11, 13, 0.12), 0 0 0 1px rgba(11, 11, 13, 0.04)',
  },
  tab: { borderRadius: 26 },
  item: { minWidth: 70, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 26, alignItems: 'center', gap: 2 },
  itemOn: { backgroundColor: colors.tile },
  label: { fontSize: 11, fontWeight: '600' },
});
