"use client";

import type { editor as MonacoEditorNamespace } from "monaco-editor";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

type MonacoEditor = MonacoEditorNamespace.IStandaloneCodeEditor;

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export type MonacoJsonEditorProps = {
  value: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
  ariaLabel?: string;
  className?: string;
  onMountEditor?: (editor: MonacoEditor) => void;
  tabSize?: number;
  insertSpaces?: boolean;
};

export function MonacoJsonEditor({
  value,
  onChange,
  readOnly = false,
  ariaLabel,
  className,
  onMountEditor,
  tabSize = 2,
  insertSpaces = true,
}: MonacoJsonEditorProps) {
  const [theme, setTheme] = useState<"vs" | "vs-dark">("vs");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const syncTheme = () => setTheme(media.matches ? "vs-dark" : "vs");
    syncTheme();
    media.addEventListener?.("change", syncTheme);
    return () => media.removeEventListener?.("change", syncTheme);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const options = useMemo(() => {
    return {
      readOnly,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      lineNumbers: isMobile ? "off" : "on",
      wordWrap: isMobile ? "on" : "off",
      tabSize,
      insertSpaces,
      folding: true,
      foldingHighlight: true,
      renderWhitespace: "none",
      renderLineHighlight: "none",
      scrollbar: {
        verticalScrollbarSize: isMobile ? 6 : 10,
        horizontalScrollbarSize: isMobile ? 6 : 10,
      },
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: isMobile ? 15 : 13,
      lineHeight: isMobile ? 22 : undefined,
      padding: isMobile ? { top: 12, bottom: 12 } : undefined,
    } as const;
  }, [insertSpaces, readOnly, tabSize, isMobile]);

  return (
    <div className={className}>
      <Editor
        height="100%"
        width="100%"
        defaultLanguage="json"
        theme={theme}
        value={value}
        onChange={onChange ? (v) => onChange(v ?? "") : undefined}
        options={options}
        onMount={(editor) => {
          onMountEditor?.(editor as MonacoEditor);
        }}
        aria-label={ariaLabel}
      />
    </div>
  );
}

