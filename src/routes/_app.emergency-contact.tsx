import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_app/emergency-contact")({
  component: EmergencyContactPage,
});
function EmergencyContactPage() {
  const [c, setC] = useState({ name: "", relation: "", phone: "", address: "" });
  return (
    <div>
      <PageHeader title="Emergency Contact" description="Kept confidential and shared with HR only in case of emergency." />
      <Card className="max-w-2xl"><CardContent className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); toast.success("Emergency contact updated"); }} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Full name</Label><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Relation</Label><Input value={c.relation} onChange={(e) => setC({ ...c, relation: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Address</Label><Input value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit">Save</Button></div>
        </form>
      </CardContent></Card>
    </div>
  );
}