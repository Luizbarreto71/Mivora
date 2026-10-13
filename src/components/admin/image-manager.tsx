"use client";

import { ArrowDown, ArrowUp, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteProductImage, reorderProductImages, setPrimaryImage, updateImageAlt, uploadProductImages } from "@/lib/admin/actions/products";
import { cn } from "@/lib/utils";

type AdminImage = { id: string; url: string; alt: string | null; is_primary: boolean; sort_order: number };

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_EDGE = 2000;

/** Downscales large photos in the browser so uploads stay small and fast (final encoding happens on the server). */
async function compress(file: File): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024 || file.type === "image/avif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" });
  } catch {
    return file;
  }
}

export function ImageManager({ productId, images }: { productId: string; images: AdminImage[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setMessage({ ok: res.ok, text: res.message ?? "" });
      router.refresh();
    });

  const upload = (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => ACCEPT.includes(f.type));
    if (!files.length) {
      setMessage({ ok: false, text: "Formato não suportado. Use JPG, PNG, WebP ou AVIF." });
      return;
    }
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("productId", productId);
      for (const f of await Promise.all(files.map(compress))) fd.append("files", f);
      const res = await uploadProductImages(fd).catch(() => ({ ok: false, message: "Falha no envio. Verifique o tamanho das imagens (máx. 6 MB após compressão)." }));
      setMessage({ ok: res.ok, text: res.message ?? "" });
      urls.forEach((p) => URL.revokeObjectURL(p));
      setPreviews([]);
      router.refresh();
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = sorted.map((i) => i.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderProductImages(productId, ids));
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        className={cn("flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 text-center transition", dragging ? "border-ink bg-ivory" : "border-line")}
      >
        <ImagePlus className="h-6 w-6 text-muted" strokeWidth={1.5} />
        <p className="mt-2 text-sm">Arraste as fotos aqui ou</p>
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-2 text-sm font-semibold underline underline-offset-2" disabled={pending}>
          selecione do computador
        </button>
        <p className="mt-2 text-xs text-muted">JPG, PNG, WebP ou AVIF · até 8 MB · convertidas para WebP otimizado</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {message?.text ? <p className={cn("mt-3 rounded-md px-3 py-2 text-sm", message.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>{message.text}</p> : null}

      <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {previews.map((p) => (
          <li key={p} className="relative aspect-square overflow-hidden rounded-md bg-ivory">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt="" className="h-full w-full object-contain opacity-50" />
            <Loader2 className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 animate-spin" />
          </li>
        ))}
        {sorted.map((img, index) => (
          <li key={img.id} className={cn("overflow-hidden rounded-md border", img.is_primary ? "border-ink" : "border-line")}>
            <div className="relative aspect-square bg-ivory">
              <Image src={img.url} alt={img.alt ?? ""} fill sizes="200px" className="product-photo object-contain p-2" />
              {img.is_primary ? <span className="absolute left-2 top-2 rounded bg-ink px-1.5 py-0.5 text-[0.625rem] font-semibold text-paper">Principal</span> : null}
            </div>
            <div className="space-y-2 p-2">
              <input
                defaultValue={img.alt ?? ""}
                placeholder="Descrição (alt)"
                aria-label="Descrição da imagem"
                className="h-8 w-full rounded border border-line px-2 text-xs focus:border-ink focus:outline-none"
                onBlur={(e) => {
                  if (e.target.value !== (img.alt ?? "")) run(() => updateImageAlt(img.id, e.target.value));
                }}
              />
              <div className="flex items-center justify-between">
                <div className="flex">
                  <IconButton label="Mover para a esquerda" onClick={() => move(index, -1)} disabled={pending || index === 0}>
                    <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
                  </IconButton>
                  <IconButton label="Mover para a direita" onClick={() => move(index, 1)} disabled={pending || index === sorted.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
                  </IconButton>
                  {!img.is_primary ? (
                    <IconButton label="Definir como principal" onClick={() => run(() => setPrimaryImage(productId, img.id))} disabled={pending}>
                      <Star className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                </div>
                <IconButton
                  label="Remover imagem"
                  onClick={() => {
                    if (window.confirm("Remover esta imagem?")) run(() => deleteProductImage(img.id));
                  }}
                  disabled={pending}
                  danger
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {sorted.length === 0 && previews.length === 0 ? <p className="mt-4 text-sm text-muted">Nenhuma imagem. Enquanto isso, a loja exibe um placeholder elegante.</p> : null}
    </div>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={cn("flex h-8 w-8 items-center justify-center rounded hover:bg-ivory disabled:opacity-30", danger && "text-danger")}>
      {children}
    </button>
  );
}
