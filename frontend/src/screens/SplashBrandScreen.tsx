import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../theme/colors";
import { AuthStackParamList } from "../navigation/types";

type Props = {
  navigation?: NativeStackNavigationProp<AuthStackParamList, "Welcome">;
  loadingOnly?: boolean;
};

export const SplashBrandScreen: React.FC<Props> = ({ navigation, loadingOnly }) => {
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}><View style={styles.emblem}><View style={styles.innerEmblem}><Text style={styles.emblemLetter}>N</Text></View></View><View><Text style={styles.brand}>NAVI</Text><Text style={styles.tagline}>PERSONAL SAFETY, REASSURED</Text></View></View>
      <Text style={styles.subtitle}>Feel safer, wherever your day takes you.</Text>
      <Text style={styles.description}>
        Smart route awareness and simple check-ins—designed to quietly support you when it matters.
      </Text>

      {!loadingOnly && navigation && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate("Register")}
          >
            <Text style={styles.primaryBtnText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center", paddingHorizontal: 28,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  emblem: {
    width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
  innerEmblem: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: "rgba(8,26,36,.35)", alignItems: "center", justifyContent: "center" },
  emblemLetter: {
    fontSize: 27,
    fontWeight: "800",
    color: colors.bg,
  },
  brand: {
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: 3,
    color: colors.text,
  },
  tagline: { fontSize: 9, color: colors.primary, marginTop: 3, letterSpacing: 1.05, fontWeight: "800" },
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary, marginTop: 26, letterSpacing: 1.1, textAlign: "center",
  },
  description: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    marginTop: 28,
    lineHeight: 22,
  },
  actions: {
    width: "100%",
    marginTop: 38,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: "center",
  },
  primaryBtnText: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#355763",
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
});
