import { Text } from 'react-native';
import { VennList } from '../../screens/Venns';
import { useApp } from '../../state/AppState';
import Page from '../../ui/Page';
import { styles } from '../../ui/styles';
import { open } from '../../navigation';

export default function VennsTab() {
  const { venns } = useApp();
  return <Page top><Text accessibilityRole="header" style={styles.title}>Venns</Text><VennList venns={venns} open={open} /></Page>;
}
