/**
 * DialogJS — Lightweight zero-dependency visual novel & interactive dialog library.
 */

const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

const EASING_FUNCTIONS = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => 1 - (1 - t) * (1 - t),
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveResourcePath(src, basePath = "resources/") {
    if (!src) return "";
    const raw = String(src);
    if (/^(https?:|data:|blob:|\/|\.\/|\.\.\/)/i.test(raw)) {
        return raw;
    }
    if (basePath && raw.startsWith(basePath)) {
        return raw;
    }
    return `${basePath || ""}${raw}`;
}

function ensureStylesheet(href) {
    if (!href || typeof document === "undefined" || !document.head) return;
    const links = document.head.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
        const existingHref = link.getAttribute("href") || "";
        if (existingHref === href || existingHref.endsWith(`/${href}`)) {
            return;
        }
    }
    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = href;
    document.head.appendChild(linkEl);
}

function resolveEasing(easing) {
    if (typeof easing === "function") return easing;
    return EASING_FUNCTIONS[easing] || EASING_FUNCTIONS.linear;
}

function isBreakItem(item) {
    if (typeof item === "string") {
        return item.trim() === "break";
    }
    return Boolean(item && typeof item === "object" && item.break === true);
}

/**
 * Extract the items belonging to part `partIndex`, delimited by `"break"` or `{ break: true }`.
 * Preserves structured step objects as well as plain strings.
 * @param {string|Array<string|Object>} texts
 * @param {number} [partIndex=0]
 * @returns {Array<string|Object>}
 */
function extractStorySegment(texts, partIndex = 0) {
    const items = typeof texts === "string"
        ? [texts]
        : Array.isArray(texts)
            ? texts
            : [];

    const targetPart = Math.max(0, Math.floor(toFiniteNumber(partIndex, 0)));
    let currentPart = 0;
    const segment = [];

    for (const item of items) {
        if (isBreakItem(item)) {
            if (currentPart === targetPart) {
                break;
            }
            currentPart += 1;
            continue;
        }
        if (currentPart === targetPart) {
            if (item && typeof item === "object") {
                segment.push(item);
            } else {
                segment.push(item == null ? "" : String(item));
            }
        }
    }

    return segment;
}

/**
 * Parse text input (string or array of strings / `{ wait, pause, speed }` chunks)
 * into playback tokens plus the plain final string.
 * @param {string|Array} input
 * @param {boolean} [inlineTags=false]
 * @returns {{ tokens: Array, plainText: string }}
 */
function parseTextTokens(input, inlineTags = false) {
    const rawChunks = Array.isArray(input) ? input : [input == null ? "" : String(input)];
    const tokens = [];
    let plainText = "";

    const pushString = (str) => {
        if (!inlineTags) {
            if (str.length > 0) {
                tokens.push({ type: "text", value: str });
                plainText += str;
            }
            return;
        }

        const tagRegex = /\{(wait|pause|speed)\s*:\s*(\d+(?:\.\d+)?)\}/gi;
        let lastIndex = 0;
        let match;
        while ((match = tagRegex.exec(str)) !== null) {
            if (match.index > lastIndex) {
                const textPart = str.slice(lastIndex, match.index);
                tokens.push({ type: "text", value: textPart });
                plainText += textPart;
            }
            const kind = match[1].toLowerCase();
            const num = toFiniteNumber(match[2], 0);
            if (kind === "speed") {
                tokens.push({ type: "speed", ms: Math.max(0, num) });
            } else {
                tokens.push({ type: "wait", ms: Math.max(0, num) });
            }
            lastIndex = tagRegex.lastIndex;
        }
        if (lastIndex < str.length) {
            const tail = str.slice(lastIndex);
            tokens.push({ type: "text", value: tail });
            plainText += tail;
        }
    };

    for (const chunk of rawChunks) {
        if (typeof chunk === "string") {
            pushString(chunk);
        } else if (chunk && typeof chunk === "object") {
            if (chunk.wait !== undefined || chunk.pause !== undefined) {
                tokens.push({ type: "wait", ms: Math.max(0, toFiniteNumber(chunk.wait ?? chunk.pause, 0)) });
            } else if (chunk.speed !== undefined) {
                tokens.push({ type: "speed", ms: Math.max(0, toFiniteNumber(chunk.speed, 0)) });
            } else if (chunk.text !== undefined) {
                pushString(String(chunk.text));
            }
        } else if (chunk != null) {
            pushString(String(chunk));
        }
    }

    return { tokens, plainText };
}

function isEditableElementFocused() {
    if (typeof document === "undefined") return false;
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(active.isContentEditable);
}

function runTween({ durationMs, onUpdate, easing = "linear", onRegisterCancel }) {
    const easeFn = resolveEasing(easing);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        onUpdate(1);
        return Promise.resolve();
    }

    const useRaf = typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function";
    const now = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

    return new Promise((resolve) => {
        const startTime = now();
        let frameId = null;
        let cancelled = false;

        const cancel = () => {
            if (cancelled) return;
            cancelled = true;
            if (frameId !== null) {
                if (useRaf) {
                    cancelAnimationFrame(frameId);
                } else {
                    clearTimeout(frameId);
                }
                frameId = null;
            }
            resolve();
        };

        if (typeof onRegisterCancel === "function") {
            onRegisterCancel(cancel);
        }

        const step = () => {
            if (cancelled) return;
            const elapsed = now() - startTime;
            const rawProgress = clamp(elapsed / durationMs, 0, 1);
            onUpdate(easeFn(rawProgress));

            if (rawProgress < 1) {
                frameId = useRaf ? requestAnimationFrame(step) : setTimeout(step, 16);
            } else {
                frameId = null;
                resolve();
            }
        };

        frameId = useRaf ? requestAnimationFrame(step) : setTimeout(step, 16);
    });
}

