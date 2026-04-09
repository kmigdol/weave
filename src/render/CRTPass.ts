import { ShaderMaterial, Uniform, Vector2 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * CRT post-process pass: scanlines, subtle chromatic aberration, and a
 * vignette. This is the aesthetic unifier the design doc calls out — it
 * runs on the final framebuffer from day one so every subsequent visual
 * pass (WEA-3 assets, etc.) automatically picks up the 32-bit look.
 */
export function makeCRTPass(resolution: Vector2): ShaderPass {
  const material = new ShaderMaterial({
    uniforms: {
      tDiffuse: new Uniform(null),
      uResolution: new Uniform(resolution.clone()),
      uTime: new Uniform(0),
      uScanlineIntensity: new Uniform(0.18),
      uChromaOffset: new Uniform(0.0015),
      uVignetteStrength: new Uniform(0.55),
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });

  const pass = new ShaderPass(material, 'tDiffuse');
  return pass;
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uScanlineIntensity;
  uniform float uChromaOffset;
  uniform float uVignetteStrength;

  varying vec2 vUv;

  void main() {
    // Chromatic aberration: sample R and B channels with a small offset.
    vec2 uv = vUv;
    float r = texture2D(tDiffuse, uv + vec2(uChromaOffset, 0.0)).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uv - vec2(uChromaOffset, 0.0)).b;
    vec3 color = vec3(r, g, b);

    // Scanlines modulated by vertical pixel position.
    float scan = sin(uv.y * uResolution.y * 1.2) * 0.5 + 0.5;
    color *= 1.0 - (scan * uScanlineIntensity);

    // Vignette: darken corners radially.
    vec2 centered = uv - 0.5;
    float dist = length(centered);
    float vignette = smoothstep(0.8, 0.2, dist);
    color *= mix(1.0, vignette, uVignetteStrength);

    gl_FragColor = vec4(color, 1.0);
  }
`;
