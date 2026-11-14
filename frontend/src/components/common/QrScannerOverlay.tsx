import { useState, type RefObject } from 'react';
import type { QrScannerStats } from '../../hooks/useQrScanner';
import './QrScannerOverlay.css';

// 読み取り不具合の調査用。原因が分かったら false にするか、デバッグ表示を削除する
const SHOW_DEBUG = true;

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  stats: QrScannerStats;
  onClose: () => void;
  title?: string;
}

const engineLabel: Record<QrScannerStats['engine'], string> = {
  idle: '待機',
  starting: '起動中',
  native: 'BarcodeDetector',
  wasm: 'WASM',
  zxing: 'ZXing',
  error: 'エラー',
};

const debugText = (s: QrScannerStats) =>
  [
    `engine: ${engineLabel[s.engine]} (BarcodeDetector ${s.hasBarcodeDetector ? 'あり' : 'なし'})`,
    `経過: ${(s.elapsedMs / 1000).toFixed(1)}s`,
    `video: ${s.video}`,
    `track: ${s.track}`,
    `detect: ${s.detectCalls}回 空${s.detectEmpty} 例外${s.detectErrors} 無応答${s.detectTimeouts} canvas経由${s.canvasMode ? 'はい' : 'いいえ'}`,
    `detect時間: 直近${s.detectLastMs}ms 最大${s.detectMaxMs}ms`,
    `zxing: ${s.zxingCallbacks}回 未検出${s.zxingNotFound}`,
    `formats: ${s.formats}`,
    s.lastError && `lastError: ${s.lastError}`,
    ...s.log.map(l => `· ${l}`),
  ]
    .filter(Boolean)
    .join('\n');

/** カメラでQRコードを読み取る全画面ビュー */
const QrScannerOverlay = ({ videoRef, stats, onClose, title = 'QRコードを読み取り' }: Props) => {
  const [debugOpen, setDebugOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(debugText(stats));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応は無視 */
    }
  };

  return (
    <div className="qrscan" role="dialog" aria-modal="true" aria-label={title}>
      <video ref={videoRef} className="qrscan__video" muted playsInline />

      <div className="qrscan__top">
        <span className="qrscan__title">{title}</span>
        <button type="button" className="qrscan__close" onClick={onClose} aria-label="閉じる">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="qrscan__finder" aria-hidden="true">
        <span className="qrscan__corner qrscan__corner--tl" />
        <span className="qrscan__corner qrscan__corner--tr" />
        <span className="qrscan__corner qrscan__corner--bl" />
        <span className="qrscan__corner qrscan__corner--br" />
        <span className="qrscan__line" />
      </div>

      <p className="qrscan__hint">QRコードを枠の中に収めてください</p>

      {SHOW_DEBUG && (
        <div className="qrscan__debug">
          <div className="qrscan__debug-bar">
            <button type="button" onClick={() => setDebugOpen(o => !o)}>
              デバッグ {debugOpen ? '▼' : '▲'}
            </button>
            <span className={`qrscan__badge qrscan__badge--${stats.engine}`}>{engineLabel[stats.engine]}</span>
            <button type="button" onClick={copy}>{copied ? 'コピーしました' : 'コピー'}</button>
          </div>
          {debugOpen && <pre>{debugText(stats)}</pre>}
        </div>
      )}
    </div>
  );
};

export default QrScannerOverlay;
