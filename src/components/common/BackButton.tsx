import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ fallbackTo }: { fallbackTo: string }) {
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else navigate({ to: fallbackTo });
      }}
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Button>
  );
}
