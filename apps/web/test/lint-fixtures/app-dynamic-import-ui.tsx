import dynamic from "next/dynamic";

const TimetableGrid = dynamic(() => import("@/ui/timetable/timetable-grid"));

export default function Page() {
  return <TimetableGrid />;
}
