import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
    DialogSystem,
    DialogBox,
    dialogBox,
    ImageContainer,
    AudioContainer,
    ButtonContainer,
    extractStorySegment,
    parseTextTokens,
    resolveResourcePath
} = require("../script/dialog.js");

function createMockDOM() {
    class MockEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.bubbles = init.bubbles ?? true;
            this.defaultPrevented = false;
            this.propagationStopped = false;
            this.target = null;
            this.currentTarget = null;
            Object.assign(this, init);
        }
        preventDefault() {
            this.defaultPrevented = true;
        }
        stopPropagation() {
            this.propagationStopped = true;
        }
    }

    class MockClassList {
        constructor(el) {
            this.el = el;
            this.set = new Set();
        }
        _sync() {
            this.el._className = Array.from(this.set).join(" ");
        }
        add(...tokens) {
            for (const token of tokens) {
                if (/\s/.test(token)) {
                    throw new Error(`InvalidCharacterError: "${token}"`);
                }
                if (token) this.set.add(token);
            }
            this._sync();
        }
        remove(...tokens) {
            for (const token of tokens) this.set.delete(token);
            this._sync();
        }
        toggle(token, force) {
            if (force === true) {
                this.set.add(token);
            } else if (force === false) {
                this.set.delete(token);
            } else if (this.set.has(token)) {
                this.set.delete(token);
            } else {
                this.set.add(token);
            }
            this._sync();
            return this.set.has(token);
        }
        contains(token) {
            return this.set.has(token);
        }
    }

    class MockNode {
        constructor() {
            this.parentNode = null;
            this.childNodes = [];
            this._listeners = new Map();
        }
        get children() {
            return this.childNodes.filter((n) => n instanceof MockElement);
        }
        appendChild(child) {
            if (child instanceof MockDocumentFragment) {
                for (const nested of [...child.childNodes]) {
                    this.appendChild(nested);
                }
                return child;
            }
            if (child.parentNode) {
                child.parentNode.removeChild(child);
            }
            child.parentNode = this;
            this.childNodes.push(child);
            return child;
        }
        append(...nodes) {
            for (const node of nodes) {
                this.appendChild(node);
            }
        }
        removeChild(child) {
            const idx = this.childNodes.indexOf(child);
            if (idx !== -1) {
                this.childNodes.splice(idx, 1);
                child.parentNode = null;
            }
            return child;
        }
        remove() {
            if (this.parentNode) {
                this.parentNode.removeChild(this);
            }
        }
        addEventListener(type, listener) {
            if (!this._listeners.has(type)) {
                this._listeners.set(type, new Set());
            }
            this._listeners.get(type).add(listener);
        }
        removeEventListener(type, listener) {
            if (arguments.length < 2) {
                throw new TypeError("2 arguments required, but only 1 present.");
            }
            const set = this._listeners.get(type);
            if (set) set.delete(listener);
        }
        listenerCount(type) {
            if (type) return this._listeners.get(type)?.size || 0;
            let total = 0;
            for (const set of this._listeners.values()) total += set.size;
            return total;
        }
        dispatchEvent(event) {
            if (!event.target) event.target = this;
            let curr = this;
            while (curr) {
                event.currentTarget = curr;
                const set = curr._listeners?.get(event.type);
                if (set) {
                    for (const fn of [...set]) {
                        fn.call(curr, event);
                    }
                }
                if (!event.bubbles || event.propagationStopped) break;
                curr = curr.parentNode;
            }
            return !event.defaultPrevented;
        }
    }

    class MockDocumentFragment extends MockNode {}

    class MockElement extends MockNode {
        constructor(tagName, ownerDoc) {
            super();
            this.tagName = tagName.toUpperCase();
            this.ownerDocument = ownerDoc;
            this.id = "";
            this._className = "";
            this.classList = new MockClassList(this);
            this.dataset = {};
            this.attributes = new Map();
            this._style = { filter: "" };
            this._textContent = "";
            this.scrollTop = 0;
            this.scrollHeight = 200;
            this.value = "";
            this.type = "";
            this.alt = "";
            this.src = "";
            this.rel = "";
            this.href = "";
        }
        get style() {
            return this._style;
        }
        get className() {
            return this._className;
        }
        set className(val) {
            this.classList.set = new Set(String(val).split(/\s+/).filter(Boolean));
            this.classList._sync();
        }
        get textContent() {
            if (this.childNodes.length === 0) return this._textContent;
            return this.childNodes.map((c) => c.textContent).join("");
        }
        set textContent(val) {
            this.childNodes = [];
            this._textContent = val == null ? "" : String(val);
        }
        get innerHTML() {
            return this._textContent;
        }
        set innerHTML(val) {
            this.childNodes = [];
            this._textContent = val == null ? "" : String(val);
        }
        setAttribute(k, v) {
            this.attributes.set(k, String(v));
            if (k === "href") this.href = String(v);
            if (k === "rel") this.rel = String(v);
        }
        getAttribute(k) {
            if (k === "href" && this.href) return this.href;
            if (k === "rel" && this.rel) return this.rel;
            return this.attributes.get(k) ?? null;
        }
        removeAttribute(k) {
            this.attributes.delete(k);
            if (k === "src") this.src = "";
        }
        focus() {
            this.ownerDocument.activeElement = this;
        }
        click() {
            this.dispatchEvent(new MockEvent("click", { bubbles: true }));
        }
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        }
        querySelectorAll(selector) {
            const matches = [];
            const walk = (node) => {
                for (const child of node.children) {
                    if (matchesSelector(child, selector)) {
                        matches.push(child);
                    }
                    walk(child);
                }
            };
            walk(this);
            return matches;
        }
    }

    class MockAudioElement extends MockElement {
        constructor(ownerDoc) {
            super("audio", ownerDoc);
            this._volume = 1;
            this.paused = true;
            this.loop = false;
            this.currentTime = 0;
            this.playCalls = 0;
            this.pauseCalls = 0;
        }
        get volume() {
            return this._volume;
        }
        set volume(v) {
            if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 1) {
                throw new RangeError(`Volume ${v} is outside [0.0, 1.0]`);
            }
            this._volume = v;
        }
        play() {
            this.playCalls += 1;
            this.paused = false;
            return Promise.resolve();
        }
        pause() {
            this.pauseCalls += 1;
            this.paused = true;
        }
    }

    function matchesSelector(el, selector) {
        if (selector.startsWith("#")) {
            return el.id === selector.slice(1);
        }
        if (selector === 'link[rel="stylesheet"]') {
            return el.tagName === "LINK" && el.getAttribute("rel") === "stylesheet";
        }
        return el.tagName === selector.toUpperCase();
    }

    class MockDocument extends MockNode {
        constructor() {
            super();
            this.head = new MockElement("head", this);
            this.body = new MockElement("body", this);
            this.main = new MockElement("main", this);
            this.body.appendChild(this.main);
            this.activeElement = null;
        }
        createElement(tag) {
            if (tag.toLowerCase() === "audio") {
                return new MockAudioElement(this);
            }
            return new MockElement(tag, this);
        }
        createDocumentFragment() {
            return new MockDocumentFragment();
        }
        getElementById(id) {
            return this.querySelector(`#${id}`);
        }
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        }
        querySelectorAll(selector) {
            const results = [];
            const roots = [this.head, this.body];
            for (const root of roots) {
                if (matchesSelector(root, selector)) results.push(root);
                results.push(...root.querySelectorAll(selector));
            }
            return results;
        }
    }

    const doc = new MockDocument();
    globalThis.document = doc;
    globalThis.HTMLElement = MockElement;
    return { doc, MockEvent };
}

