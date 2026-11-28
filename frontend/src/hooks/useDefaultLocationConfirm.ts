import { useCallback, useRef, useState } from 'react';
import inventoryService from '../services/inventoryService';

export interface DefaultLocationConfirmState {
    partNumber: string;
    location: string;
}

/**
 * 入庫時の「デフォルト入庫棚番に登録するか」の確認(PC・モバイルの入庫画面で共通)。
 * confirm() は、確認が不要なら false、確認したら true(登録して入庫)/ false(登録しないで入庫)/
 * null(入庫を取りやめる: ×・Esc・キャンセル)を返す。画面は pending があれば確認を表示し、answer() で答える。
 */
export const useDefaultLocationConfirm = () => {
    const [pending, setPending] = useState<DefaultLocationConfirmState | null>(null);
    const resolver = useRef<((value: boolean | null) => void) | null>(null);

    const confirm = useCallback(async (
        order: { part_number?: string | null; item_default_location?: string | null },
        location: string,
    ): Promise<boolean | null> => {
        if (!(await inventoryService.shouldConfirmRegisterDefaultLocation(order, location))) return false;
        return new Promise<boolean | null>(resolve => {
            resolver.current = resolve;
            setPending({ partNumber: order.part_number ?? '', location });
        });
    }, []);

    const answer = useCallback((value: boolean | null) => {
        resolver.current?.(value);
        resolver.current = null;
        setPending(null);
    }, []);

    return { pending, confirm, answer };
};
