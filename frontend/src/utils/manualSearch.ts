import { TERM_DEFAULTS, getTerms, type TermKey } from './terms';

/**
 * 使い方ガイドの検索用ユーティリティ。
 * - 全角/半角・大文字/小文字・カタカナ/ひらがなの違いを無視して一致させる
 * - 意味の近い単語(同義語)も検索にかかるようにする
 * 正規化は1文字ずつ行い文字数を変えないので、一致位置を元の文字列にそのまま当てはめてハイライトできる。
 */

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;

export const normalize = (text: string): string => {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    const nfkc = c.normalize('NFKC');
    if (nfkc.length === 1) c = nfkc;
    c = c.toLowerCase().length === 1 ? c.toLowerCase() : c;
    const code = c.charCodeAt(0);
    if (code >= KATAKANA_START && code <= KATAKANA_END) c = String.fromCharCode(code - 0x60);
    out += c;
  }
  return out;
};

/** 意味の近い単語のグループ。同じグループの単語はどれで検索しても互いにヒットする。 */
const BASE_SYNONYM_GROUPS: string[][] = [
  ['部品', '材料', '資材', '部材', '原材料', 'パーツ'],
  ['ピッキング', '払出', '払い出し', '引当', '引き当て', '取り出し'],
  ['出庫', '出荷', '発送', '払出', '払い出し'],
  ['入庫', '入荷', '受入', '受け入れ', '納品', '検収'],
  ['在庫', 'ストック'],
  ['製品', '完成品', '成品'],
  ['倉庫', 'ウェアハウス', '保管庫'],
  ['棚番', 'ロケーション', '置き場', '棚'],
  ['発注', '注文', '購買', '調達'],
  ['受注', '注文', 'オーダー'],
  ['品番', '品目', 'アイテム', '型番', '部品番号'],
  ['生産計画', '製造計画', '生産予定'],
  ['作業指示', '製造指示', '指図', '作業票'],
  ['不良', '不具合', '不適合', 'ng'],
  ['パスワード', '暗証番号'],
  ['ログイン', 'サインイン', 'ログオン'],
  ['ログアウト', 'サインアウト'],
  ['削除', '消す', '取消', '取り消し', 'キャンセル'],
  ['登録', '追加', '新規', '作成'],
  ['変更', '編集', '修正', '更新'],
  ['検索', '探す', '絞り込み', '絞込'],
  ['取込', 'インポート', 'アップロード', '読込', '読み込み'],
  ['出力', 'エクスポート', 'ダウンロード', 'csv'],
  ['スマホ', 'スマートフォン', 'モバイル', '携帯'],
  ['qr', 'バーコード', '二次元コード', 'qrコード'],
  ['設備', '機械', '装置', 'マシン'],
  ['品質', '検査', 'qc'],
  ['管理者', 'アドミン', 'システム管理者'],
  ['ユーザー', '利用者', 'アカウント', '担当者'],
  ['履歴', '記録', '実績'],
  ['予定', 'スケジュール', '計画'],
  ['数量', '個数', '本数'],
  ['納期', '期限', '期日'],
  ['仕入先', 'サプライヤー', '購入先'],
  ['得意先', '顧客', 'お客様', '納品先'],
  ['工程', 'ライン', 'ステップ'],
  ['設定', 'コンフィグ', '環境設定'],
  ['印刷', 'プリント', 'ラベル'],
  ['棚卸', '実棚', '在庫調整'],
];

/** 管理者が変更した呼び方(例: 部品→材料)も、元の呼び方と同じグループの同義語として扱う。 */
const synonymGroups = (): string[][] => {
  const terms = getTerms();
  const keys = Object.keys(TERM_DEFAULTS) as TermKey[];
  return BASE_SYNONYM_GROUPS.map((group) => {
    const extra = keys.filter((k) => group.includes(TERM_DEFAULTS[k])).map((k) => terms[k]);
    return extra.length ? [...group, ...extra] : group;
  });
};

/** 検索語1つ分: いずれかに一致すればよい表記の候補(正規化済み)。 */
export type QueryToken = string[];

/** 入力を空白で区切って語に分け、各語を同義語に展開する。全ての語に一致するものが検索結果になる(AND)。 */
export const buildQuery = (raw: string): QueryToken[] => {
  const groups = synonymGroups().map((g) => g.map(normalize));
  return normalize(raw)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const variants = new Set<string>([token]);
      for (const group of groups) {
        const hit = group.some((w) => (w.length >= 2 && token.includes(w)) || (token.length >= 2 && w.includes(token)) || w === token);
        if (hit) group.forEach((w) => variants.add(w));
      }
      return [...variants];
    });
};

export const matchesQuery = (normalizedText: string, query: QueryToken[]): boolean =>
  query.every((token) => token.some((v) => normalizedText.includes(v)));

/** text のうち、検索語(同義語を含む)に一致した範囲 [start, end) を、重なりを統合して返す。 */
export const findRanges = (text: string, query: QueryToken[]): [number, number][] => {
  const norm = normalize(text);
  const ranges: [number, number][] = [];
  for (const token of query) {
    for (const v of token) {
      if (!v) continue;
      let from = 0;
      for (;;) {
        const at = norm.indexOf(v, from);
        if (at < 0) break;
        ranges.push([at, at + v.length]);
        from = at + v.length;
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
};
