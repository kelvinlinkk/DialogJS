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

/**
 * Extract the lines belonging to part `partIndex`, where parts are delimited by `"break"`.
 * @param {string|string[]} texts
 * @param {number} partIndex
 * @returns {string[]}
 */
function extractStorySegment(texts, partIndex = 0) {
    const lines = typeof texts === "string"
        ? [texts]
        : Array.isArray(texts)
            ? texts.map((line) => (line == null ? "" : String(line)))
            : [];

    const targetPart = Math.max(0, Math.floor(toFiniteNumber(partIndex, 0)));
    let currentPart = 0;
    const segment = [];

    for (const line of lines) {
        if (line.trim() === "break") {
            if (currentPart === targetPart) {
                break;
            }
            currentPart += 1;
            continue;
        }
        if (currentPart === targetPart) {
            segment.push(line);
        }
    }

    return segment;
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
     */
    constructor(options = {}) {
        this.options = {
            resourcePath: "resources/",
            stylesheetPath: "style/appearance.css",
            typingSpeed: 15,
            defaultSpeaker: "someone",
            ...options
        };

        this.speaker = this.options.defaultSpeaker;
        this.isDisplaying = false;
        this.isHistoryOpen = false;
        this.typingSpeed = Math.max(0, toFiniteNumber(this.options.typingSpeed, 15));

        this._destroyed = false;
        this._activeStoryCancel = null;
        this._typingAbort = null;
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
            isBlocked: () => this._isModalOverlayOpen()
        });

        this.dialog.appendChild(this.imgContainer.getContainer());
        this.dialog.appendChild(this.audContainer.getContainer());

        this.dialogBoxInstance = new dialogBox(this.dialog, {
            resourcePath: this.options.resourcePath,
            defaultSpeaker: this.speaker,
            onSpeakerChange: (name) => {
                this.speaker = name;
            }
        });

        this.dialog.appendChild(this.btnContainer.getContainer());

        this.dialogHistory = this._createHistoryPanel();
        this.dialog.appendChild(this.dialogHistory);

        this._onGlobalKeyDown = (event) => {
            if (this._destroyed || !this.isDisplaying) return;
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

        document.addEventListener("keydown", this._onGlobalKeyDown);
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

    _isModalOverlayOpen() {
        return this.isHistoryOpen || this.dialogBoxInstance.isPromptOpen;
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
    }

    clearHistory() {
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
            this.background.removeAttribute("src");
            this.background.style.visibility = "hidden";
            return;
        }
        this.background.src = resolveResourcePath(src, this.options.resourcePath);
        this.background.style.visibility = "visible";
    }

    setTypingSpeed(ms) {
        this.typingSpeed = Math.max(0, toFiniteNumber(ms, 15));
    }

    /**
     * Display story lines (or a specific `"break"`-delimited part) with typewriter effect.
     * Clicking the dialog box or pressing Space/Enter skips typing, or advances once finished.
     * @param {string|string[]} texts
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
            const box = this.dialogBoxInstance.getBox();

            const cleanup = () => {
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

            const advanceOrSkip = () => {
                if (settled || !this.isDisplaying || this._isModalOverlayOpen()) return;

                if (this.isLocked && this._typingAbort) {
                    this._typingAbort.skip();
                    return;
                }

                if (this.lineNum < this.text.length) {
                    this.readWords(this.lineNum);
                } else {
                    finish();
                }
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

            this.readWords(0);
        });
    }

    /**
     * Type out a single line from `this.text[num]` into the dialog box and record it in history.
     * @param {number} num
     * @returns {Promise<void>}
     */
    async readWords(num) {
        if (num < 0 || num >= this.text.length) {
            this.isLocked = false;
            return;
        }

        if (this._typingAbort) {
            this._typingAbort.cancel();
        }

        const fullLine = this.text[num];
        const chars = Array.from(fullLine);
        this.isLocked = true;
        this.dialogBoxInstance.setWaiting(false);
        this.dialogBoxInstance.setText("");

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
            this.dialogBoxInstance.setText(fullLine);
            this.lineNum = num + 1;
            this._appendHistoryEntry(this.speaker, fullLine);
            this.isLocked = false;
            this.dialogBoxInstance.setWaiting(true);
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

        if (this.typingSpeed > 0) {
            let displayed = "";
            for (const ch of chars) {
                if (cancelled || skipped) break;
                displayed += ch;
                this.dialogBoxInstance.setText(displayed);

                await new Promise((resolve) => {
                    wakeSleep = resolve;
                    timerId = setTimeout(() => {
                        timerId = null;
                        wakeSleep = null;
                        resolve();
                    }, this.typingSpeed);
                });
            }
        }

        if (cancelled || skipped) {
            return;
        }

        finalizeLine();
    }

    _appendHistoryEntry(speaker, text) {
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

    show() {
        if (this._destroyed) return;
        this.dialog.style.display = "block";
        this.isDisplaying = true;
    }

    hide() {
        this.audContainer.pauseAll();
        this.toggleHistory(false);
        this.dialog.style.display = "none";
        this.isDisplaying = false;
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        if (this._activeStoryCancel) {
            this._activeStoryCancel();
            this._activeStoryCancel = null;
        }
        document.removeEventListener("keydown", this._onGlobalKeyDown);
        this.audContainer.stopAll();
        this.imgContainer.cancelAllAnimations();
        this.btnContainer.clearButton();
        this.dialogBoxInstance.cancelPrompt();

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
            ...options
        };

        this.isPromptOpen = false;
        this._activePromptCancel = null;

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
        this.setColor("#00000060");
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
        this.img.style.visibility = "hidden";
        this.box.style.backgroundColor = color;
        this.nametag.style.backgroundColor = color;
    }

    setText(text) {
        this.box.textContent = text == null ? "" : String(text);
    }

    setImg(source) {
        if (!source) {
            this.img.removeAttribute("src");
            this.img.style.visibility = "hidden";
            this.box.style.backgroundColor = this._boxColor || "#00000060";
            return;
        }
        this.img.src = resolveResourcePath(source, this.options.resourcePath);
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

    _cancelChannel(state, channel) {
        const cancelFn = state.animations.get(channel);
        if (cancelFn) {
            cancelFn();
            state.animations.delete(channel);
        }
    }

    addImg(name, src) {
        if (this.imageElements[name]) {
            if (src) {
                this.imageElements[name].src = resolveResourcePath(src, this.options.resourcePath);
            }
            return this.imageElements[name];
        }

        const imgElement = document.createElement("img");
        imgElement.alt = name;
        imgElement.src = resolveResourcePath(src, this.options.resourcePath);
        this.imgfile.appendChild(imgElement);

        const state = {
            element: imgElement,
            leftPct: 0,
            topPct: 0,
            opacity: 1,
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
            el.style.width = `${(toFiniteNumber(width, 0) / VIRTUAL_WIDTH) * 100}%`;
        }
        if (height !== undefined) {
            el.style.height = `${(toFiniteNumber(height, 0) / VIRTUAL_HEIGHT) * 100}%`;
        }
        if (zIndex !== undefined) {
            el.style.zIndex = String(toFiniteNumber(zIndex, 0));
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
            if (src) {
                this.audioElements[name].src = resolveResourcePath(src, this.options.resourcePath);
            }
            return this.audioElements[name];
        }

        const audioElement = document.createElement("audio");
        audioElement.src = resolveResourcePath(src, this.options.resourcePath);
        audioElement.loop = Boolean(options.loop);
        audioElement.preload = options.preload || "auto";

        const initialVolume = options.volume !== undefined ? clamp(toFiniteNumber(options.volume, 1), 0, 1) : 1;
        audioElement.volume = initialVolume;

        this.audfile.appendChild(audioElement);
        this.audioElements[name] = audioElement;
        this._audioStates.set(name, {
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
        this.setAppearance();
    }

    getContainer() {
        return this.buttonsArea;
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

    async showButton() {
        const buttons = Array.from(this.buttonsArea.children);
        if (buttons.length === 0) {
            console.warn("ButtonContainer: showButton() called with no buttons added.");
            return null;
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
        resolveResourcePath
    };
}
