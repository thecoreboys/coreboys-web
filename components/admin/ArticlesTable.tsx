"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Calendar, Trash01, Edit05, SearchLg, AlertCircle, File02 } from "@untitledui/icons";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

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
    <div className="flex flex-col gap-5">
      <div className="max-w-[420px]">
        <Input
          icon={SearchLg}
          size="md"
          value={query}
          onChange={(v) => setQuery(v)}
          placeholder="Search by title, dek, or category…"
          aria-label="Search articles"
        />
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-xl border border-error_subtle bg-error-primary p-4 shadow-xs-skeuomorphic">
          <FeaturedIcon icon={AlertCircle} size="md" color="error" theme="light" />
          <p className="text-sm font-medium text-primary">Load failed: {error}</p>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-tertiary">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-secondary bg-secondary p-10 text-center shadow-xs-skeuomorphic">
          <FeaturedIcon icon={File02} size="xl" color="gray" theme="modern" />
          <p className="mt-4 text-lg font-semibold text-primary">
            {articles.length === 0 ? "No articles yet" : "No articles match"}
          </p>
          <p className="mt-1 text-sm text-tertiary">
            {articles.length === 0
              ? "Click + New article above to write your first one."
              : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-secondary bg-primary shadow-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary bg-secondary text-left">
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
                  className={`transition-colors hover:bg-secondary ${
                    i === 0 ? "" : "border-t border-secondary"
                  }`}
                >
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-primary">
                      {a.title || "Untitled"}
                    </p>
                    {a.dek ? (
                      <p className="mt-0.5 line-clamp-1 text-sm text-tertiary">
                        {a.dek}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <Badge type="pill-color" color="gray" size="sm">
                      {a.category ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      type="pill-color"
                      size="sm"
                      color={
                        a.status === "published"
                          ? "success"
                          : a.status === "archived"
                            ? "gray"
                            : "warning"
                      }
                    >
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-sm text-tertiary">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      {formatDate(a.published_at ?? a.updated_at)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        href={`/news/${a.slug}` as `/news/${string}`}
                        target="_blank"
                        size="sm"
                        color="secondary"
                        iconTrailing={<ArrowUpRight className="size-5" />}
                      >
                        Preview
                      </Button>
                      <Button
                        href={`/admin/articles/${a.id}` as never}
                        size="sm"
                        color="secondary"
                        iconLeading={<Edit05 className="size-5" />}
                      >
                        Edit
                      </Button>
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="Delete"
                        icon={Trash01}
                        onClick={() => remove(a.id)}
                      />
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
      className={`px-5 py-3 text-xs font-semibold text-quaternary ${align === "right" ? "text-right" : ""}`}
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
