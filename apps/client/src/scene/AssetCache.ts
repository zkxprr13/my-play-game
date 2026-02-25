import * as THREE from 'three';

const TEXTURE_TIMEOUT_MS = 10_000;

const isAbsoluteHttpUrl = (value: string): boolean => {
  return value.startsWith('http://') || value.startsWith('https://');
};

export class AssetCache {
  private readonly textureLoader = new THREE.TextureLoader();

  private readonly texturePromises = new Map<string, Promise<THREE.Texture>>();

  private readonly baseOrigin: string;

  public constructor(baseOrigin: string = window.location.origin) {
    this.baseOrigin = baseOrigin;
  }

  public loadTexture(url: string): Promise<THREE.Texture> {
    const normalizedUrl = this.normalizeUrl(url);
    const cachedPromise = this.texturePromises.get(normalizedUrl);

    if (cachedPromise) {
      return cachedPromise;
    }

    const texturePromise = this.loadTextureWithTimeout(normalizedUrl);
    this.texturePromises.set(normalizedUrl, texturePromise);

    return texturePromise;
  }

  private normalizeUrl(url: string): string {
    if (isAbsoluteHttpUrl(url)) {
      return url;
    }

    if (url.startsWith('/')) {
      return new URL(url, this.baseOrigin).toString();
    }

    return new URL(url, `${this.baseOrigin}/`).toString();
  }

  private async loadTextureWithTimeout(url: string): Promise<THREE.Texture> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`Texture loading timeout for ${url}`));
      }, TEXTURE_TIMEOUT_MS);
    });

    const texturePromise = new Promise<THREE.Texture>((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          resolve(texture);
        },
        undefined,
        (error) => {
          reject(new Error(`Failed to load texture: ${url}`, { cause: error }));
        }
      );
    });

    try {
      return await Promise.race([texturePromise, timeoutPromise]);
    } catch (error) {
      this.texturePromises.delete(url);
      throw error;
    }
  }
}