test("extractStorySegment splits parts by break and handles edge cases", () => {
    const lines = ["A1", "A2", " break ", "B1", "break", "C1"];
    assert.deepEqual(extractStorySegment(lines, 0), ["A1", "A2"]);
    assert.deepEqual(extractStorySegment(lines, 1), ["B1"]);
    assert.deepEqual(extractStorySegment(lines, 2), ["C1"]);
    assert.deepEqual(extractStorySegment(lines, 3), []);
    assert.deepEqual(extractStorySegment("Single", 0), ["Single"]);
    assert.deepEqual(extractStorySegment("Single", 1), []);
    assert.deepEqual(extractStorySegment([], 0), []);
});

test("resolveResourcePath preserves URLs, relative prefixes, and base path", () => {
    assert.equal(resolveResourcePath("bocchi.jpg"), "resources/bocchi.jpg");
    assert.equal(resolveResourcePath("resources/bocchi.jpg"), "resources/bocchi.jpg");
    assert.equal(resolveResourcePath("./img/a.png"), "./img/a.png");
    assert.equal(resolveResourcePath("/assets/a.png"), "/assets/a.png");
    assert.equal(resolveResourcePath("https://example.com/a.png"), "https://example.com/a.png");
    assert.equal(resolveResourcePath("data:image/png;base64,abc"), "data:image/png;base64,abc");
});

