// Opt-in, local DOM diagnostics; no analytics requests or visible UI.
const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('profile-loading');
const phases: Record<string, number> = {};
export function loadingPhase(name: string) {
  if (!enabled) return;
  phases[name] = Math.round(performance.now());
  document.documentElement.dataset.loadingPhases = JSON.stringify(phases);
  if (name === 'scene-ready') {
    const navigation=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if(navigation)document.documentElement.dataset.loadingNavigation=JSON.stringify({ttfb:Math.round(navigation.responseStart),end:Math.round(navigation.responseEnd),bytes:navigation.transferSize});
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    document.documentElement.dataset.loadingResources = JSON.stringify(resources.map(item => ({
      url: new URL(item.name).pathname, start: Math.round(item.startTime), end: Math.round(item.responseEnd),
      ttfb: Math.round(item.responseStart - item.requestStart), bytes: item.transferSize,
    })));
  }
}
