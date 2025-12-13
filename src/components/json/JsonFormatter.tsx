"use client";

import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ui/ThemeProvider";
import { JsonFlowCanvas } from "./flow/JsonFlowCanvas";
import { JsonCanvas } from "./JsonCanvas";
import { buildJsonGraph } from "./lib/jsonGraph";
import {
  extractJsonErrorPosition,
  formatBytes,
  indexToLineColumn,
  normalizeJsonText,
  sortKeysDeep,
} from "./lib/jsonUtils";
import { MonacoJsonEditor } from "./MonacoJsonEditor";

type IndentOption = "2" | "4" | "tab";
type OutputKind = "formatted" | "minified" | null;
type RightPane = "canvas" | "output";
type GraphPreset = "default" | "more" | "all";
type CanvasMode = "flow" | "native";
type MobilePane = "input" | RightPane;

type MonacoEditor = MonacoEditorNamespace.IStandaloneCodeEditor;

type GraphOptions = {
  maxDepth: number;
  maxNodes: number;
  maxChildrenPerNode: number;
};

const GRAPH_PRESETS: Record<GraphPreset, GraphOptions> = {
  default: { maxDepth: 6, maxNodes: 240, maxChildrenPerNode: 30 },
  more: { maxDepth: 12, maxNodes: 3000, maxChildrenPerNode: 200 },
  all: {
    maxDepth: Number.POSITIVE_INFINITY,
    maxNodes: Number.POSITIVE_INFINITY,
    maxChildrenPerNode: Number.POSITIVE_INFINITY,
  },
};

