"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const EmployeeSchema = z.object({
  name_petpooja: z.string().min(1, "PetPooja name required"),
  display_name: z.string().min(1, "Display name required"),
  petpooja_employee_code: z.string().optional(),
  department: z.enum(["Teacher", "Support Staff", "Admin", "C Suite"]),
  designation: z.string().min(1),
  reporting_minutes: z.coerce.number().int().min(0).max(1440),
  monthly_salary: z.coerce.number().min(0).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  joined_date: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.coerce.boolean().default(true),
});

export type EmployeeFormState = {
  errors?: Record<string, string[]>;
  message?: string;
};

export async function createEmployee(_prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = EmployeeSchema.safeParse({ ...raw, is_active: raw.is_active === "on" });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("employees").insert({
    ...parsed.data,
    email: parsed.data.email || null,
    joined_date: parsed.data.joined_date || null,
  });
  if (error) return { message: error.message };

  revalidatePath("/employees");
  redirect("/employees");
}

export async function updateEmployee(id: string, _prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = EmployeeSchema.safeParse({ ...raw, is_active: raw.is_active === "on" });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("employees").update({
    ...parsed.data,
    email: parsed.data.email || null,
    joined_date: parsed.data.joined_date || null,
  }).eq("id", id);
  if (error) return { message: error.message };

  revalidatePath("/employees");
  redirect("/employees");
}

export async function archiveEmployee(id: string) {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("employees")
    .update({ is_active: false, left_date: new Date().toISOString().slice(0, 10) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/employees");
  redirect("/employees");
}
