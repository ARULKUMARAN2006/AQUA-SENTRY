import * as THREE from 'three';
import { LAKE } from './config';
import { WAVE_GLSL, TERRAIN_GLSL, waveUniformsData } from './waves';

/**
 * WaterSurface — the lake surface.
 *
 * Reflection policy (deliberate): the water is rendered as a *diffuse* body of
 * water. There is no planar render target, no environment map, no screen-space
 * reflection and no cube/probe sampling anywhere in this material, so nothing
 * from the shore (trees, terrain, hull, rocks) can ever be mirrored into the
 * surface. Metalness is effectively 0 and the Fresnel term is capped at ~0.1.
 *
 * Realism comes from the wave field instead:
 *   • vertex displacement from the shared wave table (matches the buoyancy)
 *   • analytic + high-frequency detail normals for ripples and small chop
 *   • depth-attenuated body colour using the same terrain function
 *   • algae tint driven by the shared lake concentration
 *   • a weak sun glint computed from the wave normals only
 *   • shore foam and a hull wake
 */
export class WaterSurface {
  constructor(scene) {
    this.scene = scene;
    this.underwater = false;
    this._build();
  }

  _build() {
    const geo = new THREE.PlaneGeometry(LAKE.waterSize, LAKE.waterSize, LAKE.waterSegments, LAKE.waterSegments);
    geo.rotateX(-Math.PI / 2);

    const waveData = waveUniformsData();

    this.uniforms = {
      uTime: { value: 0 },
      uWaves: { value: waveData },
      uWaveAmp: { value: [0.085, 0.055, 0.030, 0.016].map((a) => new THREE.Vector4(a, 0, 0, 0)) },
      uSunDir: { value: new THREE.Vector3(0.42, 0.72, 0.55).normalize() },
      uSunColor: { value: new THREE.Color(0xfff3d6) },
      uSkyTop: { value: new THREE.Color(0x5b9bd6) },
      uSkyHorizon: { value: new THREE.Color(0xd8e9f5) },
      uDeep: { value: new THREE.Color(0x1d6a6b) },
      uShallow: { value: new THREE.Color(0x54b094) },
      uAlgaeTint: { value: new THREE.Color(0x5a9433) },
      uAlgae: { value: 0.4 },
      uLakeRadius: { value: LAKE.radius },
      uShoreWidth: { value: LAKE.shoreWidth },
      uWakePos: { value: new THREE.Vector3() },
      uWakeDir: { value: new THREE.Vector3(0, 0, 1) },
      uWakeStrength: { value: 0 },
      uUnderwater: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
      // No envMap, no reflectivity, no metalness: purely a custom diffuse shader.
      envMap: null,
      vertexShader: /* glsl */`
        ${WAVE_GLSL}
        ${TERRAIN_GLSL}
        uniform float uTime;
        uniform vec3 uWakePos;
        uniform vec3 uWakeDir;
        uniform float uWakeStrength;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        varying float vWake;

        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h; vec2 grad;
          addWaves(wp.xz, uTime, h, grad);

          // Hull wake: a decaying V behind the boat plus local chop.
          float wake = 0.0;
          if (uWakeStrength > 0.001) {
            vec2 d = wp.xz - uWakePos.xz;
            vec2 fwd = normalize(uWakeDir.xz);
            float along = dot(d, fwd);
            float side  = abs(dot(d, vec2(-fwd.y, fwd.x)));
            float band = exp(-pow(side * 1.7 - along * 0.35, 2.0) * 1.6);
            float trail = exp(-max(0.0, -along) * 0.10) * step(-1.0, along) * step(along, 0.35);
            float turb = sin(along * 7.0 - uTime * 6.0) * 0.5 + 0.5;
            wake = band * trail * turb * uWakeStrength;
            h += wake * 0.055;
            grad += vec2(cos(along * 7.0 - uTime * 6.0) * 0.12) * wake * uWakeStrength;
          }

          wp.y += h;
          vWake = wake;
          vWorldPos = wp.xyz;
          vNormalW = normalize(vec3(-grad.x, 1.0, -grad.y));
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        ${WAVE_GLSL}
        ${TERRAIN_GLSL}
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyTop;
        uniform vec3 uSkyHorizon;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uAlgaeTint;
        uniform float uAlgae;
        uniform vec3 uCameraPos;
        uniform float uUnderwater;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        varying float vWake;

        // High-frequency ripple normals. Purely analytic: nothing is sampled
        // from an environment or reflection texture.
        vec3 detailNormal(vec2 p, float t) {
          float k1 = 2.1, k2 = 3.7, k3 = 6.3, k4 = 11.0;
          float a1 = 0.012, a2 = 0.007, a3 = 0.004, a4 = 0.0022;
          float dx = a1 * k1 * cos(p.x * k1 + t * 1.7)
                   + a2 * k2 * cos(p.y * k2 * 1.3 - t * 2.1)
                   + a3 * k3 * cos((p.x + p.y) * k3 * 0.7 + t * 2.9)
                   + a4 * k4 * cos((p.x * 0.6 - p.y) * k4 + t * 3.7);
          float dz = a1 * k1 * cos(p.x * k1 + t * 1.7) * 0.6
                   + a2 * k2 * cos(p.y * k2 * 1.3 - t * 2.1)
                   + a3 * k3 * cos((p.x - p.y) * k3 * 0.7 + t * 3.3)
                   + a4 * k4 * cos((p.y * 0.6 + p.x) * k4 - t * 4.1);
          return normalize(vec3(-dx * 3.0, 1.0, -dz * 3.0));
        }

        void main() {
          vec3 viewVec = uCameraPos - vWorldPos;
          float viewDist = length(viewVec);
          vec3 V = viewVec / max(viewDist, 0.0001);

          // Ripple detail fades with distance to avoid aliasing.
          float detailFade = exp(-viewDist * 0.045);
          vec3 N = normalize(mix(vNormalW, detailNormal(vWorldPos.xz, uTime), detailFade * 0.9));
          if (uUnderwater > 0.5) N = -N;

          // Deliberately tiny Fresnel: a diffuse pond, not a mirror.
          float grazing = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
          float fres = 0.02 + 0.13 * grazing;

          // Body colour: depth attenuation toward the shore + algae load.
          float bed = terrainHeightGLSL(vWorldPos.xz);
          float depth = clamp(-bed / 7.5, 0.0, 1.0);
          vec3 body = mix(uShallow, uDeep, smoothstep(0.05, 0.95, depth));
          body = mix(body, uAlgaeTint, uAlgae * 0.30 * (1.0 - depth * 0.35));

          // Diffuse sky tint (a colour, not a reflected image).
          vec3 R = reflect(-V, N);
          float up = clamp(R.y, 0.0, 1.0);
          vec3 sky = mix(uSkyHorizon, uSkyTop, pow(up, 0.55));

          // Weak sun glint derived from wave normals only.
          vec3 H = normalize(uSunDir + V);
          float ndh = max(dot(N, H), 0.0);
          float spec = pow(ndh, 300.0) * 0.5 + pow(ndh, 30.0) * 0.045;

          vec3 col = mix(body, sky, fres) + uSunColor * spec;

          // Slow sub-surface shimmer keeps the surface alive with no reflections.
          float shimmer = sin(vWorldPos.x * 0.9 + uTime * 1.1)
                        * sin(vWorldPos.z * 1.13 - uTime * 0.9);
          col += vec3(0.05, 0.08, 0.08) * (shimmer * 0.5 + 0.5) * (1.0 - fres);

          // Shore foam and hull-wake foam.
          float shoreFoam = smoothstep(0.55, 0.0, depth) * 0.35;
          col = mix(col, vec3(0.92, 0.95, 0.96), shoreFoam * 0.6);
          col = mix(col, vec3(0.85, 0.92, 0.93), clamp(vWake * 1.6, 0.0, 0.7));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = 0;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    this.scene.add(this.mesh);

    // Underwater variant: the surface seen from below is a murky ceiling.
    this.underwaterUniforms = {
      uTime: this.uniforms.uTime,
      uWaves: this.uniforms.uWaves,
      uWaveAmp: this.uniforms.uWaveAmp,
      uSunDir: this.uniforms.uSunDir,
      uAlgae: this.uniforms.uAlgae,
      uCameraPos: this.uniforms.uCameraPos,
      uMurk: { value: new THREE.Color(0x11403c) },
    };
    this.underwaterMaterial = new THREE.ShaderMaterial({
      uniforms: this.underwaterUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMap: null,
      vertexShader: /* glsl */`
        ${WAVE_GLSL}
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec3 vN;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h; vec2 grad;
          addWaves(wp.xz, uTime, h, grad);
          wp.y += h;
          vWorldPos = wp.xyz;
          vN = normalize(vec3(-grad.x, 1.0, -grad.y));
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uCameraPos;
        uniform vec3 uMurk;
        varying vec3 vWorldPos;
        varying vec3 vN;
        void main() {
          vec3 V = normalize(vWorldPos - uCameraPos);
          float f = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
          vec3 col = mix(uMurk * 0.55, vec3(0.55, 0.78, 0.82), f * 0.6);
          gl_FragColor = vec4(col, clamp(0.35 + f * 0.4, 0.0, 1.0));
        }
      `,
    });
  }

  setUnderwater(on) {
    if (this.underwater === on) return;
    this.underwater = on;
    this.mesh.material = on ? this.underwaterMaterial : this.material;
    this.mesh.renderOrder = on ? 12 : 1;
  }

  /**
   * @param {number} elapsed seconds
   * @param {object} opts { algae, robotPos, robotForward, speed, cameraPos }
   */
  update(elapsed, opts) {
    const u = this.uniforms;
    u.uTime.value = elapsed;
    if (opts.cameraPos) u.uCameraPos.value.copy(opts.cameraPos);
    if (opts.algae !== undefined) u.uAlgae.value = opts.algae;

    if (opts.robotPos) {
      u.uWakePos.value.copy(opts.robotPos);
      if (opts.robotForward) u.uWakeDir.value.copy(opts.robotForward);
      u.uWakeStrength.value = Math.min(1, Math.abs(opts.speed || 0) / 2.4);
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.underwaterMaterial.dispose();
    this.scene.remove(this.mesh);
  }
}
