import { billboardItemSchema, type BillboardItem } from '@my-play-game/shared';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import * as THREE from 'three';
import './styles.css';
import { getLatestLevel, updateLevel, uploadImage } from './api';
import { AssetCache } from './scene/AssetCache';
import { BillboardFactory } from './scene/BillboardFactory';

type InputState = {
  KeyW: boolean;
  KeyS: boolean;
  KeyA: boolean;
  KeyD: boolean;
};

type HudState = {
  speed: number;
  altitude: number;
};

type ControlKey = keyof InputState;

type SaveState = {
  kind: 'idle' | 'success' | 'error';
  message: string;
};

function isControlKey(code: string): code is ControlKey {
  return code === 'KeyW' || code === 'KeyS' || code === 'KeyA' || code === 'KeyD';
}

const CAMERA_DISTANCE = 12;
const CAMERA_PITCH_MIN = -0.6;
const CAMERA_PITCH_MAX = 0.4;
const ADMIN_TOKEN_STORAGE_KEY = 'my-play-game-admin-token';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function updateItemById(items: BillboardItem[], itemId: string, updater: (item: BillboardItem) => BillboardItem): BillboardItem[] {
  return items.map((item) => (item.id === itemId ? updater(item) : item));
}

function toEditableText(item: BillboardItem): string {
  return item.type === 'text' ? item.text : item.url;
}

function parseBillboardType(value: string): BillboardItem['type'] | null {
  if (value === 'image' || value === 'link' || value === 'text') {
    return value;
  }

  return null;
}

