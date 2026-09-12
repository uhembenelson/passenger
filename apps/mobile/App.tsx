import React, { useEffect } from "react";
import { Platform } from "react-native";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { WorkSans_400Regular } from "@expo-google-fonts/work-sans/400Regular";
import { WorkSans_500Medium } from "@expo-google-fonts/work-sans/500Medium";
import { WorkSans_600SemiBold } from "@expo-google-fonts/work-sans/600SemiBold";
import { AuthScreen, tokenStorage } from "./src/auth";
import { LiveDataProvider } from "./src/data";
import { Centered, PassengerShell } from "./src/screens";
import { AppLoadingScreen, Button, errorMessage, Notice, ScreenSkeleton, Txt, s } from "./src/ui";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim();
const missing = [!convexUrl && "EXPO_PUBLIC_CONVEX_URL"].filter(Boolean);
function validUrl(value?: string) { try { return !!value && ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; } }
function localOnlyUrl(value?: string) {
  try { return !!value && ["127.0.0.1", "localhost"].includes(new URL(value).hostname); }
  catch { return false; }
}
const nativeLoopbackBlocked = Platform.OS !== "web" && localOnlyUrl(convexUrl);
const configured = missing.length === 0 && validUrl(convexUrl) && !nativeLoopbackBlocked;
const client = configured ? new ConvexReactClient(convexUrl!) : undefined;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    WorkSansRegular: WorkSans_400Regular,
    WorkSansMedium: WorkSans_500Medium,
    WorkSansSemiBold: WorkSans_600SemiBold,
  });

  useEffect(() => {
    if (fontError) console.warn("Passenger could not load the bundled Work Sans fonts. Continuing with system fallbacks.", fontError);
  }, [fontError]);

  if (!fontsLoaded && !fontError) {
    return <SafeAreaProvider><StatusBar style="dark" /><AppLoadingScreen /></SafeAreaProvider>;
  }

  return <SafeAreaProvider><StatusBar style="dark" /><AppErrorBoundary>
    {!configured ? <Centered title="Good things start with a connection." detail="Passenger needs the shared backend URL before you can sign in.">
      <Notice tone="warning">{missing.length ? `Missing configuration: ${missing.join(" and ")}.` : nativeLoopbackBlocked ? "This device cannot reach a backend URL that uses localhost or 127.0.0.1." : "Check your Convex URL."}</Notice>
      <Txt style={s.h3}>Connect this app</Txt><Txt selectable style={s.muted}>{nativeLoopbackBlocked ? "Use your computer's LAN IP address or your Convex cloud URL for EXPO_PUBLIC_CONVEX_URL, then restart Expo." : "Set EXPO_PUBLIC_CONVEX_URL to the shared deployment URL, then restart Expo."}</Txt><Notice>Authentication runs inside Passenger's Convex backend. No Clerk configuration is required.</Notice>
    </Centered> : <ConvexAuthProvider client={client!} storage={tokenStorage}><LiveRoot /></ConvexAuthProvider>}
  </AppErrorBoundary></SafeAreaProvider>;
}
function LiveRoot() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return <AppLoadingScreen />;
  if (!isAuthenticated) return <AuthScreen />;
  return <LiveDataProvider><PassengerShell /></LiveDataProvider>;
}
class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error: errorMessage(error) }; }
  render() {
    if (this.state.error) return <Centered title="Let's get you reconnected." detail="We couldn't load your account. No local success has been assumed. Check your connection and service configuration, then try again."><Notice tone="error">{this.state.error}</Notice><Button title="Try again" onPress={() => this.setState({ error: null })} /></Centered>;
    return this.props.children;
  }
}
