import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { documentsApi } from "@/services/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/documents")({ component: DocumentsPage });

function DocumentsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof documentsApi.list>>>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const canManage = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");

  async function reload() {
    setLoading(true);
    try {
      setRows(await documentsApi.list());
    } catch (error) {
      toast.error((error as Error).message || "Unable to load documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (loading) return <LoadingState label="Loading document vault" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Document vault"
        description="Company policies and acknowledgements. Separate from certificate requests."
      />
      {canManage && (
        <div className="space-y-2 rounded-lg border p-4">
          <Input placeholder="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <Textarea
            placeholder="Policy body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button
            onClick={() =>
              void documentsApi
                .create({ title, body, published: true, requiresAck: true })
                .then(() => {
                  toast.success("Document published");
                  setTitle("");
                  setBody("");
                  return reload();
                })
                .catch((error) => toast.error((error as Error).message))
            }
          >
            Publish document
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {rows.map((doc) => (
          <article key={doc.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{doc.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {doc.category} · v{doc.version}
                  {doc.acknowledged ? " · acknowledged" : ""}
                </p>
              </div>
              {doc.requiresAck && !doc.acknowledged && (
                <Button
                  size="sm"
                  onClick={() =>
                    void documentsApi
                      .ack(doc.id)
                      .then(() => {
                        toast.success("Acknowledged");
                        return reload();
                      })
                      .catch((error) => toast.error((error as Error).message))
                  }
                >
                  Acknowledge
                </Button>
              )}
            </div>
            {doc.body && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{doc.body}</p>
            )}
          </article>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents published yet.</p>
        )}
      </div>
    </div>
  );
}
