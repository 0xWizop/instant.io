// Import game modules
import { GameClient } from './GameClient.js';
import { KeybindManager } from './KeybindManager.js';

// PIXI.js is loaded via script tag in HTML

// Initialize keybind manager
const keybindManager = new KeybindManager();
keybindManager.loadKeybinds();

// Initialize game client
const canvas = document.getElementById('gameCanvas');
const gameClient = new GameClient(canvas, keybindManager);

// Setup theme toggle
const themeToggle = document.getElementById('themeToggle');
let isDarkMode = localStorage.getItem('theme') !== 'light';

function updateTheme() {
  if (isDarkMode) {
    document.body.classList.remove('light-mode');
    themeToggle.textContent = '🌙 Dark Mode';
    localStorage.setItem('theme', 'dark');
  } else {
    document.body.classList.add('light-mode');
    themeToggle.textContent = '☀️ Light Mode';
    localStorage.setItem('theme', 'light');
  }
  gameClient.setTheme(isDarkMode);
}

// Load saved theme
if (localStorage.getItem('theme') === 'light') {
  isDarkMode = false;
}
updateTheme();

themeToggle.addEventListener('click', () => {
  isDarkMode = !isDarkMode;
  updateTheme();
});

// Setup settings modal
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');

settingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('active');
  keybindManager.renderKeybinds();
});

closeSettings.addEventListener('click', () => {
  settingsModal.classList.remove('active');
});

// Start game
gameClient.connect();

