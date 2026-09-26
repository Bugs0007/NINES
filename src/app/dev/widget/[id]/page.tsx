import { DevWidget } from "./DevWidget";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  return <DevWidget id={id} config={sp.config ? JSON.parse(sp.config) : {}} mode={(sp.mode as "play") ?? "play"} />;
}
