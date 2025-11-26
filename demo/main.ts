import { parseWebm } from '../src/index';

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const recordingStatus = document.getElementById('recordingStatus') as HTMLDivElement;
const audioPreview = document.getElementById('audioPreview') as HTMLAudioElement;
const downloadLinkContainer = document.getElementById('downloadLinkContainer') as HTMLDivElement;
const recorderMetadata = document.getElementById('recorderMetadata') as HTMLPreElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const fileMetadata = document.getElementById('fileMetadata') as HTMLPreElement;

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

// Recorder Logic
startBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      audioPreview.src = url;
      
      // Create download link
      downloadLinkContainer.innerHTML = '';
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      a.textContent = 'Download Recording';
      a.className = 'download-link';
      downloadLinkContainer.appendChild(a);

      // Parse metadata
      try {
        const metadata = await parseWebm(blob);
        recorderMetadata.textContent = JSON.stringify(metadata, null, 2);
      } catch (err) {
        recorderMetadata.textContent = `Error parsing metadata: ${err}`;
      }

      chunks = [];
      recordingStatus.textContent = 'Ready';
      startBtn.disabled = false;
      stopBtn.disabled = true;
    };

    mediaRecorder.start();
    recordingStatus.textContent = 'Recording...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } catch (err) {
    console.error('Error accessing microphone:', err);
    recordingStatus.textContent = 'Error accessing microphone';
  }
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
});

// File Analyzer Logic
fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  fileMetadata.textContent = 'Parsing...';

  try {
    const metadata = await parseWebm(file);
    fileMetadata.textContent = JSON.stringify(metadata, null, 2);
  } catch (err) {
    fileMetadata.textContent = `Error parsing metadata: ${err}`;
  }
});
