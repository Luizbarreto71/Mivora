"use client";

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 1280;
const MIN_SIDE = 320;

export type PreparedPhoto = { blob: Blob; url: string };

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

/**
 * Prepares the chosen photo in the browser before anything is sent: applies the camera orientation, reduces it to at
 * most 1280 px and re-encodes it as JPEG, which also drops the file's metadata (location, device). Nothing is uploaded here.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto | { error: string }> {
  if (!file.type.startsWith("image/")) return { error: "Escolha uma foto (arquivo de imagem)." };
  if (file.size > MAX_INPUT_BYTES) return { error: "A foto passou de 15 MB. Escolha outra ou tire uma nova." };
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = typeof createImageBitmap === "function" ? await createImageBitmap(file) : await loadImage(file);
  } catch {
    try {
      source = await loadImage(file);
    } catch {
      return { error: "Não conseguimos abrir essa imagem. Tente outra foto (JPG, PNG ou HEIC do celular)." };
    }
  }
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (Math.min(width, height) < MIN_SIDE) return { error: "A foto tem resolução baixa. Use uma foto maior, com o rosto bem visível." };
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return { error: "Seu navegador não conseguiu preparar a foto. Tente outro navegador." };
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) return { error: "Seu navegador não conseguiu preparar a foto. Tente outro navegador." };
  return { blob, url: URL.createObjectURL(blob) };
}
