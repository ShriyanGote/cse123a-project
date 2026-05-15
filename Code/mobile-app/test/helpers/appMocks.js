const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve());
const mockChannelOn = jest.fn().mockReturnThis();
const mockChannelSubscribe = jest.fn();
const mockRemoveChannel = jest.fn();

const signedInSession = {
  user: { id: "u1", email: "user@test.com", user_metadata: { display_name: "User" } },
};

function createSupabaseMock() {
  return {
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        getSession: (...args) => mockGetSession(...args),
        onAuthStateChange: (cb) => {
          mockOnAuthStateChange.mockImplementation(cb);
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        },
        signOut: (...args) => mockSignOut(...args),
      },
      channel: jest.fn(() => ({
        on: mockChannelOn,
        subscribe: mockChannelSubscribe,
      })),
      removeChannel: (...args) => mockRemoveChannel(...args),
    },
  };
}

function createApiMock() {
  return {
    ensureMyProfile: jest.fn(() => Promise.resolve()),
    fetchMyProfile: jest.fn(() => Promise.resolve({ is_active: true })),
    fetchMyGroups: jest.fn(() => Promise.resolve({ groups: [] })),
    fetchMyDevices: jest.fn(() => Promise.resolve({ devices: [] })),
  };
}

function createNotificationsMock() {
  return {
    addNotificationResponseListener: jest.fn(() => jest.fn()),
    clearLowWaterNotificationsOnSignOut: jest.fn(() => Promise.resolve()),
    ensureLocalNotificationPermissionsAsync: jest.fn(() => Promise.resolve(true)),
    handleInitialNotification: jest.fn(() => Promise.resolve()),
  };
}

function configureNavigationRef(navigationRef, { ready = true, dispatch } = {}) {
  navigationRef.isReady = jest.fn(() => ready);
  navigationRef.navigate = jest.fn();
  navigationRef.dispatch = dispatch ?? jest.fn();
}

function resetAppTestState(navigationRef, { introCompleted = true } = {}) {
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  const { ensureMyProfile, fetchMyProfile } = require("../../src/api");

  configureNavigationRef(navigationRef);
  mockGetSession.mockResolvedValue({ data: { session: null } });
  AsyncStorage.getItem.mockResolvedValue(introCompleted ? "true" : null);
  AsyncStorage.setItem.mockResolvedValue();
  fetchMyProfile.mockResolvedValue({ is_active: true });
  ensureMyProfile.mockResolvedValue(undefined);
}

function signIn(mockSession = signedInSession) {
  mockGetSession.mockResolvedValue({ data: { session: mockSession } });
}

function captureNotificationHandler(listenerMock) {
  let handler;
  listenerMock.mockImplementation((cb) => {
    handler = cb;
    return jest.fn();
  });
  return () => handler;
}

module.exports = {
  mockGetSession,
  mockOnAuthStateChange,
  mockSignOut,
  mockChannelOn,
  mockChannelSubscribe,
  mockRemoveChannel,
  signedInSession,
  createSupabaseMock,
  createApiMock,
  createNotificationsMock,
  configureNavigationRef,
  resetAppTestState,
  signIn,
  captureNotificationHandler,
};
