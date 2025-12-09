export class KeybindManager {
  constructor() {
    this.defaultKeybinds = {
      split: 'Space',
      doubleSplit: 'Shift+Space',
      tripleSplit: 'KeyE',
      split16: 'KeyQ',
      split32: 'KeyZ',
      feed: 'KeyW',
      macroFeed: 'KeyR',
      stop: 'KeyS',
      respawn: 'Enter'
    };

    this.keybinds = { ...this.defaultKeybinds };
    this.loadKeybinds();
  }

  loadKeybinds() {
    const saved = localStorage.getItem('keybinds');
    if (saved) {
      try {
        this.keybinds = { ...this.defaultKeybinds, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Error loading keybinds:', e);
      }
    }
  }

  saveKeybinds() {
    localStorage.setItem('keybinds', JSON.stringify(this.keybinds));
  }

  getKeyCode(keybindName) {
    return this.keybinds[keybindName] || this.defaultKeybinds[keybindName];
  }

  setKeybind(keybindName, keyCode) {
    this.keybinds[keybindName] = keyCode;
    this.saveKeybinds();
  }

  isPressed(keybindName, event) {
    const keyCode = this.getKeyCode(keybindName);
    
    if (keyCode.includes('+')) {
      // Handle modifier combinations
      const parts = keyCode.split('+');
      const modifier = parts[0].trim();
      const key = parts[1].trim();

      if (modifier === 'Shift' && event.shiftKey && this.getKeyName(event.code) === key) {
        return true;
      }
      if (modifier === 'Ctrl' && event.ctrlKey && this.getKeyName(event.code) === key) {
        return true;
      }
      if (modifier === 'Alt' && event.altKey && this.getKeyName(event.code) === key) {
        return true;
      }
      return false;
    } else {
      return event.code === keyCode || event.key === keyCode;
    }
  }

  getKeyName(code) {
    // Convert KeyCode to readable name
    if (code === 'Space') return 'Space';
    if (code.startsWith('Key')) return code.replace('Key', '');
    if (code.startsWith('Digit')) return code.replace('Digit', '');
    return code;
  }

  renderKeybinds() {
    const container = document.getElementById('keybindsList');
    container.innerHTML = '';

    const keybindNames = {
      split: 'Split (2x)',
      doubleSplit: 'Double Split (4x)',
      tripleSplit: 'Triple Split (8x)',
      split16: '16 Split',
      split32: '32 Split',
      feed: 'Feed',
      macroFeed: 'Macro Feed',
      stop: 'Stop Movement',
      respawn: 'Respawn'
    };

    Object.entries(keybindNames).forEach(([key, label]) => {
      const item = document.createElement('div');
      item.className = 'keybind-item';

      const labelEl = document.createElement('label');
      labelEl.textContent = label;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = this.keybinds[key] || '';
      input.readOnly = true;
      input.addEventListener('click', () => {
        input.value = 'Press any key...';
        input.style.borderColor = '#00ffff';

        const handler = (e) => {
          e.preventDefault();
          e.stopPropagation();

          let keyCode = e.code;
          if (e.shiftKey && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') {
            keyCode = `Shift+${this.getKeyName(e.code)}`;
          } else if (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') {
            keyCode = `Ctrl+${this.getKeyName(e.code)}`;
          } else if (e.altKey && e.code !== 'AltLeft' && e.code !== 'AltRight') {
            keyCode = `Alt+${this.getKeyName(e.code)}`;
          }

          this.setKeybind(key, keyCode);
          input.value = keyCode;
          input.style.borderColor = '#00ff00';

          document.removeEventListener('keydown', handler);
          document.removeEventListener('keyup', cleanup);
        };

        const cleanup = () => {
          document.removeEventListener('keydown', handler);
          document.removeEventListener('keyup', cleanup);
        };

        document.addEventListener('keydown', handler);
        document.addEventListener('keyup', cleanup);
      });

      item.appendChild(labelEl);
      item.appendChild(input);
      container.appendChild(item);
    });
  }
}

