import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
it('renders evidence as text, removes the URL token, and sends authenticated pause controls', async () => {
  const html = await readFile('src/alpha/web/operator.html', 'utf8');
  const script = await readFile('src/alpha/web/operator-ui.js', 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:1234/#test-token',
    runScripts: 'outside-only',
  });
  const calls = [];
  const state = {
    mode: 'local',
    ens: 'fixture.alpha.node.agi.eth',
    address: '0xfixture',
    reviewer: '0xreviewer',
    paused: false,
    busy: false,
    operations: {
      pendingReviews: 1,
      dailyReservedMicroUsd: 100000,
      dailyRuns: 1,
      unresolved: [],
    },
    outcomes: {
      measuredMissions: 0,
      reviewerReportedNetUsd: 0,
      limitation: 'Not audited profit',
    },
    missions: [
      {
        id: 'fixture',
        workKind: 'data-quality',
        title: '<img src=x onerror="window.pwned=true">',
        report: '<script>window.pwned=true</script>',
        decision: 'awaiting-review',
        recommendation: 'cache',
        hash: 'hash',
      },
    ],
  };
  const downloads = [];
  dom.window.URL.createObjectURL = () => 'blob:test';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {
    downloads.push(this.download);
  };
  dom.window.fetch = async (path, options) => {
    calls.push({ path, options });
    return {
      ok: true,
      json: async () =>
        path.startsWith('/api/work')
          ? { result: { kind: 'data-quality' }, csv: 'a,b' }
          : path === '/api/qualification'
            ? {
                gatePassed: false,
                checks: [
                  {
                    id: 'measured-work',
                    passed: false,
                    detail: 'No observed economic records',
                  },
                ],
                limitations: ['Evidence gate is incomplete'],
              }
            : state,
    };
  };
  try {
    dom.window.eval(script);
    await new Promise((r) => setTimeout(r, 20));
    expect(dom.window.location.hash).toBe('');
    expect(dom.window.document.querySelector('#missions img')).toBe(null);
    expect(dom.window.document.querySelector('#missions script')).toBe(null);
    expect(
      dom.window.document.querySelector('#missions').textContent,
    ).toContain('<img');
    expect(dom.window.pwned).toBe(undefined);
    dom.window.document.getElementById('pause').click();
    await new Promise((r) => setTimeout(r, 20));
    const pause = calls.find((c) => c.path === '/api/pause');
    expect(pause.options.method).toBe('POST');
    expect(pause.options.headers.Authorization).toBe('Bearer test-token');
    expect(
      dom.window.document.getElementById('outcomes').textContent,
    ).toContain('Not audited profit');
    dom.window.document.getElementById('qualify').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(
      dom.window.document.getElementById('qualification').textContent,
    ).toContain('Qualification incomplete');
    expect(
      dom.window.document.getElementById('qualification').textContent,
    ).toContain('No observed economic records');
    for (const button of dom.window.document.querySelectorAll(
      '#missions button',
    ))
      if (button.textContent.startsWith('Download work')) button.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(downloads).toContain('fixture-work.json');
    expect(downloads).toContain('fixture-work.csv');
    state.paused = true;
    dom.window.document.getElementById('operate').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(dom.window.document.getElementById('operate').disabled).toBe(true);
    expect(dom.window.document.getElementById('cycle').disabled).toBe(true);
  } finally {
    dom.window.close();
  }
});
