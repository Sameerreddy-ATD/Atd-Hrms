import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sopApi } from "@/services/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/sop")({ component: SopPage });

function SopPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof sopApi.list>>>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const canManage = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");

  async function reload() {
    setLoading(true);
    try {
      setRows(await sopApi.list());
    } catch (error) {
      toast.error((error as Error).message || "Unable to load SOPs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (loading) return <LoadingState label="Loading SOP library" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Learning / SOP library"
        description="Short operating procedures for field and office teams."
      />
      {canManage && (
        <div className="space-y-2 rounded-lg border p-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" />
          <Button
            onClick={() =>
              void sopApi
                .create({ title, body, published: true })
                .then(() => {
                  toast.success("SOP published");
                  setTitle("");
                  setBody("");
                  return reload();
                })
                .catch((error) => toast.error((error as Error).message))
            }
          >
            Publish SOP
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {rows.map((article) => (
          <article key={article.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{article.title}</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void sopApi
                    .markRead(article.id)
                    .then(() => toast.success("Marked as read"))
                    .catch((error) => toast.error((error as Error).message))
                }
              >
                Mark read
              </Button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{article.body}</p>
          </article>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No SOPs yet.</p>}
      </div>
    </div>
  );
}
