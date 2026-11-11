/** API/サービス層がthrowするエラーの形(Errorを拡張し、フィールド別エラーを持つ場合がある) */
export interface ApiErrorLike extends Error {
    errors?: Record<string, string | string[] | Array<Record<string, string[]> | null>>;
}
