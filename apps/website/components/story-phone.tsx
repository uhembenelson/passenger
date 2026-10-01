"use client";

// Adapted from Baddie.ng StoryPhone and its prepared rounded handset.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export type StoryPhoneProps = {
  screenSrc: string
  videoSrc?: string
  className?: string
  /** Radians, applied after the model's upright basis transform. */
  rotation?: [number, number, number]
  /** true uses the intro camera; 0–2 smoothly varies depth without reloading. */
  perspective?: boolean | number
  /** Match CSS enlargement without changing the handset's geometry. */
  renderScale?: number
  label: string
}

// Matches the refined GLB's native-capture screen geometry, not the old palette face.
const SCREEN_ASPECT = 1206 / 2622
const MODEL_URL = '/landing-story/phone-rounded.glb'

/** Fractions of the screen occupied by the complete, proportionally fitted image. */
function storyScreenContain(width: number, height: number): [number, number] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid screen image dimensions')
  }
  const aspect = width / height
  return aspect > SCREEN_ASPECT ? [1, SCREEN_ASPECT / aspect] : [aspect / SCREEN_ASPECT, 1]
}

function createStoryScreenMaterial(texture: THREE.Texture) {
  const image = texture.image as { width: number; height: number }
  const fit = storyScreenContain(image.width || (image as HTMLVideoElement).videoWidth, image.height || (image as HTMLVideoElement).videoHeight)
  texture.flipY = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  const material = new THREE.MeshBasicMaterial({
    name: 'BaddieScreen', map: texture, toneMapped: false,
    side: THREE.FrontSide, depthTest: true, depthWrite: true,
  })
  // Keep the GLB contour and UVs. Sample the entire image inside a centred fit
  // rectangle, with opaque black bars outside it, instead of stretching/cropping.
  material.onBeforeCompile = shader => {
    shader.uniforms.storyScreenFit = { value: new THREE.Vector2(...fit) }
    shader.fragmentShader = `uniform vec2 storyScreenFit;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 screenUv = (vMapUv - 0.5) / storyScreenFit + 0.5;
          vec2 inside = step(vec2(0.0), screenUv) * step(screenUv, vec2(1.0));
          vec4 screenColor = texture2D(map, clamp(screenUv, 0.0, 1.0));
          diffuseColor *= mix(vec4(0.0, 0.0, 0.0, 1.0), screenColor, inside.x * inside.y);
        #endif
      `)
  }
  material.customProgramCacheKey = () => 'story-screen-contain-v1'
  return material
}

function createStoryPhoneRoot(model: THREE.Object3D) {
  // Geometry contract in landing-phone-asset-readiness.md. Keep both primitives
  // together so the original back and casing occlude the screen during turns.
  model.position.set(-0.000730630, -0.007362305, 0)
  const basis = new THREE.Group()
  basis.rotation.x = Math.PI / 2
  basis.scale.setScalar(1 / 0.225274801)
  basis.add(model)
  const root = new THREE.Group()
  root.add(basis)
  return root
}

/** Owns only independently loaded resources, never cached/shared scene clones. */
function disposeStoryPhone(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  })
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(material => material.dispose())
  const bitmaps = new Set<ImageBitmap>()
  textures.forEach(texture => {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) bitmaps.add(texture.image)
    texture.dispose()
  })
  bitmaps.forEach(bitmap => bitmap.close())
}

