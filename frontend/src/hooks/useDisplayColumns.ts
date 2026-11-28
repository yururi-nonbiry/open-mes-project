import { useEffect, useState } from 'react';
import authFetch from '../utils/api';
import type { DisplaySetting } from '../pages/types/listPage';

interface Options {
    /** 列名を上書きする {項目名: 列名}(画面の既定の列名など)。無ければ表示設定APIが返す項目名を使う */
    labels?: Map<string, string>;
    /** 検索欄に出さない項目(画面で別の入力欄を持つ項目など) */
    excludeFromSearch?: (fieldName: string) => boolean;
}

/**
 * 一覧画面の列と検索欄を、ページ項目表示設定(model-display-settings)から決める。
 * 画面を開いたときに1回だけ取得する(検索・ページ送りのたびに取得しない)。複数のデータ種別の設定は後のもので上書きする。
 * 列名は表示設定APIが返す項目名を使い、管理者専用の model-fields は呼ばない(一般ユーザーが呼ぶと403になるため)。
 * 設定が無い・取得できない場合は空の配列を返す(画面は既定の列を使う)。
 */
export const useDisplayColumns = (dataTypes: string[], options: Options = {}) => {
    const [displaySettings, setDisplaySettings] = useState<DisplaySetting[]>([]);
    const [searchFields, setSearchFields] = useState<DisplaySetting[]>([]);
    const key = dataTypes.join(',');
    const { labels, excludeFromSearch } = options;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const responses = await Promise.all(
                    key.split(',').map(type => authFetch(`/api/base/model-display-settings/?data_type=${type}`)),
                );
                const lists = await Promise.all(responses.map(res => (res.ok ? res.json() : Promise.resolve([]))));
                if (cancelled) return;
                const byName = new Map<string, DisplaySetting>();
                (lists as DisplaySetting[][]).flat().forEach(setting => {
                    byName.set(setting.model_field_name, {
                        ...setting,
                        verbose_name: labels?.get(setting.model_field_name) || setting.verbose_name || setting.model_field_name,
                    });
                });
                const settings = Array.from(byName.values());
                setDisplaySettings(settings
                    .filter(s => s.is_list_display)
                    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)));
                setSearchFields(settings
                    .filter(s => s.is_search_field && !excludeFromSearch?.(s.model_field_name))
                    .sort((a, b) => (a.search_order ?? 0) - (b.search_order ?? 0)));
            } catch (_err) {
                if (cancelled) return;
                setDisplaySettings([]);
                setSearchFields([]);
            }
        })();
        return () => { cancelled = true; };
        // labels・excludeFromSearch は画面の定数として渡す(変わらない)前提で、データ種別が変わったときだけ取り直す
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return { displaySettings, searchFields };
};
