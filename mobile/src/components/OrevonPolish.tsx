/** Decorative, OTA-safe UI polish. Uses only React Native primitives and a bundled PNG. */
import { Image, StyleSheet, View } from 'react-native';

export const OrevonPalette = {
  navy: '#122A3B',
  ink: '#173048',
  muted: '#667B8D',
  emerald: '#0AA586',
  deepEmerald: '#087D65',
  mint: '#E2F8EF',
  canvas: '#F3F9F7',
  line: '#DBEBE6',
} as const;

/** Place as the first child of an existing Pressable; it never handles touches. */
export function EmeraldGradient({ radius = 14 }: { radius?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Image
        source={require('../../assets/images/orevon-ui-gradient.png')}
        resizeMode="stretch"
        style={StyleSheet.absoluteFill}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
