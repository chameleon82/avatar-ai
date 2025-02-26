# avatar-ai
OpenAI Avatar for real-time api

## Play with Repo

Create `openai-key.js` with next content:

```js
const openaiApiKey = 'openai-api-key';
```



```js

const API_KEY = "your-openai-api-key";
const socket = new WebSocket("wss://api.openai.com/v1/realtime");

socket.onopen = () => {
    console.log("Connected to OpenAI WebSocket");

    // Send a message to OpenAI
    socket.send(JSON.stringify({
        "authorization": `Bearer ${API_KEY}`,
        "model": "gpt-4-turbo",
        "messages": [{ "role": "user", "content": "Hello, how are you?" }]
    }));
};

socket.onmessage = (event) => {
    const response = JSON.parse(event.data);
    console.log("AI Response:", response);
};

socket.onclose = () => console.log("Connection closed.");
socket.onerror = (error) => console.error("WebSocket Error:", error);




async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

        // Send this audioBlob to OpenAI (if they support direct audio input)
        console.log("Recorded Audio:", audioBlob);
    };

    mediaRecorder.start();

    setTimeout(() => {
        mediaRecorder.stop();
    }, 5000); // Record for 5 seconds
}



```


```html
<button id="toggleMic">Enable Microphone</button>
<audio id="audioPlayer" controls></audio>

<script>
const API_KEY = "your-openai-api-key";
const socket = new WebSocket("wss://api.openai.com/v1/realtime");
let mediaRecorder;
let isRecording = false;

async function toggleMicrophone() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);  // Send audio chunk to OpenAI
        }
    };

    mediaRecorder.start(500); // Send chunks every 500ms
    isRecording = true;
    document.getElementById("toggleMic").innerText = "Disable Microphone";
}

function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    document.getElementById("toggleMic").innerText = "Enable Microphone";
}

// WebSocket Handlers
socket.onopen = () => console.log("Connected to OpenAI WebSocket");
socket.onmessage = (event) => console.log("AI Response:", event.data);
socket.onclose = () => console.log("WebSocket closed.");
socket.onerror = (error) => console.error("WebSocket Error:", error);

document.getElementById("toggleMic").addEventListener("click", toggleMicrophone);
</script>

```