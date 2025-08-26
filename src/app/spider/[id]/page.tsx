import CrawlDetails from "../components/crawl-details";

export default async function CrawlDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-gray-50">
      <CrawlDetails crawlId={id} />
    </div>
  );
} 