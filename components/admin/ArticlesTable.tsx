"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Calendar, Trash2 } from "lucide-react";

const ARTICLES_KEY = "coreboys-admin-articles:v1";

type ArticleDraft = {
  id: string;
  title: string;
  dek: string;
  bodyHtml: string;
  category: string;
  publishedAt: string;
};

/**
 * Admin articles table — lists every draft persisted by the editor,
 * lets the admin delete or jump to its public preview. Search filters
 * by title + dek.
 */
export function ArticlesTable() {
  const [articles, setArticles] = useState<ArticleDraft[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ARTICLES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ArticleDraft[];
      // Newest first.
      parsed.sort((a, b) =>
        new Date(a.publishedAt).getTime() < new Date(b.publishedAt).getTime() ? 1 : -1,
      );
      setArticles(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  const remove = (id: string) => {
    if (!confirm("Delete this draft?")) return;
    const next = articles.filter((a) => a.id !== id);
    setArticles(next);
    try {
      localStorage.setItem(ARTICLES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const visible = articles.filter((a) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.dek.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title, dek, or category…"
        className="w-full max-w-[420px] rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--core)] focus:outline-none"
      />

      {visible.length === 0 ? (
        <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
          <p className="text-[12px] text-[color:var(--ink-faint)]">
            {articles.length === 0
              ? "No drafts yet. Write one in the editor."
              : "No drafts match your search."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[color:var(--rule)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[color:var(--rule)] bg-[color:var(--surface)] text-left">
                <Th>Title</Th>
                <Th>Category</Th>
                <Th>Saved</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a, i) => {
                const slug =
                  a.title
                    .toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, "")
                    .replace(/\s+/g, "-") || a.id;
                return (
                  <tr
                    key={a.id}
                    className={`transition-colors hover:bg-[color:var(--bg-elev)] ${
                      i === 0 ? "" : "border-t border-[color:var(--rule)]"
                    }`}
                  >
                    <td className="px-3 py-3">
                      <p className="text-[13px] font-semibold text-[color:var(--ink)]">
                        {a.title || "Untitled draft"}
                      </p>
                      {a.dek ? (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-[color:var(--ink-dim)]">
                          {a.dek}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-[color:var(--ink-dim)]">
                        {a.category}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-[color:var(--ink-dim)]">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={11} />
                        {formatDate(a.publishedAt)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/news/${slug}` as `/news/${string}`}
                          target="_blank"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-2.5 text-[11px] font-medium text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
                        >
                          Preview <ArrowUpRight size={11} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(a.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[color:var(--ink-faint)]">
        Drafts saved to <code className="font-mono">localStorage:coreboys-admin-articles:v1</code>.
        Phase 4 swaps for <code className="font-mono">GET/PUT/DELETE /v1/posts/:id</code>.
      </p>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)] ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
