import { Modal } from "react-native";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { findAncestor } from "./testUtils";

const { getLastBarcodeHandler } = global.__expoCameraMocks;

export async function openScannerAndScan(data) {
  fireEvent.press(screen.getByText("Scan ESP QR"));
  await waitFor(() =>
    expect(screen.getByText("Scan ESP Provisioning QR")).toBeTruthy()
  );
  const modal = screen.UNSAFE_getByType(Modal);
  await act(async () => {
    modal.props.onShow?.();
  });
  await waitFor(() => expect(screen.getByTestId("camera-view")).toBeTruthy());
  const handler = getLastBarcodeHandler();
  await act(async () => {
    handler?.({ data });
  });
}

export async function fillReadyForm() {
  await openScannerAndScan(
    JSON.stringify({ device_name: "ESP-Device", device_id: "dev-qr-1" })
  );
  await waitFor(() => expect(screen.getByDisplayValue("ESP-Device")).toBeTruthy());
  fireEvent.changeText(screen.getByPlaceholderText("Wi-Fi SSID"), "HomeNet");
  fireEvent.changeText(screen.getByPlaceholderText("Wi-Fi password"), "secret");
}

export async function invokeSendBle() {
  const node = findAncestor(
    screen.getByText("Send Token + Wi-Fi over BLE"),
    (n) => typeof n.props?.onPress === "function"
  );
  await act(async () => {
    await node?.props?.onPress?.();
  });
}

export async function drainBleProvisioningTimers() {
  await act(async () => {
    await jest.runAllTimersAsync();
  });
}

export function pressSendBle() {
  fireEvent(screen.getByText("Send Token + Wi-Fi over BLE"), "press");
}