test("DialogSystem initializes without duplicate stylesheets and cleans up on destroy", () => {
    const { doc } = createMockDOM();
    const existingLink = doc.createElement("link");
    existingLink.setAttribute("rel", "stylesheet");
    existingLink.setAttribute("href", "style/appearance.css");
    doc.head.appendChild(existingLink);

    const ds = new DialogSystem({ typingSpeed: 0 });
    assert.equal(doc.head.querySelectorAll('link[rel="stylesheet"]').length, 1);
    assert.equal(ds.dialog.style.display, "none");
    assert.equal(ds.dialogBoxInstance.getImg().style.visibility, "hidden");
    assert.ok(doc.listenerCount("keydown") >= 1);

    ds.show();
    assert.equal(ds.dialog.style.display, "block");
    assert.equal(ds.isDisplaying, true);

    ds.audContainer.addAudio("bgm", "Music.mp3");
    ds.audContainer.audPlay("bgm", 0, 0);
    assert.equal(ds.audContainer.getAudio("bgm").paused, false);

    ds.hide();
    assert.equal(ds.dialog.style.display, "none");
    assert.equal(ds.isDisplaying, false);
    assert.equal(ds.audContainer.getAudio("bgm").paused, true);

    ds.destroy();
    assert.equal(doc.getElementById("dialog"), null);
    assert.equal(doc.listenerCount("keydown"), 0);
    assert.equal(doc.listenerCount("keyup"), 0);
});

test("DialogSystem.showStory advances, handles break, skips typing, syncs speaker, and leaks 0 listeners", async () => {
    const { doc, MockEvent } = createMockDOM();
    const ds = new DialogSystem({ typingSpeed: 50 });
    ds.show();
    ds.dialogBoxInstance.setSpeaker("<Alice>");

    assert.equal(ds.speaker, "<Alice>");
    const box = ds.dialogBoxInstance.getBox();
    const baseDocListeners = doc.listenerCount("keydown");

    // Part 0 stops at "break" and resolves!
    const story = ["Hello <world>", "Second line", "break", "Part two"];
    const p0 = ds.showStory(story, 0);

    // Click while typing "Hello <world>" skips typewriter immediately
    box.click();
    assert.equal(box.textContent, "Hello <world>");
    assert.equal(ds.isLocked, false);

    // Next click starts "Second line"
    box.click();
    assert.equal(ds.isLocked, true);

    // Spacebar skips typing "Second line"
    doc.dispatchEvent(new MockEvent("keydown", { key: " " }));
    assert.equal(box.textContent, "Second line");
    assert.equal(ds.isLocked, false);

    // Spacebar advances past end of part 0 (at "break") and resolves p0
    doc.dispatchEvent(new MockEvent("keydown", { key: " " }));
    await p0;

    // Zero listener leaks on box & document!
    assert.equal(box.listenerCount("click"), 0);
    assert.equal(doc.listenerCount("keydown"), baseDocListeners);

    // Check history content safely escaped (stored in textContent, synced speaker)
    const entries = ds.dialogHistory.querySelectorAll("section");
    assert.equal(entries.length, 2);
    assert.equal(entries[0].textContent, "<Alice>: Hello <world>");
    assert.equal(entries[1].textContent, "<Alice>: Second line");

    // Part 1 plays after "break"
    ds.setTypingSpeed(0);
    const p1 = ds.showStory(story, 1);
    assert.equal(box.textContent, "Part two");
    box.click();
    await p1;

    assert.equal(box.listenerCount("click"), 0);
    assert.equal(doc.listenerCount("keydown"), baseDocListeners);
    ds.destroy();
});