export function JsonFormatter() {
  const [input, setInput] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [outputKind, setOutputKind] = useState<OutputKind>(null);
  const [rightPane, setRightPane] = useState<RightPane>("canvas");
  const [mobilePane, setMobilePane] = useState<MobilePane>("input");
  const [parsedValue, setParsedValue] = useState<unknown | undefined>(
    undefined,
  );
  const [indent, setIndent] = useState<IndentOption>("2");
  const [sortKeys, setSortKeys] = useState<boolean>(false);
  const [graphPreset, setGraphPreset] = useState<GraphPreset>("default");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("flow");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [timingMs, setTimingMs] = useState<number | null>(null);
  const [inputFileName, setInputFileName] = useState<string | null>(null);
  const [inputFileBytes, setInputFileBytes] = useState<number | null>(null);
  const { theme, toggleTheme } = useTheme();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const inputEditorRef = useRef<MonacoEditor | null>(null);
  const outputEditorRef = useRef<MonacoEditor | null>(null);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current != null) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  const indentValue = indent === "tab" ? "\t" : Number(indent);
  const tabSize = indent === "4" ? 4 : 2;
  const insertSpaces = indent !== "tab";

  const stats = useMemo(() => {
    const inputBytes = new Blob([input]).size;
    const outputBytes = new Blob([output]).size;
    return { inputBytes, outputBytes };
  }, [input, output]);

  const graphOptions = GRAPH_PRESETS[graphPreset];

  const graph = useMemo(() => {
    if (parsedValue === undefined) return null;
    return buildJsonGraph(parsedValue, graphOptions);
  }, [parsedValue, graphOptions]);

  function parseOrThrow() {
    const normalized = normalizeJsonText(input);
    if (!normalized) {
      throw new Error("输入为空：请粘贴或上传 JSON。");
    }
    return { normalized, value: JSON.parse(normalized) as unknown };
  }

  function focusInputEditor() {
    inputEditorRef.current?.focus();
  }

  function flash(nextMessage: string) {
    setMessage(nextMessage);
    if (messageTimerRef.current != null) {
      window.clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = window.setTimeout(() => {
      setMessage(null);
      messageTimerRef.current = null;
    }, 2200);
  }

  function setErrorFromUnknown(
    unknownError: unknown,
    normalizedForPosition?: string,
  ) {
    if (unknownError instanceof Error) {
      const position = extractJsonErrorPosition(unknownError.message);
      if (position != null && normalizedForPosition) {
        const { line, column } = indexToLineColumn(
          normalizedForPosition,
          position,
        );
        setError(`${unknownError.message}（第 ${line} 行，第 ${column} 列）`);
        const editor = inputEditorRef.current;
        if (editor) {
          editor.focus();
          editor.setPosition({ lineNumber: line, column });
          editor.revealPositionInCenter({ lineNumber: line, column });
        }
        return;
      }
      setError(unknownError.message);
      return;
    }

    setError("解析失败：未知错误。");
  }

  function handleFormatOrMinify(kind: Exclude<OutputKind, null>) {
    setError(null);
    setMessage(null);
    setTimingMs(null);
    setOutputKind(null);

    const start = performance.now();
    let normalized: string | undefined;
    try {
      const parsed = parseOrThrow();
      normalized = parsed.normalized;
      const { value } = parsed;
      const valueForOutput = sortKeys ? sortKeysDeep(value) : value;

      const nextOutput =
        kind === "formatted"
          ? JSON.stringify(valueForOutput, null, indentValue)
          : JSON.stringify(valueForOutput);

      setOutput(`${nextOutput}\n`);
      setOutputKind(kind);
      setParsedValue(valueForOutput);
      setTimingMs(performance.now() - start);
      focusInputEditor();
    } catch (unknownError) {
      setOutput("");
      setOutputKind(null);
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      setErrorFromUnknown(unknownError, normalized ?? normalizeJsonText(input));
    }
  }

  function handleFormat() {
    handleFormatOrMinify("formatted");
  }

  function handleMinify() {
    handleFormatOrMinify("minified");
  }

  function handleValidate() {
    setError(null);
    setMessage(null);
    setTimingMs(null);

    const start = performance.now();
    let normalized: string | undefined;
    try {
      const parsed = parseOrThrow();
      normalized = parsed.normalized;
      const { value } = parsed;
      const valueForOutput = sortKeys ? sortKeysDeep(value) : value;
      setOutputKind(null);
      setParsedValue(valueForOutput);
      setTimingMs(performance.now() - start);
      flash("JSON 校验通过。");
    } catch (unknownError) {
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      setErrorFromUnknown(unknownError, normalized ?? normalizeJsonText(input));
    }
  }

  function handleClear() {
    setInput("");
    setOutput("");
    setOutputKind(null);
    setError(null);
    setMessage(null);
    setTimingMs(null);
    setParsedValue(undefined);
    setInputFileName(null);
    setInputFileBytes(null);
    focusInputEditor();
  }

  async function writeToClipboard(text: string) {
    if (!text) return;

    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  async function handleCopyInput() {
    setError(null);
    try {
      await writeToClipboard(input);
      flash("已复制输入到剪贴板。");
    } catch {
      setError("复制失败：浏览器未授予剪贴板权限。");
    }
  }

  async function handleCopyOutput() {
    setError(null);
    try {
      await writeToClipboard(output);
      flash("已复制输出到剪贴板。");
    } catch {
      setError("复制失败：浏览器未授予剪贴板权限。");
    }
  }

  async function handlePasteFromClipboard() {
    setError(null);
    setMessage(null);

    if (!navigator.clipboard?.readText || !window.isSecureContext) {
      setError("无法读取剪贴板：需要 HTTPS 或 localhost 环境。");
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      setOutput("");
      setOutputKind(null);
      setTimingMs(null);
      setParsedValue(undefined);
      setInputFileName(null);
      setInputFileBytes(null);
      flash("已从剪贴板粘贴到输入。");
      focusInputEditor();
    } catch {
      setError("粘贴失败：浏览器未授予剪贴板权限。");
    }
  }

  function handlePickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setMessage(null);

    try {
      const text = await file.text();
      setInput(text);
      setOutput("");
      setOutputKind(null);
      setTimingMs(null);
      setParsedValue(undefined);
      setInputFileName(file.name);
      setInputFileBytes(file.size);
      flash(`已加载：${file.name}（${formatBytes(file.size)}）`);
      focusInputEditor();
    } catch {
      setError("读取文件失败：请确认文件可访问且为文本 JSON。");
    }
  }

  function buildDownloadName(): string {
    const base = inputFileName
      ? inputFileName.replace(/\\.json$/i, "")
      : outputKind === "minified"
        ? "minified"
        : "formatted";

    if (outputKind === "minified") return `${base}.min.json`;
    if (outputKind === "formatted") return `${base}.formatted.json`;
    return `${base}.json`;
  }

  function handleDownloadOutput() {
    if (!output) return;

    const blob = new Blob([output], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildDownloadName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash("已开始下载输出文件。");
  }

  async function runOutputAction(actionId: string) {
    const editor = outputEditorRef.current;
    if (!editor) return;
    const action = editor.getAction(actionId);
    if (!action) return;
    try {
      await action.run();
    } catch {
      // ignore
    }
  }

  function switchToInput() {
    setMobilePane("input");
  }

  function switchToCanvas() {
    setRightPane("canvas");
    setMobilePane("canvas");
  }

  function switchToOutput() {
    setRightPane("output");
    setMobilePane("output");
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-zinc-50 text-zinc-900 lg:h-screen dark:bg-black dark:text-zinc-100">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200/70 bg-white/80 px-3 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/70">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
            {"{}"}
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            JSON Web
          </span>
        </div>

        {/* Desktop buttons - hidden on mobile */}
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={toggleTheme}
            aria-label="切换主题"
          >
            {theme === "dark" ? (
              <svg
                className="h-4.5 w-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <title>切换到浅色</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.75a5.25 5.25 0 100 10.5 5.25 5.25 0 000-10.5zM12 2.25v1.5M12 20.25v1.5M4.5 12h-1.5M21 12h-1.5M5.47 5.47l-1.06-1.06M19.59 19.59l-1.06-1.06M5.47 18.53l-1.06 1.06M19.59 4.41l-1.06 1.06"
                />
              </svg>
            ) : (
              <svg
                className="h-4.5 w-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <title>切换到深色</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12.79A9 9 0 1111.21 3 7.5 7.5 0 0021 12.79z"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handlePasteFromClipboard}
          >
            粘贴
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handlePickFile}
          >
            上传
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            onClick={handleFormat}
            disabled={!input.trim()}
          >
            格式化
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handleMinify}
            disabled={!input.trim()}
          >
            压缩
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handleValidate}
            disabled={!input.trim()}
          >
            校验
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handleClear}
            disabled={!input && !output}
          >
            清空
          </button>
        </div>

        {/* Mobile buttons - simplified with menu */}
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={toggleTheme}
            aria-label="切换主题"
          >
            {theme === "dark" ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <title>切换到浅色</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.75a5.25 5.25 0 100 10.5 5.25 5.25 0 000-10.5zM12 2.25v1.5M12 20.25v1.5M4.5 12h-1.5M21 12h-1.5M5.47 5.47l-1.06-1.06M19.59 19.59l-1.06-1.06M5.47 18.53l-1.06 1.06M19.59 4.41l-1.06 1.06"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <title>切换到深色</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12.79A9 9 0 1111.21 3 7.5 7.5 0 0021 12.79z"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handlePasteFromClipboard}
            aria-label="粘贴"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <title>粘贴</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
              />
            </svg>
          </button>
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            onClick={handleFormat}
            disabled={!input.trim()}
          >
            格式化
          </button>
          <button
            type="button"
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="更多操作"
            aria-expanded={mobileMenuOpen}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <title>更多操作</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
              />
            </svg>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </header>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="absolute right-2 top-14 z-50 min-w-[160px] rounded-xl border border-zinc-200 bg-white/95 p-1.5 shadow-lg backdrop-blur lg:hidden dark:border-zinc-700 dark:bg-zinc-900/95">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              handlePickFile();
              setMobileMenuOpen(false);
            }}
          >
            <svg
              className="h-4 w-4 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <title>上传文件</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            上传文件
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              handleMinify();
              setMobileMenuOpen(false);
            }}
            disabled={!input.trim()}
          >
            <svg
              className="h-4 w-4 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <title>压缩</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
              />
            </svg>
            压缩
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              handleValidate();
              setMobileMenuOpen(false);
            }}
            disabled={!input.trim()}
          >
            <svg
              className="h-4 w-4 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <title>校验</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            校验
          </button>
          <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800" />
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
            onClick={() => {
              handleClear();
              setMobileMenuOpen(false);
            }}
            disabled={!input && !output}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <title>清空</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            清空
          </button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200/70 bg-white/60 px-2 py-2 lg:hidden dark:border-zinc-800/70 dark:bg-zinc-950/40">
        <div className="inline-flex flex-1 items-center rounded-full border border-zinc-200 bg-white p-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            className={`inline-flex h-9 flex-1 items-center justify-center rounded-full px-3 font-medium ${
              mobilePane === "input"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
            onClick={switchToInput}
          >
            输入
          </button>
          <button
            type="button"
            className={`inline-flex h-9 flex-1 items-center justify-center rounded-full px-3 font-medium ${
              mobilePane === "canvas"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
            onClick={switchToCanvas}
          >
            画布
          </button>
          <button
            type="button"
            className={`inline-flex h-9 flex-1 items-center justify-center rounded-full px-3 font-medium ${
              mobilePane === "output"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
            onClick={switchToOutput}
          >
            输出
          </button>
        </div>
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section
          className={`min-h-0 flex-col lg:flex lg:border-r lg:border-zinc-200/70 lg:dark:border-zinc-800/70 ${
            mobilePane === "input" ? "flex" : "hidden"
          }`}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/70 bg-white/60 p-2 dark:border-zinc-800/70 dark:bg-zinc-950/40">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                输入
              </span>
              {inputFileName ? (
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {inputFileName}
                  {inputFileBytes != null
                    ? `（${formatBytes(inputFileBytes)}）`
                    : ""}
                </span>
              ) : (
                <span className="hidden truncate text-xs text-zinc-400 sm:inline dark:text-zinc-500">
                  粘贴或上传 JSON
                </span>
              )}
            </div>

            {/* Desktop-only options */}
            <label className="hidden items-center gap-2 text-xs text-zinc-600 sm:inline-flex dark:text-zinc-400">
              <span>缩进</span>
              <select
                className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                value={indent}
                onChange={(e) => setIndent(e.target.value as IndentOption)}
              >
                <option value="2">2</option>
                <option value="4">4</option>
                <option value="tab">Tab</option>
              </select>
            </label>

            <label className="hidden items-center gap-2 text-xs text-zinc-600 sm:inline-flex dark:text-zinc-400">
              <input
                type="checkbox"
                className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                checked={sortKeys}
                onChange={(e) => setSortKeys(e.target.checked)}
              />
              <span>排序 key</span>
            </label>

            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              onClick={handleCopyInput}
              disabled={!input}
            >
              复制
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <MonacoJsonEditor
              className="h-full w-full"
              value={input}
              onChange={(next) => {
                setInput(next);
                setParsedValue(undefined);
                setError(null);
                setMessage(null);
                setOutputKind(null);
              }}
              ariaLabel="JSON input"
              tabSize={tabSize}
              insertSpaces={insertSpaces}
              onMountEditor={(editor) => {
                inputEditorRef.current = editor;
              }}
            />
            {!input ? (
              <div className="pointer-events-none absolute left-3 top-3 select-none text-sm text-zinc-400 dark:text-zinc-500">
                在这里粘贴 JSON（支持很大的 JSON），或用“上传”导入文件。
              </div>
            ) : null}
          </div>
        </section>

        <section
          className={`min-h-0 flex-col lg:flex ${
            mobilePane === "input" ? "hidden" : "flex"
          }`}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/70 bg-white/60 p-2 dark:border-zinc-800/70 dark:bg-zinc-950/40">
            <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="button"
                className={`inline-flex h-8 items-center justify-center rounded-full px-3 font-medium ${
                  rightPane === "canvas"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
                onClick={switchToCanvas}
              >
                画布
              </button>
              <button
                type="button"
                className={`inline-flex h-8 items-center justify-center rounded-full px-3 font-medium ${
                  rightPane === "output"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
                onClick={switchToOutput}
              >
                输出
              </button>
            </div>

            {rightPane === "canvas" ? (
              <>
                <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>画布</span>
                  <select
                    className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    value={canvasMode}
                    onChange={(e) =>
                      setCanvasMode(e.target.value as CanvasMode)
                    }
                  >
                    <option value="flow">Flow</option>
                    <option value="native">Native</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>范围</span>
                  <select
                    className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    value={graphPreset}
                    onChange={(e) =>
                      setGraphPreset(e.target.value as GraphPreset)
                    }
                  >
                    <option value="default">默认</option>
                    <option value="more">更多</option>
                    <option value="all">全部（谨慎）</option>
                  </select>
                </label>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  onClick={() => runOutputAction("editor.foldAll")}
                  disabled={!output}
                >
                  折叠
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  onClick={() => runOutputAction("editor.unfoldAll")}
                  disabled={!output}
                >
                  展开
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                onClick={handleCopyOutput}
                disabled={!output}
              >
                复制
              </button>
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                onClick={handleDownloadOutput}
                disabled={!output}
              >
                下载
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {rightPane === "output" ? (
              <div className="relative h-full w-full">
                <MonacoJsonEditor
                  className="h-full w-full"
                  value={output}
                  readOnly
                  ariaLabel="JSON output"
                  tabSize={tabSize}
                  insertSpaces={insertSpaces}
                  onMountEditor={(editor) => {
                    outputEditorRef.current = editor;
                  }}
                />
                {!output ? (
                  <div className="pointer-events-none absolute left-3 top-3 select-none text-sm text-zinc-400 dark:text-zinc-500">
                    格式化/压缩结果会显示在这里。
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="h-full w-full">
                {canvasMode === "flow" ? (
                  <JsonFlowCanvas graph={graph} />
                ) : (
                  <JsonCanvas graph={graph} />
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="flex shrink-0 items-center gap-2 border-t border-zinc-200/70 bg-white/80 px-3 py-2 text-xs text-zinc-500 backdrop-blur sm:gap-3 dark:border-zinc-800/70 dark:bg-zinc-950/70 dark:text-zinc-400">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <span className="whitespace-nowrap">
            {formatBytes(stats.inputBytes)} → {formatBytes(stats.outputBytes)}
          </span>
          {timingMs != null ? (
            <span className="hidden whitespace-nowrap sm:inline">
              {timingMs.toFixed(0)}ms
            </span>
          ) : null}
          {outputKind ? (
            <span className="hidden sm:inline">
              {outputKind === "formatted" ? "已格式化" : "已压缩"}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 text-right">
          {error ? (
            <span className="truncate text-red-600 dark:text-red-400">
              {error}
            </span>
          ) : message ? (
            <span className="truncate">{message}</span>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
