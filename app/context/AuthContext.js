import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from 'react-native';
import { supabase } from "../subapaseClient";

const OFFLINE_PROFILE_KEY = '@offline_user_profile';

// Cómo se muestran las notificaciones con la app en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const MIME_POR_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

export const AuthContext = createContext({});

// 🔔 Registra el token de Expo del dispositivo en el perfil del usuario
async function registerForPushNotificationsAsync(userId) {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#88adff',
      });
    }

    if (!Device.isDevice) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      console.error("Falta el projectId de EAS.");
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token && userId) {
      const { error } = await supabase
        .from('usuarios')
        .update({ push_token: token })
        .eq('usuario_id', userId);
      if (error) console.error("Error guardando token:", error.message);
    }
    return token;
  } catch (error) {
    console.error("Error registrando notificaciones:", error.message);
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  const pushRegisteredFor = useRef(null);

  // 🔍 OBTENER EL PERFIL (devuelve false si la cuenta está suspendida)
  const fetchUserProfile = useCallback(async (supabaseUser) => {
    const baseUser = { id: supabaseUser.id, email: supabaseUser.email, user_metadata: supabaseUser.user_metadata };
    try {
      const { data: profile, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("usuario_id", supabaseUser.id)
        .maybeSingle();
      if (error) throw error;

      // Cuenta suspendida desde el panel de administración
      if (profile?.activo === false) {
        await supabase.auth.signOut();
        await AsyncStorage.removeItem(OFFLINE_PROFILE_KEY);
        setUser(null);
        Alert.alert("Cuenta suspendida", "Tu cuenta ha sido suspendida. Contacta al administrador.");
        return false;
      }

      const finalUser = { ...baseUser, profile: profile || null };
      await AsyncStorage.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(finalUser));
      setUser(finalUser);
      return true;
    } catch (err) {
      // Sin conexión: se usa el perfil cacheado si pertenece al mismo usuario
      console.error("Error en fetchUserProfile:", err.message);
      const cachedData = await AsyncStorage.getItem(OFFLINE_PROFILE_KEY);
      const cached = cachedData ? JSON.parse(cachedData) : null;
      setUser(cached?.id === supabaseUser.id ? cached : { ...baseUser, profile: null });
      return true;
    }
  }, []);

  // 🔗 DEEP LINKS (recuperación de contraseña)
  useEffect(() => {
    const processDeepLink = async (url) => {
      if (!url) return;
      const type = url.match(/type=([^&]+)/)?.[1];
      const accessToken = url.match(/access_token=([^&]+)/)?.[1];
      const refreshToken = url.match(/refresh_token=([^&]+)/)?.[1];
      const code = Linking.parse(url).queryParams?.code;

      if (type === 'recovery' || url.includes("reset-password")) {
        setNeedsPasswordReset(true);
      }

      try {
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        } else if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (error) {
        console.error("Error procesando el enlace:", error);
      }
    };

    Linking.getInitialURL().then(processDeepLink);
    const subscription = Linking.addEventListener('url', ({ url }) => processDeepLink(url));
    return () => subscription.remove();
  }, []);

  // ⚡ SESIÓN: onAuthStateChange emite INITIAL_SESSION al suscribirse,
  // así que no hace falta llamar a getSession() aparte (evita cargar el perfil dos veces).
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setNeedsPasswordReset(true);

      // Supabase recomienda no esperar otras llamadas de supabase dentro del callback
      // (puede bloquear el cliente), por eso se difiere con setTimeout.
      setTimeout(async () => {
        try {
          if (!session) {
            setUser(null);
            pushRegisteredFor.current = null;
            return;
          }
          // TOKEN_REFRESHED no cambia el perfil: no hace falta recargarlo
          if (event === 'TOKEN_REFRESHED') return;

          const activo = await fetchUserProfile(session.user);
          if (activo && pushRegisteredFor.current !== session.user.id) {
            pushRegisteredFor.current = session.user.id;
            registerForPushNotificationsAsync(session.user.id);
          }
        } catch (error) {
          console.error("Error Auth:", error);
        } finally {
          setLoading(false);
        }
      }, 0);
    });

    return () => authListener?.subscription?.unsubscribe();
  }, [fetchUserProfile]);

  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await fetchUserProfile(session.user);
  }, [fetchUserProfile]);

  const updateUser = useCallback((updatedData) => {
    setUser((prev) => {
      if (!prev) return null;
      const newUserState = { ...prev, profile: { ...prev.profile, ...updatedData.profile } };
      AsyncStorage.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(newUserState)).catch(e => console.error(e));
      return newUserState;
    });
  }, []);

  // 📷 ACTUALIZAR AVATAR
  const updateAvatar = useCallback(async (imageUri) => {
    const userId = user?.id;
    if (!userId) throw new Error("No hay sesión activa.");

    const base64Data = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
    const fileExt = (imageUri.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, decode(base64Data), { contentType: MIME_POR_EXTENSION[fileExt] || 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);

    const { error: profileError } = await supabase
      .from("usuarios")
      .update({ foto_url: urlData.publicUrl })
      .eq("usuario_id", userId);
    if (profileError) throw profileError;

    updateUser({ profile: { foto_url: urlData.publicUrl } });
    return urlData.publicUrl;
  }, [user?.id, updateUser]);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Se limpia el estado local aunque falle la red
      await AsyncStorage.removeItem(OFFLINE_PROFILE_KEY);
      setNeedsPasswordReset(false);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, logout, updateUser, updateAvatar, needsPasswordReset, setNeedsPasswordReset, refreshProfile }),
    [user, loading, logout, updateUser, updateAvatar, needsPasswordReset, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
