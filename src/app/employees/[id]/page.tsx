import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import EmployeeForm from "../EmployeeForm";
import { updateEmployee, archiveEmployee } from "../actions";
import { createServerClient } from "@/lib/supabase/server";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: employee } = await supabase.from("employees").select("*").eq("id", id).single();
  if (!employee) notFound();

  const boundUpdate = updateEmployee.bind(null, id);
  const boundArchive = archiveEmployee.bind(null, id);

  return (
    <div>
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-eurokids-ink mb-4">
        <ChevronLeft size={16} /> Back to employees
      </Link>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-semibold text-eurokids-ink">{employee.display_name}</h1>
        {employee.is_active && (
          <form action={boundArchive}>
            <button className="text-sm text-red-600 hover:underline">Archive employee</button>
          </form>
        )}
      </div>
      <EmployeeForm action={boundUpdate} initial={employee} submitLabel="Save changes" />
    </div>
  );
}
