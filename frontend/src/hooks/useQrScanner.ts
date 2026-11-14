import { useEffect, useRef, type RefObject } from 'react';
import { BrowserMultiFormatReader, DecodeHintType, NotFoundException } from '@zxing/library';

// BarcodeDetector は TypeScript の標準 lib にまだ含まれていないため最小限だけ宣言する
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

const SCAN_INTERVAL_MS = 120;
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

/**
 * カメラでQR/バーコードを読み取るフック。
 * BarcodeDetector(端末ネイティブ実装)が使えればそれを優先し、
 * 使えなければ ZXing にフォールバックする。
 */
export function useQrScanner({ isOpen, videoRef, onResult, onError }: UseQrScannerOptions) {
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

    const startNative = async (Detector: BarcodeDetectorConstructor) => {
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

      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= 2) {
            const codes = await withTimeout(detector.detect(video), DETECT_TIMEOUT_MS);
            const hit = codes.find(c => c.rawValue);
            if (hit) {
              finish(hit.rawValue);
              return;
            }
          }
        } catch (e) {
          if (e instanceof DetectTimeoutError) {
            if (cancelled) return;
            console.warn('BarcodeDetector が応答しないため ZXing に切り替えます');
            stopCamera();
            startZxing().catch(fail);
            return;
          }
          // 1フレームの検出失敗は無視して次のフレームへ
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    };

    const start = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
        .BarcodeDetector;
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
          console.warn('BarcodeDetector での起動に失敗したため ZXing にフォールバックします', err);
          stopCamera();
        }
      }
      if (!cancelled) await startZxing();
    };

    start().catch(fail);

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, videoRef]);
}
