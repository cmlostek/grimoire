import { create } from 'zustand';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Module-level so the recognition session survives route changes
let _recog: SpeechRecognitionLike | null = null;
let _timer: ReturnType<typeof setTimeout> | null = null;
let _fails = 0;

type RecordingState = {
  isRecording: boolean;
  finalText: string;
  interim: string;
  startedAt: string | null;
  error: string | null;
  supported: boolean;
  start(): void;
  stop(): void;
  reset(): void;
};

export const useRecording = create<RecordingState>((set, get) => {
  function spawn(Ctor: new () => SpeechRecognitionLike) {
    if (!get().isRecording) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      _fails = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          set((s) => ({ finalText: s.finalText + (s.finalText ? ' ' : '') + text.trim() }));
        } else {
          interim += text;
        }
      }
      set({ interim });
    };
    rec.onerror = (e: any) => {
      const code: string = e?.error ?? 'error';
      if (code === 'network') {
        _fails++;
        if (_fails >= 4) {
          set({ error: 'Unable to reach the speech recognition service. This requires Chrome with a stable internet connection.', isRecording: false, interim: '' });
        }
        return;
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        set({ error: 'Microphone access denied. Allow microphone in your browser settings and try again.', isRecording: false, interim: '' });
        return;
      }
      set({ error: `Speech error: ${code}` });
    };
    rec.onend = () => {
      if (_recog !== rec || !get().isRecording) return;
      _recog = null;
      const delay = _fails > 0 ? Math.min(500 * _fails, 3000) : 100;
      _timer = setTimeout(() => spawn(Ctor), delay);
    };
    _recog = rec;
    try {
      rec.start();
    } catch {
      _recog = null;
      _timer = setTimeout(() => spawn(Ctor), 500);
    }
  }

  const supported = typeof window !== 'undefined' &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);

  return {
    isRecording: false,
    finalText: '',
    interim: '',
    startedAt: null,
    error: null,
    supported,
    start() {
      const Ctor = getCtor();
      if (!Ctor) return;
      _fails = 0;
      set({ isRecording: true, startedAt: new Date().toISOString(), error: null });
      spawn(Ctor);
    },
    stop() {
      if (_timer) { clearTimeout(_timer); _timer = null; }
      const rec = _recog;
      _recog = null;
      set({ isRecording: false, interim: '' });
      if (rec) try { rec.stop(); } catch { /* ignore */ }
    },
    reset() {
      set({ finalText: '', interim: '', startedAt: null, error: null });
    },
  };
});
