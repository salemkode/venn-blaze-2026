import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { colors as c } from './theme';
import { brand } from './brand';

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const tabular: TextStyle['fontVariant'] = ['tabular-nums'];
const centered = { alignItems: 'center', justifyContent: 'center' } as const;

export const styles = StyleSheet.create({
  // Layout
  root: { flex: 1, backgroundColor: c.background },
  fill: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    flexGrow: 1,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressed: { opacity: 0.55 },
  dimmed: { opacity: 0.4 },
  muted: { color: c.muted },
  inkText: { color: c.ink },
  loading: { flex: 1, gap: 16, ...centered },
  sectionGap: { marginTop: 24 },
  buttonGap: { marginTop: 10 },

  title: {
    fontSize: 34,
    fontWeight: '700',
    color: c.ink,
    letterSpacing: -1.2,
    marginBottom: 12,
  },
  body: { color: c.muted, fontSize: 15, lineHeight: 22 },
  subtitle: { color: c.muted, fontSize: 13, marginTop: 3 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: c.ink },
  transactionId: {
    fontFamily: mono,
    fontSize: 11,
    lineHeight: 17,
    color: c.muted,
  },

  // Inputs
  field: { gap: 8, marginBottom: 16 },
  fieldLabel: { color: c.ink, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: c.paper,
    padding: 17,
    borderRadius: 20,
    fontSize: 16,
    color: c.ink,
    minHeight: 56,
    textAlignVertical: 'top',
  },

  // Buttons
  chip: {
    backgroundColor: c.tile,
    borderRadius: 20,
    paddingHorizontal: 16,
    minHeight: 40,
    ...centered,
  },
  chipText: { fontSize: 15, fontWeight: '600', color: c.ink },
  note: {
    padding: 16,
    backgroundColor: c.warning,
    borderRadius: 20,
    marginVertical: 10,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
    minHeight: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.paper,
    borderRadius: 22,
    height: 44,
    paddingLeft: 6,
    paddingRight: 14,
    flexShrink: 1,
  },
  addressPillText: {
    color: c.muted,
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: c.paper,
    borderRadius: 18,
    height: 36,
    paddingHorizontal: 13,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.paper,
    ...centered,
  },

  // Welcome
  welcome: { flex: 1, justifyContent: 'center', paddingBottom: 24 },
  introHold: { flex: 1, backgroundColor: brand.night },
  introOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: brand.night,
  },
  welcomeMark: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: brand.night,
    marginBottom: 28,
    ...centered,
  },
  intro: { fontSize: 17, lineHeight: 26, color: c.muted, marginBottom: 28 },
  restoreLabel: {
    color: c.muted,
    marginTop: 32,
    marginBottom: 12,
    fontSize: 14,
  },

  // Home: stacked balance card
  walletStack: { paddingTop: 46, marginBottom: 12 },
  stackLayer: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 110,
    borderRadius: 24,
  },
  stackCoin: {
    position: 'absolute',
    top: 3,
    right: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.amber,
    ...centered,
  },
  balanceCard: {
    borderColor: '#FFFFFF24',
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
    padding: 22,
    minHeight: 150,
    justifyContent: 'space-between',
  },
  cardArtwork: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  balanceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF1F',
    borderRadius: 16,
    height: 32,
    paddingHorizontal: 12,
  },
  cardBadgeLabel: { color: c.paper, fontSize: 12, fontWeight: '600' },
  cardEyebrow: {
    fontSize: 14,
    color: '#FFFFFFB3',
    fontWeight: '500',
    flexShrink: 1,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amountRow: { flex: 1, flexDirection: 'row', alignItems: 'baseline' },
  balance: { fontWeight: '600', color: c.paper, fontVariant: tabular },
  balanceFaint: { color: '#FFFFFF66' },
  unitPill: {
    backgroundColor: '#FFFFFF1F',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  unitPillText: { color: c.paper, fontSize: 13, fontWeight: '600' },

  // Home: actions and lists
  actions: { flexDirection: 'row', gap: 10, marginBottom: 26 },
  tile: {
    flex: 1,
    backgroundColor: c.paper,
    borderRadius: 22,
    minHeight: 88,
    paddingVertical: 16,
    gap: 10,
    ...centered,
  },
  tileText: { color: c.ink, fontSize: 15, fontWeight: '600' },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { color: c.ink, fontSize: 17, fontWeight: '600' },
  assetCard: {
    backgroundColor: c.paper,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 16,
    minHeight: 78,
  },
  assetAmount: {
    color: c.ink,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: tabular,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 6,
    marginBottom: 10,
  },
  activityMark: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: c.tile,
    ...centered,
  },
  dayLabel: {
    color: c.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 4,
  },
  walletChip: { width: 40, height: 28, borderRadius: 8 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  activityBlock: { marginBottom: 16 },
  dangerText: { color: c.danger },
  activityAmount: {
    color: c.ink,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: tabular,
  },
  pendingCard: {
    backgroundColor: c.paper,
    borderRadius: 24,
    padding: 18,
    gap: 12,
    marginBottom: 14,
  },

  // Send
  recipientField: {
    backgroundColor: c.paper,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 70,
  },
  recipientLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: c.muted,
    marginBottom: 3,
  },
  recipientInput: {
    fontFamily: mono,
    fontSize: 14,
    lineHeight: 20,
    color: c.ink,
    padding: 0,
    textAlignVertical: 'top',
  },
  amountBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 116,
  },
  amountEntry: {
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '600',
    letterSpacing: -2.5,
    color: c.ink,
    fontVariant: tabular,
  },
  amountPlaceholder: { color: c.faint },
  amountUnit: { fontSize: 15, color: c.muted, marginTop: 2 },
  available: {
    fontSize: 13,
    color: c.muted,
    textAlign: 'center',
    fontVariant: tabular,
    marginBottom: 4,
  },
  amountError: {
    fontSize: 14,
    lineHeight: 20,
    color: c.danger,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
  },
  keypad: { marginTop: 6, marginBottom: 12 },
  keypadRow: { flexDirection: 'row', gap: 6 },
  key: { flex: 1, height: 54, borderRadius: 22, ...centered },
  keyPressed: { backgroundColor: c.tile },
  keyText: {
    fontSize: 28,
    fontWeight: '500',
    color: c.ink,
    fontVariant: tabular,
  },

  // Review
  reviewHero: { alignItems: 'center', paddingTop: 18, paddingBottom: 24 },
  reviewAmount: {
    fontSize: 52,
    lineHeight: 60,
    fontWeight: '600',
    letterSpacing: -2,
    color: c.ink,
    fontVariant: tabular,
  },
  detailCard: {
    backgroundColor: c.paper,
    borderRadius: 24,
    paddingHorizontal: 18,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 15,
  },
  detailStack: { paddingVertical: 15, gap: 6 },
  detailLabel: { fontSize: 15, color: c.muted },
  detailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: c.ink,
    fontVariant: tabular,
    flexShrink: 1,
    textAlign: 'right',
  },
  detailTotal: { fontSize: 16, fontWeight: '700' },
  reviewAddress: {
    fontFamily: mono,
    fontSize: 14,
    lineHeight: 21,
    color: c.ink,
  },
  hairline: { height: 1, backgroundColor: c.background },

  // Sent
  successMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.green,
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 18,
    ...centered,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: c.ink,
    textAlign: 'center',
  },
  successAmount: {
    fontSize: 17,
    color: c.muted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 22,
    fontVariant: tabular,
  },

  receiveCard: {
    backgroundColor: c.card,
    borderColor: c.cardEdge,
    borderWidth: 1,
    borderRadius: 30,
    padding: 22,
    alignItems: 'center',
    marginBottom: 12,
  },
  qr: { backgroundColor: c.paper, borderRadius: 20, padding: 14 },
  receiveCaption: { marginTop: 18, marginBottom: 6 },
  address: {
    fontFamily: mono,
    color: c.paper,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },

  // Grouped cards (Receive, Settings)
  infoCard: {
    backgroundColor: c.paper,
    borderRadius: 24,
    padding: 18,
    gap: 6,
    marginTop: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  networkOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    minHeight: 60,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: c.faint,
    ...centered,
  },
  radioSelected: { backgroundColor: c.ink, borderColor: c.ink },
  recoveryPhrase: {
    backgroundColor: c.background,
    borderRadius: 16,
    padding: 16,
    color: c.ink,
    fontSize: 17,
    lineHeight: 28,
    marginTop: 8,
    overflow: 'hidden',
  },

  // Sheet
  sheetBody: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: c.ink,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.tile,
    ...centered,
  },
  caption: {
    color: c.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
  },

  categoryId: {
    fontFamily: mono,
    fontSize: 13,
    lineHeight: 20,
    color: c.ink,
  },
  cardGap: { marginBottom: 12 },
  weakness: { color: c.warningInk, fontSize: 13, lineHeight: 19, marginTop: 4 },
  summaryLine: { paddingVertical: 8, gap: 2 },
  vennMark: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.green, ...centered },
  vennMarkPending: { backgroundColor: c.tile },
  badgeRow: { gap: 8, marginBottom: 12 },
  selectedCard: { borderWidth: 2, borderColor: c.ink },
});

