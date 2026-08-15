// Turning a flat rendered sheet into something that looks photographed.
//
// Every degradation here is one named failure mode from docs/FAILURE-MODES.md,
// so a test can say which defense it is exercising rather than "a hard image":
// perspective is a phone held at an angle, the shadow gradient is section
// 4ب-2's "shadow across one row", the glare disc is defense د10, blur and noise
// are what a hand held frame costs, and the scale factor is defense د16's badly
// printed page.
//
// It is deterministic on purpose. A pseudo random generator seeded by the
// caller means a failing case can be reproduced from its seed alone, and
// acceptance criterion 13 compares two runs of the same paper for equality,
// which a Math.random would quietly make meaningless.

import { homographyFrom, invert, project } from '../src/geometry/homography';
import type { Point } from '../src/geometry/homography';
import { createGray, sampleAt } from '../src/image/gray';
import type { GrayImage } from '../src/image/gray';
import { boxMean, integralOf } from '../src/image/integral';

export interface PhotographOptions {
  /** Output frame size in pixels. Defaults to a portrait 1440 by 2560 frame. */
  readonly width?: number;
  readonly height?: number;
  /** Fraction of the frame the sheet spans when held square on. */
  readonly fill?: number;
  /** How far the camera is from the paper, in millimetres. */
  readonly distanceMm?: number;
  /** Tilt about the vertical and horizontal axes, in degrees. */
  readonly yawDeg?: number;
  readonly pitchDeg?: number;
  /** Rotation in the frame's own plane, in degrees. */
  readonly rollDeg?: number;
  /** Quarter turns of the paper, as a teacher holding the phone the other way up. */
  readonly quarterTurns?: number;
  /** Brightest and darkest the shadow makes the paper, as multipliers. */
  readonly shadow?: { readonly fromMm: number; readonly toMm: number; readonly strength: number };
  /** A specular highlight: centre in sheet millimetres, radius, and how blown out. */
  readonly glare?: {
    readonly xMm: number;
    readonly yMm: number;
    readonly rMm: number;
    readonly strength: number;
  };
  /** Gaussian-ish blur radius in output pixels. */
  readonly blur?: number;
  /** Standard deviation of the sensor noise, in grey levels. */
  readonly noise?: number;
  /** Overall exposure multiplier, where 1 leaves the paper as rendered. */
  readonly exposure?: number;
  readonly seed?: number;
}

/** A small deterministic generator. Reproducibility here is a test requirement. */
function randomFrom(seed: number): () => number {
  let state = (seed | 0) === 0 ? 0x2f6e2b1 : seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

/**
 * Where the four paper corners land in the frame.
 *
 * A real pinhole camera rather than a foreshortening fudge, because the fudge
 * exaggerated the near to far size ratio badly enough to make a six degree tilt
 * look like a thirty degree one, and the engine's own size consistency check
 * was then being tuned against a camera that does not exist. The paper's aspect
 * ratio is preserved for the same reason.
 */
function sheetCorners(
  options: PhotographOptions,
  width: number,
  height: number,
  widthMm: number,
  heightMm: number,
): Point[] {
  const fill = options.fill ?? 0.86;
  const distance = options.distanceMm ?? 320;
  const turns = (((options.quarterTurns ?? 0) % 4) + 4) % 4;
  const yaw = ((options.yawDeg ?? 0) * Math.PI) / 180;
  const pitch = ((options.pitchDeg ?? 0) * Math.PI) / 180;
  // A quarter turn of the paper is a quarter turn in its own plane, not a
  // relabelling of its corners. Permuting the corners instead would stretch a
  // portrait sheet across a landscape quadrilateral, which is not a sheet any
  // camera has ever seen.
  const roll = (((options.rollDeg ?? 0) + 90 * turns) * Math.PI) / 180;

  // Focal length in pixels, chosen so a sheet held square on spans `fill` of
  // the shorter way the frame can hold it. The turned sheet is measured by its
  // turned bounding box, so a landscape reading is not silently magnified.
  const spanXMm = turns % 2 === 0 ? widthMm : heightMm;
  const spanYMm = turns % 2 === 0 ? heightMm : widthMm;
  const focal = fill * Math.min(width / spanXMm, height / spanYMm) * distance;

  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);

  const corners: readonly (readonly [number, number])[] = [
    [-widthMm / 2, -heightMm / 2],
    [widthMm / 2, -heightMm / 2],
    [-widthMm / 2, heightMm / 2],
    [widthMm / 2, heightMm / 2],
  ];

  return corners.map(([x, y]) => {
    // Roll in the paper's own plane, then yaw about the vertical axis, then
    // pitch about the horizontal one.
    const rx = x * cosRoll - y * sinRoll;
    const ry = x * sinRoll + y * cosRoll;

    const yx = rx * cosYaw;
    const yz = -rx * sinYaw;

    const py = ry * cosPitch;
    const pz = yz + ry * sinPitch;

    const z = distance + pz;
    const scale = focal / Math.max(1, z);
    return { x: width / 2 + yx * scale, y: height / 2 + py * scale };
  });
}

