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
 * 共通のエラーハンドリング関数
 */
export const handleError = async (response: Response, defaultMessage: string) => {
    if (response.ok) return;
    let detail = '';
    try {
        const data = await response.json();
        detail = data.error || data.detail || '';
    } catch {
        detail = response.statusText;
    }
    throw new Error(detail || defaultMessage);
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