test("DialogSystem history toggles on first L keypress and ignores when typing in input or Ctrl+L", async () => {
    const { doc, MockEvent } = createMockDOM();
    const ds = new DialogSystem({ typingSpeed: 0 });
    ds.show();

    // Ctrl+L does not toggle
    doc.dispatchEvent(new MockEvent("keydown", { key: "l", ctrlKey: true }));
    assert.equal(ds.dialogHistory.style.display, "none");

    // First 'l' opens immediately
    doc.dispatchEvent(new MockEvent("keydown", { key: "l" }));
    assert.equal(ds.dialogHistory.style.display, "block");
    assert.equal(ds.isHistoryOpen, true);

    // Escape closes it
    doc.dispatchEvent(new MockEvent("keydown", { key: "Escape" }));
    assert.equal(ds.dialogHistory.style.display, "none");
    assert.equal(ds.isHistoryOpen, false);

    // While input prompt is open, typing 'l' does not open history
    const promptPromise = ds.dialogBoxInstance.getMessage("Name?");
    doc.dispatchEvent(new MockEvent("keydown", { key: "l" }));
    assert.equal(ds.isHistoryOpen, false);

    ds.dialogBoxInstance.input.value = "Kel";
    // IME composition Enter should NOT submit
    ds.dialogBoxInstance.input.dispatchEvent(new MockEvent("keydown", { key: "Enter", isComposing: true }));
    assert.equal(ds.dialogBoxInstance.isPromptOpen, true);

    // Real Enter submits and cleans up
    ds.dialogBoxInstance.input.dispatchEvent(new MockEvent("keydown", { key: "Enter", isComposing: false }));
    const name = await promptPromise;
    assert.equal(name, "Kel");
    assert.equal(ds.dialogBoxInstance.isPromptOpen, false);
    assert.equal(ds.dialogBoxInstance.input.listenerCount("keydown"), 0);

    // Subsequent prompt starts clean (no stale value)
    const prompt2 = ds.dialogBoxInstance.getMessage("Age?");
    assert.equal(ds.dialogBoxInstance.input.value, "");
    ds.dialogBoxInstance.input.value = "20";
    ds.dialogBoxInstance.submitBtn.click();
    assert.equal(await prompt2, "20");

    ds.destroy();
});

test("dialogBox setImg hides opaque box color and setColor restores", () => {
    createMockDOM();
    assert.equal(DialogBox, dialogBox);
    const ds = new DialogSystem();
    ds.dialogBoxInstance.setColor("#333333");
    assert.equal(ds.dialogBoxInstance.box.style.backgroundColor, "#333333");

    ds.dialogBoxInstance.setImg("frame.png");
    assert.equal(ds.dialogBoxInstance.img.style.visibility, "visible");
    assert.equal(ds.dialogBoxInstance.box.style.backgroundColor, "transparent");

    ds.dialogBoxInstance.setImg(null);
    assert.equal(ds.dialogBoxInstance.img.style.visibility, "hidden");
    assert.equal(ds.dialogBoxInstance.box.style.backgroundColor, "#333333");
    ds.destroy();
});

test("ImageContainer composes transforms without clobbering and avoids NaN on partial/zero-time updates", async () => {
    createMockDOM();
    const imgC = new ImageContainer();
    const el = imgC.addImg("hero", "bocchi.jpg");

    // Partial update shouldn't set NaN%
    imgC.setAppearance("hero", { left: 960, top: 540, zIndex: 2 });
    assert.equal(el.style.left, "50%");
    assert.equal(el.style.top, "50%");
    assert.equal(el.style.width, undefined);
    assert.equal(el.style.zIndex, "2");

    // Zero-duration animations resolve cleanly and compose transforms
    await Promise.all([
        imgC.move("hero", 192, -108, 0),
        imgC.scale("hero", 1.5, 2, 0),
        imgC.skew("hero", 10, 5, 0),
        imgC.rotate("hero", 45, 0)
    ]);

    assert.equal(el.style.left, "60%");
    assert.equal(el.style.top, "40%");
    assert.equal(el.style.transform, "rotate(45deg) skew(10deg, 5deg) scale(1.5, 2)");

    // Non-existent image warns safely without throwing
    await imgC.move("missing", 10, 10, 0);
    assert.equal(imgC.removeImg("hero"), true);
    assert.equal(imgC.getImg("hero"), undefined);
});

