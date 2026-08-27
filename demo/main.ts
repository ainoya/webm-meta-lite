import { parseWebm } from '../src/index';
import type { DurationSource, WebmMeta } from '../src/types';

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const recordingStatus = document.getElementById('recordingStatus') as HTMLDivElement;
const audioPreview = document.getElementById('audioPreview') as HTMLAudioElement;
const downloadLinkContainer = document.getElementById('downloadLinkContainer') as HTMLDivElement;
const recorderMetadata = document.getElementById('recorderMetadata') as HTMLPreElement;
const recorderDurationSource = document.getElementById('recorderDurationSource') as HTMLDivElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const fileMetadata = document.getElementById('fileMetadata') as HTMLPreElement;
const fileDurationSource = document.getElementById('fileDurationSource') as HTMLDivElement;

// How each duration resolution method is presented in the UI.
const DURATION_SOURCE_LABELS: Record<DurationSource, { readonly method: string; readonly accuracy: string; readonly note: string }> = {
  header: {
    method: 'Header',
    accuracy: 'exact',
    note: 'read from the Duration element of the file header',
  },
  cues: {
    method: 'Cues',
    accuracy: 'estimated',
    note: 'derived from the last entry of the Cues index',
  },
  tail: {
    method: 'Tail scan',
    accuracy: 'estimated',
    note: 'derived from the last Cluster/Block timecode found at the end of the file',
  },
};

// Renders which of the three methods resolved the duration. Every other field of the
// result is reported as stored in the file, so only this one needs an explanation.
const renderDurationSource = (element: HTMLDivElement, metadata: WebmMeta): void => {
  const source = metadata.durationSource;
  if (source === undefined) {
    element.className = 'duration-source unresolved';
    element.textContent = 'Duration: not resolved — none of the three methods (Header, Cues, Tail) found a value.';
    return;
  }

  const { method, accuracy, note } = DURATION_SOURCE_LABELS[source];
  element.className = `duration-source ${accuracy}`;
  element.textContent = `Duration resolved by: ${method} (${accuracy}) — ${note}. All other fields below are read from the file as-is.`;
};

const renderMetadata = (metadataElement: HTMLPreElement, sourceElement: HTMLDivElement, metadata: WebmMeta): void => {
  metadataElement.textContent = JSON.stringify(metadata, null, 2);
  renderDurationSource(sourceElement, metadata);
};

// Shows a plain message (progress or error) in place of a parse result.
const renderMessage = (metadataElement: HTMLPreElement, sourceElement: HTMLDivElement, message: string): void => {
  metadataElement.textContent = message;
  sourceElement.className = 'duration-source';
  sourceElement.textContent = '';
};

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
        renderMetadata(recorderMetadata, recorderDurationSource, metadata);
      } catch (err) {
        renderMessage(recorderMetadata, recorderDurationSource, `Error parsing metadata: ${err}`);
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

  renderMessage(fileMetadata, fileDurationSource, 'Parsing...');

  try {
    const metadata = await parseWebm(file);
    renderMetadata(fileMetadata, fileDurationSource, metadata);
  } catch (err) {
    renderMessage(fileMetadata, fileDurationSource, `Error parsing metadata: ${err}`);
  }
});
