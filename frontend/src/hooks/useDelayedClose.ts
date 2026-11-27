import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 処理が成功したあと、完了メッセージを見せてから少し待ってモーダルを閉じるための共通フック。
 *
 * - 閉じるまでの待ち時間中は closing が true になる。送信ボタンを closing の間も無効にして、二重に処理させない
 * - 手動で閉じた・別のデータで開き直した・画面を離れた場合は cancel()(またはアンマウント)で予約を取り消し、
 *   前回の予約で開き直したモーダルが勝手に閉じないようにする
 */
export const useDelayedClose = () => {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [closing, setClosing] = useState(false);

    const cancel = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        setClosing(false);
    }, []);

    const schedule = useCallback((action: () => void, delayMs: number) => {
        if (timer.current) clearTimeout(timer.current);
        setClosing(true);
        timer.current = setTimeout(() => {
            timer.current = null;
            setClosing(false);
            action();
        }, delayMs);
    }, []);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    return { schedule, cancel, closing };
};
