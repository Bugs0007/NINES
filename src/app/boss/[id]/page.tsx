import { notFound } from "next/navigation";
import { BOSS_BY_ID, BOSSES } from "@/content/packs";
import { BossPage } from "./BossPage";

export function generateStaticParams() {
  return BOSSES.map((b) => ({ id: b.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: BOSS_BY_ID.get(id)?.title ?? "Boss" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!BOSS_BY_ID.has(id)) notFound();
  return <BossPage id={id} />;
}
