import { useEffect, useState } from 'react';
import stockPurposeService, { StockPurpose } from '../services/stockPurposeService';

/** 入庫画面の用途選択肢(有効な用途のみ)。取得に失敗した場合は空(=汎用のみ選択可)にする。 */
export const useStockPurposes = () => {
    const [purposes, setPurposes] = useState<StockPurpose[]>([]);
    useEffect(() => {
        stockPurposeService.getPurposes(true).then(setPurposes).catch(() => setPurposes([]));
    }, []);
    return purposes;
};
