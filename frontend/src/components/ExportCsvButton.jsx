import { Download } from "lucide-react";
import { API } from "@/lib/api";

export default function ExportCsvButton({ kind, label = "Export CSV" }) {
  const onClick = () => {
    const token = localStorage.getItem("flos_token");
    window.open(`${API}/export/${kind}.csv?auth=${encodeURIComponent(token)}`, "_blank");
  };
  return (
    <button
      onClick={onClick}
      data-testid={`export-csv-${kind}`}
      className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31] flex items-center gap-1.5"
    >
      <Download className="h-4 w-4" /> {label}
    </button>
  );
}
