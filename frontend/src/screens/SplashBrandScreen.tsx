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
      <View style={styles.emblem}>
        <Text style={styles.emblemLetter}>N</Text>
      </View>
      <Text style={styles.brand}>NAVI</Text>
      <Text style={styles.subtitle}>Navigation Aware Vigilance Intelligence</Text>
      <Text style={styles.description}>
        Adaptive route awareness, real-time area risk scoring, and intelligent safety check-ins.
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
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emblem: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emblemLetter: {
    fontSize: 42,
    fontWeight: "800",
    color: colors.primary,
  },
  brand: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 6,
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 6,
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    marginTop: 18,
    lineHeight: 22,
  },
  actions: {
    width: "100%",
    marginTop: 42,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
});
