import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/authStore";
import { colors } from "../theme/colors";
import { AuthStackParamList } from "../navigation/types";

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, "Login">;
};

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    await login(email, password);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.eyebrow}>NAVI • PERSONAL SAFETY</Text>
      <Text style={styles.title}>Welcome back.</Text>
      <Text style={styles.subtitle}>Sign in to keep your safety tools close at hand.</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(v) => {
          clearError();
          setEmail(v);
        }}
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        placeholder="••••••••"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={(v) => {
          clearError();
          setPassword(v);
        }}
      />

      <TouchableOpacity
        style={[styles.btn, isLoading && styles.btnDisabled]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.btnText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Register")} style={styles.linkWrap}>
        <Text style={styles.linkText}>New to NAVI? Create an account</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: "center",
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, color: colors.primary, fontWeight: "800", marginBottom: 10 },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 7, marginBottom: 30, lineHeight: 20 },
  errorBox: {
    backgroundColor: "#3B151A",
    borderColor: colors.danger,
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
  },
  errorText: { color: "#FCA5A5", fontSize: 13 },
  label: { color: colors.subtle, fontSize: 11, marginBottom: 7, fontWeight: "800", letterSpacing: .7 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14, padding: 15,
    color: colors.text,
    fontSize: 15,
    marginBottom: 18,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.bg, fontSize: 16, fontWeight: "700" },
  linkWrap: { marginTop: 20, alignItems: "center" },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
});
