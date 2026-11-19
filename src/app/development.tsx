import { useState } from 'react';
import { Text, View } from 'react-native';
import { initializeLibauth } from 'react-native-libauth';
import { binToHex, sha256, secp256k1 } from '@bitauth/libauth';
import * as Keychain from 'react-native-keychain';
import Page from '../ui/Page';
import { DetailRow, Note, PillButton } from '../ui/kit';
import { styles } from '../ui/styles';

type Result = 'Not run' | 'Checking…' | 'Passed' | 'Failed';

// Each check uses only public test values; no wallet entry is read.
const CHECKS: { name: string; libauth?: boolean; run(): Promise<void> }[] = [
  {
    name: 'Native SHA-256',
    libauth: true,
    async run() {
      if (binToHex(sha256.hash(new Uint8Array())) !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
        throw new Error('SHA-256 mismatch');
    },
  },
  {
    name: 'Schnorr sign and verify',
    libauth: true,
    async run() {
      const key = new Uint8Array(32);
      key[31] = 1;
      const digest = sha256.hash(Uint8Array.of(1, 2, 3));
      const publicKey = secp256k1.derivePublicKeyCompressed(key);
      const signature = secp256k1.signMessageHashSchnorr(key, digest);
      if (typeof publicKey === 'string' || typeof signature === 'string' || !secp256k1.verifySignatureSchnorr(signature, publicKey, digest))
        throw new Error('Schnorr mismatch');
    },
  },
  {
    name: 'Keychain round-trip',
    async run() {
      const options = { service: 'venn.development.check', accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
      await Keychain.setGenericPassword('public-check', 'public-test-value', options);
      const saved = await Keychain.getGenericPassword(options);
      await Keychain.resetGenericPassword(options);
      if (!saved || saved.password !== 'public-test-value') throw new Error('Keychain round-trip failed');
    },
  },
];

const initial = (): Result[] => CHECKS.map(() => 'Not run');

export default function DevelopmentChecks() {
  const [results, setResults] = useState<Result[]>(initial);
  const running = results.includes('Checking…');
  const check = async () => {
    const next: Result[] = CHECKS.map(() => 'Checking…');
    setResults([...next]);
    let ready = true;
    try {
      await initializeLibauth();
    } catch {
      ready = false;
    }
    for (const [n, item] of CHECKS.entries()) {
      try {
        if (item.libauth && !ready) throw new Error('libauth unavailable');
        await item.run();
        next[n] = 'Passed';
      } catch {
        next[n] = 'Failed';
      }
      setResults([...next]);
    }
  };
  if (!__DEV__) return <Page><Note>Development builds only.</Note></Page>;
  const failed = results.includes('Failed');
  return (
    <Page>
      <Text style={styles.body}>
        Checks the native crypto and secure-storage modules in this build. They use public test values and never read
        a wallet.
      </Text>
      <View style={[styles.detailCard, styles.sectionGap]}>
        {CHECKS.map((item, n) => (
          <DetailRow key={item.name} first={n === 0} label={item.name} value={results[n]} testID={`native-check-${n}`} />
        ))}
      </View>
      {failed ? <Note danger>At least one native check failed. Rebuild the development client and try again.</Note> : null}
      <View style={styles.sectionGap}>
        <PillButton label={running ? 'Checking…' : 'Run checks'} testID="run-native-checks" onPress={check} disabled={running} />
      </View>
    </Page>
  );
}
