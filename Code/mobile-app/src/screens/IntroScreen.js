import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FEATURE_ITEMS = [
  {
    icon: "1",
    title: "Create your household group",
    description: "Set up a household, then invite family members so everyone can track one filter together.",
  },
  {
    icon: "2",
    title: "Connect your water filter monitor",
    description:
      "Link your household water filter to your group using the app provisioning flow.",
  },
  {
    icon: "3",
    title: "Get low-filter alerts together",
    description: "All group members are alerted when the water level is running low and needs refilling.",
  },
];

export default function IntroScreen({ onContinue }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const heroAnim = useRef(new Animated.Value(0)).current;
  const featureAnims = useRef(FEATURE_ITEMS.map(() => new Animated.Value(0))).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const featureTransforms = useMemo(
    () =>
      featureAnims.map((anim) => ({
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      })),
    [featureAnims]
  );

  useEffect(() => {
    const introAnim = Animated.sequence([
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.stagger(
        100,
        featureAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 330,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ),
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    introAnim.start();
    glowLoop.start();

    return () => {
      introAnim.stop();
      glowLoop.stop();
    };
  }, [buttonAnim, featureAnims, glowAnim, heroAnim]);

  const heroStyle = {
    opacity: heroAnim,
    transform: [
      {
        translateY: heroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
      {
        scale: glowAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.015],
        }),
      },
    ],
  };

  const buttonStyle = {
    opacity: buttonAnim,
    transform: [
      {
        translateY: buttonAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.container, isCompact && styles.containerCompact]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.heroCard, heroStyle]}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>
            Household water filter monitoring made simple.
          </Text>
          <Text style={styles.subtitle}>
            Create a household group, connect your water filter to the app, and keep everyone informed before water levels get too low.
          </Text>
        </Animated.View>

        <View style={styles.featureList}>
          {FEATURE_ITEMS.map((item, index) => (
            <Animated.View key={item.title} style={[styles.featureCard, featureTransforms[index]]}>
              <View style={styles.iconWrap}>
                <Text style={styles.iconText}>{item.icon}</Text>
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>{item.title}</Text>
                <Text style={styles.featureDescription}>{item.description}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <Animated.View style={[styles.footer, buttonStyle]}>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={onContinue}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </Pressable>
          <Text style={styles.caption}>
            You can reopen this page from the login screen any time.
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 16,
  },
  containerCompact: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  heroCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#bae6fd",
    gap: 8,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#0c4a6e",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 36,
  },
  titleCompact: {
    fontSize: 26,
    lineHeight: 32,
  },
  subtitle: {
    color: "#334155",
    fontSize: 15,
    lineHeight: 22,
  },
  featureList: {
    gap: 10,
  },
  featureCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    flexDirection: "row",
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0ea5e9",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  iconText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  featureContent: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  featureDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
  },
  footer: {
    gap: 10,
    marginTop: 2,
  },
  primaryButton: {
    backgroundColor: "#0284c7",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  caption: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 12,
  },
  pressed: {
    opacity: 0.88,
  },
});
