import { PerfLab } from "./PerfLab";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return <PerfLab target={Number(sp.n ?? 2000)} />;
}
