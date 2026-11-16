import { describe, it, expect, afterEach } from 'vitest';
import { useEditorStore } from './editor-store';

const XML_TWO_INITIAL_GROUPS = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A B"><state id="A"/><state id="B"/></scxml>`;

const XML_ONE_INITIAL_GROUP = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A"><state id="A"/><state id="B"/></scxml>`;

describe('editor-store setContent (no-parallel build: no <parallel> normalization)', () => {
  afterEach(() => {
    useEditorStore.getState().reset();
  });

  it('keeps 2+ initial-state work trees as flat siblings, byte-identical — no <parallel> wrap', () => {
    useEditorStore.getState().setContent(XML_TWO_INITIAL_GROUPS);
    const content = useEditorStore.getState().content;
    expect(content).toBe(XML_TWO_INITIAL_GROUPS);
    expect(content).not.toContain('<parallel');
  });

  it('leaves content with a single initial group byte-identical', () => {
    useEditorStore.getState().setContent(XML_ONE_INITIAL_GROUP);
    expect(useEditorStore.getState().content).toBe(XML_ONE_INITIAL_GROUP);
  });

  it('stores invalid/incomplete XML as-is without throwing', () => {
    const broken = '<scxml><state id="A">';
    expect(() => useEditorStore.getState().setContent(broken)).not.toThrow();
    expect(useEditorStore.getState().content).toBe(broken);
  });

  it('stores the same content with { immediate: false } and { immediate: true }', () => {
    useEditorStore.getState().setContent(XML_TWO_INITIAL_GROUPS, { immediate: false });
    expect(useEditorStore.getState().content).toBe(XML_TWO_INITIAL_GROUPS);
    useEditorStore.getState().setContent(XML_TWO_INITIAL_GROUPS, { immediate: true });
    expect(useEditorStore.getState().content).toBe(XML_TWO_INITIAL_GROUPS);
  });
});

describe('editor-store setFileInfo (no-parallel build: no <parallel> normalization)', () => {
  afterEach(() => {
    useEditorStore.getState().reset();
  });

  it('loads a file with 2+ flat initial groups unchanged', () => {
    useEditorStore.getState().setFileInfo({
      name: 'test.scxml',
      size: XML_TWO_INITIAL_GROUPS.length,
      lastModified: new Date(0),
      content: XML_TWO_INITIAL_GROUPS,
    });
    const { content, fileInfo } = useEditorStore.getState();
    expect(content).toBe(XML_TWO_INITIAL_GROUPS);
    expect(fileInfo?.content).toBe(content);
    expect(fileInfo?.size).toBe(content.length);
  });

  it('does not mark the document dirty when the debounced commit re-sets unchanged content', () => {
    useEditorStore.getState().setFileInfo({
      name: 'test.scxml',
      size: XML_TWO_INITIAL_GROUPS.length,
      lastModified: new Date(0),
      content: XML_TWO_INITIAL_GROUPS,
    });
    const loadedContent = useEditorStore.getState().content;
    // The debounced "commit" pass after typing pauses (see page.tsx).
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

describe('editor-store dirty-tracking baseline (markSaved / loadGeneration)', () => {
  afterEach(() => {
    useEditorStore.getState().reset();
  });

  const file = (content: string) => ({ name: 'a.scxml', content, size: content.length, lastModified: new Date() });

  it('setFileInfo makes the loaded content the baseline and bumps loadGeneration', () => {
    const before = useEditorStore.getState().loadGeneration;
    useEditorStore.getState().setFileInfo(file(XML_ONE_INITIAL_GROUP));
    const state = useEditorStore.getState();
    expect(state.isDirty).toBe(false);
    expect(state.loadGeneration).toBe(before + 1);
  });

  it('markSaved moves the baseline to the current content without bumping loadGeneration', () => {
    useEditorStore.getState().setFileInfo(file(XML_ONE_INITIAL_GROUP));
    const generation = useEditorStore.getState().loadGeneration;
    const edited = XML_ONE_INITIAL_GROUP.replace('id="B"', 'id="C"');
    useEditorStore.getState().setContent(edited);
    expect(useEditorStore.getState().isDirty).toBe(true);

    useEditorStore.getState().markSaved();
    const state = useEditorStore.getState();
    expect(state.isDirty).toBe(false);
    expect(state.fileInfo?.content).toBe(edited);
    expect(state.loadGeneration).toBe(generation);

    // Editing back to the old content now counts as a change.
    useEditorStore.getState().setContent(XML_ONE_INITIAL_GROUP);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });
});