test("ImageContainer interpolates timed animations and cancels overlapping same-channel tweens", async () => {
    createMockDOM();
    const imgC = new ImageContainer();
    const el = imgC.addImg("hero", "bocchi.jpg");
    imgC.setAppearance("hero", { left: 0, top: 0 });

    // Start a long move, then immediately override with a short move on the same channel
    const firstMove = imgC.move("hero", 960, 0, 1, "easeOut");
    const secondMove = imgC.move("hero", 192, 108, 0.04, "linear");
    const rot = imgC.rotate("hero", 180, 0.04, "easeInOut");

    await Promise.all([firstMove, secondMove, rot]);
    assert.equal(el.style.left, "10%");
    assert.equal(el.style.top, "10%");
    assert.equal(el.style.transform, "rotate(180deg) skew(0deg, 0deg) scale(1, 1)");
});

test("AudioContainer handles fades strictly in [0, 1] and resets volume on replay", async () => {
    createMockDOM();
    const audC = new AudioContainer();
    const audio = audC.addAudio("bgm", "Music.mp3", { loop: true });

    await audC.audPlay("bgm", 0, 50);
    assert.equal(audio.paused, false);
    assert.equal(audio.volume, 1);

    await audC.audStop("bgm", 50);
    assert.equal(audio.paused, true);
    assert.equal(audio.volume, 0);

    // Replaying without fade restores volume to 1 instead of staying muted at 0
    await audC.audPlay("bgm", 0, 0);
    assert.equal(audio.paused, false);
    assert.equal(audio.volume, 1);

    // Timed playback auto-pauses once via setTimeout (not recurring setInterval)
    const beforePauses = audio.pauseCalls;
    await audC.audPlay("bgm", 0.04, 0);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(audio.paused, true);
    assert.equal(audio.pauseCalls, beforePauses + 1);

    audC.stopAll();
});

test("ButtonContainer selects via click and keyboard/wheel without listener leaks or hide bugs", async () => {
    const { doc, MockEvent } = createMockDOM();
    const btnC = new ButtonContainer();

    // Empty showButton resolves null immediately
    assert.equal(await btnC.showButton(), null);

    btnC.addButton("go left", "Go Left");
    btnC.addButton("go right", "Go Right");
    assert.equal(btnC.buttonElements.length, 2);

    // Clear one specific button and re-add
    btnC.clearButton("go left");
    assert.equal(btnC.buttonElements.length, 1);
    btnC.addButton("choiceA", "Choice A");
    btnC.addButton("choiceB", "Choice B");

    const choicePromise = btnC.showButton();
    assert.equal(btnC.buttonsArea.style.display, "flex");

    // Scroll down selects first item (go right), down -> choiceA, down -> choiceB, up -> choiceA
    doc.dispatchEvent(new MockEvent("wheel", { deltaY: 100 }));
    assert.ok(btnC.buttonElements[0].classList.contains("selected"));
    doc.dispatchEvent(new MockEvent("keydown", { key: "ArrowDown" }));
    assert.ok(btnC.buttonElements[1].classList.contains("selected"));
    doc.dispatchEvent(new MockEvent("keydown", { key: "w" }));
    assert.ok(btnC.buttonElements[0].classList.contains("selected"));
    doc.dispatchEvent(new MockEvent("keydown", { key: "s" }));
    assert.ok(btnC.buttonElements[1].classList.contains("selected"));

    // Pressing Enter resolves with dataset.value ("choiceA") and cleans up
    doc.dispatchEvent(new MockEvent("keydown", { key: "Enter" }));
    const chosen = await choicePromise;
    assert.equal(chosen, "choiceA");
    assert.equal(btnC.buttonsArea.style.display, "none");
    assert.equal(btnC.buttonElements.length, 0);
    assert.equal(doc.listenerCount("keydown"), 0);
    assert.equal(doc.listenerCount("wheel"), 0);
});

