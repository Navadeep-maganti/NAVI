import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEFAULT_BASE_URL = Platform.OS === "android" ? process.env.EXPO_PUBLIC_API_URL : "http://localhost:5000";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_BASE_URL;
export const TOKEN_STORAGE_KEY = "navi_jwt_token";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
