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

// Update home player name display
const homePlayerName = document.getElementById('homePlayerName');
if (homePlayerName) {
  homePlayerName.textContent = savedName;
}

// Update home player name when input changes
playerNameInput.addEventListener('input', (e) => {
  if (homePlayerName) {
    homePlayerName.textContent = e.target.value || 'Guest';
  }
});

function startPlaying() {
  const chosenName = playerNameInput.value.trim() || 'Player';
  localStorage.setItem('playerName', chosenName);
  gameClient.setPlayerName(chosenName);
  if (homePlayerName) {
    homePlayerName.textContent = chosenName;
  }
  gameClient.setPlaying(true);
  homeScreen.classList.add('hidden');
}

playBtn.addEventListener('click', startPlaying);
playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    startPlaying();
  }
});

// Setup theme toggle (moved to home section)
const homeThemeToggle = document.getElementById('homeThemeToggle');
let isDarkMode = localStorage.getItem('theme') !== 'light';

function updateTheme() {
  if (isDarkMode) {
    document.body.classList.remove('light-mode');
    if (homeThemeToggle) homeThemeToggle.textContent = '🌙 Dark Mode';
    localStorage.setItem('theme', 'dark');
  } else {
    document.body.classList.add('light-mode');
    if (homeThemeToggle) homeThemeToggle.textContent = '☀️ Light Mode';
    localStorage.setItem('theme', 'light');
  }
  gameClient.setTheme(isDarkMode);
}

// Load saved theme
if (localStorage.getItem('theme') === 'light') {
  isDarkMode = false;
}
updateTheme();

if (homeThemeToggle) {
  homeThemeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    updateTheme();
  });
}

// Setup settings modal
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');

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

// Chat functionality
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatTabs = document.querySelectorAll('.chat-tab');
const chatMessagesGlobal = document.getElementById('chatMessagesGlobal');
const chatMessagesParty = document.getElementById('chatMessagesParty');

let currentChannel = 'global';

// Switch chat channels
chatTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const channel = tab.dataset.channel;
    currentChannel = channel;
    
    // Update active tab
    chatTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Show/hide message containers
    chatMessagesGlobal.classList.toggle('active', channel === 'global');
    chatMessagesParty.classList.toggle('active', channel === 'party');
    
    // Update placeholder
    chatInput.placeholder = channel === 'global' 
      ? 'Type a message...' 
      : 'Type a party message...';
  });
});

function addChatMessage(username, message, channel = currentChannel) {
  const messagesContainer = channel === 'global' ? chatMessagesGlobal : chatMessagesParty;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  
  const usernameSpan = document.createElement('span');
  usernameSpan.className = 'chat-username';
  usernameSpan.textContent = username + ':';
  
  const textSpan = document.createElement('span');
  textSpan.className = 'chat-text';
  textSpan.textContent = message;
  
  messageDiv.appendChild(usernameSpan);
  messageDiv.appendChild(textSpan);
  messagesContainer.appendChild(messageDiv);
  
  // Auto-scroll to bottom if this channel is active
  if (messagesContainer.classList.contains('active')) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Limit messages to last 50 per channel
  while (messagesContainer.children.length > 50) {
    messagesContainer.removeChild(messagesContainer.firstChild);
  }
}

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  
  const playerName = gameClient.playerName || 'Player';
  // For now, just display locally (no server integration yet)
  addChatMessage(playerName, message, currentChannel);
  chatInput.value = '';
  
  // TODO: Send message to server when chat is integrated
  // Should send: { type: 'chat', channel: currentChannel, message: message }
}

chatSendBtn.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
});

// Spectate button (placeholder)
const spectateBtn = document.getElementById('spectateBtn');
if (spectateBtn) {
  spectateBtn.addEventListener('click', () => {
    // TODO: Implement spectate mode
    console.log('Spectate mode - coming soon');
  });
}

// Login button (placeholder)
const homeLoginBtn = document.getElementById('homeLoginBtn');
if (homeLoginBtn) {
  homeLoginBtn.addEventListener('click', () => {
    // TODO: Implement login system
    console.log('Login - coming soon');
  });
}

// Game mode selection (placeholder)
document.querySelectorAll('.gameMode').forEach(mode => {
  mode.addEventListener('click', () => {
    // Remove active class from all modes
    document.querySelectorAll('.gameMode').forEach(m => m.classList.remove('active'));
    // Add active class to clicked mode
    mode.classList.add('active');
    // TODO: Implement mode switching
  });
});


// Start game
gameClient.connect();

