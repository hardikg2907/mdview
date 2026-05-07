import { render } from 'preact';
import { App } from './App.js';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/reset.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/content.css';
import './styles/components.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
render(<App />, root);
