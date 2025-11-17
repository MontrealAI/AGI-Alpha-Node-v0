import React, { useState } from 'react';
import { NavBar } from './components/NavBar.jsx';
import { ConnectionBar } from './components/ConnectionBar.jsx';
import { IndexView } from './views/IndexView.jsx';
import { ProvidersView } from './views/ProvidersView.jsx';
import { TelemetryView } from './views/TelemetryView.jsx';

function normalizeBaseUrl(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return 'http://localhost:8080';
  return candidate.replace(/\/+$/, '');
}

export default function App() {
  const [activeTab, setActiveTab] = useState('index');
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_PUBLIC_API_KEY ?? '');
  const [apiBaseUrl, setApiBaseUrl] = useState(() => normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL));
  const [refreshNonce, setRefreshNonce] = useState(0);

  return (
    <div className="app-shell">
      <NavBar activeTab={activeTab} onChange={setActiveTab} />
      <ConnectionBar
        baseUrl={apiBaseUrl}
        apiKey={apiKey}
        onBaseUrlChange={setApiBaseUrl}
        onApiKeyChange={setApiKey}
        onRefresh={() => setRefreshNonce((value) => value + 1)}
      />
      <main className="main-content">
        {activeTab === 'index' && <IndexView baseUrl={apiBaseUrl} apiKey={apiKey} refreshNonce={refreshNonce} />}
        {activeTab === 'providers' && (
          <ProvidersView baseUrl={apiBaseUrl} apiKey={apiKey} onApiKeyChange={setApiKey} refreshNonce={refreshNonce} />
        )}
        {activeTab === 'telemetry' && <TelemetryView baseUrl={apiBaseUrl} apiKey={apiKey} refreshNonce={refreshNonce} />}
      </main>
    </div>
  );
}