export function pillButtonStyle({
  secondary,
  disabled,
  pressed,
}: {
  secondary: boolean;
  disabled: boolean;
  pressed: boolean;
}): ViewStyle {
  return {
    minHeight: 56,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: disabled ? c.disabled : secondary ? c.tile : c.ink,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: pressed ? 0.7 : 1,
  };
}
export function pillButtonTextStyle(secondary: boolean, disabled: boolean): TextStyle {
  return {
    fontSize: 17,
    fontWeight: '600',
    color: secondary && !disabled ? c.ink : c.paper,
  };
}
export function noteTextStyle(danger: boolean): TextStyle {
  return {
    color: danger ? c.danger : c.warningInk,
    fontSize: 14,
    lineHeight: 21,
  };
}
export function badgeDotStyle(network: string): ViewStyle {
  return {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: network === 'chipnet' ? c.bch : c.amber,
  };
}
export function homeContentStyle(bottomInset: number): ViewStyle {
  return { paddingBottom: Math.max(bottomInset, 12) + 20 };
}
export function cardColorStyle(color: string): ViewStyle {
  return { backgroundColor: color };
}
// Sized from its length so a large balance still fits beside the unit.
export function balanceTextStyle(length: number): TextStyle {
  const fontSize = Math.max(18, Math.min(38, Math.floor(400 / length)));
  return { fontSize, letterSpacing: -fontSize * 0.036 };
}
