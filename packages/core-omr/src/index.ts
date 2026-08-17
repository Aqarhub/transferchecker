// The scanning engine: a photograph of a sheet goes in, an answered sheet
// comes out.
//
// Pure TypeScript, zero runtime dependencies, and it knows nothing about React
// or the camera. It is handed one plane of eight bit luminance, which is what a
// camera frame's Y plane already is, so a phone gives it a view rather than a
// conversion and Node gives it a decoded fixture.
//
// The architecture in one paragraph. The sheet is not a general document: four
// solid squares sit at known millimetres in the corners, four smaller ones at
// the middle of the edges, and the printed code carries the whole geometry, so
// a device that has never seen the template rebuilds it exactly. The corner
// squares give a projective map between the sheet's millimetres and the
// frame's pixels, the edge marks measure the middle of the page where the
// corners are blind, and every measurement afterwards is a set of millimetre
// positions pushed through that map and read on the frame at full resolution.
// Nothing is warped, nothing is resampled, and the sample lattice is fixed on
// the paper rather than on the sensor, which is what makes two photographs of
// one paper give one answer.
//
// The decisions and their alternatives are in docs/CORE-OMR.md, and the
// defenses the numbers implement are in docs/FAILURE-MODES.md.

export { scanSheet } from './scan/pipeline';
export type { ScanOptions } from './scan/pipeline';
export type {
  FieldReading,
  FieldState,
  QuestionReading,
  ScanQuality,
  ScanResult,
  ScannedSheet,
} from './scan/result';
export { isFrameFault, messageKeyOf } from './scan/reject';
export type { Rejection } from './scan/reject';

export { DEFAULT_THRESHOLDS } from './decide/thresholds';
export type { Thresholds } from './decide/thresholds';
export { decideGroup, markOf } from './decide/group';
export type { GroupInput, GroupOutcome } from './decide/group';

export { createGray, sampleAt, wrapGray } from './image/gray';
export type { GrayImage } from './image/gray';

export { findFiducials } from './geometry/fiducials';
export type { FiducialQuad, FiducialSearch } from './geometry/fiducials';
export { estimateFrame, paperFrame, pxPerMmAt, toImage, toPaper } from './geometry/frame';
export type { Frame } from './geometry/frame';

export { MIN_MODULE_PX, readSheetCode } from './code/index';
export type { CodeResult } from './code/index';
export { decodeQrMatrix } from './qr/index';

export { measureBubble } from './measure/bubble';
export type { BubbleReading, LabelSide } from './measure/bubble';
export { inkRatio, photometryOf, referenceAt } from './measure/photometry';
export type { PhotometricField, Reference } from './measure/photometry';
export { MAX_DISPLACEMENT_MM, readEdgeMarks, warpFrom } from './measure/edge';
export type { EdgeMark, EdgeRead, Warp } from './measure/edge';
