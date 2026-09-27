import { getCookie } from './cookies';

/**
 * オブジェクトをクエリ文字列に変換します。
 * undefined, null, 空文字の値を自動的に除外します。
 */
export const buildQueryString = (params: Record<string, any>): string => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.append(key, value.toString());
        }
    });
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
};

/**
 * APIのエラー応答本文。成否はHTTPステータスで判定し、失敗時の本文は常にこの形式になる
 * (backend/src/base/responses.py と対応)。
 */
export interface ApiErrorBody {
    /** 画面にそのまま表示できるメッセージ */
    error?: string;
    /** 入力値エラー時のみ。フィールド名ごとのエラー詳細 */
    errors?: Record<string, unknown>;
    /** 認証系など、分岐に使う識別子がある場合のみ */
    code?: string;
}

export class ApiError extends Error {
    status: number;
    errors: Record<string, unknown> | null;
    code?: string;

    constructor(message: string, status: number, errors: Record<string, unknown> | null = null, code?: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errors = errors;
        this.code = code;
    }
}

/**
 * 失敗したレスポンスから ApiError を生成する。
 * 本文がJSONでない場合(プロキシのHTMLエラーページ等)は defaultMessage を使う。
 */
export const toApiError = async (response: Response, defaultMessage: string): Promise<ApiError> => {
    let body: ApiErrorBody | null = null;
    try {
        body = await response.json();
    } catch {
        // JSON以外の本文は無視する
    }
    return new ApiError(body?.error || defaultMessage, response.status, body?.errors ?? null, body?.code);
};

/**
 * 入力値エラーの詳細を「項目: 内容 / 項目: 内容」の1行にまとめる。項目別の表示欄を持たない画面向け。
 */
export const formatFieldErrors = (errors: Record<string, unknown>): string =>
    Object.entries(errors)
        .map(([field, messages]) => {
            const msg = Array.isArray(messages)
                ? messages.map(m => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ')
                : typeof messages === 'string' ? messages : JSON.stringify(messages);
            return `${field}: ${msg}`;
        })
        .join(' / ');

/**
 * 例外を画面表示用の1行にする。入力値エラーの場合は項目別の詳細も添える(項目別の表示欄を持たない画面向け)。
 */
export const describeError = (err: unknown): string => {
    if (err instanceof ApiError && err.errors) return `${err.message} ${formatFieldErrors(err.errors)}`;
    return err instanceof Error ? err.message : String(err);
};

/**
 * レスポンスが失敗(2xx以外)なら ApiError を送出する。
 */
export const handleError = async (response: Response, defaultMessage: string) => {
    if (response.ok) return;
    throw await toApiError(response, defaultMessage);
};

/**
 * authFetch でリクエストし、成功時はJSON本文(204の場合は undefined)を返す。失敗時は ApiError を送出する。
 */
// 呼び出し側の多くが本文の型を定義していないため、既定では any として扱う
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiRequest = async <T = any>(
    url: string,
    options: RequestInit = {},
    defaultMessage = 'サーバーとの通信に失敗しました。'
): Promise<T> => {
    const response = await authFetch(url, options);
    await handleError(response, defaultMessage);
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
};

const BASE_URL = '/api';

interface FailedRequest {
  resolve: (token: string | null) => void;
  reject: (error: any) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  let accessToken = localStorage.getItem('access_token');

  const headers: Record<string, string> = {
    ...Object.fromEntries(new Headers(options.headers || {}).entries()),
  };

  // FormDataの場合、ブラウザが自動でContent-Typeとboundaryを設定するので、
  // こちらで 'Content-Type': 'application/json' を設定しないようにする。
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // CSRFが必要なリクエスト（セッション認証との併用など）のために残す
  const csrfToken = getCookie('csrftoken');
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase() || '')) {
      headers['X-CSRFToken'] = csrfToken;
  }

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && accessToken) {
    if (isRefreshing) {
      try {
        const token = await new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
        headers['Authorization'] = `Bearer ${token}`;
        response = await fetch(url, { ...options, headers });
      } catch (err) {
        return Promise.reject(new Error('Failed to refresh token.'));
      }
    } else {
      isRefreshing = true;
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        isRefreshing = false;
        window.dispatchEvent(new Event('logout'));
        return Promise.reject(new Error('No refresh token available.'));
      }

      try {
        const refreshResponse = await fetch(`${BASE_URL}/users/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken }),
        });

        if (!refreshResponse.ok) { throw new Error('Session expired'); }

        const newTokens = await refreshResponse.json();
        localStorage.setItem('access_token', newTokens.access);
        // ROTATE_REFRESH_TOKENS が有効なため、サーバーは古いrefreshトークンをブラックリスト化し
        // 新しいrefreshトークンを返す。保存し忘れると次回のリフレッシュが必ず失敗する。
        if (newTokens.refresh) {
          localStorage.setItem('refresh_token', newTokens.refresh);
        }
        isRefreshing = false;
        processQueue(null, newTokens.access);

        headers['Authorization'] = `Bearer ${newTokens.access}`;
        response = await fetch(url, { ...options, headers });
      } catch (error) {
        isRefreshing = false;
        processQueue(error, null);
        window.dispatchEvent(new Event('logout'));
        return Promise.reject(error);
      }
    }
  }

  return response;
};

export default authFetch;