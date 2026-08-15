import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { fileToPayload, isPeopleOpsRole } from "@/lib/lifecycle";
import { lifecycleApi } from "@/services/api";

export const Route = createFileRoute("/_app/lms")({ component: LmsPage });

function LmsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canPublish = isPeopleOpsRole(user?.role);
  const [kind, setKind] = useState<"SOP" | "TRAINING">("SOP");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "",
    body: "",
    file: undefined as File | undefined,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await lifecycleApi.lms(kind));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("pages.lms.toastCouldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [kind, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        eyebrow={t("pages.lms.eyebrow")}
        title={t("pages.lms.title")}
        description={t("pages.lms.subtitle")}
        actions={
          canPublish ? (
            <Button className="h-11" onClick={() => setOpen(true)}>
              {t("pages.lms.publishMaterial")}
            </Button>
          ) : null
        }
      />
      <Tabs value={kind} onValueChange={(value) => setKind(value as "SOP" | "TRAINING")}>
        <TabsList className="mb-4">
          <TabsTrigger value="SOP">{t("pages.lms.sops")}</TabsTrigger>
          <TabsTrigger value="TRAINING">{t("pages.lms.training")}</TabsTrigger>
        </TabsList>
        <TabsContent value={kind}>
          {loading ? (
            <LoadingState label={t("pages.loading.lms")} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={t("pages.lms.empty")}
              description={t("pages.lms.emptyHelp")}
            />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <article key={String(row.id)} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{String(row.title)}</p>
                      <p className="text-xs text-muted-foreground">
                        {String(row.category || row.kind)} · {String(row.authorName)}
                      </p>
                    </div>
                    <StatusBadge
                      status={
                        row.read
                          ? t("pages.lms.read")
                          : row.published
                            ? t("pages.lms.published")
                            : t("pages.lms.draft")
                      }
                    />
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {String(row.body)}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    {row.fileKey ? (
                      <Button
                        variant="outline"
                        className="h-11 w-full sm:w-auto"
                        onClick={() =>
                          void lifecycleApi
                            .downloadFile(String(row.fileKey), String(row.fileName || "material"))
                            .catch((error) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : t("pages.lms.toastDownloadFailed"),
                              ),
                            )
                        }
                      >
                        {t("pages.lms.downloadAttachment")}
                      </Button>
                    ) : null}
                    <Button
                      className="h-11 w-full sm:w-auto"
                      variant={row.read ? "outline" : "default"}
                      onClick={async () => {
                        try {
                          await lifecycleApi.markLmsRead(String(row.id));
                          toast.success(t("pages.lms.toastMarkedRead"));
                          await load();
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : t("pages.lms.toastCouldNotMarkRead"),
                          );
                        }
                      }}
                    >
                      {row.read ? t("pages.lms.readAgain") : t("pages.lms.markRead")}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {kind === "SOP" ? t("pages.lms.publishSopTitle") : t("pages.lms.publishTrainingTitle")}
            </DialogTitle>
          </DialogHeader>
          <Input
            className="h-11"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Input
            className="h-11"
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <Textarea
            placeholder="Body"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
          <div>
            <Label>Attachment (optional PDF/image)</Label>
            <Input
              className="mt-1 h-11"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setForm({ ...form, file: e.target.files?.[0] })}
            />
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={!form.title || !form.body}
              onClick={async () => {
                try {
                  await lifecycleApi.createLms({
                    title: form.title,
                    kind,
                    category: form.category || undefined,
                    body: form.body,
                    published: true,
                    file: form.file ? await fileToPayload(form.file) : undefined,
                  });
                  toast.success(t("pages.lms.toastPublished"));
                  setOpen(false);
                  setForm({ title: "", category: "", body: "", file: undefined });
                  await load();
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : t("pages.lms.toastCouldNotPublish"),
                  );
                }
              }}
            >
              {t("pages.lms.publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
