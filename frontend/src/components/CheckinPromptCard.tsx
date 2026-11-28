import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { PendingCheckin } from "../store/safetyStore";
import { colors } from "../theme/colors";

type Props = {
  checkin: PendingCheckin;
  onRespond: (response: "safe" | "need_help", safeDurationMinutes?: number) => Promise<void>;
};

const QUICK_DURATIONS = [45, 120, 240];

export const CheckinPromptCard: React.FC<Props> = ({ checkin, onRespond }) => {
  const [durationText, setDurationText] = useState("45");

  const parsedMinutes = () => {
    const n = Number(durationText);
    if (!Number.isFinite(n) || n < 5) return 45;
    return Math.min(720, Math.round(n));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Safety Check-In Required</Text>
      <Text style={styles.sub}>
        Risk level: {checkin.contextualRiskLevel.toUpperCase()} • Respond before{" "}
        {new Date(checkin.checkinDeadline).toLocaleTimeString()}
      </Text>

      <Text style={styles.durationLabel}>Pause check-ins at this location for (mins):</Text>
      <View style={styles.durationRow}>
        {QUICK_DURATIONS.map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.chip, Number(durationText) === m && styles.chipActive]}
            onPress={() => setDurationText(String(m))}
          >
            <Text style={[styles.chipText, Number(durationText) === m && styles.chipTextActive]}>
              {m >= 60 ? `${m / 60}h` : `${m}m`}
            </Text>
          </TouchableOpacity>
        ))}
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={durationText}
          onChangeText={setDurationText}
          placeholder="45"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.success }]}
          onPress={() => onRespond("safe", parsedMinutes())}
        >
          <Text style={styles.btnText}>I&apos;m Safe ({parsedMinutes()}m)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.danger }]}
          onPress={() => onRespond("need_help")}
        >
          <Text style={styles.btnText}>Need Help</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#451A03",
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  title: { color: "#FDE68A", fontSize: 16, fontWeight: "800" },
  sub: { color: "#FCD34D", fontSize: 13, marginTop: 4, marginBottom: 10 },
  durationLabel: { color: "#FDE68A", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: "#B45309",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.warning, borderColor: colors.warning },
  chipText: { color: "#FDE68A", fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#0B1220" },
  input: {
    width: 64,
    backgroundColor: "#291002",
    borderColor: "#B45309",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    color: "#FDE68A",
    fontSize: 13,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  btnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
});
