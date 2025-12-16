export async function copyText(text: string): Promise<void> {
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

export async function readClipboardText(): Promise<string> {
  if (!navigator.clipboard?.readText || !window.isSecureContext) {
    throw new Error("无法读取剪贴板：需要 HTTPS 或 localhost 环境。");
  }

  return navigator.clipboard.readText();
}
