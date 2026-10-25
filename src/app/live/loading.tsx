import { TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading live matches">
      <div className="skeleton h-7 w-28" />
      <TableSkeleton groups={1} />
    </div>
  );
}
