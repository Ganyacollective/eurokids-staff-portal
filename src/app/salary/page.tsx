export default function SalaryPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-eurokids-ink mb-1">Salary Sheets</h1>
      <p className="text-sm text-gray-500 mb-8">
        Per-month per-employee disbursement records — coming next iteration.
      </p>

      <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500">
        Salary sheet generation arrives in the next build iteration. After you import an attendance file,
        you&rsquo;ll be able to generate the per-employee net payable here, lock it once disbursed, and export to XLSX/PDF.
      </div>
    </div>
  );
}
