const STEPS = [
  {
    title: "Open the package",
    body: "Unbox your Water Filter Smart Base. You should find the base unit and a power cable. Plug it in so the base powers on.",
  },
  {
    title: "Download the mobile app",
    body: "Install the Water Filter Smart Base app on your phone.",
  },
  {
    title: "Sign in to the mobile app",
    body: "Open the app and sign in with your account, or create a new one if this is your first time. Grant Bluetooth and Camera permissions when prompted.",
  },
  {
    title: "Open Provision Device",
    body: 'From the Dashboard, tap "Provision Device" to start setting up a new base.',
  },
  {
    title: "Scan the QR code on the base",
    body: 'Tap "Scan ESP QR" — the camera opens. Point it at the QR sticker on your Smart Base. The app auto-fills the device name and ID for you.',
  },
  {
    title: "Enter your Wi-Fi details",
    body: "Type in the SSID and password for the Wi-Fi network you want the base to use. The base needs Wi-Fi to report water levels to the cloud.",
  },
  {
    title: "Send the credentials over Bluetooth",
    body: 'Tap "Send Token + Wi-Fi over BLE". The app registers your base with the server and then pushes your auth token and Wi-Fi credentials to the base over Bluetooth. Keep your phone near the base while this runs.',
  },
  {
    title: "Wait for confirmation",
    body: "The base joins your Wi-Fi and starts sending readings. Within a few seconds you should see the device appear on this dashboard with a live water level.",
  },
];

export default function Guide() {
  return (
    <div className="guide-page">
      <p className="guide-intro">
        Follow these steps to get your Smart Base up and running for the first
        time. The whole process takes about 5 minutes.
      </p>
      <ol className="guide-steps">
        {STEPS.map((step, i) => (
          <li key={i} className="guide-step">
            <div className="guide-step__num">{i + 1}</div>
            <div className="guide-step__body">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