function shadeAt(options: PhotographOptions, xMm: number, yMm: number, heightMm: number): number {
  const shadow = options.shadow;
  if (shadow === undefined) return 1;
  const span = shadow.toMm - shadow.fromMm;
  if (span === 0) return 1;
  const t = Math.max(0, Math.min(1, (yMm - shadow.fromMm) / span));
  void xMm;
  void heightMm;
  return 1 - shadow.strength * t;
}

function blurInPlace(image: GrayImage, radius: number): void {
  if (radius <= 0) return;
  const size = Math.max(1, Math.round(radius));
  const copy = new Uint8Array(image.data);
  const span = 2 * size + 1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -size; dy <= size; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= image.height) continue;
        for (let dx = -size; dx <= size; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= image.width) continue;
          sum += copy[ny * image.stride + nx] ?? 0;
          count += 1;
        }
      }
      void span;
      image.data[y * image.stride + x] = Math.round(sum / Math.max(1, count));
    }
  }
}

/**
 * Photographs a flat sheet.
 *
 * `flat` is the render, `widthMm` and `heightMm` are the paper it represents,
 * and the result is a frame the engine can be handed with no hint about where
 * the sheet is in it.
 */
export function photograph(
  flat: GrayImage,
  widthMm: number,
  heightMm: number,
  options: PhotographOptions = {},
): GrayImage {
  const width = options.width ?? 1440;
  const height = options.height ?? 2560;
  const out = createGray(width, height, 60);
  const random = randomFrom(options.seed ?? 1);
  const exposure = options.exposure ?? 1;

  const target = sheetCorners(options, width, height, widthMm, heightMm);
  const source: Point[] = [
    { x: 0, y: 0 },
    { x: widthMm, y: 0 },
    { x: 0, y: heightMm },
    { x: widthMm, y: heightMm },
  ];
  const forward = homographyFrom(source, target);
  if (forward === null) return out;
  const backward = invert(forward);
  if (backward === null) return out;

  const pxPerMmX = flat.width / widthMm;
  const pxPerMmY = flat.height / heightMm;

  // A sensor integrates over the whole area of a pixel; a point sampler does
  // not, and the difference is not cosmetic. Rendering at 12 pixels per
  // millimetre and point sampling into a frame at 9.3 beats the sampling grid
  // against the code's own module grid, and with the sheet exactly square on
  // the beat is coherent across the whole symbol and the code stops decoding.
  // It was found that way: a frame with no tilt, no noise and no blur failed
  // while the same frame tilted by three degrees read perfectly, which is the
  // opposite of what any real optics does.
  //
  // So each output pixel is the mean of its own footprint in the render, taken
  // from a summed area table so the cost does not depend on how large that
  // footprint is.
  const integral = integralOf(flat);
  const footprintX = Math.max(0, (pxPerMmX * widthMm) / width / 2 - 0.5);
  const footprintY = Math.max(0, (pxPerMmY * heightMm) / height / 2 - 0.5);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const paper = project(backward, x + 0.5, y + 0.5);
      if (paper.x < 0 || paper.y < 0 || paper.x > widthMm || paper.y > heightMm) continue;

      const sourceX = paper.x * pxPerMmX;
      const sourceY = paper.y * pxPerMmY;
      let value =
        footprintX < 0.5 && footprintY < 0.5
          ? sampleAt(flat, sourceX, sourceY)
          : boxMean(
              integral,
              Math.round(sourceX - footprintX),
              Math.round(sourceY - footprintY),
              Math.round(sourceX + footprintX),
              Math.round(sourceY + footprintY),
            );
      value *= shadeAt(options, paper.x, paper.y, heightMm) * exposure;

      const glare = options.glare;
      if (glare !== undefined) {
        const distance = Math.hypot(paper.x - glare.xMm, paper.y - glare.yMm);
        if (distance < glare.rMm) {
          // Saturation is not extra light on top of a reading, it is the
          // reading being destroyed, which is why defense د10 treats it as
          // missing information rather than as a bright pixel.
          const weight = glare.strength * (1 - (distance / glare.rMm) ** 2);
          value = value * (1 - weight) + 255 * weight;
        }
      }

      const noise = options.noise ?? 0;
      if (noise > 0) value += (random() - 0.5) * 2 * noise;
      out.data[y * out.stride + x] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }

  blurInPlace(out, options.blur ?? 0);
  return out;
}
