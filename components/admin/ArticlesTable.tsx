"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Calendar, Trash2 } from "lucide-react";

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  dek: string | null;
  category: string | null;
  status: string;
  published_at: string | null;
  updated_at: string;
};

/**
 * Admin articles table — lists every article from Postgres (`articles`
 * table). Search filters by title + dek + category. Delete hits
 * `DELETE /api/admin/articles/:id`.
 */
export function ArticlesTable() {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/articles", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { articles: ArticleRow[] };
      setArticles(json.articles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const visible = articles.filter((a) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      (a.dek ?? "").toLowerCase().includes(q) ||
      (a.category ?? "").toLowerCase().includes(q)
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

      {error ? (
        <div className="rounded-md border border-[color:var(--core)]/40 bg-[color:var(--core)]/10 p-3 text-[12px] text-[color:var(--core)]">
          Load failed: {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-[12px] text-[color:var(--ink-faint)]">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
          <p className="text-[12px] text-[color:var(--ink-faint)]">
            {articles.length === 0
              ? "No articles yet — click + New article above."
              : "No articles match your search."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[color:var(--rule)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[color:var(--rule)] bg-[color:var(--surface)] text-left">
                <Th>Title</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a, i) => (
                <tr
                  key={a.id}
                  className={`transition-colors hover:bg-[color:var(--bg-elev)] ${
                    i === 0 ? "" : "border-t border-[color:var(--rule)]"
                  }`}
                >
                  <td className="px-3 py-3">
                    <p className="text-[13px] font-semibold text-[color:var(--ink)]">
                      {a.title || "Untitled"}
                    </p>
                    {a.dek ? (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-[color:var(--ink-dim)]">
                        {a.dek}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-[color:var(--ink-dim)]">
                      {a.category ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight ${
                        a.status === "published"
                          ? "bg-[color:var(--success)]/12 text-[color:var(--success)]"
                          : a.status === "archived"
                            ? "bg-[color:var(--ink-faint)]/15 text-[color:var(--ink-faint)]"
                            : "bg-[color:var(--warning)]/12 text-[color:var(--warning)]"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-[color:var(--ink-dim)]">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={11} />
                      {formatDate(a.published_at ?? a.updated_at)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/news/${a.slug}` as `/news/${string}`}
                        target="_blank"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-2.5 text-[11px] font-medium text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
                      >
                        Preview <ArrowUpRight size={11} />
                      </Link>
                      <Link
                        href={`/admin/articles/${a.id}` as never}
                        className="inline-flex h-8 items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-2.5 text-[11px] font-medium text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
                      >
                        Edit
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
              ))}
            </tbody>
          </table>
        </div>
      )}
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
