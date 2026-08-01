// Client helper: upload a logo image file and get back its public URL.
export async function uploadLogo(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload/logo", { method: "POST", body: fd }).then((x) => x.json());
  if (!r.ok) throw new Error(r.error || "Upload failed");
  return r.url;
}
