import { HeroSkeleton, TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading matches">
      <HeroSkeleton />
      <TableSkeleton />
    </div>
  );
}
