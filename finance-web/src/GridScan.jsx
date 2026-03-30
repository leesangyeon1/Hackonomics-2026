import { BloomEffect, ChromaticAberrationEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import './GridScan.css'

const vert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const frag = `
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float uLineThickness;
uniform vec3 uLinesColor;
uniform vec3 uScanColor;
uniform float uGridScale;
uniform float uScanOpacity;
uniform float uNoise;
varying vec2 vUv;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  float scale = max(0.01, uGridScale);

  // Perspective-style grid projection in screen space.
  float depth = 1.2 + max(0.0, p.y + 0.7) * 2.4;
  vec2 warped = vec2(p.x * 1.5, p.y + 0.85) / (depth * scale);
  warped.y += iTime * 0.16;

  float fx = abs(fract(warped.x) - 0.5);
  float fy = abs(fract(warped.y) - 0.5);
  float wx = fwidth(warped.x);
  float wy = fwidth(warped.y);
  float tx = max(wx * 0.3, uLineThickness * wx * 0.65);
  float ty = max(wy * 0.3, uLineThickness * wy * 0.65);
  float gx = 1.0 - smoothstep(tx, tx + wx, fx);
  float gy = 1.0 - smoothstep(ty, ty + wy, fy);
  float gridMask = max(gx, gy);

  float horizonFade = smoothstep(-0.95, -0.15, p.y);
  float sideFade = 1.0 - smoothstep(0.75, 1.25, abs(p.x));
  float depthFade = horizonFade * sideFade;

  // Moving scan line sweeping bottom -> top repeatedly.
  float scanY = fract(iTime * 0.22);
  float band = exp(-pow((vUv.y - scanY) / 0.055, 2.0));
  float scanBand = band * (0.55 + 0.45 * depthFade);

  vec3 color = uLinesColor * gridMask * depthFade + uScanColor * scanBand * uScanOpacity;
  float n = fract(sin(dot(gl_FragCoord.xy + vec2(iTime * 73.1), vec2(12.9898, 78.233))) * 43758.5453);
  color += (n - 0.5) * uNoise;
  color = clamp(color, 0.0, 1.0);
  float alpha = clamp(max(gridMask * depthFade, scanBand * uScanOpacity), 0.0, 1.0);
  fragColor = vec4(color, alpha);
}

void main() {
  vec4 c;
  mainImage(c, vUv * iResolution.xy);
  gl_FragColor = c;
}
`

function srgbColor(hex) {
  const c = new THREE.Color(hex)
  return c.convertSRGBToLinear()
}

function GridScan({
  lineThickness = 1,
  linesColor = '#392e4e',
  scanColor = '#FF9FFC',
  scanOpacity = 0.4,
  gridScale = 0.1,
  enablePost = true,
  bloomIntensity = 0.6,
  chromaticAberration = 0.002,
  noiseIntensity = 0.01,
  className,
  style,
}) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const composerRef = useRef(null)
  const materialRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    rendererRef.current = renderer
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    const uniforms = {
      iResolution: { value: new THREE.Vector3(container.clientWidth, container.clientHeight, renderer.getPixelRatio()) },
      iTime: { value: 0 },
      uLineThickness: { value: lineThickness },
      uLinesColor: { value: srgbColor(linesColor) },
      uScanColor: { value: srgbColor(scanColor) },
      uGridScale: { value: gridScale },
      uScanOpacity: { value: scanOpacity },
      uNoise: { value: noiseIntensity },
    }

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })
    materialRef.current = material

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    scene.add(quad)

    if (enablePost) {
      const composer = new EffectComposer(renderer)
      composerRef.current = composer
      composer.addPass(new RenderPass(scene, camera))
      const bloom = new BloomEffect({ intensity: 1.0 })
      bloom.blendMode.opacity.value = Math.max(0, bloomIntensity)
      const chroma = new ChromaticAberrationEffect({
        offset: new THREE.Vector2(chromaticAberration, chromaticAberration),
        radialModulation: true,
      })
      const effectPass = new EffectPass(camera, bloom, chroma)
      effectPass.renderToScreen = true
      composer.addPass(effectPass)
    }

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight)
      uniforms.iResolution.value.set(container.clientWidth, container.clientHeight, renderer.getPixelRatio())
      composerRef.current?.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', onResize)

    const tick = (ts) => {
      uniforms.iTime.value = ts / 1000
      if (composerRef.current) composerRef.current.render()
      else renderer.render(scene, camera)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
      quad.geometry.dispose()
      material.dispose()
      composerRef.current?.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [bloomIntensity, chromaticAberration, enablePost, gridScale, lineThickness, linesColor, noiseIntensity, scanColor, scanOpacity])

  return <div ref={containerRef} className={`gridscan${className ? ` ${className}` : ''}`} style={style} />
}

export default GridScan
