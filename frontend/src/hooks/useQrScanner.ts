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

    const finish = (text: string) => {
      if (cancelled) return;
      cancelled = true;
      onResultRef.current(text);
    };
    const fail = (err: unknown) => {
      if (cancelled) return;
      cancelled = true;
      onErrorRef.current(err);
    };

    const startZxing = async () => {
      // TRY_HARDER: 処理は重くなるが、高密度・小さいQRの認識率が上がる。
      // 文字コード(UTF-8 / Shift_JIS)は CHARACTER_SET を固定せず ZXing の自動判定に任せる。
      const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);
      zxingReader = new BrowserMultiFormatReader(hints, ZXING_SCAN_INTERVAL_MS);
      await zxingReader.decodeFromConstraints(VIDEO_CONSTRAINTS, video, (result, error) => {
        if (cancelled) return;
        if (result) {
          finish(result.getText());
        } else if (error && !(error instanceof NotFoundException)) {
          fail(error);
        }
      });
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

      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (codes.length > 0 && codes[0].rawValue) {
              finish(codes[0].rawValue);
              return;
            }
          }
        } catch {
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
          if (stream) {
            (stream as MediaStream).getTracks().forEach(t => t.stop());
            stream = null;
          }
        }
      }
      if (!cancelled) await startZxing();
    };

    start().catch(fail);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (zxingReader) zxingReader.reset();
      if (stream) stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    };
  }, [isOpen, videoRef]);
}
