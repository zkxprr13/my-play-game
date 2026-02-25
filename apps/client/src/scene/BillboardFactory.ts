import type { BillboardItem } from '@my-play-game/shared';
import * as THREE from 'three';
import { AssetCache } from './AssetCache';

const DEFAULT_BACKGROUND = '#f2f2f2';
const LINK_BACKGROUND = '#2244aa';
const TEXT_BACKGROUND = '#333333';
const FOREGROUND = '#ffffff';

export class BillboardFactory {
  private readonly assetCache: AssetCache;

  public constructor(assetCache: AssetCache) {
    this.assetCache = assetCache;
  }

  public async createMesh(item: BillboardItem): Promise<THREE.Mesh> {
    const texture = await this.createTexture(item);
    const geometry = new THREE.PlaneGeometry(item.size.w, item.size.h);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(item.position.x, item.position.y, item.position.z);
    mesh.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
    mesh.name = `billboard:${item.id}`;
    mesh.userData = {
      itemId: item.id,
      type: item.type,
      interactive: item.type === 'link'
    };

    return mesh;
  }

  private async createTexture(item: BillboardItem): Promise<THREE.Texture> {
    if (item.type === 'image') {
      return this.assetCache.loadTexture(item.url);
    }

    if (item.type === 'link') {
      return this.createCanvasTexture({
        title: item.title ?? 'Link',
        body: item.url,
        background: LINK_BACKGROUND,
        foreground: FOREGROUND
      });
    }

    return this.createCanvasTexture({
      title: item.title ?? 'Text',
      body: item.text,
      background: TEXT_BACKGROUND,
      foreground: FOREGROUND
    });
  }

  private createCanvasTexture(params: {
    title: string;
    body: string;
    background: string;
    foreground: string;
  }): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;

    const context = canvas.getContext('2d');

    if (context === null) {
      throw new Error('2D canvas context is unavailable');
    }

    context.fillStyle = params.background || DEFAULT_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = params.foreground;
    context.font = 'bold 54px sans-serif';
    context.fillText(params.title, 40, 90);

    context.font = '38px sans-serif';
    const lines = wrapText(context, params.body, canvas.width - 80);
    lines.forEach((line, index) => {
      context.fillText(line, 40, 170 + index * 54);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
  }
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/g).filter((word) => word.length > 0);

  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let currentLine = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${currentLine} ${words[index]}`;
    const width = context.measureText(candidate).width;

    if (width <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = words[index];
  }

  lines.push(currentLine);
  return lines;
}
