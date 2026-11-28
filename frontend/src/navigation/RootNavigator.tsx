import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "../store/authStore";
import { SplashBrandScreen } from "../screens/SplashBrandScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { ProfileSetupScreen } from "../screens/ProfileSetupScreen";
import { LocationPermissionScreen } from "../screens/LocationPermissionScreen";
import { NotificationPermissionScreen } from "../screens/NotificationPermissionScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LiveMapScreen } from "../screens/LiveMapScreen";
import { SafeSessionsScreen } from "../screens/SafeSessionsScreen";
import { TrustedContactsScreen } from "../screens/TrustedContactsScreen";
import { colors } from "../theme/colors";
import { AuthStackParamList, MainTabParamList, OnboardingStackParamList } from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();

export const RootNavigator: React.FC = () => {
  const { token, isHydrated, onboardingCompleted, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate().finally(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
  }, [hydrate]);

  if (!isHydrated) {
    return <SplashBrandScreen loadingOnly />;
  }

  return (
    <NavigationContainer>
      {!token ? (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Welcome" component={SplashBrandScreen} />
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
        </AuthStack.Navigator>
      ) : !onboardingCompleted ? (
        <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
          <OnboardingStack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
          <OnboardingStack.Screen name="LocationPermission" component={LocationPermissionScreen} />
          <OnboardingStack.Screen name="NotificationPermission" component={NotificationPermissionScreen} />
        </OnboardingStack.Navigator>
      ) : (
        <MainTabs.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.muted,
          }}
        >
          <MainTabs.Screen name="Dashboard" component={HomeScreen} options={{ tabBarLabel: "Dashboard" }} />
          <MainTabs.Screen name="LiveMap" component={LiveMapScreen} options={{ tabBarLabel: "Live Map" }} />
          <MainTabs.Screen name="Sessions" component={SafeSessionsScreen} options={{ tabBarLabel: "Sessions" }} />
          <MainTabs.Screen name="Contacts" component={TrustedContactsScreen} options={{ tabBarLabel: "Contacts" }} />
        </MainTabs.Navigator>
      )}
    </NavigationContainer>
  );
};
