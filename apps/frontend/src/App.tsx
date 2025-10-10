import { SimulatorView } from "./views/SimulatorView";
import "./styles/app.css";

export const App = () => (
  <main className="app-shell">
    <header className="app-topbar">
      <div className="brand">
        <span className="brand-mark" />
        <h1>VoiceDrive Labs</h1>
      </div>
      <p className="tagline">California freeway co-pilot preview</p>
    </header>
    <SimulatorView />
  </main>
);

export default App;
