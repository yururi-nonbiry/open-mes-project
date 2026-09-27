from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    """一覧APIの標準ページネーション。総ページ数・現在ページ・ページサイズも返す。"""

    page_size = 25
    page_size_query_param = "page_size"  # クライアントが1ページあたりの件数を指定するためのクエリパラメータ
    max_page_size = 1000  # クライアントが指定できる1ページあたりの最大件数

    def get_paginated_response(self, data):
        return Response(
            {
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "count": self.page.paginator.count,
                "total_pages": self.page.paginator.num_pages,
                "current_page": self.page.number,
                "page_size": self.get_page_size(self.request),
                "results": data,
            }
        )
