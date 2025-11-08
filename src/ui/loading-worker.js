const RESET = '\x1b[0m';
const CLEAR_LINE = '\r\x1b[K';

const state = {
  active: false,
  timeout: null,
  frameIndex: 0,
  frames: [],
  text: '',
  characters: [],
  baseColor: 0,
  highlightColor: 0,
  interval: 200,
  startDelay: 0,
  cycleDelay: 0,
};

const buildColor = code => `\x1b[38;5;${code}m`;

const clearLine = () => {
  process.stdout.write(CLEAR_LINE);
};

const renderFrame = highlightIndex => {
  const base = buildColor(state.baseColor);
  const highlight = buildColor(state.highlightColor);
  const parts = [base];

  for (let index = 0; index < state.characters.length; index += 1) {
    const char = state.characters[index];
    if (char === undefined) {
      continue;
    }

    if (index === highlightIndex) {
      parts.push(`${highlight}${char}${base}`);
    } else {
      parts.push(char);
    }
  }

  parts.push(RESET);
  process.stdout.write(`\r${parts.join('')}\x1b[K`);
};

const scheduleNext = delay => {
  if (state.timeout) {
    clearTimeout(state.timeout);
  }

  state.timeout = setTimeout(() => {
    if (!state.active) {
      return;
    }

    const frame = state.frames[state.frameIndex];
    if (frame === undefined) {
      return;
    }

    renderFrame(frame);
    state.frameIndex = (state.frameIndex + 1) % state.frames.length;
    const nextDelay = state.frameIndex === 0 ? state.cycleDelay : state.interval;
    scheduleNext(nextDelay);
  }, delay);
};

const stopAnimation = () => {
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }

  if (state.active) {
    state.active = false;
    clearLine();
  }
  process.exit(0);
};

const startAnimation = message => {
  state.active = true;
  state.text = message.text;
  state.characters = message.text.split('');
  state.frames = Array.from({ length: state.characters.length }, (_, index) => index);
  state.baseColor = message.baseColor;
  state.highlightColor = message.highlightColor;
  state.interval = Math.max(message.interval, 1);
  state.startDelay = Math.max(message.startDelay, 0);
  state.cycleDelay = Math.max(message.cycleDelay, 0);
  state.frameIndex = 0;

  if (state.frames.length === 0 || state.text.length === 0) {
    process.stdout.write(`${buildColor(state.baseColor)}${state.text}${RESET}\n`);
    stopAnimation();
    return;
  }

  process.stdout.write(`\r${buildColor(state.baseColor)}${state.text}${RESET}\x1b[K`);
  scheduleNext(state.startDelay);
};

const parseArgs = () => {
  const options = {
    text: '',
    baseColor: 203,
    highlightColor: 210,
    interval: 200,
    startDelay: 400,
    cycleDelay: 200,
  };

  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || !flag.startsWith('--')) {
      continue;
    }

    switch (flag) {
      case '--text':
        if (value !== undefined) {
          options.text = value;
          index += 1;
        }
        break;
      case '--base-color':
        if (value !== undefined) {
          options.baseColor = Number(value);
          index += 1;
        }
        break;
      case '--highlight-color':
        if (value !== undefined) {
          options.highlightColor = Number(value);
          index += 1;
        }
        break;
      case '--interval':
        if (value !== undefined) {
          options.interval = Number(value);
          index += 1;
        }
        break;
      case '--start-delay':
        if (value !== undefined) {
          options.startDelay = Number(value);
          index += 1;
        }
        break;
      case '--cycle-delay':
        if (value !== undefined) {
          options.cycleDelay = Number(value);
          index += 1;
        }
        break;
      default:
        break;
    }
  }

  return options;
};

const options = parseArgs();

options.baseColor = Number.isFinite(options.baseColor) ? options.baseColor : 203;
options.highlightColor = Number.isFinite(options.highlightColor) ? options.highlightColor : 210;
options.interval = Number.isFinite(options.interval) ? Math.max(1, options.interval) : 200;
options.startDelay = Number.isFinite(options.startDelay) ? Math.max(0, options.startDelay) : 400;
options.cycleDelay = Number.isFinite(options.cycleDelay) ? Math.max(0, options.cycleDelay) : 200;
options.text = options.text ?? '';

if (process.env.WT_LOADING_TTY !== '1') {
  const message = options.text && options.text.trim().length > 0 ? options.text : 'Loading...';
  process.stdout.write(`${message}\n`);
  process.exit(0);
}

process.on('SIGTERM', () => {
  stopAnimation();
});

process.on('SIGINT', () => {
  stopAnimation();
});

process.on('disconnect', () => {
  stopAnimation();
});

startAnimation(options);
