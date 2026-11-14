import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export type FilterOption = { value: string; label: string };

export function ListSearch({ value, onChangeText, placeholder, label }: {
  value: string; onChangeText: (text: string) => void; placeholder: string; label: string;
}) {
  return <TextInput
    accessibilityLabel={label}
    autoCorrect={false}
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor="#8A98A9"
    style={styles.search}
    returnKeyType="search"
  />;
}

export function ListFilters({ items, value, onChange }: {
  items: FilterOption[]; value: string; onChange: (value: string) => void;
}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filterContent}>
    {items.map(item => <Pressable
      key={item.value}
      accessibilityRole="button"
      accessibilityState={{ selected: item.value === value }}
      onPress={() => onChange(item.value)}
      style={[styles.filter, item.value === value && styles.filterActive]}
    >
      <Text style={[styles.filterText, item.value === value && styles.filterActiveText]}>{item.label}</Text>
    </Pressable>)}
  </ScrollView>;
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return <View style={[styles.chip, tone === 'success' && styles.chipSuccess, tone === 'warning' && styles.chipWarning, tone === 'danger' && styles.chipDanger, tone === 'info' && styles.chipInfo]}>
    <Text style={[styles.chipLabel, tone === 'success' && styles.labelSuccess, tone === 'warning' && styles.labelWarning, tone === 'danger' && styles.labelDanger, tone === 'info' && styles.labelInfo]}>{label}</Text>
  </View>;
}

export function ListMore({ label, onPress, busy = false }: { label: string; onPress: () => void; busy?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.moreButton, busy && styles.moreDisabled]}>
    {busy ? <ActivityIndicator color="#047857" size="small" /> : <Text style={styles.moreText}>{label}</Text>}
  </Pressable>;
}

export function LoadedHint({ text }: { text: string }) {
  return <Text style={styles.hint}>{text}</Text>;
}

const styles = StyleSheet.create({
  search: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE6EE', borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, fontSize: 14, color: '#14243A', marginBottom: 10 },
  filters: { flexGrow: 0, marginBottom: 12 },
  filterContent: { paddingRight: 10, gap: 8, alignItems: 'center' },
  filter: { borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DEE6EE' },
  filterActive: { backgroundColor: '#10263C', borderColor: '#10263C' },
  filterText: { color: '#54657B', fontSize: 12, fontWeight: '700' },
  filterActiveText: { color: '#FFFFFF' },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, alignSelf: 'flex-start', backgroundColor: '#EEF2F6' },
  chipSuccess: { backgroundColor: '#E2F7ED' },
  chipWarning: { backgroundColor: '#FFF2D6' },
  chipDanger: { backgroundColor: '#FCE7E7' },
  chipInfo: { backgroundColor: '#E7F0FB' },
  chipLabel: { color: '#4C5D72', fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  labelSuccess: { color: '#087456' },
  labelWarning: { color: '#9B6405' },
  labelDanger: { color: '#B42336' },
  labelInfo: { color: '#245D99' },
  moreButton: { backgroundColor: '#E6F5EF', borderColor: '#BFE6D6', borderWidth: 1, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12, marginTop: 3 },
  moreDisabled: { opacity: 0.6 },
  moreText: { color: '#076D56', fontSize: 13, fontWeight: '800' },
  hint: { fontSize: 11, color: '#708097', lineHeight: 17, marginBottom: 12 },
});
