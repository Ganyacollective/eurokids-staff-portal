"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { uploadAttendance } from "./actions";

export default function UploadAttendance() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    rows?: number;
    anomalies?: number;
    summaries?: number;
    error?: string;
  } | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setResult(null);
    const r = await uploadAttendance(formData);
    setResult(r);
    setPending(false);
  }

  return (
    <form action={onSubmit} className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="grid grid-cols-2 gap-6 mb-5">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Month</label>
          <input
            type="month"
            name="month"
            required
            defaultValue={new Date().toISOString().slice(0, 7)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Source</label>
          <select
            name="source"
            defaultValue="petpooja_excel"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="petpooja_excel">PetPooja Excel/CSV</option>
            <option value="petpooja_api">PetPooja API (paste JSON)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">File</label>
        <input
          type="file"
          name="file"
          required
          accept=".xlsx,.xls,.csv,.json"
          className="block w-full text-sm text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-eurokids-blue/10 file:text-eurokids-blue file:font-medium hover:file:bg-eurokids-blue/20"
        />
        <p className="text-xs text-gray-400 mt-1">
          Export from PetPooja → Reports → Attendance Master → Export Excel.
          Or paste raw JSON if you have direct API access.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex items-center gap-2 bg-eurokids-orange hover:bg-eurokids-orange/90 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        <Upload size={16} />
        {pending ? "Reconciling…" : "Upload & reconcile"}
      </button>

      {result?.error && (
        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {result.error}
        </div>
      )}
      {result && !result.error && (
        <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          Imported {result.rows} rows · produced {result.summaries} per-employee summaries · flagged {result.anomalies} anomalies for review.
        </div>
      )}
    </form>
  );
}
