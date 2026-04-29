import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { checkAndCopyNewWeek } from '../modules/nutrition/services/dietCopyService';
import { checkAndPlanNewWeeks } from '../modules/training/services/trainingPlanService';
import { NutritionSettingsJson } from '../types/requests.types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  setIsPasswordRecovery: (value: boolean) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  setIsPasswordRecovery: () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;

    const handleIncomingUrl = async (url: string) => {
      try {
        // Seguridad: solo aceptamos links de nuestro scheme
        if (!url.startsWith('alzan://')) return;

        const { queryParams } = Linking.parse(url);
        const code = queryParams?.code as string | undefined;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.warn('[Auth] exchangeCodeForSession:', error.message);
        }
      } catch (e) {
        console.warn('[Auth] handleIncomingUrl error:', e);
      }
    };

    // Si la app se abre desde cerrado (link inicial)
    Linking.getInitialURL().then(url => {
      if (mounted && url) handleIncomingUrl(url);
    });

    // Si la app ya está abierta y llega un link
    const linkSub = Linking.addEventListener('url', event => {
      handleIncomingUrl(event.url);
    });

    // Helper to check and run auto-copy if needed
    const checkAndRunAutoCopy = async (userId: string) => {
      try {
        console.log('┌─────────────────────────────────────────────────┐');
        console.log('│ [Auth] 🔍 VERIFICANDO AUTO-COPIA DE DATOS      │');
        console.log('└─────────────────────────────────────────────────┘');

        // Fetch user preferences
        const { data: prefs, error } = await supabase
          .from('user_preferences')
          .select('nutrition_prefs')
          .eq('user_id', userId)
          .maybeSingle();

        if (error || !prefs?.nutrition_prefs) {
          console.log('[Auth] ℹ️  No se encontraron preferencias de usuario');
          return;
        }

        const nutritionPrefs = prefs.nutrition_prefs;
        const copyMode = nutritionPrefs?.copy_mode as 'sequential' | 'alternating';

        // ----------------------------------------------------
        // 1. DIET AUTO-COPY
        // ----------------------------------------------------
        let prefsUpdated = false;
        const newNutritionPrefs: NutritionSettingsJson = { ...nutritionPrefs };

        if (copyMode) {
          console.log(`[Auth] 📝 Modo dieta activo: ${copyMode}`);
          const dietResult = await checkAndCopyNewWeek(userId, copyMode, nutritionPrefs.last_visible_week);

          if (dietResult.copied) {
            console.log(`[Auth] ✅ Dieta: Copiados ${dietResult.copiedCount} registros`);
            newNutritionPrefs.last_visible_week = dietResult.newLastVisibleWeek;
            prefsUpdated = true;
          }
        } else {
          console.log('[Auth] ⏸️  Dieta: Auto-copia desactivada');
        }

        // ----------------------------------------------------
        // 2. TRAINING AUTO-PLANNING
        // ----------------------------------------------------
        const trainingResult = await checkAndPlanNewWeeks(userId, nutritionPrefs.last_planned_training_week);

        if (trainingResult.planned) {
          console.log(`[Auth] ✅ Entreno: Planificados ${trainingResult.createdCount} sesiones`);
          newNutritionPrefs.last_planned_training_week = trainingResult.newLastPlannedWeek;
          prefsUpdated = true;
        } else {
          // Update pointer even if nothing created (to avoid re-checking empty weeks)
          if (trainingResult.newLastPlannedWeek !== nutritionPrefs.last_planned_training_week) {
            newNutritionPrefs.last_planned_training_week = trainingResult.newLastPlannedWeek;
            prefsUpdated = true;
          }
        }

        // ----------------------------------------------------
        // SAVE PREFS IF NEEDED
        // ----------------------------------------------------
        if (prefsUpdated) {
          await supabase
            .from('user_preferences')
            .update({
              nutrition_prefs: newNutritionPrefs,
            })
            .eq('user_id', userId);

          console.log('[Auth] 💾 Preferencias (Nutrición/Entreno) actualizadas');
        }
      } catch (error) {
        console.error('[Auth] ❌ Error en verificación de auto-copia:', error);
      }
    };

    const fetchSession = async () => {
      console.log('[Auth] Iniciando verificación de sesión...');
      try {
        // 1. Obtener sesión de Supabase (AsyncStorage)
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          // Handle "Invalid Refresh Token" or other non-critical auth errors silently
          if (sessionError.name === 'AuthApiError' && sessionError.message.includes('Refresh Token')) {
            console.warn('[Auth] Sesión expirada o token inválido:', sessionError.message);
            await supabase.auth.signOut();
            await AsyncStorage.clear();
            if (mounted) setSession(null);
            return;
          }

          console.error('[Auth] Error obteniendo sesión:', sessionError);
          throw sessionError;
        }

        if (session) {
          console.log('[Auth] Token encontrado. User ID:', session.user.id);

          // 2. Verificar existencia real en public.users
          console.log('[Auth] Verificando usuario en base de datos...');
          const { data: userExists, error: dbError } = await supabase
            .from('users')
            .select('id')
            .eq('id', session.user.id)
            .maybeSingle(); // Usar maybeSingle para evitar error si no existe

          if (dbError) {
            console.error('[Auth] Error verificando DB:', dbError);
            // Si hay error de conexión, quizás no queramos cerrar sesión inmediatamente,
            // pero por seguridad en este caso asumimos fallo.
            throw dbError;
          }

          if (!userExists) {
            console.warn('[Auth] ¡CRÍTICO! El usuario tiene token pero NO existe en DB. Cerrando sesión forzosamente.');
            await supabase.auth.signOut();
            await AsyncStorage.clear(); // Limpieza agresiva
            if (mounted) setSession(null);
          } else {
            console.log('[Auth] Usuario verificado correctamente en DB.');
            if (mounted) setSession(session);

            // Check auto-copy diet feature
            checkAndRunAutoCopy(session.user.id);
          }
        } else {
          console.log('[Auth] No hay sesión activa.');
          if (mounted) setSession(null);
        }
      } catch (error) {
        console.warn('[Auth] Error en inicialización de sesión (se tratará como invitado):', error);
        // No llamamos a signOut/clear aquí de forma agresiva a menos que sea necesario
        // para evitar bucles de errores si Supabase está caído.
        if (mounted) setSession(null);
      } finally {
        console.log('[Auth] Finalizando carga inicial.');
        if (mounted) setLoading(false);
      }
    };

    fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('[Auth] Cambio de estado detectado:', _event);
      if (!mounted) return;

      // Si el evento es TOKEN_REFRESHED o SIGNED_IN, confiar en la sesión nueva
      // Si es SIGNED_OUT, limpiar.
      setSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  const signOut = async () => {
    console.log('Cerrando sesión...');
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error en supabase.signOut:', error);
    }

    // Limpiar AsyncStorage completamente (forzar cierre)
    try {
      await AsyncStorage.clear();
      console.log('AsyncStorage limpiado');
    } catch (error) {
      console.error('Error limpiando AsyncStorage:', error);
    }

    // Forzar limpieza del estado
    setSession(null);
    console.log('Sesión cerrada');
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut, setIsPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
