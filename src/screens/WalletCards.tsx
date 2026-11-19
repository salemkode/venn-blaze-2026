import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { NETWORKS } from 'react-native-xo';
import { colors as c } from '../ui/theme';
import { styles as s, badgeDotStyle, balanceTextStyle, cardColorStyle } from '../ui/styles';
import { splitAmount } from '../ui/format';
import { CARD_COLORS } from '../wallet/registry';

// Where the cards behind the front one rest, farthest first, for one, two
// or three of them.
const RESTS = [
  [{ top: 31, rotate: -5 }],
  [
    { top: 28, rotate: -7 },
    { top: 37, rotate: -3 },
  ],
  [
    { top: 28, rotate: -7 },
    { top: 35, rotate: -4.5 },
    { top: 41, rotate: -2 },
  ],
];

/** One character that slides up into place when it appears or changes. */
function Char({ char, index, style }) {
  const shown = useRef(null);
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (shown.current === char) return;
    shown.current = char;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      delay: index * 24,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [char, index, enter]);
  return (
    <Animated.Text
      style={[
        style,
        {
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      {char}
    </Animated.Text>
  );
}

/** A balance whose digits animate when they change. */
export function AnimatedAmount({ value, style, faintStyle, testID }) {
  const [strong, faint] = splitAmount(value);
  const text = `${strong}${faint}`;
  const size = balanceTextStyle(text.length);
  return (
    <View testID={testID} accessible accessibilityLabel={text} style={s.amountRow}>
      {[...text].map((char, index) => (
        <Char
          // Position is the identity: a digit animates when its place changes.
          key={index}
          char={char}
          index={index}
          style={index < strong.length ? [style, size] : [style, size, faintStyle]}
        />
      ))}
    </View>
  );
}

/**
 * The wallets as a stack of cards. The active wallet is the front card; the
 * others fan out behind it in their own colours. When the active wallet
 * changes, its card rises out of the stack while the fan closes behind it.
 */
export default function WalletCards({ wallet, others, balance, network, disabled, onPress }) {
  const testnet = network === 'chipnet';
  const [rise] = useState(() => new Animated.Value(1));
  const front = useRef(wallet.id);
  useEffect(() => {
    if (front.current === wallet.id) return;
    front.current = wallet.id;
    rise.setValue(0);
    Animated.spring(rise, {
      toValue: 1,
      friction: 8,
      tension: 38,
      useNativeDriver: true,
    }).start();
  }, [wallet.id, rise]);
  // Nearest card last so it draws on top; with one wallet a blank card
  // invites adding another.
  const layers = others.slice(0, RESTS.length).reverse();
  const rests = RESTS[Math.max(layers.length, 1) - 1];
  const move = (from, to) => rise.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  return (
    <Pressable accessible={false} testID="wallet-cards" disabled={disabled} onPress={onPress} style={s.walletStack}>
      {rests.map((rest, index) => {
        const layer = layers[index];
        return (
          <Animated.View
            key={layer ? layer.id : 'add'}
            accessible={false}
            style={[
              s.stackLayer,
              cardColorStyle(layer ? CARD_COLORS[layer.color] : c.paper),
              {
                top: rest.top,
                transform: [
                  { translateY: move(-16, 0) },
                  {
                    rotate: move(`${rest.rotate * 2.4}deg`, `${rest.rotate}deg`),
                  },
                ],
              },
            ]}
          >
            {layer ? null : (
              <View style={s.stackCoin}>
                <Plus size={18} color={c.paper} strokeWidth={3} />
              </View>
            )}
          </Animated.View>
        );
      })}
      <Animated.View
        style={[
          s.balanceCard,
          cardColorStyle(CARD_COLORS[wallet.color]),
          {
            transform: [{ translateY: move(30, 0) }, { scale: move(0.9, 1) }, { rotate: move('-3deg', '0deg') }],
          },
        ]}
      >
        <View pointerEvents="none" accessible={false} style={s.cardArtwork}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.2" />
                <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#sheen)" />
          </Svg>
        </View>
        <View style={s.balanceCardTop}>
          <Text testID="wallet-name" numberOfLines={1} style={s.cardEyebrow}>
            {wallet.name}
          </Text>
          <View testID={`network-${network}`} style={s.cardBadge}>
            <View style={badgeDotStyle(network)} />
            <Text style={s.cardBadgeLabel}>
              {NETWORKS[network].label}
              {testnet ? ' · test funds' : ' · real BCH'}
            </Text>
          </View>
        </View>
        <View style={s.balanceRow}>
          <AnimatedAmount
            testID="balance"
            value={balance ? balance.balanceBch : undefined}
            style={s.balance}
            faintStyle={s.balanceFaint}
          />
          <View style={s.unitPill}>
            <Text style={s.unitPillText}>{testnet ? 'tBCH' : 'BCH'}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
