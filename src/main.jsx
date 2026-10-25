import { render } from 'preact';
import './styles/app.css';
import { App } from './ui/App.jsx';
import { startRf } from './engine/rfClient.js';
import { store } from './state/store.js';
import { getViewport } from './ui/viewportRef.js';
import * as actions from './state/actions.js';
import { parseProjectText } from './core/schema.js';
import { findDeviceId } from './data/devices.js';

startRf();
render(<App />, document.getElementById('app'));

// Test hook: lets end-to-end tests read state without reaching into modules.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('e2e')) {
  window.__netscope = {
    store,
    viewport: () => getViewport(),
    loadProjectText: (text) => { const { project } = parseProjectText(text, findDeviceId); actions.replaceProject(project); requestAnimationFrame(() => getViewport()?.fit()); },
  };
}
