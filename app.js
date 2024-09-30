document.addEventListener('DOMContentLoaded', () => {
    // 音乐片段数据，将在用户上传音频后生成
    let segments = [];
    let puzzlePieces = [];
    let correctSequence = []; // 用于存储正确的片段顺序

    // 获取 DOM 元素
    const segmentButtonsContainer = document.querySelector('.segments-list');
    const puzzleBoard = document.querySelector('.puzzle-board');
    const playPuzzleButton = document.getElementById('play-puzzle');
    const resetPuzzleButton = document.getElementById('reset-puzzle');
    const audioFileInput = document.getElementById('audio-file-input');
    const processAudioButton = document.getElementById('process-audio');
    const segmentCountInput = document.getElementById('segment-count');

    // 当用户点击“处理音频并开始游戏”按钮时
    processAudioButton.addEventListener('click', () => {
        const file = audioFileInput.files[0];
        const segmentCount = parseInt(segmentCountInput.value);
        if (!file) {
            speak('请先选择一个音频文件');
            return;
        }
        if (isNaN(segmentCount) || segmentCount < 2 || segmentCount > 10) {
            speak('请指定一个有效的片段数量，2到10之间');
            return;
        }

        // 开始处理音频，使用语音提示
        speak('正在处理音频，请稍候');

        const reader = new FileReader();
        reader.onload = function(event) {
            const arrayBuffer = event.target.result;
            processAudio(arrayBuffer, segmentCount);
        };
        reader.readAsArrayBuffer(file);
    });

    // 定义 AudioContext
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();

    // 处理音频文件
    function processAudio(arrayBuffer, segmentCount) {
        audioContext.decodeAudioData(arrayBuffer, function(audioBuffer) {
            // 将音频分割成用户指定的段数
            const segmentDuration = audioBuffer.duration / segmentCount;

            const segmentBlobs = [];
            for (let i = 0; i < segmentCount; i++) {
                const startTime = i * segmentDuration;
                const endTime = (i + 1) * segmentDuration;

                // 提取音频片段
                const segmentBuffer = extractAudioSegment(audioBuffer, startTime, endTime);
                // 将 AudioBuffer 转换为 Blob
                const segmentBlob = bufferToWave(segmentBuffer, 0, segmentBuffer.length);
                segmentBlobs.push(segmentBlob);
            }

            // 将分割后的音频片段转换为 Audio 对象，供游戏使用
            segments = segmentBlobs.map((blob, index) => {
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                return {
                    id: index + 1, // 原始顺序的 ID
                    audio: audio,
                    isPlaying: false
                };
            });

            // 存储正确的片段顺序
            correctSequence = segments.map(segment => segment.id);

            // 打乱 segments 数组
            shuffleArray(segments);

            // 为打乱后的片段生成新的标签
            segments.forEach((segment, index) => {
                segment.label = `片段 ${index + 1}`; // 重新编号，与原始顺序无关
            });

            // 初始化游戏
            initializeGameWithSegments();

            // 处理完成，使用语音提示
            speak('音频处理完成，游戏开始');

        }, function(error) {
            console.error('音频解码失败：', error);
            speak('音频文件处理失败');
        });
    }

    // Fisher-Yates 洗牌算法
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // 提取音频片段
    function extractAudioSegment(audioBuffer, startTime, endTime) {
        const sampleRate = audioBuffer.sampleRate;
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.floor(endTime * sampleRate);
        const segmentDuration = endSample - startSample;

        // 为每个声道创建新缓冲区
        const numberOfChannels = audioBuffer.numberOfChannels;
        const segmentBuffer = audioContext.createBuffer(numberOfChannels, segmentDuration, sampleRate);

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel).slice(startSample, endSample);
            segmentBuffer.copyToChannel(channelData, channel, 0);
        }

        return segmentBuffer;
    }

    // 将 AudioBuffer 转换为 WAV 格式的 Blob
    function bufferToWave(abuffer, offset, len) {
        var numOfChan = abuffer.numberOfChannels,
            length = len * numOfChan * 2 + 44,
            buffer = new ArrayBuffer(length),
            view = new DataView(buffer),
            channels = [],
            i,
            sample,
            pos = 0;

        // 写入 WAV 文件头部
        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // 文件长度
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // 头部长度
        setUint16(1); // PCM 格式
        setUint16(numOfChan);
        setUint32(abuffer.sampleRate);
        setUint32(abuffer.sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2);
        setUint16(16);

        setUint32(0x61746164); // "data" chunk
        setUint32(length - pos - 4);

        // 写入音频数据
        for (i = 0; i < numOfChan; i++)
            channels.push(abuffer.getChannelData(i));

        while (pos < length) {
            for (i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset])); // 限制在 [-1, 1]
                sample = (sample * 32767) | 0; // 转换为 16 位整数
                view.setInt16(pos, sample, true); // 写入数据
                pos += 2;
            }
            offset++;
        }

        return new Blob([buffer], { type: 'audio/wav' });

        function setUint16(data) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    }

    // 初始化游戏界面，使用新的音频片段
    function initializeGameWithSegments() {
        // 清空之前的音乐片段按钮
        segmentButtonsContainer.innerHTML = '';

        // 为新的音频片段创建按钮
        segments.forEach(segment => {
            const button = document.createElement('button');
            button.classList.add('segment-button');
            button.setAttribute('data-segment', segment.id);
            button.textContent = segment.label;
            button.setAttribute('aria-label', `播放并选择${segment.label}`);

            // 添加点击事件
            button.addEventListener('click', () => {
                toggleSegmentPlayback(segment);
                addPieceToPuzzle(segment);
            });

            // 添加键盘事件
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSegmentPlayback(segment);
                    addPieceToPuzzle(segment);
                }
            });

            segmentButtonsContainer.appendChild(button);
        });

        // 清空拼图区域和拼图片段数组
        puzzleBoard.innerHTML = '';
        puzzlePieces = [];
    }

    // 播放/暂停音频片段
    function toggleSegmentPlayback(segment) {
        // 控制音频的播放和暂停
        if (segment.isPlaying) {
            segment.audio.pause();
            segment.isPlaying = false;
            speak(`${segment.label} 已暂停`);
        } else {
            // 停止其他正在播放的音频
            stopAllAudio();
            segment.audio.currentTime = 0;
            segment.audio.play();
            segment.isPlaying = true;
            speak(`正在播放${segment.label}`);
        }
    }

    // 停止所有音频播放
    function stopAllAudio() {
        segments.forEach(segment => {
            if (segment.audio) {
                segment.audio.pause();
                segment.isPlaying = false;
                segment.audio.currentTime = 0;
            }
        });
    }

    // 添加拼图片段到拼图区域
    function addPieceToPuzzle(segment) {
        // 检查是否已添加过
        if (puzzlePieces.includes(segment)) {
            speak(`${segment.label} 已在拼图中，不能重复添加`);
            return;
        }

        // 创建拼图片段的元素，使用 <button>
        const pieceElement = document.createElement('button');
        pieceElement.classList.add('puzzle-piece');
        pieceElement.setAttribute('data-segment', segment.id);
        pieceElement.textContent = segment.label;
        pieceElement.setAttribute('aria-label', `拼图片段：${segment.label}`);
        pieceElement.setAttribute('role', 'listitem');

        // 添加到拼图区域
        puzzleBoard.appendChild(pieceElement);

        // 更新拼图片段数组
        puzzlePieces.push(segment);

        // 添加语音反馈
        speak(`${segment.label} 已添加到拼图`);

        // 为拼图片段添加点击事件，控制播放和暂停
        pieceElement.addEventListener('click', () => {
            toggleSegmentPlayback(segment);
        });

        // 添加键盘事件
        pieceElement.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleSegmentPlayback(segment);
            }
        });

        // 将焦点设置到新添加的拼图片段
        pieceElement.focus();
    }

    // 移除拼图片段
    function removePieceFromPuzzle(pieceElement, segment) {
        // 从拼图区域移除元素
        puzzleBoard.removeChild(pieceElement);

        // 从拼图片段数组中移除对应的片段
        puzzlePieces = puzzlePieces.filter(s => s.id !== segment.id);

        // 停止音频播放
        if (segment.isPlaying) {
            segment.audio.pause();
            segment.isPlaying = false;
        }

        // 添加语音反馈
        speak(`${segment.label} 已从拼图中移除`);

        // 将焦点设置到拼图区域的下一个拼图片段，或返回到拼图区域
        const remainingPieces = puzzleBoard.querySelectorAll('.puzzle-piece');
        if (remainingPieces.length > 0) {
            remainingPieces[0].focus();
        } else {
            puzzleBoard.focus();
        }
    }

    // 为“播放拼图”按钮添加事件监听器
    playPuzzleButton.addEventListener('click', () => {
        if (puzzlePieces.length === 0) {
            speak('拼图为空，请先添加音乐片段');
            return;
        }

        // 依次播放拼图片段
        playPuzzlePieces(0);
    });

    // 添加键盘事件
    playPuzzleButton.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            playPuzzleButton.click();
        }
    });

    // 播放拼图片段并在完成后检查顺序
    function playPuzzlePieces(index) {
        if (index < puzzlePieces.length) {
            const segment = puzzlePieces[index];
            // 停止当前正在播放的音频
            stopAllAudio();

            segment.audio.currentTime = 0;
            segment.audio.play();
            segment.isPlaying = true;

            // 当当前片段播放结束后，播放下一个
            segment.audio.onended = () => {
                segment.isPlaying = false;
                playPuzzlePieces(index + 1);
            };
        } else {
            // 拼图播放完成
            speak('拼图播放完成');

            // 检查拼图是否正确
            checkPuzzleCorrectness();
        }
    }

    // 检查拼图是否正确
    function checkPuzzleCorrectness() {
        const userSequence = puzzlePieces.map(segment => segment.id);
        const isCorrect = arraysEqual(userSequence, correctSequence);

        if (isCorrect) {
            // 播放“恭喜，拼对了”的音频
            playCongratulationsAudio();
        } else {
            speak('拼图顺序不正确，请重试');
        }
    }

    // 判断两个数组是否相等
    function arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    // 播放“恭喜，拼对了”的音频
    function playCongratulationsAudio() {
        // 如果您有音频文件，可以使用以下代码
        // const congratsAudio = new Audio('audio/congrats.mp3');
        // congratsAudio.play();

        // 如果没有音频文件，可以使用语音合成
        speak('恭喜，拼对了');
    }

    // 为“重置拼图”按钮添加事件监听器
    resetPuzzleButton.addEventListener('click', () => {
        // 清空拼图区域
        puzzleBoard.innerHTML = '';

        // 清空拼图片段数组
        puzzlePieces = [];

        // 停止所有音频播放
        stopAllAudio();

        // 添加语音反馈
        speak('拼图已重置');
    });

    // 添加键盘事件
    resetPuzzleButton.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            resetPuzzleButton.click();
        }
    });

    // 语音反馈函数
    function speak(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        // 设置语言为中文
        utterance.lang = 'zh-CN';
        window.speechSynthesis.speak(utterance);
    }

    // 添加全局键盘事件监听器
    document.addEventListener('keydown', (event) => {
        // 检查是否在文本输入框中，以避免干扰输入
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            return;
        }

        // 自定义导航键
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            moveFocus('next');
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            moveFocus('previous');
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            // 如果焦点在拼图片段上，删除该拼图片段
            if (document.activeElement.classList.contains('puzzle-piece')) {
                event.preventDefault();
                const pieceElement = document.activeElement;
                const segmentId = parseInt(pieceElement.getAttribute('data-segment'));
                const segment = puzzlePieces.find(s => s.id === segmentId);
                if (segment) {
                    removePieceFromPuzzle(pieceElement, segment);
                }
            }
        } else if (event.key === ' ') {
            // 空格键停止所有音频
            event.preventDefault();
            stopAllAudio();
            speak('所有音频已停止');
        } else if (event.altKey && event.key === 'p') {
            // Alt + P 播放拼图
            event.preventDefault();
            playPuzzleButton.click();
        } else if (event.altKey && event.key === 'r') {
            // Alt + R 重置拼图
            event.preventDefault();
            resetPuzzleButton.click();
        } else if (event.altKey && event.key >= '1' && event.key <= '9') {
            // Alt + 1/2/3... 选择对应的音乐片段
            event.preventDefault();
            const index = parseInt(event.key) - 1;
            if (segments[index]) {
                toggleSegmentPlayback(segments[index]);
                addPieceToPuzzle(segments[index]);
            }
        }
    });

    function moveFocus(direction) {
        // 获取所有可聚焦的元素
        const focusableElements = Array.from(document.querySelectorAll('button, .puzzle-board[tabindex]'));

        // 过滤可见的元素
        const visibleFocusableElements = focusableElements.filter(elem => {
            return elem.offsetParent !== null;
        });

        const currentIndex = visibleFocusableElements.indexOf(document.activeElement);

        let nextIndex;

        if (direction === 'next') {
            nextIndex = (currentIndex + 1) % visibleFocusableElements.length;
        } else if (direction === 'previous') {
            nextIndex = (currentIndex - 1 + visibleFocusableElements.length) % visibleFocusableElements.length;
        }

        visibleFocusableElements[nextIndex].focus();
    }
});
