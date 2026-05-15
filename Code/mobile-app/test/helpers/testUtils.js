import { waitFor } from "@testing-library/react-native";

export function findAncestor(node, predicate) {
  let current = node;
  while (current && !predicate(current)) {
    current = current.parent;
  }
  return current;
}

export async function expectConsoleWarn(action, ...expectedArgs) {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await action();
    await waitFor(() => expect(warn).toHaveBeenCalledWith(...expectedArgs));
  } finally {
    warn.mockRestore();
  }
}
