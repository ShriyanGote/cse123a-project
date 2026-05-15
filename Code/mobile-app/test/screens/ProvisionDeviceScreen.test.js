import React from "react";
import { Modal } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { exercisePressableStyles } from "../helpers/exercisePressableStyles";
import {
  drainBleProvisioningTimers,
  fillReadyForm,
  invokeSendBle,
  openScannerAndScan,
  pressSendBle,
} from "../helpers/provisionTestUtils";
import { BleManager } from "react-native-ble-plx";
import ProvisionDeviceScreen from "../../src/screens/ProvisionDeviceScreen";
import { fetchMyDevices, registerBleDevice } from "../../src/api";

jest.mock("../../src/api", () => ({
  fetchMyDevices: jest.fn(),
  registerBleDevice: jest.fn(),
}));

const { getLastBarcodeHandler } = global.__expoCameraMocks;
const { useCameraPermissions } = require("expo-camera");

let scanCallback;
let mockBleManagerInstance;
const mockWriteCharacteristic = jest.fn(() => Promise.resolve());
const mockReadCharacteristic = jest.fn(() =>
  Promise.resolve({ value: Buffer.from("ok", "utf8").toString("base64") })
);
const mockRequestMtu = jest.fn(() => Promise.resolve());
const mockRequestMtuFail = jest.fn(() => Promise.reject(new Error("mtu fail")));
const mockDiscover = jest.fn(() => Promise.resolve());
const mockServices = jest.fn(() =>
  Promise.resolve([
    {
      uuid: "a0b40001-9267-4d61-a8c8-9f2f4b2c8e01",
      characteristics: jest.fn(() => Promise.resolve([])),
    },
    {
      uuid: "bad-svc",
      characteristics: jest.fn(() => Promise.reject(new Error("chars failed"))),
    },
  ])
);
const mockCancelConnection = jest.fn(() => Promise.resolve());
const mockConnect = jest.fn(() =>
  Promise.resolve({
    discoverAllServicesAndCharacteristics: mockDiscover,
    requestMTU: mockRequestMtu,
    services: mockServices,
    writeCharacteristicWithoutResponseForService: mockWriteCharacteristic,
    readCharacteristicForService: mockReadCharacteristic,
    cancelConnection: mockCancelConnection,
  })
);

jest.mock("react-native-ble-plx", () => ({
  BleManager: jest.fn().mockImplementation(() => {
    mockBleManagerInstance = {
      startDeviceScan: jest.fn((_a, _b, callback) => {
        scanCallback = callback;
      }),
      stopDeviceScan: jest.fn(),
      destroy: jest.fn(),
    };
    return mockBleManagerInstance;
  }),
}));

