const mockScheduleNotificationAsync = jest.fn(() => Promise.resolve("id"));
const mockGetPermissionsAsync = jest.fn(() => Promise.resolve({ status: "granted" }));
const mockRequestPermissionsAsync = jest.fn(() => Promise.resolve({ status: "granted" }));
const mockAddNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
const mockGetLastNotificationResponseAsync = jest.fn(() => Promise.resolve(null));
const mockCancelAllScheduledNotificationsAsync = jest.fn(() => Promise.resolve());
const mockGetPresentedNotificationsAsync = jest.fn(() => Promise.resolve([]));
const mockDismissNotificationAsync = jest.fn(() => Promise.resolve());
const mockDismissAllNotificationsAsync = jest.fn(() => Promise.resolve());
const mockSetNotificationChannelAsync = jest.fn(() => Promise.resolve());

module.exports = {
  __mocks: {
    mockScheduleNotificationAsync,
    mockGetPermissionsAsync,
    mockRequestPermissionsAsync,
    mockAddNotificationResponseReceivedListener,
    mockGetLastNotificationResponseAsync,
    mockCancelAllScheduledNotificationsAsync,
    mockGetPresentedNotificationsAsync,
    mockDismissNotificationAsync,
    mockDismissAllNotificationsAsync,
    mockSetNotificationChannelAsync,
  },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: (...args) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args) => mockRequestPermissionsAsync(...args),
  setNotificationChannelAsync: (...args) => mockSetNotificationChannelAsync(...args),
  addNotificationResponseReceivedListener: (...args) =>
    mockAddNotificationResponseReceivedListener(...args),
  getLastNotificationResponseAsync: (...args) =>
    mockGetLastNotificationResponseAsync(...args),
  cancelAllScheduledNotificationsAsync: (...args) =>
    mockCancelAllScheduledNotificationsAsync(...args),
  getPresentedNotificationsAsync: (...args) => mockGetPresentedNotificationsAsync(...args),
  dismissNotificationAsync: (...args) => mockDismissNotificationAsync(...args),
  dismissAllNotificationsAsync: (...args) => mockDismissAllNotificationsAsync(...args),
  scheduleNotificationAsync: (...args) => mockScheduleNotificationAsync(...args),
};
