import { describe, it, expect } from 'vitest';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { VisualMetadataManager } from './visual-metadata-manager';

const XML = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0" initial="Job">
  <state id="Job" initial="Work" viz:xywh="0,0,400,300">
    <state id="Work" viz:xywh="10,10,120,60"/>
    <final id="JobDone" viz:xywh="200,10,120,60" viz:rgb="ff0000"/>
  </state>
  <final id="Done" viz:xywh="500,0,120,60" viz:rgb="00ff00"/>
</scxml>`;

describe('VisualMetadataManager — <final> states', () => {
  it('extracts viz: metadata for root-level and nested <final> elements', () => {
    const doc = new SCXMLParser().parse(XML).data!;
    const manager = new VisualMetadataManager();
    manager.extractAllVisualMetadata(doc);

    expect(manager.getVisualMetadata('Done')?.style?.fill).toBe('00ff00');
    expect(manager.getVisualMetadata('Done')?.layout).toMatchObject({ x: 500, y: 0, width: 120, height: 60 });
    expect(manager.getVisualMetadata('JobDone')?.style?.fill).toBe('ff0000');
    // States are unaffected
    expect(manager.getVisualMetadata('Work')?.layout).toMatchObject({ x: 10, y: 10 });
  });

  it('writes stored metadata back onto <final> elements when serializing', () => {
    const doc = new SCXMLParser().parse(XML).data!;
    const manager = new VisualMetadataManager();
    manager.extractAllVisualMetadata(doc);

    // Strip the finals' viz: attributes so only the stored metadata can restore them
    const scxml = doc.scxml as any;
    for (const final of [scxml.final, scxml.state.final]) {
      delete final['@_viz:xywh'];
      delete final['@_viz:rgb'];
    }

    const out = manager.serializeWithVisualMetadata(doc, { validate: false });
    expect(out).toMatch(/<final id="Done"[^>]*viz:xywh="500,0,120,60"/);
    expect(out).toMatch(/<final id="Done"[^>]*viz:rgb="00ff00"/);
    expect(out).toMatch(/<final id="JobDone"[^>]*viz:rgb="ff0000"/);
  });
});