class DialogSystem {
    /**
     * @param {Object} [options]
     * @param {string|HTMLElement} [options.container] - Target parent element or CSS selector.
     * @param {string} [options.resourcePath="resources/"] - Base path prepended to relative asset names.
     * @param {string|null} [options.stylesheetPath="style/appearance.css"] - Library stylesheet path, or null to skip.
     * @param {number} [options.typingSpeed=15] - Delay in ms between typed characters.
     * @param {string} [options.defaultSpeaker="someone"] - Initial speaker name.
     * @param {boolean} [options.autoPlay=false] - Automatically advance after typing finishes.
     * @param {number} [options.autoDelay=1500] - Delay in ms before auto-advancing.
     * @param {boolean} [options.skipMode=false] - Fast-forward dialogue lines.
     * @param {number} [options.skipDelay=60] - Delay in ms between lines in skip mode.
     * @param {boolean} [options.holdCtrlToSkip=true] - Hold Control key to temporarily fast-forward.
     * @param {boolean} [options.stopSkipOnChoice=true] - Disable skip mode when choices appear.
     * @param {boolean} [options.inlineTags=false] - Parse `{wait:ms}` / `{speed:ms}` tags in strings.
     * @param {boolean|Object} [options.controls=false] - Render optional Log / Auto / Skip HUD buttons.
     * @param {"center"|"left"|"right"} [options.buttonAlign="center"] - Default alignment for choice buttons.
     */
    constructor(options = {}) {
        this.options = {
            resourcePath: "resources/",
            stylesheetPath: "style/appearance.css",
            typingSpeed: 15,
            defaultSpeaker: "someone",
            autoPlay: false,
            autoDelay: 1500,
            skipMode: false,
            skipDelay: 60,
            holdCtrlToSkip: true,
            stopSkipOnChoice: true,
            inlineTags: false,
            controls: false,
            buttonAlign: "center",
            ...options
        };

        this.speaker = this.options.defaultSpeaker;
        this.isDisplaying = false;
        this.isHistoryOpen = false;
        this.typingSpeed = Math.max(0, toFiniteNumber(this.options.typingSpeed, 15));
        this.autoPlay = Boolean(this.options.autoPlay);
        this.autoDelay = Math.max(0, toFiniteNumber(this.options.autoDelay, 1500));
        this.skipMode = Boolean(this.options.skipMode);
        this.skipDelay = Math.max(0, toFiniteNumber(this.options.skipDelay, 60));

        this._destroyed = false;
        this._backgroundSrc = null;
        this._historyRecords = [];
        this._listeners = new Map();
        this._activeStoryCancel = null;
        this._rescheduleAuto = null;
        this._typingAbort = null;
        this._waitAbort = null;
        this._holdingSkipKey = false;
        this._ctrlHoldTimer = null;
        this._controlButtons = {};

        this.lineNum = 0;
        this.text = [];
        this.isLocked = false;

        ensureStylesheet(this.options.stylesheetPath);

        const parent = this._resolveContainer(this.options.container);
        this.dialog = document.createElement("div");
        this.dialog.id = "dialog";
        this.dialog.style.display = "none";
        parent.appendChild(this.dialog);

        this.background = document.createElement("img");
        this.background.id = "bg";
        this.background.alt = "";
        this.dialog.appendChild(this.background);

        this.imgContainer = new ImageContainer({ resourcePath: this.options.resourcePath });
        this.audContainer = new AudioContainer({ resourcePath: this.options.resourcePath });
        this.btnContainer = new ButtonContainer({
            align: this.options.buttonAlign,
            isBlocked: () => this._isModalOverlayOpen(),
            onBeforeShow: () => {
                if (this.options.stopSkipOnChoice && this.skipMode) {
                    this.setSkipMode(false);
                }
            },
            onAfterHide: () => {
                this._triggerAutoReschedule();
            }
        });

        this.dialog.appendChild(this.imgContainer.getContainer());
        this.dialog.appendChild(this.audContainer.getContainer());

        this.dialogBoxInstance = new dialogBox(this.dialog, {
            resourcePath: this.options.resourcePath,
            defaultSpeaker: this.speaker,
            onSpeakerChange: (name) => {
                this.speaker = name;
                this._emit("speakerChange", name);
            },
            onPromptClose: () => {
                this._triggerAutoReschedule();
            }
        });

        if (this.options.controls) {
            this.controlsBar = this._createControlsBar(this.options.controls);
            this.dialog.appendChild(this.controlsBar);
        } else {
            this.controlsBar = null;
        }

        this.dialog.appendChild(this.btnContainer.getContainer());

        this.dialogHistory = this._createHistoryPanel();
        this.dialog.appendChild(this.dialogHistory);

        this._onGlobalKeyDown = (event) => {
            if (this._destroyed || !this.isDisplaying) return;

            // Cancel pending Ctrl hold-skip immediately if combined with another key (e.g. Ctrl+L)
            if (event.key !== "Control" && this._ctrlHoldTimer !== null) {
                clearTimeout(this._ctrlHoldTimer);
                this._ctrlHoldTimer = null;
            }

            if (this.options.holdCtrlToSkip && event.key === "Control" && !event.repeat) {
                if (!this._isModalOverlayOpen() && !this.btnContainer.isShowing && !isEditableElementFocused()) {
                    if (this._ctrlHoldTimer === null && !this._holdingSkipKey) {
                        this._ctrlHoldTimer = setTimeout(() => {
                            this._ctrlHoldTimer = null;
                            if (!this._destroyed && this.isDisplaying && !this._isModalOverlayOpen() && !this.btnContainer.isShowing) {
                                this._holdingSkipKey = true;
                                this._onSkipActivation();
                            }
                        }, 120);
                    }
                }
                return;
            }

            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (this.dialogBoxInstance.isPromptOpen || isEditableElementFocused()) return;

            if (event.key === "l" || event.key === "L") {
                event.preventDefault();
                this.toggleHistory();
            } else if (event.key === "Escape" && this.isHistoryOpen) {
                event.preventDefault();
                this.toggleHistory(false);
            }
        };

        this._onGlobalKeyUp = (event) => {
            if (event.key === "Control") {
                this._releaseHoldSkip();
            }
        };

        this._onWindowBlur = () => {
            this._releaseHoldSkip();
        };

        document.addEventListener("keydown", this._onGlobalKeyDown);
        document.addEventListener("keyup", this._onGlobalKeyUp);
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("blur", this._onWindowBlur);
        }
    }

    _releaseHoldSkip() {
        if (this._ctrlHoldTimer !== null) {
            clearTimeout(this._ctrlHoldTimer);
            this._ctrlHoldTimer = null;
        }
        if (this._holdingSkipKey) {
            this._holdingSkipKey = false;
            this._triggerAutoReschedule();
        }
    }

    _resolveContainer(container) {
        if (typeof HTMLElement !== "undefined" && container instanceof HTMLElement) {
            return container;
        }
        if (container && typeof container === "object" && typeof container.appendChild === "function") {
            return container;
        }
        if (typeof container === "string") {
            const matched = document.querySelector(container);
            if (matched) return matched;
        }
        return document.querySelector("main") || document.body;
    }

    _createControlsBar(config) {
        const opts = config === true ? { log: true, auto: true, skip: true } : { log: true, auto: true, skip: true, ...config };
        const bar = document.createElement("div");
        bar.id = "dialogControls";

        if (opts.auto) {
            const autoBtn = document.createElement("button");
            autoBtn.type = "button";
            autoBtn.dataset.control = "auto";
            autoBtn.textContent = "Auto";
            autoBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleAutoPlay();
            });
            bar.appendChild(autoBtn);
            this._controlButtons.auto = autoBtn;
        }

        if (opts.skip) {
            const skipBtn = document.createElement("button");
            skipBtn.type = "button";
            skipBtn.dataset.control = "skip";
            skipBtn.textContent = "Skip";
            skipBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleSkipMode();
            });
            bar.appendChild(skipBtn);
            this._controlButtons.skip = skipBtn;
        }

        if (opts.log) {
            const logBtn = document.createElement("button");
            logBtn.type = "button";
            logBtn.dataset.control = "log";
            logBtn.textContent = "Log (L)";
            logBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleHistory();
            });
            bar.appendChild(logBtn);
            this._controlButtons.log = logBtn;
        }

        this._syncControlButtons();
        return bar;
    }

    _syncControlButtons() {
        if (this._controlButtons.auto) {
            this._controlButtons.auto.classList.toggle("active", this.autoPlay);
        }
        if (this._controlButtons.skip) {
            this._controlButtons.skip.classList.toggle("active", this.skipMode);
        }
        if (this._controlButtons.log) {
            this._controlButtons.log.classList.toggle("active", this.isHistoryOpen);
        }
    }

    _createHistoryPanel() {
        const panel = document.createElement("article");
        panel.id = "dialogHistory";
        panel.style.display = "none";

        const header = document.createElement("header");
        header.className = "history-header";

        const title = document.createElement("span");
        title.textContent = "Dialog History";

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "history-close";
        closeBtn.textContent = "Close (L / Esc)";
        closeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            this.toggleHistory(false);
        });

        header.append(title, closeBtn);
        panel.appendChild(header);
        return panel;
    }

    on(eventName, handler) {
        if (typeof handler !== "function") return () => {};
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, new Set());
        }
        this._listeners.get(eventName).add(handler);
        return () => this.off(eventName, handler);
    }

    off(eventName, handler) {
        const set = this._listeners.get(eventName);
        if (set) set.delete(handler);
    }

    _emit(eventName, payload) {
        const set = this._listeners.get(eventName);
        if (!set) return;
        for (const fn of [...set]) {
            fn(payload);
        }
    }

    _isModalOverlayOpen() {
        return this.isHistoryOpen || this.dialogBoxInstance.isPromptOpen;
    }

    _isSkipActive() {
        return this.skipMode || this._holdingSkipKey;
    }

    _onSkipActivation() {
        if (this._waitAbort) {
            this._waitAbort.skip();
        }
        if (this.isLocked && this._typingAbort) {
            this._typingAbort.skip();
        }
        this._triggerAutoReschedule();
    }

    _triggerAutoReschedule() {
        if (typeof this._rescheduleAuto === "function") {
            this._rescheduleAuto();
        }
    }

    setAutoPlay(enabled, delayMs) {
        this.autoPlay = Boolean(enabled);
        if (delayMs !== undefined) {
            this.autoDelay = Math.max(0, toFiniteNumber(delayMs, 1500));
        }
        this._syncControlButtons();
        this._emit("autoChange", this.autoPlay);
        this._triggerAutoReschedule();
    }

    toggleAutoPlay() {
        this.setAutoPlay(!this.autoPlay);
        return this.autoPlay;
    }

    setSkipMode(enabled) {
        this.skipMode = Boolean(enabled);
        this._syncControlButtons();
        this._emit("skipChange", this.skipMode);
        if (this.skipMode) {
            this._onSkipActivation();
        } else {
            this._triggerAutoReschedule();
        }
    }

    toggleSkipMode() {
        this.setSkipMode(!this.skipMode);
        return this.skipMode;
    }

    /**
     * Toggle or explicitly set dialog history visibility.
     * @param {boolean} [force]
     */
    toggleHistory(force) {
        const nextState = typeof force === "boolean" ? force : !this.isHistoryOpen;
        this.isHistoryOpen = nextState;
        this.dialogHistory.style.display = nextState ? "block" : "none";
        if (nextState) {
            this.dialogHistory.scrollTop = this.dialogHistory.scrollHeight;
        }
        this._syncControlButtons();
        this._emit("historyChange", nextState);
        if (!nextState) {
            this._triggerAutoReschedule();
        }
    }

    clearHistory() {
        this._historyRecords = [];
        const entries = this.dialogHistory.querySelectorAll("section");
        for (const entry of entries) {
            entry.remove();
        }
    }

    /**
     * Set speaker name on both DialogSystem and dialogBox.
     * @param {string} name
     * @returns {string}
     */
    setSpeaker(name) {
        return this.dialogBoxInstance.setSpeaker(name);
    }

    /**
     * Set or hide the dedicated #bg backdrop element.
     * @param {string|null} src
     */
    setBackground(src) {
        if (!src) {
            this._backgroundSrc = null;
            this.background.removeAttribute("src");
            this.background.style.visibility = "hidden";
            return;
        }
        this._backgroundSrc = String(src);
        this.background.src = resolveResourcePath(this._backgroundSrc, this.options.resourcePath);
        this.background.style.visibility = "visible";
    }

    setTypingSpeed(ms) {
        this.typingSpeed = Math.max(0, toFiniteNumber(ms, 15));
    }

    _applyImageDirectives(imagesConfig) {
        const promises = [];
        const entries = Array.isArray(imagesConfig)
            ? imagesConfig.map((cfg) => [cfg.name, cfg])
            : Object.entries(imagesConfig || {});

        for (const [name, cfg] of entries) {
            if (!name || !cfg) continue;
            if (cfg === "remove" || cfg.remove) {
                this.imgContainer.removeImg(name);
                continue;
            }
            if (cfg.src !== undefined) {
                this.imgContainer.addImg(name, cfg.src, {
                    dimmable: cfg.dimmable,
                    visible: cfg.visible
                });
            }
            if (cfg.visible === true) this.imgContainer.showImg(name);
            if (cfg.visible === false) this.imgContainer.hideImg(name);

            const appearanceKeys = {};
            for (const key of ["left", "top", "zIndex", "width", "height", "opacity"]) {
                if (cfg[key] !== undefined) appearanceKeys[key] = cfg[key];
            }
            if (Object.keys(appearanceKeys).length > 0) {
                this.imgContainer.setAppearance(name, appearanceKeys);
            }

            if (cfg.filter !== undefined) {
                this.imgContainer.setFilter(name, cfg.filter);
            }
            if (cfg.dim !== undefined) {
                promises.push(this.imgContainer.dim(name, Boolean(cfg.dim), {
                    time: cfg.time ?? 0.25,
                    easing: cfg.easing || "easeOut"
                }));
            }
            if (cfg.move) {
                const [dx = 0, dy = 0] = Array.isArray(cfg.move) ? cfg.move : [cfg.move.x, cfg.move.y];
                promises.push(this.imgContainer.move(name, dx, dy, cfg.time ?? 0, cfg.easing));
            }
            if (cfg.scale) {
                const [sx = 1, sy = sx] = Array.isArray(cfg.scale) ? cfg.scale : [cfg.scale.x ?? cfg.scale.w, cfg.scale.y ?? cfg.scale.h];
                promises.push(this.imgContainer.scale(name, sx, sy, cfg.time ?? 0, cfg.easing));
            }
            if (cfg.skew) {
                const [kx = 0, ky = 0] = Array.isArray(cfg.skew) ? cfg.skew : [cfg.skew.x, cfg.skew.y];
                promises.push(this.imgContainer.skew(name, kx, ky, cfg.time ?? 0, cfg.easing));
            }
            if (cfg.rotate !== undefined) {
                promises.push(this.imgContainer.rotate(name, cfg.rotate, cfg.time ?? 0, cfg.easing));
            }
            if (cfg.fadeTo !== undefined) {
                promises.push(this.imgContainer.fadeTo(name, cfg.fadeTo, cfg.time ?? 0.5, cfg.easing));
            }
        }
        return promises;
    }

    _applyAudioDirectives(audioConfig) {
        const promises = [];
        const entries = Array.isArray(audioConfig)
            ? audioConfig.map((cfg) => [cfg.name, cfg])
            : Object.entries(audioConfig || {});

        for (const [name, cfg] of entries) {
            if (!name || !cfg) continue;
            if (cfg.src !== undefined) {
                this.audContainer.addAudio(name, cfg.src, {
                    loop: cfg.loop,
                    volume: cfg.volume
                });
            }
            const action = cfg.action || (cfg.src !== undefined ? "play" : undefined);
            if (action === "play") {
                promises.push(this.audContainer.audPlay(name, cfg.time ?? 0, cfg.fade ?? 0, { loop: cfg.loop }));
            } else if (action === "stop" || action === "pause") {
                promises.push(this.audContainer.audStop(name, cfg.fade ?? 0));
            } else if (action === "remove") {
                this.audContainer.removeAudio(name);
            } else if (cfg.volume !== undefined && cfg.src === undefined) {
                this.audContainer.setVolume(name, cfg.volume);
            }
        }
        return promises;
    }

    _sleepSkippable(ms) {
        if (!Number.isFinite(ms) || ms <= 0 || this._isSkipActive()) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let settled = false;
            let timerId = null;

            const finish = () => {
                if (settled) return;
                settled = true;
                if (timerId !== null) {
                    clearTimeout(timerId);
                    timerId = null;
                }
                if (this._waitAbort === handle) {
                    this._waitAbort = null;
                }
                resolve();
            };

            const handle = {
                skip: finish,
                cancel: finish
            };
            this._waitAbort = handle;
            timerId = setTimeout(finish, ms);
        });
    }

    /**
     * Display story lines or structured stage beats (or a specific `"break"`-delimited part).
     * Clicking the dialog box or pressing Space/Enter skips typing, or advances once finished.
     * @param {string|Array<string|Object>} texts
     * @param {number} [num=0]
     * @returns {Promise<void>}
     */
    showStory(texts, num = 0) {
        if (this._destroyed) return Promise.resolve();

        if (this._activeStoryCancel) {
            this._activeStoryCancel();
            this._activeStoryCancel = null;
        }

        const segment = extractStorySegment(texts, num);
        this.text = segment;
        this.lineNum = 0;

        if (segment.length === 0) {
            this.isLocked = false;
            this.dialogBoxInstance.setText("");
            this.dialogBoxInstance.setWaiting(false);
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            let settled = false;
            let autoTimer = null;
            let stepRunId = 0;
            const box = this.dialogBoxInstance.getBox();

            const clearAutoTimer = () => {
                if (autoTimer !== null) {
                    clearTimeout(autoTimer);
                    autoTimer = null;
                }
            };

            const cleanup = () => {
                clearAutoTimer();
                this._rescheduleAuto = null;
                if (this._waitAbort) {
                    this._waitAbort.cancel();
                    this._waitAbort = null;
                }
                if (this._typingAbort) {
                    this._typingAbort.cancel();
                    this._typingAbort = null;
                }
                box.removeEventListener("click", onBoxClick);
                document.removeEventListener("keydown", onDocumentKeyDown);
                this.dialogBoxInstance.setWaiting(false);
                if (this._activeStoryCancel === cancelStory) {
                    this._activeStoryCancel = null;
                }
            };

            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };

            const cancelStory = () => {
                finish();
            };
            this._activeStoryCancel = cancelStory;

            const scheduleAutoAdvance = () => {
                clearAutoTimer();
                if (settled || !this.isDisplaying || this.isLocked || this._isModalOverlayOpen() || this.btnContainer.isShowing) {
                    return;
                }
                const skipping = this._isSkipActive();
                if (!skipping && !this.autoPlay) return;

                const delay = skipping ? this.skipDelay : this.autoDelay;
                autoTimer = setTimeout(() => {
                    autoTimer = null;
                    advanceOrSkip();
                }, delay);
            };
            this._rescheduleAuto = scheduleAutoAdvance;

            const runCurrentExit = async (idx) => {
                const item = this.text[idx];
                if (item && typeof item === "object" && typeof item.onExit === "function") {
                    await item.onExit(this);
                }
            };

            const proceedToNext = async () => {
                const currentIdx = this.lineNum - 1;
                if (currentIdx >= 0 && currentIdx < this.text.length) {
                    const prev = this.text[currentIdx];
                    if (prev && typeof prev === "object" && typeof prev.onExit === "function") {
                        await runCurrentExit(currentIdx);
                        if (settled) return;
                    }
                }
                if (this.lineNum < this.text.length) {
                    runStep(this.lineNum);
                } else {
                    finish();
                }
            };

            const advanceOrSkip = () => {
                if (settled || !this.isDisplaying || this._isModalOverlayOpen()) return;
                clearAutoTimer();

                if (this._waitAbort) {
                    this._waitAbort.skip();
                    return;
                }

                if (this.isLocked && this._typingAbort) {
                    this._typingAbort.skip();
                    scheduleAutoAdvance();
                    return;
                }

                if (!this.isLocked) {
                    proceedToNext();
                }
            };

            const runStep = (index) => {
                if (settled || index < 0 || index >= this.text.length) {
                    finish();
                    return;
                }

                const myRunId = ++stepRunId;
                const rawItem = this.text[index];
                const step = typeof rawItem === "string" ? { text: rawItem } : (rawItem || {});

                const applySyncDirectives = () => {
                    const promises = [];
                    if ("speaker" in step) {
                        this.setSpeaker(step.speaker);
                    }
                    if ("background" in step || "bg" in step) {
                        this.setBackground("background" in step ? step.background : step.bg);
                    }
                    if (step.images) {
                        promises.push(...this._applyImageDirectives(step.images));
                    }
                    if (step.audio) {
                        promises.push(...this._applyAudioDirectives(step.audio));
                    }
                    if ("focus" in step) {
                        promises.push(this.imgContainer.focus(
                            step.focus,
                            typeof step.focusOptions === "object" ? step.focusOptions : undefined
                        ));
                    }
                    return promises;
                };

                const hasText = step.text !== undefined && step.text !== null;
                const needsPreAsync = Boolean(
                    (step.awaitAnimations) ||
                    typeof step.onEnter === "function" ||
                    !hasText ||
                    (hasText && toFiniteNumber(step.delay, 0) > 0 && !this._isSkipActive())
                );

                const startStepBody = () => {
                    if (settled || myRunId !== stepRunId) return;
                    if (!hasText) {
                        this.lineNum = index + 1;
                        proceedToNext();
                        return;
                    }
                    this._typeStepLine(index, step, () => {
                        if (!settled && myRunId === stepRunId) {
                            scheduleAutoAdvance();
                        }
                    });
                };

                if (!needsPreAsync) {
                    applySyncDirectives();
                    startStepBody();
                    return;
                }

                (async () => {
                    this.isLocked = true;
                    const promises = applySyncDirectives();
                    if (step.awaitAnimations && promises.length > 0) {
                        await Promise.all(promises);
                    }
                    if (settled || myRunId !== stepRunId) return;

                    if (typeof step.onEnter === "function") {
                        await step.onEnter(this);
                    }
                    if (settled || myRunId !== stepRunId) return;

                    const waitMs = hasText
                        ? toFiniteNumber(step.delay, 0)
                        : toFiniteNumber(step.wait ?? step.delay, 0);

                    if (waitMs > 0 && !this._isSkipActive()) {
                        await this._sleepSkippable(waitMs);
                    }
                    if (settled || myRunId !== stepRunId) return;

                    this.isLocked = false;
                    startStepBody();
                })();
            };

            const onBoxClick = (event) => {
                event.stopPropagation();
                advanceOrSkip();
            };

            const onDocumentKeyDown = (event) => {
                if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
                if (this._isModalOverlayOpen() || isEditableElementFocused()) return;
                if (this.btnContainer.isShowing) return;

                if (event.key === " " || event.key === "Enter") {
                    if (!this.isDisplaying) return;
                    event.preventDefault();
                    advanceOrSkip();
                }
            };

            box.addEventListener("click", onBoxClick);
            document.addEventListener("keydown", onDocumentKeyDown);

            runStep(0);
        });
    }

    /**
     * Legacy-compatible single-line typer (`this.text[num]`).
     * @param {number} num
     * @returns {Promise<void>}
     */
    async readWords(num) {
        if (num < 0 || num >= this.text.length) {
            this.isLocked = false;
            return;
        }
        const raw = this.text[num];
        const step = typeof raw === "string" ? { text: raw } : (raw || { text: "" });
        return this._typeStepLine(num, step);
    }

    async _typeStepLine(num, step, onComplete) {
        if (this._typingAbort) {
            this._typingAbort.cancel();
        }

        const useInlineTags = step.inlineTags !== undefined ? Boolean(step.inlineTags) : Boolean(this.options.inlineTags);
        const { tokens, plainText } = parseTextTokens(step.text, useInlineTags);
        const prefix = step.append ? this.dialogBoxInstance.box.textContent : "";
        const fullText = prefix + plainText;
        let currentSpeed = step.speed !== undefined
            ? Math.max(0, toFiniteNumber(step.speed, this.typingSpeed))
            : this.typingSpeed;

        this.isLocked = true;
        this.dialogBoxInstance.setWaiting(false);
        this.dialogBoxInstance.setText(prefix);
        this._emit("lineStart", { index: num, speaker: this.speaker, text: plainText, step });

        let cancelled = false;
        let skipped = false;
        let finalized = false;
        let timerId = null;
        let wakeSleep = null;

        const finalizeLine = () => {
            if (finalized) return;
            finalized = true;
            if (this._typingAbort === abortHandle) {
                this._typingAbort = null;
            }
            this.dialogBoxInstance.setText(fullText);
            this.lineNum = num + 1;
            if (step.history !== false) {
                this._appendHistoryEntry(this.speaker, plainText);
            }
            this.isLocked = false;
            this.dialogBoxInstance.setWaiting(true);
            this._emit("lineComplete", { index: num, speaker: this.speaker, text: plainText, step });
            if (typeof onComplete === "function") {
                onComplete();
            }
        };

        const abortHandle = {
            skip: () => {
                if (cancelled || skipped) return;
                skipped = true;
                if (timerId !== null) {
                    clearTimeout(timerId);
                    timerId = null;
                }
                finalizeLine();
                if (wakeSleep) {
                    const wake = wakeSleep;
                    wakeSleep = null;
                    wake();
                }
            },
            cancel: () => {
                if (cancelled) return;
                cancelled = true;
                if (timerId !== null) {
                    clearTimeout(timerId);
                    timerId = null;
                }
                if (this._typingAbort === abortHandle) {
                    this._typingAbort = null;
                }
                this.isLocked = false;
                if (wakeSleep) {
                    const wake = wakeSleep;
                    wakeSleep = null;
                    wake();
                }
            }
        };
        this._typingAbort = abortHandle;

        const sleepMs = (ms) => new Promise((resolve) => {
            wakeSleep = resolve;
            timerId = setTimeout(() => {
                timerId = null;
                wakeSleep = null;
                resolve();
            }, ms);
        });

        if (!this._isSkipActive()) {
            let displayed = prefix;
            for (const token of tokens) {
                if (cancelled || skipped || this._isSkipActive()) break;

                if (token.type === "speed") {
                    currentSpeed = token.ms;
                    continue;
                }
                if (token.type === "wait") {
                    if (token.ms > 0) {
                        await sleepMs(token.ms);
                    }
                    continue;
                }
                if (token.type === "text") {
                    if (currentSpeed <= 0) {
                        displayed += token.value;
                        this.dialogBoxInstance.setText(displayed);
                        continue;
                    }
                    for (const ch of Array.from(token.value)) {
                        if (cancelled || skipped || this._isSkipActive()) break;
                        displayed += ch;
                        this.dialogBoxInstance.setText(displayed);
                        await sleepMs(currentSpeed);
                    }
                }
            }
        }

        if (cancelled || skipped) {
            return;
        }

        finalizeLine();
    }

    _appendHistoryEntry(speaker, text) {
        const record = { speaker: speaker || "", text };
        this._historyRecords.push(record);
        this._renderHistoryEntry(record);
    }

    _renderHistoryEntry({ speaker, text }) {
        const entry = document.createElement("section");
        if (speaker) {
            const speakerEl = document.createElement("strong");
            speakerEl.className = "history-speaker";
            speakerEl.textContent = `${speaker}: `;
            entry.appendChild(speakerEl);
        }
        const textEl = document.createElement("span");
        textEl.className = "history-text";
        textEl.textContent = text;
        entry.appendChild(textEl);

        this.dialogHistory.appendChild(entry);
        if (this.isHistoryOpen) {
            this.dialogHistory.scrollTop = this.dialogHistory.scrollHeight;
        }
    }

    /**
     * Export a plain JSON-serializable snapshot of the stage for external save systems.
     * @returns {Object}
     */
    exportState() {
        return {
            version: 1,
            isDisplaying: this.isDisplaying,
            speaker: this.speaker,
            typingSpeed: this.typingSpeed,
            autoPlay: this.autoPlay,
            autoDelay: this.autoDelay,
            skipMode: this.skipMode,
            background: this._backgroundSrc,
            dialogBox: {
                text: this.dialogBoxInstance.box.textContent,
                color: this.dialogBoxInstance._boxColor,
                img: this.dialogBoxInstance._imgSrc
            },
            images: this.imgContainer.exportState(),
            audio: this.audContainer.exportState(),
            history: this._historyRecords.map((item) => ({ ...item }))
        };
    }

    /**
     * Restore stage state from a snapshot created by `exportState()`.
     * @param {Object} snapshot
     * @param {Object} [options]
     */
    importState(snapshot, options = {}) {
        if (!snapshot || typeof snapshot !== "object") return;

        if (this._activeStoryCancel) {
            this._activeStoryCancel();
            this._activeStoryCancel = null;
        }
        this.btnContainer.clearButton();
        this.dialogBoxInstance.cancelPrompt();

        if (snapshot.typingSpeed !== undefined) {
            this.setTypingSpeed(snapshot.typingSpeed);
        }
        if (snapshot.autoDelay !== undefined) {
            this.autoDelay = Math.max(0, toFiniteNumber(snapshot.autoDelay, 1500));
        }
        if (snapshot.autoPlay !== undefined) {
            this.setAutoPlay(snapshot.autoPlay);
        }
        if (snapshot.skipMode !== undefined) {
            this.setSkipMode(snapshot.skipMode);
        }

        if ("background" in snapshot) {
            this.setBackground(snapshot.background);
        }
        if ("speaker" in snapshot) {
            this.setSpeaker(snapshot.speaker);
        }

        if (snapshot.dialogBox) {
            if (snapshot.dialogBox.color) {
                this.dialogBoxInstance.setColor(snapshot.dialogBox.color);
            }
            if (snapshot.dialogBox.img) {
                this.dialogBoxInstance.setImg(snapshot.dialogBox.img);
            }
            if (snapshot.dialogBox.text !== undefined) {
                this.dialogBoxInstance.setText(snapshot.dialogBox.text);
            }
        }

        if (Array.isArray(snapshot.images)) {
            this.imgContainer.importState(snapshot.images);
        }
        if (Array.isArray(snapshot.audio)) {
            this.audContainer.importState(snapshot.audio, options);
        }

        if (Array.isArray(snapshot.history)) {
            this.clearHistory();
            for (const entry of snapshot.history) {
                this._appendHistoryEntry(entry.speaker || "", entry.text || "");
            }
        }

        if (snapshot.isDisplaying !== undefined) {
            if (snapshot.isDisplaying) {
                this.show();
            } else {
                this.hide();
            }
        }
    }

    show() {
        if (this._destroyed) return;
        this.dialog.style.display = "block";
        this.isDisplaying = true;
        this._emit("show");
        this._triggerAutoReschedule();
    }

    hide() {
        this._releaseHoldSkip();
        this.audContainer.pauseAll();
        this.toggleHistory(false);
        this.dialog.style.display = "none";
        this.isDisplaying = false;
        this._emit("hide");
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._releaseHoldSkip();

        if (this._activeStoryCancel) {
            this._activeStoryCancel();
            this._activeStoryCancel = null;
        }
        document.removeEventListener("keydown", this._onGlobalKeyDown);
        document.removeEventListener("keyup", this._onGlobalKeyUp);
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
            window.removeEventListener("blur", this._onWindowBlur);
        }
        this.audContainer.stopAll();
        this.imgContainer.cancelAllAnimations();
        this.btnContainer.clearButton();
        this.dialogBoxInstance.cancelPrompt();
        this._listeners.clear();

        if (this.dialog.parentNode) {
            this.dialog.parentNode.removeChild(this.dialog);
        }
        this.isDisplaying = false;
    }
}

