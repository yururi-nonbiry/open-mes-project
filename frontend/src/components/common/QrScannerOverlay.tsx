import type { RefObject } from 'react';
import './QrScannerOverlay.css';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  onClose: () => void;
  title?: string;
}

/** カメラでQRコードを読み取る全画面ビュー */
const QrScannerOverlay = ({ videoRef, onClose, title = 'QRコードを読み取り' }: Props) => (
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
  </div>
);

export default QrScannerOverlay;
