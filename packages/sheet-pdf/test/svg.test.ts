// The compiled SVG has to state its size in millimetres, or it prints small.

import { describe, expect, it } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { PAPER } from '@transferchecker/sheet-spec';
import { renderSheetTypst, withPhysicalSize } from '../src/index';
import { makeLayout, makeOptions } from './helpers';

const compiler = NodeCompiler.create();

describe('withPhysicalSize', () => {
  it('restates a real compiled sheet in millimetres', () => {
    const source = renderSheetTypst(makeLayout(), makeOptions());
    const svg = compiler.svg({ mainFileContent: source });
    expect(typeof svg).toBe('string');
    if (typeof svg !== 'string') return;

    // What Typst emits: bare numbers of points, which a browser reads as
    // pixels, so an A4 sheet would print 210mm wide as 157mm.
    expect(svg).toMatch(/<svg[^>]*\swidth="596(\.\d+)?"/);

    const sized = withPhysicalSize(svg, PAPER.A4);
    expect(sized).toMatch(/<svg[^>]*\swidth="210mm"/);
    expect(sized).toMatch(/<svg[^>]*\sheight="297mm"/);
  });

  it('leaves the drawing untouched, changing only the root', () => {
    const svg = '<svg width="596" height="842" viewBox="0 0 596 842"><path d="M0 0"/></svg>';
    expect(withPhysicalSize(svg, PAPER.A4)).toBe(
      '<svg width="210mm" height="297mm" viewBox="0 0 596 842"><path d="M0 0"/></svg>',
    );
  });

  it('refuses rather than returning a sheet that still prints small', () => {
    expect(() => withPhysicalSize('<p>not an svg</p>', PAPER.A4)).toThrow();
    expect(() => withPhysicalSize('<svg viewBox="0 0 1 1"></svg>', PAPER.A4)).toThrow();
  });
});
