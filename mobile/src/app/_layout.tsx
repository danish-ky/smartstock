import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="management" options={{ headerShown: true, title: 'Management' }} />
        <Stack.Screen name="reports" options={{ headerShown: true, title: 'Reports' }} />
        <Stack.Screen name="team" options={{ headerShown: true, title: 'Team & Access' }} />
        <Stack.Screen name="purchase-orders" options={{ headerShown: true, title: 'Purchase orders' }} />
        <Stack.Screen name="explore" />
      </Stack>
    </AuthProvider>
  );
}
