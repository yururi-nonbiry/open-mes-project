/**
 * 画面の用語の差し替え。
 * 文言は「部品」「ピッキング」「出庫」で書いておき、管理者が設定した呼び方(例: 材料)に置き換えて表示する。
 * 設定はAPI(/api/base/terminology/)から取得し、変更時は setTerms() で反映する。
 */
export type TermKey = 'part' | 'picking' | 'issue';
export type Terms = Record<TermKey, string>;

/** 文言を書くときの既定の語。設定がなければそのまま表示する。 */
export const TERM_DEFAULTS: Terms = { part: '部品', picking: 'ピッキング', issue: '出庫' };

let terms: Terms = { ...TERM_DEFAULTS };

export const getTerms = (): Terms => terms;

// 「入出庫」は入庫・出庫の総称として使うため、出庫の置き換え対象にしない
const TERM_PATTERN = /部品|ピッキング|(?<!入)出庫/g;
const KEY_BY_DEFAULT: Record<string, TermKey> = {
    [TERM_DEFAULTS.part]: 'part',
    [TERM_DEFAULTS.picking]: 'picking',
    [TERM_DEFAULTS.issue]: 'issue',
};

const isDefault = (): boolean => (Object.keys(TERM_DEFAULTS) as TermKey[]).every((k) => terms[k] === TERM_DEFAULTS[k]);

/** 既定の語で書いた文言を、設定された呼び方に置き換える(1回の走査で置き換える)。 */
export const t = (text: string): string =>
    isDefault() ? text : text.replace(TERM_PATTERN, (m) => terms[KEY_BY_DEFAULT[m]]);

type Plain = Record<string, unknown> | unknown[];
const isPlain = (v: unknown): v is Plain =>
    Array.isArray(v) || (typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype);

const cloneRaw = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(cloneRaw);
    if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneRaw(x)]));
    return v;
};

const applyInto = (target: unknown, raw: unknown): void => {
    if (Array.isArray(target) && Array.isArray(raw)) {
        raw.forEach((r, i) => {
            if (typeof r === 'string') target[i] = t(r);
            else applyInto(target[i], r);
        });
    } else if (isPlain(target) && isPlain(raw)) {
        const tObj = target as Record<string, unknown>;
        Object.entries(raw as Record<string, unknown>).forEach(([k, r]) => {
            if (typeof r === 'string') tObj[k] = t(r);
            else applyInto(tObj[k], r);
        });
    }
};

const registry: { target: unknown; raw: unknown }[] = [];

/**
 * モジュール定数(ナビ設定など)に含まれる文字列を、用語設定に合わせて書き換える対象として登録する。
 * 元の文言を保持し、設定が変わるたびにその場で再適用する(参照は変わらない)。
 */
export const registerTermTarget = <T>(target: T): T => {
    registry.push({ target, raw: cloneRaw(target) });
    applyInto(target, registry[registry.length - 1].raw);
    return target;
};

const listeners = new Set<() => void>();

/** 呼び方が変わったときの通知を受け取る(画面の描き直し用)。解除関数を返す。 */
export const onTermsChange = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** 呼び方を設定する。変わったときだけ true を返し、購読者へ通知する。 */
export const setTerms = (next: Partial<Terms>): boolean => {
    const merged: Terms = { ...terms };
    (Object.keys(TERM_DEFAULTS) as TermKey[]).forEach((k) => {
        const v = next[k]?.trim();
        merged[k] = v || terms[k];
    });
    if ((Object.keys(merged) as TermKey[]).every((k) => merged[k] === terms[k])) return false;
    terms = merged;
    registry.forEach(({ target, raw }) => applyInto(target, raw));
    listeners.forEach((l) => l());
    return true;
};
