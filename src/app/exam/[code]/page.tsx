import ExamRoom from "@/components/ExamRoom";

export default async function ExamPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main>
      <ExamRoom code={code} />
    </main>
  );
}
