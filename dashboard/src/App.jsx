import React, { useMemo, useState } from 'react';
import { NavBar } from './components/NavBar.jsx';
import { IndexView } from './views/IndexView.jsx';
import { ProvidersView } from './views/ProvidersView.jsx';
import { TelemetryView } from './views/TelemetryView.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('index');
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_PUBLIC_API_KEY ?? '');

  const apiBaseUrl = useMemo(() => {
    const fromEnv = import.meta.env.VITE_API_BASE_URL;
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
      return fromEnv.trim();
    }
    return 'http://localhost:8080';
  }, []);

  return (
    <div className="app-shell">
      <NavBar activeTab={activeTab} onChange={setActiveTab} />
      <main className="main-content">
        {activeTab === 'index' && <IndexView baseUrl={apiBaseUrl} apiKey={apiKey} />}
        {activeTab === 'providers' && <ProvidersView baseUrl={apiBaseUrl} apiKey={apiKey} onApiKeyChange={setApiKey} />}
        {activeTab === 'telemetry' && <TelemetryView baseUrl={apiBaseUrl} apiKey={apiKey} />}
      </main>
    </div>
  );
}
