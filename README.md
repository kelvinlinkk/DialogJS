# DialogJS

DialogJS is a lightweight, zero-dependency JavaScript library for building interactive visual novels and dialog systems for the web. It manages typed dialog playback, character/background layering and animations, audio fades, branching choices, user input prompts, and a toggleable dialog history log.

## Features

- **Typewriter Dialog & Story Segments**: Async/await `showStory()` with click/Space/Enter skip-to-complete, advancing, and `"break"`-delimited story parts.
- **Image Staging & Composable Animations**: Position assets on a responsive 16:9 (`1920x1080`) virtual stage and animate `move`, `scale`, `skew`, `rotate`, and `fadeIn`/`fadeOut` concurrently with easing support (`linear`, `easeIn`, `easeOut`, `easeInOut`) without transforms overwriting one another.
- **Audio Management**: Play/stop audio with smooth millisecond fades, timed auto-pause, looping, and volume control.
- **Branching Choices**: Keyboard (`ArrowUp`/`ArrowDown`, `W`/`S`, `Enter`), mouse wheel, and click support.
- **User Input Prompts**: Built-in `getMessage()` prompt overlay with IME-safe `Enter` submission and clickable confirmation.
- **Dialog History Log**: Press `L` to open/close the scrollable transcript (`Esc` or Close button also dismisses it).

## Installation

Include the stylesheet and script in your HTML:

```html
<link rel="stylesheet" href="style/appearance.css">
<script src="script/dialog.js"></script>
```

> **Note:** If you load external story files with `fetch()` (as `demo.html` does with `demo.txt`), serve the folder over a local HTTP server (for example `npx serve` or `python -m http.server`).

## Quick Start

```javascript
const dialogSystem = new DialogSystem({
    resourcePath: "resources/",
    typingSpeed: 15,
    defaultSpeaker: "Guide"
});

dialogSystem.show();
await dialogSystem.showStory([
    "Hello, welcome to our story!",
    "Click or press Space to skip typing or advance.",
    "break",
    "This is part 1, played after the break."
], 0);

await dialogSystem.showStory(texts, 1);
```

## API Overview

### `DialogSystem`

- `new DialogSystem(options?)`
  - `container`: Target element or CSS selector (defaults to `main`, falling back to `document.body`).
  - `resourcePath`: Base folder prepended to relative image/audio paths (default `"resources/"`).
  - `stylesheetPath`: CSS path auto-injected if not already loaded (default `"style/appearance.css"`, or `null` to disable).
  - `typingSpeed`: Delay in ms per character (default `15`; `0` renders instantly).
  - `defaultSpeaker`: Initial speaker label (default `"someone"`).
- `show()` / `hide()` / `destroy()`
- `showStory(texts, partIndex = 0)` — Returns a `Promise` that resolves once the user advances past the end of the segment (or reaches `"break"`).
- `setSpeaker(name)` — Updates both the `#nametag` and `dialogSystem.speaker` used in the history log.
- `setBackground(src)` — Sets or clears the `#bg` backdrop image.
- `setTypingSpeed(ms)` — Adjusts typing speed at runtime.
- `toggleHistory(force?)` / `clearHistory()`

### `ImageContainer` (`dialogSystem.imgContainer`)

- `addImg(name, src)` / `getImg(name)` / `removeImg(name)`
- `setAppearance(name, { left, top, zIndex, width, height, opacity })` — Coordinates map to a `1920x1080` virtual canvas (partial updates supported).
- `move(name, deltaX, deltaY, time = 0, easing = "linear")` — Returns a `Promise`.
- `scale(name, w, h, time = 0, easing = "linear")` — Returns a `Promise`.
- `skew(name, angleX, angleY, time = 0, easing = "linear")` — Returns a `Promise`.
- `rotate(name, angle, time = 0, easing = "linear")` — Returns a `Promise`.
- `fadeIn(name, time = 0.5)` / `fadeOut(name, time = 0.5)` / `fadeTo(name, opacity, time = 0.5, easing = "linear")`
- `setTransform(name, { scaleX, scaleY, skewX, skewY, rotate })`

### `AudioContainer` (`dialogSystem.audContainer`)

- `addAudio(name, src, { loop, volume, preload }?)` / `getAudio(name)` / `removeAudio(name)`
- `audPlay(name, time = 0, fade = 0, options?)` — `time` is auto-pause duration in **seconds** (`0` = play without timer), `fade` is fade-in duration in **milliseconds**. Returns a `Promise`.
- `audStop(name, fade = 0)` — `fade` is fade-out duration in **milliseconds**. Returns a `Promise`.
- `setVolume(name, volume)` / `pauseAll()` / `stopAll()`

### `ButtonContainer` (`dialogSystem.btnContainer`)

- `addButton(value, text)`
- `showButton()` — Displays choices and returns a `Promise` resolving to the chosen `value` (or `null` if cleared/empty).
- `clearButton(name?)` — Removes a specific button by `value`, or clears and hides all buttons when omitted.

### `dialogBox` (`dialogSystem.dialogBoxInstance`)

- `setColor(color)` / `setImg(source)` / `setText(text)` / `setSpeaker(name)`
- `getMessage(promptText, defaultValue = "")` — Prompts for user input and resolves with the entered string.

## Running Tests

```bash
node --test tests/dialog.test.mjs
```
