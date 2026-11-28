import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const COUNTDOWN_SECONDS = 5;

export const SosCountdownModal: React.FC<Props> = ({ visible, onCancel, onConfirm }) => {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!visible) {
      setSecondsLeft(COUNTDOWN_SECONDS);
      return;
    }

    setSecondsLeft(COUNTDOWN_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onConfirm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>EMERGENCY SOS</Text>
          <Text style={styles.title}>Sending alert in</Text>
          <View style={styles.circle}>
            <Text style={styles.count}>{secondsLeft}</Text>
          </View>
          <Text style={styles.sub}>
            Your trusted contacts will receive your location and live-tracking link.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel SOS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sendBtn} onPress={onConfirm}>
              <Text style={styles.sendText}>Send Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 10, 20, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: colors.card,
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  eyebrow: { color: colors.danger, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 8 },
  circle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
    backgroundColor: "#3B0A0A",
  },
  count: { color: colors.text, fontSize: 42, fontWeight: "900" },
  sub: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 22 },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  cancelText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  sendBtn: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendText: { color: colors.text, fontSize: 15, fontWeight: "800" },
});