class dialogBox {
    /**
     * @param {HTMLElement} [dialogElement]
     * @param {Object} [options]
     */
    constructor(dialogElement, options = {}) {
        const dialog = dialogElement || document.getElementById("dialog");
        if (!dialog) {
            throw new Error("DialogBox requires a #dialog parent element.");
        }

        this.options = {
            resourcePath: "resources/",
            defaultSpeaker: "someone",
            onSpeakerChange: null,
            onPromptClose: null,
            ...options
        };

        this.isPromptOpen = false;
        this._activePromptCancel = null;
        this._boxColor = "#00000060";
        this._imgSrc = null;

        const fragment = document.createDocumentFragment();

        this.box = document.createElement("p");
        this.box.className = "dialogBox";

        this.img = document.createElement("img");
        this.img.id = "dialogBoxImg";
        this.img.alt = "";
        this.img.style.visibility = "hidden";

        this.nametag = document.createElement("div");
        this.nametag.id = "nametag";

        this.inputBackground = document.createElement("section");
        this.inputBackground.id = "inputBackground";
        this.inputBackground.style.display = "none";

        this.inputTxt = document.createElement("p");
        this.inputTxt.id = "inputTxt";

        const inputControls = document.createElement("div");
        inputControls.className = "input-controls";

        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.id = "dialogInput";

        this.submitBtn = document.createElement("button");
        this.submitBtn.type = "button";
        this.submitBtn.id = "dialogInputSubmit";
        this.submitBtn.textContent = "OK";

        inputControls.append(this.input, this.submitBtn);
        this.inputBackground.append(this.inputTxt, inputControls);
        fragment.append(this.img, this.box, this.inputBackground, this.nametag);
        dialog.appendChild(fragment);

        this.setSpeaker(this.options.defaultSpeaker);
        this.setColor(this._boxColor);
    }

