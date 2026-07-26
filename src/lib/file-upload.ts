/** Read a browser File into a base64 data URL / payload for private upload APIs. */
export async function fileToBase64(file: File): Promise<{
  fileName: string;
  mimeType: string;
  contentBase64: string;
}> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    contentBase64: btoa(binary),
  };
}
