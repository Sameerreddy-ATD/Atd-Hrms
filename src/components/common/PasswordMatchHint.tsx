export function PasswordMatchHint({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  const matches = password === confirm;
  return (
    <p className={`text-xs font-medium ${matches ? "text-emerald-600" : "text-destructive"}`}>
      {matches ? "Passwords match" : "Passwords do not match"}
    </p>
  );
}