function StoryPhoneScene({ videoSrc, screenSrc, className, rotation = [0, 0, 0], perspective = false, renderScale = 1, label }: StoryPhoneProps) {
  const [rotationX, rotationY, rotationZ] = rotation
  const hostRef = useRef<HTMLDivElement>(null)
  const controller = useRef<{
    setRotation: (x: number, y: number, z: number) => void
    setPerspective: (value: boolean | number) => void
    loadScreen: (src: string) => void
    resize: () => void
  } | null>(null)
  const latestRotation = useRef(rotation)
  latestRotation.current = rotation
  const latestSource = useRef(screenSrc)
  latestSource.current = screenSrc
  const latestPerspective = useRef(perspective)
  latestPerspective.current = perspective
  const latestRenderScale = useRef(renderScale)
  latestRenderScale.current = renderScale
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [imageFailed, setImageFailed] = useState(false)
  const [screenFailed, setScreenFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let stopped = false
    let frame = 0
    let video: HTMLVideoElement | undefined
    let visibility: IntersectionObserver | undefined
    let renderer: THREE.WebGLRenderer | undefined
    let observer: ResizeObserver | undefined
    let model: THREE.Object3D | undefined
    let texture: THREE.Texture | undefined
    let root: THREE.Group | undefined
    let width = 0
    let height = 0
    let shaderFailed = false
    let screenRequest = 0
    let requestedSource: string | undefined
    const scene = new THREE.Scene()
    const orthographic = new THREE.OrthographicCamera(-0.65, 0.65, 0.65, -0.65, 0.01, 10)
    orthographic.position.z = 3
    const perspectiveCamera = new THREE.PerspectiveCamera(23.35, 1, 0.01, 10)
    let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = orthographic
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2))
    const key = new THREE.DirectionalLight(0xffffff, 2.5)
    key.position.set(2, 3, 4)
    scene.add(key)

    const release = () => {
      stopped = true
      cancelAnimationFrame(frame)
      frame = 0
      observer?.disconnect()
      visibility?.disconnect()
      video?.pause()
      video?.removeAttribute('src')
      video?.load()
      window.removeEventListener('resize', resize)
      controller.current = null
      if (renderer) {
        renderer.domElement.removeEventListener('webglcontextlost', contextLost)
        renderer.domElement.remove()
        renderer.dispose()
        renderer.forceContextLoss()
        renderer = undefined
      }
      if (model) {
        // The screenshot is disposed separately, exactly once.
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material instanceof THREE.MeshBasicMaterial && material.map === texture) material.map = null
          }
        })
        disposeStoryPhone(model)
        model = undefined
      }
      texture?.dispose()
      texture = undefined
    }
    const fail = () => {
      if (stopped) return
      release()
      setStatus('failed')
    }
    function contextLost(event: Event) {
      event.preventDefault()
      fail()
    }
    function requestRender() {
      if (stopped || frame || !root || !texture || !renderer || width <= 0 || height <= 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (stopped || !renderer) return
        try {
          renderer.render(scene, camera)
          if (shaderFailed) fail()
          else if (!stopped) {
            setStatus('ready')
            if (video && !video.paused) requestRender()
          }
        } catch {
          fail()
        }
      })
    }
    function fitCamera(value: boolean | number) {
      if (width <= 0 || height <= 0) return
      const strength = typeof value === 'boolean' ? Number(value) : Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 0
      // Tiny perspective strengths are visually orthographic. Avoid infinite
      // camera distance and loss of screen/casing depth precision at the limit.
      camera = strength >= 0.0001 ? perspectiveCamera : orthographic
      const aspect = width / height
      const halfHeight = 0.62 / Math.min(1, aspect)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.position.z = 3 / strength
        camera.near = camera.position.z - 1
        camera.far = camera.position.z + 1
        camera.aspect = aspect
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight / camera.position.z))
      } else {
        camera.left = -halfHeight * aspect
        camera.right = halfHeight * aspect
        camera.top = halfHeight
        camera.bottom = -halfHeight
      }
      camera.updateProjectionMatrix()
      requestRender()
    }
    function resize() {
      if (stopped || !renderer) return
      try {
        width = host!.clientWidth
        height = host!.clientHeight
        if (width <= 0 || height <= 0) return
        const scale = Number.isFinite(latestRenderScale.current) ? Math.max(1, Math.min(2.15, latestRenderScale.current)) : 1
        renderer.setPixelRatio(Math.min(Math.min(window.devicePixelRatio || 1, 2) * scale, 4))
        renderer.setSize(width, height, false)
        fitCamera(latestPerspective.current)
      } catch {
        fail()
      }
    }

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.debug.onShaderError = () => { shaderFailed = true }
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setClearColor(0x000000, 0)
      renderer.domElement.setAttribute('aria-hidden', 'true')
      renderer.domElement.addEventListener('webglcontextlost', contextLost)
      host.appendChild(renderer.domElement)
      observer = new ResizeObserver(resize)
      observer.observe(host)
      window.addEventListener('resize', resize)
      resize()
      if (stopped) return release

      function bindScreen(loaded: THREE.Texture) {
        if (!model) return
        const screen = createStoryScreenMaterial(loaded)
        const replaced = new Set<THREE.Material>()
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          const replace = (material: THREE.Material) => {
            if (material.name !== 'BaddieScreen') return material
            replaced.add(material)
            return screen
          }
          object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material)
        })
        if (!replaced.size) { screen.dispose(); throw new Error('Prepared phone has no BaddieScreen material') }
        replaced.forEach(material => material.dispose())
      }

      function loadScreen(src: string) {
        if (stopped || src === requestedSource) return
        requestedSource = src
        const request = ++screenRequest
        setScreenFailed(false)
        setImageFailed(false)
        // Do not hide or destroy the previous screen while a new image loads.
        void new THREE.TextureLoader().loadAsync(src).then(loaded => {
          if (stopped || request !== screenRequest) { loaded.dispose(); return }
          try {
            bindScreen(loaded)
          } catch {
            loaded.dispose()
            fail()
            return
          }
          const previous = texture
          texture = loaded
          previous?.dispose()
          requestRender()
        }).catch(() => {
          if (stopped || request !== screenRequest) return
          if (!texture) fail()
          else setScreenFailed(true)
        })
      }

      // Each late callback owns and disposes its own resources. The model and
      // renderer live for the component lifetime, independent of screen changes.
      void new GLTFLoader().loadAsync(MODEL_URL).then(gltf => {
        if (stopped) { disposeStoryPhone(gltf.scene); return }
        model = gltf.scene
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material instanceof THREE.MeshStandardMaterial && material.name !== 'BaddieScreen') {
              material.map = null
              material.color.set('#244b3c')
              material.metalness = 0.55
              material.roughness = 0.32
              material.needsUpdate = true
            }
          }
        })
        if (texture) bindScreen(texture)
        root = createStoryPhoneRoot(model)
        // Estimate from saved 07/12/19 holds (~560px bounding height). A neutral
        // device is 550px tall in an 800×800 host: 800 * .8525 / (2 * .62).
        // Leave camera fit unchanged for narrow hosts and all-axis rotation.
        root.scale.setScalar(0.8525)
        root.rotation.set(...latestRotation.current)
        scene.add(root)
        requestRender()
      }).catch(fail)
      controller.current = {
        setRotation(x, y, z) { root?.rotation.set(x, y, z); requestRender() },
        setPerspective: fitCamera,
        loadScreen,
        resize,
      }
      loadScreen(latestSource.current)
      if (videoSrc && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        video = document.createElement('video')
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.preload = 'metadata'
        video.src = videoSrc
        const activeVideo = video
        video.addEventListener('loadeddata', () => {
          if (stopped) return
          screenRequest++
          const loaded = new THREE.VideoTexture(activeVideo)
          try { bindScreen(loaded) } catch { loaded.dispose(); fail(); return }
          const previous = texture
          texture = loaded
          previous?.dispose()
          requestRender()
        })
        video.addEventListener('play', requestRender)
        visibility = new IntersectionObserver(entries => {
          if (entries[0]?.isIntersecting && !document.hidden) {
            void activeVideo.play().catch(() => {})
          } else activeVideo.pause()
        }, { threshold: 0.1 })
        visibility.observe(host)
      }
    } catch {
      fail()
    }
    return release
  }, [])

  useEffect(() => {
    controller.current?.setRotation(rotationX, rotationY, rotationZ)
    controller.current?.setPerspective(perspective)
  }, [rotationX, rotationY, rotationZ, perspective])

  useEffect(() => { controller.current?.loadScreen(screenSrc) }, [screenSrc])
  useEffect(() => { controller.current?.resize() }, [renderScale])

  return (
    <div className={['passenger-phone', className].filter(Boolean).join(' ')} role="img"
      aria-label={imageFailed ? `${label}. Screen preview unavailable.` : screenFailed ? `${label}. Previous screen shown; new screen unavailable.` : label}
      data-status={status}>
      <div ref={hostRef} className="passenger-phone__canvas" aria-hidden="true" />
      {status !== 'ready' && (
        <div className="passenger-phone__fallback">
          {!imageFailed && <img src={screenSrc} alt="" onError={() => setImageFailed(true)} />}
          {(status === 'failed' || imageFailed) && <span>{imageFailed ? 'Screen preview unavailable.' : '3D preview unavailable.'}</span>}
        </div>
      )}
      {status === 'ready' && screenFailed && <span className="passenger-phone__error">New screen unavailable. Previous screen shown.</span>}
    </div>
  )
}

/** Screens update independently; the loaded model, renderer and pose remain mounted. */
export function StoryPhone(props: StoryPhoneProps) {
  return <StoryPhoneScene {...props} />
}
