import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import React from 'react';
import { Text, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MyNavigation } from './app/MyNav';
import { AuthProvider } from './app/context/AuthContext';

// FONTS
import { Lexend_700Bold, Lexend_800ExtraBold } from '@expo-google-fonts/lexend';
import {
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';

// Las notificaciones (permisos, canal de Android y token) se configuran en AuthContext
// una vez que el usuario inicia sesión, para poder guardar el token en su perfil.

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0c0e10', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#eeeef0', fontFamily: 'Lexend_700Bold', fontSize: 16, textAlign: 'center' }}>
            Algo salió mal. Reinicia la app.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const linking = {
  prefixes: [Linking.createURL('/'), 'kinetic://'],
  config: {
    screens: {
      ResetPassword: 'reset-password',
    },
  },
};

export default function App() {

  const [fontsLoaded] = useFonts({
    Lexend_700Bold,
    Lexend_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SafeAreaProvider>
          <NavigationContainer linking={linking}>
            <PaperProvider>
              <MyNavigation />
            </PaperProvider>
          </NavigationContainer>
        </SafeAreaProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}