import { IntroPreview } from "./IntroPreview";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return <IntroPreview id={sp.id ?? "chapter:a1"} />;
}
