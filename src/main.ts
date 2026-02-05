import './style.css';
import { createGame } from './game';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app element.');
}

createGame(app);