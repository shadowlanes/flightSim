import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ShipModel } from '../engine/ShipModel';

interface ShipPreviewProps {
  skinColor: string;
  width?: number;
  height?: number;
}

export const ShipPreview: React.FC<ShipPreviewProps> = ({
  skinColor,
  width = 400,
  height = 300
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const shipModelRef = useRef<ShipModel | null>(null);
  const mouseRef = useRef({ down: false, x: 0, y: 0 });
  const rotationRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!containerRef.current) return;

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(8, 4, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(5, 10, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x00ffff, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00ffff, 0.5);
    rimLight.position.set(0, -5, -10);
    scene.add(rimLight);

    // Add ship model
    const shipModel = new ShipModel(skinColor);
    shipModel.group.position.y = 0;
    scene.add(shipModel.group);
    shipModelRef.current = shipModel;

    // Grid platform for context
    const gridHelper = new THREE.GridHelper(20, 20, 0x00ffff, 0x003333);
    gridHelper.position.y = -2;
    scene.add(gridHelper);

    // Mouse controls
    const handleMouseDown = (e: MouseEvent) => {
      mouseRef.current.down = true;
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseRef.current.down) return;

      const deltaX = e.clientX - mouseRef.current.x;
      const deltaY = e.clientY - mouseRef.current.y;

      rotationRef.current.y += deltaX * 0.01;
      rotationRef.current.x += deltaY * 0.01;

      // Clamp vertical rotation
      rotationRef.current.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, rotationRef.current.x));

      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    const handleMouseUp = () => {
      mouseRef.current.down = false;
    };

    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Animation loop
    const animate = () => {
      if (!shipModelRef.current) return;

      // Auto-rotate if not dragging
      if (!mouseRef.current.down) {
        rotationRef.current.y += 0.003;
      }

      // Apply rotation
      shipModelRef.current.group.rotation.y = rotationRef.current.y;
      shipModelRef.current.group.rotation.x = rotationRef.current.x;

      // Gentle bobbing animation
      shipModelRef.current.group.position.y = Math.sin(Date.now() * 0.001) * 0.2;

      // Pulse engine glow
      const pulse = Math.sin(Date.now() * 0.002) * 0.5 + 2.5;
      shipModelRef.current.glowMaterial.emissiveIntensity = pulse;

      renderer.render(scene, camera);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (containerRef.current && renderer.domElement.parentNode) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [width, height]); // Only re-initialize if size changes

  // Update ship color when skinColor prop changes
  useEffect(() => {
    if (!shipModelRef.current || !sceneRef.current) return;

    // Remove old ship
    sceneRef.current.remove(shipModelRef.current.group);

    // Create new ship with new color
    const newShip = new ShipModel(skinColor);
    newShip.group.position.y = shipModelRef.current.group.position.y;
    newShip.group.rotation.copy(shipModelRef.current.group.rotation);
    sceneRef.current.add(newShip.group);
    shipModelRef.current = newShip;
  }, [skinColor]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          border: '2px solid #0ff',
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: 'grab',
          userSelect: 'none',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)'
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.cursor = 'grabbing';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.cursor = 'grab';
        }}
      />
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#0ff',
        fontSize: '0.7em',
        textAlign: 'center',
        pointerEvents: 'none',
        textShadow: '0 0 5px #0ff',
        fontFamily: 'monospace'
      }}>
        DRAG TO ROTATE
      </div>
    </div>
  );
};
