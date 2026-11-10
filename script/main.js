const intro = document.getElementById("intro");
const startBtn = intro.querySelector("button");

const FALLBACK_STORY = [
    "Once upon a time, there was a brave knight who lived in a castle made of crystal.",
    "The knight had a magical sword that could cut through shadows and reveal hidden truths.",
    "Every morning, he would ride his silver horse through the enchanted forest nearby.",
    "break",
    "One day, he discovered a mysterious cave glowing with blue light.",
    "Inside the cave, he found a dragon who was not fierce at all, but rather loved to read books.",
    "The knight and the dragon became unlikely friends, sharing stories and drinking tea together.",
    "Soon, other magical creatures began visiting their cave for weekly book club meetings.",
    "Word spread throughout the kingdom about the reading dragon and the literary knight.",
    "The kingdom became known as a place where magic and knowledge lived in harmony.",
    "And so, they all lived happily ever after, surrounded by books and magic."
];

async function loadStoryLines(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.text();
        return data
            .replace(/\r\n|\r|\n/g, "\n")
            .split("\n")
            .filter((line) => line.trim() !== "");
    } catch {
        return FALLBACK_STORY;
    }
}

function resetStageBaseline(dialog) {
    dialog.dialog.style.removeProperty("--dialog-height");
    dialog.dialog.style.removeProperty("--accent-color");
    dialog.dialog.style.removeProperty("--dialog-box-border");
    dialog.dialogBoxInstance.setColor("#1e222ecc");
    dialog.dialog.style.color = "#ffffff";
    dialog.btnContainer.setAlignment("center");
    dialog.setTypingSpeed(15);
    dialog.setBackground("sunset.jpg");

    dialog.imgContainer.removeImg("leftChar");
    dialog.imgContainer.removeImg("rightChar");
    dialog.imgContainer.addImg("character", "bocchi.jpg");
    dialog.imgContainer.setAppearance("character", {
        left: 760,
        top: 120,
        zIndex: 1,
        width: 400,
        height: 600,
        opacity: 1
    });
    dialog.imgContainer.setTransform("character", {
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        rotate: 0
    });
    dialog.imgContainer.focus(null, { time: 0 });
}

async function demoNarrativeAndBreaks(dialog, storyLines) {
    await dialog.showStory([
        {
            speaker: "Guide",
            text: "1) Multi-Speaker Beats & Typewriter: Each line can declare its own speaker, focus, or stage action."
        },
        {
            speaker: "",
            focus: [],
            text: "Passing an empty speaker hides #nametag for narration—and notice the character dimmed automatically."
        },
        {
            speaker: "Guide",
            focus: "character",
            text: "Inline pauses & speed tags:{wait:350}{speed:45} slow dramatic reveal...{wait:250}{speed:10} and back to fast!"
        },
        {
            speaker: "Guide",
            text: "Lines can also append: first half..."
        },
        {
            speaker: "Guide",
            append: true,
            text: " appended seamlessly onto the same box!"
        },
        {
            speaker: "Narrator",
            focus: null,
            text: 'Now loading part 1 (after "break") from demo.txt:'
        }
    ]);

    await dialog.showStory(storyLines, 1);
    resetStageBaseline(dialog);
}

async function demoStageAndFocus(dialog) {
    dialog.imgContainer.removeImg("character");
    dialog.imgContainer.addImg("leftChar", "bocchi.jpg");
    dialog.imgContainer.setAppearance("leftChar", {
        left: 280,
        top: 140,
        zIndex: 1,
        width: 380,
        height: 540,
        opacity: 0
    });
    dialog.imgContainer.addImg("rightChar", "resize.jpg");
    dialog.imgContainer.setAppearance("rightChar", {
        left: 1240,
        top: 160,
        zIndex: 1,
        width: 420,
        height: 500,
        opacity: 0
    });

    await dialog.showStory([
        {
            speaker: "Left Character",
            images: {
                leftChar: { fadeTo: 1, move: [40, 0], time: 0.45, easing: "easeOut" },
                rightChar: { fadeTo: 1, move: [-40, 0], time: 0.45, easing: "easeOut" }
            },
            focus: "leftChar",
            text: "2) Dual-Sprite Focus: I'm lit up while the other sprite smoothly dims."
        },
        {
            speaker: "Right Character",
            focus: "rightChar",
            images: {
                rightChar: { scale: [1.08, 1.08], time: 0.3, easing: "easeOut" }
            },
            text: "Now focus shifts to me with a subtle scale-up, without touching position or rotation."
        },
        {
            speaker: "Stage Director",
            background: "resize.jpg",
            focus: null,
            images: {
                leftChar: { move: [140, -30], rotate: 360, skew: [8, 0], scale: [1.1, 1.1], time: 0.9, easing: "easeInOut" },
                rightChar: { fadeTo: 0.4, time: 0.5 }
            },
            text: "Concurrent move + rotate + skew + scale run together cleanly, plus setBackground() switched the backdrop!"
        },
        {
            background: "sunset.jpg",
            wait: 250
        }
    ]);

    resetStageBaseline(dialog);
}

