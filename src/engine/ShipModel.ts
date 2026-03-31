import * as THREE from 'three';

export class ShipModel {
  public group: THREE.Group;
  public glowMaterial: THREE.MeshStandardMaterial;

  constructor(skinColor: string) {
    this.glowMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xff3300,
      emissiveIntensity: 1.6
    });

    this.group = this.createShip(skinColor);
  }

  private createShip(skinColor: string): THREE.Group {
    const ship = new THREE.Group();

    // Constants
    const HULL_COLOR = new THREE.Color(skinColor);
    const ACCENT_COLOR = 0xffbb00; // Yellow/gold
    const ENGINE_GRAY = 0x666666;
    const DARK_GRAY = 0x333333;

    // Materials
    const hullMat = new THREE.MeshStandardMaterial({
      color: HULL_COLOR,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.3
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: ACCENT_COLOR,
      flatShading: true,
      roughness: 0.6,
      metalness: 0.4
    });

    const engineMat = new THREE.MeshStandardMaterial({
      color: ENGINE_GRAY,
      flatShading: true,
      roughness: 0.5,
      metalness: 0.6
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: DARK_GRAY,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.1
    });

    // ========== FUSELAGE ==========
    // Main wedge body
    const fuselageGeo = new THREE.BoxGeometry(0.8, 0.3, 2.0);
    const fuselage = new THREE.Mesh(fuselageGeo, hullMat);
    fuselage.position.set(0, 0, 0);
    ship.add(fuselage);

    // Nose - elongated point
    const noseGeo = new THREE.ConeGeometry(0.35, 1.2, 4);
    const nose = new THREE.Mesh(noseGeo, accentMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, 1.6);
    ship.add(nose);

    // Nose bridge (connects body to nose)
    const noseBridgeGeo = new THREE.BoxGeometry(0.6, 0.28, 0.4);
    const noseBridge = new THREE.Mesh(noseBridgeGeo, hullMat);
    noseBridge.position.set(0, 0, 1.2);
    ship.add(noseBridge);

    // Rear taper
    const rearGeo = new THREE.BoxGeometry(0.6, 0.25, 0.5);
    const rear = new THREE.Mesh(rearGeo, hullMat);
    rear.position.set(0, 0, -1.25);
    ship.add(rear);

    // ========== COCKPIT ==========
    const canopyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.6);
    const canopy = new THREE.Mesh(canopyGeo, accentMat);
    canopy.position.set(0, 0.25, 0.3);
    ship.add(canopy);

    // Canopy detail
    const canopyTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.15, 0.4),
      new THREE.MeshStandardMaterial({
        color: ACCENT_COLOR,
        flatShading: true,
        roughness: 0.3,
        metalness: 0.7
      })
    );
    canopyTop.position.set(0, 0.35, 0.3);
    ship.add(canopyTop);

    // ========== WINGS ==========
    // Root section (wide)
    const wingRootGeo = new THREE.BoxGeometry(1.2, 0.12, 0.9);

    const leftWingRoot = new THREE.Mesh(wingRootGeo, hullMat);
    leftWingRoot.position.set(-0.9, 0, -0.1);
    ship.add(leftWingRoot);

    const rightWingRoot = new THREE.Mesh(wingRootGeo, hullMat);
    rightWingRoot.position.set(0.9, 0, -0.1);
    ship.add(rightWingRoot);

    // Mid section (tapered)
    const wingMidGeo = new THREE.BoxGeometry(1.5, 0.1, 0.7);

    const leftWingMid = new THREE.Mesh(wingMidGeo, hullMat);
    leftWingMid.position.set(-2.1, 0, -0.3);
    leftWingMid.rotation.z = -0.05;
    ship.add(leftWingMid);

    const rightWingMid = new THREE.Mesh(wingMidGeo, hullMat);
    rightWingMid.position.set(2.1, 0, -0.3);
    rightWingMid.rotation.z = 0.05;
    ship.add(rightWingMid);

    // Tip section (narrow)
    const wingTipGeo = new THREE.BoxGeometry(1.0, 0.08, 0.5);

    const leftWingTip = new THREE.Mesh(wingTipGeo, hullMat);
    leftWingTip.position.set(-3.3, 0, -0.5);
    leftWingTip.rotation.z = -0.08;
    ship.add(leftWingTip);

    const rightWingTip = new THREE.Mesh(wingTipGeo, hullMat);
    rightWingTip.position.set(3.3, 0, -0.5);
    rightWingTip.rotation.z = 0.08;
    ship.add(rightWingTip);

    // Wing details (stripes)
    const wingStripeGeo = new THREE.BoxGeometry(1.1, 0.13, 0.12);

    const leftStripe1 = new THREE.Mesh(wingStripeGeo, accentMat);
    leftStripe1.position.set(-0.9, 0.01, 0.15);
    ship.add(leftStripe1);

    const rightStripe1 = new THREE.Mesh(wingStripeGeo, accentMat);
    rightStripe1.position.set(0.9, 0.01, 0.15);
    ship.add(rightStripe1);

    // ========== WINGTIP CANNONS ==========
    const cannonGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6);

    const leftCannon = new THREE.Mesh(cannonGeo, accentMat);
    leftCannon.rotation.x = Math.PI / 2;
    leftCannon.position.set(-3.8, 0, -0.3);
    ship.add(leftCannon);

    const rightCannon = new THREE.Mesh(cannonGeo, accentMat);
    rightCannon.rotation.x = Math.PI / 2;
    rightCannon.position.set(3.8, 0, -0.3);
    ship.add(rightCannon);

    // Cannon tips
    const cannonTipGeo = new THREE.ConeGeometry(0.09, 0.2, 6);

    const leftTip = new THREE.Mesh(cannonTipGeo, darkMat);
    leftTip.rotation.x = Math.PI / 2;
    leftTip.position.set(-3.8, 0, 0.2);
    ship.add(leftTip);

    const rightTip = new THREE.Mesh(cannonTipGeo, darkMat);
    rightTip.rotation.x = Math.PI / 2;
    rightTip.position.set(3.8, 0, 0.2);
    ship.add(rightTip);

    // ========== ENGINES ==========
    const engineBodyGeo = new THREE.CylinderGeometry(0.35, 0.38, 1.5, 12);

    const leftEngineBody = new THREE.Mesh(engineBodyGeo, engineMat);
    leftEngineBody.rotation.x = Math.PI / 2;
    leftEngineBody.position.set(-1.0, 0, -0.4);
    ship.add(leftEngineBody);

    const rightEngineBody = new THREE.Mesh(engineBodyGeo, engineMat);
    rightEngineBody.rotation.x = Math.PI / 2;
    rightEngineBody.position.set(1.0, 0, -0.4);
    ship.add(rightEngineBody);

    // Engine accent bands
    const bandGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.15, 12);

    const leftBand = new THREE.Mesh(bandGeo, accentMat);
    leftBand.rotation.x = Math.PI / 2;
    leftBand.position.set(-1.0, 0, 0);
    ship.add(leftBand);

    const rightBand = new THREE.Mesh(bandGeo, accentMat);
    rightBand.rotation.x = Math.PI / 2;
    rightBand.position.set(1.0, 0, 0);
    ship.add(rightBand);

    // Engine intakes (dark)
    const intakeGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12);

    const leftIntake = new THREE.Mesh(intakeGeo, darkMat);
    leftIntake.rotation.x = Math.PI / 2;
    leftIntake.position.set(-1.0, 0, 0.4);
    ship.add(leftIntake);

    const rightIntake = new THREE.Mesh(intakeGeo, darkMat);
    rightIntake.rotation.x = Math.PI / 2;
    rightIntake.position.set(1.0, 0, 0.4);
    ship.add(rightIntake);

    // ========== EXHAUST GLOWS ==========
    const exhaustGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12);

    const leftExhaust = new THREE.Mesh(exhaustGeo, this.glowMaterial);
    leftExhaust.rotation.x = Math.PI / 2;
    leftExhaust.position.set(-1.0, 0, -1.2);
    ship.add(leftExhaust);

    const rightExhaust = new THREE.Mesh(exhaustGeo, this.glowMaterial);
    rightExhaust.rotation.x = Math.PI / 2;
    rightExhaust.position.set(1.0, 0, -1.2);
    ship.add(rightExhaust);

    // Scale the entire ship
    ship.scale.setScalar(1.8);

    // Enable shadow casting for all meshes
    ship.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });

    return ship;
  }
}
