import { levelSchema, type BillboardItem } from '@my-play-game/shared';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import './styles.css';
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

type TransformMode = 'translate' | 'rotate';

type ControlKey = keyof InputState;

type LevelsListResponse = {
  items: unknown[];
  total: number;
};

function isControlKey(code: string): code is ControlKey {
  return code === 'KeyW' || code === 'KeyS' || code === 'KeyA' || code === 'KeyD';
}

const CAMERA_DISTANCE = 12;
const CAMERA_PITCH_MIN = -0.6;
const CAMERA_PITCH_MAX = 0.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function fetchLevelItems(): Promise<BillboardItem[]> {
  const response = await fetch('/api/levels?limit=1&offset=0');

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as LevelsListResponse;

  if (payload.items.length === 0) {
    return [];
  }

  const parsedLevel = levelSchema.safeParse(payload.items[0]);

  if (!parsedLevel.success) {
    return [];
  }

  return parsedLevel.data.items;
}

function GameApp(): JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const interactiveMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [hud, setHud] = useState<HudState>({ speed: 0, altitude: 0 });
  const [editorMode, setEditorMode] = useState(false);
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

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
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

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

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.enabled = false;
    transformControls.setSpace('world');
    transformControls.setSize(0.7);
    scene.add(transformControls.getHelper());

    const assetCache = new AssetCache();
    const billboardFactory = new BillboardFactory(assetCache);

    let isMounted = true;

    void fetchLevelItems().then(async (items) => {
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
    }).catch(() => undefined);

    const inputState: InputState = { KeyW: false, KeyS: false, KeyA: false, KeyD: false };
    let activeEditorMode = false;
    let activeTransformMode: TransformMode = 'translate';

    let speed = 0;
    let targetSpeed = 0;
    let yaw = 0;
    let cameraYaw = Math.PI;
    let cameraPitch = -0.28;

    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'F1') {
        event.preventDefault();
        activeEditorMode = !activeEditorMode;
        transformControls.enabled = activeEditorMode;

        if (!activeEditorMode) {
          transformControls.detach();
          setSelectedPanelId(null);
        }

        setEditorMode(activeEditorMode);
        return;
      }

      if (activeEditorMode && event.code === 'KeyG') {
        activeTransformMode = 'translate';
        transformControls.setMode('translate');
        setTransformMode('translate');
        return;
      }

      if (activeEditorMode && event.code === 'KeyR') {
        activeTransformMode = 'rotate';
        transformControls.setMode('rotate');
        setTransformMode('rotate');
        return;
      }

      if (activeEditorMode) {
        return;
      }

      if (isControlKey(event.code)) {
        inputState[event.code] = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (activeEditorMode) {
        return;
      }

      if (isControlKey(event.code)) {
        inputState[event.code] = false;
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }

      if (activeEditorMode) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);

        const intersections = raycaster.intersectObjects(billboardsGroup.children, true);
        const selectedObject = intersections[0]?.object ?? null;

        if (selectedObject === null) {
          transformControls.detach();
          setSelectedPanelId(null);
          return;
        }

        transformControls.attach(selectedObject);
        transformControls.enabled = true;
        transformControls.setMode(activeTransformMode);

        const itemId = selectedObject.userData.itemId;
        setSelectedPanelId(typeof itemId === 'string' ? itemId : selectedObject.uuid);
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

      if (!activeEditorMode) {
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
      }

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
      transformControls.dispose();

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
  }, []);

  return (
    <main className={`game-root ${editorMode ? 'editor-mode' : ''}`}>
      <div className="game-canvas" ref={mountRef} />

      <div className="crosshair" aria-hidden="true">
        <div className="crosshair-line horizontal" />
        <div className="crosshair-line vertical" />
      </div>

      <section className="hud" aria-label="Flight information">
        <p>Speed: {hud.speed.toFixed(1)} m/s</p>
        <p>Altitude: {hud.altitude.toFixed(1)} m</p>
        <p>Editor: {editorMode ? 'ON' : 'OFF'} (F1)</p>
        <p>Transform: {transformMode === 'translate' ? 'Move (G)' : 'Rotate (R)'}</p>
        <p>Selected panel: {selectedPanelId ?? 'none'}</p>
        <p className="hint">Flight: W/S - speed, A/D - yaw | Camera: mouse drag | Editor: click panel</p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GameApp />
  </React.StrictMode>
);
