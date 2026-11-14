import { useEffect, useRef, useState, type RefObject } from 'react';
import { BrowserMultiFormatReader, DecodeHintType, NotFoundException } from '@zxing/library';

// BarcodeDetector は TypeScript の標準 lib にまだ含まれていないため最小限だけ宣言する
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

const SCAN_INTERVAL_MS = 120;
// detect() が例外を返し続ける場合に ZXing へ切り替えるまでの連続失敗回数(約4秒分)
const MAX_CONSECUTIVE_DETECT_ERRORS = 30;
// detect() がこの時間内に返らない場合は固まったとみなし ZXing に切り替える
const DETECT_TIMEOUT_MS = 2000;
class DetectTimeoutError extends Error {}
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new DetectTimeoutError('detect timeout')), ms);
    p.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
// ZXing のスキャン間隔(既定 500ms)。短くして取りこぼしを減らす
const ZXING_SCAN_INTERVAL_MS = 100;

// 高密度QR(日本語混じりの長文など)を読み取れるよう高解像度を要求する
const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
};

interface UseQrScannerOptions {
  /** true の間カメラを起動してスキャンする */
  isOpen: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** 読み取り成功時。呼び出し側でカメラを閉じること */
  onResult: (text: string) => void;
  /** カメラ起動失敗・読み取り異常時。呼び出し側でカメラを閉じること */
  onError: (err: unknown) => void;
}

/** 読み取りの状況(デバッグ表示用) */
export interface QrScannerStats {
  /** starting: 起動中 / native: BarcodeDetector / zxing: ZXing / error: 失敗 */
  engine: 'idle' | 'starting' | 'native' | 'zxing' | 'error';
  hasBarcodeDetector: boolean;
  formats: string;
  detectCalls: number;
  detectEmpty: number;
  detectErrors: number;
  /** video 要素を直接渡せず canvas 経由で検出しているか */
  canvasMode: boolean;
  detectTimeouts: number;
  detectLastMs: number;
  detectMaxMs: number;
  zxingCallbacks: number;
  zxingNotFound: number;
  video: string;
  track: string;
  elapsedMs: number;
  lastError: string;
  log: string[];
}

const initialStats = (): QrScannerStats => ({
  engine: 'idle',
  hasBarcodeDetector: false,
  formats: '-',
  detectCalls: 0,
  detectEmpty: 0,
  detectErrors: 0,
  canvasMode: false,
  detectTimeouts: 0,
  detectLastMs: 0,
  detectMaxMs: 0,
  zxingCallbacks: 0,
  zxingNotFound: 0,
  video: '-',
  track: '-',
  elapsedMs: 0,
  lastError: '',
  log: [],
});

/**
 * カメラでQR/バーコードを読み取るフック。
 * BarcodeDetector(端末ネイティブ実装)が使えればそれを優先し、
 * 使えなければ ZXing にフォールバックする。
 */