    getBox() {
        return this.box;
    }

    getImg() {
        return this.img;
    }

    setWaiting(waiting) {
        this.box.classList.toggle("waiting", Boolean(waiting));
    }

    /**
     * Prompt the user for text input inside the dialog overlay.
     * @param {string} txt
     * @param {string} [defaultValue=""]
     * @returns {Promise<string>}
     */
    getMessage(txt, defaultValue = "") {
        this.cancelPrompt();

        return new Promise((resolve) => {
            let settled = false;
            this.isPromptOpen = true;
            this.inputBackground.style.display = "flex";
            this.inputTxt.textContent = txt == null ? "" : String(txt);
            this.input.value = defaultValue == null ? "" : String(defaultValue);

            const cleanup = () => {
                this.input.removeEventListener("keydown", onKeyDown);
                this.submitBtn.removeEventListener("click", onSubmitClick);
                this.inputBackground.style.display = "none";
                this.isPromptOpen = false;
                if (this._activePromptCancel === cancel) {
                    this._activePromptCancel = null;
                }
                if (typeof this.options.onPromptClose === "function") {
                    this.options.onPromptClose();
                }
            };

            const submit = () => {
                if (settled) return;
                settled = true;
                const value = this.input.value;
                cleanup();
                resolve(value);
            };

            const cancel = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve("");
            };

            const onKeyDown = (event) => {
                event.stopPropagation();
                if (event.isComposing || event.keyCode === 229) return;
                if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                }
            };

            const onSubmitClick = (event) => {
                event.stopPropagation();
                submit();
            };

            this._activePromptCancel = cancel;
            this.input.addEventListener("keydown", onKeyDown);
            this.submitBtn.addEventListener("click", onSubmitClick);

            if (typeof this.input.focus === "function") {
                this.input.focus();
            }
        });
    }

    cancelPrompt() {
        if (this._activePromptCancel) {
            this._activePromptCancel();
            this._activePromptCancel = null;
        }
    }

    setColor(color) {
        this._boxColor = color;
        this._imgSrc = null;
        this.img.style.visibility = "hidden";
        this.box.style.backgroundColor = color;
        this.nametag.style.backgroundColor = color;
    }

    setText(text) {
        this.box.textContent = text == null ? "" : String(text);
    }

    setImg(source) {
        if (!source) {
            this._imgSrc = null;
            this.img.removeAttribute("src");
            this.img.style.visibility = "hidden";
            this.box.style.backgroundColor = this._boxColor || "#00000060";
            return;
        }
        this._imgSrc = String(source);
        this.img.src = resolveResourcePath(this._imgSrc, this.options.resourcePath);
        this.img.style.visibility = "visible";
        this.box.style.backgroundColor = "transparent";
    }

    setSpeaker(name) {
        const speakerName = name == null ? "" : String(name);
        this.nametag.textContent = speakerName;
        this.nametag.style.display = speakerName ? "" : "none";
        if (typeof this.options.onSpeakerChange === "function") {
            this.options.onSpeakerChange(speakerName);
        }
        return speakerName;
    }
}

