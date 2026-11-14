import { useEffect, useRef, type RefObject } from 'react';
import { BrowserMultiFormatReader, DecodeHintType, NotFoundException } from '@zxing/library';

// WASM 版の BarcodeDetector 互換 API(barcode-detector)を扱うための最小限の型
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
// detect() がこの時間内に返らない場合は固まったとみなし ZXing(JS) に切り替える。
// WASM は初回にモジュールを読み込むため長めにしてある
const WASM_DETECT_TIMEOUT_MS = 10000;
// canvas 経由で検出するときの長辺の上限(処理負荷を抑える)
const MAX_CANVAS_LONG_SIDE = 1280;
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

/**
 * カメラでQR/バーコードを読み取るフック。
 * WASM(ZXing-C++)で読み取り、使えない場合のみ ZXing(JS) にフォールバックする。
 */
export function useQrScanner({ isOpen, videoRef, onResult, onError }: UseQrScannerOptions): void {
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
      stopCamera();
      onResultRef.current(text);
    };
    const fail = (err: unknown) => {
      if (cancelled) return;
      cancelled = true;
      stopCamera();
      onErrorRef.current(err);
    };

    const startZxing = async () => {
      // TRY_HARDER は1フレームの処理が非常に重く、画面が固まる・読み取れなくなる原因になるため使わない。
      // 文字コード(UTF-8 / Shift_JIS)は CHARACTER_SET を固定せず ZXing の自動判定に任せる。
      const hints = new Map<DecodeHintType, unknown>();
      zxingReader = new BrowserMultiFormatReader(hints, ZXING_SCAN_INTERVAL_MS);
      await zxingReader.decodeFromConstraints(VIDEO_CONSTRAINTS, video, (result, error) => {
        if (cancelled) return;
        if (result) {
          finish(result.getText());
        } else if (error && !(error instanceof NotFoundException)) {
          fail(error);
        }
      });
      // 起動待ちの間に閉じられた場合、後から開始されたカメラが残らないよう止め直す
      if (cancelled) stopCamera();
    };

    // BarcodeDetector 互換の WASM(ZXing-C++)検出器でスキャンする。
    // 使えなくなった場合は onUnusable で次の方式へ切り替える。
    const startDetector = async (
      Detector: BarcodeDetectorConstructor,
      onUnusable: () => void,
    ) => {
      const label = 'WASM(ZXing-C++)';
      const formats = await Detector.getSupportedFormats();
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
      if (cancelled) {
        stopCamera();
        return;
      }

      // video 要素を直接 detect() に渡すと InvalidStateError になる端末があるため、
      // canvas に描画(縮小して処理負荷を抑える)してから渡す。
      let consecutiveErrors = 0;
      let canvas: HTMLCanvasElement | null = null;
      const detectFrame = () => {
        if (!canvas) canvas = document.createElement('canvas');
        const scale = Math.min(1, MAX_CANVAS_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        canvas.getContext('2d', { willReadFrequently: true })?.drawImage(video, 0, 0, w, h);
        return detector.detect(canvas);
      };

      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= 2) {
            const codes = await withTimeout(detectFrame(), WASM_DETECT_TIMEOUT_MS);
            consecutiveErrors = 0;
            const hit = codes.find(c => c.rawValue);
            if (hit) {
              finish(hit.rawValue);
              return;
            }
          }
        } catch (e) {
          if (cancelled) return;
          const giveUp = () => {
            console.warn(`${label} が使えないため別の方式に切り替えます`, e);
            stopCamera();
            onUnusable();
          };
          if (e instanceof DetectTimeoutError) {
            giveUp();
            return;
          }
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_DETECT_ERRORS) {
            giveUp();
            return;
          }
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    };

    const startWasm = async () => {
      try {
        const { WasmBarcodeDetector } = await import('../utils/zxingWasmDetector');
        if (cancelled) return;
        await startDetector(
          WasmBarcodeDetector as unknown as BarcodeDetectorConstructor,
          () => {
            startZxing().catch(fail);
          },
        );
      } catch (err) {
        if (cancelled) return;
        if (isCameraError(err)) throw err;
        console.warn('WASM での起動に失敗したため ZXing(JS) にフォールバックします', err);
        stopCamera();
        await startZxing();
      }
    };

    const isCameraError = (err: unknown) =>
      err instanceof DOMException &&
      ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'SecurityError'].includes(err.name);

    const start = async () => {
      // 端末標準の BarcodeDetector は Android Chrome で使えなくなることがあるため使わず、
      // WASM(ZXing-C++)を使う。失敗した場合のみ ZXing(JS) にフォールバックする。
      await startWasm();
    };

    start().catch(fail);

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, videoRef]);

}
