import { KeyboardAvoidingView, StyleSheet } from "react-native";

/**
 * Shrinks the layout when the keyboard is open so focused fields stay visible.
 * On stack screens, pass keyboardVerticalOffset from useHeaderHeight().
 */
export default function KeyboardAvoidingWrapper({
  children,
  keyboardVerticalOffset = 0,
}) {
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
