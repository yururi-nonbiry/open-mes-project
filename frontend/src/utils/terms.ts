/**
 * 画面の用語の差し替え。
 * 文言は「部品」で書いておき、管理者が設定した呼び方(例: 材料)に置き換えて表示する。
 * 設定はAPI(/api/base/terminology/)から取得し、変更時は setPartTerm() で反映する。
 */
export const PART_TERM_DEFAULT = '部品';

let partTerm = PART_TERM_DEFAULT;

export const getPartTerm = (): string => partTerm;

/** 「部品」を設定された呼び方に置き換える(既定のままなら何もしない)。 */
export const t = (text: string): string =>
    partTerm === PART_TERM_DEFAULT ? text : text.split(PART_TERM_DEFAULT).join(partTerm);

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
export const onPartTermChange = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** 呼び方を設定する。変わったときだけ true を返し、購読者へ通知する。 */
export const setPartTerm = (term: string): boolean => {
    const next = term.trim() || PART_TERM_DEFAULT;
    if (next === partTerm) return false;
    partTerm = next;
    registry.forEach(({ target, raw }) => applyInto(target, raw));
    listeners.forEach((l) => l());
    return true;
};
