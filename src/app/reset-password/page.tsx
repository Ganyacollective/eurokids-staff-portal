import UpdatePasswordForm from "./UpdatePasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-eurokids-paper p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-eurokids-orange flex items-center justify-center text-white font-bold">
            E
          </div>
          <div>
            <h1 className="text-lg font-semibold text-eurokids-ink">Set a new password</h1>
            <p className="text-xs text-gray-500">Eurokids JMD Enclave</p>
          </div>
        </div>
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
