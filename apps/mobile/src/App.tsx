import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { loadConfig, needsServer } from "./lib/config";
import { C, SiteProvider, useColors } from "./lib/site";
import { AuthProvider } from "./lib/auth";
import { ShopProvider, useShop } from "./lib/shop";
import { RestartCtx } from "./lib/restart";
import type { IconName } from "./ui";
import HomeScreen from "./screens/HomeScreen";
import ShopScreen from "./screens/ShopScreen";
import VehicleScreen from "./screens/VehicleScreen";
import ChatScreen from "./screens/ChatScreen";
import { CartScreen, CheckoutScreen, OrdersScreen, WishlistScreen } from "./screens/CartScreens";
import { AuthScreen, BankScreen, BlogPostScreen, BlogScreen, ContactScreen, FaqScreen, InvoiceScreen, InvoicesScreen, MenuScreen, PageScreen, ProfileScreen, ServerScreen, ServicesScreen } from "./screens/MenuScreens";

void SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();
const stacks = {
  HomeTab: createNativeStackNavigator(),
  ShopTab: createNativeStackNavigator(),
  ChatTab: createNativeStackNavigator(),
  CartTab: createNativeStackNavigator(),
  MenuTab: createNativeStackNavigator(),
};

/** Screens every tab can push, so the tab bar stays on screen wherever the buyer goes. */
function shared(S: ReturnType<typeof createNativeStackNavigator>) {
  return (
    <>
      <S.Screen name="Vehicle" component={VehicleScreen} options={{ title: "Vehicle" }} />
      <S.Screen name="Auth" component={AuthScreen} options={{ title: "Sign in" }} />
      <S.Screen name="Checkout" component={CheckoutScreen} options={{ title: "Checkout" }} />
      <S.Screen name="Orders" component={OrdersScreen} options={{ title: "My orders" }} />
      <S.Screen name="Wishlist" component={WishlistScreen} options={{ title: "Saved cars" }} />
      <S.Screen name="Invoices" component={InvoicesScreen} options={{ title: "My invoices" }} />
      <S.Screen name="Invoice" component={InvoiceScreen} options={{ title: "Invoice" }} />
      <S.Screen name="Profile" component={ProfileScreen} options={{ title: "My profile" }} />
      <S.Screen name="Page" component={PageScreen} options={{ title: "" }} />
      <S.Screen name="Blog" component={BlogScreen} options={{ title: "Guides" }} />
      <S.Screen name="BlogPost" component={BlogPostScreen} options={{ title: "" }} />
      <S.Screen name="Faq" component={FaqScreen} options={{ title: "FAQ" }} />
      <S.Screen name="Services" component={ServicesScreen} options={{ title: "Services" }} />
      <S.Screen name="Contact" component={ContactScreen} options={{ title: "Contact us" }} />
      <S.Screen name="Bank" component={BankScreen} options={{ title: "Bank details" }} />
      <S.Screen name="Server" component={ServerScreen} options={{ title: "Server address" }} />
    </>
  );
}

function useStackOptions(): NativeStackNavigationOptions {
  const col = useColors();
  return { headerTintColor: col.brand, headerTitleStyle: { fontWeight: "700", color: C.ink }, headerShadowVisible: false, headerStyle: { backgroundColor: "#fff" }, contentStyle: { backgroundColor: C.bg }, headerBackTitle: "Back" };
}

function makeTab(key: keyof typeof stacks, rootName: string, Root: React.ComponentType<object>, title: string, headerShown = true) {
  const S = stacks[key];
  return function TabStack() {
    const opts = useStackOptions();
    return (
      <S.Navigator screenOptions={opts}>
        <S.Screen name={rootName} component={Root} options={{ title, headerShown }} />
        {shared(S)}
      </S.Navigator>
    );
  };
}

const HomeStack = makeTab("HomeTab", "Home", HomeScreen, "Home", false);
const ShopStack = makeTab("ShopTab", "Shop", ShopScreen, "Shop");
const ChatStack = makeTab("ChatTab", "Chat", ChatScreen, "Chat");
const CartStack = makeTab("CartTab", "Cart", CartScreen, "Cart");
const MenuStack = makeTab("MenuTab", "Menu", MenuScreen, "Menu");

const ICONS: Record<string, [IconName, IconName]> = {
  HomeTab: ["home", "home-outline"],
  ShopTab: ["car-sport", "car-sport-outline"],
  ChatTab: ["chatbubbles", "chatbubbles-outline"],
  CartTab: ["cart", "cart-outline"],
  MenuTab: ["menu", "menu-outline"],
};

function Tabs() {
  const col = useColors();
  const { cart } = useShop();
  const insets = useSafeAreaInsets();
  const count = cart?.items.length ?? 0;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: col.brand,
        tabBarInactiveTintColor: C.muted,
        // the default 49 pt bar squeezes the label under the icon and clips its descenders
        tabBarStyle: { height: 60 + insets.bottom, paddingTop: 4 },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
        tabBarIcon: ({ focused, color, size }) => <Ionicons name={ICONS[route.name]![focused ? 0 : 1]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: "Home" }} />
      <Tab.Screen name="ShopTab" component={ShopStack} options={{ title: "Shop" }} />
      <Tab.Screen name="ChatTab" component={ChatStack} options={{ title: "Chat" }} />
      <Tab.Screen name="CartTab" component={CartStack} options={{ title: "Cart", tabBarBadge: count ? count : undefined, tabBarBadgeStyle: { backgroundColor: col.accent, color: C.ink, fontWeight: "700" } }} />
      <Tab.Screen name="MenuTab" component={MenuStack} options={{ title: "Menu" }} />
    </Tab.Navigator>
  );
}

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg } };

function Boot() {
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    void loadConfig().finally(() => {
      setReady(true);
      void SplashScreen.hideAsync().catch(() => {});
    });
  }, []);
  const restart = useCallback(() => setEpoch((e) => e + 1), []);
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.brand }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  return (
    <RestartCtx.Provider value={restart}>
      {needsServer() ? (
        <ServerScreen standalone onSaved={restart} />
      ) : (
        <SiteProvider key={`site${epoch}`}>
          <AuthProvider key={`auth${epoch}`}>
            <ShopProvider>
              <NavigationContainer theme={navTheme}>
                <Tabs />
              </NavigationContainer>
            </ShopProvider>
          </AuthProvider>
        </SiteProvider>
      )}
    </RestartCtx.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Boot />
    </SafeAreaProvider>
  );
}
