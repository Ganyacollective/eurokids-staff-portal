import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import EmployeeForm from "../EmployeeForm";
import { createEmployee } from "../actions";

export default function NewEmployeePage() {
  return (
    <div>
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-eurokids-ink mb-4">
        <ChevronLeft size={16} /> Back to employees
      </Link>
      <h1 className="text-2xl font-semibold text-eurokids-ink mb-6">Add employee</h1>
      <EmployeeForm action={createEmployee} submitLabel="Create employee" />
    </div>
  );
}
