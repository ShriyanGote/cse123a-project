import Settings from "./Settings";
import Guide from "./Guide";
import "./App.css";

export default function App() {
  return (
    <div className="brita-dashboard app-shell">
      <header className="app-shell__header">
        <h1 className="app-shell__title">Water Filter Smart Base</h1>
        <p className="app-shell__subtitle">
          Sign in to see your groups and devices. Use the setup guide when provisioning a new base.
        </p>
      </header>

      <main className="app-shell__main">
        <section className="app-shell__panel app-shell__panel--settings" aria-labelledby="account-heading">
          <h2 id="account-heading" className="app-shell__panel-heading">
            Account
          </h2>
          <div className="app-shell__panel-body app-shell__panel-body--flush">
            <Settings />
          </div>
        </section>

        <section className="app-shell__panel app-shell__panel--guide" aria-labelledby="guide-heading">
          <h2 id="guide-heading" className="app-shell__panel-heading">
            Setup guide
          </h2>
          <div className="app-shell__panel-body app-shell__panel-body--flush">
            <Guide />
          </div>
        </section>
      </main>
    </div>
  );
}
