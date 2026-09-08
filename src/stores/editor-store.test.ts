import { describe, it, expect, afterEach } from 'vitest';
import { useEditorStore } from './editor-store';

const XML_TWO_INITIAL_GROUPS = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A B"><state id="A"/><state id="B"/></scxml>`;

const XML_ONE_INITIAL_GROUP = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A"><state id="A"/><state id="B"/></scxml>`;

describe('editor-store setContent normalization', () => {
  afterEach(() => {
    useEditorStore.getState().reset();
  });

  it('wraps 2+ initial-state work trees into a real <parallel> element', () => {
    useEditorStore.getState().setContent(XML_TWO_INITIAL_GROUPS);
    const content = useEditorStore.getState().content;
    expect(content).toContain('<parallel');
    expect(content).toContain('viz:auto-parallel="true"');
  });

  it('leaves content with a single initial group byte-identical (nothing to normalize)', () => {
    useEditorStore.getState().setContent(XML_ONE_INITIAL_GROUP);
    expect(useEditorStore.getState().content).toBe(XML_ONE_INITIAL_GROUP);
  });

  it('stores invalid/incomplete XML as-is without throwing', () => {
    const broken = '<scxml><state id="A">';
    expect(() => useEditorStore.getState().setContent(broken)).not.toThrow();
    expect(useEditorStore.getState().content).toBe(broken);
  });

  it('does not normalize when called with { immediate: false }, storing raw content instead', () => {
    useEditorStore.getState().setContent(XML_TWO_INITIAL_GROUPS, { immediate: false });
    expect(useEditorStore.getState().content).toBe(XML_TWO_INITIAL_GROUPS);
  });
});

describe('editor-store setFileInfo normalization', () => {
  afterEach(() => {
    useEditorStore.getState().reset();
  });

  it('normalizes a loaded file that already has 2+ flat initial groups', () => {
    useEditorStore.getState().setFileInfo({
      name: 'test.scxml',
      size: XML_TWO_INITIAL_GROUPS.length,
      lastModified: new Date(0),
      content: XML_TWO_INITIAL_GROUPS,
    });
    expect(useEditorStore.getState().content).toContain('<parallel');
  });

  it('keeps fileInfo.content/size in sync with the normalized buffer, not the raw upload', () => {
    useEditorStore.getState().setFileInfo({
      name: 'test.scxml',
      size: XML_TWO_INITIAL_GROUPS.length,
      lastModified: new Date(0),
      content: XML_TWO_INITIAL_GROUPS,
    });
    const { content, fileInfo } = useEditorStore.getState();
    expect(fileInfo?.content).toBe(content);
    expect(fileInfo?.size).toBe(content.length);
  });

  it('does not mark the document dirty when re-normalizing content unchanged since load', () => {
    useEditorStore.getState().setFileInfo({
      name: 'test.scxml',
      size: XML_TWO_INITIAL_GROUPS.length,
      lastModified: new Date(0),
      content: XML_TWO_INITIAL_GROUPS,
    });
    const loadedContent = useEditorStore.getState().content;
    // Simulate the debounced "commit" pass that re-normalizes the current
    // buffer after typing pauses (see page.tsx's normalizeCommitTimerRef).
    useEditorStore.getState().setContent(loadedContent, { immediate: true });
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});

describe('editor-store focusTarget', () => {
  afterEach(() => {
    useEditorStore.getState().setFocusTarget(null);
  });

  it('defaults to null', () => {
    expect(useEditorStore.getState().focusTarget).toBeNull();
  });

  it('sets and clears the focus target', () => {
    useEditorStore.getState().setFocusTarget({ stateId: 'A', targetStateId: 'B' });
    expect(useEditorStore.getState().focusTarget).toEqual({ stateId: 'A', targetStateId: 'B' });

    useEditorStore.getState().setFocusTarget(null);
    expect(useEditorStore.getState().focusTarget).toBeNull();
  });
});
