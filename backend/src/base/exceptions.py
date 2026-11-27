class DomainServiceError(Exception):
    """
    サービス層の業務エラーの基底クラス。ビューで捕まえ損ねても、例外ハンドラ(base.responses.api_exception_handler)が
    status_code の統一形式のエラー応答({"error": message, "code"?: code})に変換する(500 にしない)。
    """

    code = None

    def __init__(self, message, status_code=400, code=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        if code is not None:
            self.code = code