function GameApp(): JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const interactiveMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [hud, setHud] = useState<HudState>({ speed: 0, altitude: 0 });

  const [levelId, setLevelId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState('');
  const [items, setItems] = useState<BillboardItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle', message: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);

    if (typeof storedToken === 'string') {
      setAdminToken(storedToken);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken);
  }, [adminToken]);

  useEffect(() => {
    let cancelled = false;

    void getLatestLevel().then((level) => {
      if (cancelled || level === null) {
        return;
      }

      setLevelId(level.id);
      setCurrentName(level.name);
      setItems(level.items);
      setSelectedItemId(level.items[0]?.id ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedItem = useMemo(() => {
    if (selectedItemId === null) {
      return null;
    }

    return items.find((item) => item.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  useEffect(() => {
    const mountElement = mountRef.current;
    if (mountElement === null) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountElement.clientWidth, mountElement.clientHeight);
    renderer.shadowMap.enabled = true;
    mountElement.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(60, mountElement.clientWidth / mountElement.clientHeight, 0.1, 1000);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
    directionalLight.position.set(30, 40, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(2048, 2048);
    scene.add(directionalLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x2f6232, metalness: 0.05, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(400, 80, 0x111111, 0x444444);
    scene.add(grid);

    const airplane = new THREE.Group();

    const fuselage = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.8, 4),
      new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.25, roughness: 0.5 })
    );
    fuselage.castShadow = true;
    airplane.add(fuselage);

    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 0.12, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x3068cc, metalness: 0.2, roughness: 0.55 })
    );
    wing.position.y = 0;
    wing.castShadow = true;
    airplane.add(wing);

    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.1, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x3068cc, metalness: 0.2, roughness: 0.55 })
    );
    tail.position.set(0, 0.2, -1.6);
    tail.castShadow = true;
    airplane.add(tail);

    const verticalTail = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.75, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x254f9d, metalness: 0.2, roughness: 0.55 })
    );
    verticalTail.position.set(0, 0.55, -1.6);
    verticalTail.castShadow = true;
    airplane.add(verticalTail);

    airplane.position.set(0, 8, 0);
    scene.add(airplane);

    const billboardsGroup = new THREE.Group();
    billboardsGroup.name = 'level-billboards';
    scene.add(billboardsGroup);

    const assetCache = new AssetCache();
    const billboardFactory = new BillboardFactory(assetCache);

    let isMounted = true;

    void (async () => {
      const meshes = await Promise.all(
        items.map(async (item) => {
          return billboardFactory.createMesh(item);
        })
      );

      if (!isMounted) {
        meshes.forEach((mesh) => {
          const material = mesh.material;
          if (material instanceof THREE.Material) {
            material.dispose();
          }
          mesh.geometry.dispose();
        });
        return;
      }

      interactiveMeshesRef.current.clear();

      meshes.forEach((mesh) => {
        billboardsGroup.add(mesh);

        const itemId = mesh.userData.itemId;
        const isInteractive = mesh.userData.interactive;

        if (typeof itemId === 'string' && isInteractive === true) {
          interactiveMeshesRef.current.set(itemId, mesh);
        }
      });
    })().catch(() => undefined);

    const inputState: InputState = { KeyW: false, KeyS: false, KeyA: false, KeyD: false };

    let speed = 0;
    let targetSpeed = 0;
    let yaw = 0;
    let cameraYaw = Math.PI;
    let cameraPitch = -0.28;

    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isControlKey(event.code)) {
        inputState[event.code] = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (isControlKey(event.code)) {
        inputState[event.code] = false;
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      isDragging = true;
      prevMouseX = event.clientX;
      prevMouseY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!isDragging) {
        return;
      }
      const deltaX = event.clientX - prevMouseX;
      const deltaY = event.clientY - prevMouseY;
      prevMouseX = event.clientX;
      prevMouseY = event.clientY;

      cameraYaw -= deltaX * 0.005;
      cameraPitch = clamp(cameraPitch - deltaY * 0.003, CAMERA_PITCH_MIN, CAMERA_PITCH_MAX);
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (!isDragging) {
        return;
      }
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };

    const onResize = (): void => {
      const width = mountElement.clientWidth;
      const height = mountElement.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerUp);

    const forward = new THREE.Vector3();
    const cameraOffset = new THREE.Vector3();
    const lookAtTarget = new THREE.Vector3();
    const clock = new THREE.Clock();

    let animationFrameId = 0;

    const animate = (): void => {
      animationFrameId = window.requestAnimationFrame(animate);
      const deltaTime = clock.getDelta();

      const speedChange = 20;
      const yawSpeed = 1.35;
      const maxSpeed = 85;

      if (inputState.KeyW) {
        targetSpeed += speedChange * deltaTime;
      }
      if (inputState.KeyS) {
        targetSpeed -= speedChange * deltaTime;
      }
      targetSpeed = clamp(targetSpeed, 0, maxSpeed);

      const yawInput = Number(inputState.KeyD) - Number(inputState.KeyA);
      yaw += yawInput * yawSpeed * deltaTime;

      speed += (targetSpeed - speed) * Math.min(1, deltaTime * 2.4);

      forward.set(Math.sin(yaw), 0, Math.cos(yaw));
      airplane.position.addScaledVector(forward, speed * deltaTime);
      airplane.rotation.y = yaw;

      const orbitYaw = yaw + cameraYaw;
      cameraOffset.set(0, 2.8, CAMERA_DISTANCE).applyEuler(new THREE.Euler(cameraPitch, orbitYaw, 0, 'YXZ'));
      camera.position.copy(airplane.position).add(cameraOffset);
      lookAtTarget.copy(airplane.position).add(new THREE.Vector3(0, 1.1, 0));
      camera.lookAt(lookAtTarget);

      setHud({
        speed,
        altitude: airplane.position.y
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      isMounted = false;
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerUp);

      interactiveMeshesRef.current.clear();

      billboardsGroup.children.forEach((child) => {
        if (!(child instanceof THREE.Mesh)) {
          return;
        }

        child.geometry.dispose();
        const material = child.material;

        if (material instanceof THREE.Material) {
          if ('map' in material && material.map) {
            material.map.dispose();
          }
          material.dispose();
        }
      });

      mountElement.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [items]);

  const onSelectedItemChange = (nextId: string): void => {
    setSelectedItemId(nextId);
    setSaveState({ kind: 'idle', message: '' });
  };

  const onItemTypeChange = (nextType: BillboardItem['type']): void => {
    if (selectedItemId === null) {
      return;
    }

    setItems((prevItems) =>
      updateItemById(prevItems, selectedItemId, (item) => {
        if (nextType === item.type) {
          return item;
        }

        if (nextType === 'text') {
          return {
            ...item,
            type: 'text',
            text: item.type === 'text' ? item.text : ''
          };
        }

        return {
          ...item,
          type: nextType,
          url: item.type === 'text' ? '' : item.url
        };
      })
    );
  };

  const onItemTitleChange = (title: string): void => {
    if (selectedItemId === null) {
      return;
    }

    setItems((prevItems) =>
      updateItemById(prevItems, selectedItemId, (item) => ({
        ...item,
        title: title.trim().length === 0 ? undefined : title
      }))
    );
  };

  const onItemContentChange = (value: string): void => {
    if (selectedItemId === null) {
      return;
    }

    setItems((prevItems) =>
      updateItemById(prevItems, selectedItemId, (item) => {
        if (item.type === 'text') {
          return {
            ...item,
            text: value
          };
        }

        return {
          ...item,
          url: value
        };
      })
    );
  };

  const onItemSizeChange = (key: 'w' | 'h', value: string): void => {
    if (selectedItemId === null) {
      return;
    }

    const nextNumber = Number(value);

    if (!Number.isFinite(nextNumber)) {
      return;
    }

    setItems((prevItems) =>
      updateItemById(prevItems, selectedItemId, (item) => ({
        ...item,
        size: {
          ...item.size,
          [key]: nextNumber
        }
      }))
    );
  };

  const onUploadImage = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];

    if (!file || selectedItem === null || selectedItem.type !== 'image') {
      return;
    }

    setIsUploading(true);
    setSaveState({ kind: 'idle', message: '' });

    try {
      const uploadedUrl = await uploadImage(file, adminToken);

      setItems((prevItems) =>
        updateItemById(prevItems, selectedItem.id, (item) => {
          if (item.type !== 'image') {
            return item;
          }

          return {
            ...item,
            url: uploadedUrl
          };
        })
      );

      setSaveState({ kind: 'success', message: 'Изображение загружено' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка загрузки изображения';
      setSaveState({ kind: 'error', message });
    } finally {
      event.target.value = '';
      setIsUploading(false);
    }
  };

  const onSaveLevel = async (): Promise<void> => {
    if (levelId === null) {
      setSaveState({ kind: 'error', message: 'Уровень не найден' });
      return;
    }

    const parsedItems = items.map((item) => billboardItemSchema.parse(item));

    setIsSaving(true);
    setSaveState({ kind: 'idle', message: '' });

    try {
      const updatedLevel = await updateLevel(
        levelId,
        {
          name: currentName,
          items: parsedItems
        },
        adminToken
      );

      setCurrentName(updatedLevel.name);
      setItems(updatedLevel.items);
      setSaveState({ kind: 'success', message: 'Уровень сохранён' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка сохранения уровня';
      setSaveState({ kind: 'error', message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="game-root">
      <div className="game-canvas" ref={mountRef} />

      <div className="crosshair" aria-hidden="true">
        <div className="crosshair-line horizontal" />
        <div className="crosshair-line vertical" />
      </div>

      <section className="hud" aria-label="Flight information">
        <p>Speed: {hud.speed.toFixed(1)} m/s</p>
        <p>Altitude: {hud.altitude.toFixed(1)} m</p>
        <p className="hint">W/S - target speed | A/D - yaw | Mouse drag - camera orbit</p>
      </section>

      <aside className="editor-panel" aria-label="Level editor">
        <h2>Редактор</h2>

        <label>
          Level name
          <input value={currentName} onChange={(event) => setCurrentName(event.target.value)} placeholder="Level name" />
        </label>

        <label>
          Admin token
          <input
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
            placeholder="Bearer token"
            type="password"
          />
        </label>

        <label>
          Item
          <select
            value={selectedItemId ?? ''}
            onChange={(event) => onSelectedItemChange(event.target.value)}
            disabled={items.length === 0}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title ?? item.id}
              </option>
            ))}
          </select>
        </label>

        <label>
          Type
          <select
            value={selectedItem?.type ?? 'text'}
            onChange={(event) => {
              const parsedType = parseBillboardType(event.target.value);
              if (parsedType !== null) {
                onItemTypeChange(parsedType);
              }
            }}
            disabled={selectedItem === null}
          >
            <option value="image">image</option>
            <option value="link">link</option>
            <option value="text">text</option>
          </select>
        </label>

        <label>
          Title
          <input
            value={selectedItem?.title ?? ''}
            onChange={(event) => onItemTitleChange(event.target.value)}
            disabled={selectedItem === null}
          />
        </label>

        <label>
          {selectedItem?.type === 'text' ? 'Text' : 'URL'}
          <textarea
            value={selectedItem ? toEditableText(selectedItem) : ''}
            onChange={(event) => onItemContentChange(event.target.value)}
            disabled={selectedItem === null}
          />
        </label>

        <div className="size-row">
          <label>
            W
            <input
              type="number"
              min="0.1"
              max="100"
              step="0.1"
              value={selectedItem?.size.w ?? ''}
              onChange={(event) => onItemSizeChange('w', event.target.value)}
              disabled={selectedItem === null}
            />
          </label>

          <label>
            H
            <input
              type="number"
              min="0.1"
              max="100"
              step="0.1"
              value={selectedItem?.size.h ?? ''}
              onChange={(event) => onItemSizeChange('h', event.target.value)}
              disabled={selectedItem === null}
            />
          </label>
        </div>

        {selectedItem?.type === 'image' ? (
          <label>
            Upload image
            <input type="file" accept="image/*" onChange={onUploadImage} disabled={isUploading} />
          </label>
        ) : null}

        <button className="save-button" onClick={() => void onSaveLevel()} disabled={isSaving || levelId === null}>
          {isSaving ? 'Saving...' : 'Save level'}
        </button>

        {saveState.kind !== 'idle' ? (
          <p className={`save-state ${saveState.kind === 'error' ? 'error' : 'success'}`}>{saveState.message}</p>
        ) : null}
      </aside>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GameApp />
  </React.StrictMode>
);
