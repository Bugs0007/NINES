import { notFound } from "next/navigation";
import { PACK_BY_ID, PACKS } from "@/content/packs";
import { MissionPage } from "./MissionPage";

export function generateStaticParams() {
  return PACKS.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: PACK_BY_ID.get(id)?.title ?? "Mission" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PACK_BY_ID.has(id)) notFound();
  return <MissionPage id={id} />;
}
