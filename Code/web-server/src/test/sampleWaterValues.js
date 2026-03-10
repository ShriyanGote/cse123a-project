export const defaultCalibration = {
  device_id: "sensor-1",
  weight_g: 1250,
  battery_mv: 3900,
  created_at: "2026-02-27T01:02:03.000Z",
};

export const readCustomCalibration = {
  device_id: "sensor-1",
  weight_g: 1000,
  battery_mv: 3750,
  created_at: "2026-02-27T01:02:03.000Z",
};

export const readEmpty = {
  device_id: "sensor-1",
  weight_g: 100,
  battery_mv: 3750,
  created_at: "2026-02-27T01:02:03.000Z",
};

export const readCalibrationActions = {
  device_id: "sensor-1",
  weight_g: 1600,
  battery_mv: 3850,
  created_at: "2026-02-27T01:02:03.000Z",
};

export const customCalibration = {
  id: 1,
  empty: 200,
  full: 1800,
};

export const thresholdCalibration = {
  id: 1,
  empty: 100,
  full: 1800,
};

export const calibrationUpserts = [
  { id: 1, empty: 1600, full: null },
  { id: 1, empty: 1600, full: 1600 },
  { id: 1, empty: null, full: null },
];
