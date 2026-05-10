"use client";

import { useActionState } from "react";
import { type EmployeeFormState } from "./actions";

type Employee = {
  id?: string;
  name_petpooja?: string;
  display_name?: string;
  petpooja_employee_code?: string | null;
  department?: string;
  designation?: string;
  reporting_minutes?: number;
  monthly_salary?: number | null;
  phone?: string | null;
  email?: string | null;
  joined_date?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export default function EmployeeForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prev: EmployeeFormState, fd: FormData) => Promise<EmployeeFormState>;
  initial?: Employee;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-5 max-w-2xl">
      <Field label="Display name" name="display_name" defaultValue={initial?.display_name} required errors={state.errors?.display_name} hint="Friendly name shown in the UI." />
      <Field label="PetPooja name (must match exactly)" name="name_petpooja" defaultValue={initial?.name_petpooja} required errors={state.errors?.name_petpooja} hint="Copy verbatim from PetPooja, including any trailing spaces." />
      <Field label="PetPooja employee code" name="petpooja_employee_code" defaultValue={initial?.petpooja_employee_code ?? ""} hint='e.g. "TR 1", "HR 2"' />

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Department"
          name="department"
          defaultValue={initial?.department ?? "Teacher"}
          options={["Teacher", "Support Staff", "Admin", "C Suite"]}
          errors={state.errors?.department}
        />
        <Field label="Designation" name="designation" defaultValue={initial?.designation} required errors={state.errors?.designation} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Reporting time (minutes from midnight)"
          name="reporting_minutes"
          type="number"
          defaultValue={String(initial?.reporting_minutes ?? 540)}
          required
          errors={state.errors?.reporting_minutes}
          hint="540 = 9:00 AM, 510 = 8:30 AM, 480 = 8:00 AM, 495 = 8:15 AM"
        />
        <Field
          label="Monthly salary (₹)"
          name="monthly_salary"
          type="number"
          defaultValue={initial?.monthly_salary != null ? String(initial.monthly_salary) : ""}
          errors={state.errors?.monthly_salary}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone" name="phone" defaultValue={initial?.phone ?? ""} hint="10 digits, no country code" />
        <Field label="Email (optional)" name="email" type="email" defaultValue={initial?.email ?? ""} />
      </div>

      <Field label="Joined date" name="joined_date" type="date" defaultValue={initial?.joined_date ?? ""} />

      <Field label="Notes" name="notes" defaultValue={initial?.notes ?? ""} hint="Internal notes (not shown to teachers)" />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} />
        Active employee
      </label>

      {state.message && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{state.message}</div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-eurokids-orange hover:bg-eurokids-orange/90 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label, name, type = "text", defaultValue, required, errors, hint,
}: {
  label: string; name: string; type?: string; defaultValue?: string;
  required?: boolean; errors?: string[]; hint?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-eurokids-blue/40 focus:border-eurokids-blue text-sm"
      />
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
      {errors && <div className="text-xs text-red-600 mt-1">{errors.join(", ")}</div>}
    </div>
  );
}

function SelectField({
  label, name, defaultValue, options, errors,
}: {
  label: string; name: string; defaultValue?: string; options: string[]; errors?: string[];
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-eurokids-blue/40 focus:border-eurokids-blue text-sm bg-white"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {errors && <div className="text-xs text-red-600 mt-1">{errors.join(", ")}</div>}
    </div>
  );
}
