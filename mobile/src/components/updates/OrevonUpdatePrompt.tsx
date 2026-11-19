
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';

export default function OrevonUpdatePrompt() {
  useEffect(() => {
    // Only check in update-enabled Android builds.
    if (__DEV__ || Platform.OS !== 'android' || !Updates.isEnabled) {
      return;
    }

    let active = true;

    const checkForUpdates = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();

        if (!active || !result.isAvailable) {
          return;
        }

        Alert.alert(
          'Update Available',
          'A new Orevon update is available. Would you like to install it now?',
          [
            {
              text: 'Later',
              style: 'cancel',
            },
            {
              text: 'Update Now',
              onPress: () => {
                void (async () => {
                  try {
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                  } catch {
                    Alert.alert(
                      'Update failed',
                      'Please try again later.'
                    );
                  }
                })();
              },
            },
          ],
          { cancelable: true }
        );
      } catch {
        // Network errors must not interrupt normal app functionality.
      }
    };

    void checkForUpdates();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
