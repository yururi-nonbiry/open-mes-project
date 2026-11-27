"""
1リクエストの間だけ有効なキャッシュ。

用語・機能設定などは1リクエストの中で何度も参照されるため(一覧の行ごとの文言の置き換えなど)、
リクエストの間は最初に読んだ値を使い回して DB への問い合わせを減らす。
リクエストをまたいでは保持しないため、別のプロセス(ワーカー)での設定変更やテスト間で古い値が残ることはない。
リクエストの外(Celery のタスク等)ではキャッシュしない。
"""

import contextvars

_cache = contextvars.ContextVar("open_mes_request_cache", default=None)


class RequestCacheMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _cache.set({})
        try:
            return self.get_response(request)
        finally:
            _cache.reset(token)


def cached(key, loader):
    """リクエスト中なら key の値を覚えて使い回す(リクエストの外では毎回 loader を呼ぶ)。"""
    cache = _cache.get()
    if cache is None:
        return loader()
    if key not in cache:
        cache[key] = loader()
    return cache[key]


def invalidate():
    """設定を変更したときに呼び、同じリクエストの中で古い値を使わないようにする。"""
    cache = _cache.get()
    if cache is not None:
        cache.clear()
