// The scanning engine: a photograph of a sheet goes in, an answered sheet
// comes out.
//
// This package is deliberately empty so far. Its architecture turns on one
// question that the plan leaves contradictory, and the answer decides every
// file that follows, so it is being settled before any of it is written.
//
// The contradiction: docs/PLAN.md calls this package pure TypeScript with zero
// dependencies, tested in CI on static images with no phone involved, while the
// pipeline it sketches in the same section names OpenCV operations that on a
// phone would come from react-native-fast-opencv.
//
// What the package will rely on, and the reason it can be small: the sheet is
// not a general document. Four solid 8 mm squares sit at known millimetre
// positions, timing marks run down one edge, and the printed code decodes to
// the whole geometry, so a device that has never seen the template still knows
// where every bubble is. See @transferchecker/sheet-spec.

export {};
