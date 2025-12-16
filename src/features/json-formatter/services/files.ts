export async function readFileAsText(file: File): Promise<string> {
  return file.text();
}
