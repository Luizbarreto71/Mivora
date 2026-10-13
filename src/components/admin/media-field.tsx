"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { uploadContentImage } from "@/lib/admin/actions/products";

/** Image picker that uploads to Storage and stores the resulting URL in a hidden form field. */
export function MediaField({ name, label, defaultValue, folder, hint }: { name: string; label: string; defaultValue: string | null; folder: "banners" | "brands" | "kits" | "categories"; hint?: string }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className="mb-1.5 text-[0.8125rem] font-semibold">{label}</p>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-start gap-4">
        <div className="relative flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-ivory">
          {url ? <Image src={url} alt="" fill sizes="128px" className="object-cover" /> : <ImagePlus className="h-5 w-5 text-muted" strokeWidth={1.5} />}
          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center bg-paper/70">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          ) : null}
        </div>
        <div className="space-y-2 text-sm">
          <button type="button" onClick={() => input.current?.click()} className="font-semibold underline underline-offset-2" disabled={pending}>
            {url ? "Trocar imagem" : "Enviar imagem"}
          </button>
          {url ? (
            <button type="button" onClick={() => setUrl("")} className="flex items-center gap-1 text-xs text-muted hover:text-danger">
              <X className="h-3 w-3" /> Remover
            </button>
          ) : null}
          {hint ? <p className="text-xs text-muted">{hint}</p> : null}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          start(async () => {
            const fd = new FormData();
            fd.set("file", file);
            fd.set("folder", folder);
            const res = await uploadContentImage(fd).catch(() => ({ ok: false, message: "Falha no envio (máx. 6 MB).", url: undefined }));
            if (res.ok && res.url) setUrl(res.url);
            else setError(res.message ?? "Falha no envio.");
          });
        }}
      />
    </div>
  );
}
