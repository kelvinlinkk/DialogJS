async function main() {
    const myDialog = new DialogSystem();
    
    // Basic dialog setup
    myDialog.dialogBoxInstance.setColor("#333333");
    myDialog.dialog.style.color = "#ffffff";
    
    // Add images
    const characterImg = myDialog.imgContainer.addImg("character", "bocchi.jpg");
    myDialog.imgContainer.setAppearance("character", {
        left: 960,    // center horizontally
        top: 540,     // center vertically
        zIndex: 1,
        width: 400,
        height: 600
    });
    
    // Add background
    const bgImg = myDialog.imgContainer.addImg("background", "sunset.jpg");
    myDialog.imgContainer.setAppearance("background", {
        left: 0,
        top: 0,
        zIndex: 0,
        width: 1920,
        height: 1080
    });
    
    // Add audio
    const bgm = myDialog.audContainer.addAudio("bgm", "Music.mp3");
    
    // Play background music with fade in
    myDialog.audContainer.audPlay("bgm", 0, 2000); // 0 for continuous play, 2s fade
    
    // Add choice buttons
    myDialog.btnContainer.addButton("demo.txt", "Go left");
    myDialog.btnContainer.addButton("none", "Go right");
    
    // Show dialog system
    myDialog.show();
    
    // Load and start story
    myDialog.loadStory("demo.txt");
    
    // Wait for player choice
    const choice = await myDialog.showButton();
    
    // Animate character based on choice
    if (choice === "choice1") {
        myDialog.imgContainer.move("character", -200, 0, 1); // move left
    } else {
        myDialog.imgContainer.move("character", 200, 0, 1); // move right
        myDialog.imgContainer.rotate("character", 360, 1); // spin
    }
    
    // Cleanup
    setTimeout(() => {
        myDialog.audContainer.audStop("bgm", 1000); // fade out BGM
        myDialog.hide();
    }, 5000);
}

main();