export function useQrScanner({ isOpen, videoRef, onResult, onError }: UseQrScannerOptions): QrScannerStats {
  const [stats, setStats] = useState<QrScannerStats>(initialStats);
  // コールバックは ref 経由で最新を参照し、effect の再実行を避ける
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    const video = videoRef.current;
    if (!isOpen || !video) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let zxingReader: BrowserMultiFormatReader | null = null;

    // デバッグ表示用の統計。毎フレーム再描画しないよう一定間隔で state に反映する
    const st = initialStats();
    st.engine = 'starting';
    const startedAt = performance.now();
    const note = (msg: string) => {
      st.log = [...st.log.slice(-5), `${((performance.now() - startedAt) / 1000).toFixed(1)}s ${msg}`];
    };
    const flush = () => {
      st.elapsedMs = Math.round(performance.now() - startedAt);
      st.video = `${video.videoWidth}x${video.videoHeight} rs=${video.readyState} ${video.paused ? 'paused' : 'playing'}`;
      const track = (video.srcObject instanceof MediaStream ? video.srcObject : stream)?.getVideoTracks()[0];
      if (track) {
        const t = track.getSettings();
        st.track = `${t.width ?? '?'}x${t.height ?? '?'}@${Math.round(t.frameRate ?? 0)} ${track.readyState}`;
      }
      setStats({ ...st });
    };
    flush();
    const statsTimer = setInterval(flush, 250);

    // カメラを確実に停止する。React の再描画(video 要素の破棄)に頼らず、結果確定時にも即座に呼ぶ
    const stopCamera = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        zxingReader?.reset();
      } catch {
        /* 無視 */
      }
      stream?.getTracks().forEach(t => t.stop());
      stream = null;
      const attached = video.srcObject;
      if (attached instanceof MediaStream) attached.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    };

    const finish = (text: string) => {
      if (cancelled) return;
      cancelled = true;
      note(`成功 ${text.length}文字`);
      flush();
      stopCamera();
      onResultRef.current(text);
    };
    const fail = (err: unknown) => {
      if (cancelled) return;
      cancelled = true;
      st.engine = 'error';
      st.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      note(`失敗 ${st.lastError}`);
      flush();
      stopCamera();
      onErrorRef.current(err);
    };

    const startZxing = async () => {
      // TRY_HARDER は1フレームの処理が非常に重く、画面が固まる・読み取れなくなる原因になるため使わない。
      // 文字コード(UTF-8 / Shift_JIS)は CHARACTER_SET を固定せず ZXing の自動判定に任せる。
      const hints = new Map<DecodeHintType, unknown>();
      zxingReader = new BrowserMultiFormatReader(hints, ZXING_SCAN_INTERVAL_MS);
      st.engine = 'zxing';
      note('ZXing 開始');
      await zxingReader.decodeFromConstraints(VIDEO_CONSTRAINTS, video, (result, error) => {
        if (cancelled) return;
        st.zxingCallbacks++;
        if (result) {
          finish(result.getText());
        } else if (error instanceof NotFoundException) {
          st.zxingNotFound++;
        } else if (error) {
          fail(error);
        }
      });
      // 起動待ちの間に閉じられた場合、後から開始されたカメラが残らないよう止め直す
      if (cancelled) stopCamera();
    };

    const startNative = async (Detector: BarcodeDetectorConstructor) => {
      const formats = await Detector.getSupportedFormats();
      st.formats = formats.join(',');
      note(`BarcodeDetector 対応形式 ${formats.length}件`);
      const detector = new Detector({ formats });

      stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
      if (cancelled) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      // 連続オートフォーカスを試みる(非対応端末では無視)
      try {
        const track = stream.getVideoTracks()[0];
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        });
      } catch {
        /* 非対応は無視 */
      }
      video.srcObject = stream;
      await video.play();
      st.engine = 'native';
      note('BarcodeDetector 開始');
      if (cancelled) {
        stopCamera();
        return;
      }

      // 一部の端末(Android Chrome など)では video 要素を直接 detect() に渡すと
      // InvalidStateError になるため、その場合は canvas に描画してから渡す
      let useCanvas = false;
      let consecutiveErrors = 0;
      let canvas: HTMLCanvasElement | null = null;
      const detectFrame = () => {
        if (!useCanvas) return detector.detect(video);
        if (!canvas) canvas = document.createElement('canvas');
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        return detector.detect(canvas);
      };

      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= 2) {
            const t0 = performance.now();
            const codes = await withTimeout(detectFrame(), DETECT_TIMEOUT_MS);
            consecutiveErrors = 0;
            st.detectLastMs = Math.round(performance.now() - t0);
            st.detectMaxMs = Math.max(st.detectMaxMs, st.detectLastMs);
            st.detectCalls++;
            if (codes.length === 0) st.detectEmpty++;
            const hit = codes.find(c => c.rawValue);
            if (hit) {
              finish(hit.rawValue);
              return;
            }
          }
        } catch (e) {
          if (cancelled) return;
          if (e instanceof DetectTimeoutError) {
            st.detectTimeouts++;
            note('detect() が応答せず ZXing へ切替');
            console.warn('BarcodeDetector が応答しないため ZXing に切り替えます');
            stopCamera();
            startZxing().catch(fail);
            return;
          }
          st.detectErrors++;
          st.lastError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          consecutiveErrors++;
          if (!useCanvas) {
            // 初回の例外では canvas 経由に切り替えて様子を見る
            useCanvas = true;
            st.canvasMode = true;
            note(`video直接のdetectが失敗 → canvas経由に切替 (${st.lastError})`);
          } else if (consecutiveErrors >= MAX_CONSECUTIVE_DETECT_ERRORS) {
            note('detect() が失敗し続けるため ZXing へ切替');
            console.warn('BarcodeDetector が失敗し続けるため ZXing に切り替えます', e);
            stopCamera();
            startZxing().catch(fail);
            return;
          }
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    };

    const start = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
        .BarcodeDetector;
      st.hasBarcodeDetector = !!Detector;
      note(Detector ? 'BarcodeDetector あり' : 'BarcodeDetector なし');
      if (Detector) {
        try {
          await startNative(Detector);
          return;
        } catch (err) {
          // カメラ権限拒否などは ZXing でも失敗するのでそのまま通知する
          if (
            err instanceof DOMException &&
            ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'SecurityError'].includes(err.name)
          ) {
            throw err;
          }
          st.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          note(`native 起動失敗 ${st.lastError}`);
          console.warn('BarcodeDetector での起動に失敗したため ZXing にフォールバックします', err);
          stopCamera();
        }
      }
      if (!cancelled) await startZxing();
    };

    start().catch(fail);

    return () => {
      cancelled = true;
      clearInterval(statsTimer);
      stopCamera();
    };
  }, [isOpen, videoRef]);

  return stats;
}
