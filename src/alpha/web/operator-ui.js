const token = location.hash.slice(1);
let currentState;
history.replaceState(null, '', '/');
const $ = id => document.getElementById(id);
const element = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; };
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
function notify(text) { $('notice').textContent = text; }
async function refresh() {
  const s = await api('/api/status');
  currentState = s;
  $('identity').replaceChildren(element('span', `${s.mode.toUpperCase()} · ${s.paused ? 'PAUSED' : 'READY'}`, 'badge'), element('h2', s.ens), element('p', s.address, 'address'), element('p', `Reviewer: ${s.reviewer ?? 'Not configured'}`, 'address'));
  $('metrics').replaceChildren(...[[s.missions.length, 'Signed missions'], [s.operations.pendingReviews, 'Awaiting independent review'], [`$${(s.operations.dailyReservedMicroUsd / 1e6).toFixed(2)}`, 'Reserved today · estimate, not invoice']].map(([value, label]) => { const e = element('div', '', 'metric'); e.append(element('strong', String(value)), element('span', label)); return e; }));
  $('runtime').replaceChildren(element('h2', 'Runtime activity'), ...((s.runtime ?? []).slice(0, 15).map(e => element('p', `${e.topic} · ${e.status}${e.purpose ? ` · ${e.purpose}` : ''}${e.transactionHash ? ` · ${e.transactionHash}` : ''}`, 'address'))));
  if (!(s.runtime ?? []).length) $('runtime').append(element('p', 'Configure engine.json to connect planning, specialist work, reviewed actions and bounded settlement.'));
  $('outcomes').replaceChildren(element('h2', 'Measured outcomes'), element('p', `${s.outcomes.measuredMissions} reviewer-attested outcomes · $${s.outcomes.reviewerReportedNetUsd.toFixed(2)} reported net`), element('p', s.outcomes.limitation));
  $('missions').replaceChildren(...s.missions.map(m => {
    const card = element('article', '', 'card'); card.append(element('span', m.decision, 'badge'), element('h2', m.title), element('p', `Recommendation: ${m.recommendation ?? 'Abstain'}`), element('p', m.hash, 'address'));
    const details = element('details', ''); details.append(element('summary', 'Inspect signed report'), element('pre', m.report)); card.append(details);
    const button = element('button', 'Download evidence', 'secondary'); button.onclick = () => action(async () => { const evidence = await api(`/api/evidence?id=${encodeURIComponent(m.id)}`); const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${m.id}-evidence.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }); card.append(button); return card;
  }));
  if (!s.missions.length) $('missions').append(element('p', 'No missions yet. Configure pipeline.json, then discover opportunities from your usage data.'));
  $('cycle').disabled = s.paused || s.busy;
  $('operate').disabled = s.paused || s.busy;
  notify(`Ledger verified · ${s.operations.dailyRuns} runs reserved today · ${s.operations.unresolved.length} interrupted reservations`);
}
async function action(fn) { try { await fn(); } catch (e) { notify(e.message); } }
for (const name of ['operate', 'cycle', 'pause', 'resume']) $(name).onclick = () => action(async () => { $(name).disabled = true; try { const result = await api(`/api/${name}`, {}); await refresh(); if (result.status) notify(`Cycle: ${result.status}${result.missionId ? ` · ${result.missionId}` : ''}`); } finally { $(name).disabled = ['operate', 'cycle'].includes(name) && !!(currentState?.paused || currentState?.busy); } });
$('refresh').onclick = () => action(refresh);
$('review').onchange = () => action(async () => { const file = $('review').files[0]; if (!file) return; if (file.size > 12000) throw new Error('Review file exceeds 12 KB'); await api('/api/review', JSON.parse(await file.text())); await refresh(); $('review').value = ''; });
action(refresh);
