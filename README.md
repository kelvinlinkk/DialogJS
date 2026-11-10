# DialogJS

DialogJS is a lightweight, zero-dependency JavaScript library for building interactive dialog systems and visual novels for the web. It works directly via a `<script>` tag with no build step, and keeps its primitives composable and general-purpose.

## Features

- **Flexible `showStory()` Runner**: Accepts plain strings, `"break"`-delimited segments, or declarative multi-speaker stage beats (`{ speaker, text, focus, images, audio, background, delay, speed, append, onEnter, onExit }`).
- **Typewriter, Inline Pauses, Auto & Skip**: Click/`Space`/`Enter` to skip or advance, optional `{wait:ms}` / `{speed:ms}` inline tags (or structured text arrays), `Auto` playback, `Skip` mode, and `Ctrl` hold-to-skip.
- **Composable Stage Animations & Focus**: Position images on a responsive 16:9 (`1920x1080`) virtual canvas and animate `move`, `scale`, `skew`, `rotate`, `fadeTo`, `dim`, and `focus` concurrently without CSS transforms or filters overwriting one another.
- **Customizable CSS Layout**: Styled via CSS custom properties (`--dialog-height`, `--dialog-bottom`, `--buttons-width`, `--accent-color`, etc.) with `center` / `left` / `right` choice alignments.
- **Audio, Prompts, History & State Snapshots**: Millisecond fade-in/fade-out audio, IME-safe `getMessage()` input prompts, `L`/`Esc` dialog history log, optional HUD controls, and JSON-serializable `exportState()` / `importState()` for external save systems.

## Installation

Include the stylesheet and script in your HTML:

```html
<link rel="stylesheet" href="style/appearance.css">
<script src="script/dialog.js"></script>
```

> **Note:** If you load external story files with `fetch()` (as `demo.html` does with `demo.txt`), serve the folder over a local HTTP server (for example `npx serve` or `python -m http.server`).

## Quick Start

```javascript
const dialog = new DialogSystem({
    resourcePath: "resources/",
    typingSpeed: 15,
    controls: true,       // optional Auto / Skip / Log HUD bar
    inlineTags: true,     // enable {wait:ms} and {speed:ms} tags
    buttonAlign: "center" // "center" | "left" | "right"
});

dialog.show();

// Plain strings & "break" segments still work out of the box
await dialog.showStory([
    "Hello, welcome to our story!",
    "break",
    "This is part 1, played after the break."
], 0);

// Or multi-speaker declarative beats
await dialog.showStory([
    { speaker: "Alice", text: "Did you hear that?{wait:300} Wait...", focus: "alice" },
    { speaker: "Bob", text: "Stay right there.", focus: "bob" },
    { speaker: "", focus: [], text: "Silence fell over the room." } // empty speaker hides nametag
]);
```

## API Overview

### `DialogSystem`

- `new DialogSystem(options?)`
  - `container`: Target element or CSS selector (defaults to `main`, falling back to `document.body`).
  - `resourcePath`: Base folder prepended to relative asset paths (default `"resources/"`).
  - `stylesheetPath`: CSS path auto-injected if not already loaded (default `"style/appearance.css"`, or `null` to disable).
  - `typingSpeed`: Delay in ms per character (default `15`; `0` renders instantly).
  - `defaultSpeaker`: Initial speaker label (default `"someone"`).
  - `autoPlay` / `autoDelay`: Auto-advance toggle and delay in ms (default `false`, `1500`).
  - `skipMode` / `skipDelay` / `holdCtrlToSkip` / `stopSkipOnChoice`: Fast-forward behavior.
  - `inlineTags`: Parse `{wait:ms}` / `{pause:ms}` / `{speed:ms}` in dialogue strings (default `false`; array text chunks `["Hi", { wait: 300 }, "!"]` always work).
  - `controls`: `false` (default), `true`, or `{ log, auto, skip }` to render built-in HUD controls.
  - `buttonAlign`: Default choice alignment (`"center"`, `"left"`, or `"right"`).
- `show()` / `hide()` / `destroy()`
- `showStory(texts, partIndex = 0)` — Accepts strings, `"break"` / `{ break: true }`, or beat objects. Returns a `Promise<void>`.
- `setSpeaker(name)` / `setBackground(src)` / `setTypingSpeed(ms)`
- `setAutoPlay(enabled, delayMs?)` / `toggleAutoPlay()`
- `setSkipMode(enabled)` / `toggleSkipMode()`
- `toggleHistory(force?)` / `clearHistory()`
- `on(event, handler)` / `off(event, handler)` — Events: `show`, `hide`, `speakerChange`, `lineStart`, `lineComplete`, `autoChange`, `skipChange`, `historyChange`.
- `exportState()` / `importState(snapshot, options?)` — Portable JSON snapshot of stage state, images, audio, and history.

### `ImageContainer` (`dialogSystem.imgContainer`)

- `addImg(name, src, { dimmable, visible }?)` / `getImg(name)` / `showImg(name)` / `hideImg(name)` / `removeImg(name)`
- `setAppearance(name, { left, top, zIndex, width, height, opacity })` — `1920x1080` virtual coordinates (partial updates supported).
- `move(name, deltaX, deltaY, time = 0, easing = "linear")`
- `scale(name, w, h, time = 0, easing = "linear")`
- `skew(name, angleX, angleY, time = 0, easing = "linear")`
- `rotate(name, angle, time = 0, easing = "linear")`
- `fadeIn(name, time = 0.5)` / `fadeOut(name, time = 0.5)` / `fadeTo(name, opacity, time = 0.5, easing = "linear")`
- `dim(name, dimmed = true, { brightness, time, easing }?)`
- `focus(activeNames, { activeBrightness, dimBrightness, time, easing, targets, exclude }?)` — Pass `null` to restore all dimmable sprites to full brightness, `[]` to dim all, or name(s) to spotlight.
- `setTransform(name, partial)` / `setFilter(name, cssFilter)`

### `AudioContainer` (`dialogSystem.audContainer`)

- `addAudio(name, src, { loop, volume, preload }?)` / `getAudio(name)` / `removeAudio(name)`
- `audPlay(name, time = 0, fade = 0, options?)` — `time` in **seconds** (`0` = no auto-pause), `fade` in **milliseconds**.
- `audStop(name, fade = 0)` — `fade` in **milliseconds**.
- `setVolume(name, volume)` / `pauseAll()` / `stopAll()`

### `ButtonContainer` (`dialogSystem.btnContainer`)

- `addButton(value, text)` / `setAlignment("center" | "left" | "right")`
- `showButton(options?)` — Returns a `Promise` resolving to the chosen `value` (or `null` if cleared/empty).
- `clearButton(name?)`

### `dialogBox` (`dialogSystem.dialogBoxInstance`)

- `setColor(color)` / `setImg(source)` / `setText(text)` / `setSpeaker(name)`
- `getMessage(promptText, defaultValue = "")`

## CSS Variables (`style/appearance.css`)

Override variables on `#dialog` to restyle without fighting selector specificity:

```css
#dialog {
    --dialog-height: 31%;
    --dialog-bottom: 5%;
    --buttons-width: min(52%, 28em);
    --accent-color: #4f46e5;
}
```

## Running Tests

```bash
node --test tests/dialog.test.mjs
```
