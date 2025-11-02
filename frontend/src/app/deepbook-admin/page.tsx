"use client";

import AdminDeepBookInterface from "../components/DeepBook/AdminDeepBookInterface";

export default function Page() {
  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">DeepBook Admin</h1>
      <AdminDeepBookInterface />
    </div>
  );
}
