import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function EmployeePicker({
  employees,
  value,
  onChange,
  label = "Employee",
  placeholder = "Select an employee",
  className,
}: {
  employees: Array<{
    name: string;
    employeeId?: string | null;
    employeeCode?: string | null;
    id?: string;
  }>;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const options = employees
    .map((person) => {
      const id = person.employeeId || person.id;
      if (!id) return null;
      return {
        id,
        name: person.name,
        code: person.employeeCode || undefined,
      };
    })
    .filter(Boolean) as Array<{ id: string; name: string; code?: string }>;

  return (
    <div className={className ?? "space-y-1.5"}>
      {label && <Label>{label}</Label>}
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
              {person.code ? ` · ${person.code}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
