"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExt from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import {
  Bold,
  Check,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Video,
} from "lucide-react";

/**
 * Tiptap-powered article editor. Supports H1/H2/H3, bold/italic/strike,
 * ordered + unordered lists, blockquote, links, images, and embedded
 * video iframes via raw HTML insertion. Saves to Postgres `articles`
 * via POST /api/admin/articles. Save = draft, Publish = status=published.
 */
export function ArticleEditor() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dek, setDek] = useState("");
  const [category, setCategory] = useState("Recap");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      LinkExt.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: "underline decoration-[color:var(--ink-faint)] underline-offset-4",
        },
      }),
      ImageExt.configure({
        HTMLAttributes: { class: "rounded-lg my-6" },
        allowBase64: true,
      }),
    ],
    content:
      "<h2>Lead with a strong hook.</h2><p>Drop the first paragraph. The dek above already orients the reader, so this paragraph can land the punch.</p>",
    immediatelyRender: false,
  });

  if (!editor) {
    return (
      <div className="rounded-xl bg-secondary p-8 text-center text-sm text-tertiary ring-1 ring-inset ring-secondary">
        Loading editor…
      </div>
    );
  }

  function autoSlug(t: string): string {
    return t
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
  }

  async function save(status: "draft" | "published") {
    if (!editor) return;
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const finalSlug = slug.trim() || autoSlug(title) || `untitled-${Date.now()}`;
      const res = await fetch("/api/admin/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: finalSlug,
          title: title.trim(),
          dek: dek.trim(),
          category,
          bodyHtml: editor.getHTML(),
          bodyJson: editor.getJSON(),
          status,
        }),
      });
      if (!res.ok) {
        const j: { error?: string; detail?: string } = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      // Bounce to the table after publish so the admin sees it land.
      if (status === "published") {
        router.push("/admin/articles");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Frontmatter */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
        <Input
          label="Title"
          size="lg"
          value={title}
          onChange={(v) => setTitle(v)}
          placeholder="Article title"
        />
        <NativeSelect
          label="Category"
          size="lg"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={["Recap", "House", "Org", "Press", "Craft", "Product"].map((c) => ({
            label: c,
            value: c,
          }))}
        />
      </div>
      <Input
        label="Dek"
        hint="One-sentence subtitle shown under the headline."
        size="md"
        value={dek}
        onChange={(v) => setDek(v)}
        placeholder="One-sentence dek (subtitle)"
      />
      <Input
        label="Slug"
        hint="Auto-generates from the title if left blank."
        size="md"
        value={slug}
        onChange={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
        placeholder="custom-slug"
        inputClassName="font-mono"
      />

      {/* Toolbar */}
      <Toolbar editor={editor} />

      {/* Editor */}
      <div className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-6">
        <EditorContent
          editor={editor}
          className="prose prose-invert max-w-none focus:outline-none [&_.ProseMirror]:min-h-[320px] [&_.ProseMirror]:outline-none [&_.ProseMirror_h1]:text-[32px] [&_.ProseMirror_h1]:font-black [&_.ProseMirror_h1]:tracking-[-0.02em] [&_.ProseMirror_h2]:text-[22px] [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:tracking-[-0.01em] [&_.ProseMirror_h2]:mt-8 [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-6 [&_.ProseMirror_p]:my-3 [&_.ProseMirror_p]:leading-relaxed [&_.ProseMirror_p]:text-[color:var(--ink)] [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[color:var(--core)] [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-[color:var(--ink-dim)] [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_a]:text-[color:var(--core)] [&_.ProseMirror_iframe]:my-6 [&_.ProseMirror_iframe]:w-full [&_.ProseMirror_iframe]:aspect-video [&_.ProseMirror_iframe]:rounded-lg"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-secondary pt-5">
        <Button
          color="secondary"
          size="md"
          onClick={() => save("draft")}
          isDisabled={saving}
          iconLeading={saved ? Check : undefined}
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save draft"}
        </Button>
        <Button
          color="primary"
          size="md"
          onClick={() => save("published")}
          isDisabled={saving}
          isLoading={saving}
        >
          Publish
        </Button>
        <Button color="secondary" size="md" href="/admin/articles">
          All articles
        </Button>
        <Button color="link-gray" size="md" href="/admin">
          Back to admin
        </Button>
        {error ? (
          <span className="ml-auto text-sm font-medium text-error-primary">{error}</span>
        ) : null}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const onInsertImage = () => {
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const onInsertLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const onInsertVideo = () => {
    const url = window.prompt("YouTube / Twitch / Vimeo / TikTok embed URL");
    if (!url) return;
    let embed = url;
    if (url.includes("youtube.com/watch?v=")) {
      const id = new URL(url).searchParams.get("v");
      if (id) embed = `https://www.youtube.com/embed/${id}`;
    } else if (url.includes("youtu.be/")) {
      const id = new URL(url).pathname.slice(1);
      if (id) embed = `https://www.youtube.com/embed/${id}`;
    }
    editor
      .chain()
      .focus()
      .insertContent(
        `<iframe src="${embed}" allowfullscreen frameborder="0"></iframe>`,
      )
      .run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-2">
      <ToolBtn
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        label="H1"
      >
        <Heading1 size={14} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="H2"
      >
        <Heading2 size={14} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="H3"
      >
        <Heading3 size={14} />
      </ToolBtn>
      <Sep />
      <ToolBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
      >
        <Bold size={14} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
      >
        <Italic size={14} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        label="Strike"
      >
        <Strikethrough size={14} />
      </ToolBtn>
      <Sep />
      <ToolBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bullets"
      >
        <List size={14} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered"
      >
        <ListOrdered size={14} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        label="Quote"
      >
        <Quote size={14} />
      </ToolBtn>
      <Sep />
      <ToolBtn
        active={editor.isActive("link")}
        onClick={onInsertLink}
        label="Link"
      >
        <LinkIcon size={14} />
      </ToolBtn>
      <ToolBtn onClick={onInsertImage} label="Image">
        <ImageIcon size={14} />
      </ToolBtn>
      <ToolBtn onClick={onInsertVideo} label="Video embed">
        <Video size={14} />
      </ToolBtn>
      <Sep />
      <ToolBtn onClick={() => editor.chain().focus().undo().run()} label="Undo">
        <Undo2 size={14} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} label="Redo">
        <Redo2 size={14} />
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors cursor-pointer ${
        active
          ? "border-[color:var(--core)] bg-[color:var(--core)]/14 text-[color:var(--core)]"
          : "border-transparent text-[color:var(--ink-dim)] hover:bg-[color:var(--bg)] hover:text-[color:var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-[color:var(--rule)]" aria-hidden />;
}
