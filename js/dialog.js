// Constants
const dialog = document.getElementById('dialog');
const background = document.getElementById('bg');
const startButton = document.getElementById('startbutton');
var audios = {};
var imgs = {};

class DialogSystem {
    constructor() {
        this.lineNum = 0;
        this.isLocked = true;
        this.text = []; // 清空初始對話

        // 讀取txt檔案
        fetch('story.txt')
            .then(response => response.text())
            .then(data => {
                // 將文字分割成行
                this.text = data.split('\n').filter(line => line.trim() !== '');
                // 開始顯示第一行
                this.showWords(this.lineNum);
            })
            .catch(error => console.error('Error loading story:', error));

        dialog.addEventListener('click', () => {
            if (!this.isLocked && this.lineNum < this.text.length) {
                this.isLocked = true;
                this.showWords(this.lineNum);
            }
        });
    }

    // Show words individually
    async showWords(num) {
        let words = this.text[num].split(""),
            display = "",
            isLock = false,
            bracketContent = "";

        for (let word of words) {
            if (word == "[") {
                isLock = true;
                bracketContent = "";
                continue;
            } else if (isLock) {
                if (word == "]") {
                    isLock = false;
                    word = this.commandHandler(bracketContent);
                } else {
                    bracketContent += word;
                    continue;
                }
            }
            display += word;
            await new Promise(r => setTimeout(r, 10));
            dialog.getElementsByTagName("p")[0].innerHTML = display;
        }
        this.isLocked = false;
        this.lineNum += 1;
    }

    // Handle [] commands
    commandHandler(com) {
        let params = com.split(" ");
        switch (params[0]) {
            case 'show':
                // [show]
                dialog.style.display = 'initial';
                break;
            case 'hide':
                // [hide]
                dialog.style.display = 'none';
                break;
            case 'n':
                // [newline]
                return '<br>';
            case 'bg':
                // background src object-fit
                if (params[1] == 0) {
                    background.style.visibility = 'hidden';
                } else {
                    background.src = 'background/' + params[1] + '.jpg';
                    background.style.visibility = 'visible';
                    background.style.objectFit = params[2];
                }
                break;
            case 'img':
                // [img name src x y z width height show]
                let img = imgs[params[1]] ? imgs[params[1]] : document.createElement('img');
                // 創建圖片元素
                document.getElementById("imgfile").appendChild(img);
                img.src = "image/" + params[2] + ".jpg";
                // Set image styles (1920x1080 grid)
                Object.assign(img.style, {
                    left: parseFloat(params[3]) / 1920 * 100 + '%',
                    top: parseFloat(params[4]) / 1080 * 100 + '%',
                    width: parseFloat(params[6]) / 1920 * 100 + '%',
                    height: parseFloat(params[7]) / 1080 * 100 + '%'
                });
                img.style.zIndex = parseFloat(params[5]);
                imgs[params[1]] = img; // 將圖片元素和參數存入字典
                if (params[8] == '0') {
                    imgs[params[1]].style.display = "none";
                } else {
                    img.style.display = "initial" // 開始顯示圖片
                }
                break;
            case 'audio':
                // [audio name src play time(s) fade(ms)]
                if (params[3] == 'play') {
                    let audio = document.createElement('audio'); // 創建音頻元素
                    document.getElementById("audiofile").appendChild(audio);
                    audio.src = "background/" + params[2] + ".mp3";
                    audio.play(); // 開始播放音頻
                    audios[params[1]] = audio; // 將音頻元素和參數存入字典
                    if (params[4] != 0) {
                        setInterval(() => { audios[params[1]].pause(); }, parseInt(params[4]) * 1000)
                    }
                    if (params[5] != 0) {
                        let volumeIncrement = parseInt(params[5])/100;
                        audios[params[1]].volume = 0;
                        for (let i = 0; i < 100; i++) {
                            setTimeout(() => {
                                audios[params[1]].volume += 0.01;
                            }, i*volumeIncrement);
                        }
                    }
                } else {
                    if (params[5] != 0) {
                        let volumeIncrement = parseInt(params[5])/100;
                        audios[params[1]].volume = 1;
                        for (let i = 0; i < 100; i++) {
                            setTimeout(() => {
                                audios[params[1]].volume -= 0.01;
                            }, i*volumeIncrement);
                        }
                        setInterval(()=>{audios[params[2]].pause();},parseInt(params[5]))
                    }else{
                        audios[params[2]].pause(); 
                    }

                }
                break;
            case 'effect':
                // [effect]
                break;
        }
        return "";
    }
}

// Event listeners
window.onload = () => {
    dialog.style.display = 'none';
    background.src = "background/resize.png";
}
startButton.onclick = () => {
    dialog.style.display = 'initial';
    background.style.visibility = "hidden";
    background.src = "";
    startButton.style.display = 'none';
    const dialogSystem = new DialogSystem();
}