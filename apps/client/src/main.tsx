import { createRoot } from 'react-dom/client';
import App from './app/App';
import './i18n';
import '@fontsource/alegreya-sc/500.css';
import '@fontsource/alegreya-sc/700.css';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root was not found');
}

// `?lab=art` shows the art test scene instead of the game (developer tool).
const labName = new URLSearchParams(window.location.search).get('lab');
if (labName === 'art' || labName === 'squid') {
  container.style.height = '100vh';
  void import('./phaser/lab/mountArtLab').then((lab) => lab.mountArtLab(container, labName));
} else {
  createRoot(container).render(<App />);
}
