import { z } from 'zod';

export const APP_NAME = 'My Play Game Monorepo';

export interface HealthResponse {
  ok: true;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export const HEALTH_RESPONSE: HealthResponse = {
  ok: true
};

/**
 * Euler angles are represented in radians across the whole project.
 */
export interface Euler3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Size2 {
  w: number;
  h: number;
}

export interface BillboardItemBase {
  id: string;
  position: Vec3;
  rotation: Euler3;
  size: Size2;
  title?: string;
}

export interface BillboardImageItem extends BillboardItemBase {
  type: 'image';
  url: string;
}

export interface BillboardLinkItem extends BillboardItemBase {
  type: 'link';
  url: string;
}

export interface BillboardTextItem extends BillboardItemBase {
  type: 'text';
  text: string;
}

export type BillboardItem = BillboardImageItem | BillboardLinkItem | BillboardTextItem;

export interface Level {
  id: string;
  name: string;
  items: BillboardItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLevelRequest {
  name: string;
  items: BillboardItem[];
}

export interface UpdateLevelRequest {
  name?: string;
  items?: BillboardItem[];
}

export interface UploadResponse {
  url: string;
}

const finiteNumberSchema = z.number().finite();

export const vec3Schema = z.object({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  z: finiteNumberSchema
});

export const euler3Schema = z.object({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  z: finiteNumberSchema
});

export const size2Schema = z.object({
  w: finiteNumberSchema.min(0.1).max(100),
  h: finiteNumberSchema.min(0.1).max(100)
});

export const billboardItemBaseSchema = z.object({
  id: z.string().min(1),
  position: vec3Schema,
  rotation: euler3Schema,
  size: size2Schema,
  title: z.string().max(120).optional()
});

export const billboardImageItemSchema = billboardItemBaseSchema.extend({
  type: z.literal('image'),
  url: z.string().url().max(2048)
});

export const billboardLinkItemSchema = billboardItemBaseSchema.extend({
  type: z.literal('link'),
  url: z.string().url().max(2048)
});

export const billboardTextItemSchema = billboardItemBaseSchema.extend({
  type: z.literal('text'),
  text: z.string().max(2000)
});

export const billboardItemSchema = z.discriminatedUnion('type', [
  billboardImageItemSchema,
  billboardLinkItemSchema,
  billboardTextItemSchema
]);

export const levelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  items: z.array(billboardItemSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const createLevelRequestSchema = z.object({
  name: z.string().min(1).max(120),
  items: z.array(billboardItemSchema)
});

export const updateLevelRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    items: z.array(billboardItemSchema).optional()
  })
  .refine((value) => value.name !== undefined || value.items !== undefined, {
    message: 'At least one field must be provided'
  });

export const uploadResponseSchema = z.object({
  url: z.string().url().max(2048)
});

export type Vec3DTO = z.infer<typeof vec3Schema>;
export type Euler3DTO = z.infer<typeof euler3Schema>;
export type Size2DTO = z.infer<typeof size2Schema>;
export type BillboardItemDTO = z.infer<typeof billboardItemSchema>;
export type LevelDTO = z.infer<typeof levelSchema>;
export type CreateLevelRequestDTO = z.infer<typeof createLevelRequestSchema>;
export type UpdateLevelRequestDTO = z.infer<typeof updateLevelRequestSchema>;
export type UploadResponseDTO = z.infer<typeof uploadResponseSchema>;
