import {
  levelSchema,
  updateLevelRequestSchema,
  uploadResponseSchema,
  type Level,
  type UpdateLevelRequest
} from '@my-play-game/shared';

type LevelsListResponse = {
  items: unknown[];
  total: number;
};

const jsonHeaders = {
  'Content-Type': 'application/json'
};

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
  const response = await fetch('/api/levels?limit=1&offset=0');

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as LevelsListResponse;
  const [firstLevel] = payload.items;

  if (firstLevel === undefined) {
    return null;
  }

  const parsed = levelSchema.safeParse(firstLevel);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export async function updateLevel(levelId: string, data: UpdateLevelRequest, adminToken: string): Promise<Level> {
  const parsedRequest = updateLevelRequestSchema.parse(data);

  const response = await fetch(`/api/levels/${encodeURIComponent(levelId)}`, {
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

  const payload = await response.json();
  return levelSchema.parse(payload);
}

export async function uploadImage(file: File, adminToken: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/uploads/image', {
    method: 'POST',
    headers: {
      ...authHeader(adminToken)
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error('Не удалось загрузить изображение');
  }

  const payload = await response.json();
  const parsed = uploadResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error('Некорректный ответ загрузки изображения');
  }

  return parsed.data.url;
}
