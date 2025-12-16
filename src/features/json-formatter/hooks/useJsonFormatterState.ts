"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildJsonGraph } from "@/components/json/lib/jsonGraph";
import {
  escapeJsonString,
  extractJsonErrorPosition,
  formatBytes,
  indexToLineColumn,
  normalizeJsonText,
  sortKeysDeep,
  unescapeJsonString,
} from "@/components/json/lib/jsonUtils";
import { GRAPH_PRESETS } from "../constants";
import { copyText, readClipboardText } from "../services/clipboard";
import { downloadText } from "../services/download";
import { readFileAsText } from "../services/files";
import type {
  FormatterActions,
  FormatterState,
  UseJsonFormatterOptions,
} from "../types";

export function useJsonFormatterState(options: UseJsonFormatterOptions = {}): {
  state: FormatterState;
  actions: FormatterActions;
} {
  const [input, setInput] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [outputKind, setOutputKind] =
    useState<FormatterState["outputKind"]>(null);
  const [rightPane, setRightPane] =
    useState<FormatterState["rightPane"]>("canvas");
  const [mobilePane, setMobilePane] =
    useState<FormatterState["mobilePane"]>("input");
  const [parsedValue, setParsedValue] = useState<unknown | undefined>(
    undefined,
  );
  const [indent, setIndent] = useState<FormatterState["indent"]>("2");
  const [sortKeys, setSortKeys] = useState<boolean>(false);
  const [graphPreset, setGraphPreset] =
    useState<FormatterState["graphPreset"]>("default");
  const [canvasMode, setCanvasMode] =
    useState<FormatterState["canvasMode"]>("flow");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [timingMs, setTimingMs] = useState<number | null>(null);
  const [inputFileName, setInputFileName] = useState<string | null>(null);
  const [inputFileBytes, setInputFileBytes] = useState<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);

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

  function parseOrThrow() {
    const normalized = normalizeJsonText(input);
    if (!normalized) {
      throw new Error("输入为空：请粘贴或上传 JSON。");
    }
    return { normalized, value: JSON.parse(normalized) as unknown };
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
        options.onRevealInputPosition?.({ line, column });
        return;
      }
      setError(unknownError.message);
      return;
    }

    setError("解析失败：未知错误。");
  }

  function handleFormatOrMinify(kind: "formatted" | "minified") {
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
      options.onFocusInput?.();
    } catch (unknownError) {
      setOutput("");
      setOutputKind(null);
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      setErrorFromUnknown(unknownError, normalized ?? normalizeJsonText(input));
    }
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

  function handleEscape() {
    setError(null);
    setMessage(null);
    setTimingMs(null);
    setOutputKind(null);

    const start = performance.now();
    try {
      if (!input.trim()) {
        throw new Error("输入为空：请粘贴或上传 JSON。");
      }
      const escaped = escapeJsonString(input);
      setOutput(`${escaped}\n`);
      setOutputKind("escaped");
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      flash("已转义。");
    } catch (unknownError) {
      setOutput("");
      setOutputKind(null);
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      setErrorFromUnknown(unknownError);
    }
  }

  function handleUnescape() {
    setError(null);
    setMessage(null);
    setTimingMs(null);
    setOutputKind(null);

    const start = performance.now();
    try {
      if (!input.trim()) {
        throw new Error("输入为空：请粘贴或上传 JSON。");
      }
      const unescaped = unescapeJsonString(input);
      setOutput(`${unescaped}\n`);
      setOutputKind("unescaped");
      let nextParsed: unknown | undefined;
      try {
        nextParsed = JSON.parse(normalizeJsonText(unescaped));
      } catch {
        nextParsed = undefined;
      }
      setParsedValue(nextParsed);
      setTimingMs(performance.now() - start);
      flash(nextParsed ? "已反转义并解析。" : "已反转义。");
    } catch (unknownError) {
      setOutput("");
      setOutputKind(null);
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      setErrorFromUnknown(unknownError);
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
    options.onFocusInput?.();
  }

  async function handleCopyInput() {
    setError(null);
    try {
      await copyText(input);
      flash("已复制输入到剪贴板。");
    } catch {
      setError("复制失败：浏览器未授予剪贴板权限。");
    }
  }

  async function handleCopyOutput() {
    setError(null);
    try {
      await copyText(output);
      flash("已复制输出到剪贴板。");
    } catch {
      setError("复制失败：浏览器未授予剪贴板权限。");
    }
  }

  async function handlePasteFromClipboard() {
    setError(null);
    setMessage(null);

    try {
      const text = await readClipboardText();
      setInput(text);
      setOutput("");
      setOutputKind(null);
      setTimingMs(null);
      setParsedValue(undefined);
      setInputFileName(null);
      setInputFileBytes(null);
      flash("已从剪贴板粘贴到输入。");
      options.onFocusInput?.();
    } catch (unknownError) {
      if (unknownError instanceof Error) {
        setError(unknownError.message);
        return;
      }
      setError("粘贴失败：浏览器未授予剪贴板权限。");
    }
  }

  async function handleFileLoaded(file: File) {
    setError(null);
    setMessage(null);

    try {
      const text = await readFileAsText(file);
      setInput(text);
      setOutput("");
      setOutputKind(null);
      setTimingMs(null);
      setParsedValue(undefined);
      setInputFileName(file.name);
      setInputFileBytes(file.size);
      flash(`已加载：${file.name}（${formatBytes(file.size)}）`);
      options.onFocusInput?.();
    } catch {
      setError("读取文件失败：请确认文件可访问且为文本 JSON。");
    }
  }

  function buildDownloadName(): string {
    const baseFromInput = inputFileName
      ? inputFileName.replace(/\.json$/i, "")
      : null;

    const fallbackBase =
      outputKind === "minified"
        ? "minified"
        : outputKind === "escaped"
          ? "escaped"
          : outputKind === "unescaped"
            ? "unescaped"
            : "formatted";

    const base = baseFromInput ?? fallbackBase;

    if (outputKind === "minified") return `${base}.min.json`;
    if (outputKind === "formatted") return `${base}.formatted.json`;
    if (outputKind === "escaped") return `${base}.escaped.txt`;
    if (outputKind === "unescaped") return `${base}.unescaped.json`;
    return `${base}.json`;
  }

  function handleDownloadOutput() {
    if (!output) return;
    downloadText(buildDownloadName(), output);
    flash("已开始下载输出文件。");
  }

  return {
    state: {
      input,
      output,
      outputKind,
      rightPane,
      mobilePane,
      parsedValue,
      indent,
      sortKeys,
      graphPreset,
      canvasMode,
      error,
      message,
      timingMs,
      inputFileName,
      inputFileBytes,
      stats,
      graph,
      tabSize,
      insertSpaces,
    },
    actions: {
      updateInput(next: string) {
        setInput(next);
        setParsedValue(undefined);
        setError(null);
        setMessage(null);
        setOutputKind(null);
      },
      setIndent(next) {
        setIndent(next);
      },
      setSortKeys(next) {
        setSortKeys(next);
      },
      setGraphPreset(next) {
        setGraphPreset(next);
      },
      setCanvasMode(next) {
        setCanvasMode(next);
      },
      setRightPane(next) {
        setRightPane(next);
      },
      setMobilePane(next) {
        setMobilePane(next);
      },
      format() {
        handleFormatOrMinify("formatted");
      },
      minify() {
        handleFormatOrMinify("minified");
      },
      escapeText() {
        handleEscape();
      },
      unescapeText() {
        handleUnescape();
      },
      validate() {
        handleValidate();
      },
      clear() {
        handleClear();
      },
      async copyInput() {
        await handleCopyInput();
      },
      async copyOutput() {
        await handleCopyOutput();
      },
      async pasteFromClipboard() {
        await handlePasteFromClipboard();
      },
      async handleFileLoaded(file) {
        await handleFileLoaded(file);
      },
      downloadOutput() {
        handleDownloadOutput();
      },
    },
  };
}
