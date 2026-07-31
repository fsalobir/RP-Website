"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AssistantSource, PlayerStreamEvent } from "@/lib/ai/contracts";

type Exchange = {
  id: string;
  question: string;
  answer: string;
  sources: AssistantSource[];
  status: "streaming" | "done" | "error";
  error?: string;
  rating?: -1 | 1;
  reported?: boolean;
};

const STORAGE_KEY = "fon-player-assistant-v1";

function loadExchanges(): Exchange[] {
  try {
    const rows = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(rows) ? rows.slice(-10) : [];
  } catch {
    return [];
  }
}

export function PlayerAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setExchanges(loadExchanges());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(exchanges.slice(-10)));
  }, [exchanges, ready]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchanges]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const question = message.trim();
    if (!question || question.length > 1000 || exchanges.some((row) => row.status === "streaming")) return;
    const id = crypto.randomUUID();
    const previous = exchanges.filter((row) => row.status === "done" && row.answer.trim()).slice(-10);
    const pending: Exchange = { id, question, answer: "", sources: [], status: "streaming" };
    setMessage("");
    setExchanges((rows) => [...rows, pending].slice(-10));

    try {
      const response = await fetch("/api/ai/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          page: pathname,
          history: previous.flatMap((row) => [
            { role: "user", content: row.question },
            { role: "assistant", content: row.answer },
          ]),
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Le Secrétaire est indisponible.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        if (done && buffer.trim()) {
          blocks.push(buffer);
          buffer = "";
        }
        for (const block of blocks) {
          const line = block.split("\n").find((row) => row.startsWith("data:"));
          if (!line) continue;
          const payload = JSON.parse(line.slice(5).trim()) as PlayerStreamEvent;
          if (payload.type === "text") {
            setExchanges((rows) => rows.map((row) => row.id === id ? { ...row, answer: row.answer + payload.text } : row));
          } else if (payload.type === "sources") {
            setExchanges((rows) => rows.map((row) => row.id === id ? { ...row, sources: payload.sources } : row));
          } else if (payload.type === "done") {
            setExchanges((rows) => rows.map((row) => row.id === id ? {
              ...row,
              status: "done",
              sources: row.sources.filter((source) => row.answer.includes(`[${source.id}]`)),
            } : row));
          } else if (payload.type === "error") {
            throw new Error(payload.message);
          }
        }
        if (done) break;
      }
    } catch (error) {
      setExchanges((rows) => rows.map((row) => row.id === id ? {
        ...row,
        status: "error",
        error: error instanceof Error ? error.message : "Le Secrétaire est indisponible.",
      } : row));
    }
  }

  async function feedback(exchange: Exchange, rating: -1 | 1, report = false) {
    const response = await fetch("/api/ai/player/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, isReport: report, question: exchange.question, answer: exchange.answer }),
    });
    if (!response.ok) return;
    setExchanges((rows) => rows.map((row) => row.id === exchange.id ? {
      ...row, rating, reported: report || row.reported,
    } : row));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 z-[70] flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 font-semibold text-[#071016] shadow-[0_14px_34px_rgba(0,0,0,0.42)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${open ? "pointer-events-none opacity-0" : ""}`}
        aria-label="Ouvrir le Secrétaire"
      >
        <AssistantIcon className="h-5 w-5" />
        <span className="hidden sm:inline">Secrétaire</span>
      </button>

      {open && (
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-assistant-title"
          className="fixed inset-0 z-[90] flex flex-col bg-[#071016] sm:inset-y-0 sm:left-auto sm:w-[28rem] sm:border-l sm:border-white/15 sm:shadow-[-18px_0_50px_rgba(0,0,0,0.45)]"
        >
          <header className="flex min-h-16 items-center gap-3 border-b border-white/10 px-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-[#071016]"><AssistantIcon className="h-5 w-5" /></span>
            <div>
              <h2 id="player-assistant-title" className="font-semibold tracking-[-0.02em] text-white">Secrétaire</h2>
              <p className="text-xs text-white/65">Documentation et données autorisées</p>
            </div>
            <button type="button" onClick={() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }} className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" aria-label="Fermer le Secrétaire">
              <CloseIcon />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-live="polite">
            <div className="space-y-6">
              {exchanges.map((exchange) => (
                <article key={exchange.id} className="space-y-3">
                  <p className="ml-8 rounded-xl bg-white/[0.08] px-4 py-3 text-sm leading-6 text-white">{exchange.question}</p>
                  <div className="mr-6 rounded-xl border border-white/12 bg-[#101a22] px-4 py-3 shadow-[0_8px_22px_rgba(0,0,0,0.24)]">
                    {exchange.error ? (
                      <p className="text-sm leading-6 text-red-200">{exchange.error} <Link href="/wiki" className="font-semibold text-[var(--accent)] underline underline-offset-2">Ouvrir le Wiki</Link></p>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-white/90">
                        {exchange.answer}
                        {exchange.status === "streaming" && <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-[var(--accent)]" aria-label="Réponse en cours" />}
                      </p>
                    )}
                    {exchange.sources.length > 0 && exchange.status !== "streaming" && (
                      <details className="mt-3 border-t border-white/10 pt-2 text-xs text-white/65">
                        <summary className="cursor-pointer py-1 font-medium text-white/75">Sources utilisées</summary>
                        <ul className="mt-1 space-y-1.5">
                          {exchange.sources.map((source) => <li key={source.id}><Link href={source.href} className="hover:text-[var(--accent)]">{source.id} · {source.title}</Link></li>)}
                        </ul>
                      </details>
                    )}
                    {exchange.status === "done" && (
                      <div className="mt-3 flex items-center gap-1 border-t border-white/10 pt-2">
                        <span className="mr-1 text-xs text-white/55">Utile ?</span>
                        <FeedbackButton label="Oui" active={exchange.rating === 1} onClick={() => feedback(exchange, 1)}><ThumbIcon up /></FeedbackButton>
                        <FeedbackButton label="Non" active={exchange.rating === -1} onClick={() => feedback(exchange, -1)}><ThumbIcon /></FeedbackButton>
                        <button type="button" disabled={exchange.reported} onClick={() => feedback(exchange, -1, true)} className="ml-auto min-h-9 rounded-lg px-2 text-xs text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-60">
                          {exchange.reported ? "Signalé" : "Signaler"}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              <div ref={endRef} />
            </div>
          </div>

          <form onSubmit={send} className="border-t border-white/10 bg-[#091118] p-4">
            <label htmlFor="player-assistant-message" className="sr-only">Question au Secrétaire</label>
            <textarea
              ref={inputRef}
              id="player-assistant-message"
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 1000))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              maxLength={1000}
              placeholder="Votre question…"
              className="w-full resize-none rounded-xl border border-white/15 bg-black/25 px-3 py-3 text-base text-white placeholder:text-white/45 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 sm:text-sm"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-white/50">{message.length > 800 ? `${message.length}/1 000` : "Entrée pour envoyer · Maj+Entrée pour une ligne"}</span>
              <button type="submit" disabled={!message.trim() || exchanges.some((row) => row.status === "streaming")} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#071016] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45">
                Envoyer
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

function FeedbackButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10 ${active ? "bg-white/10 text-[var(--accent)]" : "text-white/60"}`}>{children}</button>;
}

function AssistantIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v3M8.5 5h7" /><rect x="4" y="7" width="16" height="13" rx="4" /><path d="M8 13h.01M16 13h.01M9 17h6" /></svg>;
}
function CloseIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function ThumbIcon({ up = false }: { up?: boolean }) { return <svg viewBox="0 0 24 24" className={`h-4 w-4 ${up ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 10v10H4V10h3Zm0 9h9.2a2 2 0 0 0 1.9-1.4l1.5-5A2 2 0 0 0 17.7 10H14l.7-3.1A2.4 2.4 0 0 0 12.3 4L7 10v9Z" /></svg>; }
