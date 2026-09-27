import { notFound } from "next/navigation";
import { INCIDENTS } from "@/incident";
import { IncidentPage } from "./IncidentPage";

export function generateStaticParams() {
  return INCIDENTS.map((i) => ({ id: i.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!INCIDENTS.some((i) => i.id === id)) notFound();
  return <IncidentPage id={id} />;
}