test("parseTextTokens handles inlineTags opt-in and structured text chunks", () => {
    const literal = parseTextTokens("Keep {wait:200} literal", false);
    assert.equal(literal.plainText, "Keep {wait:200} literal");
    assert.deepEqual(literal.tokens, [{ type: "text", value: "Keep {wait:200} literal" }]);

    const tagged = parseTextTokens("Hello{wait:150}{speed:30} world!", true);
    assert.equal(tagged.plainText, "Hello world!");
    assert.deepEqual(tagged.tokens, [
        { type: "text", value: "Hello" },
        { type: "wait", ms: 150 },
        { type: "speed", ms: 30 },
        { type: "text", value: " world!" }
    ]);

    const chunked = parseTextTokens(["First", { pause: 250 }, " second"], false);
    assert.equal(chunked.plainText, "First second");
    assert.deepEqual(chunked.tokens, [
        { type: "text", value: "First" },
        { type: "wait", ms: 250 },
        { type: "text", value: " second" }
    ]);
});

test("ImageContainer focus and dim highlight speakers while respecting dimmable: false", async () => {
    createMockDOM();
    const imgC = new ImageContainer();
    const bg = imgC.addImg("bg", "sunset.jpg", { dimmable: false });
    const a = imgC.addImg("alice", "alice.png");
    const b = imgC.addImg("bob", "bob.png");

    await imgC.focus("alice", { time: 0, dimBrightness: 0.5 });
    assert.equal(bg.style.filter, "");
    assert.equal(a.style.filter, "");
    assert.equal(b.style.filter, "brightness(0.5)");

    // Array empty dims all dimmable sprites (e.g. narration)
    await imgC.focus([], { time: 0, dimBrightness: 0.4 });
    assert.equal(bg.style.filter, "");
    assert.equal(a.style.filter, "brightness(0.4)");
    assert.equal(b.style.filter, "brightness(0.4)");

    // Passing null restores all dimmable sprites
    await imgC.focus(null, { time: 0 });
    assert.equal(a.style.filter, "");
    assert.equal(b.style.filter, "");
});

test("DialogSystem.showStory executes multi-speaker beats, stage directives, hooks, and { break: true }", async () => {
    createMockDOM();
    const ds = new DialogSystem({ typingSpeed: 0, inlineTags: true });
    ds.show();
    ds.imgContainer.addImg("a", "a.png");
    ds.imgContainer.addImg("b", "b.png");

    let entered = 0;
    let exited = 0;
    const box = ds.dialogBoxInstance.getBox();

    const beats = [
        {
            speaker: "Alice",
            background: "sunset.jpg",
            focus: "a",
            focusOptions: { time: 0 },
            text: "Hello!",
            onEnter: () => { entered += 1; },
            onExit: () => { exited += 1; }
        },
        {
            images: { b: { move: [192, 0], time: 0 } },
            wait: 0
        },
        {
            speaker: "",
            focus: [],
            focusOptions: { time: 0 },
            text: "Narration line.",
            append: false
        },
        { break: true },
        { speaker: "Bob", text: "After break" }
    ];

    const p0 = ds.showStory(beats, 0);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ds.speaker, "Alice");
    assert.equal(ds.background.style.visibility, "visible");
    assert.equal(ds.imgContainer.getImg("b").style.filter, "brightness(0.55)");
    assert.equal(entered, 1);
    assert.equal(box.textContent, "Hello!");

    // Click advances past Alice -> runs stage-only beat (moves b) -> displays Narration
    box.click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(exited, 1);
    assert.equal(ds.imgContainer.getImg("b").style.left, "10%");
    assert.equal(ds.speaker, "");
    assert.equal(ds.dialogBoxInstance.nametag.style.display, "none");
    assert.equal(box.textContent, "Narration line.");

    // Click resolves part 0 at { break: true }
    box.click();
    await p0;

    // History omitted colon for empty speaker narration
    const entries = ds.dialogHistory.querySelectorAll("section");
    assert.equal(entries.length, 2);
    assert.equal(entries[0].textContent, "Alice: Hello!");
    assert.equal(entries[1].textContent, "Narration line.");

    const p1 = ds.showStory(beats, 1);
    assert.equal(ds.speaker, "Bob");
    assert.equal(box.textContent, "After break");
    box.click();
    await p1;
    ds.destroy();
});