class ImageContainer {
    constructor(options = {}) {
        this.options = {
            resourcePath: "resources/",
            ...options
        };
        this.imageElements = {};
        this._imageStates = new Map();

        this.imgfile = document.createElement("div");
        this.imgfile.id = "imgfile";
    }

    getContainer() {
        return this.imgfile;
    }

    _getState(name) {
        return this._imageStates.get(name) || null;
    }

    _applyTransform(state) {
        const { scaleX, scaleY, skewX, skewY, rotate } = state.transform;
        state.element.style.transform =
            `rotate(${rotate}deg) skew(${skewX}deg, ${skewY}deg) scale(${scaleX}, ${scaleY})`;
    }

    _applyFilter(state) {
        const parts = [];
        if (state.brightness !== 1) {
            parts.push(`brightness(${state.brightness})`);
        }
        if (state.customFilter) {
            parts.push(state.customFilter);
        }
        state.element.style.filter = parts.join(" ");
    }

    _cancelChannel(state, channel) {
        const cancelFn = state.animations.get(channel);
        if (cancelFn) {
            cancelFn();
            state.animations.delete(channel);
        }
    }

    addImg(name, src, options = {}) {
        if (this.imageElements[name]) {
            const state = this._getState(name);
            if (src) {
                state.src = String(src);
                this.imageElements[name].src = resolveResourcePath(state.src, this.options.resourcePath);
            }
            if (options.dimmable !== undefined) {
                state.dimmable = Boolean(options.dimmable);
            }
            if (options.visible !== undefined) {
                options.visible ? this.showImg(name) : this.hideImg(name);
            }
            return this.imageElements[name];
        }

        const rawSrc = src ? String(src) : "";
        const imgElement = document.createElement("img");
        imgElement.alt = name;
        if (rawSrc) {
            imgElement.src = resolveResourcePath(rawSrc, this.options.resourcePath);
        }
        if (options.visible === false) {
            imgElement.style.display = "none";
        }
        this.imgfile.appendChild(imgElement);

        const state = {
            name,
            src: rawSrc,
            element: imgElement,
            visible: options.visible !== false,
            dimmable: options.dimmable !== false,
            leftPct: 0,
            topPct: 0,
            widthPct: null,
            heightPct: null,
            zIndex: null,
            opacity: 1,
            brightness: 1,
            customFilter: "",
            transform: {
                scaleX: 1,
                scaleY: 1,
                skewX: 0,
                skewY: 0,
                rotate: 0
            },
            animations: new Map()
        };

        this.imageElements[name] = imgElement;
        this._imageStates.set(name, state);
        return imgElement;
    }

