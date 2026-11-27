import React, { useEffect, useRef, ReactNode } from 'react';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  /** 読み上げ用のダイアログ名(見出しが無いモーダル向け) */
  ariaLabel?: string;
}

/**
 * 画面共通の簡易モーダル。react-bootstrap の Modal と同じ振る舞いにそろえる。
 * - ダイアログとして読み上げられる(role="dialog" / aria-modal)
 * - Esc・背景のクリックで閉じる(モーダルの中で押して背景で離した場合は閉じない)
 * - 開いている間は背面のスクロールを止め、開いたときにモーダルへ、閉じたときに元の場所へフォーカスを戻す
 */
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, maxWidth, ariaLabel }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const pressStartedOnOverlay = useRef(false);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // モーダル自体へフォーカスする(Tab でモーダル内の項目へ進める。入力欄へ勝手に移すと既存の画面の操作が変わるため移さない)
    contentRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { pressStartedOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressStartedOnOverlay.current) onClose();
      }}
    >
      <div
        ref={contentRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        style={maxWidth ? { maxWidth } : {}}
      >
        <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close">
          &times;
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;
