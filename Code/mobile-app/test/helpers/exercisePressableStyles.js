import { Pressable } from "react-native";

/** Invokes Pressable style callbacks with pressed true/false for branch coverage. */
export function exercisePressableStyles(root) {
  let pressables = [];
  try {
    pressables = root.UNSAFE_getAllByType(Pressable);
  } catch {
    pressables = root.UNSAFE_root?.findAllByType?.(Pressable) ?? [];
  }

  pressables.forEach((node) => {
    if (typeof node.props.style === "function") {
      node.props.style({ pressed: false });
      node.props.style({ pressed: true });
    }
    if (Array.isArray(node.props.style)) {
      node.props.style.forEach((entry) => {
        if (typeof entry === "function") {
          entry({ pressed: false });
          entry({ pressed: true });
        }
      });
    }
  });
}
