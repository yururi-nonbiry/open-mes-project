/** API 呼び出し等で catch したエラーのうち、画面側で参照する形（message のみ）。 */
export interface ApiErrorLike {
    message: string;
}