    getImg(name) {
        return this.imageElements[name];
    }

    showImg(name) {
        const state = this._getState(name);
        if (!state) return false;
        state.visible = true;
        state.element.style.display = "";
        return true;
    }

    hideImg(name) {
        const state = this._getState(name);
        if (!state) return false;
        state.visible = false;
        state.element.style.display = "none";
        return true;
    }

    removeImg(name) {
        const state = this._getState(name);
        if (!state) return false;

        for (const cancelFn of state.animations.values()) {
            cancelFn();
        }
        state.animations.clear();
        if (state.element.parentNode) {
            state.element.parentNode.removeChild(state.element);
        }
        delete this.imageElements[name];
        this._imageStates.delete(name);
        return true;
    }

    setAppearance(name, appearance = {}) {
        const state = this._getState(name);
        if (!state) {
            console.warn(`ImageContainer: image "${name}" does not exist.`);
            return;
        }

        const { left, top, zIndex, width, height, opacity } = appearance;
        const el = state.element;

        if (left !== undefined) {
            state.leftPct = (toFiniteNumber(left, 0) / VIRTUAL_WIDTH) * 100;
            el.style.left = `${state.leftPct}%`;
        }
        if (top !== undefined) {
            state.topPct = (toFiniteNumber(top, 0) / VIRTUAL_HEIGHT) * 100;
            el.style.top = `${state.topPct}%`;
        }
        if (width !== undefined) {
            state.widthPct = (toFiniteNumber(width, 0) / VIRTUAL_WIDTH) * 100;
            el.style.width = `${state.widthPct}%`;
        }
        if (height !== undefined) {
            state.heightPct = (toFiniteNumber(height, 0) / VIRTUAL_HEIGHT) * 100;
            el.style.height = `${state.heightPct}%`;
        }
        if (zIndex !== undefined) {
            state.zIndex = toFiniteNumber(zIndex, 0);
            el.style.zIndex = String(state.zIndex);
        }
        if (opacity !== undefined) {
            state.opacity = clamp(toFiniteNumber(opacity, 1), 0, 1);
            el.style.opacity = String(state.opacity);
        }
    }

    setTransform(name, partial = {}) {
        const state = this._getState(name);
        if (!state) {
            console.warn(`ImageContainer: image "${name}" does not exist.`);
            return;
        }
        Object.assign(state.transform, partial);
        this._applyTransform(state);
    }

    setFilter(name, filter = "") {
        const state = this._getState(name);
        if (!state) {
            console.warn(`ImageContainer: image "${name}" does not exist.`);
            return;
        }
        state.customFilter = filter ? String(filter) : "";
        this._applyFilter(state);
    }

    _animateChannel(name, channel, time, easing, buildUpdater) {
        const state = this._getState(name);
        if (!state) {
            console.warn(`ImageContainer: image "${name}" does not exist.`);
            return Promise.resolve();
        }

        this._cancelChannel(state, channel);
        const onUpdate = buildUpdater(state);

        return runTween({
            durationMs: toFiniteNumber(time, 0) * 1000,
            easing,
            onRegisterCancel: (cancel) => state.animations.set(channel, cancel),
            onUpdate
        }).finally(() => {
            state.animations.delete(channel);
        });
    }

    move(name, deltaX, deltaY, time = 0, easing = "linear") {
        const deltaXPct = (toFiniteNumber(deltaX, 0) / VIRTUAL_WIDTH) * 100;
        const deltaYPct = (toFiniteNumber(deltaY, 0) / VIRTUAL_HEIGHT) * 100;

        return this._animateChannel(name, "move", time, easing, (state) => {
            const startX = state.leftPct;
            const startY = state.topPct;
            return (progress) => {
                state.leftPct = startX + deltaXPct * progress;
                state.topPct = startY + deltaYPct * progress;
                state.element.style.left = `${state.leftPct}%`;
                state.element.style.top = `${state.topPct}%`;
            };
        });
    }

    scale(name, w, h, time = 0, easing = "linear") {
        const targetScaleX = toFiniteNumber(w, 1);
        const targetScaleY = toFiniteNumber(h, 1);

        return this._animateChannel(name, "scale", time, easing, (state) => {
            const startScaleX = state.transform.scaleX;
            const startScaleY = state.transform.scaleY;
            return (progress) => {
                state.transform.scaleX = startScaleX + (targetScaleX - startScaleX) * progress;
                state.transform.scaleY = startScaleY + (targetScaleY - startScaleY) * progress;
                this._applyTransform(state);
            };
        });
    }

    skew(name, angleX, angleY, time = 0, easing = "linear") {
        const targetSkewX = toFiniteNumber(angleX, 0);
        const targetSkewY = toFiniteNumber(angleY, 0);

        return this._animateChannel(name, "skew", time, easing, (state) => {
            const startSkewX = state.transform.skewX;
            const startSkewY = state.transform.skewY;
            return (progress) => {
                state.transform.skewX = startSkewX + (targetSkewX - startSkewX) * progress;
                state.transform.skewY = startSkewY + (targetSkewY - startSkewY) * progress;
                this._applyTransform(state);
            };
        });
    }

    rotate(name, angle, time = 0, easing = "linear") {
        const targetAngle = toFiniteNumber(angle, 0);

        return this._animateChannel(name, "rotate", time, easing, (state) => {
            const startAngle = state.transform.rotate;
            return (progress) => {
                state.transform.rotate = startAngle + (targetAngle - startAngle) * progress;
                this._applyTransform(state);
            };
        });
    }

    fadeTo(name, targetOpacity, time = 0.5, easing = "linear") {
        const finalOpacity = clamp(toFiniteNumber(targetOpacity, 1), 0, 1);

        return this._animateChannel(name, "opacity", time, easing, (state) => {
            const startOpacity = state.opacity;
            return (progress) => {
                state.opacity = clamp(startOpacity + (finalOpacity - startOpacity) * progress, 0, 1);
                state.element.style.opacity = String(state.opacity);
            };
        });
    }

    fadeIn(name, time = 0.5) {
        return this.fadeTo(name, 1, time);
    }

    fadeOut(name, time = 0.5) {
        return this.fadeTo(name, 0, time);
    }

    dim(name, dimmed = true, options = {}) {
        const { brightness = 0.55, time = 0.25, easing = "easeOut" } = options;
        const targetBrightness = dimmed ? clamp(toFiniteNumber(brightness, 0.55), 0, 2) : 1;

        return this._animateChannel(name, "brightness", time, easing, (state) => {
            const startBrightness = state.brightness;
            return (progress) => {
                state.brightness = startBrightness + (targetBrightness - startBrightness) * progress;
                this._applyFilter(state);
            };
        });
    }

