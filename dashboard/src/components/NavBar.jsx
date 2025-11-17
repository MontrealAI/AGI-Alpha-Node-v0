import React from 'react';

const tabs = [
  { id: 'index', label: 'Index', emoji: '📈' },
  { id: 'providers', label: 'Providers', emoji: '🛰️' },
  { id: 'telemetry', label: 'Telemetry Debug', emoji: '🛠️' }
];

export function NavBar({ activeTab, onChange }) {
  return (
    <header className="navbar">
      <h1>AGI Alpha Node · Debug Deck</h1>
      <div className="nav-links" role="tablist" aria-label="Navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
            aria-selected={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
          >
            <span aria-hidden>{tab.emoji}</span> {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
}
