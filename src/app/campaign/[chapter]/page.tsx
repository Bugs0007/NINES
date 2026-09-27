import { notFound } from "next/navigation";
import { ChapterView } from "@/campaign/ChapterView";
import { CHAPTERS } from "@/content/graph";

export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ chapter: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  return { title: CHAPTERS.find((c) => c.id === chapter)?.title ?? "Campaign" };
}

export default async function Page({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  if (!CHAPTERS.some((c) => c.id === chapter)) notFound();
  return <ChapterView chapterId={chapter} />;
}