    /**
     * Highlight specific dimmable images while dimming the rest.
     * Pass `null` or `undefined` to restore all images to full brightness.
     * @param {string|string[]|null} activeNames
     * @param {Object} [options]
     * @returns {Promise<void[]>}
     */
    focus(activeNames, options = {}) {
        const {
            activeBrightness = 1,
            dimBrightness = 0.55,
            time = 0.25,
            easing = "easeOut",
            targets = null,
            exclude = []
        } = options;

        const clearFocus = activeNames === null || activeNames === undefined;
        const activeSet = clearFocus
            ? null
            : new Set(Array.isArray(activeNames) ? activeNames : [activeNames]);
        const targetSet = Array.isArray(targets) ? new Set(targets) : null;
        const excludeSet = new Set(Array.isArray(exclude) ? exclude : [exclude]);

        const promises = [];
        for (const [name, state] of this._imageStates.entries()) {
            if (targetSet && !targetSet.has(name)) continue;
            if (excludeSet.has(name) || !state.dimmable) continue;

            const isFocused = clearFocus || activeSet.has(name);
            const targetVal = isFocused ? activeBrightness : dimBrightness;
            promises.push(this._animateChannel(name, "brightness", time, easing, (st) => {
                const startVal = st.brightness;
                return (progress) => {
                    st.brightness = startVal + (targetVal - startVal) * progress;
                    this._applyFilter(st);
                };
            }));
        }
        return Promise.all(promises);
    }

    exportState() {
        return Array.from(this._imageStates.values()).map((st) => ({
            name: st.name,
            src: st.src,
            visible: st.visible,
            dimmable: st.dimmable,
            leftPct: st.leftPct,
            topPct: st.topPct,
            widthPct: st.widthPct,
            heightPct: st.heightPct,
            zIndex: st.zIndex,
            opacity: st.opacity,
            brightness: st.brightness,
            customFilter: st.customFilter,
            transform: { ...st.transform }
        }));
    }

    importState(items = []) {
        for (const existingName of Object.keys(this.imageElements)) {
            this.removeImg(existingName);
        }
        for (const item of items) {
            if (!item || !item.name) continue;
            this.addImg(item.name, item.src, {
                dimmable: item.dimmable,
                visible: item.visible
            });
            const st = this._getState(item.name);
            if (!st) continue;

            if (item.leftPct !== undefined && item.leftPct !== null) {
                st.leftPct = item.leftPct;
                st.element.style.left = `${st.leftPct}%`;
            }
            if (item.topPct !== undefined && item.topPct !== null) {
                st.topPct = item.topPct;
                st.element.style.top = `${st.topPct}%`;
            }
            if (item.widthPct !== undefined && item.widthPct !== null) {
                st.widthPct = item.widthPct;
                st.element.style.width = `${st.widthPct}%`;
            }
            if (item.heightPct !== undefined && item.heightPct !== null) {
                st.heightPct = item.heightPct;
                st.element.style.height = `${st.heightPct}%`;
            }
            if (item.zIndex !== undefined && item.zIndex !== null) {
                st.zIndex = item.zIndex;
                st.element.style.zIndex = String(st.zIndex);
            }
            if (item.opacity !== undefined) {
                st.opacity = clamp(toFiniteNumber(item.opacity, 1), 0, 1);
                st.element.style.opacity = String(st.opacity);
            }
            if (item.brightness !== undefined) {
                st.brightness = toFiniteNumber(item.brightness, 1);
            }
            if (item.customFilter !== undefined) {
                st.customFilter = item.customFilter || "";
            }
            this._applyFilter(st);
            if (item.transform) {
                Object.assign(st.transform, item.transform);
                this._applyTransform(st);
            }
        }
    }

    cancelAllAnimations() {
        for (const state of this._imageStates.values()) {
            for (const cancelFn of state.animations.values()) {
                cancelFn();
            }
            state.animations.clear();
        }
    }
}

class AudioContainer {
    constructor(options = {}) {
        this.options = {
            resourcePath: "resources/",
            ...options
        };
        this.audioElements = {};
        this._audioStates = new Map();

        this.audfile = document.createElement("span");
        this.audfile.id = "audfile";
        this.audfile.style.visibility = "hidden";
    }

    getContainer() {
        return this.audfile;
    }

    _clearTimers(state) {
        if (state.fadeCancel) {
            state.fadeCancel();
            state.fadeCancel = null;
        }
        if (state.stopTimer !== null) {
            clearTimeout(state.stopTimer);
            state.stopTimer = null;
        }
    }

    _fadeVolume(state, fromVolume, toVolume, durationMs, onComplete) {
        const startVol = clamp(fromVolume, 0, 1);
        const endVol = clamp(toVolume, 0, 1);

        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            state.element.volume = endVol;
            if (onComplete) onComplete();
            return Promise.resolve();
        }

        const now = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
        const startTime = now();
        state.element.volume = startVol;

        return new Promise((resolve) => {
            let cancelled = false;
            const intervalId = setInterval(() => {
                if (cancelled) return;
                const progress = clamp((now() - startTime) / durationMs, 0, 1);
                state.element.volume = clamp(startVol + (endVol - startVol) * progress, 0, 1);

                if (progress >= 1) {
                    clearInterval(intervalId);
                    if (state.fadeCancel === cancel) {
                        state.fadeCancel = null;
                    }
                    if (onComplete) onComplete();
                    resolve();
                }
            }, 16);

            const cancel = () => {
                if (cancelled) return;
                cancelled = true;
                clearInterval(intervalId);
                resolve();
            };

            state.fadeCancel = cancel;
        });
    }

    addAudio(name, src, options = {}) {
        if (this.audioElements[name]) {
            const state = this._audioStates.get(name);
            if (src) {
                state.src = String(src);
                this.audioElements[name].src = resolveResourcePath(state.src, this.options.resourcePath);
            }
            if (options.loop !== undefined) {
                this.audioElements[name].loop = Boolean(options.loop);
            }
            return this.audioElements[name];
        }

        const rawSrc = src ? String(src) : "";
        const audioElement = document.createElement("audio");
        if (rawSrc) {
            audioElement.src = resolveResourcePath(rawSrc, this.options.resourcePath);
        }
        audioElement.loop = Boolean(options.loop);
        audioElement.preload = options.preload || "auto";

        const initialVolume = options.volume !== undefined ? clamp(toFiniteNumber(options.volume, 1), 0, 1) : 1;
        audioElement.volume = initialVolume;

        this.audfile.appendChild(audioElement);
        this.audioElements[name] = audioElement;
        this._audioStates.set(name, {
            name,
            src: rawSrc,
            element: audioElement,
            targetVolume: initialVolume,
            fadeCancel: null,
            stopTimer: null
        });

        return audioElement;
    }

    getAudio(name) {
        return this.audioElements[name];
    }

    removeAudio(name) {
        const state = this._audioStates.get(name);
        if (!state) return false;

        this._clearTimers(state);
        state.element.pause();
        if (state.element.parentNode) {
            state.element.parentNode.removeChild(state.element);
        }
        delete this.audioElements[name];
        this._audioStates.delete(name);
        return true;
    }

    setVolume(name, volume) {
        const state = this._audioStates.get(name);
        if (!state) {
            console.warn(`AudioContainer: audio "${name}" does not exist.`);
            return;
        }
        const clamped = clamp(toFiniteNumber(volume, 1), 0, 1);
        state.targetVolume = clamped;
        state.element.volume = clamped;
    }

    /**
     * Play an audio track with optional duration (seconds) and fade-in (milliseconds).
     * @param {string} name
     * @param {number} [time=0] - Auto-pause duration in seconds (`0` = play without auto-pause).
     * @param {number} [fade=0] - Fade-in duration in milliseconds.
     * @param {Object} [options]
     * @returns {Promise<void>}
     */
    audPlay(name, time = 0, fade = 0, options = {}) {
        const state = this._audioStates.get(name);
        if (!state) {
            console.warn(`AudioContainer: audio "${name}" does not exist.`);
            return Promise.resolve();
        }

        this._clearTimers(state);
        if (options.loop !== undefined) {
            state.element.loop = Boolean(options.loop);
        }

        const durationSec = toFiniteNumber(time, 0);
        const fadeMs = toFiniteNumber(fade, 0);
        const targetVol = state.targetVolume;

        if (fadeMs > 0) {
            state.element.volume = 0;
        } else {
            state.element.volume = targetVol;
        }

        try {
            const playResult = state.element.play();
            if (playResult && typeof playResult.catch === "function") {
                playResult.catch((err) => {
                    console.warn(`AudioContainer: playback blocked or failed for "${name}":`, err?.message || err);
                });
            }
        } catch (err) {
            console.warn(`AudioContainer: playback failed for "${name}":`, err?.message || err);
        }

        if (durationSec > 0) {
            state.stopTimer = setTimeout(() => {
                state.stopTimer = null;
                state.element.pause();
            }, durationSec * 1000);
        }

        if (fadeMs > 0) {
            return this._fadeVolume(state, 0, targetVol, fadeMs);
        }
        return Promise.resolve();
    }

    /**
     * Stop/pause an audio track with optional fade-out (milliseconds).
     * @param {string} name
     * @param {number} [fade=0] - Fade-out duration in milliseconds.
     * @returns {Promise<void>}
     */
    audStop(name, fade = 0) {
        const state = this._audioStates.get(name);
        if (!state) {
            console.warn(`AudioContainer: audio "${name}" does not exist.`);
            return Promise.resolve();
        }

        this._clearTimers(state);
        const fadeMs = toFiniteNumber(fade, 0);

        if (fadeMs > 0) {
            const startVol = state.element.volume;
            return this._fadeVolume(state, startVol, 0, fadeMs, () => {
                state.element.pause();
            });
        }

        state.element.pause();
        return Promise.resolve();
    }

    pauseAll() {
        for (const state of this._audioStates.values()) {
            this._clearTimers(state);
            state.element.pause();
        }
    }

    stopAll() {
        for (const state of this._audioStates.values()) {
            this._clearTimers(state);
            state.element.pause();
            try {
                state.element.currentTime = 0;
            } catch {
                // Ignore if media metadata isn't loaded yet
            }
        }
    }

    exportState() {
        return Array.from(this._audioStates.values()).map((st) => ({
            name: st.name,
            src: st.src,
            loop: Boolean(st.element.loop),
            volume: st.element.volume,
            targetVolume: st.targetVolume,
            playing: !st.element.paused,
            currentTime: st.element.currentTime || 0
        }));
    }

    importState(items = [], { restoreAudioPlayback = true } = {}) {
        for (const existingName of Object.keys(this.audioElements)) {
            this.removeAudio(existingName);
        }
        for (const item of items) {
            if (!item || !item.name) continue;
            const el = this.addAudio(item.name, item.src, {
                loop: item.loop,
                volume: item.targetVolume ?? item.volume ?? 1
            });
            if (item.volume !== undefined) {
                el.volume = clamp(toFiniteNumber(item.volume, 1), 0, 1);
            }
            if (item.currentTime) {
                try {
                    el.currentTime = item.currentTime;
                } catch {
                    // Ignore if audio metadata isn't loaded yet
                }
            }
            if (restoreAudioPlayback && item.playing) {
                this.audPlay(item.name, 0, 0);
            }
        }
    }
}

