import { PageLoading } from "@/app/_components/PageLoading";

// The register is one wide block, not a stack of cards, but the shared
// skeleton is what every other payroll route shows while its sweeps run —
// consistency beats a bespoke shape nobody looks at for more than a moment.
export default function Loading() {
  return <PageLoading cards={3} />;
}
