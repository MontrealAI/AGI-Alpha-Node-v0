import React from 'react';

function normalizeBase(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

export function ConnectionBar({ baseUrl, apiKey, onBaseUrlChange, onApiKeyChange, onRefresh }) {
  return (
    <section className="connection-bar" aria-label="Connection settings">
      <div className="connection-fields">
        <label>
          API base
          <input
            type="url"
            inputMode="url"
            spellCheck="false"
            placeholder="http://localhost:8080"
            value={baseUrl}
            onChange={(event) => onBaseUrlChange?.(normalizeBase(event.target.value))}
          />
        </label>
        <label>
          Public API key
          <input
            type="text"
            placeholder="x-api-key or bearer token"
            value={apiKey}
            onChange={(event) => onApiKeyChange?.(event.target.value)}
          />
        </label>
      </div>
      <div className="connection-actions">
        <div className="small-text">Targets are shared across Index · Providers · Telemetry tabs.</div>
        <button className="ghost-button" type="button" onClick={onRefresh}>
          Resync panels
        </button>
      </div>
    </section>
  );
}
