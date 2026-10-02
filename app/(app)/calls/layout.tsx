import { CallsTabs } from "@/components/calls-tabs";
import { PageTitle } from "@/components/shell";

export default function CallsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageTitle title="Calls" subtitle="Everything the voice agent did and who it did it with — calls, appointments, contacts, and the numbers it will never dial." />
      <CallsTabs />
      {children}
    </div>
  );
}
