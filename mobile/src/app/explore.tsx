import { Redirect } from 'expo-router';

// Legacy Expo starter route. Keep it from showing a non-Orevon page.
export default function LegacyExplore() {
  return <Redirect href="/" />;
}
