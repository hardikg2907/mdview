import { render } from 'preact';
import { App } from './App.js';
import './styles/reset.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/content.css';
import './styles/components.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
render(<App />, root);
