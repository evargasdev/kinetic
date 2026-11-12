import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { traducirAlEspanol } from '../../utils/traducir';

export default function DetailLibrary({ route }) {
  const { id } = route.params;
  const { i18n } = useTranslation();
  const [ejercicios, setEjercicios] = useState(null);
  const [error, setError] = useState(false);
  const [reintento, setReintento] = useState(0);

  // Se recarga si cambia el ejercicio o el idioma
  useEffect(() => {
    let cancelado = false;

    const obtenerEjercicio = async () => {
      try {
        setEjercicios(null);
        setError(false);
        const response = await fetch(`https://oss.exercisedb.dev/api/v1/exercises/${id}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { data: ex } = await response.json();
        if (!ex) throw new Error("Ejercicio no encontrado");

        let resultado = ex;
        if (i18n.language === 'es') {
          const [nombre, musculos, instrucciones] = await Promise.all([
            traducirAlEspanol(ex.name),
            Promise.all((ex.targetMuscles || []).map(traducirAlEspanol)),
            Promise.all((ex.instructions || []).map(traducirAlEspanol)),
          ]);
          resultado = { ...ex, name: nombre, targetMuscles: musculos, instructions: instrucciones };
        }
        if (!cancelado) setEjercicios(resultado);
      } catch (err) {
        console.error("Error cargando ejercicio:", err.message);
        if (!cancelado) setError(true);
      }
    };

    obtenerEjercicio();
    return () => { cancelado = true; };
  }, [id, i18n.language, reintento]);

  if (error) {
    return (
      <View style={[styles.container, styles.loadingcontent]}>
        <Text style={styles.stepText}>
          {i18n.language === 'es' ? "No se pudo cargar el ejercicio." : "Could not load the exercise."}
        </Text>
        <TouchableOpacity onPress={() => setReintento((n) => n + 1)} style={{ marginTop: 16 }}>
          <Text style={[styles.cardTitle, { color: '#88adff' }]}>
            {i18n.language === 'es' ? "Reintentar" : "Retry"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!ejercicios) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingcontent}>
          <ActivityIndicator size="large" color="#88adff" />
        </View>
      </View>
    );
  }

  const formatStep = (text) => {
    return text.replace(/Step:\d+/i, "").trim();
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          
          <Image source={{ uri: ejercicios.gifUrl }} style={styles.image} />

          <Text style={styles.title}>{(ejercicios.name || "").toUpperCase()}</Text>

          <Text style={styles.tag}>{ejercicios.targetMuscles?.join(", ").toUpperCase()}</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{i18n.language === 'es' ? "Instrucciones" : "Instructions"}</Text>

            {ejercicios.instructions?.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{formatStep(step)}</Text>
              </View>
            ))}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0e10" },
  scrollContent: { paddingBottom: 140 }, 
  header: { marginTop: 40, padding: 16, backgroundColor: "#111416", alignItems: "center" },
  headerTitle: { fontFamily: "Lexend_800ExtraBold", fontSize: 18, color: "#eeeef0" },
  content: { padding: 16 },
  loadingcontent: { flex: 1, justifyContent: "center", alignItems: "center" },
  image: { width: "100%", height: 350, borderRadius: 12, marginBottom: 16 },
  title: { fontSize: 24, color: "#fff", fontFamily: "Lexend_800ExtraBold", marginBottom: 4, textAlign: "center" },
  tag: { color: "#88adff", marginBottom: 16, letterSpacing: 1, textAlign: "center", fontFamily: "Manrope_600SemiBold" },
  card: { backgroundColor: "#171a1c", borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 16, color: "#eeeef0", fontFamily: "Lexend_700Bold", marginBottom: 12 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  stepBadge: { backgroundColor: "#88adff", width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center", marginRight: 10 },
  stepNumber: { color: "#002052", fontWeight: "bold", fontSize: 12 },
  stepText: { color: "#aaabad", flex: 1, lineHeight: 18, fontFamily: "Manrope_400Regular" },
});