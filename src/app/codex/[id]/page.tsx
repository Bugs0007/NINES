import { notFound } from "next/navigation";
import { CodexDetail } from "@/codex/CodexDetail";
import { PACK_BY_ID, PACKS } from "@/content/packs";

export function generateStaticParams() {
  return PACKS.map((p) => ({ id: p.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PACK_BY_ID.has(id)) notFound();
  return <CodexDetail id={id} />;
}