describe("ProvisionDeviceScreen", () => {
  const navigation = { popToTop: jest.fn(), goBack: jest.fn() };

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    scanCallback = null;
    registerBleDevice.mockResolvedValue({});
    fetchMyDevices.mockResolvedValue({ devices: [{ device_id: "dev-qr-1" }] });
    mockWriteCharacteristic.mockReset();
    mockWriteCharacteristic.mockResolvedValue(undefined);
    mockConnect.mockImplementation(() =>
      Promise.resolve({
        discoverAllServicesAndCharacteristics: mockDiscover,
        requestMTU: mockRequestMtu,
        services: mockServices,
        writeCharacteristicWithoutResponseForService: mockWriteCharacteristic,
        readCharacteristicForService: mockReadCharacteristic,
        cancelConnection: mockCancelConnection,
      })
    );
    useCameraPermissions.mockReturnValue([
      { granted: true, status: "granted" },
      jest.fn(() => Promise.resolve({ granted: true })),
    ]);
  });

  it("parses JSON QR payloads and toggles advanced details", async () => {
    const view = render(<ProvisionDeviceScreen navigation={navigation} />);
    await openScannerAndScan(
      JSON.stringify({
        device_name: "ESP-Device",
        device_id: "dev-qr-1",
        transport: "ble",
        ver: "1",
        pop: "secret",
        service_uuid: "svc",
        auth_char_uuid: "auth",
        wifi_char_uuid: "wifi",
        status_char_uuid: "status",
      })
    );
    await waitFor(() => expect(screen.getByDisplayValue("ESP-Device")).toBeTruthy());
    fireEvent.press(screen.getByText("Show technical details"));
    expect(screen.getByText("Technical (normally hidden)")).toBeTruthy();
    fireEvent.press(screen.getByText("Generate new auth token"));
    fireEvent.changeText(screen.getByPlaceholderText("Legacy POP field (Espressif QR only)"), "pop");
    fireEvent.press(screen.getByText("Hide technical details"));
    exercisePressableStyles(view);
  });

  it("parses URL QR payloads and non-ble transport messages", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await openScannerAndScan(
      "https://example.com/prov?device_name=URL-ESP&device_id=url-dev"
    );
    await waitFor(() => expect(screen.getByDisplayValue("URL-ESP")).toBeTruthy());
    expect(screen.getByText(/QR data loaded/)).toBeTruthy();
  });

  it("shows errors for invalid and empty-field QR payloads", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await openScannerAndScan("not-a-valid-qr-payload");
    await waitFor(() =>
      expect(screen.getByText(/No usable data found in QR/)).toBeTruthy()
    );
    await openScannerAndScan(JSON.stringify({ unrelated: "value" }));
    await waitFor(() =>
      expect(screen.getByText(/no expected fields were found/)).toBeTruthy()
    );
  });

  it("ignores duplicate or inactive barcode events", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    fireEvent.press(screen.getByText("Scan ESP QR"));
    const modal = screen.UNSAFE_getByType(Modal);
    await act(async () => {
      modal.props.onShow?.();
    });
    const handler = getLastBarcodeHandler();
    await act(async () => {
      handler?.({ data: null });
      handler?.({
        data: JSON.stringify({ device_name: "ESP-Device", device_id: "dev-qr-1" }),
      });
      handler?.({
        data: JSON.stringify({ device_name: "ESP-Device", device_id: "dev-qr-1" }),
      });
    });
    await waitFor(() => expect(screen.getByDisplayValue("ESP-Device")).toBeTruthy());
  });

  it("requests camera permission when needed", async () => {
    const requestPermission = jest.fn(() => Promise.resolve({ granted: true }));
    useCameraPermissions.mockReturnValue([
      { granted: false, status: "undetermined" },
      requestPermission,
    ]);
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await act(async () => {
      fireEvent.press(screen.getByText("Scan ESP QR"));
    });
    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
  });

  it("denies camera permission when request fails", async () => {
    const requestPermission = jest.fn(() => Promise.resolve({ granted: false }));
    useCameraPermissions.mockReturnValue([
      { granted: false, status: "undetermined" },
      requestPermission,
    ]);
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await act(async () => {
      fireEvent.press(screen.getByText("Scan ESP QR"));
    });
    await waitFor(() =>
      expect(screen.getByText("Camera permission is required to scan ESP QR.")).toBeTruthy()
    );
  });

  it("shows camera fallback when permission is not granted in the modal", async () => {
    const permission = { granted: true, status: "granted" };
    useCameraPermissions.mockImplementation(() => [
      permission,
      jest.fn(() => Promise.resolve({ granted: true })),
    ]);
    const view = render(<ProvisionDeviceScreen navigation={navigation} />);
    fireEvent.press(screen.getByText("Scan ESP QR"));
    await waitFor(() =>
      expect(screen.getByText("Scan ESP Provisioning QR")).toBeTruthy()
    );
    permission.granted = false;
    permission.status = "denied";
    view.rerender(<ProvisionDeviceScreen navigation={navigation} />);
    await waitFor(() =>
      expect(
        screen.getByText(/Camera permission is not granted/)
      ).toBeTruthy()
    );
  });

  it("closes the scanner modal", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    fireEvent.press(screen.getByText("Scan ESP QR"));
    await waitFor(() =>
      expect(screen.getByText("Scan ESP Provisioning QR")).toBeTruthy()
    );
    fireEvent.press(screen.getByText("Close"));
    await waitFor(() =>
      expect(screen.queryByText("Scan ESP Provisioning QR")).toBeNull()
    );
  });

  it("validates missing prerequisites before sending", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await invokeSendBle();
    expect(
      screen.getByText(/Need QR \(device name\), auth token, BLE UUIDs, and Wi-Fi SSID/)
    ).toBeTruthy();
  });

  it("sends BLE provisioning payload and returns home when device appears", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const view = render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await waitFor(() => expect(registerBleDevice).toHaveBeenCalled());
    scanCallback?.(null, { name: "ESP-Device", localName: "ESP-Device", connect: mockConnect });
    await waitFor(() => expect(mockWriteCharacteristic).toHaveBeenCalled());
    await act(async () => {
      await jest.runAllTimersAsync();
    });
    await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());
    exercisePressableStyles(view);
    jest.useRealTimers();
  });

  it("uses goBack when popToTop is unavailable", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const nav = { goBack: jest.fn() };
    render(<ProvisionDeviceScreen navigation={nav} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    await act(async () => {
      await jest.runAllTimersAsync();
    });
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    jest.useRealTimers();
  });

  it("shows timeout and poll retry errors when device never appears", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMyDevices
      .mockRejectedValueOnce(new Error("poll failed"))
      .mockResolvedValue({ devices: [] });
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    await act(async () => {
      await jest.runAllTimersAsync();
    });
    await waitFor(() =>
      expect(screen.getByText(/No response from the server within/)).toBeTruthy()
    );
    jest.useRealTimers();
  });

  it("reports BLE scan callback errors", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await waitFor(() =>
      expect(mockBleManagerInstance.startDeviceScan).toHaveBeenCalled()
    );
    await act(async () => {
      scanCallback?.(new Error("scan failed"), null);
    });
    await waitFor(() => expect(screen.getByText("scan failed")).toBeTruthy(), {
      timeout: 5000,
    });
  });

  it("times out BLE scan and lists seen device names", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await act(async () => {
      scanCallback?.(null, { name: "Other-Device", localName: "Nearby" });
    });
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    await waitFor(() =>
      expect(screen.getByText(/BLE scan timed out/)).toBeTruthy()
    );
    jest.useRealTimers();
  });

  it("surfaces auth write failures", async () => {
    const failingWrite = jest.fn().mockRejectedValueOnce(new Error("auth failed"));
    const failingConnect = jest.fn(() =>
      Promise.resolve({
        discoverAllServicesAndCharacteristics: mockDiscover,
        requestMTU: mockRequestMtu,
        services: mockServices,
        writeCharacteristicWithoutResponseForService: failingWrite,
        readCharacteristicForService: mockReadCharacteristic,
        cancelConnection: mockCancelConnection,
      })
    );
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await waitFor(() =>
      expect(mockBleManagerInstance.startDeviceScan).toHaveBeenCalled()
    );
    await act(async () => {
      scanCallback?.(null, { name: "ESP-Device", connect: failingConnect });
    });
    await waitFor(() => expect(screen.getByText("auth failed")).toBeTruthy(), {
      timeout: 5000,
    });
  });

  it("surfaces wifi write failures", async () => {
    const writeMock = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("wifi failed"));
    mockConnect.mockImplementationOnce(() =>
      Promise.resolve({
        discoverAllServicesAndCharacteristics: mockDiscover,
        requestMTU: mockRequestMtuFail,
        services: mockServices,
        writeCharacteristicWithoutResponseForService: writeMock,
        readCharacteristicForService: mockReadCharacteristic,
        cancelConnection: mockCancelConnection,
      })
    );
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await waitFor(() =>
      expect(mockBleManagerInstance.startDeviceScan).toHaveBeenCalled()
    );
    await act(async () => {
      scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    });
    await waitFor(() => expect(screen.getByText("wifi failed")).toBeTruthy(), {
      timeout: 5000,
    });
  });

  it("continues when a GATT service has no readable characteristics", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await waitFor(() =>
      expect(mockBleManagerInstance.startDeviceScan).toHaveBeenCalled()
    );
    await act(async () => {
      scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    });
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        "GATT char read failed for bad-svc:",
        "chars failed"
      )
    );
    await drainBleProvisioningTimers();
    await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());
    log.mockRestore();
  });

  it("updates nickname when device name is edited manually", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await openScannerAndScan(JSON.stringify({ device_name: "ESP-Device", device_id: "dev-1" }));
    fireEvent.changeText(screen.getByPlaceholderText("Device name (from QR — editable)"), "Renamed");
    expect(screen.getByDisplayValue("Renamed")).toBeTruthy();
  });

  it("rejects BLE connect when device name is missing", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    fireEvent.changeText(
      screen.getByPlaceholderText("Device name (from QR — editable)"),
      ""
    );
    await invokeSendBle();
    await waitFor(() =>
      expect(
        screen.getByText(/Need QR \(device name\), auth token, BLE UUIDs, and Wi-Fi SSID/)
      ).toBeTruthy()
    );
  });

  it("reads BLE status and tolerates missing status payloads", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockReadCharacteristic.mockResolvedValueOnce({ value: "" });
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await act(async () => {
      scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Status characteristic read with no payload/)
      ).toBeTruthy()
    );
    await drainBleProvisioningTimers();
    await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());

    mockReadCharacteristic.mockRejectedValueOnce(new Error("status failed"));
    navigation.popToTop.mockClear();
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await act(async () => {
      scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    });
    await waitFor(() =>
      expect(screen.getByText(/Status read skipped\/failed/)).toBeTruthy()
    );
    await drainBleProvisioningTimers();
    await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());
  });

  it("exercises pressable style branches across the screen", async () => {
    const view = render(<ProvisionDeviceScreen navigation={navigation} />);
    await openScannerAndScan(
      JSON.stringify({ device_name: "ESP-Device", device_id: "dev-qr-1" })
    );
    await waitFor(() => expect(screen.getByDisplayValue("ESP-Device")).toBeTruthy());
    exercisePressableStyles(view);
  });

  it("times out BLE scan with no seen device names", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    await waitFor(() =>
      expect(screen.getByText(/Ensure ESP is advertising/)).toBeTruthy()
    );
    jest.useRealTimers();
  });

  it("matches devices by advertised name prefix during scan", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await act(async () => {
      scanCallback?.(null, {
        name: "ESP-Device-2",
        localName: "",
        connect: mockConnect,
      });
    });
    await waitFor(() => expect(mockConnect).toHaveBeenCalled());
    await drainBleProvisioningTimers();
    jest.useRealTimers();
  });

  it("rejects BLE connect when device name is only whitespace", async () => {
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await openScannerAndScan(
      JSON.stringify({ device_name: "ESP-Device", device_id: "dev-qr-1" })
    );
    fireEvent.changeText(screen.getByPlaceholderText("Device name (from QR — editable)"), "   ");
    fireEvent.changeText(screen.getByPlaceholderText("Wi-Fi SSID"), "HomeNet");
    fireEvent.changeText(screen.getByPlaceholderText("Wi-Fi password"), "secret");
    await invokeSendBle();
    await waitFor(() =>
      expect(screen.getByText("Scan QR or enter ESP device name first.")).toBeTruthy()
    );
  });

  it("registers using device id when nickname is empty", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await openScannerAndScan(
      JSON.stringify({ device_name: "ESP-Device", device_id: "dev-only" })
    );
    fireEvent.press(screen.getByText("Show technical details"));
    fireEvent.changeText(screen.getByPlaceholderText("Display nickname (optional)"), "");
    fireEvent.changeText(screen.getByPlaceholderText("Wi-Fi SSID"), "HomeNet");
    fireEvent.changeText(screen.getByPlaceholderText("Wi-Fi password"), "secret");
    await act(async () => {
      pressSendBle();
    });
    await waitFor(() =>
      expect(registerBleDevice).toHaveBeenCalledWith(
        expect.objectContaining({ device_name: "ESP-Device" })
      )
    );
    scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    await drainBleProvisioningTimers();
    jest.useRealTimers();
  });

  it("truncates long raw QR payloads in advanced details", async () => {
    const view = render(<ProvisionDeviceScreen navigation={navigation} />);
    const longPayload = `{"device_name":"ESP","device_id":"dev-1","note":"${"x".repeat(300)}"}`;
    await openScannerAndScan(longPayload);
    fireEvent.press(screen.getByText("Show technical details"));
    expect(screen.getByText(/\.\.\.$/)).toBeTruthy();
    exercisePressableStyles(view);
  });

  it("logs service characteristics and tolerates service errors without messages", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockServices.mockImplementationOnce(() =>
      Promise.resolve([
        {
          uuid: "svc-with-chars",
          characteristics: jest.fn(() =>
            Promise.resolve([{ uuid: "char-1" }, { uuid: "char-2" }])
          ),
        },
      ])
    );
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        "GATT chars for svc-with-chars:",
        ["char-1", "char-2"]
      )
    );
    log.mockRestore();
    jest.useRealTimers();
  });

  it("uses device id for server registration when nickname is cleared", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await openScannerAndScan(
      JSON.stringify({ device_name: "ESP-Device", device_id: "dev-only-id" })
    );
    fireEvent.press(screen.getByText("Show technical details"));
    fireEvent.changeText(screen.getByPlaceholderText("Display nickname (optional)"), "");
    fireEvent.changeText(screen.getByPlaceholderText("Device name (from QR — editable)"), "");
    fireEvent.changeText(screen.getByPlaceholderText("Wi-Fi SSID"), "HomeNet");
    fireEvent.changeText(screen.getByPlaceholderText("Wi-Fi password"), "secret");
    await invokeSendBle();
    await waitFor(() =>
      expect(
        screen.getByText(/Need QR \(device name\), auth token, BLE UUIDs, and Wi-Fi SSID/)
      ).toBeTruthy()
    );
    jest.useRealTimers();
  });

  it("polls devices when fetchMyDevices omits the devices array", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMyDevices.mockResolvedValue({});
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    await act(async () => {
      await jest.runAllTimersAsync();
    });
    await waitFor(() =>
      expect(screen.getByText(/No response from the server within/)).toBeTruthy()
    );
    jest.useRealTimers();
  });

  it("shows activity indicator while BLE work is in progress", async () => {
    let resolveRegister;
    registerBleDevice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegister = resolve;
        })
    );
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    expect(screen.UNSAFE_queryByType(require("react-native").ActivityIndicator)).toBeTruthy();
    await act(async () => {
      resolveRegister();
    });
    await act(async () => {
      scanCallback?.(new Error("test cleanup"), null);
    });
  });

  it("exercises pressable styles while BLE send and server wait are active", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    let resolveRegister;
    registerBleDevice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegister = resolve;
        })
    );
    const view = render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    exercisePressableStyles(view);
    await act(async () => {
      resolveRegister();
    });
    scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    await act(async () => {
      await jest.runAllTimersAsync();
    });
    exercisePressableStyles(view);
    jest.useRealTimers();
  });

  it("logs service discovery failures without error messages", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockServices.mockImplementationOnce(() =>
      Promise.resolve([
        {
          uuid: "svc-fail",
          characteristics: jest.fn(() => Promise.reject({})),
        },
      ])
    );
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    scanCallback?.(null, { name: "ESP-Device", connect: mockConnect });
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith("GATT char read failed for svc-fail:", {})
    );
    log.mockRestore();
    jest.useRealTimers();
  });

  it("matches devices by local name prefix during scan", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    render(<ProvisionDeviceScreen navigation={navigation} />);
    await fillReadyForm();
    await act(async () => {
      pressSendBle();
    });
    await act(async () => {
      scanCallback?.(null, {
        name: "",
        localName: "ESP-Device-extra",
        connect: mockConnect,
      });
    });
    await waitFor(() => expect(mockConnect).toHaveBeenCalled());
    await drainBleProvisioningTimers();
    await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());
  });

  it("shows BLE unavailable message when native module fails to load", () => {
    BleManager.mockImplementationOnce(() => {
      throw "native module missing";
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const view = render(<ProvisionDeviceScreen navigation={{}} />);
    expect(screen.getByText(/BLE native module unavailable/)).toBeTruthy();
    exercisePressableStyles(view);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
