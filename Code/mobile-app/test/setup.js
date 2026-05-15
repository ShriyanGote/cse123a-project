const { act, cleanup } = require("@testing-library/react-native");

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children, style, ...rest }) => (
      <View style={style} {...rest}>
        {children}
      </View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("@react-navigation/elements", () => ({
  useHeaderHeight: () => 0,
}));

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  const actual = jest.requireActual("@react-navigation/native");
  const BaseNavigationContainer = actual.NavigationContainer;
  const NavigationContainer = React.forwardRef((props, ref) => {
    React.useEffect(() => {
      props.onReady?.();
    }, [props.onReady]);
    return React.createElement(BaseNavigationContainer, { ...props, ref });
  });
  NavigationContainer.displayName = "NavigationContainer";
  return {
    ...actual,
    NavigationContainer,
    useFocusEffect: (callback) => {
      React.useEffect(() => {
        return callback();
      }, [callback]);
    },
    createNavigationContainerRef: actual.createNavigationContainerRef,
    CommonActions: actual.CommonActions,
  };
});

jest.mock("@react-navigation/native-stack", () => {
  const React = require("react");
  const { View } = require("react-native");
  const defaultScreenProps = {
    navigation: {
      navigate: jest.fn(),
      goBack: jest.fn(),
      popToTop: jest.fn(),
    },
    route: { params: { groupId: "g1", groupName: "Test Group" } },
  };
  const Stack = ({ children }) => <View>{children}</View>;
  Stack.Navigator = ({ children }) => (
    <View>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return null;
        const renderChild = child.props.children;
        return (
          <View key={child.props.name}>
            {typeof renderChild === "function"
              ? renderChild(defaultScreenProps)
              : renderChild}
          </View>
        );
      })}
    </View>
  );
  Stack.Screen = ({ children, options }) => {
    if (typeof options === "function") {
      options(defaultScreenProps);
      options({ route: { params: { groupName: "Named Group" } } });
      options({ route: { params: { groupId: "g1" } } });
    }
    return children;
  };
  return { createNativeStackNavigator: () => Stack };
});

jest.mock("expo-notifications", () => require("./mocks/expoNotifications"));

let lastBarcodeHandler = null;

function MockCameraView(props) {
  lastBarcodeHandler = props.onBarcodeScanned;
  const React = require("react");
  const { View } = require("react-native");
  return <View testID="camera-view" {...props} />;
}

jest.mock("expo-camera", () => ({
  CameraView: (props) => MockCameraView(props),
  useCameraPermissions: jest.fn(() => [
    { granted: true, status: "granted" },
    jest.fn(() => Promise.resolve({ granted: true })),
  ]),
}));

global.__expoCameraMocks = {
  getLastBarcodeHandler: () => lastBarcodeHandler,
  resetBarcodeHandler: () => {
    lastBarcodeHandler = null;
  },
};

let latestPanResponderConfig = null;
jest.spyOn(require("react-native").PanResponder, "create").mockImplementation((config) => {
  latestPanResponderConfig = config;
  return { panHandlers: {} };
});
global.__getLatestPanResponderConfig = () => latestPanResponderConfig;

const { Animated } = require("react-native");

function immediateAnimation(value, config) {
  return {
    start(callback) {
      if (value?.setValue != null && config?.toValue != null) {
        value.setValue(config.toValue);
      }
      callback?.({ finished: true });
    },
    stop: jest.fn(),
    reset: jest.fn(),
  };
}

function immediateComposite(animations) {
  return {
    start(callback) {
      animations.forEach((animation) => animation?.start?.());
      callback?.({ finished: true });
    },
    stop: jest.fn(),
    reset: jest.fn(),
  };
}

beforeAll(() => {
  jest.spyOn(Animated, "timing").mockImplementation(immediateAnimation);
  jest.spyOn(Animated, "spring").mockImplementation(immediateAnimation);
  jest.spyOn(Animated, "decay").mockImplementation(immediateAnimation);
  jest.spyOn(Animated, "parallel").mockImplementation(immediateComposite);
  jest.spyOn(Animated, "sequence").mockImplementation(immediateComposite);
  jest.spyOn(Animated, "stagger").mockImplementation((_delay, animations) =>
    immediateComposite(animations)
  );
  jest.spyOn(Animated, "loop").mockImplementation((animation) => ({
    start(callback) {
      animation?.start?.();
      callback?.({ finished: false });
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
});

let consoleLogSpy;
let consoleWarnSpy;

beforeEach(() => {
  jest.clearAllMocks();
  lastBarcodeHandler = null;
  consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  jest.useRealTimers();
  consoleLogSpy?.mockRestore();
  consoleWarnSpy?.mockRestore();
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
});
