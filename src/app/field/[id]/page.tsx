import { notFound } from "next/navigation";
import { FIELD_MISSIONS } from "@/field";
import { FieldPage } from "./FieldPage";

export function generateStaticParams() {
  return FIELD_MISSIONS.map((m) => ({ id: m.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!FIELD_MISSIONS.some((m) => m.id === id)) notFound();
  return <FieldPage id={id} />;
}
