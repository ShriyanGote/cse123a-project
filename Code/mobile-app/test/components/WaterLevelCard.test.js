import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import WaterLevelCard from "../../src/components/WaterLevelCard";

describe("WaterLevelCard", () => {
  it("shows empty state when no water is detected", () => {
    render(
      <WaterLevelCard
        waterState={{ weight_g: 0, empty_g: 0, full_g: 100 }}
      />
    );
    expect(screen.getByText("No water detected")).toBeTruthy();
    expect(screen.getByText(/0%/)).toBeTruthy();
  });

  it("shows water detected and reading details", () => {
    render(
      <WaterLevelCard
        waterState={{
          weight_g: 50,
          empty_g: 0,
          full_g: 100,
          battery_mv: 3300,
          updated_at: "2026-05-15T12:00:00.000Z",
        }}
      />
    );
    expect(screen.getByText("Water detected")).toBeTruthy();
    expect(screen.getByText(/3300 mV/)).toBeTruthy();
    expect(screen.getByText(/Weight: 50 g/)).toBeTruthy();
  });

  it("shows error message and calibration buttons", () => {
    const onCalibrateEmpty = jest.fn();
    const onCalibrateFull = jest.fn();
    const onResetCalibration = jest.fn();
    render(
      <WaterLevelCard
        waterState={{ weight_g: 25, empty_g: 0, full_g: 100 }}
        showCalibrationButtons
        errorMessage="Calibration failed"
        onCalibrateEmpty={onCalibrateEmpty}
        onCalibrateFull={onCalibrateFull}
        onResetCalibration={onResetCalibration}
      />
    );
    expect(screen.getByText("Calibration failed")).toBeTruthy();
    fireEvent.press(screen.getByText("Calibrate empty"));
    fireEvent.press(screen.getByText("Calibrate full"));
    fireEvent.press(screen.getByText("Reset"));
    expect(onCalibrateEmpty).toHaveBeenCalled();
    expect(onCalibrateFull).toHaveBeenCalled();
    expect(onResetCalibration).toHaveBeenCalled();
  });

  it("disables calibration buttons while calibrating", () => {
    render(
      <WaterLevelCard
        waterState={{ weight_g: 25, empty_g: 0, full_g: 100 }}
        showCalibrationButtons
        isCalibrating
        onCalibrateEmpty={jest.fn()}
        onCalibrateFull={jest.fn()}
        onResetCalibration={jest.fn()}
      />
    );
    fireEvent.press(screen.getByText("Calibrate empty"));
    expect(screen.getByText("Calibrate empty")).toBeTruthy();
  });

  it("falls back to created_at when updated_at is missing", () => {
    render(
      <WaterLevelCard
        waterState={{
          weight_g: 10,
          empty_g: 0,
          full_g: 100,
          created_at: "2026-05-15T12:00:00.000Z",
        }}
      />
    );
    expect(screen.getByText(/Updated:/)).toBeTruthy();
  });
});
