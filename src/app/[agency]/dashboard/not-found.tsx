import { EmptyState } from "@/components/ui/empty-state";
import { IconSearch } from "@/components/ui/icons";

export default function DashboardNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={<IconSearch />}
        title="Not found"
        description="This record does not exist, or it belongs to a different agency."
      />
    </div>
  );
}
