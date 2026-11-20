'use client';

import { useEffect } from 'react';
import { validateScxmlContent } from '@/lib';
import { useEditorStore } from '@/stores/editor-store';

export function useContentValidation() {
  const { content, setErrors } = useEditorStore();

  useEffect(() => {
    const timer = setTimeout(() => setErrors(validateScxmlContent(content)), 500);
    return () => clearTimeout(timer);
  }, [content, setErrors]);
}
