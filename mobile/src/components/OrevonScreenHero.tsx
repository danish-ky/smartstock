import { StyleSheet, Text, View } from 'react-native';

type Stat = { label: string; value: string | number };
type Props = {
  eyebrow: string;
  title: string;
  description: string;
  stats: Stat[];
};

// Presentation-only component. Never fetches data, changes stock, or alters permissions.
export function OrevonScreenHero({ eyebrow, title, description, stats }: Props) {
  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.orbLarge} />
      <View pointerEvents="none" style={styles.orbSmall} />
      <Text style={styles.eyebrow}>OREVON  /  {eyebrow.toUpperCase()}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {stats.length > 0 && (
        <View style={styles.statRow}>
          {stats.slice(0, 3).map((stat, index) => (
            <View key={`${stat.label}-${index}`} style={[styles.stat, index > 0 && styles.statDivider]}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {stat.value}
              </Text>
              <Text style={styles.statLabel} numberOfLines={1}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#12243A',
    borderRadius: 22,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 18,
    marginBottom: 18,
    overflow: 'hidden',
  },
  orbLarge: {
    position: 'absolute', right: -68, top: -78,
    width: 210, height: 210, borderRadius: 110,
    borderWidth: 1, borderColor: 'rgba(110,230,180,0.20)',
    backgroundColor: 'rgba(32,160,122,0.09)',
  },
  orbSmall: {
    position: 'absolute', right: -10, top: 30,
    width: 85, height: 85, borderRadius: 48,
    backgroundColor: 'rgba(77,220,173,0.12)',
  },
  eyebrow: {
    color: '#6CE3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1.7,
    marginBottom: 11,
  },
  title: {
    color: '#FFFFFF', fontSize: 25, fontWeight: '800', letterSpacing: -0.5,
    marginBottom: 8,
  },
  description: {
    color: '#B9CBDA', fontSize: 13, lineHeight: 20, maxWidth: 290,
  },
  statRow: {
    flexDirection: 'row', borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)', paddingTop: 16, marginTop: 19,
  },
  stat: { flex: 1, minWidth: 0, paddingRight: 8 },
  statDivider: {
    borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)',
    paddingLeft: 14,
  },
  statValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#A9C1D0', fontSize: 10, marginTop: 5, fontWeight: '600' },
});