test("DialogSystem autoPlay, skipMode, HUD controls, and ButtonContainer alignment work cleanly", async () => {
    createMockDOM();
    const ds = new DialogSystem({
        typingSpeed: 0,
        autoPlay: false,
        autoDelay: 20,
        skipDelay: 10,
        controls: true,
        buttonAlign: "left"
    });
    ds.show();

    assert.equal(ds.btnContainer.buttonsArea.getAttribute("data-align"), "left");
    ds.btnContainer.setAlignment("right");
    assert.equal(ds.btnContainer.buttonsArea.getAttribute("data-align"), "right");

    const autoBtn = ds.controlsBar.querySelector("button");
    assert.ok(autoBtn);

    // Enable autoPlay and watch multi-line story complete automatically
    ds.setAutoPlay(true, 15);
    assert.ok(ds._controlButtons.auto.classList.contains("active"));
    await ds.showStory(["Auto 1", "Auto 2"]);
    assert.equal(ds.dialogBoxInstance.box.textContent, "Auto 2");

    // Skip mode fast-forwards and stops automatically when showButton opens (stopSkipOnChoice)
    ds.setAutoPlay(false);
    ds.setSkipMode(true);
    await ds.showStory(["Skip 1", "Skip 2", "Skip 3"]);
    assert.equal(ds.skipMode, true);

    ds.btnContainer.addButton("opt1", "Option 1");
    const choicePromise = ds.btnContainer.showButton();
    assert.equal(ds.skipMode, false);
    ds.btnContainer.buttonElements[0].click();
    assert.equal(await choicePromise, "opt1");

    ds.destroy();
});

test("DialogSystem exportState and importState round-trip JSON snapshot faithfully", async () => {
    createMockDOM();
    const ds1 = new DialogSystem({ typingSpeed: 0 });
    ds1.show();
    ds1.setBackground("sunset.jpg");
    ds1.setSpeaker("Guide");
    ds1.dialogBoxInstance.setColor("#112233");
    ds1.imgContainer.addImg("hero", "bocchi.jpg", { dimmable: true });
    ds1.imgContainer.setAppearance("hero", { left: 960, top: 540, width: 400, height: 600, zIndex: 2, opacity: 0.8 });
    await ds1.imgContainer.rotate("hero", 30, 0);
    await ds1.imgContainer.dim("hero", true, { brightness: 0.5, time: 0 });
    ds1.audContainer.addAudio("bgm", "Music.mp3", { loop: true, volume: 0.7 });
    ds1.audContainer.audPlay("bgm", 0, 0);

    const storyPromise = ds1.showStory(["Saved line"]);
    const snapshotJson = JSON.stringify(ds1.exportState());
    ds1.dialogBoxInstance.getBox().click();
    await storyPromise;
    ds1.destroy();

    // Restore into a fresh DialogSystem instance
    createMockDOM();
    const ds2 = new DialogSystem({ typingSpeed: 0 });
    ds2.importState(JSON.parse(snapshotJson));

    assert.equal(ds2.isDisplaying, true);
    assert.equal(ds2.speaker, "Guide");
    assert.equal(ds2.background.getAttribute("src") || ds2.background.src, "resources/sunset.jpg");
    assert.equal(ds2.dialogBoxInstance.box.textContent, "Saved line");
    assert.equal(ds2.dialogBoxInstance.box.style.backgroundColor, "#112233");

    const hero2 = ds2.imgContainer.getImg("hero");
    assert.equal(hero2.style.left, "50%");
    assert.equal(hero2.style.top, "50%");
    assert.equal(hero2.style.opacity, "0.8");
    assert.equal(hero2.style.filter, "brightness(0.5)");
    assert.equal(hero2.style.transform, "rotate(30deg) skew(0deg, 0deg) scale(1, 1)");

    const bgm2 = ds2.audContainer.getAudio("bgm");
    assert.equal(bgm2.loop, true);
    assert.equal(bgm2.volume, 0.7);
    assert.equal(bgm2.paused, false);
    assert.equal(ds2.dialogHistory.querySelectorAll("section").length, 1);

    ds2.destroy();
});
