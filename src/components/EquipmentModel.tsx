import { useCallback, useEffect, useRef } from 'react'
import { ArrowDownLeft, ArrowUpRight, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { equipmentCatalog, type EquipmentId, type EquipmentPart } from '../domain/inspection'

type EquipmentModelProps = {
  equipmentId: EquipmentId
  parts: EquipmentPart[]
  selectedPartId: string | null
  onSelectPart: (partId: string) => void
}

function EquipmentModel({ equipmentId, parts, selectedPartId, onSelectPart }: EquipmentModelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const equipmentModelRef = useRef<THREE.Group | null>(null)
  const viewAnimationRef = useRef<number | null>(null)

  const resetView = useCallback(() => {
    if (viewAnimationRef.current !== null) {
      window.cancelAnimationFrame(viewAnimationRef.current)
      viewAnimationRef.current = null
    }
    const model = equipmentModelRef.current
    const controls = controlsRef.current
    if (!model || !controls) return
    const startRotation = model.quaternion.clone()
    const initialRotation = new THREE.Quaternion()
    const startTarget = controls.target.clone()
    const startOffset = new THREE.Spherical().setFromVector3(controls.object.position.clone().sub(startTarget))
    const endOffset = new THREE.Spherical().setFromVector3(controls.position0.clone().sub(controls.target0))
    // Follow the shortest orbit back to the initial view, without crossing the model.
    const angleDelta = THREE.MathUtils.euclideanModulo(endOffset.theta - startOffset.theta + Math.PI, Math.PI * 2) - Math.PI
    const offset = new THREE.Spherical()
    const position = new THREE.Vector3()
    const animationStart = performance.now()
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650

    const animateReset = (now: number) => {
      const progress = duration === 0 ? 1 : Math.min((now - animationStart) / duration, 1)
      const eased = progress * progress * (3 - 2 * progress)
      model.quaternion.slerpQuaternions(startRotation, initialRotation, eased)
      controls.target.lerpVectors(startTarget, controls.target0, eased)
      offset.radius = THREE.MathUtils.lerp(startOffset.radius, endOffset.radius, eased)
      offset.phi = THREE.MathUtils.lerp(startOffset.phi, endOffset.phi, eased)
      offset.theta = startOffset.theta + angleDelta * eased
      controls.object.position.copy(position.setFromSpherical(offset).add(controls.target))
      // Clear drag inertia so it cannot compete with the animated camera.
      const damping = controls.enableDamping
      controls.enableDamping = false
      controls.update()
      controls.enableDamping = damping
      if (progress < 1) {
        viewAnimationRef.current = window.requestAnimationFrame(animateReset)
      } else {
        model.quaternion.copy(initialRotation)
        controls.reset()
        viewAnimationRef.current = null
      }
    }
    viewAnimationRef.current = window.requestAnimationFrame(animateReset)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new THREE.Scene()
    sceneRef.current = scene
    const updateTheme = () => {
      scene.background = new THREE.Color(document.documentElement.dataset.theme === 'dark' ? '#1e2d3b' : '#eef3f8')
    }
    updateTheme()
    const themeObserver = new MutationObserver(updateTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    const cameraDistances: Record<EquipmentId, number> = {
      notebook: 8.8,
      desktop: 8.1,
      phone: 5.25,
      monitor: 10.2,
    }
    const distance = cameraDistances[equipmentId]
    const cameraTarget = new THREE.Vector3()
    const cameraOffset = new THREE.Vector3(5.5, 3.05, 6.7).normalize().multiplyScalar(distance)
    camera.position.copy(cameraTarget).add(cameraOffset)
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15

    const controls = new OrbitControls(camera, canvas)
    controlsRef.current = controls
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.target.copy(cameraTarget)
    controls.minDistance = 5.3
    controls.maxDistance = 10
    controls.maxPolarAngle = Math.PI * 0.48

    scene.add(new THREE.HemisphereLight('#ffffff', '#8492a0', 2.15))
    const keyLight = new THREE.DirectionalLight('#fff8e9', 3.1)
    keyLight.position.set(-3.5, 7, 5)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight('#bfd8f1', 1.25)
    fillLight.position.set(5, 3, -4)
    scene.add(fillLight)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.13 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.24
    floor.receiveShadow = true
    scene.add(floor)

    const materials: Record<string, THREE.MeshStandardMaterial> = {
      shell: new THREE.MeshStandardMaterial({ color: '#424e4b', metalness: 0.67, roughness: 0.32 }),
      edge: new THREE.MeshStandardMaterial({ color: '#6b7772', metalness: 0.72, roughness: 0.25 }),
      rearPanel: new THREE.MeshStandardMaterial({ color: '#9ba6a5', metalness: 0.42, roughness: 0.48 }),
      keys: new THREE.MeshStandardMaterial({ color: '#202927', metalness: 0.18, roughness: 0.48 }),
      screen: new THREE.MeshStandardMaterial({ color: '#182e31', metalness: 0.16, roughness: 0.3, emissive: '#0a1718', emissiveIntensity: 0.4 }),
      accent: new THREE.MeshStandardMaterial({ color: '#8eb9e7', metalness: 0.25, roughness: 0.42 }),
      port: new THREE.MeshStandardMaterial({ color: '#151b1a', metalness: 0.7, roughness: 0.28 }),
    }

    const equipmentModel = new THREE.Group()
    equipmentModelRef.current = equipmentModel
    scene.add(equipmentModel)

    const addBox = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.MeshStandardMaterial,
      partId: string,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material.clone())
      mesh.position.set(...position)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData = { partId, baseColor: material.color.clone(), baseEmissive: material.emissive.clone(), baseEmissiveIntensity: material.emissiveIntensity }
      parent.add(mesh)
    }

    const addCylinder = (
      parent: THREE.Object3D,
      radius: number,
      depth: number,
      position: [number, number, number],
      material: THREE.MeshStandardMaterial,
      partId: string,
    ) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 20), material.clone())
      mesh.position.set(...position)
      mesh.rotation.x = Math.PI / 2
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData = { partId, baseColor: material.color.clone(), baseEmissive: material.emissive.clone(), baseEmissiveIntensity: material.emissiveIntensity }
      parent.add(mesh)
    }

    const addDiagonalBar = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.MeshStandardMaterial,
      partId: string,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material.clone())
      mesh.position.set(...position)
      mesh.rotation.z = 0.52
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData = { partId, baseColor: material.color.clone(), baseEmissive: material.emissive.clone(), baseEmissiveIntensity: material.emissiveIntensity }
      parent.add(mesh)
    }

    const addFrontRing = (x: number, y: number, radius: number, partId: string) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 32), materials.edge.clone())
      mesh.position.set(x, y, 0.815)
      mesh.castShadow = true
      mesh.userData = { partId, baseColor: materials.edge.color.clone(), baseEmissive: materials.edge.emissive.clone(), baseEmissiveIntensity: materials.edge.emissiveIntensity }
      equipmentModel.add(mesh)
    }

    if (equipmentId === 'notebook') {
      addBox(equipmentModel, [4.25, 0.2, 2.8], [0, 0, 0], materials.shell, 'case')
      addBox(equipmentModel, [4.08, 0.035, 2.64], [0, 0.115, 0], materials.edge, 'case')
      addBox(equipmentModel, [3.66, 0.025, 1.25], [0, 0.145, -0.47], materials.keys, 'keyboard')
      for (let row = 0; row < 4; row += 1) {
        const keyCount = row === 3 ? 10 : 13
        const keyWidth = row === 3 ? 0.25 : 0.22
        const gap = row === 3 ? 0.08 : 0.055
        const rowWidth = keyCount * keyWidth + (keyCount - 1) * gap
        for (let column = 0; column < keyCount; column += 1) {
          const x = -rowWidth / 2 + keyWidth / 2 + column * (keyWidth + gap)
          const z = -0.93 + row * 0.3
          addBox(equipmentModel, [keyWidth, 0.045, 0.19], [x, 0.18, z], materials.keys, 'keyboard')
        }
      }
      addBox(equipmentModel, [1.18, 0.025, 0.68], [0, 0.155, 0.91], materials.edge, 'touchpad')
      addBox(equipmentModel, [1.08, 0.012, 0.58], [0, 0.17, 0.91], materials.shell, 'touchpad')
      const displayGroup = new THREE.Group()
      displayGroup.position.set(0, 0.1, -1.31)
      displayGroup.rotation.x = -0.12
      equipmentModel.add(displayGroup)
      addBox(displayGroup, [4.16, 2.52, 0.14], [0, 1.25, 0], materials.shell, 'display')
      addBox(displayGroup, [3.91, 2.25, 0.035], [0, 1.27, 0.087], materials.screen, 'display')
      addBox(displayGroup, [0.7, 0.065, 0.012], [-1.35, 2.05, 0.111], materials.accent, 'display')
      addBox(displayGroup, [1.1, 0.035, 0.012], [-1.15, 1.83, 0.111], materials.edge, 'display')
      addBox(displayGroup, [0.6, 0.035, 0.012], [-1.4, 1.67, 0.111], materials.edge, 'display')
      addBox(displayGroup, [0.6, 0.035, 0.012], [-1.4, 1.51, 0.111], materials.edge, 'display')
      addBox(displayGroup, [1.22, 0.73, 0.018], [0.72, 1.63, 0.115], materials.edge, 'display')
      addBox(displayGroup, [0.62, 0.08, 0.018], [0.1, 0.95, 0.115], materials.accent, 'display')
      addBox(displayGroup, [0.035, 0.035, 0.035], [0, 2.43, 0.09], materials.edge, 'display')
      for (let portIndex = 0; portIndex < 3; portIndex += 1) {
        addBox(equipmentModel, [0.34, 0.055, 0.035], [-1.08 + portIndex * 0.52, 0.01, 1.414], materials.port, 'ports')
      }
      addBox(equipmentModel, [0.38, 0.055, 0.035], [1.08, 0.01, -1.414], materials.port, 'ports')
      addBox(equipmentModel, [0.38, 0.055, 0.035], [0.42, 0.01, -1.414], materials.port, 'ports')
    } else if (equipmentId === 'desktop') {
      addBox(equipmentModel, [1.32, 2.9, 1.55], [0, 1.48, 0], materials.shell, 'case')
      addBox(equipmentModel, [0.4, 2.72, 0.025], [-0.44, 1.48, 0.79], materials.port, 'case')
      for (let row = 0; row < 13; row += 1) {
        for (let column = 0; column < 5; column += 1) {
          addDiagonalBar(equipmentModel, [0.045, 0.2, 0.022], [-0.5 + column * 0.072, 0.24 + row * 0.205, 0.814], materials.edge, 'case')
        }
      }
      for (let row = 0; row < 5; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          addDiagonalBar(equipmentModel, [0.045, 0.2, 0.022], [-0.06 + column * 0.088, 0.22 + row * 0.17, 0.83], materials.edge, 'case')
        }
      }
      addFrontRing(0.2, 2.57, 0.12, 'front-panel')
      addCylinder(equipmentModel, 0.078, 0.035, [0.2, 2.57, 0.818], materials.keys, 'front-panel')
      addCylinder(equipmentModel, 0.025, 0.04, [0.2, 2.57, 0.842], materials.accent, 'front-panel')
      addCylinder(equipmentModel, 0.085, 0.035, [0.19, 1.98, 0.819], materials.port, 'ports')
      addCylinder(equipmentModel, 0.045, 0.04, [0.19, 1.98, 0.844], materials.keys, 'ports')
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 2; column += 1) {
          const x = 0.11 + column * 0.18
          const y = 1.69 - row * 0.22
          addBox(equipmentModel, [0.105, 0.17, 0.035], [x, y, 0.819], materials.port, 'ports')
          if (row === 1) addBox(equipmentModel, [0.035, 0.115, 0.04], [x, y, 0.842], materials.accent, 'ports')
        }
      }
      addBox(equipmentModel, [1.3, 2.78, 0.03], [0, 1.48, -0.79], materials.rearPanel, 'rear-ports')
      addBox(equipmentModel, [0.64, 0.98, 0.035], [-0.31, 2.15, -0.823], materials.port, 'rear-ports')
      for (let row = 0; row < 9; row += 1) {
        addBox(equipmentModel, [0.59, 0.025, 0.025], [-0.31, 1.77 + row * 0.095, -0.853], materials.edge, 'rear-ports')
      }
      for (let column = 0; column < 7; column += 1) {
        addBox(equipmentModel, [0.025, 0.84, 0.025], [-0.58 + column * 0.09, 2.15, -0.853], materials.edge, 'rear-ports')
      }
      for (let row = 0; row < 5; row += 1) {
        addBox(equipmentModel, [1.08, 0.025, 0.025], [0, 0.19 + row * 0.13, -0.823], materials.port, 'rear-ports')
      }
      addBox(equipmentModel, [0.8, 0.58, 0.04], [0, 0.51, -0.842], materials.keys, 'rear-ports')
      addBox(equipmentModel, [0.31, 0.19, 0.045], [0, 0.52, -0.883], materials.port, 'rear-ports')
      addBox(equipmentModel, [0.23, 0.12, 0.045], [0.44, 1.72, -0.824], materials.port, 'rear-ports')
      addBox(equipmentModel, [0.15, 0.13, 0.045], [0.22, 1.43, -0.824], materials.port, 'rear-ports')
      addBox(equipmentModel, [0.15, 0.13, 0.045], [0.43, 1.43, -0.824], materials.port, 'rear-ports')
      addBox(equipmentModel, [0.15, 0.13, 0.045], [0.22, 1.18, -0.824], materials.port, 'rear-ports')
      addBox(equipmentModel, [0.15, 0.13, 0.045], [0.43, 1.18, -0.824], materials.port, 'rear-ports')
      for (let portIndex = 0; portIndex < 2; portIndex += 1) {
        addBox(equipmentModel, [0.035, 0.09, 0.012], [0.22 + portIndex * 0.21, 1.43, -0.852], materials.accent, 'rear-ports')
        addBox(equipmentModel, [0.035, 0.09, 0.012], [0.22 + portIndex * 0.21, 1.18, -0.852], materials.accent, 'rear-ports')
      }
    } else if (equipmentId === 'phone') {
      addBox(equipmentModel, [1.32, 2.62, 0.16], [0, 1.32, 0], materials.edge, 'case')
      addBox(equipmentModel, [1.22, 2.48, 0.035], [0, 1.34, 0.112], materials.screen, 'display')
      addBox(equipmentModel, [0.22, 0.035, 0.012], [0, 2.47, 0.122], materials.keys, 'display')
      addCylinder(equipmentModel, 0.035, 0.025, [0, 2.39, 0.14], materials.port, 'cameras')
      addBox(equipmentModel, [0.07, 0.29, 0.05], [0.68, 1.92, 0], materials.edge, 'buttons')
      addBox(equipmentModel, [0.07, 0.43, 0.05], [0.68, 1.49, 0], materials.edge, 'buttons')
      addBox(equipmentModel, [0.1, 0.07, 0.035], [0, 0.04, 0], materials.port, 'ports')
      addBox(equipmentModel, [0.22, 0.035, 0.025], [-0.34, 0.04, 0.07], materials.keys, 'ports')
      addBox(equipmentModel, [0.22, 0.035, 0.025], [0.34, 0.04, 0.07], materials.keys, 'ports')
      addBox(equipmentModel, [0.48, 0.72, 0.025], [-0.32, 2.17, -0.097], materials.shell, 'cameras')
      for (const [x, y, radius] of [[-0.43, 2.38, 0.105], [-0.21, 2.38, 0.075], [-0.32, 2.08, 0.065]] as const) {
        addCylinder(equipmentModel, radius, 0.045, [x, y, -0.13], materials.port, 'cameras')
        addCylinder(equipmentModel, radius * 0.52, 0.05, [x, y, -0.158], materials.accent, 'cameras')
      }
    } else {
      addBox(equipmentModel, [4.35, 2.72, 0.16], [0, 2.18, 0], materials.shell, 'bezel')
      addBox(equipmentModel, [4.08, 2.43, 0.035], [0, 2.2, 0.112], materials.screen, 'display')
      addBox(equipmentModel, [0.12, 0.055, 0.014], [1.7, 0.82, 0.105], materials.accent, 'buttons')
      addBox(equipmentModel, [0.12, 0.055, 0.014], [1.53, 0.82, 0.105], materials.edge, 'buttons')
      addBox(equipmentModel, [0.12, 0.055, 0.014], [1.36, 0.82, 0.105], materials.edge, 'buttons')
      addBox(equipmentModel, [0.42, 1.22, 0.18], [0, 0.75, -0.08], materials.edge, 'stand')
      addBox(equipmentModel, [1.35, 0.12, 0.72], [0, 0.08, 0.22], materials.shell, 'stand')
      for (let portIndex = 0; portIndex < 4; portIndex += 1) {
        addBox(equipmentModel, [0.22, 0.1, 0.035], [-0.46 + portIndex * 0.3, 0.86, -0.105], materials.port, 'ports')
      }
    }

    if (equipmentId === 'desktop') equipmentModel.scale.set(0.9, 1, 1.8)

    // Center the complete equipment before saving the reset position.
    new THREE.Box3().setFromObject(equipmentModel).getCenter(cameraTarget)
    controls.target.copy(cameraTarget)
    camera.position.copy(cameraTarget).add(cameraOffset)
    camera.lookAt(cameraTarget)
    controls.update()
    controls.saveState()
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onCanvasClick = (event: MouseEvent) => {
      const bounds = canvas.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(equipmentModel.children, true).find((item) => item.object.userData.partId)
      if (hit) onSelectPart(hit.object.userData.partId as string)
    }
    canvas.addEventListener('click', onCanvasClick)

    const resizeRenderer = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resizeRenderer)
    resizeRenderer()
    resizeObserver.observe(canvas.parentElement ?? canvas)

    let frameId = 0
    const animate = () => {
      frameId = window.requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      if (viewAnimationRef.current !== null) {
        window.cancelAnimationFrame(viewAnimationRef.current)
        viewAnimationRef.current = null
      }
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      canvas.removeEventListener('click', onCanvasClick)
      controls.dispose()
      controlsRef.current = null
      equipmentModelRef.current = null
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material.dispose()
        }
      })
      renderer.dispose()
      sceneRef.current = null
    }
  }, [equipmentId, onSelectPart])

  useEffect(() => {
    if (viewAnimationRef.current !== null) {
      window.cancelAnimationFrame(viewAnimationRef.current)
      viewAnimationRef.current = null
    }

    const equipmentModel = equipmentModelRef.current
    const controls = controlsRef.current
    if (!equipmentModel || !controls) return
    if (!selectedPartId) {
      resetView()
      return
    }

    const currentRotation = equipmentModel.rotation.y
    equipmentModel.rotation.y = 0
    equipmentModel.updateMatrixWorld(true)
    const selectedBounds = new THREE.Box3()
    let hasSelectedMeshes = false
    equipmentModel.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.partId !== selectedPartId) return
      selectedBounds.expandByObject(object)
      hasSelectedMeshes = true
    })
    if (!hasSelectedMeshes) {
      equipmentModel.rotation.y = currentRotation
      equipmentModel.updateMatrixWorld(true)
      return
    }

    const selectedCenter = selectedBounds.getCenter(new THREE.Vector3())
    const startTarget = controls.target.clone()
    const startPosition = controls.object.position.clone()
    const cameraOffset = startPosition.clone().sub(startTarget)
    const currentCameraAngle = Math.atan2(cameraOffset.x, cameraOffset.z)
    const initialCameraAngle = Math.atan2(5.5, 6.7)
    const isRearFacingPart = (equipmentId === 'desktop' && selectedPartId === 'rear-ports')
      || (equipmentId === 'monitor' && selectedPartId === 'ports')
      || (equipmentId === 'phone' && selectedPartId === 'cameras')
    const targetRotation = currentCameraAngle - initialCameraAngle + (isRearFacingPart ? Math.PI : 0)
    const rotationDelta = THREE.MathUtils.euclideanModulo(targetRotation - currentRotation + Math.PI, Math.PI * 2) - Math.PI
    const nextRotation = currentRotation + rotationDelta
    const nextTarget = selectedCenter.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), nextRotation)
    equipmentModel.rotation.y = currentRotation
    equipmentModel.updateMatrixWorld(true)
    const targetDelta = nextTarget.clone().sub(startTarget)
    const nextPosition = startPosition.clone().add(targetDelta)
    const animationStart = performance.now()
    const animationDuration = 420

    const animateFocus = (now: number) => {
      const progress = Math.min((now - animationStart) / animationDuration, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      equipmentModel.rotation.y = currentRotation + rotationDelta * easedProgress
      controls.target.lerpVectors(startTarget, nextTarget, easedProgress)
      controls.object.position.lerpVectors(startPosition, nextPosition, easedProgress)
      controls.update()

      if (progress < 1) {
        viewAnimationRef.current = window.requestAnimationFrame(animateFocus)
      } else {
        viewAnimationRef.current = null
      }
    }

    viewAnimationRef.current = window.requestAnimationFrame(animateFocus)
    return () => {
      if (viewAnimationRef.current !== null) {
        window.cancelAnimationFrame(viewAnimationRef.current)
        viewAnimationRef.current = null
      }
    }
  }, [equipmentId, selectedPartId, resetView])

  useEffect(() => {
    sceneRef.current?.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.userData.partId) return
      const part = parts.find((item) => item.id === object.userData.partId)
      const material = object.material as THREE.MeshStandardMaterial
      const isSelected = object.userData.partId === selectedPartId
      material.color.copy(object.userData.baseColor as THREE.Color)
      material.emissive.copy(object.userData.baseEmissive as THREE.Color)
      material.emissiveIntensity = object.userData.baseEmissiveIntensity as number
      if (part?.status === 'damaged') {
        material.color.set('#d86b51')
        material.emissive.set('#501d13')
        material.emissiveIntensity = 0.18
      } else if (isSelected) {
        material.color.copy(object.userData.baseColor as THREE.Color).lerp(new THREE.Color('#52d68b'), 0.42)
        material.emissive.set('#17482d')
        material.emissiveIntensity = 0.24
      }
    })
  }, [parts, selectedPartId])

  return (
    <div className="model-column">
      <div className="model-toolbar">
        <div className="view-label"><span className="live-dot" /> MODELO INTERATIVO <span className="view-divider">/</span> VISTA 3D</div>
        <button className="icon-button view-reset" type="button" title="Reiniciar orientação" aria-label="Reiniciar orientação" onClick={resetView}><RotateCcw size={15} /></button>
      </div>
      <div className="model-stage">
        <canvas ref={canvasRef} className="equipment-canvas" aria-label={`Modelo 3D de ${equipmentCatalog.find((item) => item.id === equipmentId)?.name}. Clique em uma peça para selecioná-la e arraste para girar.`} />
        <div className="model-corner-label"><span>01</span> / 01</div>
        <div className="axis-cue" aria-hidden="true"><ArrowUpRight size={13} /><ArrowDownLeft size={13} /></div>
      </div>
      <div className="model-legend">
        <span><i className="legend-swatch selected-swatch" /> Peça selecionada</span>
        <span><i className="legend-swatch damaged-swatch" /> Dano registrado</span>
        <span className="drag-hint">Arraste para girar <span>·</span> scroll para aproximar</span>
      </div>
    </div>
  )
}

export default EquipmentModel
