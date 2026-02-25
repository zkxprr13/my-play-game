import {
  levelSchema,
  levelsListResponseSchema,
  updateLevelRequestSchema,
  uploadResponseSchema,
  type Level,
  type UpdateLevelRequest
} from '@my-play-game/shared';

const jsonHeaders = {
  'Content-Type': 'application/json'
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');

function toApiUrl(path: string): string {
  if (apiBaseUrl.length === 0) {
    return path;
  }

  return `${apiBaseUrl}${path}`;
}

function authHeader(adminToken: string): Record<string, string> {
  const token = adminToken.trim();

  if (token.length === 0) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`
  };
}

export async function getLatestLevel(): Promise<Level | null> {
  const response = await fetch(toApiUrl('/api/levels?limit=1&offset=0'));

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  const parsedList = levelsListResponseSchema.safeParse(payload);

  if (!parsedList.success) {
    return null;
  }

  return parsedList.data.items[0] ?? null;
}

export async function updateLevel(levelId: string, data: UpdateLevelRequest, adminToken: string): Promise<Level> {
  const parsedRequest = updateLevelRequestSchema.parse(data);

  const response = await fetch(toApiUrl(`/api/levels/${encodeURIComponent(levelId)}`), {
    method: 'PUT',
    headers: {
      ...jsonHeaders,
      ...authHeader(adminToken)
    },
    body: JSON.stringify(parsedRequest)
  });

  if (!response.ok) {
    throw new Error('Не удалось сохранить уровень');
  }

  const payload: unknown = await response.json();
  return levelSchema.parse(payload);
}

export async function uploadImage(file: File, adminToken: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(toApiUrl('/api/uploads'), {
    method: 'POST',
    headers: {
      ...authHeader(adminToken)
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error('Не удалось загрузить изображение');
  }

  const payload: unknown = await response.json();
  const parsed = uploadResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error('Некорректный ответ загрузки изображения');
  }

  return parsed.data.url;
}