async function demoUiAndThemes(dialog) {
    await dialog.showStory({
        speaker: "UI Demo",
        text: "3) Input Prompt, Choice Alignment & CSS Variables: Let's start with a text prompt."
    });

    const userInput = await dialog.dialogBoxInstance.getMessage("Enter a speaker name to display:", "Traveler");
    const chosenSpeaker = userInput.trim() || "Traveler";

    dialog.btnContainer.addButton("center", "Centered Choices (Default)");
    dialog.btnContainer.addButton("left", "Try Left-Aligned Choices");
    dialog.btnContainer.addButton("right", "Try Right-Aligned Choices");
    await dialog.showStory({
        speaker: chosenSpeaker,
        text: "Pick an alignment style (also try Arrow keys, W/S, Mouse Wheel + Enter):"
    });

    const align = await dialog.btnContainer.showButton();
    if (align && align !== "center") {
        dialog.btnContainer.setAlignment(align);
        dialog.btnContainer.addButton("ok", `Aligned "${align}"! Click to continue`);
        await dialog.showStory(`Choices are now aligned "${align}" via setAlignment("${align}").`);
        await dialog.btnContainer.showButton();
    }

    // Demonstrate CSS custom properties live restyling
    dialog.dialog.style.setProperty("--dialog-height", "42%");
    dialog.dialog.style.setProperty("--accent-color", "#db2777");
    dialog.dialog.style.setProperty("--dialog-box-border", "1px solid rgba(244, 114, 182, 0.55)");
    dialog.dialogBoxInstance.setColor("#2d162acc");
    await dialog.showStory("CSS custom properties (--dialog-height: 42%, --accent-color) restyle the whole box & nametag instantly.");

    resetStageBaseline(dialog);
}

async function demoAudioAndSaveLoad(dialog) {
    await dialog.showStory({
        speaker: "System",
        text: "4) Audio Fades, Auto/Skip & Save/Load Snapshot: Let's demonstrate audio volume & fade control first."
    });

    dialog.audContainer.setVolume("bgm", 0.35);
    await dialog.showStory("BGM lowered to 35% volume via setVolume(). Next we will save a stage snapshot!");

    // Prepare a distinct scene state and export it
    dialog.setSpeaker("Snapshot Keeper");
    await dialog.imgContainer.move("character", -220, 0, 0.35, "easeOut");
    await dialog.imgContainer.rotate("character", -12, 0.35, "easeOut");
    await dialog.showStory("Scene captured! Advancing will save this exact state, scramble the stage, then restore it.");

    const savedSnapshot = dialog.exportState();
    try {
        localStorage.setItem("dialogjs_demo_slot", JSON.stringify(savedSnapshot));
    } catch {
        // Ignore storage restrictions in private modes
    }

    // Scramble background, color, speaker, and sprite transform
    dialog.setBackground("resize.jpg");
    dialog.setSpeaker("Glitch");
    dialog.dialogBoxInstance.setColor("#4c1d24dd");
    await dialog.imgContainer.move("character", 440, 40, 0.35, "easeOut");
    await dialog.imgContainer.rotate("character", 35, 0.35, "easeOut");
    await dialog.showStory("Stage scrambled! Advance once more to call importState() and jump straight back.");

    dialog.importState(savedSnapshot);
    await dialog.showStory("Stage restored via exportState() / importState()—background, sprite transform, color, and history!");

    dialog.audContainer.setVolume("bgm", 1);
    await dialog.showStory([
        {
            speaker: "System",
            text: "Tip: Try clicking Auto or Skip in the top-right HUD, hold Ctrl to fast-forward, or press L to view History."
        }
    ]);

    resetStageBaseline(dialog);
}

async function runFullTour(dialog, storyLines) {
    await demoNarrativeAndBreaks(dialog, storyLines);
    await demoStageAndFocus(dialog);
    await demoUiAndThemes(dialog);
    await demoAudioAndSaveLoad(dialog);
    await dialog.showStory({
        speaker: "Guide",
        text: "Full guided tour complete! Returning to the Feature Showcase menu."
    });
}

startBtn.addEventListener("click", async () => {
    intro.style.display = "none";

    const myDialog = new DialogSystem({
        controls: true,
        inlineTags: true,
        buttonAlign: "center"
    });

    resetStageBaseline(myDialog);
    myDialog.audContainer.addAudio("bgm", "Music.mp3", { loop: true });
    myDialog.audContainer.audPlay("bgm", 0, 1500);

    const storyLines = await loadStoryLines("demo.txt");
    myDialog.show();

    await myDialog.showStory({
        speaker: "Guide",
        text: "Welcome to the DialogJS Feature Showcase! Pick any module below or run the full guided tour."
    });

    let running = true;
    while (running) {
        myDialog.setSpeaker("Showcase Hub");
        myDialog.btnContainer.setAlignment("center");
        myDialog.btnContainer.addButton("tour", "Run Full Guided Tour (All Features)");
        myDialog.btnContainer.addButton("narrative", "1. Multi-Speaker Beats, Inline Tags & Breaks");
        myDialog.btnContainer.addButton("stage", "2. Stage Tweens, Sprite Focus & Backgrounds");
        myDialog.btnContainer.addButton("ui", "3. Input Prompt, Choice Alignments & CSS Themes");
        myDialog.btnContainer.addButton("system", "4. Audio Control, Save/Load Snapshot & Auto/Skip");
        myDialog.btnContainer.addButton("exit", "Exit to Title Screen");

        await myDialog.showStory("Select a feature demo (Click, Arrow keys / W / S / Wheel + Enter):");
        const choice = await myDialog.btnContainer.showButton();

        if (choice === "tour") {
            await runFullTour(myDialog, storyLines);
        } else if (choice === "narrative") {
            await demoNarrativeAndBreaks(myDialog, storyLines);
        } else if (choice === "stage") {
            await demoStageAndFocus(myDialog);
        } else if (choice === "ui") {
            await demoUiAndThemes(myDialog);
        } else if (choice === "system") {
            await demoAudioAndSaveLoad(myDialog);
        } else {
            running = false;
        }
    }

    await myDialog.showStory({
        speaker: "Guide",
        text: "Thanks for trying DialogJS! Fading out music and returning to the title screen."
    });
    await myDialog.audContainer.audStop("bgm", 800);
    myDialog.destroy();
    intro.style.display = "";
});
