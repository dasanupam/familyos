import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { FileText, Download, Trash2 } from "lucide-react";

export default function Documents() {
  const [docs, setDocs] = useState([]);

  const refresh = () => api.get("/documents").then((r) => setDocs(r.data));
  useEffect(() => { refresh(); }, []);

  const open = async (d) => {
    const token = localStorage.getItem("flos_token");
    window.open(`${API}/documents/${d.id}/download?auth=${encodeURIComponent(token)}`, "_blank");
  };

  const remove = async (id) => { await api.delete(`/documents/${id}`); refresh(); };

  return (
    <div className="space-y-6" data-testid="documents-page">
      <div>
        <div className="label-eyebrow">Documents</div>
        <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Your file library</h1>
        <p className="text-sm text-[#5E6A62] mt-2">Every document you drop into the Universal Inbox is stored here.</p>
      </div>

      {docs.length === 0 ? (
        <div className="card-surface p-8 text-center text-[#5E6A62]">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No documents yet. Upload a PDF or image via the Universal Inbox.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((d) => (
            <div key={d.id} className="card-surface p-5 hover:-translate-y-0.5 transition" data-testid="document-card">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#F2F0E9] flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-[#184A31]" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[#111812] truncate">{d.original_filename}</div>
                  <div className="text-xs text-[#5E6A62] mt-0.5">
                    {new Date(d.created_at).toLocaleDateString("en-IN")} · {Math.round((d.size || 0) / 1024)}KB
                  </div>
                  {d.parsed_summary && (
                    <div className="text-xs text-[#367A50] mt-2 line-clamp-2">{d.parsed_summary}</div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => open(d)} data-testid="document-download" className="flex-1 text-xs bg-[#184A31] text-white py-2 rounded-full font-medium flex items-center justify-center gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Open
                </button>
                <button onClick={() => remove(d.id)} className="text-[#C25942]/60 hover:text-[#C25942] p-2">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
