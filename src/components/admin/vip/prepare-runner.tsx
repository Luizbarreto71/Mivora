"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { prepareVipPost } from "@/lib/admin/actions/vip";

/**
 * Prepares the pending posts one after the other (research on the web + writing), each in its own
 * request so none runs into the server's time limit. Starts by itself when the list opens.
 */
export function PrepareRunner({ posts }: { posts: { id: string; name: string }[] }) {
  const router = useRouter();
  const started = useRef(false);
  // the page refreshes after each post and sends a shorter list: the run keeps its own copy
  const [queue] = useState(posts);
  const [current, setCurrent] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (started.current || queue.length === 0) return;
    started.current = true;
    (async () => {
      for (const [i, post] of queue.entries()) {
        setCurrent(i);
        try {
          const res = await prepareVipPost(post.id);
          if (!res.ok) setErrors((e) => [...e, `${post.name}: ${res.message}`]);
        } catch {
          setErrors((e) => [...e, `${post.name}: a conexão caiu durante a preparação.`]);
        }
        router.refresh();
      }
      setCurrent(null);
    })();
  }, [queue, router]);

  if (queue.length === 0 && errors.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-paper p-4 text-sm" role="status" aria-live="polite">
      {current != null ? (
        <p className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Pesquisando e escrevendo {current + 1} de {queue.length}: <strong>{queue[current].name}</strong>. Cada perfume leva de 1 a 3 minutos; deixe esta página aberta.
        </p>
      ) : (
        <p>Preparação concluída.</p>
      )}
      {errors.length > 0 ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
