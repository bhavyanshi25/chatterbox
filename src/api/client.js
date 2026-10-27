// Small fetch wrapper for the ChatterBox API. Requests are same-origin (Vite
// proxies /api in dev), so the httpOnly session cookie is sent automatically.

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Fired when an authenticated request comes back 401 — AuthContext listens
// and signs the user out locally.
export const SESSION_EXPIRED_EVENT = 'chatterbox:session-expired';

async function request(method, path, { body, formData, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      response.status,
      data?.error ||
        (response.status === 502
          ? 'The ChatterBox API is unavailable. Check that the backend is running and connected to MongoDB, then try again.'
          : `Request failed (${response.status}).`),
      data?.details
    );
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  delete: (path, opts) => request('DELETE', path, opts),
  upload: (path, formData, opts) => request('POST', path, { ...opts, formData }),
};
