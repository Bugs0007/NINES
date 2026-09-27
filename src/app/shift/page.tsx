import { Suspense } from "react";
import { Shift } from "@/shift/Shift";

export const metadata = { title: "Daily Shift" };

export default function Page() {
  return (
    <Suspense>
      <Shift />
    </Suspense>
  );
}