class ButtonContainer {
    constructor(options = {}) {
        this.options = options;
        this.isShowing = false;
        this._activeCancel = null;
        this._buttonMap = new Map();
        this.buttonElements = [];

        this.buttonsArea = document.createElement("div");
        this.buttonsArea.id = "buttons";
        this.buttonsArea.style.display = "none";
        this.setAlignment(options.align || "center");
        this.setAppearance();
    }

    getContainer() {
        return this.buttonsArea;
    }

    /**
     * Set horizontal alignment for choice buttons (`"center"`, `"left"`, or `"right"`).
     * @param {"center"|"left"|"right"} align
     */
    setAlignment(align = "center") {
        const normalized = align === "left" || align === "right" ? align : "center";
        this.buttonsArea.setAttribute("data-align", normalized);
    }

    setAppearance(styles = {}) {
        Object.assign(this.buttonsArea.style, {
            backgroundColor: "#00000088",
            ...styles
        });
    }

    addButton(src, text) {
        const value = src == null ? "" : String(src);
        if (this._buttonMap.has(value)) {
            this.clearButton(value);
        }

        const newButton = document.createElement("button");
        newButton.type = "button";
        newButton.textContent = text == null ? "" : String(text);
        newButton.dataset.value = value;
        if (value && !/\s/.test(value)) {
            newButton.classList.add(value);
        }

        this.buttonsArea.appendChild(newButton);
        this._buttonMap.set(value, newButton);
        this.buttonElements = Array.from(this._buttonMap.values());
        return newButton;
    }

    async showButton(options = {}) {
        const buttons = Array.from(this.buttonsArea.children);
        if (buttons.length === 0) {
            console.warn("ButtonContainer: showButton() called with no buttons added.");
            return null;
        }

        if (options.align) {
            this.setAlignment(options.align);
        }
        if (typeof this.options.onBeforeShow === "function") {
            this.options.onBeforeShow();
        }

        if (this._activeCancel) {
            this._activeCancel(null);
            this._activeCancel = null;
        }

        this.isShowing = true;
        this.buttonsArea.style.display = "flex";

        return new Promise((resolve) => {
            let settled = false;
            let select = -1;
            const cleanups = [];

            const updateSelection = (nextIndex) => {
                select = nextIndex;
                buttons.forEach((btn, idx) => {
                    btn.classList.toggle("selected", idx === select);
                });
            };

            const moveSelection = (moveDown) => {
                if (buttons.length === 0) return;
                let next;
                if (select === -1) {
                    next = moveDown ? 0 : buttons.length - 1;
                } else {
                    next = moveDown
                        ? (select + 1) % buttons.length
                        : (select - 1 + buttons.length) % buttons.length;
                }
                updateSelection(next);
            };

            const isBlocked = () => {
                if (typeof this.options.isBlocked === "function" && this.options.isBlocked()) {
                    return true;
                }
                return isEditableElementFocused();
            };

            const cleanup = () => {
                while (cleanups.length > 0) {
                    const fn = cleanups.pop();
                    fn();
                }
                this.isShowing = false;
                if (this._activeCancel === cancel) {
                    this._activeCancel = null;
                }
            };

            const finishWith = (value, shouldClear = true) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (shouldClear) {
                    this.clearButton();
                }
                if (typeof this.options.onAfterHide === "function") {
                    this.options.onAfterHide();
                }
                resolve(value);
            };

            const cancel = (fallbackValue = null) => {
                finishWith(fallbackValue, false);
            };
            this._activeCancel = cancel;

            const onWheel = (event) => {
                if (settled || isBlocked()) return;
                if (Math.abs(event.deltaY) < 1) return;
                moveSelection(event.deltaY > 0);
            };

            const onKeyDown = (event) => {
                if (settled || isBlocked()) return;
                if (event.ctrlKey || event.metaKey || event.altKey) return;

                if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
                    event.preventDefault();
                    event.stopPropagation();
                    moveSelection(true);
                } else if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
                    event.preventDefault();
                    event.stopPropagation();
                    moveSelection(false);
                } else if (event.key === "Enter" && select >= 0 && select < buttons.length) {
                    event.preventDefault();
                    event.stopPropagation();
                    finishWith(buttons[select].dataset.value);
                }
            };

            document.addEventListener("wheel", onWheel, { passive: true });
            document.addEventListener("keydown", onKeyDown);
            cleanups.push(() => {
                document.removeEventListener("wheel", onWheel);
                document.removeEventListener("keydown", onKeyDown);
            });

            buttons.forEach((btn, index) => {
                const onMouseEnter = () => updateSelection(index);
                const onMouseLeave = () => {
                    if (select === index) {
                        updateSelection(-1);
                    }
                };
                const onClick = (event) => {
                    event.stopPropagation();
                    finishWith(btn.dataset.value);
                };

                btn.addEventListener("mouseenter", onMouseEnter);
                btn.addEventListener("mouseleave", onMouseLeave);
                btn.addEventListener("click", onClick);
                cleanups.push(() => {
                    btn.removeEventListener("mouseenter", onMouseEnter);
                    btn.removeEventListener("mouseleave", onMouseLeave);
                    btn.removeEventListener("click", onClick);
                });
            });
        });
    }

    clearButton(name) {
        if (name !== undefined && name !== null) {
            const key = String(name);
            const btn = this._buttonMap.get(key);
            if (btn) {
                if (btn.parentNode === this.buttonsArea) {
                    this.buttonsArea.removeChild(btn);
                }
                this._buttonMap.delete(key);
                this.buttonElements = Array.from(this._buttonMap.values());
                if (this._buttonMap.size === 0) {
                    this.buttonsArea.style.display = "none";
                }
            }
            return;
        }

        if (this._activeCancel) {
            this._activeCancel(null);
            this._activeCancel = null;
        }
        this.buttonsArea.innerHTML = "";
        this._buttonMap.clear();
        this.buttonElements = [];
        this.buttonsArea.style.display = "none";
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        DialogSystem,
        DialogBox: dialogBox,
        dialogBox,
        ImageContainer,
        AudioContainer,
        ButtonContainer,
        extractStorySegment,
        parseTextTokens,
        resolveResourcePath
    };
}
