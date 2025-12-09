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

// Home/play screen elements
const homeScreen = document.getElementById('homeScreen');
const playBtn = document.getElementById('playBtn');
const playerNameInput = document.getElementById('playerName');
const homeSettings = document.getElementById('homeSettings');

const savedName = localStorage.getItem('playerName') || 'Player';
playerNameInput.value = savedName;
gameClient.setPlayerName(savedName);

function startPlaying() {
  const chosenName = playerNameInput.value.trim() || 'Player';
  localStorage.setItem('playerName', chosenName);
  gameClient.setPlayerName(chosenName);
  gameClient.setPlaying(true);
  homeScreen.classList.add('hidden');
}

playBtn.addEventListener('click', startPlaying);
playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    startPlaying();
  }
});

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

homeSettings.addEventListener('click', () => {
  settingsModal.classList.add('active');
  keybindManager.renderKeybinds();
});

// ESC key to pause/go home
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gameClient.isPlaying) {
    // Pause game - show home screen but don't disconnect
    gameClient.setPlaying(false);
    homeScreen.classList.remove('hidden');
  }
});

// Update home screen stats
function updateHomeStats() {
  const homePlayers = document.getElementById('homePlayers');
  const homePing = document.getElementById('homePing');
  const homeFPS = document.getElementById('homeFPS');
  
  if (homePlayers) {
    const playerCount = gameClient.players ? gameClient.players.size : 0;
    homePlayers.textContent = playerCount;
  }
  
  if (homePing) {
    homePing.textContent = gameClient.ping || '--';
  }
  
  if (homeFPS) {
    // Calculate FPS from PIXI ticker
    const fps = Math.round(gameClient.app?.ticker?.FPS || 60);
    homeFPS.textContent = fps;
  }
}

// Update stats periodically
setInterval(updateHomeStats, 500);

// Start game
gameClient.connect();

