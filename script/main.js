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

startBtn.addEventListener("click", async () => {
    intro.style.display = "none";

    const myDialog = new DialogSystem();

    // Basic dialog setup
    myDialog.dialogBoxInstance.setColor("#222530cc");
    myDialog.dialog.style.color = "#ffffff";

    // Add background & character images
    myDialog.imgContainer.addImg("background", "sunset.jpg");
    myDialog.imgContainer.setAppearance("background", {
        left: 0,
        top: 0,
        zIndex: 0,
        width: 1920,
        height: 1080
    });

    myDialog.imgContainer.addImg("character", "bocchi.jpg");
    myDialog.imgContainer.setAppearance("character", {
        left: 760,
        top: 180,
        zIndex: 1,
        width: 400,
        height: 600
    });

    // Add and play background music with fade-in
    myDialog.audContainer.addAudio("bgm", "Music.mp3", { loop: true });
    myDialog.audContainer.audPlay("bgm", 0, 2000);

    const storyLines = await loadStoryLines("demo.txt");

    myDialog.show();
    myDialog.setSpeaker("Guide");
    await myDialog.showStory([
        "Welcome to DialogJS! Click the box or press Space/Enter to advance.",
        "If text is still typing, clicking or pressing Space completes the line immediately."
    ]);

    const playerName = await myDialog.dialogBoxInstance.getMessage("What's your name?");
    myDialog.setSpeaker(playerName.trim() || "Traveler");

    await myDialog.showStory([
        `Nice to meet you, ${myDialog.speaker}!`,
        "Press L at any time to review the dialog history log."
    ]);

    // Player choices
    myDialog.btnContainer.addButton("choice1", "Move Left & Zoom In");
    myDialog.btnContainer.addButton("choice2", "Move Right & Spin");
    await myDialog.showStory("Please make a choice.");
    const choice = await myDialog.btnContainer.showButton();
    await myDialog.showStory(`You selected ${choice}.`);

    // Animate character concurrently without clobbering transforms
    if (choice === "choice1") {
        myDialog.imgContainer.move("character", -250, 0, 1, "easeOut");
        myDialog.imgContainer.scale("character", 1.15, 1.15, 1, "easeOut");
        await myDialog.showStory("Character moved left and scaled smoothly.");
    } else {
        myDialog.imgContainer.move("character", 250, 0, 1, "easeOut");
        myDialog.imgContainer.rotate("character", 360, 1, "easeInOut");
        await myDialog.showStory("Character moved right and rotated smoothly.");
    }

    // Load a specific "break"-delimited segment from demo.txt
    await myDialog.showStory('Reading part 2 from "demo.txt"...');
    await myDialog.showStory(storyLines, 1);

    await myDialog.showStory("Demo complete! Advance to fade out music and return to the title screen.");
    await myDialog.audContainer.audStop("bgm", 1000);
    myDialog.destroy();
    intro.style.display = "";
